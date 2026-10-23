# Launch Clippy-board with WebView2 remote debugging and run the CDP smoke test.
#
# Examples:
#   # CI: deterministic synthetic history, debug build
#   pwsh -File scripts/run-smoke.ps1 -Exe src-tauri/target/debug/clippy.exe -Seed
#
#   # Local: use the current history DB (nothing is wiped)
#   pwsh -File scripts/run-smoke.ps1 -Exe src-tauri/target/debug/clippy.exe
#
# -Seed clears the real history database, so only use it on a disposable
# machine/CI runner.
# The script stops any running clippy.exe first (the app is single-instance in
# practice: two copies would fight over the tray icon, hotkey, and DB).

[CmdletBinding()]
param(
    [string]$Exe = "src-tauri\target\debug\clippy.exe",
    [int]$Port = 9222,
    [switch]$Seed,
    [int]$StartupTimeoutSec = 90
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($Exe)) {
    $Exe = Join-Path $repoRoot $Exe
}
$Exe = [System.IO.Path]::GetFullPath($Exe)
if (-not (Test-Path -LiteralPath $Exe)) {
    throw "Executable not found: $Exe (build it first: npm run tauri build -- --debug --no-bundle)"
}

$logDir = Join-Path $repoRoot "src-tauri\target\smoke-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stdoutLog = Join-Path $logDir "app-stdout.log"
$stderrLog = Join-Path $logDir "app-stderr.log"

$DbPath = Join-Path $env:APPDATA "com.clippy.app\history.db"

# Stop the app before touching its database.
Get-Process -Name clippy -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 400

if ($Seed) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        throw "python is required for -Seed"
    }
    & $python.Source (Join-Path $repoRoot "scripts\seed-db.py") $DbPath
    if ($LASTEXITCODE -ne 0) {
        throw "Seeding the smoke database failed (exit $LASTEXITCODE)"
    }
}

$previousBrowserArgs = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$debugArgs = "--remote-debugging-port=$Port"
if ($env:CI) {
    # Hosted runners have no real GPU/desktop session; software rendering
    # avoids WebView2 hanging during compositor startup.
    $debugArgs = "$debugArgs --disable-gpu --no-sandbox"
}
if ($previousBrowserArgs) {
    $debugArgs = "$previousBrowserArgs $debugArgs"
}
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $debugArgs

# Passed explicitly through Tauri's builder (the env var above is only a
# fallback; wry's own default args can override it on some runtimes).
$previousCdpPort = $env:CLIPPY_CDP_PORT
$env:CLIPPY_CDP_PORT = "$Port"

# Show the window during setup so WebView2 starts its browser process (and the
# CDP endpoint) even in a headless session.
$previousShowOnStart = $env:CLIPPY_SHOW_ON_START
$env:CLIPPY_SHOW_ON_START = "1"

# Park the real cursor in the corner. The window is shown at startup, and if
# the physical pointer happens to sit over a card it would open a preview and
# make the hover assertions look at stale content.
$savedCursor = $null
try {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $savedCursor = [System.Windows.Forms.Cursor]::Position
    [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(0, 0)
} catch {
    Write-Host "Could not park the OS cursor: $_"
}

$app = $null
$smokeExit = 1

try {
    Write-Host "Starting $Exe (CDP port $Port, browser args: $debugArgs)..."
    $app = Start-Process -FilePath $Exe -PassThru `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog

    $deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        if ($app.HasExited) {
            throw "App exited before CDP was ready (exit code $($app.ExitCode)). See $stderrLog"
        }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 `
                -Uri "http://127.0.0.1:$Port/json" -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            # not up yet
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) {
        throw "CDP endpoint did not come up within ${StartupTimeoutSec}s"
    }

    Write-Host "Running CDP smoke test..."
    & node (Join-Path $repoRoot "scripts\smoke.mjs") --port $Port
    $smokeExit = $LASTEXITCODE
} catch {
    Write-Host "Smoke run failed: $_" -ForegroundColor Red
    if ($app -and -not $app.HasExited) {
        try {
            $p = Get-Process -Id $app.Id -ErrorAction Stop
            Write-Host "App still running: PID=$($p.Id) CPU=$($p.CPU) Responding=$($p.Responding) Threads=$($p.Threads.Count)"
        } catch {
            # process disappeared between checks
        }
    }
    try {
        $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        Write-Host "Listeners on port ${Port}: $($listeners.Count)"
        foreach ($l in $listeners) {
            Write-Host "  $($l.LocalAddress):$($l.LocalPort) pid=$($l.OwningProcess)"
        }
    } catch {
        Write-Host "Could not query listeners: $_"
    }
    $webviews = @(Get-Process msedgewebview2 -ErrorAction SilentlyContinue)
    Write-Host "msedgewebview2 processes: $($webviews.Count)"
    foreach ($w in $webviews) {
        Write-Host "  pid=$($w.Id) cpu=$($w.CPU) responding=$($w.Responding)"
    }
    try {
        $withDebug = @(
            Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -ErrorAction SilentlyContinue |
                Where-Object { $_.CommandLine -like "*--remote-debugging-port=$Port*" }
        )
        Write-Host "msedgewebview2 processes carrying the remote-debugging arg: $($withDebug.Count)"
    } catch {
        Write-Host "Could not inspect webview2 command lines: $_"
    }
    $smokeExit = 1
} finally {
    if ($app -and -not $app.HasExited) {
        Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
    }
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousBrowserArgs
    $env:CLIPPY_CDP_PORT = $previousCdpPort
    $env:CLIPPY_SHOW_ON_START = $previousShowOnStart
    if ($null -ne $savedCursor) {
        try {
            [System.Windows.Forms.Cursor]::Position = $savedCursor
        } catch {
            # ignore cursor restore failures on headless sessions
        }
    }
}

if ($smokeExit -ne 0) {
    Write-Host "--- app stderr (tail) ---" -ForegroundColor Yellow
    if (Test-Path -LiteralPath $stderrLog) {
        Get-Content -LiteralPath $stderrLog -Tail 40
    }
    Write-Host "Logs: $stdoutLog, $stderrLog" -ForegroundColor Yellow
}

exit $smokeExit
