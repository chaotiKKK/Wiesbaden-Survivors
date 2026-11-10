extends Node
## Headless gate for pickups: material value comes from the enemy data, the
## pickup radius gates collection, the magnet pulls drops in, and the health
## orb heals without exceeding max HP.

const S_PLAYING := 1


func _ready() -> void:
	var path := "user://wbn_pickup_test.save"
	_cleanup(path)
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = path
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)
	main.start_run("leonidas", 12648430, 0)
	var player: Node = main.player
	_clear_pickups(main)
	player.hp = 50.0

	# Kill one data enemy: its exported mat field is the value of the drop.
	var def: Dictionary = GameData.enemy_by_id.get("runner", {})
	main._spawn_enemy(def)
	var enemy: Node2D = main.enemies[0]
	var expected_mat := int(enemy.mat)
	var expected_heal := clampf(round(player.max_hp * 0.06), 4.0, 40.0)
	var heal_data_ok: bool = absf(main.heal_drop_value(enemy) - expected_heal) < 0.01
	main.damage_enemy(enemy, 999999.0)
	var mat_drops: Array = []
	for drop in main.pickups:
		if String(drop.kind) == "mat":
			mat_drops.append(drop)
	var data_ok: bool = mat_drops.size() == 1 and int(mat_drops[0].value) == expected_mat

	# Outside the pickup radius nothing is collected.
	_clear_pickups(main)
	main.run_materials = 0
	main.spawn_pickup(player.position + Vector2(600.0, 0.0), "mat", 5.0, Color.GOLD)
	main._update_pickups(1.0 / 60.0)
	var radius_ok: bool = main.pickups.size() == 1 and main.run_materials == 0

	# Inside the radius the magnet pulls the drop in and it is collected.
	_clear_pickups(main)
	main.spawn_pickup(player.position + Vector2(80.0, 0.0), "mat", 7.0, Color.GOLD)
	var magnet_drop: Node2D = main.pickups[0]
	var start_x: float = magnet_drop.position.x
	main._update_pickups(1.0 / 60.0)
	var magnet_ok: bool = main.pickups.size() == 1 and magnet_drop.position.x < start_x
	for i in 180:
		main._update_pickups(1.0 / 60.0)
		if main.pickups.is_empty():
			break
	var collect_ok: bool = main.run_materials == 7 and main.pickups.is_empty()

	# A health orb is collected through the same radius and heals.
	player.hp = 20.0
	main.spawn_pickup(player.position + Vector2(10.0, 0.0), "hp", 15.0, Color(0.95, 0.32, 0.36))
	main._update_pickups(1.0 / 60.0)
	var heal_ok: bool = player.hp > 20.0 and player.hp <= player.max_hp and main.pickups.is_empty()

	var result := {
		"data_ok": data_ok, "heal_data_ok": heal_data_ok, "radius_ok": radius_ok,
		"magnet_ok": magnet_ok, "collect_ok": collect_ok, "heal_ok": heal_ok,
		"materials": main.run_materials, "hp": player.hp, "state": main.state,
	}
	print("PICKUP " + JSON.stringify(result))
	var passed: bool = data_ok and heal_data_ok and radius_ok and magnet_ok and collect_ok and heal_ok and main.state == S_PLAYING
	_cleanup(path)
	if not passed:
		push_error("Pickup test failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)


func _clear_pickups(main: Node) -> void:
	for drop in main.pickups.duplicate():
		main.pickups.erase(drop)
		drop.queue_free()


func _cleanup(path: String) -> void:
	for suffix in ["", ".corrupt", ".corrupt1", ".corrupt2"]:
		var candidate: String = path + String(suffix)
		if FileAccess.file_exists(candidate):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))
