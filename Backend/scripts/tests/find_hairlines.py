"""Separate a real 1px HAIRLINE from an ordinary design edge.

find_seam_lines_big.py asked only "does this column differ from both
neighbours in the same direction", and a soft gradient or a JPEG block boundary
can satisfy that. It ranked ordinary artwork edges (prev 58 -> line 18 -> next
11, a monotonic step) alongside the genuine artifact.

A hairline has a shape an edge cannot fake:
  * the column differs from BOTH neighbours in the same direction, AND
  * the two neighbours closely RESEMBLE EACH OTHER - the image continues
    across as if the column were not there.
The second condition is what an edge fails: across an edge the left and right
neighbours are different colours.

Usage: find_hairlines.py <jpeg> [<jpeg> ...]
"""
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
STRIDE = 4          # subsample ALONG the line; a hairline runs for thousands of px
SPIKE = 12          # min |line - neighbour|, per channel, 0-255
FLAT = 8            # max |prev - next|: the image must continue across


def scan(path):
    im = Image.open(path)
    print(f"\n=== {path}   mode={im.mode} size={im.width}x{im.height}", flush=True)
    a = np.asarray(im.convert("RGB"), dtype=np.int16)

    for axis, label in ((1, "COLUMN x"), (0, "ROW y")):
        m = a if axis == 1 else np.transpose(a, (1, 0, 2))
        m = m[::STRIDE]
        prev, line, nxt = m[:, :-2, :], m[:, 1:-1, :], m[:, 2:, :]
        dl = line - prev
        dr = line - nxt
        spike = ((np.abs(dl).max(axis=2) >= SPIKE) &
                 (np.abs(dr).max(axis=2) >= SPIKE) &
                 (np.sign(dl.sum(axis=2)) == np.sign(dr.sum(axis=2))) &
                 (np.abs(prev - nxt).max(axis=2) <= FLAT))   # image continues across
        score = spike.mean(axis=0)
        top = [int(i) for i in np.argsort(score)[::-1][:8] if score[i] >= 0.05]
        if not top:
            print(f"    {label}: no hairline found (best coverage "
                  f"{score.max()*100:.1f}% < 5%)", flush=True)
        for i in top:
            idx = i + 1
            print(f"    {label}={idx:6d}  coverage={score[i]*100:5.1f}%"
                  f"  prev={prev[:, i, :].mean(axis=0).round(1)}"
                  f"  line={line[:, i, :].mean(axis=0).round(1)}"
                  f"  next={nxt[:, i, :].mean(axis=0).round(1)}", flush=True)
        del m, prev, line, nxt, dl, dr, spike
    del a


for p in sys.argv[1:]:
    scan(p)
