export const metadata = {
  title: 'Product Sync | Pirani Connector',
}

export default function ProductSyncLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
