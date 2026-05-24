$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

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

Write-Host "Starting MTG Tool at http://localhost:3000"
Write-Host "Leave this window open while using the app."
npm.cmd run dev
