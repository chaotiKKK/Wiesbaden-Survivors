#!/usr/bin/env node
//
// Stadtgeschichte — rule-core integration and balance proof.
//
// 1. Data parity: data.js STADTGESCHICHTE must equal
//    content/stadtgeschichte.json, and core/stadtgeschichte.mjs must validate
//    it against the real item catalog.
// 2. Core/engine parity: the in-game Stadtgeschichte object (index.html) is
//    compared against the Node core for a matrix of states, waves, lines and
//    tier stats/costs. Both must be byte-identical.
// 3. Real flow: Game.startRun() on danger 2, the two parts of the Kurhaus
//    line are bought, then Game.endWave() runs at waves 5, 10 and 15 through
//    the normal wave/shop transition. Items must be consumed, tiers must rise,
//    stats must change by exactly the core's tier delta and the shop must open.
// 4. Balance against the weapon meta: BalanceSim.stadtClassReport() measures
//    the strongest completed line per weapon class against the median weapon
//    tier (+25% corridor: two parts + three premiums, but never two tiers).
//    BalanceSim.stadtRunReport() measures paired win rates per line; the
//    survival model saturates near 16.8 waves, so a line must add >= 0.4 waves
//    and may not exceed the model ceiling (4.5).
//
// Usage: node tools/stadtgeschichte-balance.mjs
// Writes docs/pw/stadtgeschichte-balance.json, exits non-zero on a regression.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp
} from './lib/harness.mjs';
import { validate, evolve, tierStats, tierCost } from '../core/stadtgeschichte.mjs';

const ROOT = repoRoot(import.meta.url);
const require = createRequire(import.meta.url);
const data = require(path.join(ROOT, 'data.js'));
const items = new Map(data.ITEMS.map(i => [i.id, i]));
const cfg = JSON.parse(readFileSync(path.join(ROOT, 'content', 'stadtgeschichte.json'), 'utf8'));
const REPORT_PATH = path.join(ROOT, 'docs', 'pw', 'stadtgeschichte-balance.json');
const SEED = 0x57ad7;
const LINE = 'fruehstueck';

const stable = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {})
  : x);

const clean = { schema: cfg.schema, milestones: cfg.milestones, lines: cfg.lines };
const cases = [
  { wave: 4, state: { owned: { kaffee: 1, verband: 1 }, levels: {} } },
  { wave: 5, state: { owned: { kaffee: 1, verband: 1 }, levels: {} } },
  { wave: 10, state: { owned: { evo_fruehstueck_1: 1 }, levels: { fruehstueck: 1 } } },
  { wave: 15, state: { owned: { evo_fruehstueck_2: 1 }, levels: { fruehstueck: 2 } } },
  { wave: 5, state: { owned: { kaffee: 1 }, levels: {} } },
  { wave: 5, state: { owned: { kaffee: 2, verband: 1, helm: 1, handschuh: 1 }, levels: {} } },
  { wave: 10, state: { owned: Object.fromEntries(cfg.lines.flatMap(l => l.parts).map(p => [p, 1])), levels: {} } },
];
const expected = cases.map(c => stable(evolve(c.state, c.wave, cfg, items)));
const tiers = [];
for (const l of cfg.lines) for (const t of [1, 2, 3]) {
  tiers.push({ line: l.id, tier: t, expected: stable({ s: tierStats(l, t, items), c: tierCost(l, t, items) }) });
}
const line = cfg.lines.find(l => l.id === LINE);
const t1 = tierStats(line, 1, items), t2 = tierStats(line, 2, items), t3 = tierStats(line, 3, items);
const delta = (a, b) => { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = (b[k] || 0) - (a[k] || 0); return o; };
const expectedDeltas = { t1: line.tiers[0].stats, t2: delta(t1, t2), t3: delta(t2, t3) };
const KEYS = [...new Set([...Object.keys(t1), ...Object.keys(t2), ...Object.keys(t3)])].sort();

const parity = { cases, expected, tiers };
const probe = `
(function () {
  const PARITY = ${JSON.stringify(parity)};
  const KEYS = ${JSON.stringify(KEYS)};
  const STABLE = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
    ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {})
    : x);
  const R = { parity: { cases: [], tiers: [] }, flow: {}, deltas: {}, classes: [], runs: null, failures: [] };
  const fail = m => R.failures.push(m);
  if (typeof Stadtgeschichte !== 'object') throw new Error('Stadtgeschichte rule core missing');

  PARITY.cases.forEach((c, i) => {
    let got;
    try { got = STABLE(Stadtgeschichte.evolve(c.state, c.wave, STADTGESCHICHTE)); }
    catch (e) { got = 'THREW ' + e.message; }
    const ok = got === PARITY.expected[i];
    R.parity.cases.push({ wave: c.wave, ok });
    if (!ok) fail('core/engine parity case ' + i + ' (wave ' + c.wave + ')');
  });
  PARITY.tiers.forEach(t => {
    const l = STADTGESCHICHTE.lines.find(x => x.id === t.line);
    let got;
    try { got = STABLE({ s: Stadtgeschichte.tierStats(l, t.tier), c: Stadtgeschichte.tierCost(l, t.tier) }); }
    catch (e) { got = 'THREW ' + e.message; }
    const ok = got === t.expected;
    R.parity.tiers.push({ line: t.line, tier: t.tier, ok });
    if (!ok) fail('tier parity ' + t.line + '/' + t.tier);
  });

  Game.coop = false; Game.daily = false; Game.endless = false;
  Game.manualSeed = ${SEED}; Game.sel = ['leonidas']; Game.danger = 2; Game.state = 'title'; Game.mods = [];
  Game.startRun();
  const p = Game.players[0];
  p.items = []; p.itemCounts = {}; p.evolutions = []; p.relics = []; p.buffs = [];
  p.weapons.length = 0; p.recalc();
  p.hp = p.maxHp; p.alive = true;
  p.addItem(ITEM_BY_ID['kaffee']); p.addItem(ITEM_BY_ID['verband']);
  const snap = () => { const o = {}; for (const k of KEYS) o[k] = p.st[k] || 0; return o; };
  const pre = snap();
  const step = wave => {
    Game.wave = wave; Game.waveEnding = false; Game.state = 'play';
    Game.enemies.length = 0; Game.pickups.length = 0;
    Game.wager = null; Game.contract = null; Game.levelQueue = []; Game.relicQueue = [];
    p.pendingLevels = 0; Save.data.prestige = 0;
    Game.endWave();
    return {
      st: snap(),
      evolutions: p.evolutions.map(e => ({ lineId: e.lineId, tier: e.tier, name: e.name })),
      items: { kaffee: p.itemCounts.kaffee || 0, verband: p.itemCounts.verband || 0, count: p.items.length },
      shop: { ok: Game.state === 'shop' && ShopSystem.offers.length === 6, state: Game.state, offers: ShopSystem.offers.length }
    };
  };
  const a = step(5);
  const b = step(10);
  const c = step(15);
  const d1 = {}; for (const k of KEYS) d1[k] = (a.st[k] || 0) - (pre[k] || 0);
  const d2 = {}; for (const k of KEYS) d2[k] = (b.st[k] || 0) - (a.st[k] || 0);
  const d3 = {}; for (const k of KEYS) d3[k] = (c.st[k] || 0) - (b.st[k] || 0);
  R.flow = { wave5: a, wave10: b, wave15: c };
  R.deltas = { t1: d1, t2: d2, t3: d3 };

  R.classes = BalanceSim.stadtClassReport();
  R.runs = BalanceSim.stadtRunReport(120);
  return R;
})()
`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sameStats = (a, b) => KEYS.every(k => (a[k] || 0) === (b[k] || 0));

async function main() {
  if (!EDGE_PATH) { console.error('FAIL  browser'); process.exitCode = 1; return; }
  killScratchEdges(['fbstadt-edge-']);
  const server = await startStaticServer(ROOT);
  let edge = null, conn = null;
  try {
    edge = await launchEdge({ profilePrefix: 'fbstadt-edge-' });
    if (!edge.ok) throw new Error('headless Edge did not start');
    conn = await connectPageCdp(edge.port);
    const { cdp, ev } = conn;
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: server.url + '/index.html?stadt=1&cb=' + Date.now() }, 15000);
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { if (await ev("typeof Game === 'object' && typeof BalanceSim === 'object' && typeof Stadtgeschichte === 'object'", 10000)) { ready = true; break; } } catch { /* booting */ }
      await sleep(250);
    }
    if (!ready) throw new Error('engine did not boot');
    const r = await ev(probe, 180000);
    if (!r || typeof r !== 'object') throw new Error('probe returned no report');

    const failures = r.failures.slice();
    if (stable(data.STADTGESCHICHTE) !== stable(clean)) failures.push('data.js STADTGESCHICHTE != content/stadtgeschichte.json');
    const dataErrors = validate(cfg, items, data.STAT_KEYS);
    for (const e of dataErrors) failures.push('content: ' + e);
    if (r.flow.wave5.items.kaffee !== 0 || r.flow.wave5.items.verband !== 0) failures.push('wave 5 did not consume both parts');
    if (r.flow.wave5.evolutions[0]?.tier !== 1) failures.push('wave 5 did not reach tier 1');
    if (r.flow.wave10.evolutions[0]?.tier !== 2) failures.push('wave 10 did not reach tier 2');
    if (r.flow.wave15.evolutions[0]?.tier !== 3) failures.push('wave 15 did not reach tier 3');
    for (const w of ['wave5', 'wave10', 'wave15']) if (!r.flow[w].shop.ok) failures.push(w + ' did not open a 6-offer shop');
    if (!sameStats(r.deltas.t1, expectedDeltas.t1)) failures.push('tier 1 stat delta != core');
    if (!sameStats(r.deltas.t2, expectedDeltas.t2)) failures.push('tier 2 stat delta != core');
    if (!sameStats(r.deltas.t3, expectedDeltas.t3)) failures.push('tier 3 stat delta != core');

    for (const row of r.classes) {
      if (!(row.maxEvoPct > 0)) failures.push('class ' + row.cls + ': evolution has no DPS effect');
      if (!(row.ratio > 0 && row.ratio <= 1.25)) failures.push('class ' + row.cls + ': ' + row.maxLine + ' ratio ' + row.ratio + ' exceeds one weapon tier +25%');
    }
    if (r.classes.length !== 11) failures.push('class report has ' + r.classes.length + ' rows');
    for (const row of r.runs.lines) {
      if (!(row.deltaWave >= 0.4)) failures.push('line ' + row.id + ': nearly dead (+' + row.deltaWave + ' waves)');
      if (row.deltaWave > 4.5) failures.push('line ' + row.id + ': above the run-model ceiling (+' + row.deltaWave + ' waves)');
      if (!(row.delta >= 0)) failures.push('line ' + row.id + ': lowers the win rate (' + row.delta + ')');
    }
    if (r.runs.lines.length !== 7) failures.push('run report has ' + r.runs.lines.length + ' lines');
    if (r.runs.full.deltaWave > 4.5) failures.push('all 7 lines exceed the run-model ceiling (+' + r.runs.full.deltaWave + ' waves)');

    const report = {
      generated: new Date().toISOString(),
      seed: '0x' + SEED.toString(16),
      danger: 2,
      line: LINE,
      dataParity: { table: stable(data.STADTGESCHICHTE) === stable(clean), configErrors: dataErrors.length, ids: cfg.lines.length, parts: cfg.lines.flatMap(l => l.parts).length },
      coreEngine: { cases: r.parity.cases, tiers: r.parity.tiers },
      flow: r.flow,
      deltas: r.deltas,
      expectedDeltas,
      classes: r.classes,
      runs: r.runs,
      pass: failures.length === 0,
      failures
    };
    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

    console.log('Stadtgeschichte — bytes/flow/balance, danger 2, seed 0x' + SEED.toString(16));
    console.log('Parity: ' + r.parity.cases.filter(x => x.ok).length + '/' + r.parity.cases.length + ' cases, ' +
      r.parity.tiers.filter(x => x.ok).length + '/' + r.parity.tiers.length + ' tier stats');
    for (const w of ['wave5', 'wave10', 'wave15']) {
      const f = r.flow[w];
      console.log(w + ': tier ' + (f.evolutions[0] ? f.evolutions[0].tier : 0) + ' ' + (f.evolutions[0] ? f.evolutions[0].name : '-') +
        '  items kaffee/verband=' + f.items.kaffee + '/' + f.items.verband + '  shop=' + f.shop.state + '/' + f.shop.offers);
    }
    for (const row of r.classes) console.log('class ' + row.cls.padEnd(10) + ' T2 ' + row.dpsT2 + ' -> T3 ' + row.dpsT3 + ' (' + row.tierPct + '%)  best line ' + row.maxLine + ' evo ' + row.maxEvoPct + '%  ratio ' + row.ratio + ' (Tier-Ref ' + row.tierRef + '%)');
    for (const row of r.runs.lines) console.log('line ' + row.id.padEnd(12) + ' wave ' + row.avgBase + ' -> ' + row.avgEvo + '  (' + row.deltaWave + ')  win ' + row.wrBase + '% -> ' + row.wrEvo + '%  delta ' + row.delta);
    console.log('all 7 lines: wave ' + r.runs.full.avgBase + ' -> ' + r.runs.full.avgEvo + '  (' + r.runs.full.deltaWave + ')  win ' + r.runs.full.wrBase + '% -> ' + r.runs.full.wrEvo + '%  delta ' + r.runs.full.delta);
    console.log('Report: ' + path.relative(ROOT, REPORT_PATH));
    if (failures.length) {
      console.error('FAIL — ' + failures.length + ' check(s):\n  ' + failures.join('\n  '));
      process.exitCode = 1;
    } else console.log('STADTGESCHICHTE OK — core parity, real wave flow and balance corridor proven.');
  } catch (e) {
    console.error('FAIL  ' + String(e && e.stack ? e.stack : e));
    process.exitCode = 1;
  } finally {
    if (conn) conn.close();
    if (edge) edge.kill();
    try { server.close(); } catch { /* ignore */ }
  }
}
await main();
