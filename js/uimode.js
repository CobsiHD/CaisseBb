// uimode.js — téléphone ou iPad ? Une seule source de vérité.
//
// Ce module ne dépend de rien : il est importé aussi bien par la coque
// téléphone (mobile/shell.js) que par le profil de l'appareil (profile.js),
// qui n'ont pas le droit de s'importer l'un l'autre.
const UI_KEY = 'bb.ui';   // 'auto' | 'phone' | 'pad'

export function uiPref() {
  try { return localStorage.getItem(UI_KEY) || 'auto'; } catch { return 'auto'; }
}

export function setUiPref(v) {
  try { localStorage.setItem(UI_KEY, v); } catch {}
}

// Un téléphone, c'est ≤ 560 px de large en portrait. Les pads 9/16 (≥ 700 px)
// restent sur l'interface iPad par défaut ; le réglage manuel permet de les
// basculer ici si le personnel préfère.
export function isMobileUI() {
  const p = uiPref();
  if (p === 'phone') return true;
  if (p === 'pad') return false;
  return window.matchMedia('(max-width: 560px)').matches;
}
