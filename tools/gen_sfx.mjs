// Wiesbaden Survivors — Sound-Generierung via ElevenLabs.
//
// Voraussetzung:  ELEVENLABS_API_KEY gesetzt  +  `npm i @elevenlabs/elevenlabs-js`
// Lauf:           node tools/gen_sfx.mjs            (nur fehlende Dateien)
//                 node tools/gen_sfx.mjs --force    (alles neu)
//                 node tools/gen_sfx.mjs ui saw     (nur Gruppen "ui","saw")
//
// Ausgabe: ./audio/<datei>.mp3  (mp3_44100_128)

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('audio');

// group | file | prompt | duration_seconds | loop | prompt_influence
const MANIFEST = [
  // --- Menü-Ambience (loopbarer Ersatz für die entfernte Piepstonmusik) ---
  ['ambience', 'menu_ambience', 'Calm retro synthwave pad drone, warm analog hum, distant night-city ambience, no melody, moody 1980s arcade, seamless loop', 18, true, 0.4],

  // --- UI-Sounds (kurz, hohe Prompt-Treue) ---
  ['ui', 'ui_click',   'Soft muted UI click, subtle retro digital blip, very short, clean', 0.4, false, 0.7],
  ['ui', 'ui_hover',   'Very soft UI hover tick, gentle short blip', 0.3, false, 0.7],
  ['ui', 'ui_confirm', 'Positive confirm chime, warm two-note retro UI accept', 0.6, false, 0.7],
  ['ui', 'ui_back',    'Soft cancel/back UI blip, gentle descending tone', 0.4, false, 0.7],

  // --- Kettensägen-Intro (Sebbos Auftritt) ---
  ['saw', 'saw_start', 'Chainsaw pull-start sputter then rev up to idle, gritty two-stroke engine', 1.8, false, 0.6],
  ['saw', 'saw_cut',   'Chainsaw revving high and tearing through wood and metal, aggressive', 1.6, false, 0.6],
  ['saw', 'screen_rip','Sharp tearing rip of material with debris shatter, cinematic whoosh transition', 1.0, false, 0.6],

  // --- Waffen: alle 42 einzeln (Datei = wpn_<id>.mp3, Prompt nach Name+Klasse) ---
  ['weapon', 'wpn_pistol',        'Dry crisp police pistol gunshot, single tight snap, arcade', 0.35, false, 0.6],
  ['weapon', 'wpn_smg',           'Rapid submachine gun burst, fast rattling shots', 0.45, false, 0.6],
  ['weapon', 'wpn_shotgun',       'Powerful pump-action shotgun blast, heavy boom', 0.55, false, 0.6],
  ['weapon', 'wpn_chaingun',      'Heavy rotating chaingun spin-up and brutal rapid fire', 0.6, false, 0.6],
  ['weapon', 'wpn_sniper',        'Sharp high-caliber sniper rifle shot with echo tail', 0.6, false, 0.6],
  ['weapon', 'wpn_medgun',        'Soft healing blaster pulse, warm sci-fi restorative chime', 0.5, false, 0.6],
  ['weapon', 'wpn_shredder',      'Shredding gun burst with metallic tearing and small blasts', 0.5, false, 0.6],
  ['weapon', 'wpn_knife',         'Quick sharp knife slash swoosh, thin metallic', 0.3, false, 0.6],
  ['weapon', 'wpn_spear',         'Spear thrust whoosh with solid impact thud', 0.4, false, 0.6],
  ['weapon', 'wpn_hammer',        'Heavy sledgehammer swing and crushing metal impact', 0.5, false, 0.6],
  ['weapon', 'wpn_wrench',        'Metal wrench swing and hard clang impact', 0.4, false, 0.6],
  ['weapon', 'wpn_schrauber',     'Impact wrench rapid pneumatic rattle burst', 0.45, false, 0.6],
  ['weapon', 'wpn_chopper',       'Heavy cleaver chop swoosh and deep meaty impact', 0.45, false, 0.6],
  ['weapon', 'wpn_nunchaku',      'Fast nunchaku whooshes with quick wooden clacks', 0.4, false, 0.6],
  ['weapon', 'wpn_flamer',        'Roaring flamethrower whoosh, continuous fire jet', 0.7, false, 0.6],
  ['weapon', 'wpn_railgun',       'Electromagnetic railgun charge and hyper-fast crack shot', 0.6, false, 0.6],
  ['weapon', 'wpn_plasma',        'Plasma cannon charged blast with sizzling energy burst', 0.55, false, 0.6],
  ['weapon', 'wpn_sonic',         'Sonic blaster pulse, deep resonant wobble wave', 0.5, false, 0.6],
  ['weapon', 'wpn_klingel',       'Bright bicycle bell ding with magical shimmer', 0.4, false, 0.6],
  ['weapon', 'wpn_loeschwasser',  'High-pressure fire-hose water jet spray blast', 0.6, false, 0.6],
  ['weapon', 'wpn_musiknoten',    'Musical note flurry, playful chiptune sparkle arpeggio', 0.5, false, 0.6],
  ['weapon', 'wpn_nagler',        'Nail gun rapid pneumatic thunk shots', 0.4, false, 0.6],
  ['weapon', 'wpn_schrottkanone', 'Scrap cannon firing junk metal, chaotic clanging blast', 0.55, false, 0.6],
  ['weapon', 'wpn_bierwerfer',    'Beer crate launcher thump with glass bottle smash', 0.55, false, 0.6],
  ['weapon', 'wpn_magnetmine',    'Magnetic mine attach click then sharp explosion', 0.6, false, 0.6],
  ['weapon', 'wpn_taubenschwarm', 'Flock of pigeons flapping wings and cooing burst', 0.5, false, 0.6],
  ['weapon', 'wpn_kettensaege',   'Chainsaw rev and cutting tear, gritty two-stroke engine', 0.6, false, 0.6],
  ['weapon', 'wpn_laserzirkel',   'Spinning laser compass beam, precise sci-fi hum sweep', 0.5, false, 0.6],
  ['weapon', 'wpn_blitzableiter', 'Lightning rod electric zap with crackling discharge', 0.5, false, 0.6],
  ['weapon', 'wpn_ratschlaege',   'Whispered advice voices with soft magical shimmer', 0.5, false, 0.6],
  ['weapon', 'wpn_gravgun',       'Gravity gun deep warping suck and heavy release thump', 0.6, false, 0.6],
  ['weapon', 'wpn_tesla',         'Tesla coil arcing electricity, buzzing high-voltage zap', 0.5, false, 0.6],
  ['weapon', 'wpn_frost',         'Frost cannon icy blast with crystalline freeze crackle', 0.55, false, 0.6],
  ['weapon', 'wpn_spore',         'Spore launcher wet pop and bursting organic cloud', 0.5, false, 0.6],
  ['weapon', 'wpn_photon',        'Photon rifle clean laser beam shot, bright sci-fi zap', 0.4, false, 0.6],
  ['weapon', 'wpn_arc',           'Arc thrower continuous electric arc, heavy crackling beam', 0.6, false, 0.6],
  ['weapon', 'wpn_needle',        'Needle gun rapid thin darts, sharp pneumatic hisses', 0.4, false, 0.6],
  ['weapon', 'wpn_vortex',        'Vortex cannon swirling air blast whoosh with implosion', 0.55, false, 0.6],
  ['weapon', 'wpn_starfall',      'Bow release twang with celestial star whoosh', 0.5, false, 0.6],
  ['weapon', 'wpn_leg_rheingold', 'Massive pipe-organ powered cannon volley, epic orchestral blast', 0.9, false, 0.6],
  ['weapon', 'wpn_leg_neroberg',  'Epic storm tempest blast, thunder and howling wind surge', 0.9, false, 0.6],
  ['weapon', 'wpn_leg_thermal',   'Thermal steam cannon, hissing pressurized blast with deep boom', 0.8, false, 0.6],
];

const exists = async (p) => { try { await access(p, constants.F_OK); return true; } catch { return false; } };

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('FEHLER: ELEVENLABS_API_KEY ist nicht gesetzt.');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const groups = args.filter((a) => !a.startsWith('--'));

  await mkdir(OUT, { recursive: true });
  const client = new ElevenLabsClient();

  const jobs = MANIFEST.filter(([g]) => groups.length === 0 || groups.includes(g));
  let ok = 0, skip = 0, fail = 0;

  for (const [group, file, text, duration, loop, pi] of jobs) {
    const dest = path.join(OUT, `${file}.mp3`);
    if (!force && (await exists(dest))) { console.log(`· skip  ${file} (existiert)`); skip++; continue; }
    try {
      const audio = await client.textToSoundEffects.convert({
        text,
        durationSeconds: duration,
        loop,
        promptInfluence: pi,
        outputFormat: 'mp3_44100_128',
      });
      // SDK liefert einen ReadableStream/AsyncIterable von Chunks.
      const chunks = [];
      for await (const c of audio) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      await writeFile(dest, Buffer.concat(chunks));
      console.log(`✓ ok    ${file}  (${group}, ${duration}s${loop ? ', loop' : ''})`);
      ok++;
    } catch (e) {
      console.error(`✗ FAIL  ${file}: ${e?.statusCode || ''} ${e?.message || e}`);
      fail++;
    }
  }
  console.log(`\nFertig: ${ok} erzeugt, ${skip} übersprungen, ${fail} fehlgeschlagen → ${OUT}`);
  if (fail) process.exit(2);
}

main();
