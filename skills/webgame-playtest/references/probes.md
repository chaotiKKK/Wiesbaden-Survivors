# Reusable probes

Copy-paste snippets, adapted to the game's real globals (often `Game`/`UI`).
Each snippet answers one question; none of them modify the game's source.

## Is the page / engine actually ticking?

```js
// rAF probe — 0 callbacks means the preview cannot run real-time frames.
new Promise(res => {
  window.__rafN = 0;
  requestAnimationFrame(() => window.__rafN++);
  setTimeout(() => res(JSON.stringify({ rafFired: window.__rafN, state: Game.state,
    wave: Game.wave, waveTimer: Game.waveTimer })), 1200);
})
```

## Fast-forward the engine when rAF is dead

```js
// Wave-clearing batch. Stop when state leaves 'play' so overlays are not
// skipped past; snapshot/read after every batch.
let n = 0; const max = 600;
while (n < max && Game.state === 'play' && Game.waveTimer > 0) { Game.update(1 / 60); n++; }
return JSON.stringify({ frames: n, state: Game.state, wave: Game.wave,
  hp: Game.players[0] ? Math.ceil(Game.players[0].hp) : '?' });
```

## Start a run through the menus (reliable handles)

```js
// Prefer data-act / id handles over visible text: 'Bestätigen ▶' is mixed-case
// in the DOM while the a11y tree shows 'BESTÄTIGEN ▶', so text matches lie.
// When unsure what a screen offers, enumerate its actions first:
//   [...document.querySelectorAll('#scChar [data-act]')].map(b => b.dataset.act)
document.querySelector('[data-act="play"]').click();      // or daily/coop/seedPlay
const conf = document.querySelector('[data-act="charConfirm"]'); // char select confirm
if (conf) conf.click();
const go = [...document.querySelectorAll('button')].find(b => /LOS GEHT/i.test(b.textContent));
if (go) go.click();
// You are now at wave 1. Check Game.state === 'play' before asserting further.
```

## Click a row that is a div, not a button (option toggles, offer cards)

```js
(() => {
  const els = [...document.querySelectorAll('#optList .opt')];
  const el = els.find(e => e.querySelector('.lbl') && /^Tutorial-Hinweise$/i.test(e.querySelector('.lbl').textContent.trim()));
  if (!el) return 'NOTFOUND';
  el.click(); // option rows cycle on click
  const row = [...document.querySelectorAll('#optList .opt')].find(e => e.querySelector('.lbl') && /^Tutorial-Hinweise$/i.test(e.querySelector('.lbl').textContent.trim()));
  return 'after: ' + row.querySelector('.val').textContent.trim();
})()
```

## Resolve queued level-up picks

```js
let picks = 0;
while (Game.state === 'levelup') {
  const c = document.querySelector('#scLevel .lvlCard');
  if (!c) break;
  c.click(); // card click = take the upgrade
  picks++;
}
return JSON.stringify({ picks, state: Game.state });
```

## Tutorial cue gating check

```js
const el = document.getElementById('tutHint');
return JSON.stringify({
  tutHidden: el ? el.classList.contains('hidden') : 'no-element',
  skipBtn: !!document.querySelector('[data-act="tutSkip"]')
});
```

## Seed determinism fingerprint (same seed → identical wave 1)

```js
const hud = document.getElementById('hud').textContent;
return JSON.stringify({
  seed: (hud.match(/SEED\s*(\d+)/i) || [])[1] || '?',
  arena: (hud.match(/[A-ZÄÖÜ][A-ZÄÖÜ\- ]+(?:TERRASSEN|UFER|PARK|MARKT|BERG|PLATZ|HOF|HAUS)/i) || [])[0] || '?',
  firstSpawns: Game.enemies.slice(0, 6).map(e => (e.def && (e.def.id || e.def)) || e.def).join('|')
});
```

## Avoid the native-dialog hang (confirm/alert block automation)

```js
window.confirm = () => true;   // stub BEFORE clicking anything that may confirm
// ... click, then read state
```

## Cache-busted reload (the bridge may serve a stale page)

Navigate to `http://127.0.0.1:<port>/index.html?cb=<unique>` and verify your
edit's marker exists in the live DOM before trusting further reads.

## localStorage hygiene (clean slate → wipe at pass end)

```js
localStorage.clear();              // pass start
window.confirm = () => true;
document.querySelector('[data-act="wipe"]').click();  // pass end, if the game has a wipe action
```

## Robust title-footer read (text order/case varies)

```js
const t = document.getElementById('scTitle').textContent.replace(/\s+/g, ' ');
// Footer label is now 'Beste geschaffte Welle' (completed waves) — tolerate words between 'Beste' and 'Welle:'
const m = t.match(/Beste [^:]*Welle:\s*(\d+)[\s\S]*?Siege:\s*(\d+)[\s\S]*?Runs:\s*(\d+)[\s\S]*?Kills:\s*(\d+)/i);
return JSON.stringify(m ? { wave: m[1], siege: m[2], runs: m[3], kills: m[4] } : { raw: t.slice(-160) });
```

## Which screen is current / what is on it

```js
const vis = document.querySelector('.screen:not(.hidden)');
return vis ? vis.id + ': ' + vis.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : 'none';
```
