#!/usr/bin/env node
// Live confirmation of the codex screen-reader reading-order contract:
// 1) run the new SelfTest._codexA11y group standalone in-page,
// 2) read the REAL accessibility tree via CDP Accessibility domain on scCodex and
//    verify the list/listitem/name structure actually surfaces to assistive tech.
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
  const port = 9500 + Math.floor(Math.random() * 250);
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
  return 'http://127.0.0.1:' + port + '/index.html?cb=a11y' + Date.now();
}
function launchEdge() {
  return new Promise((resolve) => {
    edgePort = 9800 + Math.floor(Math.random() * 100);
    edgeProfile = path.join(os.tmpdir(), 'fba11y-edge-' + process.pid + '-' + Date.now());
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

let ws; const pending = new Map(); let msgId = 0; const pageErrors = [];
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
    else if (d.method === 'Runtime.exceptionThrown') pageErrors.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
  };
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Accessibility.enable');
    await cdp('Page.navigate', { url: base });
    for (let i = 0; i < 50; i++) { if (await ev("typeof Game === 'object' && typeof SelfTest === 'object'")) break; await sleep(300); }
    console.log('ENGINE UP on ' + (await ev('location.href')).replace(/cb=.*/, 'cb=<ts>'));

    // standalone run of the new group
    const r = await ev(`(() => {
      const before = SelfTest.results.length;
      const rec = [];
      const orig = SelfTest._ok.bind(SelfTest);
      SelfTest._ok = (ok, name) => { rec.push({ ok, name }); };
      try { SelfTest._codexA11y(); } catch (e) { rec.push({ ok: false, name: 'group threw: ' + e.message }); }
      SelfTest._ok = orig;
      return JSON.stringify(rec);
    })()`);
    const rows = JSON.parse(r);
    let bad = 0;
    for (const x of rows) { console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name); if (!x.ok) bad++; }

    // real accessibility tree: scCodex -> #codexList -> first rows
    await ev(`UI.renderCodex(); UI.show('scCodex'); UI.codexTab = 'weapons'; UI.renderCodex(); 1`);
    await sleep(400);
    const doc = await cdp('Accessibility.getFullAXTree');
    const nodes = doc.nodes || [];
    const byRole = {};
    for (const n of nodes) { const role = n.role && n.role.value; (byRole[role] = byRole[role] || []).push(n); }
    const lists = byRole['list'] || [];
    const listitems = byRole['listitem'] || [];
    const listNode = lists.find(l => (l.name && l.name.value || '').indexOf('Kompendium') >= 0);
    const liNames = listitems.map(l => l.name ? l.name.value : '').filter(Boolean);
    console.log('AX-TREE: list nodes=' + lists.length + ' listitem nodes=' + listitems.length);
    console.log('AX list w/ Kompendium name: ' + (listNode ? '"' + listNode.name.value + '"' : 'NONE'));
    console.log('AX first 3 listitem names: ' + JSON.stringify(liNames.slice(0, 3)));
    console.log('AX listitem total w/ name: ' + liNames.length);
    console.log('AX last name: ' + JSON.stringify(liNames[liNames.length - 1] || ''));
    const pw = await ev("WEAPONS[0].name + '|' + WEAPONS[WEAPONS.length - 1].name");
    const [f0, f1] = pw.split('|');
    const axOk = listNode && liNames.length > 20 && liNames[0].indexOf(f0) >= 0 && liNames[liNames.length - 1].indexOf(f1) >= 0;
    console.log((axOk ? 'PASS ' : 'FAIL ') + 'AX-Tree: list visible to AT, first/last listitem names follow registry (' + f0 + ' … ' + f1 + ')');
    if (!axOk) bad++;
    console.log('RESULT codex-a11y pass=' + (rows.length + 1 - bad) + '/' + (rows.length + 1) + ' pageErrors=' + pageErrors.length);
    process.exit(bad ? 1 : 0);
  } catch (e) {
    console.error('ABORT: ' + e.message);
    process.exit(3);
  } finally {
    cleanup();
  }
}
main();