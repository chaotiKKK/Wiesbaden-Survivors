extends Node2D
## Data-driven enemy and boss controller for all AI families in data.js.

var main: Node = null
var def: Dictionary = {}
var boss_data: Dictionary = {}
var boss := false
var elite := false
var elite_mark := false
var hp := 1.0
var max_hp := 1.0
var speed := 80.0
var damage := 5.0
var radius := 12.0
var armor := 0.0
var xp := 1.0
var mat := 1.0
var color := Color(1.0, 0.35, 0.4)
var ai := "chase"
var shape := "dot"
var wave := 1
var dead := false
var slow_t := 0.0
var stun_t := 0.0
var marked_t := 0.0
var buff_t := 0.0
var flash := 0.0
var split_tier := 0
var time := 0.0
var shoot_cd := 1.5
var summon_cd := 3.0
var heal_cd := 1.0
var trap_cd := 1.0
var mine_cd := 1.5
var beam_cd := 2.0
var slam_cd := 2.5
var wail_cd := 3.0
var drain_cd := 1.0
var blink_cd := 2.0
var charge_cd := 1.5
var charge_t := 0.0
var charge_dir := Vector2.RIGHT
var phase_index := -1
var phase_cd := 1.0
var spiral_angle := 0.0
var rng: RandomNumberGenerator


func setup(enemy_def: Dictionary, wave_num: int, danger: int, boss_def: Dictionary, main_ref: Node, rng_ref: RandomNumberGenerator, elite_in: bool = false) -> void:
	def = enemy_def
	boss_data = boss_def
	main = main_ref
	rng = rng_ref
	wave = wave_num
	boss = not boss_def.is_empty()
	elite = false
	elite_mark = false
	# The exported DANGERS table owns the difficulty curve; fall back to 1.0
	# when a data set predates the fields.
	var hp_mult := GameData.danger_value(danger, "hp", 1.0)
	var dmg_mult := GameData.danger_value(danger, "dmg", 1.0)
	var spd_mult := GameData.danger_value(danger, "spd", 1.0)
	if boss:
		max_hp = float(boss_data.get("hp", 800.0)) * 0.12 * (1.0 + float(wave) * 0.012) * hp_mult
		speed = float(boss_data.get("spd", 52.0)) * spd_mult
		damage = float(boss_data.get("dmg", 22.0)) * dmg_mult
		radius = float(boss_data.get("r", 46.0))
		armor = float(boss_data.get("armor", 10.0))
		xp = float(boss_data.get("xp", 40))
		mat = float(boss_data.get("mat", 60))
		color = GameData.color(boss_data.get("col", "#f4c25a"))
		ai = "boss"
		shape = "hex"
	else:
		max_hp = float(def.get("hp", 10.0)) * (1.0 + float(wave - 1) * 0.13) * hp_mult
		speed = float(def.get("spd", 90.0)) * (1.0 + float(wave) * 0.006) * spd_mult
		damage = float(def.get("dmg", 5.0)) * (1.0 + float(wave) * 0.025) * dmg_mult
		radius = float(def.get("r", 12.0))
		armor = float(def.get("armor", 0.0))
		xp = float(def.get("xp", 1))
		mat = float(def.get("mat", 1))
		color = GameData.color(def.get("col", "#ff5d6e"))
		ai = String(def.get("ai", "chase"))
		shape = String(def.get("shape", "dot"))
		elite_mark = String(def.get("id", "")) == "elite" or String(def.get("family", "")) == "elite"
		if elite_in and String(def.get("id", "")) != "elite":
			elite = true
			elite_mark = true
			max_hp *= 2.4
			speed *= 0.92
			damage *= 1.35
			radius *= 1.16
			armor += 4.0
			xp *= 2.2
			mat *= 2.5
			color = color.lightened(0.18)
	# Curse raises enemy LP and material yield for every newly spawned enemy.
	# Base damage stays untouched here: the player applies the curse damage
	# multiplier once to all incoming events (contact, bullets, hazards).
	if main != null and main.has_method("curse_hp_mult"):
		max_hp *= float(main.curse_hp_mult())
	if main != null and main.has_method("curse_mat_flat"):
		mat += float(main.curse_mat_flat())
	hp = max_hp
	shoot_cd = rng.randf_range(0.7, 1.9)
	summon_cd = rng.randf_range(2.0, 4.0)
	heal_cd = rng.randf_range(0.8, 1.8)
	trap_cd = rng.randf_range(0.6, 1.5)
	mine_cd = rng.randf_range(1.0, 2.0)
	beam_cd = rng.randf_range(1.4, 2.6)
	slam_cd = rng.randf_range(2.0, 3.4)
	wail_cd = rng.randf_range(2.5, 4.0)
	drain_cd = rng.randf_range(0.6, 1.4)
	blink_cd = rng.randf_range(1.2, 2.2)
	charge_cd = rng.randf_range(1.0, 2.0)
	phase_cd = 1.1
	queue_redraw()


func update_enemy(delta: float, target: Node2D, main_ref: Node) -> void:
	if dead or not is_instance_valid(target):
		return
	main = main_ref
	time += delta
	slow_t = maxf(0.0, slow_t - delta)
	stun_t = maxf(0.0, stun_t - delta)
	marked_t = maxf(0.0, marked_t - delta)
	buff_t = maxf(0.0, buff_t - delta)
	flash = maxf(0.0, flash - delta)
	if boss:
		_update_boss(delta, target)
		queue_redraw()
		return
	if stun_t > 0.0:
		queue_redraw()
		return
	var to: Vector2 = target.position - position
	var distance := to.length()
	var dir := to.normalized() if distance > 0.1 else Vector2.RIGHT
	var move_dir := dir
	match ai:
		"orbit":
			move_dir = (dir + dir.rotated(PI * 0.5) * 0.95).normalized()
		"ranged", "shooter", "sniper":
			var shot: Dictionary = def.get("shot", {})
			var reach := float(shot.get("range", 400.0))
			if distance > reach * 0.82:
				move_dir = dir
			else:
				move_dir = (dir.rotated(PI * 0.5) * 0.75 - dir * 0.18).normalized()
			shoot_cd -= delta
			if shoot_cd <= 0.0 and distance < reach * 1.35:
				var bullet_speed := float(shot.get("spd", 210.0))
				var bullet_damage := float(shot.get("dmg", damage * 0.8))
				var bullet_color := GameData.color(shot.get("col", color.to_html(false)))
				main.spawn_enemy_bullet(position, dir, bullet_damage, bullet_color, bullet_speed)
				shoot_cd = maxf(0.42, float(shot.get("cd", 2.0)))
		"charger":
			charge_cd -= delta
			if charge_t > 0.0:
				charge_t -= delta
				move_dir = charge_dir
			elif charge_cd <= 0.0 and distance < 390.0:
				charge_dir = dir
				charge_t = 0.52
				charge_cd = 2.7
				main.spawn_ring(position, color, 18.0)
			else:
				move_dir = dir
		"exploder":
			move_dir = dir
			if distance < radius + target.radius + 20.0:
				var boom: Dictionary = def.get("boom", {})
				var boom_radius := float(boom.get("r", 92.0))
				if distance <= boom_radius + target.radius:
					main.damage_player(float(boom.get("dmg", damage)))
				main.spawn_hazard(position, "blast", boom_radius, 0.45, 0.0, color)
				main.spawn_ring(position, color, boom_radius * 0.7)
				dead = true
				main.on_enemy_killed(self)
				queue_free()
				return
		"healer":
			move_dir = (dir.rotated(PI * 0.5) * 0.4 - dir * 0.1).normalized()
			heal_cd -= delta
			if heal_cd <= 0.0:
				var heal_spec: Dictionary = def.get("heal", {})
				var heal_radius := float(heal_spec.get("r", 190.0))
				for other in main.enemies:
					if other == self or not is_instance_valid(other) or other.dead:
						continue
					if other.position.distance_to(position) <= heal_radius:
						other.hp = minf(other.max_hp, other.hp + float(heal_spec.get("amt", 8.0)))
						other.queue_redraw()
				main.spawn_ring(position, Color(0.45, 1.0, 0.55), heal_radius * 0.5)
				heal_cd = maxf(0.8, float(heal_spec.get("cd", 1.7)))
		"aura":
			move_dir = dir * 0.8
		"summoner":
			if distance > 330.0:
				move_dir = dir
			else:
				move_dir = dir.rotated(PI * 0.5) * 0.45
			summon_cd -= delta
			if summon_cd <= 0.0:
				var summon_spec: Dictionary = def.get("summon", {})
				main.summon_minions(summon_spec, position, int(summon_spec.get("n", 3)))
				main.spawn_ring(position, color, 28.0)
				summon_cd = maxf(1.6, float(summon_spec.get("cd", 4.5)))
		"teleport":
			blink_cd -= delta
			if blink_cd <= 0.0:
				var blink: Dictionary = def.get("blink", {})
				var angle := rng.randf_range(0.0, TAU)
				var distance_out := rng.randf_range(float(blink.get("min", 110.0)), float(blink.get("max", 250.0)))
				position = target.position + Vector2.RIGHT.rotated(angle) * distance_out
				blink_cd = maxf(1.0, float(blink.get("cd", 2.4)))
				main.spawn_ring(position, color, 22.0)
			move_dir = dir * 0.65
		"spiral":
			var shot: Dictionary = def.get("shot", {})
			if distance > 260.0:
				move_dir = dir * 0.6
			else:
				move_dir = dir.rotated(PI * 0.5) * 0.7
			shoot_cd -= delta
			if shoot_cd <= 0.0:
				spiral_angle += 0.52
				main.spawn_enemy_radial(position, int(def.get("radial", 6)), float(shot.get("spd", 200.0)), float(shot.get("dmg", 5.0)), color, spiral_angle)
				shoot_cd = maxf(0.8, float(shot.get("cd", 2.1)))
		"mortar":
			move_dir = dir * 0.45
			shoot_cd -= delta
			if shoot_cd <= 0.0:
				var lob: Dictionary = def.get("lob", {})
				if distance <= float(lob.get("range", 620.0)):
					main.spawn_hazard(target.position, "mortar", float(lob.get("r", 74.0)), float(lob.get("flight", 1.35)), float(lob.get("dmg", 16.0)), color)
				shoot_cd = maxf(1.2, float(lob.get("cd", 3.2)))
		"weaver":
			move_dir = (dir.rotated(PI * 0.5) * 0.6 + dir * 0.4).normalized()
			trap_cd -= delta
			if trap_cd <= 0.0:
				var web: Dictionary = def.get("web", {})
				main.spawn_hazard(target.position, "web", float(web.get("r", 58.0)), float(web.get("life", 5.0)), 0.0, color, float(web.get("slow", 0.45)))
				trap_cd = maxf(0.8, float(web.get("cd", 1.5)))
		"sentinel":
			move_dir = dir * 0.25
			beam_cd -= delta
			if beam_cd <= 0.0:
				var beam: Dictionary = def.get("beam", {})
				var beam_dir := dir
				main.spawn_hazard(position, "beam", float(beam.get("w", 16.0)), 1.15, float(beam.get("dmg", 15.0)), color, 0.0, beam_dir, float(beam.get("range", 560.0)))
				beam_cd = maxf(1.8, float(beam.get("cd", 3.6)))
		"leech":
			move_dir = dir
			drain_cd -= delta
			if drain_cd <= 0.0 and distance < 190.0:
				var drain: Dictionary = def.get("drain", {})
				main.damage_player(float(drain.get("dps", 7.0)) * 1.6)
				hp = minf(max_hp, hp + float(drain.get("dps", 7.0)) * float(drain.get("heal", 0.8)) * 1.6)
				main.spawn_ring(position, color, 18.0)
				drain_cd = maxf(1.0, float(drain.get("cd", 3.4)))
		"bomber":
			move_dir = (dir + dir.rotated(PI * 0.5) * 0.35).normalized()
			mine_cd -= delta
			if mine_cd <= 0.0:
				var mine: Dictionary = def.get("mine", {})
				main.spawn_hazard(position, "mine", float(mine.get("r", 78.0)), float(mine.get("fuse", 1.7)), float(mine.get("dmg", 17.0)), color)
				mine_cd = maxf(1.0, float(mine.get("cd", 2.3)))
		"juggernaut":
			move_dir = dir
			slam_cd -= delta
			if slam_cd <= 0.0 and distance < 320.0:
				var slam: Dictionary = def.get("slam", {})
				main.spawn_hazard(target.position, "slam", float(slam.get("r", 132.0)), float(slam.get("warn", 0.7)), float(slam.get("dmg", 18.0)), color)
				slam_cd = maxf(2.0, float(slam.get("cd", 4.2)))
		"siren":
			move_dir = (dir.rotated(PI * 0.5) * 0.7 + dir * 0.3).normalized()
			wail_cd -= delta
			if wail_cd <= 0.0:
				var wail: Dictionary = def.get("wail", {})
				if distance <= float(wail.get("r", 260.0)):
					target.slow_t = maxf(target.slow_t, float(wail.get("dur", 4.5)))
					target.ability_cd = maxf(target.ability_cd, float(wail.get("cdPenalty", 1.2)))
				main.spawn_hazard(position, "wail", float(wail.get("r", 260.0)), 0.65, 0.0, color, 0.0)
				wail_cd = maxf(2.4, float(wail.get("cd", 5.2)))
		"mirror", "shielded", "chase", "burrower", "trapper", "tether", "commander":
			move_dir = dir
		_:
			move_dir = dir
	var speed_mult := 1.0
	if slow_t > 0.0:
		speed_mult *= 0.48
	if buff_t > 0.0:
		speed_mult *= 1.1
	if charge_t > 0.0 and ai == "charger":
		speed_mult *= 2.55
	position += move_dir * speed * speed_mult * delta
	_clamp_to_arena()
	queue_redraw()


func _update_boss(delta: float, target: Node2D) -> void:
	var to: Vector2 = target.position - position
	var distance := to.length()
	var dir := to.normalized() if distance > 0.1 else Vector2.RIGHT
	var ratio := hp / maxf(1.0, max_hp)
	var phases: Array = boss_data.get("phases", [])
	if phases.is_empty():
		phases = [{"at": 1.0, "pattern": "radial", "cd": 2.0, "n": 12, "bs": 190, "bd": 12}]
	var active_index := 0
	for i in phases.size():
		var entry: Dictionary = phases[i]
		if ratio <= float(entry.get("at", 1.0)):
			active_index = i
			break
	if active_index != phase_index:
		phase_index = active_index
		phase_cd = 0.9
		main.spawn_ring(position, color, radius * 1.7)
	phase_cd -= delta
	var phase_def: Dictionary = phases[clampi(active_index, 0, phases.size() - 1)]
	speed = float(phase_def.get("spd", boss_data.get("spd", 52.0)))
	if distance > 190.0:
		position += dir * speed * 0.62 * delta
	elif distance < 110.0:
		position -= dir * speed * 0.35 * delta
	else:
		position += dir.rotated(PI * 0.5) * speed * 0.35 * delta
	_clamp_to_arena()
	if phase_cd > 0.0:
		return
	var pattern := String(phase_def.get("pattern", "radial"))
	var count := int(phase_def.get("n", 12))
	var bullet_speed := float(phase_def.get("bs", 190.0))
	var bullet_damage := float(phase_def.get("bd", damage * 0.55))
	var cooldown := float(phase_def.get("cd", 2.0))
	match pattern:
		"spiral":
			spiral_angle += 0.45
			main.spawn_enemy_radial(position, count, bullet_speed, bullet_damage, color, spiral_angle)
		"crossfire":
			main.spawn_enemy_radial(position, count, bullet_speed, bullet_damage, color, 0.0)
			for i in 4:
				var cross_dir := Vector2.RIGHT.rotated(TAU * float(i) / 4.0)
				main.spawn_enemy_bullet(position, cross_dir, bullet_damage * 0.6, color, bullet_speed * 0.8)
		"shotgunBurst":
			for i in count:
				var spread := (float(i) / float(maxi(1, count - 1)) - 0.5) * 0.95
				main.spawn_enemy_bullet(position, dir.rotated(spread), bullet_damage, color, bullet_speed)
		"rails":
			for i in count:
				var offset := (float(i) - float(count - 1) * 0.5) * 70.0
				var origin := position + dir.rotated(PI * 0.5) * offset
				main.spawn_hazard(origin, "beam", 18.0, 1.2, bullet_damage, color, 0.0, dir, 900.0)
		"waterjet", "steamCone":
			var opening := 0.55 if pattern == "waterjet" else 0.85
			for i in maxi(4, count):
				var spread := (float(i) / float(maxi(1, count - 1)) - 0.5) * opening
				main.spawn_enemy_bullet(position, dir.rotated(spread), bullet_damage * 0.7, color, bullet_speed)
			main.spawn_hazard(position, "beam", 22.0, 0.8, bullet_damage * 0.5, color, 0.0, dir, 430.0)
		"arenaHazard", "geysers", "stoneRain":
			for i in maxi(2, count):
				var angle := rng.randf_range(0.0, TAU)
				var spread_distance := rng.randf_range(55.0, 260.0)
				var spot: Vector2 = target.position + Vector2.RIGHT.rotated(angle) * spread_distance
				main.spawn_hazard(spot, "geyser" if pattern == "geysers" else "trap", 68.0, 1.1, bullet_damage, color)
		"orbitMines":
			for i in maxi(4, count):
				var angle := TAU * float(i) / float(maxi(1, count))
				main.spawn_hazard(position + Vector2.RIGHT.rotated(angle) * 150.0, "mine", 52.0, rng.randf_range(1.4, 2.4), bullet_damage, color)
		"wailRings", "bellwave", "shockwave":
			main.spawn_enemy_radial(position, count, bullet_speed, bullet_damage, color, time * 0.25)
			if pattern == "wailRings":
				target.slow_t = maxf(target.slow_t, 1.2)
		"charge":
			main.spawn_enemy_radial(position, count, bullet_speed, bullet_damage, color)
			position += dir * 62.0
			_clamp_to_arena()
		"bulletHell":
			main.spawn_enemy_radial(position, count, bullet_speed, bullet_damage, color, time)
			main.spawn_enemy_radial(position, maxi(3, count / 2), bullet_speed * 0.8, bullet_damage * 0.7, color, time * 0.5 + PI)
		_:
			main.spawn_enemy_radial(position, count, bullet_speed, bullet_damage, color)
	if phase_def.has("summon"):
		main.summon_minions({"id": String(phase_def.get("summon", "runner")), "n": 2}, position, 2)
	phase_cd = maxf(0.65, cooldown)


func _clamp_to_arena() -> void:
	var bounds: Dictionary = main.arena
	position.x = clampf(position.x, radius + 8.0, float(bounds.get("w", 1600)) - radius - 8.0)
	position.y = clampf(position.y, radius + 8.0, float(bounds.get("h", 1200)) - radius - 8.0)


func take_damage(amount: float, _hit_color: Color = Color.WHITE) -> float:
	if dead:
		return 0.0
	var total_armor := armor
	for other in main.enemies:
		if other == self or not is_instance_valid(other) or other.dead:
			continue
		if other.ai != "aura":
			continue
		var aura: Dictionary = other.def.get("aura", {})
		if other.position.distance_to(position) <= float(aura.get("r", 170.0)):
			total_armor += float(aura.get("armor", 6.0))
	var mitigated := maxf(1.0, amount - total_armor * 0.55)
	if marked_t > 0.0:
		mitigated *= 1.35
	if def.get("phase", false) and fmod(time, 4.0) < 0.8:
		mitigated *= 0.35
	var actual := minf(hp, maxf(0.0, mitigated))
	hp -= actual
	flash = 0.09
	if def.has("reflect") and not boss and actual > 0.0:
		main.damage_player(actual * float(def.get("reflect", 0.0)))
	if hp <= 0.0:
		die()
	else:
		queue_redraw()
	return actual


func die() -> void:
	if dead:
		return
	dead = true
	if main != null:
		main.on_enemy_killed(self)
	queue_free()


func on_contact_player() -> void:
	if def.has("vamp"):
		hp = minf(max_hp, hp + damage * float(def.get("vamp", 0.35)))
		main.spawn_ring(position, color, 16.0)


func _draw() -> void:
	var draw_color := color
	if flash > 0.0:
		draw_color = Color(1.0, 1.0, 1.0)
	if boss:
		_draw_boss(draw_color)
		return
	if elite_mark:
		draw_circle(Vector2.ZERO, radius + 7.0, Color(1.0, 0.85, 0.28, 0.12))
		draw_arc(Vector2.ZERO, radius + 7.0, 0.0, TAU, 28, Color(1.0, 0.85, 0.28, 0.8), 2.0)
	match shape:
		"tri":
			var p := PackedVector2Array([Vector2(0, -radius), Vector2(radius * 0.9, radius * 0.7), Vector2(-radius * 0.9, radius * 0.7)])
			draw_colored_polygon(p, draw_color)
		"box":
			draw_rect(Rect2(-radius, -radius, radius * 2.0, radius * 2.0), draw_color)
		"diamond":
			var p := PackedVector2Array([Vector2(0, -radius), Vector2(radius, 0), Vector2(0, radius), Vector2(-radius, 0)])
			draw_colored_polygon(p, draw_color)
		"hex":
			var p := PackedVector2Array()
			for i in 6:
				p.append(Vector2(cos(TAU * float(i) / 6.0), sin(TAU * float(i) / 6.0)) * radius)
			draw_colored_polygon(p, draw_color)
		"star":
			var p := PackedVector2Array()
			for i in 10:
				var r := radius if i % 2 == 0 else radius * 0.48
				p.append(Vector2(cos(-PI * 0.5 + TAU * float(i) / 10.0), sin(-PI * 0.5 + TAU * float(i) / 10.0)) * r)
			draw_colored_polygon(p, draw_color)
		"gear":
			var p := PackedVector2Array()
			for i in 16:
				var r := radius if i % 2 == 0 else radius * 0.68
				p.append(Vector2(cos(TAU * float(i) / 16.0), sin(TAU * float(i) / 16.0)) * r)
			draw_colored_polygon(p, draw_color)
		"cross":
			draw_rect(Rect2(-radius * 0.4, -radius, radius * 0.8, radius * 2.0), draw_color)
			draw_rect(Rect2(-radius, -radius * 0.4, radius * 2.0, radius * 0.8), draw_color)
		"turret":
			draw_circle(Vector2.ZERO, radius * 0.78, draw_color)
			draw_rect(Rect2(-4.0, -radius - 8.0, 8.0, radius + 8.0), draw_color.darkened(0.2))
		"spider":
			draw_circle(Vector2.ZERO, radius * 0.7, draw_color)
			for i in 6:
				var a := TAU * float(i) / 6.0
				draw_line(Vector2.ZERO, Vector2.RIGHT.rotated(a) * radius * 1.25, draw_color.darkened(0.25), 2.0)
		"worm":
			for i in 3:
				draw_circle(Vector2(-float(i) * radius * 0.55, 0), radius * (0.8 - float(i) * 0.14), draw_color)
		"wing":
			var p := PackedVector2Array([Vector2(0, -radius), Vector2(radius * 1.25, radius * 0.25), Vector2(0, radius * 0.2), Vector2(-radius * 1.25, radius * 0.25)])
			draw_colored_polygon(p, draw_color)
		"prism":
			var p := PackedVector2Array([Vector2(0, -radius), Vector2(radius, radius * 0.55), Vector2(0, radius), Vector2(-radius, radius * 0.55)])
			draw_colored_polygon(p, draw_color)
			draw_line(Vector2(0, -radius), Vector2(0, radius), Color(1.0, 1.0, 1.0, 0.45), 1.0)
		"brick":
			draw_rect(Rect2(-radius, -radius * 0.8, radius * 2.0, radius * 1.6), draw_color)
			draw_line(Vector2(-radius, 0), Vector2(radius, 0), draw_color.darkened(0.25), 2.0)
		"wave":
			draw_arc(Vector2.ZERO, radius, -PI * 0.8, PI * 0.8, 20, draw_color, 4.0)
			draw_arc(Vector2.ZERO, radius * 0.65, PI * 0.2, PI * 1.8, 20, draw_color, 3.0)
		"eye":
			draw_circle(Vector2.ZERO, radius, draw_color)
			draw_circle(Vector2.ZERO, radius * 0.55, Color(0.08, 0.06, 0.08))
			draw_circle(Vector2.ZERO, radius * 0.28, draw_color.lightened(0.4))
		_:
			draw_circle(Vector2.ZERO, radius, draw_color)
	if slow_t > 0.0:
		draw_arc(Vector2.ZERO, radius + 3.0, 0.0, TAU, 24, Color(0.4, 0.9, 1.0, 0.8), 2.0)
	if stun_t > 0.0:
		draw_arc(Vector2.ZERO, radius + 5.0, 0.0, TAU, 20, Color(1.0, 0.9, 0.3, 0.9), 2.0)
	if marked_t > 0.0:
		draw_arc(Vector2.ZERO, radius + 9.0, 0.0, TAU, 24, Color(1.0, 0.55, 0.2, 0.9), 2.0)
	draw_circle(Vector2(-radius * 0.28, -radius * 0.18), maxf(1.5, radius * 0.1), Color(0.05, 0.05, 0.05))
	draw_circle(Vector2(radius * 0.28, -radius * 0.18), maxf(1.5, radius * 0.1), Color(0.05, 0.05, 0.05))
	if elite_mark:
		draw_circle(Vector2(0, -radius - 9.0), 4.0, Color(1.0, 0.86, 0.3))


func _draw_boss(draw_color: Color) -> void:
	draw_circle(Vector2.ZERO, radius + 10.0, Color(color.r, color.g, color.b, 0.16))
	draw_circle(Vector2.ZERO, radius, draw_color.darkened(0.08))
	draw_arc(Vector2.ZERO, radius + 4.0, 0.0, TAU, 48, color.lightened(0.25), 4.0)
	draw_circle(Vector2(-radius * 0.3, -radius * 0.2), radius * 0.1, Color(0.05, 0.05, 0.05))
	draw_circle(Vector2(radius * 0.3, -radius * 0.2), radius * 0.1, Color(0.05, 0.05, 0.05))
	var bar_w := radius * 2.8
	var bar_pos := Vector2(-bar_w * 0.5, -radius - 24.0)
	draw_rect(Rect2(bar_pos, Vector2(bar_w, 8.0)), Color(0.04, 0.06, 0.04, 0.8))
	draw_rect(Rect2(bar_pos, Vector2(bar_w * (hp / maxf(1.0, max_hp)), 8.0)), color)
	if slow_t > 0.0:
		draw_arc(Vector2.ZERO, radius + 8.0, 0.0, TAU, 24, Color(0.4, 0.9, 1.0, 0.8), 2.0)
