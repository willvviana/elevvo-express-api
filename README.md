# Elevvo Express API

[![CI](https://github.com/willvviana/elevvo-express-api/actions/workflows/ci.yml/badge.svg)](https://github.com/willvviana/elevvo-express-api/actions/workflows/ci.yml)

**Live API:** https://elevvo-api-5y8a.onrender.com/api/health

A production-deployed REST API for an e-commerce domain. Built with Express, TypeScript, PostgreSQL (via Prisma), and Redis. Deployed to Render with managed Postgres (Neon) and managed Redis (Upstash).

Part of the Elevvo backend task sequence.

- **Task 3** — Express API, controller-service architecture
- **Task 4** — JWT auth, RBAC, security hardening
- **Task 5** — PostgreSQL persistence, Prisma ORM, atomic checkout with `$transaction`
- **Task 6** — Redis cache-aside, cache invalidation, distributed rate limiting
- **Task 7** — Multi-stage Docker build, automated tests, GitHub Actions CI

## Live deployment

| Component | Provider | Notes |
|---|---|---|
| **API** | [Render](https://render.com) | Docker container, free tier |
| **Database** | [Neon](https://neon.tech) | Managed PostgreSQL 16, free tier |
| **Cache** | [Upstash](https://upstash.com) | Serverless Redis 7, free tier |

**Live URL:** https://elevvo-api-5y8a.onrender.com

**Health check:** https://elevvo-api-5y8a.onrender.com/api/health

**Free-tier cold starts.** Render spins the container down after 15 minutes of inactivity. The first request after idle takes 30–60 seconds. Subsequent requests are fast.

### Try it

```bash
# Health check
curl https://elevvo-api-5y8a.onrender.com/api/health

# Products list (empty until you create some)
curl https://elevvo-api-5y8a.onrender.com/api/products

# Login
curl -X POST https://elevvo-api-5y8a.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"will@elevvo.dev","password":"<your-password>"}'
```

## What it does

A small e-commerce backend with three resources: **users**, **products**, and **orders**.

- **Layered architecture** — routes → controllers → services → store
- **JWT authentication** — login issues a signed token, protected routes verify it
- **Role-based access control** — `ADMIN` and `CUSTOMER` roles
- **Password security** — bcrypt hashing at cost factor 12
- **Observability** — every request logged with timestamp, method, path, status, duration
- **Security hardening** — Helmet headers, strict CORS whitelist, rate limiting
- **Relational persistence** — PostgreSQL with Prisma, migration history in `prisma/migrations/`
- **Atomic checkout** — order creation wrapped in a Prisma `$transaction`
- **Cache-aside reads** — product endpoints served from Redis with a 1-hour TTL
- **Cache invalidation** — every write purges affected keys
- **Distributed rate limiting** — login and global limiters use Redis, shared across instances
- **Containerized** — multi-stage Dockerfile produces a ~230MB production image
- **Tested** — 23 Jest/Supertest assertions covering auth, RBAC, products, orders, and transaction rollback
- **CI/CD** — GitHub Actions runs typecheck, build, and tests on every push and PR

## Architecture

```
Client (HTTPS)
  ↓
[ Cloudflare ]                      TLS termination, DDoS protection
  ↓
[ Render ]                          container hosting, auto-deploys on push
  ↓
[ Express App ]
  ↓
[ helmet ]                          security headers
  ↓
[ cors ]                            strict origin whitelist
  ↓
[ observability ]                   logs every request
  ↓
[ express.json() ]                  parses JSON bodies
  ↓
[ rate limiters ]                   Redis-backed (Upstash)
  ↓
[ requireApiKey ]                   /api/users only
  ↓
[ authenticateToken ]               verifies JWT, sets req.user
  ↓
[ authorizeRole("ADMIN") ]          RBAC where required
  ↓
[ routes → controllers ]            HTTP concerns
  ↓
[ services ]                        business logic
  ↓
[ lib/store → Prisma ] → [ Neon Postgres ]
[ lib/redis → ioredis ] → [ Upstash Redis ]
```

## Stack

**Runtime & language**
- **Node.js** ≥20
- **TypeScript** — strict mode (`strict: true`, `noImplicitAny`, `strictNullChecks`)

**Framework & libraries**
- **Express 4** — HTTP framework
- **Prisma 6** — ORM and migration tool
- **redis 6** — official Node Redis client
- **rate-limit-redis 6** — Redis-backed store for express-rate-limit
- **bcrypt 6** — password hashing
- **jsonwebtoken** — JWT issuing and verification
- **helmet** — security headers
- **express-rate-limit 8** — request throttling
- **cors** — origin whitelisting

**Data**
- **PostgreSQL 16** — Neon in production, Docker locally
- **Redis 7** — Upstash in production, Docker locally

**Dev & testing**
- **Jest 30** — test runner
- **ts-jest** — TypeScript transformer
- **Supertest** — HTTP assertions
- **tsx** — TypeScript execution

**Deployment**
- **Docker** — multi-stage build
- **Render** — container hosting
- **GitHub Actions** — CI

## Domain model

Four tables with proper relations:

```
User ──┬──< Order ──< OrderItem >── Product
```

- A **User** has many **Orders**.
- An **Order** has many **OrderItems**.
- An **OrderItem** references one **Product**.
- Many-to-many between Order and Product is modeled via the OrderItem join table.
- `OrderItem.priceAtPurchase` snapshots the product price at checkout, so historical orders don't change when prices do.

## Run locally

### Option A — Full stack via Docker Compose

```bash
docker compose up --build -d
```

Builds the API image, starts Postgres, Redis, and the API, waits for health checks.

Verify:

```bash
docker compose ps
```

API at `http://localhost:3000`.

Stop:

```bash
docker compose down
```

### Option B — Local dev with hot reload

#### 1. Start Postgres and Redis

```bash
docker compose up -d db cache
```

#### 2. Install dependencies

```bash
npm install
```

#### 3. Configure environment

```bash
cp .env.example .env
```

Or create `.env` manually:

```
DATABASE_URL="postgresql://elevvo:elevvo_dev_password@127.0.0.1:5433/elevvo_dev?schema=public"
TEST_DATABASE_URL="postgresql://elevvo:elevvo_dev_password@127.0.0.1:5433/elevvo_test?schema=public"
REDIS_URL="redis://localhost:6379"
```

Shell variables (PowerShell):

```powershell
$env:API_KEY="dev-secret-123"
$env:JWT_SECRET="dev-jwt-secret-change-in-production-min-32-chars"
$env:JWT_EXPIRES_IN="1h"
$env:ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"
```

#### 4. Apply migrations and seed

```bash
npx prisma migrate deploy
npx prisma generate
$env:SEED_PASSWORD="password123"
npx tsx prisma/seed.ts
```

#### 5. Start the server

```bash
npm run dev
```

#### Note on the Postgres port

Docker's Postgres is exposed on host port **5433**, not 5432. This avoids a conflict with native Postgres installations on Windows.

### Required environment variables

| Variable | Purpose | Minimum |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Non-empty |
| `TEST_DATABASE_URL` | PostgreSQL connection string for tests | Non-empty |
| `REDIS_URL` | Redis connection string | Non-empty |
| `API_KEY` | Shared secret for `/api/users` requests | Non-empty |
| `JWT_SECRET` | Signing key for JWTs | **32 characters** |
| `SEED_PASSWORD` | Password for seeded users (dev only) | 12 characters |
| `JWT_EXPIRES_IN` | Token lifetime (optional) | Default: `1h` |
| `ALLOWED_ORIGINS` | Comma-separated CORS whitelist (optional) | Default: `http://localhost:5173` |
| `PORT` | Server port (optional) | Default: `3000` |

## Seeded users

Three users are created by `prisma/seed.ts`. In production, the password is whatever you set `SEED_PASSWORD` to. In dev, `password123` is the convention.

| Email | Role |
|---|---|
| will@elevvo.dev | ADMIN |
| maya@elevvo.dev | CUSTOMER |
| sam@elevvo.dev | CUSTOMER |

## API endpoints

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/` | Service info and docs links |
| GET | `/api/health` | Uptime and status |
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Exchange credentials for a JWT. Rate limited: 5 attempts per 15 minutes per IP. |
| GET | `/api/products` | List products. `?page=&perPage=&category=`. Cached. |
| GET | `/api/products/:id` | Get one product. Cached. |

### Authenticated (requires `Authorization: Bearer <token>`)

| Method | Path | Role required |
|---|---|---|
| GET | `/api/auth/me` | Any |
| GET | `/api/users` | Any (also requires `x-api-key`) |
| GET | `/api/users/:id` | Any (also requires `x-api-key`) |
| POST | `/api/users` | ADMIN (also requires `x-api-key`) |
| PUT | `/api/users/:id` | ADMIN or self (also requires `x-api-key`) |
| DELETE | `/api/users/:id` | ADMIN (also requires `x-api-key`) |
| POST | `/api/products` | ADMIN |
| PUT | `/api/products/:id` | ADMIN |
| DELETE | `/api/products/:id` | ADMIN |
| POST | `/api/orders` | Any authenticated |
| GET | `/api/orders` | Any authenticated (own orders) |
| GET | `/api/orders/:id` | Any authenticated (own, or any if ADMIN) |

## Atomic checkout

`POST /api/orders` performs three operations atomically inside a Prisma `$transaction`:

1. Verify every product exists and has sufficient stock.
2. Decrement stock for each product.
3. Create the order and its order items.

If any step fails — missing product, insufficient stock, database error — the entire transaction rolls back. No half-state.

**Why this matters.** Without the transaction, a failure between step 2 and step 3 would leave stock decremented but no order created. Silent data corruption.

## Caching and distributed rate limiting

### Cache-aside on product reads

1. Build a deterministic key from the request.
2. Redis GET. On hit, return immediately.
3. On miss, query Postgres, SET in Redis with a 1-hour TTL, return.

Every response carries an `X-Cache` header (`HIT` or `MISS`) so behavior is observable.

### Cache invalidation

Every write to `products` purges all keys under `products:*` via `SCAN` + `DEL`. Without this, writes leave stale data cached for up to an hour.

`SCAN` rather than `KEYS` — `KEYS` blocks Redis while it walks the keyspace.

### Distributed rate limiting

Login and global rate limiters store counters in Upstash Redis. In-process counters wouldn't scale across instances; Redis makes the quota global.

**Verify:** hit `/api/auth/login` six times, restart the server, try again. The `429` persists.

## Testing

Tests use Jest and Supertest against a separate `elevvo_test` database.

### Setup

```bash
docker exec elevvo-postgres psql -U elevvo -d elevvo_dev -c "CREATE DATABASE elevvo_test;"

$env:DATABASE_URL="postgresql://elevvo:elevvo_dev_password@127.0.0.1:5433/elevvo_test?schema=public"
npx prisma migrate deploy
Remove-Item Env:\DATABASE_URL
```

### Run

Ensure Postgres and Redis containers are up:

```bash
docker compose up -d db cache
npm test
```

Expected:

```
Test Suites: 3 passed, 3 total
Tests:       23 passed, 23 total
```

### What's covered

- **auth.test.ts** — signup validation, login, no user enumeration, JWT-protected routes, malformed auth headers.
- **products.test.ts** — public reads, pagination, category filtering, RBAC on writes, validation.
- **orders.test.ts** — successful checkout with stock decrement, **transaction rollback**, insufficient stock, ownership (404 not 403), admin override.

## Deployment

### Where everything runs

| Layer | Provider | Service |
|---|---|---|
| **TLS/CDN** | Cloudflare | Automatic via Render |
| **API** | Render | Docker container from `main` |
| **Database** | Neon | Managed PostgreSQL, pooled connection |
| **Cache** | Upstash | Serverless Redis, TLS (`rediss://`) |

### How deploys work

Every push to `main`:

1. GitHub Actions runs typecheck, build, tests.
2. On success, Render rebuilds the Docker image.
3. On container start, `npx prisma migrate deploy` applies pending migrations.
4. `node dist/index.js` starts the server.

Zero-downtime because Render swaps containers only after the new one passes its health check.

### Environment variables in production

Set in Render's dashboard. **Never in the repo.** The `.env` file is gitignored.

Required in production:

- `DATABASE_URL` — Neon connection string
- `REDIS_URL` — Upstash connection string
- `API_KEY`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- `ALLOWED_ORIGINS`, `NODE_ENV=production`

### Redeploying

```bash
git push origin main
```

Render detects the push and rebuilds. No manual step.

### Rotating secrets

**JWT_SECRET:** changing it invalidates all existing tokens. Users must re-login. Update in Render → Environment → Save. Render restarts.

**API_KEY:** change in Render. Frontend clients using the old key get 401.

**DATABASE_URL:** only if Neon rotates the password. Update in Render.

**REDIS_URL:** only if Upstash rotates the token. Update in Render.

## Error format

All errors follow a consistent shape:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

Status codes:

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Resource created |
| 204 | Success, no content (DELETE) |
| 400 | Malformed request body or params |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Conflict (email exists, FK constraint) |
| 429 | Rate limited |
| 500 | Server error |

## Security notes

- **Password hashing** — bcrypt, cost factor 12. ~250ms per hash.
- **Timing-attack mitigation** — login always runs a bcrypt comparison, even for nonexistent emails.
- **JWT algorithm pinning** — `HS256` only.
- **Generic login errors** — no user enumeration.
- **Rate limiting on login** — 5 attempts per 15 minutes per IP, distributed via Redis.
- **Strict CORS** — whitelisted origins only.
- **Helmet** — standard security headers.
- **Fail-closed env handling** — server refuses to start if `JWT_SECRET` is missing or under 32 characters.
- **Trimmed env vars** — all values are `.trim()`-ed to prevent invisible-whitespace bugs.
- **No password hashes in responses** — `toPublicUser()` strips the hash.
- **Server-controlled pricing** — order totals computed from DB prices, never client input.
- **Order ownership in service layer** — non-owners get 404, not 403, to prevent enumeration.
- **Container runs as non-root** — `USER node` in the runner stage.

## What's missing

- **No token revocation.** A JWT is valid until it expires.
- **No refresh tokens.** Users re-login every hour.
- **No email verification.**
- **API key is a single static value.**
- **No password reset flow.**
- **Decimal arithmetic for order totals** uses `Number()`. Fine for small amounts; a payments system should use a decimal library.
- **No soft deletes.** Deleting a product with orders is blocked by the FK.
- **Redis is not persisted.** Cache and rate-limit counters vanish if the container is recreated.
- **No cache stampede protection.** Simultaneous cold-cache requests all hit Postgres.
- **Tests run sequentially** (`maxWorkers: 1`) because all suites share one test database.
- **Free-tier cold starts.** The Render instance spins down after 15 minutes idle. First request wakes it in 30–60s.

## What I'd add next

- Refresh token rotation
- Structured logging with `pino`
- OpenAPI spec (Swagger UI)
- Cache stampede protection via distributed locks
- Redis persistence (`appendonly yes`)
- Soft deletes with an `isActive` flag
- Custom domain
- Additional business logic: order status transitions, inventory alerts, low-stock notifications

## Related repositories

- **[elevvo-frontend](https://github.com/willvviana/elevvo-frontend)** — Tasks 1–5 static frontend (HTML/CSS/JS), deployed on GitHub Pages
- **[taskflow-dashboard](https://github.com/willvviana/taskflow-dashboard)** — Task 6 React dashboard, deployed on GitHub Pages
- **[elevvo-async-engine](https://github.com/willvviana/elevvo-async-engine)** — Task 2 TypeScript async data engine
- **[elevvo-backend](https://github.com/willvviana/elevvo-backend)** — Task 1 raw Node HTTP server

## License

MIT