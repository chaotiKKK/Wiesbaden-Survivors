"""Rendert eine Top-Down-Lesbarkeitsserie mit der geplanten Spielkamera.

Die Szene nutzt die vorhandenen Arena-GLBs und ergaenzt zwei auf die 2D-Engine
abgestimmte Gegner-Silhouetten:

  - Schlurfer  : vorhandenes SM_Schlurfer-Mesh, breite Rechteck-Silhouette
  - Laeufer    : schmale Speerspitze mit langen Laeufen (SM_Laeufer)
  - Elite      : grosse Sternform mit Zackenkrone (SM_EliteWache)

Dazu bekommt Sebbo eine dauerhafte weisse Bodenmarkierung plus ein Chevron.
Wagen-Creme und Brunnenwasser werden auf Materialebene in der Helligkeit
abgesenkt. Die Kamera bleibt die dokumentierte Referenz:

  - orthografisch, 60 Grad Elevation, Norden oben (Yaw 0)
  - 18 m Sichtbreite; bei 16:9 sind das ca. 10,1 m Hoehe in der Bildebene
    bzw. ca. 11,7 m sichtbarer Boden in Y-Richtung
  - 1280 x 720 oder per --res frei waehlbar

Aufruf:
  B=$HOME/tools/blender-4.5.15-linux-x64/blender
  export LD_LIBRARY_PATH=$HOME/tools/blender-libs/usr/lib/x86_64-linux-gnu
  "$B" -b --factory-startup --python tools/blender/render_camera_series.py -- \
      --out docs/pw/camera-readability --res 1280 --samples 12

Ergebnis:
  docs/pw/camera-readability/00_stage.png ... 04_max.png
  docs/pw/camera-readability/series.json
"""
import bpy
import bmesh
import json
import math
import os
import random
import sys
from collections import Counter
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "assets", "glb")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RES = 1280
SAMPLES = 32
OUT = os.path.join(ROOT, "docs", "pw", "camera-readability")
for i, a in enumerate(ARGS):
    if a == "--res" and i + 1 < len(ARGS):
        RES = int(ARGS[i + 1])
    elif a == "--samples" and i + 1 < len(ARGS):
        SAMPLES = int(ARGS[i + 1])
    elif a == "--out" and i + 1 < len(ARGS):
        OUT = os.path.abspath(ARGS[i + 1])
os.makedirs(OUT, exist_ok=True)

# Die geplante Kamera. ortho_scale ist in Blender die horizontale Sichtbreite
# bei Landscape-Aufloesungen; 18 m entsprechen der 1130-px-Referenz des HTML-
# Spiels, hochgerechnet auf die 1280-px-Ausgabe.
CAMERA = {
    "projection": "orthographic",
    "elevation_deg": 60.0,
    "yaw_deg": 0.0,
    "ortho_width_m": 18.0,
    "target": [0.0, 0.0, 0.0],
    "distance_m": 25.0,
    "north_up": True,
}
PLAYER = (-0.30, -0.55)
COUNTS = (0, 8, 18, 34, 50)
PROPS = [
    ("SM_KochbrunnenBecken", (-4.60, -0.85), 0.0),
    ("SM_KurgartenHecke", (4.05, -1.65), 24.0),
    ("SM_KurhausSaeule", (2.10, 2.55), 0.0),
    ("SM_Litfasssaeule", (7.75, -0.60), 0.0),
    ("SM_NerobergbahnWagen", (-3.95, 2.75), 9.0),
    ("SM_MarktkircheSpitze", (4.95, 0.90), -8.0),
]

# Materialwerte: (Helligkeitsfaktor, Saettigungsfaktor). Die Basisfarben der
# GLBs sind bereits linear; ein Faktor < 1 senkt deshalb auch die gerenderte
# Helligkeit und nicht nur den Farbton.
PROP_GRADES = {
    "SM_NerobergbahnWagen": {
        "M_Bahn_Creme": (0.30, 0.52),
        "M_Bahn_Glas": (0.26, 0.55),
        "M_Bahn_Gold": (0.38, 0.62),
    },
    "SM_KochbrunnenBecken": {
        "M_Brunnen_Wasser": (0.28, 0.62),
        "M_Brunnen_Stein": (0.62, 0.78),
    },
}
ELITE_CLUSTERS = {2, 5, 8}

METRICS = {}


def log(*a):
    print("[camera-series]", *a, flush=True)


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.cycles.use_adaptive_sampling = True
    sc.render.resolution_x = RES
    sc.render.resolution_y = int(round(RES * 9 / 16))
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.render.use_persistent_data = True

    world = bpy.data.worlds.new("WBN_CameraTest_World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.018, 0.022, 0.030, 1.0)
    bg.inputs[1].default_value = 0.85
    sc.world = world

    # Boden: dunkles, leicht blaues Pflaster. Die 2-m-Linien geben nur Massstab,
    # sie sollen nicht mit Gegnern oder Props um Aufmerksamkeit konkurrieren.
    floor_mat = bpy.data.materials.new("M_TestFloor")
    floor_mat.use_nodes = True
    bsdf = floor_mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.050, 0.058, 0.070, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.92
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -0.015))
    floor = bpy.context.object
    floor.name = "TEST_Floor"
    floor.scale = (28, 20, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    floor.data.materials.append(floor_mat)

    grid_mat = bpy.data.materials.new("M_TestGrid")
    grid_mat.use_nodes = True
    gb = grid_mat.node_tree.nodes["Principled BSDF"]
    gb.inputs["Base Color"].default_value = (0.022, 0.026, 0.033, 1.0)
    gb.inputs["Roughness"].default_value = 0.95
    for x in range(-8, 9, 2):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, -0.002))
        o = bpy.context.object
        o.name = "TEST_GridX_%d" % x
        o.scale = (0.018, 18, 0.006)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        o.data.materials.append(grid_mat)
    for y in range(-6, 7, 2):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y, -0.002))
        o = bpy.context.object
        o.name = "TEST_GridY_%d" % y
        o.scale = (18, 0.018, 0.006)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        o.data.materials.append(grid_mat)

    bpy.ops.object.light_add(type="SUN", location=(3, -4, 9))
    sun = bpy.context.object
    sun.name = "TEST_Sun"
    sun.data.energy = 3.2
    sun.data.angle = math.radians(9)
    sun.rotation_euler = (math.radians(42), 0, math.radians(28))

    bpy.ops.object.light_add(type="AREA", location=(-6.5, -5.0, 7.0))
    key = bpy.context.object
    key.name = "TEST_Key"
    key.data.energy = 620
    key.data.size = 7.0
    key.rotation_euler = (Vector((0, 0, 0)) - key.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.light_add(type="AREA", location=(6.0, 3.5, 4.8))
    fill = bpy.context.object
    fill.name = "TEST_Fill"
    fill.data.energy = 280
    fill.data.size = 6.0
    fill.rotation_euler = (Vector((0, 0, 0)) - fill.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.name = "TEST_GameCamera"
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = CAMERA["ortho_width_m"]
    elev = math.radians(CAMERA["elevation_deg"])
    target = Vector(CAMERA["target"])
    d = CAMERA["distance_m"]
    cam.location = target + Vector((0.0, -math.cos(elev) * d, math.sin(elev) * d))
    cam.rotation_euler = (math.radians(90.0 - CAMERA["elevation_deg"]), 0.0, 0.0)
    sc.camera = cam
    bpy.context.view_layer.update()
    return sc, cam


def import_glb(name):
    path = os.path.join(ASSETS, name + ".glb")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [o for o in bpy.data.objects if o not in before]
    # Der GLB-Export des geriggten Sebbo legt zusaetzlich eine 1-m-Icosphere
    # an; sie gehoert nicht zum Asset und wird fuer die Szene entfernt.
    for o in list(imported):
        if o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o, do_unlink=True)
            imported.remove(o)
    for o in list(imported):
        if o.name.startswith("UCX_"):
            bpy.data.objects.remove(o, do_unlink=True)
            imported.remove(o)
    return [o for o in imported if o.type == "MESH"]


def _principled(mat):
    if not mat or not mat.use_nodes:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def grade_prop_materials(asset_name, objs):
    """Senkt die Wertigkeit genau der konkurrierenden Prop-Flaechen."""
    grades = PROP_GRADES.get(asset_name, {})
    changed = []
    for obj in objs:
        for mat in obj.data.materials:
            rule = grades.get(mat.name if mat else None)
            if not rule:
                continue
            value, saturation = rule
            bsdf = _principled(mat)
            if not bsdf:
                continue
            base = bsdf.inputs.get("Base Color")
            if base:
                if base.is_linked:
                    src = base.links[0].from_socket
                    hs = mat.node_tree.nodes.new("ShaderNodeHueSaturation")
                    hs.name = "WBN_ValueGrade"
                    hs.inputs["Value"].default_value = value
                    hs.inputs["Saturation"].default_value = saturation
                    mat.node_tree.links.new(src, hs.inputs["Color"])
                    mat.node_tree.links.new(hs.outputs["Color"], base)
                else:
                    c = list(base.default_value)
                    lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
                    c = [max(0.0, (lum + (c[i] - lum) * saturation) * value) for i in range(3)]
                    base.default_value = (c[0], c[1], c[2], 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = 0.0
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = max(0.82, bsdf.inputs["Roughness"].default_value)
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = min(0.15, bsdf.inputs["Metallic"].default_value)
            changed.append(mat.name)
    if changed:
        log("graded", asset_name, "->", ", ".join(sorted(set(changed))))
    return sorted(set(changed))


def place_props():
    placed = []
    for name, (x, y), deg in PROPS:
        objs = import_glb(name)
        for o in objs:
            o.location = (x, y, 0)
            o.rotation_euler[2] = math.radians(deg)
        changed = grade_prop_materials(name, objs)
        placed.append({"name": name, "x": x, "y": y, "rotation_deg": deg,
                       "meshes": objs, "graded_materials": changed})
        log("prop", name, "at", x, y)
    return placed


def build_player():
    # Sebbo ist geriggt; die GLB-Animation bleibt erhalten. Das Modell schaut
    # nach -Y; die leichte Drehung zeigt Gesicht und Schraubenschluessel zur
    # Kamera, ohne die Spielfigur frontal wie ein Inventarbild wirken zu lassen.
    objs = import_glb("SK_Sebbo")
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if rig:
        rig.location = (PLAYER[0], PLAYER[1], 0)
        rig.rotation_euler[2] = math.radians(18)
        if rig.animation_data and rig.animation_data.action:
            rig.animation_data.action = rig.animation_data.action
    else:
        for o in objs:
            o.location = (PLAYER[0], PLAYER[1], 0)
            o.rotation_euler[2] = math.radians(18)
    bpy.context.scene.frame_set(1)
    log("player at", PLAYER)
    return rig if rig else objs[0]


def make_mat(name, color, rough=0.82, metallic=0.0, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (emission[0], emission[1], emission[2], 1.0)
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (emission[0], emission[1], emission[2], 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = strength
    mat.diffuse_color = (color[0], color[1], color[2], 1.0)
    return mat


def add_prism(bm, points, z0, z1, mat_index=0):
    bottom = [bm.verts.new((x, y, z0)) for x, y in points]
    top = [bm.verts.new((x, y, z1)) for x, y in points]
    faces = [bm.faces.new(list(reversed(bottom))), bm.faces.new(top)]
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((bottom[i], bottom[j], top[j], top[i])))
    for f in faces:
        f.material_index = mat_index
    return faces


def finalize_mesh(bm, name, materials):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for mat in materials:
        me.materials.append(mat)
    return obj


def circle_points(cx, cy, radius, n=12):
    return [(cx + math.cos(i / n * math.tau) * radius,
             cy + math.sin(i / n * math.tau) * radius) for i in range(n)]


def star_points(cx, cy, outer, inner, n=10):
    pts = []
    for i in range(n * 2):
        a = -math.pi / 2 + i / (n * 2) * math.tau
        r = outer if i % 2 == 0 else inner
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def build_runner():
    """Schmale Keil-Silhouette mit langen Laeufen; Gegenstueck zu shape='tri'."""
    body = make_mat("M_Laeufer_Body", (0.070, 0.175, 0.225), rough=0.86)
    head = make_mat("M_Laeufer_Head", (0.16, 0.29, 0.33), rough=0.78)
    accent = make_mat("M_Laeufer_Accent", (0.68, 0.80, 0.77), rough=0.46,
                      emission=(0.35, 0.54, 0.50), strength=0.55)
    bm = bmesh.new()
    add_prism(bm, [
        (0.0, -1.02), (0.30, -0.40), (0.18, 0.18), (0.76, 1.08),
        (0.34, 0.94), (0.0, 0.40), (-0.34, 0.94), (-0.76, 1.08),
        (-0.18, 0.18), (-0.30, -0.40),
    ], 0.0, 0.54, 0)
    add_prism(bm, circle_points(0.0, -0.72, 0.205, 12), 0.32, 0.86, 1)
    add_prism(bm, [(0.0, -1.54), (0.13, -0.72), (-0.13, -0.72)], 0.18, 0.72, 2)
    for sx in (-0.082, 0.082):
        add_prism(bm, circle_points(sx, -0.85, 0.032, 8), 0.855, 0.875, 2)
    obj = finalize_mesh(bm, "SM_Laeufer", [body, head, accent])
    obj.hide_render = True
    log("runner template built")
    return obj


def build_elite():
    """Grosse Sternform plus Zackenkrone; Gegenstueck zur Elite-Wache."""
    body = make_mat("M_Elite_Body", (0.42, 0.30, 0.12), rough=0.74, metallic=0.08)
    dark = make_mat("M_Elite_Dark", (0.035, 0.028, 0.045), rough=0.88)
    accent = make_mat("M_Elite_Accent", (0.78, 0.58, 0.19), rough=0.50,
                      emission=(0.58, 0.39, 0.10), strength=0.35)
    bm = bmesh.new()
    add_prism(bm, star_points(0.0, 0.0, 1.32, 0.62, 5), 0.0, 0.56, 0)
    # Vier laengere Zacken machen die Krone auch ohne Farbe als Sonderform lesbar.
    for a in (-math.pi / 2, 0.0, math.pi / 2, math.pi):
        dx, dy = math.cos(a), math.sin(a)
        px, py = -dy, dx
        add_prism(bm, [
            (dx * 1.58, dy * 1.58),
            (px * 0.20, py * 0.20),
            (-px * 0.20, -py * 0.20),
        ], 0.18, 0.76, 0)
    add_prism(bm, star_points(0.0, 0.0, 0.72, 0.31, 5), 0.56, 0.625, 1)
    add_prism(bm, circle_points(0.0, 0.0, 0.235, 12), 0.625, 0.68, 2)
    obj = finalize_mesh(bm, "SM_EliteWache", [body, dark, accent])
    obj.hide_render = True
    log("elite template built")
    return obj


def tune_enemy_materials():
    # Die Augen des Schlurfers waren mit Emission 3.0 ein sehr helles Raster.
    # Sie bleiben Orientierung, konkurrieren aber nicht mehr mit dem weissen
    # Spieler-Marker.
    for mat in bpy.data.materials:
        if mat.name == "M_Schlurfer_Auge":
            bsdf = _principled(mat)
            if bsdf:
                bsdf.inputs["Base Color"].default_value = (0.72, 0.46, 0.10, 1.0)
                if "Emission Strength" in bsdf.inputs:
                    bsdf.inputs["Emission Strength"].default_value = 1.15


def make_enemy_templates():
    walker_objs = import_glb("SM_Schlurfer")
    if len(walker_objs) != 1:
        raise RuntimeError("SM_Schlurfer erwartet genau ein Mesh, gefunden: %d" % len(walker_objs))
    walker = walker_objs[0]
    walker.name = "TEST_Schlurfer_template"
    walker.hide_render = True
    tune_enemy_materials()
    runner = build_runner()
    elite = build_elite()
    bpy.context.view_layer.update()
    return {"schlurfer": walker, "laeufer": runner, "elite": elite}


def build_player_marker():
    """Weisser Bodenring und schwebendes Chevron; bewusst nicht an Teamfarbe gebunden."""
    white = make_mat("M_PlayerMarker_White", (1.0, 1.0, 1.0), rough=0.32,
                     emission=(1.0, 1.0, 1.0), strength=2.4)
    dark = make_mat("M_PlayerMarker_Dark", (0.008, 0.012, 0.018), rough=0.96)
    marker = []

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.88, depth=0.012,
                                        location=(PLAYER[0], PLAYER[1], 0.006))
    disc = bpy.context.object
    disc.name = "TEST_PlayerMarkerDisc"
    disc.data.materials.append(dark)
    marker.append(disc)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.68, minor_radius=0.042,
                                     major_segments=40, minor_segments=8,
                                     location=(PLAYER[0], PLAYER[1], 0.032))
    ring = bpy.context.object
    ring.name = "TEST_PlayerMarkerRing"
    ring.data.materials.append(white)
    marker.append(ring)

    bm = bmesh.new()
    add_prism(bm, [
        (-0.34, 0.18), (0.0, -0.18), (0.34, 0.18),
        (0.34, 0.02), (0.0, -0.34), (-0.34, 0.02),
    ], 2.02, 2.08, 0)
    chevron = finalize_mesh(bm, "TEST_PlayerMarkerChevron", [white])
    chevron.location = (PLAYER[0], PLAYER[1], 0.0)
    marker.append(chevron)

    for o in marker:
        if hasattr(o, "visible_shadow"):
            o.visible_shadow = False
    log("player marker: ring + chevron")
    return marker


def projected_bbox(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    vs = [world_to_camera_view(bpy.context.scene, bpy.context.scene.camera, p) for p in pts]
    return {
        "x0": min(v.x for v in vs), "x1": max(v.x for v in vs),
        "y0": min(v.y for v in vs), "y1": max(v.y for v in vs),
        "z0": min(v.z for v in vs), "z1": max(v.z for v in vs),
    }


def overlaps_prop(x, y, margin=0.55):
    for _, (px, py), deg in PROPS:
        # Grobe, rotationssichere Naeherung: die groessten Props sind maximal
        # 4,24 x 2,04 m; ein Kreis mit halber Diagonale plus Margin reicht.
        r = {"SM_KochbrunnenBecken": 1.9, "SM_KurgartenHecke": 1.7,
             "SM_KurhausSaeule": 0.9, "SM_Litfasssaeule": 1.0,
             "SM_NerobergbahnWagen": 2.6, "SM_MarktkircheSpitze": 2.3}.get(_, 1.5)
        if math.hypot(x - px, y - py) < r + margin:
            return True
    return False


def enemy_slots(count=50):
    """Zehn Cluster; Cluster 2/5/8 tragen je eine Elite-Wache im Zentrum.

    Die Reihenfolge ist bewusst: 8 und 18 zeigen zuerst die beiden Basisfamilien,
    ab 34 kommt die erste Elite hinzu, bei 50 sind alle drei Sonderformen da.
    """
    rng = random.Random(0x5EBB0)
    centers = []
    for i in range(10):
        for attempt in range(2400):
            a = rng.uniform(0.0, math.tau)
            rad = 2.35 + rng.uniform(0, 1.75)
            x = PLAYER[0] + math.cos(a) * rad
            y = PLAYER[1] + math.sin(a) * rad
            if not (-7.9 < x < 7.9 and -5.20 < y < 5.20):
                continue
            if math.hypot(x - PLAYER[0], y - PLAYER[1]) < 2.15:
                continue
            if overlaps_prop(x, y, 0.62):
                continue
            if any(math.hypot(x - cx, y - cy) < 1.38 for cx, cy in centers):
                continue
            centers.append((x, y))
            break
        if len(centers) < i + 1:
            raise RuntimeError("Kein gueltiges Cluster-Zentrum fuer %d" % i)

    slots = []
    for ci, (cx, cy) in enumerate(centers):
        is_elite = ci in ELITE_CLUSTERS
        center_kind = "elite" if is_elite else "schlurfer"
        slots.append({"x": cx, "y": cy, "kind": center_kind, "cluster": ci})

        base = rng.uniform(0, math.tau)
        radius = 1.58 if is_elite else 0.92
        minion_kinds = ("schlurfer", "laeufer", "schlurfer", "laeufer")
        for j, kind in enumerate(minion_kinds):
            placed = None
            for attempt in range(40):
                ang = base + j * math.tau / 4 + (attempt % 5 - 2) * 0.10
                rr = radius + (attempt // 5) * 0.14
                x = cx + math.cos(ang) * rr
                y = cy + math.sin(ang) * rr
                if not (-8.2 < x < 8.2 and -5.35 < y < 5.35):
                    continue
                if math.hypot(x - PLAYER[0], y - PLAYER[1]) < 1.42:
                    continue
                if overlaps_prop(x, y, 0.50):
                    continue
                if any(math.hypot(x - s["x"], y - s["y"]) < 0.34 for s in slots):
                    continue
                placed = (x, y)
                break
            if not placed:
                raise RuntimeError("Kein gueltiger Minion-Platz in Cluster %d" % ci)
            slots.append({"x": placed[0], "y": placed[1], "kind": kind, "cluster": ci})

    if len(slots) != count:
        raise RuntimeError("Erwartet %d Slots, erzeugt %d" % (count, len(slots)))
    return slots


def make_enemies(templates, slots):
    enemies = []
    for i, slot in enumerate(slots):
        template = templates[slot["kind"]]
        e = template.copy()
        e.data = template.data
        bpy.context.collection.objects.link(e)
        e.name = "TEST_%s_%02d" % (slot["kind"].capitalize(), i)
        e["family"] = slot["kind"]
        e["cluster"] = slot["cluster"]
        e.hide_render = False
        dx, dy = PLAYER[0] - slot["x"], PLAYER[1] - slot["y"]
        e.location = (slot["x"], slot["y"], 0)
        e.rotation_euler[2] = math.atan2(dx, -dy)
        enemies.append(e)
    return enemies


def render_series(cam, player, enemies, props, marker):
    sc = bpy.context.scene
    visible_bboxes = {}
    for o in props:
        for m in o["meshes"]:
            visible_bboxes[m.name] = projected_bbox(m)
    visible_bboxes["SK_Sebbo"] = projected_bbox(next(o for o in bpy.data.objects if o.name == "SK_Sebbo"))
    for m in marker:
        visible_bboxes[m.name] = projected_bbox(m)
    for e in enemies:
        visible_bboxes[e.name] = projected_bbox(e)
    crop = {k: v for k, v in visible_bboxes.items()
            if v["x0"] < 0.01 or v["x1"] > 0.99 or v["y0"] < 0.01 or v["y1"] > 0.99}

    series = []
    sc.frame_set(1)
    frames = ["00_stage", "01_sparse", "02_pressure", "03_crowd", "04_max"]
    for idx, count in enumerate(COUNTS):
        for i, e in enumerate(enemies):
            e.hide_render = i >= count
        path = os.path.join(OUT, frames[idx] + ".png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        series.append({
            "frame": frames[idx],
            "enemies": count,
            "file": os.path.relpath(path, ROOT).replace(os.sep, "/"),
            "visible_enemy_bboxes": {
                e.name: {"family": e.get("family"),
                         "x": [round(visible_bboxes[e.name]["x0"], 3), round(visible_bboxes[e.name]["x1"], 3)],
                         "y": [round(visible_bboxes[e.name]["y0"], 3), round(visible_bboxes[e.name]["y1"], 3)]}
                for e in enemies[:count]
            },
        })
        log("rendered", frames[idx], "with", count, "enemies", "->", path)

    counts = Counter(e.get("family") for e in enemies)
    meta = {
        "schema": "wbn-camera-readability/2",
        "generated": "2026-11-08",
        "camera": CAMERA,
        "resolution": [RES, int(round(RES * 9 / 16))],
        "player": {
            "asset": "SK_Sebbo", "x": PLAYER[0], "y": PLAYER[1],
            "marker": {"ring": "TEST_PlayerMarkerRing", "disc": "TEST_PlayerMarkerDisc",
                       "chevron": "TEST_PlayerMarkerChevron",
                       "style": "weisser Bodenring + schwebendes Chevron"},
        },
        "enemy_composition": {
            "total": len(enemies),
            "schlurfer": counts.get("schlurfer", 0),
            "laeufer": counts.get("laeufer", 0),
            "elite": counts.get("elite", 0),
            "elite_clusters": sorted(ELITE_CLUSTERS),
        },
        "props": [{"name": p["name"], "x": p["x"], "y": p["y"],
                   "rotation_deg": p["rotation_deg"],
                   "graded_materials": p["graded_materials"]} for p in props],
        "series": series,
        "crop_flags": {k: {kk: round(vv, 3) for kk, vv in v.items()} for k, v in crop.items()},
        "notes": [
            "Die Kamera ist ein reproduzierbarer Entwurf, keine bereits in der Engine implementierte Kamera.",
            "Die 50 Gegner entsprechen der dokumentierten Engine-Obergrenze _maxSimultaneous.",
            "SM_Laeufer und SM_EliteWache sind auf die 2D-Silhouetten abgestimmte Referenz-Meshes, keine Engine-Assets.",
            "Wagen-Creme, Wagen-Glas, Brunnenwasser und Brunnenstein wurden auf Materialebene abgesenkt.",
            "Der Spieler-Marker ist eine weisse Bodenring-/Chevron-Konstruktion und damit unabhaengig von der Jackenfarbe.",
        ],
    }
    with open(os.path.join(OUT, "series.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    log("composition:", dict(counts))
    log("crop flags:", json.dumps(meta["crop_flags"], ensure_ascii=False))
    log("meta:", os.path.join(OUT, "series.json"))


def main():
    sc, cam = scene_setup()
    props = place_props()
    player = build_player()
    marker = build_player_marker()
    templates = make_enemy_templates()
    slots = enemy_slots(50)
    enemies = make_enemies(templates, slots)
    render_series(cam, player, enemies, props, marker)


if __name__ == "__main__":
    main()
