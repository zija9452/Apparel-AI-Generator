"""Locate hairline "stitching" seams in a rendered panel JPEG.

A flattener seam is a ONE-pixel column (or row) whose colour differs from BOTH
neighbours in the same direction over a long run of the image. Real artwork
edges differ from one neighbour, not from both, so the double-sided test is
what separates a rendering artifact from a drawn line.

Usage: find_seam_lines.py <jpeg> [<jpeg> ...]
"""
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def scan(path):
    im = Image.open(path)
    mode, (w, h) = im.mode, im.size
    a = np.asarray(im.convert("RGB"), dtype=np.int16)
    print(f"\n=== {path}\n    mode={mode} size={w}x{h}")

    for axis, label in ((1, "COLUMN x"), (0, "ROW y")):
        # Bring the scanned axis to position 1 so the slicing below is shared.
        m = a if axis == 1 else np.transpose(a, (1, 0, 2))
        n = m.shape[1]
        left = np.abs(m[:, 1:-1, :] - m[:, :-2, :]).max(axis=2)
        right = np.abs(m[:, 1:-1, :] - m[:, 2:, :]).max(axis=2)
        # Differs from both sides IN THE SAME DIRECTION = a 1px spike, not an edge.
        sign_l = np.sign(m[:, 1:-1, :].sum(axis=2) - m[:, :-2, :].sum(axis=2))
        sign_r = np.sign(m[:, 1:-1, :].sum(axis=2) - m[:, 2:, :].sum(axis=2))
        spike = (left >= 6) & (right >= 6) & (sign_l == sign_r)
        score = spike.mean(axis=0)  # fraction of the line's length that spikes
        hits = np.argsort(score)[::-1][:6]
        print(f"    top {label} candidates (1 = spikes over full length):")
        for i in sorted(hits, key=lambda k: -score[k]):
            if score[i] < 0.02:
                continue
            idx = i + 1
            lo = m[:, idx - 1, :].mean(axis=0)
            mid = m[:, idx, :].mean(axis=0)
            hi = m[:, idx + 1, :].mean(axis=0)
            print(f"      {label}={idx:6d}  coverage={score[i]*100:5.1f}%  "
                  f"prev RGB={lo.round(1)}  line RGB={mid.round(1)}  next RGB={hi.round(1)}")


for p in sys.argv[1:]:
    scan(p)
