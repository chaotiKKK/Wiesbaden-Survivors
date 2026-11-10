#!/usr/bin/env node
//
// The 14 gap weapons in the real run — not a data scan.
//
// These are the weapons at data.js indices 42-55 (skalpell … armbrust).  They
// closed the class gaps before the 15 dual-class hybrids: without them medical
// drops to 4 weapons, with them every class has at least 6.  This tool starts a
// normal Game run in the same browser harness as the gate, then proves in one
// session:
//
//   1. Every gap weapon appears in at least one generated shop.  The offer
//      object is inspected and the real UI.renderShop() output is checked too.
//   2. Every gap weapon deals damage in a real wave update.  A real
//      Game.update() loop drives the actual Player/WeaponSystem/Enemy path
//      against a live enemy; no data.js formula is used as a stand-in.
//
// The run is deterministic (fixed manual seed and fixed 60 Hz steps).  It
// writes docs/pw/gap-weapons-playtest.json as the raw protocol and exits
// non-zero on the first missing shop offer or missing damage.
//
// Usage: node tools/gap-weapons-playtest.mjs
//

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp
} from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const REPORT_PATH = path.join(ROOT, 'docs', 'pw', 'gap-weapons-playtest.json');
const PROFILE_PREFIX = 'fbgap-edge-';
const SEED = 0x6a9c0de;
const GAP_IDS = [
  'skalpell', 'rettungssaege', 'flammenklinge', 'klingenpistole',
  'notfallhammer', 'steinhammer', 'frosthammer', 'schmiedehammer',
  'feldscher', 'kraeuterkessel', 'desinfektionsgranate', 'wurfbeil',
  'bannerlanze', 'armbrust'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pageProbe() {
  return `
(function () {
  const GAP_IDS = ${JSON.stringify(GAP_IDS)};
  const REPORT = {
    seed: ${SEED}, player: null, run: null,
    session: { startRunCalls: 1, shopsScanned: 0, trials: 0 },
    shop: {}, damage: {}, failures: [], shopShopsScanned: 0, shopUiChecked: 0
  };
  const fail = m => REPORT.failures.push(m);
  const num = v => Number.isFinite(v) ? v : 0;
  // Shop tiers and a few presentation helpers use Math.random directly.  This
  // test-only LCG makes the whole protocol repeatable from the printed seed;
  // the game's seeded RAND is unaffected.
  const realRandom = Math.random;
  let randomState = ${SEED} >>> 0;
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };

  if (typeof Game !== 'object' || typeof ShopSystem !== 'object' || typeof Player !== 'function')
    throw new Error('engine globals missing');
  const missingDefs = GAP_IDS.filter(id => !WEAPON_BY_ID[id]);
  if (missingDefs.length) throw new Error('weapon defs missing: ' + missingDefs.join(','));

  // A clean, deterministic real run.  startRun() is the same entry point the
  // character screen uses; we do not construct a fake run object.
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
  p.items = []; p.itemCounts = {}; p.relics = []; p.buffs = []; p.turrets = []; p.pet = null;
  p.recalc(true);
  REPORT.player = p.char.id;
  REPORT.run = { arena: Game.arena && Game.arena.id, wave: Game.wave, seed: Game.seed };

  // ---- 1. shop reachability ------------------------------------------------
  let found = 0;
  for (let i = 0; i < 600 && found < GAP_IDS.length; i++) {
    const wave = 1 + (i % 20);
    Game.wave = wave;
    ShopSystem.generate(wave, [p]);
    REPORT.shopShopsScanned = i + 1;
    const hits = (ShopSystem.offers || []).filter(o => o && o.kind === 'weapon' && GAP_IDS.indexOf(o.id) >= 0 && !REPORT.shop[o.id]);
    if (!hits.length) continue;
    // This is the real shop renderer used by nextLevelOrShop().
    UI.shopPlayer = 0;
    Game.state = 'shop';
    UI.renderShop();
    const text = (document.getElementById('shopItems') || {}).textContent || '';
    REPORT.shopUiChecked++;
    for (const o of hits) {
      const def = WEAPON_BY_ID[o.id];
      REPORT.shop[o.id] = {
        wave,
        shopIndex: i,
        slot: ShopSystem.offers.indexOf(o),
        price: o.price,
        tier: o.tier,
        type: def.type,
        classes: def.cls.slice(),
        rendered: text.indexOf(def.name) >= 0
      };
      found++;
    }
  }
  REPORT.session.shopsScanned = REPORT.shopShopsScanned;
  for (const id of GAP_IDS) {
    if (!REPORT.shop[id]) fail('shop: ' + id + ' appeared in no generated offer within 600 shops');
    else if (!REPORT.shop[id].rendered) fail('shop UI: ' + id + ' offer was not rendered in #shopItems');
  }

  // ---- 2. live wave damage -------------------------------------------------
  // One real wave, then reset enemies between weapon trials.  Game.update()
  // is the same function the 60 Hz loop calls; this is not a direct hurt().
  Game.state = 'play';
  const resetForBuild = () => {
    p.weapons = [];
    p.items = []; p.itemCounts = {}; p.relics = []; p.buffs = []; p.turrets = []; p.pet = null;
    p.alive = true; p.hp = p.maxHp;
  };

  Game.startWave(1);
  Game.state = 'play';
  Game.waveTimer = 1e9;
  Game.spawnQueue.length = 0;
  Game.enemies.length = 0;
  Game.hash.clear();
  Projectiles.clear(); EnemyBullets.clear();
  if (Game.hazObjs) Game.hazObjs.length = 0;
  if (Game.level) { Game.level.hazards = []; Game.level.drops = []; }

  const chooseOpenPoint = (x, y, r) => {
    const L = Game.level;
    for (let k = 0; k < 32; k++) {
      const a = k * Math.PI * 2 / 32;
      const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
      if (!L.blocksRay(x, y, tx, ty) && !L.blocksRay(tx, ty, x, y)) return { x: tx, y: ty, angle: a };
    }
    return { x: x + r, y, angle: 0 };
  };

  for (const id of GAP_IDS) {
    resetForBuild();
    p.weapons = [];
    p.addWeapon(id, 0);
    if (!p.weapons.length) { fail('damage: ' + id + ' could not be equipped'); continue; }
    p.weapons[0].cd = 0;
    p.recalc(true);
    p.hp = p.maxHp;
    p.x = Game.level.w / 2; p.y = Game.level.h / 2;
    p.vx = 0; p.vy = 0; p.manualAim = false;
    p.stats.byWeapon = {};
    p.stats.crits = 0;

    Game.enemies.length = 0;
    Game.enemyPool.length = 0;
    Game.projectiles && Game.projectiles.clear && Game.projectiles.clear();
    Projectiles.clear(); EnemyBullets.clear();
    Game.spawnQueue.length = 0;
    Game.hash.clear();
    Game.run.dmg = 0;

    const pt = chooseOpenPoint(p.x, p.y, 78);
    const e = Game.spawnEnemyAt(ENEMIES[0], pt.x, pt.y, false);
    e.spd = 0; e.dmg = 0; e.armor = 0; e.shield = 0;
    e.maxHp = 1e9; e.hp = 1e9;
    e.boss = null; e.elite = false; e.dead = false;
    e.attackCd = 999; e.contactCd = 999; e.shotCd = 999; e.state = 'idle';
    Game.hash.insert(e);
    p.aim = Math.atan2(e.y - p.y, e.x - p.x);

    let firstHitTick = -1, hpLoss = 0;
    for (let tick = 0; tick < 480; tick++) {
      Game.update(1 / 60);
      hpLoss = 1e9 - e.hp;
      if (Game.run.dmg > 0 || hpLoss > 0) { firstHitTick = tick; break; }
    }
    const byWeapon = num(p.stats.byWeapon && p.stats.byWeapon[id]);
    const runDmg = num(Game.run.dmg);
    const dealt = Math.max(byWeapon, hpLoss, runDmg);
    REPORT.session.trials++;
    REPORT.damage[id] = {
      type: WEAPON_BY_ID[id].type,
      classes: WEAPON_BY_ID[id].cls.slice(),
      wave: Game.wave,
      ticks: firstHitTick < 0 ? 480 : firstHitTick + 1,
      simSeconds: Math.round((firstHitTick < 0 ? 480 : firstHitTick + 1) / 60 * 100) / 100,
      byWeapon,
      runDamage: runDmg,
      hpLoss: Math.round(hpLoss * 100) / 100,
      tickDamage: dealt,
      enemyHpAfter: Math.round(e.hp * 100) / 100
    };
    if (!(dealt > 0)) fail('damage: ' + id + ' dealt no damage in 480 real Game.update ticks');
  }

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
    await cdp('Page.navigate', { url: server.url + '/index.html?gapplay=1&cb=' + Date.now() }, 15000);

    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const v = await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof Player === 'function' && typeof WEAPON_BY_ID === 'object'", 10000);
        if (v === true) { ready = true; break; }
      } catch { /* page still booting */ }
      await sleep(250);
    }
    if (!ready) throw new Error('engine did not boot');

    console.log('Gap weapon playtest — live run, seed 0x' + SEED.toString(16));
    const report = await ev(pageProbe(), 180000);
    if (!report || typeof report !== 'object') throw new Error('probe returned no report');

    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
    console.log('Session: ' + report.session.startRunCalls + ' startRun, ' +
      report.shopShopsScanned + ' generated shops, ' + report.shopUiChecked +
      ' real render(s), ' + report.session.trials + ' damage trials.');

    let ok = true;
    for (const id of GAP_IDS) {
      const s = report.shop[id];
      const d = report.damage[id];
      const shopOk = !!(s && s.rendered);
      const dmgOk = !!(d && d.tickDamage > 0);
      if (!shopOk || !dmgOk) ok = false;
      console.log((shopOk ? 'PASS' : 'FAIL') + '  shop  ' + id.padEnd(20) +
        (s ? 'W' + s.wave + ' slot ' + s.slot + ' ' + s.price + ' mat, tier ' + s.tier + ', rendered=' + s.rendered : 'missing'));
      console.log((dmgOk ? 'PASS' : 'FAIL') + '  damage ' + id.padEnd(20) +
        (d ? d.byWeapon + ' weapon damage, ' + d.hpLoss + ' HP loss, ' + d.ticks + ' ticks (' + d.simSeconds + 's)' : 'missing'));
    }

    if (!ok) {
      console.error('FAIL  one or more gap weapon proofs are incomplete');
      for (const f of report.failures || []) console.error('  - ' + f);
      process.exitCode = 1;
    } else {
      console.log('GAP WEAPONS OK — ' + GAP_IDS.length + '/' + GAP_IDS.length + ' shop offers and real damages proven in one session.');
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
