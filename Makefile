.PHONY: setup dev server app test lint

## setup: install server (uv) and app (pnpm) dependencies
setup:
	cd server && uv sync
	cd app && pnpm install

## dev: run the API (:8000) and the web app (:3000) together
dev:
	$(MAKE) -j2 server app

server:
	cd server && uv run uvicorn main:app --reload --port 8000

app:
	cd app && pnpm dev

## test: server unit/API tests, then app type-check
test:
	cd server && uv run pytest
	cd app && pnpm typecheck

## lint: ruff (server) and eslint (app)
lint:
	cd server && uv run ruff check . && uv run ruff format --check .
	cd app && pnpm lint
