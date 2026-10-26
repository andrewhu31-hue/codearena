#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu 22.04/24.04 server (run as root):
#
#   curl -fsSL https://raw.githubusercontent.com/andrewhu31-hue/codearena/<branch>/deploy/setup.sh | bash -s -- <branch>
#
# Optional: CORS_ORIGIN=https://your-site.vercel.app (before `bash`) sets the
# website address on first run; later, edit it in /opt/codearena/.env.
# Installs Docker, clones the repo to /opt/codearena, writes .env with fresh
# secrets (kept on later runs), and starts API + judge + Postgres + Redis +
# Caddy (HTTPS). Safe to re-run: it pulls the branch and rebuilds.
set -euo pipefail

BRANCH="${1:-main}"
REPO="https://github.com/andrewhu31-hue/codearena.git"
DIR=/opt/codearena

log() { printf '\n==> %s\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -d "$DIR/.git" ]; then
  log "Cloning $REPO ($BRANCH)"
  git clone --branch "$BRANCH" "$REPO" "$DIR"
else
  log "Updating to latest $BRANCH"
  git -C "$DIR" fetch origin "$BRANCH"
  git -C "$DIR" checkout -B "$BRANCH" "origin/$BRANCH"
fi
cd "$DIR"

if [ ! -f .env ]; then
  log "Writing .env with new secrets"
  ip=$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')
  db_pw=$(openssl rand -hex 24)
  cat > .env <<ENV
POSTGRES_USER=codearena
POSTGRES_PASSWORD=$db_pw
POSTGRES_DB=codearena
DATABASE_URL=postgresql://codearena:$db_pw@postgres:5432/codearena
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d '\n')
JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
# Public HTTPS name for the API. <ip>.sslip.io works without buying a domain.
API_DOMAIN=api.${ip//./-}.sslip.io
# The website's address(es), comma-separated (Vercel URL, custom domain).
CORS_ORIGIN=${CORS_ORIGIN:-https://codearena.vercel.app}
GENERAL_RATE_LIMIT_MAX=1000
JUDGE_WORKER_REPLICAS=1
WORKER_CONCURRENCY=2
# Optional: enables AI hints and code review.
ANTHROPIC_API_KEY=
SEED_PASSWORD=$(openssl rand -base64 12 | tr -d '\n/+=')
ENV
  chmod 600 .env
fi

log "Pre-pulling judge sandbox images"
for img in python:3.12-slim node:20-slim gcc:13; do docker pull -q "$img"; done

mkdir -p .judge-workspaces
log "Building and starting services"
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build

api_domain=$(grep '^API_DOMAIN=' .env | cut -d= -f2)
log "Done. API: https://$api_domain/health (certificate can take a minute on first start)"
echo "Seed demo problems once with:"
echo "  cd $DIR && docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml run --rm seed"
