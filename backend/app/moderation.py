from __future__ import annotations

import base64
import io
import logging
import os
from dataclasses import dataclass

import httpx
from PIL import Image, UnidentifiedImageError


OPENAI_MODERATIONS_URL = "https://api.openai.com/v1/moderations"
OPENAI_MODERATION_MODEL = "omni-moderation-latest"
MODERATION_TIMEOUT_SECONDS = 10
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModerationOutcome:
    flagged: bool
    checked: bool


def moderation_image(content: bytes, media_type: str) -> tuple[bytes, str]:
    """Return moderation-safe input; use the first GIF frame as a PNG."""
    if media_type != "image/gif":
        return content, media_type

    try:
        with Image.open(io.BytesIO(content)) as image:
            image.seek(0)
            first_frame = image.convert("RGBA")
            output = io.BytesIO()
            first_frame.save(output, format="PNG")
            return output.getvalue(), "image/png"
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as error:
        raise ValueError("Не удалось прочитать GIF") from error


async def moderate_image(content: bytes, media_type: str) -> ModerationOutcome:
    """Moderate an image with OpenAI; transient failures do not block uploads."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return ModerationOutcome(flagged=False, checked=False)

    image_content, image_media_type = moderation_image(content, media_type)
    image_url = f"data:{image_media_type};base64,{base64.b64encode(image_content).decode('ascii')}"
    payload = {
        "model": OPENAI_MODERATION_MODEL,
        "input": [{"type": "image_url", "image_url": {"url": image_url}}],
    }

    try:
        async with httpx.AsyncClient(timeout=MODERATION_TIMEOUT_SECONDS) as client:
            response = await client.post(
                OPENAI_MODERATIONS_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            response.raise_for_status()
            result = response.json()["results"][0]
            return ModerationOutcome(flagged=bool(result["flagged"]), checked=True)
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as error:
        logger.warning("Модерация изображения недоступна: %s", type(error).__name__)
        return ModerationOutcome(flagged=False, checked=False)
