# LyricsFlip developer commands. Run `make help` for the target list.
# Everything runs from the repository root; paths are relative to this file.

.DEFAULT_GOAL := help
SHELL := /bin/bash

COMPOSE ?= docker compose
LOCAL_RPC_URL ?= http://localhost:8000/soroban/rpc
LOCAL_FRIENDBOT_URL ?= http://localhost:8000/friendbot
LOCAL_PASSPHRASE ?= Standalone Network ; February 2017
KEY_NAME ?= me

.PHONY: help dev contracts deploy-local seed-local frontend backend test lint

help: ## List the available targets
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z_-]+:.*## / { printf "  %-14s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\nDefault target: help\n'

dev: ## Start the local quickstart + backend services and install dependencies
	npm install
	@if command -v rustup >/dev/null 2>&1; then rustup target add wasm32v1-none; fi
	$(COMPOSE) --profile soroban up -d postgres redis mailpit soroban
	@echo "Waiting for the local Soroban RPC at $(LOCAL_RPC_URL) ..."
	@for i in $$(seq 1 60); do \
		if curl -sf -X POST -H 'Content-Type: application/json' \
			-d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
			$(LOCAL_RPC_URL) | grep -q healthy; then \
			echo "Soroban RPC is ready."; \
			break; \
		fi; \
		if [ "$$i" -eq 60 ]; then \
			echo "Soroban RPC did not become healthy; check: $(COMPOSE) logs soroban" >&2; \
			exit 1; \
		fi; \
		sleep 2; \
	done
	@if ! stellar keys address $(KEY_NAME) >/dev/null 2>&1; then \
		stellar keys generate --global $(KEY_NAME); \
	fi
	@addr=$$(stellar keys address $(KEY_NAME)); \
		if ! curl -sf "$(LOCAL_FRIENDBOT_URL)?addr=$$addr" >/dev/null; then \
			echo "Friendbot could not fund $$addr (already funded?)"; \
		fi

contracts: ## Format-check, test, and build the Soroban contracts
	cd onchain && cargo fmt --check
	cd onchain && cargo test
	cd onchain && cargo build --target wasm32v1-none --release

deploy-local: ## Build and deploy both contracts to the local quickstart network
	bash onchain/scripts/deploy.sh local

seed-local: ## Seed the local game contract with the song catalogue
	bash onchain/scripts/seed-cards.sh local

frontend: ## Start the Next.js dev server on http://localhost:3000
	npm --prefix frontend run dev

backend: ## Start the NestJS API on http://localhost:4000
	npm --prefix backend run start:dev

test: ## Run the test suites for contracts, frontend, and backend
	cd onchain && cargo test
	npm --prefix frontend test
	npm --prefix backend test

lint: ## Lint contracts (fmt + clippy), frontend, and backend
	cd onchain && cargo fmt --check && cargo clippy --all-targets -- -D warnings
	npm run lint
