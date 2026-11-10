extends Node
## Headless gate for workshop orders: six data-driven run upgrades, two offers
## per shop, price growth per stack, max stacks, affordability, real UI buttons,
## stat application through recalc(), save/resume and reroll persistence.

const S_SHOP := 3


func _ready() -> void:
	var path := "user://wbn_workshop_test.save"
	_cleanup(path)
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = path
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)
	main.start_run("leonidas", 12648430, 0)
	var player: Node = main.player
	var catalog_ok: bool = GameData.run_upgrades.size() == 6
	for def in GameData.run_upgrades:
		catalog_ok = catalog_ok and not String(def.get("id", "")).is_empty() \
			and not (def.get("stats", {}) as Dictionary).is_empty() \
			and int(def.get("maxStacks", 0)) > 0

	# Natural shop generation: two unique, valid offers, separate from the six
	# normal shop slots.
	main.wave = 6
	main.run_materials = 1000
	player.run_upgrades.clear()
	player.recalc()
	main._open_shop()
	var natural_ids: Array = []
	for raw in main.shop_workshop:
		natural_ids.append(String((raw as Dictionary).get("id", "")))
	var natural_ok: bool = main.shop_workshop.size() == 2 \
		and natural_ids[0] != natural_ids[1] \
		and not GameData.run_upgrade(natural_ids[0]).is_empty() \
		and not GameData.run_upgrade(natural_ids[1]).is_empty()

	# Deterministic offer through the production offer builder. The UI button is
	# the only purchase path used below.
	var def: Dictionary = GameData.run_upgrade("schweissgeraet")
	var hp_before: float = player.max_hp
	var armor_before: float = player.armor
	var speed_before: float = player.speed
	main.run_materials = 1000
	player.run_upgrades.clear()
	player.recalc()
	main.shop_workshop = [main._run_upgrade_offer(def)]
	main._show_shop()
	var first: Dictionary = main.shop_workshop[0]
	var price0 := int(first.get("price", 0))
	var expected0 := maxi(3, int(round(float(def.get("basePrice", 0)) * (1.0 + float(main.wave) * 0.045) * main._shop_price_mult())))
	var formula_ok: bool = price0 == expected0 and price0 > 0
	var button := _find_button(main.ui.shop_workshop_box, "Schwei")
	var ui_ok: bool = button != null and "0/4" in button.text and "%d Material" % price0 in button.text
	var materials_before := int(main.run_materials)
	if button != null:
		button.pressed.emit()
	var count1: int = player.run_upgrade_count("schweissgeraet")
	var purchase_ok: bool = count1 == 1 and int(main.run_materials) == materials_before - price0
	var stat_ok: bool = absf(player.max_hp - (hp_before + 24.0)) < 0.01 \
		and absf(player.armor - (armor_before + 2.0)) < 0.01 \
		and absf(player.speed - (speed_before - 27.0)) < 0.01
	var price1 := int((main.shop_workshop[0] as Dictionary).get("price", 0))
	var price_rise_ok: bool = price1 > price0 and count1 == 1
	var after_buy_button := _find_button(main.ui.shop_workshop_box, "Schwei")
	var after_buy_ui_ok: bool = after_buy_button != null and "1/4" in after_buy_button.text and "%d Material" % price1 in after_buy_button.text

	button = _find_button(main.ui.shop_workshop_box, "Schwei")
	if button != null:
		button.pressed.emit()
	var count2: int = player.run_upgrade_count("schweissgeraet")
	var stack_ok: bool = count2 == 2 and absf(player.max_hp - (hp_before + 48.0)) < 0.01 \
		and absf(player.armor - (armor_before + 4.0)) < 0.01

	# Max stacks are a hard cap: the UI disables the card and even a direct
	# handler call cannot spend material.
	player.run_upgrades["schweissgeraet"] = 4
	player.recalc()
	main._refresh_workshop_offers()
	main._show_shop()
	var max_button := _find_button(main.ui.shop_workshop_box, "Schwei")
	var max_ui_ok: bool = max_button != null and max_button.disabled and "MAX" in max_button.text
	var materials_at_max := int(main.run_materials)
	main._on_shop_workshop_buy("schweissgeraet")
	var max_noop_ok: bool = player.run_upgrade_count("schweissgeraet") == 4 \
		and int(main.run_materials) == materials_at_max

	# A short wallet must not buy the order or change stacks.
	var other: Dictionary = GameData.run_upgrade("kurierfahrt")
	player.run_upgrades.clear()
	player.recalc()
	main.shop_workshop = [main._run_upgrade_offer(other)]
	main._show_shop()
	var other_price := int((main.shop_workshop[0] as Dictionary).get("price", 0))
	main.run_materials = other_price - 1
	var poor_materials := int(main.run_materials)
	main._on_shop_workshop_buy("kurierfahrt")
	var insufficient_ok: bool = player.run_upgrade_count("kurierfahrt") == 0 \
		and int(main.run_materials) == poor_materials

	# Save/resume: the owned stacks and the active workshop offers survive.
	player.run_upgrades.clear()
	player.add_run_upgrade("schweissgeraet")
	player.add_run_upgrade("schweissgeraet")
	main.run_materials = 500
	main.shop_workshop = [main._run_upgrade_offer(def)]
	main._show_shop()
	var saved_hp: float = player.max_hp
	main.save_progress()
	var second: Node = load("res://scenes/Main.tscn").instantiate()
	second.save_path = path
	add_child(second)
	await get_tree().process_frame
	second.set_process(false)
	second.resume_run()
	var save_ok: bool = second.player.run_upgrade_count("schweissgeraet") == 2 \
		and absf(second.player.max_hp - saved_hp) < 0.01 \
		and second.state == S_SHOP
	var restored_workshop_ok: bool = second.shop_workshop.size() == 1 \
		and String((second.shop_workshop[0] as Dictionary).get("id", "")) == "schweissgeraet"

	# Reroll changes normal offers but not the permanent workshop orders.
	main.run_materials = 1000
	main.shop_workshop = [main._run_upgrade_offer(def)]
	main._show_shop()
	var ids_before_reroll: Array = []
	for raw in main.shop_workshop:
		ids_before_reroll.append(String((raw as Dictionary).get("id", "")))
	main._on_shop_reroll()
	var ids_after_reroll: Array = []
	for raw in main.shop_workshop:
		ids_after_reroll.append(String((raw as Dictionary).get("id", "")))
	var reroll_ok: bool = ids_before_reroll == ids_after_reroll

	var result := {
		"catalog_ok": catalog_ok, "natural_ok": natural_ok, "formula_ok": formula_ok,
		"ui_ok": ui_ok, "after_buy_ui_ok": after_buy_ui_ok, "purchase_ok": purchase_ok, "stat_ok": stat_ok,
		"price_rise_ok": price_rise_ok, "stack_ok": stack_ok,
		"max_ui_ok": max_ui_ok, "max_noop_ok": max_noop_ok,
		"insufficient_ok": insufficient_ok, "save_ok": save_ok,
		"restored_workshop_ok": restored_workshop_ok, "reroll_ok": reroll_ok,
		"count": player.run_upgrade_count("schweissgeraet"),
		"materials": main.run_materials, "price0": price0, "price1": price1,
	}
	print("WORKSHOP " + JSON.stringify(result))
	var passed: bool = catalog_ok and natural_ok and formula_ok and ui_ok and after_buy_ui_ok \
		and purchase_ok and stat_ok and price_rise_ok and stack_ok \
		and max_ui_ok and max_noop_ok and insufficient_ok and save_ok \
		and restored_workshop_ok and reroll_ok
	_cleanup(path)
	if not passed:
		push_error("Workshop test failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)


func _find_button(box: Node, needle: String) -> Button:
	for child in box.get_children():
		if child is Button and needle in (child as Button).text:
			return child
	return null


func _cleanup(path: String) -> void:
	for suffix in ["", ".corrupt", ".corrupt1", ".corrupt2"]:
		var candidate: String = path + String(suffix)
		if FileAccess.file_exists(candidate):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))
