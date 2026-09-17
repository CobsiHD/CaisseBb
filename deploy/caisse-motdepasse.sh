#!/usr/bin/env bash
# caisse-motdepasse — change le mot de passe du bar.
#
# Installé sur le VPS par setup-vps.sh sous /usr/local/sbin/caisse-motdepasse.
# À lancer en root :  sudo caisse-motdepasse
#
# Les deux serrures — celle de nginx, qui refuse de livrer les fichiers, et
# celle de l'appli, qui refuse de s'ouvrir — puisent désormais à la même
# source : CAISSE_PASSWORD et le jeton signé qu'il délivre. Il n'y a donc plus
# qu'une seule chose à changer ici ; nginx n'a plus de fichier à lui.
set -euo pipefail

ENV_FILE=/etc/caisse-bluebird.env

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

# Redémarrer le serveur suffit : il relit CAISSE_PASSWORD, et c'est lui que
# nginx interroge pour valider les cookies (auth_request → /api/gate-check).
# nginx, lui, n'a rien à recharger — il ne connaît plus aucun mot de passe.
systemctl restart caisse-bluebird

echo
echo "✅ Mot de passe changé."
echo "   Les iPads déjà connectés ne bougent pas : leur cookie et leur jeton sont"
echo "   signés par un secret que ce changement ne touche pas. Seule une nouvelle"
echo "   connexion réclamera la nouvelle phrase."
echo
echo "   Pour TOUS les déconnecter (iPad égaré, salarié parti), supprime en plus"
echo "   le secret de signature :"
echo "     rm /var/lib/caisse-bluebird/secret && systemctl restart caisse-bluebird"
