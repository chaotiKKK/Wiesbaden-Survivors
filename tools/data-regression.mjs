#!/usr/bin/env node
// Wiesbaden Survivors — standalone Node data regression (no browser needed).
//
// Why it exists: BalanceSim and the in-page ?selftest validate data only when a
// browser runs them (selftest needs the engine; BalanceSim delegates to Combat).
// A balance/data edit therefore went unchecked until the ~10 s browser gate.
// This suite imports data.js directly in Node and asserts the table-integrity
// and cross-table contracts the ENGINE depends on, so a bad edit fails in
// <100 ms:
//
//     node tools/data-regression.mjs            # exit 0 = green
//     node tools/data-regression.mjs --data /path/to/data.js
//
// What it checks (each assertion names its engine consumer):
//   1. Every named export resolves and core tables are non-empty.
//   2. Data.validate() is clean over the data.js-registered tables (chars,
//      weapons, enemies, arenas, achievements, bosses, items, dangers, mods,
//      statDefinitions). Engine-side registrations (quotes, classBonus, vox,
//      groundTextures, attachments, ...) still live in index.html and stay
//      covered by the in-page ?selftest Data group.
//   3. Cross-table references BalanceSim/gameplay resolve:
//      - every CHARS.startWeapon is a weapon WITH >= 4 tiers (BalanceSim maps
//        [0,1,2,3] over tiers and tierData() clamps to index 3 — the weapons
//        schema only requires >= 1 tier, so a 1..3-tier weapon would silently
//        read undefined);
//      - every tier row carries the full layout tierData() destructures:
//        [dmg, as, range, critC, critM, price, x] — dmg > 0, as > 0;
//      - weapon cls tags are real classes (engine CLASS_BONUS keys) and weapon
//        type is a real type;
//      - enemies' ai is a real enemy-AI switch case, summon/split ids exist
//        (schema), and every enemy has an ENEMY_VOX voice entry;
//      - bosses: arena exists (schema), phases descend from 1.0 and each phase
//        summon exists (schema);
//      - item rarity stays inside RARITY_NAME bounds (engine reads
//        RARITY_NAME[r]);
//      - DANGERS levels are contiguous 0..8 (engine indexes DANGERS[danger])
//        and each tuning column strictly rises with level (higher level must be
//        harder — BalanceSim.simulateRun / Game wave scaling rely on it).
//
// Vocabulary mirrors (ai/class) are hardcoded here exactly as the engine's
// switch/CLASS_BONUS define them; if the engine grows a new AI or class, this
// list and the engine change together (kept deliberately small and commented).
//
// Dependency-free: plain Node >= 18, no npm install.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(new URL(import.meta.url)));
const argData = process.argv.indexOf('--data');
const DATA_PATH = path.resolve(
  argData >= 0 && process.argv[argData + 1] ? process.argv[argData + 1] : path.join(HERE, '..', 'data.js')
);

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('PASS  ' + msg); }
  else { fail++; console.log('FAIL  ' + msg); }
};

const ENGINE_FILE = path.join(HERE, '..', 'index.html');
/* Engine-Vokabular: exakt die ai-case-Werte des Enemy-Switches (index.html
   ~6299-6680: chase orbit ranged exploder charger healer aura summoner
   shielded teleport spiral mortar weaver sentinel leech bomber mirror
   juggernaut siren). Neue Gegner-AI => hier UND im Switch ergaenzen. */
const KNOWN_AI = ['chase', 'orbit', 'ranged', 'exploder', 'charger', 'healer', 'aura',
  'summoner', 'shielded', 'teleport', 'spiral', 'mortar', 'weaver', 'sentinel',
  'leech', 'bomber', 'mirror', 'juggernaut', 'siren'];
/* Engine-Klassen: exakt die Schluessel von CLASS_BONUS (index.html ~3876). */
const KNOWN_CLASS = ['gun', 'heavy', 'elemental', 'precise', 'support', 'explosive',
  'medieval', 'primitive', 'medical', 'blade', 'blunt'];
const KNOWN_TYPE = ['projectile', 'hitscan', 'cone', 'chain', 'charge', 'aura', 'melee'];

let data;
try {
  data = await import('file://' + DATA_PATH.split(path.sep).join('/'));
} catch (e) {
  console.log('FAIL  data.js import: ' + e.message);
  console.log('\nRESULT 0/0 PASS — load failure, exit 1');
  process.exit(1);
}

console.log('Data regression against ' + (argData >= 0 ? DATA_PATH : 'data.js (workspace)'));

/* 1. exports + non-empty core */
const NAMES = ['STAT_DEF', 'STAT_KEYS', 'STAT_NAME', 'STAT_UNIT', 'Data',
  'CHARS', 'CHAR_BY_ID', 'CharacterProfiles', 'WEAPONS', 'WEAPON_BY_ID',
  'ENEMIES', 'ENEMY_BY_ID', 'ARENAS', 'ACHIEVEMENTS', 'ITEM_BY_ID', 'ITEMS',
  'BOSSES', 'DANGERS', 'MODS'];
const missing = NAMES.filter(n => data[n] === undefined);
ok(missing.length === 0, 'alle 19 Named Exports vorhanden' + (missing.length ? ' — fehlt: ' + missing.join(', ') : ''));
const { Data, CHARS, WEAPONS, WEAPON_BY_ID, ENEMIES, ARENAS, ACHIEVEMENTS,
  ITEMS, BOSSES, DANGERS, MODS } = data;
ok(CHARS.length > 0 && WEAPONS.length > 0 && ENEMIES.length > 0, 'Kerntabellen nicht leer (chars/weapons/enemies)');
ok(Data && typeof Data.validate === 'function', 'Data-Registry mit validate() exportiert');

/* 2. Data.validate() clean (schema rules: id, req, str, num, ref:<tabelle>, in:a,b,c, Funktion) */
const errs = Data.validate();
ok(errs.length === 0, 'Data.validate() 0 Fehler ueber data.js-Tabellen' +
  (errs.length ? ' — ' + errs.slice(0, 5).join(' | ') : ''));

/* 3a. jede Startwaffe existiert UND hat >= 4 Tier-Zeilen (BalanceSim/tierData) */
const tierCount = (w) => (w && Array.isArray(w.tiers)) ? w.tiers.length : 0;
const startRefs = CHARS.map(c => ({ c, w: WEAPON_BY_ID[c.startWeapon] }));
const badStart = startRefs.filter(({ w }) => !w);
ok(badStart.length === 0, 'jede Charakter-Startwaffe existiert' +
  (badStart.length ? ' — ' + badStart.map(({ c }) => c.id + '->' + c.startWeapon).join(', ') : ''));
const thin = startRefs.filter(({ w }) => w && tierCount(w) < 4);
ok(thin.length === 0, 'jede Startwaffe hat >= 4 Tiers (BalanceSim mappt Tier 0..3)' +
  (thin.length ? ' — ' + thin.map(({ c, w }) => c.id + '->' + w.id + '(' + tierCount(w) + ')').join(', ') : ''));
const allThin = WEAPONS.filter(w => tierCount(w) < 4);
ok(allThin.length === 0, 'ALLE Waffen haben >= 4 Tiers (tierData clammpt auf Index 3)' +
  (allThin.length ? ' — ' + allThin.map(w => w.id + '(' + tierCount(w) + ')').join(', ') : ''));

/* 3b. Tier-Zeilen-Layout, wie tierData() es liest: [dmg, as, range, critC, critM, price, x] */
const TIER_MIN_LEN = 6;                       /* x (a[6]) ist optional (|| {}) */
const tierShapes = [];
for (const w of WEAPONS) for (const a of (w.tiers || [])) {
  if (a.length < TIER_MIN_LEN) tierShapes.push(w.id + ':zeile(' + a.length + ')');
  else { if (!(a[0] > 0)) tierShapes.push(w.id + ':dmg<=0'); if (!(a[1] > 0)) tierShapes.push(w.id + ':as<=0'); }
}
ok(tierShapes.length === 0, 'alle Tier-Zeilen: >= ' + TIER_MIN_LEN + ' Felder, dmg>0, as>0' +
  (tierShapes.length ? ' — ' + tierShapes.slice(0, 6).join(', ') : ''));

/* 3c. Tier-DMG steigt streng (sonst invertieren die BalanceSim dev-Rows) */
const nonMono = WEAPONS.filter(w => {
  const d = (w.tiers || []).map(t => t[0]);
  return d.some((v, i) => i > 0 && v <= d[i - 1]);
}).map(w => w.id);
ok(nonMono.length === 0, 'Tier-Schaden steigt streng je Waffe (r2/r3/r4-Dev-Rows)' +
  (nonMono.length ? ' — ' + nonMono.join(', ') : ''));

/* 3d. Weapon-Tags: cls in CLASS_BONUS, type im Combat-Dispatch */
const badCls = [];
for (const w of WEAPONS) for (const k of (w.cls || [])) if (!KNOWN_CLASS.includes(k)) badCls.push(w.id + ':' + k);
ok(badCls.length === 0, 'alle weapon.cls sind echte Klassen (CLASS_BONUS)' +
  (badCls.length ? ' — ' + badCls.slice(0, 6).join(', ') : ''));
const badType = WEAPONS.filter(w => !KNOWN_TYPE.includes(w.type)).map(w => w.id + ':' + w.type);
ok(badType.length === 0, 'alle weapon.type sind echte Typen' +
  (badType.length ? ' — ' + badType.slice(0, 6).join(', ') : ''));

/* 3e. Gegner: ai im Enemy-Switch, VOX-Eintrag vorhanden (neuer Gegner = beides) */
const badAi = ENEMIES.filter(e => !KNOWN_AI.includes(e.ai)).map(e => e.id + ':' + e.ai);
ok(badAi.length === 0, 'alle enemy.ai sind Enemy-Switch-Faelle' +
  (badAi.length ? ' — ' + badAi.join(', ') : ''));
let voxBlock = '';
try {
  const t = readFileSync(ENGINE_FILE, 'utf8');
  const i0 = t.indexOf('const ENEMY_VOX = {');
  if (i0 >= 0) { const i1 = t.indexOf('};', i0); voxBlock = t.slice(i0, i1); }
} catch { /* index.html fehlt (Fremdkopie) -> VOX-Check ueberspringen */ }
const noVox = voxBlock ? ENEMIES.filter(e => !new RegExp(e.id + ':').test(voxBlock)).map(e => e.id) : [];
ok(voxBlock === '' || noVox.length === 0, 'jeder Gegner hat einen ENEMY_VOX-Eintrag' +
  (noVox.length ? ' — fehlt: ' + noVox.join(', ') : ''));

/* 3f. Bosse: Phasen starten bei 1.0 und fallen streng; summon-Refs (Schema) */
const badPh = [];
for (const b of BOSSES) {
  if (!Array.isArray(b.phases) || b.phases.length < 2) badPh.push(b.id + ':phases<' + (b.phases || []).length);
  else b.phases.forEach((p, i) => {
    if (i === 0 && p.at !== 1) badPh.push(b.id + ':start=' + p.at);
    if (i > 0 && !(p.at < b.phases[i - 1].at)) badPh.push(b.id + ':phase' + i + ' nicht fallend');
  });
}
ok(badPh.length === 0, 'Boss-Phasen: >= 2, starten bei 1.0, fallen streng' +
  (badPh.length ? ' — ' + badPh.slice(0, 6).join(', ') : ''));

/* 3g. Items: Raritaet in RARITY_NAME-Grenzen (Engine liest RARITY_NAME[r]) */
const badR = ITEMS.filter(i => !(i.r >= 1 && i.r <= 4)).map(i => i.id + ':r=' + i.r);
ok(badR.length === 0, 'Item-Raritaet in 1..4 (RARITY_NAME-Grenzen)' +
  (badR.length ? ' — ' + badR.join(', ') : ''));

/* 3h. DANGERS: Ebene n = Array-Index, jede Spalte steigt streng (BalanceSim
        indexiert DANGERS[danger]; Welle n muss schwerer sein als n-1). */
const ns = DANGERS.map(d => d.n);
ok(JSON.stringify(ns) === JSON.stringify(DANGERS.map((_, i) => i)), 'DANGERS-Ebenen sind 0..' + (DANGERS.length - 1) + ' fortlaufend');
const DCOLS = ['hp', 'dmg', 'spd', 'cnt', 'price'];
const flatD = [];
for (const col of DCOLS) for (let i = 1; i < DANGERS.length; i++) {
  if (!(DANGERS[i][col] > DANGERS[i - 1][col])) flatD.push('n' + i + '.' + col + '=' + DANGERS[i][col] + ' !> n' + (i - 1) + '=' + DANGERS[i - 1][col]);
}
ok(flatD.length === 0, 'DANGERS: ' + DCOLS.join('/') + ' steigen streng mit Ebene' +
  (flatD.length ? ' — ' + flatD.slice(0, 6).join(', ') : ''));

/* 3i. Arenen + Achievements: grundlegende Form (Detail-Refs im Schema) */
ok(ARENAS.length >= 4 && ARENAS.every(a => a.w > 0 && a.h > 0), 'Arenen: >= 4, w/h > 0');
ok(ACHIEVEMENTS.length > 0 && ACHIEVEMENTS.every(a => a.id && a.need > 0), 'Achievements nicht leer, need > 0');

console.log('\nRESULT ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
