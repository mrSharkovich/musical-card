# Бэкенд «Музыкальной открытки»

MVP на FastAPI. До подключения БД данные хранятся в JSON-файлах каталога `data/`.

## Запуск

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Документация API в разработке: `http://127.0.0.1:8001/docs`.

## Проверка

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

## Очистка данных

Сначала можно просмотреть кандидатов на удаление:

```powershell
.\.venv\Scripts\python.exe -m app.cleanup --days 30 --dry-run
```

Уберите `--dry-run`, чтобы удалить черновики, публикации и неиспользуемые файлы старше указанного срока.
