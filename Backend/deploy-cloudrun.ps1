<#
.SYNOPSIS
    Deploys the planning half to Cloud Run.

.DESCRIPTION
    Run `gcloud auth login` first - that opens a browser and this script cannot
    do it for you.

    What goes up: main.py, services/, scripts/. What does not: .env, the
    database, uploads, and pywin32. See .dockerignore and the Dockerfile.

    The Gemini keys are read from Backend\.env and passed as Cloud Run
    environment variables. CLOUD_API_KEY is generated on the first run and
    saved to Backend\.cloud-api-key (gitignored) so that re-deploying does not
    silently invalidate the key Vercel is already using.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File deploy-cloudrun.ps1 -ProjectId my-project
    powershell -ExecutionPolicy Bypass -File deploy-cloudrun.ps1 -ProjectId my-project -Region europe-west1
#>
param(
    [Parameter(Mandatory = $true)][string]$ProjectId,

    # Mumbai - the closest region to Pakistan, so the ~20 s planning call does
    # not also pay for a trip across the world.
    [string]$Region = "asia-south1",

    [string]$ServiceName = "apparel-cloud-api",

    # Where the browser will call from. Must match the deployed frontend, or
    # CORS will refuse it.
    [string]$AllowedOrigins = "https://apparel-ai-generator.vercel.app,http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$BackendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$KeyFile = Join-Path $BackendDir ".cloud-api-key"
$EnvFile = Join-Path $BackendDir ".env"

function Fail($msg) { Write-Host ""; Write-Host $msg -ForegroundColor Red; exit 1 }

# --- checks ---------------------------------------------------------------

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Fail "gcloud is not on PATH. Open a new terminal, or install it with: winget install Google.CloudSDK"
}

$account = (gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null | Select-Object -First 1)
if (-not $account) { Fail "Not logged in. Run:  gcloud auth login" }
Write-Host "Account:  $account" -ForegroundColor DarkGray
Write-Host "Project:  $ProjectId"
Write-Host "Region:   $Region"

if (-not (Test-Path -LiteralPath $EnvFile)) { Fail "Backend\.env not found - the Gemini keys live there." }

# --- the API key ----------------------------------------------------------

if (Test-Path -LiteralPath $KeyFile) {
    $apiKey = (Get-Content -LiteralPath $KeyFile -Raw).Trim()
    Write-Host "API key:  reusing the existing one from .cloud-api-key" -ForegroundColor DarkGray
} else {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $apiKey = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Set-Content -LiteralPath $KeyFile -Value $apiKey -Encoding utf8 -NoNewline
    Write-Host "API key:  generated and saved to .cloud-api-key" -ForegroundColor Green
}

# --- the Gemini keys, straight from .env ----------------------------------

$envVars = [ordered]@{}
foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match '^\s*(GEMINI_API_KEY\d?)\s*=\s*(.+?)\s*$') {
        $envVars[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
    }
}
if ($envVars.Count -eq 0) { Fail "No GEMINI_API_KEY* found in Backend\.env" }
Write-Host "Gemini:   $($envVars.Count) key(s) from .env" -ForegroundColor DarkGray

$envVars["CLOUD_API_KEY"] = $apiKey
$envVars["CLOUD_ALLOWED_ORIGINS"] = $AllowedOrigins

# A YAML file, not --set-env-vars: CLOUD_ALLOWED_ORIGINS contains commas, and
# gcloud splits that flag on commas.
$envYaml = Join-Path $env:TEMP "apparel-env-$([guid]::NewGuid().ToString('N')).yaml"
$lines = foreach ($k in $envVars.Keys) { "${k}: `"$($envVars[$k])`"" }
Set-Content -LiteralPath $envYaml -Value $lines -Encoding utf8

try {
    Write-Host ""
    Write-Host "Setting the project and enabling the APIs..." -ForegroundColor Cyan
    gcloud config set project $ProjectId 2>&1 | Out-Null
    gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com 2>&1 | Out-Null

    Write-Host "Building and deploying - the first run takes several minutes..." -ForegroundColor Cyan
    gcloud run deploy $ServiceName `
        --source $BackendDir `
        --region $Region `
        --platform managed `
        --allow-unauthenticated `
        --env-vars-file $envYaml `
        --memory 1Gi `
        --cpu 1 `
        --timeout 300 `
        --min-instances 0 `
        --max-instances 4

    if ($LASTEXITCODE -ne 0) { Fail "Deployment failed - read the error above." }
} finally {
    # The keys were in this file. It does not outlive the deploy.
    Remove-Item -LiteralPath $envYaml -Force -ErrorAction SilentlyContinue
}

$url = (gcloud run services describe $ServiceName --region $Region --format="value(status.url)" 2>$null)

Write-Host ""
Write-Host "Deployed." -ForegroundColor Green
Write-Host "  URL: $url"
Write-Host ""
Write-Host "Now, in Vercel -> Settings -> Environment Variables:" -ForegroundColor Cyan
Write-Host "  CLOUD_API      = $url"
Write-Host "  CLOUD_API_KEY  = (the value in Backend\.cloud-api-key)"
Write-Host ""
Write-Host "Neither takes a NEXT_PUBLIC_ prefix. That prefix would compile the key"
Write-Host "into the JavaScript every visitor downloads."
Write-Host ""
Write-Host "Check it:" -ForegroundColor Cyan
Write-Host "  curl $url/health"
