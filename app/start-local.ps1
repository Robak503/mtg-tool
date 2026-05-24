$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$ollamaExe = $null
$ollamaCommand = Get-Command "ollama" -ErrorAction SilentlyContinue
if ($ollamaCommand) {
  $ollamaExe = $ollamaCommand.Source
} else {
  $defaultOllama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path $defaultOllama) {
    $ollamaExe = $defaultOllama
  }
}

if ($ollamaExe) {
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 | Out-Null
    Write-Host "Ollama is running."
  } catch {
    Write-Host "Starting Ollama..."
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden

    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 500
      try {
        Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 | Out-Null
        $ready = $true
        break
      } catch {}
    }

    if ($ready) {
      Write-Host "Ollama is ready."
    } else {
      Write-Host "Ollama did not answer on localhost:11434 yet. The app will still start, but Local mode may fail until Ollama is running."
    }
  }
} else {
  Write-Host "Ollama was not found. The app will still start, but Local mode needs Ollama installed."
}

if (-not (Test-Path ".\node_modules")) {
  Write-Host "Installing app dependencies..."
  npm.cmd install
}

if (-not (Test-Path ".\.env.local")) {
  Copy-Item ".\.env.local.example" ".\.env.local"
  Write-Host ""
  Write-Host "Created .env.local. Local mode uses Ollama; add ANTHROPIC_API_KEY only if you want API fallback."
  Write-Host ""
}

Write-Host "Starting MTG Tool at http://localhost:3001"
Write-Host "Leave this window open while using the app."
npm.cmd run dev -- --port 3001
