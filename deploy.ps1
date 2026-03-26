# One DSD COS — One-Command Cloud Deploy (Windows PowerShell)
# Run: .\deploy.ps1

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  One DSD COS — Cloud Deployment Script  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan

# Check Node.js
try { node --version | Out-Null } catch { Write-Error "Node.js required. Install from nodejs.org"; exit 1 }

# Install Railway CLI
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "→ Installing Railway CLI..." -ForegroundColor Yellow
    npm install -g @railway/cli
}

Write-Host "→ Logging into Railway (browser will open)..." -ForegroundColor Yellow
railway login

Write-Host "→ Creating Railway project..." -ForegroundColor Yellow
railway init --name "one-dsd-cos"

Write-Host "→ Setting environment variables..." -ForegroundColor Yellow
$jwtSecret = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
railway variables --set "NODE_ENV=production"
railway variables --set "JWT_SECRET=$jwtSecret"
railway variables --set "ANTHROPIC_API_KEY=your-anthropic-api-key-here"

Write-Host "→ Deploying..." -ForegroundColor Yellow
railway up --detach

Write-Host "→ Getting deployment URL..." -ForegroundColor Yellow
railway domain

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host "   railway status | railway logs" -ForegroundColor Green
