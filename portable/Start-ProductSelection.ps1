$ErrorActionPreference = "Stop"

function Write-Info($Message) {
  Write-Host $Message
}

function Wait-BeforeClose {
  Write-Host ""
  Read-Host "按 Enter 关闭这个窗口"
}

function Find-FreePort {
  param(
    [int] $StartPort = 4173,
    [int] $EndPort = 4199
  )

  for ($port = $StartPort; $port -le $EndPort; $port += 1) {
    $listener = $null
    try {
      $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
      $listener.Start()
      return $port
    } catch {
      # Try the next port.
    } finally {
      if ($listener) {
        $listener.Stop()
      }
    }
  }

  throw "No free local port found between $StartPort and $EndPort."
}

function Resolve-NodeExe {
  param([string] $Root)

  $runtimeNode = Join-Path $Root "runtime\node.exe"
  if (Test-Path $runtimeNode) {
    return $runtimeNode
  }

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

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $root "app"
$serverFile = Join-Path $appDir "src\server\http-server.mjs"
$logDir = Join-Path $root "logs"
$logPath = Join-Path $logDir "launcher.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

try {
  Start-Transcript -Path $logPath -Append | Out-Null

  Write-Info "Product Selection Tool launcher"
  Write-Info "选品工具启动器"
  Write-Info "Root: $root"
  Write-Info "Log:  $logPath"
  Write-Info ""

  if (-not (Test-Path $serverFile)) {
    throw "缺少工具文件：$serverFile。请先完整解压整个 zip，不要在压缩包里直接双击，也不要只复制启动脚本。"
  }

  $nodeExe = Resolve-NodeExe -Root $root
  if (-not $nodeExe) {
    throw "未找到 Node.js。请确认这个分享包里有 runtime\node.exe；如果没有，请安装 Node.js LTS，或让发送者重新打包一个带 runtime 的版本。"
  }

  $port = Find-FreePort
  $env:OPEN_BROWSER = "1"
  $env:PORT = [string] $port

  Write-Info "Node: $nodeExe"
  Write-Info "URL:  http://127.0.0.1:$port/"
  Write-Info ""
  Write-Info "Starting server. Close this window to stop the tool."
  Write-Info "正在启动工具。如果浏览器没有自动打开，请手动访问上面的 URL。关闭这个窗口会停止工具。"
  Write-Info ""

  Set-Location $appDir
  & $nodeExe "src\server\http-server.mjs"

  Write-Info ""
  Write-Info "Server stopped."
  Stop-Transcript | Out-Null
  Wait-BeforeClose
} catch {
  Write-Host ""
  Write-Host "Launcher failed / 启动失败：" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "A log was written to / 错误日志在："
  Write-Host $logPath
  Write-Host ""
  Write-Host "把这个窗口截图，或把 logs\launcher.log 发给发送者排查。"
  try { Stop-Transcript | Out-Null } catch {}
  Wait-BeforeClose
  exit 1
}
