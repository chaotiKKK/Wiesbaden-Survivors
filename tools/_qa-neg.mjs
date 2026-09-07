#!/usr/bin/env node
// Negative/positive sanity for the selftest QA-Nav gate. Plain load: simulate
// the regressions the assertions guard (qaRow unhidden + buttons back to .nav),
// run the exact predicate, require it to fire. Then load ?qa=1 and require the
// positive branch: row visible, all buttons ring members.
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const URL = 'http://127.0.0.1:8080/index.html?cb=qaneg' + Date.now();
const URLQA = 'http://127.0.0.1:8080/index.html?qa=1&cb=qapos' + Date.now();
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ps = (s, t = 8000) => spawnSync('powershell', ['-NoProfile', '-Command', s], { timeout: t, encoding: 'utf8' });
const port = 10100 + Math.floor(Math.random() * 60);
const prof = path.join(os.tmpdir(), 'fbqaneg-' + process.pid + '-' + Date.now()).replace(/\\/g, '/');
ps("Start-Process -WindowStyle Hidden -FilePath '" + EDGE + "' -ArgumentList '--headless=new --remote-debugging-port=" + port + ' --user-data-dir=' + prof + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-background-timer-throttling about:blank'");
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
const waitPage = async (marker) => { for (let i = 0; i < 40; i++) { if (await ev("typeof Game === 'object' && location.href.indexOf('" + marker + "') >= 0")) return; await sleep(250); } };
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: URL });
await waitPage('qaneg');
await sleep(400);

// phase 1 — plain load: mirror the selftest predicate
const out = await ev(`(() => {
  const qa = document.getElementById('qaRow');
  const prev = UI.cur;
  UI.show('scPause'); UI.refreshNav();
  const qaBtns = Array.from(qa.querySelectorAll('button'));
  const h = SelfTest._navHiddenRow(qa);
  const rowHidden = h.rowHidden;
  const navCount = h.navCount;
  const cleanQaActs = UI.navEls.filter(el => el.dataset && el.dataset.act && /^qa/.test(el.dataset.act)).length;
  const cleanBad = SelfTest._navBadRing(UI.navEls, 'scPause', qa).length;
  // scenario A — 'forgot to strip .nav': row hidden, buttons re-gain .nav
  for (const b of qaBtns) b.classList.add('nav');
  UI.refreshNav();
  const forgotMembers = UI.navEls.filter(el => qa.contains(el)).length;
  for (const b of qaBtns) b.classList.remove('nav');
  UI.refreshNav();
  // scenario B — full regression: row unhidden + .nav on buttons
  qa.classList.remove('hidden');
  for (const b of qaBtns) b.classList.add('nav');
  UI.refreshNav();
  const regMembers = UI.navEls.filter(el => qa.contains(el)).length;
  const regBad = SelfTest._navBadRing(UI.navEls, 'scPause', qa).length;
  UI.show(prev || 'scTitle');
  return { qaEnabled: QA_ENABLED, rowHidden, navCount, cleanQaActs, cleanBad, forgotMembers, regBad, regMembers, total: qaBtns.length, ring: UI.navEls.length };
})()`);
const okPlain = !out.qaEnabled && out.rowHidden && out.navCount === 0 && out.cleanQaActs === 0 && out.cleanBad === 0 && out.forgotMembers === 0 && out.regMembers >= 12 && out.regBad >= 12;

// phase 2 — ?qa: positive branch of the selftest group
await cdp('Page.navigate', { url: URLQA });
await waitPage('qapos');
await sleep(600);
const pos = await ev(`(() => {
  const qa = document.getElementById('qaRow');
  UI.show('scPause'); UI.refreshNav();
  const qaBtns = Array.from(qa.querySelectorAll('button'));
  const rowShown = !qa.classList.contains('hidden') && getComputedStyle(qa).display !== 'none';
  const withNav = qaBtns.filter(b => b.classList.contains('nav')).length;
  const inRing = qaBtns.filter(b => UI.navEls.includes(b)).length;
  return { qaEnabled: QA_ENABLED, rowShown, total: qaBtns.length, withNav, inRing };
})()`);
const okQa = pos.qaEnabled && pos.rowShown && pos.total >= 12 && pos.withNav === pos.total && pos.inRing === pos.total;

console.log((okPlain ? 'PASS ' : 'FAIL ') + 'plain load: qaRow hidden, 0 .nav, 0 ring members, clean pause ring (' + out.ring + ' stops); hidden+.nav excluded (' + out.forgotMembers + '); unhide regression detected (' + out.regMembers + ' of ' + out.total + ' qa buttons in ring) — ' + JSON.stringify(out));
console.log((okQa ? 'PASS ' : 'FAIL ') + '?qa load: row shown, all ' + pos.total + ' buttons carry .nav and are ring members — ' + JSON.stringify(pos));
try { ws.close(); } catch { }
ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + prof + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", 12000);
setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch { } }, 400);
process.exitCode = (okPlain && okQa) ? 0 : 1;
