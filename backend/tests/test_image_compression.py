from __future__ import annotations

from io import BytesIO
import unittest

from PIL import Image

from app.files import FileKind, MAX_IMAGE_BYTES, compress_image_losslessly
from app.moderation import MODERATION_MAX_SIDE, moderation_image


class ImageCompressionTest(unittest.TestCase):
    def test_image_limit_is_50_megabytes(self) -> None:
        self.assertEqual(MAX_IMAGE_BYTES, 50 * 1024 * 1024)

    def test_png_optimization_preserves_pixels(self) -> None:
        original = BytesIO()
        Image.new("RGBA", (160, 160), (30, 140, 220, 180)).save(original, format="PNG", compress_level=0)
        compressed = compress_image_losslessly(original.getvalue(), FileKind("image/png", True))
        with Image.open(BytesIO(original.getvalue())) as before, Image.open(BytesIO(compressed)) as after:
            self.assertEqual(before.convert("RGBA").tobytes(), after.convert("RGBA").tobytes())
        self.assertLess(len(compressed), len(original.getvalue()))

    def test_jpeg_is_not_reencoded(self) -> None:
        original = BytesIO()
        Image.new("RGB", (32, 32), "red").save(original, format="JPEG", quality=70)
        content = original.getvalue()
        self.assertEqual(content, compress_image_losslessly(content, FileKind("image/jpeg", True)))

    def test_moderation_uses_a_bounded_copy_without_touching_the_upload(self) -> None:
        original = BytesIO()
        Image.new("RGB", (4000, 1000), "green").save(original, format="PNG")
        moderation_content, media_type = moderation_image(original.getvalue(), "image/png")
        self.assertEqual(media_type, "image/jpeg")
        with Image.open(BytesIO(moderation_content)) as scan_image:
            self.assertLessEqual(max(scan_image.size), MODERATION_MAX_SIDE)


if __name__ == "__main__":
    unittest.main()
