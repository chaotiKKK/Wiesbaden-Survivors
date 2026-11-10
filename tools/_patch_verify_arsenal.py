from pathlib import Path

p = Path('tools/verify.mjs')
s = p.read_text(encoding='utf-8')

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        raise SystemExit(f'anchor count {n} != {count}: {old[:100]!r}')
    s = s.replace(old, new)

# --- constants: legacy 47-item pool stays, new arsenal ids get their own list ---
rep('const ITEM_POOL_120_IDS = ',
    "const ARSENAL_32_WEAPON_IDS = ['friedenshorn','zugriffshaken','waldlaeuferbogen','schildglocke','nietpistole','schattenmesser','sternkette'];\n"
    "const ARSENAL_32_ITEM_IDS = ['rettungstrage','moosmatte','brandungsring','kettenreaktor','zuendsatz'];\n"
    "const ITEM_POOL_LEGACY_IDS = ")
rep('ITEM_POOL_120_IDS.map', 'ITEM_POOL_LEGACY_IDS.map')
rep('new Set(ITEM_POOL_120_IDS)', 'new Set(ITEM_POOL_LEGACY_IDS)', 2)
rep('${JSON.stringify(ITEM_POOL_120_IDS)}', '${JSON.stringify(ITEM_POOL_LEGACY_IDS)}')

# --- item pool contract: 125 items, 31/31/32/31, 25 per Veedel ---
rep('// ---- Item-Pool 120: data contract ----', '// ---- Item-Pool 125: data contract ----')
rep('// The parity target is 120 items, split 30/30/30/30 by rarity with 12 cursed.',
    '// The parity target is 125 items, split 31/31/32/31 by rarity with 12 cursed.')
rep('// Every item must stay in exactly one Veedel (24 per family) and every new row',
    '// Every item must stay in exactly one Veedel (25 per family) and every new row')
rep("if (items.length === 120 && unique === 120) pass('Item pool 120: 120 unique items live');",
    "if (items.length === 125 && unique === 125) pass('Item pool 125: 125 unique items live');")
rep("else fail('Item pool 120 size',", "else fail('Item pool 125 size',")
rep('if (rarity[1] === 30 && rarity[2] === 30 && rarity[3] === 30 && rarity[4] === 30)',
    'if (rarity[1] === 31 && rarity[2] === 31 && rarity[3] === 32 && rarity[4] === 31)')
rep("pass('Item pool 120: rarity split 30/30/30/30');", "pass('Item pool 125: rarity split 31/31/32/31');")
rep("else fail('Item pool 120 rarity',", "else fail('Item pool 125 rarity',")
rep('if (data.ITEMS.filter(it => it.cursed).length === 12 && Object.values(fam).every(n => n === 24))',
    'if (data.ITEMS.filter(it => it.cursed).length === 12 && Object.values(fam).every(n => n === 25))')
rep("pass('Item pool 120: 12 cursed and 24 items in each Veedel');",
    "pass('Item pool 125: 12 cursed and 25 items in each Veedel');")
rep("else fail('Item pool 120 cursed/families',", "else fail('Item pool 125 cursed/families',")
rep("pass('Item pool 120: all 47 new items have valid stats and ' + effects + ' use turret/thorns/curse extras');",
    "pass('Item pool 125: all 47 legacy items have valid stats and ' + effects + ' use turret/thorns/curse extras');")
rep("else fail('Item pool 120 new items',", "else fail('Item pool 125 legacy items',")
rep("fail('Item pool 120 data',", "fail('Item pool 125 data',")
rep("if (r && r.total === 120) pass('Item pool live: 120 items visible in the running engine');",
    "if (r && r.total === 125) pass('Item pool live: 125 items visible in the running engine');")

# --- Einarm now carries his own weapon ---
rep("r.start.id === 'wrench' && r.start.tier === 1", "r.start.id === 'nietpistole' && r.start.tier === 1")
rep("pass('Einarm live: start run gives 1 weapon slot, wrench at T2 (atkSpd +'",
    "pass('Einarm live: start run gives 1 weapon slot, Nietpistole at T2 (atkSpd +'")
rep("pass('Einarm live: 6 shop offers, every weapon offer is a wrench upgrade at the carried tier');",
    "pass('Einarm live: 6 shop offers, every weapon offer is a Nietpistole upgrade at the carried tier');")

# --- data contract leg: 32 unique starts, new weapon/item rows, unique ids ---
data_block = r'''
// ---- Arsenal 32: unique starts, new weapon/item contracts, pool reach ----
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
    const startsUnique = data.CHARS.length === 32 && new Set(starts).size === 32 && starts.every(id => !!data.WEAPON_BY_ID[id]);
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
      pass('Arsenal 32: 32/32 unique starting weapons; Einarm keeps 1 slot and starts with the Nietpistole at T2');
    else fail('Arsenal 32 starts', JSON.stringify({ n: data.CHARS.length, unique: new Set(starts).size, mismatched: data.CHARS.filter(c => expectedStarts[c.id] && c.startWeapon !== expectedStarts[c.id]).map(c => c.id + ':' + c.startWeapon), einarm: einarm && { max: einarm.maxWeapons, tier: einarm.startWeaponTier, start: einarm.startWeapon } }));
    if (typeOk && tiersOk)
      pass('Arsenal 32: 7 new weapons cover 7 fire paths with 4 monotonic Tiers each and default-unlocked pool access');
    else fail('Arsenal 32 weapons', JSON.stringify(ws.map(w => ({ id: w.id, type: w.type, unlock: w.unlockDefault, tiers: w.tiers.length }))));
    if (idsOk)
      pass('Arsenal 32: 81 unique weapons + 125 unique items, no ID reused across tables');
    else fail('Arsenal 32 ids', JSON.stringify({ weapons: data.WEAPONS.length, uniqueWeapons: new Set(weaponIds).size, items: data.ITEMS.length, uniqueItems: new Set(itemIds).size, union: new Set(allIds).size }));
    if (itemHooksOk && familyOk)
      pass('Arsenal 32: 5 new items use 5 distinct hooks and cover 5 different Veedel families');
    else fail('Arsenal 32 items', JSON.stringify(its.map(it => ({ id: it.id, hooks: effectFields.filter(k => it[k]), family: data.ITEM_FAMILY_BY_ID[it.id] && data.ITEM_FAMILY_BY_ID[it.id].id, stats: it.stats }))));
  } catch (e) {
    fail('Arsenal 32 data', String(e && e.message ? e.message : e));
  }
}

'''
rep('// ---- Druckluft: the new weapon family and its item set ----',
    data_block + '// ---- Druckluft: the new weapon family and its item set ----')

# --- live leg: deterministic mechanics, production pools, codex numbers, save ---
live_block = r'''
    // ---- Arsenal 32: production shop reach + live weapon/item mechanics ----
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
          out.rettungstrage = { heal: p.hp - beforeHeal };

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
        if (r && r.weapons === 81 && r.items === 125) pass('Arsenal 32 live: engine exposes 81 weapons / 125 items');
        else fail('Arsenal 32 live counts', dump);
        if (r && r.poolOk && r.unseenW.length === 0) pass('Arsenal 32 live: all 7 new weapons are in ShopSystem.weaponPool() and appeared in production shop offers');
        else fail('Arsenal 32 live weapon pool', dump);
        if (r && r.unseenI.length === 0) pass('Arsenal 32 live: all 5 new items appeared in production shop offers');
        else fail('Arsenal 32 live item pool', dump);
        if (r && r.codexWCount === 81 && r.codexWFamilies) pass('Arsenal 32 live: weapon codex lists 81 weapons with every new name and special text');
        else fail('Arsenal 32 live weapon codex', dump);
        if (r && r.codexICount === 125 && r.codexIFamilies) pass('Arsenal 32 live: item codex lists 125 items and every family count matches the data');
        else fail('Arsenal 32 live item codex', dump);
        if (r && r.codexEffect) pass('Arsenal 32 live: codex renders the five new distinct effect lines');
        else fail('Arsenal 32 live item effects codex', dump);
        if (r && r.codexStarts) pass('Arsenal 32 live: character codex shows all 32 starting weapons by name');
        else fail('Arsenal 32 live start codex', dump);
        if (o.friedenshorn && o.friedenshorn.stun > 0 && o.friedenshorn.slow > 0) pass('Arsenal 32 live: Friedenshorn cone stuns and slows');
        else fail('Arsenal 32 Friedenshorn', JSON.stringify(o.friedenshorn));
        if (o.zugriffshaken && o.zugriffshaken.stun > 0 && o.zugriffshaken.mark >= 2.5) pass('Arsenal 32 live: Zugriffs-Haken stuns and marks for +35% follow-up');
        else fail('Arsenal 32 Zugriffs-Haken', JSON.stringify(o.zugriffshaken));
        if (o.waldlaeuferbogen && o.waldlaeuferbogen.slow > 0) pass('Arsenal 32 live: full Waldlaeuferbogen charge slows the pierced target');
        else fail('Arsenal 32 Waldlaeuferbogen', JSON.stringify(o.waldlaeuferbogen));
        if (o.schildglocke && o.schildglocke.stun > 0 && o.schildglocke.push > 0) pass('Arsenal 32 live: Schildglocke aura pushes and stuns');
        else fail('Arsenal 32 Schildglocke', JSON.stringify(o.schildglocke));
        if (o.nietpistole && o.nietpistole.stun > 0 && o.nietpistole.stun2 > 0 && o.nietpistole.h1 > 0 && o.nietpistole.h2 > o.nietpistole.h1) pass('Arsenal 32 live: Nietpistole hits/stuns the whole line with increasing damage');
        else fail('Arsenal 32 Nietpistole', JSON.stringify(o.nietpistole));
        if (o.schattenmesser && o.schattenmesser.spawned === 1 && o.schattenmesser.projectile && o.schattenmesser.poison > 0 && o.schattenmesser.bounce > 0) pass('Arsenal 32 live: Schattenmesser spawns a poison projectile with bounce');
        else fail('Arsenal 32 Schattenmesser', JSON.stringify(o.schattenmesser));
        if (o.sternkette && o.sternkette.burn > 0 && o.sternkette.burn2 > 0) pass('Arsenal 32 live: Sternenkette burns every chain link');
        else fail('Arsenal 32 Sternenkette', JSON.stringify(o.sternkette));
        if (o.rettungstrage && o.rettungstrage.heal >= 1.9) pass('Arsenal 32 live: Rettungstrage heals on kill');
        else fail('Arsenal 32 Rettungstrage', JSON.stringify(o.rettungstrage));
        if (o.zuendsatz && o.zuendsatz.neighbor > 0) pass('Arsenal 32 live: Zuendsatz explodes on kill and damages a neighbor');
        else fail('Arsenal 32 Zuendsatz', JSON.stringify(o.zuendsatz));
        if (o.kettenreaktor && o.kettenreaktor.neighbor > 0) pass('Arsenal 32 live: Kettenreaktor crit chains to a neighbor');
        else fail('Arsenal 32 Kettenreaktor', JSON.stringify(o.kettenreaktor));
        if (o.brandungsring && o.brandungsring.count > 0 && o.brandungsring.neighbor > 0) pass('Arsenal 32 live: Brandungsring dodge nova damages nearby enemies');
        else fail('Arsenal 32 Brandungsring', JSON.stringify(o.brandungsring));
        if (o.moosmatte && o.moosmatte.count > 0 && o.moosmatte.slow > 0) pass('Arsenal 32 live: Moosmatte aura slows nearby enemies');
        else fail('Arsenal 32 Moosmatte', JSON.stringify(o.moosmatte));
        if (o.determinism && o.determinism.ok) pass('Arsenal 32 live: seeded Friedenshorn simulation repeats exactly (drop ' + o.determinism.a.drop + ', stun ' + o.determinism.a.stun + ')');
        else fail('Arsenal 32 deterministic sim', JSON.stringify(o.determinism));
        if (r && r.saveOk && r.startItemApplied) pass('Arsenal 32 live: new weapon ids + startItem survive Save.exportCode()/importCode() and the run starts with the Zuendsatz');
        else fail('Arsenal 32 live save/start loadout', dump);
      } catch (e) {
        fail('Arsenal 32 live leg', String(e && e.message ? e.message : e));
      }
    }

'''
rep('    // ---- Charakter-Riege 32: five new heroes through the real UI ----',
    live_block + '    // ---- Charakter-Riege 32: five new heroes through the real UI ----')

p.write_text(s, encoding='utf-8')
print('patched tools/verify.mjs')
