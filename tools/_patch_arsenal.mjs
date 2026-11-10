import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const write = (p, s) => writeFileSync(p, s.replace(/\n/g, '\r\n'));
const rep = (s, old, neu, count = 1) => {
  const n = s.split(old).length - 1;
  if (n !== count) throw new Error('anchor count ' + n + ' (expected ' + count + '): ' + old.slice(0, 90));
  return s.split(old).join(neu);
};

/* ---------------- data.js ---------------- */
let d = read('data.js');

d = rep(d, "stats: { armor: 4, dodge: 8, maxHp: 5, dmgP: -5 }, startWeapon: 'nunchaku',", "stats: { armor: 4, dodge: 8, maxHp: 5, dmgP: -5 }, startWeapon: 'friedenshorn',");
d = rep(d, "stats: { ranged: 12, crit: 8, speed: 5, maxHp: -5 }, startWeapon: 'pistol',", "stats: { ranged: 12, crit: 8, speed: 5, maxHp: -5 }, startWeapon: 'zugriffshaken',");
d = rep(d, "maxWeapons: 1, startWeaponTier: 1, startWeapon: 'wrench',", "maxWeapons: 1, startWeaponTier: 1, startWeapon: 'nietpistole',");
d = rep(d, '"startWeapon": "shotgun"', '"startWeapon": "schildglocke"');
d = rep(d, '"startWeapon": "sniper"', '"startWeapon": "waldlaeuferbogen"');
d = rep(d, '"startWeapon": "nunchaku"', '"startWeapon": "schattenmesser"');
d = rep(d, '"startWeapon": "tesla"', '"startWeapon": "sternkette"');

const weapons = `
  /* ---------- Arsenal 32 (2026-11-09): eine eigene Startwaffe je Held ----------
     Sieben neue Waffen schliessen die letzten geteilten Startloadouts. Jede
     benutzt einen anderen Feuerpfad als die Waffe, die sie ersetzt, und traegt
     einen eigenen Status-/Reichweiten-Vertrag:
       friedenshorn   cone      Stun + Slow, kurze Reichweite
       zugriffshaken   melee     Markierung + Stun, enger Haken
       waldlaeuferbogen charge   volle Ladung durchdringt und verlangsamt
       schildglocke    aura      Draengt Gegner weg und betaeubt sie
       nietpistole     hitscan   Stun + wachsender Schaden pro Ziel
       schattenmesser  projectile Gift + Abpraller
       sternkette      chain     Feuer auf jedem Kettenglied
     Alle sind default-unlocked, damit Shop, Draft und Save sie ohne Sonderweg
     erreichen. */
  W({
    id: 'friedenshorn', name: 'Friedenshorn', cls: ['support', 'elemental'], type: 'cone', col: '#8affb0',
    scaling: { melee: .35, armor: .35 }, unlockDefault: true,
    tiers: [[15, .95, 250, .04, 1.6, 20, { cone: .8, stun: .35, slow: .28, slowT: 1.3 }],
      [24, .91, 270, .05, 1.65, 40, { cone: .84, stun: .4, slow: .3, slowT: 1.4 }],
      [39, .87, 295, .06, 1.75, 80, { cone: .9, stun: .45, slow: .32, slowT: 1.5 }],
      [63, .82, 325, .07, 1.9, 160, { cone: .98, stun: .5, slow: .35, slowT: 1.6 }]],
    special: 'Schlichtender Schallkegel: kurze Reichweite, aber jeder Treffer betaeubt und verlangsamt. Kein Brand.'
  }),
  W({
    id: 'zugriffshaken', name: 'Zugriffs-Haken', cls: ['blade', 'precise'], type: 'melee', col: '#7d9dff',
    scaling: { melee: .75, crit: .2 }, unlockDefault: true,
    tiers: [[15, .62, 135, .12, 1.9, 18, { arc: .75, stun: .6, mark: 2.5, knock: 110 }],
      [24, .59, 145, .13, 2.0, 36, { arc: .78, stun: .7, mark: 2.8, knock: 125 }],
      [40, .56, 158, .15, 2.15, 72, { arc: .82, stun: .8, mark: 3.1, knock: 140 }],
      [66, .52, 175, .17, 2.35, 144, { arc: .88, stun: .9, mark: 3.5, knock: 160 }]],
    special: 'Enger Festnahmehaken: betaeubt das Ziel und markiert es fuer +35% Folgeschaden.'
  }),
  W({
    id: 'waldlaeuferbogen', name: 'Waldlaeuferbogen', cls: ['precise', 'primitive'], type: 'charge', col: '#b8d98a',
    scaling: { ranged: .7, crit: .15 }, unlockDefault: true,
    tiers: [[22, 1.2, 620, .12, 1.9, 24, { chargeT: 1.1, chargeMax: 2.2 }],
      [35, 1.15, 670, .14, 2.0, 48, { chargeT: 1.0, chargeMax: 2.35 }],
      [56, 1.1, 720, .16, 2.15, 96, { chargeT: .9, chargeMax: 2.5 }],
      [90, 1.05, 780, .18, 2.3, 192, { chargeT: .82, chargeMax: 2.7 }]],
    special: 'Volle Ladung schiesst durch die ganze Reihe und verlangsamt jedes getroffene Ziel.'
  }),
  W({
    id: 'schildglocke', name: 'Schildglocke', cls: ['heavy', 'support'], type: 'aura', col: '#a0b8d0',
    scaling: { armor: .55, eng: .25 }, unlockDefault: true,
    tiers: [[12, .95, 155, .04, 1.6, 22, { pull: -140, stun: .22 }],
      [20, .9, 165, .05, 1.65, 44, { pull: -160, stun: .26 }],
      [33, .85, 178, .06, 1.75, 88, { pull: -180, stun: .3 }],
      [54, .8, 195, .07, 1.9, 176, { pull: -210, stun: .34 }]],
    special: 'Bollwerk-Aura: draengt Gegner aus dem Nahbereich und betaeubt sie im Takt der Glocke.'
  }),
  W({
    id: 'nietpistole', name: 'Nietpistole', cls: ['gun', 'support'], type: 'hitscan', col: '#ffb24a',
    scaling: { ranged: .45, eng: .55 }, unlockDefault: true,
    tiers: [[20, .95, 520, .07, 1.7, 20, { perHit: .06, stun: .25 }],
      [33, .9, 555, .08, 1.8, 40, { perHit: .08, stun: .3 }],
      [54, .85, 600, .09, 1.95, 80, { perHit: .10, stun: .35 }],
      [88, .8, 660, .10, 2.1, 160, { perHit: .12, stun: .4 }]],
    special: 'Willis Einarm-Nietpistole: durchdringt die Linie, jeder weitere Treffer sitzt haerter und betaeubt.'
  }),
  W({
    id: 'schattenmesser', name: 'Schattenmesser', cls: ['blade', 'precise'], type: 'projectile', col: '#c7a6ff',
    scaling: { ranged: .4, crit: .2 }, unlockDefault: true,
    tiers: [[9, .5, 380, .14, 1.9, 18, { poison: 6, poisonT: 3, bounce: 1 }],
      [15, .47, 410, .15, 2.0, 36, { poison: 10, poisonT: 3, bounce: 1 }],
      [25, .44, 445, .17, 2.15, 72, { poison: 16, poisonT: 3.2, bounce: 2 }],
      [42, .4, 490, .19, 2.3, 144, { poison: 25, poisonT: 3.4, bounce: 2 }]],
    special: 'Giftige Wurfmesser springen einmal ab und hinterlassen einen Gift-DoT.'
  }),
  W({
    id: 'sternkette', name: 'Sternenkette', cls: ['elemental', 'precise'], type: 'chain', col: '#ffd23e',
    scaling: { elem: .6, ranged: .2 }, unlockDefault: true,
    tiers: [[13, .8, 430, .06, 1.7, 22, { chain: 3, burn: 5 }],
      [21, .76, 460, .07, 1.8, 44, { chain: 3, burn: 8 }],
      [34, .72, 495, .08, 1.95, 88, { chain: 4, burn: 12 }],
      [56, .68, 540, .09, 2.1, 176, { chain: 4, burn: 17 }]],
    special: 'Sternenfeuer springt ueber die Reihe und setzt jedes Kettenglied in Brand.'
  })`;

d = rep(d, "  })\n];\nconst WEAPON_BY_ID = Data.register('weapons'", "  }),\n" + weapons.trimStart() + "\n];\nconst WEAPON_BY_ID = Data.register('weapons'");

const items = `  /* ---------- Item-Pool 125 / Arsenal 32 (2026-11-09) ----------
     Fuenf neue Items, je eines pro Veedel, mit fuenf eigenen Engine-Hooks:
     Kill-Heilung, Nahbereichs-Slow, Ausweich-Nova, Krit-Kette, Kill-Explosion.
     Keines ist nur eine Zahlenkopie eines bestehenden Effekts. */
  I('rettungstrage', 'Rettungstrage', 1, 26, { maxHp: 12, armor: 1 }, 'Traegt dich weiter, wenn der Einsatz vorbei ist.', { killHeal: 2 }),
  I('moosmatte', 'Moosmatte', 2, 44, { armor: 2, hpRegen: 1 }, 'Der Kurpark haelt die Verfolger fest.', { auraSlow: .28, auraRadius: 135 }),
  I('brandungsring', 'Brandungsring', 3, 76, { dodge: 6, speed: 4 }, 'Die Welle antwortet, wenn du ausweichst.', { dodgeNova: 34, dodgeNovaR: 125 }),
  I('kettenreaktor', 'Kettenreaktor', 3, 82, { elem: 12, crit: 4 }, 'Ein Krit reicht, um die Nachbarreihe zu laden.', { critChain: .45, critChainDmg: 22 }),
  I('zuendsatz', 'Zuendsatz', 4, 132, { dmgP: 12, expSize: 15 }, 'Was faellt, reisst die Nachbarschaft mit.', { killBoom: 40, killBoomR: 120 }),
`;

d = rep(d, "  I('goldene_krawatte', 'Goldene Krawatte', 4, 145, { dmgP: 28, crit: 12, speed: 5, maxHp: -12 }, 'Der letzte Schliff vor dem Auftritt.'),\n];\nconst ITEM_BY_ID", "  I('goldene_krawatte', 'Goldene Krawatte', 4, 145, { dmgP: 28, crit: 12, speed: 5, maxHp: -12 }, 'Der letzte Schliff vor dem Auftritt.'),\n" + items + "];\nconst ITEM_BY_ID");

d = rep(d, "'einsatzleitwagen'],", "'einsatzleitwagen', 'rettungstrage'],");
d = rep(d, "'kurparkdenkmal'],", "'kurparkdenkmal', 'moosmatte'],");
d = rep(d, "'rheinfaehre'],", "'rheinfaehre', 'brandungsring'],");
d = rep(d, "'kernspintomograph'],", "'kernspintomograph', 'kettenreaktor'],");
d = rep(d, "'goldene_krawatte']", "'goldene_krawatte', 'zuendsatz']");

write('data.js', d);

/* ---------------- index.html ---------------- */
let s = read('index.html');

s = rep(s, "function itemEffectLine(it) {\n  const out = [];\n", "function itemEffectLine(it) {\n  const out = [];\n  if (it && it.killHeal) out.push('Heilung +' + it.killHeal + ' pro Kill');\n  if (it && it.auraSlow) out.push('Nahbereich -' + Math.round(it.auraSlow * 100) + '% Tempo');\n  if (it && it.dodgeNova) out.push('Ausweichen: Nova ' + it.dodgeNova);\n  if (it && it.critChain) out.push('Krit: Kettenblitz ' + Math.round(it.critChain * 100) + '%');\n  if (it && it.killBoom) out.push('Kill: Explosion ' + it.killBoom);\n");

s = rep(s, "${effect ? '<span class=\"tag support\">Druck</span>' : ''}", "${effect ? '<span class=\"tag support\">Effekt</span>' : ''}");

s = rep(s, "this.turrets = [];\n    this.dashT", "this.turrets = []; this.itemAuraT = 0;\n    this.dashT");

s = rep(s, "this.druckBonus = 0; this.druckDmg = 0; this.druckRadius = 0; this.druckSlow = 0;\n", "this.druckBonus = 0; this.druckDmg = 0; this.druckRadius = 0; this.druckSlow = 0;\n    this.killHeal = 0; this.auraSlow = 0; this.auraRadius = 0; this.dodgeNova = 0; this.dodgeNovaR = 0;\n    this.critChain = 0; this.critChainDmg = 0; this.killBoom = 0; this.killBoomR = 0;\n");
s = rep(s, "      if (it.druckSlow) this.druckSlow += it.druckSlow;\n", "      if (it.druckSlow) this.druckSlow += it.druckSlow;\n      if (it.killHeal) this.killHeal += it.killHeal;\n      if (it.auraSlow) { this.auraSlow = Math.max(this.auraSlow, it.auraSlow); this.auraRadius = Math.max(this.auraRadius, it.auraRadius || 0); }\n      if (it.dodgeNova) { this.dodgeNova += it.dodgeNova; this.dodgeNovaR = Math.max(this.dodgeNovaR, it.dodgeNovaR || 0); }\n      if (it.critChain) { this.critChain = Math.max(this.critChain, it.critChain); this.critChainDmg += it.critChainDmg || 0; }\n      if (it.killBoom) { this.killBoom += it.killBoom; this.killBoomR = Math.max(this.killBoomR, it.killBoomR || 0); }\n");

s = rep(s, "    if (this.regenAcc >= 1) { this.regenAcc -= 1; if (this.st.hpRegen) this.heal(this.st.hpRegen); }\n", "    if (this.regenAcc >= 1) { this.regenAcc -= 1; if (this.st.hpRegen) this.heal(this.st.hpRegen); }\n    this.itemAuraTick(dt);\n");

s = rep(s, "  damage(v, srcAngle) {\n", `  itemAuraTick(dt) {
    if (!(this.auraSlow > 0) || !this.alive) return 0;
    this.itemAuraT = (this.itemAuraT || 0) - dt;
    if (this.itemAuraT > 0) return 0;
    this.itemAuraT = 1;
    let n = 0;
    const list = Game.hash.query(this.x, this.y, this.auraRadius, Game._tmp);
    for (const e of list) {
      if (e.dead || dist(e.x, e.y, this.x, this.y) > this.auraRadius) continue;
      e.applySlow(this.auraSlow, 1.15); n++;
    }
    if (n) FX.ripple(this.x, this.y, this.auraRadius, '#8affb0', .25);
    return n;
  }
  triggerDodgeNova() {
    if (!(this.dodgeNova > 0)) return 0;
    const r = this.dodgeNovaR || 110;
    const list = Game.hash.query(this.x, this.y, r, Game._tmp).slice();
    let n = 0;
    for (const e of list) {
      if (e.dead || dist(e.x, e.y, this.x, this.y) > r + e.r) continue;
      e.hurt(this.dodgeNova, false, this, 'boom');
      e.knockback(Math.atan2(e.y - this.y, e.x - this.x), 180); n++;
    }
    if (n) { FX.shockwave(this.x, this.y, r, '#39e6ff'); AudioSys.sfx('w_sonic'); }
    return n;
  }
  damage(v, srcAngle) {
`);

s = rep(s, "if (r.dodged) { FX.number(p.x, p.y - 22, 'AUSWEICH', '#39e6ff', .9); return; }", "if (r.dodged) { FX.number(p.x, p.y - 22, 'AUSWEICH', '#39e6ff', .9); if (p.dodgeNova) p.triggerDodgeNova(); return; }");

s = rep(s, "    if (src && src.stats) src.stats.kills++;\n", "    if (src && src.stats) src.stats.kills++;\n    if (src && typeof src.heal === 'function' && src.killHeal) src.heal(src.killHeal, 'kill');\n    if (src && src.killBoom && !src._killBoomActive) {\n      src._killBoomActive = true;\n      const br = src.killBoomR || 110;\n      const list = Game.hash.query(this.x, this.y, br, Game._tmp3).slice();\n      for (const q of list) if (q !== this && !q.dead && dist(q.x, q.y, this.x, this.y) <= br + q.r) q.hurt(src.killBoom, false, src, 'boom');\n      FX.shockwave(this.x, this.y, br, '#ff8a3d');\n      AudioSys.sfxAt('boom', this.x, this.y, .8);\n      src._killBoomActive = false;\n    }\n");

s = rep(s, "          e.hurt(d, isCrit, p, 'ranged', p.st.pierce > 0 ? .1 : 0, w);\n          this.onHit(p, w, e, d, isCrit, {});\n", "          e.hurt(d, isCrit, p, 'ranged', p.st.pierce > 0 ? .1 : 0, w);\n          if (x.stun) e.stun = Math.max(e.stun, x.stun);\n          this.onHit(p, w, e, d, isCrit, {});\n");

s = rep(s, "            if (x.stun) e.stun = Math.max(e.stun, x.stun);\n            if (x.engSpark)", "            if (x.stun) e.stun = Math.max(e.stun, x.stun);\n            if (x.mark) e.marked = Math.max(e.marked, x.mark);\n            if (x.engSpark)");

s = rep(s, "            if (x.burn) e.applyElement('fire', x.burn * (1 + p.st.elem / 100), p);\n            this.onHit(p, w, e, dd, isCrit, {}); n++;", "            if (x.burn) e.applyElement('fire', x.burn * (1 + p.st.elem / 100), p);\n            if (x.stun) e.stun = Math.max(e.stun, x.stun);\n            if (x.slow) e.applySlow(x.slow, x.slowT || 1.2);\n            this.onHit(p, w, e, dd, isCrit, {}); n++;");

s = rep(s, "          cur.hurt(dd, isCrit, p, 'elem', 0, w); this.onHit(p, w, cur, dd, isCrit, {});\n", "          cur.hurt(dd, isCrit, p, 'elem', 0, w);\n          if (x.burn) cur.applyElement('fire', x.burn * (1 + p.st.elem / 100), p);\n          this.onHit(p, w, cur, dd, isCrit, {});\n");

s = rep(s, "          e.hurt(dd, isCrit, p, 'ranged', 0, w); this.onHit(p, w, e, dd, isCrit, {});\n        }\n      }\n      AudioSys.sfx('w_vortex');", "          e.hurt(dd, isCrit, p, 'ranged', 0, w); this.onHit(p, w, e, dd, isCrit, {});\n          if (x.stun) e.stun = Math.max(e.stun, x.stun);\n        }\n      }\n      AudioSys.sfx('w_vortex');");

s = rep(s, "    if (t && t.x.healHit) p.heal(t.x.healHit, 'needle');\n    if (t && t.x.druck && !e.dead) this.applyPressure(p, w, e, t);\n", "    if (t && t.x.healHit) p.heal(t.x.healHit, 'needle');\n    if (t && t.x.druck && !e.dead) this.applyPressure(p, w, e, t);\n    if (isCrit && p.critChain > 0 && e && RAND() < p.critChain) {\n      const near = Game.hash.query(e.x, e.y, 190, Game._tmp3).slice();\n      let n = 0;\n      for (const q of near) {\n        if (q === e || q.dead || n >= 2 || dist(q.x, q.y, e.x, e.y) > 190) continue;\n        FX.bolt(e.x, e.y, q.x, q.y, '#ffe27a', 3, 6);\n        q.hurt(p.critChainDmg * (1 + p.st.elem / 100), false, p, 'elem'); n++;\n      }\n      if (n) { FX.ripple(e.x, e.y, 70, '#ffe27a', .2); AudioSys.sfxAt('chain', e.x, e.y, .7); }\n    }\n");

s = rep(s, "drucknagler: 'w_nagler', druckwellenwerfer: 'w_sonic', kolbenramme: 'w_hammer',", "drucknagler: 'w_nagler', druckwellenwerfer: 'w_sonic', kolbenramme: 'w_hammer',\n  friedenshorn: 'w_sonic', zugriffshaken: 'w_knife', waldlaeuferbogen: 'w_arc', schildglocke: 'w_vortex',\n  nietpistole: 'w_railgun', schattenmesser: 'w_needle', sternkette: 'w_tesla',");

write('index.html', s);

console.log('patched data.js and index.html');
