"""Rueckimport-Pruefung: Manifest, Signaturen, GLB/FBX-Rueckimport, Renders.

Die Pruefung ist datengetrieben: sie liest assets/manifest.json und
assets/manifest-pack2.json und prueft jedes dort gelistete Asset. Zusaetzlich
gelten die Abnahmezahlen fuer Paket 2 (15 Assets gesamt, 7 in Paket 2,
30 Rueckimporte).

Geprueft wird:
  - Manifest-Schema, Abdeckung, Paket-2-Teilmenge, keine fremden GLB/FBX
  - GLB-Signatur `glTF`, FBX-Signatur `Kaydara FBX Binary`
  - Rueckimport in Blender: Meshes, Vertizes, Materialien, Masse
  - Charakter: Armature + Aktion; Props/Boss: UCX-Collider
  - Renders vorhanden, quadratisch (>= 256 px), Kontaktblatt vorhanden

Run:
  LD_LIBRARY_PATH=$HOME/tools/blender-libs/usr/lib/x86_64-linux-gnu \\
  $HOME/tools/blender-4.5.15-linux-x64/blender -b --factory-startup \\
      --python-exit-code 1 --python tools/blender/verify_assetpack.py
"""
import bpy
import glob
import json
import os
import struct
import sys

from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ASSETS = os.path.join(ROOT, "assets")
EXPECTED_ASSETS = 15
EXPECTED_PACK2 = 7
DIM_TOL = 0.04
SIGNATURES = {"glb": b"glTF", "fbx": b"Kaydara FBX Binary"}


def fail(failures, name, fmt, msg):
    failures.append((name, fmt, msg))


def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("keine PNG-Signatur")
    return struct.unpack(">II", head[16:24])


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def measure():
    armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    # Der glTF-Importer legt fuer die Knochenanzeige eine Icosphere als
    # Custom Shape an. Die gehoert nicht zum Asset und verfaelscht die Masse.
    helper = {pb.custom_shape.name for a in armatures for pb in a.pose.bones if pb.custom_shape}
    meshes = [o for o in bpy.context.scene.objects
              if o.type == "MESH" and o.name not in helper]
    geo = [o for o in meshes if "UCX_" not in o.name]
    verts = sum(len(o.data.vertices) for o in meshes)
    mats = sorted({m.name for o in meshes for m in o.data.materials if m})
    actions = [a.name for a in bpy.data.actions]
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in geo:
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
    dims = [hi[i] - lo[i] for i in range(3)] if geo else [0.0, 0.0, 0.0]
    colliders = [o.name for o in meshes if "UCX_" in o.name]
    return {
        "meshes": len(meshes), "verts": verts, "mats": mats,
        "arms": len(armatures), "actions": len(actions),
        "dims": dims, "colliders": colliders,
    }


def load_json(path, failures, label):
    if not os.path.exists(path):
        fail(failures, label, "manifest", "fehlt: %s" % os.path.relpath(path, ROOT))
        return None
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - report and continue
        fail(failures, label, "manifest", "nicht lesbar: %s" % exc)
        return None


def check_manifest(manifest, pack2, failures):
    assets = manifest.get("assets", []) if manifest else []
    p2 = pack2.get("assets", []) if pack2 else []
    if manifest and manifest.get("schema") != "wbn-assetpack/1":
        fail(failures, "manifest", "json", "Schema != wbn-assetpack/1")
    if len(assets) != EXPECTED_ASSETS:
        fail(failures, "manifest", "json", "%d Assets, erwartet %d" % (len(assets), EXPECTED_ASSETS))
    if pack2 and pack2.get("pack") != 2:
        fail(failures, "manifest-pack2", "json", "pack != 2")
    if len(p2) != EXPECTED_PACK2:
        fail(failures, "manifest-pack2", "json", "%d Assets, erwartet %d" % (len(p2), EXPECTED_PACK2))

    names = [a.get("name") for a in assets]
    if len(set(names)) != len(names):
        fail(failures, "manifest", "json", "doppelte Asset-Namen")
    by_name = {a.get("name"): a for a in assets}
    p2_names = {a.get("name") for a in p2}
    for entry in p2:
        other = by_name.get(entry.get("name"))
        if not other:
            fail(failures, entry.get("name", "?"), "manifest", "Paket 2 fehlt im Gesamtmanifest")
        elif other.get("pack") != 2:
            fail(failures, entry.get("name", "?"), "manifest", "Gesamtmanifest hat pack != 2")
    for entry in assets:
        if entry.get("pack") == 2 and entry.get("name") not in p2_names:
            fail(failures, entry.get("name", "?"), "manifest", "fehlt in manifest-pack2.json")

    for entry in assets:
        name = entry.get("name", "?")
        kind = entry.get("kind")
        if not isinstance(entry.get("pack"), int):
            fail(failures, name, "manifest", "Feld pack fehlt")
        if not entry.get("role"):
            fail(failures, name, "manifest", "Feld role fehlt")
        if kind == "character" and not name.startswith("SK_"):
            fail(failures, name, "manifest", "Charakter braucht SK_-Praefix")
        if kind in ("prop", "enemy", "boss") and not name.startswith("SM_"):
            fail(failures, name, "manifest", "Static Mesh braucht SM_-Praefix")
        if kind == "boss" and not entry.get("blockout"):
            fail(failures, name, "manifest", "Boss ohne blockout-Flag")
        if kind == "boss" and not entry.get("game_id"):
            fail(failures, name, "manifest", "Boss ohne game_id")
        if kind in ("prop", "boss") and not entry.get("dimensions_m"):
            fail(failures, name, "manifest", "Masse fehlen")
        if not entry.get("materials"):
            fail(failures, name, "manifest", "Materialliste leer")

    disk = {}
    for fmt in ("glb", "fbx"):
        disk[fmt] = {os.path.splitext(os.path.basename(p))[0]
                     for p in glob.glob(os.path.join(ASSETS, fmt, "*." + fmt))}
    wanted = set(names)
    for fmt in ("glb", "fbx"):
        extras = disk[fmt] - wanted
        if extras:
            fail(failures, ",".join(sorted(extras)), fmt, "Datei(en) nicht im Manifest")
    return assets


def check_roundtrip(entry, failures, rows):
    name = entry["name"]
    kind = entry.get("kind")
    expected_dims = sorted(round(v, 3) for v in entry["dimensions_m"])
    for fmt, magic in SIGNATURES.items():
        path = os.path.join(ROOT, entry["files"][fmt])
        if not os.path.exists(path):
            fail(failures, name, fmt, "Datei fehlt")
            continue
        with open(path, "rb") as fh:
            head = fh.read(len(magic))
        if head != magic:
            fail(failures, name, fmt, "Signatur fehlt")
            continue
        if entry.get("bytes", {}).get(fmt) != os.path.getsize(path):
            fail(failures, name, fmt, "Byte-Groesse weicht vom Manifest ab")

        fresh()
        try:
            if fmt == "glb":
                bpy.ops.import_scene.gltf(filepath=path)
            else:
                bpy.ops.import_scene.fbx(filepath=path)
        except Exception as exc:  # noqa: BLE001 - report, do not abort the run
            fail(failures, name, fmt, "Import: %s" % exc)
            continue

        info = measure()
        status = []
        if info["meshes"] < 1 or info["verts"] < 1:
            status.append("leer")
        if len(info["mats"]) != len(entry["materials"]):
            status.append("Materialien %d/%d" % (len(info["mats"]), len(entry["materials"])))
        got_dims = sorted(round(v, 3) for v in info["dims"])
        if any(abs(a - b) > DIM_TOL for a, b in zip(got_dims, expected_dims)):
            status.append("Masse %s != %s" % (got_dims, expected_dims))
        if kind == "character":
            if info["arms"] < 1:
                status.append("keine Armature")
            if info["actions"] < 1:
                status.append("keine Aktion")
        if kind in ("prop", "boss") and not info["colliders"]:
            status.append("kein UCX-Collider")
        if status:
            fail(failures, name, fmt, ", ".join(status))
        rows.append((name, fmt, info["meshes"], info["verts"], len(info["mats"]),
                     info["arms"], info["actions"], "ok" if not status else "FEHLER"))


def main():
    failures = []
    manifest = load_json(os.path.join(ASSETS, "manifest.json"), failures, "manifest")
    pack2 = load_json(os.path.join(ASSETS, "manifest-pack2.json"), failures, "manifest-pack2")
    assets = check_manifest(manifest, pack2, failures)

    rows = []
    for entry in assets:
        check_roundtrip(entry, failures, rows)
        render = entry.get("files", {}).get("render")
        if not render:
            fail(failures, entry.get("name", "?"), "render", "Renderpfad fehlt")
            continue
        render_path = os.path.join(ROOT, render)
        if not os.path.exists(render_path):
            fail(failures, entry.get("name", "?"), "render", "Datei fehlt")
            continue
        try:
            w, h = png_size(render_path)
        except Exception as exc:  # noqa: BLE001
            fail(failures, entry.get("name", "?"), "render", str(exc))
            continue
        if w != h or w < 256:
            fail(failures, entry.get("name", "?"), "render", "%dx%d ungeeignet" % (w, h))
        blend = entry.get("files", {}).get("blend")
        if not blend or not os.path.exists(os.path.join(ROOT, blend)):
            fail(failures, entry.get("name", "?"), "blend", "Datei fehlt")

    overview = os.path.join(ASSETS, "renders", "_overview_pack2.png")
    if not os.path.exists(overview):
        fail(failures, "overview", "render", "_overview_pack2.png fehlt")

    print("%-24s %-4s %6s %7s %5s %5s %5s  %s" %
          ("asset", "typ", "meshes", "verts", "mats", "arms", "anim", "status"))
    for r in rows:
        print("%-24s %-4s %6d %7d %5d %5d %5d  %s" % r)
    for f in failures:
        print("FAIL %-22s %-6s %s" % f)
    print("MANIFEST %d Assets | Paket 2: %d Assets | Renders: %d" %
          (len(assets), len(pack2.get("assets", [])) if pack2 else 0, len(assets)))
    print("ROUNDTRIP %d Dateien, %d Fehler" % (len(rows), len(failures)))
    ok = not failures and len(rows) == EXPECTED_ASSETS * 2
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
