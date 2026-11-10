#!/usr/bin/env node
//
// Statische Verifikation des UE-Import-Automators.
//
// Prueft die Verbindung, die sich ohne Unreal Engine pruefen laesst:
// data.js + content/fuenf-viertel.json -> content/ue/data-records.json ->
// Python-Mapping -> C++-Klassen und Interchange-Aufrufe. Die eigentliche
// Asset-Erzeugung kann nur im Editor laufen; das steht ausdruecklich im Report.
//
// Usage: node tools/verify-ue-import.mjs
//
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const data = require(path.join(ROOT, 'data.js'));
const CAMPAIGN_FILE = path.join(ROOT, 'content', 'fuenf-viertel.json');
const CAMPAIGN_KEY = 'campaignEnemies';

let campaign = null;
try {
  campaign = JSON.parse(readFileSync(CAMPAIGN_FILE, 'utf8'));
} catch (e) {
  campaign = { enemies: [], districts: [], bosses: [], modifiers: [], aiFamilies: [], campaign: {} };
}

const CATEGORIES = [
  { key: 'characters', source: 'CHARS', prefix: 'DA_CHAR', folder: 'Characters', dataClass: 'WbnCharacterData' },
  { key: 'weapons', source: 'WEAPONS', prefix: 'DA_WEAPON', folder: 'Weapons', dataClass: 'WbnWeaponData' },
  { key: 'items', source: 'ITEMS', prefix: 'DA_ITEM', folder: 'Items', dataClass: 'WbnItemData' },
  { key: 'enemies', source: 'ENEMIES', prefix: 'DA_ENEMY', folder: 'Enemies', dataClass: 'WbnEnemyData' },
  { key: 'arenas', source: 'ARENAS', prefix: 'DA_ARENA', folder: 'Arenas', dataClass: 'WbnArenaData' },
  { key: 'bosses', source: 'BOSSES', prefix: 'DA_BOSS', folder: 'Bosses', dataClass: 'WbnBossData' },
  { key: 'dangers', source: 'DANGERS', prefix: 'DA_DANGER', folder: 'Dangers', dataClass: 'WbnDangerData' },
  { key: 'mods', source: 'MODS', prefix: 'DA_MOD', folder: 'Mods', dataClass: 'WbnModData' },
  { key: 'achievements', source: 'ACHIEVEMENTS', prefix: 'DA_ACHIEVEMENT', folder: 'Achievements', dataClass: 'WbnAchievementData' },
  { key: CAMPAIGN_KEY, source: 'CAMPAIGN_ENEMIES', prefix: 'DA_CAMPAIGN_ENEMY', folder: 'CampaignEnemies', dataClass: 'WbnCampaignEnemyData' },
];

const DATA_FILE = path.join(ROOT, 'content', 'ue', 'data-records.json');
const HEADER = path.join(ROOT, 'unreal', 'WbnData', 'Source', 'WbnData', 'Public', 'WbnDataAssets.h');
const CPP = path.join(ROOT, 'unreal', 'WbnData', 'Source', 'WbnData', 'Private', 'WbnDataAssets.cpp');
const MODULE_CPP = path.join(ROOT, 'unreal', 'WbnData', 'Source', 'WbnData', 'Private', 'WbnDataModule.cpp');
const BUILD = path.join(ROOT, 'unreal', 'WbnData', 'Source', 'WbnData', 'WbnData.Build.cs');
const UPLUGIN = path.join(ROOT, 'unreal', 'WbnData', 'WbnData.uplugin');
const MANIFEST = path.join(ROOT, 'assets', 'manifest.json');
const MAPPING = path.join(ROOT, 'unreal', 'WbnData', 'Content', 'Python', 'wbn_mapping.py');
const IMPORT = path.join(ROOT, 'unreal', 'WbnData', 'Content', 'Python', 'wbn_ue_import.py');

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(name + ': ' + e.message);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  expect(existsSync(file), 'Datei fehlt: ' + path.relative(ROOT, file));
  return readFileSync(file, 'utf8');
}

function rowsFor(cat) {
  return cat.key === CAMPAIGN_KEY ? (campaign.enemies || []) : (data[cat.source] || []);
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

check('Datendatei existiert', () => expect(existsSync(DATA_FILE), 'content/ue/data-records.json fehlt'));
let payload = null;
check('Datendatei ist JSON', () => { payload = JSON.parse(readFileSync(DATA_FILE, 'utf8')); });
if (!payload) {
  for (const failure of failures) console.error('FAIL  ' + failure);
  process.exit(1);
}

check('Schema wbn-ue-data/1', () => expect(payload.schema === 'wbn-ue-data/1', 'Schema ' + payload.schema));
check('Export ohne Fehler', () => expect(Array.isArray(payload.errors) && payload.errors.length === 0,
  'errors: ' + JSON.stringify(payload.errors && payload.errors.slice(0, 3))));
check('Exportdatum', () => expect(/^\d{4}-\d{2}-\d{2}$/.test(payload.generated), 'generated=' + payload.generated));
check('Kampagnenquelle ist lesbar', () => expect(campaign && Array.isArray(campaign.enemies) && campaign.enemies.length > 0,
  'content/fuenf-viertel.json fehlt/leer'));
check('Kampagnenquelle ist live', () => expect(campaign.schema === 'wbn-fuenf-viertel/1' &&
  campaign.status === 'live' && campaign.engineWired === true, 'status/schema/engineWired'));

let expectedTotal = 0;
for (const cat of CATEGORIES) expectedTotal += rowsFor(cat).length;
check('Gesamtzahl = data.js + Kampagne', () => expect(payload.total === expectedTotal,
  'JSON ' + payload.total + ' != Quellen ' + expectedTotal));
check('Record-Anzahl = total', () => expect(Array.isArray(payload.records) && payload.records.length === payload.total,
  'records=' + (payload.records && payload.records.length)));

const records = payload.records || [];
const names = new Set();
let previousOrder = -1;
for (const cat of CATEGORIES) {
  const rows = rowsFor(cat);
  check(cat.key + ': count', () => expect(payload.counts[cat.key] === rows.length,
    'JSON ' + payload.counts[cat.key] + ' != Quelle ' + rows.length));
  check(cat.key + ': sourceCount', () => expect(payload.sourceCounts[cat.source] === rows.length,
    'sourceCount ' + payload.sourceCounts[cat.source] + ' != ' + rows.length));
}

for (const rec of records) {
  const cat = CATEGORIES.find(c => c.key === rec.category);
  check(rec.assetName + ': Kategorie bekannt', () => expect(cat, 'unbekannte Kategorie ' + rec.category));
  if (!cat) continue;
  const source = rowsFor(cat)[rec.sourceIndex];
  check(rec.assetName + ': Quelle vorhanden', () => expect(source, 'sourceIndex ' + rec.sourceIndex + ' fehlt'));
  if (!source) continue;
  check(rec.assetName + ': verlustfreie fields', () => expect(
    JSON.stringify(rec.fields) === JSON.stringify(source), 'fields weichen von der Quelle ab'));
  check(rec.assetName + ': Prefix', () => expect(rec.assetName.startsWith(cat.prefix + '_'),
    'Name ' + rec.assetName + ' beginnt nicht mit ' + cat.prefix + '_'));
  check(rec.assetName + ': Namensformat', () => expect(/^DA_[A-Z]+_[A-Za-z0-9_]+$/.test(rec.assetName),
    'ungueltiger Name'));
  check(rec.assetName + ': Name eindeutig', () => expect(!names.has(rec.assetName), 'doppelt'));
  names.add(rec.assetName);
  check(rec.assetName + ': dataClass', () => expect(rec.dataClass === cat.dataClass,
    rec.dataClass + ' != ' + cat.dataClass));
  check(rec.assetName + ': folder', () => expect(rec.folder === cat.folder, rec.folder + ' != ' + cat.folder));
  check(rec.assetName + ': displayName', () => expect(typeof rec.displayName === 'string' && rec.displayName.length > 0,
    'leer'));
  check(rec.assetName + ': order', () => expect(rec.order > previousOrder, 'order nicht steigend'));
  previousOrder = rec.order;
}

const ids = key => new Set(records.filter(r => r.category === key).map(r => r.id));
const weaponIds = ids('weapons');
const enemyIds = ids('enemies');
const arenaIds = ids('arenas');
const campaignIds = ids(CAMPAIGN_KEY);
for (const rec of records) {
  const f = rec.fields;
  if (rec.category === 'characters') {
    check(rec.id + ': startWeapon', () => expect(weaponIds.has(f.startWeapon), f.startWeapon));
  }
  if (rec.category === 'enemies') {
    for (const ref of [f.summon && f.summon.id, f.split && f.split.id]) {
      if (ref) check(rec.id + ': enemy ref', () => expect(enemyIds.has(ref), ref));
    }
  }
  if (rec.category === 'bosses') {
    check(rec.id + ': arena ref', () => expect(arenaIds.has(f.arena), f.arena));
    for (const p of f.phases || []) {
      if (p.summon) check(rec.id + ': phase summon', () => expect(enemyIds.has(p.summon), p.summon));
    }
  }
  if (rec.category === 'dangers') {
    check(rec.id + ': danger level', () => expect(f.n >= 0 && f.n < payload.counts.dangers, 'n=' + f.n));
  }
}

check('Stats-Definitionen vollstaendig', () => expect(
  payload.statDefinitions.length === (data.STAT_DEF || []).length,
  payload.statDefinitions.length + ' != ' + (data.STAT_DEF || []).length));

// --- Kampagnengegner: Laufzeitkatalog, Dubletten, Auftritte, Entscheidung ---
check('Genau eine Kampagnen-Kategorie', () => expect(CATEGORIES.filter(c => c.key === CAMPAIGN_KEY).length === 1, 'fehlt'));
check('Kampagnen-Records = Quelle', () => expect(campaignIds.size === campaign.enemies.length,
  campaignIds.size + ' != ' + campaign.enemies.length));
check('Kampagnen-IDs eindeutig', () => expect(new Set(campaign.enemies.map(e => e.id)).size === campaign.enemies.length,
  'doppelte IDs'));
check('Kampagnen-Namen eindeutig', () => expect(new Set(campaign.enemies.map(e => e.name)).size === campaign.enemies.length,
  'doppelte Namen'));
check('Kampagnen-IDs kollidieren nicht mit data.js', () => {
  for (const id of campaignIds) expect(!enemyIds.has(id), id);
});
check('Kampagnen-Namen kollidieren nicht mit data.js', () => {
  const baseNames = new Set((data.ENEMIES || []).map(e => e.name));
  for (const e of campaign.enemies) expect(!baseNames.has(e.name), e.name);
});
check('Keine exakte Kampagnen-Dublette', () => {
  const base = new Set((data.ENEMIES || []).map(enemySignature));
  for (const e of campaign.enemies) expect(!base.has(enemySignature(e)), e.id);
});
check('Runtime-Katalog = Basis + Kampagne', () => expect(
  Array.isArray(data.CAMPAIGN_ENEMIES) && data.CAMPAIGN_ENEMIES.length === (data.ENEMIES || []).length + campaign.enemies.length,
  'CAMPAIGN_ENEMIES=' + (data.CAMPAIGN_ENEMIES && data.CAMPAIGN_ENEMIES.length)));
check('Runtime-Kampagnenspiegel = Quelle', () => expect(
  JSON.stringify(data.FUENF_VIERTEL) === JSON.stringify(campaign) &&
  (data.FUENF_VIERTEL_ENEMIES || []).length === campaign.enemies.length,
  'data.FUENF_VIERTEL/ENEMIES weichen ab'));

const usedCampaign = new Set();
const campaignFamilies = new Map((campaign.aiFamilies || []).map(f => [f.id, f]));
for (const district of campaign.districts || []) {
  for (const wave of district.waves || []) {
    for (const id of wave.enemies || []) {
      if (campaignIds.has(id)) usedCampaign.add(id);
    }
  }
}
check('Jeder Kampagnengegner kommt im Plan vor', () => expect(usedCampaign.size === campaign.enemies.length,
  usedCampaign.size + ' != ' + campaign.enemies.length));
check('AI-Familien der Kampagne vollstaendig', () => {
  for (const e of campaign.enemies) {
    if (!(data.ENEMIES || []).some(b => b.ai === e.ai)) {
      expect(campaignFamilies.has(e.ai), 'AI ' + e.ai + ' fehlt');
    }
  }
});

for (const rec of records.filter(r => r.category === CAMPAIGN_KEY)) {
  const c = rec.campaign || {};
  check(rec.id + ': Kampagnenquelle', () => expect(c.source === 'content/fuenf-viertel.json', String(c.source)));
  check(rec.id + ': Standalone-Entscheidung', () => expect(c.standalone === true && c.variantOf === null,
    'standalone=' + c.standalone + ' variantOf=' + c.variantOf));
  check(rec.id + ': Archetyp = AI', () => expect(c.archetype === rec.fields.ai,
    c.archetype + ' != ' + rec.fields.ai));
  check(rec.id + ': Wellenmetadaten', () => {
    expect(Array.isArray(c.waves) && c.waves.length > 0, 'waves fehlen');
    expect(c.waveCount === c.waves.length, 'waveCount');
    expect(c.firstWave === c.waves[0], 'firstWave');
    expect(c.lastWave === c.waves[c.waves.length - 1], 'lastWave');
    expect(new Set(c.waves).size === c.waves.length, 'Wellen doppelt');
    for (const w of c.waves) expect(w >= 1 && w <= 100, 'Welle ' + w);
  });
  check(rec.id + ': Viertelmetadaten', () => {
    expect(Array.isArray(c.districts) && c.districts.length > 0, 'districts fehlen');
    const sum = Object.values(c.districtWaveCounts || {}).reduce((a, b) => a + b, 0);
    expect(sum === c.waves.length, 'districtWaveCounts=' + sum);
  });
  check(rec.id + ': AI-Familie', () => {
    if (c.aiFamily) expect(c.aiFamily.id === rec.fields.ai, c.aiFamily.id + ' != ' + rec.fields.ai);
  });
  check(rec.id + ': Mappingentscheidung', () => expect(typeof c.mappingDecision === 'string' &&
    c.mappingDecision.length > 20, 'mappingDecision fehlt'));
}

check('Kampagnen-Zusammenfassung', () => {
  expect(payload.campaign && payload.campaign.enemies === campaign.enemies.length,
    'campaign.enemies=' + (payload.campaign && payload.campaign.enemies));
  expect(payload.campaign.records === campaign.enemies.length, 'campaign.records');
  expect(payload.campaign.standalone === true, 'campaign.standalone');
  expect(Array.isArray(payload.campaign.exactDuplicates) && payload.campaign.exactDuplicates.length === 0,
    'exactDuplicates');
  expect(typeof payload.campaign.mappingDecision === 'string' && payload.campaign.mappingDecision.length > 20,
    'mappingDecision');
});

let manifest = null;
check('Asset-Manifest lesbar', () => { manifest = JSON.parse(read(MANIFEST)); });
if (manifest) {
  const allowedKinds = new Set(['prop', 'enemy', 'character', 'boss']);
  const meshNames = new Set();
  const kinds = new Set();
  check('Manifest-Assets vorhanden', () => expect(
    Array.isArray(manifest.assets) && manifest.assets.length > 0, 'assets fehlt'));
  for (const entry of manifest.assets || []) {
    check((entry.name || '?') + ': Mesh-Name', () => expect(
      typeof entry.name === 'string' && entry.name.length > 0, 'Name fehlt'));
    check((entry.name || '?') + ': Mesh-Art', () => expect(
      allowedKinds.has(entry.kind), 'kind=' + entry.kind));
    check((entry.name || '?') + ': Mesh-Name eindeutig', () => expect(
      !meshNames.has(entry.name), 'doppelt'));
    meshNames.add(entry.name);
    kinds.add(entry.kind);
    check((entry.name || '?') + ': GLB', () => {
      expect(entry.files && entry.files.glb, 'files.glb fehlt');
      expect(existsSync(path.resolve(ROOT, entry.files.glb)), 'Datei fehlt: ' + entry.files.glb);
    });
    if (entry.kind === 'character') {
      check((entry.name || '?') + ': FBX', () => {
        expect(entry.files && entry.files.fbx, 'files.fbx fehlt');
        expect(existsSync(path.resolve(ROOT, entry.files.fbx)), 'Datei fehlt: ' + entry.files.fbx);
      });
    }
  }
  check('Charakter-Asset im Manifest', () => expect(kinds.has('character'), 'kein character'));
  check('Boss-Asset im Manifest', () => expect(kinds.has('boss'), 'kein boss'));
  check('Prop-Asset im Manifest', () => expect(kinds.has('prop'), 'kein prop'));
}

const header = read(HEADER);
check('Basisklasse', () => expect(header.includes('class WBNDATA_API UWbnRecordDataAsset'), 'UWbnRecordDataAsset fehlt'));
for (const cat of CATEGORIES) {
  check(cat.dataClass + ': C++-Klasse', () => expect(
    header.includes('class WBNDATA_API U' + cat.dataClass), cat.dataClass + ' fehlt'));
}
const essentials = {
  WbnCharacterData: ['StartWeapon', 'AbilityId', 'SynergyClass', 'PayloadJson'],
  WbnWeaponData: ['WeaponClasses', 'Tiers', 'Scaling', 'UnlockDefault'],
  WbnItemData: ['Rarity', 'Cursed', 'Thorns'],
  WbnEnemyData: ['Ai', 'BehaviorJson', 'SpawnWeight'],
  WbnCampaignEnemyData: ['CatalogSource', 'Archetype', 'AiFamilyName', 'CampaignDistricts',
    'CampaignWaves', 'DistrictWaveCounts', 'FirstGlobalWave', 'LastGlobalWave', 'WaveCount',
    'StandaloneCampaignEnemy', 'VariantOf'],
  WbnArenaData: ['PoisonFields', 'MovingWalls'],
  WbnBossData: ['ArenaId', 'Phases'],
  WbnDangerData: ['HealthMultiplier'],
  WbnModData: ['ColorHex'],
  WbnAchievementData: ['ProgressKey', 'Target'],
};
for (const [cls, fields] of Object.entries(essentials)) {
  for (const field of fields) {
    check(cls + '.' + field, () => expect(new RegExp('\\b' + field + '\\b').test(header),
      'Feld ' + field + ' fehlt'));
  }
}
check('WeaponTier-Struct', () => expect(header.includes('struct FWbnWeaponTier') &&
  header.includes('TMap<FName, float> Modifiers'), 'FWbnWeaponTier unvollstaendig'));
check('BossPhase-Struct', () => expect(header.includes('struct FWbnBossPhase') &&
  header.includes('FName SummonId'), 'FWbnBossPhase unvollstaendig'));
check('CampaignEnemy erbt von Enemy', () => expect(
  /class WBNDATA_API UWbnCampaignEnemyData : public UWbnEnemyData/.test(header),
  'UWbnCampaignEnemyData erbt nicht von UWbnEnemyData'));
check('PrimaryAssetId-Override', () => expect(read(CPP).includes('GetPrimaryAssetId'), 'Implementierung fehlt'));
check('Modul implementiert', () => expect(read(MODULE_CPP).includes('IMPLEMENT_MODULE(FDefaultModuleImpl, WbnData)'),
  'WbnData-Modul fehlt'));
check('Build.cs', () => expect(read(BUILD).includes('class WbnData : ModuleRules'), 'Build.cs ungueltig'));
const uplugin = JSON.parse(read(UPLUGIN));
check('Plugin-Descriptor', () => expect(uplugin.Modules.some(m => m.Name === 'WbnData' && m.Type === 'Runtime'),
  'Runtime-Modul fehlt'));
check('Plugin-Inhalt', () => expect(uplugin.CanContainContent === true, 'CanContainContent fehlt'));

const mapping = read(MAPPING);
check('Mapping ohne Unreal-Abhaengigkeit', () => expect(!/^\s*import\s+unreal\b/m.test(mapping), 'importiert unreal'));
check('Mapping deckt alle Klassen', () => {
  for (const cat of CATEGORIES) expect(mapping.includes('"' + cat.dataClass + '"'), cat.dataClass + ' fehlt');
});
check('Mapping validiert Gesamtzahl', () => expect(mapping.includes('def validate_payload'), 'validate_payload fehlt'));
check('Mapping kennt Kampagnen-Alias', () => expect(mapping.includes('campaignEnemies') &&
  mapping.includes('campaign_enemies'), 'Alias fehlt'));
check('Mapping mappt Kampagnenfelder', () => expect(mapping.includes('campaign_districts') &&
  mapping.includes('district_wave_counts') && mapping.includes('variant_of'), 'Kampagnenfelder fehlen'));

const importer = read(IMPORT);
check('Interchange-Manager', () => expect(importer.includes('get_interchange_manager_scripted'), 'Manager fehlt'));
check('Interchange-SourceData', () => expect(importer.includes('create_source_data'), 'SourceData fehlt'));
check('Interchange-Import', () => expect(importer.includes('.import_asset('), 'import_asset fehlt'));
check('Interchange-Parameter', () => expect(importer.includes('ImportAssetParameters') &&
  importer.includes('params.is_automated') && importer.includes('params.replace_existing'),
  'ImportAssetParameters unvollstaendig'));
check('DataAssetFactory', () => expect(importer.includes('unreal.DataAssetFactory'), 'DataAssetFactory fehlt'));
check('DataAssetFactory-Klasse', () => expect(importer.includes('data_asset_class'), 'data_asset_class fehlt'));
check('Struct-Erzeugung', () => expect(importer.includes('WbnWeaponTier') && importer.includes('WbnBossPhase'),
  'Struct-Erzeugung fehlt'));
check('Idempotenter Upsert', () => expect(importer.includes('does_asset_exist') && importer.includes('load_asset'),
  'Upsert fehlt'));
check('Modi', () => {
  for (const flag of ['--dry-run', '--validate-only', '--skip-assets', '--skip-data', '--only']) {
    expect(importer.includes(flag), flag + ' fehlt');
  }
});
check('Kampagnen-Alias im Importer', () => expect(
  importer.includes('CATEGORY_SPECS') && importer.includes('aliases'), 'Alias-Auflösung fehlt'));
check('Kampagnen-Report im Importer', () => expect(importer.includes('mappingDecision') &&
  importer.includes('campaign_info'), 'Kampagnen-Report fehlt'));
check('Kein Legacy-Importer', () => expect(!importer.includes('AssetImportTask'),
  'AssetImportTask gefunden; Interchange ist gefordert'));

if (failures.length) {
  for (const failure of failures) console.error('FAIL  ' + failure);
  console.error('\nFAIL  ' + failures.length + ' Pruefungen fehlgeschlagen, ' + passed + ' bestanden.');
  process.exit(1);
}

console.log('PASS  ' + passed + ' Pruefungen, 0 Fehler.');
console.log('      ' + records.length + ' Records | ' +
  CATEGORIES.map(c => c.key + '=' + payload.counts[c.key]).join(', '));
console.log('      ' + names.size + ' eindeutige DataAssets | ' + CATEGORIES.length +
  ' Klassen | ' + campaign.enemies.length + ' Kampagnengegner | Interchange-Import vorhanden.');
