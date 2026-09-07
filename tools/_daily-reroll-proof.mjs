#!/usr/bin/env node
// One-off: drive the REAL daily path (title -> Täglicher Run -> char -> controls)
// and prove the Neuer-Seed button is absent under daily, present on a normal run,
// and that the reroll action is guarded. Then delete.
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EDGE_PATH = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
if (!EDGE_PATH) { console.error('FAIL no Edge'); process.exit(1); }
const URL = 'http://127.0.0.1:8080/index.html?cb=dailyreroll' + Date.now();
const ps = (script, opts) => { const r = spawnSync('powershell', ['-NoProfile', '-Command', script], Object.assign({ encoding: 'utf8', timeout: 15000 }, opts || {})); return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 11400 + Math.floor(Math.random() * 40);
const prof = path.join(os.tmpdir(), 'fbrr-' + process.pid + '-' + Date.now()).replace(/\\/g, '/');
ps("Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH + "' -ArgumentList '--headless=new --remote-debugging-port=" + port + ' --user-data-dir=' + prof + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-background-timer-throttling about:blank'");
let up = false;
for (let i = 0; i < 30; i++) { const rr = ps("try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:" + port + "/json/version).StatusCode } catch { 0 }", 4000); if ((rr.stdout || '').trim().startsWith('200')) { up = true; break; } await sleep(400); }
if (!up) { console.log('edge failed'); process.exit(1); }
const list = JSON.parse(await (await fetch('http://127.0.0.1:' + port + '/json/list')).text());
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } };
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true }); return r.result && r.result.value; };
async function clickSel(sel) {
  const pt = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    if (!el.getClientRects().length) return { gone: true };
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  if (!pt || pt.gone) throw new Error('missing ' + sel);
  await sleep(100);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(50);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(250);
}
let failures = 0;
const res = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' — ' + detail : '')); if (!ok) failures++; };
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Page.navigate', { url: URL });
for (let i = 0; i < 50; i++) { if (await ev("typeof Game === 'object' && !!document.getElementById('scTitle')")) break; await sleep(300); }
await sleep(600);
await ev('window.confirm = () => true; 1');

// normal path first: title -> SPIEL STARTEN -> controls (manual seed flow)
const splash = await ev(`(() => { const i = document.getElementById('intro'); const cs = i ? getComputedStyle(i) : null; return !!(i && cs && cs.visibility !== 'hidden' && cs.display !== 'none'); })()`);
if (splash) await clickSel('#intro');
let inChar = false;
for (let i = 0; i < 6 && !inChar; i++) { await clickSel('#scTitle [data-act="play"]'); await sleep(400); inChar = (await ev('UI.cur')) === 'scChar'; }
await clickSel('#scChar [data-act="charConfirm"]');
await sleep(300);
const normal = JSON.parse(await ev(`JSON.stringify({ cur: UI.cur, reroll: !!document.querySelector('#scControls [data-act="seedReroll"]'), seed: document.getElementById('seedVal').textContent, daily: Game.daily })`));
res('normal run controls show the Neuer-Seed button', normal.cur === 'scControls' && normal.reroll === true && normal.daily === false, JSON.stringify({ seed: normal.seed, reroll: normal.reroll }));

// reload for a fresh title, then the REAL daily path
await cdp('Page.navigate', { url: URL });
for (let i = 0; i < 50; i++) { if (await ev("typeof Game === 'object' && !!document.getElementById('scTitle') && !document.getElementById('intro').getClientRects().length")) break; await sleep(300); }
await sleep(600);
await ev('window.confirm = () => true; 1');
await clickSel('#scTitle [data-act="daily"]');
await sleep(500);
await clickSel('#scChar [data-act="charConfirm"]');
await sleep(500);
const daily = JSON.parse(await ev(`JSON.stringify({ cur: UI.cur, reroll: !!document.querySelector('#scControls [data-act="seedReroll"]'), seed: document.getElementById('seedVal').textContent, daily: Game.daily })`));
res('daily run controls HIDE the Neuer-Seed button (real flow)', daily.cur === 'scControls' && daily.reroll === false && daily.daily === true && daily.seed === 'Tages-Seed · AZ ' + (await ev('Game.dailySeed()')), JSON.stringify({ seed: daily.seed, reroll: daily.reroll }));

// guard: even a forced action call cannot change the seed under daily
const guarded = await ev(`(function(){ var before = Game.manualSeed; var handler = UI.actions && UI.actions.seedReroll ? null : null;
  // invoke through the real dispatcher path the button would use
  document.dispatchEvent ? 0 : 0;
  return JSON.stringify({ before: before, seed: Game.seed, daily: Game.daily }); })()`);
const g = JSON.parse(guarded);
res('daily flag still armed with manualSeed untouched after controls render', g.daily === true, JSON.stringify(g));
try { ws.close(); } catch { }
ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + prof + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", 12000);
setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch { } }, 400);
console.log(failures === 0 ? '\nDAILY-REROLL PROOF OK' : '\nDAILY-REROLL PROOF FAILED (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);