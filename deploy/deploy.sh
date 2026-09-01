#!/usr/bin/env bash
# deploy.sh — envoie l'appli et le serveur de synchro sur le VPS.
# À lancer depuis le Mac, à la racine du projet :
#   bash deploy/deploy.sh
# La cible SSH est lue dans deploy/target.conf (ou la variable SSH_TARGET).
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f deploy/target.conf ] && . deploy/target.conf
TARGET="${SSH_TARGET:-}"
if [ -z "$TARGET" ]; then
  echo "SSH_TARGET non défini. Crée deploy/target.conf avec :  SSH_TARGET=ubuntu@ip-du-vps" >&2
  exit 1
fi

WEB_DIR=/var/www/caisse-bluebird
APP_DIR=/opt/caisse-bluebird

echo "▶ Envoi de l'appli vers $TARGET:$WEB_DIR"
rsync -az --delete --rsync-path="sudo rsync" \
  --exclude '.git' --exclude '.idea' --exclude 'deploy' --exclude 'server' --exclude 'agent' \
  --exclude '*.md' --exclude '.DS_Store' --exclude 'node_modules' \
  ./ "$TARGET:$WEB_DIR/"

echo "▶ Envoi du serveur de synchro vers $APP_DIR"
rsync -az --rsync-path="sudo rsync" server/server.js "$TARGET:$APP_DIR/server.js"

echo "▶ Droits et redémarrage du service"
ssh "$TARGET" 'sudo bash -s' <<'REMOTE'
set -e
chown -R www-data:www-data /var/www/caisse-bluebird
chown caisse:caisse /opt/caisse-bluebird/server.js
systemctl restart caisse-bluebird
sleep 1
if systemctl is-active --quiet caisse-bluebird; then
  echo "  service actif"
else
  journalctl -u caisse-bluebird -n 20 --no-pager
  exit 1
fi
REMOTE

echo "✅ Déploiement terminé. Les iPads se mettront à jour tout seuls au prochain lancement."
