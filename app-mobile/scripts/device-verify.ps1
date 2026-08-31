param(
  [switch]$ResetAppData,
  [switch]$AirplaneMode,
  [switch]$PushModels,
  [ValidateSet("base", "enhanced", "all")]
  [string]$Model = "all"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = "com.colton.omnath.probe.debug"
$apk = Join-Path $projectRoot "src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk"
$sdkRoot = [Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
if (-not $sdkRoot) { $sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$adb = Join-Path $sdkRoot "platform-tools\adb.exe"
if (-not (Test-Path -LiteralPath $adb)) { throw "adb not found at $adb" }
if (-not (Test-Path -LiteralPath $apk)) { throw "Build the debug APK first: $apk" }

$devices = & $adb devices
$authorized = @($devices | Select-String "\tdevice$")
if ($authorized.Count -ne 1) { throw "Expected exactly one authorized Android device. adb devices returned:`n$($devices -join "`n")" }
$serial = (& $adb get-serialno).Trim()
$airplaneBefore = (& $adb shell settings get global airplane_mode_on).Trim()
$reportRoot = Join-Path $projectRoot "build\device-reports"
New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $reportRoot "$stamp-$serial.log.txt"
$jsonPath = Join-Path $reportRoot "$stamp-$serial.json"

try {
  if ($AirplaneMode) { & $adb shell cmd connectivity airplane-mode enable | Out-Null }
  if ($ResetAppData) { & $adb shell pm clear $package | Out-Null }
  & $adb install -r $apk
  if ($LASTEXITCODE -ne 0) { throw "APK installation failed" }
  if ($PushModels) {
    & (Join-Path $PSScriptRoot "push-models-to-device.ps1") -Model $Model -Package $package
  }
  & $adb logcat -c
  & $adb shell monkey -p $package -c android.intent.category.LAUNCHER 1 | Out-Null
  Start-Sleep -Seconds 12
  $pidText = (& $adb shell pidof $package).Trim()
  $focus = (& $adb shell dumpsys window windows | Select-String -Pattern "mCurrentFocus|mFocusedApp" | Out-String).Trim()
  $logs = & $adb logcat -d -v threadtime
  $logs | Set-Content -LiteralPath $logPath
  $fatal = @($logs | Select-String -Pattern "FATAL EXCEPTION|AndroidRuntime.*Process: $([regex]::Escape($package))")
  $report = [ordered]@{
    verifiedAt = (Get-Date).ToUniversalTime().ToString("o")
    serial = $serial
    device = (& $adb shell getprop ro.product.model).Trim()
    android = (& $adb shell getprop ro.build.version.release).Trim()
    package = $package
    apkSha256 = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    resetAppData = [bool]$ResetAppData
    airplaneMode = [bool]$AirplaneMode
    processId = $pidText
    focused = $focus -match $package
    fatalExceptions = $fatal.Count
    passed = [bool]($pidText -and $focus -match $package -and $fatal.Count -eq 0)
    log = $logPath
  }
  $report | ConvertTo-Json | Set-Content -LiteralPath $jsonPath
  $report | ConvertTo-Json
  if (-not $report.passed) { throw "Device verification failed; inspect $jsonPath" }
} finally {
  if ($AirplaneMode -and $airplaneBefore -eq "0") { & $adb shell cmd connectivity airplane-mode disable | Out-Null }
}
