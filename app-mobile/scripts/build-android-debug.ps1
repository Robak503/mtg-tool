param([switch]$IncludeArt)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $projectRoot "src-tauri"
$androidRoot = Join-Path $tauriRoot "gen\android"
$nativeLib = Join-Path $tauriRoot "target\aarch64-linux-android\debug\libomnath_webview_probe_lib.so"
$jniDir = Join-Path $androidRoot "app\src\main\jniLibs\arm64-v8a"
$jniLib = Join-Path $jniDir "libomnath_webview_probe_lib.so"
$knowledgeSourceDir = Join-Path $projectRoot "build\knowledge"
$androidKnowledgeDir = Join-Path $androidRoot "app\src\main\assets\knowledge"
$artSourceDir = Join-Path $projectRoot "build\art"
$androidAssetsDir = Join-Path $androidRoot "app\src\main\assets"
$androidArtDir = Join-Path $androidAssetsDir "art"
$apk = Join-Path $androidRoot "app\build\outputs\apk\arm64\debug\app-arm64-debug.apk"

function Sync-AndroidKnowledgeAssets {
  $files = @("omnath-knowledge.sqlite", "omnath-knowledge.manifest.json")
  foreach ($file in $files) {
    $source = Join-Path $knowledgeSourceDir $file
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Android knowledge resource was not built: $source"
    }
  }
  New-Item -ItemType Directory -Path $androidKnowledgeDir -Force | Out-Null
  foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $knowledgeSourceDir $file) -Destination (Join-Path $androidKnowledgeDir $file) -Force
  }
}

function Test-ApkKnowledgeAssets {
  if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { return $false }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($apk)
  try {
    $database = $archive.GetEntry("assets/knowledge/omnath-knowledge.sqlite")
    return $null -ne $database -and
      $database.CompressedLength -eq $database.Length -and
      $null -ne $archive.GetEntry("assets/knowledge/omnath-knowledge.manifest.json")
  } finally {
    $archive.Dispose()
  }
}

function Clear-AndroidArtAssets {
  $assetsFull = [System.IO.Path]::GetFullPath($androidAssetsDir).TrimEnd('\') + '\'
  $artFull = [System.IO.Path]::GetFullPath($androidArtDir)
  if (-not $artFull.StartsWith($assetsFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clear Android art outside generated assets: $artFull"
  }
  if (Test-Path -LiteralPath $artFull -PathType Container) {
    Remove-Item -LiteralPath $artFull -Recurse -Force
  }
}

function Sync-AndroidArtAssets {
  $manifestPath = Join-Path $artSourceDir "omnath-art.manifest.json"
  $databasePath = Join-Path $artSourceDir "omnath-art.sqlite"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
    throw "Build the offline art pack before requesting an art APK: $manifestPath"
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ((Get-Item -LiteralPath $databasePath).Length -ne $manifest.database.bytes) {
    throw "Art database byte count does not match its manifest."
  }
  Clear-AndroidArtAssets
  New-Item -ItemType Directory -Path $androidArtDir -Force | Out-Null
  Copy-Item -LiteralPath $manifestPath -Destination $androidArtDir -Force
  Copy-Item -LiteralPath $databasePath -Destination $androidArtDir -Force
}

function Test-ApkArtAssets {
  if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { return $false }
  $manifestPath = Join-Path $artSourceDir "omnath-art.manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return $false }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($apk)
  try {
    $database = $archive.GetEntry("assets/art/omnath-art.sqlite")
    return $null -ne $archive.GetEntry("assets/art/omnath-art.manifest.json") -and
      $null -ne $database -and
      $database.Length -eq $manifest.database.bytes -and
      $database.CompressedLength -eq $database.Length
  } finally {
    $archive.Dispose()
  }
}

$jdkHome = [Environment]::GetEnvironmentVariable("JAVA_HOME", "User")
if (-not $jdkHome -or -not (Test-Path -LiteralPath (Join-Path $jdkHome "bin\java.exe"))) {
  $jdkHome = Get-ChildItem -LiteralPath "C:\Program Files\Microsoft" -Directory -Filter "jdk-21*" |
    Sort-Object Name -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $jdkHome) {
  throw "JDK 21 is required. Install Microsoft.OpenJDK.21 or set user JAVA_HOME."
}

$sdkRoot = [Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
if (-not $sdkRoot) {
  $sdkRoot = Join-Path $env:USERPROFILE "Android\Sdk"
}
$ndkHome = [Environment]::GetEnvironmentVariable("NDK_HOME", "User")
if (-not $ndkHome) {
  $ndkHome = Join-Path $sdkRoot "ndk\30.0.16138531"
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $sdkRoot
$env:NDK_HOME = $ndkHome
$env:Path = @(
  (Join-Path $env:USERPROFILE ".cargo\bin")
  (Join-Path $sdkRoot "platform-tools")
  (Join-Path $jdkHome "bin")
  $env:Path
) -join ";"

# Tauri normally symlinks the Rust library into jniLibs. Windows without
# Developer Mode cannot create that symlink, so force a fresh native build and
# use a regular file copy only when that is the CLI's final failing step.
if (Test-Path -LiteralPath $nativeLib) {
  Remove-Item -LiteralPath $nativeLib -Force
}
Clear-AndroidArtAssets

Push-Location $projectRoot
try {
  & npx.cmd tauri android build --debug --target aarch64
  $tauriExit = $LASTEXITCODE
} finally {
  Pop-Location
}

if ($tauriExit -eq 0) {
  if (-not (Test-Path -LiteralPath $apk)) {
    throw "Tauri reported success but no debug APK was found at $apk"
  }
  if ((-not $IncludeArt) -and (Test-ApkKnowledgeAssets)) {
    Write-Output $apk
    exit 0
  }
  Write-Output "Rebuilding Android with explicit packaged resources."
}

if (-not (Test-Path -LiteralPath $nativeLib)) {
  throw "Tauri failed before producing the ARM64 native library."
}

New-Item -ItemType Directory -Path $jniDir -Force | Out-Null
Copy-Item -LiteralPath $nativeLib -Destination $jniLib -Force
Sync-AndroidKnowledgeAssets
if ($IncludeArt) { Sync-AndroidArtAssets }

& (Join-Path $androidRoot "gradlew.bat") --project-dir $androidRoot clean assembleArm64Debug -x rustBuildArm64Debug
if ($LASTEXITCODE -ne 0) {
  throw "Gradle failed with exit code $LASTEXITCODE"
}
if (-not (Test-Path -LiteralPath $apk)) {
  throw "Gradle reported success but no debug APK was found at $apk"
}
if (-not (Test-ApkKnowledgeAssets)) {
  throw "Gradle reported success but the APK is missing its packaged knowledge assets."
}
if ($IncludeArt -and -not (Test-ApkArtAssets)) {
  throw "Gradle reported success but the APK art payload does not match its manifest."
}

Write-Output $apk
