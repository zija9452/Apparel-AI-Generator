<#
.SYNOPSIS
    Makes the AI Apparel agent start with Windows, on this designer's PC.

.DESCRIPTION
    Registers a Scheduled Task that launches the agent AT LOGON, inside the
    logged-on user's own session.

    IT IS DELIBERATELY NOT A WINDOWS SERVICE. Services run in Session 0, which
    is isolated from the desktop. Illustrator is a GUI application driven over
    COM: from Session 0 it does not fail with a useful error, it simply hangs.
    A Scheduled Task with an interactive principal is the only shape that works.

    No administrator rights are needed - the task runs as the current user.

.EXAMPLE
    Right-click this file and choose "Run with PowerShell".

    Or from a terminal:
    powershell -ExecutionPolicy Bypass -File install-agent.ps1
    powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Uninstall
    powershell -ExecutionPolicy Bypass -File install-agent.ps1 -ShowToken
#>
param(
    [switch]$Uninstall,
    [switch]$ShowToken,
    # For scripted installs. By hand, the window must stay open long enough to
    # read - see Wait-BeforeClosing.
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$TaskName = "AI Apparel Agent"

# "Run with PowerShell" (the right-click verb) closes its window the instant the
# script ends. On success that is only mildly rude - the paired website is
# already opening. On failure it is the difference between a designer reading
# "no internet connection" and seeing a black window blink.
function Wait-BeforeClosing {
    if ($NoPause) { return }
    Write-Host ""
    Write-Host "Press Enter to close this window." -ForegroundColor DarkGray
    try { Read-Host | Out-Null } catch {}
}

trap {
    Write-Host ""
    Write-Host "INSTALL FAILED" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Nothing was left half-installed. Fix the above and run this again." -ForegroundColor DarkYellow
    Wait-BeforeClosing
    exit 1
}

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $AgentDir
$AgentScript = Join-Path $AgentDir "main.py"
$TokenPath = Join-Path $env:LOCALAPPDATA "AIApparelAgent\agent_token.txt"

function Show-Token {
    if (Test-Path $TokenPath) {
        $token = (Get-Content $TokenPath -Raw).Trim()
        Write-Host ""
        Write-Host "  Paste this pairing token into the website, once:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "     $token" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  (kept in $TokenPath)"
    } else {
        Write-Host "  No token yet - it is created the first time the agent runs." -ForegroundColor DarkYellow
    }
}

if ($ShowToken) { Show-Token; Wait-BeforeClosing; return }

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed the '$TaskName' scheduled task." -ForegroundColor Green
    } else {
        Write-Host "'$TaskName' was not registered." -ForegroundColor DarkYellow
    }
    Write-Host "Your orders in C:\Production were NOT touched."
    Wait-BeforeClosing
    return
}

if (-not (Test-Path $AgentScript)) {
    throw "Agent not found at $AgentScript"
}

# ---------------------------------------------------------------------------
# Python, without asking the designer to install anything.
#
# A PC that runs Illustrator has no reason to have Python on it, so assume it
# does not and put it there. Everything below is per-user: no administrator
# rights, nothing touched outside the profile.
# ---------------------------------------------------------------------------

$PythonUrl = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"

function Test-PythonExe {
    param([string]$Exe)
    if (-not $Exe -or -not (Test-Path -LiteralPath $Exe)) { return $false }
    # The Store stub in WindowsApps answers to `python` and does nothing except
    # open the Store. It is the single most common false positive here.
    if ($Exe -like "*\WindowsApps\*") { return $false }
    try {
        $v = & $Exe -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
    } catch { return $false }
    if ($LASTEXITCODE -ne 0 -or -not $v) { return $false }
    $parts = $v.Trim().Split('.')
    return ([int]$parts[0] -eq 3 -and [int]$parts[1] -ge 10)
}

function Find-Python {
    $candidates = @()

    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += $cmd.Source }

    # The py launcher knows about installs that never reached PATH.
    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) {
        try {
            $p = & $pyCmd.Source -3 -c "import sys; print(sys.executable)" 2>$null
            if ($p) { $candidates += $p.Trim() }
        } catch {}
    }

    foreach ($root in @((Join-Path $env:LOCALAPPDATA "Programs\Python"),
                        "$env:ProgramFiles\Python312", "$env:ProgramFiles\Python311",
                        "$env:ProgramFiles\Python310")) {
        if (Test-Path -LiteralPath $root) {
            $candidates += Get-ChildItem -LiteralPath $root -Filter python.exe -Recurse `
                -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
        }
    }

    foreach ($c in $candidates) { if (Test-PythonExe $c) { return $c } }
    return $null
}

function Update-PathFromRegistry {
    # A fresh install writes PATH to the registry; this process still holds the
    # copy it started with, so without this the Python we just installed is
    # invisible until the designer logs out.
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ";"
}

function Install-Python {
    Write-Host ""
    Write-Host "Python is not on this PC. Installing it now - two minutes or so." -ForegroundColor Cyan
    Write-Host "Nothing for you to click." -ForegroundColor Cyan

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        try {
            & $winget.Source install --id Python.Python.3.12 --scope user --silent `
                --accept-package-agreements --accept-source-agreements | Out-Null
        } catch {}
        Update-PathFromRegistry
        $found = Find-Python
        if ($found) { return $found }
        Write-Host "  winget could not do it. Getting the installer from python.org instead." -ForegroundColor DarkYellow
    }

    # No winget, or winget failed. The official per-user installer, run silently.
    $exe = Join-Path $env:TEMP "python-3.12.7-amd64.exe"
    try {
        Invoke-WebRequest -Uri $PythonUrl -OutFile $exe -UseBasicParsing
        Start-Process -FilePath $exe -Wait -PassThru -ArgumentList @(
            "/quiet", "InstallAllUsers=0", "PrependPath=1",
            "Include_pip=1", "Include_launcher=1", "Include_test=0"
        ) | Out-Null
    } catch {
        throw "Could not install Python automatically ($($_.Exception.Message)). Install Python 3.10+ from python.org, tick 'Add python.exe to PATH', then run this script again."
    } finally {
        Remove-Item -LiteralPath $exe -Force -ErrorAction SilentlyContinue
    }

    Update-PathFromRegistry
    return (Find-Python)
}

# Two layouts, same script. On a designer's PC `services\` sits beside main.py
# and the environment is built here; in the repo it reuses Backend\.venv.
$Packaged = Test-Path (Join-Path $AgentDir "services")
$VenvDir = if ($Packaged) { Join-Path $AgentDir ".venv" } else { Join-Path $RepoRoot "Backend\.venv" }

if ($Packaged -and -not (Test-Path (Join-Path $VenvDir "Scripts\pythonw.exe"))) {
    Write-Host "Setting up the agent (once, a few minutes)..." -ForegroundColor Cyan

    $sysPython = Find-Python
    if (-not $sysPython) { $sysPython = Install-Python }
    if (-not $sysPython) {
        throw "Python still is not available after installing it. Restart the PC and run this script again."
    }
    Write-Host "  Python: $sysPython" -ForegroundColor DarkGray

    & $sysPython -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) { throw "Could not create the Python environment at $VenvDir" }

    # fastapi, uvicorn, pywin32, python-multipart - about 30 MB, from PyPI.
    Write-Host "  Installing the agent's packages..." -ForegroundColor DarkGray
    & (Join-Path $VenvDir "Scripts\python.exe") -m pip install --quiet --upgrade pip
    & (Join-Path $VenvDir "Scripts\python.exe") -m pip install --quiet -r (Join-Path $AgentDir "requirements.txt")
    if ($LASTEXITCODE -ne 0) {
        throw "Could not install the agent's packages. Check this PC's internet connection and run the script again."
    }

    # pywin32 ships COM support as .pyd files that need registering into the
    # venv before `import win32com.client` works. Without this the agent starts
    # and then fails at the first job, which is a much worse place to find out.
    $postInstall = Join-Path $VenvDir "Scripts\pywin32_postinstall.py"
    if (Test-Path -LiteralPath $postInstall) {
        & (Join-Path $VenvDir "Scripts\python.exe") $postInstall -install -quiet 2>$null | Out-Null
    }
    & (Join-Path $VenvDir "Scripts\python.exe") -c "import win32com.client" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Illustrator automation support (pywin32) did not install correctly. Run the script again."
    }

    Write-Host "Agent environment ready." -ForegroundColor Green
}

# pythonw, not python: the task runs unattended, and a console window a
# designer can accidentally close is a support call waiting to happen. Run
# `python main.py` by hand when you want to watch it.
$PythonW = Join-Path $VenvDir "Scripts\pythonw.exe"
if (-not (Test-Path $PythonW)) {
    throw "Python environment not found at $PythonW"
}

$action = New-ScheduledTaskAction -Execute $PythonW -Argument "`"$AgentScript`"" -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Interactive, and only when logged on - this is the whole point. RunLevel
# Limited keeps it out of the elevated session, which Illustrator does not
# need and which would put the agent on a different desktop again.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)   # a render can take half an hour; never kill it

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description "Runs Illustrator order automation for the AI Apparel website. Starts at logon in the user's own session." | Out-Null

Write-Host "Registered '$TaskName' - it will start at every logon." -ForegroundColor Green

Start-ScheduledTask -TaskName $TaskName

# Wait properly instead of sleeping four seconds and hoping. A cold venv
# importing win32com takes longer than that on a machine that has never run
# this before, and declaring failure at four seconds sent people looking for a
# bug that was not there.
Write-Host "Waiting for the agent to answer..." -NoNewline
$Python = $PythonW -replace 'pythonw\.exe$', 'python.exe'
$health = $null
foreach ($attempt in 1..30) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8765/agent/health" -TimeoutSec 2
        break
    } catch {
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 1
    }
}
Write-Host ""

if ($health) {
    Write-Host "Agent is answering. Version $($health.version)." -ForegroundColor Green
} else {
    # pythonw has no console, so whatever went wrong went nowhere. Run it once
    # WITH a console and show the designer the actual reason - an unreadable
    # traceback beats a silent failure they cannot act on.
    Write-Host ""
    Write-Host "The agent did not start. Running it in the foreground to find out why:" -ForegroundColor DarkYellow
    Write-Host ""
    $job = Start-Job -ScriptBlock {
        param($py, $script, $dir)
        Set-Location $dir
        & $py $script 2>&1
    } -ArgumentList $Python, $AgentScript, $AgentDir

    # Long enough to fail. If it is still alive after this it started fine and
    # the earlier timeout was simply too short.
    Wait-Job $job -Timeout 20 | Out-Null
    $out = Receive-Job $job -ErrorAction SilentlyContinue
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue

    if ($out) { $out | Select-Object -Last 25 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray } }

    Write-Host ""
    Write-Host "Run this yourself to see it live:" -ForegroundColor Cyan
    Write-Host "  & '$Python' '$AgentScript'"
}

# Hand the token straight to the website instead of asking a designer to copy
# it. The exchange never leaves this machine: a program they just ran opens a
# page and passes it in the URL, and the page stores it and strips it out. See
# the automatic-pairing note in components/AgentStatus.tsx.
$site = if ($env:AI_APPAREL_SITE) { $env:AI_APPAREL_SITE } else { "https://apparel-ai-generator.vercel.app" }
if (Test-Path $TokenPath) {
    $token = (Get-Content $TokenPath -Raw).Trim()
    $pairUrl = "$site/?agent_token=$([uri]::EscapeDataString($token))"
    Write-Host ""
    Write-Host "Opening the website and pairing this browser automatically..." -ForegroundColor Cyan
    Start-Process $pairUrl

    # Start-Process opens the DEFAULT browser, and the pairing is stored in that
    # browser's localStorage - which no other browser can read. Installing on a
    # machine whose default is Edge therefore pairs Edge and leaves Chrome
    # unpaired, looking for all the world like the install failed. So print the
    # URL too: pasting one link into the browser they actually use is the whole
    # fix, and it beats asking them to handle a raw token.
    Write-Host ""
    Write-Host "Paired the browser that just opened." -ForegroundColor Green
    Write-Host ""
    Write-Host "USING A DIFFERENT BROWSER? Paste this link into it, once:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  $pairUrl" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Each browser pairs separately - the token lives in the browser, and"
    Write-Host "one browser cannot read another's. Pairing lasts; do it once per browser."
} else {
    Show-Token
    Write-Host ""
    Write-Host "Open $site and paste the token when asked."
}

Wait-BeforeClosing
