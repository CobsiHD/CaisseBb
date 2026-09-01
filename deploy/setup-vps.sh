#!/usr/bin/env bash
# setup-vps.sh — installation initiale de la caisse Bluebird sur un VPS Debian/Ubuntu.
# À lancer UNE FOIS, en root, sur le VPS :
#   bash setup-vps.sh caisse.mondomaine.fr mon-email@exemple.fr
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage : bash setup-vps.sh <domaine> [email-certificat]" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then echo "À lancer en root (sudo)." >&2; exit 1; fi

APP_DIR=/opt/caisse-bluebird
WEB_DIR=/var/www/caisse-bluebird
DATA_DIR=/var/lib/caisse-bluebird
ENV_FILE=/etc/caisse-bluebird.env

echo "▶ Paquets système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx rsync curl ca-certificates ufw

echo "▶ Node.js"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "▶ Utilisateur et dossiers"
id -u caisse >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin caisse
mkdir -p "$APP_DIR" "$WEB_DIR" "$DATA_DIR"
chown -R caisse:caisse "$APP_DIR" "$DATA_DIR"
chown -R www-data:www-data "$WEB_DIR"

echo "▶ Mot de passe partagé du bar"
if [ -f "$ENV_FILE" ]; then
  echo "  (déjà défini dans $ENV_FILE — conservé)"
else
  read -rsp "  Choisis le mot de passe que les iPads saisiront : " PW; echo
  [ -n "$PW" ] || { echo "Mot de passe vide, abandon." >&2; exit 1; }
  cat > "$ENV_FILE" <<ENV
PORT=8787
DATA_DIR=$DATA_DIR
CAISSE_PASSWORD=$PW
ENV
  chmod 600 "$ENV_FILE"
fi

# Accès restreint de l'agent d'impression du Pi : lecture des bons de cuisine,
# écriture des seuls accusés. Tiré au sort — personne n'a à le retenir, il se
# copie-colle dans la configuration du Pi. Ajouté aussi aux installations
# antérieures, qui n'avaient qu'un seul niveau d'accès.
echo "▶ Mot de passe de l'agent d'impression"
if grep -q '^AGENT_PASSWORD=' "$ENV_FILE"; then
  echo "  (déjà défini — conservé)"
else
  AGENT_PW=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 28)
  printf 'AGENT_PASSWORD=%s\n' "$AGENT_PW" >> "$ENV_FILE"
  echo "  généré."
fi
echo "  À reporter sur le Raspberry Pi dans /etc/bluebird-impression.env :"
echo "    $(grep '^AGENT_PASSWORD=' "$ENV_FILE")"

echo "▶ Service systemd"
install -m 644 "$(dirname "$0")/caisse-bluebird.service" /etc/systemd/system/caisse-bluebird.service
systemctl daemon-reload
systemctl enable caisse-bluebird >/dev/null

echo "▶ nginx"
sed "s/__DOMAIN__/$DOMAIN/g" "$(dirname "$0")/nginx.conf.template" > /etc/nginx/sites-available/caisse-bluebird
ln -sf /etc/nginx/sites-available/caisse-bluebird /etc/nginx/sites-enabled/caisse-bluebird
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "▶ Pare-feu"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

echo "▶ Certificat HTTPS (Let's Encrypt)"
if [ -n "$EMAIL" ]; then
  certbot --nginx -d "$DOMAIN" --agree-tos -m "$EMAIL" --non-interactive --redirect || \
    echo "  ⚠ certbot a échoué — vérifie que $DOMAIN pointe bien vers ce VPS, puis relance : certbot --nginx -d $DOMAIN"
else
  certbot --nginx -d "$DOMAIN" --agree-tos --register-unsafely-without-email --non-interactive --redirect || \
    echo "  ⚠ certbot a échoué — vérifie que $DOMAIN pointe bien vers ce VPS, puis relance : certbot --nginx -d $DOMAIN"
fi

echo
echo "✅ VPS prêt. Envoie maintenant l'appli depuis le Mac :  bash deploy/deploy.sh"
