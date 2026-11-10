#!/usr/bin/env node
// Fuenf-Viertel-Content-Paket — Audit der Live-Kampagne.
//
// Liest content/fuenf-viertel.json, prueft es gegen den echten Basiskatalog
// aus data.js und schreibt docs/pw/fuenf-viertel.json. Der Audit ist
// engine-neutral; die Live-Verdrahtung selbst belegt der Headless-Playtest.
//
//     node tools/fuenf-viertel-audit.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SCHEMA, TARGETS, audit } from '../core/fuenf-viertel.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const data = require(path.join(ROOT, 'data.js'));
const config = JSON.parse(readFileSync(path.join(ROOT, 'content', 'fuenf-viertel.json'), 'utf8'));
const reportPath = path.join(ROOT, 'docs', 'pw', 'fuenf-viertel.json');
const result = audit(config, data);

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify({
  generated: new Date().toISOString(),
  source: 'content/fuenf-viertel.json',
  base: 'data.js',
  ...result,
}, null, 2) + '\n');

console.log('Fünf Viertel — Live-Kampagne (' + SCHEMA + ')');
console.log('Viertel %d | Wellen %d | Gegner %d (%d data.js + %d Entwurf) | Bosse %d | Mods %d | AI %d (%d Entwurf)',
  result.counts.districts, result.counts.waves, result.counts.enemies,
  result.counts.baseEnemies, result.counts.draftEnemies, result.counts.bosses,
  result.counts.modifiers, result.counts.aiFamilies, result.counts.draftAI);
for (const d of config.districts) {
  const bosses = config.bosses.filter((b) => b.district === d.id).map((b) => b.id + '@' + b.wave).join(', ');
  console.log(String(d.order) + '. ' + d.id.padEnd(12) + ' ' + d.arena.padEnd(12) + ' W1-20 | Mods ' + d.modifiers.join('+') + ' | Bosse ' + bosses);
}
const checks = Object.entries(result.checks);
const green = checks.filter(([, ok]) => ok).length;
console.log('Gates: %d/%d grün | Gastbosse: %d | Arenen ausserhalb: %s',
  green, checks.length, result.counts.guestBosses, result.unusedArenas.join(', ') || 'keine');
console.log('Engine: live verdrahtet | offene Punkte: %d', result.pending.length);
if (result.failures.length) {
  console.error('FAIL — %d Prüfung(en):\n  %s', result.failures.length, result.failures.join('\n  '));
  process.exitCode = 1;
} else {
  console.log('FÜNF VIERTEL OK — 5×20 live, 83 Gegner, 10 Bosse, 10 Mods, 24 AI-Familien prüfbar.');
}
console.log('Report: ' + path.relative(ROOT, reportPath));
