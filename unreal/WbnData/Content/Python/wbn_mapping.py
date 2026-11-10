"""Reine Abbildung data.js + Fuenf-Viertel-Kampagne -> UE-DataAsset-Eigenschaften.

Dieses Modul importiert bewusst kein `unreal`: es laesst sich mit dem normalen
Python 3 vorpruefen, waehrend der Editor-Importer (wbn_ue_import.py) dieselben
Funktionen fuer die Asset-Erzeugung nutzt.

Quelle ist content/ue/data-records.json, erzeugt von tools/export-ue-data.mjs
aus der echten data.js und content/fuenf-viertel.json. Jeder Datensatz behaelt
sein vollstaendiges Quellobjekt in PayloadJson; die typisierten Felder decken
die Spielsysteme ab.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]

CATEGORY_SPECS = {
    "characters": {"table": "chars", "prefix": "DA_CHAR", "folder": "Characters", "dataClass": "WbnCharacterData"},
    "weapons": {"table": "weapons", "prefix": "DA_WEAPON", "folder": "Weapons", "dataClass": "WbnWeaponData"},
    "items": {"table": "items", "prefix": "DA_ITEM", "folder": "Items", "dataClass": "WbnItemData"},
    "enemies": {"table": "enemies", "prefix": "DA_ENEMY", "folder": "Enemies", "dataClass": "WbnEnemyData"},
    "arenas": {"table": "arenas", "prefix": "DA_ARENA", "folder": "Arenas", "dataClass": "WbnArenaData"},
    "bosses": {"table": "bosses", "prefix": "DA_BOSS", "folder": "Bosses", "dataClass": "WbnBossData"},
    "dangers": {"table": "dangers", "prefix": "DA_DANGER", "folder": "Dangers", "dataClass": "WbnDangerData"},
    "mods": {"table": "mods", "prefix": "DA_MOD", "folder": "Mods", "dataClass": "WbnModData"},
    "achievements": {"table": "achievements", "prefix": "DA_ACHIEVEMENT", "folder": "Achievements", "dataClass": "WbnAchievementData"},
    "campaignEnemies": {
        "table": "campaignEnemies", "prefix": "DA_CAMPAIGN_ENEMY", "folder": "CampaignEnemies",
        "dataClass": "WbnCampaignEnemyData",
        "aliases": ("campaign", "campaign_enemies", "campaign-enemies", "kampagne", "kampagnengegner"),
    },
}
CATEGORY_ORDER = list(CATEGORY_SPECS)
CAMPAIGN_KEY = "campaignEnemies"
KNOWN_CLASSES = {"gun", "heavy", "elemental", "precise", "support", "explosive",
                 "medieval", "primitive", "medical", "blade", "blunt"}
KNOWN_WEAPON_TYPES = {"projectile", "hitscan", "cone", "chain", "charge", "aura", "melee"}
ASSET_NAME_RE = re.compile(r"^DA_[A-Z]+_[A-Za-z0-9_]+$")


def load_payload(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _num(value, default=0.0):
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    return float(default)


def _int(value, default=0):
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return int(value)
    return int(default)


def _text(value):
    return "" if value is None else str(value)


def _num_map(value):
    """TMap<FName,float>: bool wird 1/0, Nicht-Zahlen bleiben im PayloadJson."""
    if not isinstance(value, dict):
        return {}
    out = {}
    for key, item in value.items():
        if isinstance(item, bool):
            out[str(key)] = 1.0 if item else 0.0
        elif isinstance(item, (int, float)):
            out[str(key)] = float(item)
    return out


def _json_text(value):
    if value is None:
        return ""
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def base_properties(record):
    fields = record.get("fields") or {}
    return {
        "record_id": _text(record.get("id")),
        "display_name": _text(record.get("displayName")),
        "category": _text(record.get("category")),
        "source_index": _int(record.get("sourceIndex")),
        "payload_json": _json_text(fields),
        "tags": [record.get("category", ""), record.get("table", "")],
    }


def _enemy_properties(f):
    behavior_keys = ("shot", "lob", "web", "beam", "drain", "mine", "slam", "wail",
                     "heal", "aura", "summon", "split", "boom", "blink", "radial",
                     "vamp", "reflect", "shieldArc", "noKnock", "pack", "burrow",
                     "buff", "trap", "tether")
    behavior = {k: f[k] for k in behavior_keys if k in f}
    return {
        "max_health": _num(f.get("hp")),
        "contact_damage": _num(f.get("dmg")),
        "move_speed": _num(f.get("spd")),
        "radius": _num(f.get("r")),
        "color_hex": _text(f.get("col")),
        "armor": _num(f.get("armor")),
        "xp_reward": _num(f.get("xp")),
        "material_reward": _num(f.get("mat")),
        "ai": _text(f.get("ai")),
        "shape": _text(f.get("shape")),
        "family": _text(f.get("family")),
        "flying": bool(f.get("fly")),
        "phasing": bool(f.get("phase")),
        "min_wave": _int(f.get("minW"), 1),
        "spawn_weight": _int(f.get("w")),
        "behavior_json": _json_text(behavior) if behavior else "",
    }


def properties_for(record):
    """Liefert die Python-Eigenschaftsnamen des passenden DataAsset-Typs."""
    props = base_properties(record)
    cat = record.get("category")
    f = record.get("fields") or {}

    if cat == "characters":
        ability = f.get("ability") or {}
        synergy = f.get("synergy") or {}
        props.update({
            "role": _text(f.get("role")),
            "description": _text(f.get("desc")),
            "primary_color": _text(f.get("col")),
            "secondary_color": _text(f.get("col2")),
            "start_weapon": _text(f.get("startWeapon")),
            "stats": _num_map(f.get("stats")),
            "ability_id": _text(ability.get("id")),
            "ability_name": _text(ability.get("name")),
            "ability_cooldown": _num(ability.get("cd")),
            "ability_description": _text(ability.get("desc")),
            "synergy_class": _text(synergy.get("cls")),
            "synergy_need": _int(synergy.get("need")),
            "synergy_stats": _num_map(synergy.get("stats")),
            "synergy_text": _text(synergy.get("text")),
            "unlock_json": _json_text(f.get("unlock")),
            "skin_json": _json_text(f.get("skin")),
            "profile_json": _json_text(f.get("profile")),
        })
    elif cat == "weapons":
        tiers = []
        for row in (f.get("tiers") or []):
            if not isinstance(row, list) or len(row) < 6:
                continue
            extras = row[6] if len(row) > 6 and isinstance(row[6], dict) else {}
            tiers.append({
                "damage": _num(row[0]),
                "attack_speed": _num(row[1]),
                "range": _num(row[2]),
                "crit_chance": _num(row[3]),
                "crit_multiplier": _num(row[4]),
                "price": _num(row[5]),
                "modifiers": _num_map(extras),
            })
        props.update({
            "weapon_classes": [_text(x) for x in (f.get("cls") or [])],
            "weapon_type": _text(f.get("type")),
            "color_hex": _text(f.get("col")),
            "scaling": _num_map(f.get("scaling")),
            "tiers": tiers,
            "special": _text(f.get("special")),
            "unlock_default": bool(f.get("unlockDefault")),
            "legendary": bool(f.get("legendary")),
            "unlock_json": _json_text(f.get("unlock")),
        })
    elif cat == "items":
        props.update({
            "rarity": _int(f.get("r"), 1),
            "price": _int(f.get("price")),
            "stats": _num_map(f.get("stats")),
            "flavor": _text(f.get("fl")),
            "cursed": bool(f.get("cursed")),
            "turret": bool(f.get("turret")),
            "thorns": _num(f.get("thorns")),
        })
    elif cat in ("enemies", CAMPAIGN_KEY):
        props.update(_enemy_properties(f))
        if cat == CAMPAIGN_KEY:
            campaign = record.get("campaign") or {}
            family = campaign.get("aiFamily") or {}
            props.update({
                "catalog_source": _text(campaign.get("source")),
                "archetype": _text(campaign.get("archetype") or f.get("ai")),
                "ai_family_name": _text(family.get("name")),
                "ai_family_description": _text(family.get("desc")),
                "ai_family_counter": _text(family.get("counter")),
                "ai_family_params": [_text(x) for x in (family.get("params") or [])],
                "campaign_districts": [_text(x) for x in (campaign.get("districts") or [])],
                "campaign_waves": [_int(x) for x in (campaign.get("waves") or [])],
                "district_wave_counts": {str(k): _int(v) for k, v in
                                         (campaign.get("districtWaveCounts") or {}).items()},
                "first_global_wave": _int(campaign.get("firstWave")),
                "last_global_wave": _int(campaign.get("lastWave")),
                "wave_count": _int(campaign.get("waveCount")),
                "standalone_campaign_enemy": bool(campaign.get("standalone", True)),
                "variant_of": _text(campaign.get("variantOf")),
            })
    elif cat == "arenas":
        props.update({
            "width": _num(f.get("w")),
            "height": _num(f.get("h")),
            "ground_color": _text(f.get("ground")),
            "grid_color": _text(f.get("grid")),
            "accent_color": _text(f.get("accent")),
            "theme": _text(f.get("theme")),
            "description": _text(f.get("desc")),
            "buildings": _int(f.get("buildings")),
            "cover": _int(f.get("cover")),
            "poison_fields": _int(f.get("poison")),
            "speed_fields": _int(f.get("speedField")),
            "moving_walls": _int(f.get("movingWalls")),
        })
    elif cat == "bosses":
        phases = []
        for phase in (f.get("phases") or []):
            phases.append({
                "at": _num(phase.get("at")),
                "speed": _num(phase.get("spd")),
                "pattern": _text(phase.get("pattern")),
                "cooldown": _num(phase.get("cd")),
                "count": _int(phase.get("n")),
                "bullet_speed": _num(phase.get("bs")),
                "bullet_damage": _num(phase.get("bd")),
                "summon_id": _text(phase.get("summon")),
            })
        props.update({
            "arena_id": _text(f.get("arena")),
            "max_health": _num(f.get("hp")),
            "radius": _num(f.get("r")),
            "color_hex": _text(f.get("col")),
            "move_speed": _num(f.get("spd")),
            "contact_damage": _num(f.get("dmg")),
            "armor": _num(f.get("armor")),
            "material_reward": _num(f.get("mat")),
            "xp_reward": _num(f.get("xp")),
            "phases": phases,
        })
    elif cat == "dangers":
        props.update({
            "level": _int(f.get("n")),
            "health_multiplier": _num(f.get("hp"), 1.0),
            "damage_multiplier": _num(f.get("dmg"), 1.0),
            "speed_multiplier": _num(f.get("spd"), 1.0),
            "count_multiplier": _num(f.get("cnt"), 1.0),
            "price_multiplier": _num(f.get("price"), 1.0),
            "description": _text(f.get("desc")),
        })
    elif cat == "mods":
        props.update({
            "color_hex": _text(f.get("col")),
            "description": _text(f.get("desc")),
        })
    elif cat == "achievements":
        props.update({
            "progress_key": _text(f.get("key")),
            "target": _int(f.get("need")),
            "description": _text(f.get("desc")),
        })
    return props


def asset_folder(record):
    spec = CATEGORY_SPECS.get(record.get("category"))
    return "/Game/Wbn/Data/" + (spec["folder"] if spec else "Unknown")


def validate_payload(payload):
    errors = []
    if payload.get("schema") != "wbn-ue-data/1":
        errors.append("Schema != wbn-ue-data/1")
    records = payload.get("records")
    if not isinstance(records, list) or not records:
        return errors + ["records fehlt oder ist leer"]

    counts = payload.get("counts") or {}
    actual = {}
    names = set()
    ids = {cat: set() for cat in CATEGORY_SPECS}
    by_cat = {cat: [] for cat in CATEGORY_SPECS}

    for index, rec in enumerate(records):
        if not isinstance(rec, dict):
            errors.append("Record %d ist kein Objekt" % index)
            continue
        cat = rec.get("category")
        if cat not in CATEGORY_SPECS:
            errors.append("Record %d: unbekannte Kategorie %r" % (index, cat))
            continue
        spec = CATEGORY_SPECS[cat]
        rid = rec.get("id")
        name = rec.get("assetName")
        if not rid:
            errors.append("Record %d ohne id" % index)
        if not name or not ASSET_NAME_RE.match(str(name)):
            errors.append("%s: ungueltiger assetName %r" % (rid, name))
        if name in names:
            errors.append("assetName doppelt: %s" % name)
        names.add(name)
        if rid in ids[cat]:
            errors.append("%s: id doppelt" % rid)
        ids[cat].add(rid)
        if rec.get("dataClass") != spec["dataClass"]:
            errors.append("%s: dataClass %r != %s" % (rid, rec.get("dataClass"), spec["dataClass"]))
        if rec.get("folder") != spec["folder"]:
            errors.append("%s: folder %r != %s" % (rid, rec.get("folder"), spec["folder"]))
        fields = rec.get("fields")
        if not isinstance(fields, dict):
            errors.append("%s: fields fehlt" % rid)
        if not rec.get("displayName"):
            errors.append("%s: displayName fehlt" % rid)
        actual[cat] = actual.get(cat, 0) + 1
        by_cat[cat].append(rec)

    expected_total = payload.get("total")
    if expected_total != len(records):
        errors.append("total %r != %d Records" % (expected_total, len(records)))
    for cat in CATEGORY_SPECS:
        if counts.get(cat) != actual.get(cat, 0):
            errors.append("counts.%s %r != %d" % (cat, counts.get(cat), actual.get(cat, 0)))
        if not by_cat[cat]:
            errors.append("Kategorie %s ist leer" % cat)

    weapon_ids = ids["weapons"]
    enemy_ids = ids["enemies"]
    arena_ids = ids["arenas"]

    for rec in records:
        fields = rec.get("fields") or {}
        rid = rec.get("id")
        cat = rec.get("category")
        if cat == "characters":
            if fields.get("startWeapon") not in weapon_ids:
                errors.append("char %s: startWeapon %r fehlt" % (rid, fields.get("startWeapon")))
            synergy = fields.get("synergy") or {}
            if synergy.get("cls") not in KNOWN_CLASSES:
                errors.append("char %s: synergy.cls %r unbekannt" % (rid, synergy.get("cls")))
        elif cat == "weapons":
            for cls in (fields.get("cls") or []):
                if cls not in KNOWN_CLASSES:
                    errors.append("weapon %s: Klasse %r unbekannt" % (rid, cls))
            if fields.get("type") not in KNOWN_WEAPON_TYPES:
                errors.append("weapon %s: Typ %r unbekannt" % (rid, fields.get("type")))
            if not fields.get("tiers"):
                errors.append("weapon %s: tiers fehlen" % rid)
        elif cat == "enemies":
            for ref in ((fields.get("summon") or {}).get("id"), (fields.get("split") or {}).get("id")):
                if ref and ref not in enemy_ids:
                    errors.append("enemy %s: Referenz %r fehlt" % (rid, ref))
        elif cat == "bosses":
            if fields.get("arena") not in arena_ids:
                errors.append("boss %s: Arena %r fehlt" % (rid, fields.get("arena")))
            for phase in (fields.get("phases") or []):
                if phase.get("summon") and phase["summon"] not in enemy_ids:
                    errors.append("boss %s: summon %r fehlt" % (rid, phase["summon"]))
        elif cat == CAMPAIGN_KEY:
            campaign = rec.get("campaign") or {}
            waves = campaign.get("waves") or []
            districts = campaign.get("districts") or []
            if campaign.get("source") != "content/fuenf-viertel.json":
                errors.append("campaign %s: unbekannte Quelle %r" % (rid, campaign.get("source")))
            if not campaign.get("standalone") or campaign.get("variantOf") is not None:
                errors.append("campaign %s: Variantenentscheidung inkonsistent" % rid)
            if not isinstance(waves, list) or not waves:
                errors.append("campaign %s: keine Wellenmetadaten" % rid)
            else:
                if campaign.get("waveCount") != len(waves):
                    errors.append("campaign %s: waveCount != %d" % (rid, len(waves)))
                if campaign.get("firstWave") != waves[0] or campaign.get("lastWave") != waves[-1]:
                    errors.append("campaign %s: first/lastWave inkonsistent" % rid)
                if len(set(waves)) != len(waves):
                    errors.append("campaign %s: doppelte Wellen" % rid)
                if any(not isinstance(w, int) or w < 1 or w > 100 for w in waves):
                    errors.append("campaign %s: Wellen ausserhalb 1..100" % rid)
            if not isinstance(districts, list) or not districts:
                errors.append("campaign %s: keine Viertelmetadaten" % rid)
            counts = campaign.get("districtWaveCounts") or {}
            if sum(counts.values()) != len(waves):
                errors.append("campaign %s: districtWaveCounts != Wellen" % rid)
            if campaign.get("archetype") != fields.get("ai"):
                errors.append("campaign %s: Archetyp != ai" % rid)
            family = campaign.get("aiFamily")
            if family and family.get("id") != fields.get("ai"):
                errors.append("campaign %s: AI-Familie != ai" % rid)
        elif cat == "items":
            if not (1 <= _int(fields.get("r")) <= 4):
                errors.append("item %s: Raritaet ausserhalb 1..4" % rid)
        if not isinstance(rec.get("sourceIndex"), int):
            errors.append("%s: sourceIndex fehlt" % rid)

    levels = sorted(_int((r.get("fields") or {}).get("n")) for r in by_cat["dangers"])
    if levels != list(range(len(levels))):
        errors.append("Gefahrenstufen nicht fortlaufend 0..n: %r" % levels)

    campaign_ids = ids[CAMPAIGN_KEY]
    overlap = ids["enemies"] & campaign_ids
    if overlap:
        errors.append("Kampagnen-IDs kollidieren mit data.js: %r" % sorted(overlap)[:5])
    summary = payload.get("campaign") or {}
    if summary.get("enemies") != len(by_cat[CAMPAIGN_KEY]):
        errors.append("campaign.enemies %r != %d" % (summary.get("enemies"), len(by_cat[CAMPAIGN_KEY])))
    if summary.get("records") != len(by_cat[CAMPAIGN_KEY]):
        errors.append("campaign.records %r != %d" % (summary.get("records"), len(by_cat[CAMPAIGN_KEY])))
    if summary.get("exactDuplicates"):
        errors.append("Kampagne meldet exakte Dubletten: %r" % summary["exactDuplicates"][:3])
    if not summary.get("mappingDecision"):
        errors.append("campaign.mappingDecision fehlt")

    stats = payload.get("statDefinitions")
    if not isinstance(stats, list) or len(stats) < 1:
        errors.append("statDefinitions fehlen")

    if payload.get("errors"):
        errors.append("Export meldet Fehler: %r" % payload["errors"][:3])
    return errors


def main():
    parser = argparse.ArgumentParser(description="Validiert content/ue/data-records.json und zeigt die Abbildung.")
    parser.add_argument("--data", default=str(ROOT / "content/ue/data-records.json"))
    parser.add_argument("--check", action="store_true", help="nur pruefen, Exit 1 bei Fehlern")
    parser.add_argument("--dump", type=int, default=0, help="N Datensaetze als Eigenschaften ausgeben")
    args = parser.parse_args()

    payload = load_payload(args.data)
    errors = validate_payload(payload)
    if errors:
        for err in errors[:40]:
            print("FAIL  " + err)
        if len(errors) > 40:
            print("FAIL  ... und %d weitere" % (len(errors) - 40))
        return 1

    if args.check:
        for rec in payload["records"]:
            properties_for(rec)

    counts = payload.get("counts", {})
    print("OK    %s | %d Datensaetze | %s" % (
        args.data, payload.get("total", 0),
        ", ".join("%s=%s" % (k, counts.get(k, 0)) for k in CATEGORY_ORDER)))
    print("      Asset-Namen eindeutig: %d | dataClasses: %d" % (
        len({r["assetName"] for r in payload["records"]}),
        len({r["dataClass"] for r in payload["records"]})))
    if payload.get("campaign"):
        c = payload["campaign"]
        print("      Kampagne: %s Gegner, %s Bosse, %s Viertel, %s Wellen (Kategorie campaignEnemies)" % (
            c.get("enemies"), c.get("bosses"), c.get("districts"), c.get("totalWaves")))
    for rec in payload["records"][:args.dump]:
        print("\n" + rec["assetName"] + " -> " + rec["dataClass"])
        print(json.dumps(properties_for(rec), ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
