param(
  [switch]$NoWait
)

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$AppUrl = "http://localhost:3000"
$OutLog = Join-Path $PSScriptRoot "local-dev.out.log"
$ErrLog = Join-Path $PSScriptRoot "local-dev.err.log"

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -Uri $AppUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Stop-MtgToolServer {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -like "*$PSScriptRoot*"
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path ".\node_modules")) {
  Write-Host "Installing app dependencies..."
  npm.cmd install
}

if (-not (Test-Path ".\.env.local")) {
  Copy-Item ".\.env.local.example" ".\.env.local"
  Write-Host ""
  Write-Host "Created .env.local. Add your ANTHROPIC_API_KEY before using chat answers."
  Write-Host ""
}

$startedServer = $false

if (Test-AppReady) {
  Write-Host "MTG Tool is already running at $AppUrl"
} else {
  Write-Host "Starting MTG Tool..."
  Set-Content -Path $OutLog -Value ""
  Set-Content -Path $ErrLog -Value ""

  Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--", "-p", "3000") `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -WindowStyle Hidden

  $startedServer = $true

  for ($i = 0; $i -lt 45; $i++) {
    if (Test-AppReady) { break }
    Start-Sleep -Seconds 1
  }

  if (-not (Test-AppReady)) {
    Write-Host ""
    Write-Host "The app did not become ready at $AppUrl."
    Write-Host "Recent server output:"
    if (Test-Path $OutLog) { Get-Content -Path $OutLog -Tail 20 }
    if (Test-Path $ErrLog) { Get-Content -Path $ErrLog -Tail 20 }
    Stop-MtgToolServer
    exit 1
  }
}

Write-Host "Opening $AppUrl"
Start-Process $AppUrl

Write-Host ""
Write-Host "MTG Tool is ready."
Write-Host "Logs:"
Write-Host "  $OutLog"
Write-Host "  $ErrLog"

if ($NoWait) {
  exit 0
}

Write-Host ""
if ($startedServer) {
  Write-Host "Leave this window open while using the app."
  Write-Host "Press Enter here when you want to stop the local server."
  [void][Console]::ReadLine()
  Stop-MtgToolServer
  Write-Host "MTG Tool server stopped."
} else {
  Write-Host "This launcher did not start the server, so it will leave the existing server running."
  Write-Host "Press Enter to close this launcher."
  [void][Console]::ReadLine()
}
