//
// Shared browser-harness plumbing for the Node tools in this repo.
//
// Extracted because tools/verify.mjs and tools/trailer-capture.mjs had grown
// byte-identical copies of the static server, the Edge launch + scratch-profile
// cleanup, and the raw-CDP WebSocket wrapper — so a change to the Edge launch
// flags (the `--disable-background-timer-throttling` family in particular, which
// headless needs or chained setTimeout/rAF crawls at ~1 Hz) had to be found and
// fixed twice.
//
// Scope is deliberately exactly what the three callers use — verify.mjs,
// trailer-capture.mjs, trailer-build.mjs — and nothing more. No plugin points,
// no options nobody passes.
//
// Dependency-free: plain Node >= 22 (global WebSocket, global fetch) + system Edge.

import { existsSync, readFileSync, rmSync, readdirSync, openSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------------------ paths ----

/** Repo root, resolved from a tool's own import.meta.url (tools/ is one level down). */
export function repoRoot(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(new URL(importMetaUrl))), '..');
}

/** `--flag value` lookup with a default. */
export function argOf(argv, flag, dflt) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}

// ------------------------------------------------------------------ shell ----

export function sh(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', timeout: 20000 }, opts || {}));
  if (r.error && r.error.code === 'ETIMEDOUT') return { timedOut: true, code: null, stdout: '', stderr: '' };
  return { timedOut: false, code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * PowerShell re-parses its own command line, so -NoProfile / -Command / script
 * MUST be separate argv entries and the script must not contain double quotes.
 */
export function powershell(script, opts) {
  return sh('powershell', ['-NoProfile', '-Command', script], opts);
}

// ----------------------------------------------------------- static server ----

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

export function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

/** Serve `root` read-only on a free loopback port. Resolves to { port, url, close }. */
export function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let p = decodeURIComponent((req.url || '/').split('?')[0]);
        if (p.endsWith('/')) p += 'index.html';
        const file = path.resolve(root, '.' + p);
        if (file.indexOf(root) !== 0 || !existsSync(file)) throw new Error('forbidden');
        const body = readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(body);
      } catch {
        res.writeHead(404); res.end('not found');
      }
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      resolve({ port, url: 'http://127.0.0.1:' + port, close: () => { try { srv.close(); } catch { /* ignore */ } } });
    });
  });
}

// ------------------------------------------------------------------- edge ----

/* Playwright's own Chromium builds, if `playwright install chromium` ran here.
   The headless shell is the smallest launcher and needs no X server. */
function playwrightBrowsers() {
  const out = [];
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    for (const d of readdirSync(base)) {
      if (d.startsWith('chromium_headless_shell-')) out.push(path.join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
      if (d.startsWith('chromium-')) {
        /* current caches use chrome-linux64/; older ones chrome-linux/. Both,
           or the full binary is never resolved on a modern install. */
        out.push(path.join(base, d, 'chrome-linux64', 'chrome'));
        out.push(path.join(base, d, 'chrome-linux', 'chrome'));
      }
    }
  } catch { /* no playwright cache — fine */ }
  return out;
}

/* User-space runtime for the Playwright binaries.

   Those binaries link against libraries and fonts that are NOT installed
   system-wide on a root-less box. tools/setup-browser.sh is the one recipe for
   that (.deb extraction into $HOME/sysroot) and `--env` prints exactly the
   exports it needs. Shell out and let bash evaluate them instead of hardcoding
   $HOME/sysroot — one source of truth, and the script may move things later. */
let _browserEnv = null;
export function browserEnv() {
  if (_browserEnv) return _browserEnv;
  _browserEnv = {};
  if (process.platform === 'win32') return _browserEnv;
  const root = path.resolve(path.dirname(fileURLToPath(new URL(import.meta.url))), '..', '..');
  const script = path.join(root, 'tools', 'setup-browser.sh');
  if (!existsSync(script)) return _browserEnv;
  const r = spawnSync('bash', ['-c',
    'eval "$(bash "$1" --env)" 2>/dev/null || exit 0; printf "%s\\n%s" "$LD_LIBRARY_PATH" "$FONTCONFIG_FILE"',
    '_', script], { encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) return _browserEnv;
  const parts = String(r.stdout || '').split('\n');
  if (parts[0] && parts[0].trim()) _browserEnv.LD_LIBRARY_PATH = parts[0].trim();
  if (parts[1] && parts[1].trim()) _browserEnv.FONTCONFIG_FILE = parts[1].trim();
  return _browserEnv;
}

/* Windows keeps Edge first (the gate's documented browser). POSIX falls back to
   a Chromium/Chrome build, then to Playwright's download. WBNS_BROWSER overrides
   everything, which is how tools/setup-browser.sh documents the sandbox run. */
const BROWSER_CANDIDATES = [
  /* Explicit override: WBNS_BROWSER (documented) plus CHROME_PATH/GAME_BROWSER. */
  process.env.WBNS_BROWSER,
  process.env.CHROME_PATH,
  process.env.GAME_BROWSER,
  /* Edge stays the gate's browser for Windows contributors. */
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'
].concat(playwrightBrowsers()).filter(Boolean);
export const EDGE_PATH = BROWSER_CANDIDATES.find(p => { try { return existsSync(p); } catch { return false; } });

// Headless Edge needs the background-throttling family off or chained
// setTimeout(0) and rAF crawl at ~1 Hz — the trap that makes async probes and
// the chunked sim look hung.
/* Containers without user namespaces / a large /dev/shm need these;
   harmless for a normal desktop Chromium. POSIX only — Edge on Windows
   runs with its own sandbox. */
const POSIX_CONTAINER_ARGS = ['--no-sandbox', '--disable-dev-shm-usage'];

const BASE_EDGE_ARGS = [
  '--disable-extensions', '--no-first-run', '--no-default-browser-check',
  '--disable-features=msEdgeFirstRunExperience',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding'
];

/**
 * Kill scratch Edges (ours, or leftovers from a crashed run) whose command line
 * carries one of `prefixes`, then remove their profile dirs. Never touches the
 * user's own Edge.
 */
export function killScratchEdges(prefixes) {
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  if (process.platform === 'win32') {
    const clause = list.map(p => "$_.CommandLine -like '*" + p + "*'").join(' -or ');
    powershell("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { " + clause +
      " } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
  }
  /* POSIX: only the profile dirs are cleaned here. Processes are killed by the
     pid recorded in launchEdge(), never by a name/command-line pattern. */
  try {
    for (const f of readdirSync(os.tmpdir())) {
      if (list.some(p => f.indexOf(p) === 0)) rmSync(path.join(os.tmpdir(), f), { recursive: true, force: true });
    }
  } catch { /* best effort: files may linger if the browser is slow to release */ }
}

/**
 * Launch headless Edge on a free CDP port with a fresh scratch profile.
 * Background process spawn is unsupported here, so it goes out detached via
 * PowerShell Start-Process. Resolves to { ok, port, profile, kill }.
 */
export async function launchEdge({ profilePrefix, extraArgs = [] }) {
  const port = await freePort();
  const profile = path.join(os.tmpdir(), profilePrefix + process.pid + '-' + Date.now());
  let launchLog = () => '';
  let kill = () => {
    const pat = profile.replace(/\\/g, '/'); // launched with forward slashes in --user-data-dir
    powershell("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + pat +
      "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
    setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }, 800);
  };
  if (!EDGE_PATH) return { ok: false, port, profile, kill };

  /* Playwright's headless shell is always headless and rejects --headless=new. */
  const isHeadlessShell = /chrome-headless-shell/.test(EDGE_PATH);
  const args = (isHeadlessShell ? [] : ['--headless=new'])
    .concat(['--remote-debugging-port=' + port, '--user-data-dir=' + profile.replace(/\\/g, '/')])
    .concat(extraArgs, BASE_EDGE_ARGS, ['about:blank']);

  if (process.platform === 'win32') {
    const r = powershell("Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH + "' -ArgumentList '" + args.join(' ') + "'");
    if (r.timedOut || r.code !== 0) return { ok: false, port, profile, kill };
  } else {
    /* POSIX: detached, own process group, stdio ignored — same shape as the
       PowerShell Start-Process path. The pid is kept so kill() targets exactly
       this browser and never a name pattern. */
    let child;
    /* The child MUST get the user-space runtime (LD_LIBRARY_PATH from the
       sysroot in tools/setup-browser.sh, FONTCONFIG_FILE). Without it the
       Playwright binary dies on libnspr4 and /json/version never answers, which
       surfaced only as a bare "did not start on CDP port". Stderr goes to a log
       so the failure carries a real reason instead of a guess. */
    const logPath = profile + '.log';
    let logFd = null;
    try { logFd = openSync(logPath, 'w'); } catch { /* no log — still launch */ }
    const childEnv = Object.assign({}, process.env, browserEnv());
    try {
      child = spawn(EDGE_PATH, args.concat(POSIX_CONTAINER_ARGS), {
        detached: true,
        stdio: logFd === null ? 'ignore' : ['ignore', logFd, logFd],
        env: childEnv
      });
    } catch (e) { return { ok: false, port, profile, kill, err: 'spawn failed: ' + String((e && e.message) || e) }; }
    child.unref();
    launchLog = () => {
      try {
        const t = String(readFileSync(logPath, 'utf8')).trim().split('\n').filter(Boolean);
        return t.slice(-4).join(' | ').slice(0, 400);
      } catch { return ''; }
    };
    kill = () => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }, 800);
    };
  }

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    let up = false;
    if (process.platform === 'win32') {
      const rr = powershell('try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:' + port + '/json/version).StatusCode } catch { 0 }', { timeout: 5000 });
      up = (rr.stdout || '').trim().startsWith('200');
    } else {
      try { up = (await fetch('http://127.0.0.1:' + port + '/json/version')).ok; } catch { up = false; }
    }
    if (up) return { ok: true, port, profile, kill };
    await new Promise(res => setTimeout(res, 500));
  }
  const why = launchLog();
  return { ok: false, port, profile, kill, err: 'no CDP endpoint on port ' + port + ' after 15 s' + (why ? ' — launch log: ' + why : '') };
}

// -------------------------------------------------------------------- cdp ----

/**
 * Bind ONE raw-CDP WebSocket to the page target on `port`.
 *
 * Deliberately raw rather than agent-browser: evals routed through the
 * long-lived daemon flapped on stale targets from killed Edge sessions.
 *
 * Resolves to { cdp, ev, evalResult, setEventHandler, close }. Throws with a
 * caller-reportable message when the target list or the socket is unusable.
 */
export async function connectPageCdp(port) {
  let list;
  try { list = JSON.parse(await (await fetch('http://127.0.0.1:' + port + '/json/list')).text()); }
  catch (e) { throw new Error('CDP /json/list failed: ' + e.message); }

  const page = list.find(t => t.type === 'page' && (t.url === 'about:blank' || t.url.startsWith('http'))) || list.find(t => t.type === 'page');
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error('no page CDP target: ' + JSON.stringify(list.map(t => t.type + ':' + t.url)).slice(0, 160));
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP WebSocket refused')); });

  const pending = new Map();
  let msgId = 0;
  let eventHandler = null;
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id); pending.delete(d.id); clearTimeout(p.timer);
      d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result);
    } else if (d.method && eventHandler) eventHandler(d);
  };

  // The timeout timer is cleared when the answer arrives. A leftover timer keeps
  // Node alive until it fires: a tool that ends without process.exit() then sat
  // out the full timeout after its work was done (3 min for the balance export).
  const cdp = (method, params = {}, tmo = 25000) => new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, tmo);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const ev = async (expression, tmo) => {
    const rr = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, tmo);
    if (rr.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(rr.exceptionDetails).slice(0, 300));
    return rr.result.value;
  };

  // {ok,value}/{err} shape the gate's assertion phases consume.
  const evalResult = async (script, t) => {
    try { return { ok: true, value: await ev(script, t) }; }
    catch (e) { return { err: String(e && e.message ? e.message : e).slice(0, 200) }; }
  };

  return {
    cdp, ev, evalResult,
    setEventHandler: (fn) => { eventHandler = fn; },
    close: () => { try { ws.close(); } catch { /* ignore */ } }
  };
}
