#!/usr/bin/env node
// One-off probe (data-extraction pass): prove index.html + data.js still boot from
// file:// — the PWA/offline path ships no server, so the relative <script src>
// include must resolve and the engine must see the data consts from the earlier
// classic script. Reuses verify.mjs's launch mechanics; no static server needed.
import { readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE_DIR = path.dirname(fileURLToPath(new URL(import.meta.url)));
const ROOT = path.resolve(HERE_DIR, '..');
const FILE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?selftest&cb=fb' + Date.now();
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

const sh = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', timeout: 20000 }, opts || {}));
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
};
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
      edgeProfile = path.join(os.tmpdir(), 'fbfile-edge-' + process.pid + '-' + Date.now());
      const profileFwd = edgeProfile.replace(/\\/g, '/');
      const r = ps("Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH +
        "' -ArgumentList '--headless=new --remote-debugging-port=" + port +
        ' --user-data-dir=' + profileFwd +
        " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience about:blank'");
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
  ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*fbfile-edge-*' -or $_.CommandLine -like '*fbverify-edge-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
  try { for (const f of readdirSync(os.tmpdir())) if (f.indexOf('fbfile-edge-') === 0 || f.indexOf('fbverify-edge-') === 0) rmSync(path.join(os.tmpdir(), f), { recursive: true, force: true }); } catch { /* ignore */ }
}

// warm the daemon (detached, ignored stdio — cold spawn hangs with piped stdio)
try { const w = spawn(AB_BIN, ['--version'], { detached: true, stdio: 'ignore', windowsHide: true }); w.unref(); } catch { /* ignore */ }

const main = async () => {
  killAllScratchEdges();
  await sleep(2000);
  const up = await launchEdge();
  if (!up) { console.error('FAIL headless Edge did not start'); process.exit(1); }
  console.log('NOTE file:// URL: ' + FILE_URL);
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
    if (r.timedOut || r.code !== 0) { console.error('FAIL connect: ' + (r.stderr || r.stdout || '').slice(0, 160)); process.exit(1); }
    r = await ab(['open', FILE_URL]);
    if (r.timedOut || r.code !== 0) { await sleep(1200); r = await ab(['open', FILE_URL]); }
    if (r.timedOut || r.code !== 0) { console.error('FAIL open: ' + (r.stderr || r.stdout || '').slice(0, 200)); process.exit(1); }
    try {
      const tl = await ab(['tab', 'list']);
      const line = (tl.stdout || '').split('\n').find(l => l.indexOf('index.html') >= 0 && l.indexOf('selftest') >= 0);
      const m = line && line.match(/\[(t\d+)\]/);
      if (m) await ab(['tab', m[1]]);
    } catch { /* tab targeting best-effort */ }

    const e0 = await evalResult('location.href', 15000);
    res('navigated to file:// selftest page', e0.ok && /^file:/.test(e0.value || ''), e0.ok ? e0.value : e0.err);

    const e1 = await evalResult('JSON.stringify({ch: typeof CHARS, w: typeof WEAPONS, e: typeof ENEMIES, a: typeof ARENAS, ac: typeof ACHIEVEMENTS, d: typeof Data, chLen: CHARS.length, wLen: WEAPONS.length, sdk: typeof STAT_DEF})', 15000);
    if (e1.ok) {
      const s = JSON.parse(e1.value);
      res('data.js tables visible to engine (file://)', s.ch === 'object' && s.d === 'object' && s.chLen === 23 && s.wLen === 42, JSON.stringify(s));
    } else res('data.js tables visible to engine (file://)', false, e1.err);

    const probeScript = "JSON.stringify({banner:(document.body?((m)=>{m=document.body.innerText.match(/SELFTEST (\\d+)\\/(\\d+)/);return !!m&&m[1]===m[2]&&parseInt(m[1],10)>=100})(document.body.innerText):false),txt:(document.body?document.body.innerText.match(/SELFTEST [\\d/]+[^\\n]*/):[''])[0]||''})";
    const deadline = Date.now() + 30000;
    let banner = false, last = '';
    while (Date.now() < deadline) {
      const e = await evalResult(probeScript, 15000);
      if (e.ok) { try { const s = JSON.parse(e.value); banner = s.banner === true; if (banner) { last = s.txt; break; } } catch { /* keep polling */ } }
      await sleep(600);
    }
    res('?selftest PASS banner on file://', banner, banner ? last : 'never saw banner in 30s');
  } finally {
    killEdgeByProfile();
  }
  console.log(failures === 0 ? '\nFILE-BOOT OK' : '\nFILE-BOOT FAILED (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
};
main();
