# Musical Card — API

Запускается из корня проекта как `backend.app.main:app`. Требует Python 3.11+, зависимости из `requirements.txt`; тесты `backend/requirements-dev.txt`. API-документация `/docs` отключена.

Локальный запуск Windows 11:

```powershell
cd "C:\Users\vboxuser\Desktop\musical-card"
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
$env:TRUSTED_HOSTS="localhost,127.0.0.1,192.168.1.102"
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8001 --workers 1 --no-access-log --no-proxy-headers
```

Внешний доступ только через TLS-прокси, Uvicorn слушает `127.0.0.1:8001`. Один процесс. По умолчанию файлы в `backend/data`, эта папка **не входит в поставку** и должна резервно копироваться.

Черновые медиа требуют заголовок `X-Edit-Token`. Редактор получает файлы через `fetch` как `blob:`. Сервер принимает только медиа проекта; публикация проверяет право владельца. `DELETE /api/projects/{edit_token}` отзывает проект, связанные современные публичные ссылки и вложения.

Очистка вручную, не запускать автоматически без резервной копии и проверки кандидатов:

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\python.exe -m backend.app.cleanup --days 30 --dry-run
```

См. `INSTALL_RU.md`, `SECURITY_AUDIT_RU.md`, `LICENSES.md`.
