#!/usr/bin/env node
// Throttle probe (balance-chunk pass): validate the "never blocks the main
// thread for more than one frame" claim of BalanceSim.computeChunked on a
// simulated low-end device — real headless Edge + CDP CPU throttling
// (Emulation.setCPUThrottlingRate, the same mechanism DevTools' performance
// panel uses), rates 4x and 6x.
//
// Measures, per rate, IN the page:
//   - calibration: a fixed busy loop at rate 1 vs rate R (proves the throttle
//     actually engaged; a no-op throttle fails the probe instead of silently
//     measuring an unthrottled page),
//   - chunked 10k: meta.slices, meta.maxSliceMs (worst single slice, wall time
//     as the page experiences it), parity vs sync compute(10000),
//   - a per-rAF gap tracker running the whole time: max gap + how many gaps
//     exceeded ~1 frame (17 ms), 2 frames (34 ms), 100 ms during the run,
//   - contrast: the same tracker around a forced SYNC 10k at the same rate.
//
// Node >= 21 (global WebSocket), no deps. Usage:
//   node tools/_throttle-sim-probe.mjs [baseUrl]
// Expects a served copy (default http://127.0.0.1:8080/index.html).
import { existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8080/index.html';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'devsim&cb=thr' + Date.now();
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!EDGE) { console.error('no Edge'); process.exit(1); }
const RATES = [4, 6]; // simulated CPU multipliers ("low-end" bracket)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let edgePort = 0, edgeProfile = '';
const ps = (script, timeout = 10000) => spawnSync('powershell', ['-NoProfile', '-Command', script], { timeout, encoding: 'utf8' });

const PASS = [], FAIL = [], NOTES = [];
const res = (name, ok, detail) => { (ok ? PASS : FAIL).push(name + (detail ? ' — ' + detail : '')); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' — ' + detail : '')); };
const note = (m) => { NOTES.push(m); console.log('NOTE  ' + m); };

function launchEdge() {
  return new Promise((resolve) => {
    edgePort = 9300 + Math.floor(Math.random() * 400);
    edgeProfile = path.join(os.tmpdir(), 'fbthr-edge-' + process.pid + '-' + Date.now());
    const pf = edgeProfile.replace(/\\/g, '/');
    // Anti-background-throttling family: keep rAF/timers at real cadence so the
    // ONLY slowdown is the simulated CPU, not tab-occlusion throttling.
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
function cdp(method, params = {}, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, timeoutMs);
  });
}
async function ev(expression, timeoutMs) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

// Busy loop, fixed iteration count, result parked in a global so V8 cannot
// elide it. ~60-150 ms at rate 1 on this box.
const CAL = "(function(){ var s = 0.123456; for (var i = 0; i < 24000000; i++) { s = s * 1.0000001 + 0.5; if (s > 1e12) s *= 0.001; } window.__calRes = s; return Math.round((performance.now() - window.__calT0) * 10) / 10; })()";

// Start a per-rAF gap tracker that records every inter-frame delta until told
// to stop; return { max, over17, over34, over100 } at stop time.
const GAP_ON = "(function(){ if (window.__gapRun) return 'already'; window.__gapRun = 1; window.__gaps = []; window.__gapLast = performance.now(); (function loop(){ if (!window.__gapRun) return; var n = performance.now(); window.__gaps.push(n - window.__gapLast); window.__gapLast = n; requestAnimationFrame(loop); })(); return 'on'; })()";
const GAP_OFF = "(function(){ window.__gapRun = 0; var g = window.__gaps || []; var max = 0, o17 = 0, o34 = 0, o100 = 0; for (var i = 0; i < g.length; i++) { if (g[i] > max) max = g[i]; if (g[i] > 17) o17++; if (g[i] > 34) o34++; if (g[i] > 100) o100++; } return JSON.stringify({ n: g.length, max: Math.round(max * 10) / 10, o17: o17, o34: o34, o100: o100 }); })()";

// Start the chunked 10k. NOTE: the parity sync compute must NOT run inside
// this promise — a sync 10k inside the .then() would sit in the rAF-gap
// window and fake a huge chunked stall. Parity is computed separately AFTER
// the gap window closes (see runSync below).
const CHUNK_START = "(function(){ window.__simRes = null; window.__chunkDps = null; BalanceSim.computeChunked(10000, function(){}).then(function(d){ window.__chunkDps = d.rows.map(function(r){ return String(r.dps); }).join(); window.__simRes = JSON.stringify({ iters: d.meta.iters, rows: d.rows.length, slices: d.meta.slices, chunked: d.meta.chunked, max: d.meta.maxSliceMs, ms: d.meta.ms }); }).catch(function(err){ window.__simRes = JSON.stringify({ err: String(err) }); }); return 'started'; })()";

// Sync contrast: one monolithic compute in its OWN gap window; also captures
// the dps join for the parity comparison against the chunked run.
const SYNC_GO = "(function(){ window.__syncDps = null; var s = BalanceSim.compute(10000); window.__syncDps = s.rows.map(function(r){ return String(r.dps); }).join(); return 'done'; })()";

async function runChunked(label) {
  await ev(GAP_ON);
  await ev('window.__gapRun = 1; window.__gaps = []; window.__gapLast = performance.now(); 1');
  const t0 = Date.now();
  await ev(CHUNK_START, 30000);
  let got = null;
  const dl = Date.now() + 60000;
  while (Date.now() < dl) {
    const v = await ev('window.__simRes', 20000);
    if (v) { try { got = JSON.parse(v); } catch { /* keep polling */ } if (got) break; }
    await sleep(300);
  }
  await sleep(500); // let the final yield land, then close the gap window
  const gap = JSON.parse(await ev(GAP_OFF));
  const wallS = Math.round((Date.now() - t0) / 100) / 10;
  return { got, gap, wallS };
}

// Sync 10k in its own gap window + dps capture; returns { syncGap, syncDps, wallMs }.
async function runSync() {
  await ev(GAP_ON);
  await ev('window.__gapRun = 1; window.__gaps = []; window.__gapLast = performance.now(); 1');
  const t0 = Date.now();
  await ev(SYNC_GO, 60000);
  await sleep(400);
  const g = JSON.parse(await ev(GAP_OFF));
  return { syncGap: g, wallMs: Date.now() - t0, syncDps: await ev('window.__syncDps') };
}

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
    await cdp('Page.navigate', { url: URL });
    await sleep(2500);
    for (let i = 0; i < 40; i++) { if (await ev("typeof BalanceSim === 'object' && typeof Game === 'object'")) break; await sleep(300); }
    res('engine up on ?devsim page', await ev("typeof BalanceSim === 'object'"), '');

    // ---- rate 1 baseline (no throttle): the numbers the gate already asserts ----
    const b1 = await runChunked('rate1');
    if (b1.got && !b1.got.err) {
      note('rate 1   chunked 10k: ' + b1.got.slices + ' slices, max slice ' + b1.got.max + ' ms, ' + b1.wallS + ' s wall');
      note('rate 1   rAF max gap during chunked: ' + b1.gap.max + ' ms (over 17 ms: ' + b1.gap.o17 + ', over 34: ' + b1.gap.o34 + ', over 100: ' + b1.gap.o100 + ' of ' + b1.gap.n + ')');
      res('rate 1   chunked completes with yields + bounded slices', b1.got.iters === 10000 && b1.got.rows > 0 && b1.got.chunked === true && b1.got.slices >= 2 && b1.got.max < 20, JSON.stringify(b1.got));
      // NOTE: headless rAF cadence here is ~20 ms (not 16.7), so a 'frame' is a
      // ~20 ms tick; <60 ms = within ~3 ticks. The contiguous-slice bound above
      // (<20 ms) is the design claim; this bounds end-to-end stall.
      res('rate 1   chunked stall within ~3 cadence ticks (max rAF gap ' + b1.gap.max + ' ms < 60)', b1.gap.max < 60, '');
      const s1 = await runSync();
      const parity1 = b1.got && s1.syncDps === (await ev('window.__chunkDps'));
      note('rate 1   SYNC 10k contrast: rAF max gap ' + s1.syncGap.max + ' ms, parity ' + parity1 + ' — at 1x both are ~2 cadence ticks, the real gap opens at 4x+');
    } else res('rate 1   chunked run', false, JSON.stringify(b1.got || b1).slice(0, 120));

    // rate-1 reference for calibration ratios
    const cal1 = await ev('window.__calT0 = performance.now(); ' + CAL, 30000);
    note('rate 1   calibration loop: ' + cal1 + ' ms');

    // ---- throttled rates ----
    for (const R of RATES) {
      await cdp('Emulation.setCPUThrottlingRate', { rate: R });
      await sleep(600); // let the scheduler pick the throttle up
      const calR = await ev('window.__calT0 = performance.now(); ' + CAL, 60000);
      const ratio = Math.round((calR / Math.max(1, cal1)) * 10) / 10;
      note('rate ' + R + '   calibration loop: ' + calR + ' ms (x' + ratio + ' vs rate 1)');
      const engaged = ratio >= 1.4;
      res('rate ' + R + '   CPU throttle engaged (cal ' + calR + ' ms, x' + ratio + ')', engaged, engaged ? '' : 'throttle looks like a no-op on this Edge build — cannot validate the claim here');

      const c = await runChunked('rate' + R);
      if (c.got && !c.got.err) {
        note('rate ' + R + '   chunked 10k: ' + c.got.slices + ' slices, max slice ' + c.got.max + ' ms (meta.ms ' + c.got.ms + '), ' + c.wallS + ' s wall');
        note('rate ' + R + '   rAF max gap during chunked: ' + c.gap.max + ' ms (over 17 ms: ' + c.gap.o17 + ', over 34: ' + c.gap.o34 + ', over 100: ' + c.gap.o100 + ' of ' + c.gap.n + ')');
        res('rate ' + R + '   chunked 10k yields under throttle (slices ' + c.got.slices + ' >= 3, parity deferred)', c.got.iters === 10000 && c.got.rows > 0 && c.got.chunked === true && c.got.slices >= 3, c.got.slices + ' slices');
        res('rate ' + R + '   worst slice bounded (' + c.got.max + ' ms < 120)', c.got.max < 120, '');
        res('rate ' + R + '   no repeated-freeze pattern (gaps >100 ms: ' + c.gap.o100 + ' <= 1)', c.gap.o100 <= 1, '');
        res('rate ' + R + '   chunked end-to-end stall within a few frames (max gap ' + c.gap.max + ' ms < 60)', c.gap.max < 60, '');

        // sync contrast at the SAME rate (own gap window) + parity vs chunked
        const s0 = Date.now();
        const s = await runSync();
        const parity = s.syncDps === (await ev('window.__chunkDps'));
        note('rate ' + R + '   SYNC 10k contrast: rAF max gap ' + s.syncGap.max + ' ms (over 100 ms: ' + s.syncGap.o100 + ' of ' + s.syncGap.n + '), ' + Math.round(s.wallMs / 100) / 10 + ' s wall, parity ' + parity);
        res('rate ' + R + '   chunked parity with sync compute (exact same dps rows)', parity === true, '');
        res('rate ' + R + '   chunked never stalls harder than sync (gap ' + c.gap.max + ' < sync ' + s.syncGap.max + ')', c.gap.max < s.syncGap.max, '');
      } else {
        res('rate ' + R + '   chunked run under throttle', false, JSON.stringify(c.got || {}).slice(0, 160));
      }
    }
    await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });

    if (pageErrors.length) note('page errors: ' + pageErrors.length + ' — ' + pageErrors.slice(0, 3).join(' | '));
    console.log('\nRESULT throttle-sim pass=' + PASS.length + ' fail=' + FAIL.length + ' errors=' + pageErrors.length);
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
