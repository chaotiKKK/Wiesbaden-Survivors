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

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EDGE_PATH, repoRoot, argOf, startStaticServer, launchEdge, killScratchEdges, connectPageCdp } from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const argv = process.argv.slice(2);
const OUT_DIR = path.resolve(argOf(argv, '--out', path.join(os.tmpdir(), 'ws-trailer-capture')));
const WIDTH = 1280, HEIGHT = 720;
const EDGE_PROFILE_PREFIX = 'wstrailer-edge-';

const log = (m) => console.log(m);

// ---------------------------------------------------------------- beats ----
// Timeline mirrors trailer/trailer.html: bed 0-20 s, VO beats at 1.5 / 7 / 14 s.
// Each beat is captured longer than it is used so the cut has slack.
const BEATS = [
  { id: 'intro', wave: 1, seconds: 9, label: 'Welle 1 — der erste Ansturm' },
  { id: 'mid', wave: 5, seconds: 10, label: 'Welle 5 — Boss' },
  { id: 'outro', wave: 10, seconds: 10, label: 'Welle 10 — Eskalation' }
];

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

  killScratchEdges(EDGE_PROFILE_PREFIX);
  const server = await startStaticServer(ROOT);
  const site = server.url;
  log('static server on ' + site);

  // Window size + muted audio are the only launch differences from the gate's Edge.
  const edge = await launchEdge({
    profilePrefix: EDGE_PROFILE_PREFIX,
    extraArgs: ['--window-size=' + WIDTH + ',' + HEIGHT, '--hide-scrollbars', '--mute-audio']
  });
  if (!edge.ok) { console.error('FATAL: headless Edge did not start'); server.close(); process.exit(1); }
  log('headless Edge up on CDP port ' + edge.port);

  let conn;
  try { conn = await connectPageCdp(edge.port); }
  catch (e) { console.error('FATAL: ' + e.message); server.close(); edge.kill(); process.exit(1); }
  const { cdp, ev, setEventHandler } = conn;
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
      setEventHandler((d) => {
        if (d.method !== 'Page.screencastFrame') return;
        const p = d.params;
        frames.push({ ts: p.metadata.timestamp, buf: Buffer.from(p.data, 'base64') });
        cdp('Page.screencastFrameAck', { sessionId: p.sessionId }, 8000).catch(() => { });
      });
      await cdp('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
      await sleep(beat.seconds * 1000);
      await cdp('Page.stopScreencast');
      setEventHandler(null);
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
    if (conn) conn.close();
    server.close(); edge.kill();
  }
}

main();
