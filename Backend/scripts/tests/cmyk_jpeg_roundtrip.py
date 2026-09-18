"""Can Pillow turn the CMYK TIFF into a CMYK JPEG that matches a manual export?

Adobe writes CMYK JPEGs with INVERTED samples plus an APP14 "Adobe" marker, and
readers key off that marker. Get the convention wrong and the file still opens,
still reports mode CMYK, and prints as a negative - a failure that looks like
success until it is on fabric. So this compares actual ink numbers against the
manual export, which is known-good because the operator has printed from it.

Checks, in order:
  1. TIFF -> JPEG (CMYK) conversion time and size
  2. re-read the JPEG: mode, Adobe marker present
  3. same pixel, three files: TIFF, new JPEG, manual export - inks must agree
"""
import time

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

TIF = r"E:\seam_test\C_tiff_cmyk_aa_on_5XL Back_Item1.tif"
OUT = r"E:\seam_test\C_from_tiff.jpg"
MANUAL = r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\production_ready_order_5XL-04.jpg"

t0 = time.time()
tif = Image.open(TIF)
tif.load()
t_load = time.time() - t0
print(f"1. TIFF loaded  mode={tif.mode} size={tif.size}  {t_load:.0f}s")

t0 = time.time()
# quality/subsampling chosen to match the shipped JPEG settings, not the default
tif.save(OUT, "JPEG", quality=50, dpi=(300, 300), progressive=False)
t_save = time.time() - t0
import os
print(f"   TIFF -> CMYK JPEG  {t_save:.0f}s  "
      f"{os.path.getsize(OUT)/1e6:.1f}MB  (total {t_load + t_save:.0f}s)")

jp = Image.open(OUT)
print(f"\n2. re-read: mode={jp.mode} size={jp.size} dpi={jp.info.get('dpi')} "
      f"adobe_marker={jp.info.get('adobe')}")

man = Image.open(MANUAL)
print(f"   manual   : mode={man.mode} size={man.size} adobe_marker={man.info.get('adobe')}")

print("\n3. ink comparison (C,M,Y,K as each library reports it)")
print(f"   {'x,y':>14}  {'TIFF':>18} {'new JPEG':>18} {'manual':>18}")
for (x, y) in [(2000, 3000), (5228, 7000), (5229, 7000), (7000, 8500), (9000, 2000)]:
    a = tif.getpixel((x, y))
    b = jp.getpixel((x, y))
    c = man.getpixel((min(x, man.width - 1), y))
    print(f"   {x},{y:>8}  {str(a):>18} {str(b):>18} {str(c):>18}")

# Whole-image agreement between the TIFF and the JPEG made from it.
ta = np.asarray(tif, dtype=np.int16)[::16]
ja = np.asarray(jp, dtype=np.int16)[::16]
n = min(ta.shape[1], ja.shape[1])
diff = np.abs(ta[:, :n, :] - ja[:, :n, :])
print(f"\n   TIFF vs new JPEG: mean|diff|={diff.mean():.2f}  max={diff.max()}  "
      f"(JPEG q50 loss only - a convention mismatch would read ~255)")
