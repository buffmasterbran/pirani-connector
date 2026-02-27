# Shopify credentials setup

The connector calls Shopify’s **Admin API** using a **store URL** and an **Admin API access token**. Credentials can come from:

1. **OAuth (developer app)** – recommended. You connect a store via “Connect with Shopify” in the app; the token is stored in the database.
2. **Environment variables** – fallback. Set `SHOPIFY_STORE_URL` and `SHOPIFY_ACCESS_TOKEN` in `.env.local`.

If you see **401 Unauthorized**, the token in use is wrong, expired, or for a different store.

---

## Option A: Connect with Shopify (developer app / OAuth)

This is the supported path when legacy custom apps are no longer an option.

### 1. Dev Dashboard setup

1. In [Shopify Dev Dashboard](https://dev.shopify.com) open your app (e.g. **pirani-connector**).
2. Under **App setup** or **URLs**, set **Allowed redirection URL(s)** to include your callback URL:
   - Local: `http://localhost:3000/api/shopify/oauth/callback`
   - Production: `https://your-domain.com/api/shopify/oauth/callback`
3. Copy your **Client ID** and **Client secret** (under **Client credentials** or **API credentials**).

### 2. Environment variables

In `.env.local`:

```env
SHOPIFY_CLIENT_ID=your_client_id_from_dev_dashboard
SHOPIFY_CLIENT_SECRET=your_client_secret_from_dev_dashboard
CREDENTIAL_ENCRYPTION_KEY=64_character_hex_string
```

You do **not** set `SHOPIFY_ACCESS_TOKEN` here; the app gets the token when you connect a store.

### 3. Connect the store

1. Restart the dev server.
2. In the app, open the account menu (top right) → **Add account**.
3. Under “Connect with Shopify”, enter your store name (e.g. `pirani-life`) and click **Connect store**.
4. You’ll be sent to Shopify to approve the app. After approving, you’re redirected back and the store is added. Orders, payouts, and Product Sync will use this store’s token.

If you already installed the app on the store before adding the callback URL, use “Connect store” again (or reinstall the app from the Dev Dashboard); the callback will run and save the token.

---

## Option B: Environment variables (fallback)

If you have an **Admin API access token** (e.g. from a legacy custom app or for testing), you can set:

```env
SHOPIFY_STORE_URL=https://your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_VERSION=2025-10
```

The app uses these when no store is connected via OAuth.

---

## How credentials are chosen

- If at least one store is connected via OAuth (saved in the database), the app uses the **first** such store’s credentials for all Shopify API calls (orders, payouts, etc.).
- If none are connected, it falls back to `SHOPIFY_STORE_URL` and `SHOPIFY_ACCESS_TOKEN` from the environment.

---

## Checklist if you still get 401

- [ ] **Using OAuth:** You added the **exact** callback URL to your app’s **Allowed redirection URL(s)** in the Dev Dashboard (including `http` vs `https` and port).
- [ ] **Using OAuth:** You completed “Connect store” and were redirected back to the app (no error in the URL).
- [ ] **Using env:** `SHOPIFY_ACCESS_TOKEN` is an Admin API access token, not the Client ID or Client secret.
- [ ] **Using env:** `SHOPIFY_STORE_URL` matches the store that issued the token (e.g. `https://pirani-life.myshopify.com`).
- [ ] You restarted the Next.js dev server after changing `.env.local`.
