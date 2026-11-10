extends Node2D
## Telegraphed arena hazard for the expanded enemy and boss patterns.

var main: Node = null
var kind := "trap"
var radius := 48.0
var life := 3.0
var max_life := 3.0
var damage := 0.0
var slow := 0.0
var color := Color(0.95, 0.45, 0.35)
var tick_interval := 0.65
var tick_cd := 0.0
var dir := Vector2.RIGHT
var beam_length := 0.0
var exploded := false

func setup(main_ref: Node, pos: Vector2, hazard_kind: String, hazard_radius: float, duration: float, dmg: float, col: Color, slow_amount: float = 0.0, direction: Vector2 = Vector2.ZERO, length: float = 0.0) -> void:
	main = main_ref
	position = pos
	kind = hazard_kind
	radius = maxf(8.0, hazard_radius)
	life = maxf(0.05, duration)
	max_life = life
	damage = dmg
	color = col
	slow = slow_amount
	dir = direction.normalized() if direction.length() > 0.01 else Vector2.RIGHT
	beam_length = length
	tick_cd = 0.15
	z_index = 1
	queue_redraw()

func tick(delta: float, player: Node2D) -> bool:
	life -= delta
	tick_cd -= delta
	if player == null or not player.alive:
		queue_redraw()
		return life <= 0.0
	var in_zone := false
	if kind == "beam":
		var endpoint := position + dir * beam_length
		var closest := Geometry2D.get_closest_point_to_segment(player.position, position, endpoint)
		in_zone = closest.distance_to(player.position) <= radius + player.radius
	else:
		in_zone = position.distance_to(player.position) <= radius + player.radius
	if in_zone and slow > 0.0:
		player.slow_t = maxf(player.slow_t, 0.22)
	match kind:
		"mine":
			if life <= 0.0 and not exploded:
				exploded = true
				if position.distance_to(player.position) <= radius + player.radius:
					main.damage_player(damage)
				main.spawn_ring(position, color, radius * 0.65)
		"mortar", "geyser", "slam":
			if life <= 0.22 and not exploded:
				exploded = true
				if in_zone:
					main.damage_player(damage)
				main.spawn_ring(position, color, radius * 0.7)
		"blast":
			pass
		_:
			if in_zone and damage > 0.0 and tick_cd <= 0.0:
				main.damage_player(damage)
				tick_cd = tick_interval
	queue_redraw()
	return life <= 0.0

func _draw() -> void:
	var alpha := clampf(life / maxf(0.05, max_life), 0.15, 1.0)
	var soft := Color(color.r, color.g, color.b, 0.13 * alpha)
	var line_col := Color(color.r, color.g, color.b, 0.75 * alpha)
	if kind == "beam":
		draw_line(Vector2.ZERO, dir * beam_length, Color(color.r, color.g, color.b, 0.10 * alpha), radius * 2.0)
		draw_line(Vector2.ZERO, dir * beam_length, line_col, maxf(2.0, radius * 0.22))
		draw_circle(Vector2.ZERO, radius * 0.45, Color(color.r, color.g, color.b, 0.28 * alpha))
		return
	if kind == "web":
		draw_circle(Vector2.ZERO, radius, soft)
		for i in 6:
			var a := TAU * float(i) / 6.0
			draw_line(Vector2.ZERO, Vector2.RIGHT.rotated(a) * radius, line_col, 1.8)
		for ring in [0.35, 0.7]:
			draw_arc(Vector2.ZERO, radius * ring, 0.0, TAU, 18, line_col, 1.2)
		return
	if kind == "mine":
		draw_circle(Vector2.ZERO, radius * 0.55, soft)
		draw_circle(Vector2.ZERO, 7.0, line_col)
		for i in 8:
			var a := TAU * float(i) / 8.0
			draw_line(Vector2.ZERO, Vector2.RIGHT.rotated(a) * 13.0, line_col, 2.0)
		draw_arc(Vector2.ZERO, radius, 0.0, TAU, 24, Color(line_col.r, line_col.g, line_col.b, 0.25 * alpha), 1.2)
		return
	if kind == "trap":
		draw_circle(Vector2.ZERO, radius, soft)
		draw_arc(Vector2.ZERO, radius, 0.0, TAU, 20, line_col, 2.0)
		for i in 3:
			var a := TAU * float(i) / 3.0
			draw_line(Vector2.ZERO, Vector2.RIGHT.rotated(a) * radius * 0.8, line_col, 2.0)
		return
	# Area telegraph. The filling ring shows how much time is left.
	draw_circle(Vector2.ZERO, radius, soft)
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 28, line_col, 2.2)
	var progress := 1.0 - alpha
	draw_arc(Vector2.ZERO, radius * 0.72, -PI * 0.5, -PI * 0.5 + TAU * progress, 26, Color(color.r, color.g, color.b, 0.95), 3.0)
	if kind == "geyser":
		draw_circle(Vector2.ZERO, radius * 0.35, Color(color.r, color.g, color.b, 0.28 * alpha))
