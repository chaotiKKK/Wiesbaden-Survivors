#!/usr/bin/env node
//
// Accessibility HP/damage scaling in the real run — not a data scan.
//
// The options screen already had speed and a set of visual/accessibility
// switches, but no way to make a run easier or harder.  This tool starts a
// normal Game run through Game.startRun(), then:
//
//   1. measures the player's baseline max HP and a real pistol hit at 100 %,
//   2. changes both options through UI.cycleOpt() (the same click handler used
//      by the options screen), which must recalc every live player,
//   3. measures max HP and the same real pistol hit again through Game.update
//      ticks against a live enemy,
//   4. renders the real options list and checks the labels/percent values,
//   5. saves and reads the raw localStorage payload.
//
// The run is deterministic (fixed manual seed and fixed 60 Hz steps).  Damage
// is kept crit-free by setting the test player's base crit below zero; this is
// test setup only, not a game change.  The report is written to
// docs/pw/accessibility-scaling-playtest.json.
//
// Usage: node tools/accessibility-scaling-playtest.mjs
//

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp
} from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const REPORT_PATH = path.join(ROOT, 'docs', 'pw', 'accessibility-scaling-playtest.json');
const PROFILE_PREFIX = 'fba11y-edge-';
const SEED = 0xacc355;
const HP_TARGET = 130;
const DMG_TARGET = 120;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pageProbe() {
  return `
(function () {
  const REPORT = {
    seed: ${SEED},
    player: null,
    run: null,
    session: { startRunCalls: 1, optionChanges: 0, damageTrials: 0 },
    base: { maxHp: 0, damage: 0, gameSpeed: 0, speedBase: 0 },
    scaled: { maxHp: 0, expectedMaxHp: 0, damage: 0, damageRatio: 0 },
    options: { hpScale: null, dmgScale: null, hpClicks: 0, dmgClicks: 0 },
    ui: {},
    persistence: {},
    checks: {},
    failures: []
  };
  const fail = m => REPORT.failures.push(m);
  const num = v => Number.isFinite(v) ? v : 0;

  // The options and presentation code calls Math.random directly.  A
  // test-only LCG keeps the protocol repeatable without touching seeded RAND.
  const realRandom = Math.random;
  let randomState = ${SEED} >>> 0;
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };

  if (typeof Game !== 'object' || typeof Player !== 'function' ||
      typeof UI !== 'object' || typeof Save !== 'object' || typeof OPT !== 'function')
    throw new Error('engine globals missing');

  // ---- real run ------------------------------------------------------------
  Game.coop = false;
  Game.daily = false;
  Game.endless = false;
  Game.manualSeed = ${SEED};
  Game.sel = ['leonidas', 'sylvia'];
  Game.state = 'title';
  Game.mods = [];
  Game.startRun();
  const p = Game.players[0];
  if (!p) throw new Error('startRun produced no player');
  REPORT.player = p.char.id;
  REPORT.run = { arena: Game.arena && Game.arena.id, wave: Game.wave, seed: Game.seed };

  // Speed was already a real option; record it so this report also shows the
  // existing third accessibility regler is live.
  REPORT.base.gameSpeed = OPT().gameSpeed;
  REPORT.base.speedBase = num(Game.speedBase);
  REPORT.checks.speedOptionLive = Math.abs(num(Game.speedBase) - SPEED_MULT(OPT().gameSpeed)) < 1e-9;

  // One controlled build: no items/relics/pets, a plain pistol, no crit.
  p.items = []; p.itemCounts = {}; p.relics = []; p.buffs = [];
  p.turrets = []; p.pet = null;
  p.base.crit = -1000; p.base.critDmg = 0;
  p.weapons = [];
  p.addWeapon('pistol', 0);
  if (!p.weapons.length) throw new Error('pistol could not be equipped');
  p.weapons[0].ethereal = false;
  p.weapons[0].cd = 0;
  p.weapons[0].attach = [];
  p.recalc(true);
  p.st.crit = -1000;
  p.alive = true;
  p.hp = p.maxHp;
  p.manualAim = false;
  p.vx = 0; p.vy = 0;

  // One real wave, then a clean arena for each controlled hit.
  Game.startWave(1);
  Game.state = 'play';
  Game.waveTimer = 1e9;
  Game.spawnQueue.length = 0;
  Game.enemies.length = 0;
  Game.hash.clear();
  Projectiles.clear(); EnemyBullets.clear();
  if (Game.hazObjs) Game.hazObjs.length = 0;
  if (Game.level) { Game.level.hazards = []; Game.level.drops = []; }
  p.x = Game.level.w / 2; p.y = Game.level.h / 2;

  const chooseOpenPoint = (x, y, r) => {
    const L = Game.level;
    for (let k = 0; k < 32; k++) {
      const a = k * Math.PI * 2 / 32;
      const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
      if (!L.blocksRay(x, y, tx, ty) && !L.blocksRay(tx, ty, x, y)) return { x: tx, y: ty, angle: a };
    }
    return { x: x + r, y, angle: 0 };
  };

  // A real Game.update() trial.  This is the same tick path the 60 Hz loop
  // drives; the enemy is inert so the only damage is player-sourced.
  const trial = label => {
    p.hp = p.maxHp;
    p.alive = true;
    p.st.crit = -1000;
    p.weapons[0].cd = 0;
    p.stats.byWeapon = {};
    p.stats.dmg = 0;
    p.stats.crits = 0;
    Game.run.dmg = 0;
    Game.enemies.length = 0;
    Game.enemyPool.length = 0;
    Game.spawnQueue.length = 0;
    Game.hash.clear();
    Projectiles.clear(); EnemyBullets.clear();
    if (Game.hazObjs) Game.hazObjs.length = 0;

    const pt = chooseOpenPoint(p.x, p.y, 78);
    const e = Game.spawnEnemyAt(ENEMIES[0], pt.x, pt.y, false);
    e.spd = 0; e.dmg = 0; e.armor = 0; e.shield = 0;
    e.maxHp = 1e9; e.hp = 1e9;
    e.boss = null; e.elite = false; e.dead = false;
    e.attackCd = 999; e.contactCd = 999; e.shotCd = 999; e.state = 'idle';
    Game.hash.insert(e);
    p.aim = Math.atan2(e.y - p.y, e.x - p.x);

    const before = e.hp;
    let ticks = 0;
    while (ticks < 480 && e.hp >= before) {
      Game.update(1 / 60);
      ticks++;
    }
    const hpLoss = Math.max(0, before - e.hp);
    const byWeapon = num(p.stats.byWeapon && p.stats.byWeapon.pistol);
    const runDamage = num(Game.run.dmg);
    const damage = Math.max(hpLoss, byWeapon, runDamage);
    REPORT.session.damageTrials++;
    return { label, damage, hpLoss, byWeapon, runDamage, ticks };
  };

  // ---- baseline at 100 % ---------------------------------------------------
  p.hp = p.maxHp;
  REPORT.base.maxHp = num(p.maxHp);
  const baseTrial = trial('baseline');
  REPORT.base.damage = baseTrial.damage;
  REPORT.base.trial = baseTrial;

  // ---- change the two new options through the real click handler ----------
  const optDef = k => (UI.optDefs || []).find(o => o.k === k);
  const setOpt = (k, target) => {
    const o = optDef(k);
    if (!o) { fail('option definition missing: ' + k); return null; }
    let clicks = 0;
    while (OPT()[k] !== target && clicks < 20) {
      UI.cycleOpt(o, 1);
      clicks++;
    }
    REPORT.session.optionChanges += clicks;
    if (OPT()[k] !== target) fail('option ' + k + ' did not reach ' + target + ' (at ' + OPT()[k] + ')');
    return { value: OPT()[k], clicks };
  };

  const hpSet = setOpt('hpScale', ${HP_TARGET});
  REPORT.options.hpScale = hpSet && hpSet.value;
  REPORT.options.hpClicks = hpSet ? hpSet.clicks : 0;
  REPORT.scaled.maxHp = num(p.maxHp);
  REPORT.scaled.expectedMaxHp = Math.max(20, Math.round((120 + p.st.maxHp) * ${HP_TARGET} / 100));
  REPORT.checks.hpScaleOption = OPT().hpScale === ${HP_TARGET};
  REPORT.checks.hpScaleStep = !!hpSet && hpSet.clicks === ${Math.ceil(HP_TARGET / 10) - 10};
  REPORT.checks.hpScaled = REPORT.scaled.maxHp === REPORT.scaled.expectedMaxHp;
  REPORT.checks.hpLiveOnPlayer = p.maxHp === REPORT.scaled.expectedMaxHp;

  const dmgSet = setOpt('dmgScale', ${DMG_TARGET});
  REPORT.options.dmgScale = dmgSet && dmgSet.value;
  REPORT.options.dmgClicks = dmgSet ? dmgSet.clicks : 0;
  REPORT.checks.dmgScaleOption = OPT().dmgScale === ${DMG_TARGET};
  REPORT.checks.dmgScaleStep = !!dmgSet && dmgSet.clicks === ${Math.ceil(DMG_TARGET / 10) - 10};

  p.hp = p.maxHp;
  const scaledTrial = trial('scaled');
  REPORT.scaled.damage = scaledTrial.damage;
  REPORT.scaled.trial = scaledTrial;
  REPORT.scaled.damageRatio = baseTrial.damage > 0
    ? Math.round((scaledTrial.damage / baseTrial.damage) * 10000) / 10000
    : 0;
  REPORT.checks.damageScaled = baseTrial.damage > 0 &&
    Math.abs(REPORT.scaled.damageRatio - ${DMG_TARGET} / 100) <= 0.02;

  // ---- the real options renderer -----------------------------------------
  UI.renderOptions();
  const optText = (document.getElementById('optList') || {}).textContent || '';
  const hpDef = optDef('hpScale'), dmgDef = optDef('dmgScale');
  REPORT.ui = {
    hpLabelRendered: optText.indexOf('Barrierefreiheit: max. Leben') >= 0,
    dmgLabelRendered: optText.indexOf('Barrierefreiheit: ausgeteilter Schaden') >= 0,
    hpValueRendered: optText.indexOf(String(${HP_TARGET}) + ' %') >= 0,
    dmgValueRendered: optText.indexOf(String(${DMG_TARGET}) + ' %') >= 0,
    hpDef: hpDef ? { type: hpDef.type, min: hpDef.min, max: hpDef.max, step: hpDef.step } : null,
    dmgDef: dmgDef ? { type: dmgDef.type, min: dmgDef.min, max: dmgDef.max, step: dmgDef.step } : null
  };
  REPORT.checks.uiRendered = REPORT.ui.hpLabelRendered && REPORT.ui.dmgLabelRendered &&
    REPORT.ui.hpValueRendered && REPORT.ui.dmgValueRendered;
  REPORT.checks.uiRange = !!hpDef && !!dmgDef &&
    hpDef.min === 50 && hpDef.max === 150 && hpDef.step === 10 &&
    dmgDef.min === 50 && dmgDef.max === 150 && dmgDef.step === 10;

  // ---- persistence --------------------------------------------------------
  Save.save();
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { /* reported below */ }
  REPORT.persistence = {
    key: SAVE_KEY,
    hpScale: raw && raw.opts ? raw.opts.hpScale : null,
    dmgScale: raw && raw.opts ? raw.opts.dmgScale : null
  };
  REPORT.checks.persisted = !!raw && !!raw.opts &&
    raw.opts.hpScale === ${HP_TARGET} && raw.opts.dmgScale === ${DMG_TARGET};

  for (const [name, ok] of Object.entries(REPORT.checks))
    if (!ok) fail('check: ' + name);
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
    await cdp('Page.navigate', { url: server.url + '/index.html?a11yplay=1&cb=' + Date.now() }, 15000);

    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const v = await ev("typeof Game === 'object' && typeof Player === 'function' && typeof UI === 'object' && typeof OPT === 'function'", 10000);
        if (v === true) { ready = true; break; }
      } catch { /* page still booting */ }
      await sleep(250);
    }
    if (!ready) throw new Error('engine did not boot');

    console.log('Accessibility scaling playtest — live run, seed 0x' + SEED.toString(16));
    const report = await ev(pageProbe(), 180000);
    if (!report || typeof report !== 'object') throw new Error('probe returned no report');

    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

    console.log('Session: ' + report.session.startRunCalls + ' startRun, ' +
      report.session.damageTrials + ' live Game.update trials, ' +
      report.session.optionChanges + ' option clicks.');
    console.log('Base: maxHp=' + report.base.maxHp + ', pistol hit=' + report.base.damage +
      ', speed=' + report.base.gameSpeed + ' ×' + report.base.speedBase);
    console.log('Scaled: maxHp=' + report.scaled.maxHp + ' (expected ' + report.scaled.expectedMaxHp +
      '), pistol hit=' + report.scaled.damage + ' (ratio ' + report.scaled.damageRatio + ')');
    console.log('Options: hpScale=' + report.options.hpScale + ' (' + report.options.hpClicks +
      ' clicks), dmgScale=' + report.options.dmgScale + ' (' + report.options.dmgClicks + ' clicks)');
    console.log('UI: ' + JSON.stringify(report.ui));
    console.log('Persisted: ' + JSON.stringify(report.persistence));
    console.log('Checks: ' + JSON.stringify(report.checks));

    if (!report.pass) {
      console.error('FAIL  accessibility scaling proof is incomplete');
      for (const f of report.failures || []) console.error('  - ' + f);
      process.exitCode = 1;
    } else {
      console.log('ACCESSIBILITY SCALING OK — HP 130 % and damage 120 % proven in one real run.');
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
