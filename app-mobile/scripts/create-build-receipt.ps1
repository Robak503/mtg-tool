param(
  [string]$Apk,
  [string]$Output,
  [switch]$VerificationPassed,
  [switch]$RequireArt
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $projectRoot
if (-not $Apk) { $Apk = Join-Path $projectRoot "src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk" }
if (-not $Output) { $Output = Join-Path $projectRoot "build\receipts\latest.json" }
if (-not (Test-Path -LiteralPath $Apk -PathType Leaf)) { throw "APK not found: $Apk" }

$sdkRoot = [Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
if (-not $sdkRoot) { $sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$aapt = Get-ChildItem (Join-Path $sdkRoot "build-tools") -Recurse -Filter "aapt2.exe" -File |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $aapt) { throw "aapt2 was not found under $sdkRoot" }

$badging = (& $aapt dump badging $Apk) -join "`n"
$permissionDump = (& $aapt dump permissions $Apk) -join "`n"
if ($LASTEXITCODE -ne 0) { throw "aapt2 could not inspect $Apk" }

function Match-Value([string]$Text, [string]$Pattern) {
  $match = [regex]::Match($Text, $Pattern)
  if ($match.Success) { return $match.Groups[1].Value }
  return $null
}

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $Path))
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try { return (($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) -join "") }
    finally { $algorithm.Dispose() }
  } finally { $stream.Dispose() }
}

$knowledgeManifestPath = Join-Path $projectRoot "build\knowledge\omnath-knowledge.manifest.json"
$knowledgeDatabasePath = Join-Path $projectRoot "build\knowledge\omnath-knowledge.sqlite"
if (-not (Test-Path -LiteralPath $knowledgeManifestPath) -or -not (Test-Path -LiteralPath $knowledgeDatabasePath)) {
  throw "Build the knowledge pack before generating a receipt."
}
$knowledge = Get-Content -LiteralPath $knowledgeManifestPath -Raw | ConvertFrom-Json
$knowledgeHash = Get-Sha256 $knowledgeDatabasePath
$knowledgeBytes = (Get-Item -LiteralPath $knowledgeDatabasePath).Length
$knowledgeManifestHash = Get-Sha256 $knowledgeManifestPath
$knowledgeVerified = $knowledgeHash -eq $knowledge.database.sha256 -and $knowledgeBytes -eq $knowledge.database.bytes
$artManifestPath = Join-Path $projectRoot "build\art\omnath-art.manifest.json"
$artManifest = if (Test-Path -LiteralPath $artManifestPath -PathType Leaf) {
  Get-Content -LiteralPath $artManifestPath -Raw | ConvertFrom-Json
} else { $null }
$artManifestHash = if ($artManifest) { Get-Sha256 $artManifestPath } else { $null }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Apk))
try {
  $entries = @($archive.Entries | ForEach-Object FullName)
  $packagedDatabaseEntry = $archive.GetEntry("assets/knowledge/omnath-knowledge.sqlite")
  $packagedManifestEntry = $archive.GetEntry("assets/knowledge/omnath-knowledge.manifest.json")
  $packagedDatabaseHash = $null
  $packagedManifestHash = $null
  if ($packagedDatabaseEntry) {
    $stream = $packagedDatabaseEntry.Open()
    try {
      $algorithm = [System.Security.Cryptography.SHA256]::Create()
      try { $packagedDatabaseHash = (($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) -join "") }
      finally { $algorithm.Dispose() }
    } finally { $stream.Dispose() }
  }
  if ($packagedManifestEntry) {
    $stream = $packagedManifestEntry.Open()
    try {
      $algorithm = [System.Security.Cryptography.SHA256]::Create()
      try { $packagedManifestHash = (($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) -join "") }
      finally { $algorithm.Dispose() }
    } finally { $stream.Dispose() }
  }
  $knowledgePackaged = $null -ne $packagedDatabaseEntry -and $null -ne $packagedManifestEntry
  $packagedKnowledgeMatches = $knowledgePackaged -and
    $packagedDatabaseEntry.Length -eq $knowledgeBytes -and
    $packagedDatabaseHash -eq $knowledgeHash -and
    $packagedManifestHash -eq $knowledgeManifestHash

  $packagedArtManifestEntry = $archive.GetEntry("assets/art/omnath-art.manifest.json")
  $packagedArtEntries = @($archive.Entries | Where-Object { $_.FullName -match '^assets/art/images/.+\.jpg$' })
  $packagedArtManifestHash = $null
  if ($packagedArtManifestEntry) {
    $stream = $packagedArtManifestEntry.Open()
    try {
      $algorithm = [System.Security.Cryptography.SHA256]::Create()
      try { $packagedArtManifestHash = (($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) -join "") }
      finally { $algorithm.Dispose() }
    } finally { $stream.Dispose() }
  }
  $artFilesMatch = [bool]$artManifest -and $packagedArtEntries.Count -eq $artManifest.images
  if ($artFilesMatch) {
    $artByPath = @{}
    foreach ($entry in $packagedArtEntries) { $artByPath[$entry.FullName] = $entry }
    foreach ($record in $artManifest.records) {
      $entry = $artByPath["assets/art/$($record.relativePath)"]
      if (-not $entry -or $entry.Length -ne $record.bytes) {
        $artFilesMatch = $false
        break
      }
      $stream = $entry.Open()
      try {
        $algorithm = [System.Security.Cryptography.SHA256]::Create()
        try { $entryHash = (($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) -join "") }
        finally { $algorithm.Dispose() }
      } finally { $stream.Dispose() }
      if ($entryHash -ne $record.sha256) {
        $artFilesMatch = $false
        break
      }
    }
  }
  $artPackaged = $null -ne $packagedArtManifestEntry -and $packagedArtEntries.Count -gt 0
  $packagedArtMatches = $artPackaged -and $artFilesMatch -and $packagedArtManifestHash -eq $artManifestHash
} finally { $archive.Dispose() }
$permissions = @([regex]::Matches($permissionDump, "uses-permission: name='([^']+)'") | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
$forbiddenEntries = @($entries | Where-Object {
  $_ -match '(?i)\.litertlm$|(^|/)(cr_current|oracle[^/]*|rulings[^/]*)\.json$'
})

$catalog = Get-Content -LiteralPath (Join-Path $projectRoot "model-catalog.json") -Raw | ConvertFrom-Json
$models = [ordered]@{}
foreach ($property in $catalog.models.PSObject.Properties) {
  $spec = $property.Value
  $path = Join-Path $projectRoot "build\models\$($spec.file)"
  $present = Test-Path -LiteralPath $path -PathType Leaf
  $bytes = if ($present) { (Get-Item -LiteralPath $path).Length } else { 0 }
  $hash = if ($present) { Get-Sha256 $path } else { $null }
  $models[$property.Name] = [ordered]@{
    file = $spec.file
    present = $present
    bytes = $bytes
    sha256 = $hash
    verified = [bool]($present -and $bytes -eq $spec.expectedBytes -and $hash -eq $spec.sha256)
    licenseGate = $spec.licenseGate
  }
}

$chunks = @()
$assetRoot = Join-Path $projectRoot "dist\assets"
if (Test-Path -LiteralPath $assetRoot) {
  $chunks = @(Get-ChildItem -LiteralPath $assetRoot -File | Sort-Object Name | ForEach-Object {
    [ordered]@{ file = $_.Name; bytes = $_.Length }
  })
}

$apkItem = Get-Item -LiteralPath $Apk
$checks = [ordered]@{
  noInternetPermission = [bool]($permissions -notcontains "android.permission.INTERNET")
  noBundledModel = [bool](-not ($entries | Where-Object { $_ -match '(?i)\.litertlm$' }))
  noRawCorpus = [bool]($forbiddenEntries.Count -eq 0)
  knowledgeHashMatches = [bool]$knowledgeVerified
  knowledgePackaged = [bool]$knowledgePackaged
  packagedKnowledgeMatches = [bool]$packagedKnowledgeMatches
  stagedModelsMatchCatalog = [bool](-not ($models.Values | Where-Object { $_.present -and -not $_.verified }))
  artPackagedMatchesManifest = [bool]((-not $RequireArt) -or $packagedArtMatches)
}

$receipt = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  git = [ordered]@{
    commit = (& git -C $workspaceRoot rev-parse HEAD).Trim()
    branch = (& git -C $workspaceRoot branch --show-current).Trim()
    dirty = [bool]((& git -C $workspaceRoot status --porcelain -- app-mobile app/src/lib/mobile app/scripts/mobile docs/orchestration/OMNATH-PHONE-APP.md) -join "")
  }
  apk = [ordered]@{
    path = (Resolve-Path -LiteralPath $Apk).Path
    bytes = $apkItem.Length
    sha256 = Get-Sha256 $Apk
    package = Match-Value $badging "package: name='([^']+)'"
    versionCode = Match-Value $badging "versionCode='([^']+)'"
    versionName = Match-Value $badging "versionName='([^']+)'"
    minSdk = Match-Value $badging "minSdkVersion:'([^']+)'"
    targetSdk = Match-Value $badging "targetSdkVersion:'([^']+)'"
    permissions = $permissions
    entries = $entries.Count
  }
  knowledge = [ordered]@{
    packId = $knowledge.packId
    schemaVersion = $knowledge.schemaVersion
    bytes = $knowledgeBytes
    sha256 = $knowledgeHash
    verified = [bool]$knowledgeVerified
    packagedPath = "assets/knowledge/omnath-knowledge.sqlite"
    packagedSha256 = $packagedDatabaseHash
    packaged = [bool]$knowledgePackaged
  }
  art = [ordered]@{
    required = [bool]$RequireArt
    packId = if ($artManifest) { $artManifest.packId } else { $null }
    images = if ($artManifest) { $artManifest.images } else { 0 }
    bytes = if ($artManifest) { $artManifest.bytes } else { 0 }
    packaged = [bool]$artPackaged
    packagedManifestSha256 = $packagedArtManifestHash
    verified = [bool]$packagedArtMatches
  }
  models = $models
  webAssets = $chunks
  verification = [ordered]@{ fullSuitePassed = [bool]$VerificationPassed }
  checks = $checks
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object Key)
if ($failed.Count) { throw "Build receipt policy failed: $($failed -join ', ')" }
$outputRoot = Split-Path -Parent $Output
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Output -Encoding utf8
$receipt | ConvertTo-Json -Depth 8
