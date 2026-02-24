# Pirani Connector – Agent Instructions

## Cursor Cloud specific instructions

### Overview

Single Next.js 14 monolith (TypeScript) that reconciles Shopify payouts with NetSuite deposits. Uses Prisma ORM with PostgreSQL. See `README.md` for full feature docs and API surface.

### Services

| Service | How to run | Port |
|---------|-----------|------|
| Next.js dev server | `npm run dev` | 3000 |
| PostgreSQL | `sudo pg_ctlcluster 16 main start` | 5432 |
| Prisma Studio (optional) | `npm run db:studio` | 5000 |

### Database

- PostgreSQL must be running before starting the dev server.
- The Prisma schema uses `provider = "postgresql"` (despite README mentioning SQLite for local dev).
- Database credentials: user `pirani`, password `pirani`, database `pirani` on localhost:5432.
- `.env` must contain `DATABASE_URL="postgresql://pirani:pirani@localhost:5432/pirani"`.
- After schema changes: `npm run db:push` to sync. `npm run db:seed` to load demo data.

### Known issues

- `npm run build` fails with a TypeScript strict inference error in `src/lib/prisma.ts` (the `log` option array is inferred as `string[]` instead of `LogLevel[]`). This does not affect `npm run dev`.
- `npm run lint` produces warnings (React Hook dependency arrays) but exits 0.

### External APIs (optional)

Shopify and NetSuite credentials are optional; the app functions without them (import buttons return empty results). Set `SHOPIFY_ACCESS_TOKEN` and NetSuite OAuth vars in `.env` if integration testing is needed.
