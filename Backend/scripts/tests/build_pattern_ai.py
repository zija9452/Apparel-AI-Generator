"""Builds two REAL .ai pattern files in Illustrator, then proves the lookup.

Deliberately, only SOME panels carry the canonical "W-M Front" spelling. The rest
are named the way a designer who has never read the docs would name them -
"Women Large Front", "Womens Youth Medium Back", "Adult Women 2XL Front" - so the
alias chain is what has to find them, not luck.

Safety: Illustrator was not running, so this launches it, creates only NEW
documents, saves them, closes only its own, and leaves the application up. It
never touches a document it did not create.
"""
import os
import sys

import pythoncom
import win32com.client

HERE = os.path.dirname(os.path.abspath(__file__))
ADULT = os.path.join(HERE, "TEST_Pattern_Adult.ai")
YOUTH = os.path.join(HERE, "TEST_Pattern_Youth.ai")

# (group name, what it really is) - the spelling is the point of the test.
ADULT_PANELS = [
    ("W-XS Front", "canonical"),
    ("W-XS Back", "canonical"),
    ("W-XS Short Sleeve", "canonical"),
    ("W-M Front", "canonical"),
    ("W-M Back", "canonical"),
    ("W-M SS", "part abbreviation"),
    ("Women Large Front", "size spelled out"),
    ("Womens Large Back", "size spelled out, plural"),
    ("W Large Short Sleeve", "W + spelled-out word"),
    ("Adult Women 2XL Front", "age word FIRST"),
    ("Women Adult XXL Back", "age word second, XXL for 2XL"),
    ("W-2XL Short Sleeve", "canonical"),
    ("Large Front", "a plain adult size, unchanged"),
    ("Large Back", "a plain adult size, unchanged"),
]
YOUTH_PANELS = [
    ("W-YXXS Front", "canonical, no plain-youth counterpart"),
    ("W-YXXS Back", "canonical"),
    ("Youth Women Small Front", "age word first, spelled out"),
    ("W-YS Back", "canonical"),
    ("Womens Youth Medium Front", "plural + age word + spelled out"),
    ("W-YM Back", "canonical"),
    ("Women Youth Large Front", "age word second, spelled out"),
    ("W-YL Back", "canonical"),
    ("YXS Front", "a plain youth size, unchanged"),
    ("YXS Back", "a plain youth size, unchanged"),
]


def jsx_for(panels, path, title):
    """A pattern piece is a named group holding an outline path and a size tag -
    the same shape findPlacementPath and renameSizeTags expect."""
    out = [
        'var doc = app.documents.add(DocumentColorSpace.CMYK, 1200, 1600);',
        'doc.rulerOrigin = [0, 0];',
        'var made = [];',
    ]
    for i, (name, _why) in enumerate(panels):
        col, row = i % 4, i // 4
        x, y = 40 + col * 280, 1520 - row * 380
        size_word = name.rsplit(" ", 1)[0] if " " in name else name
        out += [
            f'var g{i} = doc.groupItems.add();',
            f'g{i}.name = {name!r};',
            f'var p{i} = doc.pathItems.rectangle({y}, {x}, 230, 320);',
            f'p{i}.filled = false; p{i}.stroked = true; p{i}.strokeWidth = 3;',
            f'p{i}.name = "outline";',
            f'p{i}.moveToBeginning(g{i});',
            f'var t{i} = doc.textFrames.add();',
            f't{i}.contents = {size_word!r};',
            f't{i}.top = {y - 20}; t{i}.left = {x + 12};',
            f't{i}.textRange.characterAttributes.size = 18;',
            f't{i}.moveToBeginning(g{i});',
            f'made.push(g{i}.name);',
        ]
    out += [
        f'var f = new File({path.replace(os.sep, "/")!r});',
        'doc.saveAs(f, new IllustratorSaveOptions());',
        'var n = made.length;',
        'doc.close(SaveOptions.SAVECHANGES);',
        f'"{title}: " + n + " groups saved";',
    ]
    # DoJavaScript reports any throw as a bare "The server threw an exception",
    # which says nothing about WHICH line. Catch it inside and hand the message
    # back as the return value instead.
    return ("try {\n" + "\n".join(out) + "\n} catch (e) { "
            '"JSX ERROR: " + e.message + " (line " + e.line + ")"; }')


pythoncom.CoInitialize()
prog_ids = ["Illustrator.Application.CC.2015", "Illustrator.Application"]
app = None
for pid in prog_ids:
    try:
        app = win32com.client.GetActiveObject(pid)
        print(f"reusing a running Illustrator ({pid})")
        break
    except Exception:
        pass
if app is None:
    for pid in prog_ids:
        try:
            app = win32com.client.Dispatch(pid)
            print(f"launched Illustrator ({pid})")
            break
        except Exception as e:
            last = e
    if app is None:
        print(f"could not start Illustrator: {last}")
        sys.exit(2)

open_before = 0
try:
    open_before = app.Documents.Count
except Exception:
    pass
print(f"documents already open before this script: {open_before} "
      f"(none of them are touched)")

for panels, path, title in ((ADULT_PANELS, ADULT, "adult"), (YOUTH_PANELS, YOUTH, "youth")):
    if os.path.exists(path):
        os.remove(path)
    print("  " + str(app.DoJavaScript(jsx_for(panels, path, title))))

print("\nwrote:")
for p in (ADULT, YOUTH):
    print(f"  {p}  ({os.path.getsize(p):,} bytes)")
