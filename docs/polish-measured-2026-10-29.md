# Polish-Loop messbar gemacht (2026-10-29)

GRADES spec=7 design=6 correctness=8 quality=7; biggest gap: kein echter Spieler-Input-Playtest — alle Bild-/Ton-Aussagen stammen aus Engine-Stepping (`Game.update`) und Pixel-/Offline-Render-Messungen, nicht aus gespielter Interaktion.

Ziel des Durchgangs war nicht mehr Politur, sondern **Beweisbarkeit**: der Polish-Loop
aus dem Vortag war strukturell gruen (Syntax, data-regression, `verify --no-browser`),
aber jede visuelle und auditive Aussage war unbelegt. Jetzt gibt es einen Browser,
der startet, und Messungen, die im Gate haengen.

## Teil A — Browser laeuft (ohne root)

Zwei getrennte Blocker, beide user-space geloest:

1. **Shared Libraries.** Ubuntu 24.04, kein root, leerer apt-Index. `ldd` auf dem
   vollen Chromium meldete 16 fehlende Bibliotheken. `tools/setup-browser.sh` holt
   die exakten `.deb`-Pfade aus dem `Packages.xz` der Distro (Codename aus
   `/etc/os-release`), entpackt sie mit `dpkg-deb -x` nach `$HOME/sysroot` und setzt
   `LD_LIBRARY_PATH` dorthin. Danach: **0 fehlende Bibliotheken**, beide Binaries
   (headless shell und volles Chrome).
2. **Font-Stack.** Der eigentliche Fallstrick: mit den reinen Grafik-Libs startet
   Chromium und malt das Canvas normal, legt aber **jeden Textknoten mit Hoehe 0**
   aus. `libfreetype`/`libfontconfig`/`libharfbuzz`/`libpixman`/`libpng` plus echte
   `.ttf` (`fonts-dejavu-core`, `fonts-liberation`) und eine eigene
   `fontconfig`-Datei im Sysroot beheben das. Beweis: eine Probediv mit
   `font:26px monospace` misst vorher **0 px**, nachher **30 px**, und
   `inner_text` liefert wieder den echten String.

Beides steckt jetzt vollstaendig in `tools/setup-browser.sh` (Paketliste inkl.
Font-Stack, `--add PKG [PKG…]` nimmt Listen, schreibt die fontconfig, `--env`
gibt `LD_LIBRARY_PATH` **und** `FONTCONFIG_FILE` aus, `--check` prueft Binaries
*und* ob ueberhaupt `.ttf` vorhanden sind).

## Drei Korrekturen an den Behauptungen des Vortags

Wichtig, weil zwei davon als "Defekt" durchgegangen waeren:

| Behauptung (2026-10-29 vormittags) | Messung | Wahrheit |
| --- | --- | --- |
| Master-Mix liegt bei −19,8 LUFS, 3,8 LU unter dem Ziel | `audioConformance()`: **−15,3 LUFS, Peak −4,0 dBFS, `inWindow: true`** | Der Mix ist im Zielband. Die −19,8 waren kein gueltiger Messwert; eine Gain-Anhebung waere hier ein **Fehler** gewesen (sie haette aus dem Band herausgefuehrt). |
| HUD-Mittelteil ist kollabiert (`#hudWave` Hoehe 0, "WELLE 1" unsichtbar) | Nach Font-Fix: `#hudWave` **26 px**, HUD liest "WELLE 6 · 38s", "MATERIAL/GEGNER/FPS/SEED" | Kein Spielfehler, sondern die fehlende Font-Kette. Ein "Fix" haette blind an gesundem Layout geschraubt. |
| Kritik-Vignette erreicht bei 7 % Leben nur `critVis 0.027` | Mit **lebendem** Spieler: `critVis 0.77`, Randrot **+12,8 / +20,6**, Mitte **+1,1** | Die Vignette funktioniert. Der 0.027-Wert stammte von einem bereits **toten** Spieler (`anyAlive === false` ⇒ `critWant = 0`). |

## Teil B — zwei Reparaturen, beide aus dem Bild begruendet

**1. Arena-Felder (`Level.draw`, Gift-/Tempofelder).** Sichtbar in allen Kaderframes:
flache Scheiben mit harter 2-px-Kante, die bei Ueberlappung ihre Deckkraft
addierten und als eine einzige grosse Waesche ueber dem Spielfeld lagen — es las
sich wie ein Debug-Overlay. Jetzt: gecachter Radialverlauf (voll bis 55 %,
dann Ausblendung zum Rand) plus **duenne, helle Kante bei exakt `r`**. Die
Grenze bleibt damit weiterhin pixelgenau ablesbar (wichtig: dort beginnt
Schaden), aber der flache Fleck ist weg. Kosten: ein Verlauf je Feld, einmal
gebaut (`f._g`), pro Bild unveraendert ein `arc` + `fill`.

**2. Minimap-Beschriftung (`renderMinimap`).** Die zwei Textzeilen wurden **vor**
Waenden und Gegnerpunkten gezeichnet; in Welle 20 lag "INNENSTADT / W20" mitten
in den Kartenmarkierungen und war unlesbar. Jetzt werden sie zuletzt gezeichnet,
auf einer halbtransparenten Kopfleiste (26 px) mit Trennlinie. Das Gate prueft
den Zustand nicht (Pixel-Layout), das Bild belegt ihn: Kopfzeile frei, Karte
darunter.

Nicht angefasst: die Vignette (gemessen funktionsfaehig), die HP-Leiste, das
Boss-Intro (die Doppelung aus grossem Canvas-Titel und Boss-Leiste ist bewusst
und nur waehrend des Intros sichtbar).

## Gate — was jetzt gemessen wird

`tools/pw_gate.py` (Chromium/Playwright) pinnt genau die Aussagen, die vorher
Behauptung waren:

| Check | Ergebnis dieses Laufs |
| --- | --- |
| `?selftest` Banner PASS | **Selftest 193/193 · PASS** |
| Assertion-Zahl ≥ 100 | 193 |
| Text wird ueberhaupt ausgelegt | `#hudWave` 26 px |
| Master-Mix im Band −16…−14 LUFS | **−15,3 LUFS** |
| True Peak ≤ −1 dBFS | **−4,0 dBFS** |
| Arena-Felder nutzen den gecachten Verlauf | `{n: 5, cached: true}` |
| Vignette faerbt den Rand | edge **+12,8**, right **+20,6** rot |
| Vignette laesst die Mitte lesbar | centre **+1,1** rot (160×160 px in der Bildmitte) |
| Konsolenfehler | 0 |

`11/11 checks passed`. Statische Beine auf demselben Stand:
`data-regression 22/22 PASS`, `verify.mjs --no-browser` → `VERIFY OK`.

## Browser-Bein laeuft ohne Edge (2026-11-08)

Der Grund fuer `FAIL browser — headless Edge did not start on CDP port …` war die
Aufloesung im Harness, nicht das Spiel:

1. `launchEdge()` startete das Binary mit der **Node-Umgebung**. Auf dieser Box
   fehlen darin `LD_LIBRARY_PATH` (Sysroot) und `FONTCONFIG_FILE`; Chromium starb
   vor `/json/version`, und der Fehler nannte nur den Port.
2. `playwrightBrowsers()` suchte `chromium-*/chrome-linux/chrome`. Aktuelle
   Playwright-Caches entpacken nach `chrome-linux64/`, das volle Binary wurde also
   nie gefunden.

**Aufloesungsreihenfolge** (Edge bleibt fuer Windows-Beitraege genau da, wo es
war — Fallback statt Ersatz):

1. `WBNS_BROWSER`, dann `CHROME_PATH`, dann `GAME_BROWSER`
2. Edge: `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, dann
   `C:/Program Files/Microsoft/Edge/Application/msedge.exe`
3. System-Chromium/-Chrome: `/usr/bin/chromium`, `/usr/bin/chromium-browser`,
   `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`
4. Playwright-Cache: `chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`,
   `chromium-*/chrome-linux64/chrome`, `chromium-*/chrome-linux/chrome`

Das Kind bekommt zusaetzlich die Umgebung aus `tools/setup-browser.sh --env`
(per bash ausgewertet, keine hartkodierten Pfade) und auf POSIX
`--no-sandbox --disable-dev-shm-usage`; stderr geht in ein Launch-Log, damit ein
Fehlschlag die letzten Zeilen nennt statt nur den Port.

Kommando auf dieser VM (unveraendert das dokumentierte Gate):

    node tools/verify.mjs

**Ergebnis: `VERIFY OK`, `COUNTS 93 pass / 0 fail / 0 skip`, Browser-Bein 21,5 s.**

| Bein | Gemessen |
| --- | --- |
| `?selftest` Urteil (textContent) | `Selftest 193/193 · PASS` in 4,8 s |
| BalanceSim 10k sync | 66 ms, 39 Waffen |
| BalanceSim 10k chunked | 7 Slices, max 10,8 ms, Paritaet OK |
| `?selftest&qa=1` QA-Nav Zweig | 193/193, Zeile sichtbar, alle Buttons im Ring |
| Praesentation: Mix-Loudness | **−15,3 LUFS** (Band −16…−14) |
| Praesentation: True Peak | **−4,0 dBFS** ≤ −1 dBTP |
| Praesentation: HUD-Text-Layout | `#hudWave` **26 px** |
| Praesentation: Arena-Felder | `{n:3, cached:true}` |
| Praesentation: Vignette am **lebenden** Spieler | `alive=true`, `critVis=0.766`, Rand **+17,9** rot |
| Praesentation: Mitte lesbar | **+0,5** rot |
| Konsolen-/Page-Fehler | 0 |
| Drossel 4x | engagiert (Kalibrierung x4), 26 Slices, max 19,8 ms, Paritaet OK |
| Drossel 6x | engagiert (Kalibrierung x6), 34 Slices, max 19,6 ms, Paritaet OK |

Die Messvertraege liegen jetzt **einmal** in `tools/lib/presentation.mjs` und
werden von `tools/verify.mjs` (Node/raw CDP) **und** `tools/pw_gate.py`
(Playwright) gelesen — die Python-Kopie ist weg, sie war die Quelle des
Fehlalarms vom Vortag. Ein Detail, das beide Pfade braucht: raw CDP evaluiert
einen *Ausdruck*, ein blankes `() => {…}` liefert dort eine Funktion und
`returnByValue` dann `undefined`; Playwright ruft die Funktion dagegen auf.
Deshalb gibt es `invoke()` fuer den CDP-Pfad.

**Offen:** Zuhoeren (alle Audio-Aussagen bleiben Render-Messungen) und echter
Eingabe-Playtest (Bewegung, Zielen, Treffergefuehl in Welle 20) — das Gate
beweist Praesentation und Engine-Vertraege, nicht Spielgefuehl.

**Weiterhin offen:** kein Zuhoeren (alle Audio-Aussagen sind Render-Messungen am
echten Bus-Graphen), kein echter Eingabe-Playtest (Bewegung, Zielen, Treffergefuehl
bei Welle 20), und der Frame-Cap ist unter Headless-Stepping nicht
aussagekraeftig (25–36 FPS in den Frames sind kein Performance-Urteil).
