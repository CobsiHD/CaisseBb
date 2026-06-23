# Bluebird · Caisse

Petit logiciel de caisse tactile pour le bar **Le Bluebird** (Chambéry).
Interface web (HTML/CSS/JS, sans build), pensée pour **un iPad**, **hors-ligne** (PWA),
données stockées **en local** sur l'appareil (IndexedDB).

## Lancer en local

```bash
cd CaisseBb2
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000` dans le navigateur.
Sur l'iPad (même réseau Wi-Fi) : `http://IP-DU-MAC:8000` dans Safari, puis
**Partager → Sur l'écran d'accueil** pour l'installer en plein écran et l'utiliser hors-ligne.

> Un serveur HTTP est nécessaire (les modules ES et le service worker ne fonctionnent pas
> via `file://`). N'importe quel hébergement statique convient (Netlify, GitHub Pages, etc.).

## Fonctionnalités

- **Salle** — plan de salle Terrasse / Intérieur.
  - Mode **Service** : touche une table → ouvre/édite sa note, états en couleur
    (libre / occupée / à encaisser), CA en cours.
  - Mode **Édition** : ajoute tables, chaises, bar, murs, plantes ; déplace (drag),
    redimensionne, pivote (snap à la grille) ; numérote et règle la capacité.
- **Note / commande** — ajout produits par catégorie + recherche, quantités, options
  (sauces, diluant…), commentaires, **1+1 Bluebird's Hour**, **plusieurs notes par table**
  (split d'addition), **transfert** vers une autre table, **payé / impayé**.
- **Carte** — affichage éditorial plein écran des produits et prix (vrais prix du menu officiel).
- **Produits** — gestion du catalogue : prix, formats (verre/bouteille, 25/50cl…), options,
  rupture, éligibilité 1+1. Pré-rempli depuis la carte officielle.
- **Tableau de bord** — CA en cours, tables occupées, couverts, notes à encaisser.
- **Réglages** (⚙) — code PIN (protège Produits & édition du plan), plage Happy Hour,
  **export / import JSON** (sauvegarde), rechargement de la carte officielle.

## Limites (V1)

Outil **interne d'organisation** : il ne remplace pas une caisse fiscale certifiée
(pas de conformité NF525), pas de moyens de paiement détaillés ni d'impression de ticket.
Mono-appareil (pas de synchronisation multi-iPad). Ces points sont des extensions possibles.

## Structure

`index.html` · `css/styles.css` · `manifest.webmanifest` · `service-worker.js`
`js/` : `app` (routeur) · `state` · `store` (IndexedDB) · `seed` (carte officielle) ·
`floorplan` + `elements` · `order` · `catalog` · `menu` · `dashboard` · `ui`.
