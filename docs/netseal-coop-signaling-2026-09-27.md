# Abgedichtetes Coop-Signaling — Protokoll wbns2 (2026-09-27)

GRADES spec=8 design=5 correctness=8 quality=7; biggest gap: Raumcode-Schutz ruht auf 30 Bit Codeentropie — mit fixem Salz ist eine einmalige GPU-Tabelle denkbar

## Befund (Audit vom selben Tag)

Der Raumcode-Weg des Online-Coops lief im Klartext über zwei öffentliche Test-Broker
(`broker.emqx.io`, `test.mosquitto.org`):

- Topic `wbns/<RAUMCODE>/c2h|h2c` — wer `wbns/#` abonnierte, sah jeden offenen Raum.
- Payload: das komplette SDP nach abgeschlossenem ICE-Gathering. Da STUN (Google)
  konfiguriert ist, stand darin die **öffentliche IP** des Spielers.
- Folge: wer den Code sah, konnte per `hello` in fremde Räume einsteigen — der Host
  nimmt das erste `hello`.

## Umbau (index.html, `NetSeal` + `Net`)

Drei Schichten, ohne Klartext-Rückfall:

| Schicht | Mechanik | Wirkung |
| --- | --- | --- |
| Topic | `wbns2/<tag>/…`, tag = erste 128 Bit aus PBKDF2-SHA256(Code, 600.000 Iterationen) | Mithörer sieht Hex, keinen Raumcode |
| Umschlag | jede Nachricht AES-GCM, Schlüssel ebenfalls aus PBKDF2(Code), Richtung als AAD | ohne Code weder lesbar noch fälschbar; Fremdverkehr scheitert am Auth-Tag und wird still verworfen; kein Einsteigen ohne Code |
| SDP | zusätzlich AES-GCM unter HKDF(ECDH-P-256 ephemer, Salz = Code-Bindung) | auch wer den Code kennt oder später errechnet, liest das SDP nicht — der private Schlüssel verlässt den Browser nie |

Ablauf: Gast → `hello {id, pub}` · Host → `offer {to, pub, box}` · Gast → `answer {from, box}`.
Ohne WebCrypto scheitert der Raumcode-Weg sichtbar mit Hinweis auf den Offline-Weg.
PBKDF2 gemessen: 107 ms (Desktop, headless Chromium), ECDH 4 ms.

## Verifikation

- `node tools/verify.mjs` — 70 PASS, 0 FAIL; Selbsttest 164/164 unter `?qa` (+9 NetSeal-Assertions,
  einzeln geprüft: Tag-Format, Topic ohne Code, Determinismus, Roundtrip, Ablehnung von fremdem
  Schlüssel/falscher Richtung/manipulierten Bytes/Fremdverkehr, ECDH-Einigung, kein SDP für
  Code-Kenner, Draht ohne IP/Code/Kandidat, geöffneter Umschlag ohne IP).
- `tools/pw_netseal.py` (neu) — echter Verbindungsaufbau über den öffentlichen Broker, zwei
  Browser-Kontexte plus ein Mithörer, der **nur die Topics der eigenen Testsitzung** abonniert
  (kein Wildcard). 13/13, dreimal in Folge. Der Mithörer sah 3 versiegelte Nachrichten, 0 auf den
  alten Klartext-Topics, weder Code noch IP noch Kandidat; mit bekanntem Code öffneten sich nur
  die Umschläge. Kontrolle: das im Browser verbliebene SDP enthielt 12 Kandidatenzeilen mit IPs.
  mDNS-Maskierung ist im Probe bewusst abgeschaltet (strenger als echtes Chrome).
- `pw_recon`, `pw_walk` 23/23, `pw_vol_probe` 21/21, `pw_abuse` 29/29 — keine Nebenwirkungen.

## Was bleibt (ehrlich)

- **Broker- und STUN-Betreiber** sehen weiterhin die Verbindungs-IPs auf TCP/UDP-Ebene. Das ist
  unvermeidbar; geschützt ist, was *andere Abonnenten* mitlesen können.
- **Raumcode-Entropie:** 6 Zeichen aus 32 = 30 Bit. Einen einzelnen Raum live zu knacken kostet
  bei 600.000 Iterationen grob GPU-Stunden, der Raum ist höchstens 3 Minuten offen. Weil das Salz
  fix sein muss (der Gast kennt nur den Code), wäre eine einmalige Tabelle über alle Codes
  denkbar (grob ein GPU-Tag, ~16 GB) — damit ließen sich Codes erkennen und Räume betreten.
  **IPs bleiben auch dann geschützt** (ECDH). Gegenmittel, falls nötig: längere Codes. → umgesetzt am 2026-09-28, siehe Nachtrag.
- **Gecachte Altversionen** sprechen das alte Protokoll, bis der Spieler im Update-Toast
  „Neu laden" klickt. Alt und Neu finden sich nicht (Zeitüberschreitung, neue Fehlermeldung
  nennt den Grund). Dass dabei keine IP abfließt, ist aus dem Protokoll abgeleitet — ein SDP
  entsteht erst nach einem passenden Gegenüber —, aber nicht live nachgestellt.
- **Offline-Weg** unverändert: dort trägt der Spieler den Code selbst über einen Kanal seiner Wahl.

## Dateien

`index.html` (NetSeal, Net, Selbsttestgruppe `_netSeal`), `sw.js` (Cache-Stempel damals von Hand = sha1(index.html); seit 2026-09-28 stempelt ihn `tools/build-site.mjs`),
`tools/verify.mjs` (zwei Marker), `tools/pw_netseal.py` (neu).

## Nachtrag 2026-09-28: Raumcodes mit 8 Zeichen

Entscheidung des Projektinhabers: Die Codes wachsen von 6 auf 8 Zeichen (`NET_CODE_LEN = 8`).
Das Alphabet bleibt gleich (32 Zeichen, ohne I/O/0/1), das Protokoll `wbns2` ebenfalls.

- **Entropie:** 32^8 = 2^40 statt 2^30, also 1024-mal mehr Codes. Die Vorab-Tabelle über
  alle Codes würde statt grob eines GPU-Tages grob drei GPU-Jahre und rund 16 TB kosten.
  Einen einzelnen offenen Raum in seinen 3 Minuten zu erraten, ist damit aussichtslos.
- **Lesbarkeit:** Der Code wird in Vierergruppen angezeigt (`K7RM 2XQP`). `normCode`
  entfernt Leerzeichen und Bindestriche beim Eintippen, und das Eingabefeld nimmt bis
  zu 12 Zeichen mit Trennern an. „Code kopieren“ kopiert den Code ohne Trenner.
- **Gemischte Versionen:** Ein alter Client (6 Zeichen) findet einen neuen Host nicht,
  und ein neuer Client weist einen 6-stelligen Code mit Hinweis ab. Keiner der beiden
  Fälle leakt etwas, denn ohne passenden Tag entsteht kein SDP.
- **Gepinnt durch:** den Selftest `_netSeal` (Länge 8, Kürzen auf 8, Gruppierung
  hin und zurück), den Gate-Marker `const NET_CODE_LEN = 8;` und `pw_netseal` gegen
  den echten Broker, der unabhängig von der Länge prüft, dass der Code nie auf dem
  Draht erscheint.
