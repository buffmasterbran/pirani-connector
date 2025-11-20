# Script to fix Prisma client and restart server
Write-Host "🔧 Fixing Prisma Client and Restarting Server..." -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "prisma/schema.prisma")) {
    Write-Host "❌ Error: prisma/schema.prisma not found. Please run this script from the project root." -ForegroundColor Red
    exit 1
}

Write-Host "📋 Step 1: Stopping any running Node processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "   Found $($nodeProcesses.Count) Node process(es). Please stop your dev server manually (Ctrl+C)" -ForegroundColor Yellow
    Write-Host "   Then press Enter to continue..." -ForegroundColor Yellow
    Read-Host
} else {
    Write-Host "✅ No Node processes found" -ForegroundColor Green
}

Write-Host ""
Write-Host "📋 Step 2: Regenerating Prisma client..." -ForegroundColor Yellow
npx prisma generate

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to regenerate Prisma client. Make sure all Node processes are stopped." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prisma client regenerated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Step 3: Starting dev server..." -ForegroundColor Yellow
Write-Host "   Run: npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Ready! You can now import orders and addresses should save correctly." -ForegroundColor Green

