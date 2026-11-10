#!/usr/bin/env node
//
// Charakter-Riege 44 live: alle zwoelf neuen Helden durch den echten UI-Flow.
//
// Der Datencheck allein zaehlt keine Helden. Dieses Werkzeug beweist je Held:
//   1. Save-Karte in #charGrid ist auswaehlbar,
//   2. #scTitle -> #charGrid -> #scChar -> #scControls startet den Lauf,
//   3. die Startwaffe ist die deklarierte Waffe,
//   4. die Ability-ID stimmt und der Skill-Key setzt abilityCd > 0,
//   5. mindestens 4 von 5 stehenden Testgegnern nehmen Schaden,
//   6. ein messbarer Status (Stun/Slow/Brand/Gift/Schock), Buff, Heilung
//      oder Beute-Effekt tritt im echten Engine-Zustand auf.
//
// Ein fester Seed macht den Lauf reproduzierbar; der erste Held wird direkt
// ein zweites Mal gespielt und die Treffer-/HP-Werte muessen exakt gleich sein.
//
// Report: docs/pw/characters-44-playtest.json
// Usage:  node tools/characters-44-playtest.mjs
//

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp
} from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const REPORT_PATH = path.join(ROOT, 'docs', 'pw', 'characters-44-playtest.json');
const PROFILE_PREFIX = 'wbn-chars44-edge-';
const SEED = 0x4a17;

const HEROES = [
  { id: 'speersophie', name: 'Speer-Sophie', weapon: 'spear', ability: 'speerwurf', status: 'stunned', buffs: ['range'] },
  { id: 'axtachim', name: 'Axt-Achim', weapon: 'chopper', ability: 'holzhack', status: 'stunned', buffs: ['melee'] },
  { id: 'nagelnadja', name: 'Nagel-Nadja', weapon: 'nagler', ability: 'nagelregen', status: 'stunned', buffs: ['atkSpd'], extras: ['slowed', 'marked'] },
  { id: 'bierbernd', name: 'Bier-Bernd', weapon: 'bierwerfer', ability: 'fassrolle', status: 'burnt', buffs: ['armor'], dash: true },
  { id: 'minenmarie', name: 'Minen-Marie', weapon: 'magnetmine', ability: 'magnetfeld', status: 'slowed', buffs: ['eng'], extras: ['stunned'] },
  { id: 'taubentoni', name: 'Tauben-Toni', weapon: 'taubenschwarm', ability: 'taubensturm', status: 'slowed', buffs: ['luck'], pickups: true },
  { id: 'saegesvenja', name: 'Säge-Svenja', weapon: 'kettensaege', ability: 'kettenschnitt', status: 'burnt', buffs: ['atkSpd'], extras: ['stunned'], dash: true },
  { id: 'laserlars', name: 'Laser-Lars', weapon: 'laserzirkel', ability: 'laserfokus', status: 'slowed', buffs: ['crit', 'range'], extras: ['marked'] },
  { id: 'blitzbritta', name: 'Blitz-Britta', weapon: 'blitzableiter', ability: 'kettenblitz', status: 'shocked', buffs: ['elem'], extras: ['stunned'] },
  { id: 'skalpellsina', name: 'Skalpell-Sina', weapon: 'skalpell', ability: 'notoperation', status: 'poisoned', buffs: ['lifesteal'], extras: ['stunned'], healed: true },
  { id: 'rettungsralf', name: 'Rettungs-Ralf', weapon: 'rettungssaege', ability: 'rettungsgriff', status: 'stunned', buffs: ['armor'], healed: true },
  { id: 'flammenfelix', name: 'Flammen-Felix', weapon: 'flammenklinge', ability: 'brandschneise', status: 'burnt', buffs: ['speed', 'elem'], extras: ['stunned'] }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pageProbe() {
  return `
(function () {
  const HEROES = ${JSON.stringify(HEROES)};
  const REPORT = { seed: ${SEED}, heroes: [], determinism: null, checks: {}, failures: [] };
  const fail = m => REPORT.failures.push(m);
  const num = v => Number.isFinite(v) ? v : 0;

  if (typeof Game !== 'object' || typeof CHARS !== 'object' || typeof UI !== 'object' ||
      typeof Input !== 'object' || typeof ENEMY_BY_ID !== 'object')
    throw new Error('engine/data globals missing');
  if (typeof OPT === 'function') OPT().tutorial = false;

  function runOnce(spec) {
    Game.coop = false; Game.daily = false; Game.endless = false;
    Game.manualSeed = ${SEED}; Game.sel = [spec.id]; Game.mods = []; Game.danger = 0;
    Game.campaign = null; Game.campaignMods = []; Game.campaignWorld = {};
    Game.state = 'title';
    UI.renderTitle(); UI.show('scTitle');
    document.querySelector('#scTitle [data-act="play"]').click();
    const card = Array.prototype.slice.call(document.querySelectorAll('#charGrid .card'))
      .filter(function (el) { return el.textContent.indexOf(spec.name) >= 0; })[0];
    const selectable = !!card && !card.classList.contains('lock');
    if (card) card.click();
    document.querySelector('#scChar [data-act="charConfirm"]').click();
    document.querySelector('#scControls [data-act="controlsOK"]').click();

    const p = Game.players && Game.players[0];
    const started = !!p && p.char.id === spec.id && Game.state === 'play';
    const rec = {
      id: spec.id, name: spec.name, selectable: selectable, started: started,
      weapon: p && p.weapons[0] ? p.weapons[0].id : null,
      abilityExpected: spec.ability,
      abilityActual: p && p.char.ability ? p.char.ability.id : null,
      before: null, after: null
    };
    if (!started) { if (p) { UI.show(null); Game.state = 'title'; } return rec; }

    // Kontrollierte Arena: fuenf stehende Testgegner in einem schmalen Fächer.
    Game.qaGod = true; Game.wave = 1; Game.waveTimer = 999; Game.waveEnding = false;
    Game.spawnQueue = []; Game.spawnAcc = 0;
    Game.enemies.length = 0; if (Game.enemyPool) Game.enemyPool.length = 0;
    Game.pickups.length = 0; Game.powerups.length = 0;
    p.x = Game.level.w / 2; p.y = Game.level.h / 2; p.vx = 0; p.vy = 0;
    p.hp = p.maxHp * .5; p.alive = true; p.invuln = 0;
    p.aim = 0; p.abilityCd = 0; p.buffs.length = 0; p.recalc();

    const spawned = [];
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * .03;
      const e = Game.spawnEnemyAt(ENEMY_BY_ID.walker, p.x + Math.cos(a) * 70, p.y + Math.sin(a) * 70);
      if (!e) continue;
      e.maxHp = 500; e.hp = 500; e.armor = 0; e.spd = 0;
      e.stun = 0; e.marked = 0; e.slowT = 0; e.burnT = 0; e.poisonT = 0; e.shockT = 0; e.freezeT = 0;
      spawned.push(e);
    }

    const snap = function () {
      return {
        playerHp: +num(p.hp).toFixed(3),
        enemyHp: spawned.map(function (e) { return +num(e.hp).toFixed(3); }),
        hits: spawned.filter(function (e, i) { return e.dead || e.hp < 500; }).length,
        dead: spawned.filter(function (e) { return e.dead; }).length,
        stunned: spawned.filter(function (e) { return (e.stun || 0) > 0; }).length,
        slowed: spawned.filter(function (e) { return (e.slowT || 0) > 0; }).length,
        burnt: spawned.filter(function (e) { return (e.burnT || 0) > 0; }).length,
        poisoned: spawned.filter(function (e) { return (e.poisonT || 0) > 0; }).length,
        shocked: spawned.filter(function (e) { return (e.shockT || 0) > 0; }).length,
        frozen: spawned.filter(function (e) { return (e.freezeT || 0) > 0; }).length,
        marked: spawned.filter(function (e) { return (e.marked || 0) > 0; }).length,
        buffs: p.buffs.map(function (b) { return b.stat; }),
        abilityCd: +num(p.abilityCd).toFixed(3),
        dash: +num(p.dashT).toFixed(3),
        pickups: Game.pickups.length,
        powerups: Game.powerups.length,
        materials: num(Game.materials),
        healed: p.hp > p.maxHp * .5 + .5
      };
    };

    rec.before = snap();
    const key = Input.key('skill1');
    Input.keys[key] = true;
    p.update(1 / 60);
    Input.keys[key] = false;
    rec.after = snap();
    rec.delta = {
      hits: rec.after.hits,
      playerHp: +(rec.after.playerHp - rec.before.playerHp).toFixed(3),
      pickups: rec.after.pickups - rec.before.pickups,
      powerups: rec.after.powerups - rec.before.powerups,
      materials: +(rec.after.materials - rec.before.materials).toFixed(3)
    };
    UI.show(null); Game.state = 'title';
    return rec;
  }

  for (const spec of HEROES) {
    const rec = runOnce(spec);
    const effects = ['slowed', 'marked', 'stunned', 'burnt', 'frozen', 'poisoned', 'shocked'];
    const wantedEffects = [spec.status].concat(spec.extras || []);
    const effectOk = wantedEffects.every(function (k) { return rec.after && rec.after[k] >= 4; });
    const buffsOk = !rec.after || spec.buffs.every(function (b) { return rec.after.buffs.indexOf(b) >= 0; });
    const pickupOk = spec.pickups ? !!rec.after && rec.after.pickups > rec.before.pickups : true;
    const healOk = spec.healed ? !!rec.after && rec.after.healed : true;
    const dashOk = spec.dash ? !!rec.after && rec.after.dash > 0 : true;
    const ok = rec.selectable && rec.started && rec.weapon === spec.weapon &&
      rec.abilityActual === spec.ability && !!rec.after && rec.after.abilityCd > 0 &&
      rec.after.hits >= 4 && effectOk && buffsOk && pickupOk && healOk && dashOk;
    rec.expectedEffects = wantedEffects;
    rec.checks = { effectOk: effectOk, buffsOk: buffsOk, pickupOk: pickupOk, healOk: healOk, dashOk: dashOk };
    rec.ok = ok;
    REPORT.heroes.push(rec);
    REPORT.checks[spec.id] = ok;
    if (!ok) fail('hero: ' + spec.id);
  }

  // Determinismus: derselbe Seed + derselbe Held muss dieselben Werte liefern.
  const a = REPORT.heroes[0];
  const b = runOnce(HEROES[0]);
  const same = !!a && !!b && JSON.stringify(a.after && a.after.enemyHp) === JSON.stringify(b.after && b.after.enemyHp) &&
    !!a && !!b && a.after && b.after && a.after.hits === b.after.hits && a.after.abilityCd === b.after.abilityCd;
  REPORT.determinism = { hero: HEROES[0].id, seed: ${SEED}, same: same,
    first: a && a.after ? { hits: a.after.hits, enemyHp: a.after.enemyHp, cd: a.after.abilityCd } : null,
    second: b && b.after ? { hits: b.after.hits, enemyHp: b.after.enemyHp, cd: b.after.abilityCd } : null };
  REPORT.checks.determinism = same;
  if (!same) fail('check: determinism');

  REPORT.heroCount = CHARS.length;
  REPORT.checks.rosterCount = CHARS.length === 44;
  if (!REPORT.checks.rosterCount) fail('check: rosterCount');
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
    await cdp('Page.navigate', { url: server.url + '/index.html?chars44=1&cb=' + Date.now() }, 15000);

    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const v = await ev("typeof Game === 'object' && typeof CHARS === 'object' && typeof UI === 'object' && typeof Input === 'object'", 10000);
        if (v === true) { ready = true; break; }
      } catch { /* page still booting */ }
      await sleep(250);
    }
    if (!ready) throw new Error('engine did not boot');

    console.log('Charakter-Riege 44 — live UI flow, seed 0x' + SEED.toString(16));
    const report = await ev(pageProbe(), 240000);
    if (!report || typeof report !== 'object') throw new Error('probe returned no report');

    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

    console.log('Roster: ' + report.heroCount + ' Helden; ' + report.heroes.length + ' live geprueft.');
    for (const h of report.heroes) {
      console.log('  ' + (h.ok ? 'PASS' : 'FAIL') + '  ' + h.id +
        '  waffe=' + h.weapon + ' ability=' + h.abilityActual +
        ' hits=' + (h.after ? h.after.hits : '-') + '/5 cd=' + (h.after ? h.after.abilityCd : '-') +
        ' status=' + JSON.stringify(h.after ? {
          stunned: h.after.stunned, slowed: h.after.slowed, burnt: h.after.burnt,
          poisoned: h.after.poisoned, shocked: h.after.shocked, marked: h.after.marked
        } : null) +
        ' buffs=' + JSON.stringify(h.after ? h.after.buffs : null));
    }
    console.log('Determinismus: ' + JSON.stringify(report.determinism));
    console.log('Checks: ' + JSON.stringify(report.checks));
    if (!report.pass) {
      console.error('FAIL  Charakter-Riege 44 proof is incomplete');
      for (const f of report.failures || []) console.error('  - ' + f);
      process.exitCode = 1;
    } else {
      console.log('CHARACTERS 44 OK — 12/12 new heroes start, fire and leave measurable effects.');
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
