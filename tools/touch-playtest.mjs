#!/usr/bin/env node
// Touch playtest: twin-stick controls under headless-Edge mobile emulation.
// Loads the served copy at 390x844 (mobile + touch emulation, 5 touch points)
// and drives the REAL touch path — CDP Input.dispatchTouchEvent on #tp1/#tp2
// and the SKILL/pause buttons — then asserts observable game state.
// Node >= 21 (global WebSocket). Usage: node tools/touch-playtest.mjs [baseUrl]
import { existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8080/index.html';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'cb=touch' + Date.now();
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!EDGE) { console.error('no Edge'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let edgePort = 0, edgeProfile = '';
const ps = (script, timeout = 10000) => spawnSync('powershell', ['-NoProfile', '-Command', script], { timeout, encoding: 'utf8' });

const PASS = [], FAIL = [];
const res = (name, ok, detail) => { (ok ? PASS : FAIL).push(name + (detail ? ' — ' + detail : '')); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

function launchEdge() {
  return new Promise((resolve) => {
    edgePort = 9300 + Math.floor(Math.random() * 400);
    edgeProfile = path.join(os.tmpdir(), 'fbtouch-edge-' + process.pid + '-' + Date.now());
    const pf = edgeProfile.replace(/\\/g, '/');
    const s = "Start-Process -WindowStyle Hidden -FilePath '" + EDGE + "' -ArgumentList '--headless=new --remote-debugging-port=" + edgePort +
      ' --user-data-dir=' + pf + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience about:blank'";
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
  if (edgeProfile) {
    const pat = edgeProfile.replace(/\\/g, '/');
    ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + pat + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", 15000);
    setTimeout(() => { try { rmSync(edgeProfile, { recursive: true, force: true }); } catch { } }, 600);
  }
}

let ws;
const pending = new Map();
let msgId = 0;
const pageErrors = [];
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 20000);
  });
}
async function ev(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
const tap = async (x, y, id) => {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
  await sleep(60);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const touch = (type, pts) => cdp('Input.dispatchTouchEvent', { type, touchPoints: pts });

async function main() {
  const up = await launchEdge();
  if (!up) { console.error('Edge did not start'); process.exit(1); }
  const list = JSON.parse((await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text()));
  const page = list.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') pageErrors.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
  };
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    // 390x844 portrait phone, high-DPI, touch capable (5 points)
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Page.navigate', { url: URL });
    await sleep(2500);
    // wait until the engine is up
    for (let i = 0; i < 40; i++) { if (await ev("typeof Game === 'object' && typeof Input === 'object' && !!Game.players")) break; await sleep(300); }

    res('touch mode entered at init', await ev('Input.isTouch === true'), 'Input.isTouch=' + await ev('Input.isTouch'));
    res('touch overlay visible', await ev("!document.getElementById('touch').classList.contains('hidden')"));
    res('sticks + buttons present', await ev("['tp1','tp2','tab1','tab2'].every(id => !!document.getElementById(id))"));

    const rects = await ev(`(() => { const g = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, l: b.left, t: b.top }; }; return { tp1: g('tp1'), tp2: g('tp2'), tab1: g('tab1'), tab2: g('tab2') }; })()`);


    // --- studio splash (#intro, z-200, full-viewport) dismisses on any tap ---
    // A real phone user skips it on the title screen; drive that real path first.
    const introBefore = await ev("!!document.getElementById('intro')");
    if (introBefore) {
      await tap(195, 300, 50);
      await sleep(500);
    }
    const introGone = await ev("!document.getElementById('intro')");
    res('intro splash dismisses on tap', !introBefore || introGone, introBefore ? 'removed after tap' : 'was already gone');

    // --- start a real run (same path the page's own selftest LongRun uses) ---
    await ev('Game.startRun()');
    await sleep(600);
    const p0 = await ev('({ x: Game.players[0].x, y: Game.players[0].y })');
    res('run started', await ev("Game.state === 'play' && Game.wave === 1"));
    if (process.argv.includes('diag')) {
      // --- diagnostic: which element actually receives the touches mid-run? ---
      const evlog = await ev(`(() => { window.__tl = []; for (const t of ['touchstart','touchmove','touchend','touchcancel']) document.addEventListener(t, e => window.__tl.push(t + '@' + (e.target && e.target.id ? e.target.id : e.target.tagName)), true); const g = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
        const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.className || e.tagName) : '(none)'; };
        return { tp1: g('tp1'), tab1: g('tab1'), tab2: g('tab2'), hitTp1: hit(g('tp1').x, g('tp1').y), hitTab1: hit(g('tab1').x, g('tab1').y), hitTab2: hit(g('tab2').x, g('tab2').y),
          hudHidden: document.getElementById('hud').classList.contains('hidden'), introHidden: (document.getElementById('intro') || { classList: { contains: () => '?' } }).classList.contains('hidden'), state: Game.state, cur: UI.cur }; })()`);
      console.log('DIAG rects+hit mid-run:', JSON.stringify(evlog));
      const x = evlog.tp1.x, y = evlog.tp1.y;
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 99 }] });
      await sleep(120);
      for (let i = 1; i <= 3; i++) await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 15 * i, y, id: 99 }] });
      await sleep(250);
      console.log('DIAG after drag:', JSON.stringify(await ev(`({ log: window.__tl, stick: Input.touch.p1, playerX: Game.players[0].x, playerStart: ${p0.x} })`)));
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      throw new Error('diag done');
    }

    // --- LEFT STICK: full-right drag must move the avatar ---
    await touch('touchStart', [{ x: rects.tp1.x, y: rects.tp1.y, id: 1 }]);
    for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: rects.tp1.x + 12 * i, y: rects.tp1.y, id: 1 }]);
    await sleep(600);
    const moved = await ev('({ d: Game.players[0].x - ' + p0.x + ', stick: { x: Input.touch.p1.x, y: Input.touch.p1.y, act: Input.touch.p1.act } })');
    res('left stick moves player right', moved.d > 15, 'dx=' + Math.round(moved.d) + 'px stick.x=' + moved.stick.x.toFixed(2));
    res('stick vector live', moved.stick.act && Math.abs(moved.stick.x) > .3, JSON.stringify(moved.stick));
    // release: stick resets and the (velocity-smoothed) coast settles fully
    await touch('touchEnd', []);
    await sleep(80);
    const released = await ev('({ s: Input.touch.p1, x: Game.players[0].x })');
    await sleep(300);
    const x350 = await ev('Game.players[0].x');
    await sleep(400);
    const x750 = await ev('Game.players[0].x');
    res('release resets stick', !released.s.act && released.s.x === 0 && released.s.y === 0);
    const coast = Math.abs(x350 - released.x), settled = Math.abs(x750 - x350);
    res('player coasts then fully stops', coast < 45 && settled < 6, 'coast=' + Math.round(coast * 10) / 10 + 'px, residual=' + Math.round(settled * 10) / 10 + 'px/0.4s');

    // --- SKILL button: tap must fire the ability (cd jumps from 0) ---
    const cd0 = await ev('Game.players[0].abilityCd');
    await tap(rects.tab1.x, rects.tab1.y, 2);
    await sleep(150);
    const cd1 = await ev('Game.players[0].abilityCd');
    res('SKILL button fires ability', cd1 > cd0, 'abilityCd ' + cd0 + ' -> ' + cd1);

    // --- PAUSE button: tap opens the pause menu; the menu's own Weiter resumes ---
    await tap(rects.tab2.x, rects.tab2.y, 3);
    await sleep(250);
    const paused = await ev("({ state: Game.state, cur: UI.cur, visible: !document.getElementById('scPause').classList.contains('hidden') })");
    res('pause button pauses run', paused.state === 'paused' && paused.cur === 'scPause' && paused.visible, JSON.stringify(paused));
    const resumeRect = await ev(`(() => { const b = document.querySelector('#scPause [data-act="resume"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await tap(resumeRect.x, resumeRect.y, 4);
    await sleep(300);
    const resumed = await ev("Game.state");
    res('pause menu resume works by touch', resumed === 'play', 'state=' + resumed);

    // --- RIGHT STICK: aim vector must register from a real touch ---
    await touch('touchStart', [{ x: rects.tp2.x, y: rects.tp2.y, id: 5 }]);
    for (let i = 1; i <= 4; i++) await touch('touchMove', [{ x: rects.tp2.x - 11 * i, y: rects.tp2.y - 11 * i, id: 5 }]);
    await sleep(150);
    const aim = await ev('(() => { const a = Input.aimVec(0); return { has: a.has, x: Math.round(a.x * 100) / 100, y: Math.round(a.y * 100) / 100 }; })()');
    res('right stick produces aim vector', aim.has && aim.x < -0.3 && aim.y < -0.3, JSON.stringify(aim));
    // hold the aim and confirm combat engages once enemies are in range
    const dmg0 = await ev('Game.run ? Game.run.dmg : 0');
    for (let i = 0; i < 30; i++) { if (await ev('Game.enemies.length > 0')) break; await sleep(400); }
    const hadEnemies = await ev('Game.enemies.length');
    await sleep(2000);
    const dmg1 = await ev('Game.run ? Game.run.dmg : 0');
    res('combat engaged while aiming', hadEnemies > 0 && dmg1 > dmg0, 'enemies=' + hadEnemies + ' dmg ' + dmg0 + ' -> ' + dmg1);
    const alive = await ev('Game.players[0].alive');
    await touch('touchEnd', []);
    res('player alive after probe', alive === true);

    const summary = { pass: PASS.length, fail: FAIL.length, pageErrors: pageErrors.length };
    if (pageErrors.length) console.log('NOTE  page errors: ' + pageErrors.slice(0, 5).join(' | '));
    console.log('RESULT touch-playtest pass=' + PASS.length + ' fail=' + FAIL.length + ' errors=' + pageErrors.length);
    process.exitCode = FAIL.length || pageErrors.length ? 1 : 0;
  } catch (e) {
    console.error('PROBE ERROR: ' + (e && e.message ? e.message : e));
    process.exitCode = 2;
  } finally {
    try { ws.close(); } catch { }
    cleanup();
  }
}
main();
