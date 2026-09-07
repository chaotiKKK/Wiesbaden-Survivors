#!/usr/bin/env node
// Probe (qa re-verification): drive the FULL ?qa developer surface with real
// input — menu clicks start a run, Escape pauses, then the QA panel's real
// buttons do the deep work: arbitrary startWave(n), godmode toggle, one-click
// endRun. No engine calls control the run; page reads verify state, and one
// damage() call stimulates the godmode guard (the documented 2026-09-03 method).
// Save is snapshotted up front and restored (endRun writes the real save).
import { existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const URL = process.argv[2] || 'http://127.0.0.1:8080/index.html?qa=1&cb=qalive' + Date.now();
const EDGE_PATH = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(p => existsSync(p));
if (!EDGE_PATH) { console.error('FAIL no Edge binary'); process.exit(1); }

const ps = (script, opts) => {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', script], Object.assign({ encoding: 'utf8', timeout: 15000 }, opts || {}));
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let edgePort = 0, edgeProfile = '';

function launchEdge() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      edgePort = srv.address().port; srv.close();
      edgeProfile = path.join(os.tmpdir(), 'fbqalive-edge-' + process.pid + '-' + Date.now());
      const pf = edgeProfile.replace(/\\/g, '/');
      const s = "Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH + "' -ArgumentList '--headless=new --remote-debugging-port=" + edgePort +
        ' --user-data-dir=' + pf + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-frame-rate-limit --disable-gpu-vsync --run-all-compositor-stages-before-draw --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding about:blank'";
      ps(s, 8000);
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
    await cdp('Page.navigate', { url: URL });
    for (let i = 0; i < 50; i++) { if (await ev("typeof Game === 'object' && !!document.getElementById('scTitle')")) break; await sleep(300); }
    await sleep(800);
    await ev('window.confirm = () => true; 1');
    res('?qa page loaded', (await ev('location.href')).indexOf('qa=1') >= 0, '');

    // save snapshot (endRun writes the real save)
    const saveSnap = await ev('JSON.stringify(Save.data)');

    // start a run with real clicks; the intro splash may eat the first click
    const splash = await ev(`(() => { const i = document.getElementById('intro'); const cs = i ? getComputedStyle(i) : null; return !!(i && cs && cs.visibility !== 'hidden' && cs.display !== 'none'); })()`);
    if (splash) await clickSel('#intro', 'splash');
    let inChar = false;
    for (let i = 0; i < 6 && !inChar; i++) {
      await clickSel('#scTitle [data-act="play"]', 'SPIEL STARTEN');
      await sleep(400);
      inChar = (await ev("UI.cur")) === 'scChar';
    }
    res('SPIEL STARTEN opens character select (real click)', inChar, '');
    await clickSel('#scChar [data-act="charConfirm"]', 'Bestätigen');
    const ctl = await ev("({ cur: UI.cur, hasOK: !!document.querySelector('#scControls [data-act=\"controlsOK\"]') })");
    res('Bestätigen leads to controls screen', ctl.cur === 'scControls' && ctl.hasOK, '');
    await clickSel('#scControls [data-act="controlsOK"]', 'OK · Los geht\'s');
    let playing = false;
    for (let i = 0; i < 60 && !playing; i++) { const s = await ev("Game.state"); if (s === 'play') playing = true; else await sleep(250); }
    res('run starts in real time (wave 1)', playing, 'wave=' + (await ev('Game.wave')));

    // pause via Escape (player input) — QA panel must appear
    await pressEscape();
    const paused = await ev(`(() => { const row = document.getElementById('qaRow'); const inRing = UI.navEls.some(el => el.dataset.act && String(el.dataset.act).indexOf('qa') === 0);
      return JSON.stringify({ state: Game.state, cur: UI.cur, qaVisible: !row.classList.contains('hidden'), qaInRing: inRing, godBtn: document.getElementById('qaGodBtn').textContent, wave: Game.wave }); })()`);
    const p = JSON.parse(paused);
    res('Escape pauses; ?qa panel visible on pause screen', p.state === 'paused' && p.cur === 'scPause' && p.qaVisible, JSON.stringify({ wave: p.wave, cur: p.cur, qaInRing: p.qaInRing }));
    res('QA buttons are keyboard-reachable (in nav ring)', p.qaInRing === true, '');

    // godmode via real click
    await clickSel('#qaRow [data-act="qaGod"]', 'Gott-Modus toggle');
    const god = JSON.parse(await ev(`JSON.stringify({ god: Game.qaGod, btn: document.getElementById('qaGodBtn').textContent })`));
    res('godmode toggle ON through the panel', god.god === true && /AN/.test(god.btn), JSON.stringify(god));

    // arbitrary startWave: set 20, real-click "→ Welle"
    await ev('document.getElementById("qaWaveIn").value = "20"; 1');
    await clickSel('#qaRow [data-act="qaWaveGo"]', '→ Welle');
    let at20 = false;
    for (let i = 0; i < 40 && !at20; i++) { const s = await ev('Game.state'); const w = await ev('Game.wave'); if (s === 'play' && w === 20) at20 = true; else await sleep(200); }
    const w20 = JSON.parse(await ev('JSON.stringify({ wave: Game.wave, state: Game.state, hp: Math.round(Game.players[0].hp), god: Game.qaGod })'));
    res('QA "→ Welle 20" jumps the run to wave 20 in play (no engine call)', at20 && w20.wave === 20, JSON.stringify(w20));
    await sleep(1500);

    // godmode guard is real: a huge hit must leave hp untouched while on
    const hpBefore = await ev('Math.round(Game.players[0].hp)');
    await ev('Game.players[0].damage(99999); 1');
    const hpAfter = await ev('Math.round(Game.players[0].hp)');
    res('godmode absorbs damage (hp ' + hpBefore + ' -> ' + hpAfter + ' on wave 20)', hpAfter === hpBefore && hpAfter > 0, '');

    // one-click endRun (defeat) from the panel
    await pressEscape();
    const paused2 = JSON.parse(await ev('JSON.stringify({ state: Game.state, cur: UI.cur })'));
    res('re-pause before ending the run', paused2.state === 'paused' && paused2.cur === 'scPause', JSON.stringify(paused2));
    await clickSel('#qaRow [data-act="qaEnd"][data-val="lose"]', 'Ende: Niederlage');
    let ended = false;
    for (let i = 0; i < 40 && !ended; i++) { const e = await ev('({ st: Game.state, won: Game._endWon })'); if (e.st === 'end') ended = true; else await sleep(200); }
    const end = JSON.parse(await ev(`(() => { const t = document.getElementById('endTitle'); return JSON.stringify({ st: Game.state, won: Game._endWon, endVisible: !document.getElementById('scEnd').classList.contains('hidden'), title: t ? t.textContent.replace(/\\s+/g, ' ').trim() : null, wave: Game.wave }); })()`));
    res('QA "Ende: Niederlage" -> real end screen (no engine call)', ended && end.endVisible && end.won === false, JSON.stringify({ title: end.title, wave: end.wave }));
    res('endRun wrote the real save (runs grew)', (await ev('Save.data.runs')) >= 1, 'runs=' + (await ev('Save.data.runs')));

    // restore save
    await ev('Save.data = ' + saveSnap + '; Save.save(); 1');
    res('save snapshot restored', (await ev('Save.data.runs')) === 0, 'runs=' + (await ev('Save.data.runs')));
  } finally {
    cleanup();
  }
  if (pageErrors.length) { note('page errors: ' + pageErrors.length + ' — ' + pageErrors[0].slice(0, 160)); failures++; }
  else note('zero page errors');
  console.log(failures === 0 ? '\nQA-LIVE PROBE OK' : '\nQA-LIVE PROBE FAILED (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}
main();
