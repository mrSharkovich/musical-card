# Все автоматические тесты проекта. Запуск из папки проекта:
#   powershell -ExecutionPolicy Bypass -File .\run-tests.ps1
# Добавьте ключ -Browser, чтобы дополнительно пройти сценарии в настоящем браузере
# (нужно один раз: .\.venv\Scripts\python.exe -m pip install playwright
#                  .\.venv\Scripts\python.exe -m playwright install chromium)

param([switch]$Browser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$failed = $false

Write-Host "`n== Сервер (backend/tests) ==" -ForegroundColor Cyan
$env:PYTHONPATH = 'backend'
& $python -m unittest discover -s backend\tests
if ($LASTEXITCODE -ne 0) { $failed = $true }

Write-Host "`n== Каталог (db/tests) ==" -ForegroundColor Cyan
Remove-Item Env:PYTHONPATH
& $python -m unittest discover -s db\tests
if ($LASTEXITCODE -ne 0) { $failed = $true }

Write-Host "`n== Браузерная часть (tests/*.mjs, нужен Node.js) ==" -ForegroundColor Cyan
if (Get-Command node -ErrorAction SilentlyContinue) {
    foreach ($test in 'project-contract-fix.mjs', 'template-contract.mjs', 'design-contract.mjs', 'share-links.mjs') {
        node "tests\$test"
        if ($LASTEXITCODE -ne 0) { $failed = $true }
    }
} else {
    Write-Host 'Node.js не установлен — эти проверки пропущены (на работу сайта это не влияет).' -ForegroundColor Yellow
}

if ($Browser) {
    Write-Host "`n== Сценарии в браузере (tests/e2e_browser.py, около 3 минут) ==" -ForegroundColor Cyan
    & $python tests\e2e_browser.py
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

if ($failed) { Write-Host "`nЕСТЬ ОШИБКИ — не запускайте эту версию, пришлите вывод." -ForegroundColor Red; exit 1 }
Write-Host "`nВсе тесты пройдены." -ForegroundColor Green
