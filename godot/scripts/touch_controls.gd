extends Control
## Android touch layer: floating left stick + dash button. It deliberately uses
## raw InputEventScreenTouch so it also works before a scene has a GUI focus.

signal dash_pressed
signal ability_pressed

var enabled := false
var move := Vector2.ZERO
var _index := -1
var _base := Vector2.ZERO
var _knob := Vector2.ZERO
var _dash_center := Vector2.ZERO
var _dash_radius := 54.0
var _ability_center := Vector2.ZERO
var _ability_radius := 44.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process_input(true)
	visible = false


func enable(value: bool) -> void:
	enabled = value
	visible = value
	if not enabled:
		reset()
	queue_redraw()


func reset() -> void:
	_index = -1
	move = Vector2.ZERO
	queue_redraw()


func _input(event: InputEvent) -> void:
	if not enabled:
		return
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			if _index == -1 and _in_ability(touch.position):
				emit_signal("ability_pressed")
				accept_event()
			elif _index == -1 and _in_dash(touch.position):
				emit_signal("dash_pressed")
				accept_event()
			elif _index == -1 and touch.position.x < size.x * 0.58 and touch.position.y > size.y * 0.32:
				_index = touch.index
				_base = touch.position
				_knob = touch.position
				_update_move()
				accept_event()
		elif touch.index == _index:
			reset()
			accept_event()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if drag.index == _index:
			_knob = drag.position
			_update_move()
			accept_event()


func _in_dash(pos: Vector2) -> bool:
	return pos.distance_to(_dash_center) <= _dash_radius


func _in_ability(pos: Vector2) -> bool:
	return pos.distance_to(_ability_center) <= _ability_radius


func _update_move() -> void:
	var delta := _knob - _base
	move = (delta / 82.0).limit_length(1.0)
	queue_redraw()


func _process(_delta: float) -> void:
	if size != get_viewport_rect().size:
		size = get_viewport_rect().size
		queue_redraw()


func _draw() -> void:
	if not enabled:
		return
	var view := size
	_dash_center = Vector2(view.x - 118.0, view.y - 118.0)
	_ability_center = Vector2(view.x - 118.0, view.y - 238.0)
	var base := Vector2(132.0, view.y - 132.0)
	# base ring
	draw_circle(base, 74.0, Color(0.05, 0.09, 0.07, 0.55))
	draw_arc(base, 74.0, 0.0, TAU, 48, Color(0.35, 0.95, 0.62, 0.45), 3.0)
	draw_circle(base, 28.0, Color(0.25, 0.85, 0.55, 0.75))
	if _index != -1:
		var offset := (_knob - _base).limit_length(74.0)
		draw_circle(base + offset, 28.0, Color(0.55, 1.0, 0.72, 0.9))
	# dash button
	draw_circle(_dash_center, _dash_radius, Color(0.05, 0.09, 0.07, 0.55))
	draw_arc(_dash_center, _dash_radius, 0.0, TAU, 48, Color(0.98, 0.78, 0.3, 0.7), 3.0)
	draw_circle(_dash_center, 34.0, Color(0.92, 0.65, 0.16, 0.7))
	draw_line(_dash_center + Vector2(-18, 0), _dash_center + Vector2(18, 0), Color(0.1, 0.07, 0.02), 4.0)
	draw_line(_dash_center + Vector2(4, -16), _dash_center + Vector2(20, 0), Color(0.1, 0.07, 0.02), 4.0)
	draw_line(_dash_center + Vector2(4, 16), _dash_center + Vector2(20, 0), Color(0.1, 0.07, 0.02), 4.0)
	# ability button
	draw_circle(_ability_center, _ability_radius, Color(0.05, 0.09, 0.07, 0.55))
	draw_arc(_ability_center, _ability_radius, 0.0, TAU, 40, Color(0.55, 0.95, 1.0, 0.7), 3.0)
	draw_circle(_ability_center, 28.0, Color(0.2, 0.65, 0.8, 0.7))
	draw_line(_ability_center + Vector2(-10, -14), _ability_center + Vector2(4, 0), Color(0.9, 1.0, 1.0), 4.0)
	draw_line(_ability_center + Vector2(4, 0), _ability_center + Vector2(-10, 14), Color(0.9, 1.0, 1.0), 4.0)
	draw_line(_ability_center + Vector2(4, 0), _ability_center + Vector2(14, 0), Color(0.9, 1.0, 1.0), 3.0)
