# Elevvo Express API

A REST API for an e-commerce domain, built with Express, TypeScript, and PostgreSQL via Prisma ORM. Demonstrates layered architecture, JWT auth with RBAC, relational data modeling, atomic transactional checkout, and production security middleware.

Part of the Elevvo backend task sequence.

- **Task 3** — Express API, controller-service architecture
- **Task 4** — JWT auth, RBAC, security hardening
- **Task 5** — PostgreSQL persistence, Prisma ORM, atomic checkout with `$transaction`

## What it does

A small e-commerce backend with three resources: **users**, **products**, and **orders**.

- **Layered architecture** — routes → controllers → services → store (Prisma)
- **JWT authentication** — login issues a signed token, protected routes verify it
- **Role-based access control** — `ADMIN` and `CUSTOMER` roles with different permissions
- **Password security** — bcrypt hashing at cost factor 12
- **Observability** — every request logged with timestamp, method, path, status, duration
- **Security hardening** — Helmet headers, strict CORS whitelist, rate limiting
- **Relational persistence** — PostgreSQL with Prisma, migration history in `prisma/migrations/`
- **Atomic checkout** — order creation wrapped in a Prisma `$transaction` to guarantee inventory consistency
- **Pagination & filtering** — cursor-based pagination on products, filter by category

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
[ rate limiters ]                   global + login-specific
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
[ lib/store ]                       Prisma queries → PostgreSQL
```

**Rules the code follows:**

- **Routes** declare URLs. Nothing else.
- **Controllers** handle HTTP: parse requests, call services, send responses. No business logic.
- **Services** handle business logic. They never touch `req` or `res`.
- **Store** is the only place Prisma is used. Swapping databases means changing one file.

## Stack

- **Node.js** ≥20
- **Express 4** — HTTP framework
- **TypeScript** — strict mode (`strict: true`, `noImplicitAny`, `strictNullChecks`)
- **PostgreSQL 16** — relational database, runs in Docker locally
- **Prisma 6** — ORM and migration tool
- **bcrypt 6** — password hashing
- **jsonwebtoken** — JWT issuing and verification
- **helmet** — security headers
- **express-rate-limit** — request throttling
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

### 1. Start Postgres in Docker

```bash
docker compose up -d
```

This starts a Postgres 16 container on port 5432 with a persistent volume.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Create `.env` at the repo root:

```
DATABASE_URL="postgresql://elevvo:elevvo_dev_password@localhost:5432/elevvo_dev?schema=public"
```

Set the remaining environment variables in your shell (PowerShell):

```powershell
$env:API_KEY="dev-secret-123"
$env:JWT_SECRET="dev-jwt-secret-change-in-production-min-32-chars"
$env:JWT_EXPIRES_IN="1h"
$env:ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"
```

### 4. Apply migrations and seed

```bash
npx prisma migrate dev
npx tsx prisma/seed.ts
```

### 5. Start the server

```bash
npm run dev
```

Server runs at `http://localhost:3000`.

### Required environment variables

| Variable | Purpose | Minimum |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Non-empty |
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
| GET | `/api/products` | List products. Supports `?page=&perPage=&category=` |
| GET | `/api/products/:id` | Get one product |

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

If **any** step fails — missing product, insufficient stock, database error — the entire transaction rolls back. No half-state. This is the critical guarantee for inventory consistency.

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
- **Rate limiting on login** — 5 attempts per 15 minutes per IP.
- **Strict CORS** — whitelisted origins only. No wildcard.
- **Helmet** — standard security headers.
- **Fail-closed env handling** — server won't start if `JWT_SECRET` is missing or under 32 characters.
- **No password hashes in responses** — `toPublicUser()` strips the hash before serialization.
- **Server-controlled pricing** — order totals are computed from database prices, never from client input.
- **Order ownership enforced in service layer** — a customer cannot view another customer's order (returns 404 to prevent id enumeration).

## What's missing

- **No token revocation.** A JWT is valid until it expires. Client-side logout doesn't invalidate the token server-side.
- **No refresh tokens.** Users re-login every hour.
- **No tests.** Zero automated coverage on auth and order flows.
- **No email verification.** Signup creates active accounts immediately.
- **API key is a single static value.** No rotation, no per-client keys.
- **No password reset flow.**
- **Decimal handling in total calculation** — `Number(product.price) * quantity` converts the Prisma Decimal to a JS number. For small totals this is safe; a real payments system should use a decimal library like `decimal.js` for the arithmetic.
- **No soft deletes.** Deleting a product that's referenced by an order is blocked by the FK constraint. If you want deletions, add an `isActive` flag instead.

## What I'd add next

- Integration tests with `supertest` and `vitest`
- Schema validation with `zod`
- Redis caching for catalog reads (Task 6)
- Distributed rate limiting via Redis (Task 6)
- Refresh token rotation
- Structured logging with `pino`
- OpenAPI spec generation