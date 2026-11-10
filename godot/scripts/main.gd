extends Node2D
## Wiesbaden Survivors — Godot 4 vertical slice.
## Owns the real run loop: start_run -> waves -> combat -> XP/level-up -> shop.
## The full data.js registries are loaded, but this build deliberately keeps the
## combat model readable instead of re-implementing every browser special case.

const PlayerScript = preload("res://scripts/player.gd")
const EnemyScript = preload("res://scripts/enemy.gd")
const ProjectileScript = preload("res://scripts/projectile.gd")
const PickupScript = preload("res://scripts/pickup.gd")
const TouchScript = preload("res://scripts/touch_controls.gd")
const UIScript = preload("res://scripts/ui.gd")
const HazardScript = preload("res://scripts/hazard.gd")
const TurretScript = preload("res://scripts/turret.gd")
const RingScript = preload("res://scripts/ring.gd")

enum State { TITLE, PLAYING, LEVELUP, SHOP, PAUSED, DEAD, WIN }

var state := State.TITLE
var world: Node2D
var player: Node2D = null
var camera: Camera2D
var ui: CanvasLayer
var touch: Control
var arena: Dictionary = {}
var rng := RandomNumberGenerator.new()
var workshop_rng := RandomNumberGenerator.new()

var seed_value := 12648430
var danger := 3
var selected_char := "leonidas"
var wave := 0
var wave_time := 0.0
var wave_duration := 22.0
var spawn_left := 0
var spawn_timer := 0.0
var spawn_interval := 0.8
var game_time := 0.0
var run_kills := 0
var run_materials := 0
var material_carry := 0.0
var heal_orbs_spawned := 0
var boss: Node2D = null
var pending_levels := 0
var levelup_to_shop := false
var hud_timer := 0.0
var enemies: Array = []
var projectiles: Array = []
var enemy_bullets: Array = []
var pickups: Array = []
var hazards: Array = []
var turrets: Array = []
var effects: Array = []
var wave_event: Dictionary = {}
var endless := false
var elites_spawned := 0
var elite_opening := false

var level_offers: Array = []
var shop_offers: Array = []
var shop_workshop: Array = []
var shop_reroll_count := 0
var shop_reroll_cost := 8
var high_score := 0
var touch_mode := false
var save_path := "user://wbn_godot.save"
var meta: Dictionary = {}
var run_save: Dictionary = {}
var last_save_error := ""
const SAVE_VERSION := 2


func _ready() -> void:
	_init_meta()
	_load_progress()
	rng.seed = seed_value
	workshop_rng.seed = seed_value ^ 0x5f3759df
	world = Node2D.new()
	add_child(world)
	camera = Camera2D.new()
	add_child(camera)
	ui = UIScript.new()
	add_child(ui)
	ui.start_game.connect(_on_start_game)
	ui.pause_requested.connect(toggle_pause)
	ui.resume_requested.connect(toggle_pause)
	ui.restart_requested.connect(_on_restart)
	ui.menu_requested.connect(_on_menu)
	ui.level_pick.connect(_on_level_pick)
	ui.shop_buy.connect(_on_shop_buy)
	ui.shop_reroll.connect(_on_shop_reroll)
	ui.shop_lock.connect(_on_shop_lock)
	ui.shop_merge.connect(_on_shop_merge)
	ui.shop_recycle.connect(_on_shop_recycle)
	ui.shop_workshop_buy.connect(_on_shop_workshop_buy)
	ui.shop_continue.connect(_on_shop_continue)
	ui.endless_requested.connect(_on_endless)
	ui.run_resume_requested.connect(_on_resume)
	touch = TouchScript.new()
	add_child(touch)
	touch.dash_pressed.connect(_on_dash)
	touch.ability_pressed.connect(_on_ability)
	touch_mode = OS.has_feature("mobile") or DisplayServer.is_touchscreen_available()
	touch.enable(touch_mode)
	ui.set_unlocked_chars(meta.get("unlocked_chars", []))
	ui.set_meta_summary(_meta_summary())
	ui.set_resume_available(not run_save.is_empty(), _resume_label())
	ui.show_title()
	queue_redraw()


func _process(delta: float) -> void:
	if state == State.PLAYING:
		tick(delta)
	if player != null and is_instance_valid(player):
		camera.position = camera.position.lerp(player.position, 1.0 - exp(-delta * 9.0))
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		toggle_pause()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventKey and event.pressed and not event.echo:
		var key := (event as InputEventKey).keycode
		if key == KEY_SHIFT or key == KEY_SPACE:
			_on_dash()
			get_viewport().set_input_as_handled()
		elif key == KEY_E or key == KEY_Q:
			_on_ability()
			get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		toggle_pause()


func _draw() -> void:
	if arena.is_empty():
		return
	var width := float(arena.get("w", 1600))
	var height := float(arena.get("h", 1200))
	var ground: Color = GameData.color(arena.get("ground", "#1e3d2e"))
	var grid: Color = GameData.color(arena.get("grid", "#2a543d"))
	var accent: Color = GameData.color(arena.get("accent", "#5dff9b"))
	draw_rect(Rect2(0, 0, width, height), ground)
	for x in range(0, int(width) + 1, 80):
		draw_line(Vector2(x, 0), Vector2(x, height), Color(grid.r, grid.g, grid.b, 0.55), 1.0)
	for y in range(0, int(height) + 1, 80):
		draw_line(Vector2(0, y), Vector2(width, y), Color(grid.r, grid.g, grid.b, 0.55), 1.0)
	# A few arena landmarks keep the large field readable on a phone.
	for i in 7:
		var px := fmod(float(i * 233 + 180), width)
		var py := fmod(float(i * 157 + 160), height)
		draw_circle(Vector2(px, py), 34.0, Color(accent.r, accent.g, accent.b, 0.08))
		draw_arc(Vector2(px, py), 34.0, 0.0, TAU, 28, Color(accent.r, accent.g, accent.b, 0.25), 2.0)
	draw_rect(Rect2(0, 0, width, height), accent, false, 5.0)


func spawn_center() -> Vector2:
	return Vector2(float(arena.get("w", 1600)) * 0.5, float(arena.get("h", 1200)) * 0.5)


func _select_arena(seed_for_arena: int) -> Dictionary:
	if GameData.arenas.is_empty():
		return {"w": 1600, "h": 1200, "ground": "#1e3d2e", "grid": "#2a543d", "accent": "#5dff9b"}
	return GameData.arenas[absi(seed_for_arena) % GameData.arenas.size()]


func _on_start_game(char_id: String, seed_in: int, danger_in: int) -> void:
	start_run(char_id, seed_in, danger_in)


func _on_resume() -> void:
	if run_save.is_empty():
		return
	resume_run()


func start_run(char_id: String, seed_in: int, danger_in: int, resume: Dictionary = {}) -> void:
	if not GameData.loaded:
		push_error("GameData nicht geladen: " + GameData.load_error)
		return
	if not resume.is_empty():
		char_id = String(resume.get("char", char_id))
		seed_in = int(resume.get("seed", seed_in))
		danger_in = int(resume.get("danger", danger_in))
	if GameData.character(char_id).is_empty():
		char_id = "leonidas"
	selected_char = char_id
	seed_value = seed_in if seed_in > 0 else 12648430
	danger = clampi(danger_in, 0, 5)
	rng.seed = seed_value
	workshop_rng.seed = seed_value ^ 0x5f3759df
	_clear_world()
	arena = _select_arena(seed_value)
	queue_redraw()
	player = PlayerScript.new()
	player.setup(GameData.character(char_id), self)
	player.died.connect(_on_player_died)
	player.curse_changed.connect(_on_curse_changed)
	world.add_child(player)
	player.position = spawn_center()
	camera.position = player.position
	camera.limit_left = 0
	camera.limit_top = 0
	camera.limit_right = int(arena.get("w", 1600))
	camera.limit_bottom = int(arena.get("h", 1200))
	camera.enabled = true
	state = State.PLAYING
	wave = 0
	game_time = 0.0
	run_kills = 0
	run_materials = 0
	material_carry = 0.0
	heal_orbs_spawned = 0
	pending_levels = 0
	levelup_to_shop = false
	boss = null
	endless = false
	wave_event = {}
	elites_spawned = 0
	elite_opening = false
	shop_offers = []
	shop_workshop = []
	shop_reroll_count = 0
	shop_reroll_cost = 5 + maxi(0, wave)
	hud_timer = 0.0
	ui.hide_all()
	touch.enable(touch_mode)
	if not resume.is_empty():
		_restore_run_state(resume)
		return
	meta.runs = int(meta.get("runs", 0)) + 1
	state = State.PLAYING
	ui.show_hud()
	start_wave(1)
	update_hud()
	save_progress()


func _clear_world() -> void:
	for child in world.get_children():
		child.queue_free()
	enemies.clear()
	projectiles.clear()
	enemy_bullets.clear()
	pickups.clear()
	hazards.clear()
	turrets.clear()
	effects.clear()
	player = null
	boss = null


func start_wave(n: int) -> void:
	wave = maxi(1, n)
	wave_time = 0.0
	wave_duration = minf(75.0, 22.0 + minf(18.0, float(wave) * 0.65))
	wave_event = {}
	if danger >= 3 and GameData.wave_events.has(str(wave)):
		wave_event = (GameData.wave_events[str(wave)] as Dictionary).duplicate(true)
	elite_opening = String(wave_event.get("kind", "")) == "elite"
	var event_mult := float(wave_event.get("mult", 1.0))
	var count_mult := GameData.danger_value(danger, "cnt", 1.0)
	spawn_left = mini(160, int(round(float(8 + wave * 3) * event_mult * count_mult)))
	spawn_timer = 0.55
	spawn_interval = maxf(0.14, 1.05 - float(wave) * 0.035)
	boss = null
	if wave % 5 == 0:
		_spawn_boss()
	ui.show_hud()
	touch.enable(touch_mode)
	update_hud()
	save_progress()


func tick(delta: float) -> void:
	if state != State.PLAYING or player == null or not is_instance_valid(player) or not player.alive:
		return
	game_time += delta
	wave_time += delta
	player.update(delta)
	if player.level_ups > 0:
		pending_levels += player.level_ups
		player.level_ups = 0
	for enemy in enemies.duplicate():
		if is_instance_valid(enemy) and not enemy.dead:
			enemy.update_enemy(delta, player, self)
	_update_projectiles(delta)
	_update_enemy_bullets(delta)
	_update_hazards(delta)
	_update_turrets(delta)
	_update_effects(delta)
	_update_pickups(delta)
	_update_contacts()
	_update_spawning(delta)
	if pending_levels > 0 and state == State.PLAYING:
		_show_levelup()
		return
	if wave_time >= wave_duration and (boss == null or not is_instance_valid(boss)):
		_end_wave()
		return
	hud_timer -= delta
	if hud_timer <= 0.0:
		hud_timer = 0.12
		update_hud()


func _update_spawning(delta: float) -> void:
	if spawn_left <= 0:
		return
	spawn_timer -= delta
	if spawn_timer > 0.0:
		return
	var cap := int(GameData.rules.get("maxEnemiesOnScreen", 100))
	if enemies.size() >= cap:
		spawn_timer = 0.2
		return
	_spawn_enemy()
	spawn_left -= 1
	spawn_timer = spawn_interval


func _spawn_enemy(def_override: Dictionary = {}, elite_override: bool = false) -> void:
	var def: Dictionary = def_override
	if def.is_empty():
		def = GameData.pick_enemy(wave, rng)
	if def.is_empty():
		return
	var elite_roll := elite_override
	if elite_opening:
		elite_roll = true
		elite_opening = false
	if not elite_roll and not wave_event.is_empty() and rng.randf() < float(wave_event.get("eliteRate", 0.0)):
		elite_roll = true
	var enemy := EnemyScript.new()
	enemy.setup(def, wave, danger, {}, self, rng, elite_roll)
	enemy.position = _edge_spawn()
	world.add_child(enemy)
	enemies.append(enemy)
	if elite_roll:
		elites_spawned += 1


func _spawn_boss() -> void:
	var boss_def: Dictionary = GameData.boss_for_wave(wave)
	if boss_def.is_empty():
		return
	var enemy := EnemyScript.new()
	enemy.setup({}, wave, danger, boss_def, self, rng)
	enemy.position = Vector2(float(arena.get("w", 1600)) * 0.5, 130.0)
	world.add_child(enemy)
	enemies.append(enemy)
	boss = enemy
	var escort_count := maxi(0, int(GameData.danger_value(danger, "bossEscort", 0.0)))
	if wave < int(GameData.danger_value(danger, "bossEscortFrom", 1.0)):
		escort_count = 0
	for i in escort_count:
		var escort_def: Dictionary = GameData.pick_enemy(wave, rng)
		if escort_def.is_empty():
			continue
		var escort := EnemyScript.new()
		escort.setup(escort_def, wave, danger, {}, self, rng, true)
		escort.position = enemy.position + Vector2.RIGHT.rotated(TAU * float(i) / float(maxi(1, escort_count))) * 105.0
		world.add_child(escort)
		enemies.append(escort)
		elites_spawned += 1
	if escort_count > 0:
		spawn_ring(enemy.position, Color(1.0, 0.86, 0.3), 100.0)


func _edge_spawn() -> Vector2:
	var width := float(arena.get("w", 1600))
	var height := float(arena.get("h", 1200))
	match rng.randi_range(0, 3):
		0:
			return Vector2(rng.randf_range(40.0, width - 40.0), 40.0)
		1:
			return Vector2(rng.randf_range(40.0, width - 40.0), height - 40.0)
		2:
			return Vector2(40.0, rng.randf_range(40.0, height - 40.0))
		_:
			return Vector2(width - 40.0, rng.randf_range(40.0, height - 40.0))


func spawn_player_projectile(pos: Vector2, velocity: Vector2, damage: float, color: Color, radius: float = 5.0, pierce: int = 0) -> void:
	var projectile := ProjectileScript.new()
	projectile.setup(pos - position, velocity, damage, color, radius, pierce, true)
	world.add_child(projectile)
	projectiles.append(projectile)


func spawn_enemy_bullet(pos: Vector2, dir: Vector2, damage: float, color: Color, speed: float = 210.0) -> void:
	if enemy_bullets.size() >= 500:
		return
	var bullet := ProjectileScript.new()
	bullet.setup(pos - position, dir.normalized() * speed, damage, color, 7.0, 0, false)
	world.add_child(bullet)
	enemy_bullets.append(bullet)


func spawn_enemy_radial(pos: Vector2, count: int, speed: float, damage: float, color: Color, offset: float = 0.0) -> void:
	for i in maxi(1, count):
		if enemy_bullets.size() >= 500:
			break
		var d := Vector2.RIGHT.rotated(offset + TAU * float(i) / float(maxi(1, count)))
		var bullet := ProjectileScript.new()
		bullet.setup(pos - position, d * speed, damage, color, 7.0, 0, false)
		world.add_child(bullet)
		enemy_bullets.append(bullet)


func summon_minions(spec: Dictionary, pos: Vector2, count: int) -> void:
	var id := String(spec.get("id", "runner"))
	var def: Dictionary = GameData.enemy_by_id.get(id, {})
	if def.is_empty():
		return
	var cap := int(GameData.rules.get("maxEnemiesOnScreen", 100))
	for i in maxi(1, count):
		if enemies.size() >= cap:
			break
		var enemy := EnemyScript.new()
		enemy.setup(def, wave, danger, {}, self, rng)
		enemy.position = pos + Vector2(rng.randf_range(-40.0, 40.0), rng.randf_range(-40.0, 40.0))
		world.add_child(enemy)
		enemies.append(enemy)


func spawn_pickup(pos: Vector2, kind: String, value: float, color: Color) -> void:
	var pickup := PickupScript.new()
	pickup.setup(pos, kind, value, color, Vector2(rng.randf_range(-30.0, 30.0), rng.randf_range(-30.0, 30.0)))
	world.add_child(pickup)
	pickups.append(pickup)


func spawn_ring(pos: Vector2, color: Color, radius: float) -> void:
	if effects.size() >= 60:
		return
	var ring := RingScript.new()
	ring.setup(pos, color, radius)
	world.add_child(ring)
	effects.append(ring)


func _update_effects(delta: float) -> void:
	for effect in effects.duplicate():
		if not is_instance_valid(effect):
			effects.erase(effect)
			continue
		if effect.tick(delta):
			effects.erase(effect)
			effect.queue_free()


func spawn_hazard(pos: Vector2, kind: String, radius: float, duration: float, damage: float, color: Color, slow: float = 0.0, dir: Vector2 = Vector2.ZERO, length: float = 0.0) -> void:
	var hazard := HazardScript.new()
	hazard.setup(self, pos, kind, radius, duration, damage, color, slow, dir, length)
	world.add_child(hazard)
	hazards.append(hazard)


func spawn_turret(pos: Vector2, color: Color, damage: float) -> void:
	var turret := TurretScript.new()
	turret.setup(self, pos, color, damage)
	world.add_child(turret)
	turrets.append(turret)


func _update_hazards(delta: float) -> void:
	for hazard in hazards.duplicate():
		if not is_instance_valid(hazard):
			hazards.erase(hazard)
			continue
		if hazard.tick(delta, player):
			hazards.erase(hazard)
			hazard.queue_free()


func _update_turrets(delta: float) -> void:
	for turret in turrets.duplicate():
		if not is_instance_valid(turret):
			turrets.erase(turret)
			continue
		if turret.tick(delta):
			turrets.erase(turret)
			turret.queue_free()


func _update_projectiles(delta: float) -> void:
	for projectile in projectiles.duplicate():
		if not is_instance_valid(projectile):
			projectiles.erase(projectile)
			continue
		projectile.tick(delta)
		var hit := false
		for enemy in enemies:
			if not is_instance_valid(enemy) or enemy.dead:
				continue
			if projectile.position.distance_to(enemy.position) <= projectile.radius + enemy.radius:
				damage_enemy(enemy, projectile.damage, projectile.color)
				projectile.pierce -= 1
				if projectile.pierce < 0:
					projectile.queue_free()
					hit = true
				break
		if hit or not is_instance_valid(projectile):
			projectiles.erase(projectile)


func _update_enemy_bullets(delta: float) -> void:
	for bullet in enemy_bullets.duplicate():
		if not is_instance_valid(bullet):
			enemy_bullets.erase(bullet)
			continue
		bullet.tick(delta)
		if player != null and is_instance_valid(player) and bullet.position.distance_to(player.position) <= bullet.radius + player.radius:
			player.take_damage(bullet.damage * _incoming_damage_mult())
			bullet.queue_free()
			enemy_bullets.erase(bullet)


func _update_pickups(delta: float) -> void:
	if player == null or not is_instance_valid(player):
		return
	for pickup in pickups.duplicate():
		if not is_instance_valid(pickup):
			pickups.erase(pickup)
			continue
		if pickup.tick(delta, player, player.pickup_radius):
			_collect_pickup(pickup)
			pickups.erase(pickup)
			pickup.queue_free()


func _collect_pickup(pickup: Node2D) -> void:
	match String(pickup.kind):
		"xp":
			player.gain_xp(pickup.value)
		"mat":
			_add_materials(float(pickup.value))
		"hp":
			player.heal(pickup.value)


func _update_contacts() -> void:
	if player == null or not is_instance_valid(player):
		return
	for enemy in enemies:
		if not is_instance_valid(enemy) or enemy.dead:
			continue
		if enemy.position.distance_to(player.position) <= enemy.radius + player.radius:
			player.take_damage(enemy.damage * _incoming_damage_mult())
			enemy.on_contact_player()
			return


func damage_enemy(enemy: Node2D, amount: float, color: Color = Color.WHITE) -> float:
	if enemy == null or not is_instance_valid(enemy) or enemy.dead:
		return 0.0
	var actual: float = enemy.take_damage(amount, color)
	if player != null and is_instance_valid(player):
		player.on_damage_dealt(actual)
	return actual


func damage_player(amount: float) -> void:
	if player != null and is_instance_valid(player):
		player.take_damage(amount * _incoming_damage_mult())


func damage_cone(origin: Vector2, dir: Vector2, radius: float, arc: float, damage: float, color: Color, slow: float = 0.0) -> void:
	var dir_n := dir.normalized()
	var cos_limit := cos(clampf(arc, 0.05, TAU) * 0.5)
	for enemy in enemies:
		if not is_instance_valid(enemy) or enemy.dead:
			continue
		var to: Vector2 = enemy.position - origin
		var distance := to.length()
		if distance > radius + enemy.radius:
			continue
		if distance > 1.0 and dir_n.dot(to.normalized()) < cos_limit:
			continue
		damage_enemy(enemy, damage, color)
		if slow > 0.0:
			enemy.slow_t = maxf(enemy.slow_t, 0.8)
	spawn_ring(origin + dir_n * radius * 0.45, color, radius * 0.35)


func damage_line(origin: Vector2, dir: Vector2, length: float, damage: float, color: Color, pierce: int = 2) -> void:
	var end := origin + dir.normalized() * length
	var hits := 0
	for enemy in enemies:
		if not is_instance_valid(enemy) or enemy.dead:
			continue
		var closest := Geometry2D.get_closest_point_to_segment(enemy.position, origin, end)
		if closest.distance_to(enemy.position) <= enemy.radius + 8.0:
			damage_enemy(enemy, damage, color)
			hits += 1
			if pierce > 0 and hits >= pierce:
				break


func damage_circle(origin: Vector2, radius: float, damage: float, color: Color) -> void:
	for enemy in enemies:
		if not is_instance_valid(enemy) or enemy.dead:
			continue
		if enemy.position.distance_to(origin) <= radius + enemy.radius:
			damage_enemy(enemy, damage, color)


func apply_slow_circle(origin: Vector2, radius: float, amount: float, duration: float) -> void:
	for enemy in enemies:
		if not is_instance_valid(enemy) or enemy.dead:
			continue
		if enemy.position.distance_to(origin) <= radius + enemy.radius:
			enemy.slow_t = maxf(enemy.slow_t, duration)


func mark_circle(origin: Vector2, radius: float, duration: float) -> void:
	for enemy in enemies:
		if not is_instance_valid(enemy) or enemy.dead:
			continue
		if enemy.position.distance_to(origin) <= radius + enemy.radius:
			enemy.marked_t = maxf(enemy.marked_t, duration)


func collect_radius(origin: Vector2, radius: float) -> void:
	for pickup in pickups.duplicate():
		if not is_instance_valid(pickup):
			pickups.erase(pickup)
			continue
		if pickup.position.distance_to(origin) <= radius:
			_collect_pickup(pickup)
			pickups.erase(pickup)
			pickup.queue_free()


func damage_chain(origin: Vector2, first: Node2D, damage: float, jumps: int, range: float, color: Color) -> void:
	if first == null or not is_instance_valid(first):
		return
	var hit: Array = []
	var current: Node2D = first
	for i in maxi(1, jumps):
		if current == null or not is_instance_valid(current):
			break
		hit.append(current)
		damage_enemy(current, damage, color)
		var next: Node2D = null
		var best := range
		for enemy in enemies:
			if not is_instance_valid(enemy) or enemy.dead or hit.has(enemy):
				continue
			var d: float = enemy.position.distance_to(current.position)
			if d < best:
				best = d
				next = enemy
		current = next
	spawn_ring(origin, color, 44.0)


func nearest_enemy(origin: Vector2, max_range: float = 99999.0) -> Node2D:
	var best: Node2D = null
	var best_distance := max_range
	for enemy in enemies:
		if not is_instance_valid(enemy) or enemy.dead:
			continue
		var distance := origin.distance_to(enemy.position)
		if distance < best_distance:
			best_distance = distance
			best = enemy
	return best


func on_enemy_killed(enemy: Node2D) -> void:
	if not enemies.has(enemy):
		return
	enemies.erase(enemy)
	run_kills += 1
	_bump_counter("kills", 1)
	var reward_scale: float = _reward_scale()
	var xp_reward: float = maxf(0.0, float(enemy.xp) * reward_scale)
	var mat_reward: float = maxf(0.0, float(enemy.mat) * reward_scale)
	spawn_pickup(enemy.position, "xp", xp_reward, Color(0.42, 1.0, 0.62))
	spawn_pickup(enemy.position, "mat", mat_reward, Color(0.98, 0.76, 0.28))
	# Heal drops stay a per-kill chance at every danger; higher danger gets
	# more orbs because it has more targets, not because sustain was cut.
	var heal_chance := 0.08
	if enemy.boss:
		heal_chance = 1.0
	elif enemy.elite:
		heal_chance = 0.6
	if rng.randf() < heal_chance:
		heal_orbs_spawned += 1
		spawn_pickup(enemy.position + Vector2(rng.randf_range(-16.0, 16.0), rng.randf_range(-16.0, 16.0)), "hp", heal_drop_value(enemy), Color(0.95, 0.32, 0.36))
	if enemy.boss:
		boss = null
		_bump_counter("bosses", 1, true)
		if int(meta.get("counters", {}).get("bosses", 0)) >= 3:
			_unlock_achievement("boss_hunter")
		for i in 10:
			spawn_pickup(enemy.position, "mat", 4.0 * reward_scale, Color(0.98, 0.76, 0.28))
		spawn_ring(enemy.position, Color(0.96, 0.78, 0.31), 120.0)
	elif enemy.elite:
		for i in 2:
			spawn_pickup(enemy.position + Vector2(rng.randf_range(-20.0, 20.0), rng.randf_range(-20.0, 20.0)), "mat", 4.0 * reward_scale, Color(0.98, 0.76, 0.28))
		spawn_ring(enemy.position, Color(1.0, 0.86, 0.3), 45.0)
	else:
		var split: Dictionary = enemy.def.get("split", {})
		if not split.is_empty() and enemy.split_tier < int(split.get("depth", 0)):
			var child: Dictionary = GameData.enemy_by_id.get(String(split.get("id", "")), {})
			if not child.is_empty():
				var cap := int(GameData.rules.get("maxEnemiesOnScreen", 100))
				for i in int(split.get("n", 2)):
					if enemies.size() >= cap:
						break
					var minion := EnemyScript.new()
					minion.setup(child, wave, danger, {}, self, rng)
					minion.position = enemy.position + Vector2(rng.randf_range(-18.0, 18.0), rng.randf_range(-18.0, 18.0))
					minion.split_tier = enemy.split_tier + 1
					world.add_child(minion)
					enemies.append(minion)
	update_hud()


func _add_materials(amount: float) -> void:
	if amount <= 0.0:
		return
	material_carry += amount
	var whole := int(floor(material_carry))
	if whole > 0:
		run_materials += whole
		material_carry -= float(whole)


func heal_drop_value(enemy: Node2D) -> float:
	var max_hp_ref: float = player.max_hp if player != null and is_instance_valid(player) else 100.0
	var share := 0.06
	if enemy.boss:
		share = 0.18
	elif enemy.elite:
		share = 0.10
	return clampf(round(max_hp_ref * share), 4.0, 40.0)


func on_player_hit(_amount: float) -> void:
	if camera != null:
		camera.offset = Vector2(rng.randf_range(-5.0, 5.0), rng.randf_range(-5.0, 5.0))
		get_tree().create_timer(0.08).timeout.connect(func() -> void: camera.offset = Vector2.ZERO)


func _on_dash() -> void:
	if state == State.PLAYING and player != null and is_instance_valid(player):
		player.dash()


func _on_player_died() -> void:
	if state != State.PLAYING:
		return
	_record_best_wave()
	state = State.DEAD
	save_progress()
	touch.enable(false)
	ui.show_end(false, _run_stats())


func _end_wave() -> void:
	_bump_counter("wavesCleared", 1, true)
	if player != null and is_instance_valid(player) and player.hp < player.max_hp * 0.1:
		_bump_counter("lowHpWaves", 1, true)
	if int(meta.get("counters", {}).get("wavesCleared", 0)) >= 20:
		_unlock_achievement("survivor")
	_record_best_wave()
	var clear_heal: float = minf(player.max_hp * float(GameData.rules.get("waveClearHealPct", 0.0)), 60.0)
	if clear_heal > 0.0 and player.hp < player.max_hp:
		player.heal(clear_heal)
		spawn_ring(player.position, Color(0.45, 1.0, 0.55), 58.0)
	if not wave_event.is_empty():
		_add_materials(float(wave_event.get("mat", 0)) * _reward_scale())
		spawn_ring(player.position, Color(1.0, 0.86, 0.3), 90.0)
	if pending_levels > 0:
		_show_levelup(true)
		return
	_open_shop()


func _show_levelup(to_shop: bool = false) -> void:
	state = State.LEVELUP
	levelup_to_shop = to_shop
	level_offers = _roll_upgrades(4)
	touch.enable(false)
	ui.show_levelup(level_offers)


func _roll_upgrades(count: int) -> Array:
	var offers: Array = []
	var owned: Dictionary = {}
	for weapon in player.weapons:
		owned[String(weapon.get("id", ""))] = true
	var item_pool: Array = []
	for item in GameData.items:
		var owned_item := false
		for existing in player.items:
			if String(existing.get("id", "")) == String(item.get("id", "")):
				owned_item = true
				break
		if not owned_item:
			item_pool.append(item)
	var stat_keys := ["maxHp", "dmgP", "atkSpd", "speed", "crit", "armor", "ranged", "melee", "elem", "hpRegen", "lifesteal", "dodge"]
	var stat_amount := {"maxHp": 8.0, "dmgP": 8.0, "atkSpd": 10.0, "speed": 6.0, "crit": 3.0, "armor": 2.0, "ranged": 8.0, "melee": 8.0, "elem": 8.0, "hpRegen": 2.0, "lifesteal": 2.0, "dodge": 3.0}
	while offers.size() < count:
		var pick := rng.randi_range(0, 2)
		if pick == 0 and not item_pool.is_empty():
			var item: Dictionary = item_pool.pop_at(rng.randi_range(0, item_pool.size() - 1))
			offers.append({"type": "item", "item": item, "title": String(item.get("name", "Item")), "desc": "Item · " + _stats_text(item.get("stats", {})) + _curse_item_suffix(item)})
		elif pick == 1 and not owned.is_empty():
			var upgradeable: Array = []
			for i in player.weapons.size():
				if int(player.weapons[i].get("tier", 0)) < 3:
					upgradeable.append(i)
			if upgradeable.is_empty():
				pick = 2
			else:
				var index: int = upgradeable[rng.randi_range(0, upgradeable.size() - 1)]
				var weapon: Dictionary = GameData.weapon(String(player.weapons[index].get("id", "")))
				offers.append({"type": "upgrade", "index": index, "title": "Waffe: " + String(weapon.get("name", "?")), "desc": "Tier %d → %d" % [int(player.weapons[index].get("tier", 0)) + 1, int(player.weapons[index].get("tier", 0)) + 2]})
				continue
		if pick == 2 or offers.size() < count:
			var key: String = stat_keys[rng.randi_range(0, stat_keys.size() - 1)]
			offers.append({"type": "stat", "key": key, "amount": float(stat_amount.get(key, 2.0)), "title": "+%s" % _stat_label(key), "desc": "Dauerhafter Bonus"})
		elif not item_pool.is_empty():
			# Fallback if the random branch could not build an offer.
			var item: Dictionary = item_pool.pop_at(rng.randi_range(0, item_pool.size() - 1))
			offers.append({"type": "item", "item": item, "title": String(item.get("name", "Item")), "desc": "Item · " + _stats_text(item.get("stats", {})) + _curse_item_suffix(item)})
	return offers


func _stats_text(stats: Dictionary) -> String:
	var parts: Array = []
	for key in stats.keys():
		parts.append("%s %+d" % [_stat_label(String(key)), int(stats[key])])
	return " · ".join(parts)


func _stat_label(key: String) -> String:
	var names := {"maxHp": "Leben", "dmgP": "Schaden", "atkSpd": "Angriffstempo", "speed": "Tempo", "crit": "Krit", "armor": "Rüstung", "ranged": "Fernkampf", "melee": "Nahkampf", "elem": "Elementar", "hpRegen": "Regeneration", "lifesteal": "Lebensraub", "dodge": "Ausweichen", "luck": "Glück"}
	return String(names.get(key, key))


func _on_level_pick(index: int) -> void:
	if state != State.LEVELUP or index < 0 or index >= level_offers.size():
		return
	var offer: Dictionary = level_offers[index]
	match String(offer.get("type", "")):
		"item":
			player.add_item(offer.get("item", {}))
		"upgrade":
			player.upgrade_weapon(int(offer.get("index", 0)))
		"stat":
			player.add_bonus(String(offer.get("key", "maxHp")), float(offer.get("amount", 2.0)))
	pending_levels = maxi(0, pending_levels - 1)
	if pending_levels > 0:
		_show_levelup(levelup_to_shop)
	elif levelup_to_shop:
		levelup_to_shop = false
		_open_shop()
	else:
		levelup_to_shop = false
		state = State.PLAYING
		ui.show_hud()
		touch.enable(touch_mode)
		update_hud()


func _shop_offer_count() -> int:
	return int(GameData.rules.get("shopOffers", 6))


func _shop_price_mult() -> float:
	return GameData.danger_value(danger, "price", 1.0)


func _incoming_damage_mult() -> float:
	# dmgLate must scale the actual damage events, not just contact damage:
	# ranged shots and hazards are the main threat in the late waves.
	var late := float(GameData.danger_value(danger, "dmgLate", 0.0))
	return (1.0 + late * maxf(0.0, float(wave) - 8.0)) * curse_damage_mult()


func curse_level() -> int:
	return int(player.curse) if player != null and is_instance_valid(player) else 0


func _curse_rule() -> Dictionary:
	var rule: Variant = GameData.rules.get("curse", {})
	return rule if typeof(rule) == TYPE_DICTIONARY else {}


func curse_hp_mult() -> float:
	var rule := _curse_rule()
	return minf(float(rule.get("hpMultCap", 1.0)), 1.0 + float(curse_level()) * float(rule.get("hpPctPerPoint", 0.0)) / 100.0)


func curse_damage_mult() -> float:
	var rule := _curse_rule()
	return minf(float(rule.get("dmgMultCap", 1.0)), 1.0 + float(curse_level()) * float(rule.get("dmgPctPerPoint", 0.0)) / 100.0)


func curse_luck_bonus() -> float:
	var rule := _curse_rule()
	return minf(float(rule.get("luckCap", 0.0)), float(curse_level()) * float(rule.get("luckPerPoint", 0.0)))


func curse_mat_flat() -> int:
	var rule := _curse_rule()
	var per := float(rule.get("matFlatPer", 0.0))
	if per <= 0.0:
		return 0
	return mini(int(rule.get("matFlatCap", 0)), int(floor(float(curse_level()) / per)))


func _curse_summary() -> String:
	var points := curse_level()
	if points <= 0:
		return ""
	return "☠ FLUCH %d · Gegner +%d%% LP, +%d%% Schaden · Glück +%d · +%d Material/Kill" % [
		points, int(round((curse_hp_mult() - 1.0) * 100.0)),
		int(round((curse_damage_mult() - 1.0) * 100.0)),
		int(round(curse_luck_bonus())), curse_mat_flat()
	]


func _curse_item_suffix(item: Dictionary) -> String:
	var points := int(item.get("curse", 0))
	return (" · ☠ Fluch +%d" % points) if points > 0 else ""


func _reward_scale() -> float:
	# DANGERS.reward owns the per-kill economy curve. The old price/cnt
	# fallback ignored event spawns and extra elite/boss kills, so danger 3
	# collected more materials than danger 0 despite the normalization.
	var reward := GameData.danger_value(danger, "reward", -1.0)
	if reward >= 0.0:
		return reward
	var count_mult := maxf(0.1, GameData.danger_value(danger, "cnt", 1.0))
	return GameData.danger_value(danger, "price", 1.0) / count_mult


func _reroll_cost_for(rerolls: int) -> int:
	# Mirrors BROTATO_RULES.rerollCost(wave, rerolls, locked) from data.js;
	# the source function itself cannot be serialized into JSON.
	var locked := 0
	for offer in shop_offers:
		if bool(offer.get("locked", false)):
			locked += 1
	return 5 + maxi(0, wave) + maxi(0, rerolls) * 4 + locked * 4


func _shop_offer_key(offer: Dictionary) -> String:
	var kind := String(offer.get("kind", ""))
	if kind == "item":
		return "item:" + String(offer.get("item", {}).get("id", ""))
	if kind == "weapon":
		return "weapon:" + String(offer.get("weapon", {}).get("id", ""))
	if kind == "upgrade":
		return "upgrade:%d:%d" % [int(offer.get("index", -1)), int(offer.get("price", 0))]
	return kind + ":" + String(offer.get("name", ""))


func _merge_candidates() -> Array:
	var groups: Dictionary = {}
	for weapon in player.weapons:
		var id := String(weapon.get("id", ""))
		var tier := int(weapon.get("tier", 0))
		if tier >= 3 or id.is_empty():
			continue
		var key := "%s|%d" % [id, tier]
		var entry: Dictionary = groups.get(key, {"id": id, "tier": tier, "count": 0})
		entry["count"] = int(entry.get("count", 0)) + 1
		groups[key] = entry
	var result: Array = []
	for key in groups:
		var entry: Dictionary = groups[key]
		if int(entry.get("count", 0)) >= 2:
			var def: Dictionary = GameData.weapon(String(entry.get("id", "")))
			result.append({"id": String(entry.get("id", "")), "tier": int(entry.get("tier", 0)), "name": String(def.get("name", "?"))})
	return result


func _show_shop() -> void:
	ui.show_shop(shop_offers, run_materials, _merge_candidates(), shop_reroll_cost, _recycle_groups(), player.curse, _curse_summary(), shop_workshop)


func _item_sell_value(item: Dictionary) -> int:
	# Brotato parity: the shop pays back only BROTATO_RULES.itemRecycleRate of
	# the current price (25 %), rounded down, at least one material. Recycling
	# reuses the buy offer's price formula, so a buy -> recycle cycle always
	# loses material instead of becoming a money loop.
	var rate := clampf(float(GameData.rules.get("itemRecycleRate", 0.25)), 0.0, 0.9)
	var price := float(item.get("price", 20)) * (1.0 + float(wave) * 0.025) * _shop_price_mult()
	return maxi(1, int(floor(round(price) * rate)))


func _recycle_groups() -> Array:
	# Groups the run inventory by item id: the UI shows one row per type with
	# its copy count and the exact refund of one copy.
	if player == null or not is_instance_valid(player):
		return []
	var groups: Dictionary = {}
	var order: Array = []
	for raw in player.items:
		var item: Dictionary = raw
		var id := String(item.get("id", ""))
		if id.is_empty():
			continue
		if not groups.has(id):
			groups[id] = {
				"id": id, "name": String(item.get("name", id)),
				"desc": _stats_text(item.get("stats", {})) + _curse_item_suffix(item),
				"count": 0, "refund": _item_sell_value(item),
				"curse": int(item.get("curse", 0)),
			}
			order.append(id)
		groups[id]["count"] = int(groups[id]["count"]) + 1
	var result: Array = []
	for id in order:
		result.append(groups[id])
	return result


func _open_shop() -> void:
	state = State.SHOP
	levelup_to_shop = false
	shop_offers = _roll_shop(_shop_offer_count())
	for offer in shop_offers:
		offer["locked"] = false
	shop_workshop = _roll_workshop()
	shop_reroll_count = 0
	shop_reroll_cost = _reroll_cost_for(0)
	touch.enable(false)
	_show_shop()
	save_progress()


func _make_item_offer(item: Dictionary) -> Dictionary:
	var item_price := int(round(float(item.get("price", 20)) * (1.0 + wave * 0.025) * _shop_price_mult()))
	return {"kind": "item", "item": item, "name": String(item.get("name", "Item")), "desc": _stats_text(item.get("stats", {})) + _curse_item_suffix(item), "price": item_price, "locked": false}


func _make_shop_offer(seen: Dictionary) -> Dictionary:
	var price_mult := _shop_price_mult()
	for attempt in 32:
		if rng.randf() < 0.55:
			var item: Dictionary = GameData.random_item(rng)
			var item_key := "item:" + String(item.get("id", ""))
			if item.is_empty() or seen.has(item_key):
				continue
			seen[item_key] = true
			return _make_item_offer(item)
		var upgradeable: Array = []
		for i in player.weapons.size():
			if int(player.weapons[i].get("tier", 0)) < 3:
				upgradeable.append(i)
		var max_weapons := int(GameData.rules.get("maxWeapons", 6))
		if player.weapons.size() >= max_weapons and rng.randf() < 0.65:
			if upgradeable.is_empty():
				continue
			var upgrade_index: int = upgradeable[rng.randi_range(0, upgradeable.size() - 1)]
			var upgrade_weapon: Dictionary = GameData.weapon(String(player.weapons[upgrade_index].get("id", "")))
			return {"kind": "upgrade", "index": upgrade_index, "name": "Upgrade: " + String(upgrade_weapon.get("name", "?")), "desc": "Nächste Stufe", "price": int(round(float(28 + wave * 5) * price_mult)), "locked": false}
		var allowed: Array = meta.get("unlocked_weapons", [])
		var weapon: Dictionary = GameData.random_weapon(rng, allowed)
		if weapon.is_empty():
			continue
		var weapon_key := "weapon:" + String(weapon.get("id", ""))
		if seen.has(weapon_key):
			continue
		seen[weapon_key] = true
		var weapon_price := int(round(float(GameData.weapon_price(String(weapon.get("id", "")), 0) + wave * 3) * price_mult))
		return {"kind": "weapon", "weapon": weapon, "name": String(weapon.get("name", "Waffe")), "desc": String(weapon.get("type", "projectile")) + " · T1", "price": weapon_price, "locked": false}
	return {}


func _roll_shop(count: int) -> Array:
	var offers: Array = []
	var seen: Dictionary = {}
	var guard := 0
	while offers.size() < count and guard < 256:
		var offer := _make_shop_offer(seen)
		if not offer.is_empty():
			offers.append(offer)
		guard += 1
	_ensure_curse_offer(offers)
	return offers


func _roll_workshop() -> Array:
	if player == null or not is_instance_valid(player):
		return []
	var pool: Array = []
	for def in GameData.run_upgrades:
		var id := String((def as Dictionary).get("id", ""))
		var max_stacks := maxi(1, int((def as Dictionary).get("maxStacks", 1)))
		if not id.is_empty() and player.run_upgrade_count(id) < max_stacks:
			pool.append(def)
	var offers: Array = []
	for i in 2:
		if pool.is_empty():
			break
		var index := workshop_rng.randi_range(0, pool.size() - 1)
		offers.append(_run_upgrade_offer(pool[index]))
		pool.remove_at(index)
	return offers


func _run_upgrade_price(def: Dictionary, owned: int = -1) -> int:
	if player == null or not is_instance_valid(player):
		return 0
	var id := String(def.get("id", ""))
	if owned < 0:
		owned = player.run_upgrade_count(id)
	var base := maxf(1.0, float(def.get("basePrice", 20)))
	var step := maxf(0.0, float(def.get("priceStep", 0.5)))
	return maxi(3, int(round(base * (1.0 + float(wave) * 0.045) * (1.0 + float(owned) * step) * _shop_price_mult())))


func _run_upgrade_offer(def: Dictionary) -> Dictionary:
	var id := String(def.get("id", ""))
	if id.is_empty():
		return {}
	var owned: int = player.run_upgrade_count(id) if player != null and is_instance_valid(player) else 0
	return {
		"id": id, "name": String(def.get("name", id)),
		"desc": String(def.get("desc", "")),
		"stats_text": _stats_text(def.get("stats", {})),
		"owned": owned, "max": maxi(1, int(def.get("maxStacks", 1))),
		"price": _run_upgrade_price(def, owned),
	}


func _refresh_workshop_offers() -> void:
	var refreshed: Array = []
	for raw in shop_workshop:
		var def: Dictionary = GameData.run_upgrade(String((raw as Dictionary).get("id", "")))
		if not def.is_empty():
			refreshed.append(_run_upgrade_offer(def))
	shop_workshop = refreshed


func _ensure_curse_offer(offers: Array, allowed_indices: Array = []) -> void:
	# Browser parity: from wave 4 on a curse-free player must see at least one
	# cursed item. The risk/beute decision is intentional, not a random miss.
	if player == null or not is_instance_valid(player) or wave < 4 or int(player.curse) > 0:
		return
	for offer in offers:
		if String(offer.get("kind", "")) == "item" and bool((offer.get("item", {}) as Dictionary).get("cursed", false)):
			return
	var cap := mini(4, 2 + int(floor(float(wave) / 4.0)))
	var pool: Array = []
	for row in GameData.items:
		if bool((row as Dictionary).get("cursed", false)) and int((row as Dictionary).get("r", 0)) <= cap:
			pool.append(row)
	if pool.is_empty():
		return
	var slot := -1
	for i in offers.size():
		if not allowed_indices.is_empty() and not allowed_indices.has(i):
			continue
		if String((offers[i] as Dictionary).get("kind", "")) == "item":
			slot = i
			break
	if slot < 0:
		var weapon_offers := 0
		var last_weapon := -1
		for i in offers.size():
			if not allowed_indices.is_empty() and not allowed_indices.has(i):
				continue
			if String((offers[i] as Dictionary).get("kind", "")) == "weapon":
				weapon_offers += 1
				last_weapon = i
		if weapon_offers > 1:
			slot = last_weapon
	if slot < 0:
		return
	var item: Dictionary = pool[rng.randi_range(0, pool.size() - 1)]
	offers[slot] = _make_item_offer(item)


func _on_curse_changed(_value: int) -> void:
	if ui == null or player == null or not is_instance_valid(player):
		return
	if state == State.SHOP:
		_show_shop()
	else:
		update_hud()


func _on_shop_workshop_buy(id: String) -> void:
	if state != State.SHOP or player == null or not is_instance_valid(player):
		return
	var def: Dictionary = GameData.run_upgrade(id)
	if def.is_empty():
		return
	var owned: int = player.run_upgrade_count(id)
	if owned >= maxi(1, int(def.get("maxStacks", 1))):
		return
	var offer_index := -1
	for i in shop_workshop.size():
		if String((shop_workshop[i] as Dictionary).get("id", "")) == id:
			offer_index = i
			break
	if offer_index < 0:
		return
	var price := int((shop_workshop[offer_index] as Dictionary).get("price", 0))
	if price <= 0 or run_materials < price:
		return
	var new_count: int = player.add_run_upgrade(id)
	if new_count <= owned:
		return
	run_materials -= price
	_refresh_workshop_offers()
	_show_shop()
	update_hud()
	save_progress()


func _on_shop_buy(index: int) -> void:
	if state != State.SHOP or index < 0 or index >= shop_offers.size():
		return
	var offer: Dictionary = shop_offers[index]
	var price := int(offer.get("price", 0))
	if run_materials < price:
		return
	var applied := false
	match String(offer.get("kind", "")):
		"item":
			player.add_item(offer.get("item", {}))
			applied = true
		"weapon":
			applied = player.add_weapon(String(offer.get("weapon", {}).get("id", "")), 0)
		"upgrade":
			applied = player.upgrade_weapon(int(offer.get("index", 0)))
	if not applied:
		return
	run_materials -= price
	var seen: Dictionary = {}
	for i in shop_offers.size():
		if i != index:
			seen[_shop_offer_key(shop_offers[i])] = true
	var replacement := _make_shop_offer(seen)
	if replacement.is_empty():
		shop_offers.remove_at(index)
	else:
		shop_offers[index] = replacement
	_show_shop()
	update_hud()
	save_progress()


func _on_shop_lock(index: int) -> void:
	if state != State.SHOP or index < 0 or index >= shop_offers.size():
		return
	var offer: Dictionary = shop_offers[index]
	offer["locked"] = not bool(offer.get("locked", false))
	shop_reroll_cost = _reroll_cost_for(shop_reroll_count)
	_show_shop()
	save_progress()


func _on_shop_merge(id: String, tier: int) -> void:
	if state != State.SHOP:
		return
	if not player.merge_weapons(id, tier):
		return
	_unlock_achievement("merge_first")
	if tier + 1 >= 3:
		_unlock_achievement("merge_t3")
	var repaired: Array = []
	var seen: Dictionary = {}
	for offer in shop_offers:
		if bool(offer.get("locked", false)):
			seen[_shop_offer_key(offer)] = true
	for offer in shop_offers:
		if String(offer.get("kind", "")) != "upgrade":
			repaired.append(offer)
			continue
		# Removing the merged slots shifts every later weapon index, so stale
		# upgrade offers are replaced instead of being re-bound to a wrong slot.
		var replacement := _make_shop_offer(seen)
		if not replacement.is_empty():
			repaired.append(replacement)
	shop_offers = repaired
	_show_shop()
	update_hud()
	save_progress()


func _on_shop_recycle(id: String) -> void:
	if state != State.SHOP or id.is_empty():
		return
	var index := -1
	for i in player.items.size():
		if String((player.items[i] as Dictionary).get("id", "")) == id:
			index = i
			break
	if index < 0:
		return
	var refund := _item_sell_value(player.items[index])
	if not player.sell_item(id):
		return
	run_materials += refund
	_show_shop()
	update_hud()
	save_progress()


func _on_shop_reroll() -> void:
	if state != State.SHOP:
		return
	var unlocked := 0
	for offer in shop_offers:
		if not bool(offer.get("locked", false)):
			unlocked += 1
	if unlocked == 0 or run_materials < shop_reroll_cost:
		return
	run_materials -= shop_reroll_cost
	var seen: Dictionary = {}
	var rerollable: Array = []
	for offer in shop_offers:
		if bool(offer.get("locked", false)):
			seen[_shop_offer_key(offer)] = true
	for i in shop_offers.size():
		if bool(shop_offers[i].get("locked", false)):
			continue
		rerollable.append(i)
		var replacement := _make_shop_offer(seen)
		if not replacement.is_empty():
			shop_offers[i] = replacement
	_ensure_curse_offer(shop_offers, rerollable)
	shop_reroll_count += 1
	shop_reroll_cost = _reroll_cost_for(shop_reroll_count)
	_show_shop()
	update_hud()
	save_progress()


func _on_shop_continue() -> void:
	if state != State.SHOP:
		return
	if wave >= 20 and not endless:
		_win_run()
		return
	state = State.PLAYING
	ui.show_hud()
	touch.enable(touch_mode)
	start_wave(wave + 1)
	update_hud()


func _win_run() -> void:
	state = State.WIN
	_record_best_wave()
	_bump_counter("wavesWon", 1, true)
	meta["wins"] = int(meta.get("wins", 0)) + 1
	_unlock_achievement("win")
	save_progress()
	touch.enable(false)
	ui.show_end(true, _run_stats())


func _on_endless() -> void:
	if state != State.WIN:
		return
	endless = true
	state = State.PLAYING
	ui.hide_all()
	ui.show_hud()
	touch.enable(touch_mode)
	start_wave(wave + 1)
	update_hud()


func _on_ability() -> void:
	if state == State.PLAYING and player != null and is_instance_valid(player):
		if player.use_ability():
			update_hud()


func _run_stats() -> Dictionary:
	return {
		"wave": wave, "kills": run_kills, "materials": run_materials,
		"level": player.level if player != null else 1, "endless": endless,
		"elites": elites_spawned, "heal_orbs": heal_orbs_spawned
	}


func update_hud() -> void:
	if ui == null or player == null or not is_instance_valid(player):
		return
	var boss_hp := 0.0
	var boss_max := 0.0
	if boss != null and is_instance_valid(boss):
		boss_hp = boss.hp
		boss_max = boss.max_hp
	ui.update_hud({
		"hp": player.hp, "max_hp": player.max_hp,
		"xp": player.xp, "xp_next": player.xp_next,
		"wave": wave, "time_left": maxf(0.0, wave_duration - wave_time),
		"materials": run_materials, "kills": run_kills, "level": player.level,
		"seed": seed_value, "boss_hp": boss_hp, "boss_max": boss_max,
		"ability_name": player.ability_name(), "ability_cd": player.ability_cd,
		"ability_rank": player.ability_rank, "ability_uses": player.ability_uses,
		"synergy_active": player.synergy_active, "synergy_count": player.synergy_count,
		"synergy_need": player.synergy_need, "synergy_cls": String(player.synergy.get("cls", "")),
		"weapon_count": player.weapons.size(), "max_weapons": int(GameData.rules.get("maxWeapons", 6)),
		"weapons_text": player.weapon_summary(),
		"endless": endless, "wave_event": wave_event, "elites": elites_spawned,
		"hazards": hazards.size(), "curse": player.curse, "curse_text": _curse_summary()
	})


func toggle_pause() -> void:
	if state == State.PLAYING:
		state = State.PAUSED
		touch.enable(false)
		ui.show_pause()
	elif state == State.PAUSED:
		state = State.PLAYING
		touch.enable(touch_mode)
		ui.show_hud()
		update_hud()


func _on_restart() -> void:
	start_run(selected_char, seed_value, danger)


func _on_menu() -> void:
	state = State.TITLE
	_clear_world()
	touch.enable(false)
	ui.set_unlocked_chars(meta.get("unlocked_chars", []))
	ui.set_meta_summary(_meta_summary())
	ui.set_resume_available(not run_save.is_empty(), _resume_label())
	ui.show_title()
	queue_redraw()


func _default_meta() -> Dictionary:
	var chars: Array = []
	for c in GameData.chars:
		if typeof(c.get("unlock")) != TYPE_DICTIONARY:
			chars.append(String(c.get("id", "")))
	var weapons: Array = []
	for w in GameData.weapons:
		if bool(w.get("unlockDefault", false)):
			weapons.append(String(w.get("id", "")))
	return {
		"version": SAVE_VERSION,
		"unlocked_chars": chars,
		"unlocked_weapons": weapons,
		"achievements": {},
		"counters": {"kills": 0, "bosses": 0, "wavesCleared": 0, "wavesWon": 0, "lowHpWaves": 0},
		"best_wave": 0, "best_danger": 0, "runs": 0, "wins": 0, "kills": 0,
	}


func _init_meta() -> void:
	meta = _default_meta()


func _meta_summary() -> String:
	var chars: Array = meta.get("unlocked_chars", [])
	var weapons: Array = meta.get("unlocked_weapons", [])
	var achievements: Dictionary = meta.get("achievements", {})
	return "META  %d/%d Charaktere · %d/%d Waffen · Bestwelle %d (Danger %d) · %d Siege · %d Kills · %d Erfolge" % [
		chars.size(), GameData.chars.size(), weapons.size(), GameData.weapons.size(),
		int(meta.get("best_wave", 0)), int(meta.get("best_danger", 0)),
		int(meta.get("wins", 0)), int(meta.get("kills", 0)), achievements.size()
	]


func _resume_label() -> String:
	if run_save.is_empty():
		return ""
	var phase := "Shop" if String(run_save.get("phase", "playing")) == "shop" else "Kampf"
	return "Welle %d · %s" % [int(run_save.get("wave", 1)), phase]


func _merge_meta(src: Dictionary) -> void:
	var base := _default_meta()
	for key in ["unlocked_chars", "unlocked_weapons"]:
		var list: Array = []
		var source: Variant = src.get(key, [])
		if typeof(source) == TYPE_ARRAY:
			for raw in (source as Array):
				var id := String(raw)
				if id.is_empty() or list.has(id):
					continue
				var known := not GameData.character(id).is_empty() if key == "unlocked_chars" else not GameData.weapon(id).is_empty()
				if known:
					list.append(id)
		for id in (base[key] as Array):
			if not list.has(id):
				list.append(id)
		base[key] = list
	var counters: Dictionary = base["counters"]
	var source_counters: Variant = src.get("counters", {})
	if typeof(source_counters) == TYPE_DICTIONARY:
		for key in counters.keys():
			counters[key] = maxi(0, int((source_counters as Dictionary).get(key, 0)))
	var achievements: Dictionary = {}
	var source_achievements: Variant = src.get("achievements", {})
	if typeof(source_achievements) == TYPE_DICTIONARY:
		for key in (source_achievements as Dictionary).keys():
			if bool((source_achievements as Dictionary)[key]):
				achievements[String(key)] = true
	base["achievements"] = achievements
	for key in ["best_wave", "best_danger", "runs", "wins", "kills"]:
		base[key] = maxi(0, int(src.get(key, 0)))
	meta = base


func _check_unlocks() -> Array:
	if meta.is_empty():
		_init_meta()
	var counters: Dictionary = meta.get("counters", {})
	var unlocked: Array = []
	var chars: Array = meta.get("unlocked_chars", [])
	for c in GameData.chars:
		var condition: Variant = c.get("unlock")
		if typeof(condition) != TYPE_DICTIONARY:
			continue
		var id := String(c.get("id", ""))
		if id.is_empty() or chars.has(id):
			continue
		var parsed: Dictionary = condition
		if int(counters.get(String(parsed.get("key", "")), 0)) >= int(parsed.get("need", 1)):
			chars.append(id)
			unlocked.append(String(c.get("name", id)))
	meta["unlocked_chars"] = chars
	var weapons: Array = meta.get("unlocked_weapons", [])
	for w in GameData.weapons:
		var condition: Variant = w.get("unlock")
		if typeof(condition) != TYPE_DICTIONARY:
			continue
		var id := String(w.get("id", ""))
		if id.is_empty() or weapons.has(id):
			continue
		var parsed: Dictionary = condition
		if int(counters.get(String(parsed.get("key", "")), 0)) >= int(parsed.get("need", 1)):
			weapons.append(id)
			unlocked.append(String(w.get("name", id)))
	meta["unlocked_weapons"] = weapons
	if ui != null and is_instance_valid(ui):
		ui.set_unlocked_chars(chars)
		ui.set_meta_summary(_meta_summary())
	return unlocked


func _bump_counter(key: String, amount: int = 1, force_check: bool = false) -> void:
	if meta.is_empty():
		_init_meta()
	var counters: Dictionary = meta.get("counters", {})
	counters[key] = maxi(0, int(counters.get(key, 0)) + amount)
	meta["counters"] = counters
	meta["kills"] = int(counters.get("kills", 0))
	if force_check or key != "kills" or int(counters.get("kills", 0)) % 25 == 0:
		_check_unlocks()


func _unlock_achievement(id: String) -> void:
	if id.is_empty():
		return
	var achievements: Dictionary = meta.get("achievements", {})
	if bool(achievements.get(id, false)):
		return
	achievements[id] = true
	meta["achievements"] = achievements
	if ui != null and is_instance_valid(ui):
		ui.set_meta_summary(_meta_summary())
	save_progress()


func _record_best_wave() -> void:
	if wave > int(meta.get("best_wave", 0)):
		meta["best_wave"] = wave
		meta["best_danger"] = danger


func _snapshot_run(phase: String) -> Dictionary:
	if player == null or not is_instance_valid(player) or not player.alive:
		return {}
	var snapshot := {
		"char": selected_char, "seed": seed_value, "danger": danger,
		"wave": wave, "phase": phase, "materials": run_materials,
		"kills": run_kills, "elites": elites_spawned, "endless": endless,
		"material_carry": material_carry, "heal_orbs": heal_orbs_spawned,
		"hp": player.hp, "level": player.level, "xp": player.xp, "xp_next": player.xp_next,
		"items": player.items.duplicate(true), "bonuses": player.bonuses.duplicate(true),
		"run_upgrades": player.run_upgrades.duplicate(true),
		"weapons": player.weapons.duplicate(true),
		"saved_at": Time.get_unix_time_from_system(),
	}
	if phase == "shop":
		snapshot["offers"] = shop_offers.duplicate(true)
		snapshot["workshop"] = shop_workshop.duplicate(true)
		snapshot["reroll_count"] = shop_reroll_count
		snapshot["reroll_cost"] = shop_reroll_cost
	return snapshot


func _load_progress() -> void:
	_init_meta()
	run_save = {}
	high_score = 0
	last_save_error = ""
	if not FileAccess.file_exists(save_path):
		return
	var file := FileAccess.open(save_path, FileAccess.READ)
	if file == null:
		last_save_error = "Save nicht lesbar: " + save_path
		return
	var text := file.get_as_text()
	file.close()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		last_save_error = "Save beschädigt: kein JSON-Objekt"
		_quarantine_save()
		return
	var document: Dictionary = parsed
	var loaded_meta: Variant = document.get("meta", {})
	if typeof(loaded_meta) == TYPE_DICTIONARY:
		_merge_meta(loaded_meta)
	else:
		# Legacy v1 files only carried the high score and the last character.
		high_score = maxi(0, int(document.get("high_score", 0)))
		meta["best_wave"] = maxi(int(meta.get("best_wave", 0)), high_score)
	var legacy_char := String(document.get("selected_char", ""))
	if not legacy_char.is_empty() and not GameData.character(legacy_char).is_empty():
		selected_char = legacy_char
	var loaded_run: Variant = document.get("run", {})
	if typeof(loaded_run) == TYPE_DICTIONARY:
		var run: Dictionary = loaded_run
		if not run.is_empty() and not GameData.character(String(run.get("char", ""))).is_empty():
			run_save = run
	high_score = maxi(high_score, int(meta.get("best_wave", 0)))
	_check_unlocks()


func _quarantine_save() -> void:
	var directory := DirAccess.open("user://")
	if directory == null:
		return
	var base := save_path.get_file()
	var target := base + ".corrupt"
	var index := 1
	while directory.file_exists(target):
		target = "%s.corrupt%d" % [base, index]
		index += 1
	var err := directory.rename(base, target)
	if err != OK:
		last_save_error += " · Sicherung fehlgeschlagen (%d)" % err


func save_progress() -> void:
	if meta.is_empty():
		_init_meta()
	high_score = maxi(high_score, int(meta.get("best_wave", 0)))
	if state == State.SHOP:
		run_save = _snapshot_run("shop")
	elif state == State.PLAYING and player != null and is_instance_valid(player) and player.alive:
		run_save = _snapshot_run("playing")
	elif state == State.DEAD or state == State.WIN or state == State.TITLE:
		run_save = {}
	var payload := {
		"version": SAVE_VERSION,
		"meta": meta,
		"run": run_save,
		"high_score": high_score,
		"selected_char": selected_char,
		"saved_at": Time.get_unix_time_from_system(),
	}
	var file := FileAccess.open(save_path, FileAccess.WRITE)
	if file == null:
		last_save_error = "Save nicht schreibbar: " + save_path
		return
	file.store_string(JSON.stringify(payload))
	file.close()
	last_save_error = ""


func resume_run() -> void:
	if run_save.is_empty():
		return
	var snapshot: Dictionary = run_save.duplicate(true)
	start_run(String(snapshot.get("char", selected_char)), int(snapshot.get("seed", seed_value)), int(snapshot.get("danger", danger)), snapshot)


func _restore_run_state(run: Dictionary) -> void:
	wave = maxi(1, int(run.get("wave", 1)))
	run_materials = maxi(0, int(run.get("materials", 0)))
	material_carry = clampf(float(run.get("material_carry", 0.0)), 0.0, 0.999)
	heal_orbs_spawned = maxi(0, int(run.get("heal_orbs", 0)))
	run_kills = maxi(0, int(run.get("kills", 0)))
	elites_spawned = maxi(0, int(run.get("elites", 0)))
	endless = bool(run.get("endless", false))
	player.items.clear()
	var items: Variant = run.get("items", [])
	if typeof(items) == TYPE_ARRAY:
		for raw in (items as Array):
			if typeof(raw) == TYPE_DICTIONARY and not (raw as Dictionary).is_empty():
				player.items.append((raw as Dictionary).duplicate(true))
	player.bonuses.clear()
	var bonuses: Variant = run.get("bonuses", {})
	if typeof(bonuses) == TYPE_DICTIONARY:
		for key in (bonuses as Dictionary).keys():
			player.bonuses[String(key)] = float((bonuses as Dictionary)[key])
	player.run_upgrades.clear()
	var upgrades: Variant = run.get("run_upgrades", {})
	if typeof(upgrades) == TYPE_DICTIONARY:
		for raw_id in (upgrades as Dictionary).keys():
			var id := String(raw_id)
			var def: Dictionary = GameData.run_upgrade(id)
			if def.is_empty():
				continue
			var count := clampi(int((upgrades as Dictionary)[raw_id]), 0, maxi(1, int(def.get("maxStacks", 1))))
			if count > 0:
				player.run_upgrades[id] = count
	player.weapons.clear()
	var weapons: Variant = run.get("weapons", [])
	if typeof(weapons) == TYPE_ARRAY:
		for raw in (weapons as Array):
			if typeof(raw) != TYPE_DICTIONARY:
				continue
			var id := String((raw as Dictionary).get("id", ""))
			if GameData.weapon(id).is_empty():
				continue
			player.weapons.append({
				"id": id,
				"tier": clampi(int((raw as Dictionary).get("tier", 0)), 0, 3),
				"cd": 0.0,
				"kills": maxi(0, int((raw as Dictionary).get("kills", 0))),
			})
	if player.weapons.is_empty():
		player.add_weapon(String(GameData.character(selected_char).get("startWeapon", "schrottkanone")), 0)
	player.level = maxi(1, int(run.get("level", 1)))
	player.xp = maxf(0.0, float(run.get("xp", 0.0)))
	player.xp_next = maxf(1.0, float(run.get("xp_next", 10.0)))
	player.recalc()
	player.hp = clampf(float(run.get("hp", player.max_hp)), 1.0, player.max_hp)
	player.alive = true
	state = State.PLAYING
	ui.show_hud()
	touch.enable(touch_mode)
	if String(run.get("phase", "playing")) == "shop":
		_restore_shop(run)
		return
	start_wave(wave)
	update_hud()


func _restore_shop(run: Dictionary) -> void:
	state = State.SHOP
	shop_offers = []
	var offers: Variant = run.get("offers", [])
	if typeof(offers) == TYPE_ARRAY:
		for raw in (offers as Array):
			if typeof(raw) != TYPE_DICTIONARY:
				continue
			var offer: Dictionary = (raw as Dictionary).duplicate(true)
			var kind := String(offer.get("kind", ""))
			if kind == "upgrade":
				var index := int(offer.get("index", -1))
				if index < 0 or index >= player.weapons.size():
					continue
			elif kind == "weapon":
				if GameData.weapon(String((offer.get("weapon", {}) as Dictionary).get("id", ""))).is_empty():
					continue
			elif kind == "item":
				if GameData.item(String((offer.get("item", {}) as Dictionary).get("id", ""))).is_empty():
					continue
			offer["locked"] = bool(offer.get("locked", false))
			shop_offers.append(offer)
	var guard := 0
	while shop_offers.size() < _shop_offer_count() and guard < 64:
		var offer := _make_shop_offer({})
		if offer.is_empty():
			break
		shop_offers.append(offer)
		guard += 1
	shop_workshop = []
	var saved_workshop: Variant = run.get("workshop", [])
	if typeof(saved_workshop) == TYPE_ARRAY:
		for raw in (saved_workshop as Array):
			if typeof(raw) != TYPE_DICTIONARY:
				continue
			var def: Dictionary = GameData.run_upgrade(String((raw as Dictionary).get("id", "")))
			if not def.is_empty():
				shop_workshop.append(_run_upgrade_offer(def))
	if shop_workshop.is_empty():
		shop_workshop = _roll_workshop()
	shop_reroll_count = maxi(0, int(run.get("reroll_count", 0)))
	shop_reroll_cost = _reroll_cost_for(shop_reroll_count)
	touch.enable(false)
	_show_shop()
	update_hud()


func get_debug_state() -> Dictionary:
	return {
		"state": state, "wave": wave, "seed": seed_value,
		"kills": run_kills, "materials": run_materials, "heal_orbs": heal_orbs_spawned,
		"enemies": enemies.size(), "hp": player.hp if player != null and is_instance_valid(player) else 0.0,
		"max_hp": player.max_hp if player != null and is_instance_valid(player) else 0.0,
		"level": player.level if player != null and is_instance_valid(player) else 1,
		"weapons": player.weapons.size() if player != null and is_instance_valid(player) else 0,
		"boss_alive": boss != null and is_instance_valid(boss),
		"boss_hp": boss.hp if boss != null and is_instance_valid(boss) else 0.0,
		"boss_max": boss.max_hp if boss != null and is_instance_valid(boss) else 0.0,
		"boss_distance": player.position.distance_to(boss.position) if boss != null and is_instance_valid(boss) and player != null and is_instance_valid(player) else 0.0,
		"wave_time": wave_time,		"endless": endless, "event": String(wave_event.get("kind", "")),
		"spawn_left": spawn_left, "hazards": hazards.size(), "turrets": turrets.size(), "effects": effects.size(),
		"workshop": shop_workshop.size(), "run_upgrades": player.run_upgrades.size() if player != null and is_instance_valid(player) else 0,
		"elites": elites_spawned, "synergy_active": player.synergy_active if player != null and is_instance_valid(player) else false,
		"ability_cd": player.ability_cd if player != null and is_instance_valid(player) else 0.0
	}
