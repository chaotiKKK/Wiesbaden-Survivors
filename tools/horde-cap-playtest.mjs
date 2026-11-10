#!/usr/bin/env node
//
// Horden-Skalierung live: der Gegner-Deckel ist die letzte offene Kernloop-Lücke
// aus der Audit-Doku (docs/content-scope-brotato-2026-11-08.md, Punkt 7.9):
// Brotato stemmt 100 Gegner gleichzeitig, der Live-Cap lag bei 70 (Kampagne)
// bzw. 50 (klassisch). Dieses Werkzeug misst VORHER/NACHHER im echten Run:
//
//   1. Game.startRun() mit festem Seed und Danger 3,
//   2. Game.startWave(11/14) fuer die echten Horden-Pläne (Queue 77/100),
//      klassisch W3 als splitterfreier Queue-/Kampf-Vergleich (Queue 84),
//   3. Game.update(1/60) ohne Waffen, damit sich der Druck wirklich aufbaut,
//   4. alter Cap (70/50) gegen neuen Regelwert 100 aus BROTATO_RULES,
//   5. Maximal gleichzeitig lebende Gegner, gespawnte Gegner, Queue-Rest,
//   6. Kampf-/XP-/Drop-Pfad mit einer echten T1-Waffe (Kills, XP, Material),
//   7. Determinismus: derselbe Seed + derselbe Cap -> gleiche Spawnwerte.
//
// Report: docs/pw/horde-cap-playtest.json
// Usage:  node tools/horde-cap-playtest.mjs
//

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp
} from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const REPORT_PATH = path.join(ROOT, 'docs', 'pw', 'horde-cap-playtest.json');
const PROFILE_PREFIX = 'wbn-horde-cap-edge-';
const SEED = 0x0c0ffee;

const SCENARIOS = [
  { id: 'campaign-wave-11', label: 'Kampagne Horde W11', campaign: true, wave: 11, oldCap: 70 },
  { id: 'campaign-wave-14', label: 'Kampagne Horde W14', campaign: true, wave: 14, oldCap: 70 },
  { id: 'classic-wave-3', label: 'Klassisch W3', campaign: false, wave: 3, oldCap: 50 }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pageProbe() {
  return `
(function () {
  const SCENARIOS = ${JSON.stringify(SCENARIOS)};
  const SEED = ${SEED};
  const REPORT = { seed: SEED, rule: null, scenarios: [], combat: null, determinism: null, checks: {}, failures: [] };
  const fail = m => REPORT.failures.push(m);
  const num = v => Number.isFinite(v) ? v : 0;
  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return +(s[Math.min(s.length - 1, Math.floor(s.length * q))] || 0).toFixed(3); };
  const realRandom = Math.random;
  let randomState = SEED >>> 0;
  Math.random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };

  if (typeof Game !== 'object' || typeof BROTATO_RULES !== 'object')
    throw new Error('engine/rules globals missing');
  if (typeof OPT === 'function') OPT().tutorial = false;
  REPORT.rule = {
    maxEnemiesOnScreen: BROTATO_RULES.maxEnemiesOnScreen,
    classicBefore: 50,
    campaignBefore: 70
  };

  function boot(spec, weapons) {
    randomState = SEED >>> 0;
    Game.coop = false; Game.daily = false; Game.endless = false;
    Game.manualSeed = SEED; Game.sel = ['leonidas']; Game.mods = []; Game.danger = 3;
    Game.state = 'title'; Game.campaign = null; Game.campaignMods = []; Game.campaignWorld = {};
    Game.startRun();
    const p = Game.players[0];
    p.items = []; p.itemCounts = {}; p.relics = []; p.buffs = []; p.turrets = []; p.pet = null;
    p.runUpgrades = {}; p.base.crit = -1000; p.recalc(true); p.st.crit = -1000;
    p.hp = p.maxHp; p.alive = true; p.invuln = 0;
    Game.qaGod = true;
    if (!weapons) { p.weapons.length = 0; p.recalc(true); }
    else { p.weapons[0].tier = 1; p.recalc(true); p.hp = p.maxHp; }
    p.xpNext = 1e12; p.pendingLevels = 0;
    if (!spec.campaign) { Game.campaign = null; Game.campaignMods = []; Game.campaignWorld = {}; }
    Game.startWave(spec.wave);
    Game.state = 'play'; Game.waveTimer = 999; Game.waveDuration = 999; Game.waveEnding = false;
    return p;
  }

  function accumulate(spec, cap) {
    const p = boot(spec, false);
    Game._maxSimultaneous = cap;
    const queued = Game.spawnQueue.length;
    let maxAlive = 0, spawned = 0;
    const ms = [];
    for (let i = 0; i < 1800; i++) {
      const a = performance.now();
      Game.update(1 / 60);
      ms.push(performance.now() - a);
      if (Game.enemies.length > maxAlive) maxAlive = Game.enemies.length;
      spawned = queued - Game.spawnQueue.length;
      if (Game.state !== 'play') break;
    }
    const rec = {
      cap: cap, queued: queued, maxAlive: maxAlive, spawned: spawned,
      queueLeft: Game.spawnQueue.length, alive: Game.enemies.length,
      ticks: ms.length, frameAvg: +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(3),
      frameP95: pct(ms, .95), frameP99: pct(ms, .99), frameMax: +Math.max.apply(null, ms).toFixed(3),
      playerAlive: !!p.alive, state: Game.state, wave: Game.wave
    };
    Game.state = 'title';
    return rec;
  }

  function combat(spec, cap) {
    const p = boot(spec, true);
    Game._maxSimultaneous = cap;
    const queued = Game.spawnQueue.length;
    const kills0 = num(Game.run && Game.run.kills);
    const mats0 = num(Game.materials);
    const pick0 = Game.pickups.length;
    let maxAlive = 0, spawned = 0;
    const ms = [];
    for (let i = 0; i < 2400; i++) {
      const a = performance.now();
      Game.update(1 / 60);
      ms.push(performance.now() - a);
      if (Game.enemies.length > maxAlive) maxAlive = Game.enemies.length;
      spawned = queued - Game.spawnQueue.length;
      if (Game.state !== 'play') break;
    }
    let nearest = 9999;
    for (const e of Game.enemies) nearest = Math.min(nearest, Math.hypot(e.x - p.x, e.y - p.y));
    const rec = {
      cap: cap, queued: queued, maxAlive: maxAlive, spawned: spawned,
      queueLeft: Game.spawnQueue.length, alive: Game.enemies.length, ticks: ms.length,
      kills: num(Game.run && Game.run.kills) - kills0,
      xp: +num(p.xp).toFixed(3), level: p.level,
      materials: +(num(Game.materials) - mats0).toFixed(1),
      pickups: Game.pickups.length - pick0,
      weapon: p.weapons[0] ? { id: p.weapons[0].id, tier: p.weapons[0].tier, type: p.weapons[0].def ? p.weapons[0].def.type : null } : null,
      weapons: p.weapons.length, runDmg: num(Game.run && Game.run.dmg), enemyNearest: nearest,
      playerAlive: !!p.alive, hp: +num(p.hp).toFixed(1), maxHp: +num(p.maxHp).toFixed(1), state: Game.state, ui: (typeof UI === 'object' ? UI.cur : null),
      frameAvg: +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(3),
      frameP95: pct(ms, .95), frameP99: pct(ms, .99)
    };
    Game.state = 'title';
    return rec;
  }

  for (const spec of SCENARIOS) {
    const before = accumulate(spec, spec.oldCap);
    const after = accumulate(spec, 100);
    const checks = {
      queueExceedsOldCap: before.queued > spec.oldCap,
      oldCapBound: before.maxAlive === spec.oldCap,
      newCapReached: after.spawned >= Math.min(100, before.queued) && after.spawned > before.spawned,
      queueDrained: after.queueLeft < before.queueLeft,
      frameBudget: after.frameP99 < 16.7
    };
    const ok = Object.values(checks).every(Boolean);
    REPORT.scenarios.push({ id: spec.id, label: spec.label, wave: spec.wave, oldCap: spec.oldCap, before: before, after: after, checks: checks, ok: ok });
    if (!ok) fail('scenario: ' + spec.id);
  }

  // Kampf-/XP-/Drop-Pfad: splitterfreie klassische Welle mit einer echten Waffe.
  const combatSpec = SCENARIOS[2];
  const combatBefore = combat(combatSpec, 50);
  const combatAfter = combat(combatSpec, 100);
  REPORT.combat = {
    scenario: combatSpec.id, before: combatBefore, after: combatAfter,
    checks: {
      maxAliveGrew: combatAfter.maxAlive > combatBefore.maxAlive,
      killsGrew: combatAfter.kills > combatBefore.kills,
      xpGrew: combatAfter.xp > combatBefore.xp,
      materialsNonDecreasing: combatAfter.materials >= combatBefore.materials,
      frameBudget: combatAfter.frameP99 < 16.7
    }
  };
  if (!Object.values(REPORT.combat.checks).every(Boolean)) fail('combat path');

  // Determinismus: gleicher Seed + gleicher Cap -> gleiche Spawn-/Queue-Werte.
  const d1 = accumulate(SCENARIOS[0], 100);
  const d2 = accumulate(SCENARIOS[0], 100);
  const same = d1.queued === d2.queued && d1.spawned === d2.spawned && d1.maxAlive === d2.maxAlive && d1.queueLeft === d2.queueLeft;
  REPORT.determinism = { scenario: SCENARIOS[0].id, same: same, first: d1, second: d2 };
  REPORT.checks.determinism = same;
  if (!same) fail('determinism');

  REPORT.checks.ruleIs100 = REPORT.rule.maxEnemiesOnScreen === 100;
  if (!REPORT.checks.ruleIs100) fail('rule maxEnemiesOnScreen');
  REPORT.pass = REPORT.failures.length === 0;
  Math.random = realRandom;
  return REPORT;
})()
`;
}

async function main() {
  if (!EDGE_PATH) { console.error('FAIL  browser — no Edge/Chromium binary found'); process.exitCode = 1; return; }
  killScratchEdges([PROFILE_PREFIX]);
  const server = await startStaticServer(ROOT);
  let edge = null, conn = null;
  try {
    edge = await launchEdge({ profilePrefix: PROFILE_PREFIX });
    if (!edge.ok) throw new Error('headless Edge did not start on CDP port ' + edge.port + (edge.err ? ' — ' + edge.err : ''));
    conn = await connectPageCdp(edge.port);
    const { cdp, ev } = conn;
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: server.url + '/index.html?hordecap=1&cb=' + Date.now() }, 15000);
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if (await ev("typeof Game === 'object' && typeof BROTATO_RULES === 'object' && typeof Game.startRun === 'function'", 10000)) { ready = true; break; }
      } catch { /* booting */ }
      await sleep(250);
    }
    if (!ready) throw new Error('engine did not boot');

    console.log('Horden-Cap live — seed 0x' + SEED.toString(16) + ', Regel ' + 100);
    const report = await ev(pageProbe(), 240000);
    if (!report || typeof report !== 'object') throw new Error('probe returned no report');
    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

    for (const s of report.scenarios) {
      console.log('  ' + (s.ok ? 'PASS' : 'FAIL') + '  ' + s.id +
        '  queue=' + s.before.queued +
        '  maxAlive ' + s.before.maxAlive + ' -> ' + s.after.maxAlive +
        '  spawned ' + s.before.spawned + ' -> ' + s.after.spawned +
        '  queueLeft ' + s.before.queueLeft + ' -> ' + s.after.queueLeft +
        '  p99 ' + s.after.frameP99 + ' ms');
    }
    console.log('  combat: kills ' + report.combat.before.kills + ' -> ' + report.combat.after.kills +
      ', xp ' + report.combat.before.xp + ' -> ' + report.combat.after.xp +
      ', material ' + report.combat.before.materials + ' -> ' + report.combat.after.materials);
    console.log('  determinism: ' + report.determinism.same);
    console.log('Checks: ' + JSON.stringify({ ...report.checks, scenarios: report.scenarios.map(s => s.ok), combat: report.combat.checks }));
    if (!report.pass) {
      console.error('FAIL  Horden-Cap proof incomplete');
      for (const f of report.failures || []) console.error('  - ' + f);
      process.exitCode = 1;
    } else {
      console.log('HORDE CAP OK — 100 gleichzeitig, alte Caps bindend, Queue leert, Determinismus hält.');
    }
    console.log('Report: ' + path.relative(ROOT, REPORT_PATH));
  } catch (e) {
    console.error('FAIL  ' + String(e && e.stack ? e.stack : e)); process.exitCode = 1;
  } finally {
    if (conn) conn.close(); if (edge) edge.kill(); try { server.close(); } catch { /* ignore */ }
  }
}
await main();
