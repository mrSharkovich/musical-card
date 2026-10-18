"""Сквозная проверка в настоящем браузере (необязательный тест, нужен Playwright).

Запускает собственный сервер на свободном порту с временной папкой данных
(ваши backend/data не затрагиваются) и проходит все сценарии как пользователь:
главная → шаблон → редактор (текст, шрифт, фигура, стикер, фон, рисунок, фото,
слои, отмена/повтор, перетаскивание, формат) → звук (загрузка голоса, запись
с микрофона, музыка, громкость, приглушение, воспроизведение) → тема →
предпросмотр → публикация сразу и по времени → открытка получателя → удаление.
Отдельно — те же ключевые шаги на телефоне (390×844, касания) в тёмной теме.

Установка (один раз):
    python -m pip install playwright
    python -m playwright install chromium
Запуск из корня проекта:
    python tests/e2e_browser.py
"""
from __future__ import annotations

import asyncio
import io
import json
import math
import os
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
RATE_PAUSE = 62  # встроенный лимитер — 120 запросов в минуту на IP; между сценариями ждём окно


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def tone_wav(seconds: float = 2.0) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        frames = b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / 16000))) for i in range(int(16000 * seconds)))
        w.writeframes(frames)
    return buffer.getvalue()


def png_bytes() -> bytes:
    from PIL import Image
    out = io.BytesIO(); Image.new("RGB", (64, 48), "#2f6b8f").save(out, format="PNG"); return out.getvalue()


async def until(page, expression: str, timeout: int = 15000) -> None:
    """Ждёт, пока выражение станет истинным. Опрос через evaluate, а не wait_for_function:
    тот использует eval внутри страницы, а строгий CSP сайта (script-src 'self') его запрещает."""
    deadline = time.monotonic() + timeout / 1000
    while True:
        try:
            if await page.evaluate(expression):
                return
        except Exception:
            pass  # страница перезагружается — пробуем снова
        if time.monotonic() > deadline:
            raise TimeoutError(f"не дождались: {expression}")
        await asyncio.sleep(0.1)


class Checker:
    def __init__(self) -> None:
        self.passed = 0
        self.failures: list[str] = []
        self.console: list[str] = []

    def ok(self, condition: bool, message: str) -> None:
        if condition:
            self.passed += 1
            print(f"  ✓ {message}")
        else:
            self.failures.append(message)
            print(f"  ✗ {message}")


async def main() -> int:
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    data = tempfile.TemporaryDirectory()
    env = {**os.environ, "DATA_DIR": data.name, "TRUSTED_HOSTS": "127.0.0.1,localhost", "ALLOWED_ORIGINS": base}
    server = subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", str(port),
                               "--workers", "1", "--no-access-log"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    c = Checker()
    files = Path(data.name) / "_fixtures"; files.mkdir()
    (files / "voice.wav").write_bytes(tone_wav())
    (files / "photo.png").write_bytes(png_bytes())

    def api(path: str):
        with urllib.request.urlopen(base + path) as r:
            return json.loads(r.read())

    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(base + "/").read(); break
            except Exception:
                time.sleep(0.5)
        async with async_playwright() as pw:
            launch = {"args": ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"]}
            if os.getenv("CHROMIUM_PATH"):
                launch["executable_path"] = os.environ["CHROMIUM_PATH"]
            browser = await pw.chromium.launch(**launch)

            def watch(page, label):
                page.on("console", lambda m: c.console.append(f"{label}: [{m.type}] {m.text}") if m.type == "error" else None)
                page.on("pageerror", lambda e: c.console.append(f"{label}: [pageerror] {e}"))
                page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))

            async def project(page):
                token = (await page.evaluate("location.hash")).split("/")[2]
                return token, api(f"/api/projects/{token}")["project"]

            async def saved(page):
                await until(page, "document.querySelector('#save-state')?.textContent==='Сохранено'", timeout=8000)

            # ---------------- Компьютер, светлая тема ----------------
            print("Компьютер 1440×900, светлая тема")
            ctx = await browser.new_context(viewport={"width": 1440, "height": 900}, permissions=["microphone", "clipboard-read", "clipboard-write"])
            await ctx.add_init_script("try{localStorage.setItem('mc-theme','light')}catch(e){}")
            page = await ctx.new_page(); watch(page, "desktop")
            await page.goto(base + "/")
            await page.wait_for_selector(".hero")
            c.ok(await page.evaluate("document.documentElement.dataset.theme") == "light", "тема из настроек применена до отрисовки")
            loaded = await page.evaluate("document.fonts.ready.then(()=>[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family.replace(/[\"']/g,'')))")
            c.ok({"Caveat", "Nunito"} <= set(loaded), f"локальные шрифты загрузились: {sorted(set(loaded))}")
            await page.click("#demo-seal", force=True)
            await page.wait_for_selector("#demo-wrap.revealed")
            c.ok(True, "печать на главной снимает размытие с примера")

            await page.click("a[href='#/templates']")
            await page.wait_for_selector(".gallery-grid")
            total = await page.locator(".gallery-grid .gallery-card").count()
            await page.locator(".filters .chip").nth(1).click()
            filtered = await page.locator(".gallery-grid .gallery-card").count()
            c.ok(0 < filtered < total, f"фильтр шаблонов работает ({total} → {filtered})")
            await page.locator(".filters .chip").first.click()
            await page.locator('[data-new-template="bloom"]').click()
            await until(page, "location.hash.startsWith('#/edit/')")
            await page.wait_for_selector("#stage .object")
            token, p = await project(page)
            c.ok(len(p["elements"]) > 0, "открытка создана из шаблона и сохранена на сервере")

            await page.click('[data-tool="text"]')
            before = await page.locator("#stage .object").count()
            await page.click('[data-add="title"]')
            c.ok(await page.locator("#stage .object").count() == before + 1, "заголовок добавлен")
            await page.fill('[data-prop="text"]', "Привет, Аня!")
            await page.select_option('[data-prop="font"]', "hand")
            family = await page.evaluate("getComputedStyle(document.querySelector('#stage .object.selected .text-content')).fontFamily")
            c.ok("Caveat" in family, "шрифт «от руки» применяется на холсте")
            await saved(page)
            _, p = await project(page)
            c.ok(any(e.get("text") == "Привет, Аня!" and e.get("font") == "hand" for e in p["elements"]), "текст и шрифт сохранены на сервере")

            sel = page.locator("#stage .object.selected")
            box = await sel.bounding_box()
            x_before = next(e for e in p["elements"] if e.get("text") == "Привет, Аня!")["x"]
            await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            await page.mouse.down(); await page.mouse.move(box["x"] + box["width"] / 2 + 60, box["y"] + box["height"] / 2 + 20, steps=6); await page.mouse.up()
            await saved(page)
            _, p = await project(page)
            x_after = next(e for e in p["elements"] if e.get("text") == "Привет, Аня!")["x"]
            c.ok(x_after > x_before, "перетаскивание объекта сохраняется")

            await page.click('[data-tool="shapes"]')
            count = await page.locator("#stage .object").count()
            await page.click('[data-shape="star"]')
            c.ok(await page.locator("#stage .object").count() == count + 1, "фигура добавлена")
            if await page.locator("[data-sticker]").count():
                await page.locator("[data-sticker]").first.click()
                await until(page, "[...document.querySelectorAll('#stage img')].some(i=>i.complete&&i.naturalWidth>0)", timeout=8000)
                c.ok(True, "стикер каталога добавлен и загрузился")
            await page.click('[data-tool="background"]')
            await page.locator("[data-bg]").nth(2).click()
            await saved(page)
            _, p = await project(page)
            c.ok(p["bg"].lower() == "#dff2e9", "цвет фона применён")
            if await page.locator("[data-catalog-bg]").count():
                await page.locator("[data-catalog-bg]").first.click()
                await saved(page)
                _, p = await project(page)
                c.ok(any(e.get("isBackground") for e in p["elements"]), "фон из каталога лежит нижним слоем")

            await page.click('[data-tool="draw"]')
            count = await page.locator("#stage .object").count()
            stage = await page.locator("#stage").bounding_box()
            await page.mouse.move(stage["x"] + 60, stage["y"] + 60); await page.mouse.down()
            for i in range(10):
                await page.mouse.move(stage["x"] + 60 + i * 12, stage["y"] + 60 + (i % 3) * 10)
            await page.mouse.up()
            c.ok(await page.locator("#stage .object").count() == count + 1, "рисунок от руки добавлен")
            await page.click('[data-top="undo"]')
            c.ok(await page.locator("#stage .object").count() == count, "отмена убирает рисунок")
            await page.click('[data-top="redo"]')
            c.ok(await page.locator("#stage .object").count() == count + 1, "повтор возвращает рисунок")

            await page.click('[data-tool="images"]')
            count = await page.locator("#stage .object").count()
            await page.set_input_files("#image-file", str(files / "photo.png"))
            await until(page, f"document.querySelectorAll('#stage .object').length>{count}", timeout=10000)
            await until(page, "[...document.querySelectorAll('#stage img')].some(i=>i.src.startsWith('blob:')&&i.naturalWidth>0)", timeout=10000)
            c.ok(True, "своё фото загружено и показано через защищённый X-Edit-Token")
            await page.click('[data-tool="layers"]')
            c.ok(await page.locator(".layer").count() == await page.locator("#stage .object").count(), "список слоёв совпадает с холстом")

            await page.select_option("#format", "1:1")
            await saved(page)
            _, p = await project(page)
            c.ok(p["format"] == "1:1", "формат холста меняется")

            await page.click('[data-tool="audio"]')
            await page.set_input_files("#voice-file", str(files / "voice.wav"))
            await until(page, "document.querySelector('.audio-track.voice .track-file')?.textContent==='voice.wav'", timeout=10000)
            c.ok(True, "голосовой файл загружен")
            await page.locator("[data-melody]").nth(3).click()
            await page.locator('[data-volume="music"]').fill("0.6")
            await page.locator("[data-duck]").check()
            await saved(page)
            _, p = await project(page)
            c.ok(p["voice"] and p["music"] and p["duckMusic"] is True and abs(p["musicVolume"] - 0.6) < 0.01,
                 "голос, музыка, громкость и приглушение сохранены")
            await page.click('[data-audio="toggle"]')
            await page.wait_for_selector("#audio-panel.is-playing")
            c.ok(True, "воспроизведение в редакторе запускается (катушки крутятся)")
            await page.click('[data-audio="toggle"]')
            await page.wait_for_selector("#audio-panel:not(.is-playing)")

            await page.locator('[data-audio="record"]').first.click()
            capture = await page.locator("#modal-voice").get_attribute("capture")
            c.ok(capture is None, "выбор аудио остаётся обычной загрузкой файла")
            await page.set_input_files("#modal-voice", str(files / "voice.wav"))
            await page.wait_for_selector("#dialog-overlay", state="detached", timeout=10000)
            await saved(page)
            _, p = await project(page)
            c.ok(p["voice"]["name"] == "voice.wav", "файл из окна записи сохранён как голос")

            await page.locator('[data-audio="record"]').first.click()
            await page.click("#rec-start")
            await page.wait_for_selector("#rec-start.live")
            await page.wait_for_timeout(1600)
            c.ok(await page.text_content("#rec-time") not in ("0:00", None), "таймер записи идёт")
            await page.click("#rec-stop")
            await page.wait_for_selector("#dialog-overlay", state="detached", timeout=10000)
            await saved(page)
            _, p = await project(page)
            c.ok(p["voice"]["name"].startswith("Поздравление"), "запись с микрофона сохранена как голос")
            await page.locator('[data-audio="record"]').first.click()
            await page.click("#rec-start"); await page.wait_for_selector("#rec-start.live")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(800)
            _, p2 = await project(page)
            c.ok(p2["voice"] == p["voice"], "запись, закрытая крестиком/Escape, отменяется и не заменяет голос")

            await page.click("[data-theme-toggle]")
            c.ok(await page.evaluate("document.documentElement.dataset.theme") == "dark", "тема переключается")
            await page.click('[data-top="link"]')
            c.ok(await page.input_value(".dialog-body [data-key-value]") == "", "ключ автора по умолчанию скрыт")
            await page.click(".dialog-body [data-key-toggle]")
            link = await page.input_value(".dialog-body [data-key-value]")
            c.ok(token in link and "#/edit/" in link, "секретный ключ отображается только по запросу")
            await page.keyboard.press("Escape")

            await page.click('[data-top="preview"]')
            await until(page, "location.hash.startsWith('#/preview/')")
            await page.wait_for_selector("#start-view:not([disabled])")
            c.ok((await page.evaluate("getComputedStyle(document.querySelector('#viewer-viewport .stage-shell')).filter")).startswith("blur"), "в предпросмотре открытка под размытием")
            await page.click("#start-view", force=True)
            await page.wait_for_selector("#viewer-viewport.revealed")
            await page.wait_for_selector("#viewer-player.is-playing")
            c.ok(True, "печать снимает размытие и запускает звук")
            await page.click("#viewer-toggle")
            c.ok(not await page.locator("#viewer-player.is-playing").count(), "пауза работает")
            await page.click("#viewer-replay")
            c.ok(await page.locator("#viewer-player.is-playing").count() == 1, "«заново» запускает сначала")

            await page.goto(base + f"/#/publish/{token}")
            await page.wait_for_selector("#publish-form")
            await page.click("button[type=submit]")
            await page.wait_for_selector("#copy-public")
            public = await page.input_value(".link-box input")
            c.ok("#/card/" in public and token not in public, "публичная ссылка не содержит ключ автора")
            c.ok(await page.locator("#publish-result [data-author-key]").evaluate("el => !el.open"), "секретный раздел свёрнут")
            await page.click("#publish-result [data-key-summary]")
            c.ok(await page.input_value("#publish-result [data-key-value]") == "", "ключ не раскрывается при разворачивании раздела")
            await page.click("#publish-result [data-key-toggle]")
            c.ok(token in await page.input_value("#publish-result [data-key-value]"), "ключ можно показать отдельным действием")
            await page.check('input[value="later"]')
            await page.fill("#open-date", "2030-01-01T10:00")
            await page.click("button[type=submit]")
            await until(page, f"document.querySelector('.link-box input')?.value!=='{public}'")
            later = await page.input_value(".link-box input")
            await ctx.close()

            print(f"Пауза {RATE_PAUSE} с из-за лимитера запросов…"); await asyncio.sleep(RATE_PAUSE)

            # ---------------- Получатель на телефоне, тёмная тема ----------------
            print("Телефон 390×844, тёмная тема")
            ctx = await browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            await ctx.add_init_script("try{localStorage.setItem('mc-theme','dark')}catch(e){}")
            page = await ctx.new_page(); watch(page, "phone")
            await page.goto(public)
            await page.wait_for_selector("#start-view:not([disabled])")
            await page.tap("#start-view", force=True)
            await page.wait_for_selector("#viewer-viewport.revealed")
            c.ok(True, "получатель на телефоне открывает открытку печатью")
            credits = await page.locator(".viewer-credits p").count()
            c.ok(credits >= 1, "под открыткой указаны авторы и лицензии музыки/фона")
            width_ok = await page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
            c.ok(width_ok, "нет горизонтальной прокрутки на телефоне")
            await page.goto(later)
            await page.wait_for_selector(".wait-content .countdown div")
            c.ok(await page.locator("#start-view").count() == 0, "до даты — только страница ожидания с отсчётом")
            card = api(f"/api/cards/{later.split('/card/')[1]}")
            c.ok(card["status"] == "scheduled" and "project" not in card, "сервер не отдаёт содержимое запланированной открытки")

            await page.goto(base + "/")
            await page.wait_for_selector(".hero")
            await page.locator("[data-create]").first.tap()
            await until(page, "location.hash.startsWith('#/edit/')")
            await page.wait_for_selector(".editor-rail")
            c.ok(await page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), "редактор помещается в экран телефона")
            await page.tap('[data-tool="text"]')
            c.ok(await page.locator("#library").is_visible(), "инструменты открываются выдвижной панелью")
            await page.tap('[data-add="title"]')
            c.ok(await page.locator("#properties.is-open").count() == 1, "после добавления открываются свойства объекта")
            await page.tap('[data-prop-action="close"]')
            c.ok(await page.locator("#properties.is-open").count() == 0, "кнопка «Готово» закрывает свойства")
            await page.tap('[data-tool="audio"]')
            await page.tap("[data-close-library]")
            c.ok(not await page.locator("#library").is_visible(), "панель сворачивается кнопкой")
            await page.tap('[data-top="more"]')
            await page.wait_for_selector("[data-more=theme]")
            await page.tap("[data-more=theme]")
            c.ok(await page.evaluate("document.documentElement.dataset.theme") == "light", "тема переключается из меню «Ещё»")
            ptoken = (await page.evaluate("location.hash")).split("/")[2]
            await page.tap('[data-top="more"]'); await page.tap("[data-more=delete]")
            await until(page, "location.hash==='#/'")
            try:
                api(f"/api/projects/{ptoken}"); gone = False
            except urllib.error.HTTPError as error:
                gone = error.code == 404
            c.ok(gone, "открытка удаляется из меню «Ещё» (сервер отвечает 404)")

            await page.goto(base + f"/#/edit/{token}")
            await page.wait_for_selector(".editor-shell")
            await page.tap('[data-top="more"]'); await page.tap("[data-more=delete]")
            await until(page, "location.hash==='#/'")
            await page.goto(public)
            await page.wait_for_selector(".error-page")
            msg = await page.text_content(".error-page p")
            c.ok("{" not in msg, f"после удаления — понятное сообщение: «{msg.strip()}»")
            await ctx.close()
            await browser.close()
    finally:
        server.terminate()
        try:
            server.wait(10)
        except Exception:
            server.kill()
        data.cleanup()

    unexpected = [m for m in c.console if "404" not in m]
    c.ok(not unexpected, "в консоли браузера нет ошибок" + ("" if not unexpected else ":\n    " + "\n    ".join(unexpected)))
    print(f"\nИтог: {c.passed} проверок пройдено, {len(c.failures)} не пройдено")
    for failure in c.failures:
        print("  ✗", failure)
    return 1 if c.failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
