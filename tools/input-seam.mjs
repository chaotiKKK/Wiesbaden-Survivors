#!/usr/bin/env node
// Input-Seam sketch — the engine's first real module seam.
//
// WHY THIS SEAM (deepening, not polishing):
//   Player.update / Projectile.update / Net tick consume a *tiny* surface of the
//   giant browser-bound `Input` singleton (index.html ~3646): moveVec(pi),
//   aimVec(pi), skillDown(pi) — plus rumble*() as an output side effect and
//   poll()/endFrame() as the frame bookkeeping. Everything else in Input
//   (DOM listeners, gamepad poll, touch sticks, key rebinding) is device
//   plumbing that game logic must not see.
//
//   Today that consumption surface is a bare global, so the game logic is only
//   testable by faking the whole singleton inside a browser. The seam is a
//   PORT (the 3 read methods + endFrame) with TWO adapters:
//     adapter 1 = the real engine Input singleton (browser: kbd/gamepad/touch)
//     adapter 2 = ScriptedInput below (deterministic, headless)
//   "one adapter = hypothetical seam, two = real" — with a scripted twin, the
//   port is real and Player-motion logic becomes Node-testable.
//
//   This module proves the SHAPE headlessly: it defines the port, provides the
//   scripted adapter, mirrors the engine's exact movement law
//   (index.html:4951-4953: lerp slip-integrator) as a pure function, and
//   exercises it. It deliberately does NOT import the 5 MB engine — that is
//   the point: the consumption logic moves behind the port so it runs here.
//
//   Extracting the law verbatim from the engine (Player.update ground branch):
//     const slip = modIs('regen') ? .045 : .0001;
//     this.vx = lerp(this.vx, mv.x * sp, 1 - Math.pow(slip, dt));
//     this.vy = lerp(this.vy, mv.y * sp, 1 - Math.pow(slip, dt));
//     this.x += this.vx * dt; this.y += this.vy * dt;
//     lerp = (a,b,t) => a + (b - a) * t;   (index.html:1107)
//   The seam sketch keeps that law byte-identical as stepMotion() below.

'use strict';

/* ---------------------------- the port ---------------------------- */
// What game logic may read from input, per player index pi (0/1).
// moveVec(pi) -> { x, y }        unit-ish movement wish (|v| <= 1)
// aimVec(pi)  -> { x, y, has }  aim direction; has=false when unpressed
// skillDown(pi) -> boolean      is the skill/ability button held
// endFrame()  -> void            frame bookkeeping (pressed-edge reset)
const PORT_METHODS = ['moveVec', 'aimVec', 'skillDown', 'endFrame'];

function checkPort(impl, name) {
  const missing = PORT_METHODS.filter(m => typeof impl[m] !== 'function');
  if (missing.length) throw new Error(`${name} violates input port: missing ${missing.join(', ')}`);
  return true;
}

/* The engine Input singleton's shape, frozen for reference — the browser
   adapter. Only the read surface is listed; the real object also carries
   key()/kDown()/padAxis()/rumble()/init()/poll() etc. which game logic must
   not reach for once the seam is in place. */
const engineInputSurface = {
  moveVec: pi => ({ x: 0, y: 0 }),        // real impl normalizes: m>1 ? /m : raw
  aimVec: pi => ({ x: 0, y: 0, has: false }),
  skillDown: pi => false,
  endFrame: () => {}
};

/* ---------------------- adapter 2: scripted ---------------------- */
// Deterministic, device-free twin of the engine Input. A driver function
// (t, pi) => { move:{x,y}, aim:{x,y}, skill:bool } is the only thing that
// varies between runs — same driver, same trajectory, every time.
class ScriptedInput {
  constructor(driver, seed = 0) {
    this._driver = driver;
    this._t = 0;
    this._seed = seed >>> 0;
    checkPort(this, 'ScriptedInput');
  }
  // Mirror the engine's normalize: diagonal (1,1) must not exceed |v|=1.
  static norm(v) {
    const m = Math.hypot(v.x, v.y);
    return m > 1 ? { x: v.x / m, y: v.y / m } : { x: v.x, y: v.y };
  }
  _state(pi) {
    const s = this._driver(this._t, pi, this._seed);
    return {
      move: ScriptedInput.norm(s.move || { x: 0, y: 0 }),
      aim: { x: (s.aim && s.aim.x) || 0, y: (s.aim && s.aim.y) || 0, has: !!(s.aim && s.aim.has) },
      skill: !!s.skill
    };
  }
  moveVec(pi) { return this._state(pi).move; }
  aimVec(pi) { return this._state(pi).aim; }
  skillDown(pi) { return this._state(pi).skill; }
  endFrame() { this._t += 1 / 60; }       // fixed headless cadence
}

/* ---------------- extracted engine law (pure function) ---------------- */
// Mirrors index.html Player.update ground branch byte-for-byte, with the
// mod-dependent slip made an explicit parameter (regen .045 vs base .0001).
function stepMotion(body, mv, speed, slip, dt) {
  body.vx = body.vx + (mv.x * speed - body.vx) * (1 - Math.pow(slip, dt));
  body.vy = body.vy + (mv.y * speed - body.vy) * (1 - Math.pow(slip, dt));
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  return body;
}

/* --------------------------- the proof --------------------------- */
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };

console.log('Input-seam headless proof');

/* 1. Both adapters satisfy the port. */
checkPort(engineInputSurface, 'engineInputSurface');
const scripted = new ScriptedInput(() => ({ move: { x: 1, y: 0 } }));
ok(true, 'port contract holds for browser Input surface + ScriptedInput');

/* 2. Normalization mirrors the engine (diagonal 1,1 must clamp to |v|=1). */
const diag = ScriptedInput.norm({ x: 1, y: 1 });
ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-9 && diag.x > 0.7, `diagonal normalized (got ${diag.x.toFixed(4)},${diag.y.toFixed(4)})`);
ok(ScriptedInput.norm({ x: 0.3, y: 0 }).x === 0.3, 'sub-unit vector passes through unchanged (engine behavior)');

/* 3. Determinism: identical driver => identical trajectory. */
const driver = (t) => ({ move: { x: Math.cos(t * 0.7), y: Math.sin(t * 0.9) } });
const runOnce = () => {
  const inp = new ScriptedInput(driver, 42);
  const body = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let f = 0; f < 180; f++) { stepMotion(body, inp.moveVec(0), 300, 0.0001, 1 / 60); inp.endFrame(); }
  return body;
};
const a = runOnce(), b = runOnce();
ok(a.x === b.x && a.y === b.y && a.vx === b.vx, `deterministic across runs (${a.x.toFixed(2)},${a.y.toFixed(2)})`);

/* 4. Physics sanity: hold right => vx converges to speed, never overshoots,
      x advances monotonically; release => decays (never reverses). */
const body = { x: 0, y: 0, vx: 0, vy: 0 };
const inp = new ScriptedInput((t) => ({ move: t < 1 ? { x: 1, y: 0 } : { x: 0, y: 0 } }));
let maxV = 0, overshoot = false, reversal = false, prevVx = 0;
for (let f = 0; f < 180; f++) {
  const mv = inp.moveVec(0);
  stepMotion(body, mv, 300, f < 60 ? 0.0001 : 0.045, 1 / 60); // regen slip after 1 s
  if (body.vx > maxV) maxV = body.vx;
  if (body.vx > 300 * 1.001) overshoot = true;
  if (f > 60 && body.vx > prevVx + 1e-9) reversal = true;   // decay must be monotone-ish
  prevVx = body.vx;
  inp.endFrame();
}
ok(Math.abs(maxV - 300) < 0.5, `velocity converges to speed (max ${maxV.toFixed(2)} vs 300)`);
ok(!overshoot, 'never overshoots the target speed');
ok(!reversal, 'velocity decays monotonically after release');
// Displacement check must respect the law's own dynamics: hold 1 s at 300 px/s
// against near-zero slip gives ~267 px (exponential approach, tau ~0.11 s), the
// regen-slip decay adds ~tau2*300 (~96 px) as vx bleeds off -> ~363 px total.
// Bound generously around that engine-derived expectation.
ok(body.x > 300 && body.x < 420, `total displacement matches engine law (${body.x.toFixed(1)} px after 3 s, expect ~363)`);

/* 5. The seam's leverage: the SAME loop runs against a driver that reads
      game state — i.e. a bot or an online-remote twin — without touching
      the browser adapter. (mirrors Net.remote.mx/my consumption in moveVec) */
let remoteMx = 1, remoteMy = 0;
const netTwin = new ScriptedInput(() => ({ move: { x: remoteMx, y: remoteMy } }));
const nb = { x: 0, y: 0, vx: 0, vy: 0 };
for (let f = 0; f < 60; f++) { stepMotion(nb, netTwin.moveVec(1), 200, 0.0001, 1 / 60); netTwin.endFrame(); }
ok(nb.x > 150 && nb.y === 0, `remote-twin input drives player headlessly (x=${nb.x.toFixed(1)})`);

/* 6. skill/aim surface is part of the port and readable headlessly. */
const s2 = new ScriptedInput((t, pi) => ({ aim: { x: 0.5, y: -0.5, has: true }, skill: pi === 0 }));
ok(s2.aimVec(0).has && s2.aimVec(0).y === -0.5, 'aimVec has+vector readable');
ok(s2.skillDown(0) === true && s2.skillDown(1) === false, 'skillDown readable per player');

console.log(`\nRESULT ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
