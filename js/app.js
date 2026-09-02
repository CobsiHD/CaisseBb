// app.js — amorçage, navigation entre vues, réglages, service worker.
import { state, loadAll, reloadCatalog, reloadLayout, reloadOrders, reloadTiles, reloadTickets, reloadPrints, on } from './state.js';
import { h, clear, toast, modal, field, confirmDialog } from './ui.js';
import * as store from './store.js';
import { renderFloor } from './floorplan.js';
import { renderCatalog } from './catalog.js';
import { renderMenu } from './menu.js';
import { renderDashboard } from './dashboard.js';
import { renderHome } from './home.js';
import { renderCuisine } from './cuisine.js';
import { notifyNewTickets, newTicketCount } from './kitchen.js';
import { initCloud, syncActive, disconnectCloud, cloudEnabled } from './cloud.js';
import { PROFILES, profile, profileId, setProfile, tabAllowed } from './profile.js';
import { isMobileUI, mountMobileShell, uiModeSelector } from './mobile/shell.js';
import { MOBILE_VIEWS, MOBILE_HOME_VIEW } from './mobile/views.js';
import { isListMode } from './mobile/mfloor.js';

const PAD_VIEWS = {
  home: renderHome,
  floor: renderFloor,
  menu: renderMenu,
  catalog: renderCatalog,
  dashboard: renderDashboard,
  cuisine: renderCuisine,
};

// L'iPad garde son écran paysage ; le téléphone a ses propres vues Salle et
// Comptoir (mobile/views.js) et réutilise les autres.
const MOBILE = isMobileUI();
const VIEWS = MOBILE ? MOBILE_VIEWS : PAD_VIEWS;

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
  return Object.keys(VIEWS).find(tabAllowed) || home;
}

function navigate(view) {
  if (!tabAllowed(view)) view = firstAllowedView();
  current = view;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.view === view));
  const container = document.getElementById('view');
  clear(container);
  VIEWS[view](container);
}

// Re-render la vue courante quand les données changent.
on('tickets', () => { notifyNewTickets(); refreshCuisineBadge(); });

on('*', (evt) => {
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

function bindNav() {
  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) navigate(tab.dataset.view);
  });
  document.getElementById('brand').addEventListener('click', () => navigate('floor'));
  document.getElementById('settings-btn').addEventListener('click', openSettings);
}

// ── Réglages (PIN, happy hour, sauvegarde, réinitialisation) ──
export async function openSettings() {
  const s = state.settings;
  const pinInput = h('input', { class: 'input', type: 'tel', inputmode: 'numeric', maxlength: 6, value: s.pin || '', placeholder: 'Aucun' });
  const hhEnabled = h('input', { type: 'checkbox', checked: !!s.happyHour?.enabled });
  const hhFrom = h('input', { class: 'input', type: 'time', value: s.happyHour?.from || '17:00' });
  const hhTo = h('input', { class: 'input', type: 'time', value: s.happyHour?.to || '21:00' });
  const fileInput = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; if (!f) return;
    try {
      const dump = JSON.parse(await f.text());
      // Un import efface puis réécrit toutes les tables, et la synchro propage
      // l'effacement : ça ne restaure pas cet iPad, ça restaure le bar entier.
      if (!(await confirmDialog('Remplacer toutes les données par cette sauvegarde ? Avec la synchro, cela remplace aussi celles des autres appareils.', { okLabel: 'Importer', danger: true }))) return;
      await store.importAll(dump);
      await loadAll();
      reloadCatalog(); reloadLayout(); reloadOrders(); reloadTickets();
      toast('Sauvegarde importée');
    } catch (e) { toast('Fichier invalide'); }
  });

  const body = h('div', { class: 'modal-body', style: 'padding:0' },
    field('Code PIN (verrouille Produits & édition du plan)', pinInput),
    field('Happy Hour — « Bluebird\'s Hour »',
      h('div', {},
        h('label', { class: 'switch' }, hhEnabled, h('span', { class: 'track' }), h('span', { class: 'muted' }, '1 acheté = 1 offert')),
        h('div', { class: 'row', style: 'margin-top:10px' },
          field('De', hhFrom), field('À', hhTo)),
      )),
    field('Profil de cet appareil',
      h('div', {},
        h('div', { class: 'row' }, PROFILES.map((pr) => h('button', {
          class: `btn btn-sm ${pr.id === profileId() ? 'btn-blue' : 'btn-ghost'}`,
          onclick: async () => {
            if (pr.id === profileId()) return;
            if (!(await confirmDialog(`Passer cet appareil en profil « ${pr.label} » ? ${pr.hint}`, { okLabel: 'Changer' }))) return;
            setProfile(pr.id);
            toast(`Profil « ${pr.label} »`);
            location.reload();   // le plus simple pour réappliquer onglets et pavés
          },
        }, pr.label))),
        h('div', { class: 'faint', style: 'font-size:12px; margin-top:6px' }, profile().hint),
        h('div', { class: 'faint', style: 'font-size:12px; margin-top:4px' },
          'Propre à cet iPad : ce choix ne se synchronise pas. Il signe aussi les bons envoyés en cuisine.'))),
    field('Synchronisation entre iPads',
      h('div', {},
        h('div', { class: 'muted' }, cloudEnabled()
          ? (syncActive() ? '\u2713 Connecté à la caisse partagée' : 'Hors ligne — données locales seulement')
          : 'Désactivée dans la configuration'),
        syncActive() ? h('button', { class: 'btn btn-sm btn-ghost', style: 'margin-top:8px', onclick: async () => {
          if (await confirmDialog('Déconnecter cet iPad de la caisse partagée ? Ses données resteront en local.', { okLabel: 'Déconnecter', danger: true })) {
            disconnectCloud(); toast('iPad déconnecté — recharge la page pour te reconnecter');
          }
        } }, 'Déconnecter cet iPad') : null)),
    field('Interface',
      h('div', {},
        uiModeSelector(),
        h('div', { class: 'faint', style: 'font-size:12px; margin-top:6px' },
          'Auto choisit selon la largeur de l\'écran (téléphone sous 560 px). Forcer un mode recharge la page ; le choix est mémorisé sur cet appareil.'))),
    field('Sauvegarde',
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-sm', onclick: doExport }, '⤓ Exporter (.json)'),
        h('button', { class: 'btn btn-sm', onclick: () => fileInput.click() }, '⤒ Importer'),
        fileInput,
      )),
    // Pas de bouton « recharger la carte / le plan par défaut » : avec la
    // synchro, il n'efface pas cet appareil mais TOUS les autres — la remise à
    // zéro se propage comme n'importe quelle écriture. Un appareil en retard se
    // remet à jour tout seul en se connectant. Le seul filet restant est
    // l'import d'une sauvegarde, qui porte le même avertissement.
  );

  const v = await modal({
    title: 'Réglages',
    body,
    actions: [{ label: 'Fermer', value: 'close' }, { label: 'Enregistrer', kind: 'primary', value: 'save' }],
  });

  if (v === 'save') {
    await store.setSetting('pin', pinInput.value.trim());
    await store.setSetting('happyHour', { enabled: hhEnabled.checked, from: hhFrom.value, to: hhTo.value });
    state.settings.pin = pinInput.value.trim();
    state.settings.happyHour = { enabled: hhEnabled.checked, from: hhFrom.value, to: hhTo.value };
    toast('Réglages enregistrés');
  }
}

async function doExport() {
  const dump = await store.exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `bluebird-sauvegarde.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Sauvegarde exportée');
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
  await loadAll();
  bindNav();
  applyProfile();
  if (MOBILE) mountMobileShell({ navigate, openSettings });
  navigate(current);
  refreshCuisineBadge();
  // Synchro (si configurée) : répercute en direct ce que font les autres iPads.
  initCloud(async (tables) => {
    if (tables.has('categories') || tables.has('products') || tables.has('optiongroups')) await reloadCatalog();
    if (tables.has('layout')) await reloadLayout();
    if (tables.has('orders')) await reloadOrders();
    if (tables.has('tickets')) await reloadTickets();
    if (tables.has('prints')) await reloadPrints();
    if (tables.has('tiles')) await reloadTiles();
    if (tables.has('settings')) state.settings = await store.getSettings();
  }).catch(() => {});
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
