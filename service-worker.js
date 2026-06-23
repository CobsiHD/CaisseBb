// service-worker.js — cache applicatif pour fonctionnement hors-ligne.
const CACHE = 'bluebird-v12';
const ASSETS_EXT = [
  'arche_pierre', 'caniveau', 'chaise_noire', 'chaise_verte', 'deck_tile',
  'enseigne_bluebird', 'enseigne_neon_b', 'guirlande_lumineuse', 'jardiniere',
  'mat_bois', 'moto', 'parasol', 'pave_tile', 'platane', 'table_basse_ronde',
  'table_haute_carree', 'table_haute_ronde', 'tabouret', 'tabouret_noir',
].map((a) => `assets_terrasse/${a}.png`);
const ASSETS_INT = [
  'applique_murale', 'cadre_tableau', 'canape_chesterfield_2p', 'canape_chesterfield_3p',
  'carrelage_tile', 'chaise_velours', 'comptoir_bar', 'fauteuil_chesterfield', 'gramophone',
  'lampe_champignon', 'logo_bb', 'lustre_cage', 'lustre_cristal', 'miroir_baroque',
  'miroir_rectangulaire', 'porte_manteau', 'table_gueridon', 'table_ronde_nappe',
  'tabouret_bar_velours', 'tapis_oriental', 'tireuse_biere',
].map((a) => `assets_interieur/${a}.png`);
const ASSETS = [...ASSETS_EXT, ...ASSETS_INT];
const CORE = [
  '.', 'index.html',
  'css/styles.css',
  'js/app.js', 'js/state.js', 'js/store.js', 'js/seed.js', 'js/ui.js', 'js/pos.js',
  'js/floorplan.js', 'js/elements.js', 'js/order.js', 'js/home.js',
  'js/catalog.js', 'js/menu.js', 'js/dashboard.js',
  'manifest.webmanifest',
  'assets/icons/icon.svg', 'assets/icons/icon-maskable.svg',
  ...ASSETS,
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const sameOrigin = new URL(request.url).origin === self.location.origin;

  const cacheCopy = (res) => {
    if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
    }
    return res;
  };

  if (sameOrigin) {
    // Network-first : toujours la dernière version quand en ligne, cache en secours hors-ligne.
    e.respondWith(fetch(request).then(cacheCopy).catch(() => caches.match(request)));
  } else {
    // Cache-first pour les ressources externes (polices Google).
    e.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(cacheCopy)));
  }
});
