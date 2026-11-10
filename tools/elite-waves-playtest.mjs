#!/usr/bin/env node
//
// Dedicated elite/horde waves — measured in a real Game session.
//
// The content-scope target calls for four elite/horde waves at 11/12/14/15 on
// high danger.  This tool starts a normal Game run at danger 3 and, for each of
// those waves, does three things through real engine entry points:
//
//   1. Game.startWave(n) builds the real spawn queue.  The event-eligible plan
//      is compared with the same wave's normal plan (Game.buildSpawnPlan with
//      no event) so horde waves must actually schedule more enemies and elite
//      waves must actually add guaranteed elites.
//   2. The wave is started again and Game.update() runs for 600 real ticks.
//      At least one guaranteed elite has to reach the live enemy list; this is
//      not just an inspection of the queue.
//   3. Game.endWave() ends the wave and enters the normal shop, proving the
//      event does not bypass the wave/shop loop.  The event material reward is
//      measured separately with enemies/pickups/harvest neutralized.
//   4. The danger gate is proven with the real startWave: at danger 0-2 the
//      same four waves must stay normal waves, at danger 3 all four must carry
//      their event, and wave 13 at danger 3 stays normal.
//
// Usage:
//   node tools/elite-waves-playtest.mjs --before   # pre-implementation protocol
//   node tools/elite-waves-playtest.mjs            # after implementation
//
// The --before mode writes docs/pw/elite-waves-before.json.  The normal mode
// writes docs/pw/elite-waves-playtest.json and exits non-zero if any event is
// missing or has no measured effect.
//

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp
} from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const BEFORE = process.argv.includes('--before');
const REPORT_PATH = path.join(ROOT, 'docs', 'pw', BEFORE ? 'elite-waves-before.json' : 'elite-waves-playtest.json');
const PROFILE_PREFIX = 'fbelite-edge-';
const SEED = 0x3e11e7e5;
const EXPECTED = { 11: 'horde', 12: 'elite', 14: 'horde', 15: 'elite' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pageProbe() {
  return `
(function () {
  const EXPECTED = ${JSON.stringify(EXPECTED)};
  const REPORT = {
    mode: ${JSON.stringify(BEFORE ? 'before' : 'after')},
    seed: ${SEED},
    danger: 3,
    player: null,
    waves: {},
    failures: []
  };
  const fail = m => REPORT.failures.push(m);
  if (typeof Game !== 'object' || typeof ShopSystem !== 'object' || typeof Player !== 'function')
    throw new Error('engine globals missing');
  if (typeof Game.startWave !== 'function' || typeof Game.buildSpawnPlan !== 'function')
    throw new Error('wave entry points missing');

  // Deterministic test-only randomness; the actual game RAND remains seeded by
  // startRun's manual seed.
  const realRandom = Math.random;
  let randomState = ${SEED} >>> 0;
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };

  Game.coop = false;
  Game.daily = false;
  Game.endless = false;
  Game.manualSeed = ${SEED};
  Game.sel = ['leonidas', 'sylvia'];
  Game.danger = 3;
  Game.state = 'title';
  Game.mods = [];
  Game.startRun();
  const p = Game.players[0];
  if (!p) throw new Error('startRun produced no player');
  REPORT.player = p.char.id;

  const countPlan = q => {
    let total = 0, elites = 0, bosses = 0;
    for (const s of q || []) {
      if (!s) continue;
      if (s.boss) bosses++;
      else total++;
      if (s.elite) elites++;
    }
    return { total, elites, bosses };
  };

  // Total threat of a plan, built through the real spawn entry point so enemy
  // hp/dmg carry the engine's danger scaling and makeElite's multipliers.
  // RAND is stubbed while measuring so the plan/control comparison below still
  // sees exactly the same random stream as the run itself.
  const threatOf = q => {
    if (!q || !q.length) return { hp: 0, dmg: 0, count: 0 };
    const savedEnemies = Game.enemies, savedPool = Game.enemyPool, savedRand = RAND;
    Game.enemies = []; Game.enemyPool = []; RAND = () => 0.5;
    let hp = 0, dmg = 0, count = 0;
    for (const s of q) {
      if (!s || s.boss || !s.def) continue;
      const e = Game.spawnEnemyAt(s.def, 0, 0, false);
      if (s.elite) e.makeElite();
      hp += e.maxHp; dmg += e.dmg; count++;
    }
    RAND = savedRand;
    Game.enemies = savedEnemies; Game.enemyPool = savedPool;
    return { hp: Math.round(hp), dmg: Math.round(dmg), count };
  };

  for (const n of [11, 12, 14, 15]) {
    const expected = EXPECTED[n];
    // The real startWave path sets the event and builds the actual queue.
    Game.startWave(n);
    const event = Game.waveEvent || null;
    const eventPlan = Game.spawnQueue.slice();
    const eventCounts = countPlan(eventPlan);

    // Same wave, same danger, no event: the control plan.  buildSpawnPlan is
    // the real builder, not a copied formula.
    Game.waveEvent = null;
    Game.buildSpawnPlan(n);
    const controlCounts = countPlan(Game.spawnQueue);
    const controlPlan = Game.spawnQueue.slice();
    Game.spawnQueue = eventPlan;

    // Run the actual event wave for 600 fixed 60 Hz updates.  No weapons are
    // equipped so the marked elite cannot be killed before we count it.
    Game.waveEvent = event;
    Game.startWave(n);
    Game.state = 'play';
    // Keep the real plan (built with its normal wave duration), then give the
    // update loop a long, already-running clock.  Setting only waveTimer high
    // makes elapsed negative and spawns nothing.
    Game.waveDuration = 600;
    Game.waveTimer = 600;
    Game.waveEnding = false;
    p.weapons = [];
    p.recalc();
    p.hp = 1e9; p.maxHp = 1e9; p.alive = true;
    Game.enemies.length = 0;
    Game.hash.clear();
    for (let t = 0; t < 600; t++) Game.update(1 / 60);
    const liveElites = Game.enemies.filter(e => e.elite).length;
    const liveTotal = Game.enemies.length;
    const liveEvent = Game.waveEvent ? Game.waveEvent.kind : null;

    // Normal shop transition and isolated event reward.  Clear enemies so
    // their material drops cannot be mistaken for the event bonus; also clear
    // wager/contract/harvest/prestige contributions.
    Game.waveEnding = false;
    Game.enemies.length = 0;
    Game.pickups.length = 0;
    Game.wager = null;
    Game.contract = null;
    Game.levelQueue = [];
    Game.relicQueue = [];
    p.pendingLevels = 0;
    p.st.harvest = 0;
    Save.data.prestige = 0;
    const matBefore = Game.materials;
    Game.endWave();
    const matAfter = Game.materials;
    const shopOk = Game.state === 'shop' && Array.isArray(ShopSystem.offers) && ShopSystem.offers.length === 6;

    const planThreat = threatOf(eventPlan), controlThreat = threatOf(controlPlan);
    const eventOk = !!event && event.kind === expected;
    const hordeOk = expected !== 'horde' || eventCounts.total > controlCounts.total;
    const elitePlanOk = expected !== 'elite' || eventCounts.elites > controlCounts.elites;
    const liveOk = eventCounts.elites > 0 && liveElites > 0;
    const liveEventOk = liveEvent === expected;
    /* Fünf-Viertel: Bosse liegen nur auf 10/20. Welle 15 ist eine echte
       Elite-Welle, aber bewusst keine Boss-Welle mehr. */
    const bossOk = n !== 15 || (Game.campaignActive() ? eventCounts.bosses === 0 : eventCounts.bosses >= 1);
    const rewardOk = !event || !event.mat || matAfter - matBefore >= event.mat;
    // Horde waves must add pressure; elite waves must re-profile the same wave
    // (fewer trash, more elites) instead of becoming a raw hp spike.
    const balanceOk = expected === 'horde'
      ? planThreat.hp > controlThreat.hp
      : planThreat.hp <= Math.round(controlThreat.hp * 1.2);
    REPORT.waves[n] = {
      expected,
      event: event ? { kind: event.kind, name: event.name, elites: event.elites, mult: event.mult, mat: event.mat } : null,
      plan: eventCounts,
      control: controlCounts,
      live: { total: liveTotal, elites: liveElites, event: liveEvent },
      threat: { plan: planThreat, control: controlThreat },
      eventMaterial: matAfter - matBefore,
      shop: { ok: shopOk, state: Game.state, offers: ShopSystem.offers.length },
      checks: { eventOk, hordeOk, elitePlanOk, liveOk, liveEventOk, bossOk, rewardOk, balanceOk },
      pass: eventOk && hordeOk && elitePlanOk && liveOk && liveEventOk && bossOk && rewardOk && balanceOk && shopOk
    };
    if (!REPORT.waves[n].pass) fail('wave ' + n + ': ' + JSON.stringify(REPORT.waves[n].checks));
  }

  // Danger gate through the real startWave path: danger 0-2 must keep all four
  // waves normal, danger 3 must turn on all four events, and wave 13 must stay
  // a normal wave at the same danger.
  REPORT.dangerGate = {};
  for (const d of [0, 1, 2, 3]) {
    Game.danger = d;
    const kinds = {};
    for (const n of [11, 12, 14, 15]) {
      Game.waveEvent = null;
      Game.startWave(n);
      kinds[n] = Game.waveEvent ? Game.waveEvent.kind : null;
    }
    Game.waveEvent = null;
    Game.startWave(13);
    REPORT.dangerGate[d] = { waves: kinds, wave13: Game.waveEvent ? Game.waveEvent.kind : null };
  }
  REPORT.gate = {
    noEventsBelowDanger3: [0, 1, 2].every(d => [11, 12, 14, 15].every(n => REPORT.dangerGate[d].waves[n] === null)),
    eventsAtDanger3: [11, 12, 14, 15].every(n => REPORT.dangerGate[3].waves[n] === EXPECTED[n]),
    nonEventWave13: REPORT.dangerGate[3].wave13 === null
  };
  if (!REPORT.gate.noEventsBelowDanger3) fail('danger 0-2 spawns elite/horde events');
  if (!REPORT.gate.eventsAtDanger3) fail('danger 3 event kinds mismatch: ' + JSON.stringify(REPORT.dangerGate[3].waves));
  if (!REPORT.gate.nonEventWave13) fail('wave 13 has an event');

  REPORT.pass = REPORT.failures.length === 0;
  Math.random = realRandom;
  return REPORT;
})()
`;
}

async function main() {
  if (!EDGE_PATH) {
    console.error('FAIL  browser — no Edge/Chromium binary found');
    process.exitCode = 1;
    return;
  }
  killScratchEdges([PROFILE_PREFIX]);
  const server = await startStaticServer(ROOT);
  let edge = null, conn = null;
  try {
    edge = await launchEdge({ profilePrefix: PROFILE_PREFIX });
    if (!edge.ok) throw new Error('headless Edge did not start on CDP port ' + edge.port + (edge.err ? ' — ' + edge.err : ''));
    conn = await connectPageCdp(edge.port);
    const { cdp, ev } = conn;
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: server.url + '/index.html?elitewaves=1&cb=' + Date.now() }, 15000);
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if (await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof Player === 'function'", 10000)) { ready = true; break; }
      } catch { /* booting */ }
      await sleep(250);
    }
    if (!ready) throw new Error('engine did not boot');

    console.log('Elite/horde waves — ' + (BEFORE ? 'BEFORE' : 'AFTER') + ' live run, danger 3, seed 0x' + SEED.toString(16));
    const report = await ev(pageProbe(), 180000);
    if (!report || typeof report !== 'object') throw new Error('probe returned no report');
    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

    for (const n of [11, 12, 14, 15]) {
      const w = report.waves[n];
      const evt = w.event ? w.event.kind + '/' + w.event.name : 'none';
      console.log((w.pass ? 'PASS' : 'FAIL') + '  wave ' + n + ' (' + w.expected + ') event=' + evt +
        '  plan total/elites=' + w.plan.total + '/' + w.plan.elites +
        '  control=' + w.control.total + '/' + w.control.elites +
        '  live elites=' + w.live.elites + ' liveEvent=' + w.live.event +
        '  threat hp plan/control=' + w.threat.plan.hp + '/' + w.threat.control.hp +
        '  eventMat=' + w.eventMaterial +
        '  shop=' + w.shop.state + '/' + w.shop.offers +
        '  checks=' + JSON.stringify(w.checks));
    }
    console.log('Danger-Gate: ' + JSON.stringify(report.gate) + ' | danger 3 events=' + JSON.stringify(report.dangerGate[3]));
    console.log('Report: ' + path.relative(ROOT, REPORT_PATH));
    if (!report.pass) {
      console.error((BEFORE ? 'BEFORE state' : 'FAIL') + ': ' + report.failures.length + ' event wave(s) not yet proven');
      if (!BEFORE) process.exitCode = 1;
    } else {
      console.log('ELITE/HORDE WAVES OK — 4/4 events, live elites and normal shop transition proven.');
    }
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
