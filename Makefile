SHELL := /bin/sh
.DEFAULT_GOAL := help

COMPOSE ?= docker compose
DOCKER ?= docker
ENV_FILE ?= .env
WAIT_TIMEOUT ?= 180

INFRA_COMPOSE = $(COMPOSE) --env-file $(ENV_FILE) -p cqa-infra -f docker-compose.infra.yml
BACKEND_COMPOSE = $(COMPOSE) --env-file $(ENV_FILE) -p cqa-backend -f docker-compose.backend.yml
FRONTEND_COMPOSE = $(COMPOSE) --env-file $(ENV_FILE) -p cqa-frontend -f docker-compose.frontend.yml

INFRA_SERVICES := mongodb redis redpanda redpanda-console
BACKEND_SERVICES := api pipeline-worker audio-worker
FRONTEND_SERVICES := web

.PHONY: help init build up down restart status health logs ai-status infra-up backend-up frontend-up wait-infra wait-backend wait-frontend wait-services

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "CQA commands:\n\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

init: ## Create .env and the shared Docker network
	@test -f .env.example || { echo "ERROR: .env.example is missing" >&2; exit 1; }
	@if test -f $(ENV_FILE); then echo "$(ENV_FILE) already exists; leaving it unchanged"; else cp .env.example $(ENV_FILE); echo "Created $(ENV_FILE)"; fi
	@$(DOCKER) network inspect cqa_net >/dev/null 2>&1 || $(DOCKER) network create cqa_net >/dev/null
	@echo "Shared network cqa_net is ready"

build: ## Build the backend and frontend images
	@test -f $(ENV_FILE) || { echo "ERROR: run 'make init' first" >&2; exit 1; }
	$(BACKEND_COMPOSE) build
	$(FRONTEND_COMPOSE) build

up: ## Start infrastructure, wait, then start backend and frontend
	@$(MAKE) --no-print-directory init
	@$(MAKE) --no-print-directory infra-up
	@$(MAKE) --no-print-directory wait-infra
	@$(MAKE) --no-print-directory backend-up
	@$(MAKE) --no-print-directory wait-backend
	@$(MAKE) --no-print-directory frontend-up
	@$(MAKE) --no-print-directory wait-frontend
	@$(MAKE) --no-print-directory health

down: ## Stop and remove all containers, preserving named volumes
	-@$(FRONTEND_COMPOSE) down --remove-orphans
	-@$(BACKEND_COMPOSE) down --remove-orphans
	-@$(INFRA_COMPOSE) down --remove-orphans

restart: ## Recreate the complete stack in dependency order
	@$(MAKE) --no-print-directory down
	@$(MAKE) --no-print-directory up

status: ## Show all service states
	@echo "== Infrastructure =="
	@$(INFRA_COMPOSE) ps -a
	@echo "== Backend =="
	@$(BACKEND_COMPOSE) ps -a
	@echo "== Frontend =="
	@$(FRONTEND_COMPOSE) ps -a

health: ## Return nonzero unless every service is running and healthy
	@set -eu; \
	check_project() { \
		compose_cmd="$$1"; shift; \
		for service in "$$@"; do \
			container_id=$$(eval "$$compose_cmd ps -q $$service"); \
			test -n "$$container_id" || { echo "UNHEALTHY: $$service is missing" >&2; exit 1; }; \
			running=$$($(DOCKER) inspect --format '{{.State.Running}}' "$$container_id"); \
			test "$$running" = true || { echo "UNHEALTHY: $$service is not running" >&2; exit 1; }; \
			state=$$($(DOCKER) inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing-healthcheck{{end}}' "$$container_id"); \
			test "$$state" = healthy || { echo "UNHEALTHY: $$service status=$$state" >&2; exit 1; }; \
			echo "HEALTHY: $$service"; \
		done; \
	}; \
	check_project '$(INFRA_COMPOSE)' $(INFRA_SERVICES); \
	check_project '$(BACKEND_COMPOSE)' $(BACKEND_SERVICES); \
	check_project '$(FRONTEND_COMPOSE)' $(FRONTEND_SERVICES)

logs: ## Stream logs from every Compose project
	@set -eu; \
	trap 'kill $${infra_pid:-} $${backend_pid:-} $${frontend_pid:-} 2>/dev/null || true' INT TERM EXIT; \
	$(INFRA_COMPOSE) logs -f --tail=100 & infra_pid=$$!; \
	$(BACKEND_COMPOSE) logs -f --tail=100 & backend_pid=$$!; \
	$(FRONTEND_COMPOSE) logs -f --tail=100 & frontend_pid=$$!; \
	wait

ai-status: ## Validate configured Cloudflare tokens and Workers AI model access without inference
	@cd backend && npm run ai:status

infra-up:
	$(INFRA_COMPOSE) up -d

backend-up:
	$(BACKEND_COMPOSE) up -d

frontend-up:
	$(FRONTEND_COMPOSE) up -d

wait-infra:
	@$(MAKE) --no-print-directory wait-services COMPOSE_CMD='$(INFRA_COMPOSE)' SERVICES='$(INFRA_SERVICES)'

wait-backend:
	@$(MAKE) --no-print-directory wait-services COMPOSE_CMD='$(BACKEND_COMPOSE)' SERVICES='$(BACKEND_SERVICES)'

wait-frontend:
	@$(MAKE) --no-print-directory wait-services COMPOSE_CMD='$(FRONTEND_COMPOSE)' SERVICES='$(FRONTEND_SERVICES)'

wait-services:
	@set -eu; \
	deadline=$$(( $$(date +%s) + $(WAIT_TIMEOUT) )); \
	for service in $(SERVICES); do \
		while :; do \
			container_id=$$($(COMPOSE_CMD) ps -q $$service); \
			if test -n "$$container_id"; then \
				state=$$($(DOCKER) inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing-healthcheck{{end}}' "$$container_id"); \
				test "$$state" = healthy && { echo "READY: $$service"; break; }; \
				test "$$state" = unhealthy -o "$$state" = missing-healthcheck && { echo "ERROR: $$service status=$$state" >&2; exit 1; }; \
			fi; \
			test $$(date +%s) -lt $$deadline || { echo "ERROR: timeout waiting for $$service" >&2; exit 1; }; \
			sleep 2; \
		done; \
	done
