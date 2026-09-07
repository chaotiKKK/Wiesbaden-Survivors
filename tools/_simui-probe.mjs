#!/usr/bin/env node
// Probe (balance-chunk pass): drive the real user path of the 10k Voll-Simulation
// on a served ?devsim copy — codex open, real click on the button, progress text,
// rendered report, and live rAF-gap evidence that no slice blocks a full frame.
// Contrast: a forced SYNC 10k on this box blocks ~50 ms, so a >1-frame block
// would show up in the same gap tracker.
import { readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE_DIR = path.dirname(fileURLToPath(new URL(import.meta.url)));
const ROOT = path.resolve(HERE_DIR, '..');
const BASE = process.argv[2] || 'http://127.0.0.1:8080/index.html?devsim&cb=simui' + Date.now();
const MSEDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const EDGE_PATH = MSEDGE_CANDIDATES.find(p => existsSync(p));
if (!EDGE_PATH) { console.error('FAIL no Edge binary'); process.exit(1); }

function resolveAgentBrowser() {
  const npmDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '';
  const pkgBin = path.join(npmDir, 'node_modules', 'agent-browser', 'bin');
  try {
    const exe = readdirSync(pkgBin).find(f => /^agent-browser-win32-.*\.exe$/.test(f));
    if (exe) return path.join(pkgBin, exe);
  } catch { /* fall through */ }
  return 'agent-browser.cmd';
}
const AB_BIN = resolveAgentBrowser();
let edgePort = 0, edgeProfile = '';
const sh = (cmd, args, opts) => { const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', timeout: 20000 }, opts || {})); return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }; };
const shAsync = (cmd, args, timeoutMs) => new Promise((resolve) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '', err = '', done = false;
  const timer = setTimeout(() => { if (!done) { done = true; child.kill(); resolve({ timedOut: true, code: null, stdout: out, stderr: err }); } }, timeoutMs || 30000);
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; });
  child.on('close', (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ timedOut: false, code, stdout: out, stderr: err }); });
  child.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); resolve({ timedOut: false, code: null, stdout: out, stderr: String(e.message) }); });
});
const ps = (script, opts) => sh('powershell', ['-NoProfile', '-Command', script], opts);
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

function launchEdge() {
  return new Promise((resolve) => {
    freePort().then((port) => {
      edgePort = port;
      edgeProfile = path.join(os.tmpdir(), 'fbsim-edge-' + process.pid + '-' + Date.now());
      const profileFwd = edgeProfile.replace(/\\/g, '/');
      const r = ps("Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH +
        "' -ArgumentList '--headless=new --remote-debugging-port=" + port +
        ' --user-data-dir=' + profileFwd +
        " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding about:blank'");
      if (r.code !== 0) { resolve(false); return; }
      const deadline = Date.now() + 15000;
      const probe = () => {
        if (Date.now() > deadline) { resolve(false); return; }
        const rr = ps('try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:' + port + '/json/version).StatusCode } catch { 0 }', { timeout: 5000 });
        if ((rr.stdout || '').trim().startsWith('200')) resolve(true);
        else setTimeout(probe, 500);
      };
      probe();
    });
  });
}
function killEdgeByProfile() {
  if (!edgeProfile) return;
  const pat = edgeProfile.replace(/\\/g, '/');
  ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + pat + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
  setTimeout(() => { try { rmSync(edgeProfile, { recursive: true, force: true }); } catch { /* ignore */ } }, 800);
}
function killAllScratchEdges() {
  ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*fbsim-edge-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
  try { for (const f of readdirSync(os.tmpdir())) if (f.indexOf('fbsim-edge-') === 0) rmSync(path.join(os.tmpdir(), f), { recursive: true, force: true }); } catch { /* ignore */ }
}
try { const w = spawn(AB_BIN, ['--version'], { detached: true, stdio: 'ignore', windowsHide: true }); w.unref(); } catch { /* ignore */ }

const main = async () => {
  killAllScratchEdges();
  await sleep(2000);
  const up = await launchEdge();
  if (!up) { console.error('FAIL headless Edge did not start'); process.exit(1); }
  const ab = (args, t) => shAsync(AB_BIN, args, t || 30000);
  const evalResult = async (script, t) => {
    const r = await ab(['eval', '--json', script], t);
    if (r.timedOut) return { err: 'eval timed out' };
    try {
      const j = JSON.parse(r.stdout);
      if (!j.success) return { err: 'page error: ' + (j.error || 'unknown') };
      return { ok: true, value: j.data && j.data.result };
    } catch (e) { return { err: 'bad output: ' + String(r.stdout || r.stderr).slice(0, 160) }; }
  };
  let failures = 0;
  const res = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' — ' + detail : '')); if (!ok) failures++; };
  const note = (m) => console.log('NOTE  ' + m);

  try {
    let r = await ab(['connect', String(edgePort)]);
    if (r.timedOut || r.code !== 0) { await sleep(1500); r = await ab(['connect', String(edgePort)]); }
    if (r.timedOut || r.code !== 0) { console.error('FAIL connect: ' + (r.stderr || r.stdout || '').slice(0, 160)); process.exit(1); }
    r = await ab(['open', BASE]);
    if (r.timedOut || r.code !== 0) { await sleep(1200); r = await ab(['open', BASE]); }
    if (r.timedOut || r.code !== 0) { console.error('FAIL open: ' + (r.stderr || r.stdout || '').slice(0, 200)); process.exit(1); }
    try {
      const tl = await ab(['tab', 'list']);
      const line = (tl.stdout || '').split('\n').find(l => l.indexOf('devsim') >= 0);
      const m = line && line.match(/\[(t\d+)\]/);
      if (m) await ab(['tab', m[1]]);
    } catch { /* best effort */ }
    await sleep(1200); // settle
    // drift guard: only trust evals once OUR page is active AND the engine is up
    // (fresh profiles drift to edge://sync-…; evals there answer 'UI is not defined')
    let onTarget = false;
    const dlg = Date.now() + 12000;
    while (Date.now() < dlg && !onTarget) {
      const hr = await evalResult("(function(){ return JSON.stringify({ href: location.href.slice(0, 80), ui: typeof UI, bs: typeof BalanceSim }); })()", 10000);
      if (hr.ok) {
        try { const s = JSON.parse(hr.value); onTarget = s.href.indexOf('index.html') >= 0 && s.ui === 'object' && s.bs === 'object'; } catch { /* keep polling */ }
      }
      if (!onTarget) {
        try { const tl = await ab(['tab', 'list']); const line = (tl.stdout || '').split('\n').find(l => l.indexOf('index.html') >= 0); const m = line && line.match(/\[(t\d+)\]/); if (m) await ab(['tab', m[1]]); } catch { /* best effort */ }
        await sleep(300);
      }
    }
    if (!onTarget) { console.error('FAIL page never became the active, engine-ready tab (drift)'); process.exit(1); }

    // raw CDP to the page target: renderer-wide CPU throttle (4x) widens the
    // mid-run window for the cancel leg deterministically (10k finishes in
    // ~150 ms here; CDP round-trips alone cannot click inside that).
    let wsCdp = null, wsPending = new Map(), wsId = 0;
    const cdpSend = (method, params) => new Promise((resolve, reject) => {
      if (!wsCdp) { reject(new Error('no ws')); return; }
      const id = ++wsId;
      wsPending.set(id, { resolve, reject });
      wsCdp.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (wsPending.has(id)) { wsPending.delete(id); reject(new Error('cdp timeout ' + method)); } }, 15000);
    });
    const throttle = async (rate) => {
      try {
        if (!wsCdp) {
          const list = JSON.parse(await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text());
          const target = list.find(t => t.type === 'page' && t.url && t.url.indexOf('index.html') >= 0);
          if (!target) throw new Error('no page target');
          wsCdp = new WebSocket(target.webSocketDebuggerUrl);
          await new Promise((r, j) => { wsCdp.onopen = r; wsCdp.onerror = j; });
          wsCdp.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wsPending.has(d.id)) { const p = wsPending.get(d.id); wsPending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); } };
        }
        await cdpSend('Emulation.setCPUThrottlingRate', { rate });
        return true;
      } catch (e) { note('throttle unavailable (' + e.message + ') — cancel leg runs unthrottled'); return false; }
    };

    // open codex (canonical selftest sequence) + start the rAF-gap tracker
    const op = await evalResult('(function(){ window.__gap = { max: 0, last: 0 }; (function loop(){ var n = performance.now(); if (window.__gap.last) { var d = n - window.__gap.last; if (d > window.__gap.max) window.__gap.max = d; } window.__gap.last = n; requestAnimationFrame(loop); })(); UI.renderCodex(); UI.show("scCodex"); UI.refreshNav(); return JSON.stringify({ sims: SIMS_ENABLED, rowVisible: !document.getElementById("simRow").classList.contains("hidden"), btnNav: document.querySelector("#simRow button[data-val=\\"10000\\"]").classList.contains("nav"), cur: UI.cur, ring: UI.navEls.length }); })()', 15000);
    if (op.ok) {
      const p = JSON.parse(op.value);
      res('devsim active, sim row + Voll button visible & navigable in codex', p.sims === true && p.rowVisible && p.btnNav === true && p.cur === 'scCodex', JSON.stringify(p));
    } else res('devsim precondition', false, op.err);
    await sleep(800);

    const t0 = Date.now();
    const clicked = await evalResult('(function(){ var b = document.querySelector("#simRow button[data-val=\\"10000\\"]"); window.__btnText0 = b.textContent; b.click(); return "clicked"; })()', 15000);
    res('Voll-Simulation button clicked (real handler path)', clicked.ok && clicked.value === 'clicked', '');

    // poll: button must show live progress text, then return to its original text
    // with the report rendered (all compared inside the page)
    let sawProgress = false, finished = false, outLen = 0;
    const dl = Date.now() + 20000;
    while (Date.now() < dl) {
      const st = await evalResult('(function(){ var b = document.querySelector("#simRow button[data-val=\\"10000\\"]"); var o = document.getElementById("simOut"); var txt = b.textContent; return JSON.stringify({ txt: txt, busy: BalanceSim._busy, done: !BalanceSim._busy && txt === window.__btnText0 && !o.classList.contains("hidden") && o.innerText.length > 0, outLen: o.innerText.length }); })()', 15000);
      if (st.ok) {
        const s = JSON.parse(st.value);
        if (s.txt.indexOf('Simulation läuft') >= 0) sawProgress = true;
        if (s.done) { finished = true; outLen = s.outLen; break; }
      }
      await sleep(120);
    }
    res('button showed live progress during the run', sawProgress, '');
    res('button restored + report rendered into simOut (' + Math.round((Date.now() - t0) / 100) / 10 + ' s)', finished, finished ? outLen + ' chars' : '');

    if (finished) {
      const rep = await evalResult('(function(){ var o = document.getElementById("simOut"); var lines = o.innerText.split(String.fromCharCode(10)); return JSON.stringify({ head: lines.slice(0, 4).join(" | ").slice(0, 220), busy: BalanceSim._busy, gap: window.__gap.max }); })()', 15000);
      if (rep.ok) {
        const s = JSON.parse(rep.value);
        note('report head: ' + s.head);
        note('rAF max gap during chunked 10k run: ' + s.gap.toFixed(1) + ' ms');
        res('report shows run count + ms, sim idle again', /Durchläufe in \d+ ms/.test(s.head) && !s.busy, s.busy ? 'busy still true' : '');

        // contrast: forced SYNC 10k with the same tracker
        await evalResult('(function(){ window.__gapSync = { max: 0, last: performance.now() }; (function loop(){ var n = performance.now(); var d = n - window.__gapSync.last; window.__gapSync.last = n; if (d > window.__gapSync.max) window.__gapSync.max = d; requestAnimationFrame(loop); })(); BalanceSim.compute(10000); return "started"; })()', 30000);
        await sleep(900);
        const sync = await evalResult('JSON.stringify({ syncGap: window.__gapSync.max })', 15000);
        if (sync.ok) {
          const syncGap = JSON.parse(sync.value).syncGap;
          note('rAF max gap during SYNC 10k (contrast): ' + syncGap.toFixed(1) + ' ms');
          // NOTE: at 1x this gap contrast is cadence noise (headless rAF tick is
          // ~20 ms and chunked/sync both land within 2-3 ticks) — the throttle
          // probe (tools/_throttle-sim-probe.mjs) covers the contrast rigorously
          // at 4x/6x where it actually opens. Kept as a record, not a gate.
          note('rAF gap contrast at 1x: chunked ' + s.gap.toFixed(1) + ' ms vs sync ' + syncGap.toFixed(1) + ' ms (informational — noise at 1x, see throttle probe)');
        }
      } else res('report readback', false, rep.err);
    }

    // ---- cancel leg: mid-run the running button becomes the Abbrechen
    // affordance; clicking it must stop the remaining slices cleanly ----
    // NOTE: buttons are selected by index within #simRow (0 = 2000, 1 = 10000,
    // 2 = Bericht schließen, 3 = Sim-JSON) — CSS attribute values like
    // [data-val=10000] are invalid unquoted, and quoted variants fight the
    // single-quoted eval wrapper.
    {
      const bSel = (body) => '(function(){ var b = document.querySelectorAll("#simRow button")[1]; ' + body + ' })()';
      const readJSON = async (expr) => { const r = await evalResult(expr, 15000); return r.ok ? JSON.parse(r.value) : null; };
      const origTxt = (await evalResult('(function(){ return document.querySelectorAll("#simRow button")[1].textContent; })()', 15000)).value;
      // simOut state before this leg (a prior full report may or may not be visible)
      const pre = await readJSON('(function(){ var o = document.getElementById("simOut"); return JSON.stringify({ len: o.innerText.length, hidden: o.classList.contains("hidden") }); })()');
      let cancelled = false, affordanceTxt = '';
      await throttle(4); // stretch the 10k wall time so the cancel click lands mid-run
      try {
        for (let attempt = 1; attempt <= 3 && !cancelled; attempt++) {
          // start a fresh 10k run (idle required)
          const st0 = await evalResult(bSel('if (BalanceSim._busy) return "busy"; b.click(); return "clicked";'), 15000);
          if (st0.ok && st0.value === 'busy') { await sleep(400); continue; }
          if (!st0.ok) { note('cancel attempt ' + attempt + ': Start-Eval fehlgeschlagen (' + (st0.err || '') + ')'); continue; }
          // wait until the button shows the Abbrechen affordance (or the run already finished)
          let txt = '';
          const dl = Date.now() + 6000;
          while (Date.now() < dl) {
            await sleep(25);
            const st = await evalResult('(function(){ var b = document.querySelectorAll("#simRow button")[1]; return JSON.stringify({ txt: b.textContent, busy: BalanceSim._busy }); })()', 15000);
            if (st.ok) { const s = JSON.parse(st.value); txt = s.txt; if (s.busy && s.txt.indexOf('Abbrechen') >= 0) break; if (!s.busy && s.txt === origTxt) break; }
          }
          if (txt.indexOf('Abbrechen') < 0) { note('cancel attempt ' + attempt + ': Lauf schneller fertig als der Klick — neuer Versuch'); await sleep(150); continue; }
          affordanceTxt = txt;
          // cancel = real click on the running button, only while it still is the affordance
          const cl = await evalResult(bSel('if (!(BalanceSim._busy && b.textContent.indexOf("Abbrechen") >= 0)) return "missed"; b.click(); return "cancelled";'), 15000);
          if (cl.ok && cl.value === 'missed') { note('cancel attempt ' + attempt + ': Zustand kippte vor dem Klick — neuer Versuch'); continue; }
          if (!(cl.ok && cl.value === 'cancelled')) { note('cancel attempt ' + attempt + ': Klick unerwartet (' + (cl.err || cl.value) + ')'); continue; }
          // settle: busy false, button restored to its original label, cancelReq cleared
          let settled = false;
          const dl2 = Date.now() + 3000;
          while (Date.now() < dl2) {
            await sleep(40);
            const st = await evalResult('(function(){ var b = document.querySelectorAll("#simRow button")[1]; return JSON.stringify({ busy: BalanceSim._busy, txt: b.textContent, cancelReq: !!BalanceSim._cancelReq }); })()', 15000);
            if (st.ok) { const s = JSON.parse(st.value); if (!s.busy && s.txt === origTxt && !s.cancelReq) { settled = true; break; } }
          }
          if (!settled) { note('cancel attempt ' + attempt + ': Lauf nicht sauber gestoppt'); continue; }
          const post = await readJSON('(function(){ var o = document.getElementById("simOut"); return JSON.stringify({ len: o.innerText.length, hidden: o.classList.contains("hidden") }); })()');
          res('cancel: kein Teil-Bericht gerendert (simOut len ' + pre.len + ' -> ' + post.len + ', hidden ' + pre.hidden + ' -> ' + post.hidden + ')', post.len === pre.len && post.hidden === pre.hidden, '');
          const ex0 = (await readJSON('JSON.stringify({ n: BalanceSim._execCalls || 0 })') || {}).n;
          await sleep(400); // quiet window — a live zombie chain would keep executing
          const ex1 = (await readJSON('JSON.stringify({ n: BalanceSim._execCalls || 0 })') || {}).n;
          res('cancel: keine Rest-Slices laufen (execCalls ' + ex0 + ' -> ' + ex1 + ' still)', ex0 > 0 && ex1 === ex0, '');
          cancelled = true;
        }
      } finally {
        await throttle(1);
        if (wsCdp) { try { wsCdp.close(); } catch { } wsCdp = null; }
      }
      res('Abbrechen-Affordance mid-run (Text zeigt Abbrechen + Fortschritt)', affordanceTxt.indexOf('Abbrechen') >= 0 && affordanceTxt.indexOf('Simulation läuft') >= 0, affordanceTxt ? '"' + affordanceTxt.slice(0, 60) + '"' : '(nie erreicht)');
      res('Abbrechen-Pfad erfolgreich durchlaufen', cancelled, cancelled ? '' : '3 Versuche verpasst (Lauf jeweils vor dem Klick fertig)');

      // machinery reusable after cancel: a full 2000 run completes + renders + idles
      if (cancelled) {
        await evalResult('(function(){ document.querySelectorAll("#simRow button")[0].click(); return 1; })()', 15000);
        let done2 = false;
        const dl3 = Date.now() + 20000;
        while (Date.now() < dl3) {
          await sleep(120);
          const st = await evalResult('(function(){ var o = document.getElementById("simOut"); return JSON.stringify({ busy: BalanceSim._busy, done: !BalanceSim._busy && !o.classList.contains("hidden") && o.innerText.length > 0 }); })()', 15000);
          if (st.ok && JSON.parse(st.value).done) { done2 = true; break; }
        }
        const head2 = done2 ? await evalResult('(function(){ var o = document.getElementById("simOut"); return o.innerText.split(String.fromCharCode(10))[0].slice(0, 70); })()', 15000) : null;
        res('nach Abbrechen wieder nutzbar: 2.000er laeuft durch + Bericht', done2, head2 && head2.ok ? head2.value : '');
      }
    }
  } finally {
    killEdgeByProfile();
  }
  console.log(failures === 0 ? '\nSIM-UI PROBE OK' : '\nSIM-UI PROBE FAILED (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
};
main();
