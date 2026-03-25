# Product Sync Module — NetSuite → Shopify

One-way sync of **price and inventory quantity** from NetSuite to Shopify. Integrated into the main **Pirani Connector** app (sidebar → **Product Sync**). Single store per connector instance.

**Access:** In the main app, click **Product Sync** in the left sidebar. The old URL `/product-sync` redirects to `/?section=product-sync`.

## Quick Start

1. Add `CREDENTIAL_ENCRYPTION_KEY` to your `.env.local` (32-byte hex = 64 hex chars):

```
CREDENTIAL_ENCRYPTION_KEY=<your-64-char-hex-key>
```

Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

2. Run `npx prisma db push` or apply the SQL migration in `prisma/product_sync_migration.sql`.

3. Start the dev server: `npm run dev`

4. Open the main app and click **Product Sync** in the sidebar (or go to `/?section=product-sync`)

5. In the **Configuration** tab:
   - Add your one Shopify store (domain + access token from a Shopify custom app)
   - Configure price level mappings (which NetSuite price level → Shopify price)
   - Map NetSuite locations → Shopify locations (optional; without mappings, inventory sums all NS locations)
   - Set the NetSuite flag field ID (e.g., `custitem_fa_shopify_flag01`)
   - **Pull from NetSuite** — fetches flagged items, prices, and inventory; saves to DB (no Shopify required)
   - **Match** — links NetSuite items to Shopify variants by SKU (requires Shopify connected)
   - **Push to Shopify** — syncs price and inventory changes to Shopify (requires Match first)

6. Switch to the **Products** tab to see your items (from Pull) and trigger syncs.

## Architecture

```
src/
├── app/product-sync/                  # UI (page, tabs)
│   ├── page.tsx                       # Main page with store switcher + tabs
│   ├── config-tab.tsx                 # Configuration tab
│   ├── products-tab.tsx               # Products dashboard
│   └── layout.tsx                     # StoreProvider wrapper
│
├── app/api/product-sync/             # API routes
│   ├── config/stores/                 # Store CRUD
│   ├── config/locations/              # Location mapping CRUD
│   ├── netsuite/locations/            # NS locations proxy
│   ├── netsuite/price-levels/         # NS price levels proxy
│   ├── shopify/test-connection/       # Test Shopify credentials
│   ├── shopify/locations/             # Shopify locations per store
│   ├── products/                      # Paginated product list + summary
│   └── sync/                          # pull, match, trigger, logs, status, scheduler
│
├── lib/product-sync/                  # Core logic
│   ├── netsuite.ts                    # SuiteQL queries with pagination
│   ├── shopify-graphql.ts             # GraphQL client (per-store, rate-limited)
│   ├── sync-engine.ts                 # Full, incremental, single-item sync
│   ├── sync-scheduler.ts             # In-memory scheduler (POC only)
│   ├── sku-matcher.ts                 # SKU-based matching logic
│   ├── store-context.tsx              # React context for active store
│   ├── types.ts                       # Shared TypeScript interfaces
│   └── url-helpers.ts                 # NetSuite/Shopify URL builders
│
├── lib/encryption.ts                  # AES-256-GCM for Shopify tokens
└── lib/prisma.ts                      # Prisma client singleton
```

## Database Tables

All tables are prefixed with `ProductSync`:
- `ProductSyncStoreConfig` — Per-store config (credentials, price levels, intervals)
- `ProductSyncLocationMapping` — NS location → Shopify location per store
- `ProductSyncMapping` — NS item ↔ Shopify variant link, sync state per store
- `ProductSyncLog` — Audit trail for every sync run
- `ProductSyncJob` — Scheduler job state

## Key Concepts

**Load from DB, sync updates DB**: All list views (Products, config dropdowns) read from the database only, so loading is fast. Only explicit actions (Pull from NetSuite, Match, Push to Shopify) call external APIs and update the DB.

**Store-scoped**: Everything is scoped to the active store. The Products tab shows only items for the selected store. The store switcher in the header changes context.

**Flag-driven**: NetSuite items have a custom dropdown field per Shopify store (`custitem_fa_shopify_flag01`, etc.). Only items with value `1` (Add/Update Item) are synced.

**Item types**: `InvtPart` and `Kit` by default. Optional `NonInvtPart` for price-only sync via per-store toggle.

**Location aggregation**: Multiple NS locations can map to one Shopify location. Quantities are summed, floored at 0. If no mappings exist, Pull will sum inventory across all NetSuite locations (for preview).

**Location mapping without Shopify**: If Shopify isn't connected, you can manually enter the Shopify location GID (`gid://shopify/Location/12345`) when adding a mapping. Find it in Shopify Admin → Settings → Locations.

**Smart polling**: Scheduler checks inventory levels after each sync. If any items are below the low stock threshold, the next interval is shortened.

## Environment Variables

```env
# Required (already in your .env.local)
DATABASE_URL=...
NETSUITE_ACCOUNT_ID=7913744
NETSUITE_CONSUMER_KEY=...
NETSUITE_CONSUMER_SECRET=...
NETSUITE_TOKEN_ID=...
NETSUITE_TOKEN_SECRET=...

# New — required for product sync
CREDENTIAL_ENCRYPTION_KEY=<64-char-hex>
```

Shopify store credentials (domain + access token) are entered through the UI and stored encrypted in the database — NOT in env vars.

## For Developers: Extending This

This module is designed as a reference implementation for the full connector. To add new sections (Orders, Fulfillments, etc.):

1. The `ProductSyncStoreConfig` table acts as the **store registry**. Reuse it or extend it.
2. Follow the same store-scoped pattern: store switcher → scoped views.
3. The scheduler is POC-only (`setInterval` in memory). Replace with Bull, pg-boss, or Vercel Cron for production.
4. The encryption module (`lib/encryption.ts`) is reusable for any credentials.

## NetSuite SuiteQL Queries

All queries are in `lib/product-sync/netsuite.ts`. Key queries:
- Items with sync flags → `fetchSyncableItems(flagFieldId)`
- Prices at a level → `fetchPricesForItems(priceLevelId, itemIds)`
- Inventory by location → `fetchInventoryByLocation(itemIds, locationIds)`
- Changed items since timestamp → `fetchRecentlyChangedItemIds(since, locationIds, flagFieldId)`
- Reference data → `fetchLocations()`, `fetchPriceLevels()`

All queries handle pagination (1000 rows per page).
