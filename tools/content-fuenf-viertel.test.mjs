// Tests fuer content/fuenf-viertel.json gegen data.js.
//   node --test tools/content-fuenf-viertel.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMA, TARGETS, DRAFT_AI, audit, mergeEnemies, wavePlan,
} from '../core/fuenf-viertel.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const data = require(path.join(ROOT, 'data.js'));
const rawConfig = readFileSync(path.join(ROOT, 'content', 'fuenf-viertel.json'), 'utf8');
const config = JSON.parse(rawConfig);
const mirror = require(path.join(ROOT, 'content', 'fuenf-viertel.data.js'));
const rawMirror = readFileSync(path.join(ROOT, 'content', 'fuenf-viertel.data.js'), 'utf8');
const report = audit(config, data);
const clone = (v) => JSON.parse(JSON.stringify(v));

test('Live-Paket ist gegen den Basiskatalog gueltig', () => {
  assert.equal(report.pass, true, report.failures.join('\n'));
  assert.deepEqual(report.failures, []);
  assert.equal(report.schema, SCHEMA);
  assert.equal(report.status, 'live');
  assert.equal(report.engineWired, true);
});

test('5 Viertel x 20 Wellen ergeben 100 globale Wellen', () => {
  assert.equal(config.districts.length, TARGETS.districts);
  for (const d of config.districts) assert.equal(d.waves.length, TARGETS.wavesPerDistrict);
  const plan = wavePlan(config);
  assert.equal(plan.length, TARGETS.totalWaves);
  assert.deepEqual(plan.map((w) => w.globalWave), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.ok(plan.every((w) => w.enemies.length >= 5 && w.enemies.length <= 6));
});

test('jede Welle 1 hat fuenf Gegnertypen', () => {
  const first = wavePlan(config).filter((w) => w.localWave === 1);
  assert.equal(first.length, 5);
  for (const w of first) assert.equal(w.enemies.length, 5, w.district);
});

test('Wellenform: 1-4 fuenf, 5-20 sechs Gegnertypen', () => {
  for (const d of config.districts) {
    for (const w of d.waves) {
      assert.equal(w.enemies.length, w.wave <= 4 ? 5 : 6, d.id + ' W' + w.wave);
    }
  }
  assert.equal(report.checks.waveShape, true);
});

test('83 Gegner: 51 aus data.js plus 32 Entwurf, eindeutig', () => {
  const catalog = mergeEnemies(config, data);
  assert.equal(catalog.baseCount, 51);
  assert.equal(catalog.draftCount, 32);
  assert.equal(catalog.all.length, 83);
  assert.equal(catalog.byId.size, 83);
  assert.deepEqual(catalog.duplicates, []);
  assert.equal(config.enemies.length, 32);
  assert.equal(new Set(config.enemies.map((e) => e.id)).size, 32);
});

test('jeder spawnbare Gegner kommt im Plan vor, Split-only nicht', () => {
  const catalog = mergeEnemies(config, data);
  const plan = wavePlan(config);
  const used = new Set(plan.flatMap((w) => w.enemies));
  const spawnable = catalog.all.filter((e) => (e.minW || 1) <= 20);
  const splitOnly = catalog.all.filter((e) => (e.minW || 1) > 20);
  assert.equal(spawnable.length, 82);
  assert.equal(splitOnly.length, 1);
  assert.deepEqual(spawnable.filter((e) => !used.has(e.id)).map((e) => e.id), []);
  assert.deepEqual(splitOnly.filter((e) => used.has(e.id)).map((e) => e.id), []);
  assert.deepEqual(splitOnly.map((e) => e.id), ['shardling']);
});

test('10 Bosse: zwei pro Viertel, Welle 10 und 20, alle vorhanden', () => {
  assert.equal(config.bosses.length, 10);
  assert.equal(new Set(config.bosses.map((b) => b.id)).size, 10);
  assert.deepEqual([...new Set(config.bosses.map((b) => b.id))].sort(), data.BOSSES.map((b) => b.id).sort());
  for (const d of config.districts) {
    const assigned = config.bosses.filter((b) => b.district === d.id);
    assert.equal(assigned.length, 2, d.id);
    assert.deepEqual(assigned.map((b) => b.wave).sort((a, b) => a - b), [10, 20], d.id);
    assert.equal(d.waves.find((w) => w.wave === 10).boss, assigned.find((b) => b.wave === 10).id);
    assert.equal(d.waves.find((w) => w.wave === 20).boss, assigned.find((b) => b.wave === 20).id);
  }
  assert.ok(report.counts.guestBosses >= 0);
});

test('10 Modifikatoren: zwei pro Viertel, Effekte im erlaubten Schema', () => {
  assert.equal(config.modifiers.length, 10);
  assert.equal(new Set(config.modifiers.map((m) => m.id)).size, 10);
  for (const d of config.districts) {
    const mods = config.modifiers.filter((m) => m.district === d.id);
    assert.equal(mods.length, 2, d.id);
    for (const m of mods) {
      assert.ok(Object.keys(m.effects).length > 0);
      for (const target of Object.keys(m.effects)) assert.ok(['player', 'enemy', 'world'].includes(target));
    }
  }
});

test('24 AI-Familien: 19 aus data.js plus fuenf Entwurf, jede mindestens zweimal genutzt', () => {
  const baseAI = new Set(data.ENEMIES.map((e) => e.ai));
  assert.equal(baseAI.size, 19);
  assert.equal(config.aiFamilies.length, 5);
  assert.deepEqual(config.aiFamilies.map((a) => a.id).sort(), [...DRAFT_AI].sort());
  const all = new Set([...baseAI, ...config.aiFamilies.map((a) => a.id)]);
  assert.equal(all.size, 24);
  for (const id of DRAFT_AI) {
    const usage = config.enemies.filter((e) => e.ai === id).length;
    assert.ok(usage >= 2, id + ' nur ' + usage + 'x');
  }
  assert.equal(new Set(config.enemies.map((e) => e.ai)).size, 9);
});

test('Referenzen, Mindestwellen und Wellenlaenge sind konsistent', () => {
  const catalog = mergeEnemies(config, data);
  for (const d of config.districts) {
    for (const w of d.waves) {
      assert.equal(new Set(w.enemies).size, w.enemies.length);
      for (const id of w.enemies) {
        const e = catalog.byId.get(id);
        assert.ok(e, d.id + ' W' + w.wave + ': ' + id);
        assert.ok(e.minW <= w.wave, d.id + ' W' + w.wave + ': ' + id + ' ab ' + e.minW);
      }
    }
  }
});

test('derselbe Entwurf ergibt zweimal denselben Report', () => {
  assert.deepEqual(audit(config, data), audit(config, data));
  assert.deepEqual(wavePlan(config), wavePlan(config));
});

test('Validierung faengt Schema-, Gegner-, Boss- und Wellenfehler', () => {
  const broken = clone(config);
  broken.schema = 'falsch';
  broken.enemies[0].id = 'runner';
  broken.bosses[0].wave = 9;
  broken.districts[0].waves[0].enemies[0] = 'gibt_es_nicht';
  broken.districts[0].waves[1].enemies.pop();
  const failures = audit(broken, data).failures;
  assert.ok(failures.some((e) => e.includes('schema')));
  assert.ok(failures.some((e) => e.includes('kollidiert')));
  assert.ok(failures.some((e) => e.includes('wave muss 10 oder 20')));
  assert.ok(failures.some((e) => e.includes('Gegner fehlt')));
  assert.ok(failures.some((e) => e.includes('genau 5 Gegnertypen')));
});

test('Basis-Katalog und Entwurf werden nicht mutiert', () => {
  const beforeBase = JSON.stringify([data.ENEMIES, data.ARENAS, data.BOSSES]);
  const beforeConfig = JSON.stringify(config);
  audit(config, data);
  assert.equal(JSON.stringify([data.ENEMIES, data.ARENAS, data.BOSSES]), beforeBase);
  assert.equal(JSON.stringify(config), beforeConfig);
});

test('Live-Paket ist in data.js und im Browser-Mirror verdrahtet', () => {
  assert.equal(report.engineWired, true);
  assert.equal(report.draftOnly, false);
  assert.equal(config.pending.length, 0);
  assert.equal(report.checks.liveStatus, true);
  assert.equal(report.checks.noPending, true);
  assert.equal(data.FUENF_VIERTEL.status, 'live');
  assert.equal(data.CAMPAIGN_ENEMIES.length, 83);
  assert.equal(data.CAMPAIGN_ENEMY_BY_ID.wuehlmaus.ai, 'burrower');
  assert.deepEqual(mirror, config);
  const hash = createHash('sha256').update(rawConfig).digest('hex');
  assert.ok(rawMirror.includes('sha256: ' + hash), 'Browser-Mirror ist nicht auf dem JSON-Stand');
});
