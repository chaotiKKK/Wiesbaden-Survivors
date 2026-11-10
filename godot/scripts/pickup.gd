extends Node2D
## XP, material and health pickup. Main magnetises and collects it.

var kind := "xp"
var value := 1.0
var color := Color(0.4, 1.0, 0.65)
var radius := 5.0
var velocity := Vector2.ZERO


func setup(pos: Vector2, pickup_kind: String, pickup_value: float, col: Color, vel: Vector2 = Vector2.ZERO) -> void:
	position = pos
	kind = pickup_kind
	value = pickup_value
	color = col
	velocity = vel
	radius = 6.0 if kind == "mat" else 5.0
	queue_redraw()


func tick(delta: float, player: Node2D, magnet_radius: float) -> bool:
	var to_player: Vector2 = player.position - position
	var distance := to_player.length()
	if distance < magnet_radius and distance > 1.0:
		position += to_player.normalized() * minf(420.0, 120.0 + (magnet_radius - distance) * 4.0) * delta
	else:
		position += velocity * delta
		velocity *= 0.92
	queue_redraw()
	return distance < 24.0


func _draw() -> void:
	if kind == "xp":
		var points := PackedVector2Array([Vector2(0, -radius), Vector2(radius, 0), Vector2(0, radius), Vector2(-radius, 0)])
		draw_colored_polygon(points, color)
		draw_circle(Vector2.ZERO, radius * 0.35, Color.WHITE)
	elif kind == "mat":
		draw_circle(Vector2.ZERO, radius, color)
		draw_circle(Vector2.ZERO, radius * 0.45, color.lightened(0.4))
	else:
		draw_rect(Rect2(-radius, -radius, radius * 2.0, radius * 2.0), color)
		draw_line(Vector2(-radius * 0.7, 0), Vector2(radius * 0.7, 0), Color.WHITE, 2.0)
		draw_line(Vector2(0, -radius * 0.7), Vector2(0, radius * 0.7), Color.WHITE, 2.0)
