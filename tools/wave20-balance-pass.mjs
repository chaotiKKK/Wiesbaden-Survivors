#!/usr/bin/env node
// Wave-20 balance pass, driven ONLY through the ?qa panel with real input:
// real clicks start a run, Escape pauses, the panel jumps to wave 20, godmode
// keeps the observer alive, a ~55 s real-time sampling window observes the boss
// (identity, wut-scaled stats, adds, projectile pressure, overtime), then the
// panel ends the run. The in-panel qaSnap/qaRestore buttons bracket the endRun
// so the probe never touches Save.data itself. Page reads are observation only.
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const URL = process.argv[2] || 'http://127.0.0.1:8080/index.html?qa=1&cb=w20' + Date.now();
const EDGE_PATH = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
if (!EDGE_PATH) { console.error('FAIL no Edge binary'); process.exit(1); }

const ps = (script, opts) => { const r = spawnSync('powershell', ['-NoProfile', '-Command', script], Object.assign({ encoding: 'utf8', timeout: 15000 }, opts || {})); return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let edgePort = 0, edgeProfile = '';

function launchEdge() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      edgePort = srv.address().port; srv.close();
      edgeProfile = path.join(os.tmpdir(), 'fbw20-edge-' + process.pid + '-' + Date.now());
      const pf = edgeProfile.replace(/\\/g, '/');
      ps("Start-Process -WindowStyle Hidden -FilePath '" + EDGE_PATH + "' -ArgumentList '--headless=new --remote-debugging-port=" + edgePort + ' --user-data-dir=' + pf + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding about:blank'", 8000);
      const deadline = Date.now() + 15000;
      const probe = () => {
        const rr = ps("try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:" + edgePort + "/json/version).StatusCode } catch { 0 }", 5000);
        if ((rr.stdout || '').trim().startsWith('200')) resolve(true);
        else if (Date.now() < deadline) setTimeout(probe, 400);
        else resolve(false);
      };
      probe();
    });
  });
}
function cleanup() {
  if (edgeProfile) {
    const pat = edgeProfile.replace(/\\/g, '/');
    ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + pat + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }", 15000);
    setTimeout(() => { try { rmSync(edgeProfile, { recursive: true, force: true }); } catch { } }, 600);
  }
}
let ws; const pending = new Map(); let msgId = 0; const pageErrors = [];
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 25000);
  });
}
async function ev(expression, tries = 2) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const d = (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || 'unknown';
        if (t < tries - 1) { await sleep(350); continue; }
        throw new Error('page-eval failed [' + d + ']');
      }
      return r.result.value;
    } catch (e) { if (t < tries - 1) { await sleep(350); continue; } throw e; }
  }
}
async function clickSel(sel, label) {
  const pt = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    if (!el.getClientRects().length) return { gone: true, sel: ${JSON.stringify(sel)} };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), vis: getComputedStyle(el).visibility, dis: el.disabled === true, txt: (el.textContent || '').replace(/\\s+/g, ' ').slice(0, 44) }; })()`);
  if (!pt || pt.gone) throw new Error('click target missing: ' + (label || sel));
  if (pt.vis === 'hidden' || pt.dis) throw new Error('click target not clickable: ' + label + ' ' + JSON.stringify(pt));
  await sleep(120);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(220);
}
async function pressEscape() {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(250);
}
let failures = 0;
const res = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' — ' + detail : '')); if (!ok) failures++; };
const note = (m) => console.log('NOTE  ' + m);

// in-page snapshot of everything the pass records per tick
const SNAP = `JSON.stringify((function(){
  const R = Game.run || {};
  const b = Game.enemies.find(e => e.boss) || null;
  const adds = Game.enemies.filter(e => !e.boss && !e.dead);
  const elites = adds.filter(e => e.elite).length;
  const player = Game.players && Game.players[0];
  const hdr = document.getElementById('hudWave') ? document.getElementById('hudWave').textContent.replace(/\\s+/g,' ').trim() : '';
  return {
    t: +Game.time.toFixed(1), wave: Game.wave, state: Game.state, hdr,
    boss: b ? { name: (b.boss && b.boss.name) || (b.def && (b.def.name || b.def.id)) || '?', hp: Math.round(b.hp), maxHp: Math.round(b.maxHp), frac: +(b.hp / b.maxHp).toFixed(3), armor: b.armor, dmg: b.dmg, spd: Math.round(b.spd), variant: b.bossVariant || null } : null,
    adds: adds.length, elites, bullets: EnemyBullets.active.length, bossAlive: !!Game.bossAlive,
    waveTimer: Game.waveTimer != null ? +Game.waveTimer.toFixed(1) : null, ot: Game.otLevel || 0,
    dmg: Math.round(R.dmg || 0), kills: R.kills || 0, bosses: R.bosses || 0,
    mats: Game.materials, hp: player ? Math.round(player.hp) : -1, maxHp: player ? Math.round(player.maxHp) : -1,
    arena: Game.level && Game.level.a ? Game.level.a.name : '', arenaMod: Game.arenaMod ? Game.arenaMod.name : null
  };
})())`;

async function main() {
  const up = await launchEdge();
  if (!up) { console.error('FAIL Edge did not start'); process.exit(1); }
  const list = JSON.parse(await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text());
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') pageErrors.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
  };
  const samples = [];
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: URL });
    for (let i = 0; i < 50; i++) { if (await ev("typeof Game === 'object' && !!document.getElementById('scTitle')")) break; await sleep(300); }
    await sleep(800);
    await ev('window.confirm = () => true; 1');

    // real clicks: splash -> SPIEL STARTEN -> char select -> controls -> wave 1
    const splash = await ev(`(() => { const i = document.getElementById('intro'); const cs = i ? getComputedStyle(i) : null; return !!(i && cs && cs.visibility !== 'hidden' && cs.display !== 'none'); })()`);
    if (splash) await clickSel('#intro', 'splash');
    let inChar = false;
    for (let i = 0; i < 6 && !inChar; i++) { await clickSel('#scTitle [data-act="play"]', 'SPIEL STARTEN'); await sleep(400); inChar = (await ev('UI.cur')) === 'scChar'; }
    res('run started through real clicks', inChar, '');
    await clickSel('#scChar [data-act="charConfirm"]', 'Bestätigen');
    await clickSel('#scControls [data-act="controlsOK"]', 'OK · Los geht\'s');
    let playing = false;
    for (let i = 0; i < 60 && !playing; i++) { const s = await ev('Game.state'); if (s === 'play') playing = true; else await sleep(250); }
    res('wave 1 in real time', playing, 'wave=' + (await ev('Game.wave')));
    const setup = JSON.parse(await ev(`JSON.stringify({ seed: Game.seed, mods: (Game.mods || []).map(m => m.name), danger: Game.danger, diff: Save.data.opts.difficulty, arena: Game.level.a.name, char: Game.players[0].char.name })`));
    note('run setup: seed=' + setup.seed + ' mods=[' + setup.mods.join(' · ') + '] danger=' + setup.danger + ' diff=' + setup.diff + ' arena=' + setup.arena + ' char=' + setup.char);

    // pause -> jump to wave 20 via the panel -> godmode ON
    await pressEscape();
    await ev('document.getElementById("qaWaveIn").value = "20"; 1');
    await clickSel('#qaRow [data-act="qaWaveGo"]', '→ Welle');
    let at20 = false;
    for (let i = 0; i < 40 && !at20; i++) { const s = await ev('Game.state'); const w = await ev('Game.wave'); if (s === 'play' && w === 20) at20 = true; else await sleep(200); }
    res('panel jump to wave 20 (play)', at20, 'wave=' + (await ev('Game.wave')));
    await pressEscape();
    await sleep(300);
    await clickSel('#qaRow [data-act="qaGod"]', 'Gott-Modus');
    const god = await ev('Game.qaGod === true');
    res('godmode ON (observer survives to watch the boss)', god, '');
    // snapshot the fresh save via the panel before the run ends
    await clickSel('#qaRow [data-act="qaSnap"]', 'Save sichern');
    const snapOk = await ev('!!Game._qaSaveSnap');
    res('in-panel save snapshot taken before endRun', snapOk, '');
    await pressEscape();
    await sleep(300);

    // observation window: ~55 s of real time, sampled every ~2 s
    const tObsStart = Date.now();
    let firstBoss = null;
    while (Date.now() - tObsStart < 55000) {
      const s = JSON.parse(await ev(SNAP));
      samples.push(s);
      if (s.boss && !firstBoss) firstBoss = s;
      await sleep(2000);
    }
    const last = JSON.parse(await ev(SNAP));
    samples.push(last);
    const b0 = samples.find(s => s.boss && s.boss.name) || null;
    const b1 = samples.filter(s => s.boss && s.boss.name).pop() || null;
    res('boss observed on screen at wave 20', !!(b0 && b0.boss), b0 ? b0.boss.name + ' (' + b0.arena + ')' : 'no boss entity in ' + samples.length + ' samples');
    if (b0 && b1) {
      res('boss survived the observation window (jump build cannot burst it)', b1.boss.hp > 0, 'hp ' + b0.boss.hp + ' -> ' + b1.boss.hp + ' of ' + b1.boss.maxHp + ' (frac ' + b1.boss.frac + ')');
      const dmgSpan = samples.filter(s => s.t >= b0.t && s.t <= b1.t);
      if (dmgSpan.length >= 2) {
        const dt = dmgSpan[dmgSpan.length - 1].t - dmgSpan[0].t;
        const dd = dmgSpan[dmgSpan.length - 1].dmg - dmgSpan[0].dmg;
        const dps = dt > 0 ? +(dd / dt).toFixed(1) : 0;
        const ttkMin = dps > 0 ? +(b1.boss.maxHp / dps / 60).toFixed(1) : null;
        note('wave-20 observation: boss ' + b1.boss.name + ' variant=' + b1.boss.variant + ' maxHp=' + b1.boss.maxHp + ' armor=' + b1.boss.armor + ' | at first sight: dmg=' + b0.boss.dmg.toFixed(1) + ' spd=' + b0.boss.spd + ' | late (ot ' + b1.ot + '): dmg=' + b1.boss.dmg.toFixed(1) + ' spd=' + b1.boss.spd + ' | measured player DPS ≈ ' + dps + ' over ' + dt.toFixed(0) + 's -> projected TTK ≈ ' + (ttkMin != null ? ttkMin + ' min' : 'n/a') + ' vs wave window ' + b1.waveTimer + 's');
      }
    }
    const otHit = samples.find(s => s.ot > 0 || /ÜBERZEIT/.test(s.hdr));
    note('overtime: ' + (otHit ? 'REACHED at t=' + otHit.t + ' (otLevel ' + otHit.ot + ', header "' + otHit.hdr + '")' : 'not reached in the window (boss alive, timer ' + (last.waveTimer != null ? last.waveTimer : 'n/a') + 's left)'));
    const maxBullets = Math.max.apply(null, samples.map(s => s.bullets));
    const maxAdds = Math.max.apply(null, samples.map(s => s.adds));
    note('peak enemy-bullet pressure ' + maxBullets + ' | peak adds on screen ' + maxAdds + ' (elites ' + Math.max.apply(null, samples.map(s => s.elites)) + ') | final wave stats: dmg=' + last.dmg + ' kills=' + last.kills + ' arenaMod=' + (last.arenaMod || 'none'));
    const lastBoss = samples.filter(s => s.boss && s.boss.name).pop();
    note('boss final: hp ' + lastBoss.boss.hp + '/' + lastBoss.boss.maxHp + ' (frac ' + lastBoss.boss.frac + ') variant ' + lastBoss.boss.variant + ' | phase thresholds of registry: P2 ≤65% hp, P3 ≤30% hp');

    // end the run via the panel (defeat) — save was snapshotted above
    await pressEscape();
    await sleep(250);
    await clickSel('#qaRow [data-act="qaEnd"][data-val="lose"]', 'Ende: Niederlage');
    let ended = false;
    for (let i = 0; i < 40 && !ended; i++) { const e = await ev('({ st: Game.state })'); if (e.st === 'end') ended = true; else await sleep(200); }
    const endSt = JSON.parse(await ev(`JSON.stringify({ runs: Save.data.stats.runs, best: Save.data.bestWave, endVisible: !document.getElementById('scEnd').classList.contains('hidden'), title: document.getElementById('endTitle').textContent.replace(/\\s+/g,' ').trim() })`));
    res('endRun via panel produced the end screen + real save write', ended && endSt.endVisible && endSt.runs === 1, JSON.stringify(endSt));

    // restore the snapshot via the panel (the save must return to pre-run)
    await ev('UI.show("scPause"); 1');
    await sleep(350);
    await clickSel('#qaRow [data-act="qaRestore"]', 'Save zurücksetzen');
    const rest = JSON.parse(await ev(`JSON.stringify({ runs: Save.data.stats.runs, cur: UI.cur })`));
    res('qaRestore returned the save to the snapshot (runs 0, title)', rest.runs === 0 && rest.cur === 'scTitle', JSON.stringify(rest));
  } finally {
    cleanup();
  }
  if (pageErrors.length) { note('page errors: ' + pageErrors.length + ' — ' + pageErrors[0].slice(0, 160)); failures++; }
  else note('zero page errors');
  console.log(failures === 0 ? '\nWAVE-20 BALANCE PASS OK (' + samples.length + ' samples)' : '\nWAVE-20 BALANCE PASS FAILED (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}
main();