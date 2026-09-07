#!/usr/bin/env node
// Live-play: shop + net screens on a FRESH served copy in real headless Edge (rAF live).
// Confirms the visibility filter contract on the two buttons that carry .nav + hidden
// in markup: #btnWager (shop, hidden iff no wager offer) and #netHangUp (net, hidden
// iff Net.phase === 'idle') — each must be a nav-ring member ONLY while actually visible.
// Reach the shop the real way (fixed-seed run, real DOM clicks through level/shop), and
// the net screen via the real title button. Node >= 21 (global WebSocket + fetch).
import { existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const SEED = 424242;
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!EDGE) { console.error('no Edge'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ps = (script, timeout = 10000) => spawnSync('powershell', ['-NoProfile', '-Command', script], { timeout, encoding: 'utf8' });
const PASS = [], FAIL = [];
const res = (name, ok, detail) => { (ok ? PASS : FAIL).push(name); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

let edgePort = 0, edgeProfile = '', server;
async function serve() {
  const port = 9400 + Math.floor(Math.random() * 300);
  server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!existsSync(fp)) { res.writeHead(404); return res.end('nf'); }
    const ext = path.extname(fp).toLowerCase();
    const ct = ext === '.js' ? 'text/javascript' : ext === '.html' ? 'text/html' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
    res.end(readFileSync(fp));
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return 'http://127.0.0.1:' + port + '/index.html?cb=wagentrennen' + Date.now();
}
function launchEdge() {
  return new Promise((resolve) => {
    edgePort = 9700 + Math.floor(Math.random() * 200);
    edgeProfile = path.join(os.tmpdir(), 'fbwt-edge-' + process.pid + '-' + Date.now());
    const pf = edgeProfile.replace(/\\/g, '/');
    const s = "Start-Process -WindowStyle Hidden -FilePath '" + EDGE + "' -ArgumentList '--headless=new --remote-debugging-port=" + edgePort +
      ' --user-data-dir=' + pf + " --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience --disable-frame-rate-limit --disable-gpu-vsync --run-all-compositor-stages-before-draw --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding about:blank'";
    const r = ps(s, 8000);
    if (r.status !== 0) { resolve(false); return; }
    const deadline = Date.now() + 15000;
    const probe = () => {
      const rr = ps("try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:" + edgePort + "/json/version).StatusCode } catch { 0 }", 5000);
      if ((rr.stdout || '').trim().startsWith('200')) resolve(true);
      else if (Date.now() < deadline) setTimeout(probe, 400);
      else resolve(false);
    };
    probe();
  });
}
function cleanup() {
  try { server && server.close(); } catch { }
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
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 20000);
  });
}
async function ev(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

/* Visibility + ring probe for a button: computed display, and whether it is a live
   ring member (UI.navEls) right now — no forced refreshNav, the ring is as the UI
   left it. */
const btnProbe = (sel) => `(() => {
  const b = document.querySelector('${sel}');
  if (!b) return { found: false };
  const cs = getComputedStyle(b);
  const vis = cs.display !== 'none' && cs.visibility !== 'hidden';
  return { found: true, hiddenClass: b.classList.contains('hidden'), vis, inRing: UI.navEls.includes(b), ringIdx: UI.navEls.indexOf(b), cur: UI.cur, navN: UI.navEls.length };
})()`;

async function main() {
  const base = await serve();
  console.log('SERVING ' + base.replace(/cb=.*/, 'cb=<ts>'));
  const up = await launchEdge();
  if (!up) { console.error('Edge did not start'); process.exit(1); }
  const list = JSON.parse(await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text());
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') pageErrors.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
  };
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: base });
    for (let i = 0; i < 50; i++) { if (await ev("typeof Game === 'object' && typeof UI === 'object'")) break; await sleep(300); }
    if (await ev("location.href.indexOf('index.html') < 0")) { console.log('WRONG TAB ' + await ev('location.href')); process.exit(2); }
    console.log('ENGINE UP on ' + (await ev('location.href')).replace(/cb=.*/, 'cb=<ts>'));

    /* ================= SHOP LEG ================= */
    console.log('\n--- SHOP LEG: real run to the first shop ---');
    await ev(`window.confirm = () => true; 1`);
    await ev('Game.setRunSeed(' + SEED + '); Game.startRun(); 1');
    // drive real DOM clicks through level-up / relic / shop screens until the shop opens
    const driveExpr = `(() => {
      if (UI.cur === 'scLevel') { const c = document.querySelector('#scLevel .lvlCard'); if (c) { c.click(); return 'lvlPick'; } }
      if (UI.cur === 'scRelic') { const s = document.querySelector('#scRelic [data-act="relicSkip"]'); if (s) { s.click(); return 'relicSkip'; } }
      if (UI.cur === 'scShop') { const n = document.querySelector('#scShop [data-act="nextWave"]'); if (n) { n.click(); return 'nextWave'; } }
      return 'none'; })()`;
    let acted = '', shopSeen = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      const st = await ev("({ st: Game.state, wave: Game.wave, cur: UI.cur, alive: Game.players[0].alive, enemies: Game.enemies.length })");
      if (st.cur === 'scShop') { shopSeen = true; break; }
      if (!st.alive) break;
      acted = await ev(driveExpr);
      await sleep(120);
    }
    if (!shopSeen) {
      res('shop reached live', false, 'cur=' + (await ev('UI.cur')) + ' alive=' + (await ev('Game.players[0].alive')) + ' after ' + Math.round((Date.now() - t0) / 1000) + 's, last drive ' + acted);
      throw new Error('shop not reached');
    }
    const shopAt = await ev("({ wave: Game.wave, offer: !!Game.wagerOffer, wager: Game.wager && Game.wager.id })");
    console.log('SHOP at wave ' + shopAt.wave + ' (offer=' + shopAt.offer + ', accepted=' + shopAt.wager + ')');
    let p = await ev(btnProbe('#btnWager'));
    res('wager visible at first shop', p.vis, JSON.stringify(p));
    res('wager IN ring while visible', p.inRing, 'ringIdx=' + p.ringIdx + ' of ' + p.navN);
    // hidden state: null the offer through the real render path
    await ev('Game.wagerOffer = null; UI.renderShop(); 1');
    p = await ev(btnProbe('#btnWager'));
    res('wager hidden when offer nulled', !p.vis, JSON.stringify(p));
    res('wager OUT of ring while hidden (visibility filter)', !p.inRing, 'ringIdx=' + p.ringIdx + ' of ' + p.navN);
    // restore: fresh offer, real render
    await ev('Game.wager = null; Game.wagerOffer = Game.WAGERS[0]; UI.renderShop(); 1');
    p = await ev(btnProbe('#btnWager'));
    res('wager visible again after restore', p.vis, JSON.stringify(p));
    res('wager back IN ring after re-render', p.inRing, 'ringIdx=' + p.ringIdx + ' of ' + p.navN);

    /* ================= NET LEG ================= */
    console.log('\n--- NET LEG: title -> Online-Koop -> host ---');
    await ev('UI.renderTitle(); UI.show("scTitle"); 1');
    const netBtn = await ev("!!document.querySelector('[data-act=\"netOpen\"]')");
    res('net entry button present on title', netBtn);
    await ev('document.querySelector(\'[data-act="netOpen"]\').click(); 1');
    await sleep(300);
    p = await ev(btnProbe('#netHangUp'));
    res('Trennen hidden while idle', !p.vis, JSON.stringify(p));
    res('Trennen OUT of ring while idle', !p.inRing, 'ringIdx=' + p.ringIdx + ' of ' + p.navN);
    const idleRing = await ev("UI.navEls.map(e => e.dataset.act || '').filter(Boolean).join(',')");
    console.log('NET idle ring: ' + idleRing);
    res('net screen ring populated while idle', idleRing.length > 0 && idleRing.indexOf('netHangUp') < 0, idleRing);
    // host a room (real click on the visible button)
    await ev('document.querySelector(\'[data-act="netHost"]\').click(); 1');
    let phase = '', seen = false;
    for (let i = 0; i < 60; i++) {
      phase = await ev('Net.phase');
      const v = await ev(btnProbe('#netHangUp'));
      if (v.vis) { seen = true; break; }
      await sleep(300);
    }
    p = await ev(btnProbe('#netHangUp'));
    console.log('after netHost: phase=' + phase + ' ' + JSON.stringify(p));
    res('Trennen became visible after hosting', seen || p.vis, 'phase=' + phase);
    res('Trennen IN ring after host (live ring fresh)', p.inRing, 'ringIdx=' + p.ringIdx + ' of ' + p.navN);
    // ring refresh (what a keyboard user triggers on the next input or re-show)
    await ev('UI.refreshNav(); 1');
    p = await ev(btnProbe('#netHangUp'));
    res('Trennen IN ring after refreshNav while visible', p.inRing, 'ringIdx=' + p.ringIdx + ' of ' + p.navN);
    // disconnect via the real button
    await ev('document.querySelector(\'[data-act="netHangUp"]\').click(); 1');
    await sleep(400);
    p = await ev(btnProbe('#netHangUp'));
    res('Trennen hidden again after Trennen click', !p.vis, JSON.stringify(p));
    res('Trennen OUT of ring after disconnect (live ring)', !p.inRing, 'ringIdx=' + p.ringIdx + ' of ' + p.navN);

    console.log('\nRESULT wager-trennen-live pass=' + PASS.length + ' fail=' + FAIL.length + ' pageErrors=' + pageErrors.length);
    if (pageErrors.length) console.log('PAGE ERRORS: ' + JSON.stringify(pageErrors.slice(0, 3)));
    process.exit(FAIL.length ? 1 : 0);
  } catch (e) {
    console.error('ABORT: ' + e.message);
    process.exit(3);
  } finally {
    cleanup();
  }
}
main();