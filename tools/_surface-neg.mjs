#!/usr/bin/env node
// Negative/positive sanity for the selftest player-surface contract
// (SelfTest._surfaceContracts): the two surfaces it guards — Spielstand-Code
// (scCode/codePanel) and the Feedback row (scEnd/fbBtns) — are PLAYER features,
// so the contract runs the INVERTED direction: they must stay visible and
// navigable on a plain load. This probe proves the real contract passes clean
// and DETECTS the regression it guards (someone accidentally gates them:
// hidden class + .nav stripped).
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const URL = 'http://127.0.0.1:8080/index.html?cb=srfneg' + Date.now();
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ps = (s, t = 8000) => spawnSync('powershell', ['-NoProfile', '-Command', s], { timeout: t, encoding: 'utf8' });
const port = 10600 + Math.floor(Math.random() * 50);
const prof = path.join(os.tmpdir(), 'fbsrfneg-' + process.pid + '-' + Date.now()).replace(/\\/g, '/');
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
for (let i = 0; i < 40; i++) { if (await ev("typeof SelfTest === 'object' && typeof UI === 'object'")) break; await sleep(250); }
await sleep(400);

// run the REAL contract helpers through the page's own SelfTest object
const out = await ev(`(() => {
  const prev = UI.cur;
  const before = SelfTest.results.length;
  SelfTest._playerRowVisible('scCode', 'codePanel', 'probe');
  SelfTest._playerRowVisible('scEnd', 'fbBtns', 'probe');
  const clean = SelfTest.results.slice(before).map(r => r.ok);
  // regression: someone accidentally gates the player surfaces (hidden + no .nav)
  const cp = document.getElementById('codePanel'); cp.classList.add('hidden');
  for (const b of cp.querySelectorAll('button')) b.classList.remove('nav');
  const fb = document.getElementById('fbBtns'); fb.classList.add('hidden');
  for (const b of fb.querySelectorAll('button')) b.classList.remove('nav');
  const before2 = SelfTest.results.length;
  SelfTest._playerRowVisible('scCode', 'codePanel', 'probe');
  SelfTest._playerRowVisible('scEnd', 'fbBtns', 'probe');
  const regressed = SelfTest.results.slice(before2).map(r => r.ok);
  // restore
  cp.classList.remove('hidden'); for (const b of cp.querySelectorAll('button')) b.classList.add('nav');
  fb.classList.remove('hidden'); for (const b of fb.querySelectorAll('button')) b.classList.add('nav');
  UI.show(prev || 'scTitle');
  return JSON.stringify({ clean, regressed, cpBtns: cp.querySelectorAll('button').length, fbBtns: fb.querySelectorAll('button').length });
})()`);
const o = JSON.parse(out);
const ok = o.clean.length === 2 && o.clean.every(Boolean) && o.regressed.length === 2 && o.regressed.every(r => r === false) && o.cpBtns === 3 && o.fbBtns === 4;
console.log((ok ? 'PASS ' : 'FAIL ') + 'player surfaces (scCode codePanel: ' + o.cpBtns + ' btns, fbBtns: ' + o.fbBtns + ' btns) stay visible&navigable on plain load — ' + JSON.stringify(o.clean) + '; forced-gate regression detected — ' + JSON.stringify(o.regressed));
try { ws.close(); } catch { }
ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + prof + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", 12000);
setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch { } }, 400);
process.exitCode = ok ? 0 : 1;