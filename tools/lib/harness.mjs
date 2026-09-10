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

import { existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

const MSEDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
export const EDGE_PATH = MSEDGE_CANDIDATES.find(p => existsSync(p));

// Headless Edge needs the background-throttling family off or chained
// setTimeout(0) and rAF crawl at ~1 Hz — the trap that makes async probes and
// the chunked sim look hung.
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
  const clause = list.map(p => "$_.CommandLine -like '*" + p + "*'").join(' -or ');
  powershell("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { " + clause +
    " } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
  try {
    for (const f of readdirSync(os.tmpdir())) {
      if (list.some(p => f.indexOf(p) === 0)) rmSync(path.join(os.tmpdir(), f), { recursive: true, force: true });
    }
  } catch { /* best effort: files may linger if Edge is slow to release */ }
}

/**
 * Launch headless Edge on a free CDP port with a fresh scratch profile.
 * Background process spawn is unsupported here, so it goes out detached via
 * PowerShell Start-Process. Resolves to { ok, port, profile, kill }.
 */
export async function launchEdge({ profilePrefix, extraArgs = [] }) {
  const port = await freePort();
  const profile = path.join(os.tmpdir(), profilePrefix + process.pid + '-' + Date.now());
  const kill = () => {
    const pat = profile.replace(/\\/g, '/'); // launched with forward slashes in --user-data-dir
    powershell("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + pat +
      "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", { timeout: 15000 });
    setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }, 800);
  };
  if (!EDGE_PATH) return { ok: false, port, profile, kill };

  const args = ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile.replace(/\\/g, '/')]
    .concat(extraArgs, BASE_EDGE_ARGS, ['about:blank']);
  const r = powershell("Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH + "' -ArgumentList '" + args.join(' ') + "'");
  if (r.timedOut || r.code !== 0) return { ok: false, port, profile, kill };

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const rr = powershell('try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:' + port + '/json/version).StatusCode } catch { 0 }', { timeout: 5000 });
    if ((rr.stdout || '').trim().startsWith('200')) return { ok: true, port, profile, kill };
    await new Promise(res => setTimeout(res, 500));
  }
  return { ok: false, port, profile, kill };
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
      const p = pending.get(d.id); pending.delete(d.id);
      d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result);
    } else if (d.method && eventHandler) eventHandler(d);
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
