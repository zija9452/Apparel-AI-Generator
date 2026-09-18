"""Full side-by-side of two JPEGs: colour space, pixels, dpi and ink values.

Reports dpi from BOTH places it can live. Illustrator's CMYK JPEGs carry no
APP0/JFIF segment - JFIF is only defined for greyscale and YCbCr - and put the
resolution in the APP13 Photoshop ResolutionInfo block instead, which Pillow
does not read. Reading only Pillow's `dpi` makes a correct 300dpi file look
like it has none.

Pixel count is the honest measure of resolution: a 2455.25pt artboard is 10230px
at 300dpi whatever any header claims.

Usage: compare_two_jpegs.py <a.jpg> <b.jpg>
"""
import os
import struct
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

MARKERS = {0xE0: "APP0/JFIF", 0xE1: "APP1/Exif", 0xE2: "APP2/ICC",
           0xEC: "APP12/Ducky", 0xED: "APP13/Photoshop", 0xEE: "APP14/Adobe",
           0xDB: "DQT", 0xC0: "SOF0 baseline", 0xC2: "SOF2 progressive",
           0xC4: "DHT", 0xDA: "SOS", 0xFE: "COM"}


def segments(data):
    out, i = [], 2
    while i < len(data) - 1 and data[i] == 0xFF:
        m = data[i + 1]
        if m == 0xDA:
            out.append(MARKERS.get(m, f"0x{m:02X}"))
            break
        ln = struct.unpack(">H", data[i + 2:i + 4])[0]
        out.append(MARKERS.get(m, f"0x{m:02X}"))
        i += 2 + ln
    return out


def jfif_dpi(data):
    if data[2:4] == b"\xff\xe0" and data[6:11] == b"JFIF\x00":
        units, xd, yd = struct.unpack(">BHH", data[13:18])
        return f"{xd}x{yd} (units={units})"
    return None


def photoshop_dpi(data):
    i = 2
    while i < len(data) - 1 and data[i] == 0xFF:
        m = data[i + 1]
        if m == 0xDA:
            break
        ln = struct.unpack(">H", data[i + 2:i + 4])[0]
        body = data[i + 4:i + 2 + ln]
        if m == 0xED:
            j = body.find(b"Photoshop 3.0\x00")
            if j >= 0:
                k = j + 14
                while k + 12 <= len(body):
                    if body[k:k + 4] != b"8BIM":
                        break
                    rid = struct.unpack(">H", body[k + 4:k + 6])[0]
                    nlen = body[k + 6]
                    k2 = k + 7 + nlen
                    k2 += k2 % 2
                    size = struct.unpack(">I", body[k2:k2 + 4])[0]
                    pay = body[k2 + 4:k2 + 4 + size]
                    if rid == 0x03ED and len(pay) >= 16:
                        h = struct.unpack(">I", pay[0:4])[0] / 65536.0
                        v = struct.unpack(">I", pay[8:12])[0] / 65536.0
                        return f"{h:.0f}x{v:.0f}"
                    k = k2 + 4 + size + (size % 2)
        i += 2 + ln
    return None


A, B = sys.argv[1], sys.argv[2]
LABELS = ("SOFTWARE (script)", "MANUAL (by hand)")

rows = []
for path in (A, B):
    raw = open(path, "rb").read()
    im = Image.open(path)
    rows.append({
        "name": os.path.basename(path),
        "mode": im.mode,
        "size": f"{im.width}x{im.height}",
        "px": (im.width, im.height),
        "mb": os.path.getsize(path) / 1e6,
        "jfif": jfif_dpi(raw) or "-",
        "psd": photoshop_dpi(raw) or "-",
        "adobe": im.info.get("adobe"),
        "segs": ", ".join(segments(raw)),
    })

w = 34
print(f"{'':22}{LABELS[0]:<{w}}{LABELS[1]}")
print("-" * (22 + w + 30))
for key, label in (("name", "file"), ("mode", "COLOUR"), ("size", "PIXELS"),
                   ("mb", "file size MB"), ("jfif", "dpi (JFIF)"),
                   ("psd", "DPI (Photoshop blk)"), ("adobe", "Adobe marker")):
    a, b = rows[0][key], rows[1][key]
    if key == "mb":
        a, b = f"{a:.2f}", f"{b:.2f}"
    same = "" if str(a) == str(b) else "   <-- different"
    print(f"{label:22}{str(a):<{w}}{str(b)}{same}")
print(f"\n{'segments':22}{rows[0]['segs']}")
print(f"{'':22}{rows[1]['segs']}")

print(f"\ndpi implied by pixel count (Back panel artboard is 2455.25pt wide):")
for r, lab in zip(rows, LABELS):
    print(f"   {lab:22} {r['px'][0]} px / 2455.25pt * 72 = {r['px'][0] * 72 / 2455.25:.1f} dpi")

na = np.asarray(Image.open(A), dtype=np.int16)
nb = np.asarray(Image.open(B), dtype=np.int16)
print(f"\npixel comparison:")
if na.shape != nb.shape:
    print(f"   shapes differ: {na.shape} vs {nb.shape} - cannot compare directly")
else:
    d = np.abs(na - nb)
    n = na.shape[0] * na.shape[1]
    print(f"   mean |difference| = {d.mean():.6f}   max = {d.max()}")
    print(f"   pixels that differ at all = {(d.max(axis=2) > 0).sum():,} of {n:,}")
    print(f"\n   VERDICT: {'IDENTICAL - not one pixel differs' if d.max() == 0 else 'files differ'}")
