#!/usr/bin/env node
//
// Wiesbaden Survivors — trailer audio generation (ffmpeg + Windows TTS).
//
// Replaces the -91 dB placeholder files in trailer/media/ with REAL audio:
//
//   bgm-trailer.mp3  20 s synthwave-ish bed, mixed to -14 LUFS
//   vo-intro.mp3     German narration, Microsoft Hedda (de-DE), -16 LUFS
//   vo-mid.mp3       ditto
//   vo-outro.mp3     ditto
//
// The trailer/trailer.html HyperFrames contract (voiceover group + carve on
// the bed) stays byte-identical — same filenames, same windows.
//
// TTS is fetched ONCE into trailer/media/.vo-text/ so re-runs only re-encode
// if the text changed. No npm deps; System.Speech via PowerShell is used
// because it ships with every Windows build and Hedda is a true de-DE voice.
//
// Usage: node tools/trailer-audio.mjs

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { repoRoot } from './lib/harness.mjs';

const ROOT = repoRoot(import.meta.url);
const MEDIA = path.join(ROOT, 'trailer', 'media');
const TTS_DIR = path.join(MEDIA, '.vo-text');
const SR = 44100;

// ---- narration text (matches trailer.html on-screen lines) -----------------
const VO = [
  { id: 'vo-intro', text: 'Wiesbaden Survivors. Überlebe die Wellen.' },
  { id: 'vo-mid', text: 'Besiege die Bosse. Rette die Stadt.' },
  { id: 'vo-outro', text: 'Wiesbaden brennt. Jetzt spielen.' },
];

// ---- TTS via PowerShell System.Speech --------------------------------------
function synthTTS(item) {
  mkdirSync(TTS_DIR, { recursive: true });
  const wav = path.join(TTS_DIR, item.id + '.wav');
  const ps = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$s.SelectVoice(\'Microsoft Hedda Desktop\')',
    '$s.Rate = 1',
    '$s.SetOutputToWaveFile(\'' + wav.replace(/'/g, "''") + '\')',
    '$s.Speak(\'' + item.text.replace(/'/g, "''") + '\')',
    '$s.Dispose()',
  ].join('; ');
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(wav)) {
    console.error('TTS failed for ' + item.id + ': ' + (r.stderr || '').slice(0, 300));
    return false;
  }
  return true;
}

// ---- BGM: 20 s synthwave bed in A minor, 96 BPM ----------------------------
// Structure: intro pad (0-4) -> arp enters (4-8) -> kick+bass (8-16) -> outro
// (16-20). Generated with lavfi sources; sidechain-ducked later in build.
function bgmGraph() {
  const bar = 60 / 96 * 4; // 2.5 s per bar
  const A2 = 110, C3 = 130.81, E3 = 164.81, G3 = 196, A3 = 220, C4 = 261.63, E4 = 329.63, A4 = 440, C5 = 523.25, E5 = 659.26;
  const S = 44100;
  const layers = [];

  // 1) pad: detuned saw A2 + C3 + E3, slow attack, full 20 s
  layers.push(`sine=f=${A2}:r=${S}:d=20,volume=0.20[sawA]`);
  layers.push(`sine=f=${C3}:r=${S}:d=20,volume=0.16[sawC]`);
  layers.push(`sine=f=${E3}:r=${S}:d=20,volume=0.14[sawE]`);

  // 2) arp: A4/C5/E5 sixteenths, entering at bar 3 (7.5 s), rhythmic gate
  const arpStep = bar / 8; // eighth notes, ~0.3125 s
  const arpSeq = [];
  for (let i = 0; i < 8; i++) {
    const f = [A4, C5, E5, C5][i % 4];
    const st = 7.5 + i * arpStep;
    arpSeq.push(`sine=f=${f}:r=${S}:d=${(arpStep * 0.9).toFixed(3)},volume=0.30,afade=t=out:st=${(arpStep * 0.55).toFixed(3)}:d=${(arpStep * 0.35).toFixed(3)}:curve=exp,adelay=${Math.round(st * 1000)}`);
  }
  layers.push(...arpSeq.map((c, i) => `${c}[arp${i}]`));

  // 3) kick: 4-on-floor from 8 s, every beat (0.625 s)
  const kickSeq = [];
  for (let i = 0; i < 16; i++) {
    const st = 8 + i * 0.625;
    kickSeq.push(`sine=f=52:r=${S}:d=0.16,volume=0.9,afade=t=out:st=0.02:d=0.14:curve=exp,adelay=${Math.round(st * 1000)}`);
  }
  layers.push(...kickSeq.map((c, i) => `${c}[k${i}]`));

  // 4) bass: A2 pulses on 8ths from 8 s
  const bassSeq = [];
  for (let i = 0; i < 16; i++) {
    const st = 8 + i * 0.3125;
    const f = i % 4 === 3 ? G3 : A2; // small movement
    bassSeq.push(`sine=f=${f}:r=${S}:d=0.24,volume=0.42,afade=t=out:st=0.04:d=0.20:curve=exp,adelay=${Math.round(st * 1000)}`);
  }
  layers.push(...bassSeq.map((c, i) => `${c}[b${i}]`));

  // 5) riser into the drop (6.5 -> 8 s): noise with rising lowpass
  layers.push(`anoisesrc=c=white:r=${S}:a=0.35:d=1.5,lowpass=f=3000,afade=t=in:st=0:d=1.2,adelay=6500[riser]`);

  // sum everything
  const sum = layers.map(l => l.match(/\[([^\]]+)\]$/)[1]).map(n => `[${n}]`).join('');
  const graph = layers.join(';') + ';' + sum
    + `amix=inputs=${layers.length}:normalize=0,volume=1.6,alimiter=limit=0.85,`
    + 'afade=t=in:st=0:d=0.8,afade=t=out:st=18.6:d=1.4[m]';
  return graph;
}

function runFF(args, why) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('ffmpeg failed (' + why + ')\n' + (r.stderr || '').split('\n').slice(-8).join('\n'));
    process.exit(1);
  }
}

function main() {
  mkdirSync(MEDIA, { recursive: true });

  // ---- 1) TTS ----
  for (const item of VO) {
    const wav = path.join(TTS_DIR, item.id + '.wav');
    const mp3 = path.join(MEDIA, item.id + '.mp3');
    if (!existsSync(wav)) synthTTS(item);
    if (!existsSync(wav)) { console.error('no TTS wav for ' + item.id); process.exit(1); }
    runFF(['-hide_banner', '-loglevel', 'error', '-y',
      '-i', wav,
      '-af', 'aformat=sample_fmts=fltp:channel_layouts=stereo,acompressor=threshold=-14dB:ratio=3:attack=4:release=100,loudnorm=I=-16:TP=-1.5:LRA=9',
      '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '128k', mp3], item.id);
    console.log('ok  ' + item.id + '  (' + item.text + ')');
  }

  // ---- 2) BGM ----
  const bedOut = path.join(MEDIA, 'bgm-trailer.mp3');
  runFF(['-hide_banner', '-loglevel', 'error', '-y',
    '-filter_complex', bgmGraph(),
    '-map', '[m]', '-t', '20',
    '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '192k', bedOut], 'bgm');
  console.log('ok  bgm-trailer  (20 s bed, A minor 96 BPM)');

  // ---- 3) verify: none of the three may be silent ----
  for (const f of ['bgm-trailer.mp3', ...VO.map(v => v.id + '.mp3')]) {
    const p = spawnSync('ffmpeg', ['-hide_banner', '-i', path.join(MEDIA, f),
      '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', stderr: 'pipe' });
    const err = p.stderr || '';
    const max = /max_volume:\s*(-?[\d.]+) dB/.exec(err);
    if (!max || parseFloat(max[1]) < -80) {
      console.error('SILENT OUTPUT: ' + f + ' (max ' + (max ? max[1] : '?') + ' dB)');
      process.exit(1);
    }
    console.log('loudness  ' + f + '  max ' + max[1] + ' dB');
  }
  console.log('DONE trailer audio -> ' + MEDIA);
}

main();
