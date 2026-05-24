$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$shortcutName = "MTG Tool.lnk"
$target = Join-Path $PSScriptRoot "Launch MTG Tool.cmd"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop $shortcutName

if (-not (Test-Path $target)) {
  throw "Launcher not found: $target"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = "Launch the local MTG Tool app"
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,167"
$shortcut.Save()

Write-Host "Created desktop shortcut:"
Write-Host $shortcutPath
