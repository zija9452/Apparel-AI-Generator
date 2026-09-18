"""Pick the JPEG settings that land closest to the operator's manual export.

The TIFF holds Illustrator's own 300dpi CMYK raster, so the only remaining
difference is how the JPEG is encoded. Two knobs matter:

  quality      - Illustrator's dialog slider is 0-10 and does not map linearly
                 onto Pillow's 0-100, so find the match by measurement.
  subsampling  - Pillow averages the colour channels by default (4:2:0), which
                 softens edges. For print line art and text that is a real
                 loss, so 4:4:4 (subsampling=0) is tested alongside it.

Measures file size AND ink difference against the manual file. Smaller is not
better here: the target is "same as manual", and a file that is larger because
it threw away LESS is a better print file, so both numbers are reported rather
than collapsed into one score.
"""
import os
import time

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

TIF = r"E:\seam_test\tiff_batch\batch_5XL Front_Item1.tif"
MANUAL = r"C:\Production\CMYK_EXPORTING_TESTING\CMYK_EXPORTING_TESTING\MANUALLLL_5XL Front_Item1.jpg"
OUT = r"E:\seam_test\tune"
os.makedirs(OUT, exist_ok=True)

print("loading Illustrator's CMYK raster...")
tif = Image.open(TIF)
tif.load()
man = np.asarray(Image.open(MANUAL), dtype=np.int16)
print(f"manual reference: {os.path.getsize(MANUAL)/1e6:.2f}MB  {man.shape[1]}x{man.shape[0]}")

print(f"\n{'setting':28} {'size':>9} {'vs manual':>10} {'p99':>5} {'save':>6}")
print("-" * 64)
for quality in (40, 50, 60, 70):
    for sub, subname in ((0, "4:4:4"), (2, "4:2:0")):
        dst = os.path.join(OUT, f"q{quality}_{subname.replace(':', '')}.jpg")
        t0 = time.time()
        tif.save(dst, "JPEG", quality=quality, subsampling=sub,
                 dpi=(300, 300), progressive=False)
        secs = time.time() - t0
        a = np.asarray(Image.open(dst), dtype=np.int16)
        h, w = min(a.shape[0], man.shape[0]), min(a.shape[1], man.shape[1])
        d = np.abs(a[:h:4, :w:4, :] - man[:h:4, :w:4, :])
        print(f"quality={quality:<3} {subname:8}{'':10} {os.path.getsize(dst)/1e6:7.2f}MB "
              f"{d.mean():10.3f} {np.percentile(d, 99):5.0f} {secs:5.0f}s")

print(f"\nmanual file itself: {os.path.getsize(MANUAL)/1e6:.2f}MB")
print("Lower 'vs manual' = closer to what the operator prints today.")
print("4:4:4 keeps colour detail at full resolution; 4:2:0 halves it.")
