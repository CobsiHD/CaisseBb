# Mettre la caisse sur le VPS

La caisse devient accessible depuis n'importe quel iPad à une adresse du type
`https://caisse.mondomaine.fr`, et **tous les appareils partagent les mêmes données**
(carte, plan de salle, tuiles d'accueil, notes en cours) en temps réel.

Tout est hébergé sur ton VPS : aucun service tiers, aucun abonnement.

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

1. Ouvrir `https://caisse.mondomaine.fr` dans Safari.
2. Partage → **Sur l'écran d'accueil** (l'appli s'installe comme une vraie app,
   plein écran, et continue de fonctionner si le Wi-Fi coupe).
3. Au premier lancement, saisir le **mot de passe du bar**. Une seule fois.

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

**Changer le mot de passe du bar :** éditer `CAISSE_PASSWORD` dans
`/etc/caisse-bluebird.env` puis `systemctl restart caisse-bluebird`. Les iPads déjà
connectés le restent ; seuls les nouveaux devront saisir le nouveau mot de passe.

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
