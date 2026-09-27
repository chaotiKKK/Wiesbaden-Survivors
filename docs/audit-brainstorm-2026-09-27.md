# Audit und Brainstorming (2026-09-27)

GRADES spec=7 design=5 correctness=7 quality=6; biggest gap: nichts davon ist live — der gesicherte Deploy hängt am Merge von #1 → #2 → #3

Das Audit entstand am Morgen, gemessen am Arbeitsbaum und am Live-System
(GitHub-API, `curl`), nicht aus Erinnerung. Mehrere Befunde wurden noch am
selben Tag angegangen; die Spalte **Stand** sagt, was davon wo liegt. Maßgeblich
für „live" ist allein, was über Pages ausgeliefert wird — und dort ist am Abend
noch nichts davon angekommen (gemessen: `kandidaten.html` antwortet weiterhin
mit HTTP 200).

## 1. Befunde

### Kritisch

| # | Befund | Beleg | Stand am Abend |
| --- | --- | --- | --- |
| K1 | **Online-Coop veröffentlichte die öffentliche IP jedes Spielers.** Das SDP ging nach abgeschlossenem ICE-Gathering im Klartext an die öffentlichen Test-Broker `broker.emqx.io` und `test.mosquitto.org`; mit Google-STUN enthielt es die öffentliche IP. Das Topic `wbns/<Raumcode>/…` machte jeden offenen Raum über `wbns/#` sichtbar und erlaubte uneingeladenes Beitreten per `hello`. | `NET_ICE`, `NET_BROKERS`, `Net.topic`/`Net.pub` in `index.html` | **Behoben, aber nicht committet.** Protokoll `wbns2` (NetSeal) im Haupt-Arbeitsbaum; 9 Selbsttests, `tools/pw_netseal.py` dreimal 13/13 über den echten Broker. Siehe `docs/netseal-coop-signaling-2026-09-27.md`. Live weiter offen. |
| K2 | **Keine CI, und ein Merge war ein Deploy.** Pages baute direkt aus `main/`; Gate und Suiten liefen nur, wenn jemand daran dachte. | kein `.github/workflows`; `gh pr checks`: „no checks" | **In PR #3 (offen).** Gate und sieben Playwright-Suiten bei jedem PR; Pages-Quelle auf GitHub Actions umgestellt (`build_type: workflow`); Deploy nur nach grünem Gate. Bis #3 auf `main` liegt, deployt nichts. |

### Hoch

| # | Befund | Beleg | Stand am Abend |
| --- | --- | --- | --- |
| H1 | **Zwölf Debug- und Vorschau-Dateien (rund 2,9 MB) öffentlich**, von nichts im Spiel verlinkt, seit dem Initial-Commit — darunter `kandidaten.html` und `parts.html` mit den Foto-Vorlagen der Figuren. | `curl` → HTTP 200 | **In PR #3.** Positivliste `tools/build-site.mjs` (28 Dateien); `tools/site-smoke.mjs` prüft, dass 138 getrackte Dateien außerhalb der Liste mit 404 antworten. Live noch 200. |
| H2 | **`AGENTS.md` steuerte Agenten mit falschen Fakten:** „one squashed commit, artifacts untracked", „Tables still inline", eine veraltete und verkehrt herum formulierte Assertion-Zählung. | `git rev-list`, `git ls-files`, Gate-FORBIDDEN-Liste | **Korrigiert** in diesem Durchgang (nicht committet), siehe Abschnitt 2. |
| H3 | **Zwei Browser-Teststacks ohne Verbindung:** Node + Edge + CDP (`verify.mjs`) und Python + Playwright (`pw_*`). „VERIFY OK" hieß nicht „alles grün". | `verify.mjs` ruft keine `pw_*`-Suite auf | **Teilweise.** Die CI (PR #3) führt beide aus; lokal bleiben sie getrennt. |
| H4 | **`pw_recon` galt als „Keeper", ohne eigenen Server** — lief nur, wenn zufällig etwas auf Port 8931 lauschte — und prüft nichts. | Standalone: `ERR_CONNECTION_REFUSED` | Server-Fix in `92c4589` (PR #2). Assertions fehlen weiterhin. |

### Mittel

| # | Befund | Stand |
| --- | --- | --- |
| M1 | **Keine Lizenzdatei.** Relevant für Steam, für externe Grafiker (Weg A) — und neu für die Frage, woher die `kaykit_*`-Figuren stammen (Abschnitt 2). | offen |
| M2 | **`docs/` ist ein Logbuch, keine Dokumentation:** 49 Pass-Protokolle, 224 KB, überwiegend mit 4/4/4/4 selbst bewertet; das README hat 1,9 KB. | offen — dieses Dokument ist ein weiteres Protokoll |
| M3 | 37 leere `catch`-Blöcke, 28 TODO/FIXME; 17 der 28 `.mjs`-Werkzeuge sind Einweg-Proben (`_`-Präfix). | offen |

### Im Lauf des Tages dazugekommen — von der CI gefunden

| # | Befund | Stand |
| --- | --- | --- |
| N1 | **Echter Fehler:** `AudioSys.lufsRender` isolierte `_irCache` nicht. Ein `ConvolverNode` lehnt eine Hall-Impulsantwort fremder Abtastrate ab — auf Geräten, die nicht mit 48 kHz laufen, war der QA-LUFS-Knopf kaputt, und ein Render vor dem Audio-Start hätte die Sitzung stumm gemacht. Erreichbar nur über `?qa`/`?selftest`, Spieler waren nicht betroffen. | behoben in `8f0abad` (PR #3), Regressionstest rot → grün |
| N2 | `pw_lufs` las einen Toast, der nur 2,6 s im DOM lebt, und verschleierte damit N1 („kein Toast"). | `410a3f2` (PR #3): zeichnet `UI.toast` auf |
| N3 | `pw_beatsync` las `musicStep` von außen per 5-ms-Timer und sah auf einer ausgelasteten Maschine 17 statt 16. | `4e06ddd` (PR #3): Schritt im Umschalt-Callback |
| N4 | **Der Throttle-Leg des Gates greift auf Hosted Runnern sporadisch nicht** (Kalibrierung 1,1 statt ≥ 1,4, auf demselben Image, auf dem er sonst mit ×4,4 greift; Läufe `36350749023` grün, `36351611118` rot). Seit der Deploy am Gate hängt, kann das Deployments grundlos blockieren. | **offen** |
| N5 | `pw_perf` ist schon lokal rot (30/31; p50 267 ms gegen eine 250-ms-Grenze unter sechsfacher Drosselung). | offen, bewusst nicht in der CI |
| N6 | `requestSwitch` ist im Objektliteral zweimal definiert; die spätere Definition gewinnt, Zeile 3840 ist toter Code. | offen, harmlos |

## 2. Korrekturen an eigenen Dokumenten

**UE-Plan** (`docs/ue58-portierungsplan-2026-09-16.md`) — in diesem Durchgang
korrigiert, im Plan selbst in Abschnitt 9 festgehalten:

- **Asset-Bestand.** Falsch war: „Die 66 PNGs sind ein paar Lauf-Sprites" und
  „das Spiel hat keine Sprites". Richtig ist: 57 animierte Pixel-Art-Sheets in
  `CHAR_SPR` (19 Figuren à `idle`/`walk`/`punch`, davon 16 spielbar), sechs
  Klassen-Atlanten in `CHAR_ATLAS_SRC` für die sechs `kaykit_*`-Figuren und ein
  Props-Atlas. **22 der 23 spielbaren Figuren** erscheinen als Pixel-Art; Sebbo
  hat keinen Atlas, sein Bildstreifen `SEBBO_SRC` ziert nur den Titel. Reine
  Vektorgrafik sind Gegner, Bosse, Effekte und Arenen. Die Wahl von Weg A bleibt
  unberührt; die Begründung gegen Paper2D ist neu gefasst.
- **KayKit.** Sechs Figuren tragen `kaykit_*`-IDs und nutzen die Atlanten
  `knight`, `mage`, `ranger`, `rogue`, `rogue_hooded`, `barbarian` — das deutet
  auf das KayKit-Adventurers-Paket, das es auch als 3D-Modelle gibt. Herkunft
  und Lizenz sind **nicht geprüft**.
- **Spielstand-Migration.** Der Plan schlug vor, den Base64-Weg aus `Net` umzubauen.
  Tatsächlich gibt es längst `Save.exportCode()`/`importCode()` mit dem Format
  `WS1:` + Base64(Save-JSON), eigenen Knöpfen im Spiel und einem Test in
  `pw_abuse`. Es fehlt nur der Importer im UE-Bau.
- **Testabdeckung.** „Rund 134 Assertions" war der Stand vom 2026-09-16; es sind
  rund 160, und die Suiten laufen in der CI.

Die Korrekturen liegen im Haupt-Arbeitsbaum. PR #1 trägt noch die alte Fassung,
bis sie auf den Branch `docs/ue58-port-plan` kommen.

**`AGENTS.md`** — Tabellenstand, Stempel-Regel samt CI-Prüfung, Assertion-Zählung,
Forensik-Vermerk („no remote at the time"), aktueller Git- und Pages-Stand, die
Playwright-Suite, die CI-Lehren des Tages, die NetSeal- und LUFS-Invarianten und
die Shell-Stolperfalle mit großen Heredocs. Neue Fakten tragen Datum und Status,
wo sie an offenen PRs hängen.

## 3. Brainstorming

### Solange das HTML-Spiel noch live ist

- **Signaling abdichten** — erledigt, liegt aber uncommittet im Arbeitsbaum (K1).
- **CI vor dem Deploy** — in PR #3 (K2).
- **Debug-Seiten von der Live-Seite** — in PR #3 (H1).
- *neu:* **Raumcodes verlängern.** Sechs Zeichen aus 32 sind 30 Bit; weil das
  Salz fest sein muss, wäre eine einmalige GPU-Tabelle über alle Codes denkbar.
  IPs schützt ECDH auch dann, Raumcodes nicht.
- *neu:* **Throttle-Leg robust machen** (N4), damit die Umgebung Deployments nicht
  grundlos blockiert.

### Erweiterung — was der Neubau ermöglicht

- **Wiesbaden als Stadtkarte.** Die Arenen sind schon echte Orte; mit Weg A kämen
  Neroberg samt Nerobergbahn, Wilhelmstraße, Biebricher Schloss und Rheinufer
  dazu, darüber eine Karte, auf der man Viertel zurückerobert. Das wäre eine
  räumliche Klammer über der vorhandenen Meta-Progression (Freischaltungen,
  Mastery, Ruhm-Perks).
- **Hessisch als Markenzeichen.** Die Figurensprüche füllen 773 Zeilen — vertont
  und im Dialekt hätte das kein anderer Survivors-Klon.
- **Tages-Seed mit Rangliste** (Steam oder Epic Online Services); den Seed gibt es schon.
- **Die Audio-Arbeit vom 11.09. wandert direkt mit:** das Takt-Raster ist, wofür
  UE **Quartz** gebaut ist; die Gefahrenkurve ist ein MetaSound-Parameter.
- **Mods über die Datenobjekte.** 207 Datensätze als DataAssets sind fast ein
  Mod-Format; der nächste Schritt wäre der Steam Workshop.
- **Coop zu viert** nur mit Nachweis aus der Balance-Simulation — die
  50-Gegner-Grenze und die Balance sind auf zwei Spieler gebaut.

### Umbau — über den Plan hinaus

- **Regelkern ohne Engine.** Schadensformeln, Spawnplan und Wirtschaft als reines
  C++-Modul, in Sekunden testbar, ohne den Editor zu starten.
- **Golden-Master-Parität — begonnen.** Im Worktree `ref/balance-reference` liegt
  ein Exporter (`tools/export-balance-reference.mjs`) samt Referenzdatei
  (`reference/balance-reference.json`, Schema `wbns-balance-reference/1`):
  42 Waffen × 4 Stufen, 23 Charaktere, 14 Aufsätze, 28 Gegner, 8 Bosse, getrennt
  in exakte Werte und Monte-Carlo-Werte mit Standardfehler; die Selbstprüfung
  lag bei max |z| 2,82 (Grenze 5). **Nicht committet**, und der Exportlauf
  dauerte 3 Minuten statt Sekunden — die Ursache ist ungeklärt.
- **Relay statt Direct-IP beim Release.** Steams Datagram Relay und das P2P-Relay
  von Epic Online Services verbergen Spieler-IPs grundsätzlich — die Lehre aus K1
  für die offene Frage der Sitzungsvermittlung im Plan.
- **Ein Baukasten für die Figuren** — gemeinsames Skelett, austauschbare Teile,
  dieselben Animationen; die Pixel-Art und die Foto-Vorlagen als Referenz.
  *Neu:* Bestätigt sich die KayKit-Herkunft samt Lizenz, sind sechs Figuren für
  Weg A fast fertig.
- **Barrierefreiheit als bekannten Verlust führen.** Das HTML-Spiel hat einen
  getesteten Screenreader-Kontrakt; UE bietet dafür deutlich weniger.

### Die Weiche, die vor Phase 1 fallen muss

**GAS oder eigener Regelkern?** Das Gameplay Ability System passt auf Waffen,
Items und Element-Reaktionen und ist für Mehrspieler vorbereitet; ein eigener
Kern ohne Engine ist isoliert testbar, gegen das HTML-Spiel prüfbar und später
für Replays nutzbar. Beides voll gleichzeitig geht nicht. Empfehlung: die
balancekritische Mathematik im eigenen Kern, GAS nur für Effekte, Tags und
Replikation.

## 4. Was als Nächstes zählt

1. **Stapel #1 → #2 → #3 mergen**, jeweils mit Merge-Commit. Erst dann wird
   irgendetwas hiervon live, und der gesicherte Deploy läuft zum ersten Mal.
2. **NetSeal auf den Stapel bringen** — die einzige Korrektur, die laufende
   Spieler direkt schützt.
3. **N4 beheben**, damit der Deploy nicht zufällig blockiert.
4. **Balance-Referenz abschließen** — Laufzeit klären, committen.
5. **PR #1 aktualisieren** mit den Plan-Korrekturen aus Abschnitt 2.
