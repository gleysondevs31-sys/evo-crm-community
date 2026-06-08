# =============================================================================
# ATTO FLOW Community — Makefile
# =============================================================================
# Usage: make [target]
# Run "make help" to see all available targets.
# =============================================================================

.DEFAULT_GOAL := help

# Colors
CYAN  := \033[36m
GREEN := \033[32m
RESET := \033[0m
YELLOW := \033[33m

LOCAL_SOURCE_READY := $(shell test -f evo-auth-service-community/Dockerfile \
	-a -f evo-ai-crm-community/docker/Dockerfile \
	-a -f evo-ai-frontend-community/Dockerfile \
	-a -f evo-ai-processor-community/Dockerfile \
	-a -f evo-ai-core-service-community/Dockerfile \
	-a -f evo-bot-runtime/Dockerfile && echo yes || echo no)

COMPOSE_FILE ?= $(if $(filter yes,$(LOCAL_SOURCE_READY)),docker-compose.yml,docker-compose.images.yaml)
COMPOSE := docker compose -f $(COMPOSE_FILE)

.PHONY: help setup start stop restart logs clean build status \
        seed seed-auth seed-crm \
        shell-auth shell-crm shell-core shell-processor shell-bot-runtime

## —— General ——————————————————————————————————————————————————————————————————

help: ## Show this help message
	@echo ""
	@echo "  $(CYAN)ATTO FLOW Community$(RESET) — Development Commands"
	@echo "  Compose file: $(COMPOSE_FILE)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(RESET) %s\n", $$1, $$2}'
	@echo ""

## —— Setup & Lifecycle ————————————————————————————————————————————————————————

setup: ## First-time setup: copy env, build/pull, start, seed
	@echo "$(CYAN)Setting up ATTO FLOW Community with $(COMPOSE_FILE)...$(RESET)"
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(GREEN)Created .env from .env.example$(RESET)"; \
	else \
		echo ".env already exists, skipping copy"; \
	fi
	@if [ "$(COMPOSE_FILE)" = "docker-compose.yml" ]; then \
		git submodule update --init --recursive; \
		$(COMPOSE) build; \
	else \
		echo "$(YELLOW)Local service Dockerfiles not found; using prebuilt Docker Hub images.$(RESET)"; \
		$(COMPOSE) pull; \
	fi
	$(COMPOSE) up -d postgres redis mailhog
	@echo "Waiting for database to be ready..."
	@until $(COMPOSE) exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do \
		sleep 2; \
	done
	@echo "$(GREEN)Database is ready!$(RESET)"
	@$(MAKE) seed
	$(COMPOSE) up -d
	@echo ""
	@echo "$(GREEN)============================================$(RESET)"
	@echo "$(GREEN)  ATTO FLOW Community is running!$(RESET)"
	@echo "$(GREEN)============================================$(RESET)"
	@echo ""
	@echo "  Frontend:      http://localhost:5173"
	@echo "  CRM API:      http://localhost:3000"
	@echo "  Auth API:     http://localhost:3001"
	@echo "  Processor:    http://localhost:8000"
	@echo "  Core API:     http://localhost:5555"
	@echo "  Bot Runtime:  http://localhost:8080"
	@echo "  Mailhog:      http://localhost:8025"
	@echo ""
	@echo "  First access: http://localhost:5173/setup"
	@echo "  Create your admin user via the setup wizard."
	@echo ""

start: ## Start all services
	$(COMPOSE) up -d

stop: ## Stop all services
	$(COMPOSE) down

restart: ## Restart all services
	$(COMPOSE) down
	$(COMPOSE) up -d

build: ## Rebuild local service images or pull prebuilt images
	@if [ "$(COMPOSE_FILE)" = "docker-compose.yml" ]; then \
		$(COMPOSE) build --no-cache; \
	else \
		echo "$(YELLOW)Local service Dockerfiles not found; pulling prebuilt images instead.$(RESET)"; \
		$(COMPOSE) pull; \
	fi

status: ## Show status of all services
	$(COMPOSE) ps

logs: ## Show logs (use SERVICE=name to filter, e.g. make logs SERVICE=evo-crm)
ifdef SERVICE
	$(COMPOSE) logs -f $(SERVICE)
else
	$(COMPOSE) logs -f
endif

clean: ## Stop services and remove all data volumes
	@echo "$(CYAN)This will delete all data (database, redis, etc). Are you sure?$(RESET)"
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	$(COMPOSE) down -v
	@echo "$(GREEN)Cleaned up.$(RESET)"

## —— Database & Seeds —————————————————————————————————————————————————————————

seed: seed-crm seed-auth ## Run all seeds (CRM schema first, then auth)

seed-crm: ## Create DB + load CRM master schema + mark auth migrations + seed CRM
	@echo "$(CYAN)Loading CRM schema (master)...$(RESET)"
	$(COMPOSE) run --rm evo-crm bundle exec rails db:create db:schema:load
	@echo "$(CYAN)Marking auth migrations as applied...$(RESET)"
	$(COMPOSE) run --rm evo-auth bundle exec rails runner \
		"Dir['db/migrate/*.rb'].sort.map { |f| File.basename(f).split('_').first }.each { |v| begin; ActiveRecord::Base.connection.schema_migration.create_version(v); rescue ActiveRecord::RecordNotUnique; end }"
	@echo "$(CYAN)Seeding CRM service...$(RESET)"
	$(COMPOSE) run --rm evo-crm bundle exec rails db:seed
	@echo "$(GREEN)CRM schema loaded and seeded.$(RESET)"

seed-auth: ## Seed the Auth service (creates default user)
	@echo "$(CYAN)Seeding Auth service...$(RESET)"
	$(COMPOSE) run --rm evo-auth bundle exec rails db:seed
	@echo "$(GREEN)Auth service seeded.$(RESET)"

## —— Shell Access —————————————————————————————————————————————————————————————

shell-auth: ## Open a shell in the Auth service container
	$(COMPOSE) exec evo-auth bash

shell-crm: ## Open a shell in the CRM service container
	$(COMPOSE) exec evo-crm bash

shell-core: ## Open a shell in the Core service container
	$(COMPOSE) exec evo-core sh

shell-processor: ## Open a shell in the Processor service container
	$(COMPOSE) exec evo-processor bash

shell-bot-runtime: ## Open a shell in the Bot Runtime service container
	$(COMPOSE) exec evo-bot-runtime sh
