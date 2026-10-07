# Elevvo Express API

A REST API built with Express and TypeScript, demonstrating layered architecture, JWT authentication, role-based access control, and production security middleware.

Part of the Elevvo backend task sequence. Extends Task 3 (controller-service architecture) with Task 4 additions (auth, RBAC, hardening).

## What it does

A `users` resource API with:

- **Layered architecture** — routes → controllers → services → store
- **JWT authentication** — login issues a signed token, protected routes verify it
- **Role-based access control** — `ADMIN` and `USER` roles with different permissions
- **Password security** — bcrypt hashing at cost factor 12
- **Observability** — every request logged with timestamp, method, path, status, duration
- **Security hardening** — Helmet headers, strict CORS whitelist, rate limiting
- **API key gate** — `/api/users` requires both `x-api-key` and a valid JWT

In-memory storage. No database. Data resets on every restart.

## Architecture

The layering matters. Each layer has one job.

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
[ lib/store ]                       in-memory data
```

**Rules the code follows:**

- **Routes** declare URLs. Nothing else.
- **Controllers** handle HTTP: parse requests, call services, send responses. No business logic.
- **Services** handle business logic. They never touch `req` or `res`.
- **Store** is the only place data lives. Swapping to a real database means changing one file.

## Stack

- **Node.js** ≥20
- **Express 4** — HTTP framework
- **TypeScript** — strict mode (`strict: true`, `noImplicitAny`, `strictNullChecks`)
- **bcrypt 6** — password hashing
- **jsonwebtoken** — JWT issuing and verification
- **helmet** — security headers
- **express-rate-limit** — request throttling
- **cors** — origin whitelisting
- **tsx** — TypeScript execution without a build step

## Run locally

```bash
# Clone
git clone https://github.com/willvviana/elevvo-express-api.git
cd elevvo-express-api

# Install
npm install

# Generate a bcrypt hash for seed passwords
npm run hash -- "password123"
# Copy the output, replace the three passwordHash values in src/lib/store.ts

# Set environment variables (PowerShell)
$env:API_KEY="dev-secret-123"
$env:JWT_SECRET="dev-jwt-secret-change-in-production-min-32-chars"
$env:JWT_EXPIRES_IN="1h"
$env:ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"

# Start
npm run dev
```

Server runs at `http://localhost:3000`.

### Required environment variables

| Variable | Purpose | Minimum |
|---|---|---|
| `API_KEY` | Shared secret for `/api/users` requests | Non-empty |
| `JWT_SECRET` | Signing key for JWTs | **32 characters** |
| `JWT_EXPIRES_IN` | Token lifetime (optional) | Default: `1h` |
| `ALLOWED_ORIGINS` | Comma-separated CORS whitelist (optional) | Default: `http://localhost:5173` |
| `PORT` | Server port (optional) | Default: `3000` |

## Seeded users

Three users are seeded on startup, all with password `password123`:

| Email | Role |
|---|---|
| will@elevvo.dev | ADMIN |
| maya@elevvo.dev | USER |
| sam@elevvo.dev | USER |

The hash in `src/lib/store.ts` must match `password123`. Generate it with `npm run hash -- "password123"`.

## API endpoints

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Uptime and status |
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Exchange credentials for a JWT. Rate limited to 5 attempts per 15 minutes per IP. |

### Authenticated (requires `Authorization: Bearer <token>`)

| Method | Path | Role required |
|---|---|---|
| GET | `/api/auth/me` | Any |
| GET | `/api/users` | Any (also requires `x-api-key`) |
| GET | `/api/users/:id` | Any (also requires `x-api-key`) |
| POST | `/api/users` | ADMIN (also requires `x-api-key`) |
| PUT | `/api/users/:id` | ADMIN, or the user themselves (also requires `x-api-key`) |
| DELETE | `/api/users/:id` | ADMIN (also requires `x-api-key`) |

## Example flow

```bash
# 1. Login
curl.exe -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"will@elevvo.dev\",\"password\":\"password123\"}"

# Response: { "token": "eyJhbGc...", "user": {...} }

# 2. Use the token on a protected route
curl.exe -H "x-api-key: dev-secret-123" \
  -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3000/api/users

# 3. Delete requires ADMIN
curl.exe -X DELETE \
  -H "x-api-key: dev-secret-123" \
  -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3000/api/users/3
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
| 409 | Conflict (email exists) |
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

## What's missing

- **No token revocation.** A JWT is valid until it expires. Client-side logout doesn't invalidate the token server-side. Production uses short-lived access tokens + refresh tokens, or a revocation blocklist.
- **No refresh tokens.** Users re-login every hour.
- **No database.** In-memory storage. Data vanishes on restart.
- **No email verification.** Signup creates active accounts immediately.
- **No tests.** The auth flow has zero automated coverage.
- **No logout endpoint.** Stateless JWTs have nothing to invalidate without extra infrastructure.
- **API key is a single static value.** No rotation, no per-client keys.
- **No password reset flow.**

## What I'd add next

- Integration tests with `supertest` and `vitest`
- Schema validation with `zod`
- Persistence with SQLite or Postgres
- Refresh token rotation
- Structured logging with `pino`
- OpenAPI spec generation