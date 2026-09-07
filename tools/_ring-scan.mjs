#!/usr/bin/env node
// Empirical ring scan: show each menu screen (plus a white-box end screen after a real
// startRun/endRun) and list the live nav-ring members, so read-only text rows that
// currently drag arrow navigation can be identified instead of guessed.
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ps = (script, timeout = 10000) => spawnSync('powershell', ['-NoProfile', '-Command', script], { timeout, encoding: 'utf8' });

let edgePort, edgeProfile, server;
async function serve() {
  const port = 9550 + Math.floor(Math.random() * 200);
  server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!existsSync(fp)) { res.writeHead(404); return res.end('nf'); }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store' });
    res.end(readFileSync(fp));
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return 'http://127.0.0.1:' + port + '/index.html?cb=ringscan' + Date.now();
}
function launchEdge() {
  return new Promise((resolve) => {
    edgePort = 9850 + Math.floor(Math.random() * 100);
    edgeProfile = path.join(os.tmpdir(), 'fbrs-edge-' + process.pid + '-' + Date.now());
    const pf = edgeProfile.replace(/\\/g, '/');
    const s = "Start-Process -WindowStyle Hidden -FilePath '" + EDGE + "' -ArgumentList '--headless=new --remote-debugging-port=" + edgePort +
      ' --user-data-dir=' + pf + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding about:blank'";
    const r = ps(s, 8000);
    if (r.status !== 0) { resolve(false); return; }
    const deadline = Date.now() + 15000;
    const probe = () => {
      const rr = ps("try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:" + edgePort + "/json/version).StatusCode } catch { 0 }", 5000);
      if ((rr.stdout || '').trim().startsWith('200')) resolve(true);
      else if (Date.now() < deadline) setTimeout(probe, 400);
      else resolve(false);
    };
    probe();
  });
}
function cleanup() {
  try { server && server.close(); } catch { }
  if (edgeProfile) {
    const pat = edgeProfile.replace(/\\/g, '/');
    ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + pat + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", 15000);
    setTimeout(() => { try { rmSync(edgeProfile, { recursive: true, force: true }); } catch { } }, 600);
  }
}

let ws; const pending = new Map(); let msgId = 0;
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 20000);
  });
}
async function ev(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

const RING = `(() => {
  const members = UI.navEls.map(e => {
    const acts = e.querySelectorAll('[data-act],button');
    return {
      act: e.dataset.act || '',
      txt: (e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 34),
      cls: (e.className || '').toString().slice(0, 18),
      interact: !!e.dataset.act || acts.length > 0
    };
  });
  return { n: UI.navEls.length, members };
})()`;

async function scan(name, expr) {
  await ev(expr);
  await sleep(500); /* let the rAF fit() scale land before reading the ring */
  await ev('UI.refreshNav(); 1'); /* steady-state membership after fit */
  const r = await ev(RING);
  const txts = r.members.map(m => (m.interact ? '' : 'TEXT! ') + m.act + ' [' + m.cls + '] ' + m.txt).join('\n      ');
  console.log('--- ' + name + ': ' + r.n + ' stops ---');
  if (txts) console.log('      ' + txts);
}

async function main() {
  const base = await serve();
  const up = await launchEdge();
  if (!up) { console.error('Edge did not start'); process.exit(1); }
  const list = JSON.parse(await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text());
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
  };
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: base });
    for (let i = 0; i < 50; i++) { if (await ev("typeof Game === 'object' && typeof UI === 'object'")) break; await sleep(300); }
    await scan('scTitle', "UI.renderTitle(); UI.show('scTitle')");
    await scan('scAchv', "UI.renderAchv(); UI.show('scAchv')");
    await scan('scStats', "UI.renderStats(); UI.show('scStats')");
    await scan('scCode', "UI.renderCode(); UI.show('scCode')");
    await scan('scOptions', "UI.renderOptions(); UI.show('scOptions')");
    await scan('scMusic', "UI.renderMusic && UI.renderMusic(); UI.show('scMusic')");
    await scan('scTune', "TUNE.init && UI.renderTune && UI.renderTune(); UI.show('scTune')");
    await scan('scCodex', "UI.renderCodex(); UI.show('scCodex')");
    await scan('scChar', "UI.renderChars(0); UI.show('scChar')");
    await scan('scNet', "UI.renderNet(); UI.show('scNet')");
    // end screen after a real run teardown
    await ev("Game.setRunSeed(424242); Game.startRun(); 1");
    await sleep(1500);
    await ev("Game.endRun(false); 1");
    await scan('scEnd', "UI.renderEnd(false); UI.show('scEnd')");
    await scan('scPause', "UI.show('scPause'); UI.refreshNav()");
    console.log('SCAN DONE');
    process.exit(0);
  } catch (e) {
    console.error('ABORT: ' + e.message);
    process.exit(3);
  } finally {
    cleanup();
  }
}
main();