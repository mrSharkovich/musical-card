-- =====================================================================
--  БАЗА 2: templates.sqlite — галерея шаблонов открыток.
--
--  Шаблон = готовый «проект» в том же формате, что сохраняет фронтенд:
--    { "format": "4:5", "bg": "#fce8f2", "elements": [ {type:"text"...}, ... ] }
--  Ширина холста всегда 800, высота зависит от формата (src/model.js → formats):
--    4:5 → 1000, 1:1 → 800, 9:16 → 1422, 16:9 → 450.
--  Поэтому у каждого шаблона есть вариант на каждый формат (template_variants).
--
--  backgrounds — фоны на весь холст (вкладка «Фоны» в редакторе);
--  stickers    — картинки и стикеры поверх фона (вкладка «Элементы»).
--  Шаблон может использовать и то и другое: в элементе image пишется
--  "src": "background:<id>" или "src": "sticker:<id>".
--  build.py проверяет, что такая картинка есть и проверена, а catalog.py
--  собирает по этим ссылкам список авторов шаблона.
-- =====================================================================

CREATE TABLE templates (
    slug              TEXT PRIMARY KEY,    -- совпадает с id в src/model.js: 'blank', 'bloom', 'love', 'cheer'
    title             TEXT NOT NULL,
    tags              TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),

    -- то, что сейчас показывает галерея: цвет обложки и символ
    preview_bg        TEXT NOT NULL CHECK (preview_bg GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
    decoration        TEXT NOT NULL DEFAULT '',

    -- трек по умолчанию из music.sqlite (другая база, поэтому без FK;
    -- существование проверяет build.py)
    default_track_id  TEXT,

    -- сами шаблоны — работа команды, лицензия как у проекта
    author            TEXT NOT NULL DEFAULT 'Команда «Музыкальная открытка»',
    license_code      TEXT NOT NULL DEFAULT 'MIT' REFERENCES licenses(code),

    status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'blocked')),
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE template_variants (
    template_slug  TEXT NOT NULL REFERENCES templates(slug) ON DELETE CASCADE,
    format         TEXT NOT NULL CHECK (format IN ('4:5', '1:1', '9:16', '16:9')),
    bg             TEXT NOT NULL CHECK (bg GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
    -- массив элементов в формате фронтенда (types: text, shape, image, draw)
    elements       TEXT NOT NULL CHECK (json_valid(elements) AND json_type(elements) = 'array'),
    PRIMARY KEY (template_slug, format)
);

-- Общие поля картинок (фонов и стикеров) одинаковые: файл, лицензия, проверка.
-- Две таблицы, потому что в редакторе это разные вкладки и разные правила:
--   backgrounds — картинка на весь холст. Редактор обрезает её под формат
--                 (object-fit: cover), поэтому одного файла хватает на 4 формата;
--   stickers    — элемент поверх фона, лучше с прозрачностью (PNG/WebP).

CREATE TABLE backgrounds (
    id                  TEXT PRIMARY KEY CHECK (id NOT GLOB '*[^a-z0-9-]*'),
    title               TEXT NOT NULL,
    tags                TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
    occasions           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(occasions) AND json_type(occasions) = 'array'),
    media_path          TEXT NOT NULL,     -- путь внутри db/media, например 'backgrounds/fireworks.jpg'
    mime_type           TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
                                           -- SVG не принимается: бэкенд тоже запрещает его из соображений безопасности
    width               INTEGER NOT NULL CHECK (width > 0),
    height              INTEGER NOT NULL CHECK (height > 0),
    avg_color           TEXT CHECK (avg_color IS NULL OR avg_color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
                                           -- средний цвет: подходит как цвет холста под картинкой
    is_dark             INTEGER NOT NULL DEFAULT 0 CHECK (is_dark IN (0, 1)),  -- тёмный фон → светлый текст

    license_code        TEXT NOT NULL REFERENCES licenses(code),
    author              TEXT,
    attribution_text    TEXT,
    source_name         TEXT NOT NULL,     -- 'own', 'Openclipart', 'Wikimedia Commons' ...
    source_url          TEXT,
    license_proof_path  TEXT,
    verified_by         TEXT,
    verified_at         TEXT,

    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'blocked')),
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (
        status <> 'active'
     OR (verified_at IS NOT NULL
         AND (source_name = 'own' OR (source_url IS NOT NULL AND license_proof_path IS NOT NULL)))
    )
);

CREATE TABLE stickers (
    id                  TEXT PRIMARY KEY CHECK (id NOT GLOB '*[^a-z0-9-]*'),
    title               TEXT NOT NULL,
    tags                TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
    occasions           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(occasions) AND json_type(occasions) = 'array'),
    media_path          TEXT NOT NULL,     -- путь внутри db/media, например 'stickers/happy-new-year.png'
    mime_type           TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
    width               INTEGER NOT NULL CHECK (width > 0),
    height              INTEGER NOT NULL CHECK (height > 0),
    has_transparency    INTEGER NOT NULL DEFAULT 1 CHECK (has_transparency IN (0, 1)),
    default_width       INTEGER NOT NULL DEFAULT 300 CHECK (default_width BETWEEN 20 AND 800),
                                           -- ширина на холсте (800) при добавлении; высота — по пропорциям

    license_code        TEXT NOT NULL REFERENCES licenses(code),
    author              TEXT,
    attribution_text    TEXT,
    source_name         TEXT NOT NULL,
    source_url          TEXT,
    license_proof_path  TEXT,
    verified_by         TEXT,
    verified_at         TEXT,

    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'blocked')),
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (
        status <> 'active'
     OR (verified_at IS NOT NULL
         AND (source_name = 'own' OR (source_url IS NOT NULL AND license_proof_path IS NOT NULL)))
    )
);

CREATE TRIGGER backgrounds_attribution_insert BEFORE INSERT ON backgrounds
WHEN (SELECT requires_attribution FROM licenses WHERE code = NEW.license_code) = 1
 AND trim(coalesce(NEW.attribution_text, '')) = ''
BEGIN
    SELECT RAISE(ABORT, 'Эта лицензия требует заполнить attribution_text');
END;

CREATE TRIGGER backgrounds_attribution_update BEFORE UPDATE ON backgrounds
WHEN (SELECT requires_attribution FROM licenses WHERE code = NEW.license_code) = 1
 AND trim(coalesce(NEW.attribution_text, '')) = ''
BEGIN
    SELECT RAISE(ABORT, 'Эта лицензия требует заполнить attribution_text');
END;

CREATE TRIGGER stickers_attribution_insert BEFORE INSERT ON stickers
WHEN (SELECT requires_attribution FROM licenses WHERE code = NEW.license_code) = 1
 AND trim(coalesce(NEW.attribution_text, '')) = ''
BEGIN
    SELECT RAISE(ABORT, 'Эта лицензия требует заполнить attribution_text');
END;

CREATE TRIGGER stickers_attribution_update BEFORE UPDATE ON stickers
WHEN (SELECT requires_attribution FROM licenses WHERE code = NEW.license_code) = 1
 AND trim(coalesce(NEW.attribution_text, '')) = ''
BEGIN
    SELECT RAISE(ABORT, 'Эта лицензия требует заполнить attribution_text');
END;
