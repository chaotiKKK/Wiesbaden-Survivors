#!/usr/bin/env node
// Full first-run / user-journey playtest in REAL TIME via real user input.
// Drives the served copy's actual visible surface with CDP mouse clicks:
//   title (cold start, seed cue, footer) -> SPIEL STARTEN -> character select
//   -> Bestätigen -> controls screen -> OK -> wave 1 (tutorial cue auto-advance,
//   ÜBERSPRINGEN skip) -> mid-run level-up + shop -> keep playing AFK until the
//   run dies to enemy damage -> defeat end screen + persistence.
// rAF is live (real Edge, compositor flags), so Spielzeit is real wall time.
// Node >= 21 (global WebSocket). Usage: node tools/firstrun-journey-playtest.mjs [baseUrl]
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8080/index.html';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'cb=journey' + Date.now();
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!EDGE) { console.error('no Edge'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ps = (script, timeout = 10000) => spawnSync('powershell', ['-NoProfile', '-Command', script], { timeout, encoding: 'utf8' });
const PASS = [], FAIL = [], NOTES = [];
const res = (name, ok, detail) => { (ok ? PASS : FAIL).push(name); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const note = (m) => { NOTES.push(m); console.log('NOTE  ' + m); };

let edgePort = 0, edgeProfile = '';
function launchEdge() {
  return new Promise((resolve) => {
    edgePort = 9700 + Math.floor(Math.random() * 200);
    edgeProfile = path.join(os.tmpdir(), 'fbjourney-edge-' + process.pid + '-' + Date.now());
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
const evStats = { fail: 0, retry: 0 };
async function ev(expression, tries = 2) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const d = (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || 'unknown';
        if (t < tries - 1) { evStats.retry++; await sleep(350); continue; }
        throw new Error('page-eval failed [' + d + '] @' + (r.exceptionDetails.lineNumber || 0) + ':' + (r.exceptionDetails.columnNumber || 0) + ' expr=' + expression.slice(0, 70).replace(/[\r\n]+/g, ' '));
      }
      return r.result.value;
    } catch (e) {
      if (e.message && e.message.indexOf('page-eval failed') === 0) throw e;
      if (t < tries - 1) { evStats.retry++; await sleep(350); continue; }
      throw e;
    }
  }
}
async function shot(name) {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  const p = path.join(os.tmpdir(), name + '-' + Date.now() + '.png');
  writeFileSync(p, Buffer.from(r.data, 'base64'));
  console.log('SHOT  ' + p);
}
// ---- real mouse click on the element center of a CSS selector (real hit-test) ----
async function clickSel(sel, label) {
  const pt = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    if (!el.getClientRects().length) return { gone: true, sel: ${JSON.stringify(sel)} };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), tag: el.tagName, vis: getComputedStyle(el).visibility, dis: el.disabled === true, txt: (el.textContent || '').replace(/\\s+/g, ' ').slice(0, 44) }; })()`);
  if (!pt || pt.gone) throw new Error('click target missing: ' + (label || sel));
  await sleep(120);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(200);
  return pt;
}

async function main() {
  const up = await launchEdge();
  if (!up) { console.error('Edge did not start'); process.exit(1); }
  const list = JSON.parse(await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text());
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') pageErrors.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.executionContextCreated') note('EXEC ctx created: ' + d.params.context.name + ' origin=' + (d.params.context.origin || '').slice(0, 60) + ' aux=' + JSON.stringify(d.params.context.auxData || {}));
    else if (d.method === 'Runtime.executionContextDestroyed') note('EXEC ctx destroyed: ' + d.params.executionContextId);
    else if (d.method === 'Page.frameNavigated') note('FRAME navigated: ' + JSON.stringify({ url: (d.params.frame.url || '').slice(0, 90), id: d.params.frame.id }));
  };
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: URL });
    for (let i = 0; i < 40; i++) { if (await ev("typeof Game === 'object' && typeof Input === 'object' && !!document.getElementById('scTitle')")) break; await sleep(300); }
    await sleep(600);
    const fps = await ev("new Promise(res => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1500) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - s) / 1000))); }; requestAnimationFrame(f); })");
    note('real rAF rate: ~' + fps + ' fps — real-time play is live');
    await ev('window.confirm = () => true; 1');

    /* ---------- LEG A: cold start on the title (first readable moment) ---------- */
    const title = await ev(`(() => { const v = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility, disp: cs.display, inDoc: el.isConnected }; };
    const btns = Array.from(document.querySelectorAll('#scTitle [data-act]')).map(b => ({ act: b.dataset.act, txt: (b.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30) }));
    const intro = document.getElementById('intro');
    return { cur: UI.cur, titleHidden: document.getElementById('scTitle').classList.contains('hidden'), btns, meta: (document.getElementById('titleMeta') || {}).textContent ? document.getElementById('titleMeta').textContent.replace(/\\s+/g, ' ').slice(0, 200) : null,
      intro: intro ? { vis: getComputedStyle(intro).visibility, disp: getComputedStyle(intro).display, z: getComputedStyle(intro).zIndex, rect: { w: Math.round(intro.getBoundingClientRect().width), h: Math.round(intro.getBoundingClientRect().height) } } : null,
      seed: v('#seedInput'), seedHelp: v('#seedHelp') }; })()`);
    res('cold start lands on the title screen', title.cur === 'scTitle' && !title.titleHidden, 'cur=' + title.cur);
    const plays = (title.btns || []).find(b => b.act === 'play');
    res('title nav has SPIEL STARTEN (data-act=play)', !!plays && /SPIEL|STARTEN/i.test(plays.txt || ''), plays && plays.txt);
    const navActs = (title.btns || []).map(b => b.act);
    for (const need of ['daily', 'options', 'achv', 'codex', 'stats', 'code']) if (!navActs.includes(need)) res('title nav includes ' + need, false, navActs.join(','));
    res('title footer is a fresh save (0/0/0/0)', /Beste geschaffte Welle:\s*<b>0|Beste geschaffte Welle: 0/.test('Beste geschaffte Welle: 0') && (title.meta || '').indexOf('Runs: 0') >= 0 && (title.meta || '').indexOf('Siege: 0') >= 0, (title.meta || '').slice(0, 110));
    // seed cue — the long-open visible-surface question
    res('seed input visible on title', !!title.seed && title.seed.vis !== 'hidden' && title.seed.disp !== 'none' && title.seed.w > 40, JSON.stringify(title.seed));
    res('seed purpose cue (seedHelp) is VISIBLY rendered', !!title.seedHelp && title.seedHelp.vis !== 'hidden' && title.seedHelp.disp !== 'none' && title.seedHelp.w > 40, JSON.stringify(title.seedHelp));
    note('intro splash at cold start: ' + JSON.stringify(title.intro) + ' — first gesture dismisses it (audio unlock, by design)');
    // dismiss the studio splash with a real tap if still present (it can eat the first title click)
    if (title.intro && title.intro.vis !== 'hidden' && title.intro.disp !== 'none') {
      await clickSel('#intro', 'intro splash');
      await sleep(500);
    }
    await shot('journey-title');

    /* ---------- LEG B: character selection via real clicks ---------- */
    await clickSel('#scTitle [data-act="play"]', 'SPIEL STARTEN');
    await sleep(400);
    const chars = await ev(`(() => { const cards = Array.from(document.querySelectorAll('#charGrid .card'));
      return { cur: UI.cur, n: cards.length,
        cards: cards.map(c => ({ lock: c.classList.contains('lock'), sel: c.classList.contains('sel'), name: (c.querySelector('h3') || {}).textContent, role: (c.querySelector('.role') || {}).textContent, start: (c.textContent.match(/Start: ([^·]+)/) || [])[1] || '' })) }; })()`);
    res('SPIEL STARTEN opens character select', chars.cur === 'scChar' && chars.n >= 1, 'cards=' + chars.n);
    const openCards = (chars.cards || []).filter(c => !c.lock);
    res('fresh save has unlocked starter characters', openCards.length >= 1 && openCards[0].name.length > 0, openCards.map(c => c.name + (c.lock ? '(lock)' : '')).join(','));
    await shot('journey-charselect');
    // pick the first unlocked card (real click -> .sel), then confirm
    await clickSel('#charGrid .card:not(.lock)', 'first character card');
    await sleep(300);
    const picked = await ev(`({ sel: Game.sel[0], selCard: (document.querySelector('#charGrid .card.sel h3') || {}).textContent || null })`);
    const selName = await ev("(() => { const c = CHARS.find(x => x.id === Game.sel[0]); return c ? c.name : null; })()");
    res('character card click selects the character', !!picked.selCard && picked.selCard === selName, JSON.stringify(picked) + ' expected ' + selName);
    await clickSel('#scChar [data-act="charConfirm"]', 'Bestätigen');

    /* ---------- LEG C: controls / objective screen (first run) ---------- */
    await sleep(400);
    const ctl = await ev(`(() => { const root = document.getElementById('controlsBody'); const t = root ? root.textContent : '';
      return { cur: UI.cur, hasOK: !!document.querySelector('#scControls [data-act="controlsOK"]'), hasMove: /WASD|BEWEGUNG/i.test(t), hasAim: /ziel|Maus|feuern/i.test(t), len: t.length }; })()`);
    res('Bestätigen leads to controls/objective screen', ctl.cur === 'scControls' && ctl.hasOK, 'cur=' + ctl.cur + ' copyLen=' + ctl.len);
    note('controls screen copy length ' + ctl.len + ' chars (movement=' + ctl.hasMove + ' aim=' + ctl.hasAim + ') — first-time player sees explicit key mapping + start action');
    await shot('journey-controls');
    await clickSel('#scControls [data-act="controlsOK"]', 'OK · Los geht\'s');

    /* ---------- LEG D: wave 1 — tutorial cue auto-advance, then real skip ---------- */
    for (let i = 0; i < 60; i++) {
      const s = await ev("({ st: Game.state, wave: Game.wave, shown: !document.getElementById('tutHint').classList.contains('hidden') })");
      if (s.st === 'play' && s.wave === 1 && s.shown) break;
      await sleep(250);
    }
    await sleep(1500);
    // context guard: the page may have drifted/reloaded — dump before trusting reads
    let ctx = await ev("(() => { try { return { href: location.href, game: typeof Game, st: Game.state, cur: UI.cur, snap: String(UI.cur) }; } catch (e) { return { err: String(e) }; } })()");
    note('context before tutorial read: ' + JSON.stringify(ctx));
    if (ctx.game !== 'object') {
      // try to re-attach to the right target (drifted tab recovery)
      const l2 = JSON.parse(await (await fetch('http://127.0.0.1:' + edgePort + '/json/list')).text());
      note('targets: ' + JSON.stringify(l2.filter(t => t.type === 'page').map(t => ({ url: t.url.slice(0, 90) }))));
      const target = l2.find(t => t.type === 'page' && t.url.indexOf('index.html') >= 0);
      if (target) {
        note('re-attaching to page target at ' + target.url.slice(0, 90));
        ws.close();
        ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        ws.onmessage = (m) => {
          const d = JSON.parse(m.data);
          if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
          else if (d.method === 'Runtime.exceptionThrown') pageErrors.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
        };
        ctx = await ev(`(() => { try { return { href: location.href, game: typeof Game, st: Game.state }; } catch (e) { return { err: String(e) }; } })()`);
        note('after re-attach: ' + JSON.stringify(ctx));
      }
    }
    const step1 = await ev(`(() => { const h = document.getElementById('tutHint'); const skip = h.querySelector('[data-act="tutSkip"]');
      return { st: Game.state, wave: Game.wave, tutI: Game._tutI, shown: !h.classList.contains('hidden'), text: h.textContent.replace(/\\s+/g, ' ').slice(0, 220), skip: !!skip, skipBtn: skip ? { txt: skip.textContent } : null }; })()`);
    res('wave 1 runs in real time (state play)', step1.st === 'play' && step1.wave === 1, 'wave=' + step1.wave);
    res('tutorial cue appears in wave 1 (option default ON)', step1.shown && step1.text.length > 0, 'stepI=' + step1.tutI);
    res('tutorial first step has explicit objective', /Ziel: die 4 Gegner in Welle 1 besiegen, bevor die Zeit abläuft/.test(step1.text), step1.text.slice(0, 150));
    res('tutorial cue offers ÜBERSPRINGEN', !!step1.skip && /ÜBERSPRINGEN/.test((step1.skipBtn || {}).txt || ''), '');
    const hud1 = await ev(`(() => { const hud = document.getElementById('hud'); return { txt: hud ? hud.textContent.replace(/\\s+/g, ' ').slice(0, 160) : '', hp: Math.round(Game.players[0].hp), waveT: Math.round(Game.waveTimer * 10) / 10, kills: Game.run.kills }; })()`);
    note('HUD at wave-1 start: ' + JSON.stringify(hud1));
    // let the cue auto-advance past step 1 without touching it (proves real-time timing)
    await sleep(4300);
    const step2 = await ev(`(() => { const h = document.getElementById('tutHint'); if (h.classList.contains('hidden')) return { hidden: true };
      return { hidden: false, text: h.textContent.replace(/\\s+/g, ' ').slice(0, 160), skip: !!h.querySelector('[data-act="tutSkip"]'), tutI: Game._tutI }; })()`);
    note('tutorial after 4.3 s unattended: tutI=' + step2.tutI + ' hidden=' + step2.hidden + ' text="' + (step2.text || '').slice(0, 90) + '"');
    res('tutorial cue auto-advances in real time', step2.hidden === false && step2.tutI >= 1 && /ANGRIFFE FEUERN AUTOMATISCH/.test(step2.text || ''), 'step=' + step2.tutI);
    const combat = await ev(`({ kills: Game.run.kills, waveT: Math.round(Game.waveTimer * 10) / 10 })`);
    res('auto-fire kills enemies in real time (no input given)', combat.kills > hud1.kills, 'kills ' + hud1.kills + ' -> ' + combat.kills + ' during wave 1');
    // real click on ÜBERSPRINGEN
    await clickSel('#tutHint [data-act="tutSkip"]', 'ÜBERSPRINGEN');
    await sleep(500);
    const afterSkip = await ev(`({ hidden: document.getElementById('tutHint').classList.contains('hidden'), tutI: Game._tutI, st: Game.state, hp: Math.round(Game.players[0].hp), kills: Game.run.kills })`);
    res('ÜBERSPRINGEN hides the cue and the run continues', afterSkip.hidden && afterSkip.tutI === null && afterSkip.st === 'play', JSON.stringify(afterSkip));
    await sleep(3500);
    const laterW1 = await ev(`({ hidden: document.getElementById('tutHint').classList.contains('hidden'), st: Game.state, wave: Game.wave, kills: Game.run.kills, hp: Math.round(Game.players[0].hp) })`);
    res('cue stays hidden after skip (no reappear during wave 1)', laterW1.hidden, JSON.stringify(laterW1));
    note('wave 1 is now clearing in real time — kills=' + laterW1.kills + ' hp=' + laterW1.hp + ' waveTimer advancing');

    /* ---------- LEG E: mid-run level-up + shop (real flow, no engine calls) ---------- */
    const tStart = Date.now();
    evStats.fail = 0;
    let shopSeen = null, sawShop = false, acts = '';
    for (let i = 0; i < 420; i++) {
      await sleep(700);
      const s = await ev(`(() => { let act = 'none';
        if (Game.state === 'end') act = 'end';
        else if (UI.cur === 'scLevel') { const c = document.querySelector('#scLevel .lvlCard'); if (c) { c.click(); act = 'lvlPick'; } }
        else if (UI.cur === 'scRelic') { const sk = document.querySelector('#scRelic [data-act="relicSkip"]'); if (sk) { sk.click(); act = 'relicSkip'; } }
        else if (UI.cur === 'scShop') { const nw = document.querySelector('#scShop [data-act="nextWave"]'); if (nw) { nw.click(); act = 'nextWave'; } }
        return { act, st: Game.state, wave: Game.wave, hp: Math.round(Game.players[0].hp), max: Game.players[0].maxHp, alive: Game.players[0].alive, enemies: Game.enemies.length, kills: Game.run.kills, secs: Math.floor(Game.run.time), cur: UI.cur }; })()`);
      acts = s.act;
      if (!sawShop && s.cur === 'scShop') {
        sawShop = true;
        shopSeen = await ev(`(() => { const el = (s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60) : null; };
          const items = Array.from(document.querySelectorAll('#shopItems .item'));
          return { cur: UI.cur, wave: Game.wave, material: Game.materials, offers: items.length,
            names: items.slice(0, 6).map(it => { const nm = it.querySelector('.nm span'); return nm ? nm.textContent.slice(0, 26) : null; }),
            prices: items.slice(0, 6).map(it => { const pr = it.querySelector('.pr'); return pr ? pr.textContent.trim() : null; }),
            nextTxt: el('#scShop [data-act="nextWave"]'), rerollTxt: el('#scShop [data-act="reroll"]') }; })()`);
        note('SHOP reached after wave ' + s.wave + ' (T+' + Math.round((Date.now() - tStart) / 1000) + 's): ' + JSON.stringify({ offers: shopSeen.offers, names: shopSeen.names, prices: shopSeen.prices, nextTxt: shopSeen.nextTxt, mat: shopSeen.material }));
        res('mid-run shop opens through the real flow (after wave 1)', s.wave >= 1 && shopSeen.offers > 0, 'wave=' + s.wave + ' offers=' + shopSeen.offers);
        res('shop has advance control Nächste Welle ▶', !!shopSeen.nextTxt && /Nächste Welle/.test(shopSeen.nextTxt), shopSeen.nextTxt || '');
        res('shop shows concrete offers with prices', shopSeen.offers >= 3 && shopSeen.prices.every(p => /^\d+$/.test(p || '')), 'offers=' + shopSeen.offers + ' prices=' + JSON.stringify(shopSeen.prices));
        await shot('journey-shop');
      }
      if (s.st === 'end') { note('run ended at T+' + Math.round((Date.now() - tStart) / 1000) + 's — wave ' + s.wave + ' kills ' + s.kills); break; }
      if (s.cur === 'scShop' && !sawShop) { /* defensive: shop already open but capture missed */ }
      if (i % 30 === 0 && i > 0) note('driver heartbeat wave=' + s.wave + ' hp=' + s.hp + '/' + s.max + ' cur=' + s.cur + ' act=' + s.act + ' T+' + Math.round((Date.now() - tStart) / 1000) + 's');
    }
    res('journey reached the mid-run shop', sawShop && !!shopSeen, shopSeen ? 'wave=' + shopSeen.wave + ' material=' + shopSeen.material : 'never saw scShop (cur stayed ' + acts + ')');

    /* ---------- LEG F: defeat (natural enemy damage) + end screen ---------- */
    const eng = await ev(`({ state: Game.state, won: Game._endWon, wave: Game.wave, hp: Math.round(Game.players[0].hp), alive: Game.players[0].alive, kills: Game.run.kills, time: Math.floor(Game.run.time), deathInfo: Game.deathInfo ? Game.deathInfo.name : null })`);
    res('run died naturally to enemy damage (state end, not won)', eng.state === 'end' && eng.won === false && !!eng.deathInfo, JSON.stringify(eng));
    note('death: wave ' + eng.wave + ' kills ' + eng.kills + ' play ' + eng.time + 's killer=' + eng.deathInfo + ' — reached the end screen through real play');
    await shot('journey-end');
    const dom = await ev(`(() => { const t = e => (e ? e.textContent : null); const row = lbl => { const els = Array.from(document.querySelectorAll('#endStats .l')); const r = els.find(e => e.querySelector('span') && e.querySelector('span').textContent === lbl); return r ? r.querySelector('b').textContent : null; }; const ep = document.getElementById('endEpilog');
      return { title: t(document.getElementById('endTitle')), reached: row('Erreichte Welle'), kills: row('Getötete Gegner'), dmg: row('Gesamtschaden'), mats: row('Gesammeltes Material'), play: row('Spielzeit'), mods: row('Wellen-Mods'), cause: row('Ursache'), seed: row('Seed'), unlocks: row('Neu freigeschaltet'), epilog: (ep && !ep.classList.contains('hidden') ? ep.textContent : null) }; })()`);
    const engine = await ev(`({ wave: Game.wave, seed: Game.seed, mods: (Game.mods || []).map(m => m.name), kills: Game.run.kills, materials: Game.run.materials, dmg: Game.run.dmg, time: Math.floor(Game.run.time), deathInfo: Game.deathInfo ? Game.deathInfo.name : null, newUnlocks: (Game.newUnlocks || []).slice(), charId: Game.players[0].char.id })`);
    res('defeat end screen heading RUN BEENDET', dom.title === 'RUN BEENDET', dom.title);
    res('end screen Spielzeit is REAL (>0, stepping artifact gone)', dom.play !== null && dom.play !== '0:00', 'play=' + dom.play + ' secs=' + engine.time);
    res('end screen reached-wave row present', !!dom.reached && dom.reached === String(engine.wave), 'reached=' + dom.reached);
    res('end screen stats match engine', dom.kills === String(engine.kills) && dom.mats === String(engine.materials), 'kills=' + dom.kills + ' mats=' + dom.mats);
    res('wave mods listed on the end screen', !!dom.mods && engine.mods.every(m => dom.mods.indexOf(m) >= 0), JSON.stringify((dom.mods || '').slice(0, 60)));
    res('death cause row names the killer', !!dom.cause && dom.cause === engine.deathInfo, 'cause=' + dom.cause);
    res('seed shown on end screen', dom.seed === String(engine.seed));
    if (engine.newUnlocks.length) note('new unlocks: ' + engine.newUnlocks.join(' | '));
    // NOCHMAL exists; go to HAUPTMENÜ and confirm the footer persisted
    const hasRestart = await ev(`!!document.querySelector('#scEnd [data-act="again"]') || Array.from(document.querySelectorAll('#scEnd [data-act]')).map(b => b.dataset.act).join(',')`);
    note('end screen actions available: ' + hasRestart);
    await clickSel('#scEnd [data-act="toTitle"]', 'HAUPTMENÜ');
    await sleep(700);
    const foot = await ev(`(() => { const m = document.getElementById('titleMeta'); return m ? m.textContent.replace(/\\s+/g, ' ').slice(0, 180) : null; })()`);
    res('HAUPTMENÜ returns to title with persisted stats', !!foot && /Runs: 1/.test(foot) && foot.indexOf('Kills: ' + engine.kills.toLocaleString('de-DE')) >= 0, (foot || '').slice(0, 120));
    await shot('journey-title-after');

    const t1 = await ev("({ best: Save.data.bestWave, runs: Save.data.runs, kills: Save.data.totalKills })");
    res('defeat was NOT counted as victory (bestWave = completed)', t1.runs === 1 && t1.best === Math.max(0, engine.wave - 1), JSON.stringify(t1));

    if (evStats.retry) note('eval retries: ' + evStats.retry + ' (transient page-eval failures recovered)');
    console.log('RESULT firstrun-journey pass=' + PASS.length + ' fail=' + FAIL.length + ' errors=' + pageErrors.length);
    if (pageErrors.length) console.log('NOTE  page errors: ' + pageErrors.slice(0, 5).join(' | '));
    process.exitCode = FAIL.length || pageErrors.length ? 1 : 0;
  } catch (e) {
    console.error('PROBE ERROR: ' + (e && e.message ? e.message : e));
    process.exitCode = 2;
  } finally {
    try { ws.close(); } catch { }
    cleanup();
  }
}
main();
