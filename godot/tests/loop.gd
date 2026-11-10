extends Node
## Full 20-wave headless playthrough. Level-ups are chosen automatically and
## every shop is left via Continue. This exercises the real state machine,
## wave transitions, boss spawns and the win condition without a display.

const SEED := 12648430
const MAX_TICKS := 200000
const S_PLAYING := 1
const S_LEVELUP := 2
const S_SHOP := 3
const S_DEAD := 5
const S_WIN := 6


func _ready() -> void:
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = "user://wbn_loop_test.save"
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)
	main.start_run("leonidas", SEED, 0)
	# Isolate progression from balance deaths: the run still fights normally,
	# but the test needs all 20 waves to reach the win transition.
	main.player.add_bonus("maxHp", 100000.0)
	main.player.add_bonus("dmgP", 5000.0)
	main.player.heal(1000000.0)

	var waves_seen: Dictionary = {}
	var levelups := 0
	var shops := 0
	var ticks := 0
	var failure := ""
	while ticks < MAX_TICKS:
		ticks += 1
		match main.state:
			S_LEVELUP:
				levelups += 1
				main._on_level_pick(0)
			S_SHOP:
				shops += 1
				for i in main.shop_offers.size():
					var price := int(main.shop_offers[i].get("price", 0))
					if price <= main.run_materials:
						main._on_shop_buy(i)
						break
				main._on_shop_continue()
			S_DEAD:
				failure = "player died"
				break
			S_WIN:
				break
			S_PLAYING:
				waves_seen[main.wave] = true
				main.tick(1.0 / 60.0)
			_:
				failure = "unexpected state %d" % main.state
				break
		if not failure.is_empty() or main.state == S_WIN:
			break
	if main.state != S_WIN and failure.is_empty():
		failure = "tick budget exhausted in state %d" % main.state
	var result: Dictionary = main.get_debug_state()
	result["waves_seen"] = waves_seen.size()
	result["levelups"] = levelups
	result["shops"] = shops
	result["ticks"] = ticks
	result["failure"] = failure
	print("LOOP " + JSON.stringify(result))
	if main.state != S_WIN or waves_seen.size() != 20 or shops != 20 or levelups <= 0 or not failure.is_empty():
		push_error("Loop failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)
