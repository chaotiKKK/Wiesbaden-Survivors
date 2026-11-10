extends Node
## Verifies that generated Level-Up and Shop buttons emit the right index.
## The full-loop test calls the handlers directly; this test goes through the
## actual Button.pressed signals a player uses.

const S_PLAYING := 1
const S_SHOP := 3


func _ready() -> void:
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = "user://wbn_ui_test.save"
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)
	main.start_run("leonidas", 12648430, 0)
	var backdrop_hidden_in_run: bool = not main.ui.bg.visible
	main.ui.show_title()
	var backdrop_visible_in_menu: bool = main.ui.bg.visible
	main.ui.show_hud()

	main.pending_levels = 1
	main._show_levelup(false)
	var level_button: Button = main.ui.level_box.get_child(2)
	level_button.pressed.emit()
	var level_ok: bool = main.state == S_PLAYING and main.wave == 1

	main.run_materials = 999999
	main._open_shop()
	var shop_row: HBoxContainer = main.ui.shop_box.get_child(0)
	var shop_button: Button = shop_row.get_child(0)
	var before: int = int(main.run_materials)
	shop_button.pressed.emit()
	var shop_ok: bool = main.state == S_SHOP and main.run_materials < before

	# The lock button toggles the offer and the reroll button keeps it.
	var lock_row: HBoxContainer = main.ui.shop_box.get_child(0)
	var lock_button: Button = lock_row.get_child(1)
	lock_button.pressed.emit()
	var lock_ok: bool = bool(main.shop_offers[0].get("locked", false))
	var locked_key: String = main._shop_offer_key(main.shop_offers[0])
	var reroll_before := int(main.run_materials)
	main.ui.shop_reroll_button.pressed.emit()
	var expected_reroll := 5 + int(main.wave) + 4
	var reroll_ok: bool = int(main.run_materials) == reroll_before - expected_reroll
	var lock_persist_ok: bool = bool(main.shop_offers[0].get("locked", false)) and main._shop_offer_key(main.shop_offers[0]) == locked_key

	var result: Dictionary = {
		"level_ok": level_ok, "shop_ok": shop_ok,
		"lock_ok": lock_ok, "reroll_ok": reroll_ok, "lock_persist_ok": lock_persist_ok,
		"backdrop_hidden_in_run": backdrop_hidden_in_run,
		"backdrop_visible_in_menu": backdrop_visible_in_menu,
		"state": main.state, "materials": main.run_materials
	}
	print("UI " + JSON.stringify(result))
	if not level_ok or not shop_ok or not lock_ok or not reroll_ok or not lock_persist_ok or not backdrop_hidden_in_run or not backdrop_visible_in_menu:
		push_error("UI smoke failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)
