"""Erzeugt das erste Asset-Paket fuer den UE-5.8-Nachfolger (Blender 4.5, headless).

Alle Modelle sind prozedural und original: keine KayKit-/Quaternius-Geometrie,
nur die Farbpalette orientiert sich an data.js (Figuren, Gegner, Arenen).

Aufruf:
  BLENDER=$HOME/tools/blender-4.5.15-linux-x64/blender
  $BLENDER -b --factory-startup --python tools/blender/build_assetpack.py -- \
      [--only NAME,NAME] [--skip-render] [--res 420] [--samples 20]

Ergebnis:
  assets/glb/<name>.glb      assets/fbx/<name>.fbx
  assets/blender/<name>.blend assets/renders/<name>.png
  assets/manifest.json
"""
import bpy
import json
import math
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets")
DATE = "2026-11-08"
MATS = {}

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ONLY = set()
SKIP_RENDER = "--skip-render" in ARGS
RES, SAMPLES = 420, 20
for i, a in enumerate(ARGS):
    if a == "--only" and i + 1 < len(ARGS):
        ONLY = {x.strip() for x in ARGS[i + 1].split(",") if x.strip()}
    elif a == "--res" and i + 1 < len(ARGS):
        RES = int(ARGS[i + 1])
    elif a == "--samples" and i + 1 < len(ARGS):
        SAMPLES = int(ARGS[i + 1])


def log(*a):
    print("[assetpack]", *a, flush=True)


def srgb(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]

    def lin(u):
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4

    return tuple(lin(u) for u in c) + (1.0,)


def mat(name, col, rough=0.65, metal=0.0, emit=None, emit_strength=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    r, g, b, _ = srgb(col)
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        er, eg, eb, _ = srgb(emit)
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (er, eg, eb, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emit_strength
    m.diffuse_color = (r, g, b, 1.0)
    MATS[name] = m
    return m


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0  # keine .blend1-Backups
    MATS.clear()
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    sc.render.fps = 24


def _finish(o, material, bevel):
    if material:
        o.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel > 0:
        b = o.modifiers.new("Bevel", 'BEVEL')
        b.width = bevel
        b.segments = 2
        b.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=b.name)
    return o


def box(name, size, loc=(0, 0, 0), material=None, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.rotation_euler = rot
    return _finish(o, material, bevel)


def cyl(name, r, h, loc=(0, 0, 0), material=None, verts=16, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return _finish(o, material, bevel)


def cone(name, r1, r2, h, loc=(0, 0, 0), material=None, verts=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return _finish(o, material, 0.0)


def sphere(name, r, loc=(0, 0, 0), material=None, seg=16, ring=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r, location=loc)
    o = bpy.context.object
    o.name = name
    return _finish(o, material, 0.0)


def torus(name, major, minor, loc=(0, 0, 0), material=None, mseg=16, nseg=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc,
                                     major_segments=mseg, minor_segments=nseg)
    o = bpy.context.object
    o.name = name
    return _finish(o, material, 0.0)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.data.name = name
    bpy.ops.object.shade_flat()
    return o


def origin_base(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR', center='MEDIAN')
    return o


def bounds(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    return mn, mx


def collider(o, name, pad=0.02):
    mn, mx = bounds(o)
    size = mx - mn + Vector((pad, pad, 0))
    c = box("UCX_%s_00" % name, (size.x, size.y, size.z),
            ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2), None, 0.0)
    c.data.materials.clear()
    c.hide_render = True
    c.display_type = 'WIRE'
    return c


def stats(o):
    o.data.calc_loop_triangles()
    return {
        "verts": len(o.data.vertices),
        "tris": len(o.data.loop_triangles),
        "dimensions_m": [round(v, 3) for v in o.dimensions],
        "materials": [m.name for m in o.data.materials if m],
    }


def export(name, objs, armature=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    glb = os.path.join(OUT, "glb", name + ".glb")
    fbx = os.path.join(OUT, "fbx", name + ".fbx")
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_animations=True)
    bpy.ops.export_scene.fbx(filepath=fbx, use_selection=True,
                             object_types={'ARMATURE', 'MESH'},
                             apply_scale_options='FBX_SCALE_ALL',
                             axis_forward='-Z', axis_up='Y',
                             add_leaf_bones=False, bake_anim=True)
    return glb, fbx


def setup_render(center, rad, view_dir):
    sc = bpy.context.scene
    world = bpy.data.worlds.new("WBN_World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.045, 0.05, 0.06, 1.0)
    bg.inputs[1].default_value = 1.0
    sc.world = world

    bpy.ops.object.light_add(type='SUN', location=(4, -3, 8))
    sun = bpy.context.object
    sun.data.energy = 3.2
    sun.data.angle = math.radians(14)
    sun.rotation_euler = (math.radians(46), 0, math.radians(38))

    bpy.ops.object.light_add(type='AREA', location=(-4.5, -5.0, 4.5))
    fill = bpy.context.object
    fill.data.energy = 420
    fill.data.size = 6.0
    fill.rotation_euler = (Vector((0, 0, 0)) - fill.location).to_track_quat('-Z', 'Y').to_euler()

    bpy.ops.object.camera_add()
    cam = bpy.context.object
    dist = max(2.4, rad * 3.3)
    cam.location = center + Vector(view_dir).normalized() * dist
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 50
    sc.camera = cam

    ground = box("GROUND", (18, 18, 0.02), (0, 0, -0.011), mat("M_Ground", "#343a42", 0.95))
    ground.hide_render = False

    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.max_bounces = 4
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    return [sun, fill, cam, ground]


def render(name, o, view_dir):
    mn, mx = bounds(o)
    center = (mn + mx) / 2
    rad = max((mx - mn).length / 2, 0.4)
    helpers = setup_render(center, rad, view_dir)
    bpy.context.scene.render.filepath = os.path.join(OUT, "renders", name + ".png")
    bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action='DESELECT')
    for h in helpers:
        h.select_set(True)
    bpy.ops.object.delete()


# ---------------------------------------------------------------- Bausteine

def build_kurhaus():
    st = mat("M_Sandstein", "#cbb79a", 0.7)
    st2 = mat("M_Sandstein_Dunkel", "#a8906f", 0.75)
    parts = [
        box("base", (1.00, 1.00, 0.30), (0, 0, 0.15), st2, 0.02),
        box("plinth", (0.82, 0.82, 0.18), (0, 0, 0.39), st, 0.02),
        cyl("shaft", 0.30, 2.55, (0, 0, 1.755), st, 16, bevel=0.015),
        box("capital", (0.72, 0.72, 0.20), (0, 0, 3.13), st2, 0.02),
        box("abacus", (0.92, 0.92, 0.14), (0, 0, 3.30), st, 0.02),
    ]
    o = origin_base(join(parts, "SM_KurhausSaeule"))
    return {"mesh": o, "objs": [o, collider(o, "SM_KurhausSaeule")], "kind": "prop"}


def build_nerobergbahn():
    blue = mat("M_Bahn_Blau", "#2f5f9e", 0.45)
    cream = mat("M_Bahn_Creme", "#efe3c6", 0.55)
    dark = mat("M_Bahn_Dunkel", "#1c2530", 0.6, 0.3)
    glass = mat("M_Bahn_Glas", "#6fc8e8", 0.15, 0.1, "#6fc8e8", 0.25)
    gold = mat("M_Bahn_Gold", "#e7c15a", 0.35, 0.6)
    parts = [
        box("frame", (3.60, 1.60, 0.24), (0, 0, 0.28), dark, 0.02),
        box("body", (4.00, 1.90, 1.30), (0, 0, 1.05), blue, 0.06),
        box("window", (3.62, 1.94, 0.52), (0, 0, 1.28), glass, 0.02),
        box("roof", (4.14, 2.02, 0.14), (0, 0, 1.77), cream, 0.03),
        box("roof_ridge", (3.90, 0.30, 0.08), (0, 0, 1.88), blue, 0.02),
        box("bumper_a", (0.16, 1.70, 0.34), (2.03, 0, 0.66), gold, 0.02),
        box("bumper_b", (0.16, 1.70, 0.34), (-2.03, 0, 0.66), gold, 0.02),
    ]
    for i, (x, y) in enumerate(((1.35, 0.78), (-1.35, 0.78), (1.35, -0.78), (-1.35, -0.78))):
        parts.append(cyl("wheel_%d" % i, 0.28, 0.16, (x, y, 0.28), dark, 12,
                         rot=(math.radians(90), 0, 0)))
    o = origin_base(join(parts, "SM_NerobergbahnWagen"))
    return {"mesh": o, "objs": [o, collider(o, "SM_NerobergbahnWagen")], "kind": "prop"}


def build_marktkirche():
    brick = mat("M_Kirche_Ziegel", "#7b4a3a", 0.8)
    brick2 = mat("M_Kirche_Ziegel_Dunkel", "#5d352a", 0.85)
    sand = mat("M_Kirche_Sandstein", "#c2a887", 0.75)
    gold = mat("M_Kirche_Gold", "#e7c15a", 0.30, 0.7)
    parts = [
        box("base", (3.20, 3.20, 0.60), (0, 0, 0.30), brick2, 0.03),
        cone("tower", 1.55, 0.62, 2.60, (0, 0, 1.90), brick, 8),
        cyl("clock_ring", 0.36, 0.07, (0, -0.985, 2.28), gold, 24, rot=(math.radians(90), 0, 0)),
        cyl("clock_face", 0.30, 0.08, (0, -0.995, 2.28), brick2, 24, rot=(math.radians(90), 0, 0)),
        box("door", (0.62, 0.10, 0.95), (0, -1.58, 0.48), brick2, 0.02),
        cone("spire", 0.62, 0.0, 1.55, (0, 0, 3.33), brick2, 8),
        cyl("finial", 0.06, 0.30, (0, 0, 4.22), gold, 8),
    ]
    for i, (x, y) in enumerate(((1.05, 1.05), (-1.05, 1.05), (1.05, -1.05), (-1.05, -1.05))):
        parts.append(cone("pinnacle_%d" % i, 0.22, 0.0, 1.15, (x, y, 1.18), sand, 8))
    o = origin_base(join(parts, "SM_MarktkircheSpitze"))
    return {"mesh": o, "objs": [o, collider(o, "SM_MarktkircheSpitze")], "kind": "prop"}


def build_kochbrunnen():
    stone = mat("M_Brunnen_Stein", "#b9ab96", 0.8)
    stone2 = mat("M_Brunnen_Stein_Dunkel", "#8d8170", 0.85)
    water = mat("M_Brunnen_Wasser", "#59d6e6", 0.12, 0.0, "#59d6e6", 0.35)
    parts = [
        cyl("basin", 1.60, 0.55, (0, 0, 0.275), stone, 8, bevel=0.02),
        torus("rim", 1.60, 0.12, (0, 0, 0.60), stone2),
        cyl("water", 1.52, 0.05, (0, 0, 0.575), water, 16),
        cyl("pillar", 0.34, 0.95, (0, 0, 0.98), stone2, 8),
        cyl("bowl", 0.72, 0.14, (0, 0, 1.48), stone, 8, bevel=0.02),
        sphere("spout", 0.12, (0, 0, 1.60), water, 12, 6),
    ]
    o = origin_base(join(parts, "SM_KochbrunnenBecken"))
    return {"mesh": o, "objs": [o, collider(o, "SM_KochbrunnenBecken")], "kind": "prop"}


def build_hecke():
    leaf = mat("M_Hecke_Blatt", "#2f6b3a", 0.9)
    leaf2 = mat("M_Hecke_Blatt_Hell", "#3f7d45", 0.85)
    soil = mat("M_Hecke_Erde", "#3a2b20", 0.95)
    parts = [
        box("soil", (2.80, 1.40, 0.08), (0, 0, 0.04), soil, 0.01),
        box("body", (2.60, 1.20, 0.86), (0, 0, 0.47), leaf, 0.14),
    ]
    for i, (x, y) in enumerate(((-0.75, 0.10), (0.05, -0.15), (0.80, 0.12))):
        parts.append(sphere("bump_%d" % i, 0.36, (x, y, 0.90), leaf2, 12, 6))
    o = origin_base(join(parts, "SM_KurgartenHecke"))
    return {"mesh": o, "objs": [o, collider(o, "SM_KurgartenHecke")], "kind": "prop"}


def build_litfass():
    green = mat("M_Litfass_Gruen", "#1f4a3a", 0.6)
    paper = mat("M_Litfass_Papier", "#efe6cf", 0.85)
    red = mat("M_Litfass_Rot", "#b23a3a", 0.6)
    parts = [
        cyl("base", 0.66, 0.18, (0, 0, 0.09), green, 16, bevel=0.01),
        cyl("column", 0.55, 2.45, (0, 0, 1.31), green, 16),
        cyl("paper", 0.58, 1.15, (0, 0, 1.52), paper, 16),
        cyl("band_a", 0.59, 0.05, (0, 0, 0.95), red, 16),
        cyl("band_b", 0.59, 0.05, (0, 0, 2.09), red, 16),
        cone("cap", 0.62, 0.10, 0.34, (0, 0, 2.71), green, 16),
        sphere("finial", 0.09, (0, 0, 2.90), red, 12, 6),
    ]
    o = origin_base(join(parts, "SM_Litfasssaeule"))
    return {"mesh": o, "objs": [o, collider(o, "SM_Litfasssaeule")], "kind": "prop"}


def build_pavillon():
    stone = mat("M_Pavillon_Sandstein", "#d8c6a6", 0.75)
    stone2 = mat("M_Pavillon_Sandstein_Dunkel", "#b09a78", 0.8)
    roof = mat("M_Pavillon_Dach", "#3f7f6a", 0.55, 0.15)
    copper = mat("M_Pavillon_Kupfer", "#6fae95", 0.4, 0.4)
    gold = mat("M_Pavillon_Gold", "#e7c15a", 0.3, 0.7)
    parts = [
        cyl("step", 2.10, 0.12, (0, 0, 0.06), stone2, 8),
        cyl("base", 1.92, 0.26, (0, 0, 0.25), stone, 8, bevel=0.02),
        cyl("floor", 1.74, 0.10, (0, 0, 0.43), stone2, 8),
    ]
    for i in range(8):
        a = math.radians(22.5 + i * 45)
        x, y = math.cos(a) * 1.48, math.sin(a) * 1.48
        parts.append(cyl("col_%d" % i, 0.13, 1.95, (x, y, 1.45), stone, 10))
        parts.append(box("cap_%d" % i, (0.34, 0.34, 0.12), (x, y, 2.47), stone2, 0.015,
                         rot=(0, 0, a)))
    # Fuenf geschlossene Seiten, drei offene Zugaenge.
    for i in range(5):
        a = math.radians(45 + i * 45)
        x, y = math.cos(a) * 1.48, math.sin(a) * 1.48
        parts.append(box("rail_%d" % i, (1.10, 0.10, 0.55), (x, y, 0.86), stone, 0.02,
                         rot=(0, 0, a + math.radians(90))))
        parts.append(box("rail_top_%d" % i, (1.14, 0.16, 0.08), (x, y, 1.18), stone2, 0.015,
                         rot=(0, 0, a + math.radians(90))))
    parts += [
        cyl("entablature", 1.86, 0.24, (0, 0, 2.64), stone2, 8, bevel=0.02),
        cyl("roof_band", 2.20, 0.10, (0, 0, 2.80), copper, 8),
        cone("roof", 2.18, 0.24, 1.02, (0, 0, 3.30), roof, 8),
        torus("roof_rim", 2.06, 0.07, (0, 0, 2.86), copper, 16, 6),
        sphere("finial", 0.15, (0, 0, 3.92), gold, 12, 6),
        cone("finial_spike", 0.07, 0.0, 0.30, (0, 0, 4.12), gold, 8),
    ]
    o = origin_base(join(parts, "SM_KurparkPavillon"))
    return {"mesh": o, "objs": [o, collider(o, "SM_KurparkPavillon")], "kind": "prop"}


def build_reiterstandbild():
    stone = mat("M_Denkmal_Sockel", "#8c8d86", 0.85)
    stone2 = mat("M_Denkmal_Sockel_Dunkel", "#6b6c66", 0.9)
    bronze = mat("M_Denkmal_Bronze", "#4a5a4f", 0.5, 0.55)
    bronze2 = mat("M_Denkmal_Bronze_Dunkel", "#33403a", 0.55, 0.6)
    gold = mat("M_Denkmal_Gold", "#e7c15a", 0.3, 0.7)
    parts = [
        box("step", (2.10, 3.10, 0.18), (0, 0, 0.09), stone2, 0.02),
        box("base", (1.80, 2.80, 0.34), (0, 0, 0.35), stone, 0.02),
        box("pedestal", (1.45, 2.35, 1.30), (0, 0, 1.17), stone, 0.02),
        box("cornice", (1.65, 2.55, 0.16), (0, 0, 1.90), stone2, 0.02),
        box("plaque", (0.90, 0.06, 0.46), (0, -1.19, 1.25), gold, 0.01),
    ]
    # Pferd, Laengsachse Y, Blick nach -Y.
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("leg_%d_%d" % (sx, sy), (0.17, 0.20, 0.95),
                             (0.24 * sx, 0.62 * sy, 2.47), bronze2, 0.02))
            parts.append(box("hoof_%d_%d" % (sx, sy), (0.21, 0.26, 0.12),
                             (0.24 * sx, 0.62 * sy, 2.04), bronze2, 0.01))
    parts += [
        box("body", (0.68, 1.75, 0.78), (0, 0, 3.22), bronze, 0.06),
        sphere("chest", 0.36, (0, -0.68, 3.24), bronze, 12, 6),
        sphere("rump", 0.36, (0, 0.70, 3.24), bronze, 12, 6),
        box("neck", (0.50, 0.54, 0.95), (0, -0.82, 3.74), bronze, 0.04,
            rot=(math.radians(24), 0, 0)),
        box("head", (0.34, 0.64, 0.38), (0, -1.16, 4.06), bronze, 0.03),
        box("muzzle", (0.26, 0.30, 0.22), (0, -1.45, 3.98), bronze2, 0.02),
        cone("ear_l", 0.09, 0.0, 0.24, (0.11, -1.03, 4.28), bronze2, 6),
        cone("ear_r", 0.09, 0.0, 0.24, (-0.11, -1.03, 4.28), bronze2, 6),
        cone("tail", 0.11, 0.02, 0.62, (0, 0.98, 3.28), bronze2, 8,
             rot=(math.radians(-125), 0, 0)),
        box("saddle", (0.74, 0.66, 0.10), (0, 0.02, 3.63), bronze2, 0.02),
    ]
    # Reiterin/Reiter mit erhobenem Arm.
    parts += [
        box("rider_hips", (0.36, 0.40, 0.30), (0, 0.02, 3.78), bronze, 0.02),
        box("rider_torso", (0.34, 0.30, 0.52), (0, 0.02, 4.14), bronze, 0.03),
        box("rider_chest", (0.40, 0.34, 0.14), (0, 0.02, 4.32), bronze2, 0.02),
        box("rider_head", (0.24, 0.24, 0.26), (0, 0.02, 4.56), bronze, 0.03),
        box("rider_crown", (0.28, 0.28, 0.09), (0, 0.02, 4.72), gold, 0.02),
        box("rider_leg_l", (0.14, 0.18, 0.46), (0.32, -0.08, 3.56), bronze2, 0.02,
            rot=(0, math.radians(-12), 0)),
        box("rider_leg_r", (0.14, 0.18, 0.46), (-0.32, -0.08, 3.56), bronze2, 0.02,
            rot=(0, math.radians(12), 0)),
        box("arm_l", (0.11, 0.13, 0.38), (0.22, 0.00, 4.16), bronze, 0.02),
        box("arm_r_up", (0.11, 0.13, 0.34), (-0.22, -0.02, 4.34), bronze, 0.02,
            rot=(0, math.radians(20), 0)),
        box("arm_r_fore", (0.10, 0.12, 0.30), (-0.28, -0.06, 4.58), bronze, 0.02),
        box("sword", (0.05, 0.06, 0.46), (-0.31, -0.08, 4.90), gold, 0.01),
    ]
    o = origin_base(join(parts, "SM_Reiterstandbild"))
    return {"mesh": o, "objs": [o, collider(o, "SM_Reiterstandbild")], "kind": "prop"}


def build_weinbergmauer():
    stone = mat("M_Weinberg_Stein", "#9a8f7c", 0.9)
    stone2 = mat("M_Weinberg_Stein_Hell", "#b7ab94", 0.88)
    soil = mat("M_Weinberg_Erde", "#4a3728", 0.95)
    wood = mat("M_Weinberg_Holz", "#6b4f33", 0.85)
    leaf = mat("M_Weinberg_Blatt", "#3f7d3c", 0.85)
    leaf2 = mat("M_Weinberg_Blatt_Hell", "#5ea24a", 0.8)
    grape = mat("M_Weinberg_Traube", "#5b3d75", 0.55)
    wire = mat("M_Weinberg_Draht", "#3a3f44", 0.5, 0.5)
    parts = [
        box("soil", (4.60, 1.10, 0.16), (0, 0, 0.08), soil, 0.01),
        box("wall", (4.30, 0.56, 0.80), (0, 0, 0.48), stone, 0.05),
        box("cap", (4.40, 0.66, 0.12), (0, 0, 0.93), stone2, 0.02),
    ]
    for i, (x, y, w, h) in enumerate(((-1.62, -0.30, 0.42, 0.26), (-1.05, -0.29, 0.34, 0.20),
                                      (-0.38, -0.30, 0.46, 0.24), (0.30, -0.29, 0.30, 0.22),
                                      (0.96, -0.30, 0.40, 0.25), (1.58, -0.29, 0.32, 0.19),
                                      (-1.35, 0.29, 0.38, 0.22), (0.10, 0.30, 0.44, 0.24),
                                      (1.30, 0.29, 0.34, 0.20))):
        parts.append(box("stone_%d" % i, (w, 0.10, h), (x, y, 0.36), stone2, 0.01,
                         rot=(0, 0, math.radians(4 if i % 2 else -5))))
    for i, x in enumerate((-1.55, 0.0, 1.55)):
        parts.append(box("post_%d" % i, (0.13, 0.13, 1.22), (x, 0.0, 1.30), wood, 0.02))
        parts.append(box("post_cap_%d" % i, (0.18, 0.18, 0.06), (x, 0.0, 1.92), wood, 0.01))
    for i, z in enumerate((1.42, 1.70, 1.96)):
        parts.append(cyl("wire_%d" % i, 0.018, 3.60, (0, 0, z), wire, 6,
                         rot=(0, math.radians(90), 0)))
    for i, (x, z) in enumerate(((-1.55, 1.58), (-1.10, 1.76), (-0.55, 1.62), (0.0, 1.84),
                                 (0.55, 1.60), (1.10, 1.78), (1.55, 1.56))):
        parts.append(sphere("leaf_%d_a" % i, 0.30, (x, -0.04, z), leaf, 8, 4))
        parts.append(sphere("leaf_%d_b" % i, 0.22, (x + 0.12, -0.08, z - 0.22), leaf2, 8, 4))
    for i, (x, z) in enumerate(((-1.05, 1.42), (0.35, 1.46), (1.42, 1.38))):
        for j in range(4):
            gx = x + (0.05 if j % 2 else -0.05)
            gz = z - 0.10 * (j // 2)
            parts.append(sphere("grape_%d_%d" % (i, j), 0.075, (gx, -0.14, gz), grape, 6, 4))
    o = origin_base(join(parts, "SM_WeinbergMauer"))
    return {"mesh": o, "objs": [o, collider(o, "SM_WeinbergMauer")], "kind": "prop"}


def build_rheinufer():
    stone = mat("M_Rheinufer_Stein", "#a8a091", 0.9)
    iron = mat("M_Rheinufer_Eisen", "#2e3a42", 0.5, 0.6)
    iron2 = mat("M_Rheinufer_Eisen_Hell", "#46545e", 0.45, 0.65)
    brass = mat("M_Rheinufer_Messing", "#c9a24f", 0.35, 0.7)
    parts = [
        box("base", (4.40, 0.56, 0.14), (0, 0, 0.07), stone, 0.02),
        box("base_cap", (4.30, 0.44, 0.06), (0, 0, 0.16), stone, 0.01),
    ]
    for i, x in enumerate((-1.95, -0.65, 0.65, 1.95)):
        parts.append(box("post_%d" % i, (0.17, 0.17, 0.98), (x, 0, 0.64), iron, 0.02))
        parts.append(box("post_band_%d" % i, (0.21, 0.21, 0.07), (x, 0, 0.30), brass, 0.01))
        parts.append(cone("post_cap_%d" % i, 0.15, 0.0, 0.20, (x, 0, 1.22), iron2, 8))
        parts.append(sphere("post_ball_%d" % i, 0.075, (x, 0, 1.35), brass, 8, 4))
    for i, z in enumerate((1.12, 0.78, 0.46)):
        parts.append(cyl("rail_%d" % i, 0.055 if i == 0 else 0.035, 4.10, (0, 0, z), iron2, 8,
                         rot=(0, math.radians(90), 0)))
    for i in range(10):
        x = -1.75 + i * 0.39
        parts.append(box("baluster_%d" % i, (0.05, 0.05, 0.60), (x, 0, 0.76), iron, 0.005))
    # Laterne am Endpfosten, damit das Stueck im Arenalicht lesbar bleibt.
    parts += [
        cyl("lamp_post", 0.09, 0.30, (1.95, 0, 1.50), iron, 8),
        box("lantern", (0.28, 0.28, 0.34), (1.95, 0, 1.78), brass, 0.02),
        cone("lantern_top", 0.22, 0.03, 0.20, (1.95, 0, 2.03), iron2, 4,
             rot=(0, 0, math.radians(45))),
    ]
    o = origin_base(join(parts, "SM_RheinuferGelaender"))
    return {"mesh": o, "objs": [o, collider(o, "SM_RheinuferGelaender")], "kind": "prop"}


def build_schuetze():
    mint = mat("M_Schuetze_Panzer", "#7dffb0", 0.55)
    mint2 = mat("M_Schuetze_Panzer_Hell", "#b6ffd2", 0.45)
    dark = mat("M_Schuetze_Dunkel", "#1d3b33", 0.7)
    teal = mat("M_Schuetze_Stoff", "#2f6b58", 0.8)
    bone = mat("M_Schuetze_Knochen", "#dff7e8", 0.6)
    glow = mat("M_Schuetze_Energie", "#7dffb0", 0.2, 0.0, "#7dffb0", 2.5)
    parts = [
        box("hips", (0.34, 0.24, 0.20), (0, 0, 0.84), teal, 0.03),
        box("torso", (0.40, 0.26, 0.42), (0, 0, 1.08), mint, 0.04),
        box("chest", (0.44, 0.22, 0.16), (0, -0.02, 1.21), dark, 0.02),
        box("tabard", (0.30, 0.10, 0.42), (0, 0.10, 0.76), teal, 0.02,
            rot=(math.radians(-6), 0, 0)),
        box("neck", (0.12, 0.12, 0.08), (0, 0, 1.32), dark, 0.01),
        box("head", (0.30, 0.30, 0.30), (0, 0.01, 1.45), dark, 0.05),
        cone("hood_crest", 0.21, 0.03, 0.30, (0, 0.04, 1.70), teal, 6),
        box("visor", (0.24, 0.07, 0.09), (0, -0.17, 1.46), glow, 0.01),
        box("jaw", (0.18, 0.10, 0.10), (0, -0.18, 1.36), mint2, 0.02),
    ]
    for s in (-1, 1):
        parts += [
            cone("shoulder_blade_%d" % s, 0.09, 0.0, 0.28, (0.23 * s, 0.06, 1.32), mint2, 5,
                 rot=(math.radians(-18), math.radians(-32 * s), 0)),
            box("upper_arm_%d" % s, (0.11, 0.12, 0.30), (0.27 * s, -0.02, 1.15), mint, 0.02),
            box("forearm_%d" % s, (0.10, 0.30, 0.11), (0.17 * s, -0.18, 1.03), mint2, 0.02,
                rot=(math.radians(10), 0, 0)),
            box("hand_%d" % s, (0.09, 0.10, 0.09), (0.14 * s, -0.33, 1.03), dark, 0.01),
            box("thigh_%d" % s, (0.15, 0.17, 0.40), (0.12 * s, 0.01, 0.58), teal, 0.02),
            box("shin_%d" % s, (0.13, 0.15, 0.38), (0.13 * s, -0.05, 0.24), dark, 0.02),
            box("foot_%d" % s, (0.15, 0.30, 0.09), (0.13 * s, -0.13, 0.05), mint2, 0.02),
        ]
    # Energie-Armbrust, Stock und Rohr zeigen nach -Y.
    parts += [
        box("stock", (0.14, 0.66, 0.14), (0, -0.34, 1.03), dark, 0.02),
        box("grip", (0.10, 0.12, 0.22), (0, -0.10, 0.93), teal, 0.02),
        box("limb_l", (0.44, 0.06, 0.06), (-0.20, -0.52, 1.04), mint2, 0.01,
            rot=(0, 0, math.radians(14))),
        box("limb_r", (0.44, 0.06, 0.06), (0.20, -0.52, 1.04), mint2, 0.01,
            rot=(0, 0, math.radians(-14))),
        box("bow_string", (0.50, 0.02, 0.02), (0, -0.40, 1.04), bone, 0.0),
        cyl("barrel", 0.050, 0.30, (0, -0.70, 1.03), dark, 8,
            rot=(math.radians(90), 0, 0)),
        sphere("muzzle_glow", 0.060, (0, -0.86, 1.03), glow, 8, 4),
        box("quiver", (0.14, 0.14, 0.38), (0.24, 0.20, 1.22), teal, 0.02,
            rot=(math.radians(-18), 0, math.radians(-16))),
    ]
    for i in range(3):
        parts.append(cone("dart_%d" % i, 0.020, 0.0, 0.20,
                          (0.24 + 0.035 * i, 0.22, 1.39), bone, 5,
                          rot=(math.radians(-18), 0, math.radians(-16))))
    o = origin_base(join(parts, "SM_Schuetze"))
    return {"mesh": o, "objs": [o, collider(o, "SM_Schuetze", 0.05)], "kind": "enemy"}


def build_sentinel():
    coral = mat("M_Sentinel_Panzer", "#ff7a5c", 0.5)
    coral2 = mat("M_Sentinel_Panzer_Hell", "#ffb09c", 0.4)
    basalt = mat("M_Sentinel_Basalt", "#2b2226", 0.75)
    basalt2 = mat("M_Sentinel_Basalt_Hell", "#4a3a40", 0.7)
    glow = mat("M_Sentinel_Strahl", "#ff7a5c", 0.2, 0.0, "#ff7a5c", 4.0)
    parts = [
        cone("hover_spike", 0.30, 0.0, 0.60, (0, 0, 0.42), basalt2, 8,
             rot=(math.radians(180), 0, 0)),
        cyl("hover_ring", 0.44, 0.10, (0, 0, 0.72), coral, 12),
        sphere("core", 0.42, (0, 0, 1.16), coral, 16, 8),
        torus("cage", 0.66, 0.09, (0, 0, 1.16), basalt, 16, 6),
        cyl("eye_socket", 0.30, 0.14, (0, -0.34, 1.16), basalt2, 12,
            rot=(math.radians(90), 0, 0)),
        sphere("iris", 0.18, (0, -0.42, 1.16), glow, 12, 6),
        cyl("lens_ring", 0.31, 0.08, (0, -0.40, 1.16), coral2, 12,
            rot=(math.radians(90), 0, 0)),
        cyl("crown_ring", 0.30, 0.08, (0, 0, 1.59), coral, 8),
        torus("halo", 0.30, 0.05, (0, 0, 1.80), coral2, 16, 6),
        cone("halo_shard", 0.11, 0.0, 0.32, (0, 0, 1.92), glow, 4),
    ]
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = math.cos(a) * 0.70, math.sin(a) * 0.70
        parts.append(box("fin_%d" % i, (0.08, 0.26, 0.62), (x, y, 1.18), coral2, 0.02,
                         rot=(0, 0, a + math.radians(90))))
    for i in range(3):
        a = math.radians(30 + i * 120)
        x, y = math.cos(a) * 0.86, math.sin(a) * 0.86
        parts.append(cone("shard_%d" % i, 0.10, 0.0, 0.40, (x, y, 0.98), coral, 5,
                          rot=(math.radians(180), 0, a)))
    parts += [
        box("beam_yoke", (0.18, 0.30, 0.18), (0, -0.54, 1.16), basalt2, 0.02),
        cyl("beam_emitter", 0.14, 0.30, (0, -0.72, 1.16), coral, 10,
            rot=(math.radians(90), 0, 0)),
        sphere("beam_glow", 0.10, (0, -0.88, 1.16), glow, 10, 6),
    ]
    o = origin_base(join(parts, "SM_Sentinel"))
    return {"mesh": o, "objs": [o, collider(o, "SM_Sentinel", 0.05)], "kind": "enemy"}


def build_boss_kurhaus():
    sand = mat("M_Koloss_Sandstein", "#cbb79a", 0.7)
    sand2 = mat("M_Koloss_Sandstein_Dunkel", "#a8906f", 0.75)
    roof = mat("M_Koloss_Dach", "#3f6f5e", 0.6)
    gold = mat("M_Koloss_Gold", "#f4c25a", 0.3, 0.65)
    core = mat("M_Koloss_Kern", "#f4c25a", 0.25, 0.0, "#f4c25a", 3.0)
    dark = mat("M_Koloss_Dunkel", "#2b2a30", 0.75)
    parts = [
        box("foot_l", (1.06, 1.40, 0.35), (0.95, -0.06, 0.175), sand2, 0.03),
        box("foot_r", (1.06, 1.40, 0.35), (-0.95, -0.06, 0.175), sand2, 0.03),
        cyl("leg_l", 0.43, 1.55, (0.95, 0, 1.12), sand, 8),
        cyl("leg_r", 0.43, 1.55, (-0.95, 0, 1.12), sand, 8),
        box("leg_band_l", (1.00, 1.00, 0.14), (0.95, 0, 0.48), sand2, 0.02),
        box("leg_band_r", (1.00, 1.00, 0.14), (-0.95, 0, 0.48), sand2, 0.02),
        box("pelvis", (2.50, 1.50, 0.55), (0, 0, 2.00), sand2, 0.04),
        box("torso", (3.10, 1.60, 2.30), (0, 0, 3.35), sand, 0.05),
        box("chest_band", (3.28, 1.66, 0.18), (0, 0, 4.28), sand2, 0.02),
        box("belt", (2.56, 1.56, 0.12), (0, 0, 2.30), gold, 0.02),
    ]
    for i, x in enumerate((-1.05, -0.35, 0.35, 1.05)):
        parts.append(cyl("col_%d" % i, 0.16, 1.90, (x, -0.86, 3.32), sand2, 8))
        parts.append(box("col_base_%d" % i, (0.42, 0.42, 0.14), (x, -0.86, 2.36), sand2, 0.02))
        parts.append(box("col_cap_%d" % i, (0.42, 0.42, 0.14), (x, -0.86, 4.28), sand2, 0.02))
    parts += [
        box("core_slit", (1.10, 0.16, 1.45), (0, -0.80, 3.32), core, 0.02),
        box("shoulder_l", (1.10, 1.60, 1.00), (2.02, 0, 4.20), sand, 0.05),
        box("shoulder_r", (1.10, 1.60, 1.00), (-2.02, 0, 4.20), sand, 0.05),
        box("shoulder_gold_l", (1.14, 1.64, 0.12), (2.02, 0, 4.66), gold, 0.02),
        box("shoulder_gold_r", (1.14, 1.64, 0.12), (-2.02, 0, 4.66), gold, 0.02),
        box("arm_l", (0.74, 0.92, 1.30), (2.28, 0, 3.42), sand2, 0.04),
        box("arm_r", (0.74, 0.92, 1.30), (-2.28, 0, 3.42), sand2, 0.04),
        box("fist_l", (0.94, 1.10, 0.72), (2.32, -0.08, 2.46), sand, 0.05),
        box("fist_r", (0.94, 1.10, 0.72), (-2.32, -0.08, 2.46), sand, 0.05),
        box("knuckle_l", (0.98, 1.14, 0.12), (2.32, -0.08, 2.76), gold, 0.02),
        box("knuckle_r", (0.98, 1.14, 0.12), (-2.32, -0.08, 2.76), gold, 0.02),
        box("head", (1.10, 0.96, 0.90), (0, 0, 5.03), sand, 0.05),
        box("visor", (0.82, 0.12, 0.20), (0, -0.51, 5.08), core, 0.01),
        box("frieze", (1.16, 1.02, 0.12), (0, 0, 5.42), gold, 0.02),
        box("roof_eave", (2.40, 1.70, 0.14), (0, 0.02, 5.56), sand2, 0.03),
        cone("pediment", 1.24, 0.10, 0.60, (0, 0.02, 5.92), roof, 4),
        cone("roof_finial_l", 0.10, 0.0, 0.34, (1.10, 0.02, 5.80), gold, 5),
        cone("roof_finial_r", 0.10, 0.0, 0.34, (-1.10, 0.02, 5.80), gold, 5),
    ]
    o = origin_base(join(parts, "SM_Boss_KurhausKoloss"))
    return {"mesh": o, "objs": [o, collider(o, "SM_Boss_KurhausKoloss")], "kind": "boss"}


def build_schlurfer():
    body = mat("M_Schlurfer_Haut", "#c96be0", 0.75)
    dark = mat("M_Schlurfer_Dunkel", "#6b2f7d", 0.8)
    bone = mat("M_Schlurfer_Knochen", "#e8d9c0", 0.7)
    eye = mat("M_Schlurfer_Auge", "#ffe27a", 0.3, 0.0, "#ffe27a", 3.0)
    parts = [
        box("torso", (0.78, 0.52, 0.78), (0, 0, 0.95), body, 0.06),
        box("hunch", (0.58, 0.46, 0.30), (0, 0.06, 1.36), body, 0.05),
        box("head", (0.40, 0.36, 0.34), (0, -0.04, 1.50), dark, 0.05),
        sphere("eye", 0.07, (0, -0.22, 1.52), eye, 12, 6),
    ]
    for s in (-1, 1):
        parts += [
            sphere("shoulder_%d" % s, 0.20, (0.42 * s, 0, 1.26), dark, 12, 6),
            box("upper_arm_%d" % s, (0.17, 0.17, 0.46), (0.48 * s, 0, 1.00), body, 0.03),
            box("forearm_%d" % s, (0.15, 0.15, 0.36), (0.52 * s, -0.02, 0.66), dark, 0.03),
            cone("claw_%d" % s, 0.10, 0.02, 0.26, (0.52 * s, -0.02, 0.42), bone, 8,
                 rot=(math.radians(180), 0, 0)),
            box("leg_%d" % s, (0.21, 0.23, 0.52), (0.22 * s, 0, 0.31), dark, 0.04),
            box("foot_%d" % s, (0.23, 0.34, 0.10), (0.22 * s, -0.05, 0.05), bone, 0.02),
        ]
    for i, (x, z) in enumerate(((0, 1.42), (-0.18, 1.30), (0.18, 1.30))):
        parts.append(cone("spike_%d" % i, 0.10, 0.0, 0.38, (x, 0.22, z), bone, 6,
                          rot=(math.radians(-55), 0, 0)))
    o = origin_base(join(parts, "SM_Schlurfer"))
    return {"mesh": o, "objs": [o, collider(o, "SM_Schlurfer", 0.05)], "kind": "enemy"}


def _part(o, bone, groups):
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    groups.append(o)
    return o


def build_sebbo():
    skin = mat("M_Sebbo_Haut", "#f2d5b0", 0.6)
    cyan = mat("M_Sebbo_Jacke", "#59e6ff", 0.55)
    purple = mat("M_Sebbo_Akzent", "#a06bff", 0.5)
    dark = mat("M_Sebbo_Dunkel", "#2a2230", 0.7)
    hair = mat("M_Sebbo_Haare", "#241c2b", 0.85)
    glass = mat("M_Sebbo_Brille", "#bfe8ff", 0.1, 0.0, "#bfe8ff", 0.6)
    parts = []
    parts.append(box("hips", (0.36, 0.24, 0.20), (0, 0, 0.86), purple, 0.03))
    parts.append(box("torso", (0.42, 0.26, 0.38), (0, 0, 1.10), cyan, 0.03))
    parts.append(box("chest_band", (0.44, 0.28, 0.09), (0, 0, 1.25), purple, 0.02))
    parts.append(box("neck", (0.12, 0.12, 0.08), (0, 0, 1.34), skin, 0.01))
    parts.append(box("head", (0.25, 0.24, 0.26), (0, 0, 1.47), skin, 0.03))
    parts.append(box("hair", (0.27, 0.26, 0.09), (0, 0.01, 1.60), hair, 0.03))
    parts.append(box("strap", (0.27, 0.02, 0.04), (0, 0.13, 1.56), dark, 0.01))
    for s in (-1, 1):
        parts.append(cyl("lens_%d" % s, 0.055, 0.05, (0.07 * s, -0.125, 1.56), glass, 12,
                         rot=(math.radians(90), 0, 0)))
        parts.append(box("upper_arm_%d" % s, (0.11, 0.12, 0.22), (0.245 * s, 0, 1.18), cyan, 0.02))
        parts.append(box("forearm_%d" % s, (0.10, 0.11, 0.20), (0.27 * s, -0.01, 0.98), skin, 0.02))
        parts.append(box("hand_%d" % s, (0.11, 0.10, 0.10), (0.275 * s, -0.01, 0.86), skin, 0.02))
        parts.append(box("thigh_%d" % s, (0.14, 0.15, 0.34), (0.11 * s, 0, 0.62), dark, 0.02))
        parts.append(box("shin_%d" % s, (0.12, 0.13, 0.30), (0.11 * s, 0, 0.31), dark, 0.02))
        parts.append(box("shoe_%d" % s, (0.14, 0.24, 0.09), (0.11 * s, -0.03, 0.05), purple, 0.02))
    steel = mat("M_Sebbo_Werkzeug", "#b8c0cc", 0.35, 0.7)
    parts.append(box("wrench_handle", (0.045, 0.05, 0.24), (-0.30, -0.02, 0.79), steel, 0.01))
    parts.append(box("wrench_cross", (0.10, 0.05, 0.04), (-0.30, -0.02, 0.66), steel, 0.01))
    parts.append(box("wrench_jaw_a", (0.035, 0.05, 0.09), (-0.275, -0.02, 0.62), steel, 0.005))
    parts.append(box("wrench_jaw_b", (0.035, 0.05, 0.09), (-0.325, -0.02, 0.62), steel, 0.005))
    groups = {
        "hips": ["hips"], "spine": ["torso"], "chest": ["chest_band"], "head": ["head", "hair", "strap", "lens_-1", "lens_1", "neck"],
        "upper_arm.L": ["upper_arm_1"], "forearm.L": ["forearm_1", "hand_1"],
        "upper_arm.R": ["upper_arm_-1"], "forearm.R": ["forearm_-1", "hand_-1", "wrench_handle", "wrench_cross", "wrench_jaw_a", "wrench_jaw_b"],
        "thigh.L": ["thigh_1"], "shin.L": ["shin_1"],
        "thigh.R": ["thigh_-1"], "shin.R": ["shin_-1"],
    }
    by_name = {p.name: p for p in parts}
    for bone, names in groups.items():
        for n in names:
            _part(by_name[n], bone, [])
    # Schuhe folgen dem Unterschenkel, damit die Fuesse beim Nicken mitgehen.
    for s in (-1, 1):
        _part(by_name["shoe_%d" % s], "shin.L" if s > 0 else "shin.R", [])

    mesh = join(parts, "SK_Sebbo")
    origin_base(mesh)

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = "SK_Sebbo_Rig"
    arm.data.name = "SK_Sebbo_Rig"
    eb = arm.data.edit_bones
    for b in list(eb):
        eb.remove(b)
    bones = [
        ("root", (0, 0, 0), (0, 0, 0.18), None),
        ("hips", (0, 0, 0.80), (0, 0, 0.96), "root"),
        ("spine", (0, 0, 0.96), (0, 0, 1.14), "hips"),
        ("chest", (0, 0, 1.14), (0, 0, 1.30), "spine"),
        ("head", (0, 0, 1.36), (0, 0, 1.62), "chest"),
        ("upper_arm.L", (0.22, 0, 1.28), (0.26, 0, 1.08), "chest"),
        ("forearm.L", (0.26, 0, 1.08), (0.28, 0, 0.90), "upper_arm.L"),
        ("upper_arm.R", (-0.22, 0, 1.28), (-0.26, 0, 1.08), "chest"),
        ("forearm.R", (-0.26, 0, 1.08), (-0.28, 0, 0.90), "upper_arm.R"),
        ("thigh.L", (0.11, 0, 0.80), (0.11, 0, 0.45), "hips"),
        ("shin.L", (0.11, 0, 0.45), (0.11, 0, 0.08), "thigh.L"),
        ("thigh.R", (-0.11, 0, 0.80), (-0.11, 0, 0.45), "hips"),
        ("shin.R", (-0.11, 0, 0.45), (-0.11, 0, 0.08), "thigh.R"),
    ]
    for name, head, tail, parent in bones:
        b = eb.new(name)
        b.head = head
        b.tail = tail
        b.roll = 0
        if parent:
            b.parent = eb[parent]
    bpy.ops.object.mode_set(mode='OBJECT')

    mesh.parent = arm
    mod = mesh.modifiers.new("Armature", 'ARMATURE')
    mod.object = arm

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 61
    arm.animation_data_create()
    act = bpy.data.actions.new("Idle")
    act.use_fake_user = True
    arm.animation_data.action = act
    keys = {
        1: {"chest": (0, 0, 0), "head": (0, 0, 0), "upper_arm.L": (0, 0, 0), "upper_arm.R": (0, 0, 0)},
        31: {"chest": (0.035, 0, 0), "head": (-0.02, 0, 0.015), "upper_arm.L": (0.05, 0, 0.02), "upper_arm.R": (-0.05, 0, -0.02)},
        61: {"chest": (0, 0, 0), "head": (0, 0, 0), "upper_arm.L": (0, 0, 0), "upper_arm.R": (0, 0, 0)},
    }
    for frame, rots in keys.items():
        bpy.context.scene.frame_set(frame)
        for bname, rot in rots.items():
            pb = arm.pose.bones[bname]
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = rot
            pb.keyframe_insert("rotation_euler", frame=frame)
        hips = arm.pose.bones["hips"]
        hips.location = (0, 0, 0.008 if frame == 31 else 0.0)
        hips.keyframe_insert("location", frame=frame)
    bpy.context.scene.frame_set(1)

    return {"mesh": mesh, "objs": [mesh, arm], "kind": "character", "armature": arm}


ASSETS = [
    ("SM_KurhausSaeule", "prop", build_kurhaus, (1.0, -1.3, 0.85)),
    ("SM_NerobergbahnWagen", "prop", build_nerobergbahn, (1.0, -1.3, 0.75)),
    ("SM_MarktkircheSpitze", "prop", build_marktkirche, (1.0, -1.3, 0.85)),
    ("SM_KochbrunnenBecken", "prop", build_kochbrunnen, (1.1, -1.3, 0.85)),
    ("SM_KurgartenHecke", "prop", build_hecke, (0.9, -1.3, 0.95)),
    ("SM_Litfasssaeule", "prop", build_litfass, (1.0, -1.3, 0.8)),
    ("SM_Schlurfer", "enemy", build_schlurfer, (0.8, -1.4, 0.55)),
    ("SK_Sebbo", "character", build_sebbo, (0.7, -1.4, 0.45)),
    # Paket 2 - Wiesbaden-Props
    ("SM_KurparkPavillon", "prop", build_pavillon, (0.85, -1.25, 0.55)),
    ("SM_Reiterstandbild", "prop", build_reiterstandbild, (0.75, -1.3, 0.45)),
    ("SM_WeinbergMauer", "prop", build_weinbergmauer, (0.55, -1.3, 0.55)),
    ("SM_RheinuferGelaender", "prop", build_rheinufer, (0.35, -1.25, 0.5)),
    # Paket 2 - Fernkaempfer
    ("SM_Schuetze", "enemy", build_schuetze, (0.7, -1.4, 0.4)),
    ("SM_Sentinel", "enemy", build_sentinel, (0.6, -1.35, 0.45)),
    # Paket 2 - Boss-Blockout
    ("SM_Boss_KurhausKoloss", "boss", build_boss_kurhaus, (0.75, -1.3, 0.4)),
]

# Zusatzfelder fuer den spielseitigen Import. `game_id` verweist auf den
# Datensatz in data.js, der Rollen-/Balancing-Wert bleibt dort die Quelle.
ASSET_META = {
    "SK_Sebbo": {"pack": 1, "role": "player"},
    "SM_Schlurfer": {"pack": 1, "role": "walker", "game_id": "walker"},
    "SM_KurhausSaeule": {"pack": 1, "role": "arena_prop", "location_hint": "Kurhaus Wiesbaden"},
    "SM_NerobergbahnWagen": {"pack": 1, "role": "arena_prop", "location_hint": "Nerobergbahn Wiesbaden"},
    "SM_MarktkircheSpitze": {"pack": 1, "role": "arena_prop", "location_hint": "Marktkirche Wiesbaden"},
    "SM_KochbrunnenBecken": {"pack": 1, "role": "arena_prop", "location_hint": "Kochbrunnen Wiesbaden"},
    "SM_KurgartenHecke": {"pack": 1, "role": "arena_prop", "location_hint": "Kurgarten Wiesbaden"},
    "SM_Litfasssaeule": {"pack": 1, "role": "arena_prop", "location_hint": "Innenstadt Wiesbaden"},
    "SM_KurparkPavillon": {"pack": 2, "role": "arena_prop", "location_hint": "Kurpark Wiesbaden"},
    "SM_Reiterstandbild": {"pack": 2, "role": "arena_prop", "location_hint": "Stadtmitte Wiesbaden"},
    "SM_WeinbergMauer": {"pack": 2, "role": "arena_prop", "location_hint": "Weinberg am Neroberg"},
    "SM_RheinuferGelaender": {"pack": 2, "role": "arena_prop", "location_hint": "Rheinufer Schierstein"},
    "SM_Schuetze": {"pack": 2, "role": "ranged", "game_id": "shooter"},
    "SM_Sentinel": {"pack": 2, "role": "beam", "game_id": "sentinel"},
    "SM_Boss_KurhausKoloss": {"pack": 2, "role": "boss", "game_id": "kurhaus", "blockout": True},
}


def main():
    for d in ("glb", "fbx", "blender", "renders"):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
    entries = []
    for name, kind, fn, view in ASSETS:
        if ONLY and name not in ONLY:
            continue
        reset()
        rec = fn()
        mesh = rec["mesh"]
        st = stats(mesh)
        glb, fbx = export(name, rec["objs"])
        blend = os.path.join(OUT, "blender", name + ".blend")
        bpy.ops.wm.save_as_mainfile(filepath=blend)
        png = os.path.join(OUT, "renders", name + ".png")
        if not SKIP_RENDER:
            render(name, mesh, view)
        entry = {
            "name": name, "kind": kind,
            "dimensions_m": st["dimensions_m"],
            "verts": st["verts"], "tris": st["tris"],
            "materials": st["materials"],
            "files": {
                "glb": os.path.relpath(glb, ROOT).replace(os.sep, "/"),
                "fbx": os.path.relpath(fbx, ROOT).replace(os.sep, "/"),
                "blend": os.path.relpath(blend, ROOT).replace(os.sep, "/"),
                "render": os.path.relpath(png, ROOT).replace(os.sep, "/") if not SKIP_RENDER else None,
            },
            "bytes": {"glb": os.path.getsize(glb), "fbx": os.path.getsize(fbx)},
        }
        meta = ASSET_META.get(name, {})
        for key, value in meta.items():
            if value is not None:
                entry[key] = value
        entries.append(entry)
        log("%-24s %-9s %5d tris %5d verts  %s m" %
            (name, kind, st["tris"], st["verts"], st["dimensions_m"]))

    manifest_path = os.path.join(OUT, "manifest.json")
    old = {}
    if os.path.exists(manifest_path):
        try:
            old = json.load(open(manifest_path, encoding="utf-8"))
        except Exception:
            old = {}
    merged = {e["name"]: e for e in old.get("assets", [])}
    for name, e in merged.items():
        # Bestehende Paket-1-Eintraege nachziehen, ohne Dateien neu zu bauen.
        meta = ASSET_META.get(name, {})
        e.setdefault("pack", meta.get("pack", 1))
        e.setdefault("role", meta.get("role", "arena_prop"))
        for key in ("game_id", "location_hint", "blockout"):
            if key in meta and key not in e:
                e[key] = meta[key]
    for e in entries:
        merged[e["name"]] = e
    manifest = {
        "schema": "wbn-assetpack/1",
        "generated": DATE,
        "blender": bpy.app.version_string,
        "units": "meters",
        "forward": "-Y (Blender), FBX export -Z forward / Y up",
        "pivot": "base center at world origin",
        "assets": [merged[k] for k in sorted(merged)],
    }
    json.dump(manifest, open(manifest_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    pack2 = {
        "schema": "wbn-assetpack/1",
        "pack": 2,
        "generated": DATE,
        "blender": bpy.app.version_string,
        "units": manifest["units"],
        "forward": manifest["forward"],
        "pivot": manifest["pivot"],
        "note": "Teilmenge von assets/manifest.json (pack = 2).",
        "assets": [e for e in manifest["assets"] if e.get("pack") == 2],
    }
    pack2_path = os.path.join(OUT, "manifest-pack2.json")
    json.dump(pack2, open(pack2_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    log("manifest:", manifest_path, "| assets:", len(manifest["assets"]))
    log("pack 2:", pack2_path, "| assets:", len(pack2["assets"]))


if __name__ == "__main__":
    main()
