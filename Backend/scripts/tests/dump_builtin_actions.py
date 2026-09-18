"""Read the action definitions Illustrator itself stored in its prefs.

The prefs file carries the Actions palette contents, and a diff of it earlier
showed hex strings that are plainly JPEG Options dialog values - "JPEG", "RGB",
"Screen", "Art Optimized". Those are the dialog's own vocabulary, and they are
stored as STRINGS, not inside the 100-byte raw blob this investigation has been
sending.

That matters: every attempt so far encoded the settings the way
nathandietz/ExportDocAsJPEG does, as `/parameter-1 /type (raw)`. If Illustrator
writes them as named ustring parameters instead, the raw blob was never the
right shape for this version and would be ignored exactly as observed.

This dumps any action event that mentions JPEG or an export, with its full
parameter list decoded, so the format can be copied rather than guessed.
"""
import re
import sys

PREFS = (sys.argv[1] if len(sys.argv) > 1 else
         r"C:\Users\scb\AppData\Roaming\Adobe\Adobe Illustrator 19 Settings\en_US\x64\Adobe Illustrator Prefs")

txt = open(PREFS, encoding="utf-8", errors="replace").read()


def unhex(h):
    h = re.sub(r"\s+", "", h)
    try:
        b = bytes.fromhex(h)
    except ValueError:
        return None
    # Action strings are ASCII or UTF-16LE depending on the field.
    try:
        s = b.decode("utf-8")
        if all(31 < ord(c) < 127 or c in "\t" for c in s):
            return s
    except UnicodeDecodeError:
        pass
    try:
        s = b.decode("utf-16-le")
        if all(31 < ord(c) < 127 for c in s):
            return s
    except UnicodeDecodeError:
        pass
    return None


# Every /internalName (...) in the file tells us what events are recorded.
names = re.findall(r"/internalName \(([^)]*)\)", txt)
print(f"recorded event internalNames ({len(names)} total, unique below):")
for n in sorted(set(names)):
    print(f"   {n}   x{names.count(n)}")

print("\n--- decoded string values that look like dialog vocabulary ---")
wanted = {"jpeg", "rgb", "cmyk", "grayscale", "screen", "medium", "high",
          "art optimized", "type optimized", "none", "baseline",
          "standard", "optimized", "progressive"}
seen = {}
for h in set(re.findall(r"^\s*([0-9a-f]{6,})\s*$", txt, re.M)):
    s = unhex(h)
    if s and s.strip().lower() in wanted:
        seen.setdefault(s.strip(), h)
for s, h in sorted(seen.items()):
    print(f"   {s!r:20} = {h}")

print("\n--- any event whose parameters mention JPEG ---")
for m in re.finditer(r"/event-\d+ \{", txt):
    start = m.start()
    depth, i = 0, txt.index("{", start)
    while i < len(txt):
        if txt[i] == "{":
            depth += 1
        elif txt[i] == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    block = txt[start:i + 1]
    if "4a504547" not in block.lower() and "jpeg" not in block.lower():
        continue
    iname = re.search(r"/internalName \(([^)]*)\)", block)
    print(f"\n=== event internalName={iname.group(1) if iname else '?'} "
          f"({len(block)} chars) ===")
    for pm in re.finditer(r"/parameter-(\d+) \{(.*?)\n\t*\}", block, re.S):
        body = pm.group(2)
        key = re.search(r"/key (\d+)", body)
        typ = re.search(r"/type \((\w+)\)", body)
        val = re.search(r"/value\s*(.*?)\s*$", body, re.S)
        v = (val.group(1).strip() if val else "")[:160].replace("\n", " ")
        dec = ""
        hx = re.findall(r"\b([0-9a-f]{6,})\b", v)
        if hx:
            d = unhex(hx[0])
            if d:
                dec = f"   -> {d!r}"
        print(f"   param-{pm.group(1)} key={key.group(1) if key else '?':<12} "
              f"type={typ.group(1) if typ else '?':<8} {v}{dec}")
