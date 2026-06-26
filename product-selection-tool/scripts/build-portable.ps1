$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distRoot = Join-Path $projectRoot "dist"
$stagingRoot = Join-Path $distRoot "_portable-staging"
$portableRoot = Join-Path $stagingRoot "product-selection-portable"
$extractedRoot = Join-Path $distRoot "product-selection-portable"
$zipPath = Join-Path $distRoot "product-selection-portable.zip"

function Resolve-NodeExe {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    return $nodeCommand.Source
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null

$resolvedDist = Resolve-Path $distRoot
if (Test-Path $stagingRoot) {
  $resolvedStaging = Resolve-Path $stagingRoot
  if (-not $resolvedStaging.Path.StartsWith($resolvedDist.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete a path outside dist: $resolvedStaging"
  }
  Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $portableRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $portableRoot "app") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $portableRoot "app\data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $portableRoot "runtime") | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot "src") -Destination (Join-Path $portableRoot "app\src") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "package.json") -Destination (Join-Path $portableRoot "app\package.json")
Copy-Item -Path (Join-Path $projectRoot "portable\*") -Destination $portableRoot -Recurse

$runtimeNode = Join-Path $portableRoot "runtime\node.exe"
$nodeExe = Resolve-NodeExe
if ($nodeExe) {
  Copy-Item -LiteralPath $nodeExe -Destination $runtimeNode
  Write-Host "Bundled Node runtime:"
  Write-Host $runtimeNode
} else {
  Write-Warning "Node.js was not found on this computer. The package will require Node.js installed on the target computer."
}

Set-Content -Path (Join-Path $portableRoot "runtime\README.txt") -Encoding UTF8 -Value @(
  "This folder is used for the bundled Windows Node.js runtime.",
  "",
  "The launcher uses runtime\node.exe first, then falls back to an installed Node.js.",
  "Do not put a DeepSeek key in this folder."
)

if (Test-Path $zipPath) {
  $resolvedZip = Resolve-Path $zipPath
  if (-not $resolvedZip.Path.StartsWith($resolvedDist.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete a zip outside dist: $resolvedZip"
  }
  Remove-Item -LiteralPath $resolvedZip -Force
}

Compress-Archive -Path (Join-Path $portableRoot "*") -DestinationPath $zipPath -Force

$canUpdateExtracted = $true
if (Test-Path $extractedRoot) {
  $resolvedExtracted = Resolve-Path $extractedRoot
  if (-not $resolvedExtracted.Path.StartsWith($resolvedDist.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete an extracted package outside dist: $resolvedExtracted"
  }
  try {
    Remove-Item -LiteralPath $resolvedExtracted -Recurse -Force
  } catch {
    $canUpdateExtracted = $false
    Write-Warning "Could not update the extracted package because it is in use. Close the running tool window and rerun this script if you need the extracted folder refreshed."
    Write-Warning $_.Exception.Message
  }
}

if ($canUpdateExtracted) {
  Copy-Item -LiteralPath $portableRoot -Destination $distRoot -Recurse
}

Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host "Portable package created:"
Write-Host $zipPath
if (-not $canUpdateExtracted) {
  Write-Host "The zip is ready to share, but dist\product-selection-portable was not refreshed because it is currently in use."
}
