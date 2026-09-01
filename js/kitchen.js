// kitchen.js — envoi des lignes « bouffe » du 22 vers la cuisine du Bluebird.
//
// Une ligne part en cuisine quand le serveur touche « Envoyer » : on ne transmet
// que les quantités pas encore envoyées (item.sent), pour qu'un ajout ultérieur
// sur la même note ne réimprime pas ce qui est déjà en train de cuire.
import { state, emit, productById } from './state.js';
import * as store from './store.js';
import { senderLabel } from './profile.js';

export const STATUS = {
  nouveau:  { label: 'Nouveau',  next: 'en-cours', nextLabel: 'Je prends' },
  'en-cours': { label: 'En cours', next: 'pret',   nextLabel: 'Prêt' },
  pret:     { label: 'Prêt',     next: 'servi',    nextLabel: 'Servi' },
  servi:    { label: 'Servi',    next: null,       nextLabel: null },
};

// Journée de service : elle démarre à 6 h, pour qu'un service qui déborde après
// minuit reste rattaché à la soirée de la veille.
export function serviceDayStart(now = Date.now()) {
  const d = new Date(now);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  d.setHours(6, 0, 0, 0);
  return d.getTime();
}

// ── Qu'est-ce qui part en cuisine ? ─────────────────────────────────────────
// Le drapeau vit sur la famille ; un produit peut le forcer ou l'annuler.
export function isCuisineProduct(product) {
  if (!product) return false;
  if (typeof product.cuisine === 'boolean') return product.cuisine;
  return !!state.categories.find((c) => c.id === product.categoryId)?.cuisine;
}

// Les produits qui partent en cuisine, dans l'ordre de la carte : c'est le pavé
// de touches de l'écran Cuisine.
export function cuisineProducts() {
  return state.products
    .filter((p) => p.available !== false && isCuisineProduct(p))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// `item.cuisine` est figé à l'ajout : un ticket déjà parti ne doit pas changer
// de nature parce qu'on a modifié le catalogue entre-temps.
export function isCuisineItem(item) {
  if (typeof item?.cuisine === 'boolean') return item.cuisine;
  return isCuisineProduct(productById(item?.productId));
}

// Lignes bouffe dont tout n'est pas encore parti. Renvoie [{ item, qty }].
export function pendingItems(order) {
  if (!order) return [];
  return (order.items || [])
    .filter(isCuisineItem)
    .map((item) => ({ item, qty: (item.qty || 0) - (item.sent || 0) }))
    .filter((x) => x.qty > 0);
}

export function pendingCount(order) {
  return pendingItems(order).reduce((s, x) => s + x.qty, 0);
}

// ── Tickets ─────────────────────────────────────────────────────────────────
export function ticketsOfDay(now = Date.now()) {
  const from = serviceDayStart(now);
  return state.tickets
    .filter((t) => t.createdAt >= from)
    .sort((a, b) => a.createdAt - b.createdAt);
}
export function openTickets() {
  return ticketsOfDay().filter((t) => t.status !== 'servi');
}
export function newTicketCount() {
  return ticketsOfDay().filter((t) => t.status === 'nouveau').length;
}

async function saveTicket(ticket) {
  const id = await store.put('tickets', ticket);
  if (ticket.id == null) ticket.id = id;
  const i = state.tickets.findIndex((t) => t.id === ticket.id);
  if (i >= 0) state.tickets[i] = ticket; else state.tickets.push(ticket);
  emit('tickets');
  return ticket;
}

// ── Impression ──────────────────────────────────────────────────────────────
// L'agent du Pi écrit dans `prints`, jamais dans `tickets`. Ici on ne fait que
// lire son accusé, et demander une réimpression en marquant le bon côté iPad.
export function printOf(ticket) {
  return state.prints.find((p) => p.id === ticket.id) || null;
}

export function printState(ticket) {
  const p = printOf(ticket);
  const demande = ticket.reprintAt || 0;
  if (!p || (!p.printedAt && !p.error)) return { cls: 'wait', txt: 'impression en attente' };
  if (p.error) return { cls: 'err', txt: `impression : ${p.error}` };
  if (demande > p.printedAt) return { cls: 'wait', txt: 'réimpression demandée' };
  const t = new Date(p.printedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return { cls: 'ok', txt: `imprimé à ${t}` };
}

export async function requestReprint(ticket) {
  ticket.reprintAt = Date.now();
  return saveTicket(ticket);
}

export async function setTicketStatus(ticket, status) {
  ticket.status = status;
  ticket.statusAt = Date.now();
  return saveTicket(ticket);
}

// Une ligne de bon, telle qu'elle sera lue en cuisine et imprimée.
function lineOf(item, qty) {
  return {
    name: item.name,
    variantLabel: item.variantLabel || '',
    qty,
    options: (item.options || []).map((o) => o.label),
    note: item.note || '',
  };
}

// Construit et enregistre le bon. `place` est le libellé lisible en cuisine
// (« Table 12 », « Comptoir »), calculé par l'appelant qui connaît le contexte.
async function createTicket(lines, meta = {}) {
  if (!lines.length) return null;
  const ticket = {
    // Numéro de service, court et lisible sur le bon papier. Deux iPads qui
    // envoient dans la même seconde peuvent tomber sur le même numéro : c'est
    // cosmétique, l'identité réelle du bon est son id unique.
    num: ticketsOfDay().length + 1,
    orderId: meta.orderId ?? null,
    tableId: meta.tableId ?? null,
    place: meta.place || 'Sur place',
    area: meta.area || null,
    // Qui a envoyé : la cuisine doit savoir à qui rendre le plat, et le bon
    // papier le portera. C'est le profil de l'appareil (Bluebird ou Le 22).
    from: senderLabel(),
    items: lines,
    createdAt: Date.now(),
    status: 'nouveau',
    statusAt: Date.now(),
    // Renseignés par l'agent d'impression sur le Raspberry Pi, plus tard.
    printedAt: null,
    printError: null,
  };
  await saveTicket(ticket);
  return ticket;
}

// Envoi depuis une note ouverte : seules les quantités pas encore parties.
export async function sendToKitchen(order, place) {
  const pending = pendingItems(order);
  if (!pending.length) return null;

  const ticket = await createTicket(
    pending.map(({ item, qty }) => lineOf(item, qty)),
    { orderId: order.id ?? null, tableId: order.tableId ?? null, place, area: order.area || null },
  );

  // On ne marque les lignes comme envoyées qu'après l'enregistrement du bon :
  // si l'écriture échoue, rien n'est perdu et le serveur peut renvoyer.
  if (ticket) for (const { item } of pending) item.sent = item.qty;

  return ticket;
}

// Envoi d'une sélection libre — comptoir, ou pavé de touches de l'écran Cuisine.
// Il n'y a ni note ni table derrière : le bon part tel quel.
export async function sendSelectionToKitchen(selection, place = 'Comptoir') {
  const pending = (selection || [])
    .filter(isCuisineItem)
    .map((item) => ({ item, qty: (item.qty || 0) - (item.sent || 0) }))
    .filter((x) => x.qty > 0);
  if (!pending.length) return null;

  const ticket = await createTicket(
    pending.map(({ item, qty }) => lineOf(item, qty)),
    { place },
  );
  if (ticket) for (const { item } of pending) item.sent = item.qty;
  return ticket;
}

// Alerte les nouveaux bons apparus depuis le dernier passage. Appelé à chaque
// changement de la table `tickets`, quelle que soit la vue affichée.
let seenNew = null;
export function notifyNewTickets() {
  const ids = new Set(ticketsOfDay().filter((t) => t.status === 'nouveau').map((t) => t.id));
  // Premier passage : on prend l'existant pour référence sans sonner.
  if (seenNew === null) { seenNew = ids; return false; }
  let fresh = false;
  for (const id of ids) if (!seenNew.has(id)) fresh = true;
  seenNew = ids;
  if (fresh) chime();
  return fresh;
}

// ── Alerte sonore ───────────────────────────────────────────────────────────
// Safari refuse de jouer un son tant que l'utilisateur n'a pas touché l'écran,
// et la permission retombe à chaque rechargement de la page. D'où la pastille
// « activer le son » dans l'écran cuisine.
let audio = null;

export function soundArmed() { return !!audio && audio.state === 'running'; }

export async function armSound() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    await audio.resume();
    return soundArmed();
  } catch {
    return false;
  }
}

export function chime() {
  if (!soundArmed()) return;
  const now = audio.currentTime;
  // Deux notes courtes : ça perce le bruit d'un bar sans faire sirène.
  [880, 1320].forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.35, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.18);
  });
}
