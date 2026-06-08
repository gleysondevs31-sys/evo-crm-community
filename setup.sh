#!/usr/bin/env bash
# =============================================================================
# Evo CRM Community — Interactive Setup Script
# =============================================================================
# This script sets up the entire Evo CRM platform from scratch.
# It checks prerequisites, builds Docker images, seeds the database,
# and starts all services.
#
# Usage:
#   bash setup.sh
# =============================================================================

set -e

# ---------------------------------------------------------------------------
# Colors (with fallback for no-color terminals)
# ---------------------------------------------------------------------------
if [ -t 1 ] && command -v tput > /dev/null 2>&1; then
  GREEN=$(tput setaf 2)
  CYAN=$(tput setaf 6)
  RED=$(tput setaf 1)
  YELLOW=$(tput setaf 3)
  BOLD=$(tput bold)
  RESET=$(tput sgr0)
else
  GREEN="" CYAN="" RED="" YELLOW="" BOLD="" RESET=""
fi

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
info()    { echo "${CYAN}[INFO]${RESET}  $1"; }
success() { echo "${GREEN}[OK]${RESET}    $1"; }
warn()    { echo "${YELLOW}[WARN]${RESET}  $1"; }
fail()    { echo "${RED}[ERROR]${RESET} $1"; exit 1; }

spinner() {
  local pid=$1
  local msg=$2
  local spin='|/-\'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i+1) % 4 ))
    printf "\r${CYAN}[....]${RESET} %s %s" "$msg" "${spin:$i:1}"
    sleep 0.3
  done
  printf "\r${GREEN}[OK]${RESET}    %s   \n" "$msg"
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo ""
echo "${GREEN}${BOLD}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║         ATTO FLOW Community Setup          ║"
echo "  ║   Modular SaaS CRM, WhatsApp and AI       ║"
echo "  ╚═══════════════════════════════════════════╝"
echo "${RESET}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Check prerequisites
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

# Git
if command -v git > /dev/null 2>&1; then
  success "Git found: $(git --version)"
else
  fail "Git is not installed. Install it from https://git-scm.com/downloads"
fi

# Docker
if command -v docker > /dev/null 2>&1; then
  success "Docker found: $(docker --version)"
else
  fail "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
fi

# Docker Compose (v2)
if docker compose version > /dev/null 2>&1; then
  success "Docker Compose found: $(docker compose version --short)"
else
  fail "Docker Compose v2 not found. Please update Docker Desktop to the latest version."
fi

# Docker daemon running
if docker info > /dev/null 2>&1; then
  success "Docker daemon is running"
else
  fail "Docker daemon is not running. Please start Docker Desktop and try again."
fi

echo ""

# ---------------------------------------------------------------------------
# Step 2: Initialize submodules
# ---------------------------------------------------------------------------
info "Checking Git submodules..."

SUBMODULE_DIRS=(
  "evo-auth-service-community"
  "evo-ai-crm-community"
  "evo-ai-frontend-community"
  "evo-ai-processor-community"
  "evo-ai-core-service-community"
  "evo-bot-runtime"
)

has_local_sources() {
  [ -f "evo-auth-service-community/Dockerfile" ] &&
  [ -f "evo-ai-crm-community/docker/Dockerfile" ] &&
  [ -f "evo-ai-frontend-community/Dockerfile" ] &&
  [ -f "evo-ai-processor-community/Dockerfile" ] &&
  [ -f "evo-ai-core-service-community/Dockerfile" ] &&
  [ -f "evo-bot-runtime/Dockerfile" ]
}

COMPOSE_FILE="docker-compose.yml"

if has_local_sources; then
  success "Submodules already initialized"
else
  info "Local service Dockerfiles not found. Trying to initialize submodules..."
  if git submodule update --init --recursive && has_local_sources; then
    success "Submodules initialized"
  else
    warn "Submodules are unavailable or incomplete. Falling back to prebuilt Docker Hub images."
    COMPOSE_FILE="docker-compose.images.yaml"
  fi
fi

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

info "Using compose file: $COMPOSE_FILE"

echo ""

# ---------------------------------------------------------------------------
# Step 3: Configure environment
# ---------------------------------------------------------------------------
info "Configuring environment..."

if [ -f .env ]; then
  if [ "${FORCE_ENV_DEFAULTS:-false}" = "true" ]; then
    cp .env.example .env
    success "Overwrote .env with defaults because FORCE_ENV_DEFAULTS=true"
  else
    success "Keeping existing .env"
  fi
else
  cp .env.example .env
  success "Created .env from .env.example"
fi

echo ""

# ---------------------------------------------------------------------------
# Step 4: Build or pull Docker images
# ---------------------------------------------------------------------------
if [ "$COMPOSE_FILE" = "docker-compose.yml" ]; then
  info "Building Docker images (this takes 5-15 minutes on first run)..."
  echo ""
  compose build
  echo ""
  success "All images built successfully"
else
  info "Pulling prebuilt Docker images..."
  echo ""
  compose pull
  echo ""
  success "All images pulled successfully"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 5: Start infrastructure (Postgres + Redis)
# ---------------------------------------------------------------------------
info "Starting database and cache..."
compose up -d postgres redis mailhog

info "Waiting for PostgreSQL to be ready..."
retries=0
max_retries=30
until compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
  retries=$((retries + 1))
  if [ "$retries" -ge "$max_retries" ]; then
    fail "PostgreSQL did not become ready in time. Check: docker compose -f $COMPOSE_FILE logs postgres"
  fi
  sleep 2
done
success "PostgreSQL is ready"

info "Waiting for Redis to be ready..."
retries=0
until compose exec -T redis redis-cli -a evoai_redis_pass ping > /dev/null 2>&1; do
  retries=$((retries + 1))
  if [ "$retries" -ge "$max_retries" ]; then
    fail "Redis did not become ready in time. Check: docker compose -f $COMPOSE_FILE logs redis"
  fi
  sleep 2
done
success "Redis is ready"

echo ""

# ---------------------------------------------------------------------------
# Step 6: Seed Auth service (must be first)
# ---------------------------------------------------------------------------
info "Seeding Auth service (creating default account and user)..."
compose run --rm evo-auth sh -c "bundle exec rails db:create && bundle exec rails db:migrate && bundle exec rails db:seed"
success "Auth service seeded"

echo ""

# ---------------------------------------------------------------------------
# Step 7: Seed CRM service
# ---------------------------------------------------------------------------
info "Seeding CRM service (creating default inbox)..."
compose run --rm evo-crm sh -c "bundle exec rails db:prepare && bundle exec rails db:seed"
success "CRM service seeded"

echo ""

# ---------------------------------------------------------------------------
# Step 8: Start all services
# ---------------------------------------------------------------------------
info "Starting all services..."
compose up -d

echo ""
info "Waiting for services to become healthy (this may take 1-2 minutes)..."
sleep 10

echo ""
echo "${GREEN}${BOLD}"
echo "  ╔═══════════════════════════════════════════════════════╗"
echo "  ║           ATTO FLOW Community is running!                ║"
echo "  ╚═══════════════════════════════════════════════════════╝"
echo "${RESET}"
echo ""
echo "  ${BOLD}Service URLs:${RESET}"
echo "  ─────────────────────────────────────────────"
echo "  Frontend:      ${CYAN}http://localhost:5173${RESET}"
echo "  CRM API:      ${CYAN}http://localhost:3000${RESET}"
echo "  Auth API:     ${CYAN}http://localhost:3001${RESET}"
echo "  Processor:    ${CYAN}http://localhost:8000${RESET}"
echo "  Core API:     ${CYAN}http://localhost:5555${RESET}"
echo "  Bot Runtime:  ${CYAN}http://localhost:8080${RESET}"
echo "  Mailhog:      ${CYAN}http://localhost:8025${RESET}  (email testing)"
echo ""
echo "  ${BOLD}Default Login:${RESET}"
echo "  ─────────────────────────────────────────────"
echo "  Email:       ${GREEN}support@evo-auth-service-community.com${RESET}"
echo "  Password:    ${GREEN}Password@123${RESET}"
echo ""
echo "  ${BOLD}Useful Commands:${RESET}"
echo "  ─────────────────────────────────────────────"
echo "  make status   — Check service status"
echo "  make logs     — View logs (all services)"
echo "  make stop     — Stop all services"
echo "  make start    — Start all services"
echo "  make clean    — Remove all data and start fresh"
echo ""
echo "  ${BOLD}Documentation:${RESET}"
echo "  ─────────────────────────────────────────────"
echo "  Setup Guide:       docs/SETUP-GUIDE.md"
echo "  Troubleshooting:   docs/TROUBLESHOOTING.md"
echo "  Contributing:      CONTRIBUTING.md"
echo ""
