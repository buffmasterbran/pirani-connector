# PowerShell script to fix Prisma client sync issue
# This script stops the dev server, regenerates Prisma client, and restarts the server

Write-Host "🔧 Fixing Prisma Client Sync Issue..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if dev server is running
Write-Host "📋 Step 1: Checking for running Node processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "⚠️  Found running Node processes. These need to be stopped to regenerate Prisma client." -ForegroundColor Yellow
    Write-Host "   Please stop your dev server (Ctrl+C in the terminal where it's running)" -ForegroundColor Yellow
    Write-Host "   Then run: npx prisma generate" -ForegroundColor Yellow
    Write-Host "   Then restart your dev server: npm run dev" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Or, if you want to continue anyway, press Enter..." -ForegroundColor Yellow
    Read-Host
} else {
    Write-Host "✅ No Node processes found running" -ForegroundColor Green
}

# Step 2: Regenerate Prisma client
Write-Host ""
Write-Host "📋 Step 2: Regenerating Prisma client..." -ForegroundColor Yellow
npx prisma generate

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Prisma client regenerated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Step 3: Starting dev server..." -ForegroundColor Yellow
    Write-Host "   Run: npm run dev" -ForegroundColor Cyan
} else {
    Write-Host "❌ Failed to regenerate Prisma client" -ForegroundColor Red
    Write-Host "   Make sure your dev server is stopped, then run: npx prisma generate" -ForegroundColor Yellow
}

