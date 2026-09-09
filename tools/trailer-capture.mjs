#!/usr/bin/env node
//
// Wiesbaden Survivors — real gameplay capture for the trailer.
//
// Captures ACTUAL gameplay (real rAF loop, real spawns, real physics) out of
// headless Edge via CDP Page.startScreencast, and writes one JPEG per delivered
// frame plus a `frames.txt` ffmpeg concat list carrying the REAL inter-frame
// gaps, so the assembled video runs at true wall-clock speed instead of a
// pretend constant rate.
//
// It is real play, not a replay or a scripted animation: the page runs the
// shipped engine, an in-page autopilot only writes into `Input.keys` — exactly
// the map a human keyboard writes into — so movement goes through the same
// input poll, collision and weapon code a player exercises. `?qa` god mode is
// enabled so a beat cannot end early in a death screen, and `Game.qaGo(n)`
// jumps to the boss waves the trailer wants (wave 20 is not reachable in a
// bounded live run — see AGENTS.md).
//
// Usage:  node tools/trailer-capture.mjs [--out <dir>] [--keep]
// Output: <dir>/beat-<id>/frame-00000.jpg ... + frames.txt + capture.json
//
// Dependency-free: plain Node >= 22 (global WebSocket, global fetch) + system Edge.

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE_DIR = path.dirname(fileURLToPath(new URL(import.meta.url)));
const ROOT = path.resolve(HERE_DIR, '..');
const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const OUT_DIR = path.resolve(argOf('--out', path.join(os.tmpdir(), 'ws-trailer-capture')));
const WIDTH = 1280, HEIGHT = 720;

const MSEDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const EDGE_PATH = MSEDGE_CANDIDATES.find(p => existsSync(p));

const log = (m) => console.log(m);

// ---------------------------------------------------------------- beats ----
// Timeline mirrors trailer/trailer.html: bed 0-20 s, VO beats at 1.5 / 7 / 14 s.
// Each beat is captured longer than it is used so the cut has slack.
const BEATS = [
  { id: 'intro', wave: 1, seconds: 9, label: 'Welle 1 — der erste Ansturm' },
  { id: 'mid', wave: 5, seconds: 10, label: 'Welle 5 — Boss' },
  { id: 'outro', wave: 10, seconds: 10, label: 'Welle 10 — Eskalation' }
];

// ------------------------------------------------------------ static srv ----
let server = null, edgeProfile = null, edgePort = 0;

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

function startStaticServer() {
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
  };
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let p = decodeURIComponent((req.url || '/').split('?')[0]);
        if (p.endsWith('/')) p += 'index.html';
        const file = path.resolve(ROOT, '.' + p);
        if (file.indexOf(ROOT) !== 0 || !existsSync(file)) throw new Error('forbidden');
        const body = readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(body);
      } catch { res.writeHead(404); res.end('not found'); }
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { server = srv; resolve(srv.address().port); });
  });
}

function sh(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', timeout: 20000 }, opts || {}));
  if (r.error && r.error.code === 'ETIMEDOUT') return { timedOut: true, code: null, stdout: '', stderr: '' };
  return { timedOut: false, code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
// PowerShell re-parses its own command line: flags and script must be separate argv.
const powershell = (script, opts) => sh('powershell', ['-NoProfile', '-Command', script], opts);

function killScratchEdges() {
  powershell("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*wstrailer-edge-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
  try {
    for (const f of readdirSync(os.tmpdir())) if (f.indexOf('wstrailer-edge-') === 0) rmSync(path.join(os.tmpdir(), f), { recursive: true, force: true });
  } catch { /* ignore */ }
}

function launchEdge() {
  return new Promise((resolve) => {
    freePort().then((port) => {
      edgePort = port;
      edgeProfile = path.join(os.tmpdir(), 'wstrailer-edge-' + process.pid + '-' + Date.now());
      // Background-timer throttling has to stay off or rAF crawls in headless.
      const ps = "Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH +
        "' -ArgumentList '--headless=new --remote-debugging-port=" + port +
        ' --user-data-dir=' + edgeProfile.replace(/\\/g, '/') +
        ' --window-size=' + WIDTH + ',' + HEIGHT +
        " --hide-scrollbars --mute-audio --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding about:blank'";
      const r = powershell(ps);
      if (r.timedOut || r.code !== 0) { resolve(false); return; }
      const deadline = Date.now() + 15000;
      const probe = () => {
        if (Date.now() > deadline) { resolve(false); return; }
        const rr = powershell('try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:' + port + '/json/version).StatusCode } catch { 0 }', { timeout: 5000 });
        if ((rr.stdout || '').trim().startsWith('200')) resolve(true); else setTimeout(probe, 500);
      };
      probe();
    });
  });
}

function killEdge() {
  if (!edgeProfile) return;
  const pat = edgeProfile.replace(/\\/g, '/');
  powershell("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + pat + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
  setTimeout(() => { try { rmSync(edgeProfile, { recursive: true, force: true }); } catch { /* ignore */ } }, 800);
}

// ------------------------------------------------------------- autopilot ----
// Writes ONLY into Input.keys — the same map the real keydown handler writes —
// so every frame captured is the shipped engine reacting to ordinary input.
const AUTOPILOT = `(function(){
  if (window.__wsPilot) return 'already';
  window.__wsPilot = true;
  var t = 0, lvlCooldown = 0;
  function step(){
    var g = window.Game, U = window.UI, K = window.Input && window.Input.keys;
    if (!g || !K) { requestAnimationFrame(step); return; }
    t += 1/60;
    // Auto-pick an upgrade so a level-up cannot stall the beat on a menu.
    if (U && U.cur === 'scLevel' && lvlCooldown <= 0) {
      var box = document.getElementById('lvlCards');
      var card = box && box.children.length ? box.children[Math.floor(Math.random()*box.children.length)] : null;
      if (card) { card.click(); lvlCooldown = 0.6; }
    }
    if (U && U.cur === 'scRelic' && lvlCooldown <= 0) {
      var rb = document.getElementById('relicCards');
      var rc = rb && rb.children.length ? rb.children[0] : null;
      if (rc) { rc.click(); lvlCooldown = 0.6; }
    }
    if (lvlCooldown > 0) lvlCooldown -= 1/60;
    var p = g.players && g.players[0];
    if (p && g.state === 'play' && p.alive) {
      var L = g.level;
      var cx = L ? L.w/2 : p.x, cy = L ? L.h/2 : p.y;
      // Orbit the arena centre: keeps the camera moving and the pack trailing.
      var ang = Math.atan2(p.y - cy, p.x - cx);
      var R = Math.min(L ? L.w : 900, L ? L.h : 700) * 0.30;
      var tx = cx + Math.cos(ang + 0.75) * R, ty = cy + Math.sin(ang + 0.75) * R;
      var dx = tx - p.x, dy = ty - p.y;
      // Repel from anything close so the pilot kites instead of standing still.
      var es = g.enemies || [];
      for (var i = 0; i < es.length; i++) {
        var e = es[i]; if (!e || e.dead || e.hp <= 0) continue;
        var ex = p.x - e.x, ey = p.y - e.y, d2 = ex*ex + ey*ey;
        if (d2 < 26000 && d2 > 1) { var d = Math.sqrt(d2); dx += (ex/d) * 300; dy += (ey/d) * 300; }
      }
      var m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      K.KeyW = dy < -0.30; K.KeyS = dy > 0.30; K.KeyA = dx < -0.30; K.KeyD = dx > 0.30;
      K.Space = (Math.floor(t * 1.5) % 6 === 0);      // fire the skill periodically
      K.ShiftLeft = (Math.floor(t * 1.5) % 11 === 0); // and dash now and then
    } else { K.KeyW = K.KeyS = K.KeyA = K.KeyD = K.Space = K.ShiftLeft = false; }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return 'installed';
})()`;

// ------------------------------------------------------------------ main ----
async function main() {
  if (!EDGE_PATH) { console.error('FATAL: Edge not found'); process.exit(1); }
  if (!argv.includes('--keep')) { try { rmSync(OUT_DIR, { recursive: true, force: true }); } catch { /* ignore */ } }
  mkdirSync(OUT_DIR, { recursive: true });

  killScratchEdges();
  const sitePort = await startStaticServer();
  const site = 'http://127.0.0.1:' + sitePort;
  log('static server on ' + site);

  if (!await launchEdge()) { console.error('FATAL: headless Edge did not start'); server.close(); process.exit(1); }
  log('headless Edge up on CDP port ' + edgePort);

  const list = JSON.parse(await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text());
  const page = list.find(t => t.type === 'page');
  if (!page || !page.webSocketDebuggerUrl) { console.error('FATAL: no page target'); server.close(); killEdge(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP WebSocket refused')); });

  const pending = new Map(); let msgId = 0;
  let onEvent = null;
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id); pending.delete(d.id);
      d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result);
    } else if (d.method && onEvent) onEvent(d);
  };
  const cdp = (method, params = {}, tmo = 25000) => new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, tmo);
  });
  const ev = async (expression, tmo) => {
    const rr = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, tmo);
    if (rr.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(rr.exceptionDetails).slice(0, 300));
    return rr.result.value;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const manifest = { width: WIDTH, height: HEIGHT, capturedAt: new Date().toISOString(), beats: [] };

  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: site + '/index.html?qa&cb=trailer' + Date.now() }, 20000);

    // wait for the engine to reach the title screen
    const deadline = Date.now() + 25000;
    let ready = false;
    while (Date.now() < deadline) {
      try { if (await ev("typeof Game === 'object' && typeof UI === 'object' && !!Game.state")) { ready = true; break; } } catch { /* still loading */ }
      await sleep(400);
    }
    if (!ready) throw new Error('engine never became ready');
    log('engine ready: ' + await ev('Game.state'));

    // Deterministic seed + no tutorial overlay + no first-run hints in the footage.
    // The studio vorspann (#intro, z-index 200) and the sebboIntro saw-canvas
    // (#sawfx) both paint OVER the canvas — without this the first beat captures
    // the logo card, not the game. Verified: frame 300 of a run without it was
    // pure title card.
    await ev(`(function(){
      var intro = document.getElementById('intro');
      if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
      var saw = document.getElementById('sawfx');
      if (saw) { saw.classList.remove('on'); saw.style.display = 'none'; }
      Game.sebboIntro = function(done){ if (done) done(); };
      UI.toast = function(){};                       // no QA toasts in the footage
      try { var o = OPT(); o.tutorial = false; o.showFps = false; o.crt = true; Save.save(); } catch(e){}
      window.confirm = function(){ return true; };
      Game.sel = ['leonidas','sylvia']; Game.coop = false; Game.daily = false;
      Game.manualSeed = 20260909;
      Game.startRun();
      Game.qaGod = true;
      return Game.state;
    })()`);
    await ev(AUTOPILOT);
    log('run started, autopilot installed');
    await sleep(1200);

    for (const beat of BEATS) {
      const dir = path.join(OUT_DIR, 'beat-' + beat.id);
      mkdirSync(dir, { recursive: true });
      if (beat.wave > 1) { await ev('Game.qaGo(' + beat.wave + '); Game.qaGod = true; Game.state'); await sleep(1500); }
      // Clear sight-reducing arena mods for the capture only. TIEFE NACHT on
      // wave 10 draws a black vignette over the player — real feature, unusable
      // footage (verified: the whole third beat was a dark blob).
      const clearedMod = await ev(`(function(){
        var m = Game.arenaMod;
        if (m && ['nacht','stromausfall','nebel'].indexOf(m.id) >= 0) { Game.arenaMod = null; return 'cleared ' + m.id; }
        return m ? 'kept ' + m.id : 'none';
      })()`);
      const state = await ev('JSON.stringify({state:Game.state,wave:Game.wave,enemies:(Game.enemies||[]).length,hp:Math.round(Game.players[0].hp)})');
      log('beat ' + beat.id + ' (wave ' + beat.wave + '): ' + state + ' arenaMod=' + clearedMod);

      // Re-assert the viewport per beat: a wave jump rebuilds the arena/canvas and
      // the visual viewport drifted (beat 1 came out 1280x720, beats 2-3 1256x594),
      // which would force letterboxing at concat time.
      await cdp('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
      await cdp('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }).catch(() => { });
      await ev("document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';document.body.style.margin='0';1");
      await sleep(400);

      const frames = [];
      onEvent = (d) => {
        if (d.method !== 'Page.screencastFrame') return;
        const p = d.params;
        frames.push({ ts: p.metadata.timestamp, buf: Buffer.from(p.data, 'base64') });
        cdp('Page.screencastFrameAck', { sessionId: p.sessionId }, 8000).catch(() => { });
      };
      await cdp('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
      await sleep(beat.seconds * 1000);
      await cdp('Page.stopScreencast');
      onEvent = null;
      await sleep(250);

      // Write frames + a concat list carrying the REAL gaps between them.
      const lines = [];
      frames.forEach((f, i) => {
        const name = 'frame-' + String(i).padStart(5, '0') + '.jpg';
        writeFileSync(path.join(dir, name), f.buf);
        lines.push("file '" + name + "'");
        const next = frames[i + 1];
        const dur = next ? Math.max(0.001, next.ts - f.ts) : 1 / 30;
        lines.push('duration ' + dur.toFixed(6));
      });
      if (frames.length) lines.push("file 'frame-" + String(frames.length - 1).padStart(5, '0') + ".jpg'");
      writeFileSync(path.join(dir, 'frames.txt'), lines.join('\n') + '\n');

      const span = frames.length > 1 ? frames[frames.length - 1].ts - frames[0].ts : 0;
      const fps = span > 0 ? frames.length / span : 0;
      log('  captured ' + frames.length + ' frames over ' + span.toFixed(2) + ' s (' + fps.toFixed(1) + ' fps delivered)');
      manifest.beats.push({ id: beat.id, wave: beat.wave, label: beat.label, dir, frames: frames.length, span: +span.toFixed(3), fps: +fps.toFixed(2), state: JSON.parse(state) });
    }

    writeFileSync(path.join(OUT_DIR, 'capture.json'), JSON.stringify(manifest, null, 2));
    log('manifest -> ' + path.join(OUT_DIR, 'capture.json'));
  } catch (e) {
    console.error('CAPTURE FAILED: ' + (e && e.message ? e.message : e));
    process.exitCode = 1;
  } finally {
    try { ws.close(); } catch { /* ignore */ }
    server.close(); killEdge();
  }
}

main();
