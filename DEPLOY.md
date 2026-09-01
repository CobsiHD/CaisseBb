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

## L'agent d'impression (Raspberry Pi en cuisine)

Les bons s'affichent sur l'écran Cuisine **sans lui** : l'agent n'ajoute que le
papier. Si le Pi tombe, le service continue.

### Installation

**1. Créer le mot de passe de l'agent, sur le VPS.** Il doit être *différent* de
celui du bar : l'agent tourne sans surveillance dans un local technique, et son
rôle ne lui donne accès qu'aux bons de cuisine — ni la carte, ni les notes, ni le
chiffre d'affaires. Depuis l'app Terminal :

```
ssh -t ubuntu@IP-DU-VPS 'sudo caisse-agent-motdepasse'
```

**2. Installer l'agent sur le Pi.** Depuis le Mac :

```bash
scp -r agent pi@IP-DU-PI:/tmp/agent
ssh -t pi@IP-DU-PI 'sudo bash /tmp/agent/setup-pi.sh'
```

Le script installe Node, crée le service, détecte une imprimante USB branchée,
puis demande l'adresse de la caisse, le mot de passe agent et la largeur du papier.

### Imprimantes reconnues

| Branchement | À saisir |
|---|---|
| USB (Epson TM-T20 et compatibles ESC/POS) | `usb:/dev/usb/lp0` |
| Réseau / Ethernet | `tcp:192.168.1.50:9100` |
| Test sans imprimante | `file:/tmp/bon.bin` |

Largeur : `42` colonnes pour du 80 mm, `32` pour du 58 mm. Si l'imprimante n'a pas
de massicot, mettre `CUT=non` dans `/etc/caisse-print.env`.

### Ce qu'il garantit

- **Panne d'imprimante** : les tentatives se réespacent (2 s, 4 s, 8 s… plafonné à
  1 min) et le bon ressort tout seul au rallumage, sans redémarrer quoi que ce soit.
- **Coupure de courant du Pi** : les bons non imprimés sont conservés sur disque et
  sortent au redémarrage.
- **Première mise en route** : le service déjà écoulé n'est pas déversé sur le
  papier. Un bon ancien se réclame au coup par coup avec le bouton 🖨 de l'écran
  Cuisine.
- **Retour vers les iPads** : chaque bon affiche « imprimé à 21:34 », ou l'erreur
  exacte si ça a échoué.

### Exploitation

```bash
systemctl status caisse-print      # état
journalctl -u caisse-print -f      # journal en direct
systemctl restart caisse-print     # redémarrage
```


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
