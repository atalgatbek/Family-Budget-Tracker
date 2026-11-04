.PHONY: install migrate seed api web test build docker-up docker-seed docker-down

install:
	python3 -m venv .venv
	.venv/bin/python -m pip install -r backend/requirements.lock
	cd frontend && npm ci

migrate:
	.venv/bin/alembic -c backend/alembic.ini upgrade head

seed:
	PYTHONPATH=backend .venv/bin/python -m app.seed

api:
	.venv/bin/uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000

web:
	cd frontend && npm run dev

test:
	PYTHONPATH=backend .venv/bin/pytest backend/tests -q

build:
	cd frontend && npm run build

docker-up:
	docker compose up --build -d

docker-seed:
	docker compose exec api python -m app.seed

docker-down:
	docker compose down
