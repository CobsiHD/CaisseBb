#!/usr/bin/env node
// server.js — API de synchronisation de la caisse Bluebird.
//
// Rôle : garder une copie de référence des données (carte, plan, tuiles, notes)
// et la diffuser en temps réel à tous les iPads. Zéro dépendance npm.
//
// Variables d'environnement :
//   PORT             port d'écoute (défaut 8787)
//   DATA_DIR         dossier de la base JSON (défaut ./data)
//   CAISSE_PASSWORD  mot de passe partagé des iPads (obligatoire)
//   AGENT_PASSWORD   mot de passe de l'agent d'impression du Pi (facultatif).
//                    Ouvre un accès restreint : lecture des bons de cuisine,
//                    écriture des seuls accusés d'impression. Sans lui, aucun
//                    accès « agent » n'existe.
//   STATIC_DIR       si défini, sert aussi les fichiers de l'appli (dev / sans nginx)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const STATIC_DIR = process.env.STATIC_DIR || '';
const PASSWORD = process.env.CAISSE_PASSWORD || '';
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || '';

// Périmètre du rôle « agent » : le Raspberry Pi tourne sans surveillance dans un
// local technique. Il ne doit voir que les bons de cuisine, et ne pouvoir écrire
// que ses accusés — jamais la carte, les notes, le chiffre d'affaires ou le PIN.
const AGENT_READ = new Set(['tickets']);
const AGENT_WRITE = new Set(['prints']);
const TOKEN_TTL_MS = 180 * 24 * 3600 * 1000;

// Tables synchronisées et nom de leur clé primaire.
const TABLES = {
  categories: 'id',
  products: 'id',
  optiongroups: 'id',
  layout: 'id',
  tiles: 'id',
  orders: 'id',
  tickets: 'id',
  prints: 'id',
  settings: 'key',
};

if (!PASSWORD) {
  console.error('CAISSE_PASSWORD manquant : refus de démarrer sans mot de passe.');
  process.exit(1);
}
if (AGENT_PASSWORD && AGENT_PASSWORD === PASSWORD) {
  console.error('AGENT_PASSWORD identique à CAISSE_PASSWORD : le cloisonnement ne sert à rien.');
  process.exit(1);
}

// ── Base de données (un seul fichier JSON, tenu en mémoire) ──────────────────
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret');

fs.mkdirSync(DATA_DIR, { recursive: true });

let db = { rev: 0, tables: {} };
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch {
  // Premier démarrage : base vide, le premier iPad connecté l'initialisera.
}
for (const t of Object.keys(TABLES)) db.tables[t] ||= {};

// Secret de signature des jetons : généré une fois, conservé sur disque pour que
// les iPads restent connectés après un redémarrage du serveur.
let SECRET;
try {
  SECRET = fs.readFileSync(SECRET_FILE);
} catch {
  SECRET = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 });
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 200);
}
function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE); // remplacement atomique : jamais de fichier à moitié écrit
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { try { flush(); } catch {} process.exit(0); });
}

// Sauvegarde datée une fois par jour (garde les 14 dernières).
function dailyBackup() {
  try {
    const dir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const dest = path.join(dir, `db-${day}.json`);
    if (!fs.existsSync(dest)) {
      flush();
      fs.copyFileSync(DB_FILE, dest);
      const old = fs.readdirSync(dir).filter((f) => f.startsWith('db-')).sort();
      for (const f of old.slice(0, Math.max(0, old.length - 14))) fs.unlinkSync(path.join(dir, f));
    }
  } catch (e) { console.warn('backup', e.message); }
}
setInterval(dailyBackup, 3600 * 1000);
dailyBackup();

// ── Jetons d'authentification (signés, sans session en mémoire) ──────────────
function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(String(payload)).digest('base64url');
}
function makeToken(role = 'full') {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${role}.${exp}.${sign(`${role}.${exp}`)}`;
}

// Renvoie { role } si le jeton est valide, sinon null.
// Les jetons émis avant l'introduction des rôles n'ont que deux segments : ils
// restent acceptés en « full », pour ne pas déconnecter les iPads déjà en place.
function readToken(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  let role, exp, mac, payload;
  if (parts.length === 2) { [exp, mac] = parts; role = 'full'; payload = exp; }
  else if (parts.length === 3) { [role, exp, mac] = parts; payload = `${role}.${exp}`; }
  else return null;
  if (role !== 'full' && role !== 'agent') return null;
  if (!exp || !mac || !Number(exp) || Number(exp) < Date.now()) return null;
  const expected = sign(payload);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return { role };
}

function sameSecret(pw, secret) {
  const a = Buffer.from(String(pw ?? ''));
  const b = Buffer.from(secret);
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Abonnés temps réel (SSE) ────────────────────────────────────────────────
const clients = new Set();
function broadcast(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) { try { res.write(line); } catch {} }
}
setInterval(() => {
  for (const res of clients) { try { res.write(': ping\n\n'); } catch {} }
}, 25000);

// ── Lecture / écriture des données ──────────────────────────────────────────
function changesSince(since, only = null) {
  const out = {};
  for (const t of Object.keys(TABLES)) {
    if (only && !only.has(t)) continue;
    const rows = [];
    for (const [id, row] of Object.entries(db.tables[t])) {
      if (row.rev > since) rows.push({ id, rev: row.rev, deleted: !!row.deleted, data: row.data });
    }
    if (rows.length) out[t] = rows;
  }
  return out;
}

function applyOps(ops) {
  const touched = {};
  let changed = false;
  for (const op of ops || []) {
    const t = op.table;
    if (!TABLES[t]) continue;
    const key = TABLES[t];
    const bucket = db.tables[t];
    if (op.op === 'put') {
      const value = op.value;
      const id = value?.[key];
      if (id == null) continue;
      db.rev++; changed = true;
      bucket[String(id)] = { rev: db.rev, deleted: false, data: value };
      (touched[t] ||= []).push({ id: String(id), rev: db.rev, deleted: false, data: value });
    } else if (op.op === 'del') {
      if (op.id == null) continue;
      db.rev++; changed = true;
      bucket[String(op.id)] = { rev: db.rev, deleted: true, data: null };
      (touched[t] ||= []).push({ id: String(op.id), rev: db.rev, deleted: true, data: null });
    } else if (op.op === 'clear') {
      for (const id of Object.keys(bucket)) {
        if (bucket[id].deleted) continue;
        db.rev++; changed = true;
        bucket[id] = { rev: db.rev, deleted: true, data: null };
        (touched[t] ||= []).push({ id, rev: db.rev, deleted: true, data: null });
      }
    }
  }
  if (changed) save();
  return touched;
}

// ── Utilitaires HTTP ────────────────────────────────────────────────────────
function json(res, code, obj, extra = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extra,
  });
  res.end(body);
}
function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('trop volumineux')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function bearer(req, url) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return url.searchParams.get('token'); // EventSource ne peut pas envoyer d'en-tête
}

// ── Cookie de session ───────────────────────────────────────────────────────
// C'est lui que nginx interroge avant de livrer le moindre fichier de l'appli.
// Pourquoi un cookie et pas l'authentification HTTP qu'on utilisait avant :
// ajoutée à l'écran d'accueil, une PWA iPad n'affiche JAMAIS la fenêtre de mot
// de passe native. Un 401 y devient un écran blanc sans formulaire, et la caisse
// est inutilisable. Le cookie, lui, survit dans le bac à sable du plein écran.
const COOKIE = 'bb-gate';

function cookieToken(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// HttpOnly : le jeton échappe à toute lecture JavaScript. Secure : il ne part
// qu'en HTTPS. SameSite=Lax : pas depuis un autre site. Max-Age aligné sur la
// durée de vie du jeton, pour que l'équipe ne ressaisisse rien pendant la saison.
function sessionCookie(token) {
  const age = Math.floor(TOKEN_TTL_MS / 1000);
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf',
};
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(STATIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.resolve(STATIC_DIR))) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || file.endsWith('service-worker.js') ? 'no-cache' : 'public, max-age=300',
    });
    res.end(buf);
  });
}

// ── Serveur ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    return res.end();
  }

  if (!url.pathname.startsWith('/api/')) {
    if (STATIC_DIR) return serveStatic(req, res, url);
    return json(res, 404, { error: 'not found' });
  }

  if (url.pathname === '/api/health') return json(res, 200, { ok: true, rev: db.rev });

  if (url.pathname === '/api/login' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'json invalide' }); }
    if (sameSecret(body.password, PASSWORD)) {
      // Le mot de passe du bar ferme les deux serrures d'un coup : le cookie que
      // nginx vérifiera avant de livrer un seul fichier, et le jeton que l'appli
      // garde pour la synchro et pour rouvrir quand le Wi-Fi est tombé.
      const t = makeToken('full');
      return json(res, 200, { token: t, role: 'full' }, { 'Set-Cookie': sessionCookie(t) });
    }
    // L'agent d'impression ne télécharge jamais l'appli : pas de cookie pour lui.
    if (sameSecret(body.password, AGENT_PASSWORD)) return json(res, 200, { token: makeToken('agent'), role: 'agent' });
    return json(res, 401, { error: 'mot de passe incorrect' });
  }

  // Sous-requête de nginx (auth_request). Elle arrive sans corps et sans en-tête
  // Authorization : seuls les cookies la suivent. Elle ne décide que d'une chose,
  // si les FICHIERS de l'appli sont livrés — ce qu'on peut en faire reste gardé
  // par les routes ci-dessous, qui exigent toujours un jeton.
  if (url.pathname === '/api/gate-check') {
    const t = readToken(cookieToken(req));
    res.writeHead(t && t.role === 'full' ? 204 : 401);
    return res.end();
  }

  // L'appli échange son cookie contre le jeton de synchro. C'est ce qui évite de
  // réclamer le mot de passe une seconde fois devant le verrou d'entrée : la
  // page de connexion vient déjà de le demander.
  if (url.pathname === '/api/session') {
    const raw = cookieToken(req);
    const t = readToken(raw);
    if (t && t.role === 'full') return json(res, 200, { token: raw, role: 'full' });
    return json(res, 401, { error: 'non autorisé' });
  }

  const auth = readToken(bearer(req, url));
  if (!auth) return json(res, 401, { error: 'non autorisé' });
  const agent = auth.role === 'agent';

  if (url.pathname === '/api/pull') {
    const since = Number(url.searchParams.get('since') || 0);
    return json(res, 200, { rev: db.rev, changes: changesSince(since, agent ? AGENT_READ : null) });
  }

  if (url.pathname === '/api/push' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'json invalide' }); }
    if (agent && !(body.ops || []).every((o) => o.op === 'put' && AGENT_WRITE.has(o.table))) {
      return json(res, 403, { error: 'ce rôle ne peut écrire que les accusés d\'impression' });
    }
    const changes = applyOps(body.ops);
    if (Object.keys(changes).length) {
      broadcast({ rev: db.rev, changes, from: body.clientId || null });
    }
    return json(res, 200, { rev: db.rev });
  }

  if (url.pathname === '/api/events') {
    // Le flux diffuse les changements de toutes les tables : le réserver aux
    // postes de caisse. L'agent d'impression interroge /api/pull, qui est filtré.
    if (agent) return json(res, 403, { error: 'flux temps réel réservé aux postes de caisse' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx : ne pas tamponner le flux
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ rev: db.rev, hello: true })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`caisse-bluebird : API sur le port ${PORT} (données : ${DATA_DIR})`);
});
