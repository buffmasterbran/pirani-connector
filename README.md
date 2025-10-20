# Pirani Payout Sync

A modern Next.js 14 application for reconciling Shopify Payouts and NetSuite Orders.

## 🚀 Features

- **Pull Payouts from Shopify**: Fetch and display payouts and transactions from Shopify's Admin API
- **Push Orders to NetSuite**: Placeholder for future NetSuite integration
- **Previous Payouts**: View and manage previously saved payout data
- **Modern UI**: Built with shadcn/ui components and TailwindCSS
- **Database Storage**: SQLite for local development, Postgres-ready schema

## 🛠️ Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **TailwindCSS**
- **shadcn/ui** components
- **Prisma ORM** with SQLite
- **Lucide React** icons
- **date-fns** for date formatting

## 📦 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd pirani-connector
```

2. Install dependencies:
```bash
npm install
```

3. Set up the database:
```bash
npm run db:push
```

4. (Optional) Seed the database with sample data:
```bash
npm run db:seed
```

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🏗️ Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── shopify/
│   │   │   └── payouts/
│   │   └── payouts/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/          # shadcn/ui components
│   ├── PayoutCard.tsx
│   ├── TransactionsTable.tsx
│   └── Loader.tsx
└── lib/
    ├── prisma.ts
    ├── shopify.ts
    └── utils.ts
prisma/
├── schema.prisma
└── seed.ts
```

## 🔧 Configuration

### Environment Variables

Create a `.env.local` file in the root directory with your Shopify credentials:

```bash
# Shopify Configuration
SHOPIFY_STORE_URL=https://pirani-life.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token_here
SHOPIFY_API_VERSION=2025-10
```

### Database

- **Development**: SQLite (`dev.db`)
- **Production Ready**: Postgres-compatible schema

## 📊 API Endpoints

- `GET /api/shopify/payouts` - Fetch payouts from Shopify
- `GET /api/shopify/payouts/[id]/transactions` - Fetch transactions for a payout
- `POST /api/payouts/save` - Save payout and transactions to database
- `GET /api/payouts` - Retrieve saved payouts from database

## 🎨 UI Components

- **PayoutCard**: Displays payout summary with actions
- **TransactionsTable**: Shows detailed transaction data
- **Tabs**: Navigation between different sections
- **Loader**: Loading states and animations

## 🚀 Deployment

The application is ready for deployment to platforms like Vercel, Netlify, or any Node.js hosting service.

For production deployment:

1. Set up a Postgres database
2. Update the `DATABASE_URL` in your environment variables
3. Run `npm run build` to create the production build
4. Deploy to your preferred platform

## 🔮 Future Enhancements

- NetSuite integration for pushing orders
- Automated cron sync functionality
- Advanced filtering and search
- Export functionality
- Real-time notifications
- User authentication and authorization

## 📝 License

Built by Pirani Life for internal use.

---

**Built by Pirani Life • Shopify ↔ NetSuite Sync Tool**
