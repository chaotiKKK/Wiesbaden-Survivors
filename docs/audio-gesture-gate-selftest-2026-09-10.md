# Gesten-Gate für Audio-Assets: Selftest-Gruppe + Loader-Sperre (2026-09-10)

Pass: eine Selftest-Gruppe (`AudioGestenGate`, `?selftest`), die den Gate
brechen lässt, sobald AudioSys-Assets auch nur **versucht** werden zu laden,
bevor der Spieler je eine echte Geste gegeben hat — plus einer
Produktänderung, die der Befund der Gruppe aufgedrängt hat.

## Neuer Vertrag (drei Ebenen in `SelfTest._audioGestureGate`)

1. **Zeitleiste (die Vertragszeile):** Fetch-Zeuge ab `run()`-Start; jede
   `audio/*.m4a`-Anfrage wird registriert und „höflich" blockiert (200 +
   8 Müll-Bytes → decode scheitert → Loader settelt über seinen echten
   Fehlerpfad — kein Netz, keine Bank-Einträge, kein Wedge). FAIL, wenn ein
   Versuch vor der ersten **trusted** Geste liegt.
2. **No-op-Ebene:** `prefetchAssets()` ohne `started` ändert nichts
   (loading/ready bleiben false, null Fetch-Versuche).
3. **Sperrnotwendigkeit:** unter Fake-Geste (`started = true`) laufen exakt
   21 Versuche — die Sperre ist die einzige Barriere und der Zeuge sieht
   sie; Restore-before-assert (`started/loading/ready`).

„Geste" ist dabei die Plattform-Definition: **`isTrusted === true`**
(pointerdown/keydown/touchstart, capture). Synthetische
`dispatchEvent`-Pokes der eigenen Suite zählen bewusst NICHT.

## Produktbefund der Gruppe (kein Selbstzweck)

Erster Lauf: alle 21 Fetch-Versuche VOR der ersten Geste, Stack:
`_tabFocusSync` versendet synthetische Key-Events → Input-Handler ruft
`AudioSys.init()` → Loader feuert. Für echte Spieler harmlos (nur trusted
Events öffnen den Context), aber ein zweiter, direkter Aufrufer von
`prefetchAssets()` hätte die Sperre umgehen können — die Guards lagen nur
im Aufrufer `init()`, nicht im Loader. Fix: **`prefetchAssets()` selbst
prüft jetzt `started`** (zweite Sperre am Loader). Damit ist der Vertrag
selbst-durchsetzend, nicht nur beobachtet.

## Instrumentierungs-Details, die sonst niemand zweimal finded

- Blockieren mit „nie aufgelöstem Promise" wedged den Loader
  (`_assetsLoading` bleibt true — der Settle-Counter zählt nur Abschlüsse).
  Höflich-Blockieren (200 + Mist) lässt ihn sauber durch den catch-Pfad.
- `_tabFocusSync` init' Audio mitten in der Suite — „Suite-Ende ist
  vor-Geste" ist als Annahme unbrauchbar; deshalb isTrusted-Definition.
- Restore-first in jeder Ebene; nach `_disarmAudioGateProbes()` ist die
  Seite uninstrumentiert (fetch/init/Listener Origins zurück).

## Stand

- ?selftest: 4 neue Zeilen, alle PASS; 141 Assertions gesamt, 0 FAIL.
- ?selftest&qa=1: 138/138 grün (kein Interferenzkonflikt mit QA-Nav).
- index.html geändert → sw.js neu gestempelt (wbns-89a8818d…).
- Gates: data-regression 22/22, verify.mjs VERIFY OK (Browser + statisch).
