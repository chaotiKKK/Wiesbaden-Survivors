#!/usr/bin/env node
//
// Wiesbaden Survivors — export the BalanceSim as a fixed reference file.
//
// The UE 5.8 rebuild (docs/ue58-portierungsplan-2026-09-16.md) has to reproduce
// the HTML game's balance. This freezes what the HTML game computes into
// reference/balance-reference.json, so the rebuild can be checked against numbers
// instead of against memory.
//
// It runs the REAL BalanceSim in headless Edge (the shipped code, not a port) and
// exports, at full double precision and in id order:
//   exact        — values with no randomness: per weapon and tier the terms of the
//                  DPS formula and its expected value; attachments; enemy threat;
//                  boss time-to-kill. The rebuild must match these to rounding.
//   monteCarlo   — sampled values: measured weapon DPS, character win rates,
//                  character x weapon pairs. Exact only if the rebuild reproduces
//                  mulberry32 and the draw order; otherwise within the exported
//                  standard error.
//
// The expected DPS mirrors BalanceSim.weaponDPS without the RNG. So that mirror
// can never silently drift from the sim, every sampled DPS is checked against it:
// |z| = |measured - expected| / stderr must stay below Z_MAX, or the export fails.
//
// The simulation is deterministic (isolated seeded streams per weapon and per
// character, no Math.random, no save/options state), so the same game always
// yields the same file.
//
// Usage:
//   node tools/export-balance-reference.mjs            write the reference
//   node tools/export-balance-reference.mjs --check    recompute, compare, exit 1 on drift

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { EDGE_PATH, repoRoot, argOf, startStaticServer, launchEdge, killScratchEdges, connectPageCdp } from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const argv = process.argv.slice(2);
const OUT = path.resolve(ROOT, argOf(argv, '--out', 'reference/balance-reference.json'));
const CHECK = argv.includes('--check');
const ITERS = 10000;          // same run size the gate uses
const Z_MAX = 5;              // 168 weapon/tier samples: |z| >= 5 by chance is ~1e-4

const REF_JS = `(() => {
  const S = BalanceSim, ITERS = ${ITERS};
  const data = S.compute(ITERS);
  const st = S.refStats(14);
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const nonZero = (o) => { const r = {}; for (const k of Object.keys(o)) if (o[k]) r[k] = o[k]; return r; };

  /* Mirror of BalanceSim.weaponDPS without the RNG: E[dps] per tier. */
  const tierTerms = (def, tier, n, mc) => {
    const t = tierData(def, tier), x = t.x;
    let base = t.dmg;
    for (const k in def.scaling) base += (st[k] || 0) * def.scaling[k];
    base *= (1 + st.dmgP / 100);
    if (def.type === 'charge') base *= (1 + (x.chargeMax || 2)) / 2;
    const critC = clamp(t.critC + st.crit / 100, 0, .95), critM = t.critM * (1 + st.critDmg / 100);
    const cd = Math.max(.045, t.as / (1 + st.atkSpd / 100));
    const hits = S.hitsPerAttack(def, x);
    let react = 1;
    if (def.type === 'chain') react = Combat.chainFactor(x);
    else if (x.boom) react = Combat.boomFactor();
    else if (def.type === 'cone' && x.elemental) react = 1 + Combat.chainReact();
    const dot = Combat.burnDps(x, st, hits);
    const r = Math.max(1, Math.round(hits));
    const scale = base * react / cd * hits / r;
    const stderr = Math.sqrt(r * critC * (1 - critC)) * (critM - 1) * scale / Math.sqrt(n);
    return {
      tier: tier + 1, tierDamage: t.dmg, attackInterval: t.as, baseDamage: base,
      critChance: critC, critMultiplier: critM, cooldown: cd, hitsPerAttack: hits,
      reactionFactor: react, burnDps: dot,
      expectedDps: hits * base * (1 + critC * (critM - 1)) * react / cd + dot,
      measuredDps: mc, measuredStderr: stderr
    };
  };

  const rowById = {};
  for (const r of data.rows) rowById[r.def.id] = { r, basis: 'type-average' };
  for (const r of data.legRows) rowById[r.def.id] = { r, basis: 'standard-average' };
  const weapons = WEAPONS.slice().sort(byId).map((def) => {
    const e = rowById[def.id];
    return {
      id: def.id, name: def.name, type: def.type, legendary: !!def.legendary, seed: S.weaponSeed(def.id),
      deviationPct: e.r.dev, deviationBasis: e.basis,
      tiers: [0, 1, 2, 3].map((t) => tierTerms(def, t, data.meta.perWeapon, e.r.d[t]))
    };
  });

  /* Deterministic counterparts of the sim's sampled averages: same grouping
     (non-legendary weapons, T3), expectedDps instead of measured DPS. */
  const std = weapons.filter((w) => !w.legendary);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const expT3 = (w) => w.tiers[2].expectedDps;
  const expectedTypeAvg = {};
  for (const w of std) (expectedTypeAvg[w.type] = expectedTypeAvg[w.type] || []).push(expT3(w));
  for (const g in expectedTypeAvg) expectedTypeAvg[g] = mean(expectedTypeAvg[g]);
  const smg = weapons.find((w) => w.id === 'smg') || weapons[0];
  const attBaseExpected = expT3(smg);

  const runs = data.meta.runsPerChar;
  const characters = data.chars.map((c) => {
    const p = c.wr / 100;
    return { id: c.c.id, name: c.c.name, seed: S.weaponSeed(c.c.id), runs: runs,
      winRatePct: c.wr, winRateStderrPct: Math.sqrt(p * (1 - p) / runs) * 100, avgWave: c.avgWave };
  }).sort(byId);

  return {
    config: {
      iterations: ITERS, perWeaponIterations: data.meta.perWeapon, runsPerCharacter: runs,
      referenceBuild: { level: 14, stats: nonZero(st) },
      characterRuns: { dangerIndex: 2, danger: DANGERS[2], waves: 20 },
      pairIterations: 60,
      rng: { algorithm: 'mulberry32',
             seed: 'x = 0; for each UTF-16 code unit c of the id: x = (x * 31 + c) >>> 0; seed = x || 1',
             streams: 'one isolated stream per weapon (reseeded per weapon, all four tiers in order) and per character (seeded once, continuous over its runs); attachments and the smg base use weaponSeed("smg")' }
    },
    exact: {
      standardAverageT3ExpectedDps: mean(std.map(expT3)),
      typeAverageT3ExpectedDps: expectedTypeAvg,
      weaponTiers: weapons.map((w) => ({ id: w.id, tiers: w.tiers.map((t) => {
        const o = Object.assign({}, t); delete o.measuredDps; delete o.measuredStderr; return o; }) })),
      attachmentBaseExpectedDps: attBaseExpected,
      attachments: data.attRows.map((r) => ({ id: r.a.id, name: r.a.name, dps: r.dps,
        deviationFromExpectedPct: (r.dps / attBaseExpected - 1) * 100 })).sort(byId),
      enemies: data.thr.map((r) => ({ id: r.e.id, name: r.e.name, threat: r.score, value: r.value, deviationPct: r.dev })).sort(byId),
      bosses: data.bossRows.map((r) => ({ id: r.B.id, name: r.B.name, wave: r.bWave, hp: r.B.hp,
        timeToKillSeconds: r.ttk, inTargetWindow: r.ok })).sort(byId)
    },
    monteCarlo: {
      standardAverageT3Dps: data.meta.avg,
      typeAverageT3Dps: data.gAvg,
      attachmentBaseDps: data.attRows.length ? data.attRows[0].dps / (1 + data.attRows[0].dev / 100) : null,
      attachmentDeviationPct: data.attRows.map((r) => ({ id: r.a.id, deviationPct: r.dev })).sort(byId),
      weapons: weapons.map((w) => ({ id: w.id, name: w.name, type: w.type, legendary: w.legendary, seed: w.seed,
        deviationPct: w.deviationPct, deviationBasis: w.deviationBasis,
        tiers: w.tiers.map((t) => ({ tier: t.tier, measuredDps: t.measuredDps, measuredStderr: t.measuredStderr })) })),
      characters: characters,
      pairs: data.pairs.map((p) => ({ id: p.c.id, bestWeapon: p.best.w.id, bestDps: p.best.d,
        worstWeapon: p.worst.w.id, worstDps: p.worst.d, spread: p.spread })).sort(byId)
    },
    summary: { weaponOutliers: data.outliers, attachmentOutliers: data.attOut, bossesOutsideWindow: data.bossOut,
      charactersInWinBand: data.charOk, characterCount: data.chars.length },
    _selfCheck: weapons.map((w) => w.tiers.map((t) => ({ id: w.id, tier: t.tier, e: t.expectedDps, m: t.measuredDps, s: t.measuredStderr }))).flat(),
    _engine: navigator.userAgent
  };
})()`;

const git = (...a) => (spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }).stdout || '').trim();

async function compute() {
  const server = await startStaticServer(ROOT);
  killScratchEdges('wsref-edge-');
  const edge = await launchEdge({ profilePrefix: 'wsref-edge-' });
  let conn = null;
  try {
    if (!edge.ok) throw new Error('headless Edge did not start');
    conn = await connectPageCdp(edge.port);
    await conn.cdp('Page.enable'); await conn.cdp('Runtime.enable');
    await conn.cdp('Page.navigate', { url: server.url + '/index.html?devsim&cb=ref' + Date.now() }, 20000);
    for (let i = 0; i < 80; i++) {
      try { if (await conn.ev("typeof BalanceSim === 'object' && typeof WEAPONS === 'object' && document.readyState === 'complete'")) break; } catch { /* loading */ }
      await new Promise(r => setTimeout(r, 300));
    }
    return await conn.ev(REF_JS, 180000);
  } finally {
    if (conn) conn.close();
    edge.kill();
    server.close();
  }
}

const res = await compute();

// ---- self-check: the exact mirror must explain every sampled DPS --------------
let worst = { z: 0 };
for (const c of res._selfCheck) {
  const z = c.s > 0 ? Math.abs(c.m - c.e) / c.s : (Math.abs(c.m - c.e) <= 1e-9 * Math.max(1, Math.abs(c.e)) ? 0 : Infinity);
  if (z > worst.z) worst = { z, id: c.id, tier: c.tier };
}
if (!(worst.z < Z_MAX)) {
  console.error('FAIL  expected-DPS mirror no longer matches BalanceSim.weaponDPS: |z| = ' + worst.z.toFixed(2)
    + ' at ' + worst.id + ' T' + worst.tier + ' (limit ' + Z_MAX + ') — update tierTerms() in this exporter');
  process.exit(1);
}
const engine = res._engine;
delete res._selfCheck; delete res._engine;

const doc = {
  schema: 'wbns-balance-reference/1',
  about: 'BalanceSim of the HTML game, frozen as the reference the UE 5.8 rebuild is checked against. '
    + 'Regenerate with node tools/export-balance-reference.mjs; see reference/README.md for how to compare.',
  provenance: {
    commit: git('rev-parse', 'HEAD'),
    indexHtmlBlob: git('hash-object', 'index.html'),
    dataJsBlob: git('hash-object', 'data.js'),
    sourceDirty: git('status', '--porcelain', '--', 'index.html', 'data.js') !== '',
    selfCheckMaxAbsZ: +worst.z.toFixed(3),
    engine: engine
  },
  tolerances: {
    exact: { relative: 1e-9, note: 'deterministic formulas; differences can only come from operation order or pow/exp implementations' },
    monteCarlo: {
      bitExact: 'if mulberry32, the seeds and the draw order are reproduced, measured values must match to rounding',
      statistical: 'otherwise |measured - expected| <= 5 * measuredStderr per weapon tier, and |winRate - reference| <= 5 * winRateStderrPct (both sides sample, so a combined stderr of sqrt(2) times this is the strict bound)',
      pairs: 'informational: 60 samples per weapon, close weapons can swap best/worst',
      averages: 'standardAverageT3Dps, typeAverageT3Dps and attachmentDeviationPct are built from sampled DPS, exactly as the game shows them; their deterministic counterparts are exact.standardAverageT3ExpectedDps, exact.typeAverageT3ExpectedDps and exact.attachments[].deviationFromExpectedPct'
    },
    summary: {
      note: 'outlier and win-band counts are derived from sampled values (the verdicts the game itself shows); informational, a value right at a band edge can flip'
    }
  },
  config: res.config,
  exact: res.exact,
  monteCarlo: res.monteCarlo,
  summary: res.summary
};

if (CHECK) {
  if (!existsSync(OUT)) { console.error('FAIL  no reference at ' + path.relative(ROOT, OUT)); process.exit(1); }
  const ref = JSON.parse(readFileSync(OUT, 'utf8'));
  const drift = [];
  for (const k of ['config', 'exact', 'monteCarlo', 'summary']) {
    if (JSON.stringify(ref[k]) !== JSON.stringify(doc[k])) drift.push(k);
  }
  if (drift.length) {
    console.error('FAIL  current game differs from the reference in: ' + drift.join(', ')
      + ' — a balance change? Regenerate deliberately with node tools/export-balance-reference.mjs');
    process.exit(1);
  }
  console.log('PASS  the current game reproduces ' + path.relative(ROOT, OUT) + ' exactly (self-check max |z| ' + worst.z.toFixed(2) + ')');
  process.exit(0);
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
const w = doc.monteCarlo.weapons.length, c = doc.monteCarlo.characters.length;
console.log('wrote ' + path.relative(ROOT, OUT) + ': ' + w + ' weapons x 4 tiers, ' + c + ' characters, '
  + doc.exact.attachments.length + ' attachments, ' + doc.exact.enemies.length + ' enemies, ' + doc.exact.bosses.length + ' bosses'
  + ' | self-check max |z| ' + worst.z.toFixed(2) + ' (limit ' + Z_MAX + ')');