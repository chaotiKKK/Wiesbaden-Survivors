from pathlib import Path

# 1) in-engine selftest: Einarm now starts with his own Nietpistole
idx = Path('index.html')
s = idx.read_text(encoding='utf-8')
before = s.count("solo.addWeapon('wrench', 1);") + s.count("c.startWeapon === 'wrench'")
s = s.replace("solo.addWeapon('wrench', 1);", "solo.addWeapon('nietpistole', 1);")
s = s.replace("c.startWeapon === 'wrench'", "c.startWeapon === 'nietpistole'")
if before != 2:
    raise SystemExit(f'index anchors: {before} != 2')
idx.write_text(s, encoding='utf-8')
print('patched index.html selftest')

# 2) gate: explain the heal value via the real hook + heal modifier
v = Path('tools/verify.mjs')
t = v.read_text(encoding='utf-8')

old_probe = """          reset(); p.addItem(ITEM_BY_ID.rettungstrage); p.hp = p.maxHp - 20;
          var beforeHeal = p.hp; e = mob(520, 500, 1); e.hp = 1; e.die(p, 'test');
          out.rettungstrage = { heal: p.hp - beforeHeal };"""
new_probe = """          reset(); p.addItem(ITEM_BY_ID.rettungstrage); p.hp = p.maxHp - 20;
          var beforeHeal = p.hp; e = mob(520, 500, 1); e.hp = 1; e.die(p, 'test');
          var healMul = (Game.modActive && Game.modActive('halbe_heilung')) ? .5 : 1;
          out.rettungstrage = { heal: p.hp - beforeHeal, expected: p.killHeal * healMul, killHeal: p.killHeal, mul: healMul, mods: (Game.mods || []).map(function(m){ return m && m.id; }) };"""
if t.count(old_probe) != 1:
    raise SystemExit('probe anchor missing')
t = t.replace(old_probe, new_probe)

old_assert = "        if (o.rettungstrage && o.rettungstrage.heal >= 1.9) pass('Arsenal 32 live: Rettungstrage heals on kill');"
new_assert = "        if (o.rettungstrage && o.rettungstrage.killHeal === 2 && o.rettungstrage.heal > 0 && Math.abs(o.rettungstrage.heal - o.rettungstrage.expected) < 1e-6) pass('Arsenal 32 live: Rettungstrage heals ' + o.rettungstrage.heal + ' on kill (hook ' + o.rettungstrage.killHeal + ', multiplier ' + o.rettungstrage.mul + ')');"
if t.count(old_assert) != 1:
    raise SystemExit('assert anchor missing')
t = t.replace(old_assert, new_assert)
v.write_text(t, encoding='utf-8')
print('patched tools/verify.mjs rettungstrage probe')
