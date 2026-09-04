import win32com.client
import pythoncom
import os
import json
import re
import shutil
import logging
import ctypes
import winreg
import struct
import subprocess
import threading
import time

logger = logging.getLogger("illustrator-automation")

# Watchdog: agar status.json itni der tak update na ho to job stuck hai
# (user-approved: 20 min; pehli item index-build ke liye kaafi gunjaish).
WATCHDOG_STALE_SECONDS = 1200


def _kill_illustrator_process():
    """Force-kills Illustrator so the blocking DoJavaScript COM call returns.

    DoJavaScript holds this thread until the JSX finishes; a stuck script
    would otherwise hang the job forever."""
    try:
        subprocess.run(["taskkill", "/IM", "Illustrator.exe", "/F"],
                       capture_output=True, timeout=30)
        logger.error("Watchdog: Illustrator.exe force-killed")
    except Exception as e:
        logger.error(f"Watchdog: could not kill Illustrator: {e}")

# Print resolution of the JPEG renders. Must stay in sync with EXPORT_SCALE_PCT
# in scripts/automate_production.jsx, which scales the Illustrator export to it.
EXPORT_DPI = 300


def _stamp_jpeg_dpi(render_dir, dpi=EXPORT_DPI):
    """Writes the real dpi into every render's JFIF header.

    The JSX exports at `dpi` worth of pixels, but Illustrator leaves the JFIF
    density unit at 0 - "no units, aspect ratio only" - so nothing downstream
    knows the scale: Windows shows its 96 dpi default and print software falls
    back to 72, placing a 300 ppi render at ~4x its real physical size. This
    patches the 5 density bytes only; the compressed pixels and the CMYK
    profile are untouched (re-saving through an image library would recompress
    and could convert the color space).

    Walks sub-folders too: renders are filed one folder per size (S/, M/, L/,
    ...), only the Universal accessories sit in the render root.

    Returns the number of files stamped."""
    patched = 0
    for folder, _dirs, files in os.walk(render_dir):
        for name in sorted(files):
            if not name.lower().endswith((".jpg", ".jpeg")):
                continue
            try:
                with open(os.path.join(folder, name), "r+b") as f:
                    head = f.read(18)
                    # SOI + APP0 + "JFIF\0"; density = units(1) + Xdens(2) + Ydens(2)
                    # starting at byte 13.
                    if (len(head) < 18 or head[:4] != b"\xff\xd8\xff\xe0"
                            or head[6:11] != b"JFIF\x00"):
                        logger.warning(f"{name}: no JFIF header, dpi left as exported")
                        continue
                    f.seek(13)
                    f.write(struct.pack(">BHH", 1, dpi, dpi))  # 1 = dots per inch
                patched += 1
            except Exception as e:
                logger.warning(f"Could not stamp dpi on {name}: {e}")
    logger.info(f"Stamped {dpi} dpi on {patched} render(s)")
    return patched


FONT_EXTENSIONS = (".ttf", ".otf", ".ttc")
USER_FONTS_DIR = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts")
FONTS_REG_PATH = r"Software\Microsoft\Windows NT\CurrentVersion\Fonts"

def _broadcast_font_change():
    """Notify running applications that the font list has changed."""
    HWND_BROADCAST = 0xFFFF
    WM_FONTCHANGE = 0x001D
    SMTO_ABORTIFHUNG = 0x0002
    ctypes.windll.user32.SendMessageTimeoutW(
        HWND_BROADCAST, WM_FONTCHANGE, 0, 0, SMTO_ABORTIFHUNG, 1000, None
    )

def _read_font_names(path):
    """Parses the 'name' table of a TTF/OTF/TTC file and returns the font's
    full names (casefolded). Used to detect fonts already installed under a
    different filename. Returns an empty set if parsing fails."""
    full_names = set()
    family_names = set()
    try:
        with open(path, "rb") as f:
            data = f.read()
        offsets = [0]
        if data[:4] == b"ttcf":
            num_fonts = struct.unpack(">I", data[8:12])[0]
            offsets = [struct.unpack(">I", data[12 + 4 * i:16 + 4 * i])[0] for i in range(num_fonts)]
        for off in offsets:
            num_tables = struct.unpack(">H", data[off + 4:off + 6])[0]
            for i in range(num_tables):
                rec = off + 12 + 16 * i
                if data[rec:rec + 4] != b"name":
                    continue
                t_off = struct.unpack(">I", data[rec + 8:rec + 12])[0]
                count, str_off = struct.unpack(">HH", data[t_off + 2:t_off + 6])
                storage = t_off + str_off
                for j in range(count):
                    nrec = t_off + 6 + 12 * j
                    pid, eid, lid, nid, length, noff = struct.unpack(">6H", data[nrec:nrec + 12])
                    if nid not in (1, 4, 16):
                        continue
                    raw = data[storage + noff:storage + noff + length]
                    if pid in (0, 3):
                        val = raw.decode("utf-16-be", "ignore").strip()
                    else:
                        val = raw.decode("latin-1", "ignore").strip()
                    if not val:
                        continue
                    if nid == 4:
                        full_names.add(val.casefold())
                    else:
                        family_names.add(val.casefold())
                break
    except Exception as e:
        logger.warning(f"Could not parse font names from '{os.path.basename(path)}': {e}")
    # Full name (e.g. 'Arial Bold') is precise; family alone ('Arial') could
    # wrongly match a different style, so only use it as a last resort.
    return full_names or family_names

def _get_installed_font_names():
    """Returns casefolded display names of all fonts registered with Windows
    (system-wide HKLM and per-user HKCU)."""
    installed = set()
    for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            with winreg.OpenKey(hive, FONTS_REG_PATH) as key:
                i = 0
                while True:
                    try:
                        name, _, _ = winreg.EnumValue(key, i)
                    except OSError:
                        break
                    i += 1
                    for suffix in (" (TrueType)", " (OpenType)"):
                        if name.endswith(suffix):
                            name = name[:-len(suffix)]
                            break
                    # Entries can bundle styles: "Arial Bold & Arial Bold Italic"
                    for part in name.split(" & "):
                        installed.add(part.strip().casefold())
        except OSError:
            pass
    return installed

def install_job_fonts(job_dir):
    """Installs fonts from the job's 'Document Fonts' folder as per-user Windows fonts.

    Illustrator does not read InDesign-style 'Document Fonts' folders, so the
    fonts must be registered with Windows before the document is opened.
    Returns the number of fonts newly installed.
    """
    fonts_dir = os.path.join(job_dir, "Document Fonts")
    if not os.path.isdir(fonts_dir):
        return 0

    os.makedirs(USER_FONTS_DIR, exist_ok=True)
    installed = 0
    installed_names = _get_installed_font_names()

    for filename in os.listdir(fonts_dir):
        if not filename.lower().endswith(FONT_EXTENSIONS):
            continue
        try:
            src_path = os.path.join(fonts_dir, filename)
            dest_path = os.path.join(USER_FONTS_DIR, filename)

            # Skip fonts already installed on this PC (matched by the font's
            # internal name, so the filename does not have to match)
            font_names = _read_font_names(src_path)
            if font_names and font_names & installed_names:
                logger.info(f"Font already installed on this PC, skipping: {filename}")
                continue

            is_new = not os.path.isfile(dest_path)
            if is_new:
                shutil.copy2(src_path, dest_path)

            # Per-user font registration: value data is the full font path
            suffix = " (OpenType)" if filename.lower().endswith(".otf") else " (TrueType)"
            reg_name = os.path.splitext(filename)[0] + suffix
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, FONTS_REG_PATH, 0, winreg.KEY_SET_VALUE) as key:
                winreg.SetValueEx(key, reg_name, 0, winreg.REG_SZ, dest_path)

            # Make the font available to the current session immediately
            ctypes.windll.gdi32.AddFontResourceW(dest_path)

            if is_new:
                installed += 1
                logger.info(f"Installed font: {filename}")
            else:
                logger.info(f"Font already present, re-registered: {filename}")
        except Exception as e:
            logger.warning(f"Could not install font '{filename}': {e}")

    if installed:
        _broadcast_font_change()
    return installed

def _extract_ai_xmp_font_names(ai_path):
    """Returns the PostScript font names declared in an .ai file's XMP
    metadata (stFnt:fontName). This is the only reliable list of fonts the
    document actually uses: the JSX per-character scan cannot see MISSING
    fonts, because reading textFont on them throws or yields the substitute."""
    try:
        with open(ai_path, "rb") as f:
            data = f.read()
        names = re.findall(rb"stFnt:fontName>([^<]+)</", data)
        seen, result = set(), []
        for raw in names:
            name = raw.decode("utf-8", errors="replace").strip()
            if name and name not in seen:
                seen.add(name)
                result.append(name)
        return result
    except Exception as e:
        logger.warning(f"Could not extract XMP font names from '{os.path.basename(ai_path)}': {e}")
        return []

def _mockup_has_center_object(app, mockup_ai_path):
    """True if ANY object anywhere in the mockup normalizes (lowercased,
    non-alphanumeric stripped - same rule as the JSX's normalizeSizeWord) to
    exactly "center". PLACKET-MATCH's seam-art lookup (pmCollectSeamArt in
    automate_production.jsx) only ever picks up an object literally named
    "Center" - if that name doesn't exist anywhere in the mockup, the whole
    center-match feature is a guaranteed no-op for every size, silently
    (confirmed on a real job: same "no design touches the seam edge" line
    logged for every single size). Better to catch that BEFORE burning a
    full Illustrator run than let it silently do nothing.

    MUST go through Illustrator itself, not a raw .ai byte scan: a group's
    Layers-panel name is only reliably recoverable this way - some save
    settings/Illustrator versions don't leave it as readable text in the
    raw file at all (confirmed on a real job: an artist-named "Center"
    group produced zero extractable object names via a raw-text scan for
    the "%_/XMLUID : (name) ; (AI10_ArtUID)" comment pattern another mockup
    used - that pattern is not universal across save settings/versions).

    Opens and closes the mockup itself - caller must have zero other
    documents open first (same precondition as the font pre-flight).
    """
    try:
        probe = (
            "(function(){"
            "var doc = app.open(new File(" + json.dumps(os.path.abspath(mockup_ai_path)) + "));"
            "try {"
            "function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }"
            "var found = false;"
            "function hunt(container){"
            "  if (found || !container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (nm === 'center') { found = true; return; }"
            "    if (it.typename === 'GroupItem') hunt(it);"
            "    if (found) return;"
            "  }"
            "}"
            "for (var L = 0; L < doc.layers.length; L++) { hunt(doc.layers[L]); if (found) break; }"
            "return found ? 'yes' : 'no';"
            "} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }"
            "})();"
        )
        result = app.DoJavaScript(probe)
        return str(result).strip() == "yes"
    except Exception as e:
        logger.warning(f"Could not scan '{os.path.basename(mockup_ai_path)}' for a Center-named object: {e}")
        return True  # unreadable - don't block the job on a scan failure

def _mockup_has_pattern_object(app, mockup_ai_path):
    """True if a "Front Left" or "Front Right" group in the mockup (same name
    synonyms getSourceView's front-left/front-right lookup in
    automate_production.jsx accepts) itself CONTAINS an object normalizing
    (lowercased, non-alphanumeric stripped) to exactly "pattern".

    Deliberately scoped to inside Front Left/Front Right ONLY - NOT "anywhere
    in the whole mockup" the way _mockup_has_center_object/
    _mockup_has_local_tag_elements search. pmFindPatternGroup in
    automate_production.jsx only ever looks inside Front-Left's/Front-Right's
    OWN pasted design (a.pastedDesign/b.pastedDesign) - a "Pattern"-named
    object anywhere else in the mockup (Back, Sleeve, Patti, Neck, an unused
    reference layer, ...) is invisible to it and would make PATTERN_MATCH a
    silent no-op for every size, exactly as if the name didn't exist at all
    (confirmed on a real job: a document-wide search here passed - job
    6ddd62c9's successor - while automate_production.jsx logged "STRIPE-SHIFT
    skipped - no object named 'Pattern' found on either panel" for every
    single size, because whatever satisfied the old whole-document search
    wasn't inside either Front panel).

    Same MUST-go-through-Illustrator and zero-other-documents-open
    precondition as _mockup_has_center_object.
    """
    try:
        probe = (
            "(function(){"
            "var doc = app.open(new File(" + json.dumps(os.path.abspath(mockup_ai_path)) + "));"
            "try {"
            "function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }"
            "var leftNames = {frontleft:1, leftfront:1};"
            "var rightNames = {frontright:1, rightfront:1};"
            "var leftGroup = null, rightGroup = null;"
            "function huntPanel(container, wantNames){"
            "  if (!container.pageItems) return null;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (wantNames[nm] && it.typename === 'GroupItem') return it;"
            "    if (it.typename === 'GroupItem') { var r = huntPanel(it, wantNames); if (r) return r; }"
            "  }"
            "  return null;"
            "}"
            "for (var L = 0; L < doc.layers.length; L++) {"
            "  if (!leftGroup) leftGroup = huntPanel(doc.layers[L], leftNames);"
            "  if (!rightGroup) rightGroup = huntPanel(doc.layers[L], rightNames);"
            "}"
            "function hasPattern(container){"
            "  if (!container || !container.pageItems) return false;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (nm === 'pattern') return true;"
            "    if (it.typename === 'GroupItem' && hasPattern(it)) return true;"
            "  }"
            "  return false;"
            "}"
            "var found = hasPattern(leftGroup) || hasPattern(rightGroup);"
            "return found ? 'yes' : 'no';"
            "} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }"
            "})();"
        )
        result = app.DoJavaScript(probe)
        return str(result).strip() == "yes"
    except Exception as e:
        logger.warning(f"Could not scan '{os.path.basename(mockup_ai_path)}' for a Pattern-named object: {e}")
        return True  # unreadable - don't block the job on a scan failure

def _mockup_has_side_seam_match_objects(app, mockup_ai_path):
    """True if the mockup has ANY of the three valid SIDE-SEAM MATCH name
    pairs anywhere in it (same "anywhere in the whole mockup" scope as
    _mockup_has_center_object, not scoped inside a specific panel group the
    way _mockup_has_pattern_object is):
      - "Front Left side match" + "Back Right side match" (explicit Left)
      - "Front Right side match" + "Back Left side match" (explicit Right)
      - "Front side match" + "Back side match" (generic, Right-seam only)
    ssProcessPair/ssJoinOneSeam in automate_production.jsx only ever act on
    these exact normalized names (lowercased, non-alphanumeric stripped) -
    if none of the three pairs exist, SIDE_SEAM_MATCH is a guaranteed
    no-op for every size in the job, silently. Better to catch that BEFORE
    burning a full Illustrator run.

    Same MUST-go-through-Illustrator and zero-other-documents-open
    precondition as _mockup_has_center_object above.
    """
    try:
        probe = (
            "(function(){"
            "var doc = app.open(new File(" + json.dumps(os.path.abspath(mockup_ai_path)) + "));"
            "try {"
            "function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }"
            "var names = {frontleftsidematch:false, backrightsidematch:false, frontrightsidematch:false, backleftsidematch:false, frontsidematch:false, backsidematch:false};"
            "function hunt(container){"
            "  if (!container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (names.hasOwnProperty(nm)) names[nm] = true;"
            "    if (it.typename === 'GroupItem') hunt(it);"
            "  }"
            "}"
            "for (var L = 0; L < doc.layers.length; L++) { hunt(doc.layers[L]); }"
            "var ok = (names.frontleftsidematch && names.backrightsidematch) ||"
            "         (names.frontrightsidematch && names.backleftsidematch) ||"
            "         (names.frontsidematch && names.backsidematch);"
            "return ok ? 'yes' : 'no';"
            "} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }"
            "})();"
        )
        result = app.DoJavaScript(probe)
        return str(result).strip() == "yes"
    except Exception as e:
        logger.warning(f"Could not scan '{os.path.basename(mockup_ai_path)}' for Side-Seam-Match-named objects: {e}")
        return True  # unreadable - don't block the job on a scan failure

def _mockup_has_hood_center_match_objects(app, mockup_ai_path):
    """True if the mockup's OUTSIDE Hood group carries the HOOD CENTRE DESIGN
    MATCH name pair, each one inside the correct half:
      - "Center" somewhere inside Outside Hood's "Right" child
      - "Center" somewhere inside Outside Hood's "Left" child

    ONE short word on both halves, deliberately the same word the full-button
    placket match uses (_mockup_has_center_object above). The two features never
    collide because every lookup - here and in the JSX - is scoped to one panel,
    and a full-button jersey and a hoodie are not the same garment, so one mockup
    does not carry both. Was "Right side match"/"Left side match".

    Scoping matters MORE with this name than it did with the old ones, not less:
    "Center" is exactly the word the placket feature also looks for, so a
    document-wide search here would pass on a stray placket "Center" while the
    hood halves carry nothing. hcmProcessOutsideHood/hcmJoinHoodCentre in
    automate_production.jsx look for this normalized name inside exactly these
    two halves' pasted designs, so this check mirrors that scope.

    Inside Hood is NOT checked - the feature deliberately never touches it.

    Same MUST-go-through-Illustrator and zero-other-documents-open
    precondition as _mockup_has_center_object above.
    """
    try:
        probe = (
            "(function(){"
            "var doc = app.open(new File(" + json.dumps(os.path.abspath(mockup_ai_path)) + "));"
            "try {"
            "function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }"
            # Same "Outside Hood"/"Hood Outside" tolerance as the JSX's
            # hoodieFindMockupVariant, and the same left/right substring rule
            # as hoodieSideOf.
            "var outside = null;"
            "function huntOutside(container){"
            "  if (outside || !container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = norm(it.name);"
            "    if (nm === 'outsidehood' || nm === 'hoodoutside') { outside = it; return; }"
            "    if (it.typename === 'GroupItem') huntOutside(it);"
            "    if (outside) return;"
            "  }"
            "}"
            "for (var L = 0; L < doc.layers.length; L++) { huntOutside(doc.layers[L]); }"
            "if (!outside) return 'no';"
            "function sideOf(nm){"
            "  var l = nm.indexOf('left') !== -1, r = nm.indexOf('right') !== -1;"
            "  if (l && !r) return 'left';"
            "  if (r && !l) return 'right';"
            "  return null;"
            "}"
            "var halves = {left:null, right:null};"
            "function huntSides(container){"
            "  if (!container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var s = sideOf(norm(it.name));"
            "    if (s && !halves[s]) halves[s] = it;"
            "    if (it.typename === 'GroupItem') huntSides(it);"
            "  }"
            "}"
            "huntSides(outside);"
            "if (!halves.left || !halves.right) return 'no';"
            "function hasNamed(container, want){"
            "  if (!container.pageItems) return false;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    if (norm(it.name) === want) return true;"
            "    if (it.typename === 'GroupItem' && hasNamed(it, want)) return true;"
            "  }"
            "  return false;"
            "}"
            "var ok = hasNamed(halves.right, 'center') && hasNamed(halves.left, 'center');"
            "return ok ? 'yes' : 'no';"
            "} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }"
            "})();"
        )
        result = app.DoJavaScript(probe)
        return str(result).strip() == "yes"
    except Exception as e:
        logger.warning(f"Could not scan '{os.path.basename(mockup_ai_path)}' for Hood-Centre-Match-named objects: {e}")
        return True  # unreadable - don't block the job on a scan failure

def _mockup_has_local_tag_elements(app, mockup_ai_path):
    """True if the mockup has a group normalizing to "localtag" AND, inside
    it, a TextFrame normalizing to "size". processLocalTagLabel in
    automate_production.jsx requires both by name - without them the LOCAL
    TAG checkbox would silently do nothing for every size in the job.

    Same MUST-go-through-Illustrator and zero-other-documents-open
    precondition as _mockup_has_center_object above.
    """
    try:
        probe = (
            "(function(){"
            "var doc = app.open(new File(" + json.dumps(os.path.abspath(mockup_ai_path)) + "));"
            "try {"
            "function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }"
            "var tagGroup = null;"
            "function huntTag(container){"
            "  if (tagGroup || !container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (nm === 'localtag' && it.typename === 'GroupItem') { tagGroup = it; return; }"
            "    if (it.typename === 'GroupItem') huntTag(it);"
            "    if (tagGroup) return;"
            "  }"
            "}"
            "for (var L = 0; L < doc.layers.length; L++) { huntTag(doc.layers[L]); if (tagGroup) break; }"
            "if (!tagGroup) return 'no';"
            "var sizeTf = false;"
            "function huntSize(container){"
            "  if (sizeTf || !container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (nm === 'size' && it.typename === 'TextFrame') { sizeTf = true; return; }"
            "    if (it.typename === 'GroupItem') huntSize(it);"
            "    if (sizeTf) return;"
            "  }"
            "}"
            "huntSize(tagGroup);"
            "return sizeTf ? 'yes' : 'no';"
            "} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }"
            "})();"
        )
        result = app.DoJavaScript(probe)
        return str(result).strip() == "yes"
    except Exception as e:
        logger.warning(f"Could not scan '{os.path.basename(mockup_ai_path)}' for LOCAL TAG/SIZE: {e}")
        return True  # unreadable - don't block the job on a scan failure

def _mockup_has_armhole_match_objects(app, mockup_ai_path):
    """True if the mockup's BACK view (synonyms: "back"/"BACK"/"Back
    View"/"Back_View" - same list automate_production.jsx's getSourceView
    accepts for a plain "back" part) contains a group normalizing to
    "armholematch" with at least one child normalizing to "unit..." inside
    it (unit1, unit 1, unit left 1, unit right 1, ...).

    Deliberately scoped to the BACK view only, not "anywhere in the
    mockup" - smMeasureBodyD in automate_production.jsx only ever measures
    the BACK panel's right armhole ("if (!isBack(partName)) return;"; the
    front, the other side and every sleeve's own corners are assumed
    mirror-symmetric to it, and on a FULL-BUTTON jersey the back is still
    one whole panel while the front is split into halves) - an "armhole
    match" group that exists only on Front or a Sleeve view is invisible to
    it and would make ARMHOLE SIDE SLEEVE MATCHING a silent no-op for every
    size, exactly like the CENTER/PATTERN-MATCH scoped checks above.

    Same MUST-go-through-Illustrator and zero-other-documents-open
    precondition as _mockup_has_center_object.
    """
    try:
        probe = (
            "(function(){"
            "var doc = app.open(new File(" + json.dumps(os.path.abspath(mockup_ai_path)) + "));"
            "try {"
            "function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }"
            "var backNames = {back:1, backview:1};"
            "var backGroup = null;"
            "function huntBack(container){"
            "  if (backGroup || !container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (backNames[nm] && it.typename === 'GroupItem') { backGroup = it; return; }"
            "    if (it.typename === 'GroupItem') huntBack(it);"
            "    if (backGroup) return;"
            "  }"
            "}"
            "for (var L = 0; L < doc.layers.length; L++) { huntBack(doc.layers[L]); if (backGroup) break; }"
            "if (!backGroup) return 'no';"
            "var armholeGroup = null;"
            "function huntArmhole(container){"
            "  if (armholeGroup || !container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (nm === 'armholematch' && it.typename === 'GroupItem') { armholeGroup = it; return; }"
            "    if (it.typename === 'GroupItem') huntArmhole(it);"
            "    if (armholeGroup) return;"
            "  }"
            "}"
            "huntArmhole(backGroup);"
            "if (!armholeGroup) return 'no';"
            "var hasUnit = false;"
            "function huntUnit(container){"
            "  if (hasUnit || !container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (nm.indexOf('unit') === 0) { hasUnit = true; return; }"
            "    if (it.typename === 'GroupItem') huntUnit(it);"
            "    if (hasUnit) return;"
            "  }"
            "}"
            "huntUnit(armholeGroup);"
            "return hasUnit ? 'yes' : 'no';"
            "} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }"
            "})();"
        )
        result = app.DoJavaScript(probe)
        return str(result).strip() == "yes"
    except Exception as e:
        logger.warning(f"Could not scan '{os.path.basename(mockup_ai_path)}' for an armhole-match group: {e}")
        return True  # unreadable - don't block the job on a scan failure

def _pattern_has_hoodie_objects(app, pattern_ai_path):
    """True if the pattern file has, ANYWHERE in it, a group whose name
    contains "hood" with a "Left"/"Right" child inside it (either "Left
    Hood"/"Hood Left"/"Left", or the "Right" equivalents), plus a "Pocket"
    and a "Border" group. automate_production.jsx's HOODIE block only ever
    looks for these by name (per size, e.g. "XL Hood") - without them the
    Hoodie checkbox would silently do nothing for every size in the job.

    Same MUST-go-through-Illustrator and zero-other-documents-open
    precondition as _mockup_has_center_object.
    """
    try:
        probe = (
            "(function(){"
            "var doc = app.open(new File(" + json.dumps(os.path.abspath(pattern_ai_path)) + "));"
            "try {"
            "function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }"
            # Substring match (not an exact-name set) - the pattern's own
            # per-size Left/Right children carry the size as a prefix (e.g.
            # "2XL Right Hood", "XL Left Hood"), so an exact "left"/"right"/
            # "lefthood"/"hoodleft" set never matches. "left"/"right" as
            # substrings, mutually exclusive, is robust to any surrounding
            # size/word order.
            "function sideOf(nm){ var l = nm.indexOf('left') !== -1, r = nm.indexOf('right') !== -1; if (l && !r) return 'left'; if (r && !l) return 'right'; return null; }"
            "var hoodGroup = null, hasPocket = false, hasBorder = false;"
            "function huntTop(container){"
            "  if (!container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (!hoodGroup && nm.indexOf('hood') !== -1 && it.typename === 'GroupItem') hoodGroup = it;"
            "    if (nm.indexOf('pocket') !== -1) hasPocket = true;"
            "    if (nm.indexOf('border') !== -1) hasBorder = true;"
            "    if (it.typename === 'GroupItem') huntTop(it);"
            "  }"
            "}"
            "for (var L = 0; L < doc.layers.length; L++) { huntTop(doc.layers[L]); }"
            "if (!hoodGroup) return 'no';"
            "var hasLeft = false, hasRight = false;"
            "function huntSide(container){"
            "  if (!container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    var side = sideOf(nm);"
            "    if (side === 'left') hasLeft = true;"
            "    if (side === 'right') hasRight = true;"
            "    if (it.typename === 'GroupItem') huntSide(it);"
            "  }"
            "}"
            "huntSide(hoodGroup);"
            "return (hasLeft && hasRight && hasPocket && hasBorder) ? 'yes' : 'no';"
            "} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }"
            "})();"
        )
        result = app.DoJavaScript(probe)
        return str(result).strip() == "yes"
    except Exception as e:
        logger.warning(f"Could not scan '{os.path.basename(pattern_ai_path)}' for Hoodie Hood/Pocket/Border groups: {e}")
        return True  # unreadable - don't block the job on a scan failure

def _mockup_has_hoodie_objects(app, mockup_ai_path):
    """True if the mockup has BOTH an "Outside Hood" (or "Hood Outside") and
    an "Inside Hood" (or "Hood Inside") group, each with a "Left"/"Right"
    child inside it (either "Left Hood"/"Hood Left"/"Left", or the "Right"
    equivalents), plus a "Border" design group. automate_production.jsx's
    HOODIE block sources Outside/Inside Hood color+design from these by name
    - without them the Hoodie checkbox would silently do nothing for every
    size in the job.

    Same MUST-go-through-Illustrator and zero-other-documents-open
    precondition as _mockup_has_center_object.
    """
    try:
        probe = (
            "(function(){"
            "var doc = app.open(new File(" + json.dumps(os.path.abspath(mockup_ai_path)) + "));"
            "try {"
            "function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }"
            "var outsideNames = {outsidehood:1, hoodoutside:1};"
            "var insideNames = {insidehood:1, hoodinside:1};"
            # Substring match (not an exact-name set) - see the matching
            # pattern-side comment in _pattern_has_hoodie_objects above; kept
            # consistent here in case a mockup ever names its sides with a
            # prefix/suffix too (e.g. "Hood Left") instead of plain "Left".
            "function sideOf(nm){ var l = nm.indexOf('left') !== -1, r = nm.indexOf('right') !== -1; if (l && !r) return 'left'; if (r && !l) return 'right'; return null; }"
            "var outsideGroup = null, insideGroup = null, hasBorder = false;"
            "function huntTop(container){"
            "  if (!container.pageItems) return;"
            "  for (var i = 0; i < container.pageItems.length; i++) {"
            "    var it = container.pageItems[i];"
            "    var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "    if (!outsideGroup && outsideNames[nm] && it.typename === 'GroupItem') outsideGroup = it;"
            "    if (!insideGroup && insideNames[nm] && it.typename === 'GroupItem') insideGroup = it;"
            "    if (nm === 'border') hasBorder = true;"
            "    if (it.typename === 'GroupItem') huntTop(it);"
            "  }"
            "}"
            "for (var L = 0; L < doc.layers.length; L++) { huntTop(doc.layers[L]); }"
            "function hasSides(group){"
            "  if (!group) return false;"
            "  var hasLeft = false, hasRight = false;"
            "  function huntSide(container){"
            "    if (!container.pageItems) return;"
            "    for (var i = 0; i < container.pageItems.length; i++) {"
            "      var it = container.pageItems[i];"
            "      var nm = ''; try { nm = norm(it.name); } catch (eN) {}"
            "      var side = sideOf(nm);"
            "      if (side === 'left') hasLeft = true;"
            "      if (side === 'right') hasRight = true;"
            "      if (it.typename === 'GroupItem') huntSide(it);"
            "    }"
            "  }"
            "  huntSide(group);"
            "  return hasLeft && hasRight;"
            "}"
            "var ok = outsideGroup && insideGroup && hasSides(outsideGroup) && hasSides(insideGroup) && hasBorder;"
            "return ok ? 'yes' : 'no';"
            "} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }"
            "})();"
        )
        result = app.DoJavaScript(probe)
        return str(result).strip() == "yes"
    except Exception as e:
        logger.warning(f"Could not scan '{os.path.basename(mockup_ai_path)}' for Hoodie Outside/Inside Hood/Border objects: {e}")
        return True  # unreadable - don't block the job on a scan failure

# part_name (Excel/plan) -> the panel name the pattern file uses. MUST stay in
# sync with resolvePartLabel in scripts/automate_production.jsx: this pre-flight
# is only honest if it resolves the exact same names the JSX will look up at
# render time, key for key (exact-key lookup, no case folding - the JSX's
# `_partLabelMap[item.part_name]` doesn't fold either, and an unmapped
# part_name falls through as the panel name itself in both places).
_PART_LABEL_MAP = {
    "front": "Front", "back": "Back", "neck": "Neck",
    "front-left": "Front Left", "front_left": "Front Left",
    "front-right": "Front Right", "front_right": "Front Right",
    "sleeve-long": "Long Sleeve", "sleeve_long": "Long Sleeve",
    "sleeve-short": "Short Sleeve", "sleeve_short": "Short Sleeve",
    "sleeve": "Short Sleeve", "sleeve-half": "Short Sleeve", "sleeve_half": "Short Sleeve",
    "sleeve-right": "Right Sleeve", "sleeve_right": "Right Sleeve",
    "sleeve-left": "Left Sleeve", "sleeve_left": "Left Sleeve",
    "cuff": "Rib & Cuff", "twill-tape": "Twill Tape", "twill_tape": "Twill Tape",
    "tukdi": "Tukdi", "placket": "Placket",
    # Full-button only, and NOT an accessory: its length scales with the
    # garment, so it is looked up per size ("XL Patti") like Front/Back/Neck.
    "patti": "Patti",
}

# Excel size code -> the size word the pattern file's panel names carry.
# Mirrors getFriendlySize in scripts/automate_production.jsx.
_FRIENDLY_SIZE_MAP = {
    "XS": "XS", "S": "Small", "M": "Medium", "L": "Large", "XL": "XL",
    "XXL": "2XL", "2XL": "2XL", "3XL": "3XL", "XXXL": "3XL",
    "4XL": "4XL", "XXXXL": "4XL",
    # Youth and toddler codes map to themselves - the pattern names them
    # "YXS Front" / "2T Front", not a spelled-out word.
    "YXS": "YXS", "YS": "YS", "YM": "YM", "YL": "YL", "YXL": "YXL",
    "1T": "1T", "2T": "2T", "3T": "3T", "4T": "4T", "5T": "5T",
    "6T": "6T", "7T": "7T", "8T": "8T", "9T": "9T", "10T": "10T",
}

# Spelled-out words that mean a bare size code, so "Youth Small" resolves the
# same way "Youth S" does. Mirrors SIZE_WORDS in the JSX.
_SIZE_WORDS = {"SMALL": "S", "MED": "M", "MEDIUM": "M", "LARGE": "L"}


def _friendly_size(size):
    # Punctuation and repeated spaces collapse to ONE space so "Youth-XS" and
    # "YOUTH  XS" are the same key; the space itself is kept because it is what
    # separates the age word from the code.
    up = re.sub(r"[^A-Z0-9]+", " ", str(size or "").upper()).strip()
    if up in _FRIENDLY_SIZE_MAP:
        return _FRIENDLY_SIZE_MAP[up]
    flat = up.replace(" ", "")
    if flat in _FRIENDLY_SIZE_MAP:
        return _FRIENDLY_SIZE_MAP[flat]
    # Spelled-out age group: "Youth XS" == "YXS", "Adult XL" == "AXL" == "XL".
    # Only the age WORD is consumed - what follows must already be a known code,
    # so "Adult Something" is returned untouched rather than guessed at.
    if " " in up:
        head, rest = up.split(" ", 1)
        rest = rest.replace(" ", "")
        rest = _SIZE_WORDS.get(rest, rest)
        if head == "YOUTH" and ("Y" + rest) in _FRIENDLY_SIZE_MAP:
            return _FRIENDLY_SIZE_MAP["Y" + rest]
        if head == "ADULT" and rest in _FRIENDLY_SIZE_MAP:
            return _FRIENDLY_SIZE_MAP[rest]
        if head == "TODDLER":
            if rest in _FRIENDLY_SIZE_MAP:
                return _FRIENDLY_SIZE_MAP[rest]
            # "Toddler 4" means 4T - a sheet that already said "Toddler" often
            # drops the T.
            if rest.isdigit() and (rest + "T") in _FRIENDLY_SIZE_MAP:
                return _FRIENDLY_SIZE_MAP[rest + "T"]
    # Adult "A" prefix (AM = M): the same size, just marked to pair visually
    # with the youth "Y" codes. No entry above starts with "A", so stripping it
    # can never mis-read a real size name.
    if len(flat) > 1 and flat[0] == "A" and flat[1:] in _FRIENDLY_SIZE_MAP:
        return _FRIENDLY_SIZE_MAP[flat[1:]]
    return size


def _size_aliases(size_label):
    """Every spelling of ONE size a pattern file might use. Mirrors sizeAliases
    in automate_production.jsx - the pre-flight must accept exactly what the
    render accepts, or it refuses jobs that would have worked."""
    out = [size_label]
    up = str(size_label or "").upper()

    def add(n):
        if n not in out:
            out.append(n)

    if len(up) > 1 and up[0] == "Y" and up in _FRIENDLY_SIZE_MAP:
        add("Youth " + str(size_label)[1:])
    if re.match(r"^[0-9]+T$", up):
        add("Toddler " + str(size_label))
        add("Toddler " + str(size_label)[:-1])
    shorts = [k for k, v in _FRIENDLY_SIZE_MAP.items()
              if v == size_label and not k.startswith("Y") and not re.match(r"^[0-9]+T$", k)]
    if shorts:
        add("Adult " + str(size_label))
        for sc in shorts:
            if sc != up:
                add(sc)
                add("Adult " + sc)
            add("A" + sc)
    return out


def _is_accessory(part):
    """Size-independent pieces - one shared panel for the whole order, so their
    pattern name carries no size prefix. Same rule as isAccessory in the JSX."""
    n = (part or "").lower()
    return "twill" in n or "tukdi" in n or "tape" in n or "placket" in n


def _norm_name(name):
    """findAnywhere's name rule: lowercased, every non-alphanumeric dropped."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _expected_pattern_pieces(plan_data):
    """Every panel name this plan will make the JSX look up in the pattern
    file, as (alternatives, description) pairs.

    `alternatives` is a list of name-groups; the requirement is met when ALL
    names in ANY ONE group exist. Two cases need that, and they are the two
    places the JSX itself picks between names rather than demanding one:

      - part_name "sleeve": resolvePartLabel probes "<Size> Short Sleeve",
        then "<Size> Long Sleeve", then "<Size> Sleeve", and uses whichever
        the pattern actually has.
      - a full-button "front": the JSX splits it into front-left/front-right
        ONLY when the mockup carries both designs (mockupHasBothFrontSides),
        otherwise the single "<Size> Front" panel is used. Both spellings are
        accepted here rather than opening the mockup a second time to find out
        which one applies - flagging a pattern that satisfies either would be
        a false alarm.

    Deliberately NOT covered: Hood/Pocket/Border. Those are built by the JSX's
    hoodie branch from the pattern rather than from plan items, and the HOODIE
    pre-flight already checks them by name.
    """
    full_button = bool(plan_data.get("full_button_jersey"))
    required, seen = [], set()
    for group in plan_data.get("production_groups", []) or []:
        raw_size = group.get("size")
        size_label = _friendly_size(raw_size)
        for item in group.get("items", []) or []:
            part = str(item.get("part_name") or "").strip()
            if not part:
                continue

            # patternTargetName: accessories and the Universal group carry no
            # size prefix, everything else is "<Size> <Panel>".
            #
            # One GROUP PER SIZE SPELLING, because the pattern may write the size
            # as "YXS" or "Youth XS", "XL" or "Adult XL" - findPatternPanel in
            # the JSX accepts any of them, so this must too. A pre-flight that is
            # stricter than the renderer refuses jobs that would have worked,
            # which is worse than no pre-flight at all.
            def expand(labels, _p=part, _s=size_label):
                if _is_accessory(_p) or _s == "Universal":
                    return [list(labels)]
                return [[f"{alias} {lb}" for lb in labels] for alias in _size_aliases(_s)]

            if part == "sleeve":
                alternatives = expand(["Short Sleeve"]) + expand(["Long Sleeve"]) + expand(["Sleeve"])
            elif full_button and part.lower() == "front":
                alternatives = expand(["Front"]) + expand(["Front Left", "Front Right"])
            else:
                alternatives = expand([_PART_LABEL_MAP.get(part, part)])

            key = tuple(tuple(alt) for alt in alternatives)
            if key in seen:
                continue
            seen.add(key)
            required.append((alternatives, f"size {raw_size}, part '{part}'"))
    return required


def _describe_missing_piece(alternatives, description):
    def fmt(names):
        return " + ".join('"%s"' % n for n in names)
    text = fmt(alternatives[0])
    if len(alternatives) > 1:
        text += " (or " + ", ".join(fmt(alt) for alt in alternatives[1:]) + ")"
    return f"{text} - needed for {description}"


def _find_missing_pattern_pieces(app, pattern_ai_path, plan_data):
    """The panel names this order needs that the pattern file does not have.

    automate_production.jsx:824 looks every piece up with findAnywhere and, on
    a miss, logs "CRITICAL: Could not find '<name>' in Master Pattern document.
    Skipping." and carries straight on - so one mistyped or absent panel costs
    a full Illustrator run and ships an order file quietly missing that piece,
    with nothing but the debug log to say so.

    The probe replicates findAnywhere's index EXACTLY - the same name
    normalization AND the same depth>3 cut-off as _buildNameIndex - so a name
    this finds is a name the JSX can also reach. Searching deeper would pass
    pieces the render will still miss.

    Same MUST-go-through-Illustrator and zero-other-documents-open precondition
    as _mockup_has_center_object. Returns [] when nothing is missing and also
    when the scan itself failed - an unreadable pattern must not block the job,
    same as every check above.
    """
    required = _expected_pattern_pieces(plan_data)
    wanted = {}
    for alternatives, _desc in required:
        for names in alternatives:
            for name in names:
                n = _norm_name(name)
                if n:
                    wanted[n] = 1
    if not wanted:
        return []

    try:
        probe = (
            "(function(){"
            "var doc = app.open(new File(" + json.dumps(os.path.abspath(pattern_ai_path)) + "));"
            "try {"
            "function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }"
            "var want = " + json.dumps(wanted) + ";"
            "var found = {};"
            # Same shape as _buildNameIndex in automate_production.jsx: names
            # registered level by level, groups and sub-layers walked to depth
            # 3 and no further.
            "function walk(items, depth){"
            "  if (!items || items.length === 0 || depth > 3) return;"
            "  for (var i = 0; i < items.length; i++) {"
            "    try { var n = norm(items[i].name); if (n && want.hasOwnProperty(n)) found[n] = 1; } catch (eN) {}"
            "  }"
            "  for (var j = 0; j < items.length; j++) {"
            "    try {"
            "      if (items[j].typename === 'GroupItem') walk(items[j].pageItems, depth + 1);"
            "      else if (items[j].typename === 'Layer') { walk(items[j].layers, depth + 1); walk(items[j].pageItems, depth + 1); }"
            "    } catch (eW) {}"
            "  }"
            "}"
            "walk(doc.layers, 0);"
            "var out = [];"
            "for (var k in found) { if (found.hasOwnProperty(k)) out.push(k); }"
            # 'OK' marker: without it a probe that returned undefined/an error
            # string would read as "nothing found" and pause every single job.
            "return 'OK|' + out.join('|');"
            "} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }"
            "})();"
        )
        result = str(app.DoJavaScript(probe)).strip()
    except Exception as e:
        logger.warning(f"Could not scan '{os.path.basename(pattern_ai_path)}' for the order's panel names: {e}")
        return []

    parts = result.split("|")
    if not parts or parts[0] != "OK":
        logger.warning(f"Pattern-piece scan returned an unexpected result ({result[:120]!r}) - check skipped.")
        return []
    present = set(p for p in parts[1:] if p)

    missing = []
    for alternatives, description in required:
        if any(all(_norm_name(n) in present for n in names) for names in alternatives):
            continue
        missing.append(_describe_missing_piece(alternatives, description))
    return missing


def _find_missing_fonts(app, font_names):
    """Returns the subset of font_names that Illustrator does not have,
    checked via app.textFonts.getByName. Only trustworthy while NO documents
    are open: an open document registers its substituted (missing) fonts in
    app.textFonts under their original names, making every lookup succeed."""
    if not font_names:
        return []
    probe = (
        "(function(){var m=[];var n=" + json.dumps(font_names) + ";"
        "for(var i=0;i<n.length;i++){"
        "try{app.textFonts.getByName(n[i]);}catch(e){m.push(n[i]);}}"
        "return m.join('|');})();"
    )
    result = app.DoJavaScript(probe)
    return [name for name in str(result).split("|") if name]

def update_status(job_dir, message, progress=0, is_ready=False, warnings=None,
                  back_label_warnings=None, parm_errors=None):
    """Updates a status.json file in the job directory."""
    status_path = os.path.join(job_dir, "status.json")
    payload = {"message": message, "progress": progress, "is_ready": is_ready}
    if warnings:
        payload["warnings"] = warnings
    if back_label_warnings:
        payload["back_label_warnings"] = back_label_warnings
    if parm_errors:
        payload["parm_errors"] = parm_errors
    with open(status_path, "w") as f:
        json.dump(payload, f)

def _illustrator_process_running():
    """True if an Illustrator.exe process exists.

    Deliberately checks the PROCESS, not COM: a busy/modal instance can be
    invisible to GetActiveObject while still running - and still holding the
    stale font list and leftover documents this job must not inherit."""
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Illustrator.exe"],
                             capture_output=True, text=True, timeout=30).stdout or ""
        return "illustrator.exe" in out.lower()
    except Exception as e:
        logger.warning(f"Could not query the Illustrator process list: {e}")
        return False


# Restart a reused Illustrator once it is holding more than this. Closing every
# document and running $.gc() gives most of the memory back, but not all of it:
# Illustrator's allocator does not return freed blocks to the OS, so the process
# creeps upward across jobs no matter how carefully each one cleans up. Only a
# restart resets that, and this is the point at which it is worth one.
#
# 6 GB is a STARTING GUESS, not a measurement. Every job logs what it actually
# found (see _illustrator_memory_kb's caller), so tune it from those numbers
# rather than from this comment.
ILLUSTRATOR_MEMORY_RESTART_KB = 6 * 1024 * 1024


def _illustrator_memory_kb():
    """Illustrator.exe's working set in KB, or None if it could not be read.

    Uses tasklist for the same reason _illustrator_process_running does: no
    extra dependency, and it sees an instance that is too busy to answer COM."""
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Illustrator.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=30,
        ).stdout or ""
    except Exception as e:
        logger.warning(f"Could not read Illustrator's memory usage: {e}")
        return None
    total = 0
    for line in out.splitlines():
        # "Illustrator.exe","1234","Console","1","2,345,678 K"
        fields = [f.strip('"') for f in line.strip().split('","')]
        if len(fields) < 5 or not fields[0].lower().startswith("illustrator"):
            continue
        digits = re.sub(r"[^0-9]", "", fields[-1])
        if digits:
            total += int(digits)
    return total or None


def _illustrator_unsaved_documents(prog_ids):
    """Names of documents open in a hand-started Illustrator that have unsaved
    changes.

    Every job closes the running Illustrator WITHOUT saving - _quit_illustrator
    below, and then the leftover sweep's Documents.Item(1).Close(2). That is
    right for the automation's own leftovers and fatal for whatever a person
    happened to be in the middle of. One operator who knows the rule is fine; a
    designer handed a website has no idea (DEPLOYMENT_PLAN.md §8, case 1).

    GetActiveObject ONLY, never Dispatch: Dispatch would LAUNCH Illustrator
    just to ask whether it had unsaved work in it.

    Returns [] when nothing is unsaved, and also when the question could not be
    asked at all - an instance we cannot read must not block the job, same as
    every pre-flight in this file.
    """
    for prog_id in prog_ids:
        try:
            app = win32com.client.GetActiveObject(prog_id)
        except Exception:
            continue  # not this ProgID - try the next
        try:
            unsaved = []
            for i in range(1, int(app.Documents.Count) + 1):
                try:
                    doc = app.Documents.Item(i)
                    # A never-saved document reports Saved == False too, which
                    # is what we want - "Untitled-1" is still someone's work.
                    if not bool(doc.Saved):
                        unsaved.append(str(doc.Name))
                except Exception:
                    continue  # one unreadable document must not hide the rest
            if unsaved:
                logger.info(f"Illustrator has unsaved documents open: {unsaved}")
            return unsaved
        except Exception as e:
            logger.warning(f"Could not check Illustrator for unsaved documents: {e}")
            return []
    return []


def _quit_illustrator(prog_ids, app=None, timeout=30):
    """Shuts Illustrator down completely and waits until the process is gone.

    Graceful COM Quit first (dialogs suppressed) so Illustrator releases its
    files cleanly; force-kill only if it is still alive after `timeout`
    seconds - a hung instance would otherwise block the next launch forever.
    Pass `app` to reuse the job's own connection instead of re-resolving it.
    Returns True if no Illustrator process remains."""
    if not _illustrator_process_running():
        return True

    handles = []
    if app is not None:
        handles.append(app)
    else:
        for prog_id in prog_ids:
            try:
                handles.append(win32com.client.GetActiveObject(prog_id))
            except Exception:
                continue

    for handle in handles:
        try:
            handle.UserInteractionLevel = -1  # suppress save/close dialogs
        except Exception:
            pass
        try:
            handle.Quit()
        except Exception as e:
            logger.warning(f"Illustrator Quit() call failed: {e}")

    for _ in range(timeout):
        time.sleep(1)
        if not _illustrator_process_running():
            logger.info("Illustrator closed successfully")
            return True

    logger.warning(f"Illustrator did not close within {timeout}s - force-killing it")
    _kill_illustrator_process()
    for _ in range(10):
        time.sleep(1)
        if not _illustrator_process_running():
            return True
    logger.error("Illustrator process could not be terminated")
    return False

def run_illustrator_automation(job_id, job_dir, plan_data, pattern_ai_path, mockup_ai_path, reference_ai_path=None,
                               logo_library_ai_path=None, ignore_missing_fonts=False, force_font_refresh=False,
                               ignore_center_match_warning=False, ignore_local_tag_warning=False,
                               ignore_pattern_match_warning=False, ignore_side_seam_match_warning=False,
                               ignore_armhole_match_warning=False, ignore_hoodie_warning=False,
                               ignore_hood_center_match_warning=False,
                               ignore_pattern_piece_warning=False,
                               ignore_unsaved_work=False):
    pythoncom.CoInitialize()
    update_status(job_dir, "Initializing Illustrator...", 10)

    watchdog_fired = threading.Event()
    # Targeting Illustrator 2015 specifically as requested; plain ProgID is the
    # fallback. Defined before the try so the finally block can always close
    # Illustrator, even if the job dies before it connects.
    prog_ids = ["Illustrator.Application.CC.2015", "Illustrator.Application"]
    app = None
    try:
        # Ensure all paths are absolute for Illustrator
        job_dir = os.path.abspath(job_dir)
        # The render folder carries the job's own name (the name the user typed
        # on the frontend, which is also the job folder and the job id) instead
        # of a fixed "renders", so an unzipped order is self-labelling. Inside
        # it the JSX files each piece under its size code (S/, M/, L/, 2XL/...);
        # Universal accessories stay in this root.
        render_dir = os.path.abspath(os.path.join(job_dir, os.path.basename(job_dir)))
        os.makedirs(render_dir, exist_ok=True)
        
        # SPLIT PER SIZE (automatic, no checkbox). A heavy mockup is heavy
        # because of what is IN it - embedded bitmaps, opacity masks,
        # transparency groups - and every panel in an order document carries its
        # own copy of that. One document holding 40+ of them is what makes the
        # export phase crawl and the memory run out: on job Knuckle_Headz_Mint
        # (10.9 MB mockup) per-panel export time DEGRADED from 60s to 99s as the
        # flush went on, and all three PARM failures landed in the last 90
        # seconds of a 2-hour run, alongside "Temp Expand failed" - the
        # signature of an exhausted process, not of a bad panel. A comparable
        # job with a 186 KB mockup exported bigger panels at 9.1s each.
        #
        # So above the threshold each size gets its own .ai file: ~10 panels per
        # document instead of 40+, each one short-lived. The splitting machinery
        # itself is not new - startNextOrderDoc in automate_production.jsx has
        # always done this when the canvas fills; this only adds a second reason
        # to trigger it. See SLOW_EXPORTING.md.
        #
        # Measured on the mockup as it sits on disk, which is the same number
        # the operator sees in Explorer.
        MOCKUP_SPLIT_BYTES = 5 * 1024 * 1024
        try:
            mockup_bytes = os.path.getsize(mockup_ai_path)
        except OSError:
            mockup_bytes = 0  # unreadable -> behave exactly as before
        plan_data["split_per_size"] = bool(mockup_bytes > MOCKUP_SPLIT_BYTES)
        logger.info(
            "Mockup is %.1f MB -> %s",
            mockup_bytes / (1024 * 1024),
            "one order .ai per size" if plan_data["split_per_size"]
            else "single order .ai (split only if the canvas fills)",
        )

        plan_json_path = os.path.abspath(os.path.join(job_dir, "production_plan.json"))
        with open(plan_json_path, 'w') as f:
            json.dump(plan_data, f)

        # Sleeve-match / back-label warnings from a previous run of this job
        # must not leak into this run's final status.
        sm_warn_path = os.path.join(job_dir, "sleeve_match_warnings.json")
        bl_warn_path = os.path.join(job_dir, "back_label_warnings.json")
        parm_err_path = os.path.join(job_dir, "parm_errors.json")
        # error_log.txt lives in the RENDER dir, which a re-run reuses. Left
        # behind, last run's crash would mark this run INCOMPLETE even if it
        # finished perfectly - the same stale-state trap the three files above
        # are cleared for.
        stale_jsx_err = os.path.join(render_dir, "error_log.txt")
        for stale_path in (sm_warn_path, bl_warn_path, parm_err_path, stale_jsx_err):
            try:
                if os.path.exists(stale_path):
                    os.remove(stale_path)
            except OSError:
                pass

        update_status(job_dir, "Installing job fonts...", 15)
        newly_installed = install_job_fonts(job_dir)

        # An Illustrator that is ALREADY OPEN is reused, not restarted. It
        # belongs to the person sitting in front of it - a designer keeps it
        # open all day, and relaunching the application under them on every job
        # is both slow and rude. Its open documents are closed after connecting
        # (the leftover sweep below), which is all a normal job actually needs:
        # what breaks jobs is another document's swatches and same-named
        # groups, not the application itself.
        #
        # FONTS ARE THE ONE EXCEPTION. install_job_fonts registered new fonts
        # with Windows a moment ago, and Illustrator only reads the font list
        # at launch - a reused instance cannot see them, so the order would
        # render in substituted fonts and look wrong. There is no way to make
        # it re-read them short of a restart, so that case still restarts.
        if _illustrator_process_running():
            # UNSAVED-WORK pre-flight. Runs BEFORE _quit_illustrator, and
            # before anything else touches Illustrator, so nothing is lost by
            # the time the operator is asked. Unlike the pre-flights further
            # down it cannot wait until "zero documents open" - open documents
            # are the entire subject.
            if not ignore_unsaved_work:
                unsaved = _illustrator_unsaved_documents(prog_ids)
                if unsaved:
                    logger.info("Automation paused: Illustrator has unsaved documents open.")
                    with open(os.path.join(job_dir, "status.json"), "w") as f:
                        json.dump({
                            "message": (
                                f"Illustrator has {len(unsaved)} unsaved document(s) open - "
                                "automation paused before closing it"
                            ),
                            "progress": 18,
                            "is_ready": False,
                            "illustrator_unsaved_work": True,
                            "unsaved_documents": unsaved,
                        }, f)
                    return None

            # Logged on every job whether it triggers a restart or not - this is
            # the only place real numbers accumulate for tuning the threshold.
            mem_kb = _illustrator_memory_kb()
            if mem_kb:
                logger.info(f"Illustrator is using {mem_kb / 1024 / 1024:.2f} GB "
                            f"(restart threshold {ILLUSTRATOR_MEMORY_RESTART_KB / 1024 / 1024:.0f} GB)")

            if newly_installed or force_font_refresh:
                update_status(job_dir, "Restarting Illustrator to load the new fonts...", 18)
                _quit_illustrator(prog_ids)
                time.sleep(2)  # let Windows release the COM registration
            elif mem_kb and mem_kb > ILLUSTRATOR_MEMORY_RESTART_KB:
                # Safe to do without asking: the unsaved-work pre-flight above
                # has already run, so anything the designer had open is either
                # saved or they chose to lose it.
                logger.info("Illustrator is over the memory threshold - restarting it before this job.")
                update_status(job_dir, "Restarting Illustrator to free up memory...", 18)
                _quit_illustrator(prog_ids)
                time.sleep(2)
            else:
                logger.info("Illustrator is already open - reusing it; only its documents are closed.")
                update_status(job_dir, "Using the Illustrator that is already open...", 18)

        update_status(job_dir, "Connecting to Adobe Illustrator...", 20)

        for prog_id in prog_ids:
            if app: break
            
            logger.info(f"Attempting to connect to {prog_id}...")
            for attempt in range(3):
                try:
                    # Try to get active object first
                    try:
                        app = win32com.client.GetActiveObject(prog_id)
                        logger.info(f"Connected to active {prog_id}")
                        break
                    except Exception:
                        # If not running, try to Dispatch (which starts it)
                        app = win32com.client.Dispatch(prog_id)
                        logger.info(f"Dispatched new {prog_id}")
                        break
                except Exception as e:
                    logger.warning(f"Attempt {attempt+1} failed for {prog_id}: {e}")
                    if attempt < 2:
                        time.sleep(3)
                    else:
                        continue
        
        if not app:
            raise Exception("Could not connect to any version of Adobe Illustrator. Please ensure it is installed and licensed.")

        # Suppress all alerts and dialogs
        try:
            app.UserInteractionLevel = -1 # aiDontDisplayAlerts
            logger.info("UserInteractionLevel set to Silent mode")
        except Exception as e:
            logger.warning(f"Could not set Silent mode (RPC busy?): {e}")

        # Clean slate: a crashed previous job leaves its mockup/order docs open
        # in the reused Illustrator instance (the JSX only closes them on the
        # success path), where same-name swatches/groups can conflict with this
        # job. Close every leftover document without saving.
        try:
            leftover = int(app.Documents.Count)
            for _ in range(leftover):
                app.Documents.Item(1).Close(2)  # 2 = aiDoNotSaveChanges
            if leftover:
                logger.info(f"Closed {leftover} leftover document(s) from a previous run")
        except Exception as e:
            logger.warning(f"Could not close leftover documents: {e}")

        # Font pre-flight: must run NOW, with zero documents open. While any
        # document that uses a missing font is open, Illustrator registers the
        # substitute in app.textFonts under the ORIGINAL name, so getByName
        # succeeds and the missing font looks installed. Checking after
        # app.open (as the JSX used to) can therefore never detect anything.
        if not ignore_missing_fonts:
            update_status(job_dir, "Checking mockup fonts...", 25)
            xmp_font_names = _extract_ai_xmp_font_names(os.path.abspath(mockup_ai_path))
            if xmp_font_names:
                logger.info(f"Mockup XMP declares fonts: {xmp_font_names}")
            try:
                missing_fonts = _find_missing_fonts(app, xmp_font_names)
            except Exception as e:
                logger.warning(f"Font pre-flight probe failed, continuing without check: {e}")
                missing_fonts = []
            if missing_fonts:
                logger.info(f"Automation paused: missing fonts detected: {missing_fonts}")
                with open(os.path.join(job_dir, "status.json"), "w") as f:
                    json.dump({
                        "message": "Missing fonts detected - automation paused",
                        "progress": 25,
                        "is_ready": False,
                        "font_missing": True,
                        "missing_fonts": missing_fonts,
                    }, f)
                return None
            logger.info("Font pre-flight passed - all mockup XMP fonts are available.")

        # CENTER-MATCH pre-flight: must go through Illustrator (see
        # _mockup_has_center_object), so it runs here - after connecting,
        # with zero documents open (same precondition as the font check
        # above, restored since that check never leaves a document open).
        # Only relevant when both the Full Button Jersey and its Center
        # Match checkbox are on (see automate_production.jsx's FULL_BUTTON/
        # CENTER_MATCH gating) - a normal job is unaffected.
        if (plan_data.get("full_button_jersey") and plan_data.get("full_button_center_match")
                and not ignore_center_match_warning
                and not _mockup_has_center_object(app, mockup_ai_path)):
            logger.info("Automation paused: Center Match is checked but no object in the mockup is named 'Center'.")
            with open(os.path.join(job_dir, "status.json"), "w") as f:
                json.dump({
                    "message": "Center Match is checked, but no layer in the test print is named 'Center' - automation paused",
                    "progress": 27,
                    "is_ready": False,
                    "center_layer_missing": True,
                }, f)
            return None

        # PATTERN-MATCH pre-flight: same pattern as CENTER-MATCH above. Only
        # relevant when both the Full Button Jersey and its Pattern Match
        # checkbox are on (see automate_production.jsx's FULL_BUTTON/
        # PATTERN_MATCH gating) - a normal job, or a Full Button job with
        # Pattern Match left unchecked, is unaffected. There is no size-guess
        # fallback in the JSX anymore (removed - it grabbed the wrong shape
        # on a real job), so this pre-flight is the ONLY thing standing
        # between a checked Pattern Match box and a job that would otherwise
        # burn a full Illustrator run only to silently no-op on every size.
        if (plan_data.get("full_button_jersey") and plan_data.get("full_button_pattern_match")
                and not ignore_pattern_match_warning
                and not _mockup_has_pattern_object(app, mockup_ai_path)):
            logger.info("Automation paused: Pattern Match is checked but no object in the mockup is named 'Pattern'.")
            with open(os.path.join(job_dir, "status.json"), "w") as f:
                json.dump({
                    "message": "Pattern Match is checked, but no layer in the test print is named 'Pattern' - automation paused",
                    "progress": 27,
                    "is_ready": False,
                    "pattern_layer_missing": True,
                }, f)
            return None

        # SIDE-SEAM-MATCH pre-flight: same pattern as CENTER-MATCH above, but
        # this feature is a STANDALONE frontend checkbox (applies to any job
        # - not nested under Full Button Jersey, see automate_production.jsx's
        # SIDE_SEAM_MATCH gating).
        if (plan_data.get("front_back_side_match")
                and not ignore_side_seam_match_warning
                and not _mockup_has_side_seam_match_objects(app, mockup_ai_path)):
            logger.info("Automation paused: Side-Seam Match is checked but no matching 'Front side match'/'Back side match' (or explicit Left/Right) object pair exists in the mockup.")
            with open(os.path.join(job_dir, "status.json"), "w") as f:
                json.dump({
                    "message": "Side-Seam Match is checked, but the test print has no matching 'Front side match'/'Back side match' layer pair - automation paused",
                    "progress": 27,
                    "is_ready": False,
                    "side_seam_match_layer_missing": True,
                }, f)
            return None

        # LOCAL-TAG pre-flight: same pattern as CENTER-MATCH above. Only
        # relevant when the frontend's LOCAL TAG checkbox is on (applies to
        # every job type, not just Full Button Jersey - see
        # automate_production.jsx's LOCAL_TAG_ON gating).
        if (plan_data.get("local_tag_enabled")
                and not ignore_local_tag_warning
                and not _mockup_has_local_tag_elements(app, mockup_ai_path)):
            logger.info("Automation paused: LOCAL TAG is checked but the mockup has no 'LOCAL TAG' group with a 'SIZE' text frame inside it.")
            with open(os.path.join(job_dir, "status.json"), "w") as f:
                json.dump({
                    "message": "LOCAL TAG is checked, but the test print has no 'LOCAL TAG'/'SIZE' layer - automation paused",
                    "progress": 28,
                    "is_ready": False,
                    "local_tag_missing": True,
                }, f)
            return None

        # ARMHOLE SIDE SLEEVE MATCHING pre-flight: same pattern as CENTER-
        # MATCH above. Only relevant when the frontend's checkbox is on
        # (plan_data["match_sleeve_to_side"], applies to every job type -
        # see automate_production.jsx's SM_ON gating).
        if (plan_data.get("match_sleeve_to_side")
                and not ignore_armhole_match_warning
                and not _mockup_has_armhole_match_objects(app, mockup_ai_path)):
            logger.info("Automation paused: Armhole Side Sleeve Matching is checked but no 'armhole match' group with a 'unit...' item was found on the mockup's Back view.")
            with open(os.path.join(job_dir, "status.json"), "w") as f:
                json.dump({
                    "message": "Armhole Side Sleeve Matching is checked, but the test print has no 'armhole match'/'unit...' layer on the Back view - automation paused",
                    "progress": 29,
                    "is_ready": False,
                    "armhole_match_layer_missing": True,
                }, f)
            return None

        # HOODIE pre-flight: same pattern as CENTER-MATCH above. Only
        # relevant when the frontend's Hoodie checkbox is on (plan_data
        # ["hoodie"], independent of full_button_jersey - see
        # automate_production.jsx's HOODIE_ON gating). Checks BOTH the
        # pattern (Hood/Left/Right/Pocket/Border) and the mockup (Outside
        # Hood/Inside Hood/Left/Right/Border) since Hoodie needs named
        # groups in both files, unlike the mockup-only checks above.
        if (plan_data.get("hoodie")
                and not ignore_hoodie_warning
                and (not _pattern_has_hoodie_objects(app, pattern_ai_path)
                     or not _mockup_has_hoodie_objects(app, mockup_ai_path))):
            logger.info("Automation paused: Hoodie is checked but the pattern/mockup is missing a required Hood/Pocket/Border/Outside Hood/Inside Hood group.")
            with open(os.path.join(job_dir, "status.json"), "w") as f:
                json.dump({
                    "message": "Hoodie is checked, but the pattern or test print is missing a required Hood/Pocket/Border group - automation paused",
                    "progress": 29,
                    "is_ready": False,
                    "hoodie_layer_missing": True,
                }, f)
            return None

        # HOOD CENTRE DESIGN MATCH pre-flight: same pattern as CENTER-MATCH
        # above. Runs AFTER the Hoodie check on purpose - this feature is
        # nested under Hoodie, so if the hood groups themselves are missing the
        # user should be told THAT first rather than being sent hunting for a
        # "Center" object to put inside a group that doesn't exist.
        if (plan_data.get("hoodie_center_design_match")
                and not ignore_hood_center_match_warning
                and not _mockup_has_hood_center_match_objects(app, mockup_ai_path)):
            logger.info("Automation paused: Hood Center Design Match is checked but the mockup's Outside Hood has no 'Center' object in each of its Right/Left halves.")
            with open(os.path.join(job_dir, "status.json"), "w") as f:
                json.dump({
                    "message": "Hood Center Design Match is checked, but the test print's Outside Hood needs a layer named 'Center' inside each of its Right and Left halves - automation paused",
                    "progress": 29,
                    "is_ready": False,
                    "hood_center_match_layer_missing": True,
                }, f)
            return None

        # PATTERN-PIECE pre-flight: every panel name this order will make the
        # JSX look up must actually exist in the pattern file. UNCONDITIONAL,
        # unlike every check above - those guard one optional feature each, but
        # these names come from the order itself (part_name + size), so every
        # job has them and every job can get them wrong.
        #
        # Runs LAST of the pre-flights on purpose: a job with a broken feature
        # setup should hear about that feature first, and this check is the one
        # that reads the plan rather than a checkbox.
        #
        # Without it a missing panel is invisible until the run is over - the
        # JSX logs "CRITICAL: Could not find '<name>' in Master Pattern
        # document. Skipping." (automate_production.jsx:824) and keeps going, so
        # the operator waits out a full render for an order file that is quietly
        # short a piece.
        if not ignore_pattern_piece_warning:
            update_status(job_dir, "Checking pattern piece names...", 29)
            missing_pieces = _find_missing_pattern_pieces(app, pattern_ai_path, plan_data)
            if missing_pieces:
                logger.info(f"Automation paused: pattern file has no panel for: {missing_pieces}")
                with open(os.path.join(job_dir, "status.json"), "w") as f:
                    json.dump({
                        "message": (
                            f"{len(missing_pieces)} pattern piece(s) named in the order "
                            "were not found in the pattern file - automation paused"
                        ),
                        "progress": 29,
                        "is_ready": False,
                        "pattern_piece_missing": True,
                        "missing_pattern_pieces": missing_pieces,
                    }, f)
                return None
            logger.info("Pattern-piece pre-flight passed - the pattern file has every panel this order needs.")

        update_status(job_dir, "Opening Pattern file...", 30)

        # Robust opening with path normalization
        abs_pattern_path = os.path.abspath(pattern_ai_path).replace("\\", "/")
        logger.info(f"Opening pattern: {abs_pattern_path}")
        
        doc = None
        for attempt in range(3):
            try:
                doc = app.Open(abs_pattern_path)
                logger.info("Pattern file opened successfully")
                break
            except Exception as e:
                logger.warning(f"Open attempt {attempt+1} failed: {e}")
                if attempt < 2:
                    time.sleep(2) # Wait and retry
                else:
                    raise e
        
        if not doc:
            raise Exception("Failed to open pattern file after multiple attempts.")
        
        # Get the directory where this file is located
        service_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(service_dir)
        
        jsx_script_path = os.path.abspath(os.path.join(backend_dir, "scripts", "automate_production.jsx"))
        json_polyfill_path = os.path.abspath(os.path.join(backend_dir, "scripts", "json2.jsx"))
        
        # Ensure arguments use forward slashes and absolute paths
        ref_path_arg = f"'{os.path.abspath(reference_ai_path).replace('\\', '/')}'" if reference_ai_path else "undefined"
        logo_lib_arg = f"'{os.path.abspath(logo_library_ai_path).replace('\\', '/')}'" if logo_library_ai_path else "undefined"

        script_args = (
            f"var planPath = '{plan_json_path.replace('\\', '/')}'; "
            f"var outputDir = '{render_dir.replace('\\', '/')}'; "
            f"var mockupPath = '{os.path.abspath(mockup_ai_path).replace('\\', '/')}'; "
            f"var jobDir = '{job_dir.replace('\\', '/')}'; "
            f"var jobId = '{job_id}'; "
            f"var referencePath = {ref_path_arg}; "
            f"var logoLibraryPath = {logo_lib_arg};"
        )
        
        # Read polyfill and main script
        with open(json_polyfill_path, "r") as f:
            json_polyfill = f.read()
        with open(jsx_script_path, "r") as f:
            jsx_code = f.read()
        
        # Create a combined script file for this specific job
        combined_script_path = os.path.abspath(os.path.join(job_dir, "automation_bundle.jsx"))
        with open(combined_script_path, "w") as f:
            f.write("// AI Apparel Automation Bundle\n")
            f.write(json_polyfill + "\n")
            f.write("// Arguments\n")
            f.write(script_args + "\n")
            f.write("// Main Logic\n")
            f.write(jsx_code)

        update_status(job_dir, "Rendering Apparel Parts (this may take a minute)...", 50, False)

        # Watchdog: DoJavaScript blocks this thread until the JSX finishes.
        # The JSX updates status.json per part, so a stale file means the
        # script is stuck; killing Illustrator makes the COM call return.
        status_path = os.path.join(job_dir, "status.json")
        watchdog_stop = threading.Event()

        def _watchdog():
            while not watchdog_stop.wait(15):
                try:
                    age = time.time() - os.path.getmtime(status_path)
                except OSError:
                    continue
                if age > WATCHDOG_STALE_SECONDS:
                    watchdog_fired.set()
                    logger.error(f"Watchdog: no status update for {int(age)}s - killing Illustrator")
                    _kill_illustrator_process()
                    return

        watchdog = threading.Thread(target=_watchdog, daemon=True)
        watchdog.start()

        # Bulletproof execution: Use $.evalFile to load the bundle
        # This bypasses COM's DoJavaScriptFile which can be flaky with paths/args
        eval_command = f"$.evalFile(new File('{combined_script_path.replace('\\', '/')}'))"
        try:
            app.DoJavaScript(eval_command)
        finally:
            watchdog_stop.set()
        
        # The JSX script will update status to 100% and is_ready: true
        # But we do a final verification and zip generation here
        
        # Wait a moment for files to settle
        time.sleep(2)

        update_status(job_dir, "Cleaning up and generating Zip package...", 90, False)
        
        # Copy the plan to the zip folder for reference
        shutil.copy(plan_json_path, os.path.join(render_dir, "production_plan.json"))
        
        doc.Close(2)

        # Before zipping: Illustrator exports the pixels but no dpi tag, so the
        # renders would still read as 96/72 dpi at 4x their real size.
        _stamp_jpeg_dpi(render_dir)

        zip_base_name = os.path.join(job_dir, f"order_{job_id}_ready")
        # Archived as job_dir/<job name>/... so the zip unpacks into ONE folder
        # named after the job, holding the size folders - not a loose spray of
        # size folders into whatever directory the user unzipped in.
        shutil.make_archive(zip_base_name, 'zip', job_dir, os.path.basename(render_dir))

        # Side<->sleeve matching: surface any skipped parts to the user. The
        # JSX writes them to jobDir (for this status) and to the renders folder
        # (sleeve_match_warnings.txt + debug_log.txt entries inside the zip).
        sm_warnings = []
        if os.path.exists(sm_warn_path):
            try:
                with open(sm_warn_path, "r") as f:
                    sm_warnings = json.load(f).get("warnings", [])
            except Exception as e:
                logger.warning(f"Could not read sleeve match warnings: {e}")
        if sm_warnings:
            logger.warning(f"Sleeve-match skipped for {len(sm_warnings)} part(s): {sm_warnings}")

        # BACK-LABEL: same warnings-file pattern as sleeve-match above (the
        # JSX writes jobDir/back_label_warnings.json for this status, and
        # renders/back_label_warnings.txt + debug_log.txt entries into the zip).
        bl_warnings = []
        if os.path.exists(bl_warn_path):
            try:
                with open(bl_warn_path, "r") as f:
                    bl_warnings = json.load(f).get("warnings", [])
            except Exception as e:
                logger.warning(f"Could not read back label warnings: {e}")
        if bl_warnings:
            logger.warning(f"Back-label fallback used for {len(bl_warnings)} part(s): {bl_warnings}")

        # PARM ERRORS: the JSX deletes and rebuilds a failing panel from scratch
        # three times before it lands here, so anything in this list is a panel
        # that FAILED outright - incomplete artwork that needs a human to finish
        # it, not a soft warning.
        parm_errors = []
        if os.path.exists(parm_err_path):
            try:
                with open(parm_err_path, "r") as f:
                    parm_errors = json.load(f).get("errors", [])
            except Exception as e:
                logger.warning(f"Could not read PARM errors: {e}")
        if parm_errors:
            logger.error(f"PARM error - {len(parm_errors)} panel(s) failed: {parm_errors}")

        # THE JSX ABORTED. automate_production.jsx's top-level catch writes
        # error_log.txt and stops - so this is not a warning about one panel, it
        # is "the run ended here and everything after it was never built".
        #
        # NOTHING read this file until 2026-09-03. Job Knuckle_Headz_Mint_Order-2
        # crashed part-way through XL, wrote S/M/L and never built XL, 2XL or
        # Universal - and still reported "Production Ready! Ready for download."
        # The only trace was a file no code opened.
        #
        # is_ready stays True on purpose: the sizes that DID finish are real and
        # the designer should be able to take them. What changes is that the
        # message leads with INCOMPLETE, so nobody ships it believing it is whole.
        jsx_error = None
        jsx_err_path = os.path.join(render_dir, "error_log.txt")
        if os.path.exists(jsx_err_path):
            try:
                with open(jsx_err_path, "r") as f:
                    jsx_error = " ".join(f.read().split())
            except Exception as e:
                jsx_error = f"(error_log.txt exists but could not be read: {e})"
        if jsx_error:
            logger.error(f"JSX ABORTED - the run did not finish: {jsx_error}")
            update_status(
                job_dir,
                "INCOMPLETE - the render stopped early (" + jsx_error + "). "
                "Any size after that point was NOT built - check which .ai files exist "
                "before using this order.",
                100, True, warnings=sm_warnings or None,
                back_label_warnings=bl_warnings or None, parm_errors=parm_errors or None,
            )
            return f"{zip_base_name}.zip"

        if sm_warnings or bl_warnings or parm_errors:
            parts = []
            if parm_errors:
                parts.append(f"PARM error: {len(parm_errors)} panel(s) FAILED")
            if sm_warnings:
                parts.append(f"sleeve matching was skipped on {len(sm_warnings)} part(s)")
            if bl_warnings:
                parts.append(f"the back label used a fallback position on {len(bl_warnings)} part(s)")
            update_status(
                job_dir,
                "Production Ready - but " + " and ".join(parts) + ". Check them manually.",
                100, True, warnings=sm_warnings or None, back_label_warnings=bl_warnings or None,
                parm_errors=parm_errors or None,
            )
        else:
            update_status(job_dir, "Production Ready! Ready for download.", 100, True)
        return f"{zip_base_name}.zip"

    except Exception as e:
        logger.exception("Illustrator Automation failed")
        if watchdog_fired.is_set():
            update_status(
                job_dir,
                f"Error: Job stuck - no progress for {WATCHDOG_STALE_SECONDS // 60} minutes, "
                "Illustrator was closed. Check debug_log.txt in the job's render folder for the last step.",
                0, is_ready=False,
            )
        else:
            update_status(job_dir, f"Error: {str(e)}", 0, is_ready=False)
        return None
    finally:
        # Illustrator is ALWAYS left running. It is the designer's application,
        # not this job's: quitting it at the end is the same disruption as
        # quitting it at the start, and on the unsaved-work pause it would
        # destroy the exact work the job stopped to protect. Only the documents
        # are cleared, so what stays behind is an empty Illustrator - ready for
        # the next job (which reuses it) or for the person to carry on in.
        #
        # On the unsaved-work pause `app` is still None, because that check
        # runs before this job connects to anything. Nothing below executes and
        # the designer's open documents are never touched.
        try:
            if app is not None:
                try:
                    leftover = int(app.Documents.Count)
                    for _ in range(leftover):
                        app.Documents.Item(1).Close(2)  # 2 = aiDoNotSaveChanges
                    if leftover:
                        logger.info(f"Closed {leftover} of this job's document(s) - Illustrator left open and empty")
                except Exception as e:
                    logger.warning(f"Could not close this job's documents: {e}")

                # Collect the ExtendScript side NOW, with every document already
                # closed and runAutomation() long returned - so its locals, and
                # the big one among them, are unreachable: _nameIndexes holds a
                # reference to every named item in the 135MB pattern, built over
                # ~4 minutes (see _buildNameIndex). It is function-scoped, so it
                # does become garbage on its own; ExtendScript's collector just
                # runs when it feels like it, and nothing here ever asked. Since
                # Illustrator is now reused across jobs instead of relaunched,
                # "eventually" is no longer good enough.
                try:
                    app.DoJavaScript("$.gc()")
                    logger.info("ExtendScript garbage collection requested")
                except Exception as e:
                    logger.warning(f"Could not run ExtendScript gc: {e}")
                # Silent mode was set for the automation's benefit. Leaving it
                # on means the person's next save/close dialog never appears.
                try:
                    app.UserInteractionLevel = 1  # aiDisplayAlerts
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Could not tidy Illustrator at the end of the job: {e}")
        pythoncom.CoUninitialize()
