# Credits und Lizenzen

Alles, was im Spiel steckt und nicht in diesem Projekt entstanden ist. Stand 2026-09-28;
die Belege stehen in `docs/kaykit-herkunft-lizenz-2026-09-28.md`.

| Was | Wo | Herkunft | Lizenz |
| --- | --- | --- | --- |
| Figuren Barbarian, Knight, Mage, Rogue, Hooded Rogue — als Sprite-Atlanten aus den 3D-Modellen gerendert | `CHAR_ATLAS_SRC` in `index.html` | [KayKit – Character Pack: Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0), Kay Lousberg ([kaylousberg.com](https://kaylousberg.com)) | CC0 1.0 |
| Figur Ranger — ebenso gerendert | `CHAR_ATLAS_SRC` in `index.html` | KayKit Adventurers 2.0, Kay Lousberg | laut Hersteller CC0; ob aus dem freien oder dem EXTRA-Tier, ist nicht geprüft |
| 36 Naturmotive im Props-Atlas: Bäume, Büsche, Steine, Gras, Pflanzen | `PROP_ATLAS_SRC` in `index.html` | [Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html), Quaternius | CC0 1.0 |
| Schrift Chakra Petch, Bold, als WOFF2-Teilmenge eingebettet | `@font-face` in `index.html` | Copyright 2018 The Chakra Petch Project Authors ([github.com/m4rc1e/Chakra-Petch](https://github.com/m4rc1e/Chakra-Petch)) | SIL Open Font License 1.1 — Volltext in [`licenses/OFL-ChakraPetch.txt`](licenses/OFL-ChakraPetch.txt) |

## Was die Lizenzen verlangen

- **CC0** verlangt nichts, auch keine Nennung. Wir nennen trotzdem, wie beide Hersteller
  darum bitten — im Spiel auf dem Optionen-Bildschirm und hier.
- **SIL OFL 1.1** verlangt, dass Copyright-Vermerk und Lizenztext der Schrift beiliegen,
  wo sie weitergegeben wird. Das Spiel gibt sie weiter, weil sie in `index.html`
  eingebettet ist; deshalb steht der Vermerk dort an der Schrift, und der Volltext wird
  mit der Seite veröffentlicht. Die Lizenz hat keinen „Reserved Font Name", die
  eingebettete Teilmenge darf den Namen behalten.

## Offen

- **Fünf Stadtmotive im Props-Atlas** (`Prop_ACUnit`, `Prop_Bollard`, `Prop_Drain`,
  `Prop_ManholeCover`, `Prop_Planter_Single`): Herkunft nicht geklärt.
- **Die Foto-Vorlagen der Figuren-Pipeline** (`kandidaten.html`, `parts.html`), aus denen
  die übrigen Pixel-Art-Figuren entstanden: Herkunft nicht geklärt. Zeigen sie echte
  Personen, braucht es deren Einverständnis.
- **Ranger:** Tier im Paket von Hand auf itch.io prüfen.

## Nicht in dieser Liste

Selbst erzeugt: die Soundeffekte (`tools/synth-audio.mjs`), die prozedurale Musik und die
Vektorgrafik von Gegnern, Bossen und Effekten. Dienste statt Assets: die STUN-Server von
Google und die öffentlichen MQTT-Broker für die Coop-Vermittlung. Nur im Trailer, nicht im
Spiel: die Sprachausgabe (Microsoft-TTS-Stimme „Hedda").

Das Projekt selbst steht bewusst unter keiner offenen Lizenz: Alle Rechte sind vorbehalten (Entscheidung vom 2026-09-28). Der Quelltext ist öffentlich einsehbar, eine Weiterverwendung ist aber nicht erlaubt.
