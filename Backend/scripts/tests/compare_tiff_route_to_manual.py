"""Is the TIFF-route JPEG the same output as the operator's manual export?

"Same output" is the acceptance bar, so measure it rather than assert it. Both
files come from the same Illustrator rasteriser at 300dpi CMYK; only the JPEG
encoder differs (Pillow vs Illustrator), so ink values should agree to within
JPEG noise even though the bytes cannot match.

The two renders differ by one pixel in each dimension (Illustrator rounds the
artboard differently for TIFF than for JPEG), so the comparison runs over the
overlapping area - a whole-image diff would be meaningless if one image were
shifted, and this checks for that shift explicitly before trusting the numbers.
"""
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

MINE = r"E:\seam_test\tiff_batch\batch_5XL Front_Item1.jpg"
MANUAL = r"C:\Production\CMYK_EXPORTING_TESTING\CMYK_EXPORTING_TESTING\MANUALLLL_5XL Front_Item1.jpg"

a_im, b_im = Image.open(MINE), Image.open(MANUAL)
print(f"TIFF route : {a_im.mode} {a_im.width}x{a_im.height}")
print(f"manual     : {b_im.mode} {b_im.width}x{b_im.height}")

a = np.asarray(a_im, dtype=np.int16)
b = np.asarray(b_im, dtype=np.int16)
h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1])

# Confirm the two are aligned before believing any difference number: try a few
# offsets and keep the best. A real misalignment would dwarf compression noise.
best = None
for dy in (-1, 0, 1):
    for dx in (-1, 0, 1):
        ay0, by0 = max(0, dy), max(0, -dy)
        ax0, bx0 = max(0, dx), max(0, -dx)
        n, m = h - abs(dy), w - abs(dx)
        d = np.abs(a[ay0:ay0 + n:8, ax0:ax0 + m:8, :] -
                   b[by0:by0 + n:8, bx0:bx0 + m:8, :]).mean()
        if best is None or d < best[0]:
            best = (d, dy, dx)
print(f"\nbest alignment: dy={best[1]} dx={best[2]}  (mean|diff| {best[0]:.2f})")

dy, dx = best[1], best[2]
ay0, by0 = max(0, dy), max(0, -dy)
ax0, bx0 = max(0, dx), max(0, -dx)
n, m = h - abs(dy), w - abs(dx)
A = a[ay0:ay0 + n, ax0:ax0 + m, :]
B = b[by0:by0 + n, bx0:bx0 + m, :]
d = np.abs(A - B)

print(f"\ncompared area: {m}x{n}, all 4 ink channels")
print(f"  mean |difference| = {d.mean():.3f}  (out of 255)")
print(f"  95th percentile   = {np.percentile(d, 95):.0f}")
print(f"  99th percentile   = {np.percentile(d, 99):.0f}")
print(f"  max               = {d.max()}")
print(f"  per channel C,M,Y,K mean = {d.reshape(-1, 4).mean(axis=0).round(2)}")
within = (d.max(axis=2) <= 3).mean() * 100
print(f"  pixels within 3/255 on every channel = {within:.1f}%")

print("\n  reference: two JPEGs of the SAME image at different quality settings")
print("  typically differ by 1-3 mean. A colour-space or rasteriser difference")
print("  would read in the tens.")
