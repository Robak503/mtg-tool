$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot "src-tauri\gen\android"
$jdkHome = [Environment]::GetEnvironmentVariable("JAVA_HOME", "User")
if (-not $jdkHome -or -not (Test-Path -LiteralPath (Join-Path $jdkHome "bin\java.exe"))) {
  $jdkHome = @(
    "C:\Program Files\Android\Android Studio\jbr"
    (Get-ChildItem -LiteralPath "C:\Program Files\Microsoft" -Directory -Filter "jdk-21*" -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName)
  ) | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ "bin\java.exe")) } | Select-Object -First 1
}
if (-not $jdkHome) { throw "JDK 21 or Android Studio JBR is required." }

$sdkRoot = [Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
if (-not $sdkRoot) { $sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if (-not (Test-Path -LiteralPath $sdkRoot)) { throw "Android SDK not found at $sdkRoot" }

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $sdkRoot
$env:Path = "$(Join-Path $jdkHome 'bin');$env:Path"

& (Join-Path $androidRoot "gradlew.bat") --project-dir $androidRoot :tauri-plugin-omnath-model:testDebugUnitTest
if ($LASTEXITCODE -ne 0) { throw "Android model lifecycle tests failed with exit code $LASTEXITCODE" }
