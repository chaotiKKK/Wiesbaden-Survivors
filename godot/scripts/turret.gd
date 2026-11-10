extends Node2D
## Deployable support turret used by the technician ability.

var main: Node = null
var life := 15.0
var cooldown := 0.0
var damage := 20.0
var color := Color(0.55, 0.95, 1.0)
var radius := 13.0

func setup(main_ref: Node, pos: Vector2, col: Color, dmg: float) -> void:
	main = main_ref
	position = pos
	color = col
	damage = maxf(8.0, dmg)
	life = 15.0
	cooldown = 0.2
	z_index = 2
	queue_redraw()

func tick(delta: float) -> bool:
	life -= delta
	cooldown -= delta
	if cooldown <= 0.0:
		var target: Node2D = main.nearest_enemy(position, 620.0)
		if target != null:
			var direction: Vector2 = (target.position - position).normalized()
			main.spawn_player_projectile(position, direction * 680.0, damage, color, 6.0, 1)
			cooldown = 0.42
	queue_redraw()
	return life <= 0.0

func _draw() -> void:
	var alpha := clampf(life / 15.0, 0.2, 1.0)
	draw_circle(Vector2.ZERO, radius + 4.0, Color(0.02, 0.04, 0.03, 0.35 * alpha))
	draw_circle(Vector2.ZERO, radius, Color(color.r, color.g, color.b, 0.24 * alpha))
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 20, Color(color.r, color.g, color.b, alpha), 2.0)
	draw_rect(Rect2(-4.0, -6.0, 8.0, 16.0), Color(color.r, color.g, color.b, alpha))
	draw_circle(Vector2.ZERO, 3.0, Color(1.0, 1.0, 0.9, alpha))
