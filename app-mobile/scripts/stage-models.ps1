param(
  [ValidateSet("base", "enhanced", "all")]
  [string]$Model = "all"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$catalog = Get-Content -LiteralPath (Join-Path $projectRoot "model-catalog.json") -Raw | ConvertFrom-Json
$modelRoot = Join-Path $projectRoot "build\models"
New-Item -ItemType Directory -Path $modelRoot -Force | Out-Null
$ids = if ($Model -eq "all") { @("base", "enhanced") } else { @($Model) }

foreach ($id in $ids) {
  $spec = $catalog.models.$id
  $destination = Join-Path $modelRoot $spec.file
  $url = "https://huggingface.co/$($spec.repository)/resolve/main/$($spec.file)?download=true"
  $headers = @()
  if ($env:HF_TOKEN) { $headers = @("-H", "Authorization: Bearer $($env:HF_TOKEN)") }
  Write-Output "Staging $id model to $destination"
  & curl.exe --fail --location --retry 3 --continue-at - @headers --output $destination $url
  if ($LASTEXITCODE -ne 0) {
    throw "Download failed for $id. If this is the gated Gemma 3 model, accept its license on Hugging Face and set HF_TOKEN."
  }
  if ((Get-Item -LiteralPath $destination).Length -ne $spec.expectedBytes) { throw "Byte-count mismatch for $id model" }
  $actual = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($spec.sha256 -and $actual -ne $spec.sha256) { throw "SHA-256 mismatch for $id model" }
  Write-Output "$id`t$((Get-Item -LiteralPath $destination).Length)`t$actual"
}
