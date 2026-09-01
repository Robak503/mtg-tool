$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $projectRoot

function Run-Step([string]$Label, [scriptblock]$Command) {
  Write-Output "[$Label]"
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

Push-Location $projectRoot
try {
  Run-Step "Mobile JS/data/security" { npm.cmd run verify }
  Run-Step "Android model lifecycle" { npm.cmd run android:model:test }
  Run-Step "Rust provisioning" { & "$env:USERPROFILE\.cargo\bin\cargo.exe" test --manifest-path src-tauri\Cargo.toml }
} finally {
  Pop-Location
}

Push-Location (Join-Path $workspaceRoot "app")
try {
  Run-Step "Mobile engine contract" { npm.cmd run test:raw -- src/lib/mobile/runtime.test.js src/lib/mobile/webviewSmoke.test.js scripts/mobile/webview-portability.test.js scripts/mobile/webview-bundle.test.js }
} finally {
  Pop-Location
}

Push-Location $projectRoot
try {
  Run-Step "ARM64 debug APK" { npm.cmd run android:build:debug }
  Run-Step "Artifact receipt" { powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\create-build-receipt.ps1 -VerificationPassed }
} finally {
  Pop-Location
}
