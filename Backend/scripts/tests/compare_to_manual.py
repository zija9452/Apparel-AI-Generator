"""Does the scripted Action export equal the operator's manual export?

The manual file is the acceptance standard - it is the one that has been
printed from. "Looks the same" is not enough here: a CMYK JPEG written with the
wrong Adobe convention still opens, still reports mode CMYK, and still prints
wrong. So compare every pixel, and list the JPEG segments on both sides, since
that is where a dpi or profile regression would hide.
"""
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

MANUAL = r"E:\seam_test\mANUAL 5XL BACK EXPORT.jpg"
ACTION = r"E:\seam_test\ACT_cmyk_5XL Back_Item1.jpg"
OLD_RGB = r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\5XL\5XL2.jpg"

MARKERS = {0xE0: "APP0/JFIF (dpi lives here)", 0xE1: "APP1/Exif", 0xE2: "APP2/ICC",
           0xEE: "APP14/Adobe (CMYK convention)", 0xDB: "DQT quality tables",
           0xC0: "SOF0 baseline", 0xC2: "SOF2 progressive", 0xC4: "DHT", 0xDA: "SOS"}


def segments(path):
    out, data, i = [], open(path, "rb").read(), 2
    while i < len(data) - 1 and data[i] == 0xFF:
        m = data[i + 1]
        if m == 0xDA:
            out.append(MARKERS.get(m, f"0x{m:02X}"))
            break
        ln = int.from_bytes(data[i + 2:i + 4], "big")
        out.append(MARKERS.get(m, f"0x{m:02X}"))
        i += 2 + ln
    return out


print("=" * 72)
for label, p in (("MANUAL (aapki)", MANUAL), ("ACTION (code se)", ACTION), ("OLD scripted", OLD_RGB)):
    im = Image.open(p)
    print(f"{label:18} mode={im.mode:5} size={im.width}x{im.height} "
          f"dpi={im.info.get('dpi')} adobe={im.info.get('adobe')}")
    print(f"{'':18} segments: {', '.join(segments(p))}")
print("=" * 72)

a = np.asarray(Image.open(MANUAL), dtype=np.int16)
b = np.asarray(Image.open(ACTION), dtype=np.int16)
print(f"\nshapes: manual {a.shape}  action {b.shape}  -> "
      f"{'SAME' if a.shape == b.shape else 'DIFFERENT'}")
if a.shape == b.shape:
    d = np.abs(a - b)
    print(f"pixel difference over ALL {a.shape[0] * a.shape[1]:,} pixels x 4 channels:")
    print(f"   mean = {d.mean():.6f}")
    print(f"   max  = {d.max()}")
    print(f"   pixels that differ at all = {(d.max(axis=2) > 0).sum():,}")
    print("\n   VERDICT:", "IDENTICAL - code output == manual output"
          if d.max() == 0 else "DIFFERS")
