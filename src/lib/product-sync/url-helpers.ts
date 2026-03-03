import { buildItemUrl } from '@/lib/netsuite'

export function netsuiteItemUrl(itemId: number): string {
  return buildItemUrl(itemId)
}

export function shopifyAdminProductUrl(domain: string, productGid: string): string {
  const numericId = productGid.split('/').pop()
  return `https://${domain}/admin/products/${numericId}`
}

export function extractNumericId(gid: string): string {
  return gid.split('/').pop() || ''
}
