# finish-p0.ps1 — completes the GitHub remote setup after `gh auth login`.
#
# Run this AFTER you've done `gh auth login --web` in your terminal.
#
# What it does:
#   1. Verifies gh is authenticated
#   2. Creates a private repo at <username>/mtg-tool
#   3. Adds origin and pushes master
#   4. Reads ~/.tauri/mtg-tool.{key,password} and uploads them as repo secrets
#   5. Patches tauri.conf.json's updater endpoint with the real repo URL
#   6. Commits + pushes that patch
#   7. Prints next steps to cut the first release
#
# Idempotent-ish — re-running after partial completion picks up where it
# left off (repo exists → skip create; remote set → skip add; etc).

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL"

# 1. Auth check
$auth = gh auth status 2>&1 | Out-String
if (-not ($auth -match "Logged in to github.com")) {
    Write-Host "Not authenticated. Run:" -ForegroundColor Red
    Write-Host "  gh auth login --web --hostname github.com --git-protocol https" -ForegroundColor Cyan
    exit 1
}

# 2. Resolve the GitHub username
$user = gh api user --jq .login 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "Could not fetch user: $user"; exit 1 }
$repoFullName = "$user/mtg-tool"
Write-Host "GitHub user: $user" -ForegroundColor Green
Write-Host "Target repo: $repoFullName"

# 3. Create the repo if it doesn't exist
$exists = gh repo view $repoFullName 2>&1
if ($exists -match "Could not resolve") {
    Write-Host "Creating private repo $repoFullName..."
    gh repo create $repoFullName --private --description "Local-first Commander assistant" --confirm 2>&1
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host "Repo $repoFullName already exists — skipping create"
}

# 4. Set the remote
$existingRemote = git remote get-url origin 2>$null
if (-not $existingRemote) {
    git remote add origin "https://github.com/$repoFullName.git"
    Write-Host "Added remote origin → $repoFullName"
} else {
    Write-Host "origin already set to $existingRemote — skipping"
}

# 5. Push master + any other branches
Write-Host "Pushing master..."
git push -u origin master 2>&1

# 6. Upload signing secrets
$keyFile = "$env:USERPROFILE\.tauri\mtg-tool.key"
$passFile = "$env:USERPROFILE\.tauri\mtg-tool.password"
if (-not (Test-Path $keyFile)) {
    Write-Host "Warning: $keyFile not found — generate with npx tauri signer generate" -ForegroundColor Yellow
} else {
    Write-Host "Uploading TAURI_SIGNING_PRIVATE_KEY secret..."
    Get-Content $keyFile -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo $repoFullName
}
if (-not (Test-Path $passFile)) {
    Write-Host "Warning: $passFile not found" -ForegroundColor Yellow
} else {
    Write-Host "Uploading TAURI_SIGNING_PRIVATE_KEY_PASSWORD secret..."
    Get-Content $passFile -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo $repoFullName
}

# 7. Patch the updater endpoint with the real repo URL
$confPath = "app/src-tauri/tauri.conf.json"
$conf = Get-Content $confPath -Raw
$newUrl = "https://github.com/$repoFullName/releases/latest/download/latest.json"
if ($conf -notmatch [regex]::Escape($newUrl)) {
    $conf = $conf -replace "https://github\.com/[^/]+/mtg-tool/releases/latest/download/latest\.json", $newUrl
    Set-Content -Path $confPath -Value $conf -NoNewline
    git add $confPath
    git commit -m "chore(tauri): point updater endpoint at $repoFullName"
    git push origin master
    Write-Host "Patched updater endpoint and pushed."
} else {
    Write-Host "Updater endpoint already pointed at $repoFullName"
}

Write-Host ""
Write-Host "=== P0 DONE ===" -ForegroundColor Green
Write-Host ""
Write-Host "Cut the first release:"
Write-Host "  git tag v0.1.0"
Write-Host "  git push origin v0.1.0"
Write-Host ""
Write-Host "Watch the build:"
Write-Host "  gh run watch --repo $repoFullName"
Write-Host ""
Write-Host "When the workflow finishes, latest.json + the signed installer"
Write-Host "are live at https://github.com/$repoFullName/releases. Every"
Write-Host "running .exe will see the new version on next Check for updates."
