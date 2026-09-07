#!/usr/bin/env node
// One-shot: is the fresh-save char roster consistent with the title footer
// "Charaktere N/23"? Dumps per-char lock state on a real char-select screen.
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const URL = 'http://127.0.0.1:8080/index.html?cb=roster' + Date.now();
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ps = (s, t = 8000) => spawnSync('powershell', ['-NoProfile', '-Command', s], { timeout: t, encoding: 'utf8' });
const port = 9850 + Math.floor(Math.random() * 100);
const prof = path.join(os.tmpdir(), 'fbroster-' + process.pid + '-' + Date.now()).replace(/\\/g, '/');
const s = "Start-Process -WindowStyle Hidden -FilePath '" + EDGE + "' -ArgumentList '--headless=new --remote-debugging-port=" + port + ' --user-data-dir=' + prof + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience about:blank'";
ps(s);
let up = false;
for (let i = 0; i < 30; i++) { const rr = ps("try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:" + port + "/json/version).StatusCode } catch { 0 }", 4000); if ((rr.stdout || '').trim().startsWith('200')) { up = true; break; } await sleep(400); }
if (!up) { console.log('edge failed'); process.exit(1); }
const list = JSON.parse(await (await fetch('http://127.0.0.1:' + port + '/json/list')).text());
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } };
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true }); return r.result.value; };
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: URL });
for (let i = 0; i < 40; i++) { if (await ev("typeof Game === 'object'")) break; await sleep(250); }
await ev("document.querySelector('#intro').click(); 1").catch(() => { });
await sleep(300);
await ev("document.querySelector('#scTitle [data-act=\"play\"]').click(); 1");
await sleep(600);
const out = await ev(`(() => { const cards = Array.from(document.querySelectorAll('#charGrid .card'));
  const locked = cards.filter(c => c.classList.contains('lock'));
  return { footer: Save.data.unlockedChars.length + '/' + CHARS.length + ' unlocked in save',
    total: cards.length, locked: locked.length,
    lockedNames: locked.map(c => (c.querySelector('h3') || {}).textContent),
    withUnlockRule: CHARS.filter(c => c.unlock).map(c => c.id + ' (need ' + c.unlock.need + ' ' + c.unlock.key + ')'),
    saved: Save.data.unlockedChars }; })()`);
console.log('ROSTER ' + JSON.stringify(out, null, 1));
try { ws.close(); } catch { }
ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + prof + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", 12000);
setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch { } }, 400);
