#!/usr/bin/env node
// Negative sanity for the selftest Codex-Nav gate: on a plain served load, simulate
// the regression the new assertions guard (sim row unhidden + buttons back to .nav),
// then run the exact walk predicate and require it to report the violation.
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const URL = 'http://127.0.0.1:8080/index.html?cb=codexneg' + Date.now();
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ps = (s, t = 8000) => spawnSync('powershell', ['-NoProfile', '-Command', s], { timeout: t, encoding: 'utf8' });
const port = 9900 + Math.floor(Math.random() * 50);
const prof = path.join(os.tmpdir(), 'fbcxneg-' + process.pid + '-' + Date.now()).replace(/\\/g, '/');
ps("Start-Process -WindowStyle Hidden -FilePath '" + EDGE + "' -ArgumentList '--headless=new --remote-debugging-port=" + port + ' --user-data-dir=' + prof + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience about:blank'");
let up = false;
for (let i = 0; i < 30; i++) { const rr = ps("try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:" + port + "/json/version).StatusCode } catch { 0 }", 4000); if ((rr.stdout || '').trim().startsWith('200')) { up = true; break; } await sleep(400); }
if (!up) { console.log('edge failed'); process.exit(1); }
const list = JSON.parse(await (await fetch('http://127.0.0.1:' + port + '/json/list')).text());
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } };
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true }); return r.result.value; };
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: URL });
for (let i = 0; i < 40; i++) { if (await ev("typeof Game === 'object' && typeof UI === 'object'")) break; await sleep(250); }
await sleep(400);
// same predicates the selftest uses (shared helpers, no mirror drift)
const out = await ev(`(() => {
  const sim = document.getElementById('simRow');
  UI.renderCodex(); UI.show('scCodex'); UI.refreshNav();
  const cleanBad = SelfTest._navBadRing(UI.navEls, 'scCodex', sim).length;
  const cleanContent = UI.navEls.filter(el => el.closest('#codexList')).length;
  const cleanN = UI.navEls.length;
  // live keyboard walk: 8 ArrowDown presses from the ring head must land only on tabs + Zurück
  const visited = [];
  UI.navIdx = 0;
  for (let k = 0; k < 9; k++) {
    const act = UI.navEls[UI.navIdx] ? UI.navEls[UI.navIdx].dataset.act : null;
    if (visited.indexOf(act) < 0) visited.push(act);
    UI.navMove(1);
  }
  const okRing = visited.length === 2 && visited.indexOf('codexTab') >= 0 && visited.indexOf('codexBack') >= 0;
  // scenario A — "forgot to strip .nav": row stays hidden, buttons re-gain .nav
  for (const b of sim.querySelectorAll('button')) b.classList.add('nav');
  UI.refreshNav();
  const forgotMembers = UI.navEls.filter(el => sim.contains(el)).length;
  for (const b of sim.querySelectorAll('button')) b.classList.remove('nav');
  UI.refreshNav();
  // scenario B — full regression: devsim-style row visible + .nav on buttons
  sim.classList.remove('hidden');
  for (const b of sim.querySelectorAll('button')) b.classList.add('nav');
  UI.refreshNav();
  const regBad = SelfTest._navBadRing(UI.navEls, 'scCodex', sim).length;
  const regSimMembers = UI.navEls.filter(el => sim && sim.contains(el)).length;
  UI.renderCodex(); // restore real gate state
  return { simsEnabled: SIMS_ENABLED, cleanN, cleanContent, cleanBad, okRing, visited, forgotMembers, regBad, regSimMembers };
})()`);
const ok = !out.simsEnabled && out.cleanN === 8 && out.cleanContent === 0 && out.cleanBad === 0 && out.okRing && out.forgotMembers === 0 && out.regBad > 0 && out.regSimMembers >= 4;
console.log((ok ? 'PASS ' : 'FAIL ') + 'codex ring = 8 stops (7 tabs + Zurück), no content/sim rows, keyboard walk clean, hidden+.nav sim buttons excluded (' + out.forgotMembers + '), full unhide regression detected (' + out.regBad + ' bad, ' + out.regSimMembers + ' sim members) — ' + JSON.stringify(out));
try { ws.close(); } catch { }
ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + prof + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", 12000);
setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch { } }, 400);
process.exitCode = ok ? 0 : 1;
