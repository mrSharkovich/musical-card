"""Media validation: signatures, bounded image decoder, basic audio container checks.

Full adversarial codec validation is not possible without sandboxed transcoding;
processing is limited to documented formats and size caps.
"""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import struct
import warnings
from PIL import Image, UnidentifiedImageError

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_AUDIO_BYTES = 15 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
MAX_ANIMATION_FRAMES = 300
MAX_ANIMATION_TOTAL_PIXELS = 60_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


@dataclass(frozen=True)
class FileKind:
    media_type: str
    is_image: bool


def detect_file_kind(content: bytes) -> FileKind | None:
    if content.startswith(b"\xff\xd8\xff"):
        return FileKind("image/jpeg", True)
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return FileKind("image/png", True)
    if content.startswith((b"GIF87a", b"GIF89a")):
        return FileKind("image/gif", True)
    if content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP":
        return FileKind("image/webp", True)
    if content.startswith(b"ID3") or content[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return FileKind("audio/mpeg", False)
    if content.startswith(b"OggS"):
        return FileKind("audio/ogg", False)
    if content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WAVE":
        return FileKind("audio/wav", False)
    if len(content) >= 12 and content[4:8] == b"ftyp":
        return FileKind("audio/mp4", False)
    if content.startswith(b"\x1aE\xdf\xa3"):
        return FileKind("audio/webm", False)
    return None


def _validate_image(content: bytes, media_type: str) -> None:
    expected = {"image/png":"PNG", "image/jpeg":"JPEG", "image/gif":"GIF", "image/webp":"WEBP"}[media_type]
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as img:
                if img.format != expected or img.width < 1 or img.height < 1 or img.width * img.height > MAX_IMAGE_PIXELS:
                    raise ValueError("Неверные размеры или формат изображения")
                frames = getattr(img, "n_frames", 1)
                if frames > MAX_ANIMATION_FRAMES or frames * img.width * img.height > MAX_ANIMATION_TOTAL_PIXELS:
                    raise ValueError("Слишком много пикселей анимации")
                img.verify()
            # verify() does not decode pixels. Decode frames in bounded images too.
            with Image.open(BytesIO(content)) as img:
                for index in range(getattr(img, "n_frames", 1)):
                    img.seek(index)
                    img.load()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError,
            Image.DecompressionBombWarning, EOFError, struct.error) as exc:
        raise ValueError("Изображение повреждено или слишком велико") from exc


def _validate_audio(content: bytes, media_type: str) -> None:
    # Basic container checks only. Never run external codecs/processes on uploads.
    if len(content) < 32:
        raise ValueError("Слишком короткий аудиофайл")
    if media_type == "audio/wav" and (len(content) < 44 or b"fmt " not in content[:128] or b"data" not in content):
        raise ValueError("Некорректный WAV-файл")
    if media_type == "audio/ogg" and (content[4] != 0 or not any(marker in content[:512] for marker in (b"OpusHead", b"vorbis", b"Speex"))):
        raise ValueError("Некорректный OGG-файл")
    if media_type == "audio/mp4" and content[8:12] not in (b"M4A ", b"isom", b"mp42", b"mp41", b"iso2", b"3gp4", b"M4B "):
        raise ValueError("Неподдерживаемый MP4/M4A-файл")
    if media_type == "audio/webm" and b"webm" not in content[:1024].lower():
        raise ValueError("Некорректный WebM-файл")
    if media_type == "audio/mpeg" and content.startswith(b"ID3"):
        if len(content) < 16 or any(n > 127 for n in content[6:10]):
            raise ValueError("Некорректный MP3-файл")
        tag_end = 10 + ((content[6] << 21) | (content[7] << 14) | (content[8] << 7) | content[9])
        if tag_end >= len(content) or b"\xff" not in content[tag_end:]:
            raise ValueError("Некорректный MP3-файл")


def validate_upload(content: bytes) -> FileKind:
    kind = detect_file_kind(content)
    if not kind:
        raise ValueError("Поддерживаются JPEG, PNG, WebP, GIF и распространённые аудиоформаты")
    if len(content) > (MAX_IMAGE_BYTES if kind.is_image else MAX_AUDIO_BYTES):
        raise ValueError("Файл превышает допустимый размер")
    if kind.is_image:
        _validate_image(content, kind.media_type)
    else:
        _validate_audio(content, kind.media_type)
    return kind
