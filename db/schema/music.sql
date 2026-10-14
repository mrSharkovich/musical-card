-- =====================================================================
--  БАЗА 1: music.sqlite — встроенная музыкальная подборка.
--
--  Два вида треков:
--    synth — мелодия из нот, которую фронтенд играет через Web Audio
--            (так сейчас работают gentle / festive / dream из src/model.js);
--    file  — аудиофайл (mp3/ogg) из папки db/media/music/.
--
--  Как трек попадает в открытку (поле project.music):
--    synth -> { "key": "<id>", "name": "<title>" }            — как сейчас
--    file  -> { "key": "<id>", "name": "<title>", "src": "/api/music/<id>/file" }
--  Существующий src/audio.js уже умеет оба варианта.
-- =====================================================================

CREATE TABLE tracks (
    id                  TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9-]*'),
    title               TEXT NOT NULL,
    artist              TEXT NOT NULL,
    kind                TEXT NOT NULL CHECK (kind IN ('synth', 'file')),

    notes               TEXT,             -- synth: JSON-массив частот в Гц, например [523,659,784]
    media_path          TEXT,             -- file: путь внутри db/media, например 'music/piano-waltz.mp3'
    mime_type           TEXT,             -- file: 'audio/mpeg', 'audio/ogg'
    duration_sec        INTEGER CHECK (duration_sec IS NULL OR duration_sec > 0),

    moods               TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(moods) AND json_type(moods) = 'array'),
    occasions           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(occasions) AND json_type(occasions) = 'array'),
    has_vocals          INTEGER NOT NULL DEFAULT 0 CHECK (has_vocals IN (0, 1)),  -- вокал мешает голосовому поздравлению

    -- лицензия и происхождение
    license_code        TEXT NOT NULL REFERENCES licenses(code),
    attribution_text    TEXT,             -- готовая строка «кто автор» для страницы получателя
    source_name         TEXT NOT NULL,    -- 'own' для своих работ, иначе 'Incompetech', 'Free Music Archive' ...
    source_url          TEXT,             -- страница трека у источника
    license_proof_path  TEXT,             -- скриншот/PDF страницы с лицензией, путь внутри db/media
    verified_by         TEXT,
    verified_at         TEXT,             -- дата проверки лицензии, 'YYYY-MM-DD'

    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'blocked')),
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),

    -- у synth обязательны ноты, у file — файл и его тип
    CHECK (
        (kind = 'synth' AND notes IS NOT NULL AND json_valid(notes) AND json_type(notes) = 'array' AND media_path IS NULL)
     OR (kind = 'file'  AND media_path IS NOT NULL AND mime_type IN ('audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4'))
    ),
    -- чужой трек нельзя сделать активным без источника, проверки и доказательства лицензии
    CHECK (
        status <> 'active'
     OR (verified_at IS NOT NULL
         AND (source_name = 'own' OR (source_url IS NOT NULL AND license_proof_path IS NOT NULL)))
    )
);

CREATE INDEX tracks_active_idx ON tracks (status, sort_order);

-- Если лицензия требует указания автора, без attribution_text запись не сохранится.
CREATE TRIGGER tracks_attribution_insert BEFORE INSERT ON tracks
WHEN (SELECT requires_attribution FROM licenses WHERE code = NEW.license_code) = 1
 AND trim(coalesce(NEW.attribution_text, '')) = ''
BEGIN
    SELECT RAISE(ABORT, 'Эта лицензия требует заполнить attribution_text');
END;

CREATE TRIGGER tracks_attribution_update BEFORE UPDATE ON tracks
WHEN (SELECT requires_attribution FROM licenses WHERE code = NEW.license_code) = 1
 AND trim(coalesce(NEW.attribution_text, '')) = ''
BEGIN
    SELECT RAISE(ABORT, 'Эта лицензия требует заполнить attribution_text');
END;
