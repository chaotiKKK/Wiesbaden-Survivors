#!/usr/bin/env node
//
// Wiesbaden Survivors — game SFX synthesis (ffmpeg, zero npm deps).
//
// Generates the starter sample set for AudioSys' external-asset path
// (AudioSys.prefetchAssets). Every role name here MUST exist in
// BAKE_SLOT (index.html) — data-regression enforces that.
//
// Output: audio/<role>.m4a — AAC 48 kHz stereo, loudness-normalized,
// true-peak limited. AAC keeps each cue in the 2-14 KB range and decodes on
// every engine the project targets; raw WAV would be ~50x that per file.
//
// These are fully synthesized sounds designed per role from the gameplay
// meaning (guns = layered noise blast + sub thump, pickups = arpeggio,
// UI = short blip). The in-engine synth fallback remains for file:// play
// and as pre-bake bridge — assets only *replace* baked synth samples.
//
// Usage: node tools/synth-audio.mjs [--out audio]

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { repoRoot, argOf } from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const OUT_DIR = path.resolve(ROOT, argOf(process.argv.slice(2), '--out', 'audio'));

// Graph DSL: each source is a full lavfi chain (mono, 44.1 kHz). `mix` is
// applied AFTER the sources are summed — per-source timing lives in the
// source chain (adelay), never in `mix` (amix takes N inputs; anything
// chained before it in a multi-input graph is a filter-graph error).
const SR = 44100;
// ffmpeg's duration parser rejects leading-dot numbers (".08") and `sine`
// has no amplitude option — hence toFixed everywhere and volume= for gain.
const num = (v) => (typeof v === 'number' ? v.toFixed(4) : v); // '#D#' stays literal, filled later
const noise = (a, d) => `anoisesrc=c=white:r=${SR}:a=${num(a)}:d=${num(d)}`;
const tone = (f, a, d) => `sine=f=${num(f)}:r=${SR}:d=${num(d)},volume=${num(a)}`;
const decay = (d, st = 0) => `afade=t=out:st=${num(st)}:d=${num(d)}:curve=exp`;

// [role, seconds, design, sources[], mix]
const SFX = [
  // ---- weapons ----
  ['w_pistol', 0.8, 'sharp shot: bandpassed crack 2.5k + 62 Hz sub thump', [
    `${noise(.9, '#D#')},highpass=f=650,lowpass=f=2500,${decay(.28)}`,
    `${tone(62, .8, .16)},${decay(.13, .02)}`,
  ], 'amix=inputs=2:normalize=0'],

  ['w_smg', 0.7, 'compact burst: tighter crack, less sub, mechanical', [
    `${noise(.85, '#D#')},highpass=f=900,lowpass=f=3200,${decay(.18)}`,
    `${tone(75, .55, .10)},${decay(.09, .01)}`,
  ], 'amix=inputs=2:normalize=0'],

  ['w_shotgun', 1.1, 'wide boom: two noise layers + heavy sub, long decay', [
    `${noise(.9, '#D#')},lowpass=f=1100,${decay(.9, .02)}`,
    `${noise(.7, '#D#')},bandpass=f=300:w=250,${decay(.5)}`,
    `${tone(52, .9, .30)},${decay(.27, .03)}`,
  ], 'amix=inputs=3:normalize=0'],

  ['w_railgun', 1.0, 'charge riser then thick zap + metallic ring', [
    `${tone(200, .55, .35)},afade=t=in:st=0:d=0.30,asetrate=26460,aresample=${SR}`,
    `${noise(.8, '#D#')},bandpass=f=1800:w=900,${decay(.75, .05)},adelay=350`,
    `${tone(2600, .25, .5)},${decay(.45, .05)},adelay=350`,
  ], 'amix=inputs=3:normalize=0'],

  ['w_plasma', 0.35, 'sci-fi zap: pitch-folded sine slide + wet attack', [
    `${tone(900, .8, '#D#')},asetrate=22050,aresample=${SR},${decay(.25, .05)}`,
    `${noise(.3, '#D#')},bandpass=f=1200:w=600,${decay(.2)}`,
  ], 'amix=inputs=2:normalize=0'],

  ['w_tesla', 0.22, 'electric snap: 3k crackle + 110 Hz buzz, ultra short', [
    `${noise(.9, '#D#')},highpass=f=3000,${decay(.14)}`,
    `${tone(110, .6, .12)},${decay(.12)}`,
  ], 'amix=inputs=2:normalize=0'],

  // ---- impacts ----
  ['hit', 0.35, 'body hit: 900 Hz thud burst + 180 Hz body', [
    `${noise(.8, '#D#')},lowpass=f=900,${decay(.22)}`,
    `${tone(180, .6, .10)},${decay(.10)}`,
  ], 'amix=inputs=2:normalize=0'],

  ['crit', 0.46, 'crit: hit + bright 1.8k ping with shimmer tail', [
    `${noise(.75, '#D#')},lowpass=f=900,${decay(.2)}`,
    `${tone(1800, .5, .35)},${decay(.32, .03)}`,
    `${tone(2700, .2, .30)},${decay(.25, .05)}`,
  ], 'amix=inputs=3:normalize=0'],

  ['hitMelee', 0.5, 'melee connect: woody 210 Hz knock + 800 Hz slap', [
    `${tone(210, .85, .09)},${decay(.09)}`,
    `${noise(.6, '#D#')},bandpass=f=800:w=400,${decay(.14)}`,
  ], 'amix=inputs=2:normalize=0'],

  ['boom', 1.4, 'explosion: rumble + mid blast + 55 Hz sub drop', [
    `${noise(.95, '#D#')},lowpass=f=400,${decay(1.2, .05)}`,
    `${noise(.6, '#D#')},bandpass=f=700:w=400,${decay(.45)}`,
    `${tone(55, .95, .6)},${decay(.55, .05)}`,
  ], 'amix=inputs=3:normalize=0'],

  ['kill', 0.65, 'kill confirm: descending two-tone + noise pop', [
    `${tone(600, .6, .18)},${decay(.10, .08)}`,
    `${tone(380, .6, .30)},${decay(.16, .14)},adelay=140`,
    `${noise(.4, '#D#')},lowpass=f=1400,${decay(.12)}`,
  ], 'amix=inputs=3:normalize=0'],

  ['ric', 0.42, 'ricochet: thin high ping sliding down', [
    `${tone(3200, .5, .35)},${decay(.33, .02)}`,
  ], 'volume=0.8'],

  ['clank', 0.32, 'metal clank: detuned 1.5k/2.1k burst', [
    `${tone(1500, .6, .22)},${decay(.22)}`,
    `${tone(2130, .45, .18)},${decay(.18)}`,
  ], 'amix=inputs=2:normalize=0'],

  ['glass', 0.2, 'glass break: dense 4k+ noise, spiky', [
    `${noise(.85, '#D#')},highpass=f=3800,lowpass=f=8000,${decay(.17)}`,
    `${tone(4200, .2, .12)},${decay(.12)}`,
  ], 'amix=inputs=2:normalize=0'],

  // ---- player ----
  ['hurt', 0.33, 'player hurt: dark 120 Hz thud + filtered noise', [
    `${tone(120, .9, .22)},${decay(.20, .02)}`,
    `${noise(.5, '#D#')},lowpass=f=500,${decay(.15)}`,
  ], 'amix=inputs=2:normalize=0'],

  ['step', 0.25, 'footstep: soft 420 Hz tap, subtle', [
    `${noise(.5, '#D#')},lowpass=f=420,${decay(.09)},volume=0.55`,
  ], 'anull'],

  ['dash', 0.38, 'dash whoosh: lowpass opens then closes', [
    `${noise(.7, '#D#')},lowpass=f=1200,afade=t=in:st=0:d=0.08,${decay(.22, .12)}`,
  ], 'volume=0.9'],

  // NOTE: no 'level' asset — that role is SFX_PRIO-only (engine synth, never
  // baked), so a file for it would never be played. data-regression enforces
  // manifest ⊆ BAKE_SLOT for exactly this reason.

  // ---- pickups / ui ----
  ['pick', 0.65, 'pickup: two-note bell chirp up', [
    `${tone(700, .55, .12)}`,
    `${tone(1050, .55, .28)},${decay(.2, .08)},adelay=90`,
  ], 'amix=inputs=2:normalize=0'],

  ['ui', 0.22, 'ui blip: single 880 Hz tick', [
    `${tone(880, .5, .09)},${decay(.08, .01)}`,
  ], 'anull'],

  ['ok', 0.65, 'confirm: pleasant G5->C6 rise', [
    `${tone(784, .45, .14)}`,
    `${tone(1046.5, .5, .3)},${decay(.2, .1)},adelay=110`,
  ], 'amix=inputs=2:normalize=0'],

  ['err', 0.3, 'error: dull 140 Hz buzz, clipped', [
    `${tone(140, .7, .18)},${decay(.14, .04)}`,
  ], 'volume=0.9'],
];

function buildCmd([role, dur, note, srcs, mix]) {
  const fills = (s) => s.split('#D#').join(String(dur));
  const chains = srcs.map(fills);
  const post = [
    // mono sources -> stereo (both ears even), then shape to platform loudness
    'aformat=sample_fmts=fltp:channel_layouts=stereo',
    'acompressor=threshold=-12dB:ratio=3:attack=4:release=90',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
    'alimiter=limit=0.891:level=false', // -1 dBFS ceiling
    `apad=pad_dur=${(dur * 0.15).toFixed(3)}`,
  ].join(',');
  // Sources live INSIDE the graph (they are source filters): a chain starting
  // with sine/anoisesrc must NOT be fed an input label, so no `-i` inputs —
  // the graph is pure lavfi and maps its own output.
  const graph = chains.map((c, i) => `${c}[s${i}]`).join(';')
    + ';' + chains.map((_, i) => `[s${i}]`).join('') + `${mix},${post}[a]`;
  const args = ['-hide_banner', '-loglevel', 'error', '-y',
    '-filter_complex', graph,
    '-map', '[a]', '-t', (dur + 0.25).toFixed(3),
    '-c:a', 'aac', '-b:a', '96k', '-ar', '48000'];
  return { role, note, args };
}

mkdirSync(OUT_DIR, { recursive: true });
const manifest = [];
let fail = 0;
for (const def of SFX) {
  const { role, note, args } = buildCmd(def);
  const out = path.join(OUT_DIR, role + '.m4a');
  const r = spawnSync('ffmpeg', [...args, out], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('FAIL ' + role + '\n' + (r.stderr || '').split('\n').slice(-6).join('\n'));
    fail++;
    continue;
  }
  manifest.push({ role, file: 'audio/' + role + '.m4a', dur: def[1], design: note });
  console.log('ok  ' + role);
}
writeFileSync(path.join(OUT_DIR, 'manifest.json'),
  JSON.stringify({ generated: 'tools/synth-audio.mjs', roles: manifest }, null, 2));
console.log(fail ? `${fail} FAILED` : `DONE ${manifest.length}/${SFX.length} -> ${OUT_DIR}`);
process.exit(fail ? 1 : 0);
