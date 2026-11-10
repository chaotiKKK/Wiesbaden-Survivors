extends Node2D
## Lightweight projectile; Main owns movement and collision so the whole
## combat step stays deterministic and testable without physics queries.

var velocity := Vector2.ZERO
var damage := 0.0
var radius := 5.0
var pierce := 0
var color := Color.WHITE
var life := 1.6
var from_player := true


func setup(pos: Vector2, vel: Vector2, dmg: float, col: Color, r: float = 5.0, p: int = 0, is_player: bool = true) -> void:
	position = pos
	velocity = vel
	damage = dmg
	color = col
	radius = r
	pierce = p
	from_player = is_player
	life = 2.2
	queue_redraw()


func tick(delta: float) -> void:
	position += velocity * delta
	life -= delta
	if life <= 0.0:
		queue_free()


func _draw() -> void:
	if from_player:
		draw_circle(Vector2.ZERO, radius + 2.0, Color(color.r, color.g, color.b, 0.18))
		draw_circle(Vector2.ZERO, radius, color)
		draw_circle(Vector2.ZERO, radius * 0.45, color.lightened(0.55))
	else:
		draw_circle(Vector2.ZERO, radius + 2.0, Color(color.r, color.g, color.b, 0.18))
		draw_circle(Vector2.ZERO, radius, color.darkened(0.1))
