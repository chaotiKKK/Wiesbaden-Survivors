// Stadtgeschichte — deterministisches Evolutionssystem (Prototyp).
//
// Zwei Items einer Linie verschmelzen bei Welle 5/10/15 zu einer staerkeren
// Stufe. Kein RNG, keine Reihenfolgeabhaengigkeit, kein verstecktes Zustands-
// glueck: dieselbe Eingabe ergibt immer dieselbe Ausgabe. Das ist der Kern,
// den der UE-Nachfolger als C++-Regel uebernehmen kann; das HTML-Spiel nutzt
// ihn nicht.
//
// Zustand:
//   { owned: { itemId: count }, levels: { lineId: 0..3 } }
// 'owned' zaehlt gekaufte Items, 'levels' merkt sich, wie weit eine Linie
// entwickelt ist. Beim Verschmelzen wird genau ein Exemplar je Zutat
// verbraucht; die naechste Stufe verbraucht das Evolutions-Item der Vorstufe.
//
// Aufholregel: Wer bei Welle 5 nicht beide Teile hat, kann bei Welle 10 mit
// Stufe 1 starten; danach bleibt bei Welle 15 nur noch Stufe 2. Ein
// verschlafener Meilenstein kostet also eine Stufe, nicht die ganze Linie.

export const SCHEMA = 'wbn-stadtgeschichte/1';

const get = (byId, id) => (byId instanceof Map ? byId.get(id) : byId[id]);

export function evoId(lineId, tier) {
  return 'evo_' + lineId + '_' + tier;
}

export function emptyState() {
  return { owned: {}, levels: {} };
}

/** Prueft die Daten einer Linien-Datei gegen Item-Katalog und Stat-Schluessel. */
export function validate(config, byId, statKeys) {
  const errors = [];
  if (!config || config.schema !== SCHEMA) errors.push('schema muss ' + SCHEMA + ' sein');
  const ms = config && config.milestones;
  if (!Array.isArray(ms) || ms.length !== 3 || ms.some((w, i) => !Number.isInteger(w) || (i > 0 && w <= ms[i - 1]))) {
    errors.push('milestones muessen drei aufsteigende Wellen sein');
  }
  const lines = (config && config.lines) || [];
  if (!lines.length) errors.push('mindestens eine Linie noetig');
  const ids = new Set();
  const usedParts = new Set();
  for (const line of lines) {
    if (!line.id || ids.has(line.id)) errors.push('Linien-ID fehlt oder doppelt: ' + line.id);
    ids.add(line.id);
    if (!Array.isArray(line.parts) || line.parts.length !== 2 || line.parts[0] === line.parts[1]) {
      errors.push(line.id + ': genau zwei verschiedene Teile noetig');
      continue;
    }
    for (const p of line.parts) {
      if (!get(byId, p)) errors.push(line.id + ': Teil ' + p + ' fehlt im Katalog');
      if (usedParts.has(p)) errors.push('Teil ' + p + ' ist in mehreren Linien');
      usedParts.add(p);
    }
    if (!Array.isArray(line.tiers) || line.tiers.length !== 3) {
      errors.push(line.id + ': genau drei Stufen noetig');
      continue;
    }
    line.tiers.forEach((t, i) => {
      if (!t.name) errors.push(line.id + ': Stufe ' + (i + 1) + ' ohne Namen');
      if (!(t.premium >= 0)) errors.push(line.id + ': Stufe ' + (i + 1) + ' ohne Aufpreis');
      if (!t.stats || typeof t.stats !== 'object') errors.push(line.id + ': Stufe ' + (i + 1) + ' ohne Stats');
      for (const k of Object.keys(t.stats || {})) {
        if (!statKeys.includes(k)) errors.push(line.id + ': unbekannter Stat ' + k);
      }
    });
  }
  return errors;
}

/** Summierte Stats der Linie auf Stufe 1..3 (Basisteile + Stufenbonus). */
export function tierStats(line, tier, byId) {
  if (!(tier >= 1 && tier <= 3)) throw new RangeError('tier muss 1..3 sein');
  const out = {};
  for (const p of line.parts) {
    const item = get(byId, p);
    if (!item) throw new Error('Teil fehlt im Katalog: ' + p);
    for (const [k, v] of Object.entries(item.stats || {})) out[k] = (out[k] || 0) + v;
  }
  const t = line.tiers[tier - 1];
  for (const [k, v] of Object.entries(t.stats || {})) out[k] = (out[k] || 0) + v;
  return out;
}

/** Preis der Evolutionsstufe: Summe der Basisteile plus Stufenaufpreis. */
export function tierCost(line, tier, byId) {
  let cost = 0;
  for (const p of line.parts) cost += (get(byId, p) || {}).price || 0;
  return cost + line.tiers[tier - 1].premium;
}

/**
 * Wendet die Evolution fuer eine Welle an. Reine Funktion: der Eingabezustand
 * bleibt unveraendert, Rueckgabe ist ein neuer Zustand plus Ereignisliste.
 */
export function evolve(state, wave, config, byId) {
  const out = {
    owned: Object.assign({}, state.owned),
    levels: Object.assign({}, state.levels),
  };
  const events = [];
  if (!config.milestones.includes(wave)) return { state: out, events };

  const lines = [...config.lines].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const line of lines) {
    const level = out.levels[line.id] || 0;
    if (level >= 3) continue;
    const need = level === 0 ? line.parts.slice() : [evoId(line.id, level)];
    if (!need.every((id) => (out.owned[id] || 0) >= 1)) continue;
    for (const id of need) {
      out.owned[id] -= 1;
      if (out.owned[id] === 0) delete out.owned[id];
    }
    const tier = level + 1;
    const gained = evoId(line.id, tier);
    out.owned[gained] = (out.owned[gained] || 0) + 1;
    out.levels[line.id] = tier;
    events.push({
      lineId: line.id,
      tier,
      name: line.tiers[tier - 1].name,
      consumed: need,
      gained,
      stats: tierStats(line, tier, byId),
      cost: tierCost(line, tier, byId),
    });
  }
  return { state: out, events };
}
