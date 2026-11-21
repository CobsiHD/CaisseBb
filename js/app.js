// app.js — amorçage, navigation entre vues, réglages, service worker.
import { state, loadAll, reloadCatalog, reloadLayout, reloadOrders, reloadTiles, reloadTickets, reloadPrints, reloadMenage, on } from './state.js';
import { h, clear, toast, modal, field } from './ui.js';
import * as store from './store.js';
import { renderFloor } from './floorplan.js';
import { renderCatalog } from './catalog.js';
import { renderMenu } from './menu.js';
import { renderRecettes } from './recettes.js';
import { renderDashboard } from './dashboard.js';
import { renderHome } from './home.js';
import { renderCuisine } from './cuisine.js';
import { renderMenage, menageEnRetard } from './menage.js';
import { renderTutos } from './tutos-video.js';
import { renderReglages } from './reglages.js';
import { notifyNewTickets, newTicketCount } from './kitchen.js';
import { initCloud } from './cloud.js';
import { runMigrations } from './migrations.js';
import { tabAllowed } from './profile.js';
import { mountMobileShell } from './mobile/shell.js';
import { isMobileUI } from './uimode.js';
import { MOBILE_VIEWS, MOBILE_HOME_VIEW } from './mobile/views.js';
import { isListMode } from './mobile/mfloor.js';
import { unlock } from './gate.js';
import { tutoView, tutoOn, setTutoOn, mountHelp, startParcours } from './tuto.js';

const PAD_VIEWS = {
  home: renderHome,
  floor: renderFloor,
  menu: renderMenu,
  recettes: renderRecettes,
  catalog: renderCatalog,
  dashboard: renderDashboard,
  cuisine: renderCuisine,
  menage: renderMenage,
};

// L'iPad garde son écran paysage ; le téléphone a ses propres vues Salle et
// Comptoir (mobile/views.js) et réutilise les autres.
const MOBILE = isMobileUI();
// Réglages et Tutos n'ont pas d'onglet : ⚙ ouvre les Réglages, qui mènent aux
// Tutos, sur tous les appareils et quel que soit leur profil.
const VIEWS = {
  ...(MOBILE ? MOBILE_VIEWS : PAD_VIEWS),
  reglages: (c) => renderReglages(c, { navigate, retour: fermerReglages }),
  tutos: (c) => renderTutos(c, { retour: () => navigate('reglages') }),
};
const HORS_ONGLETS = new Set(['reglages', 'tutos']);

let current = MOBILE ? MOBILE_HOME_VIEW : 'home';

// Masque les onglets que le profil de cet appareil n'autorise pas. Le profil
// est local (localStorage) : chaque iPad a le sien, rien ne se synchronise.
function applyProfile() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.hidden = !tabAllowed(t.dataset.view);
  });
}

/** Le premier onglet autorisé — filet quand la vue courante vient d'être masquée. */
function firstAllowedView() {
  const home = MOBILE ? MOBILE_HOME_VIEW : 'home';
  if (tabAllowed(home)) return home;
  return Object.keys(VIEWS).find((v) => !HORS_ONGLETS.has(v) && tabAllowed(v)) || home;
}

function navigate(view) {
  if (!HORS_ONGLETS.has(view) && !tabAllowed(view)) view = firstAllowedView();
  current = view;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.view === view));
  const container = document.getElementById('view');
  clear(container);
  VIEWS[view](container);
  document.getElementById('settings-btn')?.classList.toggle('active', HORS_ONGLETS.has(view));
  // Ces pages n'ont pas de tuto : le « ? » continue de rejouer celui du dernier onglet.
  if (!HORS_ONGLETS.has(view)) tutoView(view);
}

// Re-render la vue courante quand les données changent.
on('tickets', () => { notifyNewTickets(); refreshCuisineBadge(); });

on('*', (evt) => {
  // Réglages et Tutos n'affichent aucune donnée de service : les redessiner à
  // chaque note encaissée ailleurs couperait la vidéo ou une saisie en cours.
  if (HORS_ONGLETS.has(current)) { if (evt === 'menage') refreshMenageBadge(); return; }
  // Une coche de ménage ne concerne que son écran : inutile de redessiner le
  // comptoir ou la salle chaque fois qu'un autre iPad coche une tâche.
  if (evt === 'menage') {
    refreshMenageBadge();
    if (current === 'menage') navigate(current);
    return;
  }
  if (['orders', 'layout', 'catalog', 'tiles', 'tickets'].includes(evt)) {
    // Le plan se met à jour finement lui-même ; les autres vues se redessinent
    // (sur téléphone, la Salle est une liste : elle a besoin du redessin).
    const planSelfUpdates = current === 'floor' && evt !== 'catalog' && !(MOBILE && isListMode());
    if (!planSelfUpdates) navigate(current);
  }
});

// Pastille de l'onglet Cuisine : nombre de bons pas encore pris en charge.
function refreshCuisineBadge() {
  const n = newTicketCount();
  document.querySelectorAll('.tab[data-view="cuisine"]').forEach((tab) => {
    tab.dataset.badge = n > 0 ? String(n) : '';
    tab.classList.toggle('has-badge', n > 0);
  });
}

// Pastille de l'onglet Ménage : tâches des jours précédents encore à faire.
function refreshMenageBadge() {
  const n = menageEnRetard();
  document.querySelectorAll('.tab[data-view="menage"]').forEach((tab) => {
    tab.dataset.badge = n > 0 ? String(n) : '';
    tab.classList.toggle('has-badge', n > 0);
  });
}

function bindNav() {
  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) navigate(tab.dataset.view);
  });
  document.getElementById('brand').addEventListener('click', () => navigate('floor'));
  document.getElementById('settings-btn').addEventListener('click', openSettings);
}

// ── Réglages : une page sans onglet (reglages.js), ouverte par ⚙ ──
// Retoucher ⚙ sur la page la referme et ramène à l'écran d'où l'on venait.
let avantReglages = null;
function fermerReglages() { navigate(avantReglages || firstAllowedView()); }
export function openSettings() {
  if (current === 'reglages') { fermerReglages(); return; }
  if (!HORS_ONGLETS.has(current)) avantReglages = current;
  navigate('reglages');
}

// Vérifie le PIN si défini. Renvoie true si l'accès est autorisé.
export async function requirePin(reason = 'Accès protégé') {
  const pin = state.settings.pin;
  if (!pin) return true;
  const input = h('input', { class: 'input', type: 'tel', inputmode: 'numeric', maxlength: 6, placeholder: '••••', style: 'text-align:center; letter-spacing:.4em; font-size:22px' });
  const v = await modal({
    title: reason,
    body: field('Saisis le code PIN', input),
    actions: [{ label: 'Annuler', value: false }, { label: 'Valider', kind: 'primary', value: true }],
    onMount: (card) => setTimeout(() => input.focus(), 50),
  });
  if (v === true && input.value === pin) return true;
  if (v === true) toast('Code incorrect');
  return false;
}

async function boot() {
  // Rien ne se charge ni ne s'affiche avant le mot de passe du bar.
  await unlock();
  await loadAll();
  bindNav();
  mountHelp({ navigate });
  applyProfile();
  if (MOBILE) mountMobileShell({ navigate, openSettings, tuto: { tutoOn, setTutoOn, startParcours } });
  navigate(current);
  refreshCuisineBadge();
  refreshMenageBadge();
  // Synchro (si configurée) : répercute en direct ce que font les autres iPads.
  initCloud(async (tables) => {
    if (tables.has('categories') || tables.has('products') || tables.has('optiongroups')) await reloadCatalog();
    if (tables.has('layout')) await reloadLayout();
    if (tables.has('orders')) await reloadOrders();
    if (tables.has('tickets')) await reloadTickets();
    if (tables.has('prints')) await reloadPrints();
    if (tables.has('tiles')) await reloadTiles();
    if (tables.has('menage')) await reloadMenage();
    if (tables.has('settings')) state.settings = await store.getSettings();
  }).catch(() => {})
    // Retouches de la carte, une fois la synchro tentée : elles partent alors
    // au serveur et retombent d'elles-mêmes sur les autres iPads.
    .then(() => runMigrations())
    .then((faites) => { if (faites) toast('Carte mise à jour'); })
    .catch((e) => console.warn('[carte] mise à jour impossible', e));
  if ('serviceWorker' in navigator) {
    // Recharge automatiquement la page quand une nouvelle version prend le relais.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return; reloaded = true; location.reload();
    });
    navigator.serviceWorker.register('service-worker.js')
      .then((reg) => { reg.update(); setInterval(() => reg.update(), 60 * 60 * 1000); })
      .catch(() => {});
  }
}

boot();
