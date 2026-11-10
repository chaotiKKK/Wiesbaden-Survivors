extends Node2D
## Short-lived shockwave used by abilities, elite deaths and boss phase breaks.

var life := 0.35
var max_life := 0.35
var radius := 40.0
var color := Color(0.6, 1.0, 0.7)

func setup(pos: Vector2, col: Color, max_radius: float) -> void:
	position = pos
	color = col
	radius = maxf(8.0, max_radius)
	life = 0.35
	max_life = life
	z_index = 3
	queue_redraw()

func tick(delta: float) -> bool:
	life -= delta
	queue_redraw()
	return life <= 0.0

func _draw() -> void:
	var progress := 1.0 - clampf(life / max_life, 0.0, 1.0)
	var current := radius * (0.28 + progress * 0.72)
	var alpha := (1.0 - progress) * 0.9
	draw_arc(Vector2.ZERO, current, 0.0, TAU, 32, Color(color.r, color.g, color.b, alpha), maxf(1.0, 3.0 * (1.0 - progress)))
	draw_arc(Vector2.ZERO, current * 0.72, 0.0, TAU, 24, Color(color.r, color.g, color.b, alpha * 0.35), 1.0)
