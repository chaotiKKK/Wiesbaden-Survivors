// Fuenf-Viertel-Content-Paket — reiner Audit-/Validierungskern.
//
// Das Paket beschreibt die LIVE-Kampagne 5 Viertel x 20 Wellen (global 1–100),
// 32 neue Gegner (51 bestehende + 32 = 83), 10 vorhandene Bosse, 10
// Viertel-Modifikatoren und 5 neue AI-Familien. audit() prueft das Paket gegen
// den echten Basiskatalog, ohne ihn zu veraendern. Die Engine-Verdrahtung ist
// live: status=live, engineWired=true, pending=[]; die 19 Gates bleiben
// inhaltlich dieselben und pruefen weiterhin alle Counts und Zuweisungen.

export const SCHEMA = 'wbn-fuenf-viertel/1';

export const TARGETS = Object.freeze({
  districts: 5,
  wavesPerDistrict: 20,
  totalWaves: 100,
  enemies: 83,
  draftEnemies: 32,
  bosses: 10,
  modifiers: 10,
  aiFamilies: 24,
  draftAI: 5,
  bossWaves: Object.freeze([10, 20]),
});

export const DRAFT_AI = Object.freeze(['burrower', 'trapper', 'tether', 'commander', 'sniper']);

const SHAPES = new Set([
  'tri', 'dot', 'box', 'diamond', 'cross', 'hex', 'star', 'gear', 'turret',
  'spider', 'eye', 'worm', 'wing', 'prism', 'brick', 'wave',
]);
const HAZARDS = new Set(['none', 'poison', 'water', 'fire', 'darkness']);
const PLAYER_PCT = new Set([
  'rangePct', 'speedPct', 'harvestPct', 'hpRegenPct', 'dodgePct', 'critPct',
  'projectileSpeedPct',
]);
const ENEMY_PCT = new Set([
  'speedPct', 'countPct', 'damagePct', 'projectileSpeedPct', 'rangePct',
]);
const WORLD_BOOL = new Set(['movingWalls', 'lineOfSight', 'height', 'harvest']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const str = (v) => typeof v === 'string' && v.length > 0;
const hex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const refId = (v) => (typeof v === 'string' ? v : v && v.id);

function checkEffects(effects, label, fail) {
  if (!isObj(effects)) { fail(label + ': effects fehlt'); return; }
  let count = 0;
  for (const [target, values] of Object.entries(effects)) {
    if (!['player', 'enemy', 'world'].includes(target)) {
      fail(label + ': unbekanntes Ziel ' + target);
      continue;
    }
    if (!isObj(values)) { fail(label + ': ' + target + ' muss ein Objekt sein'); continue; }
    for (const [key, value] of Object.entries(values)) {
      count++;
      if (target === 'player' || target === 'enemy') {
        const allowed = target === 'player' ? PLAYER_PCT : ENEMY_PCT;
        if (!allowed.has(key)) fail(label + ': unbekannter Effekt ' + target + '.' + key);
        else if (!finite(value) || value < -20 || value > 20) fail(label + ': ' + key + ' ausserhalb -20..20');
      } else if (key === 'hazard') {
        if (!HAZARDS.has(value)) fail(label + ': unbekannte Hazard ' + value);
      } else if (key === 'cover') {
        if (!int(value, 0, 10)) fail(label + ': cover muss 0..10 sein');
      } else if (WORLD_BOOL.has(key)) {
        if (typeof value !== 'boolean') fail(label + ': ' + key + ' muss boolean sein');
      } else {
        fail(label + ': unbekannter Welt-Effekt ' + key);
      }
    }
  }
  if (!count) fail(label + ': effects leer');
}

/** Basiskatalog + Entwurf, ohne den Basiskatalog zu mutieren. */
export function mergeEnemies(config, base) {
  const baseEnemies = (base && base.ENEMIES) || [];
  const draft = (config && config.enemies) || [];
  const all = [];
  for (const e of baseEnemies) all.push(Object.assign({}, e, { source: 'data.js' }));
  for (const e of draft) all.push(Object.assign({}, e, { source: 'fuenf-viertel' }));
  const byId = new Map();
  const duplicates = [];
  for (const e of all) {
    if (byId.has(e.id)) duplicates.push(e.id);
    else byId.set(e.id, e);
  }
  return { all, byId, duplicates, baseCount: baseEnemies.length, draftCount: draft.length };
}

/** Flache, deterministisch sortierte Sicht auf alle 5 x 20 Wellen. */
export function wavePlan(config) {
  const out = [];
  for (const d of (config && config.districts) || []) {
    for (const w of (d && d.waves) || []) {
      out.push({
        globalWave: (d.order - 1) * 20 + w.wave,
        district: d.id,
        districtName: d.name,
        localWave: w.wave,
        arena: d.arena,
        modifiers: [...(d.modifiers || [])],
        enemies: [...(w.enemies || [])],
        count: w.count,
        elite: w.elite,
        boss: w.boss || null,
      });
    }
  }
  return out.sort((a, b) => a.globalWave - b.globalWave);
}

/**
 * Prueft den Entwurf gegen den echten Basiskatalog. Reine Funktion, kein I/O;
 * dieselbe Eingabe liefert immer denselben Report (ohne Zeitstempel).
 */
export function audit(config, base) {
  const cfg = isObj(config) ? config : {};
  const failures = [];
  const fail = (m) => failures.push(m);

  const baseEnemies = (base && base.ENEMIES) || [];
  const baseBosses = (base && base.BOSSES) || [];
  const baseArenas = (base && base.ARENAS) || [];
  const baseIds = new Set(baseEnemies.map((e) => e.id));
  const baseBossMap = new Map(baseBosses.map((b) => [b.id, b]));
  const arenaIds = new Set(baseArenas.map((a) => a.id));
  const baseAI = new Set(baseEnemies.map((e) => e.ai));

  if (!isObj(config)) fail('config fehlt');
  if (cfg.schema !== SCHEMA) fail('schema muss ' + SCHEMA + ' sein');
  if (cfg.status !== 'live') fail('status muss live sein');
  if (cfg.engineWired !== true) fail('engineWired muss true sein (Live-Kampagne)');

  const campaign = isObj(cfg.campaign) ? cfg.campaign : {};
  if (campaign.districts !== TARGETS.districts) fail('campaign.districts muss 5 sein');
  if (campaign.wavesPerDistrict !== TARGETS.wavesPerDistrict) fail('campaign.wavesPerDistrict muss 20 sein');
  if (campaign.totalWaves !== TARGETS.totalWaves) fail('campaign.totalWaves muss 100 sein');
  if (!Array.isArray(campaign.bossWaves) || campaign.bossWaves.join(',') !== '10,20') {
    fail('campaign.bossWaves muss [10,20] sein');
  }
  for (const k of ['hpPct', 'materialPct']) {
    if (!int(campaign.carryOver && campaign.carryOver[k], 0, 100)) fail('campaign.carryOver.' + k + ' muss 0..100 sein');
  }
  for (const k of ['hpPctPerDistrict', 'dmgPctPerDistrict', 'countPctPerDistrict']) {
    if (!int(campaign.scaling && campaign.scaling[k], 0, 50)) fail('campaign.scaling.' + k + ' muss 0..50 sein');
  }

  const districts = Array.isArray(cfg.districts) ? cfg.districts : [];
  const draft = Array.isArray(cfg.enemies) ? cfg.enemies : [];
  const mods = Array.isArray(cfg.modifiers) ? cfg.modifiers : [];
  const specs = Array.isArray(cfg.aiFamilies) ? cfg.aiFamilies : [];
  const assignments = Array.isArray(cfg.bosses) ? cfg.bosses : [];
  const pending = Array.isArray(cfg.pending) ? cfg.pending : [];

  if (mods.length !== TARGETS.modifiers) fail('genau 10 Modifikatoren noetig');
  const modById = new Map();
  for (const m of mods) {
    if (!isObj(m) || !str(m.id)) { fail('Modifikator ohne ID'); continue; }
    const label = 'Modifikator ' + m.id;
    if (modById.has(m.id)) fail('Modifikator-ID doppelt: ' + m.id);
    if (!str(m.name) || !str(m.desc)) fail(label + ': Name/Beschreibung fehlt');
    if (!str(m.district)) fail(label + ': district fehlt');
    checkEffects(m.effects, label, fail);
    modById.set(m.id, m);
  }

  if (assignments.length !== TARGETS.bosses) fail('genau 10 Boss-Zuweisungen noetig');
  const assignmentById = new Map();
  for (const a of assignments) {
    if (!isObj(a) || !str(a.id) || !baseBossMap.has(a.id)) {
      fail('Boss-Zuweisung mit unbekannter ID: ' + (a && a.id));
      continue;
    }
    if (assignmentById.has(a.id)) fail('Boss doppelt zugewiesen: ' + a.id);
    if (!str(a.district)) fail('Boss ' + a.id + ' ohne district');
    if (![10, 20].includes(a.wave)) fail('Boss ' + a.id + ': wave muss 10 oder 20 sein');
    const b = baseBossMap.get(a.id);
    if (!Array.isArray(b.phases) || b.phases.length < 2) fail('Boss ' + a.id + ': mindestens zwei Phasen noetig');
    assignmentById.set(a.id, a);
  }

  const specIds = new Set();
  for (const s of specs) {
    if (!isObj(s) || !str(s.id) || !DRAFT_AI.includes(s.id)) {
      fail('AI-Familie unbekannt: ' + (s && s.id));
      continue;
    }
    if (specIds.has(s.id)) fail('AI-Familie doppelt: ' + s.id);
    if (s.status !== 'live') fail('AI-Familie ' + s.id + ': status muss live sein');
    if (!str(s.name) || !str(s.desc) || !str(s.counter)) fail('AI-Familie ' + s.id + ': Name/Beschreibung/Konter fehlt');
    if (!Array.isArray(s.params) || !s.params.length || s.params.some((p) => !str(p))) {
      fail('AI-Familie ' + s.id + ': params fehlen');
    }
    specIds.add(s.id);
  }
  if (specIds.size !== TARGETS.draftAI) fail('genau 5 neue AI-Familien noetig');
  for (const id of DRAFT_AI) if (!specIds.has(id)) fail('AI-Familie fehlt: ' + id);
  const aiAll = new Set([...baseAI, ...specIds]);
  if (aiAll.size !== TARGETS.aiFamilies) fail('AI-Familien-Ziel ist 24, gefunden ' + aiAll.size);

  const catalog = mergeEnemies(cfg, base);
  if (catalog.duplicates.length) fail('Gegner-IDs doppelt: ' + catalog.duplicates.join(', '));
  if (catalog.baseCount !== TARGETS.enemies - TARGETS.draftEnemies) {
    fail('Basiskatalog muss 51 Gegner haben, gefunden ' + catalog.baseCount);
  }
  if (catalog.draftCount !== TARGETS.draftEnemies) fail('genau 32 neue Gegner noetig');
  if (catalog.all.length !== TARGETS.enemies) fail('Gegner-Ziel ist 83, gefunden ' + catalog.all.length);

  const draftIds = new Set();
  for (const e of draft) {
    if (!isObj(e) || !str(e.id)) { fail('Entwurfsgegner ohne ID'); continue; }
    const label = 'Gegner ' + e.id;
    if (baseIds.has(e.id)) fail(label + ': kollidiert mit data.js');
    if (draftIds.has(e.id)) fail(label + ': ID doppelt im Entwurf');
    draftIds.add(e.id);
    if (!str(e.name)) fail(label + ': Name fehlt');
    if (!finite(e.hp) || e.hp <= 0 || e.hp > 2000) fail(label + ': hp ungueltig');
    if (!finite(e.dmg) || e.dmg < 0 || e.dmg > 100) fail(label + ': dmg ungueltig');
    if (!finite(e.spd) || e.spd <= 0 || e.spd > 400) fail(label + ': spd ungueltig');
    if (!finite(e.r) || e.r <= 0 || e.r > 60) fail(label + ': r ungueltig');
    if (!hex(e.col)) fail(label + ': col muss #rrggbb sein');
    if (!finite(e.xp) || e.xp < 0) fail(label + ': xp ungueltig');
    if (!finite(e.mat) || e.mat < 0) fail(label + ': mat ungueltig');
    if (!int(e.minW, 1, 20)) fail(label + ': minW muss 1..20 sein');
    if (!int(e.w, 1, 100)) fail(label + ': w muss 1..100 sein');
    if (e.armor !== undefined && (!finite(e.armor) || e.armor < 0)) fail(label + ': armor ungueltig');
    if (e.pack !== undefined && !int(e.pack, 1, 5)) fail(label + ': pack muss 1..5 sein');
    if (!str(e.ai) || !aiAll.has(e.ai)) fail(label + ': unbekannte AI ' + e.ai);
    if (!SHAPES.has(e.shape)) fail(label + ': unbekannte Shape ' + e.shape);
    if (e.summon && !catalog.byId.has(refId(e.summon))) fail(label + ': summon fehlt: ' + refId(e.summon));
    if (e.split && !catalog.byId.has(refId(e.split))) fail(label + ': split fehlt: ' + refId(e.split));

    if (e.ai === 'burrower' && !(isObj(e.burrow) && finite(e.burrow.cd) && e.burrow.cd > 0 && finite(e.burrow.range) && e.burrow.range > 0)) {
      fail(label + ': burrow.cd/range fehlt');
    }
    if (e.ai === 'trapper' && !(isObj(e.trap) && finite(e.trap.cd) && e.trap.cd > 0 && finite(e.trap.r) && e.trap.r > 0 && finite(e.trap.dmg) && e.trap.dmg >= 0 && finite(e.trap.life) && e.trap.life > 0)) {
      fail(label + ': trap.cd/r/dmg/life fehlt');
    }
    if (e.ai === 'tether' && !(isObj(e.tether) && finite(e.tether.range) && e.tether.range > 0 && finite(e.tether.slow) && e.tether.slow >= 0 && e.tether.slow <= 1 && finite(e.tether.dps) && e.tether.dps >= 0 && finite(e.tether.break) && e.tether.break > 0)) {
      fail(label + ': tether.range/slow/dps/break fehlt');
    }
    if (e.ai === 'commander' && !(isObj(e.buff) && finite(e.buff.dmgP) && e.buff.dmgP >= 0 && finite(e.buff.spdP) && e.buff.spdP >= 0 && finite(e.buff.r) && e.buff.r > 0)) {
      fail(label + ': buff.dmgP/spdP/r fehlt');
    }
    if (e.ai === 'sniper' && !isObj(e.shot)) fail(label + ': sniper braucht shot');
    if (e.shot) {
      if (!(finite(e.shot.dmg) && e.shot.dmg > 0 && finite(e.shot.spd) && e.shot.spd > 0 && finite(e.shot.cd) && e.shot.cd > 0 && finite(e.shot.range) && e.shot.range > 0)) {
        fail(label + ': shot.dmg/spd/cd/range fehlt');
      }
      if (e.shot.warn !== undefined && (!finite(e.shot.warn) || e.shot.warn < 0)) fail(label + ': shot.warn ungueltig');
      if (e.ai === 'sniper' && (!finite(e.shot.warn) || e.shot.warn < 0)) fail(label + ': sniper braucht shot.warn');
      if (e.shot.poison !== undefined && (!finite(e.shot.poison) || e.shot.poison < 0)) fail(label + ': shot.poison ungueltig');
    }
    if (e.trap && e.trap.slow !== undefined && (!finite(e.trap.slow) || e.trap.slow < 0 || e.trap.slow > 1)) fail(label + ': trap.slow muss 0..1 sein');
  }

  for (const id of DRAFT_AI) {
    const usage = draft.filter((e) => e.ai === id).length;
    if (usage < 2) fail('AI-Familie ' + id + ' wird nur ' + usage + 'x genutzt');
  }

  if (districts.length !== TARGETS.districts) fail('genau 5 Viertel noetig');
  const districtIds = new Set();
  const orders = new Set();
  const usedArenas = new Set();
  const assignedMods = new Set();
  const assignedBosses = new Set();
  const usedEnemies = new Set();
  const globalWaves = new Set();

  for (const d of districts) {
    if (!isObj(d) || !str(d.id)) { fail('Viertel ohne ID'); continue; }
    const label = 'Viertel ' + d.id;
    if (districtIds.has(d.id)) fail(label + ': ID doppelt');
    districtIds.add(d.id);
    if (!int(d.order, 1, 5) || orders.has(d.order)) fail(label + ': order muss eindeutig 1..5 sein');
    orders.add(d.order);
    if (!str(d.name) || !str(d.desc)) fail(label + ': Name/Beschreibung fehlt');
    if (!arenaIds.has(d.arena)) fail(label + ': Arena fehlt: ' + d.arena);
    else usedArenas.add(d.arena);

    if (!Array.isArray(d.modifiers) || d.modifiers.length !== 2) fail(label + ': genau 2 Modifikatoren noetig');
    for (const id of d.modifiers || []) {
      const m = modById.get(id);
      if (!m) fail(label + ': Modifikator fehlt: ' + id);
      else if (m.district !== d.id) fail(label + ': Modifikator ' + id + ' gehoert zu ' + m.district);
      assignedMods.add(id);
    }

    const db = Array.isArray(d.bosses) ? d.bosses : [];
    if (db.length !== 2) fail(label + ': genau 2 Bosse noetig');
    for (const id of db) {
      const a = assignmentById.get(id);
      if (!a) fail(label + ': Boss fehlt: ' + id);
      else if (a.district !== d.id) fail(label + ': Boss ' + id + ' gehoert zu ' + a.district);
      assignedBosses.add(id);
    }

    if (!Array.isArray(d.waves) || d.waves.length !== TARGETS.wavesPerDistrict) {
      fail(label + ': genau 20 Wellen noetig');
      continue;
    }
    const local = new Set();
    for (const w of d.waves) {
      if (!isObj(w) || !int(w.wave, 1, 20) || local.has(w.wave)) {
        fail(label + ': Wellennummer ungueltig/doppelt');
        continue;
      }
      local.add(w.wave);
      const global = (d.order - 1) * 20 + w.wave;
      if (!int(global, 1, 100) || globalWaves.has(global)) fail(label + ': globale Welle ungueltig/doppelt: ' + global);
      globalWaves.add(global);
      const expectedTypes = w.wave <= 4 ? 5 : 6;
      if (!Array.isArray(w.enemies) || w.enemies.length !== expectedTypes) {
        fail(label + ' Welle ' + w.wave + ': genau ' + expectedTypes + ' Gegnertypen noetig');
      }
      const waveSet = new Set(w.enemies || []);
      if (waveSet.size !== (w.enemies || []).length) fail(label + ' Welle ' + w.wave + ': Gegnertyp doppelt');
      for (const id of w.enemies || []) {
        const e = catalog.byId.get(id);
        if (!e) fail(label + ' Welle ' + w.wave + ': Gegner fehlt: ' + id);
        else if (e.minW > w.wave) fail(label + ' Welle ' + w.wave + ': ' + id + ' erst ab Welle ' + e.minW);
        usedEnemies.add(id);
      }
      if (!int(w.count, 1, 500)) fail(label + ' Welle ' + w.wave + ': count ungueltig');
      if (!int(w.elite, 0, 100)) fail(label + ' Welle ' + w.wave + ': elite ungueltig');
      const expected = w.wave === 10 ? db[0] : w.wave === 20 ? db[1] : null;
      if ((w.boss || null) !== expected) fail(label + ' Welle ' + w.wave + ': Boss-Zuordnung falsch');
    }
  }

  if (assignedMods.size !== TARGETS.modifiers) fail('nicht alle 10 Modifikatoren sind zugewiesen');
  if (assignedBosses.size !== TARGETS.bosses) fail('nicht alle 10 Bosse sind zugewiesen');
  if (globalWaves.size !== TARGETS.totalWaves) fail('globale Wellen 1..100 nicht vollstaendig');
  for (const d of districts) {
    if (!Array.isArray(d.waves)) continue;
    if (assignments.filter((a) => a.district === d.id).length !== 2) fail('Viertel ' + d.id + ': nicht genau 2 Boss-Zuweisungen');
    if (d.modifiers && d.modifiers.length !== 2) fail('Viertel ' + d.id + ': nicht genau 2 Modifikatoren');
  }

  const spawnable = catalog.all.filter((e) => (e.minW || 1) <= 20);
  const splitOnly = catalog.all.filter((e) => (e.minW || 1) > 20);
  const notUsed = spawnable.filter((e) => !usedEnemies.has(e.id));
  if (notUsed.length) fail('Gegner nicht eingesetzt: ' + notUsed.map((e) => e.id).join(', '));
  const illegal = splitOnly.filter((e) => usedEnemies.has(e.id));
  if (illegal.length) fail('Split-only-Gegner direkt eingesetzt: ' + illegal.map((e) => e.id).join(', '));

  const guestBosses = assignments.filter((a) => {
    const b = baseBossMap.get(a.id);
    const d = districts.find((x) => x.id === a.district);
    return b && d && b.arena !== d.arena;
  }).map((a) => ({ boss: a.id, homeArena: baseBossMap.get(a.id).arena, district: a.district }));
  const unusedArenas = baseArenas.filter((a) => !usedArenas.has(a.id)).map((a) => a.id);

  const allEnemiesUsed = notUsed.length === 0;
  const checks = {
    schema: cfg.schema === SCHEMA,
    liveStatus: cfg.status === 'live',
    engineWired: cfg.engineWired === true,
    fiveDistricts: districts.length === TARGETS.districts,
    twentyWavesEach: districts.length === 5 && districts.every((d) => Array.isArray(d.waves) && d.waves.length === 20),
    hundredWaves: globalWaves.size === 100,
    contiguousWaves: globalWaves.size === 100 && [...globalWaves].sort((a, b) => a - b).every((n, i) => n === i + 1),
    eightyThreeEnemies: catalog.all.length === 83,
    thirtyTwoDraftEnemies: catalog.draftCount === 32,
    allEnemiesUsed,
    tenBosses: assignments.length === 10 && assignedBosses.size === 10,
    twoBossesPerDistrict: districts.length === 5 && districts.every((d) => assignments.filter((a) => a.district === d.id).length === 2),
    bossWaves: districts.length === 5 && districts.every((d) => {
      const db = Array.isArray(d.bosses) ? d.bosses : [];
      return Array.isArray(d.waves) && d.waves.some((w) => w.wave === 10 && w.boss === db[0]) && d.waves.some((w) => w.wave === 20 && w.boss === db[1]);
    }),
    waveShape: districts.length === 5 && districts.every((d) =>
      Array.isArray(d.waves) && d.waves.length === 20 && d.waves.every((w) =>
        Array.isArray(w.enemies) && w.enemies.length === (w.wave <= 4 ? 5 : 6))),
    tenModifiers: mods.length === 10 && assignedMods.size === 10,
    twoModifiersPerDistrict: districts.length === 5 && districts.every((d) => Array.isArray(d.modifiers) && d.modifiers.length === 2),
    twentyFourAI: aiAll.size === 24,
    fiveDraftAI: specIds.size === 5,
    noPending: pending.length === 0,
  };
  for (const [key, ok] of Object.entries(checks)) if (!ok) fail('check fehlgeschlagen: ' + key);

  return {
    schema: SCHEMA,
    status: cfg.status || null,
    draftOnly: false,
    engineWired: cfg.engineWired === true,
    counts: {
      districts: districts.length,
      waves: wavePlan(cfg).length,
      wavesPerDistrict: TARGETS.wavesPerDistrict,
      enemies: catalog.all.length,
      baseEnemies: catalog.baseCount,
      draftEnemies: catalog.draftCount,
      spawnable: spawnable.length,
      splitOnly: splitOnly.length,
      bosses: assignments.length,
      usedBosses: assignedBosses.size,
      modifiers: mods.length,
      aiFamilies: aiAll.size,
      baseAI: baseAI.size,
      draftAI: specIds.size,
      guestBosses: guestBosses.length,
    },
    checks,
    guestBosses,
    unusedArenas,
    pending,
    failures,
    pass: failures.length === 0,
  };
}

export function validate(config, base) {
  return audit(config, base).failures;
}
