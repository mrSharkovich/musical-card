# LICENSES.md — лицензии и авторы Musical Card

Актуализация: 16 октября 2026 г. Использование встроенных ресурсов должно соблюдать условия **каждой отдельной лицензии**. Лицензия MIT для исходного кода НЕ распространяется автоматически на стороннюю музыку и изображения.

## Исходный код и библиотеки

- Исходный код приложения: **MIT**, авторское уведомление сохранено в [`LICENSE`](LICENSE) (Copyright © 2026 Gnativ Mary). Изменения безопасности внесены в рамках MIT.
- Фронтенд использует стандартные HTML/CSS/JavaScript/Web API; устанавливаемых npm-пакетов и внешних шрифтов нет.
- Серверные зависимости загружаются из PyPI при установке (не входят в этот ZIP в виде исходников/колёс): FastAPI — MIT; Starlette — BSD-3-Clause; Uvicorn — BSD-3-Clause; python-multipart — Apache-2.0; Pillow — HPND; Pydantic — MIT; AnyIO — MIT. Прочие транзитивные зависимости и актуальные версии см. `pip list` после установки. `httpx` (BSD-3-Clause) применяется только для тестов.
- Используйте лицензии, поставляемые с установленными пакетами (`.venv/Lib/site-packages/*.dist-info/LICENSE*`), и соответствующие сайты проектов при дальнейшем распространении.

## Встроенные аудиозаписи, фоны, стикеры

Приведённые ниже сведения взяты из каталога `db/seeds/` и хранящихся в `db/media/licenses/` подтверждений. Для ресурсов CC BY и CC BY-SA в опубликованной открытке автоматически выводятся подписи через меню **«Авторы и лицензии использованных материалов»**, если используется соответствующий ресурс каталога. Источник и лицензия дополнительно приведены здесь.

При использовании **CC BY** нужно сохранять автора, название, ссылку на источник, ссылку на лицензию и указывать сделанные изменения. **CC BY-SA** может налагать ShareAlike на адаптацию лицензируемого материала; нельзя обещать, что любая открытка или любая переработка свободна от этих условий. Формулировки авторства берутся из исходного реестра, не заменяют самостоятельную проверку оригинальных страниц.

| Категория / ресурс | Автор и указание из реестра | Лицензия | Первоначальный источник |
|---|---|---|---|
| tracks / `green-streaks-in-the-sky` | Green Streaks in the Sky — «Beautiful Piano — Green Streaks in the Sky» — Matthew C. Wright (ccmixter.org/files/matthew_c_wright/71163), CC BY 4.0 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://ccmixter.org/files/matthew_c_wright/71163) |
| tracks / `jazz-jam-2` | jazzJam2 — «jazzJam2» — Admiral Bob, при участии mwic (сэмплы «JazzJam1») (ccmixter.org/files/admiralbob77/71273), CC BY 4.0 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://ccmixter.org/files/admiralbob77/71273) |
| tracks / `grounded-dreamscape` | Grounded Dreamscape — «Grounded Dreamscape» — Ben Blohowiak, при участии spinningmerkaba (ccmixter.org/files/bblohowiak/68298), CC BY 4.0 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://ccmixter.org/files/bblohowiak/68298) |
| tracks / `counter` | Counter — «Counter» — jaspertine (ccmixter.org/files/jaspertine/70129), CC BY 4.0 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://ccmixter.org/files/jaspertine/70129) |
| tracks / `too-old-to-be-cool` | Too old to be cool — «Too old to be cool» — jaspertine (ccmixter.org/files/jaspertine/69297), CC BY 4.0 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://ccmixter.org/files/jaspertine/69297) |
| tracks / `morning` | Morning — «Morning» — MalreDeszik (ccmixter.org/files/MalreDeszik/70295), CC BY 4.0 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://ccmixter.org/files/MalreDeszik/70295) |
| tracks / `fragments-of-fate` | Fragments Of Fate — «Fragments Of Fate» — Skye Jordan (ccmixter.org/files/SkyeJordan/69454), CC BY 4.0 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://ccmixter.org/files/SkyeJordan/69454) |
| tracks / `important-or-not` | importantornot — «importantornot» — martinsea, вокал Integer_astoria (ccmixter.org/files/softmartin/71264), CC BY 4.0 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://ccmixter.org/files/softmartin/71264) |
| tracks / `improvisation-2025` | improvisation 1,3,2025 — «improvisation 1,3,2025» — Speck (ccmixter.org/files/speck/69307), CC BY 4.0 | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://ccmixter.org/files/speck/69307) |
| backgrounds / `hurricane-isabel` | Ураган Изабель из космоса — Фото: NASA / Ed Lu, МКС, 2003 — общественное достояние | [PD](https://creativecommons.org/publicdomain/mark/1.0/) | [Источник](https://commons.wikimedia.org/wiki/File:Hurricane_Isabel_from_ISS.jpg) |
| backgrounds / `welcome-stripes` | Welcome с цветными лентами — Указан в каталоге | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [Источник](https://openclipart.org/) |
| backgrounds / `chrysanthemums-snow` | Хризантемы под снегом — Фото: George Chernilevsky, «Flowers in snow 2022 G4» (Wikimedia Commons), CC BY 4.0; уменьшено | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [Источник](https://commons.wikimedia.org/wiki/File:Flowers_in_snow_2022_G4.jpg) |
| backgrounds / `fireworks-gold` | Золотой салют — Фото: Ondrejk, «Bratislava New Year Fireworks» (Wikimedia Commons) — общественное достояние | [PD](https://creativecommons.org/publicdomain/mark/1.0/) | [Источник](https://commons.wikimedia.org/wiki/File:Bratislava_New_Year_Fireworks.jpg) |
| backgrounds / `poppy-field` | Красный мак — Dietmar Rabich / Wikimedia Commons / "Dülmen, Fröbelstraße, Mohn am Feldrand -- 2021 -- 9174" / CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Fr%C3%B6belstra%C3%9Fe,_Mohn_am_Feldrand_--_2021_--_9174.jpg) |
| stickers / `happy-new-year-confetti` | Happy New Year с конфетти — jhnri4 | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [Источник](https://openclipart.org/detail/99007/happy-new-year!-by-jhnri4) |
| stickers / `books-apple` | Книги, яблоко и карандаши — j4p4n | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [Источник](https://openclipart.org/) |
| stickers / `openmoji-balloon` | Воздушный шарик — Эмодзи: OpenMoji — the open-source emoji and icon project (openmoji.org), CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://github.com/hfg-gmuend/openmoji/blob/master/color/618x618/1F388.png) |
| stickers / `openmoji-gift` | Подарок — Эмодзи: OpenMoji — the open-source emoji and icon project (openmoji.org), CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://github.com/hfg-gmuend/openmoji/blob/master/color/618x618/1F381.png) |
| stickers / `openmoji-ribbon` | Бант — Эмодзи: OpenMoji — the open-source emoji and icon project (openmoji.org), CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://github.com/hfg-gmuend/openmoji/blob/master/color/618x618/1F380.png) |
| stickers / `openmoji-heart` | Сердце — Эмодзи: OpenMoji — the open-source emoji and icon project (openmoji.org), CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://github.com/hfg-gmuend/openmoji/blob/master/color/618x618/2665.png) |
| stickers / `openmoji-sparkles` | Блёстки — Эмодзи: OpenMoji — the open-source emoji and icon project (openmoji.org), CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://github.com/hfg-gmuend/openmoji/blob/master/color/618x618/2728.png) |
| stickers / `openmoji-sparkler` | Бенгальский огонь — Эмодзи: OpenMoji — the open-source emoji and icon project (openmoji.org), CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://github.com/hfg-gmuend/openmoji/blob/master/color/618x618/1F387.png) |
| stickers / `openmoji-fireworks` | Салют — Эмодзи: OpenMoji — the open-source emoji and icon project (openmoji.org), CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://github.com/hfg-gmuend/openmoji/blob/master/color/618x618/1F386.png) |
| stickers / `openmoji-christmas-tree` | Ёлка — Эмодзи: OpenMoji — the open-source emoji and icon project (openmoji.org), CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://github.com/hfg-gmuend/openmoji/blob/master/color/618x618/1F384.png) |
| stickers / `openmoji-dog-face` | Собака — Эмодзи: OpenMoji — the open-source emoji and icon project (openmoji.org), CC BY-SA 4.0 | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Источник](https://github.com/hfg-gmuend/openmoji/blob/master/color/618x618/1F436.png) |
| stickers / `plate-light` | Светлая подложка для текста — Подложка — команда «Музыкальная открытка», MIT | [MIT](https://opensource.org/license/mit) | собственный ресурс / см. db/media/licenses |
| stickers / `plate-dark` | Тёмная подложка для текста — Подложка — команда «Музыкальная открытка», MIT | [MIT](https://opensource.org/license/mit) | собственный ресурс / см. db/media/licenses |


## Что исключено до верификации

Фотографии `new-year-table` и `nunspeet-christmas-lights` **не включены в доступный каталог и не распространяются в этом ZIP**: в исходных записях отсутствовало подтверждённое имя автора. Ресурс `hubble-ultra-deep-field` ранее имел статус `draft` и также исключён. Метаданные и документы о происхождении сохранены для последующей проверки. При использовании этих фонов в старых открытках потребуется заменить фон вручную.

## Пользовательские изображения, голос и музыка

Пользователь несёт ответственность за права на самостоятельно загруженные фотографии, аудиозаписи, тексты и материалы третьих лиц. Они не входят в дистрибутив. Администратору следует предоставить контакт для запросов правообладателей и механизм удаления незаконного материала.

## Контроль лицензий при добавлении новых материалов

Перед добавлением: убедиться в коммерческом и производном использовании, подтвердить правообладателя оригинальной записи и композиции, сохранить имя автора / URL источника / версию лицензии / ссылку на текст / сведения об изменениях, при сомнении оставить статус `draft` и не распространять файл.

Ссылки на основные условия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Это техническая документация атрибуций, не юридическое заключение.
