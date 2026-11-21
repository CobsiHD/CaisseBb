// stats.js — les chiffres du tableau de bord, calculés sur les notes encaissées.
//
// Aucune donnée n'est stockée pour ça : tout se relit sur les notes (`orders`)
// que la caisse garde une fois payées. Fonctions pures — on leur passe les
// notes et les produits, elles ne lisent pas l'état global — pour pouvoir les
// vérifier sans navigateur.
//
// Une journée va de 6 h à 6 h, comme en cuisine : une note encaissée à 1 h du
// matin appartient à la soirée de la veille.
import { lineUnit, lineTotal, lineBilledQty, orderTotal } from './state.js';

const H6 = 6 * 3600 * 1000;
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Le jour de service d'un instant, à minuit (heure locale). */
const jourDe = (ts) => { const d = new Date(ts - H6); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const a6h = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6).getTime();
const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const PERIODES = [
  ['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois'], ['tout', 'Tout'],
];

/**
 * Les bornes d'une période. `decalage` recule dans le temps : 0 = en cours,
 * -1 = la précédente. Renvoie { debut, fin, label, precedent } (fin exclue).
 */
export function periode(type, decalage = 0, now = Date.now()) {
  const j = jourDe(now);
  if (type === 'jour') {
    const d = plus(j, decalage);
    return { debut: a6h(d), fin: a6h(plus(d, 1)), precedent: 'la veille',
      label: decalage === 0 ? `Aujourd’hui · ${JOURS_LONGS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
        : `${JOURS_LONGS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}` };
  }
  if (type === 'semaine') {
    const lundi = plus(j, -((j.getDay() + 6) % 7) + 7 * decalage);
    const dim = plus(lundi, 6);
    return { debut: a6h(lundi), fin: a6h(plus(lundi, 7)), precedent: 'la semaine d’avant',
      label: `Semaine du ${lundi.getDate()} ${MOIS_COURTS[lundi.getMonth()]} au ${dim.getDate()} ${MOIS_COURTS[dim.getMonth()]} ${dim.getFullYear()}` };
  }
  if (type === 'mois') {
    const d = new Date(j.getFullYear(), j.getMonth() + decalage, 1);
    return { debut: a6h(d), fin: a6h(new Date(d.getFullYear(), d.getMonth() + 1, 1)), precedent: 'le mois d’avant',
      label: `${MOIS[d.getMonth()]} ${d.getFullYear()}` };
  }
  return { debut: 0, fin: Infinity, precedent: null, label: 'Depuis la mise en service' };
}

const payees = (orders) => orders.filter((o) => o.status === 'paid' && o.paidAt && (o.items || []).length);
export const dans = (orders, p) => payees(orders).filter((o) => o.paidAt >= p.debut && o.paidAt < p.fin);

/** Les chiffres clés d'un lot de notes encaissées. */
export function resume(notes) {
  let ca = 0, articles = 0, offerts = 0, duree = 0, nDuree = 0;
  for (const o of notes) {
    ca += orderTotal(o);
    for (const it of o.items) {
      articles += it.qty || 0;
      // 1 + 1 : ce qui a été servi sans être facturé.
      if (it.hh) offerts += lineUnit(it) * ((it.qty || 0) - lineBilledQty(it));
    }
    // Une note laissée ouverte toute la nuit fausserait la moyenne.
    const d = o.paidAt - (o.createdAt || o.paidAt);
    if (d > 0 && d < 8 * 3600 * 1000) { duree += d; nDuree++; }
  }
  return {
    ca, notes: notes.length, articles, offerts,
    moyen: notes.length ? ca / notes.length : 0,
    duree: nDuree ? duree / nDuree / 60000 : 0,   // minutes
  };
}

/** Évolution en % par rapport à une valeur de référence ; null si rien à comparer. */
export const evolution = (v, ref) => (ref > 0 ? ((v - ref) / ref) * 100 : null);

// ── Répartitions ─────────────────────────────────────────────
function cumule(map, cle, ca, qte = 0) {
  const e = map.get(cle) || { label: cle, ca: 0, qte: 0 };
  e.ca += ca; e.qte += qte; map.set(cle, e);
}
const tri = (map, par = 'ca') => [...map.values()].sort((a, b) => b[par] - a[par] || b.ca - a.ca);

/** Les produits les plus vendus (par quantité), un format = une ligne. */
export function topProduits(notes, n = 10) {
  const m = new Map();
  for (const o of notes) for (const it of o.items) {
    cumule(m, it.variantLabel ? `${it.name} · ${it.variantLabel}` : it.name, lineTotal(it), it.qty || 0);
  }
  return tri(m, 'qte').slice(0, n);
}

/** Le chiffre par famille. Un produit retiré de la carte tombe dans « Hors carte ». */
export function parFamille(notes, products, categories) {
  const famille = new Map(products.map((p) => [p.id, p.categoryId]));
  const nom = new Map(categories.map((c) => [c.id, c.name]));
  const m = new Map();
  for (const o of notes) for (const it of o.items) {
    cumule(m, nom.get(famille.get(it.productId)) || 'Hors carte', lineTotal(it), it.qty || 0);
  }
  return tri(m);
}

export function parZone(notes, nomZone) {
  const m = new Map();
  for (const o of notes) cumule(m, nomZone(o.area) || 'Sans zone', orderTotal(o), 1);
  return tri(m);
}

// ── Séries dans le temps ─────────────────────────────────────
// Chaque point : { label, long, ca, notes }.
const point = (label, long) => ({ label, long, ca: 0, notes: 0 });
const ajoute = (pt, o) => { if (pt) { pt.ca += orderTotal(o); pt.notes++; } };

// Heures de service, à partir de 6 h. On ne garde que la plage où il se passe
// quelque chose, sinon dix-huit colonnes vides écrasent les six qui comptent.
function heures(notes) {
  const pts = Array.from({ length: 24 }, (_, i) => point(`${(6 + i) % 24} h`, `de ${(6 + i) % 24} h à ${(7 + i) % 24} h`));
  for (const o of notes) ajoute(pts[(new Date(o.paidAt).getHours() + 18) % 24], o);
  let a = pts.findIndex((p) => p.ca > 0), b = pts.length - 1 - [...pts].reverse().findIndex((p) => p.ca > 0);
  if (a < 0) { a = 11; b = 19; }   // rien encore : 17 h → 2 h, les heures du bar
  return pts.slice(Math.max(0, a - 1), Math.min(24, b + 2));
}

/** Le chiffre dans le temps, au grain qui convient à la période. */
export function serie(type, p, notes, now = Date.now()) {
  if (type === 'jour') return { titre: 'Chiffre par heure', points: heures(notes) };

  if (type === 'tout') {
    if (!notes.length) return { titre: 'Chiffre par mois', points: [] };
    const d0 = jourDe(Math.min(...notes.map((o) => o.paidAt))), d1 = jourDe(now);
    const pts = new Map();
    for (let d = new Date(d0.getFullYear(), d0.getMonth(), 1); d <= d1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      pts.set(`${d.getFullYear()}-${d.getMonth()}`, point(`${MOIS_COURTS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, `${MOIS[d.getMonth()]} ${d.getFullYear()}`));
    }
    for (const o of notes) { const d = jourDe(o.paidAt); ajoute(pts.get(`${d.getFullYear()}-${d.getMonth()}`), o); }
    return { titre: 'Chiffre par mois', points: [...pts.values()] };
  }

  const pts = new Map();
  const semaine = type === 'semaine';
  for (let d = jourDe(p.debut + H6); a6h(d) < p.fin; d = plus(d, 1)) {
    const long = `${JOURS_LONGS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
    pts.set(d.getTime(), point(semaine ? `${JOURS[d.getDay()]} ${d.getDate()}` : String(d.getDate()), long));
  }
  for (const o of notes) ajoute(pts.get(jourDe(o.paidAt).getTime()), o);
  return { titre: 'Chiffre par jour', points: [...pts.values()] };
}

/** À quelles heures tombe le chiffre, toutes journées confondues. */
export const parHeure = (notes) => heures(notes);

/** Quels jours de la semaine font le chiffre (lundi d'abord). */
export function parJourDeSemaine(notes) {
  const pts = [1, 2, 3, 4, 5, 6, 0].map((j) => ({ j, ...point(JOURS[j], JOURS_LONGS[j]) }));
  for (const o of notes) ajoute(pts.find((p) => p.j === jourDe(o.paidAt).getDay()), o);
  return pts;
}
