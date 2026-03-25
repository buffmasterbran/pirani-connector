# Pirani Connector

Modern Next.js 14 application for reconciling Shopify payouts, NetSuite deposits, and Shopify order state inside a single Postgres-ready (SQLite local) source of truth.

## Overview

Pirani Connector now stores Shopify orders as a flattened "order line" table so the UI can render everything without joins. Import buttons call backend routes that pull Shopify data, transform it into the flattened structure, and upsert the rows. You can keep iterating on the UI while the database evolves from local SQLite to Supabase later.

## Core Features

- Shopify order & payout ingestion (UI triggers `POST /api/shopify/orders` and `POST /api/shopify/payouts`)
- Flattened `OrderLine` table (one row per order line item with all NetSuite + payout fields)
- Aggregated read endpoints for orders and payouts used by the dashboard
- Seed script with demo data for local development

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm 9+ (bundled with Node 18)
- Shopify Admin API credentials in `.env.local`

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Sync the Prisma schema to SQLite:
   ```bash
   npm run db:push
   ```
3. (Optional) load demo data:
   ```bash
   npm run db:seed
   ```
4. Launch the dev server:
   ```bash
   npm run dev
   ```
5. Open http://localhost:3000 for the UI.

### Environment Variables

```
SHOPIFY_STORE_URL=https://pirani-life.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token_here
SHOPIFY_API_VERSION=2025-10
DATABASE_URL="file:./dev.db"
```

**Shopify 401?** The app needs an **Admin API access token** (from a legacy custom app or from OAuth), not the Dev Dashboard Client ID/secret. See **[docs/SHOPIFY_CREDENTIALS.md](docs/SHOPIFY_CREDENTIALS.md)** for setup options (legacy custom app vs developer app + OAuth).

### Import Workflow

- `POST /api/shopify/orders` – fetches the latest Shopify orders, flattens line items, and upserts the `OrderLine` table.
- `POST /api/shopify/payouts` – fetches Shopify payouts and balance transactions, then updates matching rows with payout/deposit data.
- `GET /api/orders` – returns aggregated order objects for the dashboard (groups line rows back into orders).
- `GET /api/payouts` – returns aggregated payout summaries (with inline transactions) derived from `OrderLine` rows.

### Database Model (SQLite / Supabase compatible)

| Table | Description |
| --- | --- |
| `OrderLine` | Flattened Shopify order line items with Shopify/NetSuite metadata |
| `Payout` | One row per Shopify payout with aggregate status/amount |
| `PayoutTransaction` | Bridge table linking payouts to orders/lines with transaction-level amounts |

Key columns that feed the UI:

| Column                      | Description                                        |
|-----------------------------|----------------------------------------------------|
| `shopifyOrderId`            | Shopify order ID (string)                          |
| `lineItemId`                | Shopify line item ID (string)                      |
| `financialStatus`           | Shopify financial status                           |
| `fulfillmentStatus`         | Shopify fulfillment status                         |
| `currency`                  | ISO currency code                                  |
| `orderSubtotal`/`orderTotal`| Order-level amounts                                |
| `lineItemPrice`/`lineItemNet`| Per-line amounts                                   |
| `netsuite*` columns         | NetSuite references (sales order, cash sale, refund, deposit)
| `shopifyPayoutId`           | Latest associated Shopify payout ID (for quick display) |
| `expectedPayoutAmount`      | Expected amount per line/order                     |
| `actualDepositAmount`       | Actual settled amount                              |
| `varianceAmount`            | Difference actual vs expected                      |
| `paymentGatewayNames`       | JSON array of gateway codes                        |
| `shippingLines`             | JSON array of shipping lines                       |

### API Surface

- `GET /api/orders` – aggregated orders for the UI
- `GET /api/orders/:id` – single order with line items
- `POST /api/shopify/orders` – import from Shopify (optional `{ "limit": 50 }` body)
- `POST /api/shopify/payouts` – import payouts/transactions
- `GET /api/payouts` – aggregated payout summaries
- `GET /api/payouts/:id/transactions` – transactions for a payout

### Database Notes

- Local development uses SQLite (`file:./dev.db`).
- Prisma migrations are stored under `prisma/migrations/20241110_flat_schema/`.
- When you’re ready to switch to Supabase/Postgres, set `DATABASE_URL` accordingly and run `npx prisma migrate deploy`.

## UI Highlights

The UI still uses static demo data by default. When you’re ready to hook it up, replace the mock state in `src/app/page.tsx` with calls to the endpoints above (the payload shape already matches the sample data).

## Deployment

1. Provision a Postgres database (Supabase, RDS, etc.).
2. Update `DATABASE_URL` (and optionally `SHADOW_DATABASE_URL`).
3. Run `npx prisma migrate deploy`.
4. Deploy to your preferred Next.js host.
