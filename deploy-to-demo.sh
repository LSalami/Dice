#!/bin/bash

# Deploy Dice Roller (multiplayer) su demo.scunio.com
# - Sincronizza il codice in /opt/dice-roller
# - Installa Node 22 + pnpm se mancanti
# - Crea/aggiorna systemd unit dice-roller.service (porta 8420)
# - Inserisce/aggiorna location /projects/dice/ nel vhost nginx con proxy WebSocket
# - Riusa il certificato Let's Encrypt esistente di demo.scunio.com

set -euo pipefail

# ========================
# CONFIGURAZIONE
# ========================
PROJECT_NAME="dice"
SERVER="Contabo-root"
APP_DIR="/var/www/demo.scunio.com/projects/dice"
SERVICE_NAME="dice-roller"
PORT=8420
BASE_PATH="/projects/dice"
DOMAIN="demo.scunio.com"
NGINX_VHOST="/etc/nginx/sites-available/${DOMAIN}.conf"
URL="https://${DOMAIN}${BASE_PATH}/"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Deploy '${PROJECT_NAME}' (multiplayer) su ${DOMAIN}${NC}\n"
echo -e "${BLUE}📋 Configurazione:${NC}"
echo -e "  App dir:   ${APP_DIR}"
echo -e "  Servizio:  ${SERVICE_NAME} (127.0.0.1:${PORT})"
echo -e "  Sub-path:  ${BASE_PATH}"
echo -e "  URL:       ${URL}"
echo ""

# ========================
# 1) Sync sorgenti
# ========================
echo -e "${YELLOW}📦 Sync sorgenti via rsync...${NC}"
ssh "${SERVER}" "mkdir -p ${APP_DIR}"

rsync -avz --delete \
    --exclude='.git' \
    --exclude='.gitignore' \
    --exclude='.DS_Store' \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='*.log' \
    --exclude='.vscode' \
    --exclude='.idea' \
    --exclude='.claude' \
    --exclude='CLAUDE.md' \
    --exclude='README.md' \
    --exclude='deploy-to-demo.sh' \
    ./ "${SERVER}:${APP_DIR}/"

echo -e "${GREEN}✅ File sincronizzati${NC}"

# ========================
# 2) Genera blocco nginx in locale e copia in /tmp sul server
# ========================
NGINX_SNIPPET=$(cat <<EOF
    # >>> dice-roller >>>
    # Dice Roller multiplayer (Node + Socket.IO via systemd ${SERVICE_NAME}.service)
    location ${BASE_PATH}/ {
        proxy_pass http://127.0.0.1:${PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    # <<< dice-roller <<<
EOF
)

ssh "${SERVER}" "cat > /tmp/dice-roller-nginx.snippet" <<<"${NGINX_SNIPPET}"

# ========================
# 3) Setup runtime + servizio + nginx sul server
# ========================
echo -e "${YELLOW}⚙️  Setup runtime e servizio (lato server)...${NC}"

ssh "${SERVER}" APP_DIR="${APP_DIR}" SERVICE_NAME="${SERVICE_NAME}" PORT="${PORT}" \
                BASE_PATH="${BASE_PATH}" NGINX_VHOST="${NGINX_VHOST}" 'bash -s' <<'REMOTE'
set -euo pipefail

# --- Node 22 + pnpm ---
if ! command -v node >/dev/null 2>&1; then
  echo "→ Installo Node 22 (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "→ Abilito pnpm via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
fi
echo "  node $(node -v), pnpm $(pnpm -v)"

# --- Install deps ---
cd "${APP_DIR}"
if [ -f pnpm-lock.yaml ]; then
  pnpm install --prod --frozen-lockfile
else
  pnpm install --prod
fi
chown -R www-data:www-data "${APP_DIR}"

# --- systemd unit ---
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=Dice Roller multiplayer server (Node + Socket.IO)
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/server.js

Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=BASE_PATH=${BASE_PATH}

# Restart policy
User=www-data
Group=www-data
Restart=always
RestartSec=5
SyslogIdentifier=${SERVICE_NAME}

# Hardening
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null
systemctl restart "${SERVICE_NAME}"
sleep 1
systemctl is-active --quiet "${SERVICE_NAME}" || { echo "Servizio non attivo"; journalctl -u "${SERVICE_NAME}" -n 30 --no-pager; exit 1; }

# Health check locale
if ! curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then
  echo "Health check porta ${PORT} fallito"
  exit 1
fi
echo "  ✓ Servizio ${SERVICE_NAME} attivo su :${PORT}"

# --- Nginx vhost patch ---
TS=$(date +%Y%m%d-%H%M%S)
cp "${NGINX_VHOST}" "${NGINX_VHOST}.bak-${TS}"

# Rimuovi qualsiasi precedente blocco delimitato dai marker
awk '
  /# >>> dice-roller >>>/ { skip=1; next }
  /# <<< dice-roller <<</ { skip=0; next }
  skip != 1 { print }
' "${NGINX_VHOST}" > "${NGINX_VHOST}.tmp"

# Rimuovi anche un eventuale vecchio "location /projects/dice/ { ... }" senza marker
# (versione statica). Solo se non già rimosso dai marker sopra.
python3 - "${NGINX_VHOST}.tmp" "${BASE_PATH}" <<'PY'
import sys, re
path, base = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = f.read()
# Rimuove un singolo blocco location <base>/ { ... } (no nested braces atteso)
pattern = re.compile(r'\n[ \t]*location\s+' + re.escape(base) + r'/\s*\{[^{}]*\}\n', re.DOTALL)
data, n = pattern.subn('\n', data)
with open(path, 'w') as f:
    f.write(data)
print(f"  rimossi {n} blocchi location {base}/ preesistenti")
PY

# Inserisci il nuovo blocco prima di "location /projects/ {"
SNIPPET=$(cat /tmp/dice-roller-nginx.snippet)
awk -v snippet="${SNIPPET}" '
  /location\s+\/projects\/\s*\{/ && !inserted {
    print snippet
    print ""
    inserted=1
  }
  { print }
' "${NGINX_VHOST}.tmp" > "${NGINX_VHOST}.new"

mv "${NGINX_VHOST}.new" "${NGINX_VHOST}"
rm -f "${NGINX_VHOST}.tmp"

# Validazione + reload (rollback se fallisce)
if ! nginx -t 2>/tmp/nginx-test.log; then
  echo "❌ nginx -t fallito, ripristino backup"
  cat /tmp/nginx-test.log
  cp "${NGINX_VHOST}.bak-${TS}" "${NGINX_VHOST}"
  exit 1
fi
systemctl reload nginx
echo "  ✓ nginx ricaricato (backup: ${NGINX_VHOST}.bak-${TS})"
REMOTE

echo -e "${GREEN}✅ Servizio + nginx configurati${NC}"

# ========================
# 4) Verifica finale via HTTPS
# ========================
echo -e "\n${YELLOW}🔍 Verifica HTTPS pubblica...${NC}"
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "${URL}")
SOCKET_CODE=$(curl -s -o /dev/null -w '%{http_code}' "${URL}socket.io/socket.io.js")
echo -e "  GET ${URL} → ${HTTP_CODE}"
echo -e "  GET ${URL}socket.io/socket.io.js → ${SOCKET_CODE}"

if [ "${HTTP_CODE}" = "200" ] && [ "${SOCKET_CODE}" = "200" ]; then
  echo -e "\n${GREEN}✨ Online!${NC}"
  echo -e "${YELLOW}🌐 ${URL}${NC}\n"
else
  echo -e "\n${RED}⚠️  Verifica fallita (status ${HTTP_CODE} / socket ${SOCKET_CODE})${NC}"
  exit 1
fi
