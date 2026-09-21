param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $ProjectRoot "dist app B24 zip"
$ProductName = "Numberer B24"
$AppVersion = "4"

if (-not $OutputPath) {
  $OutputPath = Join-Path $DistDir "$ProductName v.$AppVersion.zip"
}

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
if (Test-Path -LiteralPath $OutputPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path $DistDir "$ProductName v.$AppVersion $stamp.zip"
}

$runtimeFiles = @(
  "install.html",
  "install.js",
  "index.html",
  "app.js",
  "numbering-core.js",
  "style.css",
  "worker.html",
  "worker.js",
  "worker-error.html"
)

$missing = $runtimeFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $ProjectRoot $_)) }
if ($missing.Count -gt 0) {
  throw "Missing runtime files: $($missing -join ', ')"
}

$tempDir = Join-Path $DistDir "marketplace-runtime"
if (Test-Path -LiteralPath $tempDir) {
  Remove-Item -LiteralPath $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

foreach ($file in $runtimeFiles) {
  Copy-Item -LiteralPath (Join-Path $ProjectRoot $file) -Destination (Join-Path $tempDir $file)
}

Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $OutputPath -Force
Remove-Item -LiteralPath $tempDir -Recurse -Force

Write-Host "Marketplace zip created: $OutputPath"
