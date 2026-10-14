from __future__ import annotations

from dataclasses import dataclass


MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_AUDIO_BYTES = 15 * 1024 * 1024


@dataclass(frozen=True)
class FileKind:
    media_type: str
    is_image: bool


def detect_file_kind(content: bytes) -> FileKind | None:
    """Минимальная сигнатурная проверка. SVG намеренно не поддерживается."""
    if content.startswith(b"\xff\xd8\xff"):
        return FileKind("image/jpeg", True)
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return FileKind("image/png", True)
    if content.startswith((b"GIF87a", b"GIF89a")):
        return FileKind("image/gif", True)
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return FileKind("image/webp", True)
    if content.startswith(b"ID3") or content[:2] == b"\xff\xfb":
        return FileKind("audio/mpeg", False)
    if content.startswith(b"OggS"):
        return FileKind("audio/ogg", False)
    if content.startswith(b"RIFF") and content[8:12] == b"WAVE":
        return FileKind("audio/wav", False)
    if content[4:8] == b"ftyp":
        return FileKind("audio/mp4", False)
    if content.startswith(b"\x1aE\xdf\xa3"):
        return FileKind("audio/webm", False)
    return None


def validate_upload(content: bytes) -> FileKind:
    kind = detect_file_kind(content)
    if not kind:
        raise ValueError("Поддерживаются JPEG, PNG, WebP, GIF и распространённые аудиоформаты")
    limit = MAX_IMAGE_BYTES if kind.is_image else MAX_AUDIO_BYTES
    if len(content) > limit:
        raise ValueError("Файл превышает допустимый размер")
    return kind
