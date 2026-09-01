#!/usr/bin/env node
// print-agent.js — imprime les bons de cuisine sur l'imprimante thermique.
//
// Tourne sur le Raspberry Pi de la cuisine, sans surveillance. Il interroge le
// serveur de la caisse, imprime les nouveaux bons, et renvoie un accusé que les
// iPads affichent sous chaque bon (« imprimé à 21:34 » ou l'erreur).
//
// Il n'a QUE le rôle « agent » côté serveur : il lit les bons, il écrit ses
// accusés, et rien d'autre — ni la carte, ni les notes, ni le chiffre d'affaires.
//
// Variables d'environnement :
//   CAISSE_URL       ex. https://caisse.bluebird-bar.fr        (obligatoire)
//   AGENT_PASSWORD   mot de passe du rôle agent                (obligatoire)
//   PRINTER          usb:/dev/usb/lp0 | tcp:192.168.1.50:9100 | file:/tmp/bon.txt
//   STATE_FILE       défaut /var/lib/caisse-print/state.json
//   POLL_MS          défaut 3000
//   WIDTH            colonnes du papier : 42 (80 mm) ou 32 (58 mm). Défaut 42.
//   CUT              'partiel' (défaut), 'complet' ou 'non' si pas de massicot.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const URL_BASE = (process.env.CAISSE_URL || '').replace(/\/$/, '');
const PASSWORD = process.env.AGENT_PASSWORD || '';
const PRINTER = process.env.PRINTER || 'usb:/dev/usb/lp0';
const STATE_FILE = process.env.STATE_FILE || '/var/lib/caisse-print/state.json';
const POLL_MS = Number(process.env.POLL_MS || 3000);
const WIDTH = Number(process.env.WIDTH || 42);
const CUT = process.env.CUT || 'partiel';

if (!URL_BASE || !PASSWORD) {
  console.error('CAISSE_URL et AGENT_PASSWORD sont obligatoires.');
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── État local ──────────────────────────────────────────────────────────────
// L'agent ne peut PAS relire la table `prints` (le serveur ne lui donne que les
// bons) : il doit donc se souvenir tout seul de ce qu'il a imprimé.
// `tickets` est conservé sur disque avec le reste : `lastRev` avance, donc un
// redémarrage ne re-télécharge pas les bons déjà vus. Sans ce cache, un bon
// tombé pendant une panne d'imprimante serait perdu au relancement.
let state = { baseline: 0, lastRev: 0, printed: {}, tickets: {} };
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
} catch {
  // Première mise en route : on ne déverse pas le service déjà écoulé sur le
  // papier. Les bons antérieurs restent « en attente » côté caisse, et le
  // bouton 🖨 de l'écran Cuisine permet de les réclamer un par un.
  state.baseline = Date.now();
  log(`premier démarrage : les bons antérieurs ne seront pas imprimés automatiquement`);
}

// Au-delà d'une journée, un bon n'a plus de raison d'être réimprimé : on élague
// pour que le fichier d'état ne grossisse pas indéfiniment.
const GARDE_MS = 24 * 3600 * 1000;

function prune() {
  const limite = Date.now() - GARDE_MS;
  for (const [id, t] of Object.entries(state.tickets)) {
    if ((t.createdAt || 0) < limite) { delete state.tickets[id]; delete state.printed[id]; }
  }
}

function saveState() {
  try {
    prune();
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    log('état non sauvegardé :', e.message);
  }
}

// ── Serveur de la caisse ────────────────────────────────────────────────────
let token = null;

async function login() {
  const res = await fetch(`${URL_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login HTTP ${res.status}`);
  const r = await res.json();
  if (r.role !== 'agent') throw new Error(`rôle inattendu « ${r.role} » : utilise le mot de passe agent, pas celui du bar`);
  token = r.token;
  log('connecté au serveur (rôle agent)');
}

async function api(path, opts = {}) {
  if (!token) await login();
  const call = () => fetch(URL_BASE + path, {
    ...opts,
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
    },
  });
  let res = await call();
  if (res.status === 401) { token = null; await login(); res = await call(); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Accusé renvoyé aux iPads : c'est ce qui s'affiche sous le bon en cuisine. */
async function ack(ticketId, printedAt, error) {
  await api('/api/push', {
    method: 'POST',
    body: JSON.stringify({
      clientId: 'agent-impression',
      ops: [{ op: 'put', table: 'prints', value: { id: String(ticketId), printedAt, error: error || null } }],
    }),
  });
}

// ── Encodage du texte ───────────────────────────────────────────────────────
// Les imprimantes thermiques ne parlent pas UTF-8 : on passe en page de codes
// 858 (latin occidental + €), et tout ce qui n'y figure pas est translittéré
// plutôt que rendu en charabia.
const CP858 = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'ç': 0x87,
  'ê': 0x88, 'ë': 0x89, 'è': 0x8A, 'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D, 'Ä': 0x8E,
  'É': 0x90, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'ÿ': 0x98,
  'Ö': 0x99, 'Ü': 0x9A, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4,
  '«': 0xAE, '»': 0xAF, 'Â': 0xB6, 'À': 0xB7, 'ã': 0xC6, 'Ã': 0xC7, 'Ê': 0xD2,
  'Ë': 0xD3, 'È': 0xD4, '€': 0xD5, 'Í': 0xD6, 'Î': 0xD7, 'Ï': 0xD8, 'Ô': 0xE2,
  'Ò': 0xE3, 'Õ': 0xE4, 'Ù': 0xEB, 'Û': 0xEA, '°': 0xF8, '·': 0xFA,
};

function encode(text) {
  const out = [];
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code < 0x80) { out.push(code); continue; }
    if (CP858[ch] != null) { out.push(CP858[ch]); continue; }
    // Dernier recours : on retire l'accent plutôt que d'imprimer un caractère faux.
    const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const c of plain) out.push(c.codePointAt(0) < 0x80 ? c.codePointAt(0) : 0x3F);
  }
  return Buffer.from(out);
}

// ── Mise en page du bon (ESC/POS) ───────────────────────────────────────────
const ESC = 0x1B, GS = 0x1D;
const cmd = (...bytes) => Buffer.from(bytes);

const INIT      = cmd(ESC, 0x40);              // réinitialise l'imprimante
const CODEPAGE  = cmd(ESC, 0x74, 19);          // page de codes 858
const LEFT      = cmd(ESC, 0x61, 0);
const CENTER    = cmd(ESC, 0x61, 1);
const BOLD_ON   = cmd(ESC, 0x45, 1);
const BOLD_OFF  = cmd(ESC, 0x45, 0);
const NORMAL    = cmd(GS, 0x21, 0x00);         // taille 1×1
const BIG       = cmd(GS, 0x21, 0x11);         // 2× en largeur et en hauteur
const TALL      = cmd(GS, 0x21, 0x01);         // 2× en hauteur seulement

function cutCmd() {
  if (CUT === 'non') return Buffer.alloc(0);
  return cmd(GS, 0x56, CUT === 'complet' ? 0x00 : 0x01);
}

const line = (ch = '-') => ch.repeat(WIDTH);
const heure = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Préfixe toutes les lignes (l'indentation ne peut pas passer par `wrap`,
 *  qui normalise les espaces). */
const pad = (rows, prefix) => rows.map((r) => prefix + r);

/** Coupe un texte trop long en plusieurs lignes, sans casser les mots.
 *  `indent` ne s'applique qu'aux lignes de continuation. */
function wrap(text, width, indent = '') {
  const words = String(text).split(/\s+/).filter(Boolean);
  const rows = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > width && cur) { rows.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) rows.push(cur);
  return rows.map((r, i) => (i === 0 ? r : indent + r));
}

function render(ticket, isReprint) {
  const parts = [INIT, CODEPAGE];
  const txt = (s) => parts.push(encode(s));

  parts.push(CENTER, BOLD_ON, BIG);
  txt(`#${ticket.num}\n`);
  parts.push(NORMAL, BOLD_OFF);

  if (isReprint) { parts.push(BOLD_ON); txt('** REIMPRESSION **\n'); parts.push(BOLD_OFF); }

  parts.push(TALL, BOLD_ON);
  txt(`${ticket.place || 'Sur place'}\n`);
  parts.push(NORMAL, BOLD_OFF);

  if (ticket.from) txt(`envoyé par ${ticket.from}\n`);
  txt(`${heure(ticket.createdAt)}\n`);

  parts.push(LEFT);
  txt(line('=') + '\n');

  for (const it of ticket.items || []) {
    // La quantité et le nom en grand : c'est ce que le cuisinier lit de loin.
    parts.push(BOLD_ON, TALL);
    const head = wrap(`${it.qty}x ${it.name}${it.variantLabel ? ' ' + it.variantLabel : ''}`, Math.floor(WIDTH / 2) - 1, '   ');
    txt(head.join('\n') + '\n');
    parts.push(NORMAL, BOLD_OFF);

    for (const o of it.options || []) {
      txt(pad(wrap(`+ ${o}`, WIDTH - 3, '  '), '   ').join('\n') + '\n');
    }
    if (it.note) {
      parts.push(BOLD_ON);
      txt(pad(wrap(`<< ${it.note} >>`, WIDTH - 3, '  '), '   ').join('\n') + '\n');
      parts.push(BOLD_OFF);
    }
    txt('\n');
  }

  txt(line('=') + '\n');
  parts.push(CENTER);
  txt('Bluebird\n');
  parts.push(LEFT);
  txt('\n\n\n\n');
  parts.push(cutCmd());

  return Buffer.concat(parts);
}

// ── Sorties possibles ───────────────────────────────────────────────────────
function sendToPrinter(buf) {
  const [kind, ...rest] = PRINTER.split(':');
  const target = rest.join(':');

  if (kind === 'tcp') {
    const [host, port] = target.split(':');
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port: Number(port) || 9100 });
      const fail = (e) => { sock.destroy(); reject(e); };
      sock.setTimeout(10000, () => fail(new Error('imprimante injoignable (délai dépassé)')));
      sock.on('error', fail);
      sock.on('connect', () => sock.end(buf, () => resolve()));
      sock.on('close', () => resolve());
    });
  }

  // usb: et file: écrivent tous deux dans un fichier — /dev/usb/lp0 en est un.
  return fs.promises.appendFile(target, buf);
}

// ── Boucle ──────────────────────────────────────────────────────────────────
/** Faut-il imprimer ce bon, et est-ce une réimpression ?
 *
 *  Attention : une tentative ratée laisse une trace SANS `printedAt`. Il faut la
 *  distinguer d'une impression réussie, sinon un bon tombé pendant une panne
 *  d'imprimante ne ressortirait jamais au rallumage. */
function toPrint(t) {
  const done = state.printed[t.id];

  // Déjà sorti sur le papier : seule une demande de réimpression le refait sortir.
  if (done?.printedAt) {
    return { print: (t.reprintAt || 0) > (done.reprintAt || 0), reprint: true };
  }
  // Tentative précédente en échec : on retente (la temporisation est vue par l'appelant).
  if (done) return { print: true, reprint: false };

  // Jamais vu. Une demande explicite (bouton 🖨 de l'écran Cuisine) prime sur la
  // règle du premier démarrage : si on réclame un bon, il doit sortir.
  if (t.reprintAt) return { print: true, reprint: true };

  // Sinon, au tout premier démarrage, on n'imprime pas le service déjà écoulé.
  return { print: t.createdAt >= state.baseline, reprint: false };
}

async function printTicket(t, isReprint) {
  await sendToPrinter(render(t, isReprint));
  const now = Date.now();
  state.printed[t.id] = { printedAt: now, reprintAt: t.reprintAt || 0, fails: 0 };
  saveState();
  await ack(t.id, now, null);
  log(`bon #${t.num} (${t.place})${isReprint ? ' — réimpression' : ''} imprimé`);
}

async function onFailure(t, err) {
  const prev = state.printed[t.id] || { printedAt: null, reprintAt: 0, fails: 0 };
  prev.fails = (prev.fails || 0) + 1;
  // Attente croissante, plafonnée : une imprimante hors tension ne doit pas
  // saturer le journal ni le réseau, mais doit repartir seule au rallumage.
  prev.nextTry = Date.now() + Math.min(60000, 2000 * 2 ** Math.min(prev.fails, 5));
  state.printed[t.id] = prev;
  saveState();
  log(`bon #${t.num} : ${err.message} (essai ${prev.fails})`);
  // On ne réécrit l'accusé d'erreur qu'une fois : les iPads l'affichent déjà.
  if (prev.fails === 1) { try { await ack(t.id, null, err.message); } catch {} }
}

async function poll() {
  const { rev, changes } = await api(`/api/pull?since=${state.lastRev}`);
  for (const row of (changes && changes.tickets) || []) {
    if (row.deleted) { delete state.tickets[row.id]; delete state.printed[row.id]; }
    else if (row.data) state.tickets[row.id] = row.data;
  }
  if (rev !== state.lastRev) { state.lastRev = rev; saveState(); }

  // Les plus anciens d'abord : c'est l'ordre dans lequel il faut cuisiner.
  const pending = Object.values(state.tickets).sort((a, b) => a.createdAt - b.createdAt);
  for (const t of pending) {
    const { print, reprint } = toPrint(t);
    if (!print) continue;
    const waiting = state.printed[t.id]?.nextTry || 0;
    if (waiting > Date.now()) continue;
    try { await printTicket(t, reprint); }
    catch (e) { await onFailure(t, e); }
  }
}

async function main() {
  log(`agent d'impression — serveur ${URL_BASE}, sortie ${PRINTER}, ${WIDTH} colonnes`);
  for (;;) {
    try { await poll(); }
    catch (e) { log('cycle en échec :', e.message); token = null; }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { saveState(); process.exit(0); });
}

main();
