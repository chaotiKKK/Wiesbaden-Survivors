// Wiesbaden Survivors — the service-worker cache stamp, computed from what is published.
//
// sw.js serves every precached file cache-first, so a new cache name is the only way
// an installed player ever sees new bytes. The name therefore has to change whenever
// ANY precached file changes, not just index.html: a data.js-only balance fix would
// otherwise never reach installed players. The stamp is
//   'wbns-' + sha1 over (path NUL length NUL bytes NUL) of every SHELL and AUDIO file,
// in the order sw.js lists them, with './' folded into index.html. sw.js itself is not
// part of it; the browser already reinstalls the worker when its bytes change.
//
// The repository's sw.js carries DEV_CACHE instead of a stamp. tools/build-site.mjs
// writes the real stamp into the published copy; tools/site-smoke.mjs recomputes it.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const DEV_CACHE = 'wbns-dev';
export const CACHE_LINE = /^const CACHE = '([^']*)';\r?$/m;

const listOf = (sw, name) => {
  const m = sw.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\]'));
  if (!m) throw new Error('could not read the ' + name + ' list from sw.js — did its shape change?');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};

/** Site-relative paths of everything sw.js precaches, deduplicated, in sw.js order. */
export function precachedFiles(sw) {
  const out = [];
  for (const u of [...listOf(sw, 'SHELL'), ...listOf(sw, 'AUDIO')]) {
    const f = u === './' ? 'index.html' : u.replace(/^\.\//, '');
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

/** Stamp for the files as they lie in dir (the built site, so exactly what is served). */
export function computeStamp(dir, sw) {
  const h = createHash('sha1');
  for (const f of precachedFiles(sw)) {
    const bytes = readFileSync(path.join(dir, f));
    h.update(f + '\0' + bytes.length + '\0'); h.update(bytes); h.update('\0');
  }
  return 'wbns-' + h.digest('hex');
}

/** The CACHE value in a sw.js source, or null if the line is missing. */
export function cacheOf(sw) {
  const m = sw.match(CACHE_LINE);
  return m ? m[1] : null;
}
