extends Node
## No-cheat balance gate: an input-driven autopilot (real movement actions,
## automatic level/shop choices, no stat buffs) plays the actual 20-wave loop.
## Both dangers must win, and danger 3 must take more damage while still
## producing more heal orbs because it has more kills. Final HP is saturated by
## boss heal orbs, so the direct damage sum is the difficulty signal.

const S_PLAYING := 1
const S_LEVELUP := 2
const S_SHOP := 3
const S_DEAD := 5
const S_WIN := 6
const MAX_TICKS := 240000
const ACTIONS := ["ui_left", "ui_right", "ui_up", "ui_down"]

var last_dir := Vector2.RIGHT


func _ready() -> void:
	var only := OS.get_environment("WBN_BALANCE_ONLY")
	var seed_value := 12648430
	var seed_override := OS.get_environment("WBN_BALANCE_SEED")
	if not seed_override.is_empty():
		seed_value = int(seed_override)
	var easy: Dictionary = {}
	var hard: Dictionary = {}
	if only != "hard":
		easy = await _run_case(0, seed_value)
	if only != "easy":
		hard = await _run_case(3, seed_value)
	_release_actions()
	var result := {"easy": easy, "hard": hard}
	print("BALANCE " + JSON.stringify(result))
	var passed := true
	if not easy.is_empty():
		passed = int(easy.get("state", 0)) == S_WIN and int(easy.get("kills", 0)) > 0
	if not hard.is_empty() and not easy.is_empty():
		# Same seed, same build rules: danger 3 must clear all 20 waves with
		# genuinely less remaining HP, while its higher kill count still yields
		# more heal orbs (sustain scales, it is not cut).
		var both_win: bool = int(hard.get("state", 0)) == S_WIN
		var damage_ok: bool = float(hard.get("damage_taken", 0.0)) > float(easy.get("damage_taken", 0.0))
		var orbs_ok: bool = int(hard.get("heal_orbs", 0)) > int(easy.get("heal_orbs", 0))
		passed = passed and both_win and damage_ok and orbs_ok
	_cleanup("user://wbn_balance_test_%d_%d.save" % [seed_value, 0])
	_cleanup("user://wbn_balance_test_%d_%d.save" % [seed_value, 3])
	if not passed:
		push_error("Balance test failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)


func _run_case(danger: int, seed_value: int) -> Dictionary:
	var save_path := "user://wbn_balance_test_%d_%d.save" % [seed_value, danger]
	_cleanup(save_path)
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = save_path
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)
	last_dir = Vector2.RIGHT
	_release_actions()
	main.start_run("leonidas", seed_value, danger)
	var ticks := 0
	var levelups := 0
	var merges := 0
	var shop_actions := 0
	var last_wave := 0
	while ticks < MAX_TICKS and main.state != S_WIN and main.state != S_DEAD:
		_drive(main)
		match main.state:
			S_LEVELUP:
				main._on_level_pick(_best_level_offer(main))
				levelups += 1
			S_SHOP:
				shop_actions += 1
				var candidates: Array = main._merge_candidates()
				if not candidates.is_empty():
					var candidate: Dictionary = candidates[0]
					main._on_shop_merge(String(candidate.get("id", "")), int(candidate.get("tier", 0)))
					merges += 1
					continue
				var best_index := -1
				var best_score := -1.0
				for i in main.shop_offers.size():
					var offer: Dictionary = main.shop_offers[i]
					if int(offer.get("price", 0)) > main.run_materials:
						continue
					if String(offer.get("kind", "")) == "upgrade":
						var index := int(offer.get("index", -1))
						if index < 0 or index >= main.player.weapons.size() or int(main.player.weapons[index].get("tier", 0)) >= 3:
							continue
					var score := _shop_score(offer)
					if score > best_score:
						best_score = score
						best_index = i
				if best_index >= 0:
					var before := int(main.run_materials)
					main._on_shop_buy(best_index)
					if int(main.run_materials) < before:
						continue
				if main.shop_reroll_count < 2 and main.run_materials >= main.shop_reroll_cost + 10:
					main._on_shop_reroll()
					continue
				main._on_shop_continue()
			S_PLAYING:
				main._on_ability()
				if main.wave != last_wave:
					last_wave = main.wave
					print("TRACE d=%d seed=%d wave=%d hp=%.0f mat=%d kills=%d lvl=%d curse=%d weapons=%s enemies=%d" % [danger, seed_value, main.wave, main.player.hp, main.run_materials, main.run_kills, main.player.level, main.player.curse, main.player.weapon_summary(), main.enemies.size()])
				main.tick(1.0 / 60.0)
				ticks += 1
			_:
				break
	_release_actions()
	var result := {
		"danger": danger, "seed": seed_value, "state": main.state, "reached": main.wave,
		"kills": main.run_kills, "materials": main.run_materials,
		"ticks": ticks, "levelups": levelups, "merges": merges,
		"shop_actions": shop_actions, "endless": main.endless,
		"boss_alive": main.boss != null and is_instance_valid(main.boss),
		"boss_hp": main.boss.hp if main.boss != null and is_instance_valid(main.boss) else 0.0,
		"hp": main.player.hp if main.player != null and is_instance_valid(main.player) else 0.0,
		"max_hp": main.player.max_hp if main.player != null and is_instance_valid(main.player) else 0.0,
		"damage_taken": main.player.damage_taken if main.player != null and is_instance_valid(main.player) else 0.0,
		"curse": main.player.curse if main.player != null and is_instance_valid(main.player) else 0,
		"heal_orbs": main.heal_orbs_spawned,
	}
	_cleanup(String(main.save_path))
	main.queue_free()
	await get_tree().process_frame
	return result


func _drive(main: Node) -> void:
	var player: Node2D = main.player
	if player == null or not is_instance_valid(player) or not player.alive:
		_release_actions()
		return
	var nearest: Node2D = null
	var best := 1e9
	var nearby: Array = []
	for enemy in main.enemies:
		if not is_instance_valid(enemy) or enemy.dead:
			continue
		var distance := player.position.distance_to(enemy.position)
		if distance < best:
			best = distance
			nearest = enemy
		if distance < 340.0:
			nearby.append(enemy)
	var dir := _clearance_direction(main, player, nearby)
	last_dir = dir
	if nearest != null and best < 125.0 and player.dash_cd <= 0.0:
		main._on_dash()
	var width := float(main.arena.get("w", 1600))
	var height := float(main.arena.get("h", 1200))
	var margin := 140.0
	if player.position.x < margin:
		dir.x = absf(dir.x) + 0.5
	elif player.position.x > width - margin:
		dir.x = -absf(dir.x) - 0.5
	if player.position.y < margin:
		dir.y = absf(dir.y) + 0.5
	elif player.position.y > height - margin:
		dir.y = -absf(dir.y) - 0.5
	if dir.length() < 0.1:
		dir = Vector2.RIGHT
	dir = dir.normalized()
	_release_actions()
	if dir.x > 0.25:
		Input.action_press("ui_right")
	elif dir.x < -0.25:
		Input.action_press("ui_left")
	if dir.y > 0.25:
		Input.action_press("ui_down")
	elif dir.y < -0.25:
		Input.action_press("ui_up")


func _release_actions() -> void:
	for action in ACTIONS:
		Input.action_release(action)


func _clearance_direction(main: Node, player: Node2D, nearby: Array) -> Vector2:
	var width := float(main.arena.get("w", 1600))
	var height := float(main.arena.get("h", 1200))
	var best := last_dir
	var best_score := -1e9
	for i in 12:
		var dir := Vector2.RIGHT.rotated(TAU * float(i) / 12.0)
		var probe: Vector2 = player.position + dir * 170.0
		probe.x = clampf(probe.x, 30.0, width - 30.0)
		probe.y = clampf(probe.y, 30.0, height - 30.0)
		var clearance := 420.0
		for enemy in nearby:
			if not is_instance_valid(enemy) or enemy.dead:
				continue
			var distance := probe.distance_to(enemy.position)
			if distance < clearance:
				clearance = distance
		var wall := minf(minf(probe.x, width - probe.x), minf(probe.y, height - probe.y))
		var score := minf(clearance, 260.0) + minf(wall, 140.0) * 1.2 + last_dir.dot(dir) * 18.0
		if score > best_score:
			best_score = score
			best = dir
	return best.normalized()


func _shop_score(offer: Dictionary) -> float:
	var weights := {
		"maxHp": 2.0, "hpRegen": 6.0, "armor": 3.0, "dodge": 3.0,
		"lifesteal": 5.0, "dmgP": 1.5, "atkSpd": 1.5, "crit": 1.5,
		"ranged": 1.0, "melee": 1.0, "elem": 1.0, "speed": 1.0,
		"luck": 2.0, "abilityRank": 10.0, "abilityCdMod": -4.0,
	}
	match String(offer.get("kind", "")):
		"item":
			var stats: Dictionary = (offer.get("item", {}) as Dictionary).get("stats", {})
			var score := 40.0
			for key in stats.keys():
				score += float(stats[key]) * float(weights.get(String(key), 1.0))
			return score
		"weapon":
			return 55.0
		"upgrade":
			return 70.0
	return 0.0


func _best_level_offer(main: Node) -> int:
	var weights := {
		"dmgP": 65.0, "maxHp": 60.0, "atkSpd": 55.0, "crit": 45.0, "armor": 40.0,
		"ranged": 40.0, "melee": 40.0, "elem": 40.0, "lifesteal": 35.0,
		"hpRegen": 30.0, "speed": 30.0, "dodge": 30.0,
	}
	var best_index := 0
	var best_score := -1.0
	for i in main.level_offers.size():
		var offer: Dictionary = main.level_offers[i]
		var score := 0.0
		match String(offer.get("type", "")):
			"upgrade":
				score = 120.0 + float(offer.get("index", 0))
			"item":
				score = 70.0
			"stat":
				score = float(weights.get(String(offer.get("key", "")), 10.0))
		if score > best_score:
			best_score = score
			best_index = i
	return best_index


func _cleanup(path: String) -> void:
	for suffix in ["", ".corrupt", ".corrupt1", ".corrupt2"]:
		var candidate: String = path + String(suffix)
		if FileAccess.file_exists(candidate):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))
