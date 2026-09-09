#!/usr/bin/env node
//
// Wiesbaden Survivors — trailer assembly.
//
// Turns the beat frame-dumps written by tools/trailer-capture.mjs into the
// finished 20-second trailer, following the timeline that trailer/trailer.html
// already encodes: music bed 0-20 s, three narration beats at 1.5 / 7 / 14 s
// (durations 4 / 5 / 4 s). Those VO windows drive the on-screen lines here,
// because the shipped media/*.mp3 are digital silence (-91 dB placeholders, as
// trailer/README.md says) — so the narration is carried visually instead.
//
// Two ffmpeg passes: one per beat to turn the timestamped frame list into a CFR
// clip, then a single filter_complex pass that trims, concatenates, titles,
// fades and muxes the bed. The filter graph is written to a file and read back
// with `-/filter_complex` because Windows drive-colons break inline filter
// parsing and `-filter_script` was removed in ffmpeg 8/9 (see AGENTS.md).
//
// Usage: node tools/trailer-build.mjs [--capture <dir>] [--out <file>]

import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE_DIR = path.dirname(fileURLToPath(new URL(import.meta.url)));
const ROOT = path.resolve(HERE_DIR, '..');
const argv = process.argv.slice(2);
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const CAPTURE_DIR = path.resolve(argOf('--capture', path.join(os.tmpdir(), 'ws-trailer-capture')));
const OUT_FILE = path.resolve(argOf('--out', path.join(ROOT, 'trailer', 'out', 'wiesbaden-survivors-trailer.mp4')));
const BUILD_DIR = path.join(os.tmpdir(), 'ws-trailer-build');
const BED = path.join(ROOT, 'trailer', 'media', 'bgm-trailer.mp3');

// Cut plan — 7 + 6 + 5 + 2 = 20 s, matching the bed length in trailer.html.
// Windows picked from the captures, not guessed: each beat's first ~2 s is the
// spawn-in lull (wave 1 opens with 3 enemies, a wave jump needs a beat to
// re-populate), so the cuts start after the arena has filled.
const CUTS = [
  { id: 'intro', from: 1.5, len: 7.0 },
  { id: 'mid', from: 2.0, len: 6.0 },
  { id: 'outro', from: 4.5, len: 5.0 }
];
const END_CARD = 2.0;

// On-screen narration, windowed on the VO beats declared in trailer/trailer.html.
const LINES = [
  { text: 'WIESBADEN SURVIVORS', size: 66, y: 'h*0.13', from: 0.4, to: 4.2, font: 'bold' },
  { text: 'ÜBERLEBE DIE WELLEN', size: 34, y: 'h*0.84', from: 1.5, to: 5.5, font: 'bold' },
  { text: 'BESIEGE DIE BOSSE', size: 34, y: 'h*0.84', from: 7.0, to: 12.0, font: 'bold' },
  { text: 'WIESBADEN BRENNT', size: 34, y: 'h*0.84', from: 14.0, to: 17.6, font: 'bold' },
  { text: 'WIESBADEN SURVIVORS', size: 62, y: 'h*0.38', from: 18.05, to: 20.0, font: 'bold' },
  { text: 'JETZT SPIELEN', size: 26, y: 'h*0.54', from: 18.35, to: 20.0, font: 'reg' }
];

const run = (args, cwd) => {
  const r = spawnSync('ffmpeg', args, { cwd, encoding: 'utf8', timeout: 600000 });
  if (r.status !== 0) {
    console.error('ffmpeg failed (' + r.status + ')\n' + (r.stderr || '').split('\n').slice(-14).join('\n'));
    process.exit(1);
  }
  return r;
};

if (!existsSync(CAPTURE_DIR)) { console.error('FATAL: no capture dir ' + CAPTURE_DIR + ' — run tools/trailer-capture.mjs first'); process.exit(1); }
mkdirSync(BUILD_DIR, { recursive: true });
mkdirSync(path.dirname(OUT_FILE), { recursive: true });

// Fonts must sit beside the media and be referenced relatively: a `fontfile=C:/...`
// drive-colon is eaten by filter parsing, and fontconfig (`font=Arial`) has no
// config file on this box and hard-crashes drawtext.
copyFileSync('C:/Windows/Fonts/arialbd.ttf', path.join(BUILD_DIR, 'bold.ttf'));
copyFileSync('C:/Windows/Fonts/arial.ttf', path.join(BUILD_DIR, 'reg.ttf'));

// ---- pass 1: timestamped frame dumps -> constant-rate clips ----------------
for (const cut of CUTS) {
  const beatDir = path.join(CAPTURE_DIR, 'beat-' + cut.id);
  const list = path.join(beatDir, 'frames.txt');
  if (!existsSync(list)) { console.error('FATAL: missing ' + list); process.exit(1); }
  const out = path.join(BUILD_DIR, 'beat-' + cut.id + '.mp4');
  console.log('encoding beat ' + cut.id + ' ...');
  run(['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'fps=60,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', out]);
}

// ---- pass 2: trim / concat / title / fade / mux ----------------------------
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
const parts = [];
CUTS.forEach((c, i) => {
  parts.push(`[${i}:v]trim=${c.from}:${(c.from + c.len).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
});
parts.push(`[${CUTS.length}:v]trim=0:${END_CARD},setpts=PTS-STARTPTS[v${CUTS.length}]`);
const labels = CUTS.map((_, i) => `[v${i}]`).join('') + `[v${CUTS.length}]`;
parts.push(`${labels}concat=n=${CUTS.length + 1}:v=1:a=0[vc]`);

const total = CUTS.reduce((a, c) => a + c.len, 0) + END_CARD;
const draws = LINES.map(l =>
  `drawtext=fontfile=${l.font}.ttf:text='${esc(l.text)}'` +
  `:fontcolor=white:fontsize=${l.size}:x=(w-text_w)/2:y=${l.y}` +
  `:borderw=3:bordercolor=black@0.85:shadowx=0:shadowy=0` +
  `:enable='between(t\\,${l.from}\\,${l.to})'`
).join(',');
parts.push(`[vc]${draws},fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - 0.7).toFixed(2)}:d=0.7,format=yuv420p[vout]`);

const graphFile = path.join(BUILD_DIR, 'graph.txt');
writeFileSync(graphFile, parts.join(';\n'), 'utf8');
console.log('filter graph -> ' + graphFile);

const args = ['-hide_banner', '-loglevel', 'error', '-y'];
for (const c of CUTS) args.push('-i', 'beat-' + c.id + '.mp4');
args.push('-f', 'lavfi', '-i', 'color=c=0x080b14:s=1280x720:r=60:d=' + END_CARD);
args.push('-i', BED);
args.push('-/filter_complex', 'graph.txt');
args.push('-map', '[vout]', '-map', String(CUTS.length + 1) + ':a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', OUT_FILE);

console.log('assembling ...');
run(args, BUILD_DIR);

const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size',
  '-show_entries', 'stream=codec_name,codec_type,width,height,nb_frames',
  '-of', 'default=noprint_wrappers=1', OUT_FILE], { encoding: 'utf8' });
console.log('\nOUTPUT ' + OUT_FILE + '\n' + (probe.stdout || '').trim());
