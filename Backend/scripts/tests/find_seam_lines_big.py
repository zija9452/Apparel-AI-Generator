"""Same 1px-spike seam scan as find_seam_lines.py, sized for a 300dpi panel.

A 10230x11658 render is ~119 Mpix, so the full RGB array is too large to hold
three copies of. The seam is one pixel wide ALONG the scanned axis but runs for
thousands of pixels across it, so subsampling the perpendicular axis (every
STRIDE-th line) keeps every seam visible at an eighth of the memory.

Usage: find_seam_lines_big.py <jpeg> [<jpeg> ...]
"""
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
STRIDE = 8


def scan(path):
    im = Image.open(path)
    mode, (w, h) = im.mode, im.size
    print(f"\n=== {path}\n    mode={mode} size={w}x{h}", flush=True)
    a = np.asarray(im.convert("RGB"), dtype=np.int16)

    for axis, label in ((1, "COLUMN x"), (0, "ROW y")):
        m = a if axis == 1 else np.transpose(a, (1, 0, 2))
        m = m[::STRIDE]                      # subsample ACROSS the seam's length
        left = np.abs(m[:, 1:-1, :] - m[:, :-2, :]).max(axis=2)
        right = np.abs(m[:, 1:-1, :] - m[:, 2:, :]).max(axis=2)
        sign_l = np.sign(m[:, 1:-1, :].sum(axis=2) - m[:, :-2, :].sum(axis=2))
        sign_r = np.sign(m[:, 1:-1, :].sum(axis=2) - m[:, 2:, :].sum(axis=2))
        spike = (left >= 6) & (right >= 6) & (sign_l == sign_r)
        score = spike.mean(axis=0)
        for i in np.argsort(score)[::-1][:8]:
            if score[i] < 0.03:
                continue
            idx = int(i) + 1
            lo = m[:, idx - 1, :].mean(axis=0).round(1)
            mid = m[:, idx, :].mean(axis=0).round(1)
            hi = m[:, idx + 1, :].mean(axis=0).round(1)
            print(f"    {label}={idx:6d}  coverage={score[i]*100:5.1f}%  "
                  f"prev={lo} line={mid} next={hi}", flush=True)
        del m, left, right, sign_l, sign_r, spike
    del a


for p in sys.argv[1:]:
    scan(p)
