extends Node
## Headless gate for the curse mechanic: a real shop purchase raises the meter,
## enemy LP/material and incoming damage scale from BROTATO_RULES.curse, the
## caps hold, recycling removes exactly one cursed item, invalid input is a
## no-op, and the derived meter survives save/load.

const S_PLAYING := 1
const S_SHOP := 3


func _ready() -> void:
	var path := "user://wbn_curse_test.save"
	_cleanup(path)
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = path
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)
	main.start_run("leonidas", 12648430, 0)
	var player: Node = main.player
	var rule: Dictionary = GameData.rules.get("curse", {})
	var cursed: Dictionary = GameData.item("c_gier")
	var points := int(cursed.get("curse", 0))
	var empty_ok: bool = points > 0 and player.curse == 0 and main.curse_level() == 0
	var luck_before: float = float(player.stats.get("luck", 0.0))

	# Browser onboarding: from wave 4 a curse-free player always sees one
	# cursed item, capped by the same rarity rule as the browser.
	var original_wave: int = main.wave
	main.wave = 4
	var rolled: Array = main._roll_shop(6)
	var roll_cursed := false
	var roll_cap_ok := true
	for offer in rolled:
		if String(offer.get("kind", "")) == "item":
			var offer_item: Dictionary = offer.get("item", {})
			if bool(offer_item.get("cursed", false)):
				roll_cursed = true
				roll_cap_ok = int(offer_item.get("r", 0)) <= 3
	var onboarding_ok: bool = rolled.size() == 6 and roll_cursed and roll_cap_ok

	# Fallback and no-op edges: no item slot uses a spare weapon slot; below
	# wave 4 or with active curse the shop is left untouched.
	var fallback: Array = [
		{"kind": "upgrade", "index": 0, "price": 1},
		{"kind": "weapon", "weapon": {}, "price": 1},
		{"kind": "weapon", "weapon": {}, "price": 1},
	]
	main._ensure_curse_offer(fallback)
	var fallback_ok: bool = String(fallback[2].get("kind", "")) == "item" \
		and bool((fallback[2].get("item", {}) as Dictionary).get("cursed", false)) \
		and int(fallback[2].get("price", 0)) > 0
	var locked_offers: Array = [
		{"kind": "upgrade", "index": 0, "price": 1, "locked": true},
		{"kind": "weapon", "weapon": {}, "price": 1, "locked": false},
		{"kind": "weapon", "weapon": {}, "price": 1, "locked": false},
	]
	main._ensure_curse_offer(locked_offers, [1, 2])
	var lock_ok: bool = String(locked_offers[0].get("kind", "")) == "upgrade" \
		and bool(locked_offers[0].get("locked", false)) \
		and String(locked_offers[2].get("kind", "")) == "item" \
		and bool((locked_offers[2].get("item", {}) as Dictionary).get("cursed", false))
	var low_wave: Array = [{"kind": "upgrade", "index": 0, "price": 1}]
	main.wave = 3
	main._ensure_curse_offer(low_wave)
	var low_noop_ok: bool = String(low_wave[0].get("kind", "")) == "upgrade"
	main.wave = 4
	player.add_item(cursed)
	var active_noop: Array = [{"kind": "upgrade", "index": 0, "price": 1}]
	main._ensure_curse_offer(active_noop)
	var active_noop_ok: bool = String(active_noop[0].get("kind", "")) == "upgrade"
	player.sell_item(String(cursed.get("id", "")))
	var onboarding_noop_ok: bool = low_noop_ok and active_noop_ok and lock_ok and player.curse == 0
	main.wave = original_wave

	# Baseline enemy before any curse: the same data enemy and wave.
	var enemy_def: Dictionary = GameData.enemy_by_id.get("runner", {})
	main._spawn_enemy(enemy_def)
	var baseline: Node2D = main.enemies.back()
	var baseline_hp: float = baseline.max_hp
	var baseline_mat: float = baseline.mat

	# Buy the cursed item through the real shop row button (the signal a player
	# triggers), not by calling add_item directly.
	main.run_materials = 999
	main.shop_offers = [{
		"kind": "item", "item": cursed, "name": String(cursed.get("name", "Fluch")),
		"desc": main._stats_text(cursed.get("stats", {})) + main._curse_item_suffix(cursed),
		"price": 55, "locked": false,
	}]
	main.state = S_SHOP
	main._show_shop()
	var row: HBoxContainer = main.ui.shop_box.get_child(0)
	var buy_button: Button = row.get_child(0) as Button
	var ui_offer_ok: bool = buy_button != null and "Fluch" in buy_button.text and ("+%d" % points) in buy_button.text
	if buy_button != null:
		buy_button.pressed.emit()
	var gain_ok: bool = player.curse == points and player.items.size() == 1 and main.curse_level() == points
	var shop_header_ok: bool = "FLUCH" in main.ui.shop_materials.text and str(points) in main.ui.shop_materials.text
	main.ui.show_hud()
	main.update_hud()
	var hud_ok: bool = main.ui.curse_label.visible and "FLUCH" in main.ui.curse_label.text and str(points) in main.ui.curse_label.text

	# A newly spawned enemy carries the curse multipliers from the data block.
	main._spawn_enemy(enemy_def)
	var cursed_enemy: Node2D = main.enemies.back()
	var expected_hp: float = baseline_hp * main.curse_hp_mult()
	var hp_scale_ok: bool = absf(cursed_enemy.max_hp - expected_hp) < 0.01 and cursed_enemy.max_hp > baseline_hp
	var mat_scale_ok: bool = int(cursed_enemy.mat) == int(baseline_mat) + main.curse_mat_flat()
	var expected_luck: float = minf(float(rule.get("luckCap", 0.0)), float(points) * float(rule.get("luckPerPoint", 0.0)))

	# Incoming damage goes through the central event multiplier exactly once.
	player.dodge = 0.0
	player.invuln = 0.0
	var hp_before: float = player.hp
	main.damage_player(10.0)
	var expected_damage: float = maxf(1.0, 10.0 * main.curse_damage_mult() - player.armor * 0.6)
	var damage_ok: bool = absf((hp_before - player.hp) - expected_damage) < 0.01
	var item_luck := float((cursed.get("stats", {}) as Dictionary).get("luck", 0.0))
	var luck_ok: bool = absf(float(player.stats.get("luck", 0.0)) - luck_before - item_luck - expected_luck) < 0.01 and absf(main.curse_luck_bonus() - expected_luck) < 0.01

	# Edge case: many synthetic cursed items must stop at every data cap.
	main.state = S_PLAYING
	var synthetic := {"id": "curse_cap_test", "name": "Testfluch", "stats": {}, "curse": int(rule.get("matFlatPer", 5))}
	for i in 20:
		player.add_item(synthetic)
	var caps_ok: bool = absf(main.curse_hp_mult() - float(rule.get("hpMultCap", 1.0))) < 0.001 \
		and absf(main.curse_damage_mult() - float(rule.get("dmgMultCap", 1.0))) < 0.001 \
		and absf(main.curse_luck_bonus() - float(rule.get("luckCap", 0.0))) < 0.001 \
		and main.curse_mat_flat() == int(rule.get("matFlatCap", 0))
	for i in 20:
		player.sell_item("curse_cap_test")

	# Recycle the real cursed item through the shop's real recycle button.
	main.state = S_SHOP
	main._show_shop()
	var recycle_button: Button = null
	for child in main.ui.shop_recycle_box.get_children():
		if child is Button and "Gier" in (child as Button).text:
			recycle_button = child
	var recycle_ui_ok: bool = recycle_button != null and "☠ -%d" % points in recycle_button.text
	if recycle_button != null:
		recycle_button.pressed.emit()
	var recycle_ok: bool = player.curse == 0 and player.items.is_empty() and absf(float(player.stats.get("luck", 0.0)) - luck_before) < 0.01
	main.ui.show_hud()
	main.update_hud()
	var hud_hidden_ok: bool = not main.ui.curse_label.visible

	# Invalid input must be a no-op: wrong index, unknown item id, missing item.
	main.run_materials = 123
	main._on_shop_buy(-1)
	main._on_shop_recycle("gibtsnicht")
	var invalid_ok: bool = main.run_materials == 123 and player.curse == 0 and not player.sell_item("gibtsnicht")

	# State survives save/load because the meter is derived from the inventory.
	player.add_item(cursed)
	main.state = S_PLAYING
	main.save_progress()
	var second: Node = load("res://scenes/Main.tscn").instantiate()
	second.save_path = path
	add_child(second)
	await get_tree().process_frame
	second.set_process(false)
	second.resume_run()
	var save_ok: bool = second.player.curse == points and second.player.items.size() == 1 and "FLUCH" in second._curse_summary()
	second._spawn_enemy(enemy_def)
	var resumed_enemy: Node2D = second.enemies.back()
	var save_scale_ok: bool = absf(resumed_enemy.max_hp - baseline_hp * second.curse_hp_mult()) < 0.01

	var result := {
		"empty_ok": empty_ok, "ui_offer_ok": ui_offer_ok, "gain_ok": gain_ok,
		"onboarding_ok": onboarding_ok, "onboarding_fallback_ok": fallback_ok,
		"onboarding_noop_ok": onboarding_noop_ok,
		"shop_header_ok": shop_header_ok, "hud_ok": hud_ok,
		"hp_scale_ok": hp_scale_ok, "mat_scale_ok": mat_scale_ok,
		"damage_ok": damage_ok, "luck_ok": luck_ok, "caps_ok": caps_ok,
		"recycle_ui_ok": recycle_ui_ok, "recycle_ok": recycle_ok,
		"hud_hidden_ok": hud_hidden_ok, "invalid_ok": invalid_ok,
		"save_ok": save_ok, "save_scale_ok": save_scale_ok,
		"curse": player.curse, "refund_state": main.state,
	}
	print("CURSE " + JSON.stringify(result))
	var passed: bool = empty_ok and ui_offer_ok and gain_ok and onboarding_ok and fallback_ok and onboarding_noop_ok \
		and shop_header_ok and hud_ok \
		and hp_scale_ok and mat_scale_ok and damage_ok and luck_ok and caps_ok \
		and recycle_ui_ok and recycle_ok and hud_hidden_ok and invalid_ok and save_ok and save_scale_ok
	_cleanup(path)
	main.queue_free()
	second.queue_free()
	if not passed:
		push_error("Curse test failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)


func _cleanup(path: String) -> void:
	for suffix in ["", ".corrupt", ".corrupt1", ".corrupt2"]:
		var candidate: String = path + String(suffix)
		if FileAccess.file_exists(candidate):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))
