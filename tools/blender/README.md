# Blender-Pipeline (Asset-Pakete 1 + 2)

Erzeugt die 3D-Assets für den UE-5.8-Nachfolger prozedural. Kein GUI nötig,
alles läuft headless. Paket 1 umfasst 8 Assets, Paket 2 sieben weitere
(vier Props, zwei Fernkämpfer, ein Boss-Blockout) — zusammen 15.

## Einmalig einrichten

1. **Blender 4.5 LTS** nach `$HOME/tools` entpacken:

   ```bash
   URL=$(curl -s https://download.blender.org/release/Blender4.5/ \
     | grep -o 'blender-4\.5\.[0-9]*-linux-x64\.tar\.xz' | sort -uV | tail -1)
   curl -sL "https://download.blender.org/release/Blender4.5/$URL" -o /tmp/blender.tar.xz
   tar -xf /tmp/blender.tar.xz -C "$HOME/tools"
   ```

2. **Systembibliotheken** (Ubuntu 24.04, ohne Root). Blender braucht
   `libICE`, `libSM`, `libXfixes`, `libXi`, `libXrender`, `libxkbcommon`:

   ```bash
   mkdir -p "$HOME/tools/blender-libs" /tmp/debs
   curl -sL http://archive.ubuntu.com/ubuntu/dists/noble/main/binary-amd64/Packages.gz \
     | gunzip > /tmp/Packages
   for p in libice6 libsm6 libxfixes3 libxi6 libxrender1 libxkbcommon0; do
     fn=$(awk -v p="$p" 'BEGIN{RS="";FS="\n"} $1=="Package: " p {
       for(i=1;i<=NF;i++) if($i ~ /^Filename: /) print substr($i,11)}' /tmp/Packages | head -1)
     curl -sL "http://archive.ubuntu.com/ubuntu/$fn" -o "/tmp/debs/$p.deb"
     dpkg-deb -x "/tmp/debs/$p.deb" "$HOME/tools/blender-libs"
   done
   ```

3. **Umgebung** pro Shell setzen:

   ```bash
   export B=$HOME/tools/blender-4.5.15-linux-x64/blender
   export LD_LIBRARY_PATH=$HOME/tools/blender-libs/usr/lib/x86_64-linux-gnu
   ```

## Bauen

```bash
# alles: Exporte, .blend, Renders, Manifest
"$B" -b --factory-startup --python tools/blender/build_assetpack.py

# nur Exporte (schnell, ohne Cycles)
"$B" -b --factory-startup --python tools/blender/build_assetpack.py -- --skip-render

# Auswahl
"$B" -b --factory-startup --python tools/blender/build_assetpack.py -- --only SK_Sebbo,SM_Schlurfer

# Paket 2 komplett (Props, Fernkämpfer, Boss-Blockout)
"$B" -b --factory-startup --python tools/blender/build_assetpack.py -- \
  --only SM_KurparkPavillon,SM_Reiterstandbild,SM_WeinbergMauer,SM_RheinuferGelaender,SM_Schuetze,SM_Sentinel,SM_Boss_KurhausKoloss \
  --res 420 --samples 20

# Auflösung/Samples der Vorschau
"$B" -b --factory-startup --python tools/blender/build_assetpack.py -- --res 512 --samples 32

# Kontaktblatt eines Pakets aus den Renders
python3 tools/blender/contact_sheet.py --pack 2
```

Ausgabe: `assets/glb`, `assets/fbx`, `assets/blender`, `assets/renders`,
`assets/manifest.json` und `assets/manifest-pack2.json`. Das Skript legt die
Zielordner an, überschreibt nur die eigenen Dateien und führt bestehende
Manifest-Einträge zusammen; `.blend1`-Backups sind abgeschaltet.

## Prüfen

```bash
"$B" -b --factory-startup --python-exit-code 1 --python tools/blender/verify_assetpack.py
```

Lädt jedes GLB und FBX neu und prüft Mesh, Vertizes, Materialien, Armature und
Aktion. Erwartet **30 Dateien (15 Assets), 0 Fehler**. Zusätzlich: Manifest-
Abdeckung und Paket-2-Teilmenge, GLB/FBX-Signaturen, Maße nach Rückimport,
exakte Materialzahl, `UCX`-Collider für Props und Boss, quadratische Renders
sowie das Kontaktblatt.

## Aufbau des Skripts

- `reset()` — leere Szene, metrische Einheiten, 24 fps
- `mat()` / `srgb()` — flache Principled-Materialien mit sRGB→linear
- `box/cyl/cone/sphere/torus` — Grundkörper mit Bevel
- `join/origin_base/collider` — ein Mesh, Pivot auf dem Boden, `UCX_…_00`
- `export()` — GLB (`glTF 2.0`, Y-up) und FBX (−Z forward, Y up, Skin+Anim)
- `render()` — Cycles CPU, Sonne + Fläche, Welt dunkelgrau, 420 px
- `build_*()` — je Asset ein Aufbau; Maße in Metern, Palette aus `data.js`
- `ASSETS` — Name, Typ, Builder, Kamerarichtung
- `ASSET_META` — Paket, Rolle, `game_id`, `location_hint`, `blockout`
- `contact_sheet.py` — Kontaktblatt je Paket aus dem Manifest
- `verify_assetpack.py` — datengetriebene Rückimport-Prüfung (30 Dateien)

Die Figur wird starr geskinnt: jedes Bauteil bekommt vor dem Join eine
Vertex-Gruppe mit Gewicht 1 auf seinen Knochen. Das ist für Low-Poly bewusst
einfach und liefert saubere FBX-Skins; für spätere Figuren mit Gelenkbeugen
wird daraus ein Gewichts-Paint pro Mesh.
