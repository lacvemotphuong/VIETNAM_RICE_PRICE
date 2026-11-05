$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$backendPath = Join-Path $projectRoot 'backend'
$frontendPath = Join-Path $projectRoot 'frontend'
$backendEnvPath = Join-Path $backendPath '.env'
$aiEnvPath = Join-Path $backendPath '.env.ai'
$pythonPath = $null
$priceUnit = $null

function Stop-WithMessage {
    param([string]$Message)
    Write-Host "`nLOI: $Message" -ForegroundColor Red
    exit 1
}

function Start-ServiceWindow {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )

    $quotedDirectory = "'" + $WorkingDirectory.Replace("'", "''") + "'"
    $quotedTitle = "'" + $Title.Replace("'", "''") + "'"
    $childCommand = "`$Host.UI.RawUI.WindowTitle = $quotedTitle; Set-Location -LiteralPath $quotedDirectory; $Command"
    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($childCommand))
    Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoExit',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        $encodedCommand
    ) | Out-Null
}

Write-Host '=== Vietnam Rice Price: khoi dong cac dich vu ===' -ForegroundColor Cyan

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Stop-WithMessage 'Chua tim thay Node.js. Cai Node.js 18.11 tro len, sau do mo lai start.bat.'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Stop-WithMessage 'Chua tim thay npm. Hay cai Node.js/npm va mo lai start.bat.'
}

foreach ($candidate in @(
    (Join-Path $projectRoot '.venv\Scripts\python.exe'),
    (Join-Path $backendPath '.venv\Scripts\python.exe')
)) {
    if (Test-Path $candidate) {
        $versionText = & $candidate -c 'import sys; print(sys.version_info.major, sys.version_info.minor, sep=chr(46))' 2>$null
        if ($LASTEXITCODE -eq 0 -and $versionText -match '^3\.(10|11|12)$') {
            $pythonPath = $candidate
            break
        }
    }
}

if (-not $pythonPath) {
    if (-not (Get-Command py.exe -ErrorAction SilentlyContinue)) {
        Stop-WithMessage 'Can Python 3.10, 3.11 hoac 3.12. Cai Python va Python Launcher (py.exe), sau do chay lai.'
    }

    $basePython = & py.exe -3.10 -c 'import sys; print(sys.executable)' 2>$null
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage 'Khong tim thay Python 3.10. Cai Python 3.10 (khuyen nghi cho cac thu vien ML) va chay lai.'
    }

    $pythonEnvironment = Join-Path $backendPath '.venv'
    & $basePython -m venv $pythonEnvironment
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage 'Khong tao duoc moi truong Python backend\.venv.'
    }
    $pythonPath = Join-Path $pythonEnvironment 'Scripts\python.exe'
}

Write-Host "Python: $pythonPath" -ForegroundColor Green

if (-not (Test-Path $backendEnvPath)) {
    $randomBytes = New-Object byte[] 48
    $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $randomGenerator.GetBytes($randomBytes)
    $randomGenerator.Dispose()
    $jwtSecret = [Convert]::ToBase64String($randomBytes)
    @"
MONGODB_URI=mongodb://127.0.0.1:27017/vietnam_rice_price
JWT_SECRET=$jwtSecret
FASTAPI_URL=http://127.0.0.1:8000
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
"@ | Set-Content -Path $backendEnvPath -Encoding Ascii
    Write-Host 'Da tao backend\.env voi MongoDB local. File nay khong bi ghi de khi chay lai.' -ForegroundColor Yellow
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$pythonImports = & $pythonPath -c 'import fastapi, uvicorn, numpy, tensorflow, xgboost, statsmodels, joblib' 2>&1
$pythonImportExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($pythonImportExitCode -ne 0) {
    Write-Host 'Dang cai cac thu vien FastAPI/ML lan dau (co the mat vai phut)...' -ForegroundColor Yellow
    $ErrorActionPreference = 'Continue'
    & $pythonPath -m pip install --upgrade pip
    $pipUpgradeExitCode = $LASTEXITCODE
    if ($pipUpgradeExitCode -ne 0) {
        $ErrorActionPreference = $previousErrorActionPreference
        Stop-WithMessage 'Khong cap nhat duoc pip. Kiem tra ket noi Internet va thu lai.'
    }
    & $pythonPath -m pip install -r (Join-Path $backendPath 'requirements.txt')
    $pipInstallExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($pipInstallExitCode -ne 0) {
        Stop-WithMessage 'Cai Python dependencies that bai. Kiem tra Python 3.10-3.12 va thu lai.'
    }
}

foreach ($servicePath in @($backendPath, $frontendPath)) {
    if (-not (Test-Path (Join-Path $servicePath 'node_modules'))) {
        Write-Host "Dang cai npm dependencies tai $servicePath ..." -ForegroundColor Yellow
        Push-Location $servicePath
        try {
            $ErrorActionPreference = 'Continue'
            & npm.cmd install
            $npmInstallExitCode = $LASTEXITCODE
            $ErrorActionPreference = $previousErrorActionPreference
            if ($npmInstallExitCode -ne 0) {
                Stop-WithMessage "npm install that bai tai $servicePath."
            }
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
            Pop-Location
        }
    }
}

$mongoUriLine = Get-Content $backendEnvPath | Where-Object { $_ -match '^\s*MONGODB_URI\s*=' } | Select-Object -First 1
if ($mongoUriLine -match 'mongodb://(127\.0\.0\.1|localhost):27017') {
    $mongoCheck = Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -WarningAction SilentlyContinue
    if (-not $mongoCheck.TcpTestSucceeded) {
        Write-Host 'CANH BAO: MongoDB local chua mo tai 127.0.0.1:27017. Hay khoi dong MongoDB hoac sua MONGODB_URI trong backend\.env.' -ForegroundColor Yellow
    }
}

$quotedPython = "'" + $pythonPath.Replace("'", "''") + "'"
if (Test-Path $aiEnvPath) {
    $priceUnitLine = Get-Content $aiEnvPath | Where-Object { $_ -match '^\s*PRICE_UNIT\s*=' } | Select-Object -First 1
    if ($priceUnitLine -match '^\s*PRICE_UNIT\s*=\s*(.*?)\s*$') {
        $priceUnit = $Matches[1].Trim('"').Trim("'")
    }
}

$aiCommand = "& $quotedPython -m uvicorn src.ai.main:app --reload --host 127.0.0.1 --port 8000"
if (-not [string]::IsNullOrWhiteSpace($priceUnit)) {
    $quotedPriceUnit = "'" + $priceUnit.Replace("'", "''") + "'"
    $aiCommand = "`$env:PRICE_UNIT = $quotedPriceUnit; $aiCommand"
}
$backendCommand = 'npm.cmd run dev'
$frontendCommand = 'npm.cmd run dev -- --host 127.0.0.1'

Start-ServiceWindow -Title 'Rice Price - FastAPI' -WorkingDirectory $backendPath -Command $aiCommand
Start-Sleep -Seconds 2
Start-ServiceWindow -Title 'Rice Price - Express API' -WorkingDirectory $backendPath -Command $backendCommand
Start-Sleep -Seconds 1
Start-ServiceWindow -Title 'Rice Price - React Vite' -WorkingDirectory $frontendPath -Command $frontendCommand

Write-Host ''
Write-Host 'Da mo 3 cua so dich vu:' -ForegroundColor Green
Write-Host '  FastAPI:  http://127.0.0.1:8000'
Write-Host '  Backend:  http://127.0.0.1:5000'
Write-Host '  Frontend: http://localhost:5173'
Write-Host 'Mo frontend bang trinh duyet. Khong dong cac cua so terminal cua dich vu.'
Write-Host 'MongoDB phai dang chay; neu dung MongoDB Atlas, cap nhat MONGODB_URI trong backend\.env.'
if ([string]::IsNullOrWhiteSpace($priceUnit)) {
    Write-Host 'Chua co PRICE_UNIT trong backend\.env.ai; API se khong cho du doan den khi ban cau hinh dung don vi da train.' -ForegroundColor Yellow
}
