<#
.SYNOPSIS
    Assembles the folder that goes to a designer's PC.

.DESCRIPTION
    Copies ONLY what the agent needs. A designer must never receive the repo:
    it carries the Gemini agent code, the API key in Backend\.env, the whole
    frontend, and every test order. None of that belongs on their machine, and
    the key must not leave yours.

    The result is dropped straight into %LOCALAPPDATA%\AIApparelAgent by
    default - per-user, so installing needs no administrator rights.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File build-agent-package.ps1
    powershell -ExecutionPolicy Bypass -File build-agent-package.ps1 -Destination D:\ToShip\AIApparelAgent
#>
param(
    [string]$Destination = (Join-Path $env:LOCALAPPDATA "AIApparelAgent"),

    # Build straight into the website's download instead: staged in TEMP, zipped
    # to Frontend\my-app\public\AIApparelAgent.zip.
    #
    # RUN THIS AFTER ANY CHANGE TO automate_production.jsx OR
    # illustrator_automation.py. The zip is a snapshot - designers keep
    # downloading whatever was last built here, so a stale one quietly ships
    # last month's render logic.
    [switch]$ForWebsite
)

$ErrorActionPreference = "Stop"

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $AgentDir
$BackendDir = Join-Path $RepoRoot "Backend"

# The zip must unpack into ONE folder named AIApparelAgent, not spray nine
# files into whatever the designer had open.
if ($ForWebsite) {
    $Destination = Join-Path $env:TEMP "AIApparelAgent"
    if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
}

Write-Host "Building the agent package into $Destination" -ForegroundColor Cyan

# Never wipe an existing install blindly - the pairing token and any local
# settings live in there.
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Destination "services") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Destination "scripts") | Out-Null

# The agent itself.
foreach ($f in @("main.py", "install-agent.ps1", "requirements.txt", "README.md")) {
    Copy-Item (Join-Path $AgentDir $f) -Destination $Destination -Force
}

# The automation. `services` and `scripts` sit side by side on purpose:
# illustrator_automation resolves the JSX bundle as <parent of services>\scripts
# from its own __file__, so this layout mirrors Backend\ and needs no changes.
foreach ($f in @("illustrator_automation.py", "job_runtime.py")) {
    Copy-Item (Join-Path $BackendDir "services\$f") -Destination (Join-Path $Destination "services") -Force
}
Copy-Item (Join-Path $BackendDir "scripts\*.jsx") -Destination (Join-Path $Destination "scripts") -Force

# Deliberately NOT copied, and worth naming so nobody "helpfully" adds them:
#   Backend\main.py        the Gemini agent and every planning rule
#   Backend\.env           the API key
#   Backend\services\excel_service.py   cloud-side only
#   Backend\uploads, Backend\Production testing files, Frontend\
# Checked by exact path inside the package, not by filename: the agent has a
# main.py of its own, and comparing leaf names flagged that as a leak.
$mustNotExist = @("services\excel_service.py", ".env", "uploads", "Frontend")
foreach ($x in $mustNotExist) {
    if (Test-Path -LiteralPath (Join-Path $Destination $x)) {
        Write-Warning "$x must NOT be in the package - remove it before shipping."
    }
}

$files = Get-ChildItem $Destination -Recurse -File | Where-Object { $_.FullName -notlike "*\.venv\*" }
$size = [math]::Round((($files | Measure-Object Length -Sum).Sum) / 1MB, 1)
Write-Host "Packaged $($files.Count) files, $size MB (before the venv)." -ForegroundColor Green

if ($ForWebsite) {
    $zip = Join-Path $RepoRoot "Frontend\my-app\public\AIApparelAgent.zip"
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    Compress-Archive -Path $Destination -DestinationPath $zip -CompressionLevel Optimal
    $kb = [math]::Round((Get-Item -LiteralPath $zip).Length / 1KB, 0)
    Write-Host "Wrote $zip ($kb KB)." -ForegroundColor Green
    Write-Host "The home page quotes this size - update it there if it has moved much." -ForegroundColor DarkYellow
    Write-Host "Commit the zip and redeploy the frontend for designers to get it."
} else {
    Write-Host ""
    Write-Host "On the designer's PC, from that folder:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File install-agent.ps1"
}
