// gate.js — verrou d'entrée : la caisse ne s'ouvre qu'avec le mot de passe du bar.
//
// C'est la seconde serrure. La première est dans nginx (voir
// deploy/nginx.conf.template) : elle refuse de livrer les fichiers de l'appli
// tant qu'un cookie de session valide ne l'accompagne pas. Celle-ci refuse de
// s'en servir — carte, notes, chiffre d'affaires, rien ne s'affiche avant que
// le serveur ait validé le mot de passe.
//
// Le jeton obtenu est celui de la synchro : une seule saisie par iPad. Sa date
// d'expiration se lit sans le serveur, pour que la caisse continue de s'ouvrir
// quand le Wi-Fi du bar est tombé — l'appli doit rester utilisable en service.
import { CLOUD } from './cloud-config.js';
import { savedToken, clearToken, tokenValid, login, session } from './cloud.js';
import { h } from './ui.js';

// Poste de développement (python3 -m http.server) : pas d'API à interroger, le
// verrou s'y désactive. En production le site n'est jamais servi depuis localhost.
const isDev = () => ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname);

/** Bloque le démarrage de l'appli tant que le mot de passe n'est pas validé. */
export async function unlock() {
  const gate = document.getElementById('gate')
    || document.body.appendChild(h('div', { class: 'gate' }));
  if (!CLOUD.ENABLED || isDev()) { gate.remove(); return; }
  if (tokenValid(savedToken())) { gate.remove(); return; }
  clearToken();          // jeton expiré ou bricolé : on repart d'une page blanche
  // Ces fichiers viennent d'être livrés, donc nginx a validé un cookie : on
  // l'échange contre le jeton, plutôt que de réclamer deux fois la même phrase.
  if (await session()) { gate.remove(); return; }
  await ask(gate);
  gate.remove();
}

// Ne rend la main qu'en cas de succès : il n'y a pas de « Plus tard ».
function ask(gate) {
  return new Promise((resolve) => {
    const input = h('input', {
      class: 'input gate-input', type: 'password', autocomplete: 'current-password',
      placeholder: 'Mot de passe', enterkeyhint: 'go',
    });
    const msg = h('p', { class: 'gate-msg', hidden: true });
    const btn = h('button', { class: 'btn btn-primary gate-btn', type: 'submit' }, 'Déverrouiller');

    const fail = (text) => {
      msg.textContent = text;
      msg.hidden = false;
      input.disabled = false; btn.disabled = false; btn.textContent = 'Déverrouiller';
      input.focus(); input.select();
    };

    const form = h('form', { class: 'gate-card' },
      h('img', { class: 'gate-logo', src: 'assets/icons/icon-192.v2.png', alt: '' }),
      h('h1', { class: 'gate-title' }, 'Bluebird'),
      h('p', { class: 'gate-sub' }, 'Caisse — accès réservé'),
      input, btn, msg,
    );

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = input.value;
      if (!pw) { input.focus(); return; }
      msg.hidden = true;
      input.disabled = true; btn.disabled = true; btn.textContent = 'Vérification…';
      try {
        await login(pw);
        resolve();
      } catch (err) {
        fail(err.message === 'motdepasse'
          ? 'Mot de passe incorrect.'
          : 'Serveur injoignable — vérifie la connexion.');
      }
    });

    gate.append(form);
    setTimeout(() => input.focus(), 50);
  });
}
