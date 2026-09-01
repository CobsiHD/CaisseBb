#!/usr/bin/env bash
# setup-pi.sh — installe l'agent d'impression sur le Raspberry Pi de la cuisine.
# À lancer UNE FOIS, en root, sur le Pi :
#   sudo bash setup-pi.sh
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }

APP_DIR=/opt/caisse-print
DATA_DIR=/var/lib/caisse-print
ENV_FILE=/etc/caisse-print.env
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "▶ Node.js"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 18 ]; then
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "▶ Utilisateur et dossiers"
id -u caisse-print >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin caisse-print
usermod -aG lp caisse-print          # accès à l'imprimante USB
mkdir -p "$APP_DIR" "$DATA_DIR"
install -m 644 "$HERE/print-agent.js" "$APP_DIR/print-agent.js"
chown -R caisse-print:caisse-print "$APP_DIR" "$DATA_DIR"

echo "▶ Détection de l'imprimante"
if [ -e /dev/usb/lp0 ]; then
  echo "  imprimante USB trouvée : /dev/usb/lp0"
  DEFAUT_IMP="usb:/dev/usb/lp0"
else
  echo "  aucune imprimante USB détectée (/dev/usb/lp0 absent)."
  echo "  Pour une imprimante réseau, réponds : tcp:ADRESSE-IP:9100"
  DEFAUT_IMP=""
fi

if [ -f "$ENV_FILE" ]; then
  echo "▶ Configuration déjà présente dans $ENV_FILE — conservée"
else
  echo "▶ Configuration"
  read -rp "  Adresse de la caisse [https://caisse.bluebird-bar.fr] : " URL
  URL="${URL:-https://caisse.bluebird-bar.fr}"
  read -rsp "  Mot de passe AGENT (pas celui du bar) : " PW; echo
  [ -n "$PW" ] || { echo "Mot de passe vide, abandon." >&2; exit 1; }
  read -rp "  Sortie imprimante [${DEFAUT_IMP:-tcp:192.168.1.50:9100}] : " IMP
  IMP="${IMP:-${DEFAUT_IMP:-tcp:192.168.1.50:9100}}"
  read -rp "  Largeur papier — 42 pour 80 mm, 32 pour 58 mm [42] : " LARG
  LARG="${LARG:-42}"

  umask 077
  cat > "$ENV_FILE" <<ENV
CAISSE_URL=$URL
AGENT_PASSWORD=$PW
PRINTER=$IMP
STATE_FILE=$DATA_DIR/state.json
WIDTH=$LARG
POLL_MS=3000
CUT=partiel
ENV
  chmod 600 "$ENV_FILE"
fi

echo "▶ Service systemd"
install -m 644 "$HERE/caisse-print.service" /etc/systemd/system/caisse-print.service
systemctl daemon-reload
systemctl enable caisse-print >/dev/null
systemctl restart caisse-print
sleep 2

if systemctl is-active --quiet caisse-print; then
  echo
  echo "✅ Agent d'impression actif."
  echo "   Journal en direct :  journalctl -u caisse-print -f"
  echo "   Test : envoie un bon depuis un iPad, il doit sortir dans les 3 secondes."
else
  echo "❌ L'agent n'a pas démarré :"
  journalctl -u caisse-print -n 30 --no-pager
  exit 1
fi
