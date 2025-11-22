.PHONY: help setup dev build start test lint format clean docker-up docker-down docker-logs db-studio db-migrate db-push db-generate workers

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Initial project setup
	@./scripts/setup.sh

dev: ## Start development server
	@npm run dev

build: ## Build for production
	@npm run build

start: ## Start production server
	@npm run start

test: ## Run tests
	@npm test

lint: ## Run linter
	@npm run lint

format: ## Format code
	@npm run format

clean: ## Clean build artifacts and node_modules
	@rm -rf dist node_modules logs/*.log
	@echo "✅ Cleaned build artifacts"

docker-up: ## Start Docker services
	@docker-compose up -d
	@echo "✅ Docker services started"

docker-down: ## Stop Docker services
	@docker-compose down
	@echo "✅ Docker services stopped"

docker-logs: ## View Docker logs
	@docker-compose logs -f

docker-reset: ## Reset Docker services and volumes
	@docker-compose down -v
	@docker-compose up -d
	@echo "✅ Docker services reset"

db-studio: ## Open Prisma Studio
	@npm run db:studio

db-migrate: ## Run database migrations
	@npm run db:migrate

db-push: ## Push schema to database
	@npm run db:push

db-generate: ## Generate Prisma client
	@npm run db:generate

workers: ## Start all workers in background
	@echo "Starting workers..."
	@npm run worker:verifier &
	@npm run worker:prover &
	@echo "✅ Workers started in background"

install: ## Install dependencies
	@npm install
	@echo "✅ Dependencies installed"

kafka-ui: ## Open Kafka UI in browser
	@open http://localhost:8080 || xdg-open http://localhost:8080 || echo "Open http://localhost:8080 in your browser"

minio-ui: ## Open MinIO console in browser
	@open http://localhost:9001 || xdg-open http://localhost:9001 || echo "Open http://localhost:9001 in your browser"

api: ## Open API in browser
	@open http://localhost:3000/health || xdg-open http://localhost:3000/health || echo "Open http://localhost:3000/health in your browser"

all: setup docker-up db-generate db-push ## Setup everything and start services
	@echo "✨ Everything is ready!"
	@echo "Run 'make dev' to start the development server"
