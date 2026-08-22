# =====================================================================
# ClassStatus NCR — Local Development Starter Script
# Launches the Next.js development server and automatically opens the browser.
# =====================================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  🇵🇭 ClassStatus NCR — Starting Local Environment" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Ensure we are in the script's root directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($scriptDir) {
    Set-Location $scriptDir
}

# 1. Verify dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "[1/3] node_modules not found. Installing dependencies with npm install..." -ForegroundColor Yellow
    npm install
} else {
    Write-Host "[1/3] Dependencies verified." -ForegroundColor Green
}

# 2. Start a background job to automatically open the browser once the server is listening
Write-Host "[2/3] Scheduling browser auto-launch for http://localhost:3000..." -ForegroundColor Cyan
Start-Job -ScriptBlock {
    $url = "http://localhost:3000"
    $maxAttempts = 30
    $attempt = 0
    $ready = $false

    # Poll until Next.js dev server is reachable
    while ($attempt -lt $maxAttempts -and -not $ready) {
        Start-Sleep -Seconds 1
        $attempt++
        try {
            $response = [System.Net.WebRequest]::Create($url).GetResponse()
            if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 304) {
                $ready = $true
            }
            $response.Close()
        } catch {
            # Still compiling/starting, continue waiting
        }
    }

    # Open default browser
    Start-Process $url
} | Out-Null

# 3. Launch Next.js Dev Server in the active terminal
Write-Host "[3/3] Starting Next.js development server..." -ForegroundColor Green
Write-Host ""
Write-Host "👉 App URL:   http://localhost:3000" -ForegroundColor Cyan
Write-Host "👉 Press Ctrl+C anytime to stop the server." -ForegroundColor Gray
Write-Host ""

npm run dev
