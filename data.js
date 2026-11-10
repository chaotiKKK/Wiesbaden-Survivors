// Daten-Registries (reine Tabellen + Data-Infrastruktur), extrahiert aus index.html.
// Muss VOR dem Engine-Script geladen werden: klassische Scripts teilen den globalen
// Lexikal-Scope, die top-level consts (CHARS, WEAPONS, ...) sind also im Engine-Script
// sichtbar. Reihenfolge = Originaldatei. Data.validate() laeuft nur im ?selftest.
/* Fünf-Viertel-Kampagne: die JSON-Datei ist die Autorenquelle. Im Browser lädt
   content/fuenf-viertel.data.js den generierten Mirror vor dieser Datei; unter
   Node wird dieselbe JSON-Datei direkt gelesen. */
const FUENF_VIERTEL = (typeof FUENF_VIERTEL_DATA !== 'undefined')
  ? FUENF_VIERTEL_DATA
  : (typeof require === 'function' ? require('./content/fuenf-viertel.json') : null);
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
    stats: { armor: 4, dodge: 8, maxHp: 5, dmgP: -5 }, startWeapon: 'friedenshorn',
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
    stats: { ranged: 12, crit: 8, speed: 5, maxHp: -5 }, startWeapon: 'zugriffshaken',
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
  {"id": "kaykit_barbarian", "synergy": {"cls":"blunt","need":2,"stats":{"melee":10,"knock":20},"text":"2× Blunt: +10 Nahkampf, +20% Rückstoß"}, "name": "Barbarian", "role": "KayKit · Nahkämpfer", "col": "#d4a373", "col2": "#8a5a2a", "desc": "KayKit-Barbar mit Axt und Fellumhang. Stürmt voran, wo andere zaudern.", "skin": {"build": "wide", "head": "#e0c6a2", "hat": "bear", "prop": "none", "chest": "#d4a373"}, "stats": {"maxHp": 20, "melee": 12, "armor": 2, "speed": -4}, "startWeapon": "hammer", "ability": {"id": "barbarenwut", "name": "Barbarenwut", "cd": 10, "desc": "Brüllt und stürmt vor: Schaden + Stun im Kegel."}, "sprite": "barbarian"},
  {"id": "kaykit_knight", "synergy": {"cls":"heavy","need":2,"stats":{"armor":3,"maxHp":20},"text":"2× Heavy: +3 Rüstung, +20 Leben"}, "name": "Knight", "role": "KayKit · Schildträger", "col": "#a0b8d0", "col2": "#4a6a8f", "desc": "Ritter in Plattenrüstung. Hält die Stellung, wenn alle anderen fallen.", "skin": {"build": "wide", "head": "#e0c6a2", "hat": "helm", "prop": "none", "chest": "#a0b8d0"}, "stats": {"armor": 5, "maxHp": 25, "speed": -8, "dodge": -5}, "startWeapon": "schildglocke", "ability": {"id": "kralle", "name": "Schildwall", "cd": 11, "desc": "Stellt einen Schild auf: 3s +40% Rüstung und Stun-Immunität."}, "sprite": "knight"},
  {"id": "kaykit_mage", "synergy": {"cls":"elemental","need":2,"stats":{"elem":14,"atkSpd":8},"text":"2× Elemental: +14 Elementarschaden, +8% Angriffstempo"}, "name": "Mage", "role": "KayKit · Elementarist", "col": "#8a5cff", "col2": "#ffd23e", "desc": "Magier mit Stab und Kapuze. Lässt die Elemente für sich arbeiten.", "skin": {"build": "normal", "head": "#e0c6a2", "hat": "hood", "prop": "none", "chest": "#8a5cff"}, "stats": {"elem": 20, "maxHp": -10, "atkSpd": 10, "armor": -2}, "startWeapon": "sternkette", "ability": {"id": "arkanstoss", "name": "Arkanschlag", "cd": 9, "desc": "Entlädt einen Elementarstoß: Kegel-Schaden + Burn/Shock."}, "sprite": "mage"},
  {"id": "kaykit_ranger", "synergy": {"cls":"precise","need":2,"stats":{"ranged":10,"range":12},"text":"2× Precise: +10 Fernkampf, +12% Reichweite"}, "name": "Ranger", "role": "KayKit · Waldläufer", "col": "#7dffb0", "col2": "#2b8f5a", "desc": "Waldläufer mit Bogen und Köcher. Trifft, bevor du ihn siehst.", "skin": {"build": "normal", "head": "#e0c6a2", "hat": "hood", "prop": "none", "chest": "#7dffb0"}, "stats": {"ranged": 18, "range": 15, "crit": 8, "speed": 5, "maxHp": -5}, "startWeapon": "waldlaeuferbogen", "ability": {"id": "praezisionsschuss", "name": "Präzisionsschuss", "cd": 10, "desc": "Ein perfekt gezielter Schuss: +50% Reichweite und garantierter Krit für 3s."}, "sprite": "ranger"},
  {"id": "kaykit_rogue", "synergy": {"cls":"blade","need":2,"stats":{"crit":8,"dodge":6},"text":"2× Blade: +8% Krit, +6% Ausweichen"}, "name": "Rogue", "role": "KayKit · Schatten", "col": "#6c5ce7", "col2": "#2d3436", "desc": "Meuchler mit Dolch. Schnell, leise, tödlich.", "skin": {"build": "slim", "head": "#e0c6a2", "hat": "hood", "prop": "none", "chest": "#6c5ce7"}, "stats": {"dodge": 12, "crit": 12, "speed": 10, "maxHp": -15, "armor": -2}, "startWeapon": "knife", "ability": {"id": "schattenritt", "name": "Schattenritt", "cd": 6, "desc": "Blinkt durch Gegner: kurz unverwundbar, hinterlässt Giftwolke."}, "sprite": "rogue"},
  {"id": "kaykit_rogue_hooded", "synergy": {"cls":"precise","need":2,"stats":{"crit":7,"speed":8},"text":"2× Precise: +7% Krit, +8 Tempo"}, "name": "Hooded Rogue", "role": "KayKit · Kapuze", "col": "#2d3436", "col2": "#636e72", "desc": "Vermummter Schurke. Arbeitet im Verborgenen, schlägt aus dem Hinterhalt zu.", "skin": {"build": "slim", "head": "#e0c6a2", "hat": "hood", "prop": "none", "chest": "#2d3436"}, "stats": {"dodge": 10, "crit": 10, "speed": 8, "luck": 10, "maxHp": -10}, "startWeapon": "schattenmesser", "ability": {"id": "hinterhalt", "name": "Hinterhalt", "cd": 10, "desc": "Springt zum Ziel: Stun + hoher Krit-Schaden."}, "sprite": "rogue_hooded"},
  {
    id: 'ventilvera', name: 'Ventil-Vera', role: 'Drucklufttechnikerin · Überdruck', col: '#9fe8ff', col2: '#2b6f8f',
    desc: 'Wartet die Druckleitungen unter dem Kurhaus und öffnet ein Ventil, bevor andere überhaupt den Schraubenschlüssel finden. Zu viel Druck ist für sie kein Fehler, sondern eine Kampfansage.',
    skin: { build: 'normal', head: '#f2d5b0', hat: 'goggles', prop: 'wrench', chest: '#9fe8ff' },
    stats: { atkSpd: 18, eng: 24, ranged: 20, maxHp: -5, armor: 1, speed: -6, dodge: -4 }, startWeapon: 'drucknagler',
    ability: { id: 'ueberdruck', name: 'Überdruck', cd: 9, desc: 'Öffnet alle Ventile: Flächenschaden, Rückstoß und zwei Druckstapel auf jedem getroffenen Gegner.' },
    synergy: { cls: 'support', need: 2, stats: { eng: 10, atkSpd: 8 }, text: '2× Support: +10 Technik, +8% Tempo' }
  },
  {
    id: 'kurierkai', name: 'Kurier-Kai', role: 'Fahrradkurier · Sammler', col: '#39e6ff', col2: '#2b6f8f',
    desc: 'Fährt Pakete vom Hauptbahnhof bis zum Kurpark, bevor die Ampel grün wird. Was auf dem Weg liegen bleibt, verschwindet in seiner Tasche — Hauptsache, er kommt nicht zu spät.',
    skin: { build: 'slim', head: '#e0c6a2', hat: 'cap', prop: 'none', chest: '#39e6ff' },
    stats: { speed: 22, dodge: 10, harvest: 4, ranged: 24, atkSpd: 10, maxHp: -10, armor: -1, dmgP: -8 }, startWeapon: 'medgun',
    ability: { id: 'sammelrunde', name: 'Sammelrunde', cd: 11, desc: 'Zieht Material, Power-Ups und Runen im Umkreis ein. Jede Ladung gibt kurz Schaden und Tempo.' },
    synergy: { cls: 'gun', need: 2, stats: { ranged: 8, atkSpd: 5 }, text: '2× Gun: +8 Fernkampf, +5% Tempo' }
  },
  {
    id: 'schrottschorsch', name: 'Schrott-Schorsch', role: 'Schrottplatz-Chef · Rammler', col: '#ffd08a', col2: '#8a5a1a',
    desc: 'Führt den Schrottplatz am Rheinufer. Was andere wegwerfen, rammt er erst platt und schickt es dann mit dem nächsten Druckstoß zurück.',
    skin: { build: 'giant', head: '#e0c6a2', hat: 'hard', prop: 'wrench', chest: '#8a5a2a' },
    stats: { armor: 4, maxHp: 8, eng: 8, speed: -12, atkSpd: -8, dodge: -6 }, startWeapon: 'kolbenramme',
    ability: { id: 'schrotthagel', name: 'Schrotthagel', cd: 10, desc: 'Rammt Schrott in alle Richtungen. Schaden skaliert mit Rüstung, Treffer werden betäubt und weggeschleudert.' },
    synergy: { cls: 'blunt', need: 2, stats: { melee: 12, armor: 2 }, text: '2× Blunt: +12 Nahkampf, +2 Rüstung' }
  },
  /* Brotato-Archetyp "One Armed": ein Waffenslot statt sechs. Der Starttier
     (startWeaponTier 1 = T2) und der garantierte Shop-Upgrade-Pfad sind Teil
     desselben Vertrags, damit der Ein-Slot-Build nicht am Shop-RNG verhungert. */
  {
    id: 'einarm', name: 'Einarm-Willi', role: 'Schlosser · Einarmig', col: '#ffb24a', col2: '#8a5a1a',
    desc: 'Hat auf der Neroberg-Baustelle einen Arm und den Schraubenschlüssel gleich mit verloren — seitdem ist beides zusammengeschweißt. Ein Slot, ein Werkzeug, ein Plan: Was er trifft, bleibt liegen.',
    skin: { build: 'wide', head: '#e0c6a2', hat: 'hard', prop: 'wrench', chest: '#b24a2b' },
    stats: { atkSpd: 140, dmgP: 60, maxHp: 10, armor: 1, dodge: -5 },
    maxWeapons: 1, startWeaponTier: 1, startWeapon: 'nietpistole',
    ability: { id: 'nietenhagel', name: 'Nietenhagel', cd: 9, desc: 'Schlägt Nägel in den Asphalt: 360°-Salve, die Gegner betäubt und zurückwirft. Jeder Treffer verkürzt die Abklingzeit.' },
    synergy: { cls: 'blunt', need: 2, stats: { melee: 10, knock: 25 }, text: '2× Blunt: +10 Nahkampf, +25% Rückstoß' }
  },
  /* Charakter-Riege 32 (2026-11-09): fuenf Archetypen, die im bestehenden
     Roster fehlten — Verkehrs-Support, Dampf-Tank, Fernlicht-Marker, Winzer-
     Nahkampf und Frost-Kontrolle. Jede Faehigkeit hat eine eigene ID und einen
     eigenen Effekt; keine teilt sich den Switch-Zweig einer anderen. */
  {
    id: 'ampelanna', name: 'Ampel-Anna', role: 'Verkehrsplanerin · Grüne Welle', col: '#7dff8a', col2: '#2b8f5a',
    desc: 'Schaltet die Ampeln der Wilhelmstraße seit Jahren auf Grün. Jetzt nimmt sie das ganze Team mit — wer bei Rot kommt, wartet.',
    skin: { build: 'slim', head: '#e8bf95', hat: 'cap', prop: 'none', chest: '#2b8f5a' },
    stats: { speed: 10, atkSpd: 12, luck: 10, ranged: 18, dmgP: 8, maxHp: -8, melee: -8 }, startWeapon: 'schrottkanone',
    ability: { id: 'gruenphase', name: 'Grüne Welle', cd: 11, desc: 'Team: +18% Tempo und +15% Angriffstempo für 5 s. Gegner im Umkreis werden verlangsamt und zurückgestoßen.' },
    synergy: { cls: 'gun', need: 2, stats: { ranged: 8, atkSpd: 5 }, text: '2× Gun: +8 Fernkampf, +5% Tempo' }
  },
  {
    id: 'dampfdieter', name: 'Dampf-Dieter', role: 'Druckluftmeister · Walze', col: '#9fe8ff', col2: '#2b6f8f',
    desc: 'Fährt die alte Dampfwalze vom Schlachthof bis zum Kurhaus. Bremsen sind optional, Druck nicht.',
    skin: { build: 'giant', head: '#e0c6a2', hat: 'hard', prop: 'wrench', chest: '#2b6f8f' },
    stats: { armor: 3, eng: 10, maxHp: 10, speed: -12, atkSpd: -6, dodge: -6 }, startWeapon: 'schmiedehammer',
    ability: { id: 'dampfwalze', name: 'Dampfwalze', cd: 12, desc: 'Bricht als Dampfwalze nach vorn: Kegel-Schaden, Betäubung, Brand und ein kurzer Rüstungsbonus.' },
    synergy: { cls: 'blunt', need: 2, stats: { melee: 10, armor: 2 }, text: '2× Blunt: +10 Nahkampf, +2 Rüstung' }
  },
  {
    id: 'nachtwaechter', name: 'Nachtwächter Nils', role: 'Stadtwache · Scheinwerfer', col: '#ffe08a', col2: '#2b4a8f',
    desc: 'Hält die nächtliche Wache am Kurhaus. Sein Scheinwerfer macht aus jedem Schatten ein Ziel — und aus jedem Ziel einen Treffer.',
    skin: { build: 'normal', head: '#e0c6a2', hat: 'military', prop: 'none', chest: '#2b4a8f' },
    stats: { ranged: 22, range: 18, crit: 10, atkSpd: 15, dmgP: 15, speed: 4, maxHp: -10, melee: -8 }, startWeapon: 'armbrust',
    ability: { id: 'scheinwerfer', name: 'Scheinwerfer', cd: 10, desc: 'Langer Lichtkegel: Schaden, Markierung und Slow für alle Gegner in der Linie.' },
    synergy: { cls: 'precise', need: 2, stats: { ranged: 10, crit: 6 }, text: '2× Precise: +10 Fernkampf, +6% Krit' },
    unlock: { key: 'wavesCleared', need: 20, text: 'Überlebe insgesamt 20 Wellen' }
  },
  {
    id: 'weinwanda', name: 'Wein-Wanda', role: 'Winzerin · Rebenhieb', col: '#c0392b', col2: '#8dff5c',
    desc: 'Bewirtschaftet die Weinberge am Rheingau. Wer ihre Reben anfasst, bekommt die Sense — und Wanda heilt sich an der Ernte.',
    skin: { build: 'normal', head: '#e8bf95', hat: 'beret', prop: 'none', chest: '#c0392b' },
    stats: { melee: 16, dmgP: 12, harvest: 4, armor: 1, ranged: -10, speed: -2 }, startWeapon: 'wurfbeil',
    ability: { id: 'rebenhieb', name: 'Rebenhieb', cd: 10, desc: 'Rundumschlag mit brennenden Reben: Schaden, Brand und Heilung je getroffenem Gegner.' },
    synergy: { cls: 'medieval', need: 2, stats: { melee: 12, harvest: 2 }, text: '2× Medieval: +12 Nahkampf, +2 Ernte' },
    unlock: { key: 'bosses', need: 3, text: 'Besiege 3 Bosse' }
  },
  {
    id: 'frostfritz', name: 'Frost-Fritz', role: 'Kältetechniker · Eismann', col: '#59e6ff', col2: '#bfefff',
    desc: 'Wartet die Kühlanlagen des Kurhauses. Wenn er ein Ventil aufdreht, wird es für alle anderen schlagartig kalt.',
    skin: { build: 'square', head: '#e0c6a2', hat: 'goggles', prop: 'wrench', chest: '#59e6ff' },
    stats: { elem: 30, range: 12, atkSpd: 10, dmgP: 15, armor: 1, maxHp: -8, speed: -4 }, startWeapon: 'kaeltekompresse',
    ability: { id: 'kaeltewelle', name: 'Kältewelle', cd: 11, desc: 'Frost-Nova: Schaden, Eisbrand und starker Slow im Umkreis; kurzzeitig +Rüstung.' },
    synergy: { cls: 'elemental', need: 2, stats: { elem: 12, range: 10 }, text: '2× Elemental: +12 Elementarschaden, +10% Reichweite' }
  },

  /* Charakterriege 44 (2026-11-09): zwoelf weitere Archetypen. Jede Zeile
     nutzt eine vorhandene, bisher freie Startwaffe und eine eigene Ability-ID;
     die Profile liegen direkt unter CharacterProfiles. */
  {
    id: 'speersophie', name: 'Speer-Sophie', role: 'Leichtathletin · Speerwurf', col: '#d8e8ff', col2: '#2b4a8f',
    desc: 'Trainiert am Neroberg für den nächsten Wettkampf. Ihr Speer trifft nicht nur die Zielscheibe, sondern die ganze Reihe dahinter.',
    skin: { build: 'slim', head: '#e8bf95', hat: 'cap', prop: 'none', chest: '#2b4a8f' },
    stats: { melee: 18, ranged: 6, speed: 8, dodge: 3, maxHp: 6 }, startWeapon: 'spear',
    ability: { id: 'speerwurf', name: 'Speerwurf', cd: 8, desc: 'Wirft einen Speer durch die Reihe: hoher Schaden, Stun und Rückstoß in einer schmalen Linie; kurzzeitig +Reichweite.' },
    synergy: { cls: 'primitive', need: 2, stats: { melee: 10, range: 6 }, text: '2× Primitive: +10 Nahkampf, +6% Reichweite' }
  },
  {
    id: 'axtachim', name: 'Axt-Achim', role: 'Forstarbeiter · Holzfäller', col: '#d4a373', col2: '#5a3a1a',
    desc: 'Räumt die Hänge am Neroberg frei. Was nicht als Brennholz taugt, wird trotzdem klein gemacht.',
    skin: { build: 'giant', head: '#e0c6a2', hat: 'hard', prop: 'wrench', chest: '#5a3a1a' },
    stats: { melee: 20, armor: 2, maxHp: 6, speed: -8, atkSpd: -4 }, startWeapon: 'chopper',
    ability: { id: 'holzhack', name: 'Holzhack', cd: 10, desc: 'Ein weiter Hieb spaltet den Kegel: Schaden, Stun, Rückstoß und kurzzeitig +Nahkampf.' },
    synergy: { cls: 'heavy', need: 2, stats: { melee: 12, armor: 2 }, text: '2× Heavy: +12 Nahkampf, +2 Rüstung' }
  },
  {
    id: 'nagelnadja', name: 'Nagel-Nadja', role: 'Dachdeckerin · Nagelpistole', col: '#ffd24a', col2: '#8a5a1a',
    desc: 'Sichert die Dächer der Innenstadt. Ihr Nagelgerät sitzt jede Fuge — und im Zweifel auch jeden Gegner fest.',
    skin: { build: 'normal', head: '#e8bf95', hat: 'hard', prop: 'none', chest: '#8a5a1a' },
    stats: { ranged: 18, crit: 8, atkSpd: 12, maxHp: 4, armor: 1 }, startWeapon: 'nagler',
    ability: { id: 'nagelregen', name: 'Nagelregen', cd: 9, desc: 'Nagelt alles im Umkreis fest: Schaden, Stun, Slow und Markierung; jeder Treffer verkürzt die Abklingzeit.' },
    synergy: { cls: 'precise', need: 2, stats: { ranged: 10, crit: 6 }, text: '2× Precise: +10 Fernkampf, +6% Krit' }
  },
  {
    id: 'bierbernd', name: 'Bier-Bernd', role: 'Kurhaus-Wirt · Fassroller', col: '#f4c25a', col2: '#7a3d1a',
    desc: 'Zapft im Kurhaus und rollt die Fässer selbst in den Keller. Wenn der Deckel fliegt, steht niemand mehr im Weg.',
    skin: { build: 'wide', head: '#e0c6a2', hat: 'cap', prop: 'none', chest: '#7a3d1a' },
    stats: { maxHp: 12, armor: 1, dmgP: 10, speed: -8, ranged: -6 }, startWeapon: 'bierwerfer',
    ability: { id: 'fassrolle', name: 'Fassrolle', cd: 11, desc: 'Rollt ein Fass nach vorn und lässt es explodieren: Flächenschaden, Brand, Rückstoß und kurzzeitig +Rüstung.' },
    synergy: { cls: 'explosive', need: 2, stats: { dmgP: 10, maxHp: 8 }, text: '2× Explosive: +10% Schaden, +8 Leben' }
  },
  {
    id: 'minenmarie', name: 'Minen-Marie', role: 'Kampfmittelräumerin · Magnetfeld', col: '#a06bff', col2: '#2b4a8f',
    desc: 'Räumt die Hinterlassenschaften vergangener Gefechte. Ihr Magnetfeld zieht alles zusammen, was eigentlich Abstand halten sollte.',
    skin: { build: 'square', head: '#f2d5b0', hat: 'goggles', prop: 'none', chest: '#2b4a8f' },
    stats: { eng: 18, ranged: 12, crit: 6, maxHp: 2, armor: 1, speed: 2 }, startWeapon: 'magnetmine',
    ability: { id: 'magnetfeld', name: 'Magnetfeld', cd: 12, desc: 'Zieht Gegner zum Zentrum, verlangsamt sie und verursacht Schaden; kurzzeitig +Technik.' },
    synergy: { cls: 'explosive', need: 2, stats: { eng: 10, dmgP: 8 }, text: '2× Explosive: +10 Technik, +8% Schaden' }
  },
  {
    id: 'taubentoni', name: 'Tauben-Toni', role: 'Taubenzüchter · Schwarmruf', col: '#c7d2e8', col2: '#6b7a99',
    desc: 'Kennt jeden Taubenschlag zwischen Kurpark und Rheinufer. Sein Schwarm kommt zurück — und bringt alles mit, was glänzt.',
    skin: { build: 'slim', head: '#e0c6a2', hat: 'beret', prop: 'none', chest: '#6b7a99' },
    stats: { luck: 15, harvest: 4, speed: 8, dmgP: -6, maxHp: -5, dodge: 2 }, startWeapon: 'taubenschwarm',
    ability: { id: 'taubensturm', name: 'Taubensturm', cd: 10, desc: 'Ein Schwarm stürzt sich auf den Umkreis: Schaden, Slow, Material und ein Power-up; kurzzeitig +Glück.' },
    synergy: { cls: 'support', need: 2, stats: { luck: 10, harvest: 2 }, text: '2× Support: +10 Glück, +2 Ernte' }
  },
  {
    id: 'saegesvenja', name: 'Säge-Svenja', role: 'Baumpflegerin · Kettensäge', col: '#ff8a3d', col2: '#5a3a1a',
    desc: 'Schneidet Sturmschäden aus den Kronen. Ihre Kettensäge ist laut, schwer und erstaunlich effektiv gegen alles, was sich bewegt.',
    skin: { build: 'wide', head: '#e8bf95', hat: 'hard', prop: 'wrench', chest: '#5a3a1a' },
    stats: { melee: 20, atkSpd: 8, armor: 2, speed: -4, dodge: -4 }, startWeapon: 'kettensaege',
    ability: { id: 'kettenschnitt', name: 'Kettenschnitt', cd: 9, desc: 'Springt mit laufender Säge in den Gegnerpulk: Schaden, Brand, Stun und Rückstoß; kurzzeitig +Angriffstempo.' },
    synergy: { cls: 'blade', need: 2, stats: { melee: 12, atkSpd: 6 }, text: '2× Blade: +12 Nahkampf, +6% Angriffstempo' }
  },
  {
    id: 'laserlars', name: 'Laser-Lars', role: 'Vermessungstechniker · Laserzirkel', col: '#59e6ff', col2: '#a06bff',
    desc: 'Vermessung der neuen Brücke am Rheinufer. Sein Laserzirkel markiert jede Abweichung — und jeden Gegner, der ihm zu nahe kommt.',
    skin: { build: 'normal', head: '#e0c6a2', hat: 'goggles', prop: 'none', chest: '#a06bff' },
    stats: { elem: 22, range: 18, crit: 8, maxHp: 6, armor: -1 }, startWeapon: 'laserzirkel',
    ability: { id: 'laserfokus', name: 'Laserfokus', cd: 10, desc: 'Ein langer, schmaler Laserstrahl: Schaden, Markierung und Slow; kurzzeitig +Krit und +Reichweite.' },
    synergy: { cls: 'elemental', need: 2, stats: { elem: 12, range: 8 }, text: '2× Elemental: +12 Elementarschaden, +8% Reichweite' }
  },
  {
    id: 'blitzbritta', name: 'Blitz-Britta', role: 'Elektrikerin · Blitzableiter', col: '#ffe08a', col2: '#2b4a8f',
    desc: 'Hält die Stromnetze der Innenstadt am Laufen. Wenn sie den Ableiter schließt, sucht sich der Blitz seine eigenen Ziele.',
    skin: { build: 'square', head: '#e8bf95', hat: 'hard', prop: 'wrench', chest: '#2b4a8f' },
    stats: { elem: 20, eng: 12, atkSpd: 10, maxHp: 4, armor: 1, speed: -2 }, startWeapon: 'blitzableiter',
    ability: { id: 'kettenblitz', name: 'Kettenblitz', cd: 10, desc: 'Springt über bis zu fünf Gegner: Schaden, Schock und kurzer Stun; kurzzeitig +Elementarschaden.' },
    synergy: { cls: 'elemental', need: 2, stats: { elem: 10, atkSpd: 5 }, text: '2× Elemental: +10 Elementarschaden, +5% Angriffstempo' }
  },
  {
    id: 'skalpellsina', name: 'Skalpell-Sina', role: 'Chirurgin · Feldlazarett', col: '#8affb0', col2: '#2b6f5a',
    desc: 'Operiert im Feldlazarett des Schlachthofs. Ihr Skalpell trennt sauber, was nicht zusammengehört — und heilt, was bleiben soll.',
    skin: { build: 'normal', head: '#f2d5b0', hat: 'cap', prop: 'none', chest: '#2b6f5a' },
    stats: { melee: 12, hpRegen: 1, lifesteal: 5, speed: 4, maxHp: -14 }, startWeapon: 'skalpell',
    ability: { id: 'notoperation', name: 'Notoperation', cd: 11, desc: 'Schneidet den Umkreis auf: Schaden, Gift und Stun; heilt sich je Treffer und gibt kurzzeitig +Lebensraub.' },
    synergy: { cls: 'medical', need: 2, stats: { melee: 8, lifesteal: 6 }, text: '2× Medical: +8 Nahkampf, +6% Lebensraub' }
  },
  {
    id: 'rettungsralf', name: 'Rettungs-Ralf', role: 'Rettungssanitäter · Säge', col: '#ff5d7a', col2: '#fff',
    desc: 'Fährt die Rettungswagen durch die engen Gassen. Sein Rettungsgriff holt das Team zurück — und hält die Gegner auf Abstand.',
    skin: { build: 'wide', head: '#e0c6a2', hat: 'cap', prop: 'none', chest: '#ff5d7a' },
    stats: { maxHp: 6, armor: 2, melee: 8, speed: -4, dodge: -2 }, startWeapon: 'rettungssaege',
    ability: { id: 'rettungsgriff', name: 'Rettungsgriff', cd: 12, desc: 'Heilt alle Spieler, reinigt Status und gibt Rüstung; Gegner im Umkreis werden gestunnt und weggestoßen.' },
    synergy: { cls: 'support', need: 2, stats: { maxHp: 10, armor: 2 }, text: '2× Support: +10 Leben, +2 Rüstung' }
  },
  {
    id: 'flammenfelix', name: 'Flammen-Felix', role: 'Feuerwehrmann · Brandschneise', col: '#ff8a3d', col2: '#e2564a',
    desc: 'Legt in der Feuerwache die Schläuche und weiß, wie man eine Schneise zieht. Nur diesmal brennt sie in die andere Richtung.',
    skin: { build: 'normal', head: '#e0c6a2', hat: 'fire', prop: 'wrench', chest: '#e2564a' },
    stats: { elem: 18, melee: 10, armor: 2, speed: -2, maxHp: -2 }, startWeapon: 'flammenklinge',
    ability: { id: 'brandschneise', name: 'Brandschneise', cd: 10, desc: 'Brennt eine breite Gasse in den Gegnerpulk: Feuerschaden, Brand, Stun und Rückstoß; kurzzeitig +Tempo.' },
    synergy: { cls: 'elemental', need: 2, stats: { elem: 10, melee: 6 }, text: '2× Elemental: +10 Elementarschaden, +6 Nahkampf' }
  }
];
/* Brotato-nahe Kernregeln: kurze Wellen, sechs autonome Waffen und ein
   klarer Shop-Zyklus. Die Regeln liegen zentral, damit BalanceSim und Laufzeit
   nicht an verschiedenen Hardcodes vorbeirechnen. */
const BROTATO_RULES = {
  maxWeapons: 6,
  shopOffers: 6,
  /* Brotato stemmt 100 Gegner gleichzeitig. Der Wert ist die Obergrenze fuer
     lebende Gegner im Spawn-Pfad; die Hordenwellen 11/14 planen 77/100 Gegner
     und liefen vorher in den 70er-Deckel. Gemessen: 100 Gegner kosten 0,19 ms
     Logik-Frame (p99 1,0 ms) gegen 0,33 ms bei 70. */
  maxEnemiesOnScreen: 100,
  autoFire: true,
  shopBetweenWaves: true,
  /* Godot-Port: Wellenabschluss heilt 15 % der maximalen HP. Das haelt Runs
     ohne Heil-Item zwischen den Wellen am Leben; die Browser-Fassung ignoriert
     das Feld, der Godot-Export liest es als Balance-Regel. */
  waveClearHealPct: .15,
  /* Brotato recycelt Items mit 25 % des aktuellen Werts. Der Satz liegt zentral,
     damit Shop-UI, Preislogik und Evidenz dieselbe Zahl lesen; Waffen behalten
     ihren separaten 55-%-Verkauf, weil sie einen der sechs knappen Slots belegen. */
  itemRecycleRate: .25,
  /* Fluch: ein Run-Meter aus verfluchten Items. Jeder Punkt macht Gegner
     zaeher und gefaehrlicher, bezahlt das Risiko aber mit Fundglueck und
     einem zusaetzlichen Material pro Kill. Die Deckel verhindern, dass ein
     spaeter Shop mit vielen Fluch-Items den Run mathematisch unspielbar macht. */
  curse: {
    hpPctPerPoint: 1.5,
    dmgPctPerPoint: 1.0,
    luckPerPoint: 1.5,
    matFlatPer: 5,
    hpMultCap: 2.0,
    dmgMultCap: 1.6,
    luckCap: 60,
    matFlatCap: 3
  },
  rerollCost(wave, rerolls = 0, locked = 0) { return 5 + Math.max(0, wave) + rerolls * 4 + locked * 4; }
};

/* RUN_UPGRADES - Werkstatt-Auftraege im Zwischenwellen-Shop.
   Bewusst eine eigene Tabelle statt weiterer ITEMS: ein Auftrag ist ein
   dauerhafter Lauf-Buff, den man mehrfach kauft (Staffel), waehrend Items
   einmalig ins Inventar wandern. Jeder Auftrag traegt Auf- UND Abschwaechung,
   damit keiner strikt dominiert. `stats` laeuft durch denselben Stat-Pfad wie
   Items/Relikte; `extras` nutzt die vorhandenen Druck-Felder des Spielers.
   Preis: basePrice * (1 + welle * .045) * (1 + besitz * priceStep) * Gefahr. */
const RUN_UPGRADES = [
  { id: 'schweissgeraet', name: 'Schweißgerät', icon: '⚒', col: '#9fe8ff', basePrice: 24, priceStep: .55, maxStacks: 4,
    stats: { armor: 2, maxHp: 6, speed: -3 },
    desc: 'Ein Auftrag vom Schrottplatz: Platten verschweißen. Hält mehr aus, kommt aber schwerer vom Fleck.' },
  { id: 'kurierfahrt', name: 'Kurierfahrt', icon: '➤', col: '#39e6ff', basePrice: 20, priceStep: .5, maxStacks: 4,
    stats: { speed: 8, dodge: 4, ranged: -4 },
    desc: 'Kai leiht dir seine Abkürzung durch die Veedel. Schneller und flinker, dafür weniger Druck auf Distanz.' },
  { id: 'messstation', name: 'Messstation', icon: '⌁', col: '#8affb0', basePrice: 26, priceStep: .5, maxStacks: 3,
    stats: { eng: 6, range: 3, melee: -2 },
    desc: 'Ein geeichtes Messfeld aus dem Labor: Technik und Reichweite steigen, der Nahkampf verliert an Wucht.' },
  { id: 'trinkgeldkasse', name: 'Trinkgeldkasse', icon: '◉', col: '#f4c25a', basePrice: 18, priceStep: .6, maxStacks: 5,
    stats: { harvest: 3, luck: 4, dmgP: -2 },
    desc: 'Kleingeld sammelt sich in der Kasse. Mehr Material und Glück, dafür etwas weniger roher Schaden.' },
  { id: 'druckventil', name: 'Druckventil', icon: '◈', col: '#a06bff', basePrice: 30, priceStep: .55, maxStacks: 3,
    stats: { eng: 4, elem: 4, speed: -2 }, extras: { druckDmg: 8 },
    desc: 'Ein nachgerüstetes Ventil für die Druckluft-Linie: stärkere Druckstöße, dafür schwerfälliger.' },
  { id: 'probelauf', name: 'Probelauf', icon: '⟳', col: '#ff8a3d', basePrice: 28, priceStep: .5, maxStacks: 4,
    stats: { atkSpd: 5, crit: 3, maxHp: -2 },
    desc: 'Ein hektischer Testlauf im Werkstattkeller: schneller und präziser, aber nichts für schwache Nerven.' }
];
const RUN_UPGRADE_BY_ID = Data.register('runUpgrades', RUN_UPGRADES, {
  id: 'id', name: 'req|str', icon: 'str', col: 'str', desc: 'req|str',
  basePrice: 'req|num>0', priceStep: 'req|num>=0', maxStacks: 'req|num>0',
  stats: (row, v) => {
    if (!v || typeof v !== 'object') return 'stats fehlt';
    for (const k in v) {
      if (STAT_KEYS.indexOf(k) < 0) return 'unbekannter Stat ' + k;
      if (typeof v[k] !== 'number' || !isFinite(v[k]) || !v[k]) return 'Stat ' + k + ' ohne Zahl';
    }
    return null;
  },
  extras: (row, v) => {
    if (v === undefined) return null;
    const allowed = ['druckDmg', 'druckRadius', 'druckSlow', 'druckBonus'];
    for (const k in v) { if (allowed.indexOf(k) < 0) return 'unbekanntes Extra ' + k; if (typeof v[k] !== 'number' || !isFinite(v[k])) return 'Extra ' + k + ' ohne Zahl'; }
    return null;
  }
}).byId;

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
  ventilvera: { figure: 'pressure-tech', animation: 'valve-bounce', animationRate: 1.12, moveSet: { id: 'pressure-step', speed: 1.03, dash: 920, rollCd: .40, rollDuration: .28, rollSpeed: 670, rollStyle: 'burst' }, walkStyle: { bobAmp: .7, bobFreq: 1.15, legSwing: 1.0, legLift: .8, armSwing: .7, lean: .02, stepWidth: 1.0 }, idleAnim: 'servo-check' },
  kurierkai: { figure: 'courier-bag', animation: 'courier-dash', animationRate: 1.22, moveSet: { id: 'courier-line', speed: 1.12, dash: 1080, rollCd: .34, rollDuration: .23, rollSpeed: 760, rollStyle: 'swift' }, walkStyle: { bobAmp: 1.1, bobFreq: 1.35, legSwing: 1.35, legLift: 1.1, armSwing: 1.4, lean: .06, stepWidth: .8 }, idleAnim: 'check-phone' },
  schrottschorsch: { figure: 'scrap-plate', animation: 'scrap-stomp', animationRate: .76, moveSet: { id: 'scrap-stomp', speed: .89, dash: 740, rollCd: .66, rollDuration: .34, rollSpeed: 530, rollStyle: 'slam' }, walkStyle: { bobAmp: 1.5, bobFreq: .7, legSwing: .9, legLift: .6, armSwing: .5, lean: -.02, stepWidth: 1.7 }, idleAnim: 'flex-wrench' },
  einarm: { figure: 'one-arm-rig', animation: 'anchor-hammer', animationRate: .88, moveSet: { id: 'anchor-step', speed: .99, dash: 860, rollCd: .50, rollDuration: .32, rollSpeed: 600, rollStyle: 'impact' }, walkStyle: { bobAmp: 1.0, bobFreq: .95, legSwing: 1.2, legLift: .8, armSwing: .5, lean: .03, stepWidth: 1.3 }, idleAnim: 'flex-wrench' },
  ampelanna: { figure: 'traffic-signal-planner', animation: 'greenwave-glide', animationRate: 1.03, moveSet: { id: 'greenwave-step', speed: 1.05, dash: 940, rollCd: .42, rollDuration: .28, rollSpeed: 660, rollStyle: 'rush' }, walkStyle: { bobAmp: .7, bobFreq: 1.1, legSwing: 1.0, legLift: .8, armSwing: .9, lean: .03, stepWidth: 1.1 }, idleAnim: 'check-signal' },
  dampfdieter: { figure: 'steamroller-crew', animation: 'roller-slog', animationRate: .72, moveSet: { id: 'steam-step', speed: .88, dash: 730, rollCd: .68, rollDuration: .36, rollSpeed: 510, rollStyle: 'impact' }, walkStyle: { bobAmp: 1.5, bobFreq: .7, legSwing: 1.0, legLift: .6, armSwing: .5, lean: .01, stepWidth: 1.6 }, idleAnim: 'stoke-boiler' },
  nachtwaechter: { figure: 'floodlight-watch', animation: 'beam-sweep', animationRate: .9, moveSet: { id: 'watch-step', speed: .98, dash: 870, rollCd: .5, rollDuration: .3, rollSpeed: 620, rollStyle: 'silent' }, walkStyle: { bobAmp: .6, bobFreq: .95, legSwing: .8, legLift: .7, armSwing: .5, lean: .04, stepWidth: .9 }, idleAnim: 'sweep-beam' },
  weinwanda: { figure: 'vintner-basket', animation: 'vine-reap', animationRate: .96, moveSet: { id: 'harvest-step', speed: .99, dash: 880, rollCd: .46, rollDuration: .3, rollSpeed: 615, rollStyle: 'grace' }, walkStyle: { bobAmp: 1.0, bobFreq: .9, legSwing: .9, legLift: .8, armSwing: 1.0, lean: .02, stepWidth: 1.2 }, idleAnim: 'inspect-vine' },
  frostfritz: { figure: 'coolant-technician', animation: 'coolant-shuffle', animationRate: 1.0, moveSet: { id: 'coolant-step', speed: 1.0, dash: 900, rollCd: .45, rollDuration: .28, rollSpeed: 640, rollStyle: 'phase' }, walkStyle: { bobAmp: .8, bobFreq: 1.05, legSwing: .9, legLift: .8, armSwing: .6, lean: .02, stepWidth: 1.0 }, idleAnim: 'check-gauges' },

  speersophie: { figure: 'javelin-runner', animation: 'javelin-stride', animationRate: 1.12, moveSet: { id: 'javelin-step', speed: 1.08, dash: 990, rollCd: .37, rollDuration: .25, rollSpeed: 710, rollStyle: 'swift' }, walkStyle: { bobAmp: .8, bobFreq: 1.15, legSwing: 1.2, legLift: .9, armSwing: 1.3, lean: .05, stepWidth: .9 }, idleAnim: 'stretch-shoulder' },
  axtachim: { figure: 'lumberjack-rig', animation: 'axe-chop-walk', animationRate: .78, moveSet: { id: 'lumber-step', speed: .88, dash: 760, rollCd: .64, rollDuration: .34, rollSpeed: 530, rollStyle: 'impact' }, walkStyle: { bobAmp: 1.4, bobFreq: .75, legSwing: 1.1, legLift: .7, armSwing: .7, lean: .02, stepWidth: 1.5 }, idleAnim: 'shoulder-axe' },
  nagelnadja: { figure: 'roofer-harness', animation: 'nail-gun-hop', animationRate: 1.08, moveSet: { id: 'roof-step', speed: 1.05, dash: 950, rollCd: .39, rollDuration: .26, rollSpeed: 690, rollStyle: 'tactical' }, walkStyle: { bobAmp: .7, bobFreq: 1.1, legSwing: 1.0, legLift: .8, armSwing: .8, lean: .04, stepWidth: .9 }, idleAnim: 'check-harness' },
  bierbernd: { figure: 'tavern-barrel', animation: 'barrel-roll', animationRate: .86, moveSet: { id: 'barrel-step', speed: .93, dash: 820, rollCd: .56, rollDuration: .33, rollSpeed: 570, rollStyle: 'impact' }, walkStyle: { bobAmp: 1.6, bobFreq: .8, legSwing: 1.0, legLift: .7, armSwing: .9, lean: -.03, stepWidth: 1.4 }, idleAnim: 'tap-barrel' },
  minenmarie: { figure: 'ordnance-clearance', animation: 'mine-sweep', animationRate: 1.0, moveSet: { id: 'sweep-step', speed: 1.0, dash: 900, rollCd: .44, rollDuration: .28, rollSpeed: 650, rollStyle: 'phase' }, walkStyle: { bobAmp: .6, bobFreq: .95, legSwing: .7, legLift: .6, armSwing: .5, lean: .05, stepWidth: .8 }, idleAnim: 'scan-ground' },
  taubentoni: { figure: 'pigeon-keeper', animation: 'flock-glide', animationRate: 1.09, moveSet: { id: 'flock-step', speed: 1.09, dash: 960, rollCd: .36, rollDuration: .25, rollSpeed: 700, rollStyle: 'grace' }, walkStyle: { bobAmp: 1.1, bobFreq: 1.3, legSwing: .8, legLift: 1.2, armSwing: 1.4, lean: -.02, stepWidth: .7 }, idleAnim: 'call-flock' },
  saegesvenja: { figure: 'chainsaw-rig', animation: 'saw-rev', animationRate: .92, moveSet: { id: 'saw-step', speed: .96, dash: 860, rollCd: .5, rollDuration: .31, rollSpeed: 600, rollStyle: 'burst' }, walkStyle: { bobAmp: 1.2, bobFreq: .9, legSwing: 1.0, legLift: .8, armSwing: .8, lean: .03, stepWidth: 1.3 }, idleAnim: 'rev-saw' },
  laserlars: { figure: 'surveyor-laser', animation: 'laser-line', animationRate: 1.0, moveSet: { id: 'survey-step', speed: .99, dash: 900, rollCd: .45, rollDuration: .27, rollSpeed: 650, rollStyle: 'tactical' }, walkStyle: { bobAmp: .5, bobFreq: 1.0, legSwing: .8, legLift: .7, armSwing: .4, lean: .06, stepWidth: .8 }, idleAnim: 'sight-level' },
  blitzbritta: { figure: 'electrician-harness', animation: 'arc-jog', animationRate: 1.06, moveSet: { id: 'arc-step', speed: 1.02, dash: 930, rollCd: .4, rollDuration: .27, rollSpeed: 670, rollStyle: 'phase' }, walkStyle: { bobAmp: .8, bobFreq: 1.2, legSwing: 1.1, legLift: .9, armSwing: 1.0, lean: .02, stepWidth: 1.0 }, idleAnim: 'test-current' },
  skalpellsina: { figure: 'field-surgeon', animation: 'scalpel-precise', animationRate: .96, moveSet: { id: 'clinic-step', speed: 1.0, dash: 890, rollCd: .43, rollDuration: .29, rollSpeed: 640, rollStyle: 'grace' }, walkStyle: { bobAmp: .6, bobFreq: .95, legSwing: .8, legLift: .7, armSwing: .4, lean: .01, stepWidth: .8 }, idleAnim: 'wash-hands' },
  rettungsralf: { figure: 'paramedic-litter', animation: 'rescue-run', animationRate: .9, moveSet: { id: 'rescue-step', speed: .94, dash: 810, rollCd: .55, rollDuration: .34, rollSpeed: 560, rollStyle: 'impact' }, walkStyle: { bobAmp: 1.0, bobFreq: .85, legSwing: 1.2, legLift: .8, armSwing: .6, lean: .02, stepWidth: 1.4 }, idleAnim: 'check-strap' },
  flammenfelix: { figure: 'firebrand-axe', animation: 'ember-charge', animationRate: 1.04, moveSet: { id: 'ember-step', speed: 1.04, dash: 940, rollCd: .4, rollDuration: .27, rollSpeed: 680, rollStyle: 'rush' }, walkStyle: { bobAmp: 1.0, bobFreq: 1.1, legSwing: 1.0, legLift: .9, armSwing: .9, lean: .04, stepWidth: 1.1 }, idleAnim: 'check-hose' },
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
  }),
  W({
    id: 'skalpell', name: 'Skalpell', cls: ['blade', 'medical'], type: 'melee', col: '#8affb0',
    scaling: { melee: .65, hpRegen: .35 }, unlockDefault: true,
    tiers: [[8, .46, 92, .14, 2.0, 14, { arc: .9, bleed: 1 }], [13, .43, 100, .16, 2.1, 28, { arc: .95, bleed: 1 }],
    [21, .40, 110, .18, 2.3, 58, { arc: 1.0, bleed: 1 }], [34, .37, 124, .20, 2.5, 116, { arc: 1.1, bleed: 1 }]],
    special: 'Chirurgische Schnitte: schnell, präzise und mit Blutung.'
  }),
  W({
    id: 'rettungssaege', name: 'Rettungssäge', cls: ['blade', 'support'], type: 'melee', col: '#ffcf9a',
    scaling: { melee: .7, eng: .25 }, unlockDefault: true,
    tiers: [[14, .72, 108, .06, 1.7, 18, { arc: 1.1, bleed: 1, knock: 60 }], [23, .68, 118, .07, 1.8, 36, { arc: 1.15, bleed: 1, knock: 68 }],
    [38, .64, 130, .08, 1.9, 74, { arc: 1.2, bleed: 1, knock: 76 }], [62, .60, 146, .10, 2.1, 150, { arc: 1.3, bleed: 1, knock: 88 }]],
    special: 'Schneidet Zugänge frei und hält Gegner mit Rückstoß auf Distanz.'
  }),
  W({
    id: 'flammenklinge', name: 'Flammenklinge', cls: ['blade', 'elemental'], type: 'melee', col: '#ff7a3d',
    scaling: { melee: .55, elem: .45 }, unlockDefault: true,
    tiers: [[9, .50, 100, .08, 1.8, 20, { arc: 1.0, burn: 4 }], [15, .47, 110, .09, 1.9, 40, { arc: 1.05, burn: 7 }],
    [25, .44, 122, .10, 2.0, 82, { arc: 1.1, burn: 11 }], [40, .41, 138, .12, 2.2, 166, { arc: 1.2, burn: 18 }]],
    special: 'Glühende Klinge: jeder Treffer setzt das Ziel in Brand.'
  }),
  W({
    id: 'klingenpistole', name: 'Klingenpistole', cls: ['blade', 'gun'], type: 'projectile', col: '#e0f0ff',
    scaling: { ranged: .5, melee: .2 }, unlockDefault: true,
    tiers: [[7, .55, 300, .06, 1.6, 16, { pierce: 1 }], [12, .52, 330, .07, 1.7, 32, { pierce: 1 }],
    [19, .49, 360, .08, 1.8, 66, { pierce: 1 }], [31, .46, 400, .09, 2.0, 134, { pierce: 2 }]],
    special: 'Bajonett am Lauf: Projektile durchschlagen, Nahkampf skaliert mit.'
  }),
  W({
    id: 'notfallhammer', name: 'Notfallhammer', cls: ['blunt', 'medical'], type: 'melee', col: '#8affb0',
    scaling: { melee: .8, hpRegen: .2 }, unlockDefault: true,
    tiers: [[13, .85, 108, .04, 1.6, 18, { arc: 1.1, stun: .55, knock: 100 }], [22, .82, 118, .05, 1.7, 36, { arc: 1.15, stun: .6, knock: 112 }],
    [36, .79, 130, .06, 1.8, 72, { arc: 1.2, stun: .65, knock: 126 }], [59, .75, 145, .07, 2.0, 146, { arc: 1.3, stun: .75, knock: 146 }]],
    special: 'Erste-Hilfe mit Nachdruck: betäubt und schafft Platz für die Heilung.'
  }),
  W({
    id: 'steinhammer', name: 'Steinhammer', cls: ['blunt', 'primitive'], type: 'melee', col: '#b8d98a',
    scaling: { melee: .9, luck: .2 }, unlockDefault: true,
    tiers: [[20, 1.05, 112, .04, 1.6, 20, { arc: 1.5, stun: .7, knock: 220 }], [33, 1.00, 122, .04, 1.65, 40, { arc: 1.55, stun: .75, knock: 250 }],
    [54, .95, 134, .05, 1.75, 82, { arc: 1.65, stun: .8, knock: 285 }], [88, .90, 150, .06, 1.9, 166, { arc: 1.8, stun: .9, knock: 330 }]],
    special: 'Urtümlicher Steinblock: wuchtig, langsam und mit hohem Rückstoß.'
  }),
  W({
    id: 'frosthammer', name: 'Frosthammer', cls: ['blunt', 'elemental'], type: 'melee', col: '#9fe4ff',
    scaling: { melee: .55, elem: .5 }, unlockDefault: true,
    tiers: [[11, .95, 108, .05, 1.7, 20, { arc: 1.2, slow: .35, slowT: 1.5, elemental: 1 }], [18, .92, 118, .06, 1.8, 40, { arc: 1.25, slow: .4, slowT: 1.8, elemental: 1 }],
    [30, .88, 128, .07, 1.9, 82, { arc: 1.3, slow: .45, slowT: 2.1, elemental: 1 }], [49, .84, 142, .08, 2.1, 166, { arc: 1.4, slow: .55, slowT: 2.5, elemental: 1 }]],
    special: 'Eisiger Schlag: verlangsamt Gegner und bricht ihre Reihen.'
  }),
  W({
    id: 'schmiedehammer', name: 'Schmiedehammer', cls: ['blunt', 'heavy'], type: 'melee', col: '#ffb24a',
    scaling: { melee: 1.0 }, unlockDefault: true,
    tiers: [[30, 1.45, 118, .04, 1.7, 24, { arc: 1.8, stun: 1.1, knock: 380 }], [50, 1.40, 130, .05, 1.8, 48, { arc: 1.85, stun: 1.2, knock: 420 }],
    [81, 1.35, 144, .06, 1.9, 98, { arc: 1.95, stun: 1.3, knock: 470 }], [132, 1.30, 162, .07, 2.1, 198, { arc: 2.1, stun: 1.5, knock: 530 }]],
    special: 'Der Hammer des Schmieds: langsam, schwer und gnadenlos.'
  }),
  W({
    id: 'feldscher', name: 'Feldscherbesteck', cls: ['medical', 'medieval'], type: 'melee', col: '#8affb0',
    scaling: { melee: .6, hpRegen: .3 }, unlockDefault: true,
    tiers: [[9, .44, 96, .12, 1.9, 16, { arc: .75, bleed: 1 }], [15, .41, 104, .14, 2.0, 32, { arc: .8, bleed: 1 }],
    [25, .38, 114, .16, 2.2, 66, { arc: .85, bleed: 1 }], [41, .35, 128, .18, 2.4, 134, { arc: .9, bleed: 1 }]],
    special: 'Feldchirurgie: feine Schnitte, starke Blutung, wenig Platz.'
  }),
  W({
    id: 'kraeuterkessel', name: 'Kräuterkessel', cls: ['medical', 'primitive'], type: 'projectile', col: '#b8d98a',
    scaling: { ranged: .4, hpRegen: .35 }, unlockDefault: true,
    tiers: [[8, .62, 340, .04, 1.5, 18, { poison: 7, poisonT: 2.5, cloud: 52 }], [13, .59, 365, .05, 1.6, 36, { poison: 12, poisonT: 2.5, cloud: 58 }],
    [21, .56, 395, .06, 1.7, 72, { poison: 19, poisonT: 2.5, cloud: 66 }], [33, .52, 435, .07, 1.9, 146, { poison: 31, poisonT: 2.5, cloud: 78 }]],
    special: 'Kräuterwurf: hinterlässt eine Giftwolke und stärkt die Regeneration.'
  }),
  W({
    id: 'desinfektionsgranate', name: 'Desinfektionsgranate', cls: ['medical', 'explosive'], type: 'projectile', col: '#ff8a3d',
    scaling: { ranged: .4, expSize: .3 }, unlockDefault: true,
    tiers: [[10, .70, 320, .04, 1.6, 20, { boom: 46, slow: .2, slowT: 1.2 }], [16, .67, 345, .05, 1.7, 40, { boom: 54, slow: .25, slowT: 1.4 }],
    [26, .63, 375, .06, 1.8, 80, { boom: 64, slow: .3, slowT: 1.6 }], [42, .59, 415, .07, 2.0, 160, { boom: 80, slow: .35, slowT: 1.8 }]],
    special: 'Desinfiziert die Fläche: Explosion, Verlangsamung und saubere Wellen.'
  }),
  W({
    id: 'wurfbeil', name: 'Wurfbeil', cls: ['blade', 'medieval', 'primitive'], type: 'projectile', col: '#b8d98a',
    scaling: { ranged: .5, melee: .2 }, unlockDefault: true,
    tiers: [[12, .75, 360, .07, 1.7, 18, { pierce: 1 }], [20, .72, 390, .08, 1.8, 36, { pierce: 1 }],
    [32, .68, 425, .09, 1.9, 72, { pierce: 1 }], [52, .64, 470, .10, 2.1, 146, { pierce: 2 }]],
    special: 'Geworfenes Beil: durchschlägt die erste Reihe und trifft dahinter.'
  }),
  W({
    id: 'bannerlanze', name: 'Bannerlanze', cls: ['medieval', 'support'], type: 'melee', col: '#ffd23e',
    scaling: { melee: .7, eng: .2 }, unlockDefault: true,
    tiers: [[17, .80, 145, .06, 1.6, 20, { arc: .55, pierce: 99, knock: 70 }], [28, .77, 160, .07, 1.7, 40, { arc: .55, pierce: 99, knock: 78 }],
    [46, .73, 178, .08, 1.8, 82, { arc: .6, pierce: 99, knock: 86 }], [75, .69, 200, .09, 2.0, 166, { arc: .65, pierce: 99, knock: 98 }]],
    special: 'Lange Lanze mit Banner: durchbohrt Reihen und sammelt Verbündete.'
  }),
  W({
    id: 'armbrust', name: 'Armbrust', cls: ['medieval', 'precise'], type: 'projectile', col: '#7dffb0',
    scaling: { ranged: .75 }, unlockDefault: true,
    tiers: [[19, 1.05, 620, .16, 2.0, 24, { pierce: 2 }], [31, 1.00, 670, .18, 2.2, 48, { pierce: 3 }],
    [51, .95, 720, .20, 2.4, 96, { pierce: 4 }], [83, .90, 780, .23, 2.7, 194, { pierce: 6 }]],
    special: 'Mittelalterliche Präzision: große Reichweite, hohe Kritchance, Durchschlag.'
  }),
  W({
    id: 'klingenbrecher', name: 'Klingenbrecher', cls: ['blade', 'blunt'], type: 'melee', col: '#d8e4f0',
    scaling: { melee: .85, armor: .2 }, unlockDefault: true,
    tiers: [[16, .68, 125, .07, 1.7, 22, { arc: 1.15, pierce: 1, knock: 110 }], [26, .65, 135, .08, 1.8, 44, { arc: 1.15, pierce: 1, knock: 120 }],
    [43, .62, 148, .09, 1.9, 88, { arc: 1.2, pierce: 2, knock: 135 }], [70, .58, 165, .10, 2.1, 176, { arc: 1.25, pierce: 2, knock: 150 }]],
    special: 'Pariert und bricht: breiter Hieb mit Durchschlag, der die zweite Reihe erreicht.'
  }),
  W({
    id: 'splitterklinge', name: 'Splitterklinge', cls: ['blade', 'explosive'], type: 'projectile', col: '#ff8a3d',
    scaling: { ranged: .45, melee: .2, expSize: .2 }, unlockDefault: true,
    tiers: [[9, .62, 300, .06, 1.6, 18, { boom: 34, pierce: 1 }], [15, .59, 330, .07, 1.7, 36, { boom: 42, pierce: 1 }],
    [24, .56, 365, .08, 1.8, 74, { boom: 52, pierce: 1 }], [39, .52, 405, .09, 2.0, 150, { boom: 62, pierce: 2 }]],
    special: 'Geworfene Klinge, die beim Aufprall splittert und eine kleine Druckwelle auslöst.'
  }),
  W({
    id: 'granatkolben', name: 'Granatkolben', cls: ['blunt', 'explosive'], type: 'projectile', col: '#ffb24a',
    scaling: { ranged: .4, melee: .2, expSize: .2 }, unlockDefault: true,
    tiers: [[11, .78, 280, .04, 1.6, 20, { boom: 42 }], [18, .75, 310, .05, 1.7, 40, { boom: 52 }],
    [29, .71, 345, .06, 1.8, 82, { boom: 64 }], [47, .67, 385, .07, 2.0, 166, { boom: 80 }]],
    special: 'Wurfkolben mit Aufschlagzünder: schwer, laut und Flächen zermalmend.'
  }),
  W({
    id: 'pistolenkolben', name: 'Pistolenkolben', cls: ['blunt', 'gun'], type: 'projectile', col: '#9fb4d8',
    scaling: { ranged: .5, melee: .2 }, unlockDefault: true,
    tiers: [[8, .70, 360, .05, 1.6, 18, { pierce: 1 }], [13, .67, 390, .06, 1.7, 36, { pierce: 1 }],
    [21, .64, 425, .07, 1.8, 72, { pierce: 2 }], [34, .60, 470, .08, 2.0, 146, { pierce: 2 }]],
    special: 'Schwerer Kolben mit Schusskanal: Nahkampfstabilität trifft präzise Salven.'
  }),
  W({
    id: 'kaeltekompresse', name: 'Kältekompresse', cls: ['elemental', 'medical'], type: 'projectile', col: '#9ad2ff',
    scaling: { elem: .5, hpRegen: .35 }, unlockDefault: true,
    tiers: [[11, .60, 330, .04, 1.6, 18, { slow: .3, slowT: 1.8 }], [20, .57, 360, .05, 1.7, 36, { slow: .33, slowT: 2.0 }],
    [31, .54, 395, .06, 1.8, 72, { slow: .36, slowT: 2.2 }], [45, .50, 435, .07, 1.9, 146, { slow: .4, slowT: 2.4 }]],
    special: 'Kältepack: verlangsamt Gegner und stabilisiert die eigene Regeneration.'
  }),
  W({
    id: 'runenstab', name: 'Runenstab', cls: ['elemental', 'medieval'], type: 'projectile', col: '#c7a6ff',
    scaling: { elem: .55, ranged: .2 }, unlockDefault: true,
    tiers: [[14, .70, 380, .05, 1.7, 20, { burn: 6 }], [22, .67, 410, .06, 1.8, 40, { burn: 9 }],
    [36, .64, 445, .07, 1.9, 82, { burn: 14 }], [58, .60, 490, .08, 2.1, 166, { burn: 20 }]],
    special: 'Runenfeuer: brennende Geschosse mit der Reichweite mittelalterlicher Stäbe.'
  }),
  W({
    id: 'blitzspeer', name: 'Blitzspeer', cls: ['elemental', 'primitive'], type: 'projectile', col: '#ffe27a',
    scaling: { elem: .5, luck: .2 }, unlockDefault: true,
    tiers: [[14, .82, 340, .06, 1.7, 20, { pierce: 1, elemental: 1 }], [25, .79, 370, .07, 1.8, 40, { pierce: 1, elemental: 1 }],
    [36, .75, 405, .08, 1.9, 82, { pierce: 2, elemental: 1 }], [58, .71, 445, .09, 2.1, 166, { pierce: 2, elemental: 1 }]],
    special: 'Geworfener Speer mit geladenem Elementarstein; durchschlägt mehrere Gegner.'
  }),
  W({
    id: 'belagerungsbombe', name: 'Belagerungsbombe', cls: ['explosive', 'medieval'], type: 'projectile', col: '#ff2e88',
    scaling: { ranged: .4, expSize: .25, melee: .2 }, unlockDefault: true,
    tiers: [[13, .95, 320, .04, 1.6, 22, { boom: 58, burn: 5 }], [21, .92, 350, .05, 1.7, 44, { boom: 70, burn: 7 }],
    [34, .88, 385, .06, 1.8, 90, { boom: 84, burn: 9 }], [55, .84, 425, .07, 2.0, 182, { boom: 92, burn: 12 }]],
    special: 'Brandbombe nach Belagerungsart: große Explosion und anhaltendes Feuer.'
  }),
  W({
    id: 'knochenflinte', name: 'Knochenflinte', cls: ['gun', 'primitive'], type: 'projectile', col: '#b8d98a',
    scaling: { ranged: .5, luck: .2 }, unlockDefault: true,
    tiers: [[5, .95, 290, .05, 1.6, 18, { pellets: 3, spread: .42 }], [8, .92, 315, .06, 1.7, 36, { pellets: 3, spread: .42 }],
    [13, .88, 345, .07, 1.8, 74, { pellets: 4, spread: .40 }], [21, .84, 380, .08, 2.0, 150, { pellets: 4, spread: .38 }]],
    special: 'Streu aus geschärften Knochensplittern: roh, laut und auf kurze Distanz brutal.'
  }),
  W({
    id: 'sanitaetsramme', name: 'Sanitätsramme', cls: ['heavy', 'medical'], type: 'melee', col: '#8affb0',
    scaling: { melee: .7, hpRegen: .3 }, unlockDefault: true,
    tiers: [[18, 1.10, 120, .04, 1.6, 22, { arc: 1.3, stun: .8, knock: 190 }], [30, 1.06, 132, .05, 1.7, 44, { arc: 1.35, stun: .9, knock: 210 }],
    [49, 1.02, 146, .06, 1.8, 90, { arc: 1.4, stun: 1.0, knock: 235 }], [80, .98, 164, .07, 2.0, 182, { arc: 1.45, stun: 1.2, knock: 260 }]],
    special: 'Mobile Sanitätsramme: drängt Gegner weg und hält die eigene Versorgung stabil.'
  }),
  W({
    id: 'streitkolben', name: 'Streitkolben', cls: ['heavy', 'medieval'], type: 'melee', col: '#d8c7a6',
    scaling: { melee: .85, armor: .2 }, unlockDefault: true,
    tiers: [[22, 1.15, 120, .05, 1.6, 22, { arc: 1.25, stun: .9, knock: 220 }], [37, 1.11, 132, .06, 1.7, 44, { arc: 1.28, stun: 1.0, knock: 245 }],
    [60, 1.07, 145, .07, 1.8, 90, { arc: 1.32, stun: 1.15, knock: 270 }], [98, 1.03, 162, .08, 2.0, 182, { arc: 1.35, stun: 1.3, knock: 300 }]],
    special: 'Schwerer Reitkolben: betäubt gepanzerte Ziele und bricht dichte Reihen.'
  }),
  W({
    id: 'ballistenarm', name: 'Ballistenarm', cls: ['heavy', 'precise'], type: 'projectile', col: '#c96be0',
    scaling: { ranged: .55, crit: .15, armor: .15 }, unlockDefault: true,
    tiers: [[20, 1.30, 620, .14, 2.0, 26, { pierce: 3, armorPierce: .25 }], [34, 1.25, 670, .16, 2.2, 52, { pierce: 3, armorPierce: .28 }],
    [57, 1.20, 720, .18, 2.4, 104, { pierce: 4, armorPierce: .32 }], [93, 1.15, 780, .20, 2.6, 208, { pierce: 4, armorPierce: .35 }]],
    special: 'Armbrustmechanik mit Winde: panzerbrechende Bolzen und extreme Reichweite.'
  }),
  W({
    id: 'mammutkeule', name: 'Mammutkeule', cls: ['heavy', 'primitive'], type: 'melee', col: '#c9a06b',
    scaling: { melee: .85, armor: .15, luck: .15 }, unlockDefault: true,
    tiers: [[28, 1.30, 125, .04, 1.6, 24, { arc: 1.6, stun: 1.0, knock: 300 }], [47, 1.26, 138, .05, 1.7, 48, { arc: 1.65, stun: 1.1, knock: 335 }],
    [76, 1.22, 152, .06, 1.8, 96, { arc: 1.72, stun: 1.25, knock: 375 }], [124, 1.18, 170, .07, 2.0, 194, { arc: 1.8, stun: 1.4, knock: 420 }]],
    special: 'Uralte Mammutkeule: massiver Rückstoß, breite Bögen und lange Betäubung.'
  }),
  W({
    id: 'bollwerkbanner', name: 'Bollwerkbanner', cls: ['heavy', 'support'], type: 'melee', col: '#ffd23e',
    scaling: { melee: .6, eng: .2 }, unlockDefault: true,
    tiers: [[15, .95, 140, .05, 1.6, 20, { arc: .9, knock: 90, stun: .5 }], [25, .92, 155, .06, 1.7, 40, { arc: .95, knock: 105, stun: .6 }],
    [41, .88, 172, .07, 1.8, 82, { arc: 1.0, knock: 120, stun: .7 }], [67, .84, 192, .08, 2.0, 166, { arc: 1.0, knock: 130, stun: .8 }]],
    special: 'Schweres Bollwerkbanner: breite Schwünge, die Platz für die eigene Aufstellung schaffen.'
  }),
  W({
    id: 'knochenbogen', name: 'Knochenbogen', cls: ['precise', 'primitive'], type: 'projectile', col: '#e0d0a8',
    scaling: { ranged: .65, luck: .15, crit: .15 }, unlockDefault: true,
    tiers: [[16, .90, 540, .14, 1.9, 22, { pierce: 1 }], [27, .87, 585, .16, 2.1, 44, { pierce: 1 }],
    [44, .83, 630, .18, 2.3, 90, { pierce: 2 }], [72, .79, 680, .20, 2.5, 182, { pierce: 2 }]],
    special: 'Leiser Knochenbogen: hohe Kritchance und Reichweite mit archaischer Wucht.'
  }),
  /* Druckluft-Familie: drei Waffen mit einem gemeinsamen Zustand. Jeder echte
     Treffer baut Druck auf; bei 3 Stapeln entlädt sich ein Druckstoß. */
  W({
    id: 'drucknagler', name: 'Druckluftnagler', cls: ['gun', 'support'], type: 'projectile', col: '#9fe8ff', family: 'druck',
    scaling: { ranged: .30, eng: .16 }, unlockDefault: true,
    tiers: [[2.6, .20, 360, .06, 1.6, 18, { pierce: 1, druck: 1 }], [4.2, .19, 390, .07, 1.7, 36, { pierce: 1, druck: 1 }],
      [6.4, .18, 420, .08, 1.8, 72, { pierce: 2, druck: 1 }], [16.5, .16, 470, .09, 2.0, 146, { pierce: 2, druck: 2 }]],
    special: 'Schnelle Pressluftnägel. Jeder Treffer baut Druck auf; drei Stapel entladen einen Druckstoß, der Nachbarn zurückwirft.'
  }),
  W({
    id: 'druckwellenwerfer', name: 'Druckwellenwerfer', cls: ['heavy', 'support'], type: 'cone', col: '#7ddcff', family: 'druck',
    scaling: { ranged: .40, eng: .45 }, unlockDefault: true,
    tiers: [[13.5, .66, 230, .04, 1.5, 22, { cone: .78, knock: 190, druck: 1 }], [21.9, .62, 250, .05, 1.6, 44, { cone: .84, knock: 215, druck: 1 }],
      [35.5, .58, 275, .06, 1.7, 88, { cone: .92, knock: 245, druck: 1 }], [57.5, .54, 310, .07, 1.9, 176, { cone: 1.02, knock: 285, druck: 1 }]],
    special: 'Breite Druckwelle auf kurze Distanz: Rückstoß für die ganze Reihe und ein Druckstapel auf jedem Ziel.'
  }),
  W({
    id: 'kolbenramme', name: 'Kolbenramme', cls: ['blunt', 'support'], type: 'melee', col: '#ffd08a', family: 'druck',
    scaling: { melee: .85, eng: .25 }, unlockDefault: true,
    tiers: [[21, .94, 108, .08, 1.8, 22, { arc: .62, stun: .8, knock: 150, druck: 2 }], [33, .90, 118, .09, 1.9, 44, { arc: .68, stun: .9, knock: 170, druck: 2 }],
      [54, .86, 130, .10, 2.0, 90, { arc: .74, stun: 1.0, knock: 200, druck: 2 }], [86, .82, 146, .12, 2.2, 180, { arc: .80, stun: 1.2, knock: 240, druck: 2 }]],
    special: 'Hydraulische Kolbenramme: enger, harter Stoß mit Betäubung. Zwei Treffer reichen für den Druckstoß.'
  }),
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
  })
];
const WEAPON_BY_ID = Data.register('weapons', WEAPONS, {
  id: 'id', name: 'req|str', col: 'str', type: 'in:projectile,hitscan,cone,chain,charge,aura,melee',
  scaling: (w) => { for (const k in (w.scaling || {})) if (!STAT_KEYS.includes(k)) return 'unbekannter Scaling-Stat ' + k + ' (tot im Spiel)'; return null; },
  tiers: (w) => { if (!Array.isArray(w.tiers) || w.tiers.length < 1) return 'tiers fehlt'; for (const a of w.tiers) if (!Array.isArray(a) || a.length < 6 || typeof a[0] !== 'number' || !(a[0] > 0)) return 'Tier-Zeile ungueltig'; return null; }
}).byId;

function E(id, name, o) { return Object.assign({ id, name }, o); }
const ENEMIES = [
  E('runner', 'Läufer', { hp: 11, dmg: 6, spd: 148, r: 11, col: '#ff5d6e', xp: 1, mat: 1, ai: 'chase', family: 'laeufer', shape: 'tri', minW: 1, w: 30, pack: 1 }),
  E('swarm', 'Brut', { hp: 5, dmg: 3, spd: 190, r: 8, col: '#ff9a5c', xp: 1, mat: 1, ai: 'chase', shape: 'dot', minW: 1, w: 26, pack: 1 }),
  E('walker', 'Schlurfer', { hp: 20, dmg: 8, spd: 92, r: 14, col: '#c96be0', xp: 2, mat: 1, ai: 'chase', family: 'schlurfer', shape: 'box', minW: 1, w: 24 }),
  E('flyer', 'Drohne', { hp: 13, dmg: 6, spd: 168, r: 10, col: '#59e6ff', xp: 2, mat: 1, ai: 'orbit', fly: true, shape: 'diamond', minW: 3, w: 18 }),
  E('shooter', 'Schütze', { hp: 17, dmg: 0, spd: 88, r: 12, col: '#7dffb0', xp: 3, mat: 2, ai: 'ranged', shape: 'tri', minW: 3, w: 20, shot: { dmg: 8, spd: 240, cd: 1.9, range: 400, col: '#7dffb0' } }),
  E('spitter', 'Spucker', { hp: 22, dmg: 0, spd: 78, r: 13, col: '#b8d98a', xp: 3, mat: 2, ai: 'ranged', shape: 'box', minW: 5, w: 16, shot: { dmg: 6, spd: 190, cd: 2.3, range: 340, col: '#b8d98a', poison: 10 } }),
  E('exploder', 'Zünder', { hp: 16, dmg: 0, spd: 128, r: 13, col: '#ff2e88', xp: 3, mat: 2, ai: 'exploder', shape: 'dot', minW: 4, w: 18, boom: { dmg: 20, r: 92 } }),
  E('charger', 'Rammer', { hp: 34, dmg: 14, spd: 74, r: 16, col: '#ffb24a', xp: 4, mat: 2, ai: 'charger', shape: 'tri', minW: 6, w: 15 }),
  E('tank', 'Panzer', { hp: 58, dmg: 13, spd: 62, r: 21, col: '#9fb4d8', armor: 7, xp: 5, mat: 3, ai: 'chase', shape: 'box', minW: 5, w: 14 }),
  E('healer', 'Sanitäter', { hp: 26, dmg: 5, spd: 104, r: 13, col: '#8affb0', xp: 4, mat: 3, ai: 'healer', shape: 'cross', minW: 7, w: 11, heal: { amt: 8, cd: 1.7, r: 190 } }),
  E('shielder', 'Schildträger', { hp: 40, dmg: 9, spd: 84, r: 17, col: '#c7a6ff', armor: 4, xp: 5, mat: 3, ai: 'aura', shape: 'hex', minW: 8, w: 11, aura: { armor: 6, r: 170 } }),
  E('summoner', 'Beschwörer', { hp: 44, dmg: 7, spd: 70, r: 16, col: '#a06bff', xp: 6, mat: 4, ai: 'summoner', shape: 'hex', minW: 9, w: 9, summon: { id: 'swarm', n: 3, cd: 4.5 } }),
  E('elite', 'Elite-Wache', { hp: 95, dmg: 18, spd: 108, r: 19, col: '#ffe27a', armor: 9, xp: 9, mat: 6, ai: 'chase', family: 'elite', shape: 'star', minW: 11, w: 8 }),
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
    wail: { cd: 5.2, r: 260, spd: 1.35, dur: 4.5, cdPenalty: 1.2 } }),
  E('kurpark_laurer', 'Kurpark-Laurer', { hp: 16, dmg: 7, spd: 116, r: 12, col: '#7ddc9a', xp: 2, mat: 1, ai: 'chase', shape: 'tri', minW: 2, w: 18 }),
  E('tauben_schwarm', 'Tauben-Schwarm', { hp: 8, dmg: 4, spd: 176, r: 8, col: '#c7d2e8', xp: 1, mat: 1, ai: 'chase', fly: true, pack: 1, shape: 'wing', minW: 2, w: 20 }),
  E('brunnenegel', 'Brunnenegel', { hp: 18, dmg: 3, spd: 152, r: 10, col: '#a8324e', xp: 2, mat: 2, ai: 'leech', shape: 'worm', minW: 3, w: 12, drain: { dps: 6, cd: 3.6, heal: .7 } }),
  E('strassenbahn_schuetze', 'Straßenbahn-Schütze', { hp: 22, dmg: 0, spd: 78, r: 12, col: '#ffd24a', xp: 3, mat: 2, ai: 'ranged', shape: 'tri', minW: 4, w: 12, shot: { dmg: 9, spd: 250, cd: 2.0, range: 500, col: '#ffd24a' } }),
  E('kiosk_raufer', 'Kiosk-Raufer', { hp: 30, dmg: 11, spd: 82, r: 15, col: '#ff9f5c', xp: 4, mat: 2, ai: 'charger', shape: 'tri', minW: 4, w: 10 }),
  E('rheingau_weber', 'Rheingau-Weber', { hp: 24, dmg: 7, spd: 146, r: 12, col: '#dcd0ff', xp: 4, mat: 2, ai: 'weaver', shape: 'spider', minW: 5, w: 12, web: { cd: 1.5, r: 58, slow: .45, life: 5 } }),
  E('hafen_moerser', 'Hafen-Mörser', { hp: 36, dmg: 0, spd: 54, r: 16, col: '#c0a06b', xp: 5, mat: 3, ai: 'mortar', shape: 'turret', minW: 6, w: 9, lob: { dmg: 16, cd: 3.2, range: 400, r: 74, flight: 1.35 } }),
  E('thermal_sirene', 'Thermal-Sirene', { hp: 38, dmg: 6, spd: 94, r: 15, col: '#ff8ac4', xp: 6, mat: 4, ai: 'siren', shape: 'wave', minW: 8, w: 8, wail: { cd: 5.2, r: 260, spd: 1.35, dur: 4.5, cdPenalty: 1.2 } }),
  E('matten_heiler', 'Matten-Heiler', { hp: 28, dmg: 4, spd: 108, r: 13, col: '#8affb0', xp: 4, mat: 3, ai: 'healer', shape: 'cross', minW: 7, w: 8, heal: { amt: 8, cd: 1.7, r: 190 } }),
  E('festungs_schild', 'Festungs-Schild', { hp: 44, dmg: 8, spd: 80, r: 17, col: '#c7a6ff', armor: 4, xp: 5, mat: 3, ai: 'aura', shape: 'hex', minW: 8, w: 8, aura: { armor: 6, r: 170 } }),
  E('hexen_turm', 'Hexen-Turm', { hp: 50, dmg: 6, spd: 64, r: 17, col: '#a06bff', xp: 6, mat: 4, ai: 'summoner', shape: 'hex', minW: 10, w: 6, summon: { id: 'tauben_schwarm', n: 3, cd: 5.0 } }),
  E('weinberg_bomber', 'Weinberg-Bomber', { hp: 28, dmg: 5, spd: 154, r: 12, col: '#ffd24a', xp: 5, mat: 3, ai: 'bomber', fly: true, shape: 'wing', minW: 7, w: 9, mine: { cd: 2.3, fuse: 1.7, r: 78, dmg: 17 } }),
  E('schiefer_waechter', 'Schiefer-Wächter', { hp: 56, dmg: 0, spd: 28, r: 17, col: '#ff7a5c', armor: 5, xp: 6, mat: 4, ai: 'sentinel', shape: 'eye', minW: 9, w: 7, beam: { dmg: 15, cd: 3.6, warn: .9, range: 560, w: 16 } }),
  E('kurhaus_spiegel', 'Kurhaus-Spiegel', { hp: 38, dmg: 10, spd: 126, r: 14, col: '#bfe8ff', xp: 6, mat: 4, ai: 'mirror', shape: 'prism', minW: 9, w: 7, reflect: .28 }),
  E('nebelgeist', 'Nebelgeist', { hp: 26, dmg: 9, spd: 138, r: 12, col: '#dbe6ff', xp: 5, mat: 3, ai: 'teleport', shape: 'diamond', minW: 10, w: 8, blink: { cd: 2.4, min: 110, max: 250 } }),
  E('schloss_koloss', 'Schloss-Koloss', { hp: 104, dmg: 17, spd: 50, r: 23, col: '#7f8ba3', armor: 12, xp: 9, mat: 6, ai: 'juggernaut', shape: 'brick', minW: 12, w: 4, slam: { cd: 4.2, r: 132, dmg: 18, warn: .7 }, noKnock: true }),
  E('bruecken_rammer', 'Brücken-Rammer', { hp: 42, dmg: 14, spd: 68, r: 18, col: '#ffb24a', xp: 5, mat: 3, ai: 'charger', shape: 'box', minW: 6, w: 7 }),
  E('zollhaus_zwilling', 'Zollhaus-Zwilling', { hp: 44, dmg: 11, spd: 120, r: 15, col: '#c7a6ff', xp: 6, mat: 4, ai: 'mirror', shape: 'prism', minW: 11, w: 5, reflect: .32 }),
  E('deponie_drohne', 'Deponie-Drohne', { hp: 18, dmg: 7, spd: 172, r: 10, col: '#59e6ff', xp: 3, mat: 2, ai: 'orbit', fly: true, shape: 'diamond', minW: 6, w: 10 }),
  E('kuppel_krabbe', 'Kuppel-Krabbe', { hp: 48, dmg: 10, spd: 92, r: 17, col: '#ff9a5c', armor: 5, xp: 5, mat: 3, ai: 'shielded', shape: 'hex', minW: 8, w: 7, shieldArc: 1.2 }),
  E('pumpwerk_kreisel', 'Pumpwerk-Kreisel', { hp: 32, dmg: 6, spd: 112, r: 13, col: '#ffb0e0', xp: 4, mat: 2, ai: 'spiral', shape: 'gear', minW: 5, w: 10, shot: { dmg: 5, spd: 200, cd: 2.1, range: 999, col: '#ffb0e0' }, radial: 6 }),
  E('veilchengeist', 'Veilchengeist', { hp: 32, dmg: 12, spd: 140, r: 13, col: '#b09cff', xp: 6, mat: 3, ai: 'chase', fly: true, phase: true, shape: 'diamond', minW: 13, w: 6 }),
  E('rheinufer_bomber', 'Rheinufer-Bomber', { hp: 20, dmg: 0, spd: 120, r: 13, col: '#ff2e88', xp: 3, mat: 2, ai: 'exploder', shape: 'dot', minW: 5, w: 9, boom: { dmg: 22, r: 96 } })
];
const ENEMY_BY_ID = Data.register('enemies', ENEMIES, {
  id: 'id', name: 'req|str', hp: 'num>0', dmg: 'num>=0', spd: 'num>0', r: 'num>0', col: 'str', xp: 'num>=0', mat: 'num>=0',
  summon: (e) => e.summon && e.summon.id && !ENEMY_BY_ID[e.summon.id] ? 'summon.id unbekannt: ' + e.summon.id : null,
  split: (e) => e.split && e.split.id && !ENEMY_BY_ID[e.split.id] ? 'split.id unbekannt: ' + e.split.id : null
}).byId;
/* Die 32 Entwurfsgegner bleiben ein separater Live-Katalog: die Basis-ENEMIES
   und alle bestehenden Content-Gates bleiben bei 28. Die Kampagne spawnt aus
   CAMPAIGN_ENEMY_BY_ID, der Endlos-/QA-Pool bleibt unverändert. */
const FUENF_VIERTEL_ENEMIES = (FUENF_VIERTEL && Array.isArray(FUENF_VIERTEL.enemies)) ? FUENF_VIERTEL.enemies : [];
const FUENF_VIERTEL_ENEMY_BY_ID = {};
for (const e of FUENF_VIERTEL_ENEMIES) if (e && e.id) FUENF_VIERTEL_ENEMY_BY_ID[e.id] = e;
const CAMPAIGN_ENEMIES = ENEMIES.concat(FUENF_VIERTEL_ENEMIES);
const CAMPAIGN_ENEMY_BY_ID = Object.assign({}, ENEMY_BY_ID, FUENF_VIERTEL_ENEMY_BY_ID);

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
             { at: .32, spd: 76, pattern: 'stoneRain', cd: 1.9, n: 11, bs: 220, bd: 24, summon: 'juggernaut' }] },
  { id: 'kurparkhueter', name: 'KURPARK-HÜTER', arena: 'kurpark', hp: 3100, r: 46, col: '#5dff9b', spd: 56, dmg: 22, armor: 10, mat: 65, xp: 45,
    phases: [{ at: 1.0, spd: 56, pattern: 'radial', cd: 2.0, n: 12, bs: 190, bd: 11 },
             { at: .62, spd: 78, pattern: 'charge', cd: 2.4, n: 14, bs: 220, bd: 13, summon: 'runner' },
             { at: .30, spd: 96, pattern: 'bulletHell', cd: 1.7, n: 16, bs: 200, bd: 15, summon: 'flyer' }] },
  { id: 'rheingaurebe', name: 'RHEINGAU-REBE', arena: 'rheingau', hp: 5600, r: 50, col: '#8fd46a', spd: 64, dmg: 25, armor: 13, mat: 85, xp: 65,
    phases: [{ at: 1.0, spd: 64, pattern: 'spiral', cd: 1.6, n: 6, bs: 210, bd: 13 },
             { at: .60, spd: 84, pattern: 'geysers', cd: 2.6, n: 5, bs: 200, bd: 15, summon: 'spitter' },
             { at: .28, spd: 106, pattern: 'crossfire', cd: 2.1, n: 8, bs: 235, bd: 17, summon: 'shielded' }] }
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

  I('c_gier', 'Fluch der Gier', 3, 55, { harvest: 15, luck: 40, maxHp: -30 }, 'Materialien glänzen. Dein Blut auch.', { cursed: true, curse: 5 }),
  I('c_raserei', 'Fluch der Raserei', 3, 58, { atkSpd: 35, speed: 15, armor: -6 }, 'Schneller. Immer schneller.', { cursed: true, curse: 5 }),
  I('c_zorn', 'Fluch des Zorns', 4, 90, { dmgP: 60, crit: 20, maxHp: -45, dodge: -10 }, 'Der Zorn nimmt, was er gibt.', { cursed: true, curse: 6 }),
  I('c_stille', 'Fluch der Stille', 3, 60, { range: 40, ranged: 25, hpRegen: -3 }, 'Weit sehen, langsam sterben.', { cursed: true, curse: 5 }),
  I('c_eisen', 'Fluch des Eisens', 3, 62, { armor: 12, maxHp: 40, speed: -25, atkSpd: -12 }, 'Ein Denkmal deiner selbst.', { cursed: true, curse: 5 }),
  I('c_echo', 'Fluch des Echos', 4, 95, { elem: 40, expSize: 50, lifesteal: -15, armor: -4 }, 'Jede Explosion trifft auch dich.', { cursed: true, curse: 6 }),
  I('rangliste', 'Stadtarchiv-Rangliste', 3, 82, { abilityRank: 1, xpGain: 8 }, 'Jede Seite ein Viertel, jede Zeile ein Rekord.'),
  I('taktgeber', 'Kurhaus-Taktgeber', 3, 76, { abilityCdMod: -12, atkSpd: 6 }, 'Der Takt des Kurhauses, präzise bis zur Millisekunde.'),
  I('schlauchrolle', 'Schlauchrolle', 1, 22, { maxHp: 12, armor: 1, speed: -2 }, 'Schwer, aber der Schlauch hält dich im Einsatz.'),
  I('kastanienblatt', 'Kastanienblatt', 1, 20, { luck: 10, harvest: 2 }, 'Im Kurpark gefunden, im Portemonnaie geblieben.'),
  I('fahrradkette', 'Fahrradkette', 1, 18, { speed: 10, atkSpd: 3 }, 'Öl auf den Händen, Tempo in den Beinen.'),
  I('loetkolben', 'Lötkolben', 1, 22, { eng: 8, elem: 4 }, 'Klein, heiß, überraschend vielseitig.'),
  I('schaufenster', 'Schaufenster', 1, 24, { crit: 4, range: 6 }, 'Im Vorbeigehen siehst du jede Schwachstelle.'),
  I('atemschutz', 'Atemschutzmaske', 2, 40, { armor: 4, hpRegen: 1, dodge: 2 }, 'Durch Rauch und Panik hindurch.'),
  I('loeschdecke', 'Löschdecke', 2, 38, { maxHp: 18, hpRegen: 2, speed: 3 }, 'Ersticken verhindern, dann weiterlaufen.'),
  I('taubenpaar', 'Kurpark-Taubenpaar', 2, 36, { luck: 14, xpGain: 8, maxHp: -5 }, 'Sie fressen dir aus der Hand und bringen Glück.'),
  I('lichtung', 'Kurpark-Lichtung', 2, 38, { harvest: 5, speed: 5, dodge: 3 }, 'Zwischen den Bäumen liegt mehr, als du siehst.'),
  I('stroemung', 'Rheinströmung', 2, 36, { speed: 8, dodge: 4, knock: 15 }, 'Der Fluss schiebt, du lässt dich tragen.'),
  I('faehrmannstueck', 'Fährmannstück', 2, 40, { harvest: 3, luck: 10, speed: 4 }, 'Eine Überfahrt, ein Fund, ein guter Tag.'),
  I('messsonde', 'Messsonde', 2, 42, { eng: 10, range: 8, crit: 3 }, 'Was du messen kannst, kannst du treffen.'),
  I('kuehlkreislauf', 'Kühlkreislauf', 2, 38, { elem: 10, hpRegen: 1, armor: 2 }, 'Hält den Reaktor ruhig und dich kühl.'),
  I('marktschreier', 'Marktschreier', 2, 40, { harvest: 6, luck: 12, dmgP: 3 }, 'Laut verkaufen, leise kassieren.'),
  I('hydrant', 'Unterflurhydrant', 3, 74, { maxHp: 30, armor: 3, knock: 20 }, 'Steht fest und spuckt zurück.', { thorns: 8 }),
  I('kurmusik', 'Kurmusik', 3, 72, { luck: 20, xpGain: 15, atkSpd: 5 }, 'Der Walzer trägt dich durch die Welle.'),
  I('promenade', 'Uferpromenade', 3, 76, { speed: 12, dodge: 7, range: 10 }, 'Freie Sicht, freier Lauf.'),
  I('pruefstand', 'Prüfstand', 3, 80, { eng: 18, atkSpd: 8, expSize: 15 }, 'Jede Explosion wird hier zuerst getestet.'),
  I('uhrturm', 'Uhrturm', 3, 78, { crit: 8, critDmg: 20, atkSpd: 5 }, 'Die Stadt taktet im Rhythmus deiner Schüsse.'),
  I('wachbuch', 'Wachbuch', 4, 130, { maxHp: 40, armor: 8, hpRegen: 3, speed: -5 }, 'Jede Schicht, jede Narbe, jede Regel.'),
  I('parkbank', 'Kurpark-Bank', 4, 124, { maxHp: 30, hpRegen: 4, harvest: 8, speed: -4 }, 'Setz dich. Atme. Dann steh wieder auf.'),
  I('rheinbruecke', 'Rheinbrücke', 4, 132, { range: 20, critDmg: 25, knock: 30, speed: 5 }, 'Von hier aus triffst du das andere Ufer.'),
  I('reaktorhandschuh', 'Reaktorhandschuh', 4, 138, { elem: 25, eng: 15, dmgP: 12, maxHp: -10 }, 'Die Hitze bleibt draußen. Meistens.'),
  I('goldener_adler', 'Goldener Adler', 4, 145, { dmgP: 20, crit: 10, critDmg: 30, speed: -4 }, 'Das Wappen der Stadt, in deiner Hand.'),
  /* Druckluft-Set: Items, die den Druckstoss der neuen Waffenfamilie lesbar
     verstaerken. Die Werte liegen auf bestehenden Stat-Achsen; die Extras
     werden nur von der Druck-Mechanik gelesen. */
  I('druckkammer', 'Druckkammer', 2, 42, { eng: 8, dmgP: 4 }, 'Speichert den Überdruck und gibt ihn an den nächsten Stoß weiter.', { druckDmg: 18 }),
  I('resonanzboden', 'Resonanzboden', 3, 78, { elem: 10, atkSpd: 6, armor: 2 }, 'Ein hohler Klangkörper: der Druckstoß trägt weiter.', { druckDmg: 25, druckRadius: 14 }),
  I('obertonventil', 'Obertonventil', 4, 136, { elem: 20, dmgP: 10, atkSpd: 8 }, 'Fein abgestimmte Ventile machen aus Druck einen langen Nachhall.', { druckDmg: 35, druckRadius: 22, druckSlow: .15 }),
  /* Item-Pool 120 (2026-11-09): 47 Items, je 24 pro Veedel und 30 pro
     Raritaet. Alle Wirkungen laufen ueber die bestehenden Stat- und
     Item-Extras (turret, thorns, curse, druck); kein paralleles System. */
  /* ---- R1: 15 neue Einstiegs-Items ---- */
  I('wasserflasche', 'Feldflasche', 1, 20, { maxHp: 10, hpRegen: 1 }, 'Der erste Schluck gehört dem Einsatz.'),
  I('griffhandschuh', 'Griffhandschuhe', 1, 19, { melee: 5, armor: 1 }, 'Nass, schwer, aber sie halten.'),
  I('rettungsfolie', 'Rettungsfolie', 1, 20, { maxHp: 8, dodge: 2, speed: -1 }, 'Glänzt wie ein Versprechen.'),
  I('eichel', 'Kurpark-Eichel', 1, 18, { harvest: 2, luck: 6 }, 'Eichhörnchen hassen diesen Trick.'),
  I('parkmuenze', 'Parkuhr-Münze', 1, 20, { luck: 8, xpGain: 4, maxHp: -3 }, 'Eine Stunde Glück kostenlos.'),
  I('gieskanne', 'Gießkanne', 1, 19, { harvest: 3, hpRegen: 1 }, 'Die Blumen danken, die Gegner nicht.'),
  I('vogelhaus', 'Vogelhäuschen', 1, 21, { luck: 6, hpRegen: 1, speed: -1 }, 'Kleines Haus, große Gesellschaft.'),
  I('uferkiesel', 'Uferkiesel', 1, 18, { armor: 1, knock: 10 }, 'Glatt, schwer, überraschend zielsicher.'),
  I('rollschuh', 'Rollschuhe', 1, 19, { speed: 8, dodge: 2, armor: -1 }, 'Der Rheinpfad ist eine Rennbahn.'),
  I('paddel', 'Kanu-Paddel', 1, 20, { speed: 5, knock: 12 }, 'Ein Schlag, ein Meter.'),
  I('neoprenanzug', 'Neoprenanzug', 1, 22, { maxHp: 8, speed: 3, armor: -1 }, 'Nass ist nur ein Zustand.'),
  I('batterie', 'Akkuzelle', 1, 20, { eng: 6, elem: 3 }, 'Lädt schneller, als sie sollte.'),
  I('kabelbinder', 'Kabelbinder', 1, 18, { eng: 4, atkSpd: 3 }, 'Hält alles. Auch dich.'),
  I('lesebrille', 'Lesebrille', 1, 19, { crit: 3, range: 5 }, 'Die kleine Schrift ist der Feind.'),
  I('wurfmesser', 'Wurfmesser', 1, 21, { ranged: 5, crit: 2, melee: -2 }, 'Für die letzte Reihe.'),
  /* ---- R2: 8 neue Items ---- */
  I('schutzanzug', 'Hitzeschutzanzug', 2, 38, { armor: 4, maxHp: 16, speed: -3 }, 'Drei Lagen, keine Ausreden.'),
  I('brandmelder', 'Brandmelder', 2, 36, { armor: 2, hpRegen: 2, luck: 4 }, 'Piept, bevor es brennt.'),
  I('picknickkorb', 'Picknickkorb', 2, 38, { harvest: 5, maxHp: 12, speed: -2 }, 'Für die Pause nach der Welle.'),
  I('ententeich', 'Ententeich', 2, 36, { luck: 12, harvest: 3, dodge: -2 }, 'Enten sind die besseren Investoren.'),
  I('fahrradpumpe', 'Fahrradpumpe', 2, 35, { speed: 9, atkSpd: 4, maxHp: -4 }, 'Druck aufbauen, losfahren.'),
  I('treibgut', 'Treibgut', 2, 38, { harvest: 4, knock: 20, luck: 6 }, 'Der Fluss gibt, der Fluss nimmt.'),
  I('loetstation', 'Lötstation', 2, 42, { eng: 10, elem: 6, speed: -2 }, 'Heiß, präzise, ungeduldig.'),
  I('kontaktlinse', 'Kontaktlinse', 2, 37, { crit: 5, range: 8, hpRegen: -1 }, 'Näher dran, länger wach.'),
  /* ---- R3: 6 normale + 2 verfluchte Items ---- */
  I('hydrantenschluessel', 'Hydrantenschlüssel', 3, 74, { eng: 10, knock: 25 }, 'Erst Wasser, dann Rückstoß.', { thorns: 6 }),
  I('rettungsweste', 'Rettungsweste', 3, 76, { maxHp: 28, armor: 4, speed: -4 }, 'Auftrieb für schlechte Tage.'),
  I('rosengarten', 'Rosengarten', 3, 78, { luck: 22, harvest: 6, xpGain: 8 }, 'Dornen inklusive.'),
  I('brunnenwasser', 'Brunnenwasser', 3, 74, { hpRegen: 3, maxHp: 20, luck: 10 }, 'Schmeckt nach Stein und Glück.'),
  I('rheinsegler', 'Rheinsegler', 3, 76, { speed: 14, dodge: 6, knock: 20 }, 'Der Wind macht die Arbeit.'),
  I('strandkorb', 'Strandkorb', 3, 72, { maxHp: 24, armor: 3, dodge: 4, speed: -5 }, 'Eine Festung mit Blick aufs Wasser.'),
  I('c_schwerkraft', 'Fluch der Schwerkraft', 3, 60, { dmgP: 35, armor: 5, speed: -20, dodge: -8 }, 'Jeder Schritt wiegt eine Tonne.', { cursed: true, curse: 5 }),
  I('c_hunger', 'Fluch des Hungers', 3, 58, { harvest: 25, lifesteal: -10, hpRegen: -2, maxHp: -20 }, 'Mehr Beute. Weniger von dir.', { cursed: true, curse: 5 }),
  /* ---- R4: 12 normale + 4 verfluchte Items ---- */
  I('c_rost', 'Fluch des Rostes', 4, 92, { armor: 14, maxHp: 30, atkSpd: -18, speed: -10 }, 'Was dich schützt, frisst dich.', { cursed: true, curse: 6, thorns: 12 }),
  I('c_wucher', 'Fluch des Wuchers', 4, 94, { harvest: 35, luck: 30, maxHp: -40, lifesteal: -12 }, 'Der Zins kommt nach der Welle.', { cursed: true, curse: 6 }),
  I('c_zeit', 'Fluch der Zeit', 4, 95, { atkSpd: 30, speed: 10, maxHp: -35, hpRegen: -2 }, 'Schneller, aber nicht jünger.', { cursed: true, curse: 6 }),
  I('c_laerm', 'Fluch des Lärms', 4, 96, { ranged: 30, crit: 15, dodge: -12, armor: -4 }, 'Jeder Schuss zieht mehr an.', { cursed: true, curse: 6 }),
  I('einsatzleitwagen', 'Einsatzleitwagen', 4, 128, { maxHp: 50, armor: 12, hpRegen: 4, speed: -8 }, 'Das ganze Kommando auf vier Rädern.'),
  I('kurhausgarten', 'Kurhausgarten', 4, 132, { luck: 45, harvest: 12, xpGain: 20, maxHp: -10 }, 'Jede Bank ein Investment.'),
  I('jahrhundertbaum', 'Jahrhundertbaum', 4, 130, { maxHp: 35, hpRegen: 5, harvest: 10, speed: -6 }, 'Wurzeln tiefer als die Stadt.'),
  I('kurparkdenkmal', 'Kurpark-Denkmal', 4, 134, { armor: 6, luck: 25, harvest: 15, dodge: -5 }, 'Steht da, als wäre es immer da gewesen.'),
  I('rheinregatta', 'Rheinregatta', 4, 136, { speed: 25, dodge: 10, knock: 35, maxHp: -10 }, 'Acht Ruder, ein Ziel.'),
  I('rheinfaehre', 'Rheinfähre', 4, 140, { maxHp: 40, armor: 8, speed: 12, dodge: 5 }, 'Langsam, aber unaufhaltsam.'),
  I('fusionator', 'Fusionator', 4, 142, { eng: 30, elem: 30, dmgP: 15, maxHp: -15 }, 'Zwei Probleme, eine Explosion.'),
  I('kernspintomograph', 'Kernspintomograph', 4, 138, { eng: 35, atkSpd: 12, range: 15, speed: -5 }, 'Sieht durch dich hindurch. Und schießt.', { turret: true }),
  I('ballistikcomputer', 'Ballistikcomputer', 4, 140, { crit: 15, critDmg: 45, range: 20, atkSpd: -6 }, 'Rechnet schneller, als du zielst.'),
  I('praezisionszirkel', 'Präzisionszirkel', 4, 138, { crit: 12, ranged: 30, dmgP: 12, melee: -12 }, 'Jeder Winkel sitzt.'),
  I('stadtarchiv', 'Stadtarchiv', 4, 132, { xpGain: 30, luck: 25, crit: 8 }, 'Wer die Geschichte kennt, trifft besser.'),
  I('goldene_krawatte', 'Goldene Krawatte', 4, 145, { dmgP: 28, crit: 12, speed: 5, maxHp: -12 }, 'Der letzte Schliff vor dem Auftritt.'),
  /* ---------- Item-Pool 125 / Arsenal 32 (2026-11-09) ----------
     Fuenf neue Items, je eines pro Veedel, mit fuenf eigenen Engine-Hooks:
     Kill-Heilung, Nahbereichs-Slow, Ausweich-Nova, Krit-Kette, Kill-Explosion.
     Keines ist nur eine Zahlenkopie eines bestehenden Effekts. */
  I('rettungstrage', 'Rettungstrage', 1, 26, { maxHp: 12, armor: 1 }, 'Traegt dich weiter, wenn der Einsatz vorbei ist.', { killHeal: 2 }),
  I('moosmatte', 'Moosmatte', 2, 44, { armor: 2, hpRegen: 1 }, 'Der Kurpark haelt die Verfolger fest.', { auraSlow: .28, auraRadius: 135 }),
  I('brandungsring', 'Brandungsring', 3, 76, { dodge: 6, speed: 4 }, 'Die Welle antwortet, wenn du ausweichst.', { dodgeNova: 34, dodgeNovaR: 125 }),
  I('kettenreaktor', 'Kettenreaktor', 3, 82, { elem: 12, crit: 4 }, 'Ein Krit reicht, um die Nachbarreihe zu laden.', { critChain: .45, critChainDmg: 22 }),
  I('zuendsatz', 'Zuendsatz', 4, 132, { dmgP: 12, expSize: 15 }, 'Was faellt, reisst die Nachbarschaft mit.', { killBoom: 40, killBoomR: 120 }),
];
const ITEM_BY_ID = Data.register('items', ITEMS, {
  id: 'id', name: 'req|str', r: 'num>=1', price: 'num>0',
  stats: (i) => { for (const k in (i.stats || {})) if (!STAT_KEYS.includes(k)) return 'unbekannter Stat ' + k; return null; }
}).byId;

/* Veedel-Familien: fuenf klar lesbare Build-Achsen fuer den Shop.
   Die Zuordnung ist Daten, keine neue Stat-Schicht: sie macht das Angebot
   lesbar und gibt dem Shop einen Fokus, wenn ein Build schon Kontur hat. */
const ITEM_FAMILIES = [
  { id: 'feuerwehr', name: 'Feuerwehr', col: '#ff8a5c', desc: 'Ueberleben, Ruestung und Heilung — der harte Kern.' },
  { id: 'kurpark', name: 'Kurpark', col: '#8affb0', desc: 'Glueck, Ernte und XP — der oekonomische Pfad.' },
  { id: 'rheinufer', name: 'Rheinufer', col: '#39e6ff', desc: 'Tempo, Ausweichen und Rueckstoss — mobil bleiben.' },
  { id: 'labor', name: 'Labor', col: '#a06bff', desc: 'Technik, Elemente und Explosionen — Sebbos Spezialitaet.' },
  { id: 'innenstadt', name: 'Innenstadt', col: '#f4c25a', desc: 'Krit, Reichweite und Praezision — jeder Schuss sitzt.' }
];
const ITEM_FAMILY_MEMBERS = {
  feuerwehr: ['helm', 'verband', 'handschuh', 'sanikoffer', 'stachel', 'exo', 'vampir', 'bollwerkplatte', 'herzensglut', 'c_eisen', 'schlauchrolle', 'atemschutz', 'hydrant', 'loeschdecke', 'wachbuch', 'wasserflasche', 'griffhandschuh', 'rettungsfolie', 'schutzanzug', 'brandmelder', 'hydrantenschluessel', 'rettungsweste', 'c_rost', 'einsatzleitwagen', 'rettungstrage'],
  kurpark: ['kaffee', 'kleeblatt4', 'parfum', 'goldkurhaus', 'zeitschleife', 'c_gier', 'kastanienblatt', 'taubenpaar', 'kurmusik', 'lichtung', 'parkbank', 'eichel', 'parkmuenze', 'gieskanne', 'vogelhaus', 'picknickkorb', 'ententeich', 'rosengarten', 'brunnenwasser', 'c_hunger', 'c_wucher', 'kurhausgarten', 'jahrhundertbaum', 'kurparkdenkmal', 'moosmatte'],
  rheinufer: ['turnschuh', 'rheinstein', 'sprungfeder', 'phasenweste', 'adrenalin', 'sirene', 'c_raserei', 'bounce', 'fahrradkette', 'stroemung', 'promenade', 'faehrmannstueck', 'rheinbruecke', 'uferkiesel', 'rollschuh', 'paddel', 'neoprenanzug', 'fahrradpumpe', 'treibgut', 'rheinsegler', 'strandkorb', 'c_zeit', 'rheinregatta', 'rheinfaehre', 'brandungsring'],
  labor: ['multitool', 'drohne', 'thermo', 'kompressor', 'pierce', 'reaktor', 'quantum', 'serverfarm', 'supernova', 'c_echo', 'taktgeber', 'loetkolben', 'messsonde', 'pruefstand', 'kuehlkreislauf', 'reaktorhandschuh', 'druckkammer', 'resonanzboden', 'obertonventil', 'batterie', 'kabelbinder', 'loetstation', 'fusionator', 'kernspintomograph', 'kettenreaktor'],
  innenstadt: ['zielfernrohr', 'magazin', 'pfeffer', 'plektrum', 'lupe', 'brille', 'sturmgewicht', 'halbgott', 'c_zorn', 'c_stille', 'rangliste', 'schaufenster', 'marktschreier', 'uhrturm', 'goldener_adler', 'lesebrille', 'wurfmesser', 'kontaktlinse', 'c_schwerkraft', 'c_laerm', 'ballistikcomputer', 'praezisionszirkel', 'stadtarchiv', 'goldene_krawatte', 'zuendsatz']
};
const ITEM_FAMILY_BY_ID = {};
for (const f of ITEM_FAMILIES) for (const id of ITEM_FAMILY_MEMBERS[f.id] || []) {
  if (ITEM_BY_ID[id]) ITEM_FAMILY_BY_ID[id] = f;
}
function itemFamily(id) { return ITEM_FAMILY_BY_ID[id] || null; }

/* DANGERS + Register extrahiert nach data.js (2026-09-04) */
const DANGERS = [
  { n: 0, hp: 1.00, dmg: 1.00, spd: 1.00, cnt: 1.00, price: 1.00, reward: 1.00, dmgLate: 0, bossEscort: 0, desc: 'Standard-Einsatz' },
  { n: 1, hp: 1.25, dmg: 1.12, spd: 1.04, cnt: 1.15, price: 1.10, reward: .90, dmgLate: 0, bossEscort: 0, desc: 'Erhöhte Alarmstufe' },
  { n: 2, hp: 1.55, dmg: 1.25, spd: 1.08, cnt: 1.30, price: 1.20, reward: .80, dmgLate: 0, bossEscort: 0, desc: 'Elitegegner ab Welle 6' },
  { n: 3, hp: 1.95, dmg: 1.40, spd: 1.12, cnt: 1.45, price: 1.32, reward: .75, dmgLate: .10, bossEscort: 2, bossEscortFrom: 15, desc: 'Bosse mit Elite-Eskorte' },
  { n: 4, hp: 2.45, dmg: 1.60, spd: 1.16, cnt: 1.62, price: 1.45, reward: .56, dmgLate: .10, bossEscort: 2, desc: 'Materialertrag normalisiert, härtere Gegner' },
  { n: 5, hp: 3.10, dmg: 1.85, spd: 1.22, cnt: 1.80, price: 1.60, reward: .50, dmgLate: .105, bossEscort: 3, desc: 'Wahnsinn — keine Gnade' },
  { n: 6, hp: 4.00, dmg: 2.15, spd: 1.28, cnt: 2.00, price: 1.80, reward: .45, dmgLate: .11, bossEscort: 3, desc: 'NEW GAME+ — Härte' },
  { n: 7, hp: 5.20, dmg: 2.50, spd: 1.35, cnt: 2.25, price: 2.05, reward: .40, dmgLate: .115, bossEscort: 4, desc: 'NEW GAME+ — Prüfung' },
  { n: 8, hp: 7.00, dmg: 3.00, spd: 1.45, cnt: 2.60, price: 2.40, reward: .35, dmgLate: .12, bossEscort: 4, desc: 'NEW GAME+ — Narrenturm' }
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

/* WAVE_EVENTS — dedizierte Elite-/Hordenwellen auf hohen Gefahrenstufen.
   Reine Daten (kein Register: die Zaehlung in content-scope bleibt unveraendert). */
const WAVE_EVENTS = {
  11: { kind: 'horde', name: 'HORDENWELLE', desc: 'Der Ring bricht — fast doppelte Gegnerdichte', mult: 1.8, eliteRate: 0, mat: 45 },
  12: { kind: 'elite', name: 'ELITEWELLE', desc: 'Weniger Gegner, aber jede Gruppe beginnt mit einer Elite', mult: .75, eliteRate: .18, mat: 60 },
  14: { kind: 'horde', name: 'HORDENWELLE', desc: 'Der Ring bricht — doppelte Gegnerdichte', mult: 2.0, eliteRate: 0, mat: 55 },
  15: { kind: 'elite', name: 'ELITEWELLE', desc: 'Elite-Dichte mit Boss — nur die Harten kommen durch', mult: .75, eliteRate: .20, mat: 80 }
};

/* STADTGESCHICHTE - Reduktion von content/stadtgeschichte.json fuer das
   HTML-Spiel. Kein Register: die Content-Zaehlung (Items/Waffen) bleibt unveraendert.
   Parity-Test tools/stadtgeschichte-balance.mjs haelt Datei und Tabelle gleich. */
const STADTGESCHICHTE = {
  "schema": "wbn-stadtgeschichte/1",
  "milestones": [
    5,
    10,
    15
  ],
  "lines": [
    {
      "id": "fruehstueck",
      "name": "Kurhaus-Frühstück",
      "parts": [
        "kaffee",
        "verband"
      ],
      "tiers": [
        {
          "name": "Kurhaus-Menü",
          "premium": 30,
          "stats": {
            "maxHp": 8,
            "speed": 4,
            "hpRegen": 1
          },
          "text": "Kaffee und Verbandszeug: der ehrliche Start in den Tag."
        },
        {
          "name": "Kurhaus-Menü Plus",
          "premium": 70,
          "stats": {
            "maxHp": 10,
            "speed": 4,
            "hpRegen": 2,
            "atkSpd": 2
          },
          "text": "Zweite Tasse, zweite Chance."
        },
        {
          "name": "Kurhaus-Menü Deluxe",
          "premium": 130,
          "stats": {
            "maxHp": 16,
            "speed": 6,
            "hpRegen": 2,
            "atkSpd": 4
          },
          "text": "Der ganze Kurhaus-Saal steht hinter dir."
        }
      ]
    },
    {
      "id": "feuerwehr",
      "name": "Feuerwehr-Ausrüstung",
      "parts": [
        "helm",
        "handschuh"
      ],
      "tiers": [
        {
          "name": "Einsatzausrüstung",
          "premium": 30,
          "stats": {
            "armor": 3,
            "maxHp": 10,
            "melee": 4
          },
          "text": "Helm auf, Handschuhe an."
        },
        {
          "name": "Einsatzausrüstung Plus",
          "premium": 70,
          "stats": {
            "armor": 4,
            "maxHp": 14,
            "melee": 8
          },
          "text": "Jetzt hältst du auch dem Rückstoß stand."
        },
        {
          "name": "Einsatzausrüstung Deluxe",
          "premium": 130,
          "stats": {
            "armor": 6,
            "maxHp": 22,
            "melee": 12,
            "knock": 15
          },
          "text": "Die ganze Wachmannschaft in einem Anzug."
        }
      ]
    },
    {
      "id": "optik",
      "name": "Präzisions-Optik",
      "parts": [
        "zielfernrohr",
        "lupe"
      ],
      "tiers": [
        {
          "name": "Präzisionsoptik",
          "premium": 40,
          "stats": {
            "range": 10,
            "crit": 2,
            "critDmg": 5,
            "atkSpd": 4,
            "dmgP": 2
          },
          "text": "Weit sehen, genau treffen."
        },
        {
          "name": "Präzisionsoptik Plus",
          "premium": 90,
          "stats": {
            "range": 18,
            "crit": 2,
            "critDmg": 6,
            "atkSpd": 8,
            "dmgP": 4
          },
          "text": "Die Lupe findet, was das Zielrohr anvisiert."
        },
        {
          "name": "Präzisionsoptik Deluxe",
          "premium": 160,
          "stats": {
            "range": 28,
            "crit": 3,
            "critDmg": 10,
            "atkSpd": 12,
            "dmgP": 6
          },
          "text": "Auf dieser Entfernung ist ein Treffer eine Entscheidung."
        }
      ]
    },
    {
      "id": "technik",
      "name": "Wartungsrig",
      "parts": [
        "multitool",
        "drohne"
      ],
      "tiers": [
        {
          "name": "Wartungsrig",
          "premium": 40,
          "stats": {
            "eng": 10,
            "atkSpd": 6
          },
          "text": "Tool in der Hand, Drohne über der Schulter."
        },
        {
          "name": "Wartungsrig Plus",
          "premium": 90,
          "stats": {
            "eng": 18,
            "atkSpd": 12,
            "range": 8,
            "dmgP": 3,
            "armor": 1,
            "maxHp": 6
          },
          "text": "Die Drohne kalibriert, während du schraubst."
        },
        {
          "name": "Wartungsrig Deluxe",
          "premium": 160,
          "stats": {
            "eng": 30,
            "atkSpd": 20,
            "range": 15,
            "dmgP": 6,
            "armor": 2,
            "maxHp": 12
          },
          "text": "Ein halbes Werkstattlager, auf zwei Schultern verteilt."
        }
      ]
    },
    {
      "id": "kurpark",
      "name": "Kurpark-Glück",
      "parts": [
        "kleeblatt4",
        "parfum"
      ],
      "tiers": [
        {
          "name": "Kurpark-Glück",
          "premium": 35,
          "stats": {
            "luck": 15,
            "harvest": 3,
            "xpGain": 5
          },
          "text": "Kleeblatt in der Tasche, Nerobergluft in der Nase."
        },
        {
          "name": "Kurpark-Glück Plus",
          "premium": 80,
          "stats": {
            "luck": 28,
            "harvest": 6,
            "xpGain": 10
          },
          "text": "Der Kurpark scheint dir alles zuzuwerfen."
        },
        {
          "name": "Kurpark-Glück Deluxe",
          "premium": 150,
          "stats": {
            "luck": 45,
            "harvest": 10,
            "xpGain": 18
          },
          "text": "Selbst die Tauben bringen dir Materialien."
        }
      ]
    },
    {
      "id": "rhein",
      "name": "Rheinufer-Set",
      "parts": [
        "rheinstein",
        "sprungfeder"
      ],
      "tiers": [
        {
          "name": "Rheinufer-Set",
          "premium": 35,
          "stats": {
            "armor": 2,
            "knock": 15,
            "speed": 5,
            "dodge": 2
          },
          "text": "Stein in der Tasche, Feder im Schritt."
        },
        {
          "name": "Rheinufer-Set Plus",
          "premium": 80,
          "stats": {
            "armor": 4,
            "knock": 28,
            "speed": 9,
            "dodge": 5
          },
          "text": "Der Stein bremst, die Feder beschleunigt."
        },
        {
          "name": "Rheinufer-Set Deluxe",
          "premium": 150,
          "stats": {
            "armor": 7,
            "knock": 45,
            "speed": 14,
            "dodge": 8
          },
          "text": "Zwischen Ufer und Sprung liegt dein Revier."
        }
      ]
    },
    {
      "id": "klinik",
      "name": "Klinik-Set",
      "parts": [
        "sanikoffer",
        "vampir"
      ],
      "tiers": [
        {
          "name": "Klinik-Set",
          "premium": 45,
          "stats": {
            "lifesteal": 10,
            "hpRegen": 1,
            "maxHp": 15
          },
          "text": "Sanitäter und Blutkonserve: Hilfe, die zurückkommt."
        },
        {
          "name": "Klinik-Set Plus",
          "premium": 100,
          "stats": {
            "lifesteal": 12,
            "hpRegen": 2,
            "maxHp": 20
          },
          "text": "Die Klinik arbeitet jetzt für dich."
        },
        {
          "name": "Klinik-Set Deluxe",
          "premium": 180,
          "stats": {
            "lifesteal": 18,
            "hpRegen": 3,
            "maxHp": 32
          },
          "text": "Was dich nicht umbringt, bezahlt deine Miete."
        }
      ]
    }
  ]
};

/* Dual-Mode-Abschluss: im Browser reichen die top-level consts (externes Script vor dem
   Engine-Script). Unter Node (BalanceSim-Analyse/Regressionschecks) explizit exportieren. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BROTATO_RULES, STAT_DEF, STAT_KEYS, STAT_NAME, STAT_UNIT, Data,
    CHARS, CHAR_BY_ID, CharacterProfiles, WEAPONS, WEAPON_BY_ID, ENEMIES, ENEMY_BY_ID,
    FUENF_VIERTEL, FUENF_VIERTEL_ENEMIES, FUENF_VIERTEL_ENEMY_BY_ID, CAMPAIGN_ENEMIES, CAMPAIGN_ENEMY_BY_ID,
    ARENAS, ACHIEVEMENTS,
    ITEM_BY_ID, ITEMS, ITEM_FAMILIES, ITEM_FAMILY_BY_ID, ITEM_FAMILY_MEMBERS,
    BOSSES, DANGERS, MODS, WAVE_EVENTS, STADTGESCHICHTE, RUN_UPGRADES, RUN_UPGRADE_BY_ID };
}
