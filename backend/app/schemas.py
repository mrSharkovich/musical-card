from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProjectPayload(BaseModel):
    """Снимок, который сохраняет существующий фронтенд."""

    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    format: Literal["4:5", "1:1", "9:16", "16:9"]
    bg: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    elements: list[dict[str, Any]] = Field(default_factory=list, max_length=300)
    voice: dict[str, Any] | None = None
    music: dict[str, Any] | None = None
    voiceVolume: float = Field(default=1, ge=0, le=1)
    musicVolume: float = Field(default=0.35, ge=0, le=1)
    updatedAt: datetime | None = None

    @field_validator("elements")
    @classmethod
    def validate_elements(cls, elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
        allowed = {"text", "shape", "image", "draw"}
        for element in elements:
            if element.get("type") not in allowed:
                raise ValueError("Недопустимый тип элемента")
            if not isinstance(element.get("id"), str) or len(element["id"]) > 100:
                raise ValueError("У элемента должен быть корректный id")
        return elements


class ProjectRequest(BaseModel):
    project: ProjectPayload


class PublishRequest(BaseModel):
    opensAt: datetime | None = None


class EditTokenResponse(BaseModel):
    editToken: str


class OkResponse(BaseModel):
    ok: bool = True


class PublicIdResponse(BaseModel):
    publicId: str
