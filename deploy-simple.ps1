# Simple Vercel deployment script
Write-Host "Starting Vercel deployment..." -ForegroundColor Green

# Navigate to project directory
Set-Location "C:\Users\Brandegee\Desktop\Pirani Connector\pirani-connector"

# Check if we're in the right directory
Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow

# Check if package.json exists
if (Test-Path "package.json") {
    Write-Host "Found package.json" -ForegroundColor Green
} else {
    Write-Host "package.json not found!" -ForegroundColor Red
    exit 1
}

# Deploy to Vercel
Write-Host "Deploying to Vercel..." -ForegroundColor Yellow
vercel --prod --confirm

Write-Host "Deployment completed!" -ForegroundColor Green

