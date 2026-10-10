# Dockerfile
#
# Multi-stage build.
# Stage 1 (builder): full Node with dev deps, compiles TS → JS.
# Stage 2 (runner): minimal Node, copies only the compiled output.
#
# Result: image is ~150MB instead of ~1GB, and contains no source,
# no devDependencies, no test files.

# ============================================================
# STAGE 1 — builder
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only the dependency manifests first.
# Docker reuses the npm install layer whenever package.json hasn't
# changed, even if source files have.
COPY package.json package-lock.json ./
COPY prisma ./prisma

# npm ci is faster and stricter than npm install. It reads
# package-lock.json exactly. Requires the lockfile to be in sync.
RUN npm ci

# Now copy source code and configs.
COPY tsconfig.json ./
COPY src ./src

# Generate the Prisma client. Must happen after npm ci and before tsc
# because TypeScript imports from @prisma/client.
RUN npx prisma generate

# Compile TypeScript to dist/.
RUN npm run build

# ============================================================
# STAGE 2 — runner
# ============================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy only what the running app needs.
COPY package.json package-lock.json ./
COPY prisma ./prisma

# Install production dependencies only.
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled JS from the builder stage.
COPY --from=builder /app/dist ./dist

# Copy the generated Prisma client. The runner stage's fresh npm ci
# doesn't include the generated client (that requires `prisma generate`).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Run as non-root.
USER node

EXPOSE 3000

# Start the server. Runs migrations first, then starts.
# Exec form (JSON array) so the shell receives the whole string
# as a single -c argument. Signals reach node directly.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]