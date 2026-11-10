// Tests fuer core/stadtgeschichte.mjs gegen den echten Item-Katalog.
//   node --test tools/content-stadtgeschichte.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMA, validate, emptyState, evolve, evoId, tierStats, tierCost,
} from '../core/stadtgeschichte.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const data = require(path.join(ROOT, 'data.js'));
const items = new Map(data.ITEMS.map((i) => [i.id, i]));
const config = JSON.parse(readFileSync(path.join(ROOT, 'content', 'stadtgeschichte.json'), 'utf8'));
const line = (id) => config.lines.find((l) => l.id === id);
const withItems = (...ids) => {
  const owned = {};
  for (const id of ids) owned[id] = (owned[id] || 0) + 1;
  return { owned, levels: {} };
};
const snap = (s) => JSON.parse(JSON.stringify(s));

test('Linien-Datei ist gegen Katalog und Stats gueltig', () => {
  assert.deepEqual(validate(config, items, data.STAT_KEYS), []);
});

test('sieben Linien, 14 eindeutige Basisteile', () => {
  assert.equal(config.lines.length, 7);
  const parts = config.lines.flatMap((l) => l.parts);
  assert.equal(parts.length, 14);
  assert.equal(new Set(parts).size, 14);
  assert.deepEqual(config.milestones, [5, 10, 15]);
});

test('Welle 4 aendert nichts', () => {
  const r = evolve(emptyState(), 4, config, items);
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.state, emptyState());
});

test('Welle 5 verschmilzt beide Teile und verbraucht sie', () => {
  const before = withItems('kaffee', 'verband');
  const copy = snap(before);
  const { state, events } = evolve(before, 5, config, items);
  assert.equal(events.length, 1);
  assert.equal(events[0].lineId, 'fruehstueck');
  assert.equal(events[0].tier, 1);
  assert.equal(state.levels.fruehstueck, 1);
  assert.equal(state.owned.kaffee, undefined);
  assert.equal(state.owned.verband, undefined);
  assert.equal(state.owned[evoId('fruehstueck', 1)], 1);
  assert.deepEqual(before, copy, 'Eingabezustand darf nicht mutiert werden');
});

test('ohne beide Teile keine Evolution', () => {
  const r = evolve(withItems('kaffee'), 5, config, items);
  assert.deepEqual(r.events, []);
  assert.equal(r.state.owned.kaffee, 1);
});

test('Stufe 2 verbraucht das Evolutions-Item der Vorstufe', () => {
  const start = { owned: { [evoId('fruehstueck', 1)]: 1 }, levels: { fruehstueck: 1 } };
  const { state, events } = evolve(start, 10, config, items);
  assert.equal(events[0].tier, 2);
  assert.equal(state.owned[evoId('fruehstueck', 1)], undefined);
  assert.equal(state.owned[evoId('fruehstueck', 2)], 1);
  assert.equal(state.levels.fruehstueck, 2);
});

test('Stufe 3 bei Welle 15, danach keine weitere Evolution', () => {
  let s = withItems('kaffee', 'verband');
  s = evolve(s, 5, config, items).state;
  s = evolve(s, 10, config, items).state;
  s = evolve(s, 15, config, items).state;
  assert.equal(s.levels.fruehstueck, 3);
  assert.equal(evolve(s, 15, config, items).events.length, 0);
  assert.equal(evolve(s, 20, config, items).events.length, 0);
});

test('Aufholregel: Welle 10 startet auf Stufe 1, Welle 15 bringt nur Stufe 2', () => {
  let s = withItems('kaffee', 'verband');
  s = evolve(s, 10, config, items).state;
  assert.equal(s.levels.fruehstueck, 1);
  s = evolve(s, 15, config, items).state;
  assert.equal(s.levels.fruehstueck, 2);
});

test('Reihenfolge der Items aendert das Ergebnis nicht', () => {
  const a = withItems('kaffee', 'verband', 'helm', 'handschuh');
  const b = { owned: { handschuh: 1, verband: 1, helm: 1, kaffee: 1 }, levels: {} };
  const ra = evolve(a, 5, config, items);
  const rb = evolve(b, 5, config, items);
  assert.deepEqual(ra.state, rb.state);
  assert.deepEqual(ra.events.map((e) => e.lineId), ['feuerwehr', 'fruehstueck']);
});

test('derselbe Zustand ergibt zweimal dasselbe Ergebnis', () => {
  const s = withItems('kaffee', 'verband', 'helm', 'handschuh');
  assert.deepEqual(evolve(s, 5, config, items), evolve(s, 5, config, items));
});

test('Stats summieren Basisteile und Stufenbonus, Preis stimmt', () => {
  const l = line('fruehstueck');
  const t1 = tierStats(l, 1, items);
  assert.equal(t1.speed, 10); // Kaffee 6 + Bonus 4
  assert.equal(t1.maxHp, 18); // Verband 10 + Bonus 8
  assert.equal(t1.hpRegen, 2);
  assert.equal(t1.atkSpd, 4); // Kaffee 4
  const t3 = tierStats(l, 3, items);
  assert.ok(t3.maxHp > t1.maxHp && t3.speed > t1.speed);
  assert.equal(tierCost(l, 1, items), 70); // 20 + 20 + 30
  assert.equal(tierCost(l, 3, items), 170);
});

test('Validierung faengt Schema-, Wellen-, ID- und Teilefehler', () => {
  const bad = {
    schema: 'falsch',
    milestones: [10, 5],
    lines: [
      { id: 'x', parts: ['kaffee', 'kaffee'], tiers: [{ name: 'a', premium: 1, stats: { nope: 1 } }] },
      { id: 'x', parts: ['kaffee', 'verband'], tiers: [{ name: 'a', premium: 1, stats: { speed: 1 } }] },
    ],
  };
  const errs = validate(bad, items, data.STAT_KEYS);
  assert.ok(errs.some((e) => e.includes('schema')));
  assert.ok(errs.some((e) => e.includes('Wellen')));
  assert.ok(errs.some((e) => e.includes('doppelt')));
  assert.ok(errs.some((e) => e.includes('zwei verschiedene')));
  assert.ok(errs.some((e) => e.includes('drei Stufen')));
});

test('Evolutions-IDs sind stabil und lesbar', () => {
  assert.equal(evoId('rhein', 2), 'evo_rhein_2');
  assert.equal(SCHEMA, 'wbn-stadtgeschichte/1');
});
