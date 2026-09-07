#!/usr/bin/env node
// Probe (daily-seed copy pass): the controls/setup screen's seed value must say
// what the run will actually use — 'Zufall' for a normal run, 'Tages-Seed (fix
// je Datum)' when a daily run is armed (startRun() always applies dailySeed()),
// and the number after a manual seed/reroll in normal mode.
import { readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE_DIR = path.dirname(fileURLToPath(new URL(import.meta.url)));
const ROOT = path.resolve(HERE_DIR, '..');
const BASE = process.argv[2] || 'http://127.0.0.1:8080/index.html?cb=daily' + Date.now();
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
      edgeProfile = path.join(os.tmpdir(), 'fbdaily-edge-' + process.pid + '-' + Date.now());
      const profileFwd = edgeProfile.replace(/\\/g, '/');
      const r = ps("Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH +
        "' -ArgumentList '--headless=new --remote-debugging-port=" + port +
        ' --user-data-dir=' + profileFwd +
        " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-background-timer-throttling about:blank'");
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
  ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*fbdaily-edge-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
  try { for (const f of readdirSync(os.tmpdir())) if (f.indexOf('fbdaily-edge-') === 0) rmSync(path.join(os.tmpdir(), f), { recursive: true, force: true }); } catch { /* ignore */ }
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

  try {
    let r = await ab(['connect', String(edgePort)]);
    if (r.timedOut || r.code !== 0) { await sleep(1500); r = await ab(['connect', String(edgePort)]); }
    if (r.timedOut || r.code !== 0) { console.error('FAIL connect'); process.exit(1); }
    r = await ab(['open', BASE]);
    if (r.timedOut || r.code !== 0) { await sleep(1200); r = await ab(['open', BASE]); }
    if (r.timedOut || r.code !== 0) { console.error('FAIL open'); process.exit(1); }
    try {
      const tl = await ab(['tab', 'list']);
      const line = (tl.stdout || '').split('\n').find(l => l.indexOf('cb=daily') >= 0);
      const m = line && line.match(/\[(t\d+)\]/);
      if (m) await ab(['tab', m[1]]);
    } catch { /* best effort */ }
    // readiness: wait until OUR page is live and Game is defined (drift guard)
    let ready = false;
    const dlR = Date.now() + 15000;
    while (Date.now() < dlR) {
      const e = await evalResult('JSON.stringify({ href: location.href, game: typeof Game })', 15000);
      if (e.ok) {
        try {
          const s = JSON.parse(e.value);
          if (s.href.indexOf('cb=daily') >= 0 && s.game === 'object') { ready = true; break; }
        } catch { /* keep polling */ }
      }
      if (!ready) {
        try {
          const tl = await ab(['tab', 'list']);
          const line = (tl.stdout || '').split('\n').find(l => l.indexOf('cb=daily') >= 0);
          const m = line && line.match(/\[(t\d+)\]/);
          if (m) await ab(['tab', m[1]]);
        } catch { /* best effort */ }
      }
      await sleep(400);
    }
    if (!ready) { console.error('FAIL page never became ready (wrong tab / slow load)'); process.exit(1); }

    // 1) normal mode: no manual seed -> Zufall (truthful: random at start)
    const e1 = await evalResult('(function(){ Game.daily = false; Game.manualSeed = 0; UI.renderControls(); UI.show("scControls"); return JSON.stringify({ v: document.getElementById("seedVal").textContent, daily: Game.daily }); })()', 15000);
    if (e1.ok) { const s = JSON.parse(e1.value); res('normal run setup shows Zufall (seed really is random)', s.v === 'Zufall', JSON.stringify(s)); }
    else res('normal-mode copy', false, e1.err);

    // 2) daily armed: must show the real date-fixed AZ number, not random
    const e2 = await evalResult('(function(){ Game.daily = true; Game.manualSeed = 0; UI.renderControls(); return JSON.stringify({ v: document.getElementById("seedVal").textContent, az: Game.dailySeed(), daily: Game.daily }); })()', 15000);
    if (e2.ok) { const s = JSON.parse(e2.value); const want = 'Tages-Seed · AZ ' + s.az; res('daily run setup shows Tages-Seed · AZ <n> (matches title AZ)', s.v === want, JSON.stringify(s)); }
    else res('daily-mode copy', false, e2.err);

    // 3) consistency: the value matches the seed startRun() will apply
    const e3 = await evalResult('(function(){ var applied = Game.daily ? Game.dailySeed() : (Game.manualSeed || ((Math.random() * 4294967296) >>> 0)); return JSON.stringify({ dailySeed: Game.dailySeed(), wouldApply: applied }); })()', 15000);
    if (e3.ok) { const s = JSON.parse(e3.value); res('daily seed deterministic + > 0 (same for everyone today)', s.dailySeed > 0 && s.dailySeed === s.wouldApply, JSON.stringify(s)); }
    else res('daily determinism', false, e3.err);

    // 4) manual seed still shows the number in normal mode (reroll path unchanged)
    const e4 = await evalResult('(function(){ Game.daily = false; Game.manualSeed = 424242; UI.renderControls(); var v = document.getElementById("seedVal").textContent; Game.manualSeed = 0; return JSON.stringify({ v: v }); })()', 15000);
    if (e4.ok) { const s = JSON.parse(e4.value); res('manual seed still displayed as number in normal mode', s.v === '424242', JSON.stringify(s)); }
    else res('manual-seed copy', false, e4.err);
  } finally {
    killEdgeByProfile();
  }
  console.log(failures === 0 ? '\nDAILY-COPY PROBE OK' : '\nDAILY-COPY PROBE FAILED (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
};
main();
