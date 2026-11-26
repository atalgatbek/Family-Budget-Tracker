# Family Budget Tracker

Built from the **FamilyBudgetTeam_FamilyBudgetTracker_Task09** report, using React + TypeScript, asynchronous FastAPI, SQLAlchemy 2 AsyncSession, psycopg 3, PostgreSQL 17, and Pydantic 2.

Includes overview, expense/income transactions, monthly budgets, purchase requests, savings goals, notifications, reports/CSV exports, household management, receipt uploads, and Admin/Member access. The responsive interface uses warm neutral colors, green accents, and locally bundled fonts.

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

## Vercel deployment

`vercel.json` deploys this repository as one Vercel project with two [services](https://vercel.com/docs/services) on a shared domain:

| Service | Root | Public paths |
| --- | --- | --- |
| `backend` (FastAPI, Python 3.13) | `backend/` | `/api/*`, `/docs`, `/openapi.json` |
| `frontend` (Vite, static) | `frontend/` | everything else |

A service receives the original request path, so the API keeps its `/api` prefix and the frontend keeps calling relative `/api/...` URLs. There are no service bindings: the frontend is a static bundle, the browser reaches the API through the public `/api` rewrite, and the API calls no other service.

Set these environment variables in the Vercel project:

- `DATABASE_URL`: a hosted PostgreSQL database. `postgres://` and `postgresql://` URLs are accepted and used through psycopg 3.
- `JWT_SECRET`: a random secret of at least 32 characters.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`: the mail server for password reset emails (see [Password reset by email](#password-reset-by-email)). Without them, *Forgot your password?* answers that the email could not be sent.
- `ALLOWED_ORIGINS` (optional): only for extra custom domains. The deployment's own URLs (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`) are allowed automatically, and the session cookie is marked `Secure` on production and preview deployments.

Things that differ from the Docker setup:

- Migrations are not run automatically. Run them once against the hosted database from your machine, and again after pulling new migrations: `DATABASE_URL="<hosted url>" make migrate`. Optional demo data: `DATABASE_URL="<hosted url>" make seed`.
- Receipt photos are not kept. Vercel Functions have no persistent disk, and a request body is limited to 4.5 MB, so receipt upload needs object storage before it can be used there.
- The Nginx `Content-Security-Policy` is not applied; `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` are set for the frontend in `vercel.json`.
- Dependencies are installed from `backend/requirements.txt`, not from `requirements.lock`.
- The exchange-rate retry pause is kept in memory per function instance; rate limits are shared through the database.

Local check with the Vercel CLI: `vercel dev` runs both services behind one port (default **http://localhost:3000**, already listed in `.env.example`). The CLI may rewrite `frontend/package-lock.json`; do not commit that change.

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

## Exchange rates

The overview shows official National Bank of Kazakhstan rates for USD, EUR, RUB, and CNY: the tenge price of one unit, a small chart of the last days, and the change over the week.

- The API reads the bank's public daily feed (`nationalbank.kz/rss/get_rates.cfm`), so the API container needs outbound internet access. The browser only talks to `/api/rates`.
- A published daily rate does not change, so each day is requested once and kept in the `exchange_rate` table (migration `004`). Later page loads are served from the database.
- If the bank cannot be reached, the last stored rates are shown with their date and the API waits ten minutes before trying again. With nothing stored yet, the panel says the rates are unavailable.
- These are official daily rates, not live exchange-office prices. Green means the currency became more expensive in tenge over the week, red means it became cheaper.
- A switch next to the month picker (₸ $ € ₽ ¥) shows every amount on the site in the chosen currency at the latest stored rate. This only changes the display: amounts are stored and entered in tenge, CSV exports stay in tenge, and older entries are converted at the same current rate, which the page states in a notice. The choice is remembered in the browser.

## Purchase requests

**Requests** is a page in the navigation. A member asks before buying (category, amount, what it is for); an admin approves or rejects it, optionally with a reason. An approved request becomes the member's expense for today, so it counts toward the budget at once.

- **Rule:** an admin can set an amount up to which requests are approved automatically. A request within that amount is still sent for a decision when it would take its category over this month's limit.
- Pending requests show what is left of the category's limit, and a warning when the request does not fit.
- A member sees only their own requests and can cancel one while it is pending. A request can be decided only once; the row is locked while it is decided.
- Migration `006` adds `purchase_request` and the `family.auto_approve_kzt` rule.

## Notifications

A bell in the top bar lists the latest 30 notifications for the signed-in person, across their households, with an unread count. Opening one marks it read and goes to the related page.

They are created on the server for: a new request (to admins), an automatic approval (to admins), an approval or rejection (to the person who asked), a category reaching 85% or passing 100% of its monthly limit (to admins and the person who spent), and a goal being reached (to the whole household). Each limit and goal event is sent once per month and person (`dedupe_key`). Notifications store names and amounts; the browser writes the sentence in the chosen language. Migration `007` adds `notification`.

## Sessions and passwords

- **Limited sessions:** signing in creates a row in `user_session`. The cookie holds a signed token that names the session and expires after 30 minutes without activity; it is renewed while the person keeps using the site, up to 12 hours after sign-in (`SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS`).
- **Signing out ends the session on the server**, so a copied cookie stops working. *Sign out everywhere* ends every session of the account.
- **Change password** asks for the current one and signs out the account's other devices.
- **Reset by email:** anyone, admins included, can ask for a code on the sign-in page (see below).
- **Reset without email:** a household admin issues a one-time code for a member from the Household page. The code works once, for 30 minutes, is stored only as a SHA-256 hash, and a new code cancels the old one. The member enters it on the sign-in page (*Forgot your password?* → *I already have a code*); every session of that account then ends. An admin can reset only members who share no other household with other people, so a reset cannot open a household the admin does not belong to.
- Migration `005` adds `user_session` and `password_reset`.

## Password reset by email

On the sign-in page, *Forgot your password?* asks for the account's email and sends a one-time code there, in the chosen language, with a button that opens the site with the code filled in. The code is the same kind an admin issues: 8 characters, one use, 30 minutes, stored only as a SHA-256 hash, and setting the new password ends every session of the account.

- The answer is the same whether or not the email has an account.
- At most one email a minute per account; requests count toward the sign-in rate limit (10 a minute per address).
- If the email cannot be sent, the person is told so and no code is kept.
- The link points only at the site the request came from (one of `ALLOWED_ORIGINS` or the Vercel URLs), or at `PUBLIC_URL` when set.

Email goes through any SMTP server:

| Setting | Meaning |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT` | Mail server, for example `smtp.gmail.com` and `465` |
| `SMTP_USER`, `SMTP_PASSWORD` | Sign-in for the mail server |
| `SMTP_SECURITY` | `auto` (SSL on port 465, otherwise STARTTLS), `ssl`, `starttls`, or `none` for a local test server |
| `MAIL_FROM`, `MAIL_FROM_NAME` | Sender address (defaults to `SMTP_USER`) and name |
| `PUBLIC_URL` | Optional fixed address of the site for the link |

**Gmail** works without a domain: turn on 2-Step Verification for the Google account, create an app password (Google Account → Security → App passwords), then set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` and `MAIL_FROM` to the Gmail address, and `SMTP_PASSWORD` to the 16-character app password. Gmail allows about 500 emails a day.

**Docker Compose** sends every email to a local [Mailpit](https://mailpit.axllent.org/) inbox at http://localhost:8025 unless SMTP settings are given in `.env`, so the whole flow can be tried without a real mailbox. **Local development without Docker** writes the email to the API log when `SMTP_HOST` is empty.

## Rate limits

Every API request is counted per signed-in person (or per address when signed out) and minute in the `rate_limit` table (migration `008`), so all server copies share one count:

| Limit | Default per minute | Setting |
| --- | --- | --- |
| All requests | 120 | `RATE_LIMIT_REQUESTS` |
| Changes (POST, PUT, PATCH, DELETE) | 30 | `RATE_LIMIT_WRITES` |
| Sign-in, registration, password reset (per address) | 10 | `RATE_LIMIT_AUTH` |

Over the limit the API answers `429` with `Retry-After`; every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`. `/api/health` is not limited. If the counter itself fails, the request is allowed rather than taking the site down.

The visitor address is read from `X-Real-IP` only behind a trusted proxy: on Vercel (which overwrites the header) and in Compose, where Nginx sets it (`TRUST_PROXY_HEADERS`). Before this, the API behind Nginx saw every visitor as the Nginx address.

`loadtest/load_test.py` measures throughput against a local copy of the server; run it with higher limits to measure raw capacity, or with the defaults to see requests refused.

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
| Purchase requests (addition) | `purchase_request` with composite household foreign keys; auto-approve rule; row lock on decision |
| Notifications (addition) | `notification` per person with a de-duplication key |
| Password reset by email (addition) | One-time code sent over SMTP; same answer for unknown emails; one email a minute per account |
| Sessions and reset codes (addition) | `user_session` with idle and absolute expiry; hashed one-time `password_reset` codes |
| Rate limits (addition) | `rate_limit` counters per key and minute, shared by all server copies |
| Exchange rates (addition) | `exchange_rate` cache table keyed by date and currency; rates fetched server-side from the National Bank feed |

Archived categories without a limit or saved spending are omitted from summaries, matching Kids club in the report. Spending without a limit is included and identified. Review entries are editable by their author and admins; move an archived-category entry to an active category to approve it. Spending and balances are computed, never stored.

## Checks

Create a separate database named **`family_budget_test`** with the same credentials, or set `TEST_DATABASE_URL` to another disposable PostgreSQL database whose name ends in `_test`.

```sh
make test
make build
```

Integration tests run real migrations and clear only the test database. They cover concurrent duplicate saves, changed-payload conflicts, permissions, family isolation, receipts, invalid amounts/dates, raw-SQL database guards, income idempotency, cross-site requests, transfer/audit behavior, savings-goal permissions and concurrent contributions, exchange-rate parsing, caching, and outage handling (with the bank feed replaced by a stub), purchase request rules and decisions, notifications, session expiry and revocation, password change and reset, and rate limits.

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
