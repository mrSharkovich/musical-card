# Запуск «Музыкальной открытки» только на этом компьютере: http://localhost:8001
# Сайт слушает лишь 127.0.0.1 — из сети и из интернета он недоступен.
# На localhost браузер разрешает запись с микрофона без HTTPS.
#
# Запуск из папки проекта:  powershell -ExecutionPolicy Bypass -File .\start-local.ps1

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    Write-Host 'Не найдено виртуальное окружение .venv. Создайте его один раз:' -ForegroundColor Yellow
    Write-Host '  py -3 -m venv .venv'
    Write-Host '  .\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt'
    exit 1
}

$env:TRUSTED_HOSTS  = 'localhost,127.0.0.1'
$env:ALLOWED_ORIGINS = 'http://localhost:8001,http://127.0.0.1:8001'

Write-Host 'Откройте в браузере: http://localhost:8001   (остановить сервер: Ctrl+C)' -ForegroundColor Green
& $python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001 --workers 1 --no-access-log --no-proxy-headers
