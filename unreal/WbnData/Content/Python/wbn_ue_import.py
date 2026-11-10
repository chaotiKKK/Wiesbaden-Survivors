#!/usr/bin/env python3
"""Wiesbaden Survivors — UE 5.8 Import-Automator.

Liest content/ue/data-records.json (erzeugt aus data.js und
content/fuenf-viertel.json) und

1. importiert die 15 Manifest-Assets ueber Interchange (GLB; Charaktere per FBX,
   mit GLB-Fallback), und
2. legt fuer jeden der 272 Datensaetze ein typisiertes UPrimaryDataAsset an bzw.
   aktualisiert es, inklusive der 32 Kampagnengegner.

Der Import ist idempotent: vorhandene DataAssets werden geladen und neu
befuellt, Meshes werden mit replace_existing neu importiert.

Ausfuehrung im Editor/Kommandozeilen-Editor:
  UnrealEditor-Cmd.exe <Projekt>.uproject -run=pythonscript \
    -script="<Projekt>/Plugins/WbnData/Content/Python/wbn_ue_import.py" \
    -unattended -nullrhi -nosplash -stdout

Nuetzliche Optionen:
  --dry-run             nur planen, nichts schreiben
  --validate-only       Daten pruefen und beenden
  --skip-assets         nur DataAssets
  --skip-data           nur Meshes
  --only chars,weapons  Kategorien/IDs/Asset-Namen filtern
  --only campaign       nur die Kampagnengegner (Alias campaignEnemies)
  --report PFAD         JSON-Report (Default: <Projekt>/Saved/WbnImportReport.json)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import wbn_mapping  # noqa: E402

KIND_FOLDERS = {
    "prop": "Props",
    "enemy": "Enemies",
    "character": "Characters",
    "boss": "Bosses",
}


def log(message):
    unreal.log("[WbnImport] " + str(message))


def warn(message):
    unreal.log_warning("[WbnImport] " + str(message))


def error(message):
    unreal.log_error("[WbnImport] " + str(message))


def _set(object_to_set, name, value):
    try:
        object_to_set.set_editor_property(name, value)
    except Exception as exc:  # noqa: BLE001 - report the exact UE property
        raise RuntimeError("%s: %s" % (name, exc))


def _resolve_class(class_name):
    cls = getattr(unreal, class_name, None)
    if cls is None:
        cls = unreal.load_class(None, "/Script/WbnData." + class_name)
    if cls is None:
        raise RuntimeError(
            "Klasse %s nicht gefunden. Ist das Plugin WbnData aktiviert und kompiliert?" % class_name)
    return cls


def _class_matches(asset, cls):
    try:
        return isinstance(asset, cls)
    except TypeError:
        return asset.get_class().get_name() == cls.get_name()


def _make_struct(struct_cls, values):
    obj = struct_cls()
    for key, value in values.items():
        _set(obj, key, value)
    return obj


def _tier_structs(tiers):
    cls = _resolve_class("WbnWeaponTier")
    return [_make_struct(cls, tier) for tier in tiers]


def _phase_structs(phases):
    cls = _resolve_class("WbnBossPhase")
    return [_make_struct(cls, phase) for phase in phases]


def _apply_properties(asset, props):
    """Setzt alle gemappten Eigenschaften; sammelt Fehler pro Feld."""
    field_errors = []
    for key, value in props.items():
        try:
            if key == "tiers":
                value = _tier_structs(value)
            elif key == "phases":
                value = _phase_structs(value)
            _set(asset, key, value)
        except Exception as exc:  # noqa: BLE001
            field_errors.append("%s.%s: %s" % (asset.get_name(), key, exc))
    return field_errors


def _save_asset(asset, warnings):
    try:
        if not unreal.EditorAssetLibrary.save_loaded_asset(asset):
            warnings.append("Speichern meldete false: " + asset.get_path_name())
    except Exception as exc:  # noqa: BLE001
        warnings.append("Speichern fehlgeschlagen (%s): %s" % (asset.get_path_name(), exc))


def _data_asset_path(record):
    return wbn_mapping.asset_folder(record) + "/" + record["assetName"]


def _upsert_data_asset(record, class_cache, warnings):
    cat = record["category"]
    spec = wbn_mapping.CATEGORY_SPECS[cat]
    class_name = spec["dataClass"]
    cls = class_cache.get(class_name)
    if cls is None:
        cls = _resolve_class(class_name)
        class_cache[class_name] = cls

    folder = "/Game/Wbn/Data/" + spec["folder"]
    asset_path = folder + "/" + record["assetName"]
    created = False
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        asset = unreal.EditorAssetLibrary.load_asset(asset_path)
        if asset is None:
            raise RuntimeError("Vorhandenes Asset laesst sich nicht laden: " + asset_path)
        if not _class_matches(asset, cls):
            raise RuntimeError("Klasse von %s ist %s, erwartet %s" % (
                asset_path, asset.get_class().get_name(), class_name))
    else:
        factory = unreal.DataAssetFactory()
        _set(factory, "data_asset_class", cls)
        asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            record["assetName"], folder, cls, factory)
        if asset is None:
            raise RuntimeError("create_asset lieferte None: " + asset_path)
        created = True

    props = wbn_mapping.properties_for(record)
    field_errors = _apply_properties(asset, props)
    _save_asset(asset, warnings)
    if field_errors:
        raise RuntimeError("; ".join(field_errors))
    return ("created" if created else "updated"), asset_path


def _asset_file(entry, fmt, args):
    files = entry.get("files") or {}
    rel = files.get(fmt)
    if not rel:
        return None
    rel = str(rel).replace("\\", "/")
    if rel.startswith("assets/"):
        rel = rel[len("assets/"):]
    candidates = [os.path.join(args.assets_root, rel)]
    candidates.append(os.path.join(args.repo_root, rel))
    for candidate in candidates:
        if os.path.isfile(candidate):
            return os.path.abspath(candidate)
    return None


def _enable_fbx_interchange(warnings):
    try:
        unreal.SystemLibrary.execute_console_command(
            None, "Interchange.FeatureFlags.Import.FBX 1")
        log("Interchange-FBX-Flag gesetzt.")
    except Exception as exc:  # noqa: BLE001
        warnings.append("FBX-Interchange-Flag konnte nicht gesetzt werden: %s" % exc)


def _interchange_import(source_file, destination_path, asset_name):
    manager = unreal.InterchangeManager.get_interchange_manager_scripted()
    if manager is None:
        raise RuntimeError("InterchangeManager nicht verfuegbar")
    source = unreal.InterchangeManager.create_source_data(source_file)
    if source is None:
        raise RuntimeError("Interchange SourceData nicht erzeugbar: " + source_file)

    params = unreal.ImportAssetParameters()
    params.is_automated = True
    params.replace_existing = True
    params.destination_name = asset_name

    imported = manager.import_asset(destination_path, source, params)
    if isinstance(imported, bool):
        if not imported:
            raise RuntimeError("Interchange import_asset meldete false")
        imported = []
    return list(imported or [])


def _is_expected_mesh(obj, expected):
    for cls in expected:
        try:
            if isinstance(obj, cls):
                return True
        except TypeError:
            pass
    return False


def _import_mesh(entry, args, warnings, fmt=None, allow_fallback=True):
    kind = entry.get("kind")
    name = entry.get("name")
    folder = KIND_FOLDERS.get(kind)
    if not folder:
        raise RuntimeError("Unbekannte Asset-Art %r fuer %r" % (kind, name))
    if not name:
        raise RuntimeError("Manifest-Eintrag ohne name")

    chosen = fmt or (args.character_format if kind == "character" else "glb")
    source_file = _asset_file(entry, chosen, args)
    fallback = False
    if source_file is None and kind == "character" and chosen == "fbx":
        source_file = _asset_file(entry, "glb", args)
        if source_file:
            warnings.append("%s: FBX fehlt, GLB-Fallback wird verwendet." % name)
            chosen = "glb"
            fallback = True
    if source_file is None:
        raise RuntimeError("%s: keine Quelldatei fuer Format %s" % (name, chosen))

    destination = "/Game/Wbn/Art/" + folder
    if args.dry_run:
        return {
            "name": name,
            "kind": kind,
            "format": chosen,
            "source": source_file,
            "destination": destination + "/" + name,
            "status": "planned",
        }

    try:
        imported = _interchange_import(source_file, destination, name)
        if not imported and not unreal.EditorAssetLibrary.does_asset_exist(destination + "/" + name):
            raise RuntimeError("%s: Interchange lieferte keine Objekte" % name)

        expected = (unreal.SkeletalMesh, unreal.StaticMesh) if kind == "character" else (unreal.StaticMesh,)
        has_expected = any(_is_expected_mesh(obj, expected) for obj in imported)
        object_paths = []
        for obj in imported:
            try:
                object_paths.append(obj.get_path_name())
                unreal.EditorAssetLibrary.save_loaded_asset(obj)
            except Exception as exc:  # noqa: BLE001
                warnings.append("%s: Objekt konnte nicht gespeichert werden: %s" % (name, exc))
        if not has_expected and imported:
            raise RuntimeError("%s: kein erwarteter Mesh-Typ unter %r" % (name, object_paths))
    except Exception as exc:  # noqa: BLE001
        if kind == "character" and chosen == "fbx" and allow_fallback:
            warnings.append("%s: FBX-Import fehlgeschlagen (%s); GLB-Fallback." % (name, exc))
            return _import_mesh(entry, args, warnings, fmt="glb", allow_fallback=False)
        raise

    target_exists = unreal.EditorAssetLibrary.does_asset_exist(destination + "/" + name)
    if not target_exists:
        warnings.append("%s: importiert, aber Zielpfad %s/%s nicht gefunden." % (name, destination, name))
    return {
        "name": name,
        "kind": kind,
        "format": chosen,
        "source": source_file,
        "destination": destination + "/" + name,
        "objects": object_paths,
        "status": "imported-fallback" if fallback else "imported",
    }


def _selected_record(record, only):
    if not only:
        return True
    # Kategorie (characters), Tabellenname (chars) und Alias (campaign) sind erlaubt.
    aliases = wbn_mapping.CATEGORY_SPECS.get(record["category"], {}).get("aliases", ())
    return (record["category"] in only or record.get("table") in only or
            bool(set(aliases) & only) or
            record["id"] in only or record["assetName"] in only)


def _selected_mesh(entry, only):
    if not only:
        return True
    return entry.get("name") in only or entry.get("kind") in only


def _write_report(path, report):
    try:
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, ensure_ascii=False)
        log("Report: " + path)
    except Exception as exc:  # noqa: BLE001
        error("Report konnte nicht geschrieben werden: %s" % exc)


def _parse_args():
    parser = argparse.ArgumentParser(description="Wiesbaden Survivors UE-Import")
    parser.add_argument("--repo-root", default=None,
                        help="Projektwurzel mit content/ und assets/ (Default: UE-Projektordner)")
    parser.add_argument("--data", default=None,
                        help="content/ue/data-records.json")
    parser.add_argument("--manifest", default=None,
                        help="assets/manifest.json")
    parser.add_argument("--assets-root", default=None,
                        help="Wurzel der Asset-Dateien (Default: <repo>/assets)")
    parser.add_argument("--character-format", choices=["fbx", "glb"], default="fbx")
    parser.add_argument("--only", default="", help="Kommagetrennte Kategorien/IDs/Asset-Namen")
    parser.add_argument("--skip-assets", action="store_true")
    parser.add_argument("--skip-data", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--report", default=None)
    args, _unknown = parser.parse_known_args()

    project_root = unreal.Paths.project_dir()
    args.repo_root = os.path.abspath(args.repo_root or project_root)
    args.data = os.path.abspath(args.data or os.path.join(
        args.repo_root, "content", "ue", "data-records.json"))
    args.manifest = os.path.abspath(args.manifest or os.path.join(
        args.repo_root, "assets", "manifest.json"))
    args.assets_root = os.path.abspath(args.assets_root or os.path.join(
        args.repo_root, "assets"))
    args.report = os.path.abspath(args.report or os.path.join(
        project_root, "Saved", "WbnImportReport.json"))
    args.only = {x.strip() for x in args.only.split(",") if x.strip()}
    return args


def main():
    args = _parse_args()
    warnings = []
    errors = []

    if not os.path.isfile(args.data):
        error("Datendatei fehlt: " + args.data)
        return 1
    payload = wbn_mapping.load_payload(args.data)
    validation = wbn_mapping.validate_payload(payload)
    if validation:
        for item in validation[:40]:
            error("Daten: " + item)
        if len(validation) > 40:
            error("Daten: ... und %d weitere" % (len(validation) - 40))
        return 1

    log("Daten: %s (%d Records, %s)" % (
        args.data, payload["total"],
        ", ".join("%s=%s" % (k, payload["counts"].get(k, 0))
                  for k in wbn_mapping.CATEGORY_ORDER)))
    if payload.get("campaign"):
        c = payload["campaign"]
        log("Kampagnenkategorie: %s Gegner, %s Bosse, %s Viertel, %s Wellen" %
            (c.get("enemies"), c.get("bosses"), c.get("districts"), c.get("totalWaves")))

    if args.validate_only:
        log("Validierung OK; keine Assets geschrieben.")
        return 0

    report = {
        "schema": "wbn-ue-import/1",
        "dryRun": bool(args.dry_run),
        "dataFile": args.data,
        "dataTotal": payload.get("total", 0),
        "data": {"created": 0, "updated": 0, "skipped": 0, "planned": 0},
        "campaign": {
            "records": (payload.get("campaign") or {}).get("enemies", 0),
            "mappingDecision": (payload.get("campaign") or {}).get("mappingDecision", ""),
        },
        "meshes": {"imported": 0, "fallback": 0, "planned": 0, "skipped": 0},
        "warnings": warnings,
        "errors": errors,
        "records": [],
        "meshResults": [],
    }

    if not args.skip_data:
        class_cache = {}
        for record in payload["records"]:
            if not _selected_record(record, args.only):
                report["data"]["skipped"] += 1
                continue
            campaign_info = None
            if record.get("campaign"):
                campaign_info = {
                    "archetype": record["campaign"].get("archetype"),
                    "districts": record["campaign"].get("districts", []),
                    "waves": record["campaign"].get("waves", []),
                    "variantOf": record["campaign"].get("variantOf"),
                }
            if args.dry_run:
                report["data"]["planned"] += 1
                entry = {
                    "assetName": record["assetName"],
                    "category": record["category"],
                    "path": _data_asset_path(record),
                    "status": "planned",
                }
                if campaign_info:
                    entry["campaign"] = campaign_info
                report["records"].append(entry)
                continue
            try:
                status, path = _upsert_data_asset(record, class_cache, warnings)
                report["data"][status] += 1
                entry = {
                    "assetName": record["assetName"],
                    "category": record["category"],
                    "path": path,
                    "status": status,
                }
                if campaign_info:
                    entry["campaign"] = campaign_info
                report["records"].append(entry)
            except Exception as exc:  # noqa: BLE001
                message = "%s (%s): %s" % (record.get("assetName"), record.get("id"), exc)
                errors.append(message)
                error("DataAsset: " + message)
                entry = {
                    "assetName": record.get("assetName"),
                    "category": record.get("category"),
                    "status": "failed",
                    "error": str(exc),
                }
                if campaign_info:
                    entry["campaign"] = campaign_info
                report["records"].append(entry)

    if not args.skip_assets:
        if not os.path.isfile(args.manifest):
            errors.append("Manifest fehlt: " + args.manifest)
            error("Manifest fehlt: " + args.manifest)
        else:
            with open(args.manifest, encoding="utf-8") as fh:
                manifest = json.load(fh)
            entries = manifest.get("assets") or []
            if args.character_format == "fbx" and not args.dry_run:
                _enable_fbx_interchange(warnings)
            for entry in entries:
                if not _selected_mesh(entry, args.only):
                    report["meshes"]["skipped"] += 1
                    continue
                try:
                    result = _import_mesh(entry, args, warnings)
                    status = result.get("status")
                    if status == "planned":
                        report["meshes"]["planned"] += 1
                    elif status == "imported-fallback":
                        report["meshes"]["fallback"] += 1
                        report["meshes"]["imported"] += 1
                    else:
                        report["meshes"]["imported"] += 1
                    report["meshResults"].append(result)
                except Exception as exc:  # noqa: BLE001
                    message = "%s: %s" % (entry.get("name"), exc)
                    errors.append(message)
                    error("Mesh: " + message)
                    report["meshResults"].append({
                        "name": entry.get("name"),
                        "kind": entry.get("kind"),
                        "status": "failed",
                        "error": str(exc),
                    })

    log("DataAssets: %d neu, %d aktualisiert, %d uebersprungen, %d geplant" % (
        report["data"]["created"], report["data"]["updated"],
        report["data"]["skipped"], report["data"]["planned"]))
    log("Meshes: %d importiert (%d Fallback), %d uebersprungen, %d geplant" % (
        report["meshes"]["imported"], report["meshes"]["fallback"],
        report["meshes"]["skipped"], report["meshes"]["planned"]))
    if warnings:
        log("Warnungen: %d" % len(warnings))
    if errors:
        error("Fehler: %d" % len(errors))
        for item in errors[:20]:
            error("  " + item)
    _write_report(args.report, report)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
