// Daten-Registries (reine Tabellen + Data-Infrastruktur), extrahiert aus index.html.
// Muss VOR dem Engine-Script geladen werden: klassische Scripts teilen den globalen
// Lexikal-Scope, die top-level consts (CHARS, WEAPONS, ...) sind also im Engine-Script
// sichtbar. Reihenfolge = Originaldatei. Data.validate() laeuft nur im ?selftest.
const STAT_DEF = [
  ['maxHp', 'Max. Leben', ''], ['hpRegen', 'HP-Regeneration', ''], ['lifesteal', 'Lebensraub', '%'],
  ['dmgP', 'Schaden', '%'], ['melee', 'Nahkampfschaden', ''], ['ranged', 'Fernkampfschaden', ''],
  ['elem', 'Elementarschaden', ''], ['atkSpd', 'Angriffstempo', '%'], ['crit', 'Krit. Chance', '%'],
  ['critDmg', 'Krit. Schaden', '%'], ['eng', 'Technik', ''], ['range', 'Reichweite', '%'],
  ['armor', 'Rüstung', ''], ['dodge', 'Ausweichen', '%'], ['speed', 'Tempo', '%'],
  ['luck', 'Glück', ''], ['harvest', 'Ernte', ''], ['xpGain', 'EP-Gewinn', '%'],
  ['expSize', 'Explosionsgröße', '%'], ['pierce', 'Durchschlag', ''], ['bounce', 'Abpraller', ''],
  ['knock', 'Rückstoß', '%'], ['abilityRank', 'Fähigkeitsstufe', ''], ['abilityCdMod', 'Fähigkeits-CD', '%']
];
const STAT_KEYS = STAT_DEF.map(s => s[0]);
const STAT_NAME = {}; const STAT_UNIT = {};
STAT_DEF.forEach(s => { STAT_NAME[s[0]] = s[1]; STAT_UNIT[s[0]] = s[2]; });

const Data = {
  _tables: {},
  register(name, rows, schema) {
    const byId = {};
    for (const r of rows) if (r && r.id !== undefined) byId[r.id] = r;
    this._tables[name] = { rows, schema, byId };
    return { byId };
  },
  registerMap(name, source, valueRule) {
    const rows = Object.keys(source).map(id => ({ id, value: source[id] }));
    const byId = Object.assign({}, source);
    const schema = { id: 'id', value: valueRule || 'req' };
    this._tables[name] = { rows, schema, byId };
    return { byId };
  },
  /* Prueft alle registrierten Tabellen gegen ihre Schemas; liefert Fehler-Liste.
     Schema-Regeln: 'id' | 'req' | 'str' | 'num' | 'num>0' | 'num>=0' |
     'ref:<tabelle>' | 'in:a,b,c' | Funktion (row, v) -> Fehlertext|null */
  validate() {
    const errors = [];
    for (const name in this._tables) {
      const t = this._tables[name];
      if (!t.schema) continue;
      const seen = {};
      const label = (row) => String(row.id !== undefined ? row.id : (row.n !== undefined ? 'n' + row.n : '?'));
      const check = (row, key, rule) => {
        const v = row[key];
        if (typeof rule === 'function') {
          const e = rule(row, v);
          if (e) errors.push(name + '[' + label(row) + '].' + key + ': ' + e);
          return;
        }
        const parts = String(rule).split('|');
        for (const part of parts) {
          if (part === 'id') {
            if (v === undefined || v === null || typeof v !== 'string') { errors.push(name + '[' + label(row) + ']: id fehlt/ungueltig'); continue; }
            if (seen[v]) errors.push(name + ': doppelte id ' + v);
            seen[v] = 1;
          } else if (part === 'req') {
            if (v === undefined || v === null) errors.push(name + '[' + label(row) + ']: Pflichtfeld ' + key + ' fehlt');
          } else if (part === 'str') {
            if (v !== undefined && typeof v !== 'string') errors.push(name + '[' + label(row) + '].' + key + ': kein String (' + typeof v + ')');
          } else if (part === 'num') {
            if (v !== undefined && !(typeof v === 'number' && isFinite(v))) errors.push(name + '[' + label(row) + '].' + key + ': keine Zahl (' + typeof v + ')');
          } else if (part.indexOf('num>=') === 0) {
            if (v !== undefined && !(typeof v === 'number' && v >= +part.slice(5))) errors.push(name + '[' + label(row) + '].' + key + ': nicht >= ' + part.slice(5) + ' (' + v + ')');
          } else if (part.indexOf('num>') === 0) {
            if (v !== undefined && !(typeof v === 'number' && v > +part.slice(4))) errors.push(name + '[' + label(row) + '].' + key + ': nicht > ' + part.slice(4) + ' (' + v + ')');
          } else if (part.indexOf('ref:') === 0) {
            const tn = part.slice(4);
            const target = this._tables[tn] && this._tables[tn].byId;
            if (v !== undefined && v !== null && (!target || !target[v])) errors.push(name + '[' + label(row) + '].' + key + ': unbekannte Referenz ' + v + ' (Tabelle ' + tn + ')');
          } else if (part.indexOf('in:') === 0) {
            const allowed = part.slice(3).split(',');
            if (v !== undefined && !allowed.includes(v)) errors.push(name + '[' + label(row) + '].' + key + ': Wert ' + v + ' nicht in {' + allowed.join(', ') + '}');
          }
        }
      };
      for (const row of t.rows) {
        if (!row || typeof row !== 'object') { errors.push(name + ': Zeile ist kein Objekt'); continue; }
        for (const key in t.schema) check(row, key, t.schema[key]);
      }
    }
    return errors;
  }
};
Data.register('statDefinitions', STAT_DEF.map(s => ({ id: s[0], name: s[1], unit: s[2] })), { id: 'id', name: 'req|str', unit: 'str' });

const CHARS = [
  {
    id: 'leonidas', name: 'Leonidas', role: 'Allrounder · Feuerwehr', col: '#ffcf4a', col2: '#e2564a',
    desc: '7 Jahre, lange Haare, Mitglied der freiwilligen Feuerwehr, verehrt die Polizei und will selbst Polizist werden. Spielt leidenschaftlich Gitarre.',
    skin: { build: 'kid', head: '#f2d5b0', hat: 'fire', prop: 'guitar', chest: '#ffcf4a' },
    stats: { speed: 8, maxHp: 15, ranged: 10, crit: 5, armor: 2 }, startWeapon: 'loeschwasser',
    ability: { id: 'loeschstrahl', name: 'Löschstrahl', cd: 9, desc: 'Kegel aus Hochdruckwasser: Schaden, Rückstoß, löscht Brände und verlangsamt.' },
    synergy: { cls: 'gun', need: 3, stats: { atkSpd: 12, ranged: 8 }, text: '3× Gun: +12% Angriffstempo, +8 Fernkampf' }
  },
  {
    id: 'sylvia', name: 'Sylvia', role: 'Therapeutin · Support', col: '#ff5d7a', col2: '#ffd7a1',
    desc: 'Sportliche Polin mit roten Haaren, arbeitet als Therapeutin. Emotionale Stütze des Teams — heilt, stützt, hält alle am Leben.',
    skin: { build: 'normal', head: '#ffd7a1', hat: 'pony', prop: 'nunchaku', chest: '#fff' },
    stats: { hpRegen: 2, lifesteal: 6, luck: 15, dmgP: -10 }, startWeapon: 'nunchaku',
    ability: { id: 'heilaura', name: 'Heilaura', cd: 12, desc: 'Pulsierende Aura: heilt beide Spieler, reinigt Statuseffekte, gibt kurz +Rüstung.' },
    synergy: { cls: 'medical', need: 2, stats: { hpRegen: 3, lifesteal: 10 }, text: '2× Medical: +3 HP-Reg, +10% Lebensraub' }
  },
  {
    id: 'sebbo', name: 'Sebbo', role: 'Halbgott · Techno-Tüftler', col: '#59e6ff', col2: '#a06bff',
    sprite: 'sebbo',
    desc: 'Nachbar, Fachinformatiker, Philosoph und Halbgott mit technomagischen Fähigkeiten. Kein Klotz, sondern agiler Bastler: Gadgets, Drohnen, Ausweichmanöver.',
    skin: { build: 'normal', head: '#f2d5b0', hat: 'goggles', prop: 'wrench', chest: '#59e6ff' },
    stats: { eng: 20, dodge: 10, speed: 6, ranged: -15 }, startWeapon: 'tesla',
    ability: { id: 'phasendash', name: 'Phasen-Dash', cd: 5, desc: 'Kurzer Blink durch den Raum: unverwundbar, hinterlässt eine Schockwelle und setzt ein Gadget frei.' },
    synergy: { cls: 'support', need: 2, stats: { eng: 12, atkSpd: 8 }, text: '2× Support: +12 Technik, +8% Tempo' }
  },
  {
    id: 'scharfschuetze', name: 'Ranger', role: 'Fernkämpfer', col: '#7dffb0', col2: '#2b8f5a',
    desc: 'Distanzspezialist der Wiesbadener Stadtwache. Wer zu nah kommt, hat verloren — für ihn.',
    skin: { build: 'normal', head: '#0f3a26', hat: 'hood', prop: 'none', chest: '#7dffb0' },
    stats: { ranged: 22, range: 20, dodge: 8, speed: 6, melee: -5 }, startWeapon: 'sniper',
    ability: { id: 'markierung', name: 'Zielmarkierung', cd: 10, desc: 'Markiert alle Gegner in Sicht: +35% erlittener Schaden für 5 s.' },
    synergy: { cls: 'precise', need: 2, stats: { crit: 8, critDmg: 25 }, text: '2× Precise: +8% Krit, +25% Krit-Schaden' },
    unlock: null
  },
  {
    id: 'bollwerk', name: 'T.Boehmer', role: '2,20m Riese · Techno-DJ', col: '#59e6ff', col2: '#a06bff',
    desc: '2,20m Riese aus Wiesbaden. Legt Techno auf, bis die Bude wackelt. Wirft wirbelnde Musiknoten, die Feinde aus dem Takt bringen.',
    skin: { build: 'giant', head: '#e0c6a2', hat: 'headphones', prop: 'none', chest: '#59e6ff' },
    stats: { armor: 4, maxHp: 25, speed: -8 }, startWeapon: 'musiknoten',
    ability: { id: 'raveaura', name: 'Rave-Aura', cd: 12, desc: '5 s Rave-Aura: +60% Angriffstempo und +25% Tempo, Stroboskop-Licht blendet Gegner (Slow).' },
    synergy: { cls: 'elemental', need: 2, stats: { elem: 12, armor: 2 }, text: '2× Elemental: +12 Elementarschaden, +2 Rüstung' }
  },
  {
    id: 'nova', name: 'Nova', role: 'Glas-Kanone', col: '#ff5ce0', col2: '#ffa8f0',
    desc: 'Töte, bevor du stirbst. Wortwörtlich.',
    skin: { build: 'slim', head: '#ffd7b8', hat: 'spiky', prop: 'none', chest: '#ffa8f0' },
    stats: { dmgP: 50, crit: 15, maxHp: -40, armor: -4 }, startWeapon: 'chaingun',
    ability: { id: 'overdrive', name: 'Overdrive', cd: 14, desc: '4 s lang +80% Angriffstempo und +30% Krit-Chance.' },
    synergy: { cls: 'heavy', need: 2, stats: { dmgP: 15 }, text: '2× Heavy: +15% Schaden' }
  },
  {
    id: 'kleeblatt', name: 'Kleeblatt', role: 'Glückspilz', col: '#8dff5c', col2: '#3d8f2a',
    desc: 'Setzt alles auf Fundstücke. Der Shop ist seine wahre Waffe.',
    skin: { build: 'kid', head: '#f2d5b0', hat: 'cap', prop: 'none', chest: '#8dff5c' },
    stats: { luck: 50, dmgP: -8 }, startWeapon: 'shotgun',
    ability: { id: 'fuellhorn', name: 'Füllhorn', cd: 15, desc: 'Regnet Material und ein zufälliges Power-Up ab.' },
    synergy: { cls: 'primitive', need: 2, stats: { luck: 20, harvest: 3 }, text: '2× Primitive: +20 Glück, +3 Ernte' }
  },
  {
    id: 'ingenieur', name: 'Ingenieur', role: 'Handwerker', col: '#ffb24a', col2: '#8a5a1a',
    desc: 'Baut sich zum Sieg. Geschütze erledigen die Arbeit, er hält nur die Schraubenschlüssel.',
    skin: { build: 'normal', head: '#e0c6a2', hat: 'hard', prop: 'wrench', chest: '#ffb24a' },
    stats: { eng: 20, maxHp: 15, ranged: -15 }, startWeapon: 'wrench',
    ability: { id: 'turret', name: 'Notfall-Geschütz', cd: 11, desc: 'Setzt ein zusätzliches Geschütz mit voller Technik-Skalierung ab.' },
    synergy: { cls: 'support', need: 3, stats: { eng: 15 }, text: '3× Support: +15 Technik' }
  },
  {
    id: 'cyborg', name: 'Cyborg', role: 'Wiederhergestellt', col: '#c0f0ff', col2: '#2b6f8f',
    desc: 'Mehr Servo als Mensch. Zäh, schnell, aber die Batterie ist klein.',
    skin: { build: 'square', head: '#9fb8c4', hat: 'antenna', prop: 'none', chest: '#c0f0ff' },
    stats: { armor: 5, atkSpd: 15, maxHp: -30, hpRegen: 2 }, startWeapon: 'railgun',
    ability: { id: 'notstrom', name: 'Notstrom', cd: 18, desc: 'Bei tödlichem Schaden: einmal pro Welle mit 30% HP wiederherstellen (passiv aktiv) + Elektro-Nova.' },
    synergy: { cls: 'elemental', need: 2, stats: { elem: 15 }, text: '2× Elemental: +15 Elementarschaden' },
    unlock: { key: 'lowHpWaves', need: 5, text: 'Überlebe 5 Wellen mit unter 10% HP' }
  },
  {
    id: 'rockstar', name: 'Rockstar', role: 'Gitarrist', col: '#ff8a3d', col2: '#ffe45c',
    desc: 'Leonidas mit E-Gitarre. Jeder Riff ist eine Schallwelle, jeder Kill ein Solo.',
    skin: { build: 'normal', head: '#f2d5b0', hat: 'rock', prop: 'guitar', chest: '#ffe45c' },
    stats: { atkSpd: 12, dmgP: 12, luck: 10, armor: -1, maxHp: -5 }, startWeapon: 'sonic',
    ability: { id: 'powerchord', name: 'Powerchord', cd: 10, desc: 'Schallexplosion im Umkreis: Schaden, Rückstoß, +20% Tempo für 4 s.' },
    synergy: { cls: 'support', need: 2, stats: { atkSpd: 10, dmgP: 8 }, text: '2× Support: +10% Tempo, +8% Schaden' },
    unlock: { key: 'wavesWon', need: 1, text: 'Gewinne einen Run (Welle 20)' }
  },
  {
    id: 'greta', name: 'Greta', role: 'Streitschlichterin · Reflektor', col: '#7dffb0', col2: '#2b8f5a',
    desc: 'Schlichtet auf dem Schulhof jede Rangelei — ein Blick und die Fäuste sinken. Reflektiert Chaos, straft Ungeduld.',
    skin: { build: 'normal', head: '#c98a5a', hat: 'beret', prop: 'none', chest: '#5a8f2b' },
    stats: { armor: 4, dodge: 8, maxHp: 5, dmgP: -5 }, startWeapon: 'nunchaku',
    ability: { id: 'schiedsgericht', name: 'Schiedsgericht', cd: 12, desc: 'Taunt-Aura: zieht Gegner im Umkreis heran, verlangsamt sie und erteilt Schaden.' },
    synergy: { cls: 'medical', need: 2, stats: { hpRegen: 2, lifesteal: 8 }, text: '2× Medical: +2 HP-Reg, +8% Lebensraub' },
    unlock: null
  },
  {
    id: 'manni', name: 'Kiosk-Manni', role: 'Kiosk-Betreiber · Ökonom', col: '#ffb24a', col2: '#ffe08a',
    desc: 'Der Mann hinter dem Kiosk am Kurhaus. Kennt jede Preistafel und jeden Drop — was er anpackt, das schließt er ab.',
    skin: { build: 'wide', head: '#e0c6a2', hat: 'flatcap', prop: 'none', chest: '#b24a2b' },
    stats: { luck: 25, harvest: 4, maxHp: 10, armor: 2 }, startWeapon: 'pistol',
    ability: { id: 'kiosk', name: 'Kiosk-Stoß', cd: 15, desc: 'Wirft eine Snack-Ladung: Material-Schauer, Heilung und ein Power-Up.' },
    synergy: { cls: 'primitive', need: 2, stats: { luck: 20, harvest: 3 }, text: '2× Primitive: +20 Glück, +3 Ernte' },
    unlock: null
  },
  {
    id: 'oe', name: 'Ö', role: 'Lebensberaterin · Gute Ratschläge', col: '#ffd24a', col2: '#8a5cff',
    desc: 'Locken mit Zopf, Brille auf der Nase, und für jede Lage einen gut gemeinten Rat. Ihr Hauptangriff sind gute Ratschläge, walla — Sprechblasen, die durch ganze Gegnerreihen gehen und sie nachdenklich (und langsam) machen.',
    skin: { build: 'normal', head: '#e8bf95', hat: 'lockenzopf', prop: 'none', chest: '#ffd24a' },
    stats: { ranged: 12, range: 20, atkSpd: 8, luck: 10, melee: -12, armor: -1 }, startWeapon: 'ratschlaege',
    ability: { id: 'walla', name: 'Walla-Ansage', cd: 11, desc: 'Lautstarker Rundum-Ratschlag: Schaden im weiten Umkreis, Gegner werden verwirrt (Betäubung) und stark verlangsamt, das ganze Team bekommt Angriffstempo und Glück.' },
    synergy: { cls: 'support', need: 2, stats: { atkSpd: 10, range: 12 }, text: '2× Support: +10% Tempo, +12% Reichweite' },
    unlock: null
  },
  {
    id: 'blindgaenger', name: 'Blindgänger', role: 'Sprengmeister · Duellant', col: '#ff8a3d', col2: '#ffd23e',
    desc: 'Sprengmeister von der Neroberg-Baustelle. War zu oft „nahe dran“ — jetzt sind es die anderen.',
    skin: { build: 'slim', head: '#8a5a2a', hat: 'gasmask', prop: 'none', chest: '#8a5a2a' },
    stats: { dmgP: 15, expSize: 15, maxHp: -15, armor: -2, speed: 5 }, startWeapon: 'smg',
    ability: { id: 'sprengsatz', name: 'Sprengsatz', cd: 10, desc: 'Wirft einen Blindgänger auf das nächste Ziel: verzögerte Explosion mit Schub.' },
    synergy: { cls: 'heavy', need: 2, stats: { dmgP: 15 }, text: '2× Heavy: +15% Schaden' },
    unlock: null
  },
  {
    id: 'petra', name: 'Denise McKay', role: 'Ex-Army-Ingenieurin · Air-Force-Wartung', col: '#a8c4e8', col2: '#3a5a3a',
    desc: 'Deutsch-Amerikanerin mit Army-Vergangenheit: Engineering und Wartung für die Air Force. Was Denise anfasst, hält — und was sie anfasst, fliegt wieder. Lässig, präzise, mit Schraubenschlüssel in der Hand.',
    skin: { build: 'wide', head: '#e0b28a', hat: 'military', prop: 'schrauber', chest: '#3a5a3a' },
    stats: { armor: 3, maxHp: 15, eng: 12, melee: 6, speed: -5, atkSpd: -3 }, startWeapon: 'schrauber',
    ability: { id: 'luftschlag', name: 'Präzisions-Luftschlag', cd: 10, desc: 'Markiert das nächste Ziel mit einem Laser-Beacon und ruft einen Air-Force-Luftschlag: harte Explosion mit Betäubung im Umkreis.' },
    synergy: { cls: 'support', need: 2, stats: { eng: 10, armor: 2 }, text: '2× Support: +10 Technik, +2 Rüstung' },
    unlock: null
  },
  {
    id: 'kobra', name: 'Kobra', role: 'Streifenpolizistin · Partnerin', col: '#7d9dff', col2: '#ffe08a',
    desc: 'Schwerter zu Pflugscharen? Nicht bei ihr. Die Dienstwaffe sitzt locker, der Helm sitzt fester — und wer markiert ist, wird auch erwischt.',
    skin: { build: 'normal', head: '#f2d5b0', hat: 'helm', prop: 'none', chest: '#2b4a8f' },
    stats: { ranged: 12, crit: 8, speed: 5, maxHp: -5 }, startWeapon: 'pistol',
    ability: { id: 'festnahme', name: 'Festnahme', cd: 11, desc: 'Stürmt auf das nächste Ziel zu: harter Treffer, lange Betäubung und Zielmarkierung — Gegner daneben werden mitgestunnt.' },
    synergy: { cls: 'precise', need: 2, stats: { ranged: 10, crit: 6 }, text: '2× Precise: +10 Fernkampf, +6% Krit' },
    unlock: null
  },
  {
    id: 'sunny', name: 'Sunny', role: 'E-Roller · KI-Helferin', col: '#6c5ce7', col2: '#8e7cff',
    desc: 'Wiesbadens freundliche KI-Helferin mit langem blondem Haar — immer mit dem E-Roller unterwegs. Flink, wendig und verdammt gut aussehend, und ihre Klingel funkt ganze Gegnerreihen nieder, bevor sie überhaupt merken, was sie überrollt hat.',
    skin: { build: 'slim', head: '#ffd9b3', hat: 'blond', prop: 'escooter', chest: '#6c5ce7' },
    stats: { speed: 18, dodge: 8, elem: 10, maxHp: -12, armor: -2 }, startWeapon: 'klingel',
    ability: { id: 'vollgas', name: 'Roller-Boost', cd: 9, desc: 'Vollgas! Elektrischer Sprint: kurz unverwundbar, schubst Gegner um und funkt sie nieder.' },
    synergy: { cls: 'elemental', need: 2, stats: { elem: 12, speed: 6 }, text: '2× Elemental: +12 Elementarschaden, +6% Tempo' },
    unlock: null
  },
  {"id": "kaykit_barbarian", "synergy": {"cls":"blunt","need":2,"stats":{"melee":10,"knock":20},"text":"2× Blunt: +10 Nahkampf, +20% Rückstoß"}, "name": "Barbarian", "role": "KayKit · Nahkämpfer", "col": "#d4a373", "col2": "#8a5a2a", "desc": "KayKit-Barbar mit Axt und Fellumhang. Stürmt voran, wo andere zaudern.", "skin": {"build": "wide", "head": "#e0c6a2", "hat": "bear", "prop": "none", "chest": "#d4a373"}, "stats": {"maxHp": 20, "melee": 12, "armor": 2, "speed": -4}, "startWeapon": "hammer", "ability": {"id": "kralle", "name": "Barbarenwut", "cd": 10, "desc": "Brüllt und stürmt vor: Schaden + Stun im Kegel."}, "sprite": "barbarian"},
  {"id": "kaykit_knight", "synergy": {"cls":"heavy","need":2,"stats":{"armor":3,"maxHp":20},"text":"2× Heavy: +3 Rüstung, +20 Leben"}, "name": "Knight", "role": "KayKit · Schildträger", "col": "#a0b8d0", "col2": "#4a6a8f", "desc": "Ritter in Plattenrüstung. Hält die Stellung, wenn alle anderen fallen.", "skin": {"build": "wide", "head": "#e0c6a2", "hat": "helm", "prop": "none", "chest": "#a0b8d0"}, "stats": {"armor": 5, "maxHp": 25, "speed": -8, "dodge": -5}, "startWeapon": "shotgun", "ability": {"id": "kralle", "name": "Schildwall", "cd": 11, "desc": "Stellt einen Schild auf: 3s +40% Rüstung und Stun-Immunität."}, "sprite": "knight"},
  {"id": "kaykit_mage", "synergy": {"cls":"elemental","need":2,"stats":{"elem":14,"atkSpd":8},"text":"2× Elemental: +14 Elementarschaden, +8% Angriffstempo"}, "name": "Mage", "role": "KayKit · Elementarist", "col": "#8a5cff", "col2": "#ffd23e", "desc": "Magier mit Stab und Kapuze. Lässt die Elemente für sich arbeiten.", "skin": {"build": "normal", "head": "#e0c6a2", "hat": "hood", "prop": "none", "chest": "#8a5cff"}, "stats": {"elem": 20, "maxHp": -10, "atkSpd": 10, "armor": -2}, "startWeapon": "tesla", "ability": {"id": "walla", "name": "Arkanschlag", "cd": 9, "desc": "Entlädt einen Elementarstoß: Kegel-Schaden + Burn/Shock."}, "sprite": "mage"},
  {"id": "kaykit_ranger", "synergy": {"cls":"precise","need":2,"stats":{"ranged":10,"range":12},"text":"2× Precise: +10 Fernkampf, +12% Reichweite"}, "name": "Ranger", "role": "KayKit · Waldläufer", "col": "#7dffb0", "col2": "#2b8f5a", "desc": "Waldläufer mit Bogen und Köcher. Trifft, bevor du ihn siehst.", "skin": {"build": "normal", "head": "#e0c6a2", "hat": "hood", "prop": "none", "chest": "#7dffb0"}, "stats": {"ranged": 18, "range": 15, "crit": 8, "speed": 5, "maxHp": -5}, "startWeapon": "sniper", "ability": {"id": "markierung", "name": "Präzisionsschuss", "cd": 10, "desc": "Ein perfekt gezielter Schuss: +50% Reichweite und garantierter Krit für 3s."}, "sprite": "ranger"},
  {"id": "kaykit_rogue", "synergy": {"cls":"blade","need":2,"stats":{"crit":8,"dodge":6},"text":"2× Blade: +8% Krit, +6% Ausweichen"}, "name": "Rogue", "role": "KayKit · Schatten", "col": "#6c5ce7", "col2": "#2d3436", "desc": "Meuchler mit Dolch. Schnell, leise, tödlich.", "skin": {"build": "slim", "head": "#e0c6a2", "hat": "hood", "prop": "none", "chest": "#6c5ce7"}, "stats": {"dodge": 12, "crit": 12, "speed": 10, "maxHp": -15, "armor": -2}, "startWeapon": "knife", "ability": {"id": "phasendash", "name": "Schattenritt", "cd": 6, "desc": "Blinkt durch Gegner: kurz unverwundbar, hinterlässt Giftwolke."}, "sprite": "rogue"},
  {"id": "kaykit_rogue_hooded", "synergy": {"cls":"precise","need":2,"stats":{"crit":7,"speed":8},"text":"2× Precise: +7% Krit, +8 Tempo"}, "name": "Hooded Rogue", "role": "KayKit · Kapuze", "col": "#2d3436", "col2": "#636e72", "desc": "Vermummter Schurke. Arbeitet im Verborgenen, schlägt aus dem Hinterhalt zu.", "skin": {"build": "slim", "head": "#e0c6a2", "hat": "hood", "prop": "none", "chest": "#2d3436"}, "stats": {"dodge": 10, "crit": 10, "speed": 8, "luck": 10, "maxHp": -10}, "startWeapon": "nunchaku", "ability": {"id": "festnahme", "name": "Hinterhalt", "cd": 10, "desc": "Springt zum Ziel: Stun + hoher Krit-Schaden."}, "sprite": "rogue_hooded"}
];
/* Brotato-nahe Kernregeln: kurze Wellen, sechs autonome Waffen und ein
   klarer Shop-Zyklus. Die Regeln liegen zentral, damit BalanceSim und Laufzeit
   nicht an verschiedenen Hardcodes vorbeirechnen. */
const BROTATO_RULES = {
  maxWeapons: 6,
  shopOffers: 6,
  autoFire: true,
  shopBetweenWaves: true,
  rerollCost(wave, rerolls = 0, locked = 0) { return 5 + Math.max(0, wave) + rerolls * 4 + locked * 4; }
};

/* Jeder Held bekommt drei getrennte Identitaetsachsen:
   figure = Koerpersilhouette/Props, animation = Bewegungsstil, moveSet =
   tatsaechliche Lauf-/Rollwerte. Dadurch ist ein Charakterwechsel auch im
   Spielgefuehl sichtbar und nicht nur ein anderer Farbton. */
const CharacterProfiles = {
  leonidas: { figure: 'firefighter-kid', animation: 'hose-sprint', animationRate: 1.08, moveSet: { id: 'fireline', speed: 1.04, dash: 920, rollCd: .48, rollDuration: .30, rollSpeed: 650, rollStyle: 'rush' }, walkStyle: { bobAmp: .7, bobFreq: 1.1, legSwing: 1.2, legLift: .8, armSwing: .6, lean: .04, stepWidth: 1.3 }, idleAnim: 'check-belt' },
  sylvia: { figure: 'red-cross-athlete', animation: 'healer-stride', animationRate: .92, moveSet: { id: 'guardian-step', speed: .98, dash: 820, rollCd: .42, rollDuration: .36, rollSpeed: 590, rollStyle: 'grace' }, walkStyle: { bobAmp: 1.3, bobFreq: 1.0, legSwing: .8, legLift: 1.2, armSwing: .7, lean: -.02, stepWidth: .9 }, idleAnim: 'check-pulse' },
  sebbo: { figure: 'techno-gadgeteer', animation: 'gadget-hop', animationRate: 1.18, moveSet: { id: 'phase-gadget', speed: 1.06, dash: 1040, rollCd: .36, rollDuration: .24, rollSpeed: 735, rollStyle: 'phase' }, walkStyle: { bobAmp: 1.1, bobFreq: 1.2, legSwing: 1.0, legLift: 1.0, armSwing: 1.2, lean: .03, stepWidth: 1.1 }, idleAnim: 'tap-gadget' },
  scharfschuetze: { figure: 'ranger-cloak', animation: 'low-stalk', animationRate: .82, moveSet: { id: 'deadeye-stalk', speed: .96, dash: 870, rollCd: .55, rollDuration: .27, rollSpeed: 610, rollStyle: 'silent' }, walkStyle: { bobAmp: .5, bobFreq: .8, legSwing: .6, legLift: .5, armSwing: .4, lean: .06, stepWidth: .8 }, idleAnim: 'scan-horizon' },
  bollwerk: { figure: 'dj-stack', animation: 'heavy-bounce', animationRate: .74, moveSet: { id: 'bass-step', speed: .91, dash: 760, rollCd: .66, rollDuration: .32, rollSpeed: 560, rollStyle: 'impact' }, walkStyle: { bobAmp: 1.6, bobFreq: 1.3, legSwing: .9, legLift: .7, armSwing: 1.4, lean: -.03, stepWidth: 1.2 }, idleAnim: 'head-bop' },
  nova: { figure: 'neon-glassblade', animation: 'glass-flicker', animationRate: 1.35, moveSet: { id: 'overdrive', speed: 1.12, dash: 1110, rollCd: .31, rollDuration: .21, rollSpeed: 790, rollStyle: 'blink' }, walkStyle: { bobAmp: .4, bobFreq: 1.5, legSwing: 1.3, legLift: 1.4, armSwing: 1.1, lean: .05, stepWidth: 1.0 }, idleAnim: 'tremble' },
  kleeblatt: { figure: 'clover-scout', animation: 'lucky-skip', animationRate: 1.02, moveSet: { id: 'lucky-skip', speed: 1.02, dash: 900, rollCd: .46, rollDuration: .29, rollSpeed: 640, rollStyle: 'bounce' }, walkStyle: { bobAmp: 1.8, bobFreq: .9, legSwing: .7, legLift: 1.6, armSwing: .9, lean: -.04, stepWidth: .7 }, idleAnim: 'pat-clover' },
  ingenieur: { figure: 'builder-rig', animation: 'measured-walk', animationRate: .86, moveSet: { id: 'builder-roll', speed: .94, dash: 800, rollCd: .58, rollDuration: .34, rollSpeed: 575, rollStyle: 'tool' }, walkStyle: { bobAmp: .6, bobFreq: .85, legSwing: 1.1, legLift: .6, armSwing: .5, lean: .02, stepWidth: 1.4 }, idleAnim: 'twirl-wrench' },
  cyborg: { figure: 'servo-frame', animation: 'servo-pulse', animationRate: 1.1, moveSet: { id: 'servo-charge', speed: 1.01, dash: 980, rollCd: .44, rollDuration: .25, rollSpeed: 690, rollStyle: 'magnetic' }, walkStyle: { bobAmp: .8, bobFreq: 1.0, legSwing: .9, legLift: .8, armSwing: .3, lean: .01, stepWidth: 1.0 }, idleAnim: 'servo-check' },
  rockstar: { figure: 'guitar-hero', animation: 'stage-strut', animationRate: 1.24, moveSet: { id: 'riff-dash', speed: 1.05, dash: 940, rollCd: .39, rollDuration: .28, rollSpeed: 670, rollStyle: 'sound' }, walkStyle: { bobAmp: 1.2, bobFreq: 1.15, legSwing: 1.1, legLift: .9, armSwing: 1.6, lean: -.05, stepWidth: 1.3 }, idleAnim: 'air-guitar' },
  greta: { figure: 'referee-stance', animation: 'calm-stance', animationRate: .8, moveSet: { id: 'parry-step', speed: .97, dash: 850, rollCd: .38, rollDuration: .33, rollSpeed: 600, rollStyle: 'parry' }, walkStyle: { bobAmp: .4, bobFreq: .9, legSwing: .5, legLift: .4, armSwing: .3, lean: 0, stepWidth: .9 }, idleAnim: 'flip-notes' },
  manni: { figure: 'kiosk-apron', animation: 'vendor-shuffle', animationRate: .9, moveSet: { id: 'vendor-shuffle', speed: .95, dash: 780, rollCd: .6, rollDuration: .37, rollSpeed: 540, rollStyle: 'spill' }, walkStyle: { bobAmp: 1.4, bobFreq: .7, legSwing: 1.3, legLift: .8, armSwing: .6, lean: 0, stepWidth: 1.5 }, idleAnim: 'wipe-counter' },
  oe: { figure: 'advice-notebook', animation: 'talking-stride', animationRate: 1.0, moveSet: { id: 'walla-slide', speed: 1.0, dash: 880, rollCd: .5, rollDuration: .3, rollSpeed: 625, rollStyle: 'wave' }, walkStyle: { bobAmp: .9, bobFreq: 1.0, legSwing: .8, legLift: .7, armSwing: 1.3, lean: -.01, stepWidth: 1.0 }, idleAnim: 'meditate' },
  blindgaenger: { figure: 'demolition-rig', animation: 'reckless-run', animationRate: 1.16, moveSet: { id: 'blast-roll', speed: 1.07, dash: 1010, rollCd: .52, rollDuration: .26, rollSpeed: 720, rollStyle: 'blast' }, walkStyle: { bobAmp: .6, bobFreq: 1.4, legSwing: 1.4, legLift: 1.1, armSwing: 1.0, lean: .07, stepWidth: 1.1 }, idleAnim: 'check-fuse' },
  petra: { figure: 'excavator-harness', animation: 'wide-powerwalk', animationRate: .7, moveSet: { id: 'crane-step', speed: .9, dash: 730, rollCd: .72, rollDuration: .4, rollSpeed: 510, rollStyle: 'crane' }, walkStyle: { bobAmp: .5, bobFreq: .75, legSwing: 1.5, legLift: .9, armSwing: .8, lean: .03, stepWidth: 1.6 }, idleAnim: 'test-crane' },
  kobra: { figure: 'police-tactical', animation: 'tactical-jog', animationRate: 1.06, moveSet: { id: 'arrest-lunge', speed: 1.03, dash: 970, rollCd: .4, rollDuration: .27, rollSpeed: 680, rollStyle: 'tactical' }, walkStyle: { bobAmp: .8, bobFreq: 1.1, legSwing: 1.0, legLift: 1.0, armSwing: .7, lean: .04, stepWidth: 1.1 }, idleAnim: 'rattle-cuffs' },
  sunny: { figure: 'roller-ai', animation: 'roller-carve', animationRate: 1.3, moveSet: { id: 'sunny-roller', speed: 1.14, dash: 1180, rollCd: .28, rollDuration: .22, rollSpeed: 840, rollStyle: 'roller' }, walkStyle: { bobAmp: .3, bobFreq: 1.0, legSwing: .2, legLift: .2, armSwing: .4, lean: 0, stepWidth: .6 }, idleAnim: 'check-phone' },
  kaykit_barbarian: { figure: 'barbarian-axe', animation: 'barbarian-axe-swing', animationRate: .9, moveSet: { id: 'barb-step', speed: 1.0, dash: 900, rollCd: .5, rollDuration: .3, rollSpeed: 640, rollStyle: 'rush' }, walkStyle: { bobAmp: 1.1, bobFreq: 1.0, legSwing: 1.0, legLift: .9, armSwing: .8, lean: .02, stepWidth: 1.1 }, idleAnim: 'guard' },
  kaykit_knight: { figure: 'knight-shield', animation: 'knight-shield-bash', animationRate: .8, moveSet: { id: 'knight-step', speed: .92, dash: 800, rollCd: .6, rollDuration: .32, rollSpeed: 560, rollStyle: 'impact' }, walkStyle: { bobAmp: 1.2, bobFreq: 1.1, legSwing: .9, legLift: .7, armSwing: .7, lean: -.02, stepWidth: 1.2 }, idleAnim: 'guard' },
  kaykit_mage: { figure: 'mage-staff', animation: 'mage-staff-cast', animationRate: 1.1, moveSet: { id: 'mage-step', speed: 1.02, dash: 920, rollCd: .45, rollDuration: .26, rollSpeed: 660, rollStyle: 'phase' }, walkStyle: { bobAmp: .9, bobFreq: 1.2, legSwing: .8, legLift: .9, armSwing: 1.0, lean: .01, stepWidth: 1.0 }, idleAnim: 'meditate' },
  kaykit_ranger: { figure: 'ranger-bow', animation: 'ranger-bow-aim', animationRate: .85, moveSet: { id: 'ranger-step', speed: 1.04, dash: 950, rollCd: .4, rollDuration: .27, rollSpeed: 680, rollStyle: 'silent' }, walkStyle: { bobAmp: .7, bobFreq: 1.0, legSwing: .9, legLift: .8, armSwing: .9, lean: .04, stepWidth: 1.1 }, idleAnim: 'aim' },
  kaykit_rogue: { figure: 'rogue-dagger', animation: 'rogue-dagger-strike', animationRate: 1.1, moveSet: { id: 'rogue-step', speed: 1.08, dash: 1000, rollCd: .35, rollDuration: .24, rollSpeed: 720, rollStyle: 'tactical' }, walkStyle: { bobAmp: .6, bobFreq: 1.2, legSwing: 1.1, legLift: 1.0, armSwing: 1.1, lean: .03, stepWidth: 1.0 }, idleAnim: 'crouch' },
  kaykit_rogue_hooded: { figure: 'rogue-hood', animation: 'rogue-hood-sneak', animationRate: 1.0, moveSet: { id: 'hood-step', speed: 1.05, dash: 970, rollCd: .38, rollDuration: .25, rollSpeed: 690, rollStyle: 'tactical' }, walkStyle: { bobAmp: .8, bobFreq: 1.1, legSwing: 1.0, legLift: .9, armSwing: .8, lean: .02, stepWidth: 1.0 }, idleAnim: 'crouch' },
};
for (const c of CHARS) c.profile = CharacterProfiles[c.id];

const CHAR_BY_ID = Data.register('chars', CHARS, {
  id: 'id', name: 'req|str', role: 'str', col: 'str', desc: 'str',
  startWeapon: 'ref:weapons',
  profile: (c, v) => !v || !v.figure || !v.animation || !v.moveSet ? 'Figur/Animation/Moveset fehlt' : null,
  stats: (c) => { for (const k in (c.stats || {})) if (!STAT_KEYS.includes(k)) return 'unbekannter Stat ' + k; return null; }
}).byId;

function W(o) { return o; }
const WEAPONS = [
  W({
    id: 'pistol', name: 'Dienstpistole', cls: ['gun', 'precise'], type: 'projectile', col: '#ffe08a',
    scaling: { ranged: .6 }, unlockDefault: true,
    tiers: [[26.7, .65, 420, .06, 1.6, 10, {}], [43.3, .60, 450, .07, 1.6, 22, {}], [70, .55, 490, .08, 1.8, 46, {}], [113.3, .50, 560, .10, 2.0, 92, {}]],
    special: 'Zuverlässig, günstig, trifft immer den nächsten Feind.'
  }),
  W({
    id: 'smg', name: 'MP Rheingau', cls: ['gun'], type: 'projectile', col: '#9ad2ff',
    scaling: { ranged: .5 }, unlockDefault: true,
    tiers: [[4, .18, 340, .05, 1.5, 14, {}], [7, .17, 360, .06, 1.5, 28, {}], [11, .16, 390, .07, 1.7, 58, {}], [18, .15, 450, .08, 2.0, 118, {}]],
    special: 'Sehr hohe Feuerrate, geringe Einzelschadenswerte.'
  }),
  W({
    id: 'shotgun', name: 'Schrotflinte', cls: ['gun', 'heavy'], type: 'projectile', col: '#ffb27a',
    scaling: { ranged: .55 }, unlockDefault: true,
    tiers: [[5, 1.05, 260, .05, 1.5, 16, { pellets: 4, spread: .45 }], [8, 1.00, 280, .06, 1.5, 32, { pellets: 5, spread: .45 }],
    [13, .95, 310, .07, 1.75, 66, { pellets: 6, spread: .42 }], [21, .90, 360, .08, 2.0, 134, { pellets: 8, spread: .40 }]],
    special: 'Streuschuss: mehrere Projektile pro Schuss, tödlich auf kurze Distanz.'
  }),
  W({
    id: 'chaingun', name: 'Kettenkanone', cls: ['gun', 'heavy'], type: 'projectile', col: '#ff8a5c',
    scaling: { ranged: .55 }, unlockDefault: false,
    tiers: [[2.0, .09, 320, .04, 1.5, 20, {}], [3.8, .08, 340, .05, 1.5, 40, {}], [6.5, .07, 370, .06, 1.5, 82, {}], [11, .06, 420, .07, 1.5, 166, {}]],
    special: 'Nerf-Protokoll 1984: Dauerfeuer mit reduziertem Krit-Multiplikator.',
    unlock: { key: 'kills', need: 400, text: 'Töte insgesamt 400 Gegner' }
  }),
  W({
    id: 'sniper', name: 'Scharfschützengewehr', cls: ['gun', 'precise'], type: 'projectile', col: '#7dffb0',
    scaling: { ranged: .85 }, unlockDefault: false,
    tiers: [[10.3, 1.00, 700, .18, 2.0, 30, { pierce: 2 }], [16.8, .95, 760, .20, 2.2, 60, { pierce: 3 }],
    [27.1, .90, 820, .22, 2.4, 122, { pierce: 4 }], [43, .85, 900, .25, 2.8, 246, { pierce: 6 }]],
    special: 'Durchschlägt mehrere Gegner, extreme Reichweite und Krit-Werte.',
    unlock: { key: 'longKill', need: 1, text: 'Töte einen Gegner aus über 600 px Entfernung' }
  }),
  W({
    id: 'medgun', name: 'Medi-Blaster', cls: ['gun', 'medical', 'support'], type: 'projectile', col: '#8affb0',
    scaling: { ranged: .45, hpRegen: .8 }, unlockDefault: true,
    tiers: [[13.3, .45, 380, .05, 1.5, 18, { lifesteal: .65 }], [22.1, .42, 410, .06, 1.5, 36, { lifesteal: .65 }],
    [35.4, .39, 450, .07, 1.75, 74, { lifesteal: .70 }], [57.6, .36, 520, .08, 2.0, 150, { lifesteal: .75 }]],
    special: 'Buff-Protokoll: 65% Lebensraub — heilt auch den Koop-Partner in Reichweite.'
  }),
  W({
    id: 'shredder', name: 'Schredder', cls: ['gun', 'explosive'], type: 'projectile', col: '#ff9a9a',
    scaling: { ranged: .5 }, unlockDefault: false,
    tiers: [[7, .55, 330, .05, 1.5, 24, { boom: 44, bounce: 1 }], [12, .52, 355, .06, 1.5, 48, { boom: 55, bounce: 1 }],
    [19, .49, 390, .07, 1.75, 98, { boom: 66, bounce: 2 }], [31, .46, 450, .08, 2.0, 198, { boom: 88, bounce: 3 }]],
    special: 'Abprallende Splittergranaten mit vergrößertem Explosionsradius.',
    unlock: { key: 'boomKills', need: 150, text: 'Töte 150 Gegner mit Explosionen' }
  }),
  W({
    id: 'knife', name: 'Taschenmesser', cls: ['blade', 'precise'], type: 'melee', col: '#e0f0ff',
    scaling: { melee: .8 }, unlockDefault: true,
    tiers: [[10, .50, 90, .20, 2.0, 12, { arc: 1.0 }], [16, .47, 100, .22, 2.2, 24, { arc: 1.0 }],
    [26, .44, 110, .24, 2.4, 50, { arc: 1.1 }], [42, .40, 125, .28, 2.8, 100, { arc: 1.2 }]],
    special: 'Schnelle Stiche mit hoher Kritchance. Trifft mehrere Gegner im Bogen.'
  }),
  W({
    id: 'spear', name: 'Speer', cls: ['blade', 'primitive'], type: 'melee', col: '#b8d98a',
    scaling: { melee: .9 }, unlockDefault: true,
    tiers: [[25.4, .80, 150, .08, 1.6, 16, { arc: .45, pierce: 99 }], [41.7, .76, 165, .09, 1.6, 32, { arc: .45, pierce: 99 }],
    [67, .72, 180, .10, 1.8, 66, { arc: .5, pierce: 99 }], [108.7, .68, 210, .12, 2.0, 132, { arc: .55, pierce: 99 }]],
    special: 'Langer Stoß, durchbohrt eine ganze Reihe Gegner.'
  }),
  W({
    id: 'hammer', name: 'Vorschlaghammer', cls: ['blunt', 'medieval'], type: 'melee', col: '#ffcf9a',
    scaling: { melee: 1.0 }, unlockDefault: true,
    tiers: [[26, 1.35, 120, .05, 1.6, 22, { arc: 1.6, stun: .8, knock: 260 }], [43, 1.30, 132, .06, 1.6, 44, { arc: 1.7, stun: .9, knock: 300 }],
    [70, 1.25, 145, .07, 1.8, 90, { arc: 1.8, stun: 1.0, knock: 340 }], [112, 1.20, 165, .08, 2.0, 182, { arc: 2.0, stun: 1.2, knock: 420 }]],
    special: 'Massiver Rundumschlag: hoher Schaden, Betäubung und Rückstoß.'
  }),
  W({
    id: 'wrench', name: 'Schraubenschlüssel', cls: ['blunt', 'support'], type: 'melee', col: '#ffb24a',
    scaling: { melee: .5, eng: .8 }, unlockDefault: true,
    tiers: [[10.2, .60, 100, .06, 1.5, 14, { arc: 1.2, engSpark: 1 }], [16.9, .57, 110, .07, 1.5, 28, { arc: 1.25, engSpark: 2 }],
    [27.1, .54, 120, .08, 1.75, 58, { arc: 1.3, engSpark: 3 }], [44, .50, 140, .09, 2.0, 116, { arc: 1.4, engSpark: 4 }]],
    special: 'Skaliert mit Technik und schleudert bei jedem Treffer Reparaturfunken auf Gegner.'
  }),
  W({
    id: 'schrauber', name: 'Schlagschrauber', cls: ['blunt', 'support'], type: 'melee', col: '#a8c4e8',
    scaling: { melee: .45, eng: .9 }, unlockDefault: true,
    tiers: [[13, .48, 105, .07, 1.5, 16, { arc: 1.25, stun: .7, engSpark: 1, knock: 70 }],
    [22, .45, 115, .08, 1.5, 32, { arc: 1.3, stun: .8, engSpark: 2, knock: 80 }],
    [36, .42, 125, .09, 1.75, 66, { arc: 1.35, stun: .9, engSpark: 3, knock: 92 }],
    [58, .38, 140, .10, 2.0, 132, { arc: 1.45, stun: 1.1, engSpark: 4, knock: 108 }]],
    special: 'Denises Air-Force-Signatur: harte Schlagschrauber-Hiebe mit Technik-Funken, die Gegner festziehen — Betäubung + Reparaturblitze.'
  }),
  W({
    id: 'chopper', name: 'Chopper', cls: ['blade', 'heavy'], type: 'melee', col: '#ffd7a1',
    scaling: { melee: .95 }, unlockDefault: true,
    tiers: [[20, 1.00, 135, .07, 1.7, 20, { arc: 2.2 }], [33, .95, 150, .08, 1.8, 40, { arc: 2.3 }],
    [53, .90, 165, .09, 2.0, 82, { arc: 2.5 }], [85, .85, 180, .11, 2.3, 166, { arc: 2.8 }]],
    special: 'Rotierender Rundumschlag mit korrigierter Reichweitenkurve.'
  }),
  W({
    id: 'nunchaku', name: 'Nunchaku', cls: ['blunt', 'precise'], type: 'melee', col: '#ffe08a',
    scaling: { melee: .75 }, unlockDefault: true,
    tiers: [[7, .35, 120, .15, 1.8, 14, { arc: 1.8, knock: 70 }], [11.5, .33, 132, .16, 2.0, 28, { arc: 1.9, knock: 80 }],
    [18.5, .31, 145, .18, 2.2, 58, { arc: 2.0, knock: 90 }], [30, .29, 160, .20, 2.4, 116, { arc: 2.2, knock: 100 }]],
    special: 'Zwei Nunchakus: schnelle Doppelhiebe mit weitem Bogen, Rückstoß und ordentlicher Krit-Chance.'
  }),
  W({
    id: 'flamer', name: 'Feuerwehrflammer', cls: ['elemental', 'support'], type: 'cone', col: '#ff7a3d',
    scaling: { elem: .55 }, unlockDefault: false,
    tiers: [[1.2, .12, 200, .03, 1.5, 26, { cone: .55, burn: 4 }], [2.1, .11, 220, .03, 1.5, 52, { cone: .6, burn: 7 }],
    [3.7, .10, 250, .04, 1.75, 106, { cone: .65, burn: 11 }], [6.2, .09, 300, .05, 2.0, 214, { cone: .75, burn: 18 }]],
    special: 'Dauerfeuer-Kegel, setzt Gegner in Brand (Schaden über Zeit).',
    unlock: { key: 'burnKills', need: 100, text: 'Töte 100 Gegner mit Brandschaden' }
  }),
  W({
    id: 'railgun', name: 'Railgun', cls: ['gun', 'heavy'], type: 'hitscan', col: '#59e6ff',
    scaling: { ranged: .70 },
    tiers: [[25, 1.5, 800, .05, 1.5, 35, { perHit: 0 }], [40, 1.4, 850, .05, 1.5, 68, { perHit: .10 }],
    [60, 1.3, 900, .05, 1.75, 132, { perHit: .15 }], [90, 1.2, 1000, .05, 2.0, 258, { perHit: .20 }]],
    special: 'Durchdringt ALLE Gegner auf der Linie. Ab Stufe 2 wächst der Schaden pro getroffenem Gegner.',
    unlock: { key: 'rangerWave15', need: 1, text: 'Gewinne Welle 15 mit dem Fernkämpfer (Ranger)' }
  }),
  W({
    id: 'plasma', name: 'Plasma Caster', cls: ['elemental', 'explosive'], type: 'projectile', col: '#7dffdc',
    scaling: { elem: .60 },
    tiers: [[12.2, .90, 450, .03, 1.5, 28, { boom: 60, elemental: 1 }], [21.4, .85, 480, .03, 1.5, 55, { boom: 75, elemental: 1 }],
    [33.7, .80, 520, .03, 1.75, 108, { boom: 90, elemental: 1 }], [53.6, .75, 600, .03, 2.0, 210, { boom: 120, elemental: 1 }]],
    special: 'Plasma-Explosion beim Aufschlag (Radius 60/75/90/120).',
    unlock: { key: 'elemDmgRun', need: 500, text: 'Füge 500 Elementarschaden in einem Run zu' }
  }),
  W({
    id: 'sonic', name: 'Sonic Blaster', cls: ['gun', 'support'], type: 'cone', col: '#c7a6ff',
    scaling: { ranged: .50 },
    tiers: [[7.5, .40, 350, .10, 1.5, 18, { cone: 1.75 }], [12, .36, 380, .12, 1.5, 36, { cone: 2.09 }],
    [20, .32, 420, .15, 1.75, 72, { cone: 2.44 }], [33, .28, 500, .18, 2.0, 144, { cone: 3.14 }]],
    special: 'Schallwellen treffen alle Gegner im Kegel (100°/120°/140°/180°).',
    unlock: { key: 'multiKillShot', need: 1, text: 'Töte 100 Gegner mit einem einzigen Schuss (kumulativ 100 Mehrfachkills)' }
  }),
  W({
    id: 'klingel', name: 'Roller-Klingel', cls: ['elemental', 'support'], type: 'cone', col: '#ffc93c',
    scaling: { ranged: .40, elem: .40 }, unlockDefault: true,
    tiers: [[6, .42, 560, .08, 1.5, 18, { cone: .42, elemental: true }], [10, .39, 600, .10, 1.5, 36, { cone: .48, elemental: true }],
    [17, .36, 660, .12, 1.75, 74, { cone: .55, elemental: true }], [27, .33, 740, .15, 2.0, 150, { cone: .62, elemental: true }]],
    special: 'Scharfer Klingelton: trifft alle Gegner im Kegel und funkt sie nieder — wie Sunny auf der Wilhelmstraße.'
  }),
  W({
    id: 'loeschwasser', name: 'Löschwasserstrahl', cls: ['elemental', 'support'], type: 'cone', col: '#59e6ff',
    scaling: { ranged: .35, elem: .35 }, unlockDefault: true,
    /* Reichweite halbiert (war 400/440/480/520): der Strahl deckte zuvor
       fast das halbe Spielfeld ab und war damit die mit Abstand
       reichweitenstaerkste Nahbereichswaffe. */
    tiers: [[4, .35, 200, .07, 1.5, 26, { cone: .30 }], [7, .32, 220, .08, 1.5, 52, { cone: .34 }],
    [11, .30, 240, .09, 1.75, 104, { cone: .38 }], [17, .28, 260, .10, 2.0, 208, { cone: .44 }]],
    special: 'Hochdruckwasser: verlangsamt Gegner und löscht Brände. Kurze Reichweite, dafür breiter Kegel.'
  }),
  W({
    id: 'musiknoten', name: 'Noten-Sturm', cls: ['elemental', 'support'], type: 'projectile', col: '#a06bff',
    scaling: { ranged: .45, elem: .45 }, unlockDefault: true,
    tiers: [[8.5, .60, 900, .10, 1.8, 26, { pierce: 1, elemental: 1 }], [13.8, .55, 980, .12, 1.8, 52, { pierce: 1, elemental: 1 }],
    [21.2, .50, 1080, .14, 2.0, 104, { pierce: 2, elemental: 1 }], [32.9, .45, 1200, .16, 2.2, 208, { pierce: 3, elemental: 1 }]],
    special: 'T.Boehmers Signature: eine große Musiknote startet mittig und fliegt weit im Zickzack — durchschlägt Gegner.'
  }),
  W({
    id: 'nagler', name: 'Nagelpistole', cls: ['gun', 'precise'], type: 'projectile', col: '#cfd6e2',
    /* Stat-Skalierung reduziert (vorher dominierte die flache Skalierung den
       Schaden so stark, dass Tier-Upgrades fast wirkungslos waren) */
    scaling: { ranged: .30, crit: .12 }, unlockDefault: true,
    tiers: [[3.1, .22, 480, .07, 1.9, 12, { pierce: 1, spread: .04 }],
    [4.8, .20, 520, .09, 2.0, 24, { pierce: 2, spread: .035 }],
    [7.9, .18, 560, .10, 2.2, 50, { pierce: 2, spread: .03 }],
    [12.8, .16, 620, .12, 2.4, 100, { pierce: 3, spread: .025 }]],
    special: 'Schneller Nagelhagel: dünne Stifte, die sich durch ganze Reihen fädeln. Hohe Krit-Chance, wenig Einzelschaden.'
  }),
  W({
    id: 'schrottkanone', name: 'Schrottkanone', cls: ['gun', 'heavy'], type: 'projectile', col: '#b08a4a',
    /* Die "dmg"-Skalierung war tot (es gibt keinen Stat "dmg") — daher dominiert
       ranged die Flach-Skalierung; bewusst gesenkt, damit Tier-Upgrades zählen. */
    scaling: { ranged: .22 }, unlockDefault: true,
    tiers: [[3.8, .95, 300, .06, 1.7, 20, { pellets: 7, spread: .48 }],
    [6.3, .90, 330, .07, 1.8, 40, { pellets: 8, spread: .45 }],
    [10, .84, 360, .08, 2.0, 82, { pellets: 10, spread: .42 }],
    [16.3, .78, 400, .10, 2.2, 165, { pellets: 12, spread: .38 }]],
    special: 'Geladen mit allem, was der Wertstoffhof hergibt. Eine breite Wolke aus Schrauben, Blech und Scherben.'
  }),
  W({
    id: 'bierwerfer', name: 'Bierkastenwerfer', cls: ['explosive', 'heavy'], type: 'projectile', col: '#e0a83a',
    scaling: { dmgP: .5, expSize: .2 }, unlockDefault: true,
    tiers: [[23.7, 1.25, 380, .05, 1.8, 26, { boom: 78, slow: .2, slowT: 1.4 }],
    [38.5, 1.15, 410, .06, 1.9, 52, { boom: 92, slow: .24, slowT: 1.6 }],
    [62.2, 1.05, 450, .07, 2.0, 108, { boom: 108, slow: .28, slowT: 1.8 }],
    [100.7, .95, 500, .09, 2.2, 215, { boom: 128, slow: .32, slowT: 2.0 }]],
    special: 'Ein voller Kasten fliegt weit und geht laut zu Bruch. Die Scherben machen den Boden rutschig.'
  }),
  W({
    id: 'magnetmine', name: 'Magnetmine', cls: ['explosive', 'precise'], type: 'projectile', col: '#ff6b3d',
    scaling: { dmgP: .45, expSize: .25 }, unlockDefault: true,
    tiers: [[25.7, 1.5, 420, .08, 2.0, 30, { boom: 86, stick: 1.1, armorPierce: 4 }],
    [42.1, 1.4, 450, .09, 2.1, 60, { boom: 100, stick: 1.0, armorPierce: 6 }],
    [67.8, 1.3, 490, .11, 2.3, 122, { boom: 118, stick: .9, armorPierce: 8 }],
    [109.8, 1.2, 540, .13, 2.5, 245, { boom: 140, stick: .8, armorPierce: 12 }]],
    special: 'Haftet am ersten Ziel und zündet kurz darauf. Wer getroffen wird, nimmt die Mine mit in die Menge.'
  }),
  W({
    id: 'taubenschwarm', name: 'Taubenschwarm', cls: ['primitive', 'support'], type: 'projectile', col: '#9fb4d8',
    scaling: { ranged: .4, luck: .3 }, unlockDefault: true,
    tiers: [[3.2, .62, 620, .08, 1.8, 22, { pellets: 3, spread: .6, homing: 3.2 }],
    [5, .58, 660, .09, 1.9, 44, { pellets: 4, spread: .6, homing: 3.6 }],
    [8.2, .54, 700, .11, 2.0, 92, { pellets: 5, spread: .65, homing: 4.2 }],
    [13.2, .50, 760, .13, 2.2, 184, { pellets: 6, spread: .7, homing: 5.0 }]],
    special: 'Aufgescheuchte Kurpark-Tauben suchen sich ihr Ziel selbst. Nicht elegant, aber unbeirrbar.'
  }),
  W({
    id: 'kettensaege', name: 'Kettensäge', cls: ['blade', 'heavy'], type: 'melee', col: '#ff8a3d',
    scaling: { melee: .6, dmgP: .25 }, unlockDefault: true,
    tiers: [[2.7, .18, 92, .07, 1.8, 24, { arc: .95, knock: 40, bleed: 1 }],
    [4.5, .17, 100, .08, 1.9, 48, { arc: 1.0, knock: 46, bleed: 1 }],
    [7.4, .16, 108, .10, 2.1, 100, { arc: 1.05, knock: 54, bleed: 1 }],
    [12.1, .15, 118, .12, 2.3, 200, { arc: 1.15, knock: 62, bleed: 1 }]],
    special: 'Läuft durch, solange der Finger am Gas bleibt. Sehr kurze Reichweite, dafür ein durchgehender Fleischwolf.'
  }),
  W({
    id: 'laserzirkel', name: 'Laserzirkel', cls: ['elemental', 'precise'], type: 'aura', col: '#59e6ff',
    scaling: { elem: .5, range: .2 }, unlockDefault: true,
    tiers: [[7, .32, 116, .06, 1.7, 28, { elemental: 1, burn: 4 }],
    [12, .30, 128, .07, 1.8, 56, { elemental: 1, burn: 6 }],
    [19, .28, 142, .09, 2.0, 116, { elemental: 1, burn: 9 }],
    [31, .26, 158, .11, 2.2, 232, { elemental: 1, burn: 13 }]],
    special: 'Zwei rotierende Schnittstrahlen kreisen um den Träger und brennen alles an, was zu nah kommt.'
  }),
  W({
    id: 'blitzableiter', name: 'Blitzableiter', cls: ['elemental', 'support'], type: 'chain', col: '#ffe27a',
    scaling: { elem: .55 }, unlockDefault: true,
    tiers: [[11, .78, 300, .07, 1.8, 26, { chain: 4, chainRange: 150, elemental: 1, shock: 1 }],
    [18, .72, 330, .08, 1.9, 52, { chain: 5, chainRange: 165, elemental: 1, shock: 1 }],
    [29, .66, 360, .10, 2.1, 108, { chain: 7, chainRange: 180, elemental: 1, shock: 1 }],
    [47, .60, 400, .12, 2.3, 216, { chain: 9, chainRange: 200, elemental: 1, shock: 1 }]],
    special: 'Zieht die Entladung vom Dach in die Menge. Springt weiter als jede andere Kette und betäubt kurz.'
  }),
  W({
    id: 'ratschlaege', name: 'Gute Ratschläge', cls: ['support', 'precise'], type: 'projectile', col: '#ffd24a',
    scaling: { ranged: .55, luck: .30 }, unlockDefault: true,
    tiers: [[7.3, .50, 560, .07, 1.7, 14, { pierce: 1, slow: .22, slowT: 1.6, advice: 1 }],
    [11.7, .47, 600, .08, 1.8, 28, { pierce: 2, slow: .26, slowT: 1.8, advice: 1 }],
    [19, .44, 660, .10, 2.0, 58, { pierce: 3, slow: .30, slowT: 2.0, advice: 1 }],
    [30.7, .40, 740, .12, 2.2, 116, { pierce: 4, slow: .34, slowT: 2.2, advice: 1 }]],
    special: 'Ös Signature: gut gemeinte Ratschläge als Sprechblasen. Sie schweben leicht, durchschlagen mehrere Gegner und lassen sie grübelnd langsamer werden.'
  }),
  W({
    id: 'gravgun', name: 'Gravity Gun', cls: ['heavy', 'explosive'], type: 'projectile', col: '#a06bff',
    scaling: { ranged: .80, eng: .30 },
    tiers: [[26.2, 1.8, 300, .03, 1.5, 40, { pull: 100, boom: 60 }], [43.6, 1.7, 320, .03, 1.5, 78, { pull: 130, boom: 70 }],
    [69.8, 1.6, 350, .03, 1.75, 152, { pull: 160, boom: 80 }], [104.7, 1.5, 400, .03, 2.0, 298, { pull: 200, boom: 95 }]],
    special: 'Erzeugt ein Gravitationszentrum, das Gegner heranzieht und zerquetscht.',
    unlock: { key: 'pulled', need: 500, text: 'Ziehe 500 Gegner mit der Gravity Gun an' }
  }),
  W({
    id: 'tesla', name: 'Tesla Coil', cls: ['elemental', 'support'], type: 'chain', col: '#39e6ff',
    scaling: { elem: .30, eng: .30 },
    tiers: [[7.1, .30, 250, .08, 1.8, 22, { chain: 3, elemental: 1 }], [12, .28, 280, .08, 1.8, 44, { chain: 4, elemental: 1 }],
    [19.8, .26, 320, .10, 2.0, 88, { chain: 5, elemental: 1 }], [31.8, .24, 380, .10, 2.0, 176, { chain: 7, elemental: 1 }]],
    special: 'Kettenblitz springt auf 3/4/5/7 Gegner über — Partikelblitz mit Funkenflug. Skaliert mit Elementar und Technik.',
    unlock: { key: 'chain10', need: 1, text: 'Treffe 10 Gegner mit einer einzigen Kette' }
  }),
  W({
    id: 'frost', name: 'Frost Cannon', cls: ['gun', 'medieval'], type: 'projectile', col: '#9fe4ff',
    scaling: { ranged: .55 },
    tiers: [[32, 1.2, 500, .03, 1.5, 30, { slow: .30, slowT: 2.0, elemental: 1 }], [53, 1.1, 550, .03, 1.5, 58, { slow: .40, slowT: 2.5, elemental: 1 }],
    [85, 1.0, 600, .03, 1.75, 114, { slow: .50, slowT: 3.0, elemental: 1 }], [135, .90, 700, .03, 2.0, 224, { slow: .60, slowT: 4.0, elemental: 1 }]],
    special: 'Vereist Gegner: verlangsamt um 30–60% für 2–4 s.',
    unlock: { key: 'flawless10', need: 1, text: 'Überlebe Welle 10 ohne Schaden zu nehmen' }
  }),
  W({
    id: 'spore', name: 'Spore Launcher', cls: ['primitive', 'explosive'], type: 'projectile', col: '#b8d98a',
    scaling: { ranged: .55, elem: .25 },
    tiers: [[9, .55, 400, .05, 1.5, 25, { poison: 8, poisonT: 3, cloud: 60 }], [14, .50, 430, .05, 1.5, 48, { poison: 14, poisonT: 3, cloud: 68 }],
    [22, .45, 470, .05, 1.75, 96, { poison: 22, poisonT: 3, cloud: 76 }], [36, .40, 550, .05, 2.0, 188, { poison: 36, poisonT: 3, cloud: 92 }]],
    special: 'Hinterlässt eine Giftwolke: 8–36 Schaden über 3 s.',
    unlock: { key: 'poisonKills', need: 50, text: 'Töte 50 Gegner mit Gift' }
  }),
  W({
    id: 'photon', name: 'Photon Rifle', cls: ['precise', 'gun'], type: 'projectile', col: '#ffe27a',
    scaling: { ranged: .75 },
    tiers: [[39.4, 1.3, 600, .15, 2.0, 38, { armorPierce: .20 }], [65.7, 1.2, 650, .18, 2.25, 74, { armorPierce: .30 }],
    [105.1, 1.1, 720, .20, 2.5, 146, { armorPierce: .40 }], [164.2, 1.0, 800, .25, 3.0, 286, { armorPierce: .50 }]],
    special: 'Präzisionsschuss ignoriert 20–50% der gegnerischen Rüstung.',
    unlock: { key: 'critStreak', need: 10, text: 'Erziele 10 kritische Treffer in Folge' }
  }),
  W({
    id: 'arc', name: 'Arc Thrower', cls: ['elemental', 'heavy'], type: 'charge', col: '#5dff9b',
    scaling: { elem: .60 },
    tiers: [[10, 1.0, 280, .03, 1.5, 32, { chargeMax: 2.0, chargeT: 1.4, elemental: 1 }], [18, .95, 310, .03, 1.5, 62, { chargeMax: 2.2, chargeT: 1.4, elemental: 1 }],
    [28, .90, 350, .03, 1.75, 122, { chargeMax: 2.5, chargeT: 1.3, elemental: 1 }], [45, .85, 420, .03, 2.0, 240, { chargeMax: 3.0, chargeT: 1.2, elemental: 1 }]],
    special: 'Lädt sich auf: bis zu 200–300% Schaden als durchschlagender Bogenblitz.',
    unlock: { key: 'fullCharges', need: 100, text: 'Lade die Waffe 100 Mal voll auf' }
  }),
  W({
    id: 'needle', name: 'Needle Gun', cls: ['precise', 'medical'], type: 'projectile', col: '#8affb0',
    scaling: { ranged: .45, hpRegen: .30 },
    tiers: [[3, .15, 400, .10, 1.5, 20, { healHit: 1 }], [5, .14, 430, .12, 1.5, 40, { healHit: 2 }],
    [9, .13, 470, .15, 1.75, 80, { healHit: 3 }], [15, .12, 550, .18, 2.0, 160, { healHit: 5 }]],
    special: 'Heilnadeln: 1–5 HP Heilung pro Treffer.',
    unlock: { key: 'needleHeal', need: 500, text: 'Heile 500 HP mit der Needle Gun' }
  }),
  W({
    id: 'vortex', name: 'Vortex Cannon', cls: ['support', 'explosive'], type: 'aura', col: '#ff2e88',
    scaling: { ranged: .35, eng: .35 },
    tiers: [[2, .20, 200, .03, 1.5, 26, { pull: 120, dur: 1.5 }], [4, .18, 230, .03, 1.5, 50, { pull: 150, dur: 2.0 }],
    [7, .16, 270, .03, 1.75, 100, { pull: 180, dur: 3.0 }], [12, .14, 330, .03, 2.0, 196, { pull: 220, dur: 4.0 }]],
    special: 'Permanenter Wirbel um dich: zieht Gegner an und fügt Dauerschaden zu.',
    unlock: { key: 'vortexPulled', need: 200, text: 'Ziehe 200 Gegner in einen Wirbel' }
  }),
  W({
    id: 'starfall', name: 'Starfall Bow', cls: ['medieval', 'precise'], type: 'projectile', col: '#ffd7f5',
    scaling: { ranged: .70 },
    tiers: [[4.2, 1.1, 550, .08, 2.0, 36, { pellets: 3, spread: .30, arcRain: 1 }], [6.6, 1.0, 600, .10, 2.25, 70, { pellets: 4, spread: .32, arcRain: 1 }],
    [10.5, .90, 660, .12, 2.5, 138, { pellets: 5, spread: .34, arcRain: 1 }], [16.5, .80, 750, .15, 3.0, 270, { pellets: 6, spread: .36, arcRain: 1 }]],
    special: 'Sternenregen: 3–6 Leuchtpfeile gleichzeitig, die beim Aufprall funkeln.',
    unlock: { key: 'starfall3', need: 1, text: 'Treffe 3 Gegner gleichzeitig mit Sternenregen' }
  }),
  W({
    id: 'leg_rheingold', name: 'RHEINGOLD-ORGEL', cls: ['gun', 'heavy', 'explosive'], type: 'projectile', col: '#f4c25a', legendary: true,
    scaling: { ranged: .70, eng: .30 },
    tiers: [[16, .32, 380, .06, 1.8, 90, { pellets: 6, spread: .42, boom: 42, elemental: 1 }], [27, .30, 420, .07, 1.8, 180, { pellets: 7, spread: .44, boom: 52, elemental: 1 }],
    [44, .27, 470, .08, 2.0, 360, { pellets: 8, spread: .46, boom: 64, elemental: 1 }], [70, .24, 540, .10, 2.25, 720, { pellets: 10, spread: .50, boom: 80, elemental: 1 }]],
    special: 'Legendär: Acht goldene Rohre — jede Salve detoniert mit Elementarkraft.'
  }),
  W({
    id: 'leg_neroberg', name: 'NEROBERG-STURM', cls: ['elemental', 'heavy'], type: 'chain', col: '#b9a6ff', legendary: true,
    scaling: { elem: .45, eng: .30 },
    tiers: [[11, .26, 320, .08, 1.9, 90, { chain: 8, elemental: 1 }], [18, .24, 360, .10, 2.0, 180, { chain: 10, elemental: 1 }],
    [30, .22, 420, .12, 2.25, 360, { chain: 12, elemental: 1 }], [48, .20, 500, .15, 2.5, 720, { chain: 15, elemental: 1 }]],
    special: 'Legendär: Ein lebender Blitz gewinnt mit jedem Sprung an Schärfe.'
  }),
  W({
    id: 'leg_thermal', name: 'THERMAL-DAMPFKANONE', cls: ['elemental', 'gun', 'support'], type: 'cone', col: '#ff7a3d', legendary: true,
    scaling: { elem: .50, eng: .25 },
    tiers: [[10, .34, 330, .04, 1.6, 90, { cone: 1.4, burn: 2.4, elemental: 1 }], [17, .31, 370, .05, 1.7, 180, { cone: 1.5, burn: 3.2, elemental: 1 }],
    [28, .28, 420, .06, 1.8, 360, { cone: 1.6, burn: 4.0, elemental: 1 }], [45, .25, 500, .08, 2.0, 720, { cone: 1.8, burn: 5.0, elemental: 1 }]],
    special: 'Legendär: Überdruck-Dampfstrahl — verbrennt Feinde und lädt Elementarreaktionen.'
  })
];
const WEAPON_BY_ID = Data.register('weapons', WEAPONS, {
  id: 'id', name: 'req|str', col: 'str', type: 'in:projectile,hitscan,cone,chain,charge,aura,melee',
  scaling: (w) => { for (const k in (w.scaling || {})) if (!STAT_KEYS.includes(k)) return 'unbekannter Scaling-Stat ' + k + ' (tot im Spiel)'; return null; },
  tiers: (w) => { if (!Array.isArray(w.tiers) || w.tiers.length < 1) return 'tiers fehlt'; for (const a of w.tiers) if (!Array.isArray(a) || a.length < 6 || typeof a[0] !== 'number' || !(a[0] > 0)) return 'Tier-Zeile ungueltig'; return null; }
}).byId;

function E(id, name, o) { return Object.assign({ id, name }, o); }
const ENEMIES = [
  E('runner', 'Läufer', { hp: 11, dmg: 6, spd: 148, r: 11, col: '#ff5d6e', xp: 1, mat: 1, ai: 'chase', shape: 'tri', minW: 1, w: 30, pack: 1 }),
  E('swarm', 'Brut', { hp: 5, dmg: 3, spd: 190, r: 8, col: '#ff9a5c', xp: 1, mat: 1, ai: 'chase', shape: 'dot', minW: 1, w: 26, pack: 1 }),
  E('walker', 'Schlurfer', { hp: 20, dmg: 8, spd: 92, r: 14, col: '#c96be0', xp: 2, mat: 1, ai: 'chase', shape: 'box', minW: 1, w: 24 }),
  E('flyer', 'Drohne', { hp: 13, dmg: 6, spd: 168, r: 10, col: '#59e6ff', xp: 2, mat: 1, ai: 'orbit', fly: true, shape: 'diamond', minW: 3, w: 18 }),
  E('shooter', 'Schütze', { hp: 17, dmg: 0, spd: 88, r: 12, col: '#7dffb0', xp: 3, mat: 2, ai: 'ranged', shape: 'tri', minW: 3, w: 20, shot: { dmg: 8, spd: 240, cd: 1.9, range: 400, col: '#7dffb0' } }),
  E('spitter', 'Spucker', { hp: 22, dmg: 0, spd: 78, r: 13, col: '#b8d98a', xp: 3, mat: 2, ai: 'ranged', shape: 'box', minW: 5, w: 16, shot: { dmg: 6, spd: 190, cd: 2.3, range: 340, col: '#b8d98a', poison: 10 } }),
  E('exploder', 'Zünder', { hp: 16, dmg: 0, spd: 128, r: 13, col: '#ff2e88', xp: 3, mat: 2, ai: 'exploder', shape: 'dot', minW: 4, w: 18, boom: { dmg: 20, r: 92 } }),
  E('charger', 'Rammer', { hp: 34, dmg: 14, spd: 74, r: 16, col: '#ffb24a', xp: 4, mat: 2, ai: 'charger', shape: 'tri', minW: 6, w: 15 }),
  E('tank', 'Panzer', { hp: 58, dmg: 13, spd: 62, r: 21, col: '#9fb4d8', armor: 7, xp: 5, mat: 3, ai: 'chase', shape: 'box', minW: 5, w: 14 }),
  E('healer', 'Sanitäter', { hp: 26, dmg: 5, spd: 104, r: 13, col: '#8affb0', xp: 4, mat: 3, ai: 'healer', shape: 'cross', minW: 7, w: 11, heal: { amt: 8, cd: 1.7, r: 190 } }),
  E('shielder', 'Schildträger', { hp: 40, dmg: 9, spd: 84, r: 17, col: '#c7a6ff', armor: 4, xp: 5, mat: 3, ai: 'aura', shape: 'hex', minW: 8, w: 11, aura: { armor: 6, r: 170 } }),
  E('summoner', 'Beschwörer', { hp: 44, dmg: 7, spd: 70, r: 16, col: '#a06bff', xp: 6, mat: 4, ai: 'summoner', shape: 'hex', minW: 9, w: 9, summon: { id: 'swarm', n: 3, cd: 4.5 } }),
  E('elite', 'Elite-Wache', { hp: 95, dmg: 18, spd: 108, r: 19, col: '#ffe27a', armor: 9, xp: 9, mat: 6, ai: 'chase', shape: 'star', minW: 11, w: 8 }),
  E('ghost', 'Phasenwandler', { hp: 30, dmg: 11, spd: 132, r: 13, col: '#dbe6ff', xp: 5, mat: 3, ai: 'chase', fly: true, phase: true, shape: 'diamond', minW: 12, w: 9 }),
  E('spliter', 'Kristallsplitter', { hp: 24, dmg: 7, spd: 128, r: 13, col: '#7df2ff', xp: 3, mat: 2, ai: 'chase', shape: 'hex', minW: 7, w: 12, split: { id: 'shardling', n: 2, depth: 1 } }),
  E('shardling', 'Splitterling', { hp: 8, dmg: 4, spd: 172, r: 9, col: '#9fe4ff', xp: 1, mat: 1, ai: 'chase', shape: 'dot', minW: 999, w: 12, split: { id: 'shardling', n: 2, depth: 2 } }),
  E('shielded', 'Schildberzerker', { hp: 46, dmg: 11, spd: 100, r: 17, col: '#9fb4d8', armor: 5, xp: 5, mat: 3, ai: 'shielded', shape: 'hex', minW: 9, w: 10, shieldArc: 1.15 }),
  E('blinker', 'Teleporter', { hp: 24, dmg: 8, spd: 132, r: 12, col: '#c7a6ff', xp: 4, mat: 3, ai: 'teleport', shape: 'diamond', minW: 10, w: 9, blink: { cd: 2.4, min: 110, max: 250 } }),
  E('vampire', 'Nachtjäger', { hp: 34, dmg: 12, spd: 120, r: 14, col: '#ff2e88', xp: 5, mat: 3, ai: 'chase', shape: 'tri', minW: 12, w: 8, vamp: .35, pack: 1 }),
  /* ---------- Neue Gegnertypen ---------- */
  E('spinner', 'Kreisel', { hp: 28, dmg: 6, spd: 116, r: 13, col: '#ffb0e0', xp: 4, mat: 2, ai: 'spiral', shape: 'gear', minW: 4, w: 16,
    shot: { dmg: 5, spd: 200, cd: 2.1, range: 999, col: '#ffb0e0' }, radial: 6 }),
  E('mortar', 'Mörser', { hp: 34, dmg: 0, spd: 56, r: 16, col: '#c0a06b', xp: 5, mat: 3, ai: 'mortar', shape: 'turret', minW: 6, w: 13,
    lob: { dmg: 16, cd: 3.2, range: 620, r: 74, flight: 1.35 } }),
  E('weaver', 'Weber', { hp: 24, dmg: 7, spd: 150, r: 12, col: '#dcd0ff', xp: 4, mat: 2, ai: 'weaver', shape: 'spider', minW: 5, w: 15,
    web: { cd: 1.5, r: 58, slow: .45, life: 5 } }),
  E('sentinel', 'Wächter', { hp: 52, dmg: 0, spd: 30, r: 17, col: '#ff7a5c', armor: 6, xp: 6, mat: 4, ai: 'sentinel', shape: 'eye', minW: 8, w: 11,
    beam: { dmg: 15, cd: 3.6, warn: .9, range: 560, w: 16 } }),
  E('leech', 'Blutegel', { hp: 22, dmg: 3, spd: 164, r: 11, col: '#a8324e', xp: 4, mat: 2, ai: 'leech', shape: 'worm', minW: 6, w: 14,
    drain: { dps: 7, cd: 3.4, heal: .8 } }),
  E('bomber', 'Bomberdrohne', { hp: 26, dmg: 5, spd: 156, r: 12, col: '#ffd24a', xp: 5, mat: 3, ai: 'bomber', fly: true, shape: 'wing', minW: 7, w: 12,
    mine: { cd: 2.3, fuse: 1.7, r: 78, dmg: 17 } }),
  E('mirror', 'Spiegelgänger', { hp: 36, dmg: 10, spd: 128, r: 14, col: '#bfe8ff', xp: 6, mat: 4, ai: 'mirror', shape: 'prism', minW: 9, w: 10,
    reflect: .28 }),
  E('juggernaut', 'Kolosswache', { hp: 96, dmg: 16, spd: 54, r: 23, col: '#7f8ba3', armor: 12, xp: 9, mat: 6, ai: 'juggernaut', shape: 'brick', minW: 11, w: 8,
    slam: { cd: 4.2, r: 132, dmg: 18, warn: .7 }, noKnock: true }),
  E('siren', 'Sirene', { hp: 40, dmg: 6, spd: 92, r: 15, col: '#ff5ce0', xp: 7, mat: 4, ai: 'siren', shape: 'wave', minW: 10, w: 9,
    wail: { cd: 5.2, r: 260, spd: 1.35, dur: 4.5, cdPenalty: 1.2 } })
];
const ENEMY_BY_ID = Data.register('enemies', ENEMIES, {
  id: 'id', name: 'req|str', hp: 'num>0', dmg: 'num>=0', spd: 'num>0', r: 'num>0', col: 'str', xp: 'num>=0', mat: 'num>=0',
  summon: (e) => e.summon && e.summon.id && !ENEMY_BY_ID[e.summon.id] ? 'summon.id unbekannt: ' + e.summon.id : null,
  split: (e) => e.split && e.split.id && !ENEMY_BY_ID[e.split.id] ? 'split.id unbekannt: ' + e.split.id : null
}).byId;

const ARENAS = [
  { id: 'kurpark', name: 'KURPARK', w: 1100, h: 850, ground: '#1e3d2e', grid: '#2a543d', accent: '#5dff9b', theme: 'offen', buildings: 3, cover: 5, poison: 1, speedField: 2, movingWalls: 1, desc: 'Offene Rasenflächen, Pavillons, Teich.' },
  { id: 'innenstadt', name: 'INNENSTADT', w: 1000, h: 800, ground: '#242738', grid: '#353a52', accent: '#ffe27a', theme: 'eng', buildings: 7, cover: 7, poison: 1, speedField: 1, movingWalls: 2, desc: 'Enge Gassen zwischen Gründerzeitfassaden.' },
  { id: 'rheinufer', name: 'RHEINUFER', w: 1150, h: 750, ground: '#142d47', grid: '#1e4468', accent: '#39e6ff', theme: 'weit', buildings: 2, cover: 4, poison: 2, speedField: 3, movingWalls: 1, desc: 'Weite Uferpromenade, treibende Pontons.' },
  { id: 'labor', name: 'FORSCHUNGSLABOR', w: 1000, h: 1000, ground: '#241c2e', grid: '#3d2f4c', accent: '#a06bff', theme: 'räume', buildings: 9, cover: 3, poison: 2, speedField: 1, movingWalls: 2, desc: 'Kammerstruktur mit Schleusen und Chemieleckagen.' },
  { id: 'neroberg', name: 'NEROBERG-ARENA', w: 1200, h: 950, ground: '#35201f', grid: '#4f2e33', accent: '#ff2e88', theme: 'boss', buildings: 1, cover: 3, poison: 1, speedField: 2, movingWalls: 1, desc: 'Gewaltige offene Fläche unter dem Monopteros.' },
  { id: 'warmerdamm', name: 'WARMER DAMM', w: 1100, h: 850, ground: '#3a3924', grid: '#5c5632', accent: '#ffd23e', theme: 'weit', buildings: 3, cover: 5, poison: 1, speedField: 3, movingWalls: 1, desc: 'Sonnenallee mit Palmen, Dauerfeuer unter Linden.' },
  { id: 'schlachthof', name: 'SCHLACHTHOF', w: 1050, h: 850, ground: '#331c22', grid: '#512b35', accent: '#ff6a3d', theme: 'eng', buildings: 8, cover: 6, poison: 2, speedField: 1, movingWalls: 2, desc: 'Verwaiste Schlachthallen voller Haken und Dampf.' },
  { id: 'rheingau', name: 'RHEINGAU-TERRASSEN', w: 1150, h: 850, ground: '#243220', grid: '#384d32', accent: '#8fd46a', theme: 'weit', buildings: 5, cover: 5, poison: 1, speedField: 2, movingWalls: 1, desc: 'Weinberg-Terrassen am Hang, steile Wege und Ausblick auf den Rhein.' }
];

Data.register('arenas', ARENAS, { id: 'id', name: 'req|str', w: 'num>0', h: 'num>0', ground: 'str', grid: 'str', accent: 'str', theme: 'str', buildings: 'num>=0', cover: 'num>=0', poison: 'num>=0' });

const ACHIEVEMENTS = [
  { id: 'a_first', name: 'Erster Einsatz', desc: 'Schließe Welle 1 ab.', key: 'wavesCleared', need: 1 },
  { id: 'a_w5', name: 'Warmgelaufen', desc: 'Schließe Welle 5 ab.', key: 'bestWave', need: 5 },
  { id: 'a_w10', name: 'Halbzeit', desc: 'Schließe Welle 10 ab.', key: 'bestWave', need: 10 },
  { id: 'a_w15', name: 'Endspurt', desc: 'Schließe Welle 15 ab.', key: 'bestWave', need: 15 },
  { id: 'a_win', name: 'Wiesbaden gerettet', desc: 'Überstehe alle 20 Wellen.', key: 'wavesWon', need: 1 },
  { id: 'a_kill100', name: 'Aufräumdienst', desc: 'Töte 100 Gegner.', key: 'kills', need: 100 },
  { id: 'a_kill1000', name: 'Stadtreinigung', desc: 'Töte 1.000 Gegner.', key: 'kills', need: 1000 },
  { id: 'a_kill5000', name: 'Legende der Arena', desc: 'Töte 5.000 Gegner.', key: 'kills', need: 5000 },
  { id: 'a_boss1', name: 'Kurhaus geschlossen', desc: 'Besiege einen Boss.', key: 'bosses', need: 1 },
  { id: 'a_boss10', name: 'Bossjäger', desc: 'Besiege 10 Bosse.', key: 'bosses', need: 10 },
  { id: 'a_crit10', name: 'Präzisionsserie', desc: '10 Krits in Folge.', key: 'critStreak', need: 10 },
  { id: 'a_crit25', name: 'Chirurg', desc: '25 Krits in Folge.', key: 'critStreak', need: 25 },
  { id: 'a_flawless', name: 'Makellos', desc: 'Überstehe Welle 10 ohne Schaden.', key: 'flawless10', need: 1 },
  { id: 'a_gold500', name: 'Sammler', desc: 'Sammle 500 Material insgesamt.', key: 'materials', need: 500 },
  { id: 'a_gold5000', name: 'Kurhaus-Investor', desc: 'Sammle 5.000 Material insgesamt.', key: 'materials', need: 5000 },
  { id: 'a_six', name: 'Vollbewaffnet', desc: 'Trage 6 Waffen gleichzeitig.', key: 'sixWeapons', need: 1 },
  { id: 'a_t4', name: 'Meisterschmied', desc: 'Bringe eine Waffe auf Stufe 4.', key: 'tier4', need: 1 },
  { id: 'a_cursed', name: 'Verflucht', desc: 'Kaufe 5 verfluchte Items.', key: 'cursedBought', need: 5 },
  { id: 'a_coop', name: 'Nachbarschaftshilfe', desc: 'Beende eine Welle im Koop.', key: 'coopWaves', need: 1 },
  { id: 'a_coopwin', name: 'Team Wiesbaden', desc: 'Gewinne einen Run im Koop.', key: 'coopWin', need: 1 },
  { id: 'a_danger3', name: 'Risikofreude', desc: 'Erreiche Welle 10 auf Gefahr 3.', key: 'danger3wave10', need: 1 },
  { id: 'a_danger5', name: 'Wahnsinn', desc: 'Gewinne auf Gefahr 5.', key: 'danger5win', need: 1 },
  { id: 'a_ethereal', name: 'Ätherisch', desc: 'Bringe eine ätherische Waffe auf 100 Kills.', key: 'etherealKills', need: 100 },
  { id: 'a_chain', name: 'Blitzableiter', desc: 'Treffe 10 Gegner mit einer Kette.', key: 'chain10', need: 1 },
  { id: 'a_pull', name: 'Schwerkraftmeister', desc: 'Ziehe 500 Gegner an.', key: 'pulled', need: 500 },
  { id: 'a_burn', name: 'Feuerwehrmann', desc: 'Töte 100 Gegner mit Feuer.', key: 'burnKills', need: 100 },
  { id: 'a_react', name: 'Chemiker', desc: 'Löse 25 Elementar-Reaktionen aus.', key: 'reactions', need: 25 },
  { id: 'a_poison', name: 'Mykologe', desc: 'Töte 50 Gegner mit Gift.', key: 'poisonKills', need: 50 },
  { id: 'a_boom', name: 'Sprengmeister', desc: 'Töte 150 Gegner mit Explosionen.', key: 'boomKills', need: 150 },
  { id: 'a_heal', name: 'Therapiestunde', desc: 'Heile 500 HP mit der Needle Gun.', key: 'needleHeal', need: 500 },
  { id: 'a_lvl20', name: 'Erfahren', desc: 'Erreiche Stufe 20 in einem Run.', key: 'maxLevel', need: 20 },
  { id: 'a_allchars', name: 'Ensemble', desc: 'Schalte alle Charaktere frei.', key: 'allChars', need: 1 },
  { id: 'a_allweapons', name: 'Waffennarr', desc: 'Schalte alle Waffen frei.', key: 'allWeapons', need: 1 },
  { id: 'a_survivor', name: 'Zäher Hund', desc: 'Überlebe 5 Wellen unter 10% HP.', key: 'lowHpWaves', need: 5 },
  { id: 'a_speed', name: 'Blitzschnell', desc: 'Erreiche 400 Tempo-Wert.', key: 'maxSpeed', need: 400 },
  { id: 'a_rich', name: 'Kurhaus-Erbe', desc: 'Besitze 500 Material gleichzeitig.', key: 'maxMaterialsHeld', need: 500 }
];

Data.register('achievements', ACHIEVEMENTS, { id: 'id', name: 'req|str', desc: 'str', key: 'req|str', need: 'num>0' });


/* BOSSES + Register extrahiert nach data.js (2026-09-04) */
const BOSSES = [
  { id: 'kurhaus', name: 'KURHAUS-KOLOSS', arena: 'innenstadt', hp: 3400, r: 46, col: '#f4c25a', spd: 52, dmg: 22, armor: 10, mat: 60, xp: 40,
    phases: [{ at: 1.0, spd: 52, pattern: 'radial', cd: 2.2, n: 12, bs: 190, bd: 11 },
             { at: .65, spd: 74, pattern: 'charge', cd: 2.6, n: 16, bs: 220, bd: 13 },
             { at: .30, spd: 92, pattern: 'bulletHell', cd: 1.8, n: 18, bs: 200, bd: 15, summon: 'runner' }] },
  { id: 'nerobahn', name: 'NEROBERG-WURM', arena: 'rheinufer', hp: 5700, r: 50, col: '#5dff9b', spd: 66, dmg: 24, armor: 12, mat: 80, xp: 60,
    phases: [{ at: 1.0, spd: 66, pattern: 'spiral', cd: 1.6, n: 5, bs: 210, bd: 12 },
             { at: .60, spd: 88, pattern: 'crossfire', cd: 2.2, n: 7, bs: 240, bd: 14, summon: 'flyer' },
             { at: .28, spd: 112, pattern: 'shockwave', cd: 2.4, n: 22, bs: 240, bd: 16, summon: 'exploder' }] },
  { id: 'kochbrunnen', name: 'KOCHBRUNNEN-GOLEM', arena: 'labor', hp: 11000, r: 54, col: '#ff8a3d', spd: 58, dmg: 28, armor: 16, mat: 110, xp: 85,
    phases: [{ at: 1.0, spd: 58, pattern: 'radial', cd: 1.8, n: 16, bs: 200, bd: 15 },
             { at: .62, spd: 76, pattern: 'arenaHazard', cd: 2.4, n: 4, bs: 0, bd: 17, summon: 'tank' },
             { at: .30, spd: 96, pattern: 'orbitMines', cd: 2.0, n: 14, bs: 130, bd: 18, summon: 'elite' }] },
  { id: 'rogueki', name: 'SEBBOS ROGUE-KI', arena: 'neroberg', hp: 22000, r: 58, col: '#ff2e88', spd: 74, dmg: 32, armor: 20, mat: 180, xp: 140,
    phases: [{ at: 1.0, spd: 74, pattern: 'spiral', cd: 1.2, n: 7, bs: 240, bd: 17, summon: 'ghost' },
             { at: .66, spd: 96, pattern: 'shotgunBurst', cd: 1.5, n: 12, bs: 290, bd: 20, summon: 'elite' },
             { at: .33, spd: 124, pattern: 'bulletHell', cd: 1.4, n: 20, bs: 230, bd: 22, summon: 'summoner' }] },
  { id: 'bergbahn', name: 'BERGBAHN-KOLOSS', arena: 'neroberg', hp: 2600, r: 52, col: '#7fe0a8', spd: 58, dmg: 24, armor: 11, mat: 70, xp: 50,
    phases: [{ at: 1.0, spd: 58, pattern: 'rails', cd: 3.0, n: 3, bs: 230, bd: 13 },
             { at: .62, spd: 78, pattern: 'waterjet', cd: 1.9, n: 14, bs: 260, bd: 15, summon: 'weaver' },
             { at: .30, spd: 100, pattern: 'crossfire', cd: 2.0, n: 8, bs: 220, bd: 17, summon: 'bomber' }] },
  { id: 'sirenkollektiv', name: 'SIRENEN-KOLLEKTIV', arena: 'schlachthof', hp: 5400, r: 48, col: '#ff5ce0', spd: 70, dmg: 26, armor: 13, mat: 95, xp: 70,
    phases: [{ at: 1.0, spd: 70, pattern: 'wailRings', cd: 2.6, n: 18, bs: 150, bd: 13 },
             { at: .64, spd: 88, pattern: 'arenaHazard', cd: 2.2, n: 4, bs: 0, bd: 16, summon: 'siren' },
             { at: .30, spd: 108, pattern: 'wailRings', cd: 1.7, n: 26, bs: 175, bd: 18, summon: 'mirror' }] },
  { id: 'thermalquelle', name: 'THERMALQUELLE', arena: 'warmerdamm', hp: 9500, r: 56, col: '#ff9a3d', spd: 46, dmg: 30, armor: 18, mat: 130, xp: 100,
    phases: [{ at: 1.0, spd: 46, pattern: 'geysers', cd: 2.8, n: 5, bs: 200, bd: 16 },
             { at: .63, spd: 62, pattern: 'steamCone', cd: 2.0, n: 22, bs: 300, bd: 18, summon: 'spitter' },
             { at: .28, spd: 82, pattern: 'bulletHell', cd: 1.6, n: 16, bs: 220, bd: 21, summon: 'juggernaut' }] },
  { id: 'marktturm', name: 'MARKTKIRCHEN-TURM', arena: 'innenstadt', hp: 27000, r: 60, col: '#c7a6ff', spd: 40, dmg: 34, armor: 22, mat: 200, xp: 160,
    phases: [{ at: 1.0, spd: 40, pattern: 'bellwave', cd: 3.0, n: 20, bs: 165, bd: 18, summon: 'shielded' },
             { at: .66, spd: 58, pattern: 'crossfire', cd: 2.2, n: 8, bs: 250, bd: 21, summon: 'sentinel' },
             { at: .32, spd: 76, pattern: 'stoneRain', cd: 1.9, n: 11, bs: 220, bd: 24, summon: 'juggernaut' }] }
];
Data.register('bosses', BOSSES, {
  id: 'id', name: 'req|str', arena: 'ref:arenas', hp: 'num>0', r: 'num>0', col: 'str', spd: 'num>0', dmg: 'num>=0',
  phases: (b) => { if (!Array.isArray(b.phases) || !b.phases.length) return 'braucht Phasen'; for (const ph of b.phases) if (ph.summon && !ENEMY_BY_ID[ph.summon]) return 'phase.summon unbekannt: ' + ph.summon; return null; }
});

/* ITEMS (+ I-Builder) + ITEM_BY_ID + Register extrahiert nach data.js (2026-09-04) */
function I(id, name, r, price, stats, fl, extra) { return Object.assign({ id, name, r, price, stats, fl }, extra || {}); }
const ITEMS = [
  I('kaffee', 'Kurhaus-Kaffee', 1, 20, { speed: 6, atkSpd: 4 }, 'Wiesbadener Frühstücksdoping.'),
  I('turnschuh', 'Laufschuhe', 1, 18, { speed: 10 }, 'Rennen ist auch eine Taktik.'),
  I('helm', 'Feuerwehrhelm', 1, 22, { armor: 2, maxHp: 8 }, 'Leonidas trägt ihn selbst beim Schlafen.'),
  I('verband', 'Erste-Hilfe-Set', 1, 20, { hpRegen: 1, maxHp: 10 }, 'Sylvias Grundausstattung.'),
  I('zielfernrohr', 'Zielfernrohr', 1, 24, { range: 12, crit: 3 }, 'Sehen heißt treffen.'),
  I('multitool', 'Multitool', 1, 22, { eng: 6 }, 'Sebbo hat sieben davon.'),
  I('kleeblatt4', 'Vierblättriges Kleeblatt', 1, 20, { luck: 15 }, 'Aus dem Kurpark. Angeblich.'),
  I('handschuh', 'Arbeitshandschuhe', 1, 19, { melee: 6, armor: 1 }, 'Griffig.'),
  I('magazin', 'Schnellmagazin', 1, 21, { atkSpd: 8 }, 'Klick-klack.'),
  I('pfeffer', 'Pfefferspray', 1, 18, { ranged: 5, dmgP: 3 }, 'Polizeiausrüstung, geliehen.'),

  I('plektrum', 'Goldenes Plektrum', 2, 38, { atkSpd: 10, dmgP: 6 }, 'Jeder Riff ein Treffer.'),
  I('rheinstein', 'Rheinkiesel', 2, 34, { armor: 3, knock: 15 }, 'Vom Ufer, glatt geschliffen.'),
  I('sprungfeder', 'Sprungfeder', 2, 36, { speed: 12, dodge: 5 }, 'Boing.'),
  I('lupe', 'Uhrmacherlupe', 2, 40, { crit: 7, critDmg: 20 }, 'Schwachstellen sind überall.'),
  I('drohne', 'Wartungsdrohne', 2, 45, { eng: 12 }, 'Summt beruhigend.', { turret: true }),
  I('thermo', 'Thermoschutz', 2, 36, { elem: 10, armor: 1 }, 'Hitze? Welche Hitze.'),
  I('sanikoffer', 'Sanitätskoffer', 2, 42, { maxHp: 25, hpRegen: 2 }, 'Therapie für den Körper.'),
  I('kompressor', 'Kompressor', 2, 40, { expSize: 25, dmgP: 5 }, 'Größer ist besser.'),
  I('stachel', 'Stachelpanzer', 2, 38, { armor: 4, melee: 8 }, 'Wer dich trifft, blutet mit.', { thorns: 6 }),
  I('parfum', 'Nerobergluft', 2, 35, { harvest: 4, luck: 12 }, 'Materialmagnet.'),
  I('bounce', 'Gummibeschichtung', 2, 44, { bounce: 1, dmgP: 4 }, 'Projektile prallen einmal ab.'),
  I('pierce', 'Wolframkern', 2, 46, { pierce: 1, ranged: 6 }, 'Durch und durch.'),

  I('reaktor', 'Mini-Reaktor', 3, 72, { eng: 20, elem: 12 }, 'Technomagie in Reinform.', { turret: true }),
  I('adrenalin', 'Adrenalinpumpe', 3, 68, { atkSpd: 18, speed: 8, maxHp: -10 }, 'Der Körper zahlt später.'),
  I('brille', 'Analysebrille', 3, 70, { crit: 10, critDmg: 35 }, 'Sebbo hat sie kalibriert.'),
  I('exo', 'Exo-Skelett', 3, 78, { armor: 6, maxHp: 30, speed: -6 }, 'Schwer, aber sicher.'),
  I('vampir', 'Blutkonserve', 3, 74, { lifesteal: 18, maxHp: 15 }, 'Frisch aus der Klinik.'),
  I('quantum', 'Quantenkondensator', 3, 80, { dmgP: 18, elem: 15 }, 'Blitzt bläulich.'),
  I('phasenweste', 'Phasenweste', 3, 72, { dodge: 14, speed: 6 }, 'Manchmal einfach nicht da.'),
  I('goldkurhaus', 'Kurhaus-Goldbarren', 3, 76, { harvest: 8, luck: 30, xpGain: 10 }, 'Reich ist, wer überlebt.'),
  I('sturmgewicht', 'Sturmgewicht', 3, 70, { melee: 20, knock: 40 }, 'Nahkampf-Fundament.'),
  I('serverfarm', 'Serverfarm', 3, 84, { eng: 25, atkSpd: 8 }, 'Sebbos Keller, komprimiert.', { turret: true }),

  I('halbgott', 'Halbgott-Fragment', 4, 130, { dmgP: 25, crit: 10, speed: 8, maxHp: 20 }, 'Ein Splitter von Sebbos wahrer Natur.'),
  I('herzensglut', 'Herzensglut', 4, 125, { lifesteal: 25, hpRegen: 4, elem: 20 }, 'Sylvias Wärme, materialisiert.'),
  I('sirene', 'Ewige Sirene', 4, 128, { ranged: 30, atkSpd: 15, range: 15 }, 'Man hört sie bis Mainz.'),
  I('bollwerkplatte', 'Bollwerkplatte', 4, 122, { armor: 10, maxHp: 45, speed: -8 }, 'Unbeweglich, unsterblich.'),
  I('supernova', 'Supernova-Kern', 4, 140, { dmgP: 35, expSize: 40, maxHp: -25 }, 'Alles brennt. Auch du.'),
  I('zeitschleife', 'Zeitschleife', 4, 135, { atkSpd: 25, dodge: 10, xpGain: 20 }, 'Zwei Sekunden Vorsprung, immer.'),

  I('c_gier', 'Fluch der Gier', 3, 55, { harvest: 15, luck: 40, maxHp: -30 }, 'Materialien glänzen. Dein Blut auch.', { cursed: true }),
  I('c_raserei', 'Fluch der Raserei', 3, 58, { atkSpd: 35, speed: 15, armor: -6 }, 'Schneller. Immer schneller.', { cursed: true }),
  I('c_zorn', 'Fluch des Zorns', 4, 90, { dmgP: 60, crit: 20, maxHp: -45, dodge: -10 }, 'Der Zorn nimmt, was er gibt.', { cursed: true }),
  I('c_stille', 'Fluch der Stille', 3, 60, { range: 40, ranged: 25, hpRegen: -3 }, 'Weit sehen, langsam sterben.', { cursed: true }),
  I('c_eisen', 'Fluch des Eisens', 3, 62, { armor: 12, maxHp: 40, speed: -25, atkSpd: -12 }, 'Ein Denkmal deiner selbst.', { cursed: true }),
  I('c_echo', 'Fluch des Echos', 4, 95, { elem: 40, expSize: 50, lifesteal: -15, armor: -4 }, 'Jede Explosion trifft auch dich.', { cursed: true })
];
const ITEM_BY_ID = Data.register('items', ITEMS, {
  id: 'id', name: 'req|str', r: 'num>=1', price: 'num>0',
  stats: (i) => { for (const k in (i.stats || {})) if (!STAT_KEYS.includes(k)) return 'unbekannter Stat ' + k; return null; }
}).byId;

/* DANGERS + Register extrahiert nach data.js (2026-09-04) */
const DANGERS = [
  { n: 0, hp: 1.00, dmg: 1.00, spd: 1.00, cnt: 1.00, price: 1.00, desc: 'Standard-Einsatz' },
  { n: 1, hp: 1.25, dmg: 1.12, spd: 1.04, cnt: 1.15, price: 1.10, desc: 'Erhöhte Alarmstufe' },
  { n: 2, hp: 1.55, dmg: 1.25, spd: 1.08, cnt: 1.30, price: 1.20, desc: 'Elitegegner ab Welle 6' },
  { n: 3, hp: 1.95, dmg: 1.40, spd: 1.12, cnt: 1.45, price: 1.32, desc: 'Bosse mit Extraphase' },
  { n: 4, hp: 2.45, dmg: 1.60, spd: 1.16, cnt: 1.62, price: 1.45, desc: 'Materialertrag erhöht (+15%)' },
  { n: 5, hp: 3.10, dmg: 1.85, spd: 1.22, cnt: 1.80, price: 1.60, desc: 'Wahnsinn — keine Gnade' },
  { n: 6, hp: 4.00, dmg: 2.15, spd: 1.28, cnt: 2.00, price: 1.80, desc: 'NEW GAME+ — Härte' },
  { n: 7, hp: 5.20, dmg: 2.50, spd: 1.35, cnt: 2.25, price: 2.05, desc: 'NEW GAME+ — Prüfung' },
  { n: 8, hp: 7.00, dmg: 3.00, spd: 1.45, cnt: 2.60, price: 2.40, desc: 'NEW GAME+ — Narrenturm' }
];
Data.register('dangers', DANGERS, { n: 'num>=0', hp: 'num>0', dmg: 'num>=0', spd: 'num>0', cnt: 'num>0', price: 'num>0', desc: 'str' });

/* MODS + Register extrahiert nach data.js (2026-09-04) */
const MODS = [
  { id: 'zeitdruck', name: 'ZEITDRUCK', col: '#ff2e88', desc: 'Wellen-Timer -20%' },
  { id: 'elite_doppel', name: 'ELITE-DOPPEL', col: '#ffe27a', desc: 'Doppelt so viele Elites' },
  { id: 'materialhagel', name: 'MATERIALHAGEL', col: '#f4c25a', desc: '+40% Beute · Gegner +5% Tempo' },
  { id: 'halbe_heilung', name: 'HALBE HEILUNG', col: '#8affb0', desc: 'Alle Heilung -50%' },
  { id: 'dunkelheit', name: 'DUNKELHEIT', col: '#a06bff', desc: 'Sichtradius stark verringert' },
  { id: 'adrenalin', name: 'ADRENALINRAUSCH', col: '#39e6ff', desc: 'Alle +15% Tempo — auch Gegner' },
  { id: 'blutmond', name: 'BLUTMOND', col: '#ff4d5e', desc: 'Gegner heilen bei Kills' },
  { id: 'umschaltung', name: 'UMSCHALTUNG', col: '#39e6ff', desc: 'Waffen rotieren alle 15s' },
  { id: 'ressourcen_dieb', name: 'RESSOURCENDIEB', col: '#f4c25a', desc: 'Gegner stehlen Material bei Treffern' }
];
Data.register('mods', MODS, { id: 'id', name: 'req|str', col: 'str', desc: 'str' });

/* Dual-Mode-Abschluss: im Browser reichen die top-level consts (externes Script vor dem
   Engine-Script). Unter Node (BalanceSim-Analyse/Regressionschecks) explizit exportieren. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STAT_DEF, STAT_KEYS, STAT_NAME, STAT_UNIT, Data,
    CHARS, CHAR_BY_ID, CharacterProfiles, WEAPONS, WEAPON_BY_ID, ENEMIES, ENEMY_BY_ID,
    ARENAS, ACHIEVEMENTS,
    ITEM_BY_ID, ITEMS, BOSSES, DANGERS, MODS };
}
