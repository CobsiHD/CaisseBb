#!/usr/bin/env bash
# caisse-motdepasse — change le mot de passe du bar, des DEUX serrures à la fois.
#
# Installé sur le VPS par setup-vps.sh sous /usr/local/sbin/caisse-motdepasse.
# À lancer en root :  sudo caisse-motdepasse
#
# La caisse a deux serrures qui partagent la même phrase : celle de nginx (qui
# refuse de livrer les fichiers) et celle de l'appli (qui refuse de s'ouvrir).
# Les changer séparément, c'est se retrouver avec une caisse qui demande deux
# mots de passe différents — d'où ce script, qui fait les deux et rien d'autre.
set -euo pipefail

ENV_FILE=/etc/caisse-bluebird.env
HTPASSWD=/etc/nginx/caisse-bluebird.htpasswd
USER_NAME=admin

if [ "$(id -u)" -ne 0 ]; then echo "À lancer en root (sudo caisse-motdepasse)." >&2; exit 1; fi
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE introuvable — la caisse n'est pas installée ici." >&2; exit 1; }

read -rsp "Nouveau mot de passe du bar : " PW; echo
[ -n "$PW" ] || { echo "Mot de passe vide, abandon." >&2; exit 1; }
read -rsp "Répète-le pour confirmer      : " PW2; echo
[ "$PW" = "$PW2" ] || { echo "Les deux saisies diffèrent, abandon." >&2; exit 1; }

# Serrure de l'appli (jeton délivré par /api/login).
# Le mot de passe peut contenir n'importe quoi : on réécrit la ligne en Python
# plutôt qu'avec un sed, dont les caractères spéciaux feraient un carnage.
python3 - "$ENV_FILE" "$PW" <<'PY'
import sys
path, pw = sys.argv[1], sys.argv[2]
lines = open(path, encoding='utf-8').read().splitlines()
out, seen = [], False
for line in lines:
    if line.startswith('CAISSE_PASSWORD='):
        out.append('CAISSE_PASSWORD=' + pw); seen = True
    else:
        out.append(line)
if not seen:
    out.append('CAISSE_PASSWORD=' + pw)
open(path, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
PY
chmod 600 "$ENV_FILE"

# Serrure de nginx (HTTP Basic). `-stdin` évite de faire passer le mot de passe
# par la ligne de commande, où n'importe qui pourrait le lire dans `ps`.
HASH=$(printf '%s' "$PW" | openssl passwd -apr1 -stdin)
case "$HASH" in
  '$apr1$'*) ;;
  *) echo "openssl n'a pas produit d'empreinte apr1 — rien n'a été changé." >&2; exit 1 ;;
esac
printf '%s:%s\n' "$USER_NAME" "$HASH" > "$HTPASSWD"
chmod 640 "$HTPASSWD"
chown root:www-data "$HTPASSWD"

nginx -t >/dev/null
systemctl reload nginx
systemctl restart caisse-bluebird

echo
echo "✅ Mot de passe changé."
echo "   Sur chaque iPad : Safari demandera l'identifiant « $USER_NAME » et ce mot de passe,"
echo "   puis la caisse le redemandera une fois dans son écran de déverrouillage."
echo
echo "   Les iPads déjà connectés gardent leur jeton d'appli, mais Safari, lui,"
echo "   redemandera le nouveau mot de passe. Pour tous les déconnecter, il faut"
echo "   en plus supprimer le secret de signature :"
echo "     rm /var/lib/caisse-bluebird/secret && systemctl restart caisse-bluebird"
