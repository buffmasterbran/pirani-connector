# Setup Guide for New Computer

This guide explains how to set up the Pirani Connector project on a new computer.

## Quick Setup Steps

1. **Clone or copy the project** to your new computer
2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env.local` file** in the project root with your environment variables (see below)

4. **Set up the database:**
   ```bash
   npx prisma db push
   ```

5. **Seed initial data (optional):**
   ```bash
   npm run db:seed
   ```

6. **Start the development server:**
   ```bash
   npm run dev
   ```

## Environment Variables

Create a `.env.local` file in the project root with the following variables:

```env
# Database Configuration
DATABASE_URL="file:./prisma/dev.db"

# Shopify API Configuration
SHOPIFY_STORE_URL="https://your-store.myshopify.com"
SHOPIFY_ACCESS_TOKEN="your-shopify-access-token"
SHOPIFY_API_VERSION="2024-07"

# NetSuite API Configuration
NETSUITE_RESTLET_URL="https://your-account.restlets.api.netsuite.com/app/site/hosting/restlet.nl"
NETSUITE_ACCOUNT_ID="your-netsuite-account-id"
NETSUITE_SCRIPT_ID="your-netsuite-script-id"
NETSUITE_DEPLOY_ID="1"
NETSUITE_CONSUMER_KEY="your-netsuite-consumer-key"
NETSUITE_CONSUMER_SECRET="your-netsuite-consumer-secret"
NETSUITE_TOKEN_ID="your-netsuite-token-id"
NETSUITE_TOKEN_SECRET="your-netsuite-token-secret"
```

## Getting Your Environment Variables

### From Your Current Computer

1. **Copy `.env.local`** from your current computer to the new one
   - The file is located in the project root directory
   - You can copy it via USB drive, cloud storage, or email it to yourself

2. **Or manually copy the values:**
   - Open `.env.local` on your current computer
   - Copy all the values
   - Create a new `.env.local` file on the new computer
   - Paste the values

### Important Notes

- **Never commit `.env.local` to Git** - it's already in `.gitignore` for security
- **Keep your credentials secure** - don't share them publicly
- The database file (`prisma/dev.db`) is also gitignored, so you'll need to:
  - Either copy it from your current computer, OR
  - Start fresh and import data using the import buttons in the UI

## Database Setup Options

### Option 1: Copy Existing Database (Recommended)
If you want to keep your existing data:
1. Copy `prisma/dev.db` from your current computer
2. Place it in `prisma/dev.db` on the new computer
3. Run `npx prisma db push` to ensure schema is up to date

### Option 2: Start Fresh
If you want a clean database:
1. Run `npx prisma db push` to create a new database
2. Run `npm run db:seed` to load seed data
3. Use the import buttons in the UI to fetch data from Shopify/NetSuite

## Troubleshooting

- **Database connection errors:** Make sure `DATABASE_URL` points to the correct path
- **Shopify API errors:** Verify your `SHOPIFY_ACCESS_TOKEN` is still valid
- **NetSuite API errors:** Check that all NetSuite credentials are correct
- **Module not found:** Run `npm install` again

## Security Best Practices

- Use a password manager to store your credentials
- Consider using environment variable management tools for teams
- Never commit `.env.local` or any `.env` files to version control
- Rotate credentials periodically, especially if shared between computers

