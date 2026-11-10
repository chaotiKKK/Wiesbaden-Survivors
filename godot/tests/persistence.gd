extends Node
## Headless gate for save/meta persistence: unlock counters, full run roundtrip,
## shop-phase resume and corrupt-save recovery.

const S_PLAYING := 1
const S_SHOP := 3


func _ready() -> void:
	var path := "user://wbn_persistence_test.save"
	_cleanup(path)
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = path
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)

	# Data-driven character unlock: one won run unlocks the rockstar.
	main.meta["counters"]["wavesWon"] = 1
	main._check_unlocks()
	var unlock_ok: bool = (main.meta.get("unlocked_chars", []) as Array).has("rockstar")

	# A running wave is snapshotted with weapons, HP, level, XP and currency.
	main.start_run("leonidas", 12648430, 3)
	main.wave = 4
	main.run_materials = 77
	main.run_kills = 33
	main.meta["best_wave"] = 4
	main.player.add_weapon("pistol", 1)
	main.player.level = 4
	main.player.xp = 3.0
	main.player.hp = 42.0
	main.save_progress()
	var file_ok: bool = FileAccess.file_exists(path)

	var second: Node = load("res://scenes/Main.tscn").instantiate()
	second.save_path = path
	add_child(second)
	await get_tree().process_frame
	second.set_process(false)
	var meta_ok: bool = (second.meta.get("unlocked_chars", []) as Array).has("rockstar") and int(second.meta.get("best_wave", 0)) >= 4
	var snapshot_ok: bool = not second.run_save.is_empty() and int(second.run_save.get("wave", 0)) == 4 and int(second.run_save.get("materials", 0)) == 77
	second.resume_run()
	var resume_ok: bool = second.state == S_PLAYING and second.wave == 4 and second.run_materials == 77 and second.player.level == 4 and absf(second.player.hp - 42.0) < 0.01 and second.player.weapons.size() == 2

	# A shop snapshot restores the offers including their lock flags.
	main.start_run("leonidas", 12648430, 3)
	main._open_shop()
	main._on_shop_lock(0)
	main.save_progress()
	second._load_progress()
	second.resume_run()
	# Base 5 + wave + 4 per locked offer, matching BROTATO_RULES.rerollCost.
	var shop_resume_ok: bool = second.state == S_SHOP and second.wave == 1 and second.shop_offers.size() > 0 and bool(second.shop_offers[0].get("locked", false)) and int(second.shop_reroll_cost) == 5 + int(second.wave) + 4

	# A deliberately broken file must not crash: defaults, an error and a fresh save.
	var broken := FileAccess.open(path, FileAccess.WRITE)
	broken.store_string("{kaputt: [1,2,3,")
	broken.close()
	second._load_progress()
	var corrupt_ok: bool = second.run_save.is_empty() and not second.last_save_error.is_empty() and (second.meta.get("unlocked_chars", []) as Array).has("leonidas")
	var quarantined_ok: bool = not FileAccess.file_exists(path)
	second._on_menu()
	second.save_progress()
	var rewritten_ok: bool = FileAccess.file_exists(path)
	var reparsed_ok: bool = second._load_progress() == null and second.last_save_error.is_empty() and second.run_save.is_empty()

	var result := {
		"unlock_ok": unlock_ok, "file_ok": file_ok, "meta_ok": meta_ok,
		"snapshot_ok": snapshot_ok, "resume_ok": resume_ok,
		"shop_resume_ok": shop_resume_ok, "corrupt_ok": corrupt_ok,
		"quarantined_ok": quarantined_ok, "rewritten_ok": rewritten_ok,
		"reparsed_ok": reparsed_ok, "error": second.last_save_error,
		"unlocked": (second.meta.get("unlocked_chars", []) as Array).size(),
	}
	print("PERSIST " + JSON.stringify(result))
	var passed: bool = unlock_ok and file_ok and meta_ok and snapshot_ok and resume_ok and shop_resume_ok and corrupt_ok and quarantined_ok and rewritten_ok and reparsed_ok
	_cleanup(path)
	if not passed:
		push_error("Persistence test failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)


func _cleanup(path: String) -> void:
	for suffix in ["", ".corrupt", ".corrupt1", ".corrupt2"]:
		var candidate: String = path + String(suffix)
		if FileAccess.file_exists(candidate):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(candidate))
