#!/usr/bin/env node
//
// Hybrid weapons in complete 20-wave runs — not a shop scan, not a single hit.
//
// Each of the 15 dual-class weapons is the starting weapon of a normal run on
// the real campaign (Kurpark = the first 20-wave arc, bosses at local 10 and
// 20). The run is stepped with the engine's own Game.update(1/60); movement
// goes through the real input channel (Input.touch.p1, the touch stick path),
// auto-aim is the shipped OPT().aim === 'auto' path, level-ups and purchases go
// through Game.chooseUpgrade() and ShopSystem.buy(), and waves advance through
// Game.nextWave() / startWave(). No fake run object, no direct enemy.hurt().
//
// Deliberate, documented determinism/measurement controls:
//   * one character (Leonidas, the default all-rounder), danger 2, one seed for
//     all fifteen runs; Math.random is replaced by a tiny LCG because the shop
//     tier roll uses it directly (the game's own RAND stays seeded by Game);
//   * the character's start weapon is replaced by the tested hybrid at T0 and
//     all starting progression is reset, so every run measures the same start;
//   * UI.renderHud/renderShop/renderLevelUp/renderEnd/toast/banner are stubbed
//     to no-ops for headless stepping. They are presentation only; UI.show and
//     all state/queue code still run;
//   * the pilot is identical for all fifteen weapons: retreat below 60 % HP,
//     kite/avoid bullets and hazards, hold the weapon's natural stand-off
//     distance (melee ~64 px, ranged ~265 px), collect pickups when the area is
//     safe, focus the boss in boss waves, fire the character ability when
//     surrounded. It uses only live engine state;
//   * an identical support baseline for every run (+120 maxHp, +8 armor,
//     +2.5 hpRegen, +6 dodge) so an early death does not mask the weapon
//     signal; a 240 s overtime cap lets slow boss builds finish. Both live only
//     in the harness, not in the game.
//
// Usage:
//   node tools/hybrid-weapons-20waves.mjs                 # all 15, write baseline report
//   node tools/hybrid-weapons-20waves.mjs --weapons knochenbogen,streitkolben
//   node tools/hybrid-weapons-20waves.mjs --out docs/pw/hybrid-weapons-20w-after.json --tag after
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp, argOf
} from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const PROFILE_PREFIX = 'fbhybrid20-';
const DEFAULT_SEED = 0x5eedc0de;
const NEW_IDS = [
  'klingenbrecher', 'splitterklinge', 'granatkolben', 'pistolenkolben',
  'kaeltekompresse', 'runenstab', 'blitzspeer', 'belagerungsbombe',
  'knochenflinte', 'sanitaetsramme', 'streitkolben', 'ballistenarm',
  'mammutkeule', 'bollwerkbanner', 'knochenbogen'
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args = process.argv.slice(2);
const ONLY = argOf(args, '--weapons', '');
const IDS = ONLY ? ONLY.split(',').map(s => s.trim()).filter(Boolean) : NEW_IDS.slice();
const SEED = (parseInt(argOf(args, '--seed', String(DEFAULT_SEED)), 10) >>> 0) || DEFAULT_SEED;
const TAG = argOf(args, '--tag', 'baseline');
const OUT = path.resolve(ROOT, argOf(args, '--out', `docs/pw/hybrid-weapons-20w-${TAG}.json`));

/* The page-side runner. One call = one complete run; it is synchronous, so the
   page's own rAF loop cannot interleave a second Game.update. */
function runExpr(id, seed) {
  return `(function () {
  const ID = ${JSON.stringify(id)}, SEED = ${seed} >>> 0, DT = 1 / 60;
  const out = { id: ID, seed: SEED, tag: ${JSON.stringify(TAG)}, ok: false, failures: [], purchases: [], picks: {}, waves: [] };
  const fail = m => out.failures.push(String(m));
  const num = v => Number.isFinite(v) ? v : 0;
  const realRandom = Math.random;
  let nearestEnemyBak = null;
  try {
    if (typeof Game !== 'object' || typeof ShopSystem !== 'object' || typeof Player !== 'function') throw new Error('engine globals missing');
    if (!WEAPON_BY_ID[ID]) throw new Error('weapon def missing: ' + ID);
    const def = WEAPON_BY_ID[ID];
    const melee = def.type === 'melee';

    /* Test-only RNG: shop tiers use Math.random directly. Same stream for every
       run; combat keeps the engine's seeded RAND. */
    let rs = (SEED ^ 0x9e3779b9) >>> 0;
    Math.random = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };

    const o = OPT();
    o.aim = 'auto'; o.tutorial = false; o.particles = 0; o.autoQuality = false;
    Save.data.startTier = 0; Save.data.startItem = null; Save.data.mastery = {};
    Save.data.prestige = 0;
    Game.coop = false; Game.daily = false; Game.endless = false;
    Game.manualSeed = SEED; Game.sel = ['leonidas', 'sylvia'];
    Game.danger = 2; Game.mods = []; Game.state = 'title';
    Game.startRun();

    const p = Game.players[0];
    if (!p) throw new Error('startRun produced no player');
    p.weapons = []; p.items = []; p.itemCounts = {}; p.relics = []; p.buffs = []; p.turrets = []; p.pet = null; p.runUpgrades = {};
    p.stats = { dmg: 0, kills: 0, taken: 0, healed: 0, crits: 0, byWeapon: {} };
    p.level = 1; p.xp = 0; p.xpNext = p.xpFor(1); p.pendingLevels = 0; p.curse = 0;
    p.addWeapon(ID, 0);
    /* Standardized test support, identical for every weapon. The pilot is a
       survivability control, not a second balance variable: real buffs only,
       applied before wave 1. The tested hybrid stays the only per-run change. */
    for (const [stat, val] of [['maxHp', 120], ['armor', 8], ['hpRegen', 2.5], ['dodge', 6]]) p.addBuff(stat, val, 1e9);
    p.recalc(true); p.hp = p.maxHp;
    /* startRun() rolls two random run mods before wave 1; clear them and restart
       wave 1 so every weapon sees the same neutral first wave (no zeitdruck
       shortening, no hitze/regen side effects). District mods stay. */
    Game.mods = []; Game.startWave(1); p.recalc(true); p.hp = p.maxHp;

    /* Boss focus: in a boss fight a real player aims at the boss, not at the
       endless adds. Test-only aim policy, identical for every weapon; it only
       steers the shipped auto-aim, damage numbers are untouched. */
    nearestEnemyBak = Game.nearestEnemy;
    Game.nearestEnemy = function (x, y, maxR) {
      for (const b of this.enemies) {
        if (!b || b.dead || !b.boss) continue;
        if (!(maxR > 0) || Math.hypot(b.x - x, b.y - y) <= maxR) return b;
      }
      return nearestEnemyBak.call(this, x, y, maxR);
    };

    out.weapon = { id: ID, name: def.name, type: def.type, cls: def.cls.slice(), price0: tierData(def, 0).price, tierDamage: def.tiers.map(t => t[0]), tierRange: def.tiers.map(t => t[2]), scaling: Object.assign({}, def.scaling) };
    out.start = { char: p.char.id, hp: Math.round(p.hp), maxHp: Math.round(p.maxHp), danger: Game.danger, campaign: Game.campaignActive(),
      baseline: { maxHp: 120, armor: 8, hpRegen: 2.5, dodge: 6 },
      district: Game.campaign ? Game.campaign.district : null, arena: Game.arena && Game.arena.id, seed: Game.seed, wave: Game.wave };
    if (!Game.campaignActive()) fail('campaign not active after startRun');
    if (Game.wave !== 1) fail('run did not start on wave 1');

    /* Presentation stubs: headless stepping must not spend time in DOM renders.
       UI.show/state/queues are untouched, so the run logic is the shipped one. */
    const uiBak = { renderHud: UI.renderHud, renderShop: UI.renderShop, renderLevelUp: UI.renderLevelUp, renderEnd: UI.renderEnd, toast: UI.toast, banner: UI.banner };
    UI.renderHud = () => {}; UI.renderShop = () => {}; UI.renderLevelUp = () => {}; UI.renderEnd = () => {}; UI.toast = () => {}; UI.banner = () => {};

    const setMove = (x, y) => {
      const m = Math.hypot(x, y);
      if (m < 1e-4) { Input.touch.p1.x = 0; Input.touch.p1.y = 0; }
      else { Input.touch.p1.x = x / m; Input.touch.p1.y = y / m; }
    };

    /* Same pilot for every weapon: survive, hold the weapon's natural spacing,
       collect when safe. Reads only live engine state. */
    const steer = () => {
      const L = Game.level; if (!L) return;
      const hpFrac = p.hp / Math.max(1, p.maxHp);
      const critical = hpFrac < .60, hurt = hpFrac < .70;
      let ax = 0, ay = 0, nearest = null, nd = 1e9, boss = null;
      const es = Game.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i]; if (e.dead) continue;
        if (e.boss) boss = e;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < nd) { nd = d; nearest = e; }
        /* Below half HP the pilot stops trading blows and opens distance from
           everything; a real player disengages instead of holding stand-off. */
        const rr = critical ? (e.boss ? 430 : 340) : (e.boss ? 330 : 250);
        if (d < rr) { const w = 1 - d / rr, k = critical ? 3.1 : 2.3; ax -= dx / d * w * k; ay -= dy / d * w * k; }
      }
      /* Predictive bullet dodge: avoid the closest-approach point, not just
         the bullet's current position. */
      if (typeof EnemyBullets === 'object' && EnemyBullets.active) for (const b of EnemyBullets.active) {
        const rx = b.x - p.x, ry = b.y - p.y;
        const rvx = (b.vx || 0) - (p.vx || 0), rvy = (b.vy || 0) - (p.vy || 0);
        const vv = rvx * rvx + rvy * rvy;
        const t = vv > 1 ? -(rx * rvx + ry * rvy) / vv : 0;
        let cx = rx, cy = ry;
        if (t > 0 && t < 1.1) { cx = rx + rvx * t; cy = ry + rvy * t; }
        const cd = Math.hypot(cx, cy) || 1, rr = (b.r || 6) + 34;
        if (cd < rr) { const w = 1 - cd / rr; ax -= cx / cd * w * 3.6; ay -= cy / cd * w * 3.6; }
      }
      const hz = (L.hazards || []).concat(Game.hazObjs || []);
      for (const h of hz) {
        const r = h.r || 58;
        let hx = h.x, hy = h.y;
        if (h.kind === 'shell' && h.tx != null) { hx = h.tx; hy = h.ty; }
        const dx = p.x - hx, dy = p.y - hy, d = Math.hypot(dx, dy) || 1;
        if (d < r + 40) { const w = 1 - d / (r + 40); ax += dx / d * w * 2.4; ay += dy / d * w * 2.4; }
      }
      /* Telegraphed ground AoE (boss slams, shells, elite charges) is real
         damage; leave the marked area before it lands. */
      if (typeof FX === 'object' && FX.telegraphs && FX.telegraphs.active) for (const t of FX.telegraphs.active) {
        if (!t || t.dead || !(t.mx > 0) || t.life / t.mx > .55) continue;
        const r = Math.max(26, t.max || t.r || 40);
        const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy) || 1;
        if (d < r + 30) { const w = 1 - d / (r + 30); ax += dx / d * w * 2.2; ay += dy / d * w * 2.2; }
      }
      const anchor = boss || nearest;
      if (anchor && !critical) {
        const dx = anchor.x - p.x, dy = anchor.y - p.y, d = Math.hypot(dx, dy) || 1;
        const stand = melee ? 64 : 265;
        if (d > stand + 35) { ax += dx / d * 1.5; ay += dy / d * 1.5; }
        else if (d < stand - 25) { ax -= dx / d * 1.3; ay -= dy / d * 1.3; }
        else { ax += -dy / d * 0.9; ay += dx / d * 0.9; }
      }
      if (!anchor || nd > 300 || hurt) {
        let best = null, bd = 1e9;
        for (const m of Game.pickups) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
        if (best && bd < (critical ? 1300 : 1000)) { const w = critical ? 1.5 : 1.0; ax += (best.x - p.x) / (bd || 1) * w; ay += (best.y - p.y) / (bd || 1) * w; }
        let pp = null, pd = 1e9;
        for (const pu of Game.powerups) { const d = Math.hypot(pu.x - p.x, pu.y - p.y); if (d < pd) { pd = d; pp = pu; } }
        if (pp && pd < (hurt ? 1200 : 520)) {
          const heal = pp.type === 'heal';
          const w = heal ? (critical ? 4.2 : 2.4) : (hurt ? 1.0 : .7);
          ax += (pp.x - p.x) / (pd || 1) * w; ay += (pp.y - p.y) / (pd || 1) * w;
        }
      }
      const margin = 110;
      if (p.x < margin) ax += (margin - p.x) / margin * 2.2;
      if (p.x > L.w - margin) ax -= (p.x - (L.w - margin)) / margin * 2.2;
      if (p.y < margin) ay += (margin - p.y) / margin * 2.2;
      if (p.y > L.h - margin) ay -= (p.y - (L.h - margin)) / margin * 2.2;
      if (Math.abs(ax) + Math.abs(ay) < .05) { ax += (L.w / 2 - p.x) / L.w; ay += (L.h / 2 - p.y) / L.h; }
      setMove(ax, ay);
    };

    const SCORE = { maxHp: 6.5, hpRegen: 5, lifesteal: 5, dmgP: 8, atkSpd: 7.5, crit: 6.5, critDmg: 5.5, armor: 6, dodge: 5, speed: 4, range: 3, luck: 3, harvest: 3, xpGain: 3, expSize: 4, knock: 1.5, eng: 3, abilityRank: 3, abilityCdMod: 3 };
    const scoreChoice = c => {
      if (!c) return -1e9;
      if (c.kind === 'wup') return 12;
      if (c.kind === 'item') return 5;
      if (c.kind === 'wnew') return 2;
      let s = SCORE[c.stat] || 1;
      if (c.stat === 'melee' || c.stat === 'ranged' || c.stat === 'elem') s += 4 + ((def.scaling || {})[c.stat] || 0) * 10;
      /* Early run: a real player buys survival before damage. Late run: damage
         breaks the boss check. Identical policy for every weapon. */
      if (Game.wave <= 8 && (c.stat === 'maxHp' || c.stat === 'armor' || c.stat === 'dodge' || c.stat === 'hpRegen' || c.stat === 'lifesteal')) s += 4;
      const lowHp = p.hp / Math.max(1, p.maxHp);
      if (lowHp < .60 && (c.stat === 'maxHp' || c.stat === 'armor' || c.stat === 'dodge' || c.stat === 'hpRegen' || c.stat === 'lifesteal')) s += 14;
      if (lowHp < .35 && (c.stat === 'maxHp' || c.stat === 'armor' || c.stat === 'dodge' || c.stat === 'hpRegen' || c.stat === 'lifesteal')) s += 14;
      if (Game.wave >= 12 && (c.stat === 'dmgP' || c.stat === 'atkSpd' || c.stat === 'crit' || c.stat === 'critDmg')) s += 2;
      if (c.val) s += Math.min(3, Math.abs(c.val) / 10);
      return s;
    };

    /* Focus offer: one real weapon slot is always the tested weapon at the
       player's current tier, so a player who invests in it can actually do so.
       The purchase still goes through ShopSystem.buy() at the real price; only
       the offer composition is controlled, identically for all 15 runs. */
    const ensureFocusOffer = () => {
      const S = ShopSystem;
      if (!S.offers || !S.offers.length) return;
      let tier = 3;
      for (const w of p.weapons) if (w.id === ID) tier = Math.min(tier, w.tier);
      /* Same tier gate the shop uses for generated weapon offers
         (Math.min(tier, floor(wave/4))), so the focus path cannot outrun a
         normal run's weapon progression. */
      const maxTier = Math.min(3, Math.floor(Game.wave / 4));
      if (tier >= maxTier) return;
      const price = S.priceOf('weapon', ID, tier, Game.wave);
      let slot = S.offers.findIndex(o => o && o.kind === 'weapon' && o.id === ID);
      if (slot < 0) slot = S.offers.findIndex(o => o && o.kind === 'weapon');
      if (slot < 0) slot = S.offers.findIndex(o => o && o.kind === 'item');
      if (slot < 0) return;
      S.offers[slot] = { kind: 'weapon', id: ID, tier: tier, price: price };
      S.bought[slot] = false;
      out.focusOffer = { wave: Game.wave, slot: slot, tier: tier, price: price };
    };

    const buy = (idx, tag) => {
      const S = ShopSystem, off = S.offers[idx];
      if (!off || S.bought[idx] || Game.materials < off.price) return false;
      S.attachTarget = Math.max(0, p.weapons.findIndex(w => w.id === ID));
      S.buy(idx, p);
      if (S.bought[idx]) { out.purchases.push({ wave: Game.wave, tag: tag, kind: off.kind, id: off.id, tier: off.tier, price: off.price }); return true; }
      return false;
    };

    /* A normal shopper does not buy cursed/negative items blind. Score the
       shipped item stats; skip curses entirely (they also scale enemy HP/dmg). */
    const itemScore = (it, urgent) => {
      if (!it || it.cursed) return -999;
      const s = it.stats || {};
      let v = 0;
      v += (s.maxHp || 0) * .25 + (s.armor || 0) * 3 + (s.dodge || 0) * .8 + (s.hpRegen || 0) * 2 + (s.lifesteal || 0) * .35;
      v += (s.speed || 0) * .4 + (s.dmgP || 0) * .5 + (s.atkSpd || 0) * .5 + (s.crit || 0) * .5 + (s.critDmg || 0) * .15 + (s.range || 0) * .2;
      v += (s.melee || 0) * .4 + (s.ranged || 0) * .4 + (s.elem || 0) * .4 + (s.eng || 0) * .2;
      v += (s.harvest || 0) * .5 + (s.luck || 0) * .15 + (s.xpGain || 0) * .15 + (s.expSize || 0) * .1 + (s.knock || 0) * .05;
      if (s.maxHp < 0) v += s.maxHp * .3;
      if (s.armor < 0) v += s.armor * 3;
      if (urgent) v += (s.maxHp || 0) * .35 + (s.armor || 0) * 2 + (s.hpRegen || 0) * 3 + (s.dodge || 0) * .8 + (s.lifesteal || 0) * .5;
      return v;
    };

    const shopPolicy = () => {
      const S = ShopSystem;
      ensureFocusOffer();
      /* 1. The tested weapon has priority: every offer of it, so duplicates
         tier it up when the tier matches and add copies otherwise. */
      for (let pass = 0; pass < 6; pass++) {
        let acted = false;
        for (let i = 0; i < S.offers.length; i++) {
          const off = S.offers[i];
          if (off && !S.bought[i] && off.kind === 'weapon' && off.id === ID && Game.materials >= off.price) { if (buy(i, 'main')) acted = true; }
        }
        if (!acted) break;
      }
      /* 2. Build the firing line early: fill up to five weapon slots with the
         cheapest offers. Early DPS is what keeps a real run alive. */
      const fillWeapons = limit => {
        let guard = 0;
        while (p.weapons.length < limit && guard++ < 8) {
          let best = -1;
          for (let i = 0; i < S.offers.length; i++) {
            const off = S.offers[i];
            if (!off || S.bought[i] || off.kind !== 'weapon' || Game.materials < off.price) continue;
            if (best < 0 || off.price < S.offers[best].price) best = i;
          }
          if (best < 0) break;
          if (!buy(best, 'weapon')) break;
        }
      };
      fillWeapons(Math.min(5, p.weaponSlots()));
      /* 3. Up to three useful, non-cursed items per shop; four when hurt. */
      const itemLimit = p.hp / Math.max(1, p.maxHp) < .70 ? 4 : 3;
      for (let n = 0; n < itemLimit; n++) {
        let best = -1, bs = 0;
        for (let i = 0; i < S.offers.length; i++) {
          const off = S.offers[i];
          if (!off || S.bought[i] || off.kind !== 'item' || Game.materials < off.price) continue;
          const sc = itemScore(ITEM_BY_ID[off.id], p.hp / Math.max(1, p.maxHp) < .70);
          if (sc > bs) { bs = sc; best = i; }
        }
        if (best < 0) break;
        if (!buy(best, 'item')) break;
      }
      /* 4. Attachments go on the tested weapon. */
      for (let i = 0; i < S.offers.length; i++) {
        const off = S.offers[i];
        if (off && !S.bought[i] && off.kind === 'attach' && Game.materials >= off.price) buy(i, 'attach');
      }
      /* 5. Fill the last slot, then buy the remaining non-weapon offers. */
      fillWeapons(p.weaponSlots());
      for (let pass = 0; pass < 3; pass++) {
        let acted = false;
        for (let i = 0; i < S.offers.length; i++) {
          const off = S.offers[i];
          if (off && !S.bought[i] && off.kind !== 'weapon' && off.kind !== 'item' && off.kind !== 'attach' && Game.materials >= off.price) { if (buy(i, off.kind)) acted = true; }
        }
        if (!acted) break;
      }
      for (const u of (S.upgrades || [])) {
        const d = RUN_UPGRADE_BY_ID[u.id]; if (!d) continue;
        const owned = p.runUpgradeCount(u.id);
        if (owned >= d.maxStacks) continue;
        if (Game.materials >= S.upgradePrice(d, Game.wave, owned)) {
          const m0 = Game.materials;
          S.buyUpgrade(u.id, p);
          if (Game.materials < m0) out.purchases.push({ wave: Game.wave, tag: 'upgrade', kind: 'run', id: u.id });
        }
      }
    };

    let ticks = 0, playTicks = 0, wavePlay = 0, recordedWave = 0, completed = 0;
    let waveStart = null, overtimeCap = false, deathWave = 0, waveBegins = 0, lastState = null;
    const waveLog = out.waves;
    out.transitions = [];

    const beginWave = () => {
      waveBegins++;
      wavePlay = 0;
      waveStart = { kills: Game.run.kills, dmg: Game.run.dmg, mainDmg: num(p.stats.byWeapon[ID]), taken: p.stats.taken,
        bossWave: !!Game._curBoss, hp: p.hp, maxHp: p.maxHp };
    };
    const snapWave = (w, partial) => {
      const secs = wavePlay;
      const w0 = waveStart || { kills: 0, dmg: 0, mainDmg: 0, taken: 0, bossWave: false };
      const mainDmg = num(p.stats.byWeapon[ID]) - w0.mainDmg;
      const dmg = Game.run.dmg - w0.dmg;
      const boss = Game.enemies.find(e => e && !e.dead && e.boss);
      waveLog.push({
        wave: w, playSeconds: +secs.toFixed(2), waveDuration: +(Game.waveDuration || 0).toFixed(2), level: p.level,
        hp: Math.round(p.hp), maxHp: Math.round(p.maxHp), mats: Game.materials,
        weaponCount: p.weapons.length, mainTier: p.weapons.filter(x => x.id === ID).reduce((a, x) => Math.max(a, x.tier), 0),
        mainCopies: p.weapons.filter(x => x.id === ID).length,
        kills: Game.run.kills - w0.kills, dmg: Math.round(dmg), mainDmg: Math.round(mainDmg),
        taken: Math.round(p.stats.taken - w0.taken), dps: secs > 0 ? +(dmg / secs).toFixed(1) : 0,
        mainDps: secs > 0 ? +(mainDmg / secs).toFixed(1) : 0,
        bossWave: !!w0.bossWave, bossAlive: !!Game.bossAlive, bossHpFrac: boss ? +(boss.hp / Math.max(1, boss.maxHp)).toFixed(3) : (w0.bossWave ? 0 : null),
        otLevel: Game.otLevel || 0, partial: !!partial,
        enemiesLeft: Game.enemies.filter(e => !e.dead).length
      });
      recordedWave = w;
      if (!partial && w > completed) completed = w;
    };

    beginWave();
    let abilityT = 1.5, guardTicks = 0;
    const MAX_TICKS = 60 * 60 * 40; /* hard stop: 40 simulated minutes */
    while (completed < 20) {
      if (++guardTicks > MAX_TICKS) { fail('hard tick cap reached'); break; }
      const st = Game.state;
      if (st !== lastState) {
        out.transitions.push({ tick: ticks, wave: Game.wave, state: st, wavePlay: +wavePlay.toFixed(2), timer: +(Game.waveTimer || 0).toFixed(2), begins: waveBegins });
        lastState = st;
      }
      if (st === 'play') {
        steer();
        abilityT -= DT;
        if (abilityT <= 0) {
          abilityT = 3;
          if (p.alive && p.abilityCd <= 0) {
            let near = 0;
            for (const e of Game.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 220) near++;
            if (near >= 2) p.useAbility();
          }
        }
        Game.update(DT); ticks++; playTicks++; wavePlay += DT;
        if (wavePlay > (Game.waveDuration || 30) + 240) {
          overtimeCap = true; deathWave = Game.wave;
          if (recordedWave !== Game.wave) snapWave(Game.wave, true);
          fail('overtime cap at wave ' + Game.wave);
          break;
        }
        continue;
      }
      if (st === 'levelup') {
        if (recordedWave !== Game.wave) snapWave(Game.wave);
        const q = Game.levelQueue && Game.levelQueue[0];
        if (!q) { fail('levelup without queue at wave ' + Game.wave); break; }
        const choices = Game._curChoices || [];
        let best = choices[0], bs = -1e9;
        for (const c of choices) { const s = scoreChoice(c); if (s > bs) { bs = s; best = c; } }
        if (!best) { fail('levelup without choices'); break; }
        out.picks[best.name] = (out.picks[best.name] || 0) + 1;
        Game.chooseUpgrade(q, best);
        continue;
      }
      if (st === 'relic') { if (recordedWave !== Game.wave) snapWave(Game.wave); Game.skipRelic(); continue; }
      if (st === 'shop') {
        if (recordedWave !== Game.wave) snapWave(Game.wave);
        if (Game.wave >= 20) { completed = 20; break; }
        shopPolicy();
        Game.nextWave();
        beginWave();
        continue;
      }
      if (st === 'end') { deathWave = Game.wave; break; }
      fail('unexpected state: ' + st + ' at wave ' + Game.wave);
      break;
    }
    setMove(0, 0);
    if (Game.state === 'end' && !deathWave) deathWave = Game.wave;

    out.completed20 = completed >= 20;
    out.clearedWaves = completed;
    out.reachedWave = completed >= 20 ? 20 : Math.max(completed, Game.wave || 0);
    out.died = Game.state === 'end' && !Game._endWon;
    out.endState = Game.state;
    out.overtimeCap = overtimeCap;
    out.deathWave = deathWave || (out.died ? Game.wave : 0);
    out.deathInfo = Game.deathInfo ? Game.deathInfo.name : null;
    out.totals = {
      ticks: ticks, simSeconds: +(playTicks / 60).toFixed(1), level: p.level,
      kills: Game.run.kills, dmg: Math.round(Game.run.dmg), mainDmg: Math.round(num(p.stats.byWeapon[ID])),
      mainShare: Game.run.dmg > 0 ? +(num(p.stats.byWeapon[ID]) / Game.run.dmg * 100).toFixed(1) : 0,
      taken: Math.round(p.stats.taken), healed: Math.round(p.stats.healed), crits: p.stats.crits,
      materials: Game.run.materials, bosses: Game.run.bosses,
      mainTier: p.weapons.filter(x => x.id === ID).reduce((a, x) => Math.max(a, x.tier), 0),
      mainCopies: p.weapons.filter(x => x.id === ID).length,
      weapons: p.weapons.map(w => ({ id: w.id, tier: w.tier, attach: (w.attach || []).length })),
      byWeapon: Object.assign({}, p.stats.byWeapon)
    };
    out.ok = out.failures.length === 0;
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e);
    out.ok = false;
  } finally {
    try { Math.random = realRandom; } catch (e) { }
    try { if (nearestEnemyBak) Game.nearestEnemy = nearestEnemyBak; } catch (e) { }
    try { if (typeof UI === 'object' && uiBak) { UI.renderHud = uiBak.renderHud; UI.renderShop = uiBak.renderShop; UI.renderLevelUp = uiBak.renderLevelUp; UI.renderEnd = uiBak.renderEnd; UI.toast = uiBak.toast; UI.banner = uiBak.banner; } } catch (e) { }
    try { Input.touch.p1.x = 0; Input.touch.p1.y = 0; } catch (e) { }
    try { Game.state = 'paused'; } catch (e) { }
    try { Game.hideTutorial(); } catch (e) { }
  }
  return JSON.stringify(out);
})()`;
}

/* Static reference DPS from the shipped BalanceSim: same model the game's own
   balance screen uses, at the fixed level-14 reference stats. This is the
   outlier baseline independent of the run build; the runs validate it. */
function refExpr() {
  return `(function () {
  const st = BalanceSim.refStats(14);
  const rows = WEAPONS.map(w => {
    BalanceSim._rng = BalanceSim._mulberry32(BalanceSim.weaponSeed(w.id));
    return { id: w.id, name: w.name, type: w.type, cls: w.cls.slice(), legendary: !!w.legendary,
      price2: tierData(w, 2).price, tierDamage: w.tiers.map(t => t[0]), tierRange: w.tiers.map(t => t[2]),
      dps2: +BalanceSim.weaponDPS(w, 1, st, 90).toFixed(1),
      dps3: +BalanceSim.weaponDPS(w, 2, st, 90).toFixed(1) };
  });
  return JSON.stringify({ ok: true, refLevel: 14, rows: rows });
})()`;
}

async function main() {
  if (!EDGE_PATH) { console.error('FAIL  browser — no Edge/Chromium binary found'); process.exitCode = 1; return; }
  killScratchEdges([PROFILE_PREFIX]);
  const server = await startStaticServer(ROOT);
  let edge = null, conn = null;
  const report = {
    generated: new Date().toISOString(), tag: TAG, seed: SEED,
    method: 'Complete 20-wave Kurpark arc per weapon: real Game.startRun/startWave/endWave/nextWave, Game.update(1/60), auto-aim, one fixed pilot, real level-ups and ShopSystem purchases. Campaign district 1, danger 2, Leonidas, T0 start, identical +120 maxHp/+8 armor/+2.5 hpRegen/+6 dodge support baseline and a 240 s overtime cap for all runs.',
    reference: null, runs: [], failures: []
  };
  try {
    edge = await launchEdge({ profilePrefix: PROFILE_PREFIX });
    if (!edge.ok) throw new Error('headless browser did not start on CDP port ' + edge.port + (edge.err ? ' — ' + edge.err : ''));
    conn = await connectPageCdp(edge.port);
    const { cdp, ev } = conn;
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: server.url + '/index.html?hybrid20=1&cb=' + Date.now() }, 15000);
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if (await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof Player === 'function' && typeof BalanceSim === 'object'", 10000)) { ready = true; break; }
      } catch { /* booting */ }
      await sleep(250);
    }
    if (!ready) throw new Error('engine did not boot');
    await sleep(500);

    report.reference = JSON.parse(await ev(refExpr(), 60000));
    const refById = {};
    for (const r of report.reference.rows) refById[r.id] = r;

    console.log('Hybrid 20-wave runs — seed 0x' + SEED.toString(16) + ', ' + IDS.length + ' weapon(s), danger 2, Kurpark 1-20');
    for (const id of IDS) {
      const t0 = Date.now();
      let r = null;
      try {
        r = JSON.parse(await ev(runExpr(id, SEED), 600000));
      } catch (e) {
        r = { id: id, ok: false, error: String(e && e.message ? e.message : e), failures: ['eval failed'] };
      }
      r.wallMs = Date.now() - t0;
      r.reference = refById[id] || null;
      report.runs.push(r);
      const where = r.completed20 ? '20/20' : (r.reachedWave ? 'wave ' + r.reachedWave : '?');
      const tot = r.totals || {};
      console.log(
        (r.ok && r.completed20 ? 'PASS' : r.ok ? 'PART' : 'FAIL') + '  ' + id.padEnd(16) +
        ' ' + where.padEnd(7) +
        ' level ' + String(tot.level || 0).padStart(2) +
        ' | main T' + (tot.mainTier || 0) + ' x' + (tot.mainCopies || 0) +
        ' | dmg ' + String(tot.mainDmg || 0).padStart(6) + ' (' + String(tot.mainShare || 0).padStart(4) + '%)' +
        ' | kills ' + String(tot.kills || 0).padStart(4) +
        ' | taken ' + String(tot.taken || 0).padStart(4) +
        ' | ' + (r.wallMs / 1000).toFixed(1) + 's' +
        (r.failures && r.failures.length ? ' | ' + r.failures.join('; ') : '')
      );
      if (r.error) console.log('      error: ' + String(r.error).slice(0, 300));
      mkdirSync(path.dirname(OUT), { recursive: true });
      writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
    }
    const bad = report.runs.filter(r => !r.ok);
    if (bad.length) {
      console.error('FAIL  ' + bad.length + ' run(s) reported failures');
      for (const b of bad) for (const f of (b.failures || [])) console.error('  - ' + b.id + ': ' + f);
      if (bad.every(b => b.error)) process.exitCode = 1;
    } else {
      const full = report.runs.filter((r, i) => r.completed20 && (ONLY || i < IDS.length)).length;
      console.log(full === IDS.length ? 'HYBRID 20-WAVE RUNS OK — all ' + IDS.length + ' completed the 20-wave arc.' : 'HYBRID 20-WAVE RUNS COMPLETE — ' + full + '/' + IDS.length + ' completed 20 waves.');
    }
    console.log('Report: ' + path.relative(ROOT, OUT));
    if (existsSync(OUT)) console.log('Bytes: ' + readFileSync(OUT).length);
  } catch (e) {
    console.error('FAIL  ' + String(e && e.stack ? e.stack : e));
    process.exitCode = 1;
  } finally {
    if (conn) conn.close();
    if (edge) edge.kill();
    try { server.close(); } catch { /* ignore */ }
  }
}

main();
