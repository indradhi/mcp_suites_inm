DC_BASE = -f docker-compose.yml
DC_DEV  = $(DC_BASE) -f docker-compose.dev.yml
DC_PROD = $(DC_BASE) -f docker-compose.prod.yml

.PHONY: dev prod down logs migrate seed backup restore init-data help

help:
	@echo ""
	@echo "  MCP Knowledge Server — Makefile Commands"
	@echo "  ─────────────────────────────────────────"
	@echo "  make init-data   Create host data/ directories"
	@echo "  make dev         Start in development mode (hot-reload)"
	@echo "  make prod        Start in production mode (Nginx, resource limits)"
	@echo "  make down        Stop all containers"
	@echo "  make logs        Tail all container logs"
	@echo "  make migrate     Run Alembic DB migrations"
	@echo "  make seed        Seed default admin user + LLM backend"
	@echo "  make backup      Trigger manual backup now"
	@echo "  make restore     Restore from snapshot (SNAPSHOT=<timestamp> or latest)"
	@echo ""

init-data:
	@echo "Creating host data directories..."
	@mkdir -p data/mysql data/neo4j/data data/neo4j/logs data/neo4j/import data/neo4j/plugins
	@mkdir -p data/chromadb data/redis data/uploads
	@mkdir -p backups
	@cp -n .env.example .env 2>/dev/null || echo ".env already exists, skipping"
	@echo "✅ Done. Edit .env before starting."

dev: init-data
	docker compose $(DC_DEV) up -d
	@echo "✅ Dev stack started."
	@echo "   Backoffice UI  → http://localhost:5173"
	@echo "   Backoffice API → http://localhost:8002/docs"
	@echo "   MCP Server     → http://localhost:8001"
	@echo "   Neo4j Browser  → http://localhost:7474"

prod: init-data
	docker compose $(DC_PROD) up -d
	@echo "✅ Production stack started."
	@echo "   Nginx Reverse Proxy → http://localhost (ports 80/443)"
	@echo "   Direct MCP Server   → http://localhost:8001"
	@echo "   Direct Backoffice   → http://localhost:8002/docs"

down:
	docker compose $(DC_BASE) down

logs:
	docker compose $(DC_BASE) logs -f --tail=100

migrate:
	docker compose $(DC_BASE) exec backoffice-api alembic upgrade head

seed:
	docker compose $(DC_BASE) exec backoffice-api python -m scripts.seed

backup:
	docker compose $(DC_BASE) exec backup-service /backup.sh
	@echo "✅ Manual backup triggered."

restore:
	@if [ -z "$(SNAPSHOT)" ]; then echo "Usage: make restore SNAPSHOT=<timestamp|latest>"; exit 1; fi
	@echo "⚠️  This will stop all services and restore from snapshot: $(SNAPSHOT)"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ]
	docker compose $(DC_BASE) down
	@./services/backup_service/restore.sh $(SNAPSHOT)
	docker compose $(DC_BASE) up -d
	@echo "✅ Restore complete."
