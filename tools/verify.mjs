#!/usr/bin/env node
//
// Wiesbaden Survivors — 30-second regression gate.
//
// What it does:
//   1. Static legs (always): index.html must NOT carry the git `assume-unchanged`
//      flag (CE_VALID), the session's documented change-set markers must still be
//      in the working file, and the removed SkinEditor cluster must stay gone.
//   2. Browser leg (default; skip with --no-browser): serves the workspace from
//      an in-process static server, binds ONE raw-CDP WebSocket to the headless
//      Edge page target (Node >= 22 global WebSocket) and drives every phase
//      through it: `?selftest` banner poll, 10.000-run BalanceSim, chunked leg,
//      second `?selftest&qa=1` pass, throttled 4x/6x leg. No agent-browser in
//      the gate: evals routed via the long-lived daemon flapped when stale
//      targets from killed Edge sessions lingered (verified 2026-09-04).
//   3. QA pass (browser leg): a second `?selftest&qa=1` load exercises the positive
//      branch of the QA-Nav selftest gate (row shown, all buttons ring members),
//      which a plain `?selftest` skips by design — so every verify also proves the
//      ?qa surface still works, not just that it stays hidden.
//   4. Throttle leg (browser leg): reuses the SAME headless Edge via raw CDP
//      (Emulation.setCPUThrottlingRate, 4x/6x — the mechanism DevTools uses) and
//      asserts the chunked 10k BalanceSim stays responsive on a simulated low-end
//      device: throttle engaged (calibration ratio), worst slice bounded by the
//      real contract (SLICE_MS budget + one tail work unit, NOT a strict frame),
//      and no rAF gap > 100 ms during the run (a repeated-freeze pattern would
//      fail; isolated GC/OS outliers are allowed and classified). Full
//      methodology + why the wall-time budget beats a CPU-work quota:
//      docs/throttled-gate-leg-2026-09-04.md and
//      docs/chunked-throttle-validation-2026-09-04.md.
//
// Exits 0 when everything passes, 1 on any failure — run it after every edit:
//
//     node tools/verify.mjs                # full gate (~10-20 s)
//     node tools/verify.mjs --no-browser   # static legs only (no Edge needed)
//
// Dependency-free (plain Node >= 22 — global WebSocket for raw CDP — plus the
// system Edge binary; no npm install, no agent-browser involvement).

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { EDGE_PATH, repoRoot, startStaticServer, launchEdge, killScratchEdges, connectPageCdp } from './lib/harness.mjs';
import { SELFTEST_JS, BAND_JS, DISMISS_JS, THRESHOLDS, parseSelftest, advanceFrames, measurePresentation } from './lib/presentation.mjs';

const ROOT = repoRoot(import.meta.url);
const require = createRequire(import.meta.url);
const SRC_PATH = path.resolve(ROOT, 'index.html');
const NO_BROWSER = process.argv.includes('--no-browser');
const VERBOSE = process.argv.includes('--verbose');

let failures = 0;
const fail = (name, detail) => { failures++; console.error('FAIL  ' + name + ' — ' + detail); };
let passes = 0, skips = 0;
const pass = (name) => { passes++; console.log('PASS  ' + name); };
const skip = (name, reason) => { skips++; console.log('SKIP  ' + name + ' — ' + reason); };
const note = (msg) => { console.log('NOTE  ' + msg); };
const verbose = (msg) => { if (VERBOSE) console.log('dbg   ' + msg); };

// ---- change-set markers the session's documented work leaves behind ----
const MARKERS = [
  ['seed-purpose cue', 'id="seedHelp"'],
  ['devsim gate const', 'SIMS_ENABLED'],
  ['gated sim row markup', 'id="simRow"'],
  ['wave wording (completed)', 'Beste geschaffte Welle'],
  ['first-run objective line', 'Ziel: die 4 Gegner in Welle 1'],
  ['daily seed copy (fixed per date, AZ shown)', 'Tages-Seed · AZ '],
  ['skip-hint restyle', 'data-act="tutSkip"'],
  ['qa gate const', 'QA_ENABLED'],
  ['qa row markup', 'id="qaRow"'],
  ['qa godmode guard', 'Game.qaGod) return;'],
  ['qa mods readout toggle', 'qaModsView'],
  ['qa save snapshot/restore', 'data-act="qaSnap"'],
  ['qa mods readout hud element', 'id="qaModsReadout"'],
  ['qa nav-gate selftest', '_qaNavGate()'],
  ['generic gated-row contract helpers', '_gatedRowHidden('],
  ['surface-contracts selftest', '_surfaceContracts()'],
  ['controls seed-copy selftest', '_controlsSeedCopy()'],
  ['balance-parity async selftest', '_balanceParity()'],
  ['sim cancel path (chunked)', 'cancelChunked()'],
  ['seed reroll hidden on daily runs', 'Tages-Run: Seed ist fix'],
  ['code panel id for surface contract', 'id="codePanel"'],
  ['codex content excluded from nav ring', 'data-navskip'],
  ['codex nav-gate selftest', '_codexNavGate()'],
  ['nav membership derived from visibility', 'Sichtbarkeitsfilter'],
  ['data.js extraction markers', 'extrahiert nach data.js'],
  ['data.js include before engine', '<script src="data.js">'],
  ['slice-budget honest contract comment', 'Wandzeit skaliert mit der CPU-Geschwindigkeit'],
  ['context-scoped native Tab + ring sync', 'Tab ist NUR im Coop-Shop ein Gameplay-Binding'],
  ['sealed co-op signaling (NetSeal, wbns2)', "PROTO: 'wbns2'"],
  ['8-character room codes (40 bit)', 'const NET_CODE_LEN = 8;'],
  ['co-op host sends picture and sound in one stream', 'getAudioTracks()) pc.addTrack(tr, st);'],
  ['co-op guest collects all tracks in one stream', 'if (!ms.getTracks().includes(ev.track)) ms.addTrack(ev.track);'],
  ['sealed-signaling selftest', '_netSeal()'],
  ['online host always lets the guest pick player 2 (selftest)', '_netHostCharPick()'],
  ['guest sees the pause (selftest)', '_netPauseMirror()'],
  ['host pauses when the guest falls silent (selftest)', '_netSilence()'],
  ['guest is told when the host falls silent (selftest)', '_netGuestSilence()'],
  ['dropped guest can rejoin the running game (selftest)', '_netRejoin()'],
  ['late events of a replaced connection are ignored (selftest)', '_netStaleEvents()'],
  ['host menu follows once the data channel opens (selftest)', '_netMenuOnOpen()'],
  ['critical-state screen layer (vignette, hit flash, direction arc)', 'drawCritFx(ctx)'],
  ['critical-state heartbeat cue', 'heartbeat(sev)'],
  ['one-arm character ability', "case 'nietenhagel'"],
  ['one-arm slot contract helper', 'function weaponSlotsFor']
];
const FORBIDDEN = [
  ['removed SkinEditor cluster', 'const SkinEditor'],
  ['data tables back inline in index.html', 'const CHARS = ['],
  ['Data registry back inline in index.html', 'const Data = {'],
  ['BOSSES back inline in index.html', 'const BOSSES = ['],
  ['ITEMS back inline in index.html', 'const ITEMS = ['],
  ['DANGERS back inline in index.html', 'const DANGERS = ['],
  ['MODS back inline in index.html', 'const MODS = [']
];

// ============================ static legs ============================

{
  const r = spawnSync('git', ['ls-files', '-v', 'index.html'], { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    fail('git flag state', 'git ls-files failed (' + (r.error ? r.error.message : 'status ' + r.status) + ') — cannot verify');
  } else {
    const line = (r.stdout || '').trim();
    if (/^h\s/.test(line)) fail('git flag state', 'index.html is assume-unchanged (CE_VALID) — edits are hidden from git again. Fix: git update-index --no-assume-unchanged index.html');
    else if (/^H\s/.test(line)) pass('git flag state (index.html not CE_VALID)');
    else fail('git flag state', 'unexpected ls-files output: ' + JSON.stringify(line));
  }
}

let src = null;
try { src = readFileSync(SRC_PATH, 'utf8'); } catch (e) { fail('source readable', String(e.message)); }
if (src !== null) {
  for (const [label, marker] of MARKERS) {
    if (src.includes(marker)) pass('change-set marker: ' + label);
    else fail('change-set marker: ' + label, 'missing "' + marker + '" — index.html looks reverted/clobbered');
  }
  for (const [label, marker] of FORBIDDEN) {
    if (src.includes(marker)) fail('forbidden regression: ' + label, '"' + marker + '" found again');
    else pass('forbidden regression absent: ' + label);
  }
}

// ---- gate self-marker: this file's own throttle leg must not silently vanish ----
try {
  const vsrc = readFileSync(path.join(ROOT, 'tools', 'verify.mjs'), 'utf8');
  if (vsrc.includes('Emulation.setCPUThrottlingRate')) pass('gate self-marker: throttled 4x/6x leg present in verify.mjs');
  else fail('gate self-marker: throttled leg', 'verify.mjs no longer contains the CPU-throttle leg — the gate itself was reverted?');
  if (vsrc.includes("AI-Band: no enemy type")) pass('gate self-marker: AI threshold-band leg present in verify.mjs');
  else fail('gate self-marker: AI band leg', 'verify.mjs no longer contains the AI-Band reversal check — the gate itself was reverted?');
} catch (e) { fail('gate self-marker', String(e.message)); }

// ---- harness: CDP timeout timers must be cleared on the answer ----
// A leftover timer keeps Node alive until it fires, so any tool that ends without
// process.exit() sat out its full CDP timeout after the work was done (the
// balance export took 203 s instead of 3.5 s). The gate exits explicitly and
// would never notice at runtime, hence the static check.
try {
  const hsrc = readFileSync(path.join(ROOT, 'tools', 'lib', 'harness.mjs'), 'utf8');
  if (hsrc.includes('clearTimeout(p.timer)')) pass('harness: CDP timeout timers cleared on response');
  else fail('harness: CDP timer leak', 'tools/lib/harness.mjs no longer clears the per-call timeout — tools without process.exit() hang for the full timeout');
} catch (e) { fail('harness timer check', String(e.message)); }

// ---- data.js split leg (extraction pass) ----
try {
  const djs = readFileSync(path.join(ROOT, 'data.js'), 'utf8');
  for (const decl of ['const CHARS = [', 'const WEAPONS = [', 'const ENEMIES = [', 'const ARENAS = [', 'const ACHIEVEMENTS = [', 'const Data = {', 'const BOSSES = [', 'const ITEMS = [', 'const DANGERS = [', 'const MODS = [', 'const ITEM_BY_ID = Data.register']) {
    const c = (djs.match(new RegExp(decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (c === 1) pass('data.js declares ' + decl.replace(' = [', '') + ' once');
    else fail('data.js declares ' + decl.replace(' = [', ''), 'expected 1 occurrence of "' + decl + '", got ' + c);
  }
  if (djs.includes('module.exports')) pass('data.js dual-mode export present');
  else fail('data.js dual-mode export', 'module.exports guard missing — BalanceSim/Node require would break');
  if (djs.includes('Schließe Welle 5 ab.')) pass('change-set marker in data.js: achievement wording');
  else fail('change-set marker in data.js: achievement wording', 'missing "Schließe Welle 5 ab." — data.js looks reverted/clobbered');
  if (djs.includes('const BOSSES = [') && djs.includes('const DANGERS = [') && djs.includes('const MODS = [') && djs.includes('const ITEMS = [')) pass('change-set marker in data.js: bosses/items/dangers/mods extracted');
  else fail('change-set marker in data.js: bosses/items/dangers/mods extracted', 'one of the four tables missing from data.js — extraction regressed');
  if (src.includes('<script src="data.js">')) pass('data.js loads before engine script');
} catch (e) {
  fail('data.js exists', String(e.message));
}


const ARSENAL_32_WEAPON_IDS = ['friedenshorn','zugriffshaken','waldlaeuferbogen','schildglocke','nietpistole','schattenmesser','sternkette'];
const ARSENAL_32_ITEM_IDS = ['rettungstrage','moosmatte','brandungsring','kettenreaktor','zuendsatz'];
const ITEM_POOL_LEGACY_IDS = ['wasserflasche','griffhandschuh','rettungsfolie','eichel','parkmuenze','gieskanne','vogelhaus','uferkiesel','rollschuh','paddel','neoprenanzug','batterie','kabelbinder','lesebrille','wurfmesser','schutzanzug','brandmelder','picknickkorb','ententeich','fahrradpumpe','treibgut','loetstation','kontaktlinse','hydrantenschluessel','rettungsweste','rosengarten','brunnenwasser','rheinsegler','strandkorb','c_schwerkraft','c_hunger','c_rost','c_wucher','c_zeit','c_laerm','einsatzleitwagen','kurhausgarten','jahrhundertbaum','kurparkdenkmal','rheinregatta','rheinfaehre','fusionator','kernspintomograph','ballistikcomputer','praezisionszirkel','stadtarchiv','goldene_krawatte'];

// ---- Veedel item pool leg ----
// The shop pool is a content system, not decoration: every item must belong to
// exactly one playable family, the five families must all be represented, and
// the catalog must retain the expanded 70-item floor. A regression here means
// the focus rule silently loses its pool or an item becomes untaggable.
{
  try {
    const data = require(path.join(ROOT, 'data.js'));
    const items = data.ITEMS || [];
    const families = data.ITEM_FAMILIES || [];
    const map = data.ITEM_FAMILY_BY_ID || {};
    const familyIds = new Set(families.map(f => f.id));
    const mapped = items.map(it => map[it.id]).filter(Boolean);
    const counts = {};
    for (const it of items) { const f = map[it.id]; if (f) counts[f.id] = (counts[f.id] || 0) + 1; }
    const newIds = ['schlauchrolle', 'kastanienblatt', 'fahrradkette', 'loetkolben', 'schaufenster', 'atemschutz', 'loeschdecke', 'taubenpaar', 'lichtung', 'stroemung', 'faehrmannstueck', 'messsonde', 'kuehlkreislauf', 'marktschreier', 'hydrant', 'kurmusik', 'promenade', 'pruefstand', 'uhrturm', 'wachbuch', 'parkbank', 'rheinbruecke', 'reaktorhandschuh', 'goldener_adler'];
    if (items.length >= 70 && new Set(items.map(it => it.id)).size === items.length) pass('Veedel pool: ' + items.length + ' unique items (>= 70)');
    else fail('Veedel pool size', items.length + ' items / ' + new Set(items.map(it => it.id)).size + ' unique ids');
    if (families.length === 5 && familyIds.size === 5) pass('Veedel pool: five named item families');
    else fail('Veedel families', families.length + ' families / ' + familyIds.size + ' unique ids');
    if (mapped.length === items.length && [...new Set(mapped.map(f => f.id))].every(id => familyIds.has(id))) pass('Veedel pool: every item has exactly one family');
    else fail('Veedel item mapping', mapped.length + '/' + items.length + ' items mapped');
    if (families.every(f => (counts[f.id] || 0) >= 10)) pass('Veedel pool: each family has >= 10 items (' + families.map(f => f.id + ':' + (counts[f.id] || 0)).join(', ') + ')');
    else fail('Veedel family depth', JSON.stringify(counts));
    if (newIds.every(id => data.ITEM_BY_ID[id] && map[id])) pass('Veedel pool: 24 new items are registered and family-tagged');
    else fail('Veedel new items', 'missing: ' + newIds.filter(id => !data.ITEM_BY_ID[id] || !map[id]).join(', '));
  } catch (e) {
    fail('Veedel pool data', String(e && e.message ? e.message : e));
  }
}


// ---- Item-Pool 125: data contract ----
// The parity target is 125 items, split 31/31/32/31 by rarity with 12 cursed.
// Every item must stay in exactly one Veedel (25 per family) and every new row
// must use only existing stat/extras fields, so the shop and recalc paths need
// no parallel item system.
{
  try {
    const data = require(path.join(ROOT, 'data.js'));
    const items = data.ITEMS || [];
    const rarity = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const it of items) if (rarity[it.r] !== undefined) rarity[it.r]++;
    const fam = {};
    for (const it of items) { const f = data.ITEM_FAMILY_BY_ID[it.id]; if (f) fam[f.id] = (fam[f.id] || 0) + 1; }
    const newItems = ITEM_POOL_LEGACY_IDS.map(id => data.ITEM_BY_ID[id]).filter(Boolean);
    const statsOk = newItems.every(it => {
      const keys = Object.keys(it.stats || {});
      return keys.length > 0 && keys.every(k => data.STAT_KEYS.includes(k)) && it.r >= 1 && it.r <= 4 && it.price > 0 && it.name && it.fl;
    });
    const effects = newItems.filter(it => it.turret || it.thorns || it.cursed).length;
    const unique = new Set(items.map(it => it.id)).size;
    if (items.length === 125 && unique === 125) pass('Item pool 125: 125 unique items live');
    else fail('Item pool 125 size', items.length + ' items / ' + unique + ' unique ids');
    if (rarity[1] === 31 && rarity[2] === 31 && rarity[3] === 32 && rarity[4] === 31)
      pass('Item pool 125: rarity split 31/31/32/31');
    else fail('Item pool 125 rarity', JSON.stringify(rarity));
    if (data.ITEMS.filter(it => it.cursed).length === 12 && Object.values(fam).every(n => n === 25))
      pass('Item pool 125: 12 cursed and 25 items in each Veedel');
    else fail('Item pool 125 cursed/families', JSON.stringify({ cursed: data.ITEMS.filter(it => it.cursed).length, fam: fam }));
    if (newItems.length === 47 && new Set(ITEM_POOL_LEGACY_IDS).size === 47 && statsOk && effects === 8)
      pass('Item pool 125: all 47 legacy items have valid stats and ' + effects + ' use turret/thorns/curse extras');
    else fail('Item pool 125 legacy items', JSON.stringify({ found: newItems.length, unique: new Set(ITEM_POOL_LEGACY_IDS).size, statsOk: statsOk, effects: effects }));
  } catch (e) {
    fail('Item pool 125 data', String(e && e.message ? e.message : e));
  }
}


// ---- Arsenal 44: unique starts, new weapon/item contracts, pool reach ----
// The 32-hero roster only closes the arsenal gap when every character owns a
// different starting weapon and every new row is a real, distinct contract.
// This leg pins the exact counts, the seven new fire paths with their Tier
// curves, the five new item hooks (one per Veedel), the Einarm one-slot
// exception, and unique ids across both tables.
{
  try {
    const data = require(path.join(ROOT, 'data.js'));
    const expectedStarts = {
      greta: 'friedenshorn', kobra: 'zugriffshaken', kaykit_ranger: 'waldlaeuferbogen',
      kaykit_knight: 'schildglocke', einarm: 'nietpistole',
      kaykit_rogue_hooded: 'schattenmesser', kaykit_mage: 'sternkette'
    };
    const starts = data.CHARS.map(c => c.startWeapon);
    const startsUnique = data.CHARS.length === 44 && new Set(starts).size === 44 && starts.every(id => !!data.WEAPON_BY_ID[id]);
    const startMapOk = Object.keys(expectedStarts).every(id => data.CHAR_BY_ID[id] && data.CHAR_BY_ID[id].startWeapon === expectedStarts[id]);
    const einarm = data.CHAR_BY_ID.einarm;
    const einarmOk = !!einarm && einarm.maxWeapons === 1 && einarm.startWeaponTier === 1 && einarm.startWeapon === 'nietpistole';
    const ws = ARSENAL_32_WEAPON_IDS.map(id => data.WEAPON_BY_ID[id]).filter(Boolean);
    const expectedTypes = { friedenshorn: 'cone', zugriffshaken: 'melee', waldlaeuferbogen: 'charge', schildglocke: 'aura', nietpistole: 'hitscan', schattenmesser: 'projectile', sternkette: 'chain' };
    const typeOk = ws.length === 7 && new Set(ws.map(w => w.type)).size === 7 && ws.every(w => w.type === expectedTypes[w.id]);
    const tiersOk = ws.length === 7 && ws.every(w => w.unlockDefault === true && w.tiers.length === 4 &&
      w.tiers.every((t, i) => i === 0 || (t[0] > w.tiers[i - 1][0] && t[5] > w.tiers[i - 1][5])));
    const weaponIds = data.WEAPONS.map(w => w.id);
    const itemIds = data.ITEMS.map(it => it.id);
    const allIds = weaponIds.concat(itemIds);
    const idsOk = data.WEAPONS.length === 81 && new Set(weaponIds).size === 81 &&
      data.ITEMS.length === 125 && new Set(itemIds).size === 125 &&
      new Set(allIds).size === allIds.length;
    const its = ARSENAL_32_ITEM_IDS.map(id => data.ITEM_BY_ID[id]).filter(Boolean);
    const effectFields = ['killHeal', 'auraSlow', 'dodgeNova', 'critChain', 'killBoom'];
    const itemHooksOk = its.length === 5 && its.every((it, i) =>
      it[effectFields[i]] > 0 && effectFields.every(k => k === effectFields[i] || !it[k]) &&
      it.stats && Object.keys(it.stats).length > 0 && it.r >= 1 && it.r <= 4 && it.price > 0);
    const itemFamilies = its.map(it => data.ITEM_FAMILY_BY_ID[it.id] && data.ITEM_FAMILY_BY_ID[it.id].id).filter(Boolean);
    const familyOk = itemFamilies.length === 5 && new Set(itemFamilies).size === 5;
    if (startsUnique && startMapOk && einarmOk)
      pass('Arsenal 44: 44/44 unique starting weapons; Einarm keeps 1 slot and starts with the Nietpistole at T2');
    else fail('Arsenal 44 starts', JSON.stringify({ n: data.CHARS.length, unique: new Set(starts).size, mismatched: data.CHARS.filter(c => expectedStarts[c.id] && c.startWeapon !== expectedStarts[c.id]).map(c => c.id + ':' + c.startWeapon), einarm: einarm && { max: einarm.maxWeapons, tier: einarm.startWeaponTier, start: einarm.startWeapon } }));
    if (typeOk && tiersOk)
      pass('Arsenal 44: 7 new weapons cover 7 fire paths with 4 monotonic Tiers each and default-unlocked pool access');
    else fail('Arsenal 44 weapons', JSON.stringify(ws.map(w => ({ id: w.id, type: w.type, unlock: w.unlockDefault, tiers: w.tiers.length }))));
    if (idsOk)
      pass('Arsenal 44: 81 unique weapons + 125 unique items, no ID reused across tables');
    else fail('Arsenal 44 ids', JSON.stringify({ weapons: data.WEAPONS.length, uniqueWeapons: new Set(weaponIds).size, items: data.ITEMS.length, uniqueItems: new Set(itemIds).size, union: new Set(allIds).size }));
    if (itemHooksOk && familyOk)
      pass('Arsenal 44: 5 new items use 5 distinct hooks and cover 5 different Veedel families');
    else fail('Arsenal 44 items', JSON.stringify(its.map(it => ({ id: it.id, hooks: effectFields.filter(k => it[k]), family: data.ITEM_FAMILY_BY_ID[it.id] && data.ITEM_FAMILY_BY_ID[it.id].id, stats: it.stats }))));
  } catch (e) {
    fail('Arsenal 44 data', String(e && e.message ? e.message : e));
  }
}

// ---- Druckluft: the new weapon family and its item set ----
// The family is a real data contract: every weapon carries the shared family
// marker and a Druck payload on every tier, every matching item lives in the
// existing Labor Veedel, and all three weapons are default-unlocked so the
// normal shop/draft pools can reach them without a special case.
{
  try {
    const data = require(path.join(ROOT, 'data.js'));
    const wids = ['drucknagler', 'druckwellenwerfer', 'kolbenramme'];
    const iids = ['druckkammer', 'resonanzboden', 'obertonventil'];
    const ws = wids.map(id => data.WEAPON_BY_ID[id]).filter(Boolean);
    const its = iids.map(id => data.ITEM_BY_ID[id]).filter(Boolean);
    const familyOk = ws.length === 3 && ws.every(w => w.family === 'druck' && w.unlockDefault === true && w.tiers.length === 4 && w.tiers.every(t => t[6] && t[6].druck > 0));
    const tiersOk = ws.length === 3 && ws.every(w => w.tiers.every((t, i) => i === 0 || t[5] > w.tiers[i - 1][5]));
    const itemsOk = its.length === 3 && its.every(it => data.ITEM_FAMILY_BY_ID[it.id] && data.ITEM_FAMILY_BY_ID[it.id].id === 'labor' && it.druckDmg > 0);
    const itemStatsOk = its.length === 3 && its.every(it => Object.keys(it.stats).length > 0 && it.r >= 1 && it.r <= 4);
    if (familyOk && tiersOk) pass('Druckluft data: 3 weapons, family druck, 4 ascending tiers, every tier carries Druck');
    else fail('Druckluft weapons', JSON.stringify({ wids, ws: ws.map(w => ({ id: w.id, family: w.family, unlockDefault: w.unlockDefault, tiers: w.tiers.length, druck: w.tiers.map(t => t[6] && t[6].druck) })) }));
    if (itemsOk && itemStatsOk) pass('Druckluft data: 3 Labor items with stats, rarity and Druck extras');
    else fail('Druckluft items', JSON.stringify({ iids, its: its.map(it => ({ id: it.id, family: data.ITEM_FAMILY_BY_ID[it.id] && data.ITEM_FAMILY_BY_ID[it.id].id, druckDmg: it.druckDmg, stats: it.stats })) }));
  } catch (e) {
    fail('Druckluft data', String(e && e.message ? e.message : e));
  }
}


// ---- New run-identity characters: data and profile contracts ----
// The roster is the existing data contract, not a parallel character system.
// These assertions pin the three new rows, their unique starting weapons, the
// required upside/downside split, and the same profile fields the runtime uses.
{
  try {
    const data = require(path.join(ROOT, 'data.js'));
    const ids = ['ventilvera', 'kurierkai', 'schrottschorsch'];
    const chars = ids.map(id => data.CHAR_BY_ID[id]).filter(Boolean);
    const others = data.CHARS.filter(c => !ids.includes(c.id));
    const oldStarts = new Set(others.map(c => c.startWeapon));
    const starts = chars.map(c => c.startWeapon);
    const allWeaponsExist = starts.every(id => !!data.WEAPON_BY_ID[id]);
    const uniqueStarts = new Set(starts).size === 3 && starts.every(id => !oldStarts.has(id));
    const tradeoffs = chars.every(c => {
      const vals = Object.values(c.stats || {});
      return vals.some(v => v > 0) && vals.some(v => v < 0);
    });
    const identity = chars.every(c => c.name && c.role && c.desc && c.ability && c.ability.id && c.ability.name && c.ability.cd > 0);
    const profiles = chars.map(c => c.profile).filter(Boolean);
    const profilesUnique = profiles.length === 3 && new Set(profiles.map(p => p.figure)).size === 3 && new Set(profiles.map(p => p.animation)).size === 3 && new Set(profiles.map(p => p.moveSet.id)).size === 3;
    if (chars.length === 3 && allWeaponsExist && uniqueStarts)
      pass('Charaktere data: 3 neue Helden mit je einer eigenen, noch nicht vergebenen Startwaffe');
    else fail('Charaktere data start weapons', JSON.stringify({ ids, starts, oldStarts: [...oldStarts] }));
    if (tradeoffs && identity && profilesUnique)
      pass('Charaktere data: jeder neue Held hat Auf-/Abschwächung, Fähigkeit, Beschreibung und eigenes Profil');
    else fail('Charaktere data identity', JSON.stringify({ tradeoffs, identity, profilesUnique, chars: chars.map(c => ({ id: c.id, stats: c.stats, ability: c.ability && c.ability.id })) }));
  } catch (e) {
    fail('Charaktere data', String(e && e.message ? e.message : e));
  }
}


// ---- Werkstatt: between-wave upgrade catalog data contract ----
// RUN_UPGRADES is the data table behind the material-purchased run upgrades.
// It must be its own registered table (not a second ITEMS list), every order
// must carry a real upside AND a downside, and the shop/save/UI wiring must
// reference it — otherwise the catalog is decorative.
{
  try {
    const data = require(path.join(ROOT, 'data.js'));
    const ups = data.RUN_UPGRADES || [];
    const byId = data.RUN_UPGRADE_BY_ID || {};
    const statKeys = new Set(data.STAT_KEYS || []);
    const unique = new Set(ups.map(u => u.id)).size === ups.length;
    const tradeoffs = ups.every(u => {
      const vals = Object.values(u.stats || {});
      return vals.some(v => v > 0) && vals.some(v => v < 0);
    });
    const statsValid = ups.every(u => Object.keys(u.stats || {}).every(k => statKeys.has(k) && isFinite(u.stats[k]) && u.stats[k] !== 0));
    const prices = ups.every(u => u.basePrice > 0 && u.priceStep > 0 && u.maxStacks >= 3 && u.priceStep < 1);
    const copy = ups.every(u => u.name && u.desc && u.desc.length > 30 && u.col);
    const registered = ups.length > 0 && ups.every(u => byId[u.id] === u);
    if (ups.length >= 6 && unique && registered)
      pass('Werkstatt data: ' + ups.length + ' registrierte Aufträge mit eindeutigen IDs');
    else fail('Werkstatt data table', JSON.stringify({ n: ups.length, unique, registered }));
    if (tradeoffs && statsValid)
      pass('Werkstatt data: jeder Auftrag hat Auf- und Abschwächung, alle Stats sind bekannte Stat-Keys');
    else fail('Werkstatt data stats', JSON.stringify(ups.map(u => ({ id: u.id, stats: u.stats }))));
    if (prices && copy)
      pass('Werkstatt data: Preisbasis/-staffel, Stapelgrenze und deutsche Copy stehen in der Tabelle');
    else fail('Werkstatt data economy/copy', JSON.stringify(ups.map(u => ({ id: u.id, basePrice: u.basePrice, priceStep: u.priceStep, maxStacks: u.maxStacks }))));
    const wiring = ['RUN_UPGRADE_BY_ID', 'buyUpgrade', 'ShopSystem.upgrades', 'Save.syncRunLedger', 'Save.applyRunLedger', 'WERKSTATT'];
    const missing = wiring.filter(w => !src.includes(w));
    if (missing.length === 0) pass('Werkstatt wiring: Shop, Stat-Pfad, Save-Ledger und UI referenzieren die Tabelle');
    else fail('Werkstatt wiring', 'missing: ' + missing.join(', '));
  } catch (e) {
    fail('Werkstatt data', String(e && e.message ? e.message : e));
  }
}

// ============================ browser leg ============================

let server = null;     // { port, url, close } from the shared static server
let edge = null;       // { ok, port, profile, kill } from the shared Edge launcher

async function browserLeg() {
  if (NO_BROWSER) { note('browser leg skipped (--no-browser)'); return; }
  if (!EDGE_PATH) { fail('browser', 'Edge binary not found — install Edge or use --no-browser'); return; }

  const t0 = Date.now();
  const ts = () => Math.round((Date.now() - t0) / 100) / 10 + 's';
  killScratchEdges(['fbverify-edge-', 'abverify']);
  verbose('scratch Edges cleaned (+' + ts() + ')');
  server = await startStaticServer(ROOT);
  const site = server.url;
  note('static server on ' + site + ' (+' + ts() + ')');

  edge = await launchEdge({ profilePrefix: 'fbverify-edge-' });
  if (!edge.ok) { fail('browser', 'headless Edge did not start on CDP port ' + edge.port); server.close(); return; }
  note('headless Edge up on CDP port ' + edge.port + ' (' + path.basename(EDGE_PATH) + ') (+' + ts() + ')');

  // One raw-CDP WebSocket bound to the exact page target drives EVERY leg below
  // (daemon-routed evals flapped when stale targets from killed Edge sessions
  // lingered — a direct WebSocket is deterministic and dependency-free).
  let conn = null;
  try { conn = await connectPageCdp(edge.port); }
  catch (e) { fail('browser', e.message); server.close(); edge.kill(); return; }
  const { cdp, ev, evalResult } = conn;
  const nav = async (url) => {
    await cdp('Page.navigate', { url }, 15000);
    verbose('navigated ' + url.slice(site.length) + ' (+' + ts() + ')');
  };

  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    verbose('CDP bound to page target (+' + ts() + ')');
    await nav(site + '/index.html?selftest&cb=verify' + Date.now());

    // poll for the SELFTEST banner (assertion list renders, then the result)
    // banner asserts pass==total (all green) with a floor so removed assertions cannot silently shrink the suite
    const probeScript = 'JSON.stringify({href:location.href,panel:(' + SELFTEST_JS + ')()})';
    const deadline = Date.now() + 25000;
    let banner = false, lastErr = '';
    while (Date.now() < deadline) {
      const e = await evalResult(probeScript, 15000);
      if (e.ok) {
        try {
          const s = JSON.parse(e.value);

          const ps = parseSelftest(s.panel || '');
          verbose('poll ' + (ps.label || 'no verdict yet') + ' @ ' + String(s.href || '').slice(-28));
          banner = ps.found && ps.verdict === 'PASS' && ps.pass === ps.total && ps.pass >= 100;
          if (banner) break;
        } catch { banner = false; }
      } else lastErr = e.err;
      await new Promise(res => setTimeout(res, 600));
    }
    if (!banner) {
      const last = await evalResult(probeScript, 15000);
      verbose('final probe: ' + JSON.stringify(last));
      const bf = await evalResult("(typeof SelfTest === 'object' && SelfTest.results ? JSON.stringify(SelfTest.results.filter(function(r){ return !r.ok; }).map(function(r){ return r.name; })) : 'none')", 15000);
      if (bf.ok && bf.value && bf.value !== 'none') verbose('failing assertions: ' + bf.value);
    }
    if (banner) pass('?selftest banner (all green, >= 100) in ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
    else fail('?selftest banner', 'never saw SELFTEST n/n · PASS (all green, n >= 100) in 25s' + (lastErr ? ' — ' + lastErr : ''));

    if (banner) {
      const e = await evalResult("(function(){var d=BalanceSim.compute(10000);var c=d.chars.filter(function(x){return x.c.id==='einarm';})[0];var ids=['ampelanna','dampfdieter','nachtwaechter','weinwanda','frostfritz','speersophie','axtachim','nagelnadja','bierbernd','minenmarie','taubentoni','saegesvenja','laserlars','blitzbritta','skalpellsina','rettungsralf','flammenfelix'];var nc=ids.map(function(id){var x=d.chars.filter(function(y){return y.c.id===id;})[0];return x?{id:id,wr:x.wr,avg:x.avgWave}:null;});return JSON.stringify({iters:d.meta.iters,ms:d.meta.ms,weapons:d.rows.length,einarm:c?{wr:c.wr,avg:c.avgWave}:null,charOk:d.charOk,chars:d.chars.length,newChars:nc});})()", 30000);
      if (e.ok) {
        try {
          const s = JSON.parse(e.value);
          if (s.iters === 10000 && s.weapons > 0 && s.ms < 3000) pass('BalanceSim 10.000-run compute (' + s.ms + ' ms, ' + s.weapons + ' weapons)');
          else fail('BalanceSim 10k', 'unexpected result: ' + JSON.stringify(s));
          if (s.einarm && s.einarm.wr >= 20 && s.einarm.wr <= 80)
            pass('Einarm balance: 10k sim win rate ' + s.einarm.wr.toFixed(1) + '% (avg wave ' + s.einarm.avg.toFixed(1) + '), ' + s.charOk + '/' + s.chars + ' chars in the 20-80% corridor');
          else fail('Einarm balance', 'win rate outside 20-80% corridor: ' + JSON.stringify(s.einarm));
          const nb = s.newChars || [];
          if (nb.length === 17 && nb.every(function(x){ return x && x.wr >= 20 && x.wr <= 80; }))
            pass('Roster 44 balance: all 17 new heroes in the 20-80% corridor (' + nb.map(function(x){ return x.id + ' ' + x.wr.toFixed(1) + '%'; }).join(', ') + ')');
          else fail('Roster 44 balance', JSON.stringify(nb));
        } catch { fail('BalanceSim 10k', 'unparsable sim result: ' + String(e.value).slice(0, 120)); }
      } else fail('BalanceSim 10k', e.err);
    }

    // Chunked leg: the 10k Voll-Simulation must run in bounded time slices that
    // yield (SLICE_MS budget), never blocking long, and return exactly the sync
    // numbers (isolated per-weapon/per-char seeds make slicing order-independent).
    {
      const start = "(function(){ window.__simRes = null; BalanceSim.computeChunked(10000, function(p){ window.__simProg = p; }).then(function(d){ var s = BalanceSim.compute(10000); window.__simRes = JSON.stringify({ iters: d.meta.iters, rows: d.rows.length, slices: d.meta.slices, max: d.meta.maxSliceMs, ms: d.meta.ms, same: s.rows.map(function(r){ return String(r.dps); }).join() === d.rows.map(function(r){ return String(r.dps); }).join(), progEnd: window.__simProg }); }).catch(function(err){ window.__simRes = JSON.stringify({ err: String(err) }); }); return 'started'; })()";
      const e0 = await evalResult(start, 20000);
      if (e0.ok && (e0.value || '') === 'started') {
        const probe = "JSON.stringify({ res: window.__simRes, prog: window.__simProg })";
        const dl = Date.now() + 30000;
        let got = null;
        while (Date.now() < dl) {
          const ep = await evalResult(probe, 15000);
          if (ep.ok) { try { const o = JSON.parse(ep.value); if (o.res) { got = JSON.parse(o.res); break; } } catch { /* keep polling */ } }
          await new Promise(r => setTimeout(r, 600));
        }
        if (got) {
          if (got.err) fail('BalanceSim chunked', got.err);
          else if (got.iters === 10000 && got.rows > 0 && got.same === true && got.slices >= 2 && got.max < 120)
            pass('BalanceSim chunked 10k yields (' + got.slices + ' slices, max slice ' + got.max + ' ms, parity OK, progress end ' + Math.round((got.progEnd || 0) * 100) + '%)');
          else fail('BalanceSim chunked', 'unexpected: ' + JSON.stringify(got));
        } else fail('BalanceSim chunked', 'never completed in 30 s (timer throttling?)');
      } else fail('BalanceSim chunked', 'could not start: ' + (e0.ok ? e0.value : e0.err));
    }

    // Second selftest pass under ?qa=1: the positive QA-Nav branch (row shown,
    // all buttons ring members) only runs when QA_ENABLED, so a plain ?selftest
    // never exercises it. Navigate the same Edge to ?selftest&qa=1, re-activate
    // our tab (drift guard), and prove the branch switched: banner all green,
    // exactly one 'QA-Nav: unter ?qa' assertion that passed, zero plain-load
    // QA-Nav assertions, all results ok.
    {
      const qaUrl = site + '/index.html?selftest&qa=1&cb=verifyqa' + Date.now();
      await nav(qaUrl);
        const qaProbeScript = "JSON.stringify({banner:(document.body?((m)=>{m=document.body.innerText.match(/SELFTEST (\\d+)\\/(\\d+)/);return !!m&&m[1]===m[2]&&parseInt(m[1],10)>=100})(document.body.innerText):false),res:(typeof SelfTest==='object'&&SelfTest.results?JSON.stringify({pos:SelfTest.results.filter(r=>r.name.indexOf('QA-Nav: unter ?qa')===0).map(r=>r.ok),plain:SelfTest.results.filter(r=>r.name.indexOf('QA-Nav: qaRow ist bei Plain-Load')===0).length,all:SelfTest.results.every(r=>r.ok),total:SelfTest.results.length}):null)})";
        const dl = Date.now() + 25000;
        let qaBanner = false, qaProof = null, qaErr = '';
        while (Date.now() < dl) {
          const e = await evalResult(qaProbeScript, 15000);
          if (e.ok) {
            try {
              const s = JSON.parse(e.value);
              verbose('qa poll ' + JSON.stringify(s));
              qaBanner = s.banner === true;
              qaProof = s.res ? JSON.parse(s.res) : null;
              if (qaBanner && qaProof && qaProof.pos.length === 1 && qaProof.pos[0] === true && qaProof.plain === 0 && qaProof.all === true) break;
            } catch { /* keep polling */ }
          } else qaErr = e.err;
          await new Promise(res => setTimeout(res, 600));
        }
        if (qaBanner && qaProof && qaProof.pos.length === 1 && qaProof.pos[0] === true && qaProof.plain === 0 && qaProof.all === true)
          pass('?selftest&qa=1 pass: QA-Nav positive branch green (' + qaProof.total + '/' + qaProof.total + ', row shown, all buttons ring members) in ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
        else fail('?qa selftest pass', 'positive QA-Nav branch not proven: banner=' + qaBanner + ' proof=' + JSON.stringify(qaProof) + (qaErr ? ' — ' + qaErr : ''));
    }

    // ---- presentation leg (measured, not inspected) ----
    // The same contracts tools/pw_gate.py measures, from the same module
    // (tools/lib/presentation.mjs): LUFS inside the target window, true peak in
    // spec, HUD text actually laid out (font stack live), crit vignette border
    // lift on a LIVE player, zero console/page errors.
    {
      const errs = [];
      conn.setEventHandler((d) => {
        if (d.method === 'Runtime.exceptionThrown') {
          const t = d.params && d.params.exceptionDetails;
          errs.push('exception: ' + String((t && t.exception && t.exception.description) || (t && t.text) || '?').slice(0, 140));
        } else if (d.method === 'Runtime.consoleAPICalled' && d.params && d.params.type === 'error') {
          errs.push('console.error: ' + (d.params.args || []).map(a => String(a.value !== undefined ? a.value : (a.description || ''))).join(' ').slice(0, 140));
        } else if (d.method === 'Log.entryAdded' && d.params && d.params.entry && d.params.entry.level === 'error') {
          errs.push('log: ' + String(d.params.entry.text || '').slice(0, 140));
        }
      });
      try {
        await cdp('Log.enable');
        await nav(site + '/index.html?pw=verify&qa=1&cb=pres' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof AudioSys === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const T = THRESHOLDS;
        const m = await measurePresentation(ev);
        for (const st of m.steps) {
          if (st.ok) pass('presentation: ' + st.name + ' (' + st.detail + ')');
          else fail('presentation: ' + st.name, st.detail);
        }
        if (m.lufs === null) skip('presentation: integrated loudness', 'audioConformance produced no numeric result on this build');
        else if (m.inWindow && m.lufs >= T.lufsMin && m.lufs <= T.lufsMax)
          pass('presentation: mix in ' + T.lufsMin + '..' + T.lufsMax + ' LUFS (' + m.lufs + ' LUFS)');
        else fail('presentation: mix loudness', m.lufs + ' LUFS outside ' + T.lufsMin + '..' + T.lufsMax + ' — ' + m.message);
        if (m.peak === null) skip('presentation: true peak', 'audioConformance produced no peak value');
        else if (m.peak <= T.truePeakMaxDb) pass('presentation: true peak ' + m.peak + ' dBFS <= ' + T.truePeakMaxDb + ' dBTP');
        else fail('presentation: true peak', m.peak + ' dBFS above ' + T.truePeakMaxDb + ' dBTP');
        if (errs.length === 0) pass('presentation: zero console/page errors');
        else fail('presentation: console/page errors', errs.length + ': ' + errs.slice(0, 3).join(' ; '));
        note('presentation leg: border lift ' + (m.borderLift === undefined ? 'n/a' : m.borderLift.toFixed(1)) +
             ', centre lift ' + (m.centreLift === undefined ? 'n/a' : m.centreLift.toFixed(1)) +
             ', critVis ' + m.critVis + ', hud ' + m.hudHeight + 'px');
      } catch (e) {
        fail('presentation leg', String((e && e.message) || e));
      }
    }



    // ---- Veedel item pool: live shop focus + purchase + UI ----
    // A real run is started, the player owns two Kurpark items, and the
    // production ShopSystem.generate() must place at least one Kurpark offer.
    // The probe then buys that offer through ShopSystem.buy(), verifies the
    // stat was applied, and checks that both the shop card and inventory expose
    // the family/focus layer.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=pools' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof ITEM_FAMILIES === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = `(function(){
          Game.coop = false; Game.daily = false; Game.endless = false;
          Game.manualSeed = 0x51ee; Game.sel = ['leonidas']; Game.danger = 0;
          Game.state = 'title'; Game.mods = [];
          Game.startRun();
          const p = Game.players[0];
          p.items = []; p.itemCounts = {}; p.evolutions = []; p.relics = []; p.buffs = [];
          p.weapons.length = 0; p.recalc();
          p.addItem(ITEM_BY_ID['kaffee']); p.addItem(ITEM_BY_ID['kleeblatt4']);
          Game.materials = 9999;
          /* Reach the shop through the production wave-end path. */
          p.pendingLevels = 0; Game.levelQueue = []; Game.relicQueue = [];
          Game.wave = 5; Game.waveEnding = false; Game.wager = null; Game.waveEvent = null;
          Game.state = 'play';
          Game.endWave();
          const natural = { cur: UI.cur, state: Game.state };
          const focus = p.focusFamily();
          const counts = p.familyCounts();
          const offers = ShopSystem.offers.map(o => ({ kind: o.kind, id: o.id, fam: o.kind === 'item' && ITEM_FAMILY_BY_ID[o.id] ? ITEM_FAMILY_BY_ID[o.id].id : null, price: o.price }));
          const focusOffer = offers.find(o => o.fam === focus);
          let bought = null, before = null, after = null;
          if (focusOffer) {
            const idx = offers.indexOf(focusOffer);
            const it = ITEM_BY_ID[focusOffer.id];
            const key = Object.keys(it.stats)[0];
            before = p.st[key] || 0;
            ShopSystem.buy(idx, p);
            after = p.st[key] || 0;
            bought = { id: focusOffer.id, price: focusOffer.price, stat: key, before: before, after: after };
          }
          UI.show('scShop'); UI.renderShop();
          const shopText = document.getElementById('shopItems').innerText;
          const invText = document.getElementById('invItems').innerText;
          const fam = ITEM_FAMILIES.find(f => f.id === focus);
          return JSON.stringify({ focus: focus, counts: counts, offers: offers, focusOffer: focusOffer, bought: bought, items: p.items.slice(), ownFocus: p.focusFamily(), shopText: shopText.slice(0, 1200), invText: invText.slice(0, 800), hint: shopText.indexOf('Veedel-Fokus') >= 0, tag: fam ? shopText.indexOf(fam.name) >= 0 : false, invFamily: invText.indexOf('Veedel:') >= 0, invFocus: invText.indexOf('Fokus:') >= 0, natural: natural });
        })()`;
        const raw = await ev(probe, 30000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        if (r && r.natural && r.natural.cur === 'scShop' && r.natural.state === 'shop') pass('Veedel live: wave end opens the shop naturally');
        else fail('Veedel live shop transition', r ? JSON.stringify(r.natural) : String(raw).slice(0, 160));
        if (r && r.focus === 'kurpark' && r.counts && r.counts.kurpark === 2) pass('Veedel live: two Kurpark items set the shop focus');
        else fail('Veedel live focus', JSON.stringify(r && { focus: r.focus, counts: r.counts }));
        if (r && r.offers.length === 6 && r.focusOffer && r.focusOffer.fam === 'kurpark') pass('Veedel live: 6 offers include a guaranteed Kurpark offer');
        else fail('Veedel live offer', r ? JSON.stringify({ offers: r.offers, focusOffer: r.focusOffer }) : String(raw).slice(0, 160));
        if (r && r.bought && r.bought.after !== r.bought.before && r.items.indexOf(r.bought.id) >= 0) pass('Veedel live: focus item bought, stat ' + r.bought.stat + ' ' + r.bought.before + ' -> ' + r.bought.after);
        else fail('Veedel live purchase', r ? JSON.stringify(r.bought) : String(raw).slice(0, 160));
        if (r && r.tag && r.hint) pass('Veedel live: shop card family tag + focus banner rendered');
        else fail('Veedel live shop UI', r ? JSON.stringify({ tag: r.tag, hint: r.hint, text: r.shopText }) : String(raw).slice(0, 160));
        if (r && r.invFamily && r.invFocus && r.ownFocus === 'kurpark') pass('Veedel live: inventory shows family counts and active focus');
        else fail('Veedel live inventory', r ? JSON.stringify({ invFamily: r.invFamily, invFocus: r.invFocus, ownFocus: r.ownFocus, text: r.invText }) : String(raw).slice(0, 160));
      } catch (e) {
        fail('Veedel live leg', String(e && e.message ? e.message : e));
      }
    }


    // ---- Druckluft: family acquisition, draft, serialization and live burst ----
    // This is the content proof for the new family. Every offer comes from the
    // production ShopSystem.generate() path (seeded, no hand-built offer for the
    // acquisition assertions); the purchase goes through ShopSystem.buy(); the
    // draft card goes through Game.chooseUpgrade(); and the live combat probe
    // fires the actual melee weapon twice so the shared onHit hook has to build
    // the stacks and detonate them. The item bonus is measured by re-running
    // the same burst with the three Labor items equipped.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=druck' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof WEAPON_BY_ID === 'object' && typeof ITEM_BY_ID === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = `(function(){
          var wids = ['drucknagler', 'druckwellenwerfer', 'kolbenramme'];
          var iids = ['druckkammer', 'resonanzboden', 'obertonventil'];
          var pool = ShopSystem.weaponPool();
          var poolOk = wids.every(function(id){ return pool.some(function(w){ return w.id === id; }); });
          var familyOk = wids.every(function(id){ var w = WEAPON_BY_ID[id]; return w && w.family === 'druck' && w.unlockDefault === true && w.tiers.length === 4; });
          var itemFamilyOk = iids.every(function(id){ return ITEM_BY_ID[id] && ITEM_FAMILY_BY_ID[id] && ITEM_FAMILY_BY_ID[id].id === 'labor'; });
          var tierOk = wids.every(function(id){ var w = WEAPON_BY_ID[id]; return w && w.tiers.every(function(t){ return t[6] && t[6].druck > 0; }); });

          var oldUnlocked = Save.data.unlockedWeapons.slice();
          var code = '';
          var saveErr = 'not-run';
          try {
            wids.forEach(function(id){ if (Save.data.unlockedWeapons.indexOf(id) < 0) Save.data.unlockedWeapons.push(id); });
            code = Save.exportCode();
            saveErr = Save.importCode(code);
          } catch (e) { saveErr = String(e && e.message ? e.message : e); }
          var saveOk = saveErr === null && wids.every(function(id){ return Save.data.unlockedWeapons.indexOf(id) >= 0; });
          Save.data.unlockedWeapons = oldUnlocked;
          Save.save();

          Game.coop = false; Game.daily = false; Game.endless = false;
          Save.data.startTier = 0; Save.data.startItem = '';
          Game.manualSeed = 0x51ee; Game.sel = ['leonidas']; Game.danger = 0;
          Game.state = 'title'; Game.mods = [];
          Game.startRun();
          var p = Game.players[0];
          function clearP() {
            p.items = []; p.itemCounts = {}; p.evolutions = []; p.relics = []; p.buffs = []; p.curse = 0;
            p.weapons.length = 0; p.recalc();
          }
          function generateFor(seed, wave) {
            Game.setRunSeed(seed); clearP(); Game.wave = wave; ShopSystem.generate(wave, [p]); return ShopSystem.offers;
          }
          clearP();
          Game.materials = 9999; Game.wave = 10;

          var wSeen = {}, wOffers = {};
          for (var ws = 1; ws <= 900 && Object.keys(wSeen).length < 3; ws++) {
            var wo = generateFor(ws, 10);
            for (var wi = 0; wi < wo.length; wi++) {
              var wOffer = wo[wi];
              if (wOffer.kind === 'weapon' && wids.indexOf(wOffer.id) >= 0 && !wSeen[wOffer.id]) {
                wSeen[wOffer.id] = true;
                wOffers[wOffer.id] = { seed: ws, tier: wOffer.tier, price: wOffer.price };
              }
            }
          }
          var wSeenAll = wids.every(function(id){ return !!wSeen[id]; });

          var acquiredW = {};
          wids.forEach(function(id){
            var found = wOffers[id];
            if (!found) return;
            var offers = generateFor(found.seed, 10);
            var idx = offers.findIndex(function(o){ return o.kind === 'weapon' && o.id === id; });
            Game.materials = 9999;
            var before = p.weapons.length;
            if (idx >= 0) ShopSystem.buy(idx, p);
            acquiredW[id] = { has: p.weapons.some(function(w){ return w.id === id; }), before: before, after: p.weapons.length, tier: p.weapons[0] ? p.weapons[0].tier : -1 };
          });
          var acquiredWAll = wids.every(function(id){ return acquiredW[id] && acquiredW[id].has === true && acquiredW[id].after === acquiredW[id].before + 1; });

          var upgrade = { before: -1, after: -1, seed: 0 };
          for (var us = 1; us <= 900 && !upgrade.seed; us++) {
            var uo = generateFor(us, 10);
            var targetIdx = uo.findIndex(function(o){ return o.kind === 'weapon' && o.id === 'drucknagler' && o.tier === 0; });
            if (targetIdx < 0) continue;
            /* Kauf im SELBEN generierten Shop: eine zweite Generierung zieht
               wegen der Math.random()-Tiers ein anderes Sortiment und kann den
               gefundenen T1-Slot verlieren (Flake, in M1 sichtbar geworden). */
            clearP(); p.addWeapon('drucknagler', 0); Game.wave = 10; Game.materials = 9999;
            upgrade.before = p.weapons[0].tier;
            ShopSystem.buy(targetIdx, p);
            upgrade.after = p.weapons[0].tier;
            upgrade.seed = us;
          }

          var draft = { id: null, count: 0 };
          clearP();
          Game.levelQueue = [p]; Game.state = 'levelup'; UI.show('scLevel');
          var draftPool = ShopSystem.weaponPool();
          var draftIdx = draftPool.findIndex(function(w){ return w.id === 'druckwellenwerfer'; });
          var oldR = RAND;
          RAND = function(){ return (draftIdx + 0.1) / draftPool.length; };
          Game.chooseUpgrade(p, { kind: 'wnew', name: 'Neue Waffe', d: 'Test' });
          RAND = oldR;
          draft.id = p.weapons[0] && p.weapons[0].id;
          draft.count = p.weapons.length;

          var iSeen = {}, iOffers = {};
          for (var is = 1; is <= 2600 && Object.keys(iSeen).length < 3; is++) {
            var io = generateFor(is, 16);
            for (var ii = 0; ii < io.length; ii++) {
              var iOffer = io[ii];
              if (iOffer.kind === 'item' && iids.indexOf(iOffer.id) >= 0 && !iSeen[iOffer.id]) {
                iSeen[iOffer.id] = true;
                iOffers[iOffer.id] = { seed: is, price: iOffer.price };
              }
            }
          }
          var iSeenAll = iids.every(function(id){ return !!iSeen[id]; });

          var acquiredI = {};
          iids.forEach(function(id){
            var found = iOffers[id];
            if (!found) return;
            var offers = generateFor(found.seed, 16);
            var idx = offers.findIndex(function(o){ return o.kind === 'item' && o.id === id; });
            Game.materials = 9999;
            var before = p.druckDmg || 0;
            if (idx >= 0) ShopSystem.buy(idx, p);
            acquiredI[id] = { has: p.items.indexOf(id) >= 0, gain: (p.druckDmg || 0) - before, druckDmg: p.druckDmg || 0 };
          });
          var acquiredIAll = iids.every(function(id){ return acquiredI[id] && acquiredI[id].has === true && acquiredI[id].gain > 0; });

          clearP();
          p.addItem(ITEM_BY_ID.druckkammer); p.addItem(ITEM_BY_ID.resonanzboden); p.addItem(ITEM_BY_ID.obertonventil);
          var allItems = { druckDmg: p.druckDmg || 0, radius: p.druckRadius || 0, slow: p.druckSlow || 0, names: p.items.slice() };

          function mkMob(x, y) {
            var e = new Enemy(); e.spawn(ENEMY_BY_ID.walker, x, y, 1, null);
            e.maxHp = 1000; e.hp = 1000; e.armor = 0; e.spd = 0;
            Game.enemies.push(e); Game.hash.insert(e); return e;
          }
          function runBurst(withItems) {
            clearP();
            Game.state = 'play'; Game.qaGod = true; Game.wave = 1; Game.waveTimer = 999; Game.spawnQueue = [];
            Game.enemies.length = 0; Game.hash.clear();
            if (withItems) {
              p.addItem(ITEM_BY_ID.druckkammer); p.addItem(ITEM_BY_ID.resonanzboden); p.addItem(ITEM_BY_ID.obertonventil);
            }
            p.addWeapon('kolbenramme', 0);
            p.x = 500; p.y = 500; p.aim = 0; p.face = 0; p.alive = true; p.hp = p.maxHp;
            var w = p.weapons[0], rng = WeaponSystem.range(p, w);
            var target = mkMob(540, 500), neighbor = mkMob(540, 555);
            WeaponSystem.fire(p, w, 0, target, rng);
            var first = { druck: target.druck || 0, neighborDruck: neighbor.druck || 0, hp: target.hp };
            WeaponSystem.fire(p, w, 0, target, rng);
            return { first: first, targetDruck: target.druck || 0, targetHp: target.hp, neighborHp: neighbor.hp, neighborLoss: 1000 - neighbor.hp, neighborSlow: neighbor.slow || 0, neighborKnock: Math.abs(neighbor.knockVx) + Math.abs(neighbor.knockVy) };
          }
          var base = runBurst(false);
          var boosted = runBurst(true);

          Game.state = 'shop'; Game.materials = 9999; UI.shopPlayer = 0; ShopSystem.bought = {};
          ShopSystem.offers = [{ kind: 'item', id: 'druckkammer', price: 1 }];
          UI.show('scShop'); UI.renderShop();
          var shopText = document.getElementById('shopItems').innerText;
          UI.codexTab = 'items'; UI.renderCodex();
          var itemCodex = document.getElementById('codexList').innerText;
          UI.codexTab = 'weapons'; UI.renderCodex();
          var weaponCodex = document.getElementById('codexList').innerText;

          var bal = BalanceSim.compute(600);
          var balRows = bal.rows.filter(function(r){ return wids.indexOf(r.def.id) >= 0; }).map(function(r){ return { id: r.def.id, dev: +r.dev.toFixed(1), dps: Math.round(r.d[2]) }; });
          var balanceOk = balRows.length === 3 && balRows.every(function(r){ return Math.abs(r.dev) <= 30; });

          return JSON.stringify({ poolOk: poolOk, familyOk: familyOk, itemFamilyOk: itemFamilyOk, tierOk: tierOk,
            saveOk: saveOk, saveErr: saveErr, wSeen: wSeen, wSeenAll: wSeenAll,
            acquiredW: acquiredW, acquiredWAll: acquiredWAll, upgrade: upgrade, draft: draft,
            iSeen: iSeen, iSeenAll: iSeenAll, acquiredI: acquiredI, acquiredIAll: acquiredIAll,
            allItems: allItems, base: base, boosted: boosted,
            shopText: shopText.slice(0, 900), itemCodex: itemCodex.slice(0, 900), weaponCodex: weaponCodex.slice(0, 900),
            uiItemEffect: shopText.indexOf('Druckstoß') >= 0 && shopText.indexOf('Druck') >= 0,
            uiItemCodex: itemCodex.indexOf('Druckstoß') >= 0 && itemCodex.indexOf('Druckkammer') >= 0,
            uiWeaponFamily: weaponCodex.indexOf('Druckluft') >= 0 && weaponCodex.indexOf('Druckwellenwerfer') >= 0,
            balance: balRows, balanceOk: balanceOk });
        })()`;
        const raw = await ev(probe, 30000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        if (r && r.poolOk && r.familyOk) pass('Druckluft live: 3 default-unlocked druck weapons are in ShopSystem.weaponPool()');
        else fail('Druckluft live pool', r ? JSON.stringify({ poolOk: r.poolOk, familyOk: r.familyOk, wSeen: r.wSeen }) : String(raw).slice(0, 220));
        if (r && r.itemFamilyOk && r.tierOk) pass('Druckluft live: 3 Labor items and Druck payload on every weapon tier');
        else fail('Druckluft live data', r ? JSON.stringify({ itemFamilyOk: r.itemFamilyOk, tierOk: r.tierOk }) : String(raw).slice(0, 220));
        if (r && r.saveOk) pass('Druckluft live: new weapon IDs survive Save.exportCode() -> Save.importCode()');
        else fail('Druckluft save round-trip', r ? JSON.stringify({ saveOk: r.saveOk, saveErr: r.saveErr }) : String(raw).slice(0, 220));
        if (r && r.wSeenAll) pass('Druckluft live: production shop generated offers for all 3 new weapons');
        else fail('Druckluft shop reach', r ? JSON.stringify(r.wSeen) : String(raw).slice(0, 220));
        if (r && r.acquiredWAll) pass('Druckluft live: every new weapon was bought through ShopSystem.buy() and equipped');
        else fail('Druckluft weapon purchase', r ? JSON.stringify(r.acquiredW) : String(raw).slice(0, 220));
        if (r && r.upgrade && r.upgrade.before === 0 && r.upgrade.after === 1) pass('Druckluft live: duplicate shop offer upgrades Druckluftnagler T1 -> T2');
        else fail('Druckluft upgrade path', r ? JSON.stringify(r.upgrade) : String(raw).slice(0, 220));
        if (r && r.draft && r.draft.id === 'druckwellenwerfer' && r.draft.count === 1) pass('Druckluft live: level-up wnew draft pulls the new weapon from the real pool');
        else fail('Druckluft draft path', r ? JSON.stringify(r.draft) : String(raw).slice(0, 220));
        if (r && r.iSeenAll) pass('Druckluft live: production shop generated offers for all 3 new Labor items');
        else fail('Druckluft item shop reach', r ? JSON.stringify(r.iSeen) : String(raw).slice(0, 220));
        if (r && r.acquiredIAll) pass('Druckluft live: every new item was bought and applied its Druck bonus');
        else fail('Druckluft item purchase', r ? JSON.stringify(r.acquiredI) : String(raw).slice(0, 220));
        if (r && r.allItems && r.allItems.druckDmg === 78 && r.allItems.radius === 36 && r.allItems.slow > 0)
          pass('Druckluft live: item set stacks to +' + r.allItems.druckDmg + '% burst, +' + r.allItems.radius + 'px radius, +' + Math.round(r.allItems.slow * 100) + '% slow');
        else fail('Druckluft item totals', r ? JSON.stringify(r.allItems) : String(raw).slice(0, 220));
        if (r && r.base && r.base.first && r.base.first.druck === 2 && r.base.first.neighborDruck === 0 && r.base.targetDruck === 0)
          pass('Druckluft live: two real Kolbenramme hits build 2 stacks, then detonate and reset to 0');
        else fail('Druckluft stack/detonate', r ? JSON.stringify(r.base) : String(raw).slice(0, 220));
        if (r && r.base && r.base.neighborLoss > 0 && r.base.neighborSlow > 0 && r.base.neighborKnock > 0)
          pass('Druckluft live: burst damages, slows and knocks back a neighbor (' + r.base.neighborLoss.toFixed(1) + ' dmg, slow ' + r.base.neighborSlow.toFixed(2) + ', knock ' + r.base.neighborKnock.toFixed(0) + ')');
        else fail('Druckluft burst effect', r ? JSON.stringify(r.base) : String(raw).slice(0, 220));
        if (r && r.boosted && r.boosted.neighborLoss > r.base.neighborLoss)
          pass('Druckluft live: the item set measurably increases burst damage (' + r.base.neighborLoss.toFixed(1) + ' -> ' + r.boosted.neighborLoss.toFixed(1) + ')');
        else fail('Druckluft item burst scaling', r ? JSON.stringify({ base: r.base && r.base.neighborLoss, boosted: r.boosted && r.boosted.neighborLoss }) : String(raw).slice(0, 220));
        if (r && r.uiItemEffect && r.uiItemCodex && r.uiWeaponFamily)
          pass('Druckluft live: shop card, item codex and weapon codex expose the family and burst text');
        else fail('Druckluft live UI', r ? JSON.stringify({ item: r.uiItemEffect, codex: r.uiItemCodex, weapon: r.uiWeaponFamily, shop: r.shopText, items: r.itemCodex, weapons: r.weaponCodex }) : String(raw).slice(0, 220));
        if (r && r.balanceOk)
          pass('Druckluft balance: all three T3 weapons stay inside the existing +/-30% per-type corridor (' + r.balance.map(function(b){ return b.id + ' ' + b.dev + '%'; }).join(', ') + ')');
        else fail('Druckluft balance corridor', r ? JSON.stringify(r.balance) : String(raw).slice(0, 220));
      } catch (e) {
        fail('Druckluft live leg', String(e && e.message ? e.message : e));
      }
    }


    // ---- New run-identity characters: selection, loadout, ability, save ----
    // Each of the three characters goes through the real char grid (the same
    // click handler the menu uses), a real Game.startRun(), a live ability
    // activation against controlled enemies/pickups and a Save.exportCode()
    // round-trip. This is deliberately per-character: a shared stat row or a
    // card that only renders would pass a weaker test but fail here.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=chars' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof CHARS === 'object' && typeof Save === 'object' && typeof UI === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = String.raw`(function(){
          var ids = ['ventilvera', 'kurierkai', 'schrottschorsch'];
          var oldSave = JSON.parse(JSON.stringify(Save.data));
          var results = [];
          var balance = [], codexOk = false;
          function mkMob(x, y) {
            var e = new Enemy();
            e.spawn(ENEMY_BY_ID.walker, x, y, 1, null);
            e.maxHp = 1000; e.hp = 1000; e.armor = 0; e.spd = 0;
            Game.enemies.push(e); Game.hash.insert(e); return e;
          }
          function resetCombat(p) {
            Game.state = 'play'; Game.qaGod = true; Game.wave = 1; Game.waveTimer = 999; Game.spawnQueue = [];
            Game.enemies.length = 0; Game.hash.clear(); Game.pickups.length = 0; Game.powerups.length = 0; Game.runes.length = 0;
            p.x = 500; p.y = 500; p.vx = 0; p.vy = 0; p.hp = p.maxHp; p.alive = true; p.abilityCd = 0;
          }
          try {
            Game.coop = false; Game.daily = false; Game.endless = false;
            Save.data.startTier = 0; Save.data.startItem = '';
            for (var ci = 0; ci < ids.length; ci++) {
              var id = ids[ci], def = CHAR_BY_ID[id];
              try {
                Game.state = 'title'; Game.mods = []; Game.manualSeed = 0x51ee; Game.danger = 0;
                Game.players.length = 0;
                UI.renderChars(0);
                var card = null, cards = document.querySelectorAll('#charGrid .card');
                for (var k = 0; k < cards.length; k++) if (cards[k].textContent.indexOf(def.name) >= 0) { card = cards[k]; break; }
                var cardVisible = !!card && !card.classList.contains('lock');
                if (card) card.click();
                var selected = Game.sel[0] === id;
                var savedAfterClick = Save.data.lastChar === id;
                Game.startRun();
                var p = Game.players[0];
                var start = { char: p.char.id, id: p.weapons[0] && p.weapons[0].id, tier: p.weapons[0] && p.weapons[0].tier, count: p.weapons.length, slots: p.weaponSlots() };
                var keys = ['atkSpd', 'eng', 'maxHp', 'armor', 'speed', 'dodge', 'harvest', 'dmgP'];
                var statOk = keys.every(function(key){ return !(key in def.stats) || p.st[key] === def.stats[key]; });
                var hpOk = p.maxHp === Math.max(20, 120 + (def.stats.maxHp || 0));
                var upside = Object.keys(def.stats).some(function(key){ return def.stats[key] > 0; });
                var downside = Object.keys(def.stats).some(function(key){ return def.stats[key] < 0; });
                var ability = null;
                resetCombat(p);
                if (id === 'ventilvera') {
                  var es = [];
                  for (var i = 0; i < 5; i++) { var a = i / 5 * TAU; es.push(mkMob(500 + Math.cos(a) * 90, 500 + Math.sin(a) * 90)); }
                  var atk0 = p.st.atkSpd;
                  p.abilityCd = 0; p.useAbility();
                  ability = { kind: 'druck', hits: es.filter(function(e){ return e.hp < 1000; }).length, stacks: es.filter(function(e){ return (e.druck || 0) >= 2; }).length, slowed: es.filter(function(e){ return (e.slow || 0) > 0; }).length, atkUp: p.st.atkSpd > atk0, stacksT: es.filter(function(e){ return (e.druckT || 0) > 0; }).length };
                } else if (id === 'kurierkai') {
                  var mats0 = Game.materials, xp0 = p.xp, dmg0 = p.st.dmgP, spd0 = p.st.speed;
                  for (var j = 0; j < 4; j++) Game.spawnMaterial(650 + j * 12, 500, 2);
                  p.abilityCd = 0; p.useAbility();
                  ability = { kind: 'pickup', left: Game.pickups.length, mats: Game.materials - mats0, xp: p.xp - xp0, dmgUp: p.st.dmgP > dmg0, speedUp: p.st.speed > spd0 };
                } else {
                  var a1 = mkMob(540, 500), a2 = mkMob(500, 555);
                  var armor0 = p.st.armor;
                  p.abilityCd = 0; p.useAbility();
                  var loss1 = 1000 - a1.hp, armor1 = p.st.armor, hit1 = a1.hp < 1000 && a2.hp < 1000;
                  Game.enemies.length = 0; Game.hash.clear();
                  var a3 = mkMob(540, 500);
                  p.abilityCd = 0; p.useAbility();
                  var loss2 = 1000 - a3.hp, armor2 = p.st.armor;
                  ability = { kind: 'armor', loss1: loss1, loss2: loss2, armor0: armor0, armor1: armor1, armor2: armor2, hit1: hit1, hit2: a3.hp < 1000 };
                }
                var code = Save.exportCode();
                var saveErr = Save.importCode(code);
                Game.sel[0] = 'leonidas';
                Game.restoreSavedChars();
                var restored = saveErr === null && Save.data.lastChar === id && Game.sel[0] === id;
                Game.startRun();
                var afterRestore = { char: Game.players[0].char.id, id: Game.players[0].weapons[0] && Game.players[0].weapons[0].id };
                results.push({ id: id, name: def.name, cardVisible: cardVisible, selected: selected, savedAfterClick: savedAfterClick, start: start, statOk: statOk, hpOk: hpOk, upside: upside, downside: downside, ability: ability, saveOk: restored, afterRestore: afterRestore });
              } catch (e) {
                results.push({ id: id, error: String(e && e.message ? e.message : e) });
              }
            }
            var bal = BalanceSim.compute(10000);
            balance = bal.chars.filter(function(x){ return ids.indexOf(x.c.id) >= 0; }).map(function(x){ return { id: x.c.id, wr: +x.wr.toFixed(1), wave: +x.avgWave.toFixed(1) }; });
            UI.codexTab = 'chars'; UI.renderCodex();
            var codexText = document.getElementById('codexList').textContent;
            codexOk = ids.every(function(id){ return codexText.indexOf(CHAR_BY_ID[id].name) >= 0; });
          } finally {
            Save.data = oldSave; Save.save();
          }
          return JSON.stringify({ results: results, balance: balance, codexOk: codexOk });
        })()`;
        const raw = await ev(probe, 30000);
        let parsed = {};
        try { parsed = JSON.parse(raw); } catch { parsed = {}; }
        const results = parsed.results || [];
        const balance = parsed.balance || [];
        const expected = [
          { id: 'ventilvera', name: 'Ventil-Vera', weapon: 'drucknagler' },
          { id: 'kurierkai', name: 'Kurier-Kai', weapon: 'medgun' },
          { id: 'schrottschorsch', name: 'Schrott-Schorsch', weapon: 'kolbenramme' }
        ];
        for (const ex of expected) {
          const r = results.find(x => x && x.id === ex.id);
          if (!r || r.error) { fail(ex.name + ' live leg', r ? r.error : 'missing result'); continue; }
          if (r.cardVisible && r.selected && r.savedAfterClick)
            pass(ex.name + ' live: card is selectable through the real char grid and the choice is saved');
          else fail(ex.name + ' live selection', JSON.stringify({ cardVisible: r.cardVisible, selected: r.selected, savedAfterClick: r.savedAfterClick }));
          if (r.start && r.start.char === ex.id && r.start.id === ex.weapon && r.start.tier === 0 && r.start.count === 1 && r.statOk && r.hpOk && r.upside && r.downside)
            pass(ex.name + ' live: run starts with ' + ex.weapon + ' T1 and the data-table stat trade-off (' + (r.ability && r.ability.kind) + ')');
          else fail(ex.name + ' live start/stats', JSON.stringify({ start: r.start, statOk: r.statOk, hpOk: r.hpOk, upside: r.upside, downside: r.downside }));
          if (r.id === 'ventilvera' && r.ability && r.ability.hits === 5 && r.ability.stacks >= 5 && r.ability.slowed >= 5 && r.ability.stacksT >= 5 && r.ability.atkUp)
            pass('Ventil-Vera live: Überdruck damages 5 targets, seeds 2 Druck stacks each and grants attack speed');
          else if (r.id === 'kurierkai' && r.ability && r.ability.left === 0 && r.ability.mats >= 8 && r.ability.xp > 0 && r.ability.dmgUp && r.ability.speedUp)
            pass('Kurier-Kai live: Sammelrunde collects 4 pickups (+' + r.ability.mats + ' material, +' + r.ability.xp + ' XP) and grants damage/speed');
          else if (r.id === 'schrottschorsch' && r.ability && r.ability.hit1 && r.ability.hit2 && r.ability.armor2 > r.ability.armor1 && r.ability.loss2 > r.ability.loss1)
            pass('Schrott-Schorsch live: Schrotthagel hits twice and armor raises damage ' + r.ability.loss1 + ' -> ' + r.ability.loss2);
          else fail(ex.name + ' live ability', JSON.stringify(r.ability));
          if (r.saveOk && r.afterRestore && r.afterRestore.char === ex.id && r.afterRestore.id === ex.weapon)
            pass(ex.name + ' live: selection survives Save.exportCode() -> import and restarts with the right weapon');
          else fail(ex.name + ' live save round-trip', JSON.stringify({ saveOk: r.saveOk, afterRestore: r.afterRestore }));
        }
        if (parsed.codexOk === true)
          pass('Neue Charaktere live: all three names appear in the real Charaktere-Codex surface');
        else fail('Neue Charaktere Codex', JSON.stringify({ codexOk: parsed.codexOk }));
        if (balance.length === 3 && balance.every(b => b.wr >= 20 && b.wr <= 80))
          pass('Neue Charaktere balance: all three 10k win rates stay in the 20-80% corridor (' + balance.map(b => b.id + ' ' + b.wr + '%').join(', ') + ')');
        else fail('Neue Charaktere balance corridor', JSON.stringify(balance));
      } catch (e) {
        fail('Neue Charaktere live leg', String(e && e.message ? e.message : e));
      }
    }


    // ---- Werkstatt: between-wave upgrade economy through the real shop ----
    // The shop already sells weapons/items/relics. This leg proves the new
    // material-purchased run upgrades: they appear after the production
    // wave-end path, the price gate and deduction are exact, two purchases
    // compound through the shared stat pipeline, the stacked order measurably
    // raises a headless DPS measurement, and the ledger survives the real
    // Save.exportCode()/wipe/importCode() round-trip.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=werkstatt' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof RUN_UPGRADE_BY_ID === 'object' && typeof BalanceSim === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = `(function(){
          Game.coop = false; Game.daily = false; Game.endless = false;
          Game.manualSeed = 0x77aa; Game.sel = ['leonidas']; Game.danger = 0;
          Game.state = 'title'; Game.mods = [];
          Save.data.startItem = ''; Save.data.startTier = 0;
          Game.startRun();
          var p = Game.players[0];
          p.items = []; p.itemCounts = {}; p.evolutions = []; p.relics = []; p.buffs = []; p.runUpgrades = {};
          p.weapons.length = 0; p.recalc();
          p.addWeapon('pistol', 0);
          p.pendingLevels = 0; Game.levelQueue = []; Game.relicQueue = [];
          Game.wave = 6; Game.waveEnding = false; Game.wager = null; Game.waveEvent = null;
          Game.state = 'play';
          Game.endWave();
          var natural = { cur: UI.cur, state: Game.state };
          var naturalOffers = ShopSystem.upgrades.map(function(u){ return u.id; });
          UI.renderShop();
          var naturalShop = document.getElementById('shopItems').innerText;

          /* Deterministic catalog for the economics/stacking half; the purchase
             itself still goes through the production ShopSystem.buyUpgrade(). */
          ShopSystem.upgrades = [{ id: 'probelauf' }, { id: 'schweissgeraet' }];
          var def = RUN_UPGRADE_BY_ID['probelauf'];
          var dpsAt = function(pl){
            BalanceSim._rng = BalanceSim._mulberry32(424242);
            return BalanceSim.weaponDPS(WEAPON_BY_ID[pl.weapons[0].id], pl.weapons[0].tier, pl.st, 60);
          };
          var before = { atkSpd: p.st.atkSpd, crit: p.st.crit, maxHp: p.st.maxHp, dps: dpsAt(p) };
          var price0 = ShopSystem.upgradePrice(def, Game.wave, 0);

          Game.materials = price0 - 1;
          var poorBuy = ShopSystem.buyUpgrade('probelauf', p);
          var poorMats = Game.materials, poorStacks = p.runUpgradeCount('probelauf');

          Game.materials = price0;
          var ok1 = ShopSystem.buyUpgrade('probelauf', p);
          var mats1 = Game.materials, atk1 = p.st.atkSpd, hp1 = p.st.maxHp;

          var price1 = ShopSystem.upgradePrice(def, Game.wave, 1);
          Game.materials = price1 + 50;
          var ok2 = ShopSystem.buyUpgrade('probelauf', p);
          var spent2 = (price1 + 50) - Game.materials;
          var atk2 = p.st.atkSpd, hp2 = p.st.maxHp, dps2 = dpsAt(p);

          Game.materials = 99999;
          var guard = 0;
          while (p.runUpgradeCount('probelauf') < def.maxStacks && guard < 12) { if (ShopSystem.buyUpgrade('probelauf', p)) guard++; else break; }
          var stacksMax = p.runUpgradeCount('probelauf');
          var matsAtMax = Game.materials;
          var overBuy = ShopSystem.buyUpgrade('probelauf', p);
          var matsAfterOver = Game.materials;

          var code = Save.exportCode();
          var ledgerBefore = Save.data.runLedger ? JSON.parse(JSON.stringify(Save.data.runLedger)) : null;
          Save.wipe();
          var importErr = Save.importCode(code);
          var ledgerAfter = Save.data.runLedger ? JSON.parse(JSON.stringify(Save.data.runLedger)) : null;

          Game.state = 'title';
          var fresh = new Player(0, 'leonidas');
          var freshBase = fresh.st.atkSpd;
          var appliedFresh = Save.applyRunLedger([fresh]);
          var freshAtk = fresh.st.atkSpd;

          p.runUpgrades = {}; p.recalc();
          var liveBefore = p.st.atkSpd;
          Game.state = 'shop';
          var importErr2 = Save.importCode(code);
          var liveAfter = p.st.atkSpd;

          ShopSystem.upgrades = [{ id: 'probelauf' }, { id: 'schweissgeraet' }];
          UI.shopPlayer = 0; UI.show('scShop'); UI.renderShop();
          var shopText = document.getElementById('shopItems').innerText;
          var invText = document.getElementById('invItems').innerText;
          UI.codexTab = 'items'; UI.renderCodex();
          var codexText = document.getElementById('codexList').textContent;
          var codexFull = document.getElementById('codexList').textContent;
          var codexWerkstatt = codexFull.indexOf('Werkstatt-Aufträge') >= 0 && codexFull.indexOf('Schweißgerät') >= 0;

          return JSON.stringify({
            natural: natural, naturalOffers: naturalOffers, naturalShop: naturalShop.slice(0, 1500),
            price0: price0, poorBuy: poorBuy, poorMats: poorMats, poorStacks: poorStacks,
            ok1: ok1, mats1: mats1, atk1: atk1, hp1: hp1,
            price1: price1, ok2: ok2, spent2: spent2, atk2: atk2, hp2: hp2,
            before: before, dps2: dps2,
            stacksMax: stacksMax, overBuy: overBuy, matsAtMax: matsAtMax, matsAfterOver: matsAfterOver,
            ledgerStacks: ledgerBefore && ledgerBefore.slots && ledgerBefore.slots[0] ? ledgerBefore.slots[0]['probelauf'] : -1,
            ledgerChars: ledgerBefore && ledgerBefore.chars ? ledgerBefore.chars.join(',') : '',
            ledgerWave: ledgerBefore ? ledgerBefore.wave : -1,
            importErr: importErr,
            ledgerAfterStacks: ledgerAfter && ledgerAfter.slots && ledgerAfter.slots[0] ? ledgerAfter.slots[0]['probelauf'] : -1,
            freshBase: freshBase, appliedFresh: appliedFresh, freshAtk: freshAtk,
            liveBefore: liveBefore, liveAfter: liveAfter, importErr2: importErr2,
            shopText: shopText.slice(0, 2000), invText: invText.slice(0, 900), codexText: codexText.slice(0, 1600), codexWerkstatt: codexWerkstatt
          });
        })()`;
        const raw = await ev(probe, 30000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        if (r && r.natural && r.natural.cur === 'scShop' && r.natural.state === 'shop' && Array.isArray(r.naturalOffers) && r.naturalOffers.length >= 2)
          pass('Werkstatt live: wave end opens the shop with ' + r.naturalOffers.length + ' Werkstatt-Aufträgen (' + r.naturalOffers.join(', ') + ')');
        else fail('Werkstatt live reachability', r ? JSON.stringify({ natural: r.natural, offers: r.naturalOffers }) : String(raw).slice(0, 200));
        if (r && r.naturalShop.indexOf('WERKSTATT') >= 0 && r.naturalShop.indexOf('Preis steigt') >= 0)
          pass('Werkstatt live: the real shop surface renders the workshop section');
        else fail('Werkstatt live shop surface', r ? String(r.naturalShop).slice(0, 400) : String(raw).slice(0, 200));
        if (r && r.poorBuy === false && r.poorMats === r.price0 - 1 && r.poorStacks === 0)
          pass('Werkstatt live: unaffordable order is rejected and costs nothing (' + (r.price0 - 1) + ' < ' + r.price0 + ' material)');
        else fail('Werkstatt live affordability', r ? JSON.stringify({ poorBuy: r.poorBuy, poorMats: r.poorMats, price0: r.price0, poorStacks: r.poorStacks }) : String(raw).slice(0, 200));
        if (r && r.ok1 === true && r.mats1 === 0 && r.atk1 === r.before.atkSpd + 5 && r.hp1 === r.before.maxHp - 2)
          pass('Werkstatt live: purchase deducts exactly ' + r.price0 + ' material and applies +5% atk speed / -2 max HP through the stat pipeline');
        else fail('Werkstatt live purchase/stats', r ? JSON.stringify({ ok1: r.ok1, mats1: r.mats1, atk1: r.atk1, hp1: r.hp1, before: r.before }) : String(raw).slice(0, 200));
        if (r && r.price1 > r.price0 && r.ok2 === true && r.spent2 === r.price1 && r.atk2 === r.before.atkSpd + 10 && r.hp2 === r.before.maxHp - 4)
          pass('Werkstatt live: second purchase compounds to 2 stacks; price rises ' + r.price0 + ' -> ' + r.price1);
        else fail('Werkstatt live stacking', r ? JSON.stringify({ price0: r.price0, price1: r.price1, ok2: r.ok2, spent2: r.spent2, atk2: r.atk2, hp2: r.hp2 }) : String(raw).slice(0, 200));
        if (r && r.dps2 > r.before.dps)
          pass('Werkstatt live: two stacks raise headless DPS ' + r.before.dps.toFixed(1) + ' -> ' + r.dps2.toFixed(1) + ' (+' + (((r.dps2 / r.before.dps) - 1) * 100).toFixed(1) + '%)');
        else fail('Werkstatt live combat effect', r ? JSON.stringify({ dpsBefore: r.before && r.before.dps, dpsAfter: r.dps2 }) : String(raw).slice(0, 200));
        if (r && r.stacksMax === 4 && r.overBuy === false && r.matsAfterOver === r.matsAtMax)
          pass('Werkstatt live: staffel cap 4 blocks the fifth purchase without charging');
        else fail('Werkstatt live staffel cap', r ? JSON.stringify({ stacksMax: r.stacksMax, overBuy: r.overBuy, matsAtMax: r.matsAtMax, matsAfterOver: r.matsAfterOver }) : String(raw).slice(0, 200));
        if (r && r.ledgerStacks === 4 && r.ledgerChars === 'leonidas' && r.ledgerWave === 6 && r.importErr === null && r.ledgerAfterStacks === 4)
          pass('Werkstatt live: ledger survives Save.exportCode() -> wipe -> importCode() (4 stacks)');
        else fail('Werkstatt live save round-trip', r ? JSON.stringify({ ledgerStacks: r.ledgerStacks, importErr: r.importErr, ledgerAfterStacks: r.ledgerAfterStacks }) : String(raw).slice(0, 200));
        if (r && r.appliedFresh === true && r.freshAtk === r.freshBase + 20)
          pass('Werkstatt live: restore path re-applies 4 stacks to a fresh player (+20% atk speed)');
        else fail('Werkstatt live restore path', r ? JSON.stringify({ appliedFresh: r.appliedFresh, freshBase: r.freshBase, freshAtk: r.freshAtk }) : String(raw).slice(0, 200));
        if (r && r.importErr2 === null && r.liveAfter === r.liveBefore + 20)
          pass('Werkstatt live: importing the save restores the orders on the live run (+' + (r.liveAfter - r.liveBefore) + '% atk speed)');
        else fail('Werkstatt live live-import', r ? JSON.stringify({ importErr2: r.importErr2, liveBefore: r.liveBefore, liveAfter: r.liveAfter }) : String(raw).slice(0, 200));
        if (r && r.shopText.indexOf('WERKSTATT') >= 0 && r.shopText.indexOf('Probelauf') >= 0 && r.shopText.indexOf('4/4') >= 0)
          pass('Werkstatt live: shop cards show staffel 4/4 and the price at max');
        else fail('Werkstatt live shop cards', r ? String(r.shopText).slice(0, 500) : String(raw).slice(0, 200));
        if (r && r.invText.indexOf('Werkstatt:') >= 0 && r.invText.indexOf('Probelauf ×4') >= 0)
          pass('Werkstatt live: inventory lists the purchased orders with their stack count');
        else fail('Werkstatt live inventory', r ? String(r.invText).slice(0, 400) : String(raw).slice(0, 200));
        if (r && r.codexWerkstatt === true)
          pass('Werkstatt live: codex documents the workshop catalog');
        else fail('Werkstatt live codex', r ? String(r.codexText).slice(0, 500) : String(raw).slice(0, 200));
      } catch (e) {
        fail('Werkstatt live leg', String(e && e.message ? e.message : e));
      }
    }

    // ---- Einarm-Willi: one-slot character end to end ----
    // A real Game.startRun() with the new character must show the hard one-slot
    // contract, the T2 start weapon, a shop that turns weapon offers into
    // upgrades of the carried weapon, and a live ability hit that refunds
    // cooldown per target. This is the content proof the roster gap needs.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=einarm' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof CHARS === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = String.raw`(function(){
          Game.coop = false; Game.daily = false; Game.endless = false;
          Save.data.startTier = 0; Save.data.startItem = '';
          Game.manualSeed = 0x51ee; Game.sel = ['einarm']; Game.danger = 0; Game.state = 'title'; Game.mods = [];
          UI.renderChars(0);
          const card = Array.prototype.slice.call(document.querySelectorAll('#charGrid .card')).filter(function(el){ return el.textContent.indexOf('Einarm-Willi') >= 0; })[0];
          const selectable = !!card && !card.classList.contains('lock');
          Game.startRun();
          const p = Game.players[0];
          const start = { char: p.char.id, weapons: p.weapons.length,
            id: p.weapons[0] && p.weapons[0].id, tier: p.weapons[0] && p.weapons[0].tier,
            slots: p.weaponSlots(), atkSpd: p.st.atkSpd, dmgP: p.st.dmgP };
          const blockedAdd = p.addWeapon('pistol', 0) === false && p.weapons.length === 1;
          Game.materials = 9999; Game.wave = 5;
          ShopSystem.generate(5, [p]);
          const offers = ShopSystem.offers.map(function(o){ return { kind: o.kind, id: o.id, tier: o.tier }; });
          const wOffers = offers.filter(function(o){ return o.kind === 'weapon'; });
          const soloOffers = wOffers.length > 0 && wOffers.every(function(o){ return o.id === p.weapons[0].id && o.tier === p.weapons[0].tier; });
          const buyIdx = ShopSystem.offers.findIndex(function(o){ return o.kind === 'weapon' && o.id === p.weapons[0].id && o.tier === p.weapons[0].tier; });
          const tierBefore = p.weapons[0].tier;
          if (buyIdx >= 0) ShopSystem.buy(buyIdx, p);
          const tierAfter = p.weapons[0].tier;
          Game.state = 'play'; Game.qaGod = true; Game.wave = 1; Game.waveTimer = 999; Game.spawnQueue = [];
          Game.enemies.length = 0; if (Game.enemyPool) Game.enemyPool.length = 0;
          p.x = Game.level.w / 2; p.y = Game.level.h / 2; p.vx = 0; p.vy = 0; p.hp = p.maxHp; p.alive = true;
          p.abilityCd = 0; p.useAbility();
          const cdNoHit = p.abilityCd;
          Game.enemies.length = 0;
          const es = [];
          for (let i = 0; i < 5; i++) {
            const a = i / 5 * Math.PI * 2;
            const e = Game.spawnEnemyAt(ENEMY_BY_ID['walker'], p.x + Math.cos(a) * 90, p.y + Math.sin(a) * 90);
            if (e) { e.spawnScale = 1; e.__h0 = e.hp; es.push(e); }
          }
          p.abilityCd = 0; p.useAbility();
          const cdHit = p.abilityCd;
          const hit = es.filter(function(e){ return e.dead || e.hp < e.__h0; }).length;
          return JSON.stringify({ start: start, selectable: selectable, blockedAdd: blockedAdd, offers: offers,
            soloOffers: soloOffers, tierBefore: tierBefore, tierAfter: tierAfter,
            cdNoHit: cdNoHit, cdHit: cdHit, hit: hit, spawned: es.length });
        })()`;
        const raw = await ev(probe, 30000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        if (r && r.selectable === true) pass('Einarm live: character card is rendered unlocked and selectable in the real char grid');
        else fail('Einarm live selection', r ? JSON.stringify({ selectable: r.selectable }) : String(raw).slice(0, 180));
        if (r && r.start && r.start.char === 'einarm' && r.start.weapons === 1 && r.start.id === 'nietpistole' && r.start.tier === 1 && r.start.slots === 1)
          pass('Einarm live: start run gives 1 weapon slot, Nietpistole at T2 (atkSpd +' + r.start.atkSpd + ', dmg +' + r.start.dmgP + '%)');
        else fail('Einarm live start', r ? JSON.stringify(r.start) : String(raw).slice(0, 180));
        if (r && r.blockedAdd === true) pass('Einarm live: Player.addWeapon rejects a second weapon (hard slot cap)');
        else fail('Einarm live slot cap', r ? JSON.stringify({ blockedAdd: r.blockedAdd, offers: r.offers }) : String(raw).slice(0, 180));
        if (r && r.offers.length === 6 && r.soloOffers === true)
          pass('Einarm live: 6 shop offers, every weapon offer is a Nietpistole upgrade at the carried tier');
        else fail('Einarm live shop offers', r ? JSON.stringify(r.offers) : String(raw).slice(0, 180));
        if (r && r.tierAfter === r.tierBefore + 1)
          pass('Einarm live: buying the shop offer raises the sole weapon T' + (r.tierBefore + 1) + ' -> T' + (r.tierAfter + 1));
        else fail('Einarm live shop upgrade', r ? JSON.stringify({ before: r.tierBefore, after: r.tierAfter }) : String(raw).slice(0, 180));
        if (r && r.hit === 5 && r.cdHit < r.cdNoHit - .3)
          pass('Einarm live: Nietenhagel hits 5/5 enemies and refunds cooldown ' + r.cdNoHit.toFixed(2) + 's -> ' + r.cdHit.toFixed(2) + 's');
        else fail('Einarm live ability', r ? JSON.stringify({ hit: r.hit, spawned: r.spawned, cdNoHit: r.cdNoHit, cdHit: r.cdHit }) : String(raw).slice(0, 180));
      } catch (e) {
        fail('Einarm live leg', String(e && e.message ? e.message : e));
      }
    }


    // ---- Arsenal 44: production shop reach + live weapon/item mechanics ----
    // Data presence is not enough: every new row must survive the real shop
    // generator and codex, and each mechanic must fire in a live run. Weapon
    // probes call WeaponSystem.fire/auraTick against controlled enemies; item
    // probes call the exact hooks (kill, crit hit, dodge nova, aura tick).
    // Every probe is seeded and position-fixed, and the Friedenshorn probe runs
    // twice to prove the simulation is deterministic, not luck.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=arsenal' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof WeaponSystem === 'object' && typeof Projectiles === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = String.raw`(function(){
          var WIDS = ['friedenshorn','zugriffshaken','waldlaeuferbogen','schildglocke','nietpistole','schattenmesser','sternkette'];
          var IIDS = ['rettungstrage','moosmatte','brandungsring','kettenreaktor','zuendsatz'];
          Game.coop = false; Game.daily = false; Game.endless = false;
          Save.data.startTier = 0; Save.data.startItem = '';
          Game.manualSeed = 0x51ee; Game.sel = ['leonidas']; Game.danger = 0; Game.state = 'title'; Game.mods = [];
          Game.startRun();
          var p = Game.players[0];
          function reset(){
            p.items = []; p.itemCounts = {}; p.curse = 0; p.turrets = []; p.buffs = []; p.relics = []; p.evolutions = [];
            p.weapons.length = 0; p.recalc();
            p.x = 500; p.y = 500; p.aim = 0; p.face = 0; p.alive = true; p.hp = p.maxHp; p.invuln = 0;
            Game.state = 'play'; Game.qaGod = true; Game.wave = 1; Game.waveTimer = 999; Game.spawnQueue = [];
            Game.enemies.length = 0; if (Game.enemyPool) Game.enemyPool.length = 0; Game.hash.clear();
            Projectiles.active.length = 0;
          }
          function mob(x, y, hp){
            var e = Game.spawnEnemyAt(ENEMY_BY_ID.walker, x, y);
            e.maxHp = hp || 1000; e.hp = e.maxHp; e.armor = 0; e.spd = 0; e.dmg = 0; e.__h0 = e.hp;
            Game.hash.insert(e);
            return e;
          }
          function equip(id){ p.weapons.length = 0; p.addWeapon(id, 0); return p.weapons[0]; }
          var out = {};

          reset(); var e = mob(570, 500); var w = equip('friedenshorn');
          WeaponSystem.fire(p, w, 0, e, WeaponSystem.range(p, w));
          out.friedenshorn = { stun: e.stun || 0, slow: e.slow || 0, hp: e.hp };

          reset(); e = mob(545, 500); w = equip('zugriffshaken');
          WeaponSystem.fire(p, w, 0, e, WeaponSystem.range(p, w));
          out.zugriffshaken = { stun: e.stun || 0, mark: e.marked || 0, knock: e.x - 545 };

          reset(); e = mob(700, 500); w = equip('waldlaeuferbogen'); w.charge = 1;
          WeaponSystem.fire(p, w, 0, e, WeaponSystem.range(p, w));
          out.waldlaeuferbogen = { slow: e.slow || 0, hp: e.hp };

          reset(); e = mob(570, 500); w = equip('schildglocke'); var px = e.x;
          WeaponSystem.auraTick(p, w, 1);
          out.schildglocke = { stun: e.stun || 0, hp: e.hp, push: e.x - px };

          reset(); e = mob(620, 500); var e2 = mob(700, 500); w = equip('nietpistole');
          WeaponSystem.fire(p, w, 0, e, WeaponSystem.range(p, w));
          out.nietpistole = { stun: e.stun || 0, stun2: e2.stun || 0, h1: e.__h0 - e.hp, h2: e2.__h0 - e2.hp };

          reset(); e = mob(700, 500); w = equip('schattenmesser');
          var projBefore = Projectiles.active.length;
          WeaponSystem.fire(p, w, 0, e, WeaponSystem.range(p, w));
          var pr = Projectiles.active[Projectiles.active.length - 1];
          out.schattenmesser = { spawned: Projectiles.active.length - projBefore, projectile: !!pr && pr.source === 'schattenmesser', poison: pr ? pr.poison : 0, bounce: pr ? pr.bounce : 0 };

          reset(); e = mob(620, 500); e2 = mob(670, 500); w = equip('sternkette');
          WeaponSystem.fire(p, w, 0, e, WeaponSystem.range(p, w));
          out.sternkette = { burn: e.burnT || 0, burn2: e2.burnT || 0, hp: e.hp, hp2: e2.hp };

          reset(); p.addItem(ITEM_BY_ID.rettungstrage); p.hp = p.maxHp - 20;
          var beforeHeal = p.hp; e = mob(520, 500, 1); e.hp = 1; e.die(p, 'test');
          var healMul = (Game.modActive && Game.modActive('halbe_heilung')) ? .5 : 1;
          out.rettungstrage = { heal: p.hp - beforeHeal, expected: p.killHeal * healMul, killHeal: p.killHeal, mul: healMul, mods: (Game.mods || []).map(function(m){ return m && m.id; }) };

          reset(); p.addItem(ITEM_BY_ID.zuendsatz); e = mob(520, 500, 1); var near = mob(560, 500, 1000);
          var nh0 = near.hp; e.hp = 1; e.die(p, 'test');
          out.zuendsatz = { neighbor: nh0 - near.hp };

          reset(); p.addItem(ITEM_BY_ID.kettenreaktor); e = mob(560, 500, 1000); near = mob(600, 500, 1000);
          var kh0 = near.hp; var oldRand = RAND; RAND = function(){ return 0; };
          WeaponSystem.onHit(p, { id: 'pistol', tier: 0 }, e, 10, true, {});
          RAND = oldRand;
          out.kettenreaktor = { neighbor: kh0 - near.hp };

          reset(); p.addItem(ITEM_BY_ID.brandungsring); near = mob(560, 500, 1000);
          var bh0 = near.hp; var novaCount = p.triggerDodgeNova();
          out.brandungsring = { count: novaCount, neighbor: bh0 - near.hp };

          reset(); p.addItem(ITEM_BY_ID.moosmatte); near = mob(600, 500, 1000);
          var auraCount = p.itemAuraTick(2);
          out.moosmatte = { count: auraCount, slow: near.slow || 0 };

          function hornRun(){
            Game.setRunSeed(0x51ee); reset();
            var he = mob(570, 500); var hw = equip('friedenshorn');
            WeaponSystem.fire(p, hw, 0, he, WeaponSystem.range(p, hw));
            return { drop: Math.round((he.__h0 - he.hp) * 1e6) / 1e6, stun: he.stun || 0 };
          }
          var d1 = hornRun(), d2 = hornRun();
          out.determinism = { a: d1, b: d2, ok: d1.drop === d2.drop && d1.stun === d2.stun && d1.drop > 0 };

          var pool = ShopSystem.weaponPool().map(function(w){ return w.id; });
          var poolOk = WIDS.every(function(id){ return pool.indexOf(id) >= 0; });
          var seenW = {}, seenI = {};
          var waves = [1, 10, 20];
          for (var wi = 0; wi < waves.length; wi++) {
            for (var s = 0; s < 700; s++) {
              Game.setRunSeed((0x40000000 + wi * 100003 + s * 7919) >>> 0);
              ShopSystem.generate(waves[wi], [p]);
              for (var oi = 0; oi < ShopSystem.offers.length; oi++) {
                var o = ShopSystem.offers[oi];
                if (o.kind === 'weapon' && WIDS.indexOf(o.id) >= 0) seenW[o.id] = 1;
                if (o.kind === 'item' && IIDS.indexOf(o.id) >= 0) seenI[o.id] = 1;
              }
            }
          }
          var unseenW = WIDS.filter(function(id){ return !seenW[id]; });
          var unseenI = IIDS.filter(function(id){ return !seenI[id]; });

          UI.codexTab = 'weapons'; UI.renderCodex();
          var wt = document.getElementById('codexList').textContent;
          UI.codexTab = 'items'; UI.renderCodex();
          var itx = document.getElementById('codexList').textContent;
          UI.codexTab = 'chars'; UI.renderCodex();
          var ctx = document.getElementById('codexList').textContent;
          var codexWCount = wt.split('T1:').length - 1;
          var codexWFamilies = WIDS.every(function(id){ return wt.indexOf(WEAPON_BY_ID[id].name) >= 0 && wt.indexOf(WEAPON_BY_ID[id].special) >= 0; });
          var codexICount = ITEMS.filter(function(it){ return itx.indexOf(it.name) >= 0; }).length;
          var codexIFamilies = ITEM_FAMILIES.every(function(f){
            var n = ITEMS.filter(function(it){ return ITEM_FAMILY_BY_ID[it.id] && ITEM_FAMILY_BY_ID[it.id].id === f.id; }).length;
            return itx.indexOf(f.name + ' (' + n + ' Items)') >= 0;
          });
          var codexEffect = IIDS.every(function(id){ return itx.indexOf(itemEffectLine(ITEM_BY_ID[id])) >= 0; });
          var codexStarts = CHARS.every(function(c){ return ctx.indexOf('Start: ' + WEAPON_BY_ID[c.startWeapon].name) >= 0; });

          WIDS.forEach(function(id){ if (Save.data.unlockedWeapons.indexOf(id) < 0) Save.data.unlockedWeapons.push(id); });
          Save.data.startItem = 'zuendsatz';
          var saveCode = Save.exportCode();
          Save.data.unlockedWeapons = []; Save.data.startItem = '';
          var saveErr = Save.importCode(saveCode);
          var saveOk = saveErr === null && WIDS.every(function(id){ return Save.data.unlockedWeapons.indexOf(id) >= 0; }) && Save.data.startItem === 'zuendsatz';
          Game.state = 'title'; Game.sel = ['leonidas']; Game.startRun();
          var startItemApplied = !!(Game.players[0] && Game.players[0].itemCounts.zuendsatz === 1);

          return JSON.stringify({ out: out, poolOk: poolOk, unseenW: unseenW, unseenI: unseenI,
            codexWCount: codexWCount, codexWFamilies: codexWFamilies, codexICount: codexICount,
            codexIFamilies: codexIFamilies, codexEffect: codexEffect, codexStarts: codexStarts,
            saveErr: saveErr, saveOk: saveOk, startItemApplied: startItemApplied,
            weapons: WEAPONS.length, items: ITEMS.length });
        })()`;
        const raw = await ev(probe, 90000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        const o = r && r.out ? r.out : {};
        const dump = JSON.stringify(r ? r : String(raw).slice(0, 240)).slice(0, 500);
        if (r && r.weapons === 81 && r.items === 125) pass('Arsenal 44 live: engine exposes 81 weapons / 125 items');
        else fail('Arsenal 44 live counts', dump);
        if (r && r.poolOk && r.unseenW.length === 0) pass('Arsenal 44 live: all 7 new weapons are in ShopSystem.weaponPool() and appeared in production shop offers');
        else fail('Arsenal 44 live weapon pool', dump);
        if (r && r.unseenI.length === 0) pass('Arsenal 44 live: all 5 new items appeared in production shop offers');
        else fail('Arsenal 44 live item pool', dump);
        if (r && r.codexWCount === 81 && r.codexWFamilies) pass('Arsenal 44 live: weapon codex lists 81 weapons with every new name and special text');
        else fail('Arsenal 44 live weapon codex', dump);
        if (r && r.codexICount === 125 && r.codexIFamilies) pass('Arsenal 44 live: item codex lists 125 items and every family count matches the data');
        else fail('Arsenal 44 live item codex', dump);
        if (r && r.codexEffect) pass('Arsenal 44 live: codex renders the five new distinct effect lines');
        else fail('Arsenal 44 live item effects codex', dump);
        if (r && r.codexStarts) pass('Arsenal 44 live: character codex shows all 44 starting weapons by name');
        else fail('Arsenal 44 live start codex', dump);
        if (o.friedenshorn && o.friedenshorn.stun > 0 && o.friedenshorn.slow > 0) pass('Arsenal 44 live: Friedenshorn cone stuns and slows');
        else fail('Arsenal 44 Friedenshorn', JSON.stringify(o.friedenshorn));
        if (o.zugriffshaken && o.zugriffshaken.stun > 0 && o.zugriffshaken.mark >= 2.5) pass('Arsenal 44 live: Zugriffs-Haken stuns and marks for +35% follow-up');
        else fail('Arsenal 44 Zugriffs-Haken', JSON.stringify(o.zugriffshaken));
        if (o.waldlaeuferbogen && o.waldlaeuferbogen.slow > 0) pass('Arsenal 44 live: full Waldlaeuferbogen charge slows the pierced target');
        else fail('Arsenal 44 Waldlaeuferbogen', JSON.stringify(o.waldlaeuferbogen));
        if (o.schildglocke && o.schildglocke.stun > 0 && o.schildglocke.push > 0) pass('Arsenal 44 live: Schildglocke aura pushes and stuns');
        else fail('Arsenal 44 Schildglocke', JSON.stringify(o.schildglocke));
        if (o.nietpistole && o.nietpistole.stun > 0 && o.nietpistole.stun2 > 0 && o.nietpistole.h1 > 0 && o.nietpistole.h2 > o.nietpistole.h1) pass('Arsenal 44 live: Nietpistole hits/stuns the whole line with increasing damage');
        else fail('Arsenal 44 Nietpistole', JSON.stringify(o.nietpistole));
        if (o.schattenmesser && o.schattenmesser.spawned === 1 && o.schattenmesser.projectile && o.schattenmesser.poison > 0 && o.schattenmesser.bounce > 0) pass('Arsenal 44 live: Schattenmesser spawns a poison projectile with bounce');
        else fail('Arsenal 44 Schattenmesser', JSON.stringify(o.schattenmesser));
        if (o.sternkette && o.sternkette.burn > 0 && o.sternkette.burn2 > 0) pass('Arsenal 44 live: Sternenkette burns every chain link');
        else fail('Arsenal 44 Sternenkette', JSON.stringify(o.sternkette));
        if (o.rettungstrage && o.rettungstrage.killHeal === 2 && o.rettungstrage.heal > 0 && Math.abs(o.rettungstrage.heal - o.rettungstrage.expected) < 1e-6) pass('Arsenal 44 live: Rettungstrage heals ' + o.rettungstrage.heal + ' on kill (hook ' + o.rettungstrage.killHeal + ', multiplier ' + o.rettungstrage.mul + ')');
        else fail('Arsenal 44 Rettungstrage', JSON.stringify(o.rettungstrage));
        if (o.zuendsatz && o.zuendsatz.neighbor > 0) pass('Arsenal 44 live: Zuendsatz explodes on kill and damages a neighbor');
        else fail('Arsenal 44 Zuendsatz', JSON.stringify(o.zuendsatz));
        if (o.kettenreaktor && o.kettenreaktor.neighbor > 0) pass('Arsenal 44 live: Kettenreaktor crit chains to a neighbor');
        else fail('Arsenal 44 Kettenreaktor', JSON.stringify(o.kettenreaktor));
        if (o.brandungsring && o.brandungsring.count > 0 && o.brandungsring.neighbor > 0) pass('Arsenal 44 live: Brandungsring dodge nova damages nearby enemies');
        else fail('Arsenal 44 Brandungsring', JSON.stringify(o.brandungsring));
        if (o.moosmatte && o.moosmatte.count > 0 && o.moosmatte.slow > 0) pass('Arsenal 44 live: Moosmatte aura slows nearby enemies');
        else fail('Arsenal 44 Moosmatte', JSON.stringify(o.moosmatte));
        if (o.determinism && o.determinism.ok) pass('Arsenal 44 live: seeded Friedenshorn simulation repeats exactly (drop ' + o.determinism.a.drop + ', stun ' + o.determinism.a.stun + ')');
        else fail('Arsenal 44 deterministic sim', JSON.stringify(o.determinism));
        if (r && r.saveOk && r.startItemApplied) pass('Arsenal 44 live: new weapon ids + startItem survive Save.exportCode()/importCode() and the run starts with the Zuendsatz');
        else fail('Arsenal 44 live save/start loadout', dump);
      } catch (e) {
        fail('Arsenal 44 live leg', String(e && e.message ? e.message : e));
      }
    }

    // ---- Charakter-Riege 44: seventeen new heroes through the real UI ----
    // The parity doc targets 44 heroes. This leg proves the seventeen new cards are
    // rendered unlocked in #charGrid, survive the real play -> card ->
    // confirm -> controlsOK flow, start with their own weapon, and that their
    // ability is reachable through the actual skill key while it leaves a
    // distinct, measurable status effect on live enemies.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=roster' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof CHARS === 'object' && typeof UI === 'object' && typeof Input === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = String.raw`(function(){
          const SPEC = [
            { id:'ampelanna', name:'Ampel-Anna', weapon:'schrottkanone', ability:'gruenphase' },
            { id:'dampfdieter', name:'Dampf-Dieter', weapon:'schmiedehammer', ability:'dampfwalze' },
            { id:'nachtwaechter', name:'Nachtwächter Nils', weapon:'armbrust', ability:'scheinwerfer' },
            { id:'weinwanda', name:'Wein-Wanda', weapon:'wurfbeil', ability:'rebenhieb' },
            { id:'frostfritz', name:'Frost-Fritz', weapon:'kaeltekompresse', ability:'kaeltewelle' },
            { id:'speersophie', name:'Speer-Sophie', weapon:'spear', ability:'speerwurf' },
            { id:'axtachim', name:'Axt-Achim', weapon:'chopper', ability:'holzhack' },
            { id:'nagelnadja', name:'Nagel-Nadja', weapon:'nagler', ability:'nagelregen' },
            { id:'bierbernd', name:'Bier-Bernd', weapon:'bierwerfer', ability:'fassrolle' },
            { id:'minenmarie', name:'Minen-Marie', weapon:'magnetmine', ability:'magnetfeld' },
            { id:'taubentoni', name:'Tauben-Toni', weapon:'taubenschwarm', ability:'taubensturm' },
            { id:'saegesvenja', name:'Säge-Svenja', weapon:'kettensaege', ability:'kettenschnitt' },
            { id:'laserlars', name:'Laser-Lars', weapon:'laserzirkel', ability:'laserfokus' },
            { id:'blitzbritta', name:'Blitz-Britta', weapon:'blitzableiter', ability:'kettenblitz' },
            { id:'skalpellsina', name:'Skalpell-Sina', weapon:'skalpell', ability:'notoperation' },
            { id:'rettungsralf', name:'Rettungs-Ralf', weapon:'rettungssaege', ability:'rettungsgriff' },
            { id:'flammenfelix', name:'Flammen-Felix', weapon:'flammenklinge', ability:'brandschneise' }
          ];
          OPT().tutorial = false;
          const baseSelectable = Save.unlockedCharCount();
          const predicateSelectable = CHARS.filter(function(c){ return !c.unlock || Save.data.unlockedChars.includes(c.id); }).length;
          const lockedCount = CHARS.filter(function(c){ return c.unlock && !Save.data.unlockedChars.includes(c.id); }).length;
          const countOk = baseSelectable === predicateSelectable && baseSelectable + lockedCount === CHARS.length;
          const lockedChar = CHARS.filter(function(c){ return c.unlock && !Save.data.unlockedChars.includes(c.id); })[0];
          const lockedRejected = !lockedChar || Save.isCharUnlocked(lockedChar.id) === false;
          const freeChar = CHARS.filter(function(c){ return !c.unlock; })[0];
          const freeAccepted = !!freeChar && Save.isCharUnlocked(freeChar.id) === true;
          const uniqueAbilities = new Set(CHARS.map(function(c){ return c.ability.id; })).size === CHARS.length;
          const profilesOk = CHARS.every(function(c){ return !!(c.profile && c.profile.figure && c.profile.animation && c.profile.moveSet && c.profile.moveSet.id); });
          const profilesUnique = new Set(CHARS.map(function(c){ return c.profile.figure; })).size === CHARS.length &&
            new Set(CHARS.map(function(c){ return c.profile.animation; })).size === CHARS.length &&
            new Set(CHARS.map(function(c){ return c.profile.moveSet.id; })).size === CHARS.length;
          const each = [];
          for (const spec of SPEC) {
            const c = CHAR_BY_ID[spec.id];
            if (!c) { each.push({ id:spec.id, missing:true }); continue; }
            if (Save.data.unlockedChars.indexOf(spec.id) < 0) Save.data.unlockedChars.push(spec.id);
            Game.coop = false; Game.daily = false; Game.endless = false;
            UI.renderTitle(); UI.show('scTitle');
            document.querySelector('#scTitle [data-act="play"]').click();
            const card = Array.prototype.slice.call(document.querySelectorAll('#charGrid .card')).filter(function(el){ return el.textContent.indexOf(spec.name) >= 0; })[0];
            const selectable = !!card && !card.classList.contains('lock');
            if (selectable) card.click();
            document.querySelector('#scChar [data-act="charConfirm"]').click();
            document.querySelector('#scControls [data-act="controlsOK"]').click();
            const p = Game.players[0];
            const started = !!p && p.char.id === spec.id && Game.state === 'play';
            const weapon = p && p.weapons[0] ? p.weapons[0].id : null;
            if (!started) { each.push({ id:spec.id, selectable:selectable, started:started, weapon:weapon }); continue; }
            Game.qaGod = true; Game.wave = 1; Game.waveTimer = 999; Game.waveEnding = false;
            Game.spawnQueue = []; Game.spawnAcc = 0;
            Game.enemies.length = 0; if (Game.enemyPool) Game.enemyPool.length = 0;
            p.x = Game.level.w / 2; p.y = Game.level.h / 2; p.vx = 0; p.vy = 0;
            p.hp = p.maxHp * .5; p.alive = true; p.invuln = 0;
            const spawned = [];
            for (let i = 0; i < 5; i++) {
              const a = (i - 2) * .03;
              const e = Game.spawnEnemyAt(ENEMY_BY_ID.walker, p.x + Math.cos(a) * 70, p.y + Math.sin(a) * 70);
              if (!e) continue;
              e.maxHp = 500; e.hp = 500; e.armor = 0; e.spd = 0;
              spawned.push(e);
            }
            p.aim = 0; p.abilityCd = 0; p.buffs.length = 0; p.recalc();
            const hp0 = spawned.map(function(e){ return e.hp; });
            const pickups0 = Game.pickups.length;
            const key = Input.key('skill1');
            Input.keys[key] = true;
            p.update(1 / 60);
            Input.keys[key] = false;
            each.push({
              id: spec.id, name: spec.name, selectable: selectable, started: started, weapon: weapon,
              abilityOk: c.ability.id === spec.ability, cd: +p.abilityCd.toFixed(2), spawned: spawned.length,
              hits: spawned.filter(function(e, i){ return e.dead || e.hp < hp0[i]; }).length,
              marked: spawned.filter(function(e){ return (e.marked || 0) > 0; }).length,
              stunned: spawned.filter(function(e){ return (e.stun || 0) > 0; }).length,
              slowed: spawned.filter(function(e){ return (e.slowT || 0) > 0; }).length,
              burnt: spawned.filter(function(e){ return (e.burnT || 0) > 0; }).length,
              frozen: spawned.filter(function(e){ return (e.freezeT || 0) > 0; }).length,
              dash: +(p.dashT || 0).toFixed(2),
              speedBuff: p.buffs.some(function(b){ return b.stat === 'speed' && b.val > 0; }),
              atkBuff: p.buffs.some(function(b){ return b.stat === 'atkSpd' && b.val > 0; }),
              poisoned: spawned.filter(function(e){ return (e.poisonT || 0) > 0; }).length,
              shocked: spawned.filter(function(e){ return (e.shockT || 0) > 0; }).length,
              pickups: Game.pickups.length - pickups0,
              buffs: p.buffs.map(function(b){ return b.stat; }),
              healed: p.hp > p.maxHp * .5 + .5
            });
            UI.show(null); Game.state = 'title';
          }
          return JSON.stringify({ total: CHARS.length, uniqueAbilities: uniqueAbilities,
            profilesOk: profilesOk, profilesUnique: profilesUnique, each: each,
            baseSelectable: baseSelectable, lockedCount: lockedCount, countOk: countOk,
            lockedRejected: lockedRejected, freeAccepted: freeAccepted,
            lockedId: lockedChar ? lockedChar.id : null });
        })()`;
        const raw = await ev(probe, 30000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        if (r && r.total === 44) pass('Roster 44: CHARS holds 44 heroes after the character expansion');
        else fail('Roster 44 count', r ? JSON.stringify({ total: r.total }) : String(raw).slice(0, 180));
        if (r && r.uniqueAbilities && r.profilesOk && r.profilesUnique)
          pass('Roster 44: every hero has a unique ability id, figure, animation and move set');
        else fail('Roster 44 contracts', r ? JSON.stringify({ uniqueAbilities: r.uniqueAbilities, profilesOk: r.profilesOk, profilesUnique: r.profilesUnique }) : String(raw).slice(0, 180));
        if (r && r.countOk && r.lockedRejected && r.freeAccepted)
          pass('Roster 44: ' + r.baseSelectable + '/44 heroes selectable; explicit unlock gates stay enforced');
        else fail('Roster 44 unlock count', r ? JSON.stringify({ base: r.baseSelectable, locked: r.lockedCount, countOk: r.countOk, lockedRejected: r.lockedRejected, freeAccepted: r.freeAccepted, lockedId: r.lockedId }) : String(raw).slice(0, 180));
        const pick = function(id){ return r && r.each ? r.each.filter(function(e){ return e.id === id; })[0] : null; };
        const a = pick('ampelanna');
        if (a && a.selectable && a.started && a.weapon === 'schrottkanone' && a.abilityOk && a.cd > 0 && a.hits >= 4 && a.speedBuff && a.atkBuff)
          pass('Roster 44: Ampel-Anna starts with the Schrottkanone via the real grid; Grüne Welle buffs speed/atkSpd and hits ' + a.hits + '/5');
        else fail('Roster 44 Ampel-Anna', a ? JSON.stringify(a) : String(raw).slice(0, 180));
        const d = pick('dampfdieter');
        if (d && d.selectable && d.started && d.weapon === 'schmiedehammer' && d.abilityOk && d.cd > 0 && d.hits >= 4 && d.stunned >= 4 && d.burnt >= 4 && d.dash > 0)
          pass('Roster 44: Dampf-Dieter rams the cone with a dash, ' + d.stunned + '/5 stuns and ' + d.burnt + '/5 burns');
        else fail('Roster 44 Dampf-Dieter', d ? JSON.stringify(d) : String(raw).slice(0, 180));
        const n = pick('nachtwaechter');
        if (n && n.selectable && n.started && n.weapon === 'armbrust' && n.abilityOk && n.cd > 0 && n.hits >= 4 && n.marked >= 4)
          pass('Roster 44: Nachtwächter Nils marks ' + n.marked + '/5 targets through the real Scheinwerfer skill key');
        else fail('Roster 44 Nachtwächter', n ? JSON.stringify(n) : String(raw).slice(0, 180));
        const w = pick('weinwanda');
        if (w && w.selectable && w.started && w.weapon === 'wurfbeil' && w.abilityOk && w.cd > 0 && w.hits >= 4 && w.healed)
          pass('Roster 44: Wein-Wanda hits ' + w.hits + '/5 with Rebenhieb and heals from the harvest');
        else fail('Roster 44 Wein-Wanda', w ? JSON.stringify(w) : String(raw).slice(0, 180));
        const f = pick('frostfritz');
        if (f && f.selectable && f.started && f.weapon === 'kaeltekompresse' && f.abilityOk && f.cd > 0 && f.hits >= 4 && f.frozen >= 4 && f.slowed >= 4)
          pass('Roster 44: Frost-Fritz freezes ' + f.frozen + '/5 and slows ' + f.slowed + '/5 with Kältewelle');
        else fail('Roster 44 Frost-Fritz', f ? JSON.stringify(f) : String(raw).slice(0, 180));

        const sp = pick('speersophie');
        if (sp && sp.selectable && sp.started && sp.weapon === 'spear' && sp.abilityOk && sp.cd > 0 && sp.hits >= 4 && sp.stunned >= 4 && sp.buffs.indexOf('range') >= 0)
          pass('Roster 44: Speer-Sophie durchbohrt die Reihe mit Stun und Reichweiten-Buff (' + sp.hits + '/5 Treffer)');
        else fail('Roster 44 Speer-Sophie', sp ? JSON.stringify(sp) : String(raw).slice(0, 180));
        const ax = pick('axtachim');
        if (ax && ax.selectable && ax.started && ax.weapon === 'chopper' && ax.abilityOk && ax.cd > 0 && ax.hits >= 4 && ax.stunned >= 4 && ax.buffs.indexOf('melee') >= 0)
          pass('Roster 44: Axt-Achim spaltet den Kegel mit Stun und Nahkampf-Buff (' + ax.hits + '/5 Treffer)');
        else fail('Roster 44 Axt-Achim', ax ? JSON.stringify(ax) : String(raw).slice(0, 180));
        const nn = pick('nagelnadja');
        if (nn && nn.selectable && nn.started && nn.weapon === 'nagler' && nn.abilityOk && nn.cd > 0 && nn.hits >= 4 && nn.stunned >= 4 && nn.slowed >= 4 && nn.marked >= 4 && nn.buffs.indexOf('atkSpd') >= 0)
          pass('Roster 44: Nagel-Nadja nagelt fest, verlangsamt, markiert und bufft das Angriffstempo (' + nn.hits + '/5 Treffer)');
        else fail('Roster 44 Nagel-Nadja', nn ? JSON.stringify(nn) : String(raw).slice(0, 180));
        const bb = pick('bierbernd');
        if (bb && bb.selectable && bb.started && bb.weapon === 'bierwerfer' && bb.abilityOk && bb.cd > 0 && bb.hits >= 4 && bb.burnt >= 4 && bb.dash > 0 && bb.buffs.indexOf('armor') >= 0)
          pass('Roster 44: Bier-Bernd rollt das Fass mit Brand, Dash und Ruestungs-Buff (' + bb.hits + '/5 Treffer)');
        else fail('Roster 44 Bier-Bernd', bb ? JSON.stringify(bb) : String(raw).slice(0, 180));
        const mm = pick('minenmarie');
        if (mm && mm.selectable && mm.started && mm.weapon === 'magnetmine' && mm.abilityOk && mm.cd > 0 && mm.hits >= 4 && mm.slowed >= 4 && mm.stunned >= 4 && mm.buffs.indexOf('eng') >= 0)
          pass('Roster 44: Minen-Marie zieht zusammen, verlangsamt und bufft Technik (' + mm.hits + '/5 Treffer)');
        else fail('Roster 44 Minen-Marie', mm ? JSON.stringify(mm) : String(raw).slice(0, 180));
        const tt = pick('taubentoni');
        if (tt && tt.selectable && tt.started && tt.weapon === 'taubenschwarm' && tt.abilityOk && tt.cd > 0 && tt.hits >= 4 && tt.slowed >= 4 && tt.pickups > 0 && tt.buffs.indexOf('luck') >= 0)
          pass('Roster 44: Tauben-Toni ruft den Schwarm mit Beute und Gluecks-Buff (' + tt.hits + '/5 Treffer)');
        else fail('Roster 44 Tauben-Toni', tt ? JSON.stringify(tt) : String(raw).slice(0, 180));
        const sv = pick('saegesvenja');
        if (sv && sv.selectable && sv.started && sv.weapon === 'kettensaege' && sv.abilityOk && sv.cd > 0 && sv.hits >= 4 && sv.burnt >= 4 && sv.stunned >= 4 && sv.dash > 0 && sv.buffs.indexOf('atkSpd') >= 0)
          pass('Roster 44: Säge-Svenja springt mit Saege, Brand, Stun und Tempo-Buff (' + sv.hits + '/5 Treffer)');
        else fail('Roster 44 Säge-Svenja', sv ? JSON.stringify(sv) : String(raw).slice(0, 180));
        const ll = pick('laserlars');
        if (ll && ll.selectable && ll.started && ll.weapon === 'laserzirkel' && ll.abilityOk && ll.cd > 0 && ll.hits >= 4 && ll.slowed >= 4 && ll.marked >= 4 && ll.buffs.indexOf('crit') >= 0 && ll.buffs.indexOf('range') >= 0)
          pass('Roster 44: Laser-Lars markiert und verlangsamt mit Krit-/Reichweiten-Buff (' + ll.hits + '/5 Treffer)');
        else fail('Roster 44 Laser-Lars', ll ? JSON.stringify(ll) : String(raw).slice(0, 180));
        const br = pick('blitzbritta');
        if (br && br.selectable && br.started && br.weapon === 'blitzableiter' && br.abilityOk && br.cd > 0 && br.hits >= 4 && br.shocked >= 4 && br.stunned >= 4 && br.buffs.indexOf('elem') >= 0)
          pass('Roster 44: Blitz-Britta springt als Kette mit Schock, Stun und Elementar-Buff (' + br.hits + '/5 Treffer)');
        else fail('Roster 44 Blitz-Britta', br ? JSON.stringify(br) : String(raw).slice(0, 180));
        const ss = pick('skalpellsina');
        if (ss && ss.selectable && ss.started && ss.weapon === 'skalpell' && ss.abilityOk && ss.cd > 0 && ss.hits >= 4 && ss.poisoned >= 4 && ss.stunned >= 4 && ss.healed && ss.buffs.indexOf('lifesteal') >= 0)
          pass('Roster 44: Skalpell-Sina schneidet mit Gift, Stun, Heilung und Lebensraub (' + ss.hits + '/5 Treffer)');
        else fail('Roster 44 Skalpell-Sina', ss ? JSON.stringify(ss) : String(raw).slice(0, 180));
        const rr = pick('rettungsralf');
        if (rr && rr.selectable && rr.started && rr.weapon === 'rettungssaege' && rr.abilityOk && rr.cd > 0 && rr.hits >= 4 && rr.stunned >= 4 && rr.healed && rr.buffs.indexOf('armor') >= 0)
          pass('Roster 44: Rettungs-Ralf heilt, reinigt und stunnt mit Ruestungs-Buff (' + rr.hits + '/5 Treffer)');
        else fail('Roster 44 Rettungs-Ralf', rr ? JSON.stringify(rr) : String(raw).slice(0, 180));
        const ff = pick('flammenfelix');
        if (ff && ff.selectable && ff.started && ff.weapon === 'flammenklinge' && ff.abilityOk && ff.cd > 0 && ff.hits >= 4 && ff.burnt >= 4 && ff.stunned >= 4 && ff.buffs.indexOf('speed') >= 0 && ff.buffs.indexOf('elem') >= 0)
          pass('Roster 44: Flammen-Felix brennt die Gasse mit Brand, Stun und Tempo-Buff (' + ff.hits + '/5 Treffer)');
        else fail('Roster 44 Flammen-Felix', ff ? JSON.stringify(ff) : String(raw).slice(0, 180));
      } catch (e) {
        fail('Roster 44 leg', String(e && e.message ? e.message : e));
      }
    }

    // ---- Item-Pool 120: natural shop roll + every new effect through #shopItems ----
    // 1) A naturally generated wave-20 shop must contain a new item; it is
    //    bought by clicking the real card. 2) Every new item is placed into a
    //    shop offer one at a time and bought through the same DOM handler, so
    //    the assertion covers the real price/buy/addItem/recalc path, not a
    //    direct p.addItem call. The declared stats and extras must show up
    //    exactly in the run state.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=items' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof ITEMS === 'object' && typeof UI === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = String.raw`(function(){
          const IDS = ${JSON.stringify(ITEM_POOL_LEGACY_IDS)};
          Game.coop = false; Game.daily = false; Game.endless = false;
          Game.manualSeed = 0x1e35; Game.sel = ['leonidas']; Game.danger = 0;
          Game.state = 'title'; Game.mods = [];
          Save.data.startItem = ''; Save.data.startTier = 0;
          Game.startRun();
          const p = Game.players[0];
          p.items = []; p.itemCounts = {}; p.curse = 0; p.turrets = []; p.buffs = []; p.recalc();
          Game.state = 'shop'; Game.materials = 999999; UI.shopPlayer = 0;
          const missing = IDS.filter(function(id){ return !ITEM_BY_ID[id]; });

          let natural = null;
          for (let attempt = 0; attempt < 12 && !natural; attempt++) {
            ShopSystem.generate(20, [p]);
            const idx = ShopSystem.offers.findIndex(function(o){ return o.kind === 'item' && IDS.indexOf(o.id) >= 0; });
            if (idx >= 0) natural = { idx: idx, id: ShopSystem.offers[idx].id, price: ShopSystem.offers[idx].price, attempt: attempt };
          }
          let naturalCard = false, naturalApplied = false, naturalDeltas = null;
          if (natural) {
            UI.renderShop();
            const before = Object.assign({}, p.st);
            const card = document.querySelectorAll('#shopItems .item')[natural.idx];
            naturalCard = !!card;
            if (card) {
              card.click();
              const it = ITEM_BY_ID[natural.id];
              naturalDeltas = Object.keys(it.stats || {}).map(function(k){ return [k, (p.st[k] || 0) - (before[k] || 0)]; });
              naturalApplied = p.itemCounts[natural.id] === 1;
            }
          }

          p.items = []; p.itemCounts = {}; p.curse = 0; p.turrets = []; p.buffs = []; p.recalc();
          Game.materials = 999999;
          const failures = [];
          for (let n = 0; n < IDS.length; n++) {
            const id = IDS[n], it = ITEM_BY_ID[id];
            if (!it) { failures.push({ id: id, missing: true }); continue; }
            const thornsBefore = p.items.reduce(function(a, x){ return a + (((ITEM_BY_ID[x] || {}).thorns) || 0); }, 0);
            const before = { st: Object.assign({}, p.st), curse: p.curse || 0, turrets: p.turrets.length, thorns: thornsBefore };
            ShopSystem.offers = [{ kind: 'item', id: id, price: 1 }];
            ShopSystem.bought = {}; ShopSystem.locked = {}; ShopSystem.attachTarget = -1;
            UI.renderShop();
            const card = document.querySelectorAll('#shopItems .item')[0];
            if (!card) { failures.push({ id: id, noCard: true }); continue; }
            card.click();
            const deltas = Object.keys(it.stats || {}).map(function(k){ return [(p.st[k] || 0) - (before.st[k] || 0), it.stats[k]]; });
            const statOk = deltas.every(function(d){ return Math.abs(d[0] - d[1]) < 1e-6; });
            const thornsAfter = p.items.reduce(function(a, x){ return a + (((ITEM_BY_ID[x] || {}).thorns) || 0); }, 0);
            const curseOk = !it.cursed || ((p.curse || 0) - before.curse === it.curse);
            const turretOk = !it.turret || (p.turrets.length - before.turrets === 1);
            const thornsOk = !it.thorns || (thornsAfter - before.thorns === it.thorns);
            const bought = p.itemCounts[id] === 1;
            if (!(bought && statOk && curseOk && turretOk && thornsOk))
              failures.push({ id: id, bought: bought, statOk: statOk, curseOk: curseOk, turretOk: turretOk, thornsOk: thornsOk, deltas: deltas });
          }
          /* Natural reach: no forced offers here. Sample generated shops at
             early, mid and late wave so every rarity window is exercised; the
             shop's own rarity roll and ITEMS filter must surface all 47. */
          p.items = []; p.itemCounts = {}; p.curse = 0; p.turrets = []; p.buffs = []; p.recalc();
          const seen = {};
          for (const wave of [1, 10, 20]) {
            for (let n = 0; n < 1000; n++) {
              ShopSystem.generate(wave, [p]);
              for (const o of ShopSystem.offers) if (o.kind === 'item' && IDS.indexOf(o.id) >= 0) seen[o.id] = 1;
            }
          }
          const unseen = IDS.filter(function(id){ return !seen[id]; });
          return JSON.stringify({ total: ITEMS.length, missing: missing, natural: natural, naturalCard: naturalCard,
            naturalApplied: naturalApplied, naturalDeltas: naturalDeltas, naturalSeen: IDS.length - unseen.length,
            naturalUnseen: unseen, failureCount: failures.length, failures: failures.slice(0, 8) });
        })()`;
        const raw = await ev(probe, 60000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        if (r && r.total === 125) pass('Item pool live: 125 items visible in the running engine');
        else fail('Item pool live count', r ? JSON.stringify({ total: r.total }) : String(raw).slice(0, 180));
        if (r && r.missing && r.missing.length === 0) pass('Item pool live: all 47 new ids resolve to item definitions');
        else fail('Item pool live ids', r ? JSON.stringify({ missing: r.missing }) : String(raw).slice(0, 180));
        if (r && r.natural && r.naturalCard && r.naturalApplied && r.naturalDeltas && r.naturalDeltas.some(function(d){ return d[1] !== 0; }))
          pass('Item pool live: wave-20 shop rolled ' + r.natural.id + ' and the real card click applied its stats');
        else fail('Item pool live natural shop', r ? JSON.stringify({ natural: r.natural, card: r.naturalCard, applied: r.naturalApplied, deltas: r.naturalDeltas }) : String(raw).slice(0, 180));
        if (r && r.naturalSeen === 47)
          pass('Item pool live: 3,000 generated shops (waves 1/10/20) exposed all 47 new items');
        else fail('Item pool live natural reach', r ? JSON.stringify({ seen: r.naturalSeen, unseen: r.naturalUnseen }) : String(raw).slice(0, 180));
        if (r && r.failureCount === 0)
          pass('Item pool live: all 47 new items bought through #shopItems apply stats, curse, turret and thorns exactly');
        else fail('Item pool live effects', r ? JSON.stringify({ count: r.failureCount, failures: r.failures }) : String(raw).slice(0, 220));
      } catch (e) {
        fail('Item pool live leg', String(e && e.message ? e.message : e));
      }
    }

    // ---- Curse: risk/reward through the real shop and combat ----
    // Cursed items used to be cosmetic stat bundles. This leg starts a clean
    // run, reaches the shop through the production wave-end path, buys the
    // guaranteed first cursed offer, and proves all four effects: the curse
    // meter, enemy HP/loot, incoming damage, and the HUD/shop readout.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=curse' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof ShopSystem === 'object' && typeof ITEM_BY_ID === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = String.raw`(function(){
          Game.coop = false; Game.daily = false; Game.endless = false;
          Game.manualSeed = 0x51ee; Game.sel = ['leonidas']; Game.danger = 0;
          Game.state = 'title'; Game.mods = [];
          Save.data.startItem = ''; Save.data.startTier = 0;
          Game.startRun();
          const p = Game.players[0];
          p.items = []; p.itemCounts = {}; p.evolutions = []; p.relics = []; p.buffs = []; p.curse = 0;
          p.weapons.length = 0; p.recalc();
          p.pendingLevels = 0; Game.levelQueue = []; Game.relicQueue = [];
          Game.wave = 5; Game.waveEnding = false; Game.wager = null; Game.waveEvent = null;
          Game.state = 'play';
          Game.endWave();
          const natural = { cur: UI.cur, state: Game.state };
          UI.renderShop();
          Game.materials = 9999;
          p.curse = 0;

          const baseEnemy = new Enemy();
          baseEnemy.spawn(ENEMY_BY_ID.walker, 80, 80, Game.wave, null);
          const baseHp = baseEnemy.maxHp, baseMat = baseEnemy.mat;
          p.maxHp = 1000; p.hp = 1000; p.st.armor = 0; p.st.dodge = 0;
          p.invuln = 0; p.perfectT = 0; p.alive = true; Game.qaGod = false;
          Game.state = 'play';
          p.damage(100, 0);
          const baseTaken = 1000 - p.hp;
          Game.state = 'shop';

          const offers = ShopSystem.offers.map(function(o){ return { kind: o.kind, id: o.id }; });
          const idx = ShopSystem.offers.findIndex(function(o){ return o.kind === 'item' && ITEM_BY_ID[o.id] && ITEM_BY_ID[o.id].cursed; });
          const offer = idx >= 0 ? ShopSystem.offers[idx] : null;
          const item = offer ? ITEM_BY_ID[offer.id] : null;
          const shopBefore = document.getElementById('shopWave').textContent;
          const luckBefore = ShopSystem.shopLuck([p]);
          const matBefore = Game.materials;
          let bought = null;
          if (offer) {
            ShopSystem.buy(idx, p);
            bought = { price: offer.price, id: offer.id, curse: item.curse };
          }
          const matAfter = Game.materials;
          const curse = p.curse || 0;
          const level = Game.curseLevel();
          const hpMult = Game.curseHpMult();
          const dmgMult = Game.curseDamageMult();
          const luckBonus = Game.curseLuckBonus();
          const luckAfter = ShopSystem.shopLuck([p]);
          const flat = Game.curseMatFlat();

          const afterEnemy = new Enemy();
          afterEnemy.spawn(ENEMY_BY_ID.walker, 80, 80, Game.wave, null);
          const afterHp = afterEnemy.maxHp, afterMat = afterEnemy.mat;
          p.maxHp = 1000; p.hp = 1000; p.st.armor = 0; p.st.dodge = 0;
          p.invuln = 0; p.perfectT = 0; p.alive = true;
          Game.state = 'play'; Game.qaGod = false;
          p.damage(100, 0);
          const curseTaken = 1000 - p.hp;

          Game.state = 'shop'; UI.show('scShop'); UI.renderShop(); UI.renderHud();
          const shopAfter = document.getElementById('shopWave').textContent;
          const shopCardText = document.getElementById('shopItems').innerText;
          const invText = document.getElementById('invStats').innerText;
          const hudText = document.getElementById('hudArena').textContent;
          const hudTitle = document.getElementById('hudArena').title;
          const shopTitle = document.getElementById('shopWave').title;
          const trackCursed = Game.run && Game.run.track ? Game.run.track.cursed : -1;
          return JSON.stringify({ natural: natural, offers: offers, offer: offer,
            item: item ? { id: item.id, name: item.name, curse: item.curse, cursed: !!item.cursed } : null,
            shopBefore: shopBefore, matBefore: matBefore, matAfter: matAfter, bought: bought,
            curse: curse, level: level, baseHp: baseHp, afterHp: afterHp,
            baseMat: baseMat, afterMat: afterMat, baseTaken: baseTaken, curseTaken: curseTaken,
            hpMult: hpMult, dmgMult: dmgMult, luckBefore: luckBefore, luckAfter: luckAfter,
            luckBonus: luckBonus, flat: flat, shopAfter: shopAfter,
            shopCardText: shopCardText.slice(0, 900), invText: invText.slice(0, 500),
            hudText: hudText, hudTitle: hudTitle, shopTitle: shopTitle, trackCursed: trackCursed });
        })()`;
        const raw = await ev(probe, 30000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        if (r && r.natural && r.natural.cur === 'scShop' && r.natural.state === 'shop')
          pass('Curse live: wave end opens the shop naturally');
        else fail('Curse live shop transition', r ? JSON.stringify(r.natural) : String(raw).slice(0, 180));
        if (r && r.offer && r.item && r.item.cursed === true && r.item.curse >= 5)
          pass('Curse live: shop guarantees a cursed offer (' + r.item.name + ' +' + r.item.curse + ')');
        else fail('Curse live cursed offer', r ? JSON.stringify({ offer: r.offer, item: r.item, offers: r.offers }) : String(raw).slice(0, 180));
        if (r && r.bought && r.curse === r.item.curse && r.level === r.curse)
          pass('Curse live: buying raises the run curse ' + r.curse + ' and Game.curseLevel() agrees');
        else fail('Curse live acquisition', r ? JSON.stringify({ bought: r.bought, curse: r.curse, level: r.level }) : String(raw).slice(0, 180));
        if (r && r.matAfter === r.matBefore - r.bought.price)
          pass('Curse live: shop price ' + r.bought.price + ' deducted (' + r.matBefore + ' -> ' + r.matAfter + ')');
        else fail('Curse live price', r ? JSON.stringify({ before: r.matBefore, after: r.matAfter, bought: r.bought }) : String(raw).slice(0, 180));
        if (r && r.afterHp > r.baseHp && Math.abs(r.afterHp / r.baseHp - r.hpMult) < 1e-6)
          pass('Curse live: enemy HP ' + r.baseHp.toFixed(1) + ' -> ' + r.afterHp.toFixed(1) + ' (x' + r.hpMult.toFixed(3) + ')');
        else fail('Curse live enemy HP', r ? JSON.stringify({ base: r.baseHp, after: r.afterHp, mult: r.hpMult }) : String(raw).slice(0, 180));
        if (r && r.afterMat > r.baseMat && r.afterMat - r.baseMat === r.flat && r.flat >= 1)
          pass('Curse live: loot ' + r.baseMat + ' -> ' + r.afterMat + ' material per kill');
        else fail('Curse live loot', r ? JSON.stringify({ base: r.baseMat, after: r.afterMat, flat: r.flat }) : String(raw).slice(0, 180));
        if (r && r.baseTaken === 100 && Math.abs(r.curseTaken - 100 * r.dmgMult) < 1e-6 && r.curseTaken > r.baseTaken)
          pass('Curse live: incoming damage ' + r.baseTaken + ' -> ' + r.curseTaken + ' (x' + r.dmgMult.toFixed(3) + ')');
        else fail('Curse live incoming damage', r ? JSON.stringify({ base: r.baseTaken, after: r.curseTaken, mult: r.dmgMult }) : String(raw).slice(0, 180));
        if (r && r.luckAfter > r.luckBefore && r.luckBonus >= r.curse * 1.4)
          pass('Curse live: shop luck ' + r.luckBefore.toFixed(1) + ' -> ' + r.luckAfter.toFixed(1) + ' (curse bonus +' + r.luckBonus.toFixed(1) + ')');
        else fail('Curse live shop luck', r ? JSON.stringify({ before: r.luckBefore, after: r.luckAfter, bonus: r.luckBonus }) : String(raw).slice(0, 180));
        const cursedCardUi = ((r && r.shopCardText) || '').toUpperCase();
        if (r && r.shopAfter.indexOf('Fluch') >= 0 && cursedCardUi.indexOf('FLUCH +') >= 0 && cursedCardUi.indexOf('VERFLUCHT') >= 0 && r.invText.indexOf('Fluch') >= 0)
          pass('Curse live: shop header, cursed card tag, and inventory readout rendered');
        else fail('Curse live shop UI', r ? JSON.stringify({ header: r.shopAfter, card: r.shopCardText, inv: r.invText }) : String(raw).slice(0, 180));
        if (r && r.hudText.indexOf('FLUCH') >= 0 && r.hudTitle.indexOf('Fluch') >= 0 && r.shopTitle.indexOf('Fluch') >= 0)
          pass('Curse live: HUD and shop expose the live curse effects');
        else fail('Curse live HUD', r ? JSON.stringify({ hud: r.hudText, hudTitle: r.hudTitle, shopTitle: r.shopTitle }) : String(raw).slice(0, 180));
      } catch (e) {
        fail('Curse live leg', String(e && e.message ? e.message : e));
      }
    }

    // ---- Auto-Pause: preserve the open menu ----
    // Alt-tab/blur must pause the engine without replacing an already open
    // menu. The real flow is pause -> options; the forced play-state case
    // pins the guard contract so a future play-state menu cannot lose its
    // screen to the pause overlay.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=autopause' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof UI === 'object' && typeof Input === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = String.raw`(function(){
          const snap = function(){ return {
            state: Game.state, cur: UI.cur, stack: UI.stack.slice(),
            shown: UI.screens.filter(function(s){ return !document.getElementById(s).classList.contains('hidden'); })
          }; };
          const fire = function(){
            Object.defineProperty(document, 'hidden', { configurable: true, get: function(){ return true; } });
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('blur'));
          };
          OPT().tutorial = false; OPT().autoPause = true;
          Game.coop = false; Game.daily = false; Game.endless = false;
          Game.manualSeed = 0x51ee; Game.sel = ['leonidas']; Game.danger = 0;
          Game.state = 'title'; Game.mods = [];
          Game.startRun();
          Game.qaGod = true; Game.waveTimer = 999; Game.waveDuration = 999;
          Game.waveEnding = false; Game.enemies.length = 0;
          if (Game.enemyPool) Game.enemyPool.length = 0;
          const k = Input.key('pause');
          Input.pressed[k] = true; Game.handleGlobalInput(); Input.pressed[k] = false;
          const open = document.querySelector('#scPause [data-act="pauseOptions"]');
          if (!open) return JSON.stringify({ error: 'pause/options button missing', state: snap() });
          open.click();
          const options = snap();
          fire();
          const afterBlur = snap();
          Game.state = 'play';
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event('blur'));
          const afterPlayBlur = snap();
          UI.back('scPause');
          Game.state = 'play'; UI.show(null);
          window.dispatchEvent(new Event('blur'));
          const baseline = snap();
          try { delete document.hidden; } catch (e) {}
          return JSON.stringify({ options: options, afterBlur: afterBlur, afterPlayBlur: afterPlayBlur, baseline: baseline });
        })()`;
        const raw = await ev(probe, 15000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        const one = (s, id) => !!(s && s.cur === id && s.shown.length === 1 && s.shown[0] === id);
        if (r && r.options && r.options.state === 'paused' && one(r.options, 'scOptions') &&
            r.options.stack.join('|') === 'scPause|scOptions' &&
            r.afterBlur && r.afterBlur.state === 'paused' && one(r.afterBlur, 'scOptions') &&
            r.afterBlur.stack.join('|') === 'scPause|scOptions')
          pass('Auto-Pause: hidden/blur keeps the options screen over pause');
        else fail('Auto-Pause options preservation', r ? JSON.stringify({ options: r.options, afterBlur: r.afterBlur }) : String(raw).slice(0, 200));
        if (r && r.afterPlayBlur && r.afterPlayBlur.state === 'paused' && one(r.afterPlayBlur, 'scOptions') &&
            r.afterPlayBlur.stack.join('|') === 'scPause|scOptions')
          pass('Auto-Pause: open menu survives play-state auto-pause');
        else fail('Auto-Pause open-menu contract', r ? JSON.stringify({ afterPlayBlur: r.afterPlayBlur }) : String(raw).slice(0, 200));
        if (r && r.baseline && r.baseline.state === 'paused' && one(r.baseline, 'scPause') && r.baseline.stack.join('|') === 'scPause')
          pass('Auto-Pause: no open menu still opens the pause screen');
        else fail('Auto-Pause baseline', r ? JSON.stringify({ baseline: r.baseline }) : String(raw).slice(0, 200));
      } catch (e) {
        fail('Auto-Pause leg', String(e && e.message ? e.message : e));
      }
    }

    // ---- Menu stack depth: nested push/back must not flatten ----
    // The stack contract has three distinct operations: _display() renders,
    // show() resets the root, and push()/back() move one level. A refactor
    // that routes push through show() would still render the right screen but
    // silently lose the return path. This leg walks a real three-deep chain
    // (title -> options -> tuning), pops it with Esc and with real buttons,
    // re-opens it, and asserts the exact stack and visible-screen set at every
    // step. It is depth-focused on purpose; the Auto-Pause leg already covers
    // pause -> options preservation.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=stack' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof UI === 'object' && typeof Game === 'object' && typeof Input === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = String.raw`(function(){
          const snap = function(){ return {
            cur: UI.cur, depth: UI.stack.length, coop: Game.coop, charSelIdx: Game.charSelIdx, stack: UI.stack.slice(),
            shown: UI.screens.filter(function(s){ return !document.getElementById(s).classList.contains('hidden'); })
          }; };
          const click = function(sel){
            const el = document.querySelector(sel);
            if (!el) throw new Error('missing ' + sel);
            el.click();
            return snap();
          };
          const esc = function(){
            const k = Input.key('pause');
            Input.pressed[k] = true;
            Game.handleGlobalInput();
            Input.pressed[k] = false;
            return snap();
          };
          OPT().tutorial = false;
          Game.coop = false; Game.daily = false; Game.endless = false;
          Game.state = 'title'; Game.mods = [];
          UI.renderTitle(); UI.show('scTitle');
          const start = snap();
          const options = click('#scTitle [data-act="options"]');
          const tune = click('#scOptions [data-act="openTune"]');
          const escBack = esc();
          const tuneAgain = click('#scOptions [data-act="openTune"]');
          const tuneBack = click('#scTune [data-act="tuneBack"]');
          const title = click('#scOptions [data-act="optBack"]');
          /* Koop: Spieler 1 waehlt, bestaetigt, Spieler 2 waehlt. Der Wechsel
             P1->P2 ist kein Bildschirmwechsel (Tiefe bleibt 2); erst der
             Zurueck-Weg von Spieler 1 poppt die Figurenwahl vom Titel. */
          const coop = click('#scTitle [data-act="coop"]');
          const coopP2 = click('#scChar [data-act="charConfirm"]');
          const coopBackP2 = click('#scChar [data-act="charBack"]');
          const coopBackP1 = click('#scChar [data-act="charBack"]');
          return JSON.stringify({ start: start, options: options, tune: tune,
            escBack: escBack, tuneAgain: tuneAgain, tuneBack: tuneBack, title: title,
            coop: coop, coopP2: coopP2, coopBackP2: coopBackP2, coopBackP1: coopBackP1 });
        })()`;
        const raw = await ev(probe, 15000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        const exact = (s, cur, stack) => !!(s && s.cur === cur && s.depth === stack.length && s.stack.length === stack.length &&
          s.stack.every((id, i) => id === stack[i]) &&
          s.shown.length === 1 && s.shown[0] === cur);
        if (r && exact(r.start, 'scTitle', ['scTitle']))
          pass('Stack depth: title root is depth 1 with exactly one visible screen');
        else fail('Stack depth root', r ? JSON.stringify(r.start) : String(raw).slice(0, 180));
        if (r && exact(r.options, 'scOptions', ['scTitle', 'scOptions']))
          pass('Stack depth: title -> options pushes to depth 2');
        else fail('Stack depth options', r ? JSON.stringify(r.options) : String(raw).slice(0, 180));
        if (r && exact(r.tune, 'scTune', ['scTitle', 'scOptions', 'scTune']))
          pass('Stack depth: options -> tuning pushes to depth 3');
        else fail('Stack depth tuning', r ? JSON.stringify(r.tune) : String(raw).slice(0, 180));
        if (r && exact(r.escBack, 'scOptions', ['scTitle', 'scOptions']))
          pass('Stack depth: Esc pops tuning one level back to options (depth 2)');
        else fail('Stack depth Esc pop', r ? JSON.stringify(r.escBack) : String(raw).slice(0, 180));
        if (r && exact(r.tuneAgain, 'scTune', ['scTitle', 'scOptions', 'scTune']))
          pass('Stack depth: re-opening tuning after a pop stacks to depth 3 again');
        else fail('Stack depth re-push', r ? JSON.stringify(r.tuneAgain) : String(raw).slice(0, 180));
        if (r && exact(r.tuneBack, 'scOptions', ['scTitle', 'scOptions']))
          pass('Stack depth: tuning back pops one level to options (depth 2)');
        else fail('Stack depth tuning back', r ? JSON.stringify(r.tuneBack) : String(raw).slice(0, 180));
        if (r && exact(r.title, 'scTitle', ['scTitle']))
          pass('Stack depth: options back pops to the title root (depth 1)');
        else fail('Stack depth title back', r ? JSON.stringify(r.title) : String(raw).slice(0, 180));
        if (r && exact(r.coop, 'scChar', ['scTitle', 'scChar']) && r.coop.coop === true && r.coop.charSelIdx === 0)
          pass('Stack depth: co-op opens player 1 selection at depth 2');
        else fail('Stack depth co-op entry', r ? JSON.stringify(r.coop) : String(raw).slice(0, 180));
        if (r && exact(r.coopP2, 'scChar', ['scTitle', 'scChar']) && r.coopP2.charSelIdx === 1)
          pass('Stack depth: confirming player 1 shows player 2 without changing depth (still 2)');
        else fail('Stack depth co-op player 2', r ? JSON.stringify(r.coopP2) : String(raw).slice(0, 180));
        if (r && exact(r.coopBackP2, 'scChar', ['scTitle', 'scChar']) && r.coopBackP2.charSelIdx === 0)
          pass('Stack depth: player 2 back returns to player 1 at depth 2');
        else fail('Stack depth co-op player 2 back', r ? JSON.stringify(r.coopBackP2) : String(raw).slice(0, 180));
        if (r && exact(r.coopBackP1, 'scTitle', ['scTitle']))
          pass('Stack depth: player 1 back pops the co-op character screen to the title root (depth 1)');
        else fail('Stack depth co-op player 1 back', r ? JSON.stringify(r.coopBackP1) : String(raw).slice(0, 180));
      } catch (e) {
        fail('Stack depth leg', String(e && e.message ? e.message : e));
      }
    }

    // ---- AI-Band reversal regression ----
    // The 2026-11-08 AI audit found Siren/Summoner/Bomber reversing 14-52x/s
    // at a hard distance threshold. This leg spawns one of every enemy type
    // around a stationary player, records genuine direction reversals
    // (dot < 0, both steps > 25 px/s, distance >= 80 px), and buckets them per
    // type into 12 px distance bands. A type fails when one narrow band holds
    // >= 8 reversals and its rate exceeds 3/s. Melee/contact reversals are
    // excluded by the 80 px floor; normal orbits spread across several bands.
    {
      try {
        await nav(site + '/index.html?qa=1&cb=aiband' + Date.now());
        for (let i = 0; i < 40; i++) {
          if (await ev("typeof Game === 'object' && typeof Enemy === 'function' && typeof ENEMIES === 'object'", 10000)) break;
          await new Promise(res => setTimeout(res, 300));
        }
        const probe = String.raw`(function(){
          if (window.__ab && window.__ab.done) return JSON.stringify(window.__ab.result || {error:'probe already done'});
          const TAU = Math.PI * 2;
          Game.coop = false; Game.daily = false; Game.endless = false;
          Game.manualSeed = 0x51ee; Game.sel = ['leonidas']; Game.danger = 0;
          Game.state = 'title'; Game.mods = [];
          Game.startRun();
          const p = Game.players[0];
          p.items = []; p.itemCounts = {}; p.evolutions = []; p.relics = []; p.buffs = [];
          p.weapons.length = 0; if (p.turrets) p.turrets.length = 0; if (p.pet) p.pet = null;
          p.recalc();
          p.x = Game.level.w / 2; p.y = Game.level.h / 2; p.hp = p.maxHp;
          Game.qaGod = true; Game.state = 'play'; Game.wave = 20; Game.waveEnding = false;
          Game.wager = null; Game.waveEvent = null; Game.arenaMod = null;
          Game.waveTimer = 999; Game.waveDuration = 999; Game.spawnQueue = []; Game.spawnAcc = 0;
          Game.enemies.length = 0; Game.enemyPool.length = 0;
          if (Game.enemyBullets) Game.enemyBullets.length = 0;
          if (typeof Projectiles !== 'undefined' && Projectiles.clear) Projectiles.clear();
          if (typeof EnemyBullets !== 'undefined' && EnemyBullets.clear) EnemyBullets.clear();
          if (Game.level && Game.level.hazards) Game.level.hazards.length = 0;
          const S = window.__ab = { by: {}, done: false };
          const orig = Enemy.prototype.update;
          Enemy.prototype.update = function(dt) {
            if (!(dt > 0) || S.done) return orig.call(this, dt);
            const st = this.__abS || (this.__abS = { pdx: 0, pdy: 0, ps: 0, pd: 0 });
            const x0 = this.x, y0 = this.y;
            const beforeD = this.target ? Math.hypot(this.target.x - x0, this.target.y - y0) : 0;
            orig.call(this, dt);
            if (this.dead) return;
            const dx = this.x - x0, dy = this.y - y0, moved = Math.hypot(dx, dy), speed = moved / Math.max(1e-6, dt);
            const d = this.target ? Math.hypot(this.target.x - this.x, this.target.y - this.y) : 0;
            const type = this.boss ? ('boss:' + ((this.boss && this.boss.name) || '?')) : ((this.def && (this.def.id || this.def.name)) || '?');
            const b = S.by[type] || (S.by[type] = { rev: [], t: 0 });
            b.t += dt;
            const locked = this.stun > 0 || this.freezeT > 0 || this.spawnScale < .5 ||
              this.state === 'latch' || this.state === 'charge' || this.state === 'slam' ||
              this.state === 'aim' || this.railT > 0 || this.introHold > 0;
            if (!locked && st.ps > 25 && speed > 25 && beforeD >= 80 && d >= 80 && (dx * st.pdx + dy * st.pdy) < 0) b.rev.push(+d.toFixed(2));
            if (locked || moved <= .2 || speed < 1) { st.ps = 0; st.pd = d; }
            else { st.pdx = dx; st.pdy = dy; st.ps = speed; st.pd = d; }
          };
          const px = p.x, py = p.y;
          let spawned = 0;
          for (let i = 0; i < ENEMIES.length; i++) {
            const def = ENEMIES[i];
            let pt = null;
            for (let k = 0; k < 24; k++) {
              const a = (i / ENEMIES.length) * TAU + k * .618;
              const x = px + Math.cos(a) * 260, y = py + Math.sin(a) * 260;
              if (x < 50 || x > Game.level.w - 50 || y < 50 || y > Game.level.h - 50) continue;
              if (!Game.level.losClear(px, py, x, y)) continue;
              pt = { x: x, y: y }; break;
            }
            if (!pt) pt = { x: px + Math.cos(i / ENEMIES.length * TAU) * 230, y: py + Math.sin(i / ENEMIES.length * TAU) * 230 };
            const e = Game.spawnEnemyAt(def, pt.x, pt.y);
            if (e) { e.spawnScale = 1; e.keepDir = 0; spawned++; }
          }
          for (let i = 0; i < 360; i++) {
            p.x = px; p.y = py; p.vx = 0; p.vy = 0; p.hp = p.maxHp;
            Game.update(1 / 60);
            p.x = px; p.y = py; p.vx = 0; p.vy = 0;
          }
          S.done = true;
          /* Mehrere Heiler-Wandfälle in einem deterministischen Lauf. Die
             Außenkanten messen nur die echte Level-Grenze; der Innenwandfall
             isoliert eine vorhandene Wand; die dichte Welle setzt 32 Gegner um
             den Heiler. Jeder Fall misst Pin-Zeit und Wandabstand ab Sekunde 1. */
          const healerR = ENEMY_BY_ID['healer'].r || 13;
          const originalWalls = Game.level.walls.slice();
          const originalMoving = Game.level.moving.slice();
          function setWalls(walls, moving) {
            Game.level.walls = walls || [];
            Game.level.moving = moving || [];
            Game.level._wallsDirty = true;
            Game.level._wallBuf = null;
            Game.level._flowDirty = true;
          }
          function clearFight() {
            Game.enemies.length = 0;
            if (Game.enemyBullets) Game.enemyBullets.length = 0;
            if (typeof Projectiles !== 'undefined' && Projectiles.clear) Projectiles.clear();
            if (typeof EnemyBullets !== 'undefined' && EnemyBullets.clear) EnemyBullets.clear();
            if (Game.level && Game.level.hazards) Game.level.hazards.length = 0;
          }
          function wallGap(e) {
            const L = Game.level, r = e.r;
            let g = Math.min(e.x - r, e.y - r, L.w - r - e.x, L.h - r - e.y);
            for (const w of L.allWalls()) {
              const nx = clamp(e.x, w.x, w.x + w.w), ny = clamp(e.y, w.y, w.y + w.h);
              const d = Math.hypot(e.x - nx, e.y - ny) - r;
              if (d < g) g = d;
            }
            return g;
          }
          function runHealerCase(id, hx, hy, px, py, crowd, frames) {
            clearFight();
            p.x = px; p.y = py; p.vx = 0; p.vy = 0; p.hp = p.maxHp;
            const e = Game.spawnEnemyAt(ENEMY_BY_ID['healer'], hx, hy);
            if (!e) return { id: id, error: 'healer not spawned' };
            e.spawnScale = 1; e.wallT = 0; e.wallNx = 0; e.wallNy = 0;
            let crowdN = 0;
            if (crowd) {
              const kinds = ['runner', 'walker', 'swarm', 'tank', 'runner', 'walker',
                'swarm', 'flyer', 'vampire', 'weaver'];
              for (let i = 0; i < crowd; i++) {
                const a = i * 2.399963229728653;
                const rr = 18 + (i % 7) * 9;
                const x = clamp(hx + Math.cos(a) * rr, 30, Game.level.w - 30);
                const y = clamp(hy + Math.sin(a) * rr, 30, Game.level.h - 30);
                const c = Game.spawnEnemyAt(ENEMY_BY_ID[kinds[i % kinds.length]], x, y);
                if (c) { c.spawnScale = 1; crowdN++; }
              }
            }
            let pinned = 0, minGap = 1e9, last = 0;
            for (let i = 0; i < frames; i++) {
              p.x = px; p.y = py; p.vx = 0; p.vy = 0; p.hp = p.maxHp;
              Game.update(1 / 60);
              p.x = px; p.y = py; p.vx = 0; p.vy = 0;
              if (e.dead) break;
              const g = wallGap(e);
              if (g < 1.5) pinned += 1 / 60;
              if (i >= 60) minGap = Math.min(minGap, g);
              last = g;
            }
            return { id: id, seconds: +(frames / 60).toFixed(2), crowd: crowdN,
              pinned: +pinned.toFixed(2), minGap: +minGap.toFixed(1), finalGap: +last.toFixed(1),
              x: Math.round(e.x), y: Math.round(e.y), alive: !e.dead, r: e.r };
          }
          const cases = [];
          setWalls([], []);
          cases.push(runHealerCase('right', Game.level.w - healerR - 3, Game.level.h / 2,
            Game.level.w - healerR - 283, Game.level.h / 2, 0, 240));
          cases.push(runHealerCase('left', healerR + 3, Game.level.h / 2,
            healerR + 283, Game.level.h / 2, 0, 240));
          cases.push(runHealerCase('top', Game.level.w / 2, healerR + 3,
            Game.level.w / 2, healerR + 283, 0, 240));
          cases.push(runHealerCase('bottom', Game.level.w / 2, Game.level.h - healerR - 3,
            Game.level.w / 2, Game.level.h - healerR - 283, 0, 240));
          /* Echte Innenwand: Heiler dicht an einer Seite, Spieler auf derselben
             Seite weiter außen, damit die Flucht direkt in die Wand zeigt. */
          let inner = { id: 'inner', error: 'no usable inner wall' };
          const candidates = originalWalls.filter(function(w) { return w.w >= 40 && w.h >= 40; });
          let picked = null;
          for (const w of candidates) {
            const sides = [
              { side: 'left', hx: w.x - healerR - 3, hy: w.y + w.h / 2, px: w.x - healerR - 283, py: w.y + w.h / 2 },
              { side: 'right', hx: w.x + w.w + healerR + 3, hy: w.y + w.h / 2, px: w.x + w.w + healerR + 283, py: w.y + w.h / 2 },
              { side: 'top', hx: w.x + w.w / 2, hy: w.y - healerR - 3, px: w.x + w.w / 2, py: w.y - healerR - 283 },
              { side: 'bottom', hx: w.x + w.w / 2, hy: w.y + w.h + healerR + 3, px: w.x + w.w / 2, py: w.y + w.h + healerR + 283 }
            ];
            for (const side of sides) {
              if (side.hx < 100 || side.hx > Game.level.w - 100 || side.hy < 100 || side.hy > Game.level.h - 100) continue;
              if (side.px < 70 || side.px > Game.level.w - 70 || side.py < 70 || side.py > Game.level.h - 70) continue;
              if (Game.level.blocksRay(side.hx, side.hy) || Game.level.blocksRay(side.px, side.py)) continue;
              picked = { wall: w, side: side }; break;
            }
            if (picked) break;
          }
          if (picked) {
            setWalls([picked.wall], []);
            inner = runHealerCase('inner', picked.side.hx, picked.side.hy, picked.side.px, picked.side.py, 0, 240);
            inner.wall = { x: Math.round(picked.wall.x), y: Math.round(picked.wall.y),
              w: Math.round(picked.wall.w), h: Math.round(picked.wall.h), side: picked.side.side };
          }
          cases.push(inner);
          setWalls([], []);
          cases.push(runHealerCase('dense', Game.level.w - healerR - 3, Game.level.h / 2,
            Game.level.w - healerR - 283, Game.level.h / 2, 48, 360));
          setWalls(originalWalls, originalMoving);
          function dense(ds) {
            const a = ds.slice().sort(function(x, y) { return x - y; });
            let best = { n: 0, lo: 0, hi: 0 };
            for (let i = 0, j = 0; i < a.length; i++) {
              while (a[i] - a[j] > 12) j++;
              const n = i - j + 1;
              if (n > best.n) best = { n: n, lo: a[j], hi: a[i] };
            }
            return best;
          }
          const types = Object.keys(S.by).map(function(k) {
            const b = S.by[k], band = dense(b.rev);
            return { type: k, seconds: +b.t.toFixed(2), rev: b.rev.length, band: band, rate: +(band.n / Math.max(.001, b.t)).toFixed(2), share: +(band.n / Math.max(1, b.rev.length)).toFixed(2) };
          }).filter(function(x) { return x.seconds >= 2; }).sort(function(a, b) { return b.rate - a.rate; });
          S.result = { spawned: spawned, expected: ENEMIES.length, types: types, bad: types.filter(function(x) { return x.band.n >= 8 && x.rate > 3; }), elapsed: 6, healerScenarios: cases };
          return JSON.stringify(S.result);
        })()`;
        const raw = await ev(probe, 30000);
        let r = null;
        try { r = JSON.parse(raw); } catch { r = null; }
        if (!r) fail('AI-Band probe', String(raw).slice(0, 220));
        else if (r.error) fail('AI-Band setup', r.error);
        else if (r.bad && r.bad.length) {
          const b = r.bad[0];
          fail('AI-Band: threshold jitter', b.type + ' reverses ' + b.band.n + 'x in ' + b.band.lo + '..' + b.band.hi + ' px = ' + b.rate.toFixed(2) + '/s (limit 3/s, ' + b.seconds + 's, ' + b.rev + ' total) — ' + JSON.stringify(r.bad.slice(0, 3)));
        } else if (!r.types || r.types.length < 20 || r.spawned !== r.expected) {
          fail('AI-Band coverage', 'only ' + (r.types ? r.types.length : 0) + ' types, ' + r.spawned + '/' + r.expected + ' spawned');
        } else {
          const worst = r.types.slice().sort(function(a, b) { return b.rate - a.rate; })[0];
          pass('AI-Band: no enemy type > 3 reversals/s in a 12 px band (worst ' + worst.type + ' ' + worst.band.n + 'x/' + worst.seconds + 's = ' + worst.rate.toFixed(2) + '/s at ' + worst.band.lo + '..' + worst.band.hi + ' px)');
        }
        const wallLabels = { right: 'right edge', left: 'left edge', top: 'top edge', bottom: 'bottom edge', inner: 'inner wall', dense: 'dense wave' };
        const wallScenarios = (r && r.healerScenarios) || [];
        for (const id of ['right', 'left', 'top', 'bottom', 'inner', 'dense']) {
          const h = wallScenarios.find(function(x) { return x.id === id; });
          const label = wallLabels[id];
          if (!h) fail('AI-Wall: ' + label, 'scenario missing');
          else if (h.error) fail('AI-Wall: ' + label, h.error);
          else if (id === 'dense' && h.crowd < 20) fail('AI-Wall: ' + label, 'only ' + h.crowd + ' crowd enemies: ' + JSON.stringify(h));
          else if (!h.alive || h.pinned > .25 || h.minGap < 12) fail('AI-Wall: ' + label, JSON.stringify(h));
          else pass('AI-Wall: ' + label + ' (pinned ' + h.pinned + 's, min gap after 1s ' + h.minGap + ' px, final ' + h.finalGap + ' px' + (id === 'dense' ? ', ' + h.crowd + ' enemies' : '') + ')');
        }
      } catch (e) {
        fail('AI-Band leg', String(e && e.message ? e.message : e));
      }
    }

    // ---- throttled 4x/6x chunked-sim leg ----
    // Same Edge, raw CDP (Node >= 22 global WebSocket): Emulation.setCPUThrottlingRate
    // is the DevTools performance-panel mechanism. Assertions mirror the validated
    // standalone probe (tools/_throttle-sim-probe.mjs, docs/chunked-throttle-
    // validation-2026-09-04.md): throttle ENGAGED (calibration ratio), chunked 10k
    // completes, worst slice inside the real contract (SLICE_MS budget + one tail
    // work unit — NOT a strict frame; a CPU-work quota would scale slice WALL time
    // up on slow devices, the opposite of the goal), and no rAF gap > 100 ms during
    // the run (a repeated-freeze pattern would fail).
    {
      try {
        // Same bound connection as every other leg; the ?devsim copy keeps the
        // selftest machinery off and the console quiet.
        await nav(site + '/index.html?devsim&cb=thr' + Date.now());
        await new Promise(res2 => setTimeout(res2, 2000));
        for (let i = 0; i < 40; i++) { if (await ev("typeof BalanceSim === 'object' && typeof Game === 'object'", 10000)) break; await new Promise(res2 => setTimeout(res2, 300)); }
        if (!(await ev("typeof BalanceSim === 'object'", 10000))) throw new Error('engine did not boot on ?devsim');

        // Gap tracker: self-resetting start (a separate reset line before GAP_ON
        // would trip the 'already' guard and silently record nothing — verified
        // defect of the first wiring, caught because '0 frames' is impossible).
        // The setTimeout(0) ticker is the cause discriminator: a rAF gap whose
        // setTimeout twin is equally long is a main-thread stall (GC/OS); if
        // setTimeout stays live, the frame source skipped while the thread ran.
        const GAP_ON = "(function(){ window.__gapRun = 0; window.__gaps = []; window.__gapLast = performance.now(); window.__sgaps = []; window.__sgapLast = performance.now(); window.__gapRun = 1; (function loop(){ if (!window.__gapRun) return; var n = performance.now(); window.__gaps.push(n - window.__gapLast); window.__gapLast = n; requestAnimationFrame(loop); })(); (function sloop(){ if (!window.__gapRun) return; var n = performance.now(); window.__sgaps.push(n - window.__sgapLast); window.__sgapLast = n; setTimeout(sloop, 0); })(); return 'on'; })()";
        const GAP_OFF = "(function(){ window.__gapRun = 0; function stats(a){ var max = 0, o100 = 0; for (var i = 0; i < a.length; i++) { if (a[i] > max) max = a[i]; if (a[i] > 100) o100++; } return { n: a.length, max: Math.round(max * 10) / 10, o100: o100, top3: a.slice().sort(function(x,y){ return y - x; }).slice(0, 3).map(function(v){ return Math.round(v * 10) / 10; }).join('/') }; } return JSON.stringify({ raf: stats(window.__gaps || []), st: stats(window.__sgaps || []) }); })()";
        const CAL = "(function(){ var s = 0.123456; for (var i = 0; i < 24000000; i++) { s = s * 1.0000001 + 0.5; if (s > 1e12) s *= 0.001; } return Math.round((performance.now() - window.__calT0) * 10) / 10; })()";
        const CHUNK_START = "(function(){ window.__simRes = null; window.__chunkDps = null; BalanceSim.computeChunked(10000, function(){}).then(function(d){ window.__chunkDps = d.rows.map(function(r){ return String(r.dps); }).join(); window.__simRes = JSON.stringify({ iters: d.meta.iters, rows: d.rows.length, slices: d.meta.slices, chunked: d.meta.chunked, max: d.meta.maxSliceMs }); }).catch(function(err){ window.__simRes = JSON.stringify({ err: String(err) }); }); return 'started'; })()";

        const runChunked = async () => {
          await ev(GAP_ON);
          const t0 = Date.now();
          await ev(CHUNK_START, 30000);
          let got = null;
          const dl = Date.now() + 60000;
          while (Date.now() < dl) {
            const v = await ev('window.__simRes', 20000);
            if (v) { try { got = JSON.parse(v); } catch { /* keep polling */ } if (got) break; }
            await new Promise(res2 => setTimeout(res2, 300));
          }
          await new Promise(res2 => setTimeout(res2, 500));
          const gap = JSON.parse(await ev(GAP_OFF));
          return { got, gap, wallS: Math.round((Date.now() - t0) / 100) / 10 };
        };

        // rate-1 baseline chunked run: gates the same bound the unthrottled leg asserts
        const b1 = await runChunked();
        if (b1.got && !b1.got.err) {
          if (b1.got.iters === 10000 && b1.got.rows > 0 && b1.got.chunked === true && b1.got.slices >= 2 && b1.got.max < 120)
            pass('throttle rate 1: chunked 10k baseline (' + b1.got.slices + ' slices, max ' + b1.got.max + ' ms, ' + b1.wallS + ' s wall)');
          else fail('throttle rate 1 baseline', 'unexpected: ' + JSON.stringify(b1.got));
          if (b1.gap.raf.n >= 10 && b1.gap.raf.max < 300 && b1.gap.raf.o100 < 5) pass('throttle rate 1: tracker sane, frames flowing (' + b1.gap.raf.n + ' frames, max ' + b1.gap.raf.max + ' ms, setTimeout max ' + b1.gap.st.max + ' ms)');
          else fail('throttle rate 1 stall', 'raf ' + b1.gap.raf.n + ' frames, max ' + b1.gap.raf.max + ' ms, >100 ms: ' + b1.gap.raf.o100 + ' (setTimeout max ' + b1.gap.st.max + ' ms)');
        } else fail('throttle rate 1 baseline', JSON.stringify(b1.got || b1).slice(0, 140));
        const cal1 = await ev('window.__calT0 = performance.now(); ' + CAL, 30000);

        for (const R of [4, 6]) {
          // On hosted CI runners setCPUThrottlingRate is occasionally accepted but has
          // no effect (calibration ~1.1 on the same runner image that engages at x4.4 —
          // runs 36350749023 vs 36351611118). Reset and re-apply before judging.
          let ratio = 0, attempt = 0;
          for (attempt = 1; attempt <= 3; attempt++) {
            await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
            await cdp('Emulation.setCPUThrottlingRate', { rate: R });
            await new Promise(res2 => setTimeout(res2, 600 * attempt));
            const calR = await ev('window.__calT0 = performance.now(); ' + CAL, 60000);
            ratio = Math.round((calR / Math.max(1, cal1)) * 10) / 10;
            if (ratio >= 1.4) break;
          }
          const engaged = ratio >= 1.4;
          if (engaged) pass('throttle ' + R + 'x engaged (calibration x' + ratio + (attempt > 1 ? ', attempt ' + attempt : '') + ')');
          else if (process.env.CI) {
            // The runner, not the code, failed: without throttling the assertions below
            // would measure nothing. Skip this rate loudly instead of blocking the deploy;
            // the unthrottled chunked leg above still gates slicing, yields and parity.
            note('throttle ' + R + 'x could not be engaged on this CI runner (calibration x' + ratio + ' after 3 attempts) — rate skipped, rerun the job to cover it');
            console.log('::warning title=Throttle leg skipped::' + R + 'x throttling had no effect on this runner (calibration x' + ratio + ' after 3 attempts)');
            continue;
          } else fail('throttle ' + R + 'x engaged', 'calibration ratio ' + ratio + ' < 1.4 after 3 attempts — throttle is a no-op on this Edge build; cannot validate here');

          const c = await runChunked();
          if (c.got && !c.got.err) {
            if (c.got.iters === 10000 && c.got.rows > 0 && c.got.chunked === true && c.got.slices >= 3)
              pass('throttle ' + R + 'x: chunked 10k completes (' + c.got.slices + ' slices, max slice ' + c.got.max + ' ms, ' + c.wallS + ' s wall)');
            else fail('throttle ' + R + 'x chunked', 'unexpected: ' + JSON.stringify(c.got));
            // Real contract: budget (10 ms) + one indivisible tail work unit. The
            // tail's wall cost scales with the CPU rate; measured worst at 6x was
            // ~21 ms, so 60 ms is a generous but still-meaningful bound.
            if (c.got.max < 60) pass('throttle ' + R + 'x: worst slice ' + c.got.max + ' ms < 60 (budget + tail unit)');
            else fail('throttle ' + R + 'x worst slice', c.got.max + ' ms >= 60 — budget + tail contract violated');
            // Responsiveness contract (population-calibrated on this box: pairs
            // of ~120-143 ms GC/OS outliers appear in ~2/5 runs): fail only on a
            // SUSTAINED freeze (>= 300 ms single gap = frozen page, or >= 5 long
            // gaps = chronic stutter). The sim's own blocking is guarded
            // deterministically above by maxSliceMs < 60 + slices >= 3 — a
            // non-yielding sim is one giant slice and fails THERE, not here.
            const cause = c.gap.raf.o100 === 0 ? 'no outlier'
              : (c.gap.st.max >= c.gap.raf.max * 0.6
                ? 'isolated main-thread stall(s) (GC/OS — setTimeout co-stalled ' + c.gap.st.max + ' ms)'
                : 'frame-source stall(s) (main thread live, setTimeout ' + c.gap.st.max + ' ms)');
            if (c.gap.raf.max < 300 && c.gap.raf.o100 < 5) pass('throttle ' + R + 'x: frames kept flowing during chunked run (raf max ' + c.gap.raf.max + ' ms, >100 ms: ' + c.gap.raf.o100 + '/' + c.gap.raf.n + ' — ' + cause + ')');
            else fail('throttle ' + R + 'x freeze', 'raf max ' + c.gap.raf.max + ' ms, >100 ms gaps: ' + c.gap.raf.o100 + ' (top rAF ' + c.gap.raf.top3 + ' ms; setTimeout max ' + c.gap.st.max + ' ms, top ' + c.gap.st.top3 + ' — ' + cause + ')');
            // Parity: chunked must equal the sync compute exactly.
            const sp = await ev("(function(){ var s = BalanceSim.compute(10000); return s.rows.map(function(r){ return String(r.dps); }).join() === window.__chunkDps; })()", 60000);
            if (sp === true) pass('throttle ' + R + 'x: chunked parity with sync compute');
            else fail('throttle ' + R + 'x parity', 'chunked dps rows differ from sync compute');
          } else fail('throttle ' + R + 'x chunked', JSON.stringify(c.got || {}).slice(0, 140));
        }
        await cdp('Emulation.setCPUThrottlingRate', { rate: 1 });
      } catch (e) {
        fail('throttle leg', String(e && e.message ? e.message : e));
      }
    }
  } catch (e) {
    fail('browser leg', String(e && e.message ? e.message : e));
  } finally {
    if (conn) conn.close();
    if (edge) edge.kill();
    if (server) { try { server.close(); } catch { /* ignore */ } }
  }
  note('browser leg wall time: ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
}

await browserLeg();

console.log(failures === 0 ? '\nVERIFY OK' : '\nVERIFY FAILED (' + failures + ' check' + (failures === 1 ? '' : 's') + ')');
console.log('COUNTS ' + passes + ' pass / ' + failures + ' fail / ' + skips + ' skip');
process.exit(failures === 0 ? 0 : 1);
