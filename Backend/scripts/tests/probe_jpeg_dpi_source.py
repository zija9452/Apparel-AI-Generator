"""Where does the dpi live in each JPEG flavour?

The shipped RGB renders carry dpi in an APP0/JFIF segment, which
_stamp_jpeg_dpi() patches in place. The Action/manual CMYK files have NO APP0 -
Pillow reports dpi=None - so that stamping step would silently skip them and
the renders would go out with no resolution tag, which is exactly the 72-vs-300
placement bug that function exists to prevent.

Before "fixing" that, check the APP13 Photoshop resource block (8BIM id 0x03ED,
ResolutionInfo), because Photoshop-written JPEGs normally carry dpi there and
Pillow simply does not read it.
"""
import struct

FILES = {
    "MANUAL (aapki)": r"E:\seam_test\mANUAL 5XL BACK EXPORT.jpg",
    "ACTION (code se)": r"E:\seam_test\ACT_cmyk_5XL Back_Item1.jpg",
    "OLD scripted RGB": r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\5XL\5XL2.jpg",
}


def app13_resolution(data):
    """Find 8BIM resource 0x03ED and decode its two 16.16 fixed-point dpi values."""
    i = 2
    while i < len(data) - 1 and data[i] == 0xFF:
        m = data[i + 1]
        if m == 0xDA:
            break
        ln = struct.unpack(">H", data[i + 2:i + 4])[0]
        body = data[i + 4:i + 2 + ln]
        if m == 0xED:                                   # APP13 = Photoshop
            j = body.find(b"Photoshop 3.0\x00")
            if j >= 0:
                k = j + 14
                while k + 12 <= len(body):
                    if body[k:k + 4] != b"8BIM":
                        break
                    rid = struct.unpack(">H", body[k + 4:k + 6])[0]
                    nlen = body[k + 6]
                    k2 = k + 7 + nlen
                    k2 += k2 % 2                        # pascal name padded to even
                    size = struct.unpack(">I", body[k2:k2 + 4])[0]
                    payload = body[k2 + 4:k2 + 4 + size]
                    if rid == 0x03ED and len(payload) >= 16:
                        hres = struct.unpack(">I", payload[0:4])[0] / 65536.0
                        vres = struct.unpack(">I", payload[8:12])[0] / 65536.0
                        return hres, vres
                    k = k2 + 4 + size + (size % 2)
        i += 2 + ln
    return None


def app0_jfif(data):
    if data[2:4] == b"\xff\xe0" and data[6:11] == b"JFIF\x00":
        units, xd, yd = struct.unpack(">BHH", data[13:18])
        return units, xd, yd
    return None


for label, path in FILES.items():
    raw = open(path, "rb").read(200000)
    print(f"{label:20} APP0/JFIF = {app0_jfif(raw)}   "
          f"APP13 Photoshop ResolutionInfo = {app13_resolution(raw)}")
