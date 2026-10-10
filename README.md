# Elevvo Express API

A production-style REST API for an e-commerce domain. Built with Express, TypeScript, PostgreSQL (via Prisma), and Redis. Demonstrates layered architecture, JWT auth with RBAC, relational data modeling, atomic transactional checkout, cache-aside reads, distributed rate limiting, and containerized local development.

Part of the Elevvo backend task sequence.

- **Task 3** — Express API, controller-service architecture
- **Task 4** — JWT auth, RBAC, security hardening
- **Task 5** — PostgreSQL persistence, Prisma ORM, atomic checkout with `$transaction`
- **Task 6** — Redis cache-aside, cache invalidation, distributed rate limiting

## What it does

A small e-commerce backend with three resources: **users**, **products**, and **orders**. Ships with Postgres and Redis containers for local development.

- **Layered architecture** — routes → controllers → services → store
- **JWT authentication** — login issues a signed token, protected routes verify it
- **Role-based access control** — `ADMIN` and `CUSTOMER` roles
- **Password security** — bcrypt hashing at cost factor 12
- **Observability** — every request logged with timestamp, method, path, status, duration
- **Security hardening** — Helmet headers, strict CORS whitelist, rate limiting
- **Relational persistence** — PostgreSQL with Prisma, migration history in `prisma/migrations/`
- **Atomic checkout** — order creation wrapped in a Prisma `$transaction`
- **Cache-aside reads** — product endpoints served from Redis with a 1-hour TTL
- **Cache invalidation** — every write purges affected keys, so reads are never stale
- **Distributed rate limiting** — login and global limiters use Redis, so limits persist across restarts and scale horizontally

## Architecture

```
Request
  ↓
[ helmet ]                          security headers
  ↓
[ cors ]                            strict origin whitelist
  ↓
[ observability ]                   logs every request
  ↓
[ express.json() ]                  parses JSON bodies
  ↓
[ rate limiters ]                   Redis-backed global + login-specific
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
[ lib/store → Prisma ]              PostgreSQL
  ↓
[ lib/redis ]                       cache-aside + rate limit store
```

**Rules the code follows:**

- **Routes** declare URLs. Nothing else.
- **Controllers** handle HTTP: parse requests, call services, send responses. No business logic.
- **Services** handle business logic. They never touch `req` or `res`.
- **Store** is the only place Prisma is used. Swapping databases means changing one file.
- **Redis** is accessed only through `lib/redis.ts` helpers. Cache logic stays out of controllers where possible.

## Stack

- **Node.js** ≥20
- **Express 4** — HTTP framework
- **TypeScript** — strict mode (`strict: true`, `noImplicitAny`, `strictNullChecks`)
- **PostgreSQL 16** — relational database, Docker container
- **Redis 7** — cache and rate-limit store, Docker container
- **Prisma 6** — ORM and migration tool
- **redis 6** — official Node Redis client
- **rate-limit-redis 6** — Redis-backed store for express-rate-limit
- **bcrypt 6** — password hashing
- **jsonwebtoken** — JWT issuing and verification
- **helmet** — security headers
- **express-rate-limit 8** — request throttling
- **cors** — origin whitelisting
- **tsx** — TypeScript execution without a build step

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

### 1. Start Postgres and Redis

```bash
docker compose up -d
```

This starts two containers:

- **Postgres 16** on host port `5433` (see the note below on the port).
- **Redis 7** on host port `6379`.

### Note on the Postgres port

Docker's Postgres is exposed on host port **5433**, not 5432. This avoids a conflict with native Postgres installations on Windows.

The `DATABASE_URL` in `.env` must use port 5433:

```
DATABASE_URL="postgresql://elevvo:elevvo_dev_password@127.0.0.1:5433/elevvo_dev?schema=public"
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

Or create `.env` manually:

```
DATABASE_URL="postgresql://elevvo:elevvo_dev_password@127.0.0.1:5433/elevvo_dev?schema=public"
REDIS_URL="redis://localhost:6379"
```

Set the remaining variables in your shell (PowerShell):

```powershell
$env:API_KEY="dev-secret-123"
$env:JWT_SECRET="dev-jwt-secret-change-in-production-min-32-chars"
$env:JWT_EXPIRES_IN="1h"
$env:ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"
```

### 4. Apply migrations and seed

```bash
npx prisma migrate deploy
npx prisma generate
npx tsx prisma/seed.ts
```

### 5. Start the server

```bash
npm run dev
```

Expected startup:

```
Redis connected to redis://localhost:6379
Server running at http://localhost:3000
NODE_ENV: development
CORS origins: http://localhost:5173, http://localhost:3000
```

### Required environment variables

| Variable | Purpose | Minimum |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Non-empty |
| `REDIS_URL` | Redis connection string | Non-empty |
| `API_KEY` | Shared secret for `/api/users` requests | Non-empty |
| `JWT_SECRET` | Signing key for JWTs | **32 characters** |
| `JWT_EXPIRES_IN` | Token lifetime (optional) | Default: `1h` |
| `ALLOWED_ORIGINS` | Comma-separated CORS whitelist (optional) | Default: `http://localhost:5173` |
| `PORT` | Server port (optional) | Default: `3000` |

## Seeded users

Three users, all with password `password123`:

| Email | Role |
|---|---|
| will@elevvo.dev | ADMIN |
| maya@elevvo.dev | CUSTOMER |
| sam@elevvo.dev | CUSTOMER |

Run `npx tsx prisma/seed.ts` to insert them. The script uses `upsert`, so re-running is safe.

## API endpoints

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Uptime and status |
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Exchange credentials for a JWT. Rate limited to 5 attempts per 15 minutes per IP. |
| GET | `/api/products` | List products. Supports `?page=&perPage=&category=`. Cached. |
| GET | `/api/products/:id` | Get one product. Cached. |

### Authenticated (requires `Authorization: Bearer <token>`)

| Method | Path | Role required |
|---|---|---|
| GET | `/api/auth/me` | Any |
| GET | `/api/users` | Any (also requires `x-api-key`) |
| GET | `/api/users/:id` | Any (also requires `x-api-key`) |
| POST | `/api/users` | ADMIN (also requires `x-api-key`) |
| PUT | `/api/users/:id` | ADMIN, or the user themselves (also requires `x-api-key`) |
| DELETE | `/api/users/:id` | ADMIN (also requires `x-api-key`) |
| POST | `/api/products` | ADMIN |
| PUT | `/api/products/:id` | ADMIN |
| DELETE | `/api/products/:id` | ADMIN |
| POST | `/api/orders` | Any authenticated |
| GET | `/api/orders` | Any authenticated (own orders only) |
| GET | `/api/orders/:id` | Any authenticated (own order, or any if ADMIN) |

## Atomic checkout

The `POST /api/orders` endpoint performs three operations atomically inside a Prisma `$transaction`:

1. Verify every product exists and has sufficient stock.
2. Decrement stock for each product.
3. Create the order and its order items.

If **any** step fails — missing product, insufficient stock, database error — the entire transaction rolls back. No half-state.

**Why this matters.** Without the transaction, a failure between step 2 and step 3 would leave the database with stock decremented but no order created. That's a silent data integrity bug that compounds over time.

### Example: place an order

```bash
curl.exe -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"items":[{"productId":1,"quantity":2},{"productId":2,"quantity":1}]}'
```

Response:

```json
{
  "order": {
    "id": 1,
    "userId": 2,
    "status": "PENDING",
    "total": "649.48",
    "items": [
      {
        "id": 1,
        "productId": 1,
        "quantity": 2,
        "priceAtPurchase": "249.99",
        "product": { "id": 1, "name": "Wireless Headphones" }
      },
      { "id": 2, "productId": 2, "quantity": 1, "priceAtPurchase": "149.5" }
    ]
  }
}
```

## Caching and distributed rate limiting

Two Redis integrations run alongside Postgres.

### Cache-aside on product reads

`GET /api/products` and `GET /api/products/:id` use the **cache-aside pattern**:

1. Build a deterministic cache key from the request (path + query params).
2. Check Redis. On hit, return immediately.
3. On miss, query Postgres, store the result in Redis with a 1-hour TTL, return.

Every response includes an `X-Cache` header (`HIT` or `MISS`) so cache behavior is visible in curl and logs.

Cache keys are namespaced (`products:list:v1:...`, `products:detail:v1:...`). The `v1` suffix allows invalidating everything by bumping the version if the response shape ever changes.

### Cache invalidation

Every write to the products table (POST, PUT, DELETE) purges all keys under `products:*` via `SCAN` + `DEL`. Without this, a write would leave stale data cached for up to an hour.

This is deliberate — "delete all" is safe and cheap at this scale. A production system with high write volume would target only the affected keys.

`SCAN` is used instead of `KEYS` because `KEYS` blocks the Redis server while it walks the entire keyspace. `SCAN` batches the work and is safe on a live server.

### Distributed rate limiting

Both rate limiters (`login` and `global`) store their counters in Redis via `rate-limit-redis`, not in the Node process.

This matters when running multiple API instances behind a load balancer. With in-process counters, a client hitting three instances gets three separate quotas. With Redis, the counter is shared — one global quota per IP.

**To verify:** hit `/api/auth/login` six times to trigger the limit, restart the server, and try again. The `429` persists because the counter lives in Redis.

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
| 409 | Conflict (e.g., email exists, FK constraint) |
| 429 | Rate limited |
| 500 | Server error |

## Security notes

- **Password hashing** — bcrypt, cost factor 12. About 250ms per hash.
- **Timing-attack mitigation** — login always runs a bcrypt comparison, even for nonexistent emails, so response time doesn't leak which emails are registered.
- **JWT algorithm pinning** — `HS256` is explicitly required. Other algorithms are rejected.
- **Generic login errors** — "Invalid email or password" for both wrong email and wrong password.
- **Rate limiting on login** — 5 attempts per 15 minutes per IP, enforced across instances via Redis.
- **Strict CORS** — whitelisted origins only. No wildcard.
- **Helmet** — standard security headers.
- **Fail-closed env handling** — server won't start if `JWT_SECRET` is missing or under 32 characters.
- **No password hashes in responses** — `toPublicUser()` strips the hash before serialization.
- **Server-controlled pricing** — order totals are computed from database prices, never from client input.
- **Order ownership enforced in service layer** — a customer cannot view another customer's order (returns 404 to prevent id enumeration).

## What's missing

- **No token revocation.** A JWT is valid until it expires. Client-side logout doesn't invalidate the token server-side.
- **No refresh tokens.** Users re-login every hour.
- **No automated tests.** Zero coverage on auth, cache, and order flows. Task 7 adds these.
- **No email verification.** Signup creates active accounts immediately.
- **API key is a single static value.** No rotation, no per-client keys.
- **No password reset flow.**
- **Decimal handling in total calculation** — `Number(product.price) * quantity` converts the Prisma Decimal to a JS number. For small totals this is safe; a real payments system should use a decimal library like `decimal.js`.
- **No soft deletes.** Deleting a product referenced by an order is blocked by the FK constraint. Add an `isActive` flag if soft deletes are needed.
- **Redis is not persisted.** Cache and rate-limit counters vanish if the Redis container is recreated. Fine for a cache, problematic if rate limiting becomes a security boundary.
- **No cache stampede protection.** A hundred simultaneous cold-cache requests will all hit Postgres. Real systems use locks or probabilistic early expiry.
- **`X-Cache` header exposed in production responses.** It's useful for debugging but reveals internal infrastructure. Some teams strip it before the response leaves the edge.

## What I'd add next

- Integration tests with `supertest` and `vitest` (Task 7)
- Multi-stage Dockerfile for the API (Task 7)
- GitHub Actions CI pipeline that runs tests on every PR (Task 7)
- Structured logging with `pino`
- OpenAPI spec generation
- Refresh token rotation
- Cache stampede protection via distributed locks
- Redis persistence (`appendonly yes`) for rate-limit counters