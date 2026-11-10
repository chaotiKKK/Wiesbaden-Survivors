#!/usr/bin/env node
/* Browser bridge for the Fünf-Viertel campaign.
 *
 * The JSON file is the authoring source; classic <script> files cannot import
 * JSON, so this generator writes a deterministic classic-script mirror that
 * index.html loads before data.js.  data.js reads the same JSON directly under
 * Node.  The header hash lets the content test reject a stale mirror.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'content', 'fuenf-viertel.json');
const TARGET = join(ROOT, 'content', 'fuenf-viertel.data.js');

const raw = readFileSync(SOURCE, 'utf8');
const config = JSON.parse(raw);
const json = JSON.stringify(config, null, 2);
const hash = createHash('sha256').update(raw).digest('hex');
const banner = [
  '/* AUTO-GENERATED from content/fuenf-viertel.json — do not edit by hand.',
  ' * Run: node tools/build-fuenf-viertel.mjs',
  ' * sha256: ' + hash,
  ' */',
  'const FUENF_VIERTEL_DATA = ' + json + ';',
  "if (typeof window !== 'undefined') window.FUENF_VIERTEL_DATA = FUENF_VIERTEL_DATA;",
  "if (typeof module !== 'undefined' && module.exports) module.exports = FUENF_VIERTEL_DATA;",
  ''
].join('\n');

writeFileSync(TARGET, banner, 'utf8');
console.log('wrote ' + TARGET + ' (' + banner.length + ' bytes, sha256 ' + hash.slice(0, 12) + '…)');
