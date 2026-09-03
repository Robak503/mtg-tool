# Copy this file to android-env.local.ps1 and adjust paths for the destination PC.
# android-env.local.ps1 is ignored by Git. Do not put tokens or passwords here.

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$env:NDK_HOME = Join-Path $env:ANDROID_HOME "ndk\30.0.16138531"
$env:Path = @(
  (Join-Path $env:USERPROFILE ".cargo\bin")
  (Join-Path $env:ANDROID_HOME "platform-tools")
  (Join-Path $env:JAVA_HOME "bin")
  $env:Path
) -join ";"
