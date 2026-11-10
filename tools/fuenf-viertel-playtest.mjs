#!/usr/bin/env node
/* Fünf-Viertel live campaign — observable 100-wave headless proof.
 *
 * Uses the real classic page, real Game.startRun/startWave/nextWave/endWave,
 * real spawnAtPoint and Enemy.update. The report is written to
 * docs/pw/fuenf-viertel-playtest.json. No source is mutated here.
 *
 *   node tools/fuenf-viertel-playtest.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp
} from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const REPORT_PATH = path.join(ROOT, 'docs', 'pw', 'fuenf-viertel-playtest.json');
const PROFILE_PREFIX = 'fbfuenf-playtest-';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pageProbe() {
  return `(function () {
  const R = {
    ok: false, failures: [], started: null,
    waves: 0, districts: [], bosses: [], guestBosses: [], bossKills: [],
    draftSeen: [], aiSeen: [], plans: [], behavior: {},
    modEvidence: [], consoleErrors: []
  };
  const fail = (m) => R.failures.push(String(m));
  try {
    if (typeof FUENF_VIERTEL !== 'object' || !FUENF_VIERTEL) throw new Error('FUENF_VIERTEL not loaded');
    if (typeof CAMPAIGN_ENEMY_BY_ID !== 'object') throw new Error('CAMPAIGN_ENEMY_BY_ID not loaded');
    if (typeof Game !== 'object' || typeof Game.startRun !== 'function') throw new Error('Game not loaded');
    if (typeof Player !== 'function') throw new Error('Player not loaded');
    if (FUENF_VIERTEL.status !== 'live' || FUENF_VIERTEL.engineWired !== true) fail('config not live');

    // Isolate the run from previous local saves / daily settings.
    try { localStorage.clear(); } catch (e) {}
    Save.data.startItem = null; Save.data.startTier = 0;
    Game.coop = false; Game.daily = false; Game.endless = false;
    Game.manualSeed = 0x5f17c0de; Game.sel = ['leonidas', 'sylvia'];
    Game.danger = 0; Game.state = 'title'; Game.mods = [];
    Game.startRun();
    const p = Game.players[0];
    if (!p) throw new Error('startRun produced no player');
    p.pendingLevels = 0; p.xp = 0; p.level = 1;
    p.maxHp = 1e9; p.hp = 1e9; p.alive = true; p.recalc();
    Game.mods = [];
    R.started = Game.campaignSnapshot();
    R.hud = ($('hudWave') ? $('hudWave').textContent : '');
    if (!Game.campaignActive()) fail('campaign not active after startRun');
    if (R.started.globalWave !== 1) fail('first global wave is not 1');

    const draftIds = new Set(FUENF_VIERTEL.enemies.map((e) => e.id));
    const baseRange = [];
    const baseSpeed = [];
    const baseHarvest = [];
    const baseRegen = [];
    const baseCrit = [];
    const baseDodge = [];
    const sampleEnemy = (def, x, y) => {
      const e = Game.spawnAtPoint(def, false, null, { x: x, y: y });
      return e;
    };

    for (let g = 1; g <= 100; g++) {
      const local = ((g - 1) % 20) + 1;
      const di = Math.floor((g - 1) / 20);
      const district = FUENF_VIERTEL.districts[di];
      const spec = district.waves[local - 1];
      if (g > 1) Game.nextWave();
      const snap = Game.campaignSnapshot();
      if (snap.globalWave !== g) fail('global wave ' + g + ' state ' + snap.globalWave);
      if (snap.wave !== local) fail('wave ' + g + ' local ' + snap.wave);
      if (snap.districtIndex !== di) fail('wave ' + g + ' district ' + snap.districtIndex);
      if (snap.district !== district.id) fail('wave ' + g + ' district id ' + snap.district);
      if (snap.arena !== district.arena) fail('wave ' + g + ' arena ' + snap.arena + ' != ' + district.arena);
      const plan = snap.lastPlan;
      if (!plan) { fail('wave ' + g + ' has no lastPlan'); continue; }
      const countPct = Game.campaignModPct('enemy', 'countPct');
      const expectedCount = Math.max(1, Math.round(spec.count * (1 + countPct / 100)));
      if (plan.baseCount !== spec.count) fail('wave ' + g + ' baseCount ' + plan.baseCount + ' != ' + spec.count);
      if (plan.count !== expectedCount) fail('wave ' + g + ' count ' + plan.count + ' != ' + expectedCount);
      if (plan.elite !== spec.elite) fail('wave ' + g + ' elite ' + plan.elite + ' != ' + spec.elite);
      if (plan.queued !== plan.count) fail('wave ' + g + ' queued ' + plan.queued + ' != ' + plan.count);
      if ((plan.boss || null) !== (spec.boss || null)) fail('wave ' + g + ' plan boss ' + plan.boss + ' != ' + spec.boss);
      if (!!plan.bossQueued !== !!spec.boss) fail('wave ' + g + ' bossQueued');
      if (plan.ai.length !== spec.enemies.length) fail('wave ' + g + ' ai list length');
      R.waves++;

      if (local === 1) {
        const mods = Game.campaignMods.map((m) => m.id);
        if (JSON.stringify(mods) !== JSON.stringify(district.modifiers)) fail('district ' + district.id + ' mods ' + mods.join(','));
        R.districts.push({
          index: di, id: district.id, arena: Game.arena.id, mods: mods,
          world: Object.assign({}, Game.campaignWorld),
          barrels: Game.level.barrels.length, hazards: Game.hazObjs.length,
          movingWalls: Game.level.moving.length, lineOfSight: !!Game.level.campaignLineOfSight,
          height: !!Game.level.campaignHeight, harvest: !!Game.level.campaignHarvest,
          range: p.st.range, speed: p.st.speed, harvestStat: p.st.harvest, hpRegen: p.st.hpRegen,
          crit: p.st.crit, dodge: p.st.dodge
        });
        const rp = Game.campaignModPct('player', 'rangePct');
        const height = Game.campaignWorldValue('height') ? 5 : 0;
        baseRange.push(p.st.range - rp - height);
        baseSpeed.push(p.st.speed - Game.campaignModPct('player', 'speedPct'));
        baseHarvest.push(p.st.harvest - Game.campaignModPct('player', 'harvestPct') * .25);
        baseRegen.push(p.st.hpRegen - Game.campaignModPct('player', 'hpRegenPct') * .1);
        baseCrit.push(p.st.crit - Game.campaignModPct('player', 'critPct'));
        baseDodge.push(p.st.dodge - Game.campaignModPct('player', 'dodgePct'));
        R.modEvidence.push({ district: district.id, mods: mods, world: Object.assign({}, Game.campaignWorld), baseRange: baseRange[baseRange.length - 1] });
      }

      // Prove the exact planned roster spawns through the real spawn entrypoint.
      const seenThisWave = {};
      for (const q of Game.spawnQueue) {
        if (!q.def || seenThisWave[q.def.id]) continue;
        seenThisWave[q.def.id] = true;
        const e = sampleEnemy(q.def, Game.level.w / 2 + 80 + (Object.keys(seenThisWave).length * 12), Game.level.h / 2 + 30);
        if (!e) { fail('wave ' + g + ' spawn failed ' + q.def.id); continue; }
        if (e.def.id !== q.def.id) fail('spawn def id mismatch');
        if (draftIds.has(e.def.id) && !R.draftSeen.includes(e.def.id)) R.draftSeen.push(e.def.id);
        if (!R.aiSeen.includes(e.def.ai)) R.aiSeen.push(e.def.ai);
        // Measure the enemy speed mod against the engine's own base formula.
        if (e.def.spd) {
          const D = DANGERS[Game.danger];
          const expected = e.def.spd * D.spd * (1 + Math.min(.35, Game.wave * .012)) * (Game.wagerActive('hast') ? 1.25 : 1) * (1 + Game.campaignModPct('enemy', 'speedPct') / 100);
          if (Math.abs(e.spd - expected) > 1e-6) fail('wave ' + g + ' enemy speed mod ' + e.spd + ' != ' + expected);
        }
      }

      // Boss: spawn the assigned boss in the current district arena, verify the
      // guest's home arena differs, then resolve it through Enemy.die.
      if (spec.boss) {
        const bd = BOSSES.find((b) => b.id === spec.boss);
        if (!bd) { fail('wave ' + g + ' boss missing ' + spec.boss); }
        else {
          const boss = Game.spawnAtPoint(bd, false, bd, { x: Game.level.w / 2 + 150, y: Game.level.h / 2 });
          if (!boss || !boss.boss || boss.boss.id !== spec.boss) fail('wave ' + g + ' boss not spawned');
          else {
            const rec = { globalWave: g, district: district.id, arena: Game.level.a.id, id: boss.boss.id, homeArena: boss.boss.arena, guest: boss.boss.arena !== district.arena };
            R.bosses.push(rec);
            if (rec.guest) R.guestBosses.push(rec);
            if (rec.arena !== district.arena) fail('wave ' + g + ' boss arena ' + rec.arena + ' != ' + district.arena);
            boss.hp = 0; boss.die(p, 'melee');
            R.bossKills.push({ id: boss.boss.id, dead: !!boss.dead });
            if (!boss.dead) fail('wave ' + g + ' boss not resolvable');
            Game.bossAlive = false;
          }
        }
      }

      // Keep the wave-completion path, but no XP/shop level-up can stall the loop.
      p.pendingLevels = 0; p.xp = 0; p.hp = 1e9; p.alive = true;
      Game.levelQueue = []; Game.relicQueue = []; Game.wager = null; Game.waveEvent = null;
      Game.spawnQueue = []; Game.bossAlive = false;
      Game.enemies.length = 0; Game.hash.clear();
      Game.endWave();
      if (Game.state === 'levelup' || Game.state === 'relic') {
        // A normal contract/level reward must not stall the campaign harness:
        // consume nothing, leave the upgrade screen and let nextWave advance.
        p.pendingLevels = 0; Game.levelQueue = []; Game.relicQueue = []; Game.state = 'play';
      }
    }

    // Complete the campaign exactly once: the 100th endWave leaves the shop;
    // nextWave must finish the run.
    if (Game.campaignActive() && !Game.campaign.completed) {
      Game.nextWave();
    }
    if (!Game.campaign.completed) fail('campaign not completed after global wave 100');
    if (Game.state !== 'end') fail('campaign did not reach end screen: ' + Game.state);

    // ---- five AI behaviour probes (real Enemy.update, not data inspection) ----
    Game.state = 'play'; Game.campaign.completed = false;
    Game.setCampaignDistrict(0); Game.startWave(1);
    Game.waveDuration = 999; Game.waveTimer = 999; Game.waveEnding = false;
    Game.spawnQueue = []; Game.enemies = []; Game.hash.clear(); Game.hazObjs = [];
    p.weapons = []; p.recalc(); p.hp = 1e9; p.maxHp = 1e9; p.alive = true; p.pendingLevels = 0;
    const defs = {
      burrower: CAMPAIGN_ENEMY_BY_ID.wuehlmaus,
      trapper: CAMPAIGN_ENEMY_BY_ID.pflasterpirat,
      tether: CAMPAIGN_ENEMY_BY_ID.brueckenkette,
      commander: CAMPAIGN_ENEMY_BY_ID.taubenmeister,
      sniper: CAMPAIGN_ENEMY_BY_ID.pegelwaechter
    };
    for (const id of Object.keys(defs)) {
      Game.enemies = []; Game.hash.clear(); Game.hazObjs = [];
      p.hp = 1e9; p.maxHp = 1e9; p.alive = true; p.campaignSlowT = 0; p.campaignSlowPct = 0;
      const def = defs[id];
      const e = Game.spawnAtPoint(def, false, null, { x: p.x + 120, y: p.y });
      if (!e) { fail('behavior ' + id + ': no enemy'); continue; }
      e.eT = 0; e.shotCd = 0; e.summonCd = 0;
      if (id === 'commander') Game.spawnAtPoint(CAMPAIGN_ENEMY_BY_ID.walker, false, null, { x: p.x + 150, y: p.y + 25 });
      for (let t = 0; t < 240; t++) Game.update(1 / 60);
      const behavior = {
        ai: e.ai, burrowCount: e.burrowCount || 0, trapCount: e.trapCount || 0,
        tetherCount: e.tetherCount || 0, buffCount: e.buffCount || 0,
        sniperShots: e.sniperShots || 0, slowApplied: !!(p.campaignSlowT > 0),
        trapsOnField: Game.hazObjs.filter((h) => h.campaignTrap).length
      };
      R.behavior[id] = behavior;
      if (id === 'burrower' && behavior.burrowCount < 1) fail('behavior burrower did not burrow');
      if (id === 'trapper' && (behavior.trapCount < 1 || behavior.trapsOnField < 1)) fail('behavior trapper did not place a trap');
      if (id === 'tether' && behavior.tetherCount < 1) fail('behavior tether did not bind');
      if (id === 'commander' && behavior.buffCount < 1) fail('behavior commander did not buff');
      if (id === 'sniper' && behavior.sniperShots < 1) fail('behavior sniper did not shoot');
    }

    // Mod evidence: player base stats must be constant after removing the
    // declared percentage and height factor; world flags must match the package.
    const spread = (a) => Math.max.apply(null, a) - Math.min.apply(null, a);
    R.modEvidence.push({
      baseSpreads: { range: spread(baseRange), speed: spread(baseSpeed), harvest: spread(baseHarvest), hpRegen: spread(baseRegen), crit: spread(baseCrit), dodge: spread(baseDodge) }
    });
    for (const [k, v] of Object.entries(R.modEvidence[R.modEvidence.length - 1].baseSpreads)) {
      if (!(v < .02)) fail('mod base ' + k + ' not stable: ' + v);
    }
    const districtWorld = R.districts.map((d) => ({ id: d.id, world: d.world, barrels: d.barrels, hazards: d.hazards, lineOfSight: d.lineOfSight, height: d.height, movingWalls: d.movingWalls }));
    R.districtWorld = districtWorld;
    R.consoleErrors = (window.__campaignErrors || []).slice();

    R.draftSeen.sort();
    R.aiSeen.sort();
    R.ok = R.failures.length === 0;
  } catch (e) {
    R.failures.push('EXCEPTION: ' + (e && e.stack ? e.stack : e));
    R.consoleErrors = (window.__campaignErrors || []).slice();
    R.ok = false;
  }
  return JSON.stringify(R);
})()`;
}

async function waitForGame(ev, timeoutMs = 25000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await ev("typeof Game === 'object' && !!Game.startRun && document.readyState !== 'loading'");
    if (r) return true;
    await sleep(150);
  }
  return false;
}

let server = null, edge = null, conn = null;
let failed = false;
const report = {
  generated: new Date().toISOString(),
  ok: false, failures: [], warnings: [], page: null, console: []
};
const fail = (m) => { failed = true; report.failures.push(String(m)); console.error('FAIL  ' + m); };
const pass = (m) => console.log('PASS  ' + m);

try {
  if (!EDGE_PATH) throw new Error('no Chromium/Edge binary found');
  killScratchEdges([PROFILE_PREFIX, 'fbfuenf-']);
  server = await startStaticServer(ROOT);
  edge = await launchEdge({ profilePrefix: PROFILE_PREFIX });
  if (!edge.ok) throw new Error('headless browser did not start');
  conn = await connectPageCdp(edge.port);
  await conn.cdp('Page.enable'); await conn.cdp('Runtime.enable'); await conn.cdp('Log.enable');
  await conn.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: "window.__campaignErrors=[];(function(){var e=window.__campaignErrors;window.addEventListener('error',function(x){e.push('error: '+(x.message||x.error||'unknown'));});window.addEventListener('unhandledrejection',function(x){e.push('rejection: '+(x.reason&&x.reason.message?x.reason.message:x.reason));});var c=console.error;console.error=function(){try{e.push(Array.prototype.slice.call(arguments).join(' '));}catch(_){}c.apply(console,arguments);};})();"
  });
  conn.setEventHandler((d) => {
    if (d.method === 'Runtime.exceptionThrown') report.console.push('exception: ' + JSON.stringify(d.params.exceptionDetails).slice(0, 500));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') report.console.push('log: ' + d.params.entry.text);
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      try { report.console.push('console: ' + d.params.args.map((a) => a.value || a.description || '').join(' ')); } catch (e) {}
    }
  });
  const url = server.url + '/index.html?campaignplaytest=' + Date.now();
  await conn.cdp('Page.navigate', { url }, 20000);
  if (!await waitForGame(conn.ev)) throw new Error('Game did not initialize');
  await sleep(600);
  const result = await conn.evalResult(pageProbe(), 120000);
  if (!result.ok) { fail('page probe: ' + result.err); }
  else {
    report.page = JSON.parse(result.value);
    const r = report.page;
    if (!r.ok) for (const f of r.failures) fail(f);
    if (r.consoleErrors.length) fail('page console errors: ' + r.consoleErrors.join(' | '));
    if (report.console.length) fail('CDP errors: ' + report.console.join(' | '));
    if (!r.hud || !r.hud.includes('VIERTEL')) fail('HUD does not show district progress');
    if (r.waves !== 100) fail('waves ' + r.waves + '/100');
    if (r.bosses.length !== 10) fail('bosses ' + r.bosses.length + '/10');
    if (r.guestBosses.length !== 3) fail('guest bosses ' + r.guestBosses.length + '/3');
    if (r.bossKills.length !== 10 || r.bossKills.some((b) => !b.dead)) fail('boss kills not resolvable');
    if (r.draftSeen.length !== 32) fail('draft enemies ' + r.draftSeen.length + '/32');
    for (const ai of ['burrower', 'trapper', 'tether', 'commander', 'sniper']) {
      if (!r.aiSeen.includes(ai)) fail('AI family not spawned: ' + ai);
      if (!r.behavior[ai]) fail('AI behavior missing: ' + ai);
    }
    if (!r.districtWorld || r.districtWorld.length !== 5) fail('district world evidence missing');
    const rangeValues = new Set((r.districts || []).map((d) => Math.round(d.range * 100) / 100));
    if (rangeValues.size < 4) fail('player range modifier did not change across districts: ' + [...rangeValues].join(','));
    for (const d of r.districtWorld || []) {
      if (d.id === 'kurpark' && !(d.world.cover === 2 && d.world.hazard === 'poison' && d.barrels > 0 && d.hazards > 0)) fail('kurpark world effects not observable');
      if (d.id === 'innenstadt' && !(d.world.cover === 7 && d.lineOfSight && d.barrels > 0)) fail('innenstadt world effects not observable');
      if (d.id === 'rheinufer' && !(d.world.movingWalls && d.world.hazard === 'water' && d.hazards > 0 && d.movingWalls > 0)) fail('rheinufer world effects not observable');
      if (d.id === 'neroberg' && !(d.height && d.barrels > 0)) fail('neroberg height not observable');
      if (d.id === 'rheingau' && !(d.world.harvest && d.height && d.barrels > 0)) fail('rheingau harvest/height not observable');
    }
    if (r.ok) pass('real 100-wave campaign through startRun/nextWave/endWave');
    if (r.bosses.length === 10) pass('bosses at local 10/20 in all five districts');
    if (r.guestBosses.length === 3) pass('three guest bosses spawned and resolved in their guest arenas');
    if (r.draftSeen.length === 32) pass('all 32 draft enemies spawned through the real enemy pool');
    if (r.aiSeen.length >= 5) pass('all five new AI families spawned and behaved');
    if (r.behavior && Object.keys(r.behavior).length === 5) pass('AI counters: ' + JSON.stringify(Object.fromEntries(Object.entries(r.behavior).map(([k, v]) => [k, v.burrowCount || v.trapCount || v.tetherCount || v.buffCount || v.sniperShots]))));
  }
  report.ok = !failed;
  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log('report: ' + path.relative(ROOT, REPORT_PATH));
} catch (e) {
  fail(String(e && e.stack ? e.stack : e));
  report.ok = false;
  try { mkdirSync(path.dirname(REPORT_PATH), { recursive: true }); writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n'); } catch (x) {}
} finally {
  try { if (conn) conn.close(); } catch (e) {}
  try { if (edge && edge.kill) edge.kill(); } catch (e) {}
  try { if (server) server.close(); } catch (e) {}
}
if (failed) { console.error('FÜNF VIERTEL PLAYTEST FAILED'); process.exit(1); }
console.log('FÜNF VIERTEL PLAYTEST OK');
process.exit(0);
