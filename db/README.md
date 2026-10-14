# Каталог: музыка и шаблоны

Две базы SQLite со встроенным контентом сайта:

| База | Что хранит |
|---|---|
| `music.sqlite` | Музыкальная подборка для панели «Аудио» |
| `templates.sqlite` | Шаблоны (`templates` + `template_variants` — раскладка под 4 формата), фоны (`backgrounds`) и стикеры (`stickers`) |

Черновики и опубликованные открытки пользователей сюда **не входят** — ими занимается бэкенд (`backend/`).

## Структура

```
db/
  schema/          SQL-схемы: common.sql (лицензии), music.sql, templates.sql
  seeds/           ДАННЫЕ — правьте здесь:
    licenses.csv     белый список лицензий
    tracks.csv       треки
    backgrounds.csv  фоны (вкладка «Фоны»)
    stickers.csv     картинки и стикеры (вкладка «Элементы»)
    templates.json   шаблоны
    pending_images.csv  картинки, которые ждут ссылки на источник (в базу не попадают)
  media/           файлы: music/, backgrounds/, stickers/, licenses/ (подтверждения лицензий)
  build.py         собирает обе базы из seeds/
  catalog.py       чтение баз для бэкенда (только стандартная библиотека)
  catalog_routes.py  готовые маршруты FastAPI
  tests/           проверки
```

## Сборка

Из корня репозитория:

```bash
python db/build.py
```

Появятся `db/music.sqlite` и `db/templates.sqlite`. Сборка остановится с понятной ошибкой, если в данных что-то не так: неразрешённая лицензия, нет автора для CC BY, файл не найден, сломан JSON шаблона.

## Сейчас в каталоге

- 3 мелодии `gentle`, `festive`, `dream` — перенесены из `src/model.js`, собственные работы команды (MIT).
- 9 треков с ccMixter, все под **CC BY 4.0** (mp3 в `media/music/`, подтверждения лицензий в `media/licenses/`):

| id | Трек | Автор | Вокал |
|---|---|---|---|
| `green-streaks-in-the-sky` | Green Streaks in the Sky | Matthew C. Wright | нет |
| `jazz-jam-2` | jazzJam2 | Admiral Bob (сэмплы mwic) | не указано |
| `grounded-dreamscape` | Grounded Dreamscape | Ben Blohowiak (сэмплы spinningmerkaba) | нет |
| `counter` | Counter | jaspertine | нет |
| `too-old-to-be-cool` | Too old to be cool | jaspertine | нет |
| `morning` | Morning | MalreDeszik | не указано |
| `fragments-of-fate` | Fragments Of Fate | Skye Jordan | нет |
| `important-or-not` | importantornot | martinsea (вокал Integer_astoria) | да |
| `improvisation-2025` | improvisation 1,3,2025 | Speck | нет |

- 7 фонов на сайте:

| id | Фон | Автор | Лицензия |
|---|---|---|---|
| `hurricane-isabel` | Ураган Изабель из космоса | NASA / Ed Lu | общественное достояние |
| `welcome-stripes` | Welcome с цветными лентами | Openclipart | CC0 |
| `chrysanthemums-snow` | Хризантемы под снегом | George Chernilevsky | CC BY 4.0 |
| `fireworks-gold` | Золотой салют | Ondrejk | общественное достояние |
| `poppy-field` | Красный мак | Dietmar Rabich | CC BY-SA 4.0 |
| `new-year-table` | Новогодний стол | автор уточняется | CC BY-SA 4.0 |
| `nunspeet-christmas-lights` | Дом с рождественской подсветкой | автор уточняется | CC BY-SA 4.0 |

  Ещё `hubble-ultra-deep-field` — черновик: лицензия версии 2014 года не проверена.
- 13 стикеров: `happy-new-year-confetti` (jhnri4) и `books-apple` (j4p4n) с Openclipart — CC0; 9 эмодзи OpenMoji (`openmoji-*`) — CC BY-SA 4.0; подложки для текста `plate-light` и `plate-dark` — работа команды, MIT.
- 14 шаблонов, каждый в 4 форматах (4:5, 1:1, 9:16, 16:9):
  - перенесены из `src/model.js` (элементы совпадают с `applyTemplate()`): `blank`, `bloom`, `love`, `cheer`;
  - с фонами и стикерами каталога: `new-year-night` (салют), `birthday-balloons` (шарики), `winter-flowers` (цветы под снегом), `love-hearts` (люблю тебя), `teacher-day` (День учителя);
  - без картинок, только текст и линии (элементы `draw`, как рисование от руки в редакторе): `women-day` (8 Марта), `defender-day` (23 Февраля), `wedding` (свадьба), `thank-you` (спасибо), `get-well` (выздоравливай).
  У них указан трек по умолчанию (`default_track_id`), а авторы фонов и стикеров попадают в `credits`.
- Картинки, которые ждут источника или лицензии, — в `seeds/pending_images.csv`.

## Лицензии

Разрешены только лицензии из `seeds/licenses.csv`. Запись с другой лицензией база не примет.

Это политика `LICENSES.md` (PD, CC0, CC BY 4.0, MIT, Apache-2.0, BSD-3-Clause, OFL 1.1) плюс **CC BY-SA 3.0 и 4.0** — их команда разрешила 2026-10-14; нужно дописать в `LICENSES.md`. У CC BY-SA есть условие: открытка с таким материалом распространяется на тех же условиях, автора показываем всегда.

Не добавляем: NC (только некоммерческое использование), ND, GFDL, а также «бесплатные» сайты со своей лицензией (например, Pixabay License).

Что база проверяет сама:
- лицензия есть в белом списке;
- для лицензий с указанием автора заполнен `attribution_text`;
- чужой трек или картинку нельзя сделать `active`, пока не указаны `source_url`, `verified_at` и `license_proof_path` (скриншот страницы с лицензией в `media/licenses/`).
