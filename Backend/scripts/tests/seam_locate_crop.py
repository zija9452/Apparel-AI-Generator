"""Find where the annotated crop sits inside the full-res export, then report
the seam's TRUE column in the big render.

The markup file turned out to be a 3034x3457 CROP at full resolution, not a
downscale - its aspect ratio only happens to match. Comparing column indices
between the two therefore needs a translation, not a resize, and the earlier
resize-based comparison answered the wrong question.

Offset is found by mean-subtracted FFT cross-correlation: the crop is the same
pixels re-encoded, so the peak is unambiguous.
"""
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

BIG = r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\production_ready_order_5XL-04.jpg"
SOFT = r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\5XL\5XL2.jpg"
ANN = r"E:\production_ready_order_5XL-04.jpg"
MARK_X = 1631          # seam column the user highlighted, in ANN's own pixels
STEP = 4               # correlate at quarter scale, then refine at full res


def gray(im, step):
    return np.asarray(im.convert("L").resize(
        (im.width // step, im.height // step), Image.BOX), dtype=np.float32)


ann_im = Image.open(ANN)
big_im = Image.open(BIG)

# Patch from ABOVE the yellow markup so the hand-drawn ink cannot bias the match.
patch = ann_im.crop((800, 0, 2200, 1400))
p = gray(patch, STEP)
g = gray(big_im, STEP)
p -= p.mean()
g -= g.mean()

fh, fw = g.shape
F = np.fft.rfft2(g)
P = np.fft.rfft2(p[::-1, ::-1], s=(fh, fw))
corr = np.fft.irfft2(F * P, s=(fh, fw))
peak = np.unravel_index(np.argmax(corr), corr.shape)
# irfft2 of a flipped template puts the match at (top+ph-1, left+pw-1).
dy = (peak[0] - p.shape[0] + 1) * STEP - 0
dx = (peak[1] - p.shape[1] + 1) * STEP - 800
print(f"coarse crop offset in big image: dx={dx}  dy={dy}")

# Refine +/-12px at full resolution by plain SSD on a small window.
pa = np.asarray(ann_im.crop((1000, 200, 1500, 700)).convert("L"), dtype=np.int32)
best = None
for oy in range(dy - 12, dy + 13):
    for ox in range(dx - 12, dx + 13):
        w = np.asarray(big_im.crop((1000 + ox, 200 + oy, 1500 + ox, 700 + oy)
                                   ).convert("L"), dtype=np.int32)
        d = np.abs(pa - w).mean()
        if best is None or d < best[0]:
            best = (d, ox, oy)
print(f"refined: dx={best[1]} dy={best[2]}  mean|diff|={best[0]:.2f}")

bx = MARK_X + best[1]
print(f"\nhighlighted seam ANN x={MARK_X}  ->  BIG x={bx}")

for label, path in (("manual CMYK", BIG), ("software RGB", SOFT)):
    im = Image.open(path)
    band = np.asarray(im.crop((bx - 6, 0, bx + 7, im.height)).convert("RGB"),
                      dtype=np.int16)
    print(f"\n  {label}: column profile around x={bx} (mean RGB down the panel)")
    for k in range(band.shape[1]):
        col = band[:, k, :].mean(axis=0).round(1)
        print(f"    x={bx - 6 + k:6d}  {col}" + ("   <-- highlighted" if k == 6 else ""))
