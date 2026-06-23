// ui.js — petits utilitaires DOM partagés (hyperscript, modales, toasts).

// Hyperscript minimal : h('div', {class:'x', onclick}, child, ...)
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k in node && k !== 'list') { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

let toastTimer = null;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// Modale générique. actions: [{label, kind, value, autofocus}]. Renvoie une Promise.
export function modal({ title, body, actions = [], onMount }) {
  return new Promise((resolve) => {
    const layer = document.getElementById('modal-layer');
    const close = (val) => { layer.hidden = true; clear(layer); resolve(val); };

    const foot = h('div', { class: 'modal-foot' },
      actions.map((a) =>
        h('button', {
          class: `btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'blue' ? 'btn-blue' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'}`,
          onclick: () => close(a.value),
        }, a.label)
      )
    );

    const card = h('div', { class: 'modal' },
      title ? h('div', { class: 'modal-head' }, h('h3', {}, title)) : null,
      h('div', { class: 'modal-body' }, body),
      actions.length ? foot : null,
    );

    clear(layer).append(card);
    layer.hidden = false;
    layer.onclick = (e) => { if (e.target === layer) close(undefined); };
    if (onMount) onMount(card, close);
  });
}

export async function confirmDialog(message, { okLabel = 'Confirmer', danger = false } = {}) {
  const v = await modal({
    title: 'Confirmer',
    body: h('p', { class: 'muted' }, message),
    actions: [
      { label: 'Annuler', value: false },
      { label: okLabel, kind: danger ? 'danger' : 'primary', value: true },
    ],
  });
  return v === true;
}

export function field(label, control) {
  return h('div', { class: 'field' }, h('label', {}, label), control);
}
