"""Side-by-side crop of the SAME artwork spot from three renders.

Numbers already say the hairline is only in the manual JPEG export. This makes
that checkable by eye: one 500x800 patch, same document coordinates, three
renders, stacked left to right with the seam column marked underneath.

The three files differ in width by up to 2px (10229 / 10230 / 10231) for the
same artboard - that sub-pixel difference in the raster grid is the whole story,
so the crop uses each file's own width to stay on the same artwork.
"""
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

X, Y, W, H, ZOOM = 5229, 6600, 500, 800, 2

SRC = [
    ("manual JPEG (CMYK) - HAIRLINE",
     r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\production_ready_order_5XL-04.jpg"),
    ("software JPEG (RGB) - clean",
     r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\5XL\5XL2.jpg"),
    ("software TIFF (CMYK 300dpi) - clean",
     r"E:\seam_test\C_tiff_cmyk_aa_on_5XL Back_Item1.tif"),
]

tiles = []
for label, path in SRC:
    im = Image.open(path)
    # Anchor on the artboard's left edge, so a 1-2px width difference between
    # renders does not walk the crop off the feature.
    left = round(X * im.width / 10230)
    crop = im.crop((left - W // 2, Y, left + W // 2, Y + H)).convert("RGB")
    crop = crop.resize((W * ZOOM, H * ZOOM), Image.NEAREST)
    d = ImageDraw.Draw(crop)
    d.line([(W, 0), (W, 24)], fill=(255, 0, 0), width=3)
    d.line([(W, H * ZOOM - 24), (W, H * ZOOM)], fill=(255, 0, 0), width=3)
    d.text((8, 8), label, fill=(255, 255, 0))
    tiles.append(crop)

gap = 14
out = Image.new("RGB", (sum(t.width for t in tiles) + gap * (len(tiles) - 1),
                        tiles[0].height), (30, 30, 30))
x = 0
for t in tiles:
    out.paste(t, (x, 0))
    x += t.width + gap
out.thumbnail((1600, 1600), Image.LANCZOS)
dst = r"D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\scripts\tests\_seam\hairline_compare.jpg"
out.save(dst, quality=92)
print("wrote", dst, out.size)
