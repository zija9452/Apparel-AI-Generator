"""Diff two Illustrator prefs files by KEY PATH, not by line.

Illustrator rewrites the whole file on quit and reorders blocks, so `diff` on
the raw text is useless - it reports the entire file. What matters is which
key's VALUE changed, and a key is only meaningful with its block path, because
names repeat: /plugin/TIFFFileFormat/ColorModel and
/plugin/JPEGFormat/ColorModel are different settings with the same leaf name,
and confusing them already cost one wasted test.

Usage: diff_ai_prefs.py <old> <new> [filter-substring]
"""
import re
import sys


def parse(path):
    """Walk the brace structure and return {full/key/path: value}."""
    out, stack = {}, []
    for raw in open(path, encoding="utf-8", errors="replace"):
        line = raw.strip()
        if not line:
            continue
        if line.endswith("{"):
            name = line[:-1].strip()
            stack.append(name[1:] if name.startswith("/") else name)
            continue
        if line == "}":
            if stack:
                stack.pop()
            continue
        m = re.match(r"^/(\S+)\s+(.*)$", line)
        if m:
            out["/".join(stack + [m.group(1)])] = m.group(2)
    return out


old, new = parse(sys.argv[1]), parse(sys.argv[2])
filt = sys.argv[3] if len(sys.argv) > 3 else ""

changed = [(k, old[k], new[k]) for k in old
           if k in new and old[k] != new[k] and filt.lower() in k.lower()]
added = [k for k in new if k not in old and filt.lower() in k.lower()]
removed = [k for k in old if k not in new and filt.lower() in k.lower()]

print(f"old: {len(old)} keys   new: {len(new)} keys"
      + (f"   filter={filt!r}" if filt else ""))
print(f"\nCHANGED ({len(changed)}):")
for k, a, b in sorted(changed):
    if len(a) > 60 or len(b) > 60:      # skip the giant hex blobs
        continue
    print(f"  {k}\n      {a}  ->  {b}")
if added:
    print(f"\nONLY IN NEW ({len(added)}):")
    for k in sorted(added)[:40]:
        print(f"  {k} = {new[k][:60]}")
if removed:
    print(f"\nONLY IN OLD ({len(removed)}):")
    for k in sorted(removed)[:40]:
        print(f"  {k} = {old[k][:60]}")
