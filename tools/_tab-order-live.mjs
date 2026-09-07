#!/usr/bin/env node
// Native Tab-order probe: codex per tab + title. Steps:
// 1) compute the visible-tabbable DOM-order sequence per screen,
// 2) drive REAL Tab / Shift+Tab key events via CDP and record the focus trail,
// 3) report the focus indicator present on natively focused controls.
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
  const port = 9620 + Math.floor(Math.random() * 120);
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
  return 'http://127.0.0.1:' + port + '/index.html?cb=tab' + Date.now();
}
function launchEdge() {
  return new Promise((resolve) => {
    edgePort = 9920 + Math.floor(Math.random() * 50);
    edgeProfile = path.join(os.tmpdir(), 'fbtab-edge-' + process.pid + '-' + Date.now());
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
    const id = ++msgId; pending.set(id, { method, resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 20000);
  });
}
async function ev(label, expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(label + ' threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
ws && ws.close; /* noop guard for editor */
async function connect() {
  const list = JSON.parse(await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text());
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id); pending.delete(d.id);
      if (d.error) p.reject(new Error(p.method + ': ' + d.error.message));
      else p.resolve(d.result);
    }
  };
}

const TABLIST = (within) => `(() => {
  const vis = (el) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const all = Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'))
    .filter(el => vis(el) && !el.disabled && (el.tabIndex || 0) >= 0);
  const list = ${within} ? all.filter(el => el.closest('.screen')) : all;
  return JSON.stringify(list.map(el => {
    const sc = el.closest('.screen');
    return { act: el.dataset.act || '', tag: el.tagName, txt: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 18), screen: sc ? sc.id : '', inList: !!el.closest('#codexList') };
  }));
})()`;

async function tab(shift) {
  const mods = shift ? 8 : 0;
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: mods, text: shift ? '\t' : '\t' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: mods });
  await sleep(60);
}
async function active() {
  return JSON.parse(await ev('focus', `(() => { const a = document.activeElement; if (!a || a === document.body) return '{}'; const cs = getComputedStyle(a); return JSON.stringify({ act: a.dataset.act || '', txt: (a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 20), screen: (a.closest('.screen') || {}).id || '', inList: !!a.closest('#codexList'), outline: cs.outlineStyle + ' ' + cs.outlineWidth, boxShadow: cs.boxShadow !== 'none' }); })()`));
}
const lbl = (o) => (o.act || o.txt || '(body)') + (o.inList ? '[LIST!]' : '');

async function main() {
  const base = await serve();
  const up = await launchEdge();
  if (!up) { console.error('Edge did not start'); process.exit(1); }
  await connect();
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: base });
    for (let i = 0; i < 60; i++) { if (await ev('boot', "typeof Game === 'object' && typeof UI === 'object'")) break; await sleep(300); }
    await sleep(600);
    console.log('ENGINE UP');

    for (const tabId of ['weapons', 'items']) {
      await ev('render', `UI.renderCodex(); UI.show('scCodex'); UI.codexTab = '${tabId}'; UI.renderCodex(); 1`);
      await sleep(250);
      const order = JSON.parse(await ev('list', TABLIST(true)));
      console.log('--- scCodex/' + tabId + ' native tabbables: ' + order.length + ' ---');
      console.log('   ' + order.map(o => (o.act || o.tag) + ':' + o.txt + (o.screen !== 'scCodex' ? '@' + o.screen : '') + (o.inList ? '[LIST!]' : '')).join(' | '));
      console.log('   ORDER CHECK: ' + (order.length === 8 && order.every(o => !o.inList && o.screen === 'scCodex') ? 'OK 8 stops, none in content/other screens' : 'SUSPECT n=' + order.length));
      await ev('blur', `document.activeElement && document.activeElement.blur(); 1`);
      const trail = [];
      for (let i = 0; i < 9; i++) { await tab(false); trail.push(lbl(await active())); }
      console.log('   TAB TRAIL: ' + trail.join(' → '));
      await ev('blur', `document.activeElement && document.activeElement.blur(); 1`);
      const back = [];
      for (let i = 0; i < 9; i++) { await tab(true); back.push(lbl(await active())); }
      console.log('   SHIFT+TAB TRAIL: ' + back.join(' → '));
    }
    await ev('title', `UI.renderTitle(); UI.show('scTitle'); 1`);
    await sleep(250);
    const order = JSON.parse(await ev('tlist', TABLIST(false)));
    console.log('--- scTitle native tabbables: ' + order.length + ' ---');
    console.log('   ' + order.map(o => (o.act || o.tag) + ':' + o.txt + '@' + (o.screen || '(none)')).join(' | '));
    const weird = order.filter(o => o.screen !== 'scTitle');
    console.log('   WHOLE-PAGE CHECK: ' + (weird.length === 0 ? 'OK — only the visible screen contributes tab stops' : 'LEAK: ' + weird.map(w => w.act + '@' + w.screen).join(', ')));
    // Ring-sync over REAL trusted input, both directions:
    // (a) native -> ring: one trusted Tab; the focusin handler must point
    //     UI.navIdx at the very element the browser focused;
    // (b) ring -> native: one trusted ArrowDown (navMove -> paintNav); native
    //     focus must land on the newly selected ring element.
    await ev('sync0', `UI.navVisible = true; UI.refreshNav(); UI.paintNav();
      JSON.stringify({ start: UI.navIdx, ae: document.activeElement === UI.navEls[UI.navIdx] })`);
    await tab(false); await sleep(120);
    const syncA = JSON.parse(await ev('syncA', `JSON.stringify({
      idx: UI.navIdx, ok: document.activeElement === UI.navEls[UI.navIdx] && UI.navIdx >= 0,
      vis: !!document.activeElement.classList.contains('focus') })`));
    console.log('   RING-SYNC native->ring: ' + (syncA.ok ? 'OK (navIdx ' + syncA.idx + ', focused element carries ring mark: ' + syncA.vis + ')' : 'FAIL ' + JSON.stringify(syncA)));
    await ev('arr', `UI.navIdx = Math.max(0, UI.navIdx - 1); UI.paintNav(); 1`); await sleep(80);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await sleep(150);
    const syncB = JSON.parse(await ev('syncB', `JSON.stringify({ idx: UI.navIdx, ok: document.activeElement === UI.navEls[UI.navIdx] })`));
    console.log('   RING-SYNC ring->native: ' + (syncB.ok ? 'OK (navIdx ' + syncB.idx + ', native focus follows ring)' : 'FAIL ' + JSON.stringify(syncB)));
    process.exit(0);
  } catch (e) {
    console.error('ABORT: ' + e.message);
    process.exit(3);
  } finally {
    cleanup();
  }
}
main();