#!/usr/bin/env node
//
// Wiesbaden Survivors — export the nine data.js registries and the live
// Fuenf-Viertel campaign enemies for the UE 5.8 import.
//
// The UE automator reads this file and creates one UPrimaryDataAsset per
// record. The browser sources remain authoritative:
//   - data.js for the nine registries,
//   - content/fuenf-viertel.json for the 32 campaign enemies.
// Both are checked against the runtime exports in data.js
// (FUENF_VIERTEL, FUENF_VIERTEL_ENEMIES, CAMPAIGN_ENEMIES, ...).
//
// Counts are data-driven. The UE porting plan was written when data.js had
// 207 records; the live data now has 240 (nine registries) plus the campaign
// enemies. The exporter never pads or truncates to a stale target.
//
// Usage:
//   node tools/export-ue-data.mjs                 write content/ue/data-records.json
//   node tools/export-ue-data.mjs --check         compare, exit 1 on drift
//   node tools/export-ue-data.mjs --out FILE
//
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = path.resolve(ROOT, argOf('--out', 'content/ue/data-records.json'));
const CHECK = argv.includes('--check');
const DATE = argOf('--date', new Date().toISOString().slice(0, 10));
const CAMPAIGN_FILE = path.join(ROOT, 'content', 'fuenf-viertel.json');
const CAMPAIGN_KEY = 'campaignEnemies';
const CAMPAIGN_SOURCE = 'content/fuenf-viertel.json';
const CAMPAIGN_MAPPING_DECISION =
  'Kampagnengegner sind eigenstaendige Live-Eintraege mit eigenen IDs, Namen, Stats und Verhalten. ' +
  'Es gibt keine exakte Dublette eines data.js-Gegners; deshalb erhaelt jeder ein eigenes ' +
  'UWbnCampaignEnemyData. Die AI-Familie wird als Archetyp gespeichert; eine nicht belegte ' +
  'VariantOf-Verknuepfung wird nicht erfunden.';

const CATEGORIES = [
  { key: 'characters', table: 'chars', source: 'CHARS', prefix: 'DA_CHAR', folder: 'Characters', dataClass: 'WbnCharacterData' },
  { key: 'weapons', table: 'weapons', source: 'WEAPONS', prefix: 'DA_WEAPON', folder: 'Weapons', dataClass: 'WbnWeaponData' },
  { key: 'items', table: 'items', source: 'ITEMS', prefix: 'DA_ITEM', folder: 'Items', dataClass: 'WbnItemData' },
  { key: 'enemies', table: 'enemies', source: 'ENEMIES', prefix: 'DA_ENEMY', folder: 'Enemies', dataClass: 'WbnEnemyData' },
  { key: 'arenas', table: 'arenas', source: 'ARENAS', prefix: 'DA_ARENA', folder: 'Arenas', dataClass: 'WbnArenaData' },
  { key: 'bosses', table: 'bosses', source: 'BOSSES', prefix: 'DA_BOSS', folder: 'Bosses', dataClass: 'WbnBossData' },
  { key: 'dangers', table: 'dangers', source: 'DANGERS', prefix: 'DA_DANGER', folder: 'Dangers', dataClass: 'WbnDangerData' },
  { key: 'mods', table: 'mods', source: 'MODS', prefix: 'DA_MOD', folder: 'Mods', dataClass: 'WbnModData' },
  { key: 'achievements', table: 'achievements', source: 'ACHIEVEMENTS', prefix: 'DA_ACHIEVEMENT', folder: 'Achievements', dataClass: 'WbnAchievementData' },
  { key: CAMPAIGN_KEY, table: 'campaignEnemies', source: 'CAMPAIGN_ENEMIES', prefix: 'DA_CAMPAIGN_ENEMY', folder: 'CampaignEnemies', dataClass: 'WbnCampaignEnemyData' },
];

const KNOWN_CLASSES = ['gun', 'heavy', 'elemental', 'precise', 'support', 'explosive',
  'medieval', 'primitive', 'medical', 'blade', 'blunt'];
const KNOWN_WEAPON_TYPES = ['projectile', 'hitscan', 'cone', 'chain', 'charge', 'aura', 'melee'];

function fail(message) {
  console.error('FAIL  ' + message);
  process.exitCode = 1;
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function enemySignature(row) {
  const copy = Object.assign({}, row);
  delete copy.id;
  delete copy.name;
  return stable(copy);
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function positive(value) {
  return num(value) && value > 0;
}

function recordId(cat, row) {
  if (row.id !== undefined && row.id !== null && row.id !== '') return String(row.id);
  if (cat.key === 'dangers' && row.n !== undefined) return 'danger_' + row.n;
  throw new Error(cat.key + ': Datensatz ohne id');
}

function displayName(cat, row, id) {
  if (row.name) return String(row.name);
  if (cat.key === 'dangers') return 'Gefahr ' + row.n + ': ' + (row.desc || '');
  return id;
}

function referencesFor(cat, row, campaignMeta) {
  switch (cat.key) {
    case 'characters':
      return {
        startWeapon: row.startWeapon,
        abilityId: row.ability && row.ability.id,
        synergyClass: row.synergy && row.synergy.cls,
      };
    case 'weapons':
      return { classes: row.cls || [], type: row.type };
    case 'enemies':
      return {
        ai: row.ai,
        summonId: row.summon && row.summon.id,
        splitId: row.split && row.split.id,
      };
    case CAMPAIGN_KEY:
      return {
        ai: row.ai,
        archetype: row.ai,
        districts: campaignMeta ? campaignMeta.districts : [],
        waves: campaignMeta ? campaignMeta.waves : [],
        variantOf: null,
      };
    case 'bosses':
      return {
        arenaId: row.arena,
        summons: (row.phases || []).map(p => p.summon).filter(Boolean),
      };
    case 'achievements':
      return { progressKey: row.key };
    case 'dangers':
      return { level: row.n };
    default:
      return {};
  }
}

/**
 * Validate the campaign against its actual runtime exports. This is deliberately
 * not a second content schema: it checks the contracts data.js already relies on
 * (merge, wave refs, minW, boss assignments) and derives every number from the
 * live file.
 */
function buildCampaignIndex(campaign, data, errors) {
  const rows = Array.isArray(campaign.enemies) ? campaign.enemies : [];
  const meta = campaign.campaign && typeof campaign.campaign === 'object' ? campaign.campaign : {};
  const districts = Array.isArray(campaign.districts) ? campaign.districts : [];
  const wavesPerDistrict = Number.isInteger(meta.wavesPerDistrict) ? meta.wavesPerDistrict : 0;
  const declaredDistricts = Number.isInteger(meta.districts) ? meta.districts : -1;
  const exactDuplicates = [];

  if (campaign.schema !== 'wbn-fuenf-viertel/1') errors.push('Kampagne: Schema != wbn-fuenf-viertel/1');
  if (campaign.status !== 'live') errors.push('Kampagne: status ist nicht live');
  if (campaign.engineWired !== true) errors.push('Kampagne: engineWired ist nicht true');
  if (!rows.length) errors.push('Kampagne: keine Gegner gefunden');
  if (wavesPerDistrict <= 0) errors.push('Kampagne: wavesPerDistrict fehlt/ist ungueltig');
  if (declaredDistricts !== districts.length) {
    errors.push('Kampagne: campaign.districts=' + declaredDistricts + ' != ' + districts.length + ' Viertel');
  }

  const baseIds = new Set((data.ENEMIES || []).map(e => e.id));
  const baseNames = new Set((data.ENEMIES || []).map(e => e.name));
  const baseAI = new Set((data.ENEMIES || []).map(e => e.ai));
  const baseSignatures = new Map((data.ENEMIES || []).map(e => [enemySignature(e), e.id]));

  if (!data.FUENF_VIERTEL || stable(data.FUENF_VIERTEL) !== stable(campaign)) {
    errors.push('Kampagne: content/fuenf-viertel.json und data.FUENF_VIERTEL weichen ab');
  }
  if (!Array.isArray(data.FUENF_VIERTEL_ENEMIES) || data.FUENF_VIERTEL_ENEMIES.length !== rows.length) {
    errors.push('Kampagne: data.FUENF_VIERTEL_ENEMIES passt nicht zur Quelle');
  }
  if (!Array.isArray(data.CAMPAIGN_ENEMIES) ||
      data.CAMPAIGN_ENEMIES.length !== (data.ENEMIES || []).length + rows.length) {
    errors.push('Kampagne: data.CAMPAIGN_ENEMIES ist nicht Basis + Kampagne');
  }

  const aiFamilies = new Map();
  const aiSpecs = Array.isArray(campaign.aiFamilies) ? campaign.aiFamilies : [];
  for (const spec of aiSpecs) {
    if (!spec || typeof spec.id !== 'string' || !spec.id) {
      errors.push('Kampagne: AI-Familie ohne ID');
      continue;
    }
    if (aiFamilies.has(spec.id)) errors.push('Kampagne: AI-Familie doppelt: ' + spec.id);
    if (!spec.name || !spec.desc || !spec.counter) {
      errors.push('Kampagne: AI-Familie ' + spec.id + ' unvollstaendig');
    }
    if (!Array.isArray(spec.params) || !spec.params.length) {
      errors.push('Kampagne: AI-Familie ' + spec.id + ' ohne params');
    }
    aiFamilies.set(spec.id, spec);
  }

  const ids = new Set();
  const names = new Set();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id) {
      errors.push('Kampagne: Gegner ohne ID');
      continue;
    }
    if (ids.has(row.id)) errors.push('Kampagne: Gegner-ID doppelt: ' + row.id);
    ids.add(row.id);
    if (typeof row.name !== 'string' || !row.name) errors.push('Kampagne: ' + row.id + ' ohne Namen');
    if (names.has(row.name)) errors.push('Kampagne: Gegner-Name doppelt: ' + row.name);
    names.add(row.name);
    if (baseIds.has(row.id)) errors.push('Kampagne: ID kollidiert mit data.js: ' + row.id);
    if (baseNames.has(row.name)) errors.push('Kampagne: Name kollidiert mit data.js: ' + row.name);
    if (baseSignatures.has(enemySignature(row))) {
      exactDuplicates.push(row.id + '==' + baseSignatures.get(enemySignature(row)));
    }
    if (!positive(row.hp) || !num(row.dmg) || row.dmg < 0 || !positive(row.spd) ||
        !positive(row.r) || !num(row.xp) || row.xp < 0 || !num(row.mat) || row.mat < 0) {
      errors.push('Kampagne: ' + row.id + ' hat ungueltige Basiswerte');
    }
    if (typeof row.ai !== 'string' || !row.ai || (typeof row.shape !== 'string' || !row.shape)) {
      errors.push('Kampagne: ' + row.id + ' ohne ai/shape');
    }
    if (!Number.isInteger(row.minW) || row.minW < 1 || !Number.isInteger(row.w) || row.w <= 0) {
      errors.push('Kampagne: ' + row.id + ' minW/w ungueltig');
    }
    if (row.armor !== undefined && (!num(row.armor) || row.armor < 0)) {
      errors.push('Kampagne: ' + row.id + ' armor ungueltig');
    }
    if (row.fly !== undefined && typeof row.fly !== 'boolean') {
      errors.push('Kampagne: ' + row.id + ' fly ist kein Boolean');
    }
    if (row.pack !== undefined && (!Number.isInteger(row.pack) || row.pack < 1)) {
      errors.push('Kampagne: ' + row.id + ' pack ungueltig');
    }
    for (const behavior of ['burrow', 'shot', 'buff', 'trap', 'tether', 'mine']) {
      if (row[behavior] !== undefined && (!row[behavior] || typeof row[behavior] !== 'object')) {
        errors.push('Kampagne: ' + row.id + '.' + behavior + ' ist kein Objekt');
      }
    }
    if (typeof row.ai === 'string' && !baseAI.has(row.ai) && !aiFamilies.has(row.ai)) {
      errors.push('Kampagne: ' + row.id + ' nutzt unbekannte AI ' + row.ai);
    }
  }
  if (exactDuplicates.length) {
    errors.push('Kampagne: exakte Dubletten zu data.js: ' + exactDuplicates.join(', '));
  }

  const appearances = new Map(rows.map(row => [row.id, {
    districts: [], waves: [], districtWaveCounts: {}, firstWave: Infinity, lastWave: -Infinity,
  }]));
  const districtIds = new Set();
  const districtOrders = new Set();
  const bossWaves = new Set(Array.isArray(meta.bossWaves) ? meta.bossWaves : []);
  let waveTotal = 0;

  for (const district of districts) {
    if (!district || typeof district.id !== 'string' || !district.id) {
      errors.push('Kampagne: Viertel ohne ID');
      continue;
    }
    if (districtIds.has(district.id)) errors.push('Kampagne: Viertel-ID doppelt: ' + district.id);
    districtIds.add(district.id);
    if (!Number.isInteger(district.order) || district.order < 1 || district.order > districts.length) {
      errors.push('Kampagne: ' + district.id + ' order ungueltig');
    }
    if (districtOrders.has(district.order)) errors.push('Kampagne: Viertel-order doppelt: ' + district.order);
    districtOrders.add(district.order);
    if (!(data.ARENAS || []).some(a => a.id === district.arena)) {
      errors.push('Kampagne: ' + district.id + ' Arena ' + district.arena + ' fehlt');
    }
    if (!Array.isArray(district.waves) || district.waves.length !== wavesPerDistrict) {
      errors.push('Kampagne: ' + district.id + ' hat nicht ' + wavesPerDistrict + ' Wellen');
      continue;
    }
    const seenWaves = new Set();
    for (const wave of district.waves) {
      waveTotal += 1;
      if (!Number.isInteger(wave.wave) || wave.wave < 1 || wave.wave > wavesPerDistrict) {
        errors.push('Kampagne: ' + district.id + ' Wellennummer ungueltig: ' + wave.wave);
      }
      if (seenWaves.has(wave.wave)) errors.push('Kampagne: ' + district.id + ' Welle doppelt: ' + wave.wave);
      seenWaves.add(wave.wave);
      if (!Array.isArray(wave.enemies) || !wave.enemies.length) {
        errors.push('Kampagne: ' + district.id + ' W' + wave.wave + ' ohne Gegner');
        continue;
      }
      if (new Set(wave.enemies).size !== wave.enemies.length) {
        errors.push('Kampagne: ' + district.id + ' W' + wave.wave + ' doppelte Gegner');
      }
      if (!positive(wave.count)) errors.push('Kampagne: ' + district.id + ' W' + wave.wave + ' count ungueltig');
      if (!Number.isInteger(wave.elite) || wave.elite < 0) {
        errors.push('Kampagne: ' + district.id + ' W' + wave.wave + ' elite ungueltig');
      }
      if (wave.boss && !(data.BOSSES || []).some(b => b.id === wave.boss)) {
        errors.push('Kampagne: ' + district.id + ' W' + wave.wave + ' Boss ' + wave.boss + ' fehlt');
      }
      const globalWave = (district.order - 1) * wavesPerDistrict + wave.wave;
      for (const enemyId of wave.enemies) {
        const app = appearances.get(enemyId);
        if (!app) {
          if (!baseIds.has(enemyId)) {
            errors.push('Kampagne: ' + district.id + ' W' + wave.wave + ' unbekannter Gegner ' + enemyId);
          }
          continue;
        }
        if (!app.districts.includes(district.id)) app.districts.push(district.id);
        if (!app.waves.includes(globalWave)) app.waves.push(globalWave);
        app.districtWaveCounts[district.id] = (app.districtWaveCounts[district.id] || 0) + 1;
        app.firstWave = Math.min(app.firstWave, globalWave);
        app.lastWave = Math.max(app.lastWave, globalWave);
        if (wave.wave < (app.minLocalWave || Infinity)) app.minLocalWave = wave.wave;
      }
    }
  }

  if (waveTotal !== (meta.totalWaves || 0)) {
    errors.push('Kampagne: Wellen gesamt ' + waveTotal + ' != campaign.totalWaves ' + meta.totalWaves);
  }
  for (let order = 1; order <= districts.length; order++) {
    if (!districtOrders.has(order)) errors.push('Kampagne: Viertel-order ' + order + ' fehlt');
  }

  for (const row of rows) {
    const app = appearances.get(row.id);
    if (!app || !app.waves.length) {
      errors.push('Kampagne: ' + row.id + ' kommt in keiner Welle vor');
      continue;
    }
    if (Number.isInteger(row.minW) && app.minLocalWave < row.minW) {
      errors.push('Kampagne: ' + row.id + ' minW ' + row.minW + ' > erster Einsatz W' + app.minLocalWave);
    }
    app.waves.sort((a, b) => a - b);
    app.firstWave = app.waves[0];
    app.lastWave = app.waves[app.waves.length - 1];
  }

  const bossAssignments = Array.isArray(campaign.bosses) ? campaign.bosses : [];
  const assignedBosses = new Set();
  for (const assignment of bossAssignments) {
    if (!assignment || typeof assignment.id !== 'string' || !(data.BOSSES || []).some(b => b.id === assignment.id)) {
      errors.push('Kampagne: Boss-Zuweisung mit unbekannter ID: ' + (assignment && assignment.id));
      continue;
    }
    if (assignedBosses.has(assignment.id)) errors.push('Kampagne: Boss doppelt: ' + assignment.id);
    assignedBosses.add(assignment.id);
    if (!districtIds.has(assignment.district)) {
      errors.push('Kampagne: Boss ' + assignment.id + ' unbekanntes Viertel ' + assignment.district);
    }
    if (!bossWaves.has(assignment.wave)) {
      errors.push('Kampagne: Boss ' + assignment.id + ' Welle ' + assignment.wave + ' nicht in bossWaves');
    }
    const district = districts.find(d => d.id === assignment.district);
    const wave = district && (district.waves || []).find(w => w.wave === assignment.wave);
    if (wave && wave.boss !== assignment.id) {
      errors.push('Kampagne: Boss ' + assignment.id + ' ist nicht als W' + assignment.wave + ' eingetragen');
    }
  }

  const modifierIds = new Set();
  for (const modifier of (campaign.modifiers || [])) {
    if (!modifier || typeof modifier.id !== 'string' || !modifier.id) {
      errors.push('Kampagne: Modifikator ohne ID');
      continue;
    }
    if (modifierIds.has(modifier.id)) errors.push('Kampagne: Modifikator doppelt: ' + modifier.id);
    modifierIds.add(modifier.id);
    if (!districtIds.has(modifier.district)) {
      errors.push('Kampagne: Modifikator ' + modifier.id + ' unbekanntes Viertel ' + modifier.district);
    }
    if (!modifier.name || !modifier.desc || !modifier.effects || typeof modifier.effects !== 'object') {
      errors.push('Kampagne: Modifikator ' + modifier.id + ' unvollstaendig');
    }
  }

  return {
    rows,
    aiFamilies,
    appearances,
    exactDuplicates,
    summary: {
      schema: campaign.schema || null,
      status: campaign.status || null,
      engineWired: campaign.engineWired === true,
      name: meta.name || 'Fünf Viertel',
      districts: districts.length,
      wavesPerDistrict,
      totalWaves: meta.totalWaves || waveTotal,
      enemies: rows.length,
      bosses: bossAssignments.length,
      source: CAMPAIGN_SOURCE,
      mappingDecision: CAMPAIGN_MAPPING_DECISION,
      exactDuplicates,
      standalone: true,
    },
  };
}

function campaignMetadata(row, index) {
  const app = index.appearances.get(row.id);
  const family = index.aiFamilies.get(row.ai) || null;
  return {
    source: CAMPAIGN_SOURCE,
    archetype: row.ai,
    aiFamily: family,
    districts: app ? app.districts.slice() : [],
    waves: app ? app.waves.slice() : [],
    districtWaveCounts: app ? app.districtWaveCounts : {},
    firstWave: app ? app.firstWave : 0,
    lastWave: app ? app.lastWave : 0,
    waveCount: app ? app.waves.length : 0,
    standalone: true,
    variantOf: null,
    mappingDecision: CAMPAIGN_MAPPING_DECISION,
  };
}

function buildPayload() {
  const data = require(path.join(ROOT, 'data.js'));
  const campaign = JSON.parse(readFileSync(CAMPAIGN_FILE, 'utf8'));
  const errors = [];
  const records = [];
  const counts = {};
  const sourceCounts = {};
  let order = 0;

  const campaignIndex = buildCampaignIndex(campaign, data, errors);

  for (const cat of CATEGORIES) {
    const isCampaign = cat.key === CAMPAIGN_KEY;
    const rows = isCampaign ? campaignIndex.rows : data[cat.source];
    if (!Array.isArray(rows)) {
      errors.push('Quelltabelle ' + cat.source + ' fehlt');
      continue;
    }
    counts[cat.key] = rows.length;
    sourceCounts[cat.source] = rows.length;
    const ids = new Set();
    rows.forEach((row, index) => {
      let id;
      try {
        id = recordId(cat, row);
      } catch (e) {
        errors.push(e.message);
        return;
      }
      if (ids.has(id)) errors.push(cat.key + ': doppelte id ' + id);
      ids.add(id);
      const assetName = cat.prefix + '_' + id.replace(/[^A-Za-z0-9_]/g, '_');
      const campaignMeta = isCampaign ? campaignMetadata(row, campaignIndex) : null;
      records.push({
        category: cat.key,
        table: cat.table,
        id,
        assetName,
        displayName: displayName(cat, row, id),
        sourceIndex: index,
        order: order++,
        dataClass: cat.dataClass,
        folder: cat.folder,
        fields: row,
        ...(campaignMeta ? { campaign: campaignMeta } : {}),
        references: referencesFor(cat, row, campaignMeta),
      });
    });
  }

  if (data.Data && typeof data.Data.validate === 'function') {
    for (const err of data.Data.validate()) errors.push('Data.validate(): ' + err);
  } else {
    errors.push('data.js exportiert Data.validate() nicht');
  }

  const byCategory = new Map(CATEGORIES.map(c => [c.key, new Map()]));
  for (const rec of records) byCategory.get(rec.category).set(rec.id, rec);
  const idsOf = key => new Set(records.filter(r => r.category === key).map(r => r.id));

  const weaponIds = idsOf('weapons');
  const enemyIds = idsOf('enemies');
  const arenaIds = idsOf('arenas');
  const classIds = new Set(KNOWN_CLASSES);
  const typeIds = new Set(KNOWN_WEAPON_TYPES);

  if (idsOf(CAMPAIGN_KEY).size !== campaignIndex.rows.length) {
    errors.push('Kampagne: nicht jeder Gegner wurde als Record aufgenommen');
  }
  for (const id of idsOf('enemies')) {
    if (idsOf(CAMPAIGN_KEY).has(id)) errors.push('Kampagne: ID doppelt zu data.js: ' + id);
  }

  for (const rec of records) {
    const f = rec.fields;
    if (rec.category === 'characters') {
      if (!weaponIds.has(f.startWeapon)) errors.push('char ' + rec.id + ': startWeapon ' + f.startWeapon + ' fehlt');
      if (f.synergy && !classIds.has(f.synergy.cls)) errors.push('char ' + rec.id + ': synergy.cls ' + f.synergy.cls + ' unbekannt');
    }
    if (rec.category === 'weapons') {
      for (const c of (f.cls || [])) if (!classIds.has(c)) errors.push('weapon ' + rec.id + ': Klasse ' + c + ' unbekannt');
      if (!typeIds.has(f.type)) errors.push('weapon ' + rec.id + ': Typ ' + f.type + ' unbekannt');
      for (const [ti, tier] of (f.tiers || []).entries()) {
        if (!Array.isArray(tier) || tier.length < 6) errors.push('weapon ' + rec.id + ': Tier ' + ti + ' zu kurz');
      }
    }
    if (rec.category === 'enemies') {
      for (const ref of [f.summon && f.summon.id, f.split && f.split.id]) {
        if (ref && !enemyIds.has(ref)) errors.push('enemy ' + rec.id + ': Referenz ' + ref + ' fehlt');
      }
    }
    if (rec.category === 'bosses') {
      if (!arenaIds.has(f.arena)) errors.push('boss ' + rec.id + ': Arena ' + f.arena + ' fehlt');
      for (const p of (f.phases || [])) {
        if (p.summon && !enemyIds.has(p.summon)) errors.push('boss ' + rec.id + ': summon ' + p.summon + ' fehlt');
        if (!(p.at > 0 && p.at <= 1)) errors.push('boss ' + rec.id + ': Phase at ' + p.at + ' ausserhalb (0,1]');
      }
    }
    if (rec.category === 'items' && !(f.r >= 1 && f.r <= 4)) {
      errors.push('item ' + rec.id + ': Raritaet ' + f.r + ' ausserhalb 1..4');
    }
    if (rec.category === 'dangers') {
      if (!(f.hp > 0 && f.dmg > 0 && f.spd > 0 && f.cnt > 0 && f.price > 0)) {
        errors.push('danger ' + rec.id + ': Multiplikatoren muessen > 0 sein');
      }
    }
    if (rec.category === CAMPAIGN_KEY) {
      const c = rec.campaign || {};
      if (!c.standalone || c.variantOf !== null) errors.push('campaign ' + rec.id + ': Variantenentscheidung inkonsistent');
      if (!c.waves.length || c.waveCount !== c.waves.length) errors.push('campaign ' + rec.id + ': Wellenmetadaten fehlen');
      if (c.firstWave !== c.waves[0] || c.lastWave !== c.waves[c.waves.length - 1]) {
        errors.push('campaign ' + rec.id + ': first/last Wave inkonsistent');
      }
      if (c.aiFamily && c.aiFamily.id !== f.ai) errors.push('campaign ' + rec.id + ': AI-Familie inkonsistent');
    }
  }

  const totals = records.length;
  for (const cat of CATEGORIES) {
    const expected = cat.key === CAMPAIGN_KEY ? campaignIndex.rows.length : (data[cat.source] || []).length;
    if (counts[cat.key] !== expected) errors.push(cat.key + ':count stimmt nicht mit Quelle');
  }
  const assetNames = new Set();
  for (const rec of records) {
    if (assetNames.has(rec.assetName)) errors.push('Asset-Name doppelt: ' + rec.assetName);
    assetNames.add(rec.assetName);
  }

  const campaignSummary = campaignIndex.summary;
  campaignSummary.records = campaignIndex.rows.length;
  campaignSummary.note = 'Kampagnengegner sind im selben Datensatz wie die neun Register; ' +
    'Kampagnen-Modifikatoren/Viertel-Metadaten bleiben Kampagnen-Metadaten, Bosse stehen bereits in BOSSES.';

  const statDefinitions = (data.STAT_DEF || []).map(([id, name, unit]) => ({ id, name, unit }));

  return {
    schema: 'wbn-ue-data/1',
    generated: DATE,
    source: 'data.js + content/fuenf-viertel.json',
    sourceVersion: '2026-11-09',
    total: totals,
    counts,
    sourceCounts,
    statDefinitions,
    campaign: campaignSummary,
    notes: [
      '207 war der Stand des UE-Portierungsplans (2026-09-16). Die lebende Quelle hat mehr Datensätze; diese Datei bildet den gemessenen Ist-Stand ab.',
      'Jeder Datensatz behält sein vollständiges Quellobjekt in fields; die DataAssets spiegeln die häufigen Felder typisiert und payloadJson verlustfrei.',
      'Die neun data.js-Register und die Kampagnengegner aus content/fuenf-viertel.json sind vollständig enthalten; die Kampagnengegner sind eigenständige Live-Einträge, keine exakten Dubletten.',
      'Kampagnen-Viertel, Wellenpläne und Kampagnen-Modifikatoren bleiben Metadaten; die 10 Kampagnen-Bosse sind bereits in data.js/BOSSES abgebildet.',
    ],
    errors,
    records,
  };
}

function main() {
  let payload;
  try {
    payload = buildPayload();
  } catch (e) {
    console.error('FAIL  Export: ' + e.message);
    process.exit(1);
  }

  const text = JSON.stringify(payload, null, 2) + '\n';
  if (payload.errors.length) {
    for (const err of payload.errors.slice(0, 30)) fail(err);
    if (payload.errors.length > 30) fail('... und ' + (payload.errors.length - 30) + ' weitere Fehler');
    console.error('\nKein Export geschrieben (' + payload.errors.length + ' Fehler).');
    process.exit(1);
  }

  if (CHECK) {
    const old = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (old !== text) {
      console.error('FAIL  ' + path.relative(ROOT, OUT) + ' ist nicht aktuell. Neu erzeugen mit: node tools/export-ue-data.mjs');
      process.exit(1);
    }
    console.log('OK    ' + path.relative(ROOT, OUT) + ' aktuell (' + payload.total + ' Datensätze).');
    return;
  }

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log('UE-Daten: ' + path.relative(ROOT, OUT));
  console.log('  ' + Object.entries(payload.counts).map(([k, v]) => k + '=' + v).join(', '));
  console.log('  gesamt=' + payload.total + ' | Asset-Namen eindeutig=' +
    new Set(payload.records.map(r => r.assetName)).size);
  console.log('  Kampagne: ' + payload.campaign.enemies + ' Gegner, ' +
    payload.campaign.bosses + ' Bosse, ' + payload.campaign.districts + ' Viertel, ' +
    payload.campaign.totalWaves + ' Wellen');
  console.log('  Kampagnen-Dubletten: ' + (payload.campaign.exactDuplicates.length || 'keine'));
  console.log('  Hinweis: 207 war der Planungsstand; data.js + Kampagne liefern aktuell ' + payload.total + '.');
}

main();
