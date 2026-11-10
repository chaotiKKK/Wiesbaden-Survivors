from pathlib import Path

p = Path('docs/characters-32-2026-11-09.md')
s = p.read_text(encoding='utf-8')

pairs = [
    ("- **25/32 eindeutige Startwaffen** – Einarm-Willi teilt sich den Schraubenschlüssel bewusst mit dem Ingenieur, hat aber ein eigenes Ein-Slot-/T2-Loadout.",
     "- **32/32 eindeutige Startwaffen** – Einarm-Willi führt seit dem Arsenal-Pass eine eigene Nietpistole und behält sein Ein-Slot-/T2-Loadout."),
    ("| `einarm` | Einarm-Willi | Schraubenschlüssel (T2, 1 Slot) | `nietenhagel` – 360°-Salve, Stun, CD-Refund pro Treffer | keine |",
     "| `einarm` | Einarm-Willi | Nietpistole (T2, 1 Slot) | `nietenhagel` – 360°-Salve, Stun, CD-Refund pro Treffer | keine |"),
]
for old, new in pairs:
    if s.count(old) != 1:
        raise SystemExit(f'anchor missing: {old[:60]!r}')
    s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
print('updated characters doc start-weapon counts')
