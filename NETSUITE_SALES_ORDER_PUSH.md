# NetSuite Sales Order Push Implementation

## Overview

This implementation allows you to push Shopify orders to NetSuite as Sales Orders using:
- **NetSuite Customer IDs** for customer references
- **NetSuite Address IDs** for billing and shipping addresses
- **SKUs** for product/item references (no need for NetSuite item IDs)

## How It Works

### 1. Building the Payload (`buildNetSuiteSalesOrderPayload`)

The function:
- Fetches order data from `OrderLine` table
- Looks up customer and addresses from `Customer` and `CustomerAddress` tables
- Uses NetSuite IDs that were populated during import:
  - `Customer.netsuiteCustomerId` → `entity.id`
  - `CustomerAddress.netsuiteAddressId` (billing) → `billAddressList.id`
  - `CustomerAddress.netsuiteAddressId` (shipping) → `shipAddressList.id`
- Uses SKUs from `OrderLine.lineItemSku` → `item.itemid` (NetSuite supports SKU directly)

### 2. NetSuite Sales Order JSON Structure

```json
{
  "entity": {
    "id": "123"  // NetSuite Customer Internal ID
  },
  "tranDate": "2024-01-15",
  "tranId": "42256",  // Order number (without #)
  "otherRefNum": "#42256",  // Shopify order name
  "externalId": "6614913319169",  // Shopify order ID
  "memo": "Shopify Order: #42256",
  "billAddressList": {
    "id": "456"  // NetSuite Billing Address Internal ID
  },
  "shipAddressList": {
    "id": "789"  // NetSuite Shipping Address Internal ID
  },
  "item": {
    "items": [
      {
        "item": {
          "itemid": "SKU-12345"  // SKU (not internal ID!)
        },
        "quantity": 2,
        "rate": 29.99,
        "description": "Product Name"
      }
    ]
  },
  "subtotal": 59.98,
  "taxTotal": 4.80,
  "shippingCost": 5.00,
  "total": 69.78,
  "currency": {
    "id": "USD"
  }
}
```

### 3. API Endpoints

#### Preview Payload (GET)
```bash
GET /api/netsuite/push-order?shopifyOrderId=6614913319169
```

Returns the payload that would be sent to NetSuite without actually creating the order.

#### Push Order (POST)
```bash
POST /api/netsuite/push-order
Content-Type: application/json

{
  "shopifyOrderId": "6614913319169"
}
```

Creates the sales order in NetSuite and updates the `OrderLine` records with:
- `netsuiteSalesOrderId`
- `netsuiteSalesOrderName`
- `syncedNetsuiteAt`

## Prerequisites

Before pushing an order, ensure:

1. **Customer has NetSuite ID**: The customer must have been matched to NetSuite during import
   - Check `Customer.netsuiteCustomerId` is populated

2. **Addresses have NetSuite IDs**: Billing and shipping addresses should be matched
   - Check `CustomerAddress.netsuiteAddressId` is populated for default billing/shipping addresses
   - Addresses are matched during import if customer has NetSuite ID

3. **Line items have SKUs**: All order line items must have SKUs
   - Check `OrderLine.lineItemSku` is populated
   - Items without SKUs will be skipped with a warning

## Usage Examples

### From Code

```typescript
import { buildNetSuiteSalesOrderPayload, createNetSuiteSalesOrder } from '@/lib/netsuite-sales-order'

// Build payload
const { payload, errors } = await buildNetSuiteSalesOrderPayload('6614913319169')

// Check for errors/warnings
if (errors.length > 0) {
  console.warn('Warnings:', errors)
}

// Create in NetSuite
const result = await createNetSuiteSalesOrder(payload)
if (result.success) {
  console.log(`Created sales order: ${result.salesOrderId}`)
}
```

### From API

```bash
# Preview first
curl "http://localhost:3000/api/netsuite/push-order?shopifyOrderId=6614913319169"

# Then push
curl -X POST "http://localhost:3000/api/netsuite/push-order" \
  -H "Content-Type: application/json" \
  -d '{"shopifyOrderId": "6614913319169"}'
```

## Error Handling

The function collects warnings/errors and returns them:
- Missing customer NetSuite ID
- Missing address NetSuite IDs
- Missing SKUs on line items
- NetSuite API errors

All errors are logged and returned in the API response.

## Notes

- **SKUs**: NetSuite REST API supports using `itemid` (SKU) directly instead of internal IDs
- **Addresses**: Only default billing/shipping addresses are used
- **Dates**: NetSuite expects dates in `YYYY-MM-DD` format
- **Currency**: NetSuite expects uppercase currency codes (e.g., "USD")
- **Order Number**: The `#` is removed from Shopify order names for `tranId`

## Future Enhancements

- Support for custom fields mapping
- Support for payment terms, location, subsidiary
- Batch order pushing
- Retry logic for failed pushes
- Webhook notifications on success/failure




