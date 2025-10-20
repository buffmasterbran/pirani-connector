# PowerShell script to set up Shopify webhook for new orders
Write-Host "Setting up Shopify webhook for new orders..." -ForegroundColor Green

# Check if we have the required environment variables
$webhookSecret = $env:SHOPIFY_WEBHOOK_SECRET
$webhookUrl = $env:WEBHOOK_URL

if (-not $webhookSecret) {
    Write-Host "❌ SHOPIFY_WEBHOOK_SECRET environment variable not set!" -ForegroundColor Red
    Write-Host "Please set this in your .env file or environment variables" -ForegroundColor Yellow
    exit 1
}

if (-not $webhookUrl) {
    Write-Host "⚠️ WEBHOOK_URL environment variable not set, using default..." -ForegroundColor Yellow
    $webhookUrl = "https://pirani-connector-1ihpp1cwk-brandegee-pierces-projects.vercel.app/api/webhooks/shopify/orders"
    Write-Host "Using: $webhookUrl" -ForegroundColor Cyan
}

Write-Host "🔗 Creating webhook at: $webhookUrl" -ForegroundColor Cyan

# Create the webhook using curl
$headers = @{
    "X-Shopify-Access-Token" = $env:SHOPIFY_ACCESS_TOKEN
    "Content-Type" = "application/json"
}

$webhookData = @{
    webhook = @{
        topic = "orders/create"
        address = $webhookUrl
        format = "json"
    }
} | ConvertTo-Json -Depth 3

try {
    $response = Invoke-RestMethod -Uri "https://pirani-life.myshopify.com/admin/api/2025-10/webhooks.json" -Method POST -Headers $headers -Body $webhookData
    
    Write-Host "✅ Webhook created successfully!" -ForegroundColor Green
    Write-Host "Webhook ID: $($response.webhook.id)" -ForegroundColor Cyan
    Write-Host "Topic: $($response.webhook.topic)" -ForegroundColor Cyan
    Write-Host "Address: $($response.webhook.address)" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Failed to create webhook: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
    exit 1
}

Write-Host "🎉 Webhook setup completed!" -ForegroundColor Green
