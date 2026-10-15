// service-worker.js — cache applicatif pour fonctionnement hors-ligne.
const CACHE = 'bluebird-v46';
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
  'css/styles.css', 'css/mobile.css',
  'js/app.js', 'js/state.js', 'js/store.js', 'js/seed.js', 'js/migrations.js',
  'js/ui.js', 'js/pos.js',
  'js/floorplan.js', 'js/elements.js', 'js/order.js', 'js/home.js',
  'js/catalog.js', 'js/menu.js', 'js/recettes.js', 'js/dashboard.js',
  'js/kitchen.js', 'js/cuisine.js', 'js/note.js', 'js/openorder.js', 'js/options.js',
  'js/mobile/shell.js', 'js/mobile/views.js', 'js/mobile/mfloor.js',
  'js/mobile/morder.js', 'js/mobile/mhome.js',
  'js/cloud.js', 'js/cloud-config.js', 'js/gate.js', 'js/profile.js', 'js/uimode.js',
  'manifest.webmanifest',
  'favicon.ico',
  'assets/icons/icon-16.png', 'assets/icons/icon-32.png',
  'assets/icons/icon-192.v2.png', 'assets/icons/icon-512.v2.png',
  'assets/icons/icon-maskable-512.v2.png', 'assets/icons/apple-touch-icon.v2.png',
  'assets/icons/logo-bluebird.png',
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
  const reqUrl = new URL(request.url);
  // API de synchronisation : jamais de cache, toujours le réseau (données en direct).
  if (reqUrl.pathname.startsWith('/api/')) {
    e.respondWith(fetch(request));
    return;
  }
  // La page de connexion est la porte de secours : jamais interceptée, jamais
  // mise en cache. Servie périmée, elle enfermerait dehors.
  if (reqUrl.pathname === '/connexion.html') return;

  const sameOrigin = reqUrl.origin === self.location.origin;

  const cacheCopy = (res) => {
    if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
    }
    return res;
  };

  // Le verrou a repris la main (cookie expiré) : la réponse est parfaitement
  // valide au sens HTTP, mais elle ne contient pas l'appli.
  const refus = (res) => res && (res.status === 401 || res.status === 403);

  if (sameOrigin) {
    // Network-first : toujours la dernière version quand en ligne, cache en secours.
    //
    // `fetch` ne REJETTE que sur une panne réseau. Un 401 est une promesse tenue,
    // donc le `.catch()` ne se déclenchait pas et le refus repartait tel quel
    // vers la page — qui se retrouvait sans HTML ni modules, avec le cache plein
    // juste à côté. C'était l'écran blanc de la PWA.
    //
    // On sert donc la copie en cache : l'appli redémarre et son propre verrou
    // (gate.js) redemande le mot de passe sans quitter l'écran. Sans copie en
    // cache, on laisse passer le refus pour que nginx envoie sur /connexion.html.
    e.respondWith(
      fetch(request)
        .then((res) => (refus(res)
          ? caches.match(request).then((c) => c || res)
          : cacheCopy(res)))
        .catch(() => caches.match(request))
    );
  } else {
    // Cache-first pour les ressources externes (polices Google).
    e.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(cacheCopy)));
  }
});
