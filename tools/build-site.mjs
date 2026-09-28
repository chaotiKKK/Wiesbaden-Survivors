#!/usr/bin/env node
//
// Wiesbaden Survivors — build the GitHub Pages artifact.
//
// Publishes ONLY what the game needs at runtime, as an allowlist. Before this,
// Pages served the whole repository, so the character-art pipeline pages
// (kandidaten.html, parts.html, gallery.html, ...) and their reference photos
// were public although nothing in the game links to them. An allowlist rather
// than a denylist means a new debug page never goes public by default.
//
// The list is checked against everything that actually loads the game, so a
// missing file fails the build instead of breaking the live site:
//   - every SHELL entry in sw.js — installed with cache.addAll, so one 404 and
//     the service worker never installs (no offline play)
//   - every AUDIO entry in sw.js — the same cues AudioSys fetches as
//     audio/<name>.m4a
//   - every relative src= / href= in index.html
//   - every icon in manifest.webmanifest
//
// The published sw.js gets its cache stamp here, computed from the published files
// (tools/lib/site-stamp.mjs). Nobody stamps sw.js by hand; the repository copy keeps
// the 'wbns-dev' placeholder.
//
// Usage: node tools/build-site.mjs [--out _site]

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, argOf } from './lib/harness.mjs';
import { CACHE_LINE, DEV_CACHE, cacheOf, computeStamp } from './lib/site-stamp.mjs';

const ROOT = repoRoot(import.meta.url);
const OUT = path.resolve(ROOT, argOf(process.argv.slice(2), '--out', '_site'));

/** Everything the live site serves. Audio: every cue in audio/ (*.m4a only). */
/* CREDITS.md and the font licence ship with the site: the SIL OFL requires the licence to accompany the
   embedded Chakra Petch wherever it is redistributed — and Pages redistributes it. */
const FILES = ['index.html', 'data.js', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'maskable-512.png',
  'CREDITS.md', 'licenses/OFL-ChakraPetch.txt'];
const AUDIO = readdirSync(path.join(ROOT, 'audio')).filter(f => f.endsWith('.m4a')).map(f => 'audio/' + f);

const errors = [];
const site = new Set([...FILES, ...AUDIO]);
const need = (file, why) => { if (!site.has(file)) errors.push(why + ' needs "' + file + '", which is not in the site allowlist'); };
const strings = (src) => [...src.matchAll(/'([^']+)'/g)].map(m => m[1]);

for (const f of site) if (!existsSync(path.join(ROOT, f))) errors.push('allowlisted file missing from the repository: ' + f);

const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const shell = sw.match(/const SHELL = \[([^\]]*)\]/);
const swAudio = sw.match(/const AUDIO = \[([\s\S]*?)\]/);
if (!shell || !swAudio) errors.push('could not read the SHELL/AUDIO lists from sw.js — did their shape change?');
else {
  for (const u of strings(shell[1])) need(u === './' ? 'index.html' : u.replace(/^\.\//, ''), 'sw.js SHELL (cache.addAll)');
  for (const u of strings(swAudio[1])) need(u.replace(/^\.\//, ''), 'sw.js AUDIO');
}

const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/\b(?:src|href)="([^"#:]+)"/g)) need(m[1].replace(/^\.\//, ''), 'index.html');

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
for (const icon of manifest.icons || []) need(icon.src.replace(/^\.\//, ''), 'manifest.webmanifest');

if (errors.length) {
  for (const e of errors) console.error('FAIL  ' + e);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
for (const f of site) {
  const dst = path.join(OUT, f);
  mkdirSync(path.dirname(dst), { recursive: true });
  copyFileSync(path.join(ROOT, f), dst);
  bytes += statSync(dst).size;
}

// Stamp the published sw.js from the published bytes.
const swOut = path.join(OUT, 'sw.js');
const swSrc = readFileSync(swOut, 'utf8');
const before = cacheOf(swSrc);
if (before === null) { console.error("FAIL  sw.js has no \"const CACHE = '...';\" line to stamp"); process.exit(1); }
if (before !== DEV_CACHE) console.warn('NOTE  sw.js in the repository carries ' + before + ' instead of ' + DEV_CACHE + '; the build overwrites it anyway');
const stamp = computeStamp(OUT, swSrc);
writeFileSync(swOut, swSrc.replace(CACHE_LINE, (line) => line.replace(before, stamp)));
console.log('site: ' + site.size + ' files (' + FILES.length + ' core + ' + AUDIO.length + ' audio cues), '
  + Math.round(bytes / 1024) + ' KB -> ' + path.relative(ROOT, OUT) + ', cache ' + stamp.slice(0, 17) + '...');