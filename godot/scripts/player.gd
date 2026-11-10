extends Node2D
## Player: movement, stat aggregation, six auto-fire weapon slots and XP.
## The browser data uses relative stat points; this maps them to Godot units.

signal died
signal curse_changed(value: int)

var main: Node = null
var char_data: Dictionary = {}
var base_stats: Dictionary = {}
var items: Array = []
var run_upgrades: Dictionary = {}
var curse := 0
var bonuses: Dictionary = {}
var stats: Dictionary = {}
var weapons: Array = []

var max_hp := 100.0
var hp := 100.0
var damage_taken := 0.0
var speed := 250.0
var damage_mult := 1.0
var atk_speed := 1.0
var crit := 0.05
var armor := 0.0
var range_mult := 1.0
var melee_mult := 1.0
var elem_mult := 1.0
var regen := 0.0
var lifesteal := 0.0
var dodge := 0.0
var pickup_radius := 95.0
var invuln := 0.0
var dash_timer := 0.0
var dash_cd := 0.0
var level := 1
var xp := 0.0
var xp_next := 10.0
var level_ups := 0
var alive := true
var radius := 16.0
var facing := Vector2.RIGHT
var hit_flash := 0.0
var _anim := 0.0
var ability: Dictionary = {}
var ability_cd := 0.0
var ability_rank := 1
var ability_cd_mod := 0.0
var ability_uses := 0
var synergy: Dictionary = {}
var synergy_active := false
var synergy_count := 0
var synergy_need := 0
var timed_bonuses: Array = []
var slow_t := 0.0

const ABILITY_KINDS := {
	"loeschstrahl": "cone", "heilaura": "heal", "phasendash": "dash", "markierung": "nova",
	"raveaura": "buff", "overdrive": "buff", "fuellhorn": "heal", "turret": "summon",
	"notstrom": "nova", "powerchord": "nova", "schiedsgericht": "nova", "kiosk": "heal",
	"walla": "nova", "sprengsatz": "shoot", "luftschlag": "shoot", "festnahme": "dash",
	"vollgas": "dash", "barbarenwut": "cone", "kralle": "buff", "arkanstoss": "nova",
	"praezisionsschuss": "shoot", "schattenritt": "dash", "hinterhalt": "dash",
	"ueberdruck": "nova", "sammelrunde": "collect", "schrotthagel": "nova",
	"nietenhagel": "nova", "gruenphase": "buff", "dampfwalze": "dash",
	"scheinwerfer": "cone", "rebenhieb": "nova", "kaeltewelle": "nova",
	"speerwurf": "shoot", "holzhack": "cone", "nagelregen": "nova",
	"fassrolle": "dash", "magnetfeld": "collect", "taubensturm": "nova",
	"kettenschnitt": "nova", "laserfokus": "cone", "kettenblitz": "chain",
	"notoperation": "heal", "rettungsgriff": "heal", "brandschneise": "cone"
}


func setup(c: Dictionary, main_ref: Node) -> void:
	char_data = c
	main = main_ref
	base_stats = (c.get("stats", {}) as Dictionary).duplicate(true)
	ability = (c.get("ability", {}) as Dictionary).duplicate(true)
	synergy = (c.get("synergy", {}) as Dictionary).duplicate(true)
	items.clear()
	run_upgrades.clear()
	bonuses.clear()
	timed_bonuses.clear()
	weapons.clear()
	ability_cd = 0.0
	ability_uses = 0
	slow_t = 0.0
	damage_taken = 0.0
	recalc()
	hp = max_hp
	add_weapon(String(c.get("startWeapon", "schrottkanone")), 0)
	position = main.spawn_center()
	queue_redraw()


func recalc() -> void:
	var old_max := max_hp
	var previous_curse := curse
	var totals: Dictionary = base_stats.duplicate(true)
	for item in items:
		var item_stats: Dictionary = item.get("stats", {})
		for key in item_stats.keys():
			totals[key] = float(totals.get(key, 0.0)) + float(item_stats[key])
	# Workshop orders are permanent run buffs. They use the same additive stat
	# path as items, so buying, stacking and save/load all share one recalc().
	for raw_id in run_upgrades.keys():
		var def: Dictionary = GameData.run_upgrade(String(raw_id))
		var count := maxi(0, int(run_upgrades.get(raw_id, 0)))
		if def.is_empty() or count <= 0:
			continue
		var upgrade_stats: Dictionary = def.get("stats", {})
		for key in upgrade_stats.keys():
			totals[key] = float(totals.get(key, 0.0)) + float(upgrade_stats[key]) * float(count)
	for key in bonuses.keys():
		totals[key] = float(totals.get(key, 0.0)) + float(bonuses[key])
	# Curse is a run meter, not an item stat: every cursed item raises it and
	# the rules block owns all scaling. Deriving it from the inventory keeps
	# save/load and recycling on one source of truth, with no second counter
	# that could drift.
	var curse_rule: Dictionary = GameData.rules.get("curse", {})
	var curse_points := 0
	for item in items:
		curse_points += maxi(0, int((item as Dictionary).get("curse", 0)))
	curse = curse_points
	var curse_luck := minf(float(curse_rule.get("luckCap", 0.0)), float(curse) * float(curse_rule.get("luckPerPoint", 0.0)))
	if curse_luck > 0.0:
		totals["luck"] = float(totals.get("luck", 0.0)) + curse_luck
	# Character synergy counts the actual weapon classes in the six slots.
	var syn: Dictionary = char_data.get("synergy", {})
	var syn_cls := String(syn.get("cls", ""))
	synergy_need = int(syn.get("need", 0))
	synergy_count = 0
	for weapon in weapons:
		var wdef: Dictionary = GameData.weapon(String(weapon.get("id", "")))
		if (wdef.get("cls", []) as Array).has(syn_cls):
			synergy_count += 1
	synergy_active = synergy_need > 0 and synergy_count >= synergy_need
	if synergy_active:
		var syn_stats: Dictionary = syn.get("stats", {})
		for key in syn_stats.keys():
			totals[key] = float(totals.get(key, 0.0)) + float(syn_stats[key])
	stats = totals
	# 4 HP per data point keeps late-run HP items from turning the shop into a
	# pure health snowball while the +10 base keeps the early waves fair.
	max_hp = 110.0 + float(totals.get("maxHp", 0.0)) * 4.0
	speed = 250.0 + float(totals.get("speed", 0.0)) * 9.0
	damage_mult = 1.0 + float(totals.get("dmgP", 0.0)) / 100.0
	atk_speed = clampf(1.0 + float(totals.get("atkSpd", 0.0)) / 100.0, 0.45, 4.0)
	crit = clampf(0.05 + float(totals.get("crit", 0.0)) / 100.0, 0.0, 0.85)
	armor = maxf(0.0, float(totals.get("armor", 0.0)))
	range_mult = maxf(0.5, 1.0 + float(totals.get("ranged", 0.0)) / 100.0)
	melee_mult = maxf(0.5, 1.0 + float(totals.get("melee", 0.0)) / 100.0)
	elem_mult = maxf(0.5, 1.0 + float(totals.get("elem", 0.0)) / 100.0)
	regen = maxf(0.0, float(totals.get("hpRegen", 0.0))) * 0.6
	lifesteal = clampf(float(totals.get("lifesteal", 0.0)) / 100.0, 0.0, 0.5)
	dodge = clampf(float(totals.get("dodge", 0.0)) / 100.0, 0.0, 0.6)
	pickup_radius = 95.0 + float(totals.get("luck", 0.0)) * 1.5
	ability_rank = maxi(1, 1 + int((level - 1) / 5) + int(float(totals.get("abilityRank", 0.0))))
	ability_cd_mod = float(totals.get("abilityCdMod", 0.0))
	if old_max > 0.0 and max_hp > old_max:
		hp += max_hp - old_max
	hp = minf(hp, max_hp)
	if curse != previous_curse:
		emit_signal("curse_changed", curse)


func update(delta: float) -> void:
	if not alive:
		return
	_anim += delta
	invuln = maxf(0.0, invuln - delta)
	hit_flash = maxf(0.0, hit_flash - delta)
	dash_cd = maxf(0.0, dash_cd - delta)
	ability_cd = maxf(0.0, ability_cd - delta)
	slow_t = maxf(0.0, slow_t - delta)
	var expired := false
	for i in range(timed_bonuses.size() - 1, -1, -1):
		var buff: Dictionary = timed_bonuses[i]
		buff["time"] = float(buff.get("time", 0.0)) - delta
		if float(buff["time"]) <= 0.0:
			var key := String(buff.get("key", ""))
			bonuses[key] = float(bonuses.get(key, 0.0)) - float(buff.get("amount", 0.0))
			timed_bonuses.remove_at(i)
			expired = true
	if expired:
		recalc()
	if dash_timer > 0.0:
		dash_timer -= delta
	if regen > 0.0:
		hp = minf(max_hp, hp + regen * delta)

	var input := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if main != null and main.touch != null and main.touch.enabled:
		input += main.touch.move
	input = input.limit_length(1.0)
	if input.length() > 0.12:
		facing = input.normalized()
	var current_speed := speed * (3.0 if dash_timer > 0.0 else 1.0) * (0.58 if slow_t > 0.0 else 1.0)
	position += input * current_speed * delta
	var bounds: Dictionary = main.arena
	position.x = clampf(position.x, 40.0, float(bounds.get("w", 1600)) - 40.0)
	position.y = clampf(position.y, 40.0, float(bounds.get("h", 1200)) - 40.0)

	for weapon in weapons:
		_tick_weapon(weapon, delta)
	queue_redraw()


func _tick_weapon(weapon: Dictionary, delta: float) -> void:
	weapon["cd"] = float(weapon.get("cd", 0.0)) - delta
	if weapon["cd"] > 0.0:
		return
	var def: Dictionary = GameData.weapon(String(weapon.get("id", "")))
	if def.is_empty():
		return
	var tiers: Array = def.get("tiers", [])
	if tiers.is_empty():
		return
	var tier := clampi(int(weapon.get("tier", 0)), 0, tiers.size() - 1)
	var t: Array = tiers[tier]
	var reach := float(t[2]) * range_mult
	var target: Node2D = main.nearest_enemy(position, reach * 1.25)
	if target == null:
		return
	_fire(weapon, def, t, target)
	weapon["cd"] = maxf(0.08, float(t[1]) / atk_speed)


func _damage_for(def: Dictionary, t: Array) -> float:
	var scaling: Dictionary = def.get("scaling", {})
	var mult := 1.0
	mult += float(stats.get("ranged", 0.0)) / 100.0 * float(scaling.get("ranged", 0.0))
	mult += float(stats.get("melee", 0.0)) / 100.0 * float(scaling.get("melee", 0.0))
	mult += float(stats.get("elem", 0.0)) / 100.0 * float(scaling.get("elem", 0.0))
	var damage := float(t[0]) * damage_mult * maxf(0.2, mult)
	if main != null and main.rng.randf() < crit:
		damage *= 2.0
	return damage


func _fire(weapon: Dictionary, def: Dictionary, t: Array, target: Node2D) -> void:
	var dir: Vector2 = target.position - position
	if dir.length() < 0.5:
		dir = facing
	dir = dir.normalized()
	var dtype := String(def.get("type", "projectile"))
	var col: Color = GameData.color(def.get("col", "#ffffff"))
	var extra: Dictionary = t[6] if t.size() > 6 and typeof(t[6]) == TYPE_DICTIONARY else {}
	var dmg := _damage_for(def, t)
	var reach := float(t[2]) * range_mult
	match dtype:
		"cone":
			var cone := float(extra.get("cone", 0.32))
			main.damage_cone(position, dir, reach, cone, dmg, col, 0.55)
		"melee":
			var arc := float(extra.get("arc", 1.6))
			main.damage_cone(position, dir, reach * 0.75, arc, dmg, col, 0.0)
		"hitscan":
			main.damage_line(position, dir, reach, dmg, col, int(extra.get("pierce", 2)))
		"chain":
			main.damage_chain(position, target, dmg, 3, reach * 0.55, col)
		"aura":
			main.damage_circle(position, reach * 0.5, dmg * 0.45, col)
		"charge":
			main.spawn_player_projectile(position + dir * 24.0, dir * 470.0, dmg * 1.45, col, 13.0, 2)
		_:
			var pellets := maxi(1, int(extra.get("pellets", 1)))
			var spread := float(extra.get("spread", 0.14))
			for i in pellets:
				var offset := 0.0
				if pellets > 1:
					offset = (float(i) / float(pellets - 1) - 0.5) * spread
				main.spawn_player_projectile(position + dir * 20.0, dir.rotated(offset) * 640.0, dmg, col, 5.0, 0)
	weapon["kills"] = int(weapon.get("kills", 0))


func add_weapon(id: String, tier: int = 0) -> bool:
	# Brotato keeps duplicate weapons as separate slots; merging is what turns
	# two identical tiers into the next tier. Auto-upgrading here would make the
	# whole merge system unreachable through normal shop purchases.
	if GameData.weapon(id).is_empty():
		return false
	if weapons.size() >= int(GameData.rules.get("maxWeapons", 6)):
		return false
	weapons.append({"id": id, "tier": clampi(tier, 0, 3), "cd": 0.0, "kills": 0})
	recalc()
	return true


func upgrade_weapon(index: int) -> bool:
	if index < 0 or index >= weapons.size():
		return false
	var weapon: Dictionary = weapons[index]
	if int(weapon.get("tier", 0)) >= 3:
		return false
	weapon["tier"] = int(weapon.get("tier", 0)) + 1
	recalc()
	return true


func merge_weapons(id: String, tier: int) -> bool:
	if tier < 0 or tier >= 3:
		return false
	var indices: Array = []
	for i in weapons.size():
		var weapon: Dictionary = weapons[i]
		if String(weapon.get("id", "")) == id and int(weapon.get("tier", 0)) == tier:
			indices.append(i)
			if indices.size() == 2:
				break
	if indices.size() < 2:
		return false
	var merged: Dictionary = weapons[indices[0]].duplicate(true)
	merged["tier"] = tier + 1
	merged["cd"] = 0.0
	merged["kills"] = int(weapons[indices[0]].get("kills", 0)) + int(weapons[indices[1]].get("kills", 0))
	weapons.remove_at(indices[1])
	weapons.remove_at(indices[0])
	weapons.insert(indices[0], merged)
	recalc()
	queue_redraw()
	return true


func weapon_summary() -> String:
	var parts: Array = []
	for weapon in weapons:
		var def: Dictionary = GameData.weapon(String(weapon.get("id", "")))
		parts.append("%s T%d" % [String(def.get("name", "?")), int(weapon.get("tier", 0)) + 1])
	return " · ".join(parts)


func add_run_upgrade(id: String) -> int:
	var def: Dictionary = GameData.run_upgrade(id)
	if def.is_empty():
		return 0
	var current := run_upgrade_count(id)
	var max_stacks := maxi(1, int(def.get("maxStacks", 1)))
	if current >= max_stacks:
		return current
	run_upgrades[id] = current + 1
	recalc()
	queue_redraw()
	return current + 1


func run_upgrade_count(id: String) -> int:
	return maxi(0, int(run_upgrades.get(id, 0)))


func add_item(item: Dictionary) -> void:
	items.append(item)
	recalc()


func sell_item(id: String) -> bool:
	# Removes exactly one copy. recalc() rebuilds the totals from scratch, so
	# every stat the item granted (including max HP) rolls back completely.
	for i in items.size():
		if String((items[i] as Dictionary).get("id", "")) == id:
			items.remove_at(i)
			recalc()
			queue_redraw()
			return true
	return false


func add_bonus(key: String, amount: float) -> void:
	bonuses[key] = float(bonuses.get(key, 0.0)) + amount
	recalc()


func add_temp_bonus(key: String, amount: float, duration: float) -> void:
	bonuses[key] = float(bonuses.get(key, 0.0)) + amount
	timed_bonuses.append({"key": key, "amount": amount, "time": duration})
	recalc()


func heal(amount: float) -> void:
	if not alive:
		return
	hp = minf(max_hp, hp + maxf(0.0, amount))


func on_damage_dealt(amount: float) -> void:
	if lifesteal > 0.0 and amount > 0.0:
		heal(amount * lifesteal)


func take_damage(amount: float) -> float:
	if not alive or invuln > 0.0:
		return 0.0
	if dodge > 0.0 and main != null and main.rng.randf() < dodge:
		return 0.0
	var damage := maxf(1.0, amount - armor * 0.6)
	damage_taken += damage
	hp -= damage
	invuln = 0.5
	hit_flash = 0.16
	if main != null:
		main.on_player_hit(damage)
	if hp <= 0.0:
		hp = 0.0
		alive = false
		emit_signal("died")
	queue_redraw()
	return damage


func dash() -> bool:
	if not alive or dash_cd > 0.0:
		return false
	dash_timer = 0.18
	dash_cd = 2.4
	if main != null:
		main.spawn_ring(position, Color(0.55, 0.95, 1.0), 18.0)
	return true


func gain_xp(amount: float) -> void:
	xp += maxf(0.0, amount)
	while xp >= xp_next:
		xp -= xp_next
		level += 1
		level_ups += 1
		xp_next = round(xp_next * 1.32 + 3.0)
	recalc()
	queue_redraw()


func color() -> Color:
	return GameData.color(char_data.get("col", "#ffcf4a"))


func ability_name() -> String:
	return String(ability.get("name", "Fähigkeit"))


func ability_kind() -> String:
	return String(ABILITY_KINDS.get(String(ability.get("id", "")), "nova"))


func use_ability() -> bool:
	if not alive or main == null or int(main.state) != 1:
		return false
	if ability.is_empty() or ability_cd > 0.0:
		return false
	var id := String(ability.get("id", ""))
	if id.is_empty():
		return false
	var kind := ability_kind()
	var base_cd := maxf(2.0, float(ability.get("cd", 10.0)))
	ability_cd = maxf(0.8, base_cd * maxf(0.55, 1.0 - float(ability_rank - 1) * 0.07) * (1.0 + ability_cd_mod / 100.0))
	ability_uses += 1
	var col := color()
	var dmg := (18.0 + float(ability_rank) * 10.0) * damage_mult
	match kind:
		"cone":
			if id == "scheinwerfer" or id == "laserfokus":
				main.damage_line(position, facing, 360.0 + float(ability_rank) * 24.0, dmg * 1.4, col, 99)
			else:
				main.damage_cone(position, facing, 300.0 + float(ability_rank) * 24.0, 1.3, dmg, col, 0.55)
			main.spawn_ring(position, col, 18.0)
		"dash":
			invuln = maxf(invuln, 0.45)
			position += facing * (110.0 + float(ability_rank) * 12.0)
			var bounds: Dictionary = main.arena
			position.x = clampf(position.x, 40.0, float(bounds.get("w", 1600)) - 40.0)
			position.y = clampf(position.y, 40.0, float(bounds.get("h", 1200)) - 40.0)
			dash_timer = maxf(dash_timer, 0.12)
			main.damage_circle(position, 120.0 + float(ability_rank) * 12.0, dmg, col)
			main.spawn_ring(position, col, 26.0)
		"heal":
			heal(30.0 + float(ability_rank) * 14.0)
			add_temp_bonus("armor", 5.0 + float(ability_rank) * 2.0, 5.0)
			main.damage_circle(position, 150.0, dmg * 0.5, col)
			main.spawn_ring(position, Color(0.45, 1.0, 0.55), 32.0)
		"buff":
			add_temp_bonus("atkSpd", 45.0 + float(ability_rank) * 10.0, 5.0)
			add_temp_bonus("speed", 15.0, 5.0)
			add_temp_bonus("crit", 15.0, 5.0)
			if id == "kralle":
				add_temp_bonus("armor", 40.0, 3.0)
			main.spawn_ring(position, col, 24.0)
		"shoot":
			var target: Node2D = main.nearest_enemy(position, 900.0)
			var firing_dir: Vector2 = facing
			if target != null:
				firing_dir = (target.position - position).normalized()
			for i in 8:
				var angle := TAU * float(i) / 8.0
				main.spawn_player_projectile(position + firing_dir * 18.0, Vector2.RIGHT.rotated(angle) * 560.0, dmg * 0.75, col, 7.0, 1)
			if id == "sprengsatz" or id == "luftschlag":
				if target != null:
					main.damage_circle(target.position, 150.0, dmg * 1.2, col)
					main.spawn_hazard(target.position, "blast", 110.0, 0.45, 0.0, col)
		"chain":
			var chained: Node2D = main.nearest_enemy(position, 500.0)
			if chained != null:
				main.damage_chain(position, chained, dmg, 5, 420.0, col)
		"collect":
			main.collect_radius(position, 320.0)
			add_temp_bonus("speed", 20.0, 4.0)
			add_temp_bonus("dmgP", 10.0, 4.0)
			main.spawn_ring(position, col, 30.0)
		"summon":
			main.spawn_turret(position, col, dmg)
			main.spawn_ring(position, col, 22.0)
		"nova":
			var radius := 240.0 + float(ability_rank) * 20.0
			main.damage_circle(position, radius, dmg, col)
			main.apply_slow_circle(position, radius, 0.45, 2.5)
			main.spawn_ring(position, col, radius * 0.8)
			if id == "markierung":
				main.mark_circle(position, 900.0, 5.0)
			if id == "notoperation":
				heal(15.0 + float(ability_rank) * 6.0)
		_:
			main.damage_circle(position, 200.0, dmg, col)
			main.spawn_ring(position, col, 24.0)
	return true


func _draw() -> void:
	var body := color()
	if hit_flash > 0.0:
		body = Color(1.0, 0.75, 0.7)
	if invuln > 0.0 and int(_anim * 24.0) % 2 == 0:
		body.a = 0.55
	draw_circle(Vector2.ZERO, radius + 5.0, Color(0.02, 0.04, 0.03, 0.45))
	draw_circle(Vector2.ZERO, radius, body)
	draw_circle(Vector2.ZERO, radius * 0.72, body.lightened(0.22))
	draw_arc(Vector2.ZERO, radius + 3.0, 0.0, TAU, 32, body.darkened(0.35), 2.5)
	if synergy_active:
		draw_arc(Vector2.ZERO, radius + 8.0, -PI * 0.8, PI * 0.8, 24, Color(1.0, 0.86, 0.35, 0.85), 2.0)
	if ability_cd <= 0.0 and not ability.is_empty():
		draw_circle(facing.normalized() * (radius + 13.0), 3.2, Color(0.55, 0.95, 1.0))
	# face / aim marker
	var eye := facing.normalized() * 5.0
	draw_circle(eye + Vector2(-4, -3), 2.4, Color(0.06, 0.08, 0.06))
	draw_circle(eye + Vector2(4, -3), 2.4, Color(0.06, 0.08, 0.06))
	draw_line(Vector2(0, 0), facing.normalized() * (radius + 16.0), Color(1.0, 1.0, 0.85, 0.7), 2.0)
	if dash_timer > 0.0:
		draw_arc(Vector2.ZERO, radius + 11.0, 0.0, TAU, 32, Color(0.55, 0.95, 1.0, 0.7), 3.0)
