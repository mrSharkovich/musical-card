-- =====================================================================
--  Общая часть обеих баз: белый список лицензий.
--  Таблица создаётся и в music.sqlite, и в templates.sqlite,
--  данные в обе базы загружаются из одного файла seeds/licenses.csv.
--
--  Список совпадает с политикой команды из LICENSES.md:
--  MIT, Apache-2.0, BSD, CC0, CC BY 4.0, OFL 1.1 (+ общественное достояние).
--  Решением команды (2026-10-14) добавлены CC BY-SA 3.0 и 4.0.
--  NC (только некоммерческое), ND и «бесплатно, но своя лицензия» сюда НЕ добавляются.
--  Поле commercial_use оставлено как защита: если NC-лицензию всё же добавят
--  с commercial_use = 0, `python db/build.py --commercial-only` соберёт каталог без неё.
--  Нет строки в этой таблице — нельзя добавить трек или картинку:
--  это обеспечивает внешний ключ license_code.
-- =====================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE licenses (
    code                  TEXT PRIMARY KEY,                 -- SPDX-идентификатор: 'CC0-1.0', 'CC-BY-4.0'
    name                  TEXT NOT NULL,
    url                   TEXT NOT NULL,                    -- официальный текст лицензии
    requires_attribution  INTEGER NOT NULL CHECK (requires_attribution IN (0, 1)),
    commercial_use        INTEGER NOT NULL DEFAULT 1 CHECK (commercial_use IN (0, 1)),  -- 0 = только некоммерческое (NC)
    notes                 TEXT
);
