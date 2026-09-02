// kitchen.js — envoi des lignes « bouffe » du 22 vers la cuisine du Bluebird.
//
// Une ligne part en cuisine quand le serveur touche « Envoyer » : on ne transmet
// que les quantités pas encore envoyées (item.sent), pour qu'un ajout ultérieur
// sur la même note ne réimprime pas ce qui est déjà en train de cuire.
import { state, emit, productById, lineUnit } from './state.js';
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

// Lignes pas encore imprimées, bouffe ET boissons. Renvoie [{ item, qty }].
// `item.sent` compte ce qui est déjà parti sur un bon : réimprimer une note à
// laquelle on vient d'ajouter un verre ne doit pas refaire toute la commande,
// sinon le barman remonte deux cocktails et la cuisine recuit les frites.
export function unsentItems(items) {
  return (items || [])
    .map((item) => ({ item, qty: (item.qty || 0) - (item.sent || 0) }))
    .filter((x) => x.qty > 0);
}

export function unsentCount(items) {
  return unsentItems(items).reduce((s, x) => s + x.qty, 0);
}

// ── Tickets ─────────────────────────────────────────────────────────────────
// Un bon porte la commande telle qu'elle est partie à l'impression, coupée en
// deux blocs : BOISSONS puis CUISINE. Il entre dans la file de la cuisine dès
// qu'il porte une ligne à cuire ; un bon de boissons seules ne fait que sortir
// du papier. Les bons d'avant cette version n'ont pas de blocs : c'étaient des
// bons de cuisine, ils le restent.
export function hasCuisineLines(t) {
  return (t?.items || []).some((l) => (l.section || 'cuisine') === 'cuisine');
}

export function ticketsOfDay(now = Date.now()) {
  const from = serviceDayStart(now);
  return state.tickets
    .filter((t) => t.createdAt >= from)
    .sort((a, b) => a.createdAt - b.createdAt);
}
// Ce que la cuisine doit cuisiner — un bon de boissons n'encombre ni la liste,
// ni la pastille de l'onglet, ni la sonnerie. Une réimpression non plus : c'est
// le même plat, sorti une seconde fois sur du papier, pas une nouvelle commande.
export function kitchenTicketsOfDay(now = Date.now()) {
  return ticketsOfDay(now).filter((t) => hasCuisineLines(t) && !t.reprint);
}
export function openTickets() {
  return kitchenTicketsOfDay().filter((t) => t.status !== 'servi');
}
export function newTicketCount() {
  return kitchenTicketsOfDay().filter((t) => t.status === 'nouveau').length;
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
// Le prix porte sur la quantité imprimée : sur un bon partiel, le total du
// papier est celui de ce papier-là.
function lineOf(item, qty, section) {
  return {
    name: item.name,
    variantLabel: item.variantLabel || '',
    qty,
    options: (item.options || []).map((o) => o.label),
    note: item.note || '',
    section,
    unit: lineUnit(item),
    total: lineUnit(item) * (item.hh ? Math.ceil(qty / 2) : qty),
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
    kind: 'commande',
    // Titre imprimé en tête du bon papier ; l'agent retombe sur « BON n » s'il
    // ne le connaît pas encore.
    title: 'BON DE COMMANDE',
    total: meta.total ?? null,
    // Une réimpression sort le même papier sans repasser commande.
    reprint: !!meta.reprint,
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

// ── Bon de commande ─────────────────────────────────────────────────────────
// Le seul geste du service : imprimer. Un bon part, et s'il porte de la bouffe
// il entre du même coup dans la file de la cuisine — un seul papier, une seule
// entrée, pas de double préparation.
//
// Par défaut on n'imprime que ce qui n'est pas encore parti : rajouter un verre
// sur une note déjà imprimée n'imprime que ce verre. `reprint: true` ressort la
// commande entière — bourrage papier, ticket perdu — sans rien marquer et sans
// rentrer en cuisine : le plat est déjà commandé.
//
// Une commande mélange presque toujours boissons et bouffe, et deux métiers la
// lisent : le bon est coupé en deux blocs — BOISSONS puis CUISINE — sur le même
// papier. Le barman lit le haut, la cuisine le bas.
export async function printTicket(items, meta = {}, { reprint = false } = {}) {
  const pending = reprint
    ? (items || []).filter((it) => (it.qty || 0) > 0).map((item) => ({ item, qty: item.qty }))
    : unsentItems(items);
  if (!pending.length) return null;

  const lines = [
    ...pending.filter(({ item }) => !isCuisineItem(item)).map(({ item, qty }) => lineOf(item, qty, 'boissons')),
    ...pending.filter(({ item }) => isCuisineItem(item)).map(({ item, qty }) => lineOf(item, qty, 'cuisine')),
  ];
  const total = lines.reduce((s, l) => s + l.total, 0);

  const ticket = await createTicket(lines, { ...meta, total, reprint });

  // On ne marque les lignes comme parties qu'une fois le bon enregistré : si
  // l'écriture échoue, rien n'est perdu et le serveur peut réimprimer.
  if (ticket && !reprint) for (const { item } of pending) item.sent = item.qty;

  return ticket;
}

// Alerte les nouveaux bons apparus depuis le dernier passage. Appelé à chaque
// changement de la table `tickets`, quelle que soit la vue affichée.
let seenNew = null;
export function notifyNewTickets() {
  const ids = new Set(kitchenTicketsOfDay().filter((t) => t.status === 'nouveau').map((t) => t.id));
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
