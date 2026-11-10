extends Node
## Headless contract: boot the real Main scene, start two runs with the same
## seed, advance the real tick, and require identical outcome values. This is
## the Godot counterpart of the browser's playtest gates.

const SEED := 12648430
const TICKS := 900


func _ready() -> void:
	var main: Node = load("res://scenes/Main.tscn").instantiate()
	main.save_path = "user://wbn_smoke_test.save"
	add_child(main)
	await get_tree().process_frame
	main.set_process(false)

	var first := _run_case(main)
	var second := _run_case(main)
	var keys := ["kills", "materials", "enemies", "hp", "level", "wave"]
	var deterministic := true
	for key in keys:
		if first.get(key) != second.get(key):
			deterministic = false
	var valid := int(first.get("kills", 0)) > 0 and int(first.get("weapons", 0)) > 0
	var result := {
		"first": first, "second": second,
		"deterministic": deterministic, "valid": valid,
		"seed": SEED, "ticks": TICKS
	}
	print("SMOKE " + JSON.stringify(result))
	if not deterministic or not valid:
		push_error("Smoke failed: " + JSON.stringify(result))
		get_tree().quit(1)
	else:
		get_tree().quit(0)


func _run_case(main: Node) -> Dictionary:
	main.start_run("leonidas", SEED, 3)
	for i in TICKS:
		main.tick(1.0 / 60.0)
	return main.get_debug_state()
