#!/usr/bin/env node
// Probe (qa snapshot/mods-view): exercises the two QA panel additions with real
// clicks — (1) the on-screen wave-mods readout toggle (qaModsView) and (2) the
// in-panel save snapshot/restore (qaSnap/qaRestore), so endRun probing no longer
// needs to snapshot Save.data from outside. Also proves the no-snapshot guard
// and that a plain load keeps the readout hidden. Only display navigation to the
// pause screen after the run ends is done via UI.show (no menu path leads from
// the end screen back to pause); every action under test is a real click.
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const PLAIN = 'http://127.0.0.1:8080/index.html?cb=qasnap-plain' + Date.now();
const QA = 'http://127.0.0.1:8080/index.html?qa=1&cb=qasnap-qa' + Date.now();
const EDGE_PATH = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
if (!EDGE_PATH) { console.error('FAIL no Edge binary'); process.exit(1); }

const ps = (script, opts) => { const r = spawnSync('powershell', ['-NoProfile', '-Command', script], Object.assign({ encoding: 'utf8', timeout: 15000 }, opts || {})); return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let edgePort = 0, edgeProfile = '';

function launchEdge() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      edgePort = srv.address().port; srv.close();
      edgeProfile = path.join(os.tmpdir(), 'fbqasnap-edge-' + process.pid + '-' + Date.now());
      const pf = edgeProfile.replace(/\\/g, '/');
      ps("Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH + "' -ArgumentList '--headless=new --remote-debugging-port=" + edgePort + ' --user-data-dir=' + pf + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding about:blank'", 8000);
      const deadline = Date.now() + 15000;
      const probe = () => {
        const rr = ps("try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:" + edgePort + "/json/version).StatusCode } catch { 0 }", 5000);
        if ((rr.stdout || '').trim().startsWith('200')) resolve(true);
        else if (Date.now() < deadline) setTimeout(probe, 400);
        else resolve(false);
      };
      probe();
    });
  });
}
function cleanup() {
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
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 25000);
  });
}
async function ev(expression, tries = 2) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const d = (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || 'unknown';
        if (t < tries - 1) { await sleep(350); continue; }
        throw new Error('page-eval failed [' + d + ']');
      }
      return r.result.value;
    } catch (e) { if (t < tries - 1) { await sleep(350); continue; } throw e; }
  }
}
async function clickSel(sel, label) {
  const pt = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    if (!el.getClientRects().length) return { gone: true, sel: ${JSON.stringify(sel)} };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), vis: getComputedStyle(el).visibility, dis: el.disabled === true, txt: (el.textContent || '').replace(/\\s+/g, ' ').slice(0, 44) }; })()`);
  if (!pt || pt.gone) throw new Error('click target missing: ' + (label || sel));
  if (pt.vis === 'hidden' || pt.dis) throw new Error('click target not clickable: ' + label + ' ' + JSON.stringify(pt));
  await sleep(120);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(220);
}
async function pressEscape() {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(250);
}
let failures = 0;
const res = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' — ' + detail : '')); if (!ok) failures++; };
const note = (m) => console.log('NOTE  ' + m);

async function main() {
  const up = await launchEdge();
  if (!up) { console.error('FAIL Edge did not start'); process.exit(1); }
  const list = JSON.parse(await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text());
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') pageErrors.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
  };
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

    // ---- phase 1: plain load — readout hidden, qaRow hidden, snap button not navigable ----
    await cdp('Page.navigate', { url: PLAIN });
    for (let i = 0; i < 50; i++) { if (await ev("typeof Game === 'object' && !!document.getElementById('scTitle')")) break; await sleep(300); }
    await sleep(400);
    const plain = JSON.parse(await ev(`JSON.stringify({ readout: getComputedStyle(document.getElementById('qaModsReadout')).display,
      qaRowHidden: document.getElementById('qaRow').classList.contains('hidden'),
      inRingAfterRefresh: (function(){ UI.refreshNav(); return UI.navEls.some(el => el.dataset && el.dataset.act === 'qaSnap'); })() })`));
    res('plain load: mods readout hidden + qaRow hidden + qaSnap never joins the ring (visibility filter)',
      plain.readout === 'none' && plain.qaRowHidden && plain.inRingAfterRefresh === false, JSON.stringify(plain));

    // ---- phase 2: ?qa — snapshot/restore + mods view with real clicks ----
    await cdp('Page.navigate', { url: QA });
    for (let i = 0; i < 50; i++) { if (await ev("typeof Game === 'object' && !!document.getElementById('scTitle')")) break; await sleep(300); }
    await sleep(800);
    await ev('window.confirm = () => true; 1');
    res('?qa page loaded', (await ev('location.href')).indexOf('qa=1') >= 0, '');

    // start a real run (splash may eat the first click)
    const splash = await ev(`(() => { const i = document.getElementById('intro'); const cs = i ? getComputedStyle(i) : null; return !!(i && cs && cs.visibility !== 'hidden' && cs.display !== 'none'); })()`);
    if (splash) await clickSel('#intro', 'splash');
    let inChar = false;
    for (let i = 0; i < 6 && !inChar; i++) { await clickSel('#scTitle [data-act="play"]', 'SPIEL STARTEN'); await sleep(400); inChar = (await ev('UI.cur')) === 'scChar'; }
    res('run started: character select reached', inChar, '');
    await clickSel('#scChar [data-act="charConfirm"]', 'Bestätigen');
    await clickSel('#scControls [data-act="controlsOK"]', 'OK · Los geht\'s');
    let playing = false;
    for (let i = 0; i < 60 && !playing; i++) { const s = await ev('Game.state'); if (s === 'play') playing = true; else await sleep(250); }
    res('run in real time (wave 1)', playing, 'wave=' + (await ev('Game.wave')));
    const modNames = JSON.parse(await ev('JSON.stringify((Game.mods || []).map(m => m.name))'));
    res('run has wave mods to read out', modNames.length >= 1, modNames.join(' · '));

    // pause -> guard check (restore without snapshot must be a no-op) -> snapshot
    await pressEscape();
    const paused = JSON.parse(await ev('JSON.stringify({ state: Game.state, cur: UI.cur })'));
    res('paused; QA panel open', paused.state === 'paused' && paused.cur === 'scPause', JSON.stringify(paused));
    const runsBefore = await ev('Save.data.stats.runs');
    await clickSel('#qaRow [data-act="qaRestore"]', 'Save zurücksetzen (no snapshot)');
    res('restore without snapshot is a guarded no-op', (await ev('Save.data.stats.runs')) === runsBefore, 'runs=' + (await ev('Save.data.stats.runs')));
    await clickSel('#qaRow [data-act="qaSnap"]', 'Save sichern');
    const snap = JSON.parse(await ev('JSON.stringify({ hasSnap: !!Game._qaSaveSnap, snapRuns: Game._qaSaveSnap ? Game._qaSaveSnap.stats.runs : -1, liveRuns: Save.data.stats.runs })'));
    res('qaSnap stores an in-panel save snapshot', snap.hasSnap && snap.snapRuns === snap.liveRuns, JSON.stringify(snap));

    // mods readout toggle ON -> visible with active mod names; OFF -> hidden again
    await clickSel('#qaRow [data-act="qaModsView"]', 'Mods-Anzeige ON');
    const on = JSON.parse(await ev(`JSON.stringify({ btn: document.getElementById('qaModsViewBtn').textContent, display: getComputedStyle(document.getElementById('qaModsReadout')).display, text: document.getElementById('qaModsReadout').textContent })`));
    res('qaModsView ON: button AN + readout on screen with active mods', /AN/.test(on.btn) && on.display === 'block' && on.text.indexOf(modNames[0]) >= 0,
      JSON.stringify({ btn: on.btn.trim(), display: on.display, showsFirstMod: on.text.indexOf(modNames[0]) >= 0 }));
    await clickSel('#qaRow [data-act="qaModsView"]', 'Mods-Anzeige OFF');
    const off = JSON.parse(await ev(`JSON.stringify({ btn: document.getElementById('qaModsViewBtn').textContent, display: getComputedStyle(document.getElementById('qaModsReadout')).display })`));
    res('qaModsView OFF: button AUS + readout hidden again', /AUS/.test(off.btn) && off.display === 'none', JSON.stringify({ btn: off.btn.trim(), display: off.display }));

    // endRun via the panel, then restore via the panel
    await clickSel('#qaRow [data-act="qaEnd"][data-val="lose"]', 'Ende: Niederlage');
    let ended = false;
    for (let i = 0; i < 40 && !ended; i++) { const e = await ev('({ st: Game.state })'); if (e.st === 'end') ended = true; else await sleep(200); }
    const afterEnd = await ev('Save.data.stats.runs');
    res('endRun wrote the real save (runs grew past snapshot)', ended && afterEnd > snap.snapRuns, 'snap=' + snap.snapRuns + ' after=' + afterEnd);
    // no menu path leads from the end screen back to the pause panel; show the
    // pause screen (display-only — syncQaRow runs on UI.show('scPause')) so the
    // restore button can be real-clicked
    await ev('UI.show("scPause"); 1');
    await sleep(400);
    await clickSel('#qaRow [data-act="qaRestore"]', 'Save zurücksetzen');
    const rest = JSON.parse(await ev(`JSON.stringify({ runs: Save.data.stats.runs, cur: UI.cur, persisted: (function(){ try { return JSON.parse(localStorage.getItem(SAVE_KEY)).stats.runs; } catch (e) { return -1; } })() })`));
    res('qaRestore restores the snapshot save (memory + persisted + title screen)', rest.runs === snap.snapRuns && rest.cur === 'scTitle' && rest.persisted === snap.snapRuns, JSON.stringify(rest));
  } finally {
    cleanup();
  }
  if (pageErrors.length) { note('page errors: ' + pageErrors.length + ' — ' + pageErrors[0].slice(0, 160)); failures++; }
  else note('zero page errors');
  console.log(failures === 0 ? '\nQA-SNAP PROBE OK' : '\nQA-SNAP PROBE FAILED (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}
main();