$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distRoot = Join-Path $projectRoot "dist"
$stagingRoot = Join-Path $distRoot "_web-deploy-source"
$packageRoot = Join-Path $stagingRoot "product-selection-web"
$zipPath = Join-Path $distRoot "web-deploy-source.zip"

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null

$resolvedDist = Resolve-Path $distRoot
if (Test-Path $stagingRoot) {
  $resolvedStaging = Resolve-Path $stagingRoot
  if (-not $resolvedStaging.Path.StartsWith($resolvedDist.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete a path outside dist: $resolvedStaging"
  }
  Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

$items = @(
  "src",
  "package.json",
  "render.yaml",
  "WEB_DEPLOY.md",
  ".gitignore"
)

foreach ($item in $items) {
  $source = Join-Path $projectRoot $item
  $destination = Join-Path $packageRoot $item
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination $destination -Recurse
  }
}

Set-Content -Path (Join-Path $packageRoot "README.txt") -Encoding UTF8 -Value @(
  "Product Selection Tool - web deploy source",
  "",
  "Upload this folder or zip contents to a Git repository, then deploy on Render.",
  "Start command: node src/server/http-server.mjs",
  "Environment: NODE_ENV=production",
  "",
  "Do not add DEEPSEEK_API_KEY if every user should use their own key.",
  "Local data, previous runs, and portable runtime files are intentionally excluded."
)

if (Test-Path $zipPath) {
  $resolvedZip = Resolve-Path $zipPath
  if (-not $resolvedZip.Path.StartsWith($resolvedDist.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete a zip outside dist: $resolvedZip"
  }
  Remove-Item -LiteralPath $resolvedZip -Force
}

Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host "Web deploy source package created:"
Write-Host $zipPath
