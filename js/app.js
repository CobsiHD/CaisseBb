// app.js — amorçage, navigation entre vues, réglages, service worker.
import { state, loadAll, reloadCatalog, reloadLayout, reloadOrders, reloadTiles, on } from './state.js';
import { h, clear, toast, modal, field, confirmDialog } from './ui.js';
import * as store from './store.js';
import { renderFloor } from './floorplan.js';
import { renderCatalog } from './catalog.js';
import { renderMenu } from './menu.js';
import { renderDashboard } from './dashboard.js';
import { renderHome } from './home.js';

const VIEWS = {
  home: renderHome,
  floor: renderFloor,
  menu: renderMenu,
  catalog: renderCatalog,
  dashboard: renderDashboard,
};

let current = 'home';

function navigate(view) {
  current = view;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.view === view));
  const container = document.getElementById('view');
  clear(container);
  VIEWS[view](container);
}

// Re-render la vue courante quand les données changent.
on('*', (evt) => {
  if (['orders', 'layout', 'catalog', 'tiles'].includes(evt)) {
    // Le plan se met à jour finement lui-même ; les autres vues se redessinent.
    if (current !== 'floor' || evt === 'catalog') navigate(current);
  }
});

function bindNav() {
  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) navigate(tab.dataset.view);
  });
  document.getElementById('brand').addEventListener('click', () => navigate('floor'));
  document.getElementById('settings-btn').addEventListener('click', openSettings);
}

// ── Réglages (PIN, happy hour, sauvegarde, réinitialisation) ──
async function openSettings() {
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
      if (!(await confirmDialog('Remplacer toutes les données actuelles par cette sauvegarde ?', { okLabel: 'Importer', danger: true }))) return;
      await store.importAll(dump);
      await loadAll();
      reloadCatalog(); reloadLayout(); reloadOrders();
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
    field('Sauvegarde',
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-sm', onclick: doExport }, '⤓ Exporter (.json)'),
        h('button', { class: 'btn btn-sm', onclick: () => fileInput.click() }, '⤒ Importer'),
        fileInput,
      )),
    field('Catalogue',
      h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
        if (await confirmDialog('Réinitialiser le catalogue avec la carte officielle ? (les notes ne sont pas touchées)', { okLabel: 'Réinitialiser' })) {
          await store.resetCatalog(); await reloadCatalog(); toast('Catalogue réinitialisé');
        }
      } }, '↻ Recharger la carte officielle')),
    field('Configuration par défaut',
      h('div', {},
        h('button', { class: 'btn btn-sm', onclick: async () => {
          if (await confirmDialog('Recharger le PLAN et la CARTE par défaut sur cet appareil ? Cela remplace le plan de salle, les tables, la carte et les tuiles, et efface les notes en cours. (Tes réglages PIN/Happy Hour sont conservés.)', { okLabel: 'Recharger', danger: true })) {
            await store.loadDefaults();
            await loadAll();
            reloadCatalog(); reloadLayout(); reloadOrders(); reloadTiles();
            toast('Configuration par défaut rechargée');
          }
        } }, '↺ Recharger plan + carte par défaut'),
        h('div', { class: 'faint', style: 'font-size:12px; margin-top:6px' }, 'Réaffiche le plan officiel du Bluebird (utile sur un appareil qui a encore l\'ancienne version).'))),
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
  navigate('home');
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
