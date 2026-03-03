export const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
export const NETSUITE_RESTLET_URL = process.env.NETSUITE_RESTLET_URL
export const NETSUITE_SCRIPT_ID = process.env.NETSUITE_SCRIPT_ID || '2805'
export const NETSUITE_DEPLOY_ID = process.env.NETSUITE_DEPLOY_ID || '1'
export const NETSUITE_CONSUMER_KEY = process.env.NETSUITE_CONSUMER_KEY
export const NETSUITE_CONSUMER_SECRET = process.env.NETSUITE_CONSUMER_SECRET
export const NETSUITE_TOKEN_ID = process.env.NETSUITE_TOKEN_ID
export const NETSUITE_TOKEN_SECRET = process.env.NETSUITE_TOKEN_SECRET

export function buildSuiteQLUrl(): string {
  return `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`
}

export function buildRestletUrl(scriptId: string, deployId: string): string {
  return `https://${NETSUITE_ACCOUNT_ID}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=${scriptId}&deploy=${deployId}`
}

export function buildRecordUrl(recordType: string): string {
  return `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/${recordType}`
}

export function buildItemUrl(itemId: number): string {
  return `https://${NETSUITE_ACCOUNT_ID}.app.netsuite.com/app/common/item/item.nl?id=${itemId}`
}
