#!/usr/bin/env node
//
// Enemy roster parity in the real run — not a data-only count.
//
// The base catalog grew from 28 to 51 enemies and the live campaign catalog
// from 60 to 83. This tool proves the new rows are reachable through the real
// engine, not just present in data.js:
//
//   1. Game.startRun() with a fixed manual seed,
//   2. Game.startWave(20) so the real buildSpawnPlan()/weightedPick() path runs,
//   3. Game.update(1/60) until new enemy types have actually spawned,
//   4. one new enemy is killed through Enemy.hurt() — the normal combat path —
//      and the run's kill/XP/material state is read back.
//
// The report is written to docs/pw/enemy-roster-playtest.json.
//
// Usage: node tools/enemy-roster-playtest.mjs
//

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp
} from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const REPORT_PATH = path.join(ROOT, 'docs', 'pw', 'enemy-roster-playtest.json');
const PROFILE_PREFIX = 'wbn-enemy-roster-edge-';
const SEED = 0xe083;
const NEW_IDS = [
  'kurpark_laurer', 'tauben_schwarm', 'brunnenegel', 'strassenbahn_schuetze',
  'kiosk_raufer', 'rheingau_weber', 'hafen_moerser', 'thermal_sirene',
  'matten_heiler', 'festungs_schild', 'hexen_turm', 'weinberg_bomber',
  'schiefer_waechter', 'kurhaus_spiegel', 'nebelgeist', 'schloss_koloss',
  'bruecken_rammer', 'zollhaus_zwilling', 'deponie_drohne', 'kuppel_krabbe',
  'pumpwerk_kreisel', 'veilchengeist', 'rheinufer_bomber'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pageProbe() {
  return `
(function () {
  const NEW_IDS = ${JSON.stringify(NEW_IDS)};
  const REPORT = {
    seed: ${SEED},
    player: null,
    run: null,
    session: { startRunCalls: 1, waveStarts: 1, updates: 0 },
    roster: { base: 0, campaign: 0, unique: 0, newRows: 0, campaignCoversNew: 0 },
    before: null,
    plan: null,
    after: null,
    target: null,
    checks: {},
    failures: []
  };
  const fail = m => REPORT.failures.push(m);
  const num = v => Number.isFinite(v) ? v : 0;

  if (typeof Game !== 'object' || typeof ENEMY_BY_ID !== 'object' ||
      typeof ENEMIES !== 'object' || typeof CAMPAIGN_ENEMIES !== 'object' ||
      typeof FUENF_VIERTEL !== 'object')
    throw new Error('engine/data globals missing');

  // ----- roster/data invariants in the page's real globals -----------------
  const liveIds = CAMPAIGN_ENEMIES.map(e => e.id);
  const liveSet = new Set(liveIds);
  const waveIds = new Set();
  for (const d of FUENF_VIERTEL.districts || [])
    for (const w of d.waves || [])
      for (const id of w.enemies || []) waveIds.add(id);
  const newRows = NEW_IDS.filter(id => !!ENEMY_BY_ID[id]);
  const covered = NEW_IDS.filter(id => waveIds.has(id));
  REPORT.roster = {
    base: ENEMIES.length,
    campaign: CAMPAIGN_ENEMIES.length,
    unique: liveSet.size,
    newRows: newRows.length,
    campaignCoversNew: covered.length,
    newIds: NEW_IDS
  };
  REPORT.checks.baseRoster = ENEMIES.length === 51;
  REPORT.checks.liveRoster = CAMPAIGN_ENEMIES.length === 83;
  REPORT.checks.uniqueLiveRoster = liveSet.size === CAMPAIGN_ENEMIES.length;
  REPORT.checks.newRowsLive = newRows.length === NEW_IDS.length;
  REPORT.checks.campaignCoversNew = covered.length === NEW_IDS.length;

  // ----- a real seeded run -------------------------------------------------
  Game.coop = false;
  Game.daily = false;
  Game.endless = false;
  Game.manualSeed = ${SEED};
  Game.sel = ['leonidas', 'sylvia'];
  Game.mods = [];
  Game.state = 'title';
  if (typeof OPT === 'function') OPT().tutorial = false;
  Game.startRun();
  const p = Game.players && Game.players[0];
  if (!p) throw new Error('startRun produced no player');
  REPORT.player = p.char.id;
  REPORT.run = { arena: Game.arena && Game.arena.id, wave: Game.wave, seed: Game.seed };

  // startRun() may enter the campaign. This proof targets the classic wave
  // path, where the full 51-entry base pool feeds buildSpawnPlan().
  Game.campaign = null; Game.campaignMods = []; Game.campaignWorld = {};

  // Make the run deterministic and combat-free until the roster proof: no
  // weapons, no items/pets, no random level-up builds.
  p.items = []; p.itemCounts = {}; p.relics = []; p.buffs = []; p.turrets = []; p.pet = null;
  p.weapons.length = 0;
  p.base.crit = -1000; p.base.critDmg = 0;
  p.recalc(true);
  p.st.crit = -1000;
  p.alive = true; p.hp = p.maxHp; p.invuln = 0;
  Game.qaGod = true;
  Game.state = 'play';
  Game.waveTimer = 999; Game.waveDuration = 999; Game.waveEnding = false;
  Game.enemies.length = 0; Game.enemyPool.length = 0;
  Game.spawnQueue.length = 0; Game.pickups.length = 0;

  REPORT.before = {
    wave: Game.wave,
    queue: Game.spawnQueue.length,
    enemies: Game.enemies.length,
    kills: num(Game.run && Game.run.kills),
    xp: +num(p.xp).toFixed(3),
    pickups: Game.pickups.length
  };

  // The real wave-20 plan. buildSpawnPlan() is the same weightedPick path a
  // normal run uses; startWave() resets the wave and calls it.
  Game.startWave(20);
  Game.state = 'play';
  Game.waveTimer = 999; Game.waveDuration = 999; Game.waveEnding = false;
  const queuedNew = [];
  for (const q of Game.spawnQueue) {
    const id = q.def && q.def.id;
    if (id && NEW_IDS.includes(id)) queuedNew.push(id);
  }
  REPORT.plan = {
    wave: Game.wave,
    queue: Game.spawnQueue.length,
    queuedNew: queuedNew.length,
    uniqueQueuedNew: [...new Set(queuedNew)],
    queuedBoss: Game.spawnQueue.filter(q => q.boss).length
  };
  REPORT.checks.planHasNew = queuedNew.length > 0;

  // Tick real Game.update frames. Stop once at least one new type has actually
  // spawned; then keep ticking briefly so the snapshot is stable.
  let newSpawned = [];
  let ticks = 0;
  const findNewSpawned = () => [...new Set(Game.enemies.filter(e => e.def && NEW_IDS.includes(e.def.id)).map(e => e.def.id))];
  while (ticks < 1200 && newSpawned.length === 0) {
    Game.update(1 / 60);
    ticks++;
    if (ticks % 10 === 0) newSpawned = findNewSpawned();
  }
  for (let i = 0; i < 180; i++) { Game.update(1 / 60); ticks++; }
  newSpawned = findNewSpawned();
  REPORT.session.updates = ticks;
  REPORT.after = {
    wave: Game.wave,
    queue: Game.spawnQueue.length,
    enemies: Game.enemies.length,
    newTypes: newSpawned.length,
    newEnemies: Game.enemies.filter(e => e.def && NEW_IDS.includes(e.def.id)).length,
    kills: num(Game.run && Game.run.kills),
    xp: +num(p.xp).toFixed(3),
    pickups: Game.pickups.length
  };
  REPORT.checks.spawnedNew = newSpawned.length > 0;
  REPORT.checks.playerAlive = !!p.alive;

  // One new enemy must also be killable through the normal Enemy.hurt path.
  const target = Game.enemies.find(e => !e.dead && e.def && NEW_IDS.includes(e.def.id));
  if (!target) {
    fail('no live new enemy to kill');
  } else {
    const kills0 = num(Game.run && Game.run.kills);
    const xp0 = num(p.xp);
    const pickups0 = Game.pickups.length;
    const hp0 = target.hp;
    target.hurt(1e9, false, p, 'melee');
    REPORT.target = {
      id: target.def.id,
      name: target.def.name,
      hpBefore: hp0,
      hpAfter: target.hp,
      dead: !!target.dead,
      killsBefore: kills0,
      killsAfter: num(Game.run && Game.run.kills),
      xpBefore: +xp0.toFixed(3),
      xpAfter: +num(p.xp).toFixed(3),
      pickupsBefore: pickups0,
      pickupsAfter: Game.pickups.length
    };
    REPORT.checks.newEnemyKilled = !!target.dead && num(Game.run.kills) === kills0 + 1;
    REPORT.checks.killAwardsXp = num(p.xp) > xp0 || p.pendingLevels > 0;
    REPORT.checks.killDropsLoot = Game.pickups.length > pickups0;
  }

  for (const [name, ok] of Object.entries(REPORT.checks))
    if (!ok) fail('check: ' + name);
  REPORT.pass = REPORT.failures.length === 0;
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
    await cdp('Page.navigate', { url: server.url + '/index.html?enemyroster=1&cb=' + Date.now() }, 15000);

    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const v = await ev("typeof Game === 'object' && typeof ENEMIES === 'object' && typeof CAMPAIGN_ENEMIES === 'object' && typeof FUENF_VIERTEL === 'object'", 10000);
        if (v === true) { ready = true; break; }
      } catch { /* page still booting */ }
      await sleep(250);
    }
    if (!ready) throw new Error('engine did not boot');

    console.log('Enemy roster playtest — live run, seed 0x' + SEED.toString(16));
    const report = await ev(pageProbe(), 180000);
    if (!report || typeof report !== 'object') throw new Error('probe returned no report');

    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

    console.log('Roster: ' + report.roster.base + ' base + ' +
      (report.roster.campaign - report.roster.base) + ' campaign = ' + report.roster.campaign +
      ' live; ' + report.roster.newRows + '/23 new rows, ' + report.roster.campaignCoversNew + '/23 in campaign waves.');
    console.log('Session: ' + report.session.startRunCalls + ' startRun, ' +
      report.session.waveStarts + ' startWave, ' + report.session.updates + ' Game.update ticks.');
    console.log('Before: ' + JSON.stringify(report.before));
    console.log('Plan:   ' + JSON.stringify(report.plan));
    console.log('After:  ' + JSON.stringify(report.after));
    console.log('Kill:   ' + JSON.stringify(report.target));
    console.log('Checks: ' + JSON.stringify(report.checks));

    if (!report.pass) {
      console.error('FAIL  enemy roster proof is incomplete');
      for (const f of report.failures || []) console.error('  - ' + f);
      process.exitCode = 1;
    } else {
      console.log('ENEMY ROSTER OK — 83 live enemies, new types spawned and killed in one real run.');
    }
    console.log('Report: ' + path.relative(ROOT, REPORT_PATH));
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
