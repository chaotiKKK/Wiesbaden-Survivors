extends Node
## Headless gate for the content expansion: every character ability must map to
## a real effect, synergies must activate, wave events/elites must exist and the
## endless transition must leave wave 20 without resetting the run.

const S_PLAYING := 1
const S_WIN := 6

func _ready() -> void:
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = "user://wbn_systems_test.save"
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)
	main.start_run("leonidas", 12648430, 3)

	var mapped := 0
	var ability_ok := 0
	for c in GameData.chars:
		var ability: Dictionary = c.get("ability", {})
		if not ability.is_empty() and main.player.ABILITY_KINDS.has(String(ability.get("id", ""))):
			mapped += 1
		main.player.ability = ability.duplicate(true)
		main.player.ability_cd = 0.0
		main.player.ability_rank = 1
		if main.player.use_ability():
			ability_ok += 1
		for hazard in main.hazards.duplicate():
			hazard.queue_free()
			main.hazards.erase(hazard)
		for turret in main.turrets.duplicate():
			turret.queue_free()
			main.turrets.erase(turret)

	main.start_run("leonidas", 12648430, 3)
	var syn_cls := String(main.player.synergy.get("cls", ""))
	var syn_need := int(main.player.synergy.get("need", 0))
	for weapon in GameData.weapons:
		if (weapon.get("cls", []) as Array).has(syn_cls):
			main.player.add_weapon(String(weapon.get("id", "")), 0)
	var synergy_ok: bool = syn_need == 0 or main.player.synergy_active

	main.start_wave(11)
	var event_ok: bool = String(main.wave_event.get("kind", "")) == "horde" and main.spawn_left > 8 + 11 * 3
	main.update_hud()
	var event_ui_ok: bool = main.ui.event_label.visible and "HORDENWELLE" in main.ui.event_label.text
	main.start_wave(12)
	var elite_event_ok: bool = float(main.wave_event.get("eliteRate", 0.0)) > 0.0
	var before_elites := int(main.elites_spawned)
	main._spawn_enemy({}, true)
	var elite_ok := int(main.elites_spawned) > before_elites

	main.spawn_hazard(main.player.position, "web", 60.0, 2.0, 0.0, Color.WHITE, 0.5)
	main.tick(0.1)
	var hazard_ok: bool = main.hazards.size() > 0

	main.state = S_WIN
	main.wave = 20
	main._on_endless()
	var endless_ok: bool = main.state == S_PLAYING and main.endless and main.wave == 21
	main.update_hud()
	var endless_ui_ok: bool = "∞" in main.ui.hud_wave.text

	var result := {
		"mapped": mapped, "ability_ok": ability_ok, "synergy_ok": synergy_ok,
		"event_ok": event_ok, "event_ui_ok": event_ui_ok, "elite_event_ok": elite_event_ok,
		"elite_ok": elite_ok, "hazard_ok": hazard_ok, "endless_ok": endless_ok,
		"endless_ui_ok": endless_ui_ok, "state": main.state, "wave": main.wave
	}
	print("SYSTEMS " + JSON.stringify(result))
	var passed: bool = mapped == 44 and ability_ok == 44 and synergy_ok and event_ok and event_ui_ok and elite_event_ok and elite_ok and hazard_ok and endless_ok and endless_ui_ok
	if not passed:
		push_error("Systems test failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)
