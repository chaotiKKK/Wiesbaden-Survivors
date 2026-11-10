#!/usr/bin/env node
// Inhalt/Umfang-Audit gegen Brotato. Liest data.js direkt (kein Browser, keine
// Abhaengigkeiten) und schreibt docs/pw/content-scope.json.
//
//     node tools/content-scope.mjs
//
// Gemessen wird, was im Projekt tatsaechlich deklariert ist:
//   - Klassenabdeckung der Waffen (6-Slot-Builds, Klassenpaare, Tiers)
//   - Item-Raritaeten und Stat-Abdeckung
//   - Charakter-Synergien, Startwaffen, geteilte Faehigkeiten
//   - Gegner-AI und Verfuegbarkeit pro Welle
//   - Arenen, Boss-Zuordnung, Gefahrenstufen, Mods, Erfolge
// Referenzzahlen (Brotato) stehen mit Quelle im REFERENCE-Block; sie sind
// Vergleichsmassstab, keine Messung dieses Projekts. Gebrochene Querverweise
// lassen den Lauf mit Exit 1 enden; reine Luecken nicht.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(new URL(import.meta.url)));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const d = require(path.join(ROOT, 'data.js'));

const { CHARS, WEAPONS, ITEMS, ENEMIES, CAMPAIGN_ENEMIES, ARENAS, BOSSES, DANGERS, MODS, ACHIEVEMENTS, STAT_KEYS, WAVE_EVENTS = {} } = d;
const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
const W_BY = byId(WEAPONS), E_BY = byId(ENEMIES), A_BY = byId(ARENAS);
/* summon/split tragen { id, n, ... }, einzelne Felder auch nur eine ID. */
const refId = (v) => (typeof v === 'string' ? v : v && v.id);
const CLASSES = [...new Set(WEAPONS.flatMap((w) => w.cls))].sort();
const AVG = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const choose = (n, k) => {
  if (n < k) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
};
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/* ---------------------------------------------------------------- Waffen */
const classCount = Object.fromEntries(CLASSES.map((c) => [c, 0]));
for (const w of WEAPONS) for (const c of new Set(w.cls)) classCount[c]++;
const underSix = CLASSES.filter((c) => classCount[c] < 6);
const monoLoadouts = CLASSES.reduce((s, c) => s + choose(classCount[c], 6), 0);
const pairs = new Set();
for (const w of WEAPONS) {
  const cs = [...new Set(w.cls)].sort();
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) pairs.add(cs[i] + '+' + cs[j]);
}
const typeCount = {};
for (const w of WEAPONS) typeCount[w.type] = (typeCount[w.type] || 0) + 1;
const tierIssues = WEAPONS.filter((w) => {
  if (!Array.isArray(w.tiers) || w.tiers.length !== 4) return true;
  return w.tiers.some((t, i) => i > 0 && !(t[5] >= w.tiers[i - 1][5]));
}).map((w) => w.id);
const unlocked = WEAPONS.filter((w) => w.unlock && !w.unlockDefault).length;

/* ----------------------------------------------------------------- Items */
const rarityCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
const statCount = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
let cursed = 0, turret = 0, thorns = 0;
for (const it of ITEMS) {
  rarityCount[it.r] = (rarityCount[it.r] || 0) + 1;
  for (const k of Object.keys(it.stats || {})) if (k in statCount) statCount[k]++;
  if (it.cursed) cursed++;
  if (it.turret) turret++;
  if (it.thorns) thorns++;
}
const uncoveredStats = STAT_KEYS.filter((k) => statCount[k] === 0);
const statsCovered = STAT_KEYS.length - uncoveredStats.length;

/* ------------------------------------------------------------ Charaktere */
const synergyClass = {};
for (const c of CHARS) synergyClass[c.synergy.cls] = (synergyClass[c.synergy.cls] || 0) + 1;
const abilityUse = {};
for (const c of CHARS) abilityUse[c.ability.id] = (abilityUse[c.ability.id] || 0) + 1;
const sharedAbilities = Object.entries(abilityUse).filter(([, n]) => n > 1);
const startClass = {};
for (const c of CHARS) {
  const w = W_BY.get(c.startWeapon);
  for (const cl of (w ? w.cls : [])) startClass[cl] = (startClass[cl] || 0) + 1;
}
const charsLocked = CHARS.filter((c) => c.unlock).length;
const synergyUnderSix = CHARS.filter((c) => classCount[c.synergy.cls] < 6).length;

/* --------------------------------------------------------------- Gegner */
const aiCount = {};
for (const e of ENEMIES) aiCount[e.ai] = (aiCount[e.ai] || 0) + 1;
const waves = [];
for (let w = 1; w <= 20; w++) {
  const avail = ENEMIES.filter((e) => (e.minW || 1) <= w);
  waves.push({ wave: w, types: avail.length, aiFamilies: new Set(avail.map((e) => e.ai)).size });
}
const splitOnly = ENEMIES.filter((e) => (e.minW || 1) > 20).map((e) => e.id);
const spawnable = ENEMIES.filter((e) => (e.minW || 1) <= 20);
const summonRefs = [], splitRefs = [];
for (const e of ENEMIES) {
  if (e.summon && !E_BY.has(refId(e.summon))) summonRefs.push(e.id + '->' + refId(e.summon));
  if (e.split && !E_BY.has(refId(e.split))) splitRefs.push(e.id + '->' + refId(e.split));
}

/* ---------------------------------------------------- Arenen & Bosse */
const themeCount = {};
const featureTotals = { buildings: 0, cover: 0, poison: 0, speedField: 0, movingWalls: 0 };
for (const a of ARENAS) {
  themeCount[a.theme] = (themeCount[a.theme] || 0) + 1;
  for (const k of Object.keys(featureTotals)) featureTotals[k] += a[k] || 0;
}
const bossesPerArena = {};
for (const a of ARENAS) bossesPerArena[a.id] = 0;
for (const b of BOSSES) if (b.arena in bossesPerArena) bossesPerArena[b.arena]++;
const arenasWithoutBoss = ARENAS.filter((a) => bossesPerArena[a.id] === 0).map((a) => a.id);
const bossPatterns = {};
for (const b of BOSSES) for (const p of b.phases) bossPatterns[p.pattern] = (bossPatterns[p.pattern] || 0) + 1;

/* ------------------------------------------------------------ Referenz */
const REFERENCE = {
  name: 'Brotato (aktueller Patch, alle DLC)',
  asOf: '2026-11-08',
  weapons: 62,
  characters: 44,
  enemies: 83,
  zones: 3,
  wavesPerRun: 20,
  weaponSlots: 6,
  dangerLevels: 6, // Danger 0-5
  maxEnemiesOnScreen: 100,
  coopLocal: 2,
  coopSwitch2: 4,
  items: null, // Store: "hundreds"; keine belastbare Einzelzahl
  sources: [
    'https://brotato.wiki.fextralife.com/FAQ (62 Waffen, 6 Slots, Danger 0-5)',
    'https://psnprofiles.com/guide/18933-brotato-trophy-guide (44 Charaktere)',
    'https://brotato.fandom.com/wiki/Enemies (83 Gegner)',
    'https://brotato.wiki.spellsandguns.com/Enemies (100 Gegner gleichzeitig)',
    'https://www.nintendo.com/au/games/nintendo-switch/brotato (6 Slots, 20-90s, 2P lokal, Barrierefreiheit)',
    'https://www.nintendo.com/au/games/nintendo-switch-2/brotato-nintendo-switch-2-edition (4P lokal)',
  ],
};

/* ------------------------------------------------------------- Pruefung */
const broken = [];
for (const c of CHARS) {
  if (!W_BY.has(c.startWeapon)) broken.push('CHARS ' + c.id + ': Startwaffe ' + c.startWeapon + ' fehlt');
  if (!(c.synergy.cls in classCount)) broken.push('CHARS ' + c.id + ': Synergieklasse ' + c.synergy.cls + ' fehlt');
  if (!c.profile) broken.push('CHARS ' + c.id + ': CharacterProfile fehlt');
}
for (const w of WEAPONS) {
  for (const c of w.cls) if (!(c in classCount)) broken.push('WEAPONS ' + w.id + ': Klasse ' + c + ' fehlt');
  if (!Array.isArray(w.tiers) || w.tiers.length < 1) broken.push('WEAPONS ' + w.id + ': keine Tiers');
}
for (const e of ENEMIES) {
  if (e.summon && !E_BY.has(refId(e.summon))) broken.push('ENEMIES ' + e.id + ': summon ' + refId(e.summon) + ' fehlt');
  if (e.split && !E_BY.has(refId(e.split))) broken.push('ENEMIES ' + e.id + ': split ' + refId(e.split) + ' fehlt');
}
for (const b of BOSSES) {
  if (!A_BY.has(b.arena)) broken.push('BOSSES ' + b.id + ': Arena ' + b.arena + ' fehlt');
  for (const p of b.phases) if (p.summon && !E_BY.has(refId(p.summon))) broken.push('BOSSES ' + b.id + ': summon ' + refId(p.summon) + ' fehlt');
}
for (const it of ITEMS) for (const k of Object.keys(it.stats || {})) {
  if (!(k in statCount)) broken.push('ITEMS ' + it.id + ': Stat ' + k + ' unbekannt');
}

const report = {
  generated: '2026-11-09',
  source: 'data.js',
  counts: {
    chars: CHARS.length, weapons: WEAPONS.length, items: ITEMS.length,
    enemies: CAMPAIGN_ENEMIES.length, baseEnemies: ENEMIES.length, campaignEnemies: CAMPAIGN_ENEMIES.length - ENEMIES.length,
    arenas: ARENAS.length, bosses: BOSSES.length,
    dangers: DANGERS.length, mods: MODS.length, achievements: ACHIEVEMENTS.length,
    contentRecords: CHARS.length + WEAPONS.length + ITEMS.length + CAMPAIGN_ENEMIES.length + ARENAS.length + BOSSES.length + DANGERS.length + MODS.length + ACHIEVEMENTS.length,
  },
  weapons: {
    byClass: classCount, classes: CLASSES.length, underSix,
    monoClassLoadouts: monoLoadouts,
    classPairs: pairs.size, classPairsPossible: choose(CLASSES.length, 2),
    byType: typeCount, tierIssues, locked: unlocked, defaultUnlocked: WEAPONS.length - unlocked,
    avgTiersPrice: Math.round(WEAPONS.reduce((s, w) => s + (w.tiers[0]?.[5] || 0), 0) / WEAPONS.length),
  },
  items: {
    byRarity: rarityCount, cursed, turret, thorns,
    statsCovered, statsTotal: STAT_KEYS.length, uncoveredStats, statCount,
  },
  chars: {
    locked: charsLocked, bySynergyClass: synergyClass, byStartClass: startClass,
    sharedAbilities, synergyUnderSix,
  },
  enemies: {
    byAI: aiCount, aiFamilies: Object.keys(aiCount).length, waves,
    splitOnly, summonRefs, splitRefs,
  },
  arenas: {
    themes: themeCount, features: featureTotals, bossesPerArena, withoutBoss: arenasWithoutBoss,
    bossesPerArenaAvg: Math.round((BOSSES.length / ARENAS.length) * 100) / 100,
  },
  bosses: { patterns: bossPatterns, avgPhases: Math.round(AVG(BOSSES.map((b) => b.phases.length)) * 100) / 100 },
  waveEvents: {
    dangerGate: 3,
    count: Object.keys(WAVE_EVENTS).length,
    waves: Object.entries(WAVE_EVENTS).map(([n, e]) => ({
      wave: Number(n), kind: e.kind, name: e.name, mult: e.mult, eliteRate: e.eliteRate || 0, mat: e.mat,
    })).sort((a, b) => a.wave - b.wave),
  },
  reference: REFERENCE,
  gaps: {
    weapons: REFERENCE.weapons - WEAPONS.length,
    characters: REFERENCE.characters - CHARS.length,
    enemies: REFERENCE.enemies - CAMPAIGN_ENEMIES.length,
    zones: REFERENCE.zones - ARENAS.length,
    dangerLevels: DANGERS.length - REFERENCE.dangerLevels,
    wavesPerRun: 20 - REFERENCE.wavesPerRun,
    slots: 6 - REFERENCE.weaponSlots,
  },
  gates: {
    classesAtLeastSix: underSix.length === 0,
    everyEnemyInCampaign: spawnable.length === ENEMIES.length - splitOnly.length,
    everyArenaHasBoss: arenasWithoutBoss.length === 0,
    uniqueAbilities: sharedAbilities.length === 0,
    allStatsCovered: uncoveredStats.length === 0,
    classPairsAtLeast40: pairs.size >= 40,
  },
  broken,
};

mkdirSync(path.join(ROOT, 'docs', 'pw'), { recursive: true });
writeFileSync(path.join(ROOT, 'docs', 'pw', 'content-scope.json'), JSON.stringify(report, null, 2) + '\n');

console.log('=== Inhalt/Umfang (data.js) ===');
console.log('Charaktere %d | Waffen %d | Items %d | Gegner live %d (%d Basis + %d Kampagne) | Arenen %d | Bosse %d | Gefahren %d | Mods %d | Erfolge %d',
  CHARS.length, WEAPONS.length, ITEMS.length, CAMPAIGN_ENEMIES.length, ENEMIES.length, CAMPAIGN_ENEMIES.length - ENEMIES.length, ARENAS.length, BOSSES.length, DANGERS.length, MODS.length, ACHIEVEMENTS.length);
console.log('Klassen %d | Waffen pro Klasse: %s', CLASSES.length,
  CLASSES.map((c) => c + ' ' + classCount[c]).join(', '));
console.log('Klassen unter 6 Waffen (kein Mono-Klasse-6-Slot-Build): %s',
  underSix.length ? underSix.map((c) => c + ' (' + classCount[c] + ')').join(', ') : 'keine');
console.log('Mono-Klasse-6er-Loadouts: %d | Klassenpaare abgedeckt: %d/%d',
  monoLoadouts, pairs.size, choose(CLASSES.length, 2));
console.log('Tier-Auffaelligkeiten: %s | gesperrt: %d/%d', tierIssues.length ? tierIssues.join(',') : 'keine', unlocked, WEAPONS.length);
console.log('Items: R1 %d, R2 %d, R3 %d, R4 %d | verflucht %d | Tuerme %d | Dornen %d',
  rarityCount[1], rarityCount[2], rarityCount[3], rarityCount[4], cursed, turret, thorns);
console.log('Stat-Abdeckung durch Items: %d/%d%s', statsCovered, STAT_KEYS.length,
  uncoveredStats.length ? ' (ohne: ' + uncoveredStats.join(', ') + ')' : '');
console.log('Charaktere gesperrt: %d | Synergieklassen unter 6 Waffen: %d | geteilte Faehigkeiten: %s',
  charsLocked, synergyUnderSix, sharedAbilities.map(([k, n]) => k + '×' + n).join(', ') || 'keine');
console.log('Gegner-AI-Familien: %d | Basis-Typen Welle 1/5/10/20: %d/%d/%d/%d | nur Split-Spawn: %s',
  Object.keys(aiCount).length, waves[0].types, waves[4].types, waves[9].types, waves[19].types, splitOnly.join(',') || 'keine');
console.log('Arenen ohne Boss: %s | Bosse pro Arena: %s', arenasWithoutBoss.join(',') || 'keine',
  Object.entries(bossesPerArena).map(([k, v]) => k + ':' + v).join(' '));
console.log('Wellen-Events: %d ab Danger %d | %s', Object.keys(WAVE_EVENTS).length, 3,
  Object.entries(WAVE_EVENTS).map(([n, e]) => n + ':' + e.kind).join(' '));
console.log('Brotato-Referenz: %d Waffen, %d Charaktere, %d Gegner, %d Zonen, Danger 0-5, %d Slots',
  REFERENCE.weapons, REFERENCE.characters, REFERENCE.enemies, REFERENCE.zones, REFERENCE.weaponSlots);
const signed = (n) => (n >= 0 ? '+' : '') + n;
console.log('Luecken: Waffen %s, Charaktere %s, Gegner %s', signed(report.gaps.weapons), signed(report.gaps.characters), signed(report.gaps.enemies));
const gateEntries = Object.entries(report.gates);
const open = gateEntries.filter(([, v]) => !v).map(([k]) => k);
console.log('Gates: %d/%d gruen%s', gateEntries.length - open.length, gateEntries.length, open.length ? ' (offen: ' + open.join(', ') + ')' : '');
console.log('Gebrochene Verweise: %d%s', broken.length, broken.length ? '\n  ' + broken.join('\n  ') : '');
console.log('Report: docs/pw/content-scope.json');
process.exit(broken.length ? 1 : 0);
