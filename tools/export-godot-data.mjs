#!/usr/bin/env node
//
// Export the live data.js registries into the Godot project.
//
// The browser source stays authoritative.  This exporter is intentionally
// read-only for data.js and only writes godot/data/game_data.json (or --out).
// It keeps the full character/weapon/item/enemy registries available to the
// Godot runtime, even when a vertical slice only displays a subset.
//
// Usage:
//   node tools/export-godot-data.mjs
//   node tools/export-godot-data.mjs --check
//   node tools/export-godot-data.mjs --out godot/data/game_data.json

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = path.resolve(ROOT, argOf('--out', 'godot/data/game_data.json'));
const CHECK = argv.includes('--check');

const d = require('../data.js');

const payload = {
  schema: 'wbn-godot/1',
  source: 'data.js',
  rules: d.BROTATO_RULES,
  waveEvents: d.WAVE_EVENTS || {},
  mods: d.MODS || [],
  runUpgrades: (d.RUN_UPGRADES || []).map(u => ({
    id: u.id, name: u.name, col: u.col, desc: u.desc,
    basePrice: u.basePrice, priceStep: u.priceStep, maxStacks: u.maxStacks,
    stats: u.stats
  })),
  chars: d.CHARS,
  weapons: d.WEAPONS,
  items: d.ITEMS,
  enemies: d.CAMPAIGN_ENEMIES || d.ENEMIES,
  baseEnemies: d.ENEMIES,
  bosses: d.BOSSES,
  arenas: d.ARENAS,
  dangers: d.DANGERS,
  campaign: d.FUENF_VIERTEL ? {
    schema: d.FUENF_VIERTEL.schema,
    status: d.FUENF_VIERTEL.status,
    campaign: d.FUENF_VIERTEL.campaign,
    districts: (d.FUENF_VIERTEL.districts || []).map(x => ({
      id: x.id, name: x.name, arena: x.arena, mods: x.mods
    }))
  } : null
};

const expected = {
  chars: d.CHARS.length,
  weapons: d.WEAPONS.length,
  items: d.ITEMS.length,
  enemies: (d.CAMPAIGN_ENEMIES || d.ENEMIES).length,
  bosses: d.BOSSES.length,
  arenas: d.ARENAS.length,
  runUpgrades: (d.RUN_UPGRADES || []).length,
  dangers: d.DANGERS.length
};
for (const [key, count] of Object.entries(expected)) {
  const got = Array.isArray(payload[key]) ? payload[key].length : -1;
  if (got !== count) throw new Error(`${key}: export ${got} != live ${count}`);
}
if (!payload.rules || !Number.isFinite(payload.rules.maxEnemiesOnScreen)) {
  throw new Error('rules.maxEnemiesOnScreen missing');
}
if (payload.rules.maxEnemiesOnScreen !== 100) {
  throw new Error('rules.maxEnemiesOnScreen is not 100 (live parity drift)');
}
const eventCount = Object.keys(payload.waveEvents || {}).length;
const bossEscorts = d.DANGERS.reduce((sum, row) => sum + Number(row.bossEscort || 0), 0);
if (!Number.isFinite(bossEscorts) || bossEscorts <= 0) {
  throw new Error('DANGERS.bossEscort missing (danger boss reinforcement)');
}
if ((payload.runUpgrades || []).length < 1) {
  throw new Error('RUN_UPGRADES missing (workshop orders)');
}
for (const u of payload.runUpgrades) {
  if (!u.id || !u.stats || !Number.isFinite(u.basePrice) || !Number.isFinite(u.maxStacks)) {
    throw new Error(`RUN_UPGRADES entry invalid: ${u.id || '?'}`);
  }
}

const text = JSON.stringify(payload, null, 2) + '\n';
if (CHECK) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  if (current !== text) {
    console.error(`FAIL  ${path.relative(ROOT, OUT)} is stale; run node tools/export-godot-data.mjs`);
    process.exitCode = 1;
  } else {
    console.log(`OK    ${path.relative(ROOT, OUT)} (${text.length} bytes, ${expected.chars} chars, ${expected.weapons} weapons, ${expected.items} items, ${expected.enemies} enemies, ${expected.runUpgrades} workshop orders, ${expected.dangers} dangers, ${eventCount} events, ${bossEscorts} boss escorts)`);
  }
} else {
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`WROTE ${path.relative(ROOT, OUT)}`);    console.log(`      ${expected.chars} chars, ${expected.weapons} weapons, ${expected.items} items, ${expected.enemies} enemies, ${expected.bosses} bosses, ${expected.arenas} arenas, ${expected.runUpgrades} workshop orders, ${expected.dangers} dangers, ${bossEscorts} boss escorts`);
}
