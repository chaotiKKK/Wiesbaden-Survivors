#!/usr/bin/env node
// One-shot splicer (2026-09-04 pass): move BOSSES, ITEMS (+ I-builder +
// ITEM_BY_ID), DANGERS, MODS from index.html's engine block into data.js,
// with their Data.register* calls, before the module.exports tail.
// CRLF preserved (lines keep their trailing \r). Backups in %TEMP%.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const idx = readFileSync('index.html', 'utf8');
const djs = readFileSync('data.js', 'utf8');
const I = idx.split('\n');
const D = djs.split('\n');
const line = (n1) => I[n1 - 1]; // 1-based
const assert = (cond, msg) => { if (!cond) { console.error('ANCHOR FAIL: ' + msg); process.exit(1); } };

// ---- anchor checks (guards against drift) ----
assert(line(3899).includes('8. DATEN: ITEMS'), 'ITEMS header at 3899');
assert(line(3900).startsWith('function I(id, name'), 'I() at 3900');
assert(line(3901).startsWith('const ITEMS = ['), 'ITEMS at 3901');
assert(line(3950).trim() === '];', 'ITEMS close at 3950');
assert(line(3954).trim() === '}).byId;', 'ITEM_BY_ID close at 3954');
assert(line(3969).startsWith('const BOSSES = ['), 'BOSSES at 3969');
assert(line(4002).trim() === '];', 'BOSSES close at 4002');
assert(line(4005).startsWith("Data.register('bosses'"), 'bosses register at 4005');
assert(line(4008).trim() === '});', 'bosses register close at 4008');
assert(line(4647).startsWith('const DANGERS = ['), 'DANGERS at 4647');
assert(line(4657).trim() === '];', 'DANGERS close at 4657');
assert(line(4662).includes('dangerPriceMult'), 'dangerPriceMult at 4662 (keep)');
assert(line(4669).startsWith("Data.register('dangers'"), 'dangers register at 4669');
assert(line(4670).startsWith('const MODS = ['), 'MODS at 4670');
assert(line(4680).trim() === '];', 'MODS close at 4680');
assert(line(4682).startsWith("Data.register('mods'"), 'mods register at 4682');
const g = djs.indexOf("if (typeof module !== 'undefined' && module.exports)");
assert(g > 0, 'module.exports guard present in data.js');
const gLine = djs.slice(0, g).split('\n').length; // 1-based line of guard

// ---- verbatim extracts (0-based slices over I) ----
const slice = (a1, b1) => I.slice(a1 - 1, b1).join('\n'); // inclusive 1-based
const ITEMS_TXT = slice(3900, 3954);           // I() + table + register
const BOSS_TXT = slice(3969, 4002) + '\n' + slice(4005, 4008);
const DANGER_TXT = slice(4647, 4657) + '\n' + slice(4669, 4669);
const MOD_TXT = slice(4670, 4680) + '\n' + slice(4682, 4682);

// ---- engine edits, bottom-up on ORIGINAL 1-based ranges ----
const R = [];
const rep = (a1, b1, txt) => R.push({ a1, b1, txt });
rep(4682, 4682, '');                    // mods register
rep(4670, 4680, '/* MODS + Register extrahiert nach data.js */\r');
rep(4669, 4669, '');                    // dangers register
rep(4647, 4657, '/* DANGERS + Register extrahiert nach data.js */\r');
rep(4005, 4008, '');                    // bosses register
rep(3969, 4002, '/* BOSSES + Register extrahiert nach data.js */\r');
rep(3900, 3954, '/* ITEMS (+ I-Builder) + ITEM_BY_ID + Register extrahiert nach data.js */\r');
R.sort((x, y) => y.a1 - x.a1);
for (const { a1, b1, txt } of R) {
  const a = a1 - 1, b = b1; // splice indices
  I.splice(a, b - a, ...(txt === '' ? [] : [txt]));
}
const outIdx = I.join('\n');
// data.js: insert sections before the guard comment block
const guardCommentStart = djs.indexOf('/* Dual-Mode-Abschluss');
assert(guardCommentStart > 0, 'dual-mode comment found');
const insertAt = guardCommentStart; // index in djs (character offset)
const NEW = '\r\n/* BOSSES + Register extrahiert nach data.js (2026-09-04) */\r\n' + BOSS_TXT +
  '\r\n\r\n/* ITEMS (+ I-Builder) + ITEM_BY_ID + Register extrahiert nach data.js (2026-09-04) */\r\n' + ITEMS_TXT +
  '\r\n\r\n/* DANGERS + Register extrahiert nach data.js (2026-09-04) */\r\n' + DANGER_TXT +
  '\r\n\r\n/* MODS + Register extrahiert nach data.js (2026-09-04) */\r\n' + MOD_TXT + '\r\n\r\n';
const outDjs = djs.slice(0, insertAt) + NEW + djs.slice(insertAt);
// extend module.exports
const expBefore = outDjs.indexOf('ARENAS, ACHIEVEMENTS };');
assert(expBefore > 0, 'module.exports tail anchor');
const outDjs2 = outDjs.replace('ARENAS, ACHIEVEMENTS };', 'ARENAS, ACHIEVEMENTS,\n    ITEM_BY_ID, BOSSES, DANGERS, MODS };');

// ---- backups + write ----
const stamp = Date.now();
copyFileSync('index.html', path.join(os.tmpdir(), 'index.html.pre-bossitems-' + stamp + '.bak'));
copyFileSync('data.js', path.join(os.tmpdir(), 'data.js.pre-bossitems-' + stamp + '.bak'));
writeFileSync('index.html', outIdx);
writeFileSync('data.js', outDjs2);
console.log('index.html: removed lines ' + R.reduce((s, r) => s + (r.b1 - r.a1 + 1), 0) + ' -> now ' + outIdx.split('\n').length + ' lines');
console.log('data.js: ' + outDjs2.split('\n').length + ' lines (guard at engine? no) — backup ' + stamp);
// sanity: markers present
for (const m of ['const BOSSES = [', 'const ITEMS = [', 'const DANGERS = [', 'const MODS = [', 'ITEM_BY_ID']) {
  if (outIdx.includes(m)) console.error('STILL IN index.html: ' + m);
  else if (!outDjs2.includes(m)) console.error('MISSING in data.js: ' + m);
  else console.log('ok moved: ' + m);
}
