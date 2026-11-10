/* AUTO-GENERATED from content/fuenf-viertel.json — do not edit by hand.
 * Run: node tools/build-fuenf-viertel.mjs
 * sha256: f6379109af629f91b6ff63c7ace04fbca9ec0a011bf4bc00b19e2dfa7c00efcf
 */
const FUENF_VIERTEL_DATA = {
  "schema": "wbn-fuenf-viertel/1",
  "status": "live",
  "engineWired": true,
  "campaign": {
    "name": "Fünf Viertel",
    "districts": 5,
    "wavesPerDistrict": 20,
    "totalWaves": 100,
    "bossWaves": [
      10,
      20
    ],
    "carryOver": {
      "hpPct": 35,
      "materialPct": 50
    },
    "scaling": {
      "hpPctPerDistrict": 12,
      "dmgPctPerDistrict": 8,
      "countPctPerDistrict": 4
    }
  },
  "note": "Live verdrahtet: data.js/index.html und die Engine konsumieren dieses Paket als Kampagne 5 Viertel × 20 Wellen (global 1–100).",
  "pending": [],
  "districts": [
    {
      "id": "kurpark",
      "name": "Kurpark",
      "order": 1,
      "arena": "kurpark",
      "desc": "Offene Rasenflächen, Pavillons und Teich: das Aufwärmviertel.",
      "modifiers": [
        "offene_flaechen",
        "giftfelder"
      ],
      "bosses": [
        "kurparkhueter",
        "thermalquelle"
      ],
      "waves": [
        {
          "wave": 1,
          "enemies": [
            "heckenhetzer",
            "runner",
            "swarm",
            "walker",
            "wuehlmaus"
          ],
          "count": 20,
          "elite": 0
        },
        {
          "wave": 2,
          "enemies": [
            "heckenhetzer",
            "kurpark_laurer",
            "swarm",
            "walker",
            "wuehlmaus"
          ],
          "count": 23,
          "elite": 0
        },
        {
          "wave": 3,
          "enemies": [
            "heckenhetzer",
            "tauben_schwarm",
            "brunnenegel",
            "walker",
            "wuehlmaus"
          ],
          "count": 25,
          "elite": 0
        },
        {
          "wave": 4,
          "enemies": [
            "heckenhetzer",
            "kiosk_raufer",
            "swarm",
            "walker",
            "wuehlmaus"
          ],
          "count": 27,
          "elite": 0
        },
        {
          "wave": 5,
          "enemies": [
            "heckenhetzer",
            "pumpwerk_kreisel",
            "wuehlmaus",
            "giftfrosch",
            "spitter",
            "tank"
          ],
          "count": 30,
          "elite": 0
        },
        {
          "wave": 6,
          "enemies": [
            "heckenhetzer",
            "runner",
            "swarm",
            "wuehlmaus",
            "giftfrosch",
            "libellenwache"
          ],
          "count": 32,
          "elite": 0
        },
        {
          "wave": 7,
          "enemies": [
            "matten_heiler",
            "swarm",
            "bomber",
            "gartenzwerg",
            "healer",
            "spliter"
          ],
          "count": 34,
          "elite": 0
        },
        {
          "wave": 8,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "libellenwache",
            "sentinel",
            "teichmolch"
          ],
          "count": 36,
          "elite": 0
        },
        {
          "wave": 9,
          "enemies": [
            "walker",
            "spitter",
            "tank",
            "bomber",
            "healer",
            "spliter"
          ],
          "count": 39,
          "elite": 0
        },
        {
          "wave": 10,
          "enemies": [
            "spitter",
            "tank",
            "bomber",
            "healer",
            "spliter",
            "siren"
          ],
          "count": 49,
          "elite": 0,
          "boss": "kurparkhueter"
        },
        {
          "wave": 11,
          "enemies": [
            "wuehlmaus",
            "giftfrosch",
            "bomber",
            "spliter",
            "sentinel",
            "siren"
          ],
          "count": 43,
          "elite": 1
        },
        {
          "wave": 12,
          "enemies": [
            "wuehlmaus",
            "giftfrosch",
            "bomber",
            "sentinel",
            "siren",
            "ghost"
          ],
          "count": 46,
          "elite": 1
        },
        {
          "wave": 13,
          "enemies": [
            "heckenhetzer",
            "wuehlmaus",
            "giftfrosch",
            "gartenzwerg",
            "teichmolch",
            "siren"
          ],
          "count": 48,
          "elite": 2
        },
        {
          "wave": 14,
          "enemies": [
            "heckenhetzer",
            "runner",
            "swarm",
            "libellenwache",
            "gartenzwerg",
            "teichmolch"
          ],
          "count": 50,
          "elite": 3
        },
        {
          "wave": 15,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "spitter",
            "libellenwache",
            "healer"
          ],
          "count": 53,
          "elite": 4
        },
        {
          "wave": 16,
          "enemies": [
            "walker",
            "spitter",
            "tank",
            "healer",
            "spliter",
            "ghost"
          ],
          "count": 55,
          "elite": 4
        },
        {
          "wave": 17,
          "enemies": [
            "tank",
            "bomber",
            "spliter",
            "sentinel",
            "siren",
            "ghost"
          ],
          "count": 57,
          "elite": 5
        },
        {
          "wave": 18,
          "enemies": [
            "heckenhetzer",
            "wuehlmaus",
            "giftfrosch",
            "bomber",
            "sentinel",
            "siren"
          ],
          "count": 59,
          "elite": 6
        },
        {
          "wave": 19,
          "enemies": [
            "heckenhetzer",
            "wuehlmaus",
            "giftfrosch",
            "libellenwache",
            "gartenzwerg",
            "teichmolch"
          ],
          "count": 62,
          "elite": 6
        },
        {
          "wave": 20,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "libellenwache",
            "gartenzwerg",
            "teichmolch"
          ],
          "count": 72,
          "elite": 7,
          "boss": "thermalquelle"
        }
      ]
    },
    {
      "id": "innenstadt",
      "name": "Innenstadt",
      "order": 2,
      "arena": "innenstadt",
      "desc": "Enge Gassen, Marktplätze und Gründerzeitfassaden.",
      "modifiers": [
        "enge_gassen",
        "sichtlinien"
      ],
      "bosses": [
        "kurhaus",
        "marktturm"
      ],
      "waves": [
        {
          "wave": 1,
          "enemies": [
            "fussgaengerfalle",
            "pflasterpirat",
            "runner",
            "swarm",
            "walker"
          ],
          "count": 24,
          "elite": 0
        },
        {
          "wave": 2,
          "enemies": [
            "fussgaengerfalle",
            "pflasterpirat",
            "runner",
            "swarm",
            "walker"
          ],
          "count": 27,
          "elite": 0
        },
        {
          "wave": 3,
          "enemies": [
            "fussgaengerfalle",
            "pflasterpirat",
            "runner",
            "swarm",
            "shooter"
          ],
          "count": 29,
          "elite": 0
        },
        {
          "wave": 4,
          "enemies": [
            "fussgaengerfalle",
            "pflasterpirat",
            "strassenbahn_schuetze",
            "exploder",
            "spinner"
          ],
          "count": 31,
          "elite": 0
        },
        {
          "wave": 5,
          "enemies": [
            "fussgaengerfalle",
            "pflasterpirat",
            "walker",
            "spinner",
            "marktstreicher",
            "weaver"
          ],
          "count": 34,
          "elite": 0
        },
        {
          "wave": 6,
          "enemies": [
            "fussgaengerfalle",
            "pflasterpirat",
            "walker",
            "marktstreicher",
            "weaver",
            "mortar"
          ],
          "count": 36,
          "elite": 0
        },
        {
          "wave": 7,
          "enemies": [
            "fussgaengerfalle",
            "pflasterpirat",
            "walker",
            "marktstreicher",
            "weaver",
            "schornsteinfeger"
          ],
          "count": 38,
          "elite": 0
        },
        {
          "wave": 8,
          "enemies": [
            "kuppel_krabbe",
            "spinner",
            "thermal_sirene",
            "mortar",
            "shielder",
            "taubenmeister"
          ],
          "count": 40,
          "elite": 0
        },
        {
          "wave": 9,
          "enemies": [
            "runner",
            "kurhaus_spiegel",
            "mirror",
            "shielded",
            "strassenbahngeist",
            "summoner"
          ],
          "count": 43,
          "elite": 0
        },
        {
          "wave": 10,
          "enemies": [
            "runner",
            "swarm",
            "nebelgeist",
            "shooter",
            "blinker",
            "litfasssaeule"
          ],
          "count": 53,
          "elite": 0,
          "boss": "kurhaus"
        },
        {
          "wave": 11,
          "enemies": [
            "fussgaengerfalle",
            "zollhaus_zwilling",
            "swarm",
            "walker",
            "elite",
            "juggernaut"
          ],
          "count": 47,
          "elite": 1
        },
        {
          "wave": 12,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "shooter",
            "exploder",
            "vampire"
          ],
          "count": 50,
          "elite": 1
        },
        {
          "wave": 13,
          "enemies": [
            "shooter",
            "exploder",
            "shielder",
            "shielded",
            "summoner",
            "elite"
          ],
          "count": 52,
          "elite": 2
        },
        {
          "wave": 14,
          "enemies": [
            "spinner",
            "shielded",
            "summoner",
            "blinker",
            "elite",
            "vampire"
          ],
          "count": 54,
          "elite": 3
        },
        {
          "wave": 15,
          "enemies": [
            "spinner",
            "mortar",
            "mirror",
            "blinker",
            "juggernaut",
            "vampire"
          ],
          "count": 57,
          "elite": 4
        },
        {
          "wave": 16,
          "enemies": [
            "pflasterpirat",
            "weaver",
            "mortar",
            "taubenmeister",
            "mirror",
            "juggernaut"
          ],
          "count": 59,
          "elite": 4
        },
        {
          "wave": 17,
          "enemies": [
            "pflasterpirat",
            "weaver",
            "schornsteinfeger",
            "taubenmeister",
            "strassenbahngeist",
            "litfasssaeule"
          ],
          "count": 61,
          "elite": 5
        },
        {
          "wave": 18,
          "enemies": [
            "fussgaengerfalle",
            "walker",
            "marktstreicher",
            "schornsteinfeger",
            "strassenbahngeist",
            "litfasssaeule"
          ],
          "count": 63,
          "elite": 6
        },
        {
          "wave": 19,
          "enemies": [
            "fussgaengerfalle",
            "runner",
            "swarm",
            "walker",
            "shooter",
            "marktstreicher"
          ],
          "count": 66,
          "elite": 6
        },
        {
          "wave": 20,
          "enemies": [
            "runner",
            "swarm",
            "shooter",
            "exploder",
            "shielder",
            "summoner"
          ],
          "count": 76,
          "elite": 7,
          "boss": "marktturm"
        }
      ]
    },
    {
      "id": "rheinufer",
      "name": "Rheinufer",
      "order": 3,
      "arena": "rheinufer",
      "desc": "Weite Uferpromenade, Pontons und treibendes Gut.",
      "modifiers": [
        "weite_sicht",
        "treibende_pontons"
      ],
      "bosses": [
        "nerobahn",
        "sirenkollektiv"
      ],
      "waves": [
        {
          "wave": 1,
          "enemies": [
            "flusspirscher",
            "runner",
            "swarm",
            "treibgutkrabbe",
            "walker"
          ],
          "count": 28,
          "elite": 0
        },
        {
          "wave": 2,
          "enemies": [
            "flusspirscher",
            "runner",
            "swarm",
            "treibgutkrabbe",
            "walker"
          ],
          "count": 31,
          "elite": 0
        },
        {
          "wave": 3,
          "enemies": [
            "flusspirscher",
            "runner",
            "treibgutkrabbe",
            "flyer",
            "shooter"
          ],
          "count": 33,
          "elite": 0
        },
        {
          "wave": 4,
          "enemies": [
            "flusspirscher",
            "runner",
            "swarm",
            "walker",
            "flyer"
          ],
          "count": 35,
          "elite": 0
        },
        {
          "wave": 5,
          "enemies": [
            "flusspirscher",
            "runner",
            "treibgutkrabbe",
            "rheinufer_bomber",
            "flyer",
            "shooter"
          ],
          "count": 38,
          "elite": 0
        },
        {
          "wave": 6,
          "enemies": [
            "flusspirscher",
            "hafen_moerser",
            "treibgutkrabbe",
            "deponie_drohne",
            "charger",
            "leech"
          ],
          "count": 40,
          "elite": 0
        },
        {
          "wave": 7,
          "enemies": [
            "flyer",
            "bruecken_rammer",
            "charger",
            "leech",
            "bomber",
            "werftdrohne"
          ],
          "count": 42,
          "elite": 0
        },
        {
          "wave": 8,
          "enemies": [
            "flyer",
            "shooter",
            "charger",
            "leech",
            "bomber",
            "pegelwaechter"
          ],
          "count": 44,
          "elite": 0
        },
        {
          "wave": 9,
          "enemies": [
            "flusspirscher",
            "treibgutkrabbe",
            "shooter",
            "bomber",
            "werftdrohne",
            "pegelwaechter"
          ],
          "count": 47,
          "elite": 0
        },
        {
          "wave": 10,
          "enemies": [
            "flyer",
            "shooter",
            "charger",
            "leech",
            "brueckenkette",
            "siren"
          ],
          "count": 57,
          "elite": 0,
          "boss": "nerobahn"
        },
        {
          "wave": 11,
          "enemies": [
            "flyer",
            "shooter",
            "charger",
            "leech",
            "bomber",
            "schleusenwaechter"
          ],
          "count": 51,
          "elite": 1
        },
        {
          "wave": 12,
          "enemies": [
            "treibgutkrabbe",
            "shooter",
            "bomber",
            "pegelwaechter",
            "brueckenkette",
            "siren"
          ],
          "count": 54,
          "elite": 1
        },
        {
          "wave": 13,
          "enemies": [
            "flusspirscher",
            "treibgutkrabbe",
            "werftdrohne",
            "pegelwaechter",
            "brueckenkette",
            "schleusenwaechter"
          ],
          "count": 56,
          "elite": 2
        },
        {
          "wave": 14,
          "enemies": [
            "flusspirscher",
            "runner",
            "swarm",
            "walker",
            "werftdrohne",
            "schleusenwaechter"
          ],
          "count": 58,
          "elite": 3
        },
        {
          "wave": 15,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "flyer",
            "charger",
            "leech"
          ],
          "count": 61,
          "elite": 4
        },
        {
          "wave": 16,
          "enemies": [
            "flyer",
            "shooter",
            "charger",
            "leech",
            "bomber",
            "siren"
          ],
          "count": 63,
          "elite": 4
        },
        {
          "wave": 17,
          "enemies": [
            "treibgutkrabbe",
            "shooter",
            "bomber",
            "pegelwaechter",
            "brueckenkette",
            "siren"
          ],
          "count": 65,
          "elite": 5
        },
        {
          "wave": 18,
          "enemies": [
            "flusspirscher",
            "treibgutkrabbe",
            "werftdrohne",
            "pegelwaechter",
            "brueckenkette",
            "schleusenwaechter"
          ],
          "count": 67,
          "elite": 6
        },
        {
          "wave": 19,
          "enemies": [
            "flusspirscher",
            "runner",
            "swarm",
            "walker",
            "werftdrohne",
            "schleusenwaechter"
          ],
          "count": 70,
          "elite": 6
        },
        {
          "wave": 20,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "flyer",
            "charger",
            "leech"
          ],
          "count": 80,
          "elite": 7,
          "boss": "sirenkollektiv"
        }
      ]
    },
    {
      "id": "neroberg",
      "name": "Neroberg",
      "order": 4,
      "arena": "neroberg",
      "desc": "Hang, Engstellen und der Monopteros als Bossbühne.",
      "modifiers": [
        "engstellen",
        "hoehenwind"
      ],
      "bosses": [
        "rogueki",
        "bergbahn"
      ],
      "waves": [
        {
          "wave": 1,
          "enemies": [
            "hangkletterer",
            "runner",
            "swarm",
            "walker",
            "weinbergwolf"
          ],
          "count": 32,
          "elite": 0
        },
        {
          "wave": 2,
          "enemies": [
            "hangkletterer",
            "runner",
            "swarm",
            "walker",
            "weinbergwolf"
          ],
          "count": 35,
          "elite": 0
        },
        {
          "wave": 3,
          "enemies": [
            "hangkletterer",
            "runner",
            "swarm",
            "walker",
            "weinbergwolf"
          ],
          "count": 37,
          "elite": 0
        },
        {
          "wave": 4,
          "enemies": [
            "hangkletterer",
            "runner",
            "swarm",
            "walker",
            "weinbergwolf"
          ],
          "count": 39,
          "elite": 0
        },
        {
          "wave": 5,
          "enemies": [
            "hangkletterer",
            "runner",
            "swarm",
            "walker",
            "weinbergwolf",
            "tank"
          ],
          "count": 42,
          "elite": 0
        },
        {
          "wave": 6,
          "enemies": [
            "hangkletterer",
            "runner",
            "swarm",
            "weinbergwolf",
            "tank",
            "charger"
          ],
          "count": 44,
          "elite": 0
        },
        {
          "wave": 7,
          "enemies": [
            "weinberg_bomber",
            "swarm",
            "walker",
            "weinbergwolf",
            "tank",
            "charger"
          ],
          "count": 46,
          "elite": 0
        },
        {
          "wave": 8,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "tank",
            "felsenlaurer",
            "sentinel"
          ],
          "count": 48,
          "elite": 0
        },
        {
          "wave": 9,
          "enemies": [
            "hangkletterer",
            "tank",
            "schiefer_waechter",
            "sentinel",
            "seilbahnschatten",
            "shielded"
          ],
          "count": 51,
          "elite": 0
        },
        {
          "wave": 10,
          "enemies": [
            "walker",
            "tank",
            "charger",
            "sentinel",
            "shielded",
            "monopteroswaechter"
          ],
          "count": 61,
          "elite": 0,
          "boss": "rogueki"
        },
        {
          "wave": 11,
          "enemies": [
            "runner",
            "weinbergwolf",
            "felsenlaurer",
            "seilbahnschatten",
            "elite",
            "juggernaut"
          ],
          "count": 55,
          "elite": 1
        },
        {
          "wave": 12,
          "enemies": [
            "hangkletterer",
            "schloss_koloss",
            "shielded",
            "monopteroswaechter",
            "ghost",
            "kuppelgeist"
          ],
          "count": 58,
          "elite": 1
        },
        {
          "wave": 13,
          "enemies": [
            "veilchengeist",
            "weinbergwolf",
            "felsenlaurer",
            "seilbahnschatten",
            "monopteroswaechter",
            "kuppelgeist"
          ],
          "count": 60,
          "elite": 2
        },
        {
          "wave": 14,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "tank",
            "felsenlaurer",
            "kuppelgeist"
          ],
          "count": 62,
          "elite": 3
        },
        {
          "wave": 15,
          "enemies": [
            "swarm",
            "walker",
            "tank",
            "elite",
            "juggernaut",
            "ghost"
          ],
          "count": 65,
          "elite": 4
        },
        {
          "wave": 16,
          "enemies": [
            "charger",
            "sentinel",
            "shielded",
            "elite",
            "juggernaut",
            "ghost"
          ],
          "count": 67,
          "elite": 4
        },
        {
          "wave": 17,
          "enemies": [
            "hangkletterer",
            "weinbergwolf",
            "charger",
            "sentinel",
            "shielded",
            "monopteroswaechter"
          ],
          "count": 69,
          "elite": 5
        },
        {
          "wave": 18,
          "enemies": [
            "hangkletterer",
            "weinbergwolf",
            "felsenlaurer",
            "seilbahnschatten",
            "monopteroswaechter",
            "kuppelgeist"
          ],
          "count": 71,
          "elite": 6
        },
        {
          "wave": 19,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "felsenlaurer",
            "seilbahnschatten",
            "kuppelgeist"
          ],
          "count": 74,
          "elite": 6
        },
        {
          "wave": 20,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "tank",
            "elite",
            "ghost"
          ],
          "count": 84,
          "elite": 7,
          "boss": "bergbahn"
        }
      ]
    },
    {
      "id": "rheingau",
      "name": "Rheingau",
      "order": 5,
      "arena": "rheingau",
      "desc": "Weinberg-Terrassen, Kellergänge und weite Ausblicke.",
      "modifiers": [
        "weinberg_terrassen",
        "weinfelder"
      ],
      "bosses": [
        "rheingaurebe",
        "kochbrunnen"
      ],
      "waves": [
        {
          "wave": 1,
          "enemies": [
            "rebenwuermer",
            "runner",
            "swarm",
            "terrassenhetzer",
            "walker"
          ],
          "count": 36,
          "elite": 0
        },
        {
          "wave": 2,
          "enemies": [
            "rebenwuermer",
            "runner",
            "swarm",
            "terrassenhetzer",
            "walker"
          ],
          "count": 39,
          "elite": 0
        },
        {
          "wave": 3,
          "enemies": [
            "rebenwuermer",
            "runner",
            "swarm",
            "terrassenhetzer",
            "walker"
          ],
          "count": 41,
          "elite": 0
        },
        {
          "wave": 4,
          "enemies": [
            "rebenwuermer",
            "runner",
            "swarm",
            "terrassenhetzer",
            "walker"
          ],
          "count": 43,
          "elite": 0
        },
        {
          "wave": 5,
          "enemies": [
            "rheingau_weber",
            "swarm",
            "walker",
            "korkengeist",
            "spitter",
            "weaver"
          ],
          "count": 46,
          "elite": 0
        },
        {
          "wave": 6,
          "enemies": [
            "runner",
            "swarm",
            "terrassenhetzer",
            "walker",
            "korkengeist",
            "mortar"
          ],
          "count": 48,
          "elite": 0
        },
        {
          "wave": 7,
          "enemies": [
            "runner",
            "swarm",
            "korkengeist",
            "healer",
            "spliter",
            "weinbergfalke"
          ],
          "count": 50,
          "elite": 0
        },
        {
          "wave": 8,
          "enemies": [
            "festungs_schild",
            "swarm",
            "terrassenhetzer",
            "korkengeist",
            "weinbergfalke",
            "fassroller"
          ],
          "count": 52,
          "elite": 0
        },
        {
          "wave": 9,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "spitter",
            "healer",
            "spliter"
          ],
          "count": 55,
          "elite": 0
        },
        {
          "wave": 10,
          "enemies": [
            "runner",
            "hexen_turm",
            "walker",
            "spitter",
            "healer",
            "rebenschlinger"
          ],
          "count": 65,
          "elite": 0,
          "boss": "rheingaurebe"
        },
        {
          "wave": 11,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "korkengeist",
            "rebenschlinger",
            "kellermeister"
          ],
          "count": 59,
          "elite": 1
        },
        {
          "wave": 12,
          "enemies": [
            "runner",
            "swarm",
            "korkengeist",
            "weinbergfalke",
            "rebenschlinger",
            "vampire"
          ],
          "count": 62,
          "elite": 1
        },
        {
          "wave": 13,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "spitter",
            "healer",
            "spliter"
          ],
          "count": 64,
          "elite": 2
        },
        {
          "wave": 14,
          "enemies": [
            "spitter",
            "weaver",
            "mortar",
            "healer",
            "spliter",
            "vampire"
          ],
          "count": 66,
          "elite": 3
        },
        {
          "wave": 15,
          "enemies": [
            "rebenwuermer",
            "weaver",
            "mortar",
            "fassroller",
            "kellermeister",
            "vampire"
          ],
          "count": 69,
          "elite": 4
        },
        {
          "wave": 16,
          "enemies": [
            "rebenwuermer",
            "terrassenhetzer",
            "korkengeist",
            "weinbergfalke",
            "fassroller",
            "kellermeister"
          ],
          "count": 71,
          "elite": 4
        },
        {
          "wave": 17,
          "enemies": [
            "runner",
            "swarm",
            "terrassenhetzer",
            "korkengeist",
            "weinbergfalke",
            "rebenschlinger"
          ],
          "count": 73,
          "elite": 5
        },
        {
          "wave": 18,
          "enemies": [
            "runner",
            "swarm",
            "walker",
            "spitter",
            "healer",
            "rebenschlinger"
          ],
          "count": 75,
          "elite": 6
        },
        {
          "wave": 19,
          "enemies": [
            "walker",
            "spitter",
            "weaver",
            "healer",
            "spliter",
            "vampire"
          ],
          "count": 78,
          "elite": 6
        },
        {
          "wave": 20,
          "enemies": [
            "rebenwuermer",
            "weaver",
            "mortar",
            "spliter",
            "kellermeister",
            "vampire"
          ],
          "count": 88,
          "elite": 7,
          "boss": "kochbrunnen"
        }
      ]
    }
  ],
  "modifiers": [
    {
      "id": "offene_flaechen",
      "district": "kurpark",
      "name": "Offene Flächen",
      "desc": "Weite Sicht, aber wenig Deckung; Gegner nutzen den Raum für schnelle Linien.",
      "effects": {
        "player": {
          "rangePct": 10
        },
        "enemy": {
          "speedPct": 5
        },
        "world": {
          "cover": 2
        }
      }
    },
    {
      "id": "giftfelder",
      "district": "kurpark",
      "name": "Giftfelder",
      "desc": "Teich- und Rasenflächen sind verseucht; Heilung fällt schwerer.",
      "effects": {
        "player": {
          "hpRegenPct": -10
        },
        "enemy": {
          "damagePct": 5
        },
        "world": {
          "hazard": "poison"
        }
      }
    },
    {
      "id": "enge_gassen",
      "district": "innenstadt",
      "name": "Enge Gassen",
      "desc": "Häuserschluchten nehmen Reichweite und geben Gegnern mehr Deckung.",
      "effects": {
        "player": {
          "rangePct": -8
        },
        "enemy": {
          "countPct": 10
        },
        "world": {
          "cover": 7
        }
      }
    },
    {
      "id": "sichtlinien",
      "district": "innenstadt",
      "name": "Sichtlinien",
      "desc": "Lange Fassadenachsen belohnen Krit, machen Fernkampf aber gefährlicher.",
      "effects": {
        "player": {
          "critPct": 5
        },
        "enemy": {
          "projectileSpeedPct": 12
        },
        "world": {
          "lineOfSight": true
        }
      }
    },
    {
      "id": "weite_sicht",
      "district": "rheinufer",
      "name": "Weite Sicht",
      "desc": "Die Uferpromenade gibt Reichweite, doch Projektile fliegen schneller.",
      "effects": {
        "player": {
          "rangePct": 12
        },
        "enemy": {
          "projectileSpeedPct": 8
        },
        "world": {
          "cover": 1
        }
      }
    },
    {
      "id": "treibende_pontons",
      "district": "rheinufer",
      "name": "Treibende Pontons",
      "desc": "Bewegliche Plattformen und Wasserlinien; Ausweichen wird belohnt.",
      "effects": {
        "player": {
          "dodgePct": 5
        },
        "enemy": {
          "speedPct": -3
        },
        "world": {
          "movingWalls": true,
          "hazard": "water"
        }
      }
    },
    {
      "id": "engstellen",
      "district": "neroberg",
      "name": "Engstellen",
      "desc": "Der Hang drückt den Kampf in schmale Wege; Gegner kommen schneller voran.",
      "effects": {
        "player": {
          "speedPct": -5
        },
        "enemy": {
          "speedPct": 8
        },
        "world": {
          "cover": 5
        }
      }
    },
    {
      "id": "hoehenwind",
      "district": "neroberg",
      "name": "Höhenwind",
      "desc": "Der Wind trägt eigene Projektile weiter, verlängert aber gegnerische Reichweite.",
      "effects": {
        "player": {
          "projectileSpeedPct": 10
        },
        "enemy": {
          "rangePct": 10
        },
        "world": {
          "height": true
        }
      }
    },
    {
      "id": "weinberg_terrassen",
      "district": "rheingau",
      "name": "Weinberg-Terrassen",
      "desc": "Steile Terrassen bremsen, dafür winken mehr Materialien.",
      "effects": {
        "player": {
          "speedPct": -6,
          "harvestPct": 10
        },
        "world": {
          "height": true
        }
      }
    },
    {
      "id": "weinfelder",
      "district": "rheingau",
      "name": "Weinfelder",
      "desc": "Reife Reben spenden Regeneration, ziehen aber zusätzliche Gegner an.",
      "effects": {
        "player": {
          "hpRegenPct": 10
        },
        "enemy": {
          "countPct": 5
        },
        "world": {
          "harvest": true
        }
      }
    }
  ],
  "enemies": [
    {
      "id": "wuehlmaus",
      "name": "Wühlmaus",
      "hp": 26,
      "dmg": 8,
      "spd": 132,
      "r": 12,
      "col": "#b58b5a",
      "xp": 3,
      "mat": 2,
      "ai": "burrower",
      "shape": "dot",
      "minW": 1,
      "w": 14,
      "pack": 1,
      "burrow": {
        "cd": 3.4,
        "range": 220
      }
    },
    {
      "id": "giftfrosch",
      "name": "Giftfrosch",
      "hp": 30,
      "dmg": 0,
      "spd": 96,
      "r": 13,
      "col": "#7dff9b",
      "xp": 4,
      "mat": 2,
      "ai": "ranged",
      "shape": "box",
      "minW": 5,
      "w": 12,
      "shot": {
        "dmg": 7,
        "spd": 180,
        "cd": 2.2,
        "range": 320,
        "col": "#7dff9b",
        "poison": 12
      }
    },
    {
      "id": "heckenhetzer",
      "name": "Heckenhetzer",
      "hp": 22,
      "dmg": 9,
      "spd": 156,
      "r": 11,
      "col": "#8fd46a",
      "xp": 3,
      "mat": 2,
      "ai": "chase",
      "shape": "tri",
      "minW": 1,
      "w": 15,
      "pack": 1
    },
    {
      "id": "teichmolch",
      "name": "Teichmolch",
      "hp": 44,
      "dmg": 11,
      "spd": 104,
      "r": 15,
      "col": "#39e6ff",
      "xp": 5,
      "mat": 3,
      "ai": "burrower",
      "shape": "worm",
      "minW": 8,
      "w": 10,
      "burrow": {
        "cd": 4,
        "range": 260
      }
    },
    {
      "id": "gartenzwerg",
      "name": "Gartenzwerg",
      "hp": 52,
      "dmg": 6,
      "spd": 54,
      "r": 14,
      "col": "#ffd23e",
      "xp": 5,
      "mat": 3,
      "ai": "commander",
      "shape": "cross",
      "minW": 7,
      "w": 9,
      "armor": 4,
      "buff": {
        "dmgP": 12,
        "spdP": 8,
        "r": 160
      }
    },
    {
      "id": "libellenwache",
      "name": "Libellenwache",
      "hp": 28,
      "dmg": 0,
      "spd": 120,
      "r": 12,
      "col": "#59e6ff",
      "xp": 4,
      "mat": 3,
      "ai": "sniper",
      "shape": "diamond",
      "minW": 6,
      "w": 10,
      "shot": {
        "dmg": 14,
        "spd": 420,
        "cd": 3.2,
        "range": 520,
        "warn": 0.8,
        "col": "#59e6ff"
      }
    },
    {
      "id": "pflasterpirat",
      "name": "Pflasterpirat",
      "hp": 38,
      "dmg": 10,
      "spd": 118,
      "r": 14,
      "col": "#c96be0",
      "xp": 5,
      "mat": 3,
      "ai": "trapper",
      "shape": "hex",
      "minW": 1,
      "w": 11,
      "trap": {
        "cd": 3,
        "r": 54,
        "dmg": 12,
        "life": 8
      }
    },
    {
      "id": "taubenmeister",
      "name": "Taubenmeister",
      "hp": 46,
      "dmg": 6,
      "spd": 86,
      "r": 13,
      "col": "#dcd0ff",
      "xp": 6,
      "mat": 4,
      "ai": "commander",
      "shape": "wing",
      "minW": 8,
      "w": 8,
      "buff": {
        "dmgP": 8,
        "spdP": 12,
        "r": 180
      }
    },
    {
      "id": "strassenbahngeist",
      "name": "Straßenbahngeist",
      "hp": 58,
      "dmg": 15,
      "spd": 96,
      "r": 17,
      "col": "#ffe27a",
      "xp": 6,
      "mat": 4,
      "ai": "charger",
      "shape": "box",
      "minW": 9,
      "w": 8,
      "armor": 3
    },
    {
      "id": "litfasssaeule",
      "name": "Litfaßsäule",
      "hp": 70,
      "dmg": 0,
      "spd": 24,
      "r": 18,
      "col": "#ff6a3d",
      "xp": 6,
      "mat": 4,
      "ai": "commander",
      "shape": "turret",
      "minW": 10,
      "w": 7,
      "armor": 6,
      "buff": {
        "dmgP": 0,
        "spdP": 0,
        "armor": 8,
        "r": 150
      }
    },
    {
      "id": "schornsteinfeger",
      "name": "Schornsteinfeger",
      "hp": 32,
      "dmg": 0,
      "spd": 110,
      "r": 12,
      "col": "#7f8ba3",
      "xp": 5,
      "mat": 3,
      "ai": "sniper",
      "shape": "tri",
      "minW": 7,
      "w": 9,
      "shot": {
        "dmg": 18,
        "spd": 460,
        "cd": 3.4,
        "range": 560,
        "warn": 1,
        "col": "#7f8ba3"
      }
    },
    {
      "id": "marktstreicher",
      "name": "Marktstreicher",
      "hp": 30,
      "dmg": 6,
      "spd": 140,
      "r": 12,
      "col": "#ffb0e0",
      "xp": 5,
      "mat": 3,
      "ai": "tether",
      "shape": "diamond",
      "minW": 5,
      "w": 12,
      "tether": {
        "range": 220,
        "slow": 0.35,
        "dps": 4,
        "break": 180
      }
    },
    {
      "id": "fussgaengerfalle",
      "name": "Fußgängerfalle",
      "hp": 24,
      "dmg": 4,
      "spd": 150,
      "r": 11,
      "col": "#ffd24a",
      "xp": 4,
      "mat": 2,
      "ai": "trapper",
      "shape": "dot",
      "minW": 1,
      "w": 13,
      "trap": {
        "cd": 2.4,
        "r": 46,
        "dmg": 8,
        "life": 6,
        "slow": 0.4
      }
    },
    {
      "id": "treibgutkrabbe",
      "name": "Treibgutkrabbe",
      "hp": 62,
      "dmg": 12,
      "spd": 88,
      "r": 16,
      "col": "#39e6ff",
      "xp": 6,
      "mat": 4,
      "ai": "burrower",
      "shape": "hex",
      "minW": 1,
      "w": 8,
      "armor": 5,
      "burrow": {
        "cd": 4.2,
        "range": 240
      }
    },
    {
      "id": "pegelwaechter",
      "name": "Pegelwächter",
      "hp": 40,
      "dmg": 0,
      "spd": 70,
      "r": 14,
      "col": "#7dffb0",
      "xp": 6,
      "mat": 4,
      "ai": "sniper",
      "shape": "eye",
      "minW": 8,
      "w": 8,
      "shot": {
        "dmg": 20,
        "spd": 380,
        "cd": 3.8,
        "range": 600,
        "warn": 1.1,
        "col": "#7dffb0"
      }
    },
    {
      "id": "brueckenkette",
      "name": "Brückenkette",
      "hp": 55,
      "dmg": 8,
      "spd": 92,
      "r": 16,
      "col": "#c7a6ff",
      "xp": 6,
      "mat": 4,
      "ai": "tether",
      "shape": "diamond",
      "minW": 10,
      "w": 7,
      "tether": {
        "range": 260,
        "slow": 0.45,
        "dps": 6,
        "break": 220
      }
    },
    {
      "id": "flusspirscher",
      "name": "Flusspirscher",
      "hp": 36,
      "dmg": 13,
      "spd": 148,
      "r": 13,
      "col": "#4a9fd8",
      "xp": 5,
      "mat": 3,
      "ai": "burrower",
      "shape": "tri",
      "minW": 1,
      "w": 11,
      "burrow": {
        "cd": 3.6,
        "range": 300
      }
    },
    {
      "id": "werftdrohne",
      "name": "Werftdrohne",
      "hp": 34,
      "dmg": 5,
      "spd": 150,
      "r": 12,
      "col": "#ffd24a",
      "xp": 5,
      "mat": 3,
      "ai": "bomber",
      "shape": "wing",
      "minW": 7,
      "w": 10,
      "fly": true,
      "mine": {
        "cd": 2.6,
        "fuse": 1.5,
        "r": 70,
        "dmg": 16
      }
    },
    {
      "id": "schleusenwaechter",
      "name": "Schleusenwächter",
      "hp": 80,
      "dmg": 10,
      "spd": 46,
      "r": 19,
      "col": "#9fb4d8",
      "xp": 7,
      "mat": 5,
      "ai": "commander",
      "shape": "brick",
      "minW": 11,
      "w": 6,
      "armor": 7,
      "buff": {
        "dmgP": 10,
        "spdP": 0,
        "armor": 8,
        "r": 170
      }
    },
    {
      "id": "hangkletterer",
      "name": "Hangkletterer",
      "hp": 48,
      "dmg": 14,
      "spd": 110,
      "r": 15,
      "col": "#ffb24a",
      "xp": 6,
      "mat": 4,
      "ai": "charger",
      "shape": "tri",
      "minW": 1,
      "w": 10
    },
    {
      "id": "monopteroswaechter",
      "name": "Monopteroswächter",
      "hp": 58,
      "dmg": 0,
      "spd": 64,
      "r": 15,
      "col": "#f4c25a",
      "xp": 7,
      "mat": 5,
      "ai": "sniper",
      "shape": "star",
      "minW": 10,
      "w": 7,
      "armor": 4,
      "shot": {
        "dmg": 24,
        "spd": 440,
        "cd": 4,
        "range": 640,
        "warn": 1.2,
        "col": "#f4c25a"
      }
    },
    {
      "id": "weinbergwolf",
      "name": "Weinbergwolf",
      "hp": 40,
      "dmg": 12,
      "spd": 162,
      "r": 13,
      "col": "#8fd46a",
      "xp": 5,
      "mat": 3,
      "ai": "chase",
      "shape": "tri",
      "minW": 1,
      "w": 12,
      "pack": 1
    },
    {
      "id": "seilbahnschatten",
      "name": "Seilbahnschatten",
      "hp": 42,
      "dmg": 9,
      "spd": 128,
      "r": 13,
      "col": "#dbe6ff",
      "xp": 6,
      "mat": 4,
      "ai": "tether",
      "shape": "diamond",
      "minW": 9,
      "w": 8,
      "tether": {
        "range": 240,
        "slow": 0.4,
        "dps": 5,
        "break": 200
      }
    },
    {
      "id": "felsenlaurer",
      "name": "Felsenlaurer",
      "hp": 66,
      "dmg": 11,
      "spd": 58,
      "r": 17,
      "col": "#7f8ba3",
      "xp": 6,
      "mat": 4,
      "ai": "trapper",
      "shape": "box",
      "minW": 8,
      "w": 8,
      "armor": 6,
      "trap": {
        "cd": 3.6,
        "r": 60,
        "dmg": 16,
        "life": 10
      }
    },
    {
      "id": "kuppelgeist",
      "name": "Kuppelgeist",
      "hp": 54,
      "dmg": 8,
      "spd": 100,
      "r": 14,
      "col": "#a06bff",
      "xp": 7,
      "mat": 5,
      "ai": "commander",
      "shape": "hex",
      "minW": 12,
      "w": 6,
      "buff": {
        "dmgP": 12,
        "spdP": 15,
        "r": 200
      }
    },
    {
      "id": "rebenwuermer",
      "name": "Rebenwürmer",
      "hp": 34,
      "dmg": 9,
      "spd": 120,
      "r": 13,
      "col": "#8fd46a",
      "xp": 4,
      "mat": 3,
      "ai": "burrower",
      "shape": "worm",
      "minW": 1,
      "w": 12,
      "burrow": {
        "cd": 3.2,
        "range": 230
      }
    },
    {
      "id": "kellermeister",
      "name": "Kellermeister",
      "hp": 90,
      "dmg": 12,
      "spd": 44,
      "r": 19,
      "col": "#7a3b2e",
      "xp": 8,
      "mat": 6,
      "ai": "commander",
      "shape": "box",
      "minW": 11,
      "w": 6,
      "armor": 8,
      "buff": {
        "dmgP": 15,
        "spdP": 0,
        "armor": 6,
        "r": 180
      }
    },
    {
      "id": "fassroller",
      "name": "Fassroller",
      "hp": 70,
      "dmg": 16,
      "spd": 84,
      "r": 18,
      "col": "#c0a06b",
      "xp": 7,
      "mat": 5,
      "ai": "charger",
      "shape": "gear",
      "minW": 8,
      "w": 8,
      "armor": 4
    },
    {
      "id": "terrassenhetzer",
      "name": "Terrassenhetzer",
      "hp": 44,
      "dmg": 11,
      "spd": 150,
      "r": 13,
      "col": "#ffb24a",
      "xp": 5,
      "mat": 3,
      "ai": "chase",
      "shape": "tri",
      "minW": 1,
      "w": 11,
      "pack": 1
    },
    {
      "id": "weinbergfalke",
      "name": "Weinbergfalke",
      "hp": 36,
      "dmg": 0,
      "spd": 160,
      "r": 12,
      "col": "#ffd23e",
      "xp": 6,
      "mat": 4,
      "ai": "sniper",
      "shape": "wing",
      "minW": 7,
      "w": 9,
      "fly": true,
      "shot": {
        "dmg": 16,
        "spd": 480,
        "cd": 3,
        "range": 520,
        "warn": 0.9,
        "col": "#ffd23e"
      }
    },
    {
      "id": "korkengeist",
      "name": "Korkengeist",
      "hp": 28,
      "dmg": 6,
      "spd": 116,
      "r": 12,
      "col": "#d4a373",
      "xp": 5,
      "mat": 3,
      "ai": "trapper",
      "shape": "cross",
      "minW": 5,
      "w": 11,
      "trap": {
        "cd": 2.8,
        "r": 50,
        "dmg": 10,
        "life": 7,
        "slow": 0.5
      }
    },
    {
      "id": "rebenschlinger",
      "name": "Rebenschlinger",
      "hp": 60,
      "dmg": 10,
      "spd": 76,
      "r": 16,
      "col": "#5dff9b",
      "xp": 7,
      "mat": 5,
      "ai": "tether",
      "shape": "worm",
      "minW": 10,
      "w": 7,
      "tether": {
        "range": 280,
        "slow": 0.5,
        "dps": 7,
        "break": 240
      }
    }
  ],
  "aiFamilies": [
    {
      "id": "burrower",
      "name": "Gräber",
      "status": "live",
      "desc": "Taucht unter, markiert den Spieler und bricht nach der Vorwarnung neben ihm hervor.",
      "counter": "Nach der Markierung den Standort wechseln; Flächenschaden am Zielort.",
      "params": [
        "burrow.cd",
        "burrow.range"
      ]
    },
    {
      "id": "trapper",
      "name": "Fallenleger",
      "status": "live",
      "desc": "Legt am Boden sichtbare Fallen, die verlangsamen oder Schaden zufügen.",
      "counter": "Fallen umgehen oder vor dem Auslösen zerstören; nicht im Stand kämpfen.",
      "params": [
        "trap.cd",
        "trap.r",
        "trap.dmg",
        "trap.life"
      ]
    },
    {
      "id": "tether",
      "name": "Kettengeist",
      "status": "live",
      "desc": "Verbindet sich mit dem Spieler und zieht Tempo sowie Leben, bis die Verbindung bricht.",
      "counter": "Abstand halten oder die Verbindung durch Bewegung/LOS brechen.",
      "params": [
        "tether.range",
        "tether.slow",
        "tether.dps",
        "tether.break"
      ]
    },
    {
      "id": "commander",
      "name": "Truppenführer",
      "status": "live",
      "desc": "Bleibt hinter der Linie und bufft Verbündete mit Schaden, Tempo oder Rüstung.",
      "counter": "Zuerst den Kommandanten fokussieren; der Buff endet mit ihm.",
      "params": [
        "buff.dmgP",
        "buff.spdP",
        "buff.armor",
        "buff.r"
      ]
    },
    {
      "id": "sniper",
      "name": "Präzisionsschütze",
      "status": "live",
      "desc": "Zielt mit langer Vorwarnung und einem sichtbaren Strahl auf einen Punkt.",
      "counter": "Die Vorwarnlinie verlassen; während der Zielphase ist der Schütze langsam.",
      "params": [
        "shot.dmg",
        "shot.spd",
        "shot.cd",
        "shot.range",
        "shot.warn"
      ]
    }
  ],
  "bosses": [
    {
      "id": "kurparkhueter",
      "district": "kurpark",
      "wave": 10
    },
    {
      "id": "thermalquelle",
      "district": "kurpark",
      "wave": 20
    },
    {
      "id": "kurhaus",
      "district": "innenstadt",
      "wave": 10
    },
    {
      "id": "marktturm",
      "district": "innenstadt",
      "wave": 20
    },
    {
      "id": "nerobahn",
      "district": "rheinufer",
      "wave": 10
    },
    {
      "id": "sirenkollektiv",
      "district": "rheinufer",
      "wave": 20
    },
    {
      "id": "rogueki",
      "district": "neroberg",
      "wave": 10
    },
    {
      "id": "bergbahn",
      "district": "neroberg",
      "wave": 20
    },
    {
      "id": "rheingaurebe",
      "district": "rheingau",
      "wave": 10
    },
    {
      "id": "kochbrunnen",
      "district": "rheingau",
      "wave": 20
    }
  ]
};
if (typeof window !== 'undefined') window.FUENF_VIERTEL_DATA = FUENF_VIERTEL_DATA;
if (typeof module !== 'undefined' && module.exports) module.exports = FUENF_VIERTEL_DATA;
