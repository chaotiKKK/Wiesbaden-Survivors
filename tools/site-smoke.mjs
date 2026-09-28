#!/usr/bin/env node
//
// Wiesbaden Survivors — smoke-test the built Pages artifact.
//
// Serves _site (from tools/build-site.mjs) exactly as Pages would and checks it
// the way a visitor meets it, in headless Edge:
//   - the game boots, with no uncaught exception during load
//   - the service worker installs and every SHELL file is in its cache (if one
//     were missing, cache.addAll would reject and offline play would be gone)
//   - every audio cue answers 200
//   - the published sw.js carries the cache stamp of exactly the published files
//     (recomputed here), and the browser's cache is created under that name
//   - every file tracked in git that is NOT part of the site answers 404 —
//     the debug and preview pages above all
//
// Usage: node tools/build-site.mjs && node tools/site-smoke.mjs [--site _site]

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { EDGE_PATH, repoRoot, argOf, startStaticServer, launchEdge, killScratchEdges, connectPageCdp } from './lib/harness.mjs';
import { DEV_CACHE, cacheOf, computeStamp } from './lib/site-stamp.mjs';

const ROOT = repoRoot(import.meta.url);
const SITE = path.resolve(ROOT, argOf(process.argv.slice(2), '--site', '_site'));
let failures = 0;
const check = (ok, name, detail) => {
  if (!ok) failures++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' — ' + detail : ''));
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

if (!existsSync(path.join(SITE, 'index.html'))) { console.error('FATAL: no site at ' + SITE + ' — run tools/build-site.mjs first'); process.exit(1); }

const server = await startStaticServer(SITE);
let edge = null, conn = null;
try {
  // ---- HTTP: what is public, what is not --------------------------------
  const r0 = await fetch(server.url + '/');
  check(r0.status === 200, 'site root serves the game', 'HTTP ' + r0.status);

  const tracked = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const hidden = tracked.filter(f => !existsSync(path.join(SITE, f)));
  const leaked = [];
  for (const f of hidden) {
    const r = await fetch(server.url + '/' + f.split('/').map(encodeURIComponent).join('/'));
    if (r.status !== 404) leaked.push(f + ' (HTTP ' + r.status + ')');
  }
  check(hidden.length > 0 && leaked.length === 0, 'every tracked file outside the allowlist answers 404',
    hidden.length + ' files checked' + (leaked.length ? '; public: ' + leaked.slice(0, 5).join(', ') : ''));
  const orphans = ['gallery.html', 'diag.html', 'cyborg.html', 'cyborg_raw.html', 'kandidaten.html', 'parts.html',
    'preview_both.html', 'preview_leonidas.html', 'preview_sylvia.html', 'sylvia_debug.html', 'blindg_debug.html', 'crotch_zoom.png'];
  const orphanHits = [];
  for (const f of orphans) { const r = await fetch(server.url + '/' + f); if (r.status !== 404) orphanHits.push(f); }
  check(orphanHits.length === 0, 'the 12 debug/preview files from the audit are gone', orphanHits.join(', '));

  const sw = readFileSync(path.join(SITE, 'sw.js'), 'utf8');
  const audio = [...(sw.match(/const AUDIO = \[([\s\S]*?)\]/) || ['', ''])[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const missingAudio = [];
  for (const a of audio) { const r = await fetch(server.url + '/' + a); if (r.status !== 200) missingAudio.push(a); }
  check(audio.length > 0 && missingAudio.length === 0, 'every audio cue answers 200', audio.length + ' cues' + (missingAudio.length ? '; missing: ' + missingAudio.join(', ') : ''));

  const stamp = cacheOf(sw), want = computeStamp(SITE, sw);
  check(stamp === want && stamp !== DEV_CACHE, 'published sw.js is stamped from the published files',
    'CACHE ' + String(stamp).slice(0, 17) + '…' + (stamp === want ? '' : ', expected ' + want.slice(0, 17) + '…'));

  // ---- Browser: the game and its service worker -------------------------
  killScratchEdges('wssite-edge-');
  edge = await launchEdge({ profilePrefix: 'wssite-edge-' });
  if (!edge.ok) throw new Error('headless Edge did not start');
  conn = await connectPageCdp(edge.port);
  const { cdp, ev, setEventHandler } = conn;
  const exceptions = [];
  setEventHandler((d) => {
    if (d.method === 'Runtime.exceptionThrown') exceptions.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: server.url + '/index.html?cb=site' + Date.now() }, 20000);

  let booted = false;
  for (let i = 0; i < 60 && !booted; i++) {
    try { booted = await ev("typeof Game === 'object' && !!Game.state && document.readyState === 'complete'"); } catch { /* loading */ }
    if (!booted) await sleep(300);
  }
  check(booted, 'the game boots from the built site', booted ? 'state=' + await ev('Game.state') : 'Game never became ready');

  const shellWant = [...(sw.match(/const SHELL = \[([^\]]*)\]/) || ['', ''])[1].matchAll(/'([^']+)'/g)]
    .map(m => '/' + m[1].replace(/^\.\//, ''));
  const swState = await ev(`(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 15000))]);
    if (!reg || !reg.active) return { active: false };
    const name = (await caches.keys()).find(k => k.indexOf('wbns-') === 0);
    if (!name) return { active: true, cache: null };
    const reqs = await (await caches.open(name)).keys();
    return { active: true, cache: name, urls: reqs.map(r => new URL(r.url).pathname) };
  })()`, 30000);
  const missingShell = swState.urls ? shellWant.filter(u => !swState.urls.includes(u)) : shellWant;
  check(swState.cache === stamp, 'the browser caches under the published stamp', String(swState.cache).slice(0, 17) + '…');
  check(swState.active && !!swState.cache && missingShell.length === 0,
    'service worker installs and caches every SHELL file (offline play works)',
    swState.active ? (swState.cache ? swState.urls.length + ' cached in ' + swState.cache.slice(0, 16) + '…'
      + (missingShell.length ? '; missing: ' + missingShell.join(', ') : '') : 'no wbns- cache') : 'never became active');
  check(exceptions.length === 0, 'no uncaught exception while loading', exceptions.slice(0, 2).join(' | '));
} catch (e) {
  check(false, 'smoke test ran to completion', String(e && e.message ? e.message : e));
} finally {
  if (conn) conn.close();
  if (edge) edge.kill();
  server.close();
}
console.log(failures === 0 ? '\nSITE OK' : '\nSITE FAILED (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);