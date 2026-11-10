extends Node
## Headless gate for shop depth: weapon merging (T1->T2, T2->T3, stat growth,
## both sources consumed, UI button) plus reroll cost growth, lock persistence,
## all-locked refusal, purchase deduction and item recycling (25 % refund,
## exact one-copy removal, full stat rollback, UI row).

const S_SHOP := 3


func _ready() -> void:
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = "user://wbn_shop_test.save"
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)
	main.start_run("leonidas", 12648430, 0)
	var player: Node = main.player
	var id := String(GameData.character("leonidas").get("startWeapon", "schrottkanone"))
	var def: Dictionary = GameData.weapon(id)
	var t1: Array = (def.get("tiers", []) as Array)[0]
	var t2: Array = (def.get("tiers", []) as Array)[1]

	# Two identical T1 weapons are a merge candidate and the T2 stats grow.
	player.weapons.clear()
	player.weapons.append({"id": id, "tier": 0, "cd": 0.0, "kills": 0})
	player.weapons.append({"id": id, "tier": 0, "cd": 0.0, "kills": 0})
	player.recalc()
	player.crit = 0.0
	var dmg_t1: float = player._damage_for(def, t1)
	var dmg_t2: float = player._damage_for(def, t2)
	var stat_growth: bool = dmg_t2 > dmg_t1 and float(t2[0]) > float(t1[0])
	var candidates: Array = main._merge_candidates()
	var candidate_ok: bool = candidates.size() == 1 and String(candidates[0].get("id", "")) == id and int(candidates[0].get("tier", -1)) == 0

	# The shop exposes a real button; pressing it consumes both sources.
	main._open_shop()
	var ui_merge_ok := false
	var ui_button: Button = null
	if main.ui.shop_merge_box.get_child_count() > 1:
		ui_button = main.ui.shop_merge_box.get_child(1) as Button
	if ui_button != null:
		ui_merge_ok = "FUSION" in ui_button.text and "T1 + T1" in ui_button.text and "T2" in ui_button.text
		ui_button.pressed.emit()
	var merge_ok: bool = player.weapons.size() == 1 and int(player.weapons[0].get("tier", 0)) == 1

	# The HUD shows the result tier.
	main.ui.show_hud()
	main.update_hud()
	var hud_tier_ok: bool = "T2" in main.ui.weapons_label.text

	# T2 + T2 -> T3 consumes both T2 sources as well.
	player.weapons.clear()
	player.weapons.append({"id": id, "tier": 1, "cd": 0.0, "kills": 0})
	player.weapons.append({"id": id, "tier": 1, "cd": 0.0, "kills": 0})
	player.recalc()
	main._on_shop_merge(id, 1)
	var merge_t3_ok: bool = player.weapons.size() == 1 and int(player.weapons[0].get("tier", 0)) == 2

	# Reroll: base 5 + wave + 4 per locked offer, +4 per reroll; lock survives.
	main.run_materials = 200
	main._open_shop()
	main._on_shop_lock(0)
	var locked_key: String = main._shop_offer_key(main.shop_offers[0])
	var cost_first := int(main.shop_reroll_cost)
	var base_cost_ok: bool = cost_first == 5 + int(main.wave) + 4
	var before_first := int(main.run_materials)
	main._on_shop_reroll()
	var cost_ok: bool = before_first - int(main.run_materials) == cost_first and int(main.shop_reroll_cost) == cost_first + 4
	var lock_ok: bool = bool(main.shop_offers[0].get("locked", false)) and main._shop_offer_key(main.shop_offers[0]) == locked_key
	var second_cost := int(main.shop_reroll_cost)
	var before_second := int(main.run_materials)
	main._on_shop_reroll()
	var rising_ok: bool = before_second - int(main.run_materials) == second_cost and int(main.shop_reroll_cost) == second_cost + 4
	lock_ok = lock_ok and bool(main.shop_offers[0].get("locked", false))

	# If every remaining offer is locked a reroll must be refused for free.
	for i in main.shop_offers.size():
		if not bool(main.shop_offers[i].get("locked", false)):
			main._on_shop_lock(i)
	var before_locked := int(main.run_materials)
	main._on_shop_reroll()
	var all_locked_ok: bool = int(main.run_materials) == before_locked

	# A purchase deducts exactly the shown price.
	main.run_materials = 500
	main._open_shop()
	var price := int(main.shop_offers[0].get("price", 0))
	var before_buy := int(main.run_materials)
	main._on_shop_buy(0)
	var buy_ok: bool = before_buy - int(main.run_materials) == price

	# Item recycling: one copy, 25 % of the current price, complete stat rollback
	# and no buy -> recycle profit. The offer is injected so the item type is
	# deterministic; the transaction runs through the real shop handlers.
	var kaffee: Dictionary = GameData.item("kaffee")
	var item_price := int(round(float(kaffee.get("price", 20)) * (1.0 + float(main.wave) * 0.025) * main._shop_price_mult()))
	main.run_materials = 500
	main.shop_offers = [{
		"kind": "item", "item": kaffee, "name": String(kaffee.get("name", "Item")),
		"desc": "", "price": item_price, "locked": false,
	}]
	var speed_before: float = player.speed
	main._on_shop_buy(0)
	var speed_bought: float = player.speed
	var bought_one: bool = player.items.size() == 1
	var refund: int = int(main._item_sell_value(kaffee))
	main._on_shop_recycle("kaffee")
	var recycle_ok: bool = player.items.is_empty() and bought_one
	var rollback_ok: bool = speed_bought > speed_before and absf(player.speed - speed_before) < 0.01
	var refund_ok: bool = refund == 5 and refund == maxi(1, int(floor(round(float(item_price)) * float(GameData.rules.get("itemRecycleRate", 0.25))))) and refund < item_price
	var materials_ok: bool = int(main.run_materials) == 500 - item_price + refund
	main._on_shop_recycle("gibtsnicht")
	var missing_ok: bool = player.items.is_empty() and int(main.run_materials) == 500 - item_price + refund

	# UI: one row per item type with the copy count, and the real button signal
	# recycles exactly one copy.
	player.add_item(kaffee)
	player.add_item(kaffee)
	main._open_shop()
	var recycle_button: Button = null
	for child in main.ui.shop_recycle_box.get_children():
		if child is Button:
			recycle_button = child
	var ui_recycle_ok: bool = recycle_button != null and "Kaffee" in recycle_button.text and "×2" in recycle_button.text and ("+%d" % refund) in recycle_button.text
	var recycle_section_ok: bool = main.ui.shop_recycle_section.visible and "25" in main.ui.shop_recycle_head.text
	var materials_before_ui := int(main.run_materials)
	if recycle_button != null:
		recycle_button.pressed.emit()
	var ui_one_left_ok: bool = player.items.size() == 1 and int(main.run_materials) == materials_before_ui + refund

	var result := {
		"stat_growth": stat_growth, "candidate_ok": candidate_ok,
		"ui_merge_ok": ui_merge_ok, "merge_ok": merge_ok, "hud_tier_ok": hud_tier_ok,
		"merge_t3_ok": merge_t3_ok, "base_cost_ok": base_cost_ok, "cost_ok": cost_ok, "lock_ok": lock_ok,
		"rising_ok": rising_ok, "all_locked_ok": all_locked_ok, "buy_ok": buy_ok,
		"recycle_ok": recycle_ok, "rollback_ok": rollback_ok, "refund_ok": refund_ok,
		"materials_ok": materials_ok, "missing_ok": missing_ok, "ui_recycle_ok": ui_recycle_ok,
		"recycle_section_ok": recycle_section_ok, "ui_one_left_ok": ui_one_left_ok,
		"refund": refund, "weapons": player.weapons.size(), "materials": main.run_materials,
	}
	print("SHOP " + JSON.stringify(result))
	var passed: bool = stat_growth and candidate_ok and ui_merge_ok and merge_ok and hud_tier_ok and merge_t3_ok and base_cost_ok and cost_ok and lock_ok and rising_ok and all_locked_ok and buy_ok \
		and recycle_ok and rollback_ok and refund_ok and materials_ok and missing_ok and ui_recycle_ok and recycle_section_ok and ui_one_left_ok
	_cleanup(String(main.save_path))
	if not passed:
		push_error("Shop test failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)


func _cleanup(path: String) -> void:
	for suffix in ["", ".corrupt", ".corrupt1", ".corrupt2"]:
		var candidate: String = path + String(suffix)
		if FileAccess.file_exists(candidate):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))
