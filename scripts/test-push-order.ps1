# Test script to push order to NetSuite
$orderId = "6614913319169"

Write-Host "Testing GET (preview)..." -ForegroundColor Cyan
$preview = Invoke-RestMethod -Uri "http://localhost:3000/api/netsuite/push-order?shopifyOrderId=$orderId" -Method GET
Write-Host "Preview Result:" -ForegroundColor Green
$preview | ConvertTo-Json -Depth 10

Write-Host "`nTesting POST (push)..." -ForegroundColor Cyan
$body = @{
    shopifyOrderId = $orderId
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/netsuite/push-order" -Method POST -Body $body -ContentType "application/json"
    Write-Host "Push Result:" -ForegroundColor Green
    $result | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message
    }
}




