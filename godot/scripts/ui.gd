extends CanvasLayer
## Responsive menu/HUD layer. Built in code so the same scene works on a
## 1280x720 desktop window and on Android with canvas_items stretching.

signal start_game(char_id: String, seed: int, danger: int)
signal pause_requested
signal resume_requested
signal restart_requested
signal menu_requested
signal level_pick(index: int)
signal shop_buy(index: int)
signal shop_reroll
signal shop_lock(index: int)
signal shop_merge(id: String, tier: int)
signal shop_recycle(id: String)
signal shop_workshop_buy(id: String)
signal shop_continue
signal endless_requested
signal run_resume_requested

const GOLD := Color(0.96, 0.78, 0.31)
const GREEN := Color(0.42, 0.95, 0.62)
const DIM := Color(0.62, 0.72, 0.66)
const INK := Color(0.035, 0.055, 0.045)
const PANEL := Color(0.055, 0.09, 0.075, 0.96)

var root: Control
var bg: ColorRect
var title_panel: Control
var char_panel: Control
var hud: Control
var level_panel: Control
var shop_panel: Control
var pause_panel: Control
var end_panel: Control

var char_grid: GridContainer
var char_summary: Label
var title_meta: Label
var resume_button: Button
var unlocked_chars: Array = []
var seed_edit: LineEdit
var danger_option: OptionButton
var char_buttons: Dictionary = {}
var selected_char := "leonidas"

var hp_bar: ProgressBar
var xp_bar: ProgressBar
var hud_wave: Label
var hud_time: Label
var hud_materials: Label
var hud_kills: Label
var hud_level: Label
var hud_seed: Label
var boss_bar: ProgressBar
var boss_label: Label
var touch_hint: Label
var ability_label: Label
var synergy_label: Label
var weapons_label: Label
var curse_label: Label
var event_label: Label
var endless_button: Button

var level_box: VBoxContainer
var shop_box: VBoxContainer
var shop_merge_box: VBoxContainer
var shop_workshop_box: VBoxContainer
var shop_recycle_section: VBoxContainer
var shop_recycle_head: Label
var shop_recycle_box: HBoxContainer
var shop_hint: Label
var shop_materials: Label
var shop_reroll_button: Button
var end_title: Label
var end_stats: Label


func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)
	bg = ColorRect.new()
	bg.color = Color(0.025, 0.045, 0.035, 1.0)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(bg)
	_build_title()
	_build_chars()
	_build_hud()
	_build_level()
	_build_shop()
	_build_pause()
	_build_end()
	show_title()


func _panel() -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = PANEL
	style.border_color = Color(0.24, 0.52, 0.36, 0.8)
	style.set_border_width_all(2)
	style.set_corner_radius_all(14)
	style.content_margin_left = 22
	style.content_margin_right = 22
	style.content_margin_top = 18
	style.content_margin_bottom = 18
	panel.add_theme_stylebox_override("panel", style)
	return panel


func _label(text: String, size: int = 20, color: Color = Color.WHITE) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	return label


func _button(text: String, min_size: Vector2 = Vector2(250, 52)) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = min_size
	button.add_theme_font_size_override("font_size", 19)
	button.add_theme_color_override("font_color", Color(0.92, 0.98, 0.92))
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.09, 0.18, 0.12, 0.96)
	normal.border_color = Color(0.25, 0.58, 0.38, 0.7)
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(8)
	normal.content_margin_left = 14
	normal.content_margin_right = 14
	normal.content_margin_top = 8
	normal.content_margin_bottom = 8
	var hover := normal.duplicate()
	hover.bg_color = Color(0.14, 0.28, 0.18, 1.0)
	hover.border_color = GOLD
	var pressed := normal.duplicate()
	pressed.bg_color = Color(0.2, 0.35, 0.18, 1.0)
	pressed.border_color = GOLD
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("focus", hover)
	return button


func _full_center() -> CenterContainer:
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(center)
	return center


func _build_title() -> void:
	title_panel = _full_center()
	var card := _panel()
	card.custom_minimum_size = Vector2(800, 600)
	title_panel.add_child(card)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 22)
	margin.add_theme_constant_override("margin_right", 22)
	margin.add_theme_constant_override("margin_top", 18)
	margin.add_theme_constant_override("margin_bottom", 18)
	card.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	margin.add_child(box)
	box.add_child(_label("WIESBADEN", 46, GOLD))
	box.add_child(_label("SURVIVORS", 46, GOLD))
	box.add_child(_label("GODOT 4 · WINDOWS & ANDROID", 16, GREEN))
	box.add_child(_label("44 aktive Fähigkeiten · 19 KI-Familien · 10 Bosse", 17, DIM))
	box.add_child(_label("Wellenereignisse, Eliten, Synergien & Endlosmodus", 14, GREEN))
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(1, 16)
	box.add_child(spacer)
	var play := _button("SPIELEN", Vector2(300, 58))
	play.pressed.connect(show_char_select)
	box.add_child(play)
	resume_button = _button("RUN FORTSETZEN", Vector2(300, 50))
	resume_button.pressed.connect(func() -> void: emit_signal("run_resume_requested"))
	resume_button.visible = false
	box.add_child(resume_button)
	var quit := _button("BEENDEN", Vector2(300, 44))
	quit.pressed.connect(func() -> void: get_tree().quit())
	box.add_child(quit)
	title_meta = _label("", 12, DIM)
	title_meta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title_meta.custom_minimum_size = Vector2(720, 34)
	title_meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title_meta)


func _build_chars() -> void:
	char_panel = _full_center()
	var card := _panel()
	card.custom_minimum_size = Vector2(1160, 640)
	char_panel.add_child(card)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	card.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	margin.add_child(box)
	box.add_child(_label("CHARAKTER WÄHLEN", 28, GOLD))
	char_summary = _label("", 15, DIM)
	char_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	char_summary.custom_minimum_size = Vector2(1100, 42)
	box.add_child(char_summary)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(1100, 420)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	char_grid = GridContainer.new()
	char_grid.columns = 4
	char_grid.add_theme_constant_override("h_separation", 8)
	char_grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(char_grid)
	var controls := HBoxContainer.new()
	controls.add_theme_constant_override("separation", 10)
	box.add_child(controls)
	controls.add_child(_label("SEED", 15, DIM))
	seed_edit = LineEdit.new()
	seed_edit.text = "12648430"
	seed_edit.custom_minimum_size = Vector2(150, 40)
	seed_edit.add_theme_font_size_override("font_size", 16)
	controls.add_child(seed_edit)
	controls.add_child(_label("DANGER", 15, DIM))
	danger_option = OptionButton.new()
	for i in 6:
		danger_option.add_item("Danger %d" % i, i)
	danger_option.select(3)
	danger_option.custom_minimum_size = Vector2(130, 40)
	controls.add_child(danger_option)
	var back := _button("ZURÜCK", Vector2(130, 44))
	back.pressed.connect(show_title)
	controls.add_child(back)
	var start := _button("LAUF STARTEN", Vector2(250, 48))
	start.pressed.connect(_start)
	controls.add_child(start)


func _fill_chars() -> void:
	if char_grid.get_child_count() > 0:
		return
	for c in GameData.chars:
		var id := String(c.get("id", ""))
		var weapon_name := String(GameData.weapon(String(c.get("startWeapon", ""))).get("name", "?"))
		var button := _button("", Vector2(262, 82))
		button.text = "%s\n%s" % [String(c.get("name", id)), weapon_name]
		button.tooltip_text = String(c.get("desc", ""))
		button.toggle_mode = true
		button.pressed.connect(_select_char.bind(id))
		char_grid.add_child(button)
		char_buttons[id] = button
	_apply_unlock_state()
	_select_char(_first_unlocked_char())


func _first_unlocked_char() -> String:
	if unlocked_chars.is_empty() or unlocked_chars.has("leonidas"):
		return "leonidas"
	if not unlocked_chars.is_empty():
		return String(unlocked_chars[0])
	return String(GameData.chars[0].get("id", "leonidas"))


func _apply_unlock_state() -> void:
	if char_buttons.is_empty():
		return
	for key in char_buttons.keys():
		var id := String(key)
		var button: Button = char_buttons[key]
		var char_data: Dictionary = GameData.character(id)
		var open := unlocked_chars.is_empty() or unlocked_chars.has(id)
		var weapon_name := String(GameData.weapon(String(char_data.get("startWeapon", ""))).get("name", "?"))
		button.disabled = not open
		button.text = "%s\n%s" % [String(char_data.get("name", id)), weapon_name if open else "GESPERRT"]
		button.modulate = Color(1.0, 1.0, 1.0, 1.0) if open else Color(0.6, 0.64, 0.62, 0.9)
		var condition: Variant = char_data.get("unlock")
		if not open and typeof(condition) == TYPE_DICTIONARY:
			button.tooltip_text = "%s\nFreischalten: %s" % [String(char_data.get("desc", "")), String((condition as Dictionary).get("text", ""))]
		else:
			button.tooltip_text = String(char_data.get("desc", ""))
	if not unlocked_chars.is_empty() and not unlocked_chars.has(selected_char):
		_select_char(_first_unlocked_char())


func _select_char(id: String) -> void:
	if not unlocked_chars.is_empty() and not unlocked_chars.has(id):
		return
	selected_char = id
	for key in char_buttons.keys():
		var b: Button = char_buttons[key]
		b.button_pressed = String(key) == id
	var c: Dictionary = GameData.character(id)
	var stats: Dictionary = c.get("stats", {})
	var weapon: Dictionary = GameData.weapon(String(c.get("startWeapon", "")))
	var ability: Dictionary = c.get("ability", {})
	var synergy: Dictionary = c.get("synergy", {})
	char_summary.text = "%s · LP +%d · Tempo +%d · Startwaffe: %s\nE: %s (%ss CD, Rang 1) · Synergie: %d× %s → %s" % [
		String(c.get("role", "Held")),
		int(stats.get("maxHp", 0)), int(stats.get("speed", 0)),
		String(weapon.get("name", "?")), String(ability.get("name", "Fähigkeit")),
		str(ability.get("cd", 10)), int(synergy.get("need", 0)),
		String(synergy.get("cls", "?")), String(synergy.get("label", "Bonus"))
	]


func _start() -> void:
	var seed := int(seed_edit.text)
	if seed == 0:
		seed = 12648430
	emit_signal("start_game", selected_char, seed, danger_option.selected)


func _build_hud() -> void:
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud)
	var top := PanelContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 10
	top.offset_top = 10
	top.offset_right = -10
	top.offset_bottom = 102
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.07, 0.05, 0.9)
	style.set_corner_radius_all(10)
	style.border_color = Color(0.2, 0.45, 0.3, 0.7)
	style.set_border_width_all(1)
	top.add_theme_stylebox_override("panel", style)
	hud.add_child(top)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	top.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	margin.add_child(row)
	hud_wave = _label("WELLE 1/20", 20, GOLD)
	row.add_child(hud_wave)
	hud_time = _label("", 18, DIM)
	row.add_child(hud_time)
	hud_materials = _label("MAT 0", 18, GOLD)
	row.add_child(hud_materials)
	hud_kills = _label("KILLS 0", 18, DIM)
	row.add_child(hud_kills)
	hud_level = _label("LV 1", 18, GREEN)
	row.add_child(hud_level)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	hud_seed = _label("", 13, Color(0.45, 0.55, 0.5))
	row.add_child(hud_seed)
	var pause := _button("II", Vector2(54, 42))
	pause.pressed.connect(func() -> void: emit_signal("pause_requested"))
	row.add_child(pause)

	var bars := VBoxContainer.new()
	bars.position = Vector2(22, 118)
	bars.size = Vector2(310, 70)
	bars.add_theme_constant_override("separation", 5)
	hud.add_child(bars)
	hp_bar = ProgressBar.new()
	hp_bar.custom_minimum_size = Vector2(310, 24)
	hp_bar.show_percentage = false
	_style_bar(hp_bar, Color(0.9, 0.25, 0.28))
	bars.add_child(hp_bar)
	xp_bar = ProgressBar.new()
	xp_bar.custom_minimum_size = Vector2(310, 14)
	xp_bar.show_percentage = false
	_style_bar(xp_bar, Color(0.35, 0.9, 0.55))
	bars.add_child(xp_bar)

	boss_bar = ProgressBar.new()
	boss_bar.set_anchors_preset(Control.PRESET_CENTER_TOP)
	boss_bar.offset_left = -200
	boss_bar.offset_top = 112
	boss_bar.offset_right = 200
	boss_bar.offset_bottom = 130
	boss_bar.show_percentage = false
	_style_bar(boss_bar, Color(0.95, 0.45, 0.25))
	boss_bar.visible = false
	hud.add_child(boss_bar)
	boss_label = _label("BOSS", 13, GOLD)
	boss_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	boss_label.offset_left = -200
	boss_label.offset_top = 132
	boss_label.offset_right = 200
	boss_label.offset_bottom = 152
	boss_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_label.visible = false
	hud.add_child(boss_label)

	touch_hint = _label("WASD / Pfeile · E = Fähigkeit · Shift = Dash · Esc = Pause", 14, DIM)
	touch_hint.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	touch_hint.offset_left = -280
	touch_hint.offset_top = -36
	touch_hint.offset_right = 280
	touch_hint.offset_bottom = -10
	touch_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(touch_hint)

	ability_label = _label("E: BEREIT", 15, Color(0.55, 0.95, 1.0))
	ability_label.position = Vector2(22, 194)
	hud.add_child(ability_label)
	synergy_label = _label("SYNERGIE 0/0", 14, GOLD)
	synergy_label.position = Vector2(22, 220)
	hud.add_child(synergy_label)
	weapons_label = _label("", 13, DIM)
	weapons_label.position = Vector2(22, 244)
	hud.add_child(weapons_label)
	curse_label = _label("", 12, Color(0.78, 0.6, 1.0))
	curse_label.position = Vector2(22, 266)
	curse_label.visible = false
	hud.add_child(curse_label)
	event_label = _label("", 17, GOLD)
	event_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	event_label.offset_left = -360
	event_label.offset_top = 158
	event_label.offset_right = 360
	event_label.offset_bottom = 206
	event_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	event_label.visible = false
	hud.add_child(event_label)


func _style_bar(bar: ProgressBar, color: Color) -> void:
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.02, 0.04, 0.03, 0.85)
	bg.set_corner_radius_all(5)
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	fill.set_corner_radius_all(5)
	bar.add_theme_stylebox_override("background", bg)
	bar.add_theme_stylebox_override("fill", fill)


func _build_level() -> void:
	level_panel = _full_center()
	var card := _panel()
	card.custom_minimum_size = Vector2(780, 520)
	level_panel.add_child(card)
	level_box = VBoxContainer.new()
	level_box.add_theme_constant_override("separation", 12)
	card.add_child(level_box)


func _build_shop() -> void:
	shop_panel = _full_center()
	var card := _panel()
	card.custom_minimum_size = Vector2(920, 620)
	shop_panel.add_child(card)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	card.add_child(box)
	box.add_child(_label("SHOP", 30, GOLD))
	shop_materials = _label("", 18, GREEN)
	box.add_child(shop_materials)
	shop_merge_box = VBoxContainer.new()
	shop_merge_box.add_theme_constant_override("separation", 6)
	box.add_child(shop_merge_box)
	# Inventory recycling: one compact row of buttons, so a large inventory
	# scrolls sideways instead of pushing the offers off the card.
	shop_recycle_section = VBoxContainer.new()
	shop_recycle_section.add_theme_constant_override("separation", 4)
	shop_recycle_section.visible = false
	box.add_child(shop_recycle_section)
	shop_recycle_head = _label("", 14, GOLD)
	shop_recycle_section.add_child(shop_recycle_head)
	var recycle_scroll := ScrollContainer.new()
	recycle_scroll.custom_minimum_size = Vector2(0, 62)
	recycle_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	shop_recycle_section.add_child(recycle_scroll)
	shop_recycle_box = HBoxContainer.new()
	shop_recycle_box.add_theme_constant_override("separation", 8)
	recycle_scroll.add_child(shop_recycle_box)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(900, 320)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	var shop_content := VBoxContainer.new()
	shop_content.add_theme_constant_override("separation", 8)
	scroll.add_child(shop_content)
	shop_box = VBoxContainer.new()
	shop_box.add_theme_constant_override("separation", 8)
	shop_content.add_child(shop_box)
	shop_workshop_box = VBoxContainer.new()
	shop_workshop_box.add_theme_constant_override("separation", 6)
	shop_content.add_child(shop_workshop_box)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	box.add_child(row)
	shop_reroll_button = _button("REROLL (8)", Vector2(190, 46))
	shop_reroll_button.pressed.connect(func() -> void: emit_signal("shop_reroll"))
	row.add_child(shop_reroll_button)
	var cont := _button("WEITER", Vector2(220, 46))
	cont.pressed.connect(func() -> void: emit_signal("shop_continue"))
	row.add_child(cont)
	shop_hint = _label("", 12, DIM)
	row.add_child(shop_hint)


func _build_pause() -> void:
	pause_panel = _full_center()
	var card := _panel()
	card.custom_minimum_size = Vector2(520, 280)
	pause_panel.add_child(card)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	card.add_child(box)
	box.add_child(_label("PAUSE", 34, GOLD))
	var resume := _button("WEITERSPIELEN", Vector2(300, 50))
	resume.pressed.connect(func() -> void: emit_signal("resume_requested"))
	box.add_child(resume)
	var menu := _button("HAUPTMENÜ", Vector2(300, 44))
	menu.pressed.connect(func() -> void: emit_signal("menu_requested"))
	box.add_child(menu)


func _build_end() -> void:
	end_panel = _full_center()
	var card := _panel()
	card.custom_minimum_size = Vector2(650, 400)
	end_panel.add_child(card)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	card.add_child(box)
	end_title = _label("", 34, GOLD)
	box.add_child(end_title)
	end_stats = _label("", 17, DIM)
	box.add_child(end_stats)
	endless_button = _button("ENDLOSMODUS", Vector2(260, 48))
	endless_button.pressed.connect(func() -> void: emit_signal("endless_requested"))
	endless_button.visible = false
	box.add_child(endless_button)
	var again := _button("NOCHMAL", Vector2(260, 48))
	again.pressed.connect(func() -> void: emit_signal("restart_requested"))
	box.add_child(again)
	var menu := _button("HAUPTMENÜ", Vector2(260, 44))
	menu.pressed.connect(func() -> void: emit_signal("menu_requested"))
	box.add_child(menu)


func _set_backdrop(visible: bool) -> void:
	if bg != null:
		bg.visible = visible


func show_title() -> void:
	hide_all()
	_set_backdrop(true)
	title_panel.visible = true


func show_char_select() -> void:
	_fill_chars()
	_apply_unlock_state()
	hide_all()
	_set_backdrop(true)
	char_panel.visible = true


func show_hud() -> void:
	hide_all()
	_set_backdrop(false)
	hud.visible = true
	touch_hint.visible = not OS.has_feature("mobile")


func hide_all() -> void:
	_set_backdrop(false)
	for panel in [title_panel, char_panel, hud, level_panel, shop_panel, pause_panel, end_panel]:
		if panel != null:
			panel.visible = false


func set_unlocked_chars(ids: Array) -> void:
	unlocked_chars = ids.duplicate()
	_apply_unlock_state()


func set_meta_summary(text: String) -> void:
	if title_meta != null:
		title_meta.text = text


func set_resume_available(available: bool, info: String = "") -> void:
	if resume_button == null:
		return
	resume_button.visible = available
	if available:
		resume_button.text = "RUN FORTSETZEN" + (" · " + info if not info.is_empty() else "")


func update_hud(d: Dictionary) -> void:
	if not hud.visible:
		return
	var max_hp := maxf(1.0, float(d.get("max_hp", 100.0)))
	hp_bar.max_value = max_hp
	hp_bar.value = float(d.get("hp", 0.0))
	var next_xp := maxf(1.0, float(d.get("xp_next", 10.0)))
	xp_bar.max_value = next_xp
	xp_bar.value = float(d.get("xp", 0.0))
	var endless := bool(d.get("endless", false))
	hud_wave.text = ("WELLE %d/∞" if endless else "WELLE %d/20") % int(d.get("wave", 1))
	hud_time.text = "%.1fs" % maxf(0.0, float(d.get("time_left", 0.0)))
	hud_materials.text = "MAT %d" % int(d.get("materials", 0))
	hud_kills.text = "KILLS %d" % int(d.get("kills", 0))
	hud_level.text = "LV %d" % int(d.get("level", 1))
	hud_seed.text = "SEED %d" % int(d.get("seed", 0))
	boss_bar.visible = float(d.get("boss_max", 0.0)) > 0.0
	boss_label.visible = boss_bar.visible
	if boss_bar.visible:
		boss_bar.max_value = float(d.get("boss_max", 1.0))
		boss_bar.value = float(d.get("boss_hp", 0.0))
		boss_label.text = "BOSS  %d / %d" % [int(d.get("boss_hp", 0.0)), int(d.get("boss_max", 0.0))]
	var cooldown := float(d.get("ability_cd", 0.0))
	if cooldown <= 0.0:
		ability_label.text = "E: %s  ·  BEREIT" % String(d.get("ability_name", "Fähigkeit"))
		ability_label.add_theme_color_override("font_color", Color(0.55, 1.0, 0.72))
	else:
		ability_label.text = "E: %s  ·  %.1fs" % [String(d.get("ability_name", "Fähigkeit")), cooldown]
		ability_label.add_theme_color_override("font_color", DIM)
	var syn_count := int(d.get("synergy_count", 0))
	var syn_need := int(d.get("synergy_need", 0))
	if bool(d.get("synergy_active", false)):
		synergy_label.text = "SYNERGIE AKTIV · %d/%d × %s" % [syn_count, syn_need, String(d.get("synergy_cls", ""))]
		synergy_label.add_theme_color_override("font_color", GOLD)
	else:
		synergy_label.text = "SYNERGIE %d/%d × %s" % [syn_count, syn_need, String(d.get("synergy_cls", ""))]
		synergy_label.add_theme_color_override("font_color", DIM)
	var weapons_text := String(d.get("weapons_text", ""))
	weapons_label.text = "%s\nWAFFEN %d/%d · ELITEN %d · GEFAHREN %d" % [
		weapons_text, int(d.get("weapon_count", 0)), int(d.get("max_weapons", 6)),
		int(d.get("elites", 0)), int(d.get("hazards", 0))]
	var curse := int(d.get("curse", 0))
	curse_label.visible = curse > 0
	if curse_label.visible:
		curse_label.text = String(d.get("curse_text", "☠ FLUCH %d" % curse))
	var event: Dictionary = d.get("wave_event", {})
	event_label.visible = not event.is_empty()
	if event_label.visible:
		event_label.text = "%s\n%s" % [String(event.get("name", "WELLENEREIGNIS")), String(event.get("desc", ""))]
		event_label.add_theme_color_override("font_color", GOLD if String(event.get("kind", "")) == "elite" else Color(1.0, 0.55, 0.4))


func show_levelup(offers: Array) -> void:
	_set_backdrop(false)
	level_panel.visible = true
	_clear(level_box)
	level_box.add_child(_label("LEVEL-UP", 30, GOLD))
	level_box.add_child(_label("Wähle eine Verbesserung", 16, DIM))
	for i in offers.size():
		var offer: Dictionary = offers[i]
		var b := _button("%s\n%s" % [String(offer.get("title", "")), String(offer.get("desc", ""))], Vector2(660, 72))
		b.pressed.connect(_emit_level_pick.bind(i))
		level_box.add_child(b)


func show_shop(offers: Array, materials: int, merges: Array = [], reroll_cost: int = 8, recycle: Array = [], curse: int = 0, curse_summary: String = "", workshop: Array = []) -> void:
	_set_backdrop(false)
	shop_panel.visible = true
	shop_materials.text = "Material: %d" % materials
	if curse > 0:
		shop_materials.text += " · ☠ FLUCH %d" % curse
		shop_materials.tooltip_text = curse_summary
	else:
		shop_materials.tooltip_text = ""
	_clear(shop_box)
	_clear(shop_merge_box)
	_clear(shop_recycle_box)
	_clear(shop_workshop_box)
	var rate_pct := int(round(float(GameData.rules.get("itemRecycleRate", 0.25)) * 100.0))
	if shop_hint != null:
		shop_hint.text = "Reroll behält Sperren · Fusionen kostenlos · Recycling %d %% · Werkstatt" % rate_pct
	shop_recycle_section.visible = not recycle.is_empty()
	if shop_recycle_section.visible:
		shop_recycle_head.text = "INVENTAR · RECYCLING %d %% RÜCKERSTATTUNG" % rate_pct
		for raw in recycle:
			var entry: Dictionary = raw
			var id := String(entry.get("id", ""))
			if id.is_empty():
				continue
			var label := "%s ×%d\n+%d Material" % [String(entry.get("name", id)), int(entry.get("count", 1)), int(entry.get("refund", 0))]
			if int(entry.get("curse", 0)) > 0:
				label += " · ☠ -%d" % int(entry.get("curse", 0))
			var b := _button(label, Vector2(210, 56))
			b.tooltip_text = "Eine Kopie zurückgeben (+%d Material).\n%s" % [int(entry.get("refund", 0)), String(entry.get("desc", ""))]
			b.pressed.connect(_emit_shop_recycle.bind(id))
			shop_recycle_box.add_child(b)
	if not merges.is_empty():
		shop_merge_box.add_child(_label("WERKSTATT · GLEICHE WAFFEN FUSIONIEREN", 14, GOLD))
		for raw in merges:
			var entry: Dictionary = raw
			var id := String(entry.get("id", ""))
			var tier := int(entry.get("tier", 0))
			var def: Dictionary = GameData.weapon(id)
			var b := _button("FUSION · %s  T%d + T%d → T%d" % [String(def.get("name", "?")), tier + 1, tier + 1, tier + 2], Vector2(880, 42))
			b.tooltip_text = String(def.get("special", ""))
			b.pressed.connect(_emit_shop_merge.bind(id, tier))
			shop_merge_box.add_child(b)
	if offers.is_empty():
		shop_box.add_child(_label("Nichts im Angebot. Weiter zur nächsten Welle.", 16, DIM))
	if not workshop.is_empty():
		shop_workshop_box.add_child(_label("WERKSTATT · DAUERHAFTE AUFTRÄGE · PREIS STEIGT PRO STAPEL", 14, GOLD))
		for raw in workshop:
			var entry: Dictionary = raw
			var id := String(entry.get("id", ""))
			if id.is_empty():
				continue
			var owned := int(entry.get("owned", 0))
			var max_stacks := int(entry.get("max", 1))
			var price := int(entry.get("price", 0))
			var maxed := owned >= max_stacks
			var label := "⚒ %s  %d/%d\n%s\n%s" % [
				String(entry.get("name", id)), owned, max_stacks,
				String(entry.get("stats_text", "")), "MAX" if maxed else "%d Material" % price]
			var b := _button(label, Vector2(860, 88))
			b.tooltip_text = String(entry.get("desc", ""))
			b.disabled = maxed or price > materials
			b.pressed.connect(_emit_shop_workshop_buy.bind(id))
			shop_workshop_box.add_child(b)
	for i in offers.size():
		var offer: Dictionary = offers[i]
		var price := int(offer.get("price", 0))
		var locked := bool(offer.get("locked", false))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var label := "%s\n%s\n%d Material" % [String(offer.get("name", "")), String(offer.get("desc", "")), price]
		if locked:
			label += " · GESPERRT"
		var b := _button(label, Vector2(720, 86))
		b.disabled = price > materials
		b.pressed.connect(_emit_shop_buy.bind(i))
		row.add_child(b)
		var lock := _button("GELOCKT" if locked else "SPERREN", Vector2(150, 86))
		lock.toggle_mode = true
		lock.button_pressed = locked
		lock.pressed.connect(_emit_shop_lock.bind(i))
		row.add_child(lock)
		shop_box.add_child(row)
	if shop_reroll_button != null:
		var all_locked := true
		for raw in offers:
			if not bool((raw as Dictionary).get("locked", false)):
				all_locked = false
				break
		shop_reroll_button.text = "REROLL (%d)" % reroll_cost
		shop_reroll_button.disabled = all_locked or reroll_cost > materials


func _emit_level_pick(index: int) -> void:
	emit_signal("level_pick", index)


func _emit_shop_buy(index: int) -> void:
	emit_signal("shop_buy", index)


func _emit_shop_lock(index: int) -> void:
	emit_signal("shop_lock", index)


func _emit_shop_merge(id: String, tier: int) -> void:
	emit_signal("shop_merge", id, tier)


func _emit_shop_recycle(id: String) -> void:
	emit_signal("shop_recycle", id)


func _emit_shop_workshop_buy(id: String) -> void:
	emit_signal("shop_workshop_buy", id)


func show_pause() -> void:
	_set_backdrop(false)
	pause_panel.visible = true


func show_end(win: bool, stats: Dictionary) -> void:
	hide_all()
	end_panel.visible = true
	var was_endless := bool(stats.get("endless", false))
	end_title.text = "ENDLOS-SIEG" if win and was_endless else ("GEWONNEN" if win else "GEFALLEN")
	end_title.add_theme_color_override("font_color", GREEN if win else Color(0.95, 0.35, 0.3))
	end_stats.text = "Welle %d · Kills %d · Material %d · Level %d · Eliten %d" % [
		int(stats.get("wave", 1)), int(stats.get("kills", 0)),
		int(stats.get("materials", 0)), int(stats.get("level", 1)),
		int(stats.get("elites", 0))
	]
	if endless_button != null:
		endless_button.visible = win and not was_endless


func _clear(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()
