/**
 * Measured presentation contracts — ONE source of truth.
 *
 * The same page-side probes and thresholds are consumed by:
 *   - tools/verify.mjs  (the packaged gate, Node + raw CDP)   → Node import
 *   - tools/pw_gate.py  (the Chromium/Playwright gate)        → extracts the
 *                                                               String.raw blocks
 *                                                               and the JSON
 *                                                               THRESHOLDS below
 *
 * Why a shared module: on 2026-10-29 the same measurement existed twice and the
 * Python copy drifted (it sampled a dead player and reported a working vignette
 * as broken). One definition cannot disagree with itself.
 *
 * The extraction contract for the Python side is deliberately dumb:
 *   `export const NAME = String.raw` + backtick ... backtick + `;`
 *   `export const THRESHOLDS = { ... };`   (single line, strict JSON)
 * Keep those two shapes if you edit this file.
 */

/* The suite renders its verdict block into #selfTestPanel. Read textContent,
   NOT innerText: the block can sit in a container that is not laid out (a
   headless build without fonts lays out every text node at height 0), and
   innerText then returns "" — which reads exactly like "the suite never ran". */
export const SELFTEST_JS = String.raw`() => {
  const p = document.getElementById('selfTestPanel');
  return p ? p.textContent : (document.body ? document.body.textContent : '');
}`;

/* Verdict parser. Case-insensitive because CSS text-transform uppercases it,
   and tolerant about the middle dot. */
export const SELFTEST_RE = /selftest\s+(\d+)\/(\d+)\s*·\s*(PASS|FAIL)/i;

export function parseSelftest(txt) {
  const m = SELFTEST_RE.exec(String(txt || ''));
  if (!m) return { found: false };
  return { found: true, pass: +m[1], total: +m[2], verdict: m[3].toUpperCase(), label: m[0] };
}

/* Border band vs a tight centre box, read straight off the game canvas.
   The centre box is 160x160 at the exact middle: the vignette's inner radius is
   0.30 * min(W,H) (216 px at 720p), so a wider sample touches the gradient and
   reports false centre bleed. */
export const BAND_JS = String.raw`() => {
  const cv = document.getElementById('game'), g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const band = (x, y, w, h) => {
    const d = g.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    return { r: r / n, g: gg / n, b: b / n };
  };
  const m = Math.round(Math.min(W, H) * 0.055);
  return { edge: band(0, 0, W, m), right: band(W - m, H * .35, m, H * .3),
           left: band(0, H * .35, m, H * .3), centre: band(W / 2 - 80, H / 2 - 80, 160, 160) };
}`;

/* Dismiss a modal the way a player does: the level-up and relic cards are
   clickable DIVs and the shop advances with data-act="nextWave" — matching on
   <button> text misses both (the AGENTS.md a11y trap). */
export const DISMISS_JS = String.raw`() => {
  const vis = document.querySelector('.screen:not(.hidden)');
  const id = vis && vis.id;
  if (id === 'scLevel') { const c = document.querySelector('#lvlCards .lvlCard'); if (c) { c.click(); return 'lvl'; } }
  if (id === 'scRelic') { const c = document.querySelector('#relicCards .lvlCard'); if (c) { c.click(); return 'relic'; } }
  if (id === 'scShop') { const b = document.querySelector('#scShop [data-act="nextWave"]'); if (b) { b.click(); return 'shop'; } }
  return id || '';
}`;

/* Thresholds. Border lift is red-channel delta on the border band between a
   healthy frame and a 7 %-HP frame; centre lift must stay near zero (edge-only
   claim). critVisMin guards the 2026-10-29 false positive: a dead player has
   critWant = 0, so measuring without asserting `alive` reads a working effect
   as broken. */
export const THRESHOLDS = { "lufsMin": -16, "lufsMax": -14, "truePeakMaxDb": -1, "hudTextMinHeight": 8, "borderLiftMin": 5, "centreLiftMax": 4, "critVisMin": 0.3 };

/* Raw CDP Runtime.evaluate evaluates an EXPRESSION: a bare arrow function comes
   back as a function value and returnByValue then yields undefined (the first
   wiring of this module failed with "Cannot read properties of undefined").
   Playwright's page.evaluate, by contrast, CALLS the function. invoke() lets both
   share the same source: Node passes invoke(X), Python passes X itself. */
export const invoke = (src) => '(' + src + ')()';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Advance the engine by `frames` fixed steps, dismissing modals that open.
 * `ev` is any (expression, timeout) => Promise<value> evaluator — verify.mjs
 * passes its raw-CDP one.
 */
export async function advanceFrames(ev, frames, chunk = 30) {
  let done = 0;
  while (done < frames) {
    const n = Math.min(chunk, frames - done);
    await ev('(function(){ for (var i = 0; i < ' + n + '; i++) Game.update(1/60); return 1; })()', 20000);
    done += n;
    for (let k = 0; k < 6; k++) {
      if (!(await ev(invoke(DISMISS_JS), 15000))) break;
      await sleep(60);
    }
  }
}

async function waitFor(ev, expr, want, timeoutMs = 6000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await ev(expr, 15000);
    if (want(last)) return last;
    await sleep(stepMs);
  }
  return last;
}

/**
 * Measure the presentation contracts on a LIVE run.
 *
 * Returns raw numbers only — the caller decides PASS/FAIL against THRESHOLDS,
 * so both gates print their own verdicts from identical data.
 */
export async function measurePresentation(ev, opts = {}) {
  const out = { steps: [] };
  const step = (name, ok, detail) => { out.steps.push({ name, ok, detail }); return ok; };

  if (opts.beforeStart) await opts.beforeStart();

  // -- loudness: offline render through the real bus graph -------------------
  const conf = await ev('(async () => await AudioSys.audioConformance())()', 60000);
  out.lufs = conf && typeof conf.masterLufs === 'number' ? conf.masterLufs : null;
  out.peak = conf && typeof conf.peakDb === 'number' ? conf.peakDb : null;
  out.inWindow = !!(conf && conf.inWindow);
  out.message = (conf && conf.message) || '';
  step('audioConformance returned a verdict', out.lufs !== null && out.peak !== null,
    out.lufs === null ? 'no numeric result: ' + String(out.message).slice(0, 80) : out.lufs + ' LUFS / ' + out.peak + ' dBFS');

  // -- start a run through the real controls --------------------------------
  const click = (act) => ev('(function(){var e=document.querySelector(\'[data-act="' + act + '"]\'); if(!e) return "missing"; e.click(); return "ok";})()', 15000);
  await click('play');
  await waitFor(ev, 'UI.cur || ""', (v) => v === 'scChar');
  await click('charConfirm');
  await waitFor(ev, 'UI.cur || ""', (v) => v === 'scControls');
  await click('controlsOK');
  out.state = await waitFor(ev, 'Game.state || ""', (v) => v === 'play');
  step('run reaches state=play', out.state === 'play', 'state=' + out.state);

  // -- text layout: without a font stack every text node is 0 px tall -------
  out.hudHeight = await ev("(function(){var e=document.getElementById('hudWave'); return e ? e.getBoundingClientRect().height : -1;})()", 15000);
  step('HUD text lays out', out.hudHeight > THRESHOLDS.hudTextMinHeight, '#hudWave height=' + out.hudHeight);

  await ev('(function(){ Game.qaGod = true; return 1; })()', 15000);
  await advanceFrames(ev, 400);

  // -- arena fields keep their cached soft-edge gradient --------------------
  const f = await ev('(function(){var fs=Game.level.fields||[]; return fs.length ? {n:fs.length,cached:fs.every(function(x){return !!x._g;})} : {n:0,cached:null};})()', 15000);
  out.fields = f;
  step('arena fields use cached soft-edge gradient', !f || f.n === 0 || f.cached === true, JSON.stringify(f));

  // -- crit vignette on a LIVE player --------------------------------------
  await ev('(function(){ Game.enemies.length = 0; Game.spawnQueue.length = 0; var pl = Game.players[0]; pl.hp = pl.maxHp; for (var i=0;i<60;i++) Game.update(1/60); return 1; })()', 30000);
  await sleep(150);
  const healthy = await ev(invoke(BAND_JS), 15000);
  await ev('(function(){ var pl = Game.players[0]; for (var i=0;i<90;i++){ pl.hp = pl.maxHp * .07; Game.update(1/60); } return 1; })()', 30000);
  await sleep(150);
  const crit = await ev(invoke(BAND_JS), 15000);
  const st = await ev('(function(){var p=Game.players[0]; return {alive:!!p.alive, critVis:+(Game.critVis||0).toFixed(3), hp:Math.round(p.hp)};})()', 15000);

  out.alive = !!(st && st.alive);
  out.critVis = st ? st.critVis : 0;
  out.critHp = st ? st.hp : null;
  out.borderLift = Math.max(crit.edge.r - healthy.edge.r, crit.right.r - healthy.right.r);
  out.rightLift = crit.right.r - healthy.right.r;
  out.centreLift = Math.abs(crit.centre.r - healthy.centre.r);
  // A dead player cannot show the effect (critWant = 0) — that is not a pass.
  step('vignette measured on a live player', out.alive && out.critVis >= THRESHOLDS.critVisMin,
    'alive=' + out.alive + ', critVis=' + out.critVis + ', hp=' + out.critHp);
  step('crit vignette tints the border', out.borderLift >= THRESHOLDS.borderLiftMin, 'border lift ' + out.borderLift.toFixed(1) + ' red');
  step('crit vignette leaves the centre readable', out.centreLift <= THRESHOLDS.centreLiftMax, 'centre lift ' + out.centreLift.toFixed(1) + ' red');

  return out;
}
