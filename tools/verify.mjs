#!/usr/bin/env node
//
// Wiesbaden Survivors — 30-second regression gate.
//
// What it does:
//   1. Static legs (always): index.html must NOT carry the git `assume-unchanged`
//      flag (CE_VALID), the session's documented change-set markers must still be
//      in the working file, and the removed SkinEditor cluster must stay gone.
//   2. Browser leg (default; skip with --no-browser): serves the workspace from
//      an in-process static server, binds ONE raw-CDP WebSocket to the headless
//      Edge page target (Node >= 22 global WebSocket) and drives every phase
//      through it: `?selftest` banner poll, 10.000-run BalanceSim, chunked leg,
//      second `?selftest&qa=1` pass, throttled 4x/6x leg. No agent-browser in
//      the gate: evals routed via the long-lived daemon flapped when stale
//      targets from killed Edge sessions lingered (verified 2026-09-04).
//   3. QA pass (browser leg): a second `?selftest&qa=1` load exercises the positive
//      branch of the QA-Nav selftest gate (row shown, all buttons ring members),
//      which a plain `?selftest` skips by design — so every verify also proves the
//      ?qa surface still works, not just that it stays hidden.
//   4. Throttle leg (browser leg): reuses the SAME headless Edge via raw CDP
//      (Emulation.setCPUThrottlingRate, 4x/6x — the mechanism DevTools uses) and
//      asserts the chunked 10k BalanceSim stays responsive on a simulated low-end
//      device: throttle engaged (calibration ratio), worst slice bounded by the
//      real contract (SLICE_MS budget + one tail work unit, NOT a strict frame),
//      and no rAF gap > 100 ms during the run (a repeated-freeze pattern would
//      fail; isolated GC/OS outliers are allowed and classified). Full
//      methodology + why the wall-time budget beats a CPU-work quota:
//      docs/throttled-gate-leg-2026-09-04.md and
//      docs/chunked-throttle-validation-2026-09-04.md.
//
// Exits 0 when everything passes, 1 on any failure — run it after every edit:
//
//     node tools/verify.mjs                # full gate (~10-20 s)
//     node tools/verify.mjs --no-browser   # static legs only (no Edge needed)
//
// Dependency-free (plain Node >= 22 — global WebSocket for raw CDP — plus the
// system Edge binary; no npm install, no agent-browser involvement).

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp } from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const SRC_PATH = path.resolve(ROOT, 'index.html');
const NO_BROWSER = process.argv.includes('--no-browser');
const VERBOSE = process.argv.includes('--verbose');

let failures = 0;
const fail = (name, detail) => { failures++; console.error('FAIL  ' + name + ' — ' + detail); };
const pass = (name) => { console.log('PASS  ' + name); };
const note = (msg) => { console.log('NOTE  ' + msg); };
const verbose = (msg) => { if (VERBOSE) console.log('dbg   ' + msg); };

// ---- change-set markers the session's documented work leaves behind ----
const MARKERS = [
  ['seed-purpose cue', 'id="seedHelp"'],
  ['devsim gate const', 'SIMS_ENABLED'],
  ['gated sim row markup', 'id="simRow"'],
  ['wave wording (completed)', 'Beste geschaffte Welle'],
  ['first-run objective line', 'Ziel: die 4 Gegner in Welle 1'],
  ['daily seed copy (fixed per date, AZ shown)', 'Tages-Seed · AZ '],
  ['skip-hint restyle', 'data-act="tutSkip"'],
  ['qa gate const', 'QA_ENABLED'],
  ['qa row markup', 'id="qaRow"'],
  ['qa godmode guard', 'Game.qaGod) return;'],
  ['qa mods readout toggle', 'qaModsView'],
  ['qa save snapshot/restore', 'data-act="qaSnap"'],
  ['qa mods readout hud element', 'id="qaModsReadout"'],
  ['qa nav-gate selftest', '_qaNavGate()'],
  ['generic gated-row contract helpers', '_gatedRowHidden('],
  ['surface-contracts selftest', '_surfaceContracts()'],
  ['controls seed-copy selftest', '_controlsSeedCopy()'],
  ['balance-parity async selftest', '_balanceParity()'],
  ['sim cancel path (chunked)', 'cancelChunked()'],
  ['seed reroll hidden on daily runs', 'Tages-Run: Seed ist fix'],
  ['code panel id for surface contract', 'id="codePanel"'],
  ['codex content excluded from nav ring', 'data-navskip'],
  ['codex nav-gate selftest', '_codexNavGate()'],
  ['nav membership derived from visibility', 'Sichtbarkeitsfilter'],
  ['data.js extraction markers', 'extrahiert nach data.js'],
  ['data.js include before engine', '<script src="data.js">'],
  ['slice-budget honest contract comment', 'Wandzeit skaliert mit der CPU-Geschwindigkeit'],
  ['context-scoped native Tab + ring sync', 'Tab ist NUR im Coop-Shop ein Gameplay-Binding']
];
const FORBIDDEN = [
  ['removed SkinEditor cluster', 'const SkinEditor'],
  ['data tables back inline in index.html', 'const CHARS = ['],
  ['Data registry back inline in index.html', 'const Data = {'],
  ['BOSSES back inline in index.html', 'const BOSSES = ['],
  ['ITEMS back inline in index.html', 'const ITEMS = ['],
  ['DANGERS back inline in index.html', 'const DANGERS = ['],
  ['MODS back inline in index.html', 'const MODS = [']
];

// ============================ static legs ============================

{
  const r = spawnSync('git', ['ls-files', '-v', 'index.html'], { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    fail('git flag state', 'git ls-files failed (' + (r.error ? r.error.message : 'status ' + r.status) + ') — cannot verify');
  } else {
    const line = (r.stdout || '').trim();
    if (/^h\s/.test(line)) fail('git flag state', 'index.html is assume-unchanged (CE_VALID) — edits are hidden from git again. Fix: git update-index --no-assume-unchanged index.html');
    else if (/^H\s/.test(line)) pass('git flag state (index.html not CE_VALID)');
    else fail('git flag state', 'unexpected ls-files output: ' + JSON.stringify(line));
  }
}

let src = null;
try { src = readFileSync(SRC_PATH, 'utf8'); } catch (e) { fail('source readable', String(e.message)); }
if (src !== null) {
  for (const [label, marker] of MARKERS) {
    if (src.includes(marker)) pass('change-set marker: ' + label);
    else fail('change-set marker: ' + label, 'missing "' + marker + '" — index.html looks reverted/clobbered');
  }
  for (const [label, marker] of FORBIDDEN) {
    if (src.includes(marker)) fail('forbidden regression: ' + label, '"' + marker + '" found again');
    else pass('forbidden regression absent: ' + label);
  }
}

// ---- gate self-marker: this file's own throttle leg must not silently vanish ----
try {
  const vsrc = readFileSync(path.join(ROOT, 'tools', 'verify.mjs'), 'utf8');
  if (vsrc.includes('Emulation.setCPUThrottlingRate')) pass('gate self-marker: throttled 4x/6x leg present in verify.mjs');
  else fail('gate self-marker: throttled leg', 'verify.mjs no longer contains the CPU-throttle leg — the gate itself was reverted?');
} catch (e) { fail('gate self-marker', String(e.message)); }

// ---- data.js split leg (extraction pass) ----
try {
  const djs = readFileSync(path.join(ROOT, 'data.js'), 'utf8');
  for (const decl of ['const CHARS = [', 'const WEAPONS = [', 'const ENEMIES = [', 'const ARENAS = [', 'const ACHIEVEMENTS = [', 'const Data = {', 'const BOSSES = [', 'const ITEMS = [', 'const DANGERS = [', 'const MODS = [', 'const ITEM_BY_ID = Data.register']) {
    const c = (djs.match(new RegExp(decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (c === 1) pass('data.js declares ' + decl.replace(' = [', '') + ' once');
    else fail('data.js declares ' + decl.replace(' = [', ''), 'expected 1 occurrence of "' + decl + '", got ' + c);
  }
  if (djs.includes('module.exports')) pass('data.js dual-mode export present');
  else fail('data.js dual-mode export', 'module.exports guard missing — BalanceSim/Node require would break');
  if (djs.includes('Schließe Welle 5 ab.')) pass('change-set marker in data.js: achievement wording');
  else fail('change-set marker in data.js: achievement wording', 'missing "Schließe Welle 5 ab." — data.js looks reverted/clobbered');
  if (djs.includes('const BOSSES = [') && djs.includes('const DANGERS = [') && djs.includes('const MODS = [') && djs.includes('const ITEMS = [')) pass('change-set marker in data.js: bosses/items/dangers/mods extracted');
  else fail('change-set marker in data.js: bosses/items/dangers/mods extracted', 'one of the four tables missing from data.js — extraction regressed');
  if (src.includes('<script src="data.js">')) pass('data.js loads before engine script');
} catch (e) {
  fail('data.js exists', String(e.message));
}

// ============================ browser leg ============================

let server = null;     // { port, url, close } from the shared static server
let edge = null;       // { ok, port, profile, kill } from the shared Edge launcher

async function browserLeg() {
  if (NO_BROWSER) { note('browser leg skipped (--no-browser)'); return; }
  if (!EDGE_PATH) { fail('browser', 'Edge binary not found — install Edge or use --no-browser'); return; }

  const t0 = Date.now();
  const ts = () => Math.round((Date.now() - t0) / 100) / 10 + 's';
  killScratchEdges(['fbverify-edge-', 'abverify']);
  verbose('scratch Edges cleaned (+' + ts() + ')');
  server = await startStaticServer(ROOT);
  const site = server.url;
  note('static server on ' + site + ' (+' + ts() + ')');

  edge = await launchEdge({ profilePrefix: 'fbverify-edge-' });
  if (!edge.ok) { fail('browser', 'headless Edge did not start on CDP port ' + edge.port); server.close(); return; }
  note('headless Edge up on CDP port ' + edge.port + ' (' + path.basename(EDGE_PATH) + ') (+' + ts() + ')');

  // One raw-CDP WebSocket bound to the exact page target drives EVERY leg below
  // (daemon-routed evals flapped when stale targets from killed Edge sessions
  // lingered — a direct WebSocket is deterministic and dependency-free).
  let conn = null;
  try { conn = await connectPageCdp(edge.port); }
  catch (e) { fail('browser', e.message); server.close(); edge.kill(); return; }
  const { cdp, ev, evalResult } = conn;
  const nav = async (url) => {
    await cdp('Page.navigate', { url }, 15000);
    verbose('navigated ' + url.slice(site.length) + ' (+' + ts() + ')');
  };

  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    verbose('CDP bound to page target (+' + ts() + ')');
    await nav(site + '/index.html?selftest&cb=verify' + Date.now());

    // poll for the SELFTEST banner (assertion list renders, then the result)
    // banner asserts pass==total (all green) with a floor so removed assertions cannot silently shrink the suite
    const probeScript = "JSON.stringify({href:location.href,body:!!document.body,len:document.body?document.body.innerText.length:0,has:document.body?document.body.innerText.indexOf('SELFTEST')>=0:false,tot:(document.body?(document.body.innerText.match(/SELFTEST (\\d+)\\/(\\d+)/)||[]):[]),banner:(document.body?((m)=>{m=document.body.innerText.match(/SELFTEST (\\d+)\\/(\\d+)/);return !!m&&m[1]===m[2]&&parseInt(m[1],10)>=100})(document.body.innerText):false)})";
    const deadline = Date.now() + 25000;
    let banner = false, lastErr = '';
    while (Date.now() < deadline) {
      const e = await evalResult(probeScript, 15000);
      if (e.ok) {
        try {
          const s = JSON.parse(e.value);
          verbose('poll ' + JSON.stringify(s));
          banner = s.banner === true;
          if (banner) break;
        } catch { banner = false; }
      } else lastErr = e.err;
      await new Promise(res => setTimeout(res, 600));
    }
    if (!banner) {
      const last = await evalResult(probeScript, 15000);
      verbose('final probe: ' + JSON.stringify(last));
      const bf = await evalResult("(typeof SelfTest === 'object' && SelfTest.results ? JSON.stringify(SelfTest.results.filter(function(r){ return !r.ok; }).map(function(r){ return r.name; })) : 'none')", 15000);
      if (bf.ok && bf.value && bf.value !== 'none') verbose('failing assertions: ' + bf.value);
    }
    if (banner) pass('?selftest banner (all green, >= 100) in ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
    else fail('?selftest banner', 'never saw SELFTEST n/n · PASS (all green, n >= 100) in 25s' + (lastErr ? ' — ' + lastErr : ''));

    if (banner) {
      const e = await evalResult("(function(){var d=BalanceSim.compute(10000);return JSON.stringify({iters:d.meta.iters,ms:d.meta.ms,weapons:d.rows.length});})()", 30000);
      if (e.ok) {
        try {
          const s = JSON.parse(e.value);
          if (s.iters === 10000 && s.weapons > 0 && s.ms < 3000) pass('BalanceSim 10.000-run compute (' + s.ms + ' ms, ' + s.weapons + ' weapons)');
          else fail('BalanceSim 10k', 'unexpected result: ' + JSON.stringify(s));
        } catch { fail('BalanceSim 10k', 'unparsable sim result: ' + String(e.value).slice(0, 120)); }
      } else fail('BalanceSim 10k', e.err);
    }

    // Chunked leg: the 10k Voll-Simulation must run in bounded time slices that
    // yield (SLICE_MS budget), never blocking long, and return exactly the sync
    // numbers (isolated per-weapon/per-char seeds make slicing order-independent).
    {
      const start = "(function(){ window.__simRes = null; BalanceSim.computeChunked(10000, function(p){ window.__simProg = p; }).then(function(d){ var s = BalanceSim.compute(10000); window.__simRes = JSON.stringify({ iters: d.meta.iters, rows: d.rows.length, slices: d.meta.slices, max: d.meta.maxSliceMs, ms: d.meta.ms, same: s.rows.map(function(r){ return String(r.dps); }).join() === d.rows.map(function(r){ return String(r.dps); }).join(), progEnd: window.__simProg }); }).catch(function(err){ window.__simRes = JSON.stringify({ err: String(err) }); }); return 'started'; })()";
      const e0 = await evalResult(start, 20000);
      if (e0.ok && (e0.value || '') === 'started') {
        const probe = "JSON.stringify({ res: window.__simRes, prog: window.__simProg })";
        const dl = Date.now() + 30000;
        let got = null;
        while (Date.now() < dl) {
          const ep = await evalResult(probe, 15000);
          if (ep.ok) { try { const o = JSON.parse(ep.value); if (o.res) { got = JSON.parse(o.res); break; } } catch { /* keep polling */ } }
          await new Promise(r => setTimeout(r, 600));
        }
        if (got) {
          if (got.err) fail('BalanceSim chunked', got.err);
          else if (got.iters === 10000 && got.rows > 0 && got.same === true && got.slices >= 2 && got.max < 120)
            pass('BalanceSim chunked 10k yields (' + got.slices + ' slices, max slice ' + got.max + ' ms, parity OK, progress end ' + Math.round((got.progEnd || 0) * 100) + '%)');
          else fail('BalanceSim chunked', 'unexpected: ' + JSON.stringify(got));
        } else fail('BalanceSim chunked', 'never completed in 30 s (timer throttling?)');
      } else fail('BalanceSim chunked', 'could not start: ' + (e0.ok ? e0.value : e0.err));
    }

    // Second selftest pass under ?qa=1: the positive QA-Nav branch (row shown,
    // all buttons ring members) only runs when QA_ENABLED, so a plain ?selftest
    // never exercises it. Navigate the same Edge to ?selftest&qa=1, re-activate
    // our tab (drift guard), and prove the branch switched: banner all green,
    // exactly one 'QA-Nav: unter ?qa' assertion that passed, zero plain-load
    // QA-Nav assertions, all results ok.
    {
      const qaUrl = site + '/index.html?selftest&qa=1&cb=verifyqa' + Date.now();
      await nav(qaUrl);
        const qaProbeScript = "JSON.stringify({banner:(document.body?((m)=>{m=document.body.innerText.match(/SELFTEST (\\d+)\\/(\\d+)/);return !!m&&m[1]===m[2]&&parseInt(m[1],10)>=100})(document.body.innerText):false),res:(typeof SelfTest==='object'&&SelfTest.results?JSON.stringify({pos:SelfTest.results.filter(r=>r.name.indexOf('QA-Nav: unter ?qa')===0).map(r=>r.ok),plain:SelfTest.results.filter(r=>r.name.indexOf('QA-Nav: qaRow ist bei Plain-Load')===0).length,all:SelfTest.results.every(r=>r.ok),total:SelfTest.results.length}):null)})";
        const dl = Date.now() + 25000;
        let qaBanner = false, qaProof = null, qaErr = '';
        while (Date.now() < dl) {
          const e = await evalResult(qaProbeScript, 15000);
          if (e.ok) {
            try {
              const s = JSON.parse(e.value);
              verbose('qa poll ' + JSON.stringify(s));
              qaBanner = s.banner === true;
              qaProof = s.res ? JSON.parse(s.res) : null;
              if (qaBanner && qaProof && qaProof.pos.length === 1 && qaProof.pos[0] === true && qaProof.plain === 0 && qaProof.all === true) break;
            } catch { /* keep polling */ }
          } else qaErr = e.err;
          await new Promise(res => setTimeout(res, 600));
        }
        if (qaBanner && qaProof && qaProof.pos.length === 1 && qaProof.pos[0] === true && qaProof.plain === 0 && qaProof.all === true)
          pass('?selftest&qa=1 pass: QA-Nav positive branch green (' + qaProof.total + '/' + qaProof.total + ', row shown, all buttons ring members) in ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
        else fail('?qa selftest pass', 'positive QA-Nav branch not proven: banner=' + qaBanner + ' proof=' + JSON.stringify(qaProof) + (qaErr ? ' — ' + qaErr : ''));
    }

    // ---- throttled 4x/6x chunked-sim leg ----
    // Same Edge, raw CDP (Node >= 22 global WebSocket): Emulation.setCPUThrottlingRate
    // is the DevTools performance-panel mechanism. Assertions mirror the validated
    // standalone probe (tools/_throttle-sim-probe.mjs, docs/chunked-throttle-
    // validation-2026-09-04.md): throttle ENGAGED (calibration ratio), chunked 10k
    // completes, worst slice inside the real contract (SLICE_MS budget + one tail
    // work unit — NOT a strict frame; a CPU-work quota would scale slice WALL time
    // up on slow devices, the opposite of the goal), and no rAF gap > 100 ms during
    // the run (a repeated-freeze pattern would fail).
    {
      try {
        // Same bound connection as every other leg; the ?devsim copy keeps the
        // selftest machinery off and the console quiet.
        await nav(site + '/index.html?devsim&cb=thr' + Date.now());
        await new Promise(res2 => setTimeout(res2, 2000));
        for (let i = 0; i < 40; i++) { if (await ev("typeof BalanceSim === 'object' && typeof Game === 'object'", 10000)) break; await new Promise(res2 => setTimeout(res2, 300)); }
        if (!(await ev("typeof BalanceSim === 'object'", 10000))) throw new Error('engine did not boot on ?devsim');

        // Gap tracker: self-resetting start (a separate reset line before GAP_ON
        // would trip the 'already' guard and silently record nothing — verified
        // defect of the first wiring, caught because '0 frames' is impossible).
        // The setTimeout(0) ticker is the cause discriminator: a rAF gap whose
        // setTimeout twin is equally long is a main-thread stall (GC/OS); if
        // setTimeout stays live, the frame source skipped while the thread ran.
        const GAP_ON = "(function(){ window.__gapRun = 0; window.__gaps = []; window.__gapLast = performance.now(); window.__sgaps = []; window.__sgapLast = performance.now(); window.__gapRun = 1; (function loop(){ if (!window.__gapRun) return; var n = performance.now(); window.__gaps.push(n - window.__gapLast); window.__gapLast = n; requestAnimationFrame(loop); })(); (function sloop(){ if (!window.__gapRun) return; var n = performance.now(); window.__sgaps.push(n - window.__sgapLast); window.__sgapLast = n; setTimeout(sloop, 0); })(); return 'on'; })()";
        const GAP_OFF = "(function(){ window.__gapRun = 0; function stats(a){ var max = 0, o100 = 0; for (var i = 0; i < a.length; i++) { if (a[i] > max) max = a[i]; if (a[i] > 100) o100++; } return { n: a.length, max: Math.round(max * 10) / 10, o100: o100, top3: a.slice().sort(function(x,y){ return y - x; }).slice(0, 3).map(function(v){ return Math.round(v * 10) / 10; }).join('/') }; } return JSON.stringify({ raf: stats(window.__gaps || []), st: stats(window.__sgaps || []) }); })()";
        const CAL = "(function(){ var s = 0.123456; for (var i = 0; i < 24000000; i++) { s = s * 1.0000001 + 0.5; if (s > 1e12) s *= 0.001; } return Math.round((performance.now() - window.__calT0) * 10) / 10; })()";
        const CHUNK_START = "(function(){ window.__simRes = null; window.__chunkDps = null; BalanceSim.computeChunked(10000, function(){}).then(function(d){ window.__chunkDps = d.rows.map(function(r){ return String(r.dps); }).join(); window.__simRes = JSON.stringify({ iters: d.meta.iters, rows: d.rows.length, slices: d.meta.slices, chunked: d.meta.chunked, max: d.meta.maxSliceMs }); }).catch(function(err){ window.__simRes = JSON.stringify({ err: String(err) }); }); return 'started'; })()";

        const runChunked = async () => {
          await ev(GAP_ON);
          const t0 = Date.now();
          await ev(CHUNK_START, 30000);
          let got = null;
          const dl = Date.now() + 60000;
          while (Date.now() < dl) {
            const v = await ev('window.__simRes', 20000);
            if (v) { try { got = JSON.parse(v); } catch { /* keep polling */ } if (got) break; }
            await new Promise(res2 => setTimeout(res2, 300));
          }
          await new Promise(res2 => setTimeout(res2, 500));
          const gap = JSON.parse(await ev(GAP_OFF));
          return { got, gap, wallS: Math.round((Date.now() - t0) / 100) / 10 };
        };

        // rate-1 baseline chunked run: gates the same bound the unthrottled leg asserts
        const b1 = await runChunked();
        if (b1.got && !b1.got.err) {
          if (b1.got.iters === 10000 && b1.got.rows > 0 && b1.got.chunked === true && b1.got.slices >= 2 && b1.got.max < 120)
            pass('throttle rate 1: chunked 10k baseline (' + b1.got.slices + ' slices, max ' + b1.got.max + ' ms, ' + b1.wallS + ' s wall)');
          else fail('throttle rate 1 baseline', 'unexpected: ' + JSON.stringify(b1.got));
          if (b1.gap.raf.n >= 10 && b1.gap.raf.max < 300 && b1.gap.raf.o100 < 5) pass('throttle rate 1: tracker sane, frames flowing (' + b1.gap.raf.n + ' frames, max ' + b1.gap.raf.max + ' ms, setTimeout max ' + b1.gap.st.max + ' ms)');
          else fail('throttle rate 1 stall', 'raf ' + b1.gap.raf.n + ' frames, max ' + b1.gap.raf.max + ' ms, >100 ms: ' + b1.gap.raf.o100 + ' (setTimeout max ' + b1.gap.st.max + ' ms)');
        } else fail('throttle rate 1 baseline', JSON.stringify(b1.got || b1).slice(0, 140));
        const cal1 = await ev('window.__calT0 = performance.now(); ' + CAL, 30000);

        for (const R of [4, 6]) {
          await cdp('Emulation.setCPUThrottlingRate', { rate: R });
          await new Promise(res2 => setTimeout(res2, 600));
          const calR = await ev('window.__calT0 = performance.now(); ' + CAL, 60000);
          const ratio = Math.round((calR / Math.max(1, cal1)) * 10) / 10;
          const engaged = ratio >= 1.4;
          if (engaged) pass('throttle ' + R + 'x engaged (calibration x' + ratio + ')');
          else fail('throttle ' + R + 'x engaged', 'calibration ratio ' + ratio + ' < 1.4 — throttle is a no-op on this Edge build; cannot validate here');

          const c = await runChunked();
          if (c.got && !c.got.err) {
            if (c.got.iters === 10000 && c.got.rows > 0 && c.got.chunked === true && c.got.slices >= 3)
              pass('throttle ' + R + 'x: chunked 10k completes (' + c.got.slices + ' slices, max slice ' + c.got.max + ' ms, ' + c.wallS + ' s wall)');
            else fail('throttle ' + R + 'x chunked', 'unexpected: ' + JSON.stringify(c.got));
            // Real contract: budget (10 ms) + one indivisible tail work unit. The
            // tail's wall cost scales with the CPU rate; measured worst at 6x was
            // ~21 ms, so 60 ms is a generous but still-meaningful bound.
            if (c.got.max < 60) pass('throttle ' + R + 'x: worst slice ' + c.got.max + ' ms < 60 (budget + tail unit)');
            else fail('throttle ' + R + 'x worst slice', c.got.max + ' ms >= 60 — budget + tail contract violated');
            // Responsiveness contract (population-calibrated on this box: pairs
            // of ~120-143 ms GC/OS outliers appear in ~2/5 runs): fail only on a
            // SUSTAINED freeze (>= 300 ms single gap = frozen page, or >= 5 long
            // gaps = chronic stutter). The sim's own blocking is guarded
            // deterministically above by maxSliceMs < 60 + slices >= 3 — a
            // non-yielding sim is one giant slice and fails THERE, not here.
            const cause = c.gap.raf.o100 === 0 ? 'no outlier'
              : (c.gap.st.max >= c.gap.raf.max * 0.6
                ? 'isolated main-thread stall(s) (GC/OS — setTimeout co-stalled ' + c.gap.st.max + ' ms)'
                : 'frame-source stall(s) (main thread live, setTimeout ' + c.gap.st.max + ' ms)');
            if (c.gap.raf.max < 300 && c.gap.raf.o100 < 5) pass('throttle ' + R + 'x: frames kept flowing during chunked run (raf max ' + c.gap.raf.max + ' ms, >100 ms: ' + c.gap.raf.o100 + '/' + c.gap.raf.n + ' — ' + cause + ')');
            else fail('throttle ' + R + 'x freeze', 'raf max ' + c.gap.raf.max + ' ms, >100 ms gaps: ' + c.gap.raf.o100 + ' (top rAF ' + c.gap.raf.top3 + ' ms; setTimeout max ' + c.gap.st.max + ' ms, top ' + c.gap.st.top3 + ' — ' + cause + ')');
            // Parity: chunked must equal the sync compute exactly.
            const sp = await ev("(function(){ var s = BalanceSim.compute(10000); return s.rows.map(function(r){ return String(r.dps); }).join() === window.__chunkDps; })()", 60000);
            if (sp === true) pass('throttle ' + R + 'x: chunked parity with sync compute');
            else fail('throttle ' + R + 'x parity', 'chunked dps rows differ from sync compute');
          } else fail('throttle ' + R + 'x chunked', JSON.stringify(c.got || {}).slice(0, 140));
        }
        await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
      } catch (e) {
        fail('throttle leg', String(e && e.message ? e.message : e));
      }
    }
  } catch (e) {
    fail('browser leg', String(e && e.message ? e.message : e));
  } finally {
    if (conn) conn.close();
    if (edge) edge.kill();
    if (server) { try { server.close(); } catch { /* ignore */ } }
  }
  note('browser leg wall time: ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
}

await browserLeg();

console.log(failures === 0 ? '\nVERIFY OK' : '\nVERIFY FAILED (' + failures + ' check' + (failures === 1 ? '' : 's') + ')');
process.exit(failures === 0 ? 0 : 1);
