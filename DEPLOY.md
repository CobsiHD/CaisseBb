# Mettre la caisse sur le VPS

La caisse devient accessible depuis n'importe quel iPad à une adresse du type
`https://caisse.mondomaine.fr`, et **tous les appareils partagent les mêmes données**
(carte, plan de salle, tuiles d'accueil, notes en cours) en temps réel.

Tout est hébergé sur ton VPS : aucun service tiers, aucun abonnement.

**L'adresse n'est pas publique.** Sans le mot de passe du bar, un visiteur ne
voit rien du tout — ni la carte, ni le plan, ni le chiffre d'affaires. Deux
serrures, une seule phrase à retenir, **et une seule saisie par iPad** :

| Serrure | Où | Ce qu'elle empêche |
|---|---|---|
| **nginx** (cookie de session) | le serveur web | de **télécharger** l'appli : sans cookie valide, l'adresse renvoie sur la page de connexion |
| **écran de déverrouillage** (`js/gate.js`) | l'appli elle-même | de **s'en servir** : rien ne s'affiche tant que le serveur n'a pas validé le mot de passe |

Le mot de passe se saisit **une seule fois**, sur la page de connexion : elle pose
le cookie que nginx vérifiera, et l'appli échange ensuite ce cookie contre son
jeton (`/api/session`) sans rien redemander.

> **Pourquoi un cookie et pas l'authentification HTTP** (utilisée jusqu'au
> 2026-09-17) : ajoutée à l'écran d'accueil, une PWA iPad n'affiche **jamais** la
> fenêtre de mot de passe native de Safari. Le 401 y devenait un écran blanc sans
> formulaire — la caisse était inutilisable au lancement, tous les jours, et il
> fallait repasser par le site. Un cookie, lui, survit au mode plein écran.

---

## Ce qui tourne sur le VPS

| Élément | Rôle |
|---|---|
| **nginx** | sert l'appli en HTTPS et transmet `/api/` au serveur de synchro |
| **serveur de synchro** (`server/server.js`) | garde la copie de référence des données et les diffuse aux iPads — Node.js, zéro dépendance |
| **Let's Encrypt** | certificat HTTPS gratuit, renouvelé automatiquement |

Les données vivent dans **un seul fichier** : `/var/lib/caisse-bluebird/db.json`,
avec une **sauvegarde datée par jour** (14 jours conservés) dans `backups/`.

---

## 1. Avant de commencer

- Un VPS Debian 12 / Ubuntu 22.04 ou plus récent, avec accès `root` par SSH.
- Un nom de domaine dont l'enregistrement **A** pointe vers l'IP du VPS.
  Vérification depuis le Mac : `dig +short caisse.mondomaine.fr` doit afficher l'IP.

## 2. Installation (une seule fois)

Depuis le Mac, à la racine du projet :

```bash
scp -r deploy root@IP-DU-VPS:/tmp/deploy
ssh root@IP-DU-VPS 'bash /tmp/deploy/setup-vps.sh caisse.mondomaine.fr ton-email@exemple.fr'
```

Le script installe nginx, Node.js et certbot, crée le service, ouvre le pare-feu,
puis **demande le mot de passe partagé du bar** — celui que chaque iPad saisira une
fois pour se connecter à la caisse commune. Choisis-en un simple à dicter à l'équipe.

Ce même mot de passe ferme les deux serrures : nginx interroge le serveur de
synchro (`auth_request` → `/api/gate-check`) avant de livrer le moindre fichier,
et le serveur valide le cookie comme il valide les jetons. Il n'y a donc **aucun
fichier de mots de passe à gérer**. Le script vérifie ensuite, avec
`certbot renew --dry-run`, que la serrure n'empêche pas le renouvellement HTTPS.

**Sur une installation déjà en service**, à lancer **hors service** : le script
réécrit le vhost à partir du modèle, donc sans HTTPS, et c'est certbot qui le
remet quelques secondes plus tard — le temps que ça dure, la caisse est
injoignable. Pour une simple retouche du vhost, mieux vaut le patcher en place
(en gardant une sauvegarde datée à côté) et recharger avec `systemctl reload`.

## 3. Envoyer l'appli

Crée `deploy/target.conf` (ignoré par git) :

```bash
echo 'SSH_TARGET=root@IP-DU-VPS' > deploy/target.conf
```

Puis, à chaque mise à jour de la caisse :

```bash
bash deploy/deploy.sh
```

Les iPads récupèrent la nouvelle version automatiquement au lancement suivant.

## 4. Sur chaque iPad

1. Ouvrir `https://caisse.mondomaine.fr` dans Safari : la **page de connexion**
   s'affiche.
2. Saisir le mot de passe du bar. **Une seule fois** — le cookie obtenu vaut
   180 jours, et l'appli s'en sert pour son propre verrou sans le redemander.
3. Partage → **Sur l'écran d'accueil** (l'appli s'installe comme une vraie app,
   plein écran, et continue de fonctionner si le Wi-Fi coupe).

À partir de là l'iPad s'ouvre directement, y compris **sans réseau** : le jeton
obtenu vaut 180 jours. Les Réglages contiennent un bouton **🔒 Verrouiller cet
iPad** pour l'effacer (fin de saison, iPad prêté, appareil égaré).

Le premier iPad connecté envoie sa configuration au serveur. Les suivants récupèrent
celle du serveur — donc **connecte d'abord l'iPad qui a la bonne carte et le bon plan.**

---

## Exploitation courante

```bash
systemctl status caisse-bluebird     # état du service
journalctl -u caisse-bluebird -f     # journal en direct
systemctl restart caisse-bluebird    # redémarrage
```

**Sauvegarde vers le Mac :**

```bash
scp root@IP-DU-VPS:/var/lib/caisse-bluebird/db.json ~/Desktop/caisse-sauvegarde.json
```

**Agent d'impression du Bluebird.** Le Raspberry Pi qui imprime les bons de
cuisine ne se connecte **pas** avec le mot de passe du bar : le script
d'installation génère un `AGENT_PASSWORD` distinct, qui n'autorise que la
lecture des bons et l'écriture des accusés d'impression. Le Pi tourne sans
surveillance dans un local technique — s'il était compromis, il ne donnerait
accès ni à la carte, ni aux notes, ni au chiffre d'affaires, ni au code PIN.

Pour le récupérer :

```bash
ssh root@IP-DU-VPS 'grep AGENT_PASSWORD /etc/caisse-bluebird.env'
```

et le reporter dans `/etc/bluebird-impression.env` sur le Pi (voir le README de
`bluebird-impression`). Relancer `setup-vps.sh` sur une installation existante
suffit à le créer : le reste de la configuration est conservé.

**Changer le mot de passe du bar :**

```bash
ssh root@IP-DU-VPS 'caisse-motdepasse'
```

Les deux serrures puisant à la même source (`CAISSE_PASSWORD` et le jeton signé
qu'il délivre), il n'y a plus qu'une seule chose à changer : le script réécrit la
variable et redémarre le serveur.

Les iPads déjà connectés **ne bougent pas** : leur cookie et leur jeton sont
signés par un secret que ce changement ne touche pas. Seule une nouvelle
connexion réclamera la nouvelle phrase. Pour tout **déconnecter** (iPad volé,
salarié parti) :

```bash
ssh root@IP-DU-VPS 'rm /var/lib/caisse-bluebird/secret && systemctl restart caisse-bluebird'
```

Tous les jetons deviennent invalides d'un coup : chaque iPad devra ressaisir le
mot de passe. Les données ne bougent pas.

---

---

## L'impression des bons (Raspberry Pi en cuisine)

L'agent d'impression vit dans son **propre dépôt** : `~/WebstormProjects/bluebird-impression`
(Python, sans dépendance). Voir son README pour l'installation sur le Pi.

Les bons s'affichent sur l'écran Cuisine **sans lui** : il n'ajoute que le papier.
Si le Pi tombe, le service continue.

Ce que la caisse lui fournit de son côté :

- la table `tickets` en lecture, la table `prints` en écriture, via un rôle
  « agent » cloisonné (`server/server.js`) qui ne donne accès ni à la carte, ni
  aux notes, ni au chiffre d'affaires ;
- un mot de passe dédié, distinct de celui du bar. Pour le relire :

```bash
ssh ubuntu@IP-DU-VPS 'sudo grep AGENT_PASSWORD /etc/caisse-bluebird.env'
```

  à reporter dans `/etc/bluebird-impression.env` sur le Pi.


## Comment ça marche

- L'appli continue de stocker tout en local (IndexedDB) : elle reste utilisable
  **sans réseau**, y compris pour prendre des commandes.
- Chaque écriture locale est envoyée au serveur. Si le réseau est coupé, elle est
  mise en file d'attente et repart automatiquement au retour de la connexion.
- Le serveur renvoie les changements aux autres iPads par un flux temps réel (SSE),
  avec reprise automatique si la connexion tombe.
- En cas de modification simultanée du **même** enregistrement sur deux iPads,
  la dernière écriture gagne.

**Désactiver la synchro** (revenir à des iPads indépendants) : passer `ENABLED` à
`false` dans `js/cloud-config.js`, puis `bash deploy/deploy.sh`.
