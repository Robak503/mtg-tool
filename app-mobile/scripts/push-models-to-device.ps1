param(
  [ValidateSet("base", "enhanced", "all")]
  [string]$Model = "all",
  [string]$Package = "com.colton.omnath.probe.debug"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$catalog = Get-Content -LiteralPath (Join-Path $projectRoot "model-catalog.json") -Raw | ConvertFrom-Json
$adb = Join-Path ([Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")) "platform-tools\adb.exe"
if (-not (Test-Path -LiteralPath $adb)) { $adb = "adb.exe" }
& $adb get-state | Out-Null
if ($LASTEXITCODE -ne 0) { throw "No authorized Android device is connected" }
& $adb shell "mkdir -p /sdcard/Android/data/$Package/files/models"
$ids = if ($Model -eq "all") { @("base", "enhanced") } else { @($Model) }
foreach ($id in $ids) {
  $spec = $catalog.models.$id
  $source = Join-Path $projectRoot "build\models\$($spec.file)"
  if (-not (Test-Path -LiteralPath $source)) { throw "Stage $id first: $source" }
  & $adb push $source "/sdcard/Android/data/$Package/files/models/$($spec.file)"
  if ($LASTEXITCODE -ne 0) { throw "ADB push failed for $id" }
}
