# Family Budget Tracker

Built from the **FamilyBudgetTeam_FamilyBudgetTracker_Task09** report, using React + TypeScript, asynchronous FastAPI, SQLAlchemy 2 AsyncSession, psycopg 3, PostgreSQL 17, and Pydantic 2.

Includes overview, expense/income transactions, monthly budgets, savings goals, reports/CSV exports, household management, receipt uploads, and Admin/Member access. The responsive interface uses warm neutral colors, green accents, and locally bundled fonts.

## Docker deployment

Requires Docker and Compose v2. From the project root:

```sh
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Put the generated secret into `JWT_SECRET` in `.env`. Set a unique `POSTGRES_PASSWORD` using URL-safe characters (Compose also uses it inside the database URL). The example password is suitable for local evaluation only.

```sh
docker compose up --build -d
docker compose exec api python -m app.seed
```

Open **http://localhost:8080**. On installations with the standalone executable, replace `docker compose` with `docker-compose`.

The migration job runs after PostgreSQL becomes healthy. The API waits for migrations, and Nginx waits for the healthy API. Only the web port is exposed. PostgreSQL data and private receipts persist in named volumes.

```sh
docker compose ps
docker compose logs api
docker compose down
```

Stopping preserves data. Keep `.env` out of Git. For a public deployment, use HTTPS at your reverse proxy, set `COOKIE_SECURE=true`, set `ALLOWED_ORIGINS` to your actual domain, and back up both named volumes. Set `WEB_PORT` to change port 8080. Demo seeding is explicit; omit it for a real deployment.

## Demo login

| Email | Role |
| --- | --- |
| `aigerim@example.com` | Admin |
| `daulet@example.com` | Member |
| `aruzhan@example.com` | Member |

Password for all three: **`FamilyDemo2026!`**.

The demo opens October 2026, the latest configured budget month. Its ten expenses and five category limits reproduce the report: **160,000 KZT planned, 103,900 spent, 56,100 remaining**. Food has 60,000 planned, 52,900 spent, and 7,100 left. Percentages use half-up rounding (Transport: 43%).

The two income examples (500,000 KZT total), expense descriptions, household surname, and generated receipt images are synthetic additions. The report supplied no income rows or actual receipt photos. Seed is idempotent and does not reset an existing demo household.

## Local development

Python 3.13 and Node 22+ are recommended.

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock
cd frontend
npm ci
cd ..
```

Configure `.env` from the example. Point `DATABASE_URL` at an existing local PostgreSQL database; the example uses port 55432 to avoid conflicts with another installation.

```sh
make migrate
make seed
make api
```

Run `make web` in another terminal. Open **http://127.0.0.1:5173**; Vite proxies `/api` to FastAPI on port 8000. OpenAPI documentation: **http://127.0.0.1:8000/docs** (Docker: `/docs`). Registration creates a fresh household with five categories and no sample transactions.

## Roles and synchronization

- Admins manage every expense/receipt in their household, categories, monthly limits, and limit history. They can add an existing registered account by email.
- Members see household totals, names and roles, and their own individual transactions/receipts. Other members’ emails and limit-settings endpoints are restricted.
- One account can belong to several households with different roles. Switch using the household selector.
- The submitting device refreshes totals after a save. Other open devices refresh every 15 seconds and when the window gains focus. This is polling, with a short delay between devices.

Adding an existing user is immediate; no invitation email is sent. Password recovery, email verification, bank integrations, recurring transactions, and offline synchronization are outside this implementation.

## Savings goals

**Goals** is a separate page in the main navigation. A goal has a name, a target amount, an optional deadline, and the amount saved so far. The page shows the household total, and for each goal its progress, how much is left, and how much to put aside each month to reach the target by the deadline.

- Admins create, edit, and delete goals. Every member can add money to a goal.
- Adding money is one atomic database update, so contributions made at the same moment are all counted.
- Money added to a goal is tracked only on the goal. It is not an expense and does not change budget totals.
- Individual contributions are not stored, so there is no contribution history and a repeated request is not de-duplicated. An admin can correct the saved amount by editing the goal.

Migration `003` creates the `savings_goal` table. The demo seed adds two synthetic goals when it creates the demo household; it does not add them to a household that already exists.

## Report requirements

| Requirement | Implementation |
| --- | --- |
| Original six tables | `family`, `app_user`, `family_member`, `category`, `monthly_limit`, `expense` |
| M:N membership and household-specific roles | Composite membership primary key; membership checked on every household request |
| No cross-family expense author/category | Composite foreign keys to membership and category |
| Amount 1–10,000,000 whole KZT | Strict Pydantic integers and PostgreSQL CHECK constraints |
| Unique category name per family | Case-insensitive unique index |
| One limit per category/month | UNIQUE constraint, month-format check, positive-limit check |
| Double-tap duplicate prevention | UUID client request ID with UNIQUE constraint; concurrent replay returns the existing row; changed payload returns 409 |
| No future expense date | Pydantic validation and database trigger using Asia/Almaty calendar date |
| Archived category history | Soft archive preserves historical references |
| New expense in archived category | API and database trigger force `Needs review`; excluded from totals |
| Atomic budget transfer | Ordered row locks, two updates, and two audit records in one transaction |
| Limit change history | `limit_change_log` stores actor, old/new amount, timestamp, and reason |
| Private receipt photos | Authenticated access, 5 MB cap, validated/re-encoded images with metadata removed |
| Categories with no spending | LEFT JOIN and COALESCE preserve zero-spend categories |
| Income | Additional household-scoped `income` table, with idempotency and date validation |
| Savings goals (addition) | Household-scoped `savings_goal` table with range checks; atomic contributions; Admin-only management |

Archived categories without a limit or saved spending are omitted from summaries, matching Kids club in the report. Spending without a limit is included and identified. Review entries are editable by their author and admins; move an archived-category entry to an active category to approve it. Spending and balances are computed, never stored.

## Checks

Create a separate database named **`family_budget_test`** with the same credentials, or set `TEST_DATABASE_URL` to another disposable PostgreSQL database whose name ends in `_test`.

```sh
make test
make build
```

Integration tests run real migrations and clear only the test database. They cover concurrent duplicate saves, changed-payload conflicts, permissions, family isolation, receipts, invalid amounts/dates, raw-SQL database guards, income idempotency, cross-site requests, transfer/audit behavior, and savings-goal permissions and concurrent contributions.

## Code map

```text
backend/app/           Async routes, ORM models, Pydantic schemas, authentication, services
backend/migrations/    Alembic schema and PostgreSQL guard triggers
backend/tests/         PostgreSQL integration tests
frontend/src/          React screens, charts, forms, and CSS
frontend/nginx.conf    Static serving and same-origin API proxy
compose.yaml           Web/API/migration/PostgreSQL deployment
docs/schema.md         Entity relationship diagram
```

Passwords use Argon2; sessions use expiring HttpOnly cookies. Browser mutations reject untrusted origins. The login rate limiter is per API process; use a shared proxy limiter when scaling. The receipt volume supports one API instance; use shared private storage for multiple replicas.

References: [FastAPI authentication](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/), [SQLAlchemy async ORM](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html), [PostgreSQL triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html), [Vite](https://vite.dev/guide/).
