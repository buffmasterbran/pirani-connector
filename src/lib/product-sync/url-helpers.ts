const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'

export function netsuiteItemUrl(itemId: number): string {
  return `https://${NETSUITE_ACCOUNT_ID}.app.netsuite.com/app/common/item/item.nl?id=${itemId}`
}

export function shopifyAdminProductUrl(domain: string, productGid: string): string {
  const numericId = productGid.split('/').pop()
  return `https://${domain}/admin/products/${numericId}`
}

export function extractNumericId(gid: string): string {
  return gid.split('/').pop() || ''
}
