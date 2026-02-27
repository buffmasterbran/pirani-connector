import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Suspense } from "react"
import "./globals.css"
import { StoreProvider } from "@/lib/product-sync/store-context"
import { AccountProvider } from "@/lib/account-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Pirani Payout Sync",
  description: "Shopify Payouts ↔ NetSuite Orders Reconciliation Tool",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Suspense>
          <StoreProvider>
            <AccountProvider>{children}</AccountProvider>
          </StoreProvider>
        </Suspense>
      </body>
    </html>
  )
}
