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
HTPASSWD=/etc/nginx/caisse-bluebird.htpasswd

echo "▶ Paquets système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx rsync curl ca-certificates ufw openssl

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

# Le site n'est plus public : nginx exige le mot de passe avant de livrer le
# moindre fichier (voir nginx.conf.template). C'est la MÊME phrase que celle de
# l'appli — l'équipe n'en retient qu'une. Le fichier est régénéré à chaque
# exécution, pour rattraper une installation antérieure ou un mot de passe
# modifié à la main dans $ENV_FILE.
echo "▶ Serrure nginx (mot de passe à l'entrée du site)"
CAISSE_PW=$(sed -n 's/^CAISSE_PASSWORD=//p' "$ENV_FILE" | head -n 1)
[ -n "$CAISSE_PW" ] || { echo "CAISSE_PASSWORD absent de $ENV_FILE, abandon." >&2; exit 1; }
# `-stdin` : le mot de passe ne passe pas par la ligne de commande, où `ps` le
# rendrait lisible par n'importe quel utilisateur de la machine.
HASH=$(printf '%s' "$CAISSE_PW" | openssl passwd -apr1 -stdin)
case "$HASH" in
  '$apr1$'*) ;;
  *) echo "openssl n'a pas produit d'empreinte apr1 — nginx refuserait la serrure." >&2; exit 1 ;;
esac
printf 'admin:%s\n' "$HASH" > "$HTPASSWD"
chmod 640 "$HTPASSWD"
chown root:www-data "$HTPASSWD"
echo "  identifiant « admin », mot de passe = celui du bar."

echo "▶ Outil de changement de mot de passe"
install -m 750 "$(dirname "$0")/caisse-motdepasse.sh" /usr/local/sbin/caisse-motdepasse
echo "  disponible : sudo caisse-motdepasse"

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

# Le mot de passe couvre tout le site ; certbot renouvelle en répondant lui-même
# sur /.well-known/acme-challenge/, avant la phase d'authentification de nginx.
# C'est vrai, mais ça se vérifie : un certificat qui expire coupe tout le bar.
echo "▶ Vérification du renouvellement automatique du certificat"
if certbot renew --dry-run >/dev/null 2>&1; then
  echo "  ✓ renouvellement OK malgré le mot de passe"
else
  echo "  ⚠ ÉCHEC du test de renouvellement — le certificat expirera dans 90 jours."
  echo "    Lance « certbot renew --dry-run » pour voir l'erreur avant d'oublier."
fi

echo
echo "✅ VPS prêt. Envoie maintenant l'appli depuis le Mac :  bash deploy/deploy.sh"
echo "   Le site demande désormais l'identifiant « admin » + le mot de passe du bar,"
echo "   puis la caisse le redemande une fois dans son écran de déverrouillage."
