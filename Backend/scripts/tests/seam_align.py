"""Put the annotated screenshot and the full-res export on the SAME x axis.

The markup file is a ~30% downscale of the 10230px export, so a column index
from one cannot be compared with the other directly. Downscaling the big render
to the markup's exact width makes both indices mean the same thing, and then the
seam either lines up with the highlighted column or it does not.

Usage: seam_align.py <reference-width-jpeg> <big-jpeg> [<big-jpeg> ...]
"""
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def column_score(a):
    """Fraction of each column's length that is a 1px spike vs BOTH neighbours."""
    left = np.abs(a[:, 1:-1, :] - a[:, :-2, :]).max(axis=2)
    right = np.abs(a[:, 1:-1, :] - a[:, 2:, :]).max(axis=2)
    sl = np.sign(a[:, 1:-1, :].sum(axis=2) - a[:, :-2, :].sum(axis=2))
    sr = np.sign(a[:, 1:-1, :].sum(axis=2) - a[:, 2:, :].sum(axis=2))
    return ((left >= 6) & (right >= 6) & (sl == sr)).mean(axis=0)


ref = Image.open(sys.argv[1])
W, H = ref.size
print(f"reference grid: {sys.argv[1]}  {W}x{H}")
s = column_score(np.asarray(ref.convert("RGB"), dtype=np.int16))
top = [int(i) + 1 for i in np.argsort(s)[::-1][:40] if s[i] > 0.05]
print("  markup seam columns:", sorted(top)[:20], f"(best x={int(np.argmax(s))+1})")

for path in sys.argv[2:]:
    im = Image.open(path)
    ow, oh = im.size
    # NEAREST, not a smoothing filter: a box/bicubic resample averages a 1px
    # seam into its neighbours and can erase the very thing being measured.
    small = im.convert("RGB").resize((W, H), Image.NEAREST)
    s2 = column_score(np.asarray(small, dtype=np.int16))
    print(f"\n{path}  {ow}x{oh} -> {W}x{H}")
    for i in np.argsort(s2)[::-1][:10]:
        if s2[i] < 0.05:
            continue
        x = int(i) + 1
        print(f"  x={x:5d} (orig x~{round(x * ow / W):6d})  coverage={s2[i]*100:5.1f}%"
              f"   markup coverage here={s[i]*100:5.1f}%")
