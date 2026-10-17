"""Strict schemas for data sent by untrusted browsers."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
import math
import re

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator

HEX = re.compile(r"#[0-9a-fA-F]{6}\Z")
ID = re.compile(r"[A-Za-z0-9_-]{1,100}\Z")
DRAFT = re.compile(r"/api/media/draft/[A-Za-z0-9_-]{16,128}(?:\?edit_token=[A-Za-z0-9_-]{16,128})?\Z")
CATALOG_IMAGE = re.compile(r"/api/catalog/(?:backgrounds|stickers)/[A-Za-z0-9_-]+/file\Z")
CATALOG_AUDIO = re.compile(r"/api/catalog/music/[A-Za-z0-9_-]+/file\Z")
# Шрифты текста: системные (serif, sans, mono) и локальные OFL-шрифты из /fonts (hand, script, round).
TEXT_FONTS = ("serif", "sans", "mono", "hand", "script", "round")
ELEMENT_BASE = {"id", "type", "x", "y", "w", "h", "rotate", "opacity"}
ELEMENT_EXTRA = {
    "text": {"text", "font", "align", "size", "color"},
    "shape": {"kind", "color"},
    "image": {"src", "isBackground"},
    "draw": {"points", "color", "size"},
}


def finite_number(v: Any, name: str, minimum: float = -100000, maximum: float = 100000) -> None:
    if isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) or not minimum <= v <= maximum:
        raise ValueError(f"Некорректное число: {name}")


class ProjectPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    format: Literal["4:5", "1:1", "9:16", "16:9"]
    bg: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    elements: list[dict[str, Any]] = Field(default_factory=list, max_length=300)
    voice: dict[str, Any] | None = None
    music: dict[str, Any] | None = None
    voiceVolume: float = Field(default=1, ge=0, le=1, allow_inf_nan=False)
    musicVolume: float = Field(default=0.35, ge=0, le=1, allow_inf_nan=False)
    # «Музыка тише под голосом». Строго bool: строки и числа отклоняются.
    duckMusic: StrictBool = False
    updatedAt: datetime | None = None

    @field_validator("elements")
    @classmethod
    def validate_elements(cls, elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
        ids = set()
        for item in elements:
            kind = item.get("type")
            if kind not in ELEMENT_EXTRA or item.keys() - (ELEMENT_BASE | ELEMENT_EXTRA[kind]):
                raise ValueError("Недопустимые поля элемента")
            eid = item.get("id")
            if not isinstance(eid, str) or not ID.fullmatch(eid) or eid in ids:
                raise ValueError("Неверный или повторный идентификатор элемента")
            ids.add(eid)
            for required in ("x", "y", "w", "h"):
                if required not in item:
                    raise ValueError(f"Отсутствует поле {required}")
            for name in ("x", "y", "w", "h", "rotate", "opacity", "size"):
                if name in item:
                    finite_number(item[name], name, 0 if name in ("w", "h", "size", "opacity") else -100000,
                                  1 if name == "opacity" else 100000)
            if item["w"] <= 0 or item["h"] <= 0:
                raise ValueError("Размер должен быть положительным")
            if "color" in item and (not isinstance(item["color"], str) or not HEX.fullmatch(item["color"])):
                raise ValueError("Недопустимый цвет")
            if kind == "text":
                if not isinstance(item.get("text", ""), str) or len(item.get("text", "")) > 5000:
                    raise ValueError("Слишком длинный текст")
                if item.get("font", "serif") not in TEXT_FONTS or item.get("align", "center") not in ("left", "right", "center"):
                    raise ValueError("Недопустимый шрифт или выравнивание")
            if kind == "shape" and item.get("kind", "heart") not in ("star", "circle", "square", "heart"):
                raise ValueError("Недопустимая фигура")
            if kind == "image":
                src = item.get("src", "")
                if not isinstance(src, str) or not (DRAFT.fullmatch(src) or CATALOG_IMAGE.fullmatch(src)):
                    raise ValueError("Недопустимый адрес изображения")
                if "isBackground" in item and not isinstance(item["isBackground"], bool):
                    raise ValueError("Неверный признак фонового изображения")
            if kind == "draw":
                pts = item.get("points", [])
                if not isinstance(pts, list) or len(pts) > 3000:
                    raise ValueError("Слишком много точек рисования")
                for p in pts:
                    if not isinstance(p, list) or len(p) != 2:
                        raise ValueError("Неверный формат точки")
                    finite_number(p[0], "x"); finite_number(p[1], "y")
        return elements

    @field_validator("voice", "music")
    @classmethod
    def validate_audio(cls, audio: dict[str, Any] | None) -> dict[str, Any] | None:
        if audio is None:
            return None
        if audio.keys() - {"src", "name", "key"}:
            raise ValueError("Посторонние поля аудио")
        for name in ("name", "key"):
            if name in audio and (not isinstance(audio[name], str) or len(audio[name]) > 255):
                raise ValueError("Некорректное имя аудио")
        if "key" in audio and not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", audio["key"]):
            raise ValueError("Неверный идентификатор музыки")
        if "src" in audio:
            src = audio["src"]
            if not isinstance(src, str) or not (DRAFT.fullmatch(src) or CATALOG_AUDIO.fullmatch(src)):
                raise ValueError("Недопустимый адрес аудио")
        return audio


class ProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project: ProjectPayload


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    opensAt: datetime | None = None


class EditTokenResponse(BaseModel):
    editToken: str


class OkResponse(BaseModel):
    ok: bool = True


class PublicIdResponse(BaseModel):
    publicId: str
