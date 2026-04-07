#!/bin/bash

# Deploy Dice Roller su demo.scunio.com

set -e

# ========================
# CONFIGURAZIONE PROGETTO
# ========================
PROJECT_NAME="dice"
PROJECT_DESCRIPTION="Dice Roller — web app per lanciare dadi RPG"

# ========================
# CONFIGURAZIONE SERVER
# ========================
SERVER="Contabo-root"
REMOTE_PATH="/var/www/demo.scunio.com/projects/${PROJECT_NAME}"

# Colori per output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# ========================
# VERIFICA PRE-DEPLOY
# ========================
echo -e "${BLUE}🚀 Deploy '${PROJECT_NAME}' su demo.scunio.com${NC}\n"

# Verifica index.html
if [ ! -f "index.html" ]; then
    echo -e "${YELLOW}⚠️  Attenzione: Nessun index.html trovato${NC}"
    read -p "Vuoi continuare comunque? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deploy annullato${NC}"
        exit 1
    fi
fi

# Informazioni deploy
echo -e "${BLUE}📋 Informazioni:${NC}"
echo -e "  Progetto:    ${PROJECT_NAME}"
echo -e "  Destinazione: ${REMOTE_PATH}"
echo -e "  URL:         http://demo.scunio.com/projects/${PROJECT_NAME}"
echo ""

# ========================
# DEPLOY
# ========================
echo -e "${YELLOW}📦 Sincronizzazione file...${NC}"

# Esclusioni
EXCLUDE_ARGS=(
    --exclude='.git'
    --exclude='.gitignore'
    --exclude='.DS_Store'
    --exclude='node_modules'
    --exclude='.env'
    --exclude='.env.local'
    --exclude='*.log'
    --exclude='.vscode'
    --exclude='.idea'
    --exclude='.claude'
    --exclude='CLAUDE.md'
    --exclude='README.md'
    --exclude='CHANGELOG.md'
    --exclude='package.json'
    --exclude='package-lock.json'
    --exclude='deploy-to-demo.sh'
    --exclude='*.sh'
)

rsync -avz --delete \
    "${EXCLUDE_ARGS[@]}" \
    ./ \
    "${SERVER}:${REMOTE_PATH}/"

echo -e "${GREEN}✅ File sincronizzati${NC}"

# Fix permessi
echo -e "${YELLOW}🔐 Sistemazione permessi...${NC}"
ssh ${SERVER} "chown -R www-data:www-data ${REMOTE_PATH} && \
               find ${REMOTE_PATH} -type d -exec chmod 755 {} \; && \
               find ${REMOTE_PATH} -type f -exec chmod 644 {} \;"

echo -e "${GREEN}✅ Permessi sistemati${NC}"

# ========================
# VERIFICA
# ========================
echo -e "\n${YELLOW}🔍 Verifica deploy...${NC}"
FILE_COUNT=$(ssh ${SERVER} "find ${REMOTE_PATH} -type f | wc -l")
DIR_SIZE=$(ssh ${SERVER} "du -sh ${REMOTE_PATH} | cut -f1")

echo -e "${GREEN}✅ Deploy completato!${NC}\n"

# Statistiche
echo -e "${BLUE}📊 Statistiche:${NC}"
echo -e "  File:       ${FILE_COUNT}"
echo -e "  Dimensione: ${DIR_SIZE}"
echo ""

# Link finale
echo -e "${GREEN}✨ Progetto online!${NC}"
echo -e "${YELLOW}🌐 http://demo.scunio.com/projects/${PROJECT_NAME}${NC}"
echo ""
