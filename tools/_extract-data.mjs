// One-shot migration: pull the pure-data registries out of the giant inline
// script in index.html into data.js (loaded BEFORE the engine script, so the
// classic-script shared global scope makes the top-level consts visible to the
// engine). Bands are located by content anchors (line numbers drift), spliced
// out, replaced by marker comments, and reassembled into data.js in original
// order. Integrity guards abort before writing if any anchor is ambiguous.
//
//   Bands moved: STAT_DEF/STAT_KEYS/STAT_NAME/STAT_UNIT,
//                Data registry object + statDefinitions register,
//                CHARS (+ CharacterProfiles + CHAR_BY_ID),
//                WEAPONS (+ W builder + WEAPON_BY_ID),
//                ENEMIES (+ E builder + ENEMY_BY_ID),
//                ARENAS (+ register), ACHIEVEMENTS (+ register).
//   BOSSES, ITEMS, DANGERS, MODS and the rest stay inline this pass.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HTML = 'index.html';
const text = readFileSync(HTML, 'utf8');
const lines = text.split('\n'); // CRLF: every line keeps its trailing \r
const CR = '\r';

function findOnce(re, label, from = 0) {
  const hits = [];
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) hits.push(i);
  if (hits.length !== 1) throw new Error('anchor ' + label + ': expected 1 hit, got ' + hits.length + ' @' + hits.join(','));
  return hits[0];
}
function findFirst(re, label, from) {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
  throw new Error('anchor ' + label + ': not found after line ' + from);
}
// band end = register end line '}).byId;' after the register opener
function byIdEnd(regStartRe, label) {
  const rs = findFirst(regStartRe, label + ' register opener', 0);
  return findFirst(/^\}\)\.byId;\r?$/, label + ' register close', rs + 1);
}

const bands = [];
function add(startRe, endRe, label, mode = 'range') {
  const s = findOnce(startRe, label + ' start');
  let e;
  if (mode === 'byId') e = byIdEnd(endRe, label);
  else e = findOnce(endRe, label + ' end', s);
  if (e < s) throw new Error('band ' + label + ': end before start');
  bands.push({ s, e, label });
}

add(/^const STAT_DEF = \[/, /^STAT_DEF\.forEach\(s => \{ STAT_NAME/, 'STAT-Definitionen');
add(/^const Data = \{/, /^Data\.register\('statDefinitions'/, 'Data-Registry');
add(/^const CHARS = \[/, /^const CHAR_BY_ID = Data\.register\('chars'/, 'CHARS', 'byId');
add(/^function W\(o\) \{ return o; \}/, /^const WEAPON_BY_ID = Data\.register\('weapons'/, 'WEAPONS', 'byId');
add(/^function E\(id, name, o\)/, /^const ENEMY_BY_ID = Data\.register\('enemies'/, 'ENEMIES', 'byId');
add(/^const ARENAS = \[/, /^Data\.register\('arenas', ARENAS,/, 'ARENAS');
add(/^const ACHIEVEMENTS = \[/, /^Data\.register\('achievements', ACHIEVEMENTS,/, 'ACHIEVEMENTS');

// order + overlap guard
bands.sort((a, b) => a.s - b.s);
for (let i = 1; i < bands.length; i++) {
  if (bands[i].s <= bands[i - 1].e) throw new Error('bands overlap: ' + bands[i - 1].label + ' .. ' + bands[i].label);
}
const totalRemoved = bands.reduce((n, b) => n + (b.e - b.s + 1), 0);
console.log('bands:');
for (const b of bands) console.log('  ' + b.label.padEnd(20) + ' lines ' + (b.s + 1) + '..' + (b.e + 1) + ' (' + (b.e - b.s + 1) + ')');
console.log('total lines to move: ' + totalRemoved);

// build data.js: header + bands in original order + dual-mode footer
const header = [
  '// Daten-Registries (reine Tabellen + Data-Infrastruktur), extrahiert aus index.html.',
  '// Muss VOR dem Engine-Script geladen werden: klassische Scripts teilen den globalen',
  '// Lexikal-Scope, die top-level consts (CHARS, WEAPONS, ...) sind also im Engine-Script',
  '// sichtbar. Reihenfolge = Originaldatei. Data.validate() laeuft nur im ?selftest.',
  ''
].join('\n');
const footer = [
  '',
  '/* Dual-Mode-Abschluss: im Browser reichen die top-level consts (externes Script vor dem',
  '   Engine-Script). Unter Node (BalanceSim-Analyse/Regressionschecks) explizit exportieren. */',
  'if (typeof module !== \'undefined\' && module.exports) {',
  '  module.exports = { STAT_DEF, STAT_KEYS, STAT_NAME, STAT_UNIT, Data,',
  '    CHARS, CHAR_BY_ID, CharacterProfiles, WEAPONS, WEAPON_BY_ID, ENEMIES, ENEMY_BY_ID,',
  '    ARENAS, ACHIEVEMENTS };',
  '}',
  ''
].join('\n');
const slices = bands.map(b => lines.slice(b.s, b.e + 1).join('\n'));
writeFileSync('data.js', header + slices.join('\n\n') + '\n' + footer);
console.log('data.js written (' + (header + slices.join('\n\n') + '\n' + footer).split('\n').length + ' lines)');

// slim index.html: replace each band with a marker comment, add script include
const marks = {
  'STAT-Definitionen': 'STAT_DEF/STAT_KEYS/STAT_NAME/STAT_UNIT extrahiert nach data.js',
  'Data-Registry': 'Data-Registry (Data-Objekt + statDefinitions-Register) extrahiert nach data.js',
  'CHARS': 'CHARS + CharacterProfiles + CHAR_BY_ID extrahiert nach data.js',
  'WEAPONS': 'WEAPONS (+ W-Builder) + WEAPON_BY_ID extrahiert nach data.js',
  'ENEMIES': 'ENEMIES (+ E-Builder) + ENEMY_BY_ID extrahiert nach data.js',
  'ARENAS': 'ARENAS + Register extrahiert nach data.js',
  'ACHIEVEMENTS': 'ACHIEVEMENTS + Register extrahiert nach data.js'
};
for (const b of bands.slice().reverse()) {
  const marker = '/* ' + marks[b.label] + ' */' + CR;
  lines.splice(b.s, b.e - b.s + 1, marker);
}
// insert <script src="data.js"> before the engine inline script (first <script>)
const mainScript = findFirst(/^<script>\r?$/i, 'first inline script tag', 0);
lines.splice(mainScript, 0, '<script src="data.js"></script>' + CR);

const backup = path.join(os.tmpdir(), 'index.html.pre-data-extract.bak');
copyFileSync(HTML, backup);
writeFileSync(HTML, lines.join('\n'));
console.log('index.html slimmed; backup at ' + backup);

// quick self-checks on the results
const outIdx = readFileSync(HTML, 'utf8');
for (const decl of ['const CHARS = [', 'const WEAPONS = [', 'const ENEMIES = [', 'const ARENAS = [', 'const ACHIEVEMENTS = [', 'const Data = {', 'const STAT_DEF = [']) {
  const c = (outIdx.match(new RegExp(decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  console.log('index.html contains ' + c + 'x "' + decl + '" (expect 0)');
}
const outData = readFileSync('data.js', 'utf8');
for (const decl of ['const CHARS = [', 'const WEAPONS = [', 'const ENEMIES = [', 'const ARENAS = [', 'const ACHIEVEMENTS = [', 'const Data = {', 'const STAT_DEF = [', 'function W(o) { return o; }', 'function E(id, name, o)']) {
  const c = (outData.match(new RegExp(decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  console.log('data.js contains ' + c + 'x "' + decl + '" (expect 1)');
}
console.log('inline W({ row uses left in index.html: ' + ((outIdx.match(/W\(\{/g) || []).length) + ' (expect 0)');
console.log('OK');
