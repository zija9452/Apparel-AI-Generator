function runAutomation() {
    try {
        if (typeof planPath === 'undefined') return;

        var planFile = new File(planPath);
        planFile.open("r");
        var plan = JSON.parse(planFile.read());
        planFile.close();

        var patternDoc = app.activeDocument;
        
        function updateStatus(msg, prog, isReady) {
            if (typeof jobDir !== 'undefined') {
                var statusFile = new File(jobDir + "/status.json");
                statusFile.open("w");
                statusFile.write(JSON.stringify({ "message": msg, "progress": prog, "is_ready": !!isReady }));
                statusFile.close();
            }
        }

        // Live logging: open/append/close per write so the log is readable on
        // disk WHILE the job runs. A single buffered handle stays 0 bytes until
        // close, which leaves a stuck job with no diagnostics at all.
        var logPath = outputDir + "/debug_log.txt";
        var logInit = new File(logPath); logInit.open("w"); logInit.close();
        function log(msg) {
            var f = new File(logPath);
            if (f.open("a")) { f.writeln(new Date().toTimeString() + ": " + msg); f.close(); }
        }
        
        // MUST be initialized HERE, not next to renameSizeTags further down.
        // runAutomation() is one long function body: the per-item processing
        // loop (search "START PROCESSING PART") is an inline statement that
        // runs LONG BEFORE the `var` statements written lower in the file are
        // ever executed. `var` hoists the declaration but not the assignment,
        // so this list read as `undefined` inside the loop and
        // `RENAME_SIZE_WORDS.length` threw a TypeError that renameSizeTags'
        // outer `try { recurse(...) } catch (eR) {}` swallowed silently -
        // reported to the user as "no '<size>' tag text found to update".
        // It only bit tags whose text does NOT equal the size label exactly
        // (the exact test short-circuits before the list is touched), which is
        // why "Small" sleeves renamed fine while "X-Large"/"2X-Large" sleeves
        // and the "s" hood tag silently kept their pattern-file text.
        var RENAME_SIZE_WORDS = [
            "xs", "xsmall", "extrasmall",
            "small",
            "medium",
            "large",
            "xl", "xlarge", "extralarge",
            "2xl", "xxl", "2xlarge", "xxlarge", "extraextralarge",
            "3xl", "xxxl", "3xlarge", "xxxlarge",
            "4xl", "xxxxl", "4xlarge",
            "5xl", "xxxxxl", "5xlarge"
        ];
        // Same hoisting rule as above - keep this at the top too.
        //
        // Aliases grouped PER SIZE, accepted only for the size currently being
        // processed. RENAME_SIZE_WORDS above matches any size word at all (so a
        // pattern that says "X-Large" still renames on an "XL" order), but a
        // bare "S"/"M"/"L" is far too easy to hit by accident on unrelated
        // artwork to be safe in that global list - scoped here instead.
        // Needed because this job's Hood pieces carry a one-letter tag ("s"),
        // which matched neither "small" nor anything in the global list, so
        // Small hoods silently kept their pattern text while XL/2XL hoods
        // (tagged "XL"/"2XL", an exact match) renamed fine.
        var SIZE_ALIAS_GROUPS = [
            ["xs", "xsmall", "extrasmall"],
            ["s", "small", "sm"],
            ["m", "medium", "med"],
            ["l", "large", "lg"],
            ["xl", "xlarge", "extralarge"],
            ["2xl", "xxl", "2xlarge", "xxlarge", "extraextralarge"],
            ["3xl", "xxxl", "3xlarge", "xxxlarge"],
            ["4xl", "xxxxl", "4xlarge"],
            ["5xl", "xxxxxl", "5xlarge"]
        ];

        updateStatus("Automation started", 40, false);
        log("Automation started");
        
        var mockupDoc = app.open(new File(mockupPath));
        log("Mockup opened");

        // LOGO LIBRARY (optional): a separate .ai file where each logo is its
        // own named Layer/Group. Matched by name (via findAnywhere, same
        // engine as part-lookup) against Excel '<Part> Logo' column values.
        // Not provided -> logoLibraryDoc stays null and any LOGO replacement
        // is skipped with a warning (see applyLogoReplacements).
        var logoLibraryDoc = null;
        if (typeof logoLibraryPath !== 'undefined' && logoLibraryPath) {
            try {
                logoLibraryDoc = app.open(new File(logoLibraryPath));
                log("Logo library opened: " + logoLibraryPath);
            } catch (eLogoLib) {
                log("WARNING: Could not open logo library file: " + eLogoLib.message);
                logoLibraryDoc = null;
            }
        }

        // NOTE: The missing-font pre-flight lives in Python
        // (illustrator_automation.py), BEFORE any document is opened. Checking
        // here is impossible: once a document with a missing font is open,
        // Illustrator lists the substitute in app.textFonts under the original
        // name, so getByName always succeeds.

        // NO SWATCH ISOLATION. This used to rename every mockup swatch to
        // "MOCK_<name>", meant to stop a duplicated design from adopting the ink of
        // an order-doc swatch that shared its name. It cost more than it bought:
        // Illustrator carried the alias into the order document with the art, so
        // the saved file listed each ink twice ("186" AND "MOCK_186", identical
        // values) - the duplicate pair reported from the swatch panel.
        //
        // It was not buying protection either. The clash it guarded against cannot
        // arise here: clearOrderDocSwatches empties the order document, and every
        // named color in the job comes from the mockup alone (the pattern/reference
        // files carry no named swatches - their plates are plain CMYK), while
        // Illustrator keeps swatch names unique inside one document. Even when a
        // clash IS constructed, processSubColor resolves it on the MOCK_-stripped
        // name (officialSpots[cleanName]) and hands the order document's swatch the
        // win regardless - so the prefix changed the debug log, never the ink.
        //
        // Without it, the first paste brings each mockup swatch across under its
        // real name and every later design links straight to that one swatch:
        // one ink, one swatch, direct link. The MOCK_ handling further down is kept
        // as a guard for a mockup that already carries such names; on a normal job
        // it never fires.

        // Fixed gaps between artboards: 5mm horizontally, 15mm vertically
        // between rows (both in points; 1mm = 2.83465pt). Replaces the old
        // 1000pt vertical gap and the even-older behavior of measuring the
        // reference file's artboard gap.
        var refContext = { spacing: 5 * 2.83465, vSpacing: 15 * 2.83465 };
        log("Artboard spacing fixed: 5mm (" + refContext.spacing.toFixed(2) + "pt) horizontal, 15mm (" + refContext.vSpacing.toFixed(2) + "pt) vertical");

        // Measured HERE, while the order document still does not exist - see
        // prebuildPatternSizes for why this must not happen any later.
        prebuildPatternSizes();
        prebuildFullButtonScales();

        updateStatus("Creating new Order file...", 45, false);
        var orderDoc = app.documents.add(DocumentColorSpace.CMYK);
        log("New Order document created (CMYK)");

        // 0. CLEAN SLATE: Delete all default swatches to avoid confusion
        clearOrderDocSwatches(orderDoc);

        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        // CMYK-DIRECT FLOW: no global base-color detection. Each part's panel
        // color comes from that part's own design in the test print (see
        // getDesignBaseFill), so the fill is applied per-part exactly as drawn
        // (solid/spot/gradient). Excel color_mapping is retired with the old
        // RGB flow.

        // ORDER FILE OVERFLOW -> CONTINUE IN THE NEXT .ai FILE
        // Illustrator's canvas is a fixed 227.54in square (~16383pt, i.e. only
        // about +-8190pt around the origin), so the tiled layout can only run so
        // far down before a size lands off the canvas entirely - artboards.add()
        // cannot even create an artboard out there, so those pieces export
        // wrong or not at all (reported job: 6 sizes fitted, the 7th - 2XL -
        // hung below the canvas edge).
        // Rule: when the next piece would cross ORDER_FLOOR_Y, the current order
        // document is saved + closed and a fresh one is started, so the flow
        // continues from the top of a new file:
        //     production_ready_order.ai, production_ready_order_2.ai, ...
        // A whole size is kept together in ONE file whenever it fits in an empty
        // one (checked once at the size boundary, see estimateSizeGroupHeight).
        // A size too big for even an empty file is split across files rather
        // than pushed off the canvas - per explicit instruction.
        // ORDER_FLOOR_Y keeps ~690pt of slack to the real canvas edge, which is
        // what absorbs the pieces that deliberately skip the check because they
        // anchor to a piece already placed above them (Rib & Cuff under its
        // Sleeve, the second short sleeve of a stacked pair, a Full-Button
        // Front-Right beside its Front-Left, and the Hoodie extras).
        var ORDER_TOP_Y = 8000;    // where every order document's flow starts
        var ORDER_FLOOR_Y = -7500; // no new row may start below this
        var orderDocIndex = 1;     // 1 -> production_ready_order.ai
        var orderDocFiles = [];    // every file name actually saved, in order
        // SPLIT PER SIZE: a SECOND reason to start a new order file, on top of
        // the canvas-overflow rule above. Set by illustrator_automation.py when
        // the mockup on disk is over 5 MB (see the note there for the measured
        // reasoning) - never a checkbox, so nothing changes for a light mockup.
        //
        // The effect is one .ai per size instead of one .ai per canvas-full:
        // ~10 panels per document instead of 40+, which is what the export
        // slowdown and the end-of-run PARM failures were both traced to.
        // Everything else - saving, closing, flushing the export queue, dropping
        // the cross-document caches - is startNextOrderDoc's existing job.
        var SPLIT_PER_SIZE = (plan.split_per_size === true);
        // The size that owns the file currently being built, and how many files
        // that size has needed so far (a size too tall for one canvas still
        // splits, and its second file becomes _Large_2.ai). "Universal"
        // deliberately never sets this: accessories are one shared piece for the
        // whole order, not a size, so they stay in whichever file is open -
        // normally the last size's - per explicit instruction.
        var orderDocLabel = null;
        var orderLabelSeen = {};
        var margin = 500, currentX = -7500, currentY = ORDER_TOP_Y, artboardCount = 0, rowMaxHeight = 0;
        // Continuous per-part instance numbering (replaces the old _Item/_Qty suffixes)
        var partCounters = {};

        // ARMHOLE SIDE SLEEVE MATCHING: side <-> sleeve design matching,
        // gated by the frontend checkbox (plan.match_sleeve_to_side, default
        // OFF - zero effect on normal jobs). The mockup names the design(s)
        // to match inside a group called "armhole match", with each design
        // piece inside it named "unit1"/"unit 1", or "unit left 1"/
        // "unit right 1" when the left and right sides carry independent
        // designs (see _smGetUnitSets below for the full naming rule).
        // D = the straight pen-tool distance from the -7mm seam corner to
        // where a unit stops covering the seam line - measured from BOTH
        // the bottom (underarm) corner and the mirrored top (shoulder)
        // corner, whichever is closer, independently for every unit. Front
        // and back are assumed identical (user-confirmed), so the first
        // successful body panel's measurements drive the matching sleeve.
        // illustrator_automation.py's pre-flight refuses to start the job
        // at all when this is checked but no "armhole match" group exists
        // anywhere in the mockup (same convention as CENTER_MATCH/PATTERN_
        // MATCH/LOCAL_TAG above).
        var SM_ON = (plan.match_sleeve_to_side === true);
        // ARMHOLE MATCH - HOW TO ADJUST (plan.sleeve_match_mode, a frontend
        // radio under the Armhole checkbox). The designer usually already knows
        // which single correction their artwork needs for this article, so they
        // pick it per job and ONLY that correction is applied:
        //   "auto"       -> the built-in behaviour. THE DEFAULT, and what a
        //                   missing/unknown value resolves to, so an untouched
        //                   form (or a legacy plan.json) runs exactly as before.
        //                   Left/right-tagged units slide sideways first, then
        //                   up/down, and resize only if sliding cannot close the
        //                   gap; a continuous unit never slides sideways and
        //                   resizes first when the whole piece is drawn at the
        //                   wrong size for the panel.
        //   "horizontal" -> ONLY sideways movement (the left piece moves left/
        //                   right, the right piece moves left/right). No up/down,
        //                   no resize.
        //   "vertical"   -> ONLY up/down movement. No sideways, no resize.
        //   "resize"     -> ONLY a proportional resize. Nothing moves.
        // Whatever the chosen mode cannot fix is reported as an ordinary
        // sleeve-match skip warning - never silently "fixed" a different way.
        // Read by _smSolveUnit (which corrections it may use) and
        // smApplyRibbonGap (a width match is a resize, so the two move-only
        // modes skip it).
        var SM_MODE = (plan.sleeve_match_mode === "horizontal" || plan.sleeve_match_mode === "vertical" || plan.sleeve_match_mode === "resize")
            ? plan.sleeve_match_mode
            : "auto";
        if (SM_ON) log("SLEEVE-MATCH: adjustment mode = " + SM_MODE + ".");
        // FULL-BUTTON JERSEY: gated by the frontend checkbox
        // (plan.full_button_jersey, default OFF - zero effect on normal
        // jobs). Splits the generic "front" part into Front Left + Front
        // Right (full quantity each - every unit needs BOTH pieces, unlike
        // the sleeve L/R split which halves one shared quantity), and makes
        // Placket a per-size panel instead of one Universal piece (a button
        // placket's length scales with garment size).
        var FULL_BUTTON = (plan.full_button_jersey === true);
        // CENTER_MATCH and PATTERN_MATCH below only ever apply inside Full
        // Button Jersey and are separately opt-in (frontend checkboxes nested
        // under Full Button Jersey, default OFF) - each is independent extra
        // risk on top of the base Front-Left/Front-Right split, so a job that
        // just wants the split without either matching feature is unaffected.
        var CENTER_MATCH = (plan.full_button_center_match === true);
        // FRONT/BACK STRIPES MATCH: STANDALONE, every garment type. Internal
        // helpers are still named "shoulder" (pmApplyBackShoulderMatch/
        // pmMeasureShoulderTarget) since that IS the mechanism: Back's own
        // Match_ shape is resized so its shoulder-to-shape distance equals the
        // FRONT's, keeping the two panels' designs visually aligned.
        //
        // TWO checkboxes reach this one flag, deliberately:
        //   - plan.full_button_front_back_match - the ORIGINAL, still nested
        //     under Full Button Jersey on the form, KEPT EXACTLY AS IT WAS. It
        //     is ANDed with FULL_BUTTON here, which is what every call site
        //     used to do individually, so a stray true on a non-full-button
        //     job still means nothing - unchanged behaviour for every existing
        //     job and every plan.json saved before this.
        //   - plan.front_back_stripes_match - NEW, its own top-level checkbox,
        //     no group, no parent. Turns the SAME logic on for any garment.
        //
        // The logic itself needed nothing full-button-specific: it measures ONE
        // front shoulder and applies that single distance to BOTH of Back's
        // shoulders. So it now runs on whichever front part the job actually
        // has - Front-Left when FULL_BUTTON splits the front, the plain "front"
        // panel otherwise (normal jersey AND hoodie alike).
        var FRONT_BACK_MATCH = (plan.front_back_stripes_match === true ||
                                (FULL_BUTTON && plan.full_button_front_back_match === true));
        // PATTERN MATCH: gated by its own frontend checkbox (nested under
        // Full Button Jersey, default OFF). ONLY runs the striped/background
        // seam-continuity shift (pmProcessStripeSeam/pmStripeSeamShift) when
        // ON, and ONLY ever touches an object whose name normalizes to
        // exactly "pattern" (pmFindPatternGroup) - no area-based guessing.
        // illustrator_automation.py's pre-flight refuses to start the job at
        // all when this is checked but no "Pattern" name exists anywhere in
        // the mockup (same convention as CENTER_MATCH/"Center" above).
        var PATTERN_MATCH = (plan.full_button_pattern_match === true);
        // SIDE-SEAM MATCH (Front <-> Back torso side seam): gated by its own
        // STANDALONE frontend checkbox (plan.front_back_side_match, default
        // OFF) - unlike CENTER_MATCH/FRONT_BACK_MATCH/PATTERN_MATCH above,
        // this is NOT nested under Full Button Jersey and only ever fires
        // for a PLAIN "front"/"back" part (isFront/isBack) - a job that
        // splits Front into Front-Left/Front-Right (FULL_BUTTON on) simply
        // never has a plain "front" part for this to trigger on.
        // Naming (no area-based guessing, same convention as Center/Pattern
        // above):
        //   - "Front side match" + "Back side match" (generic, no Left/
        //     Right) -> ONE seam only: Front's own RIGHT edge <-> Back's
        //     own LEFT edge.
        //   - "Front Left side match" + "Back Right side match" (explicit)
        //     -> Front's LEFT edge <-> Back's RIGHT edge.
        //   - "Front Right side match" + "Back Left side match" (explicit)
        //     -> Front's RIGHT edge <-> Back's LEFT edge.
        //   Explicit Left/Right pairs can appear together (both side seams
        //   matched independently) or alone. illustrator_automation.py's
        //   pre-flight refuses to start the job at all when this is checked
        //   but none of the above name pairs exist anywhere in the mockup.
        var SIDE_SEAM_MATCH = (plan.front_back_side_match === true);
        // SLEEVE RIB/CUFF DISTANCE: gated by the frontend checkbox
        // (plan.preserve_sleeve_rib_distance, default OFF - the rib/cuff
        // bottom line is left alone and just scales normally with the rest
        // of the design, like any other artwork). When ON, the line's
        // distance-from-panel-bottom and height are read back from the
        // mockup (test print) instead of a hardcoded constant - see the
        // "Organizing Sleeve Bottom/Cuff design" block below.
        var PRESERVE_RIB_DISTANCE = (plan.preserve_sleeve_rib_distance === true);
        // LOCAL TAG: gated by the frontend checkbox (plan.local_tag_enabled,
        // default OFF - processLocalTagLabel is never called for a job that
        // doesn't check it, so a mockup without a "LOCAL TAG" group is
        // unaffected). When ON, illustrator_automation.py's pre-flight check
        // requires the mockup to have a "LOCAL TAG" group with a "SIZE" text
        // frame inside it before the job is even allowed to start.
        var LOCAL_TAG_ON = (plan.local_tag_enabled === true);
        // NECK CONTRAST: gated by the frontend checkbox (plan.neck_contrast,
        // default OFF). Was unconditional for every neck/collar/rib part - it
        // forced every text frame (and every path named label/size/logo) inside
        // that piece to pure white or pure black, judged against the panel's own
        // fill. That is right for a plain neck strip whose only artwork is brand
        // text, and wrong for a neck the designer actually coloured, because
        // smartContrast is called WITHOUT skipDesignGroup here and so walks into
        // 'design_clip_group' and flattens the pasted mockup artwork too.
        // Unchecked, the neck now renders exactly as the mockup and pattern drew
        // it - the same "normal" path every other part already takes.
        var NECK_CONTRAST_ON = (plan.neck_contrast === true);
        // HOODIE: gated by the frontend checkbox (plan.hoodie, default OFF -
        // zero effect on normal jobs). Independent of full_button_jersey.
        // When ON, adds Outside Hood/Inside Hood/Border/Pocket on top of the
        // normal Front/Back/Sleeve flow - see the HOODIE-prefixed blocks
        // below for pre-flight validation and per-part construction.
        var HOODIE_ON = (plan.hoodie === true);
        // HOOD CENTER DESIGN MATCH: gated by its own frontend checkbox NESTED
        // under Hoodie (plan.hoodie_center_design_match, default OFF), so it
        // is ANDed with HOODIE_ON here rather than trusted on its own - a
        // stale flag on a non-hoodie plan can then never reach the hood code.
        // Joins a design crossing the hood's centre seam across the OUTSIDE
        // Hood's two halves only (Inside Hood is deliberately untouched, per
        // explicit instruction). Named objects live inside the mockup's
        // "Hood Outside" group: an object named "Center" in its Right child and
        // another named "Center" in its Left child - ONE short word to remember,
        // deliberately the SAME word the full-button placket match uses.
        //
        // Reusing that word across the two features is safe because every lookup
        // is scoped to one panel's own pasted design: hcmFindNamed only ever
        // walks a hood half's design, pmCollectSeamArt only ever walks a front
        // panel's, and neither branch contains the other. (Was "Right side
        // match"/"Left side match" - two long names for what is one idea.)
        // illustrator_automation.py's pre-flight refuses to start the job when
        // this is checked but that name pair is missing (same convention as
        // SIDE_SEAM_MATCH above).
        var HOOD_CENTER_MATCH = (HOODIE_ON && plan.hoodie_center_design_match === true);
        // DESIGN SCALE MODE: a job-wide frontend choice (plan.design_scale_mode),
        // NOT nested under any garment type - it applies to full-button, hoodie
        // and normal jerseys alike, per explicit instruction.
        //   "height" -> uniform, aspect-preserving scale driven by HEIGHT only
        //               (pmAlignAndScaleToHeight). Width is whatever the design's
        //               own proportion gives; anything wider than the panel is
        //               trimmed by design_clip_group. THE DEFAULT, and what a
        //               missing/unknown value resolves to - it is what full-button
        //               jerseys already did unconditionally, so an untouched form
        //               reproduces that garment's tested output exactly.
        //   "both"   -> alignAndScale's two-axis INDEPENDENT stretch: width and
        //               height each get their own %, so the design is squeezed to
        //               fill the panel exactly. What normal and hoodie jobs did
        //               before this control existed; now opt-in.
        //
        // This overrides the full-button-specific behaviour rather than sitting
        // beside it (explicit instruction): on "both" a full-button job stretches
        // like any other, even though height-only used to be unconditional there.
        // On "height", full button KEEPS its extra shared-% layer (all three
        // panels forced to Back's one %, see pmFullButtonScale) - that layer is
        // about consistency ACROSS panels, a different problem from which axes
        // scale, and normal/hoodie jobs deliberately do not get it: each of their
        // panels computes its own height fit.
        //
        // Neck used to be carved out of this and always went through
        // alignAndScale's two-axis stretch, on the reasoning that it is an
        // edge-to-edge strip (see alignAndScale's zero margins for isNeck) and
        // an aspect-preserving fit would leave it short. That exception is
        // REMOVED on explicit instruction: the neck now follows the same
        // height-driven uniform scale as every other part, so its artwork keeps
        // its proportions instead of being stretched sideways to fill the strip.
        // Anything the uniform fit leaves narrower than the panel is trimmed /
        // left as panel fill exactly as it is everywhere else.
        // Tested against "both", not "height", so that an absent key (a legacy or
        // hand-written plan.json from before this control existed) lands on the
        // default rather than silently taking the opt-in branch.
        var SCALE_HEIGHT_ONLY = (plan.design_scale_mode !== "both");
        //   "height_sides" -> the SAME height-driven uniform scale as "height",
        //               plus SIDE-ANCHOR: anything the designer named "side" in the
        //               Front/Back mockup design is pushed back onto its own side
        //               seam afterwards (see anchorSideGraphicsToSeam). A uniform
        //               scale cannot widen the design to the panel, so side-seam
        //               artwork otherwise ends up floating in the middle of a
        //               graded panel. Opt-in, and the only extra thing it does -
        //               every other panel/part behaves exactly as on "height".
        var SIDE_ANCHOR = (plan.design_scale_mode === "height_sides");
        // PATTERN OUTLINE STROKE: every pattern piece's own cut outline is pinned
        // to this width. Patterns arrive drawn at 1pt; the mockup's matching
        // 'base-path' is drawn at 3pt, and since the panel takes its FILL from
        // that base-path but never its stroke, the two disagreed - which also
        // skewed scaling, because alignAndScale/pmAlignAndScaleToHeight measure
        // visibleBounds and visibleBounds includes the stroke. Measured on this
        // job: panel 2058.80pt visible vs design 2063.07pt, i.e. a 99.79% scale
        // where 100% was intended. Matching the widths closes that gap.
        // Applied by applyPatternOutlineStroke - outline only, never the design
        // artwork or the size-tag box.
        var PATTERN_OUTLINE_PT = 3;
        // JPEG EXPORT RESOLUTION: exportFile maps 1pt -> 1px at 100% scale, i.e.
        // 72 ppi, which is why the renders came out screen-res (Windows reports
        // them as "96 dpi" only because Illustrator writes no density unit into
        // the JFIF header at all - see stampJpegDpi in illustrator_automation.py,
        // which stamps the real number afterwards). Print needs 300 ppi, so the
        // export is scaled by 300/72. Keep both numbers together: the scale here
        // and the stamped dpi there must describe the same image.
        var EXPORT_DPI = 300;
        var EXPORT_SCALE_PCT = EXPORT_DPI / 72 * 100; // 416.667% -> true 300 ppi
        var SM_MM = 2.83465, SM_TOL_PT = 0.5 * SM_MM; // verify tolerance: +/-0.5mm
        var SM_SEAM_PT = 7 * SM_MM; // sewing seam allowance: D is measured on the
                                    // -7mm inset (the stitch line), matching how
                                    // the customer measures with Ctrl+` offset
        // SIDE-SEAM MATCH: how far Back travels when the torso side seam is
        // closed = 14mm simulated sewing overlap (Front's own 7mm + Back's own
        // 7mm seam allowance, same SM_MM constant as SM_SEAM_PT above) PLUS the
        // real distance between the two panels' cut lines on the order sheet.
        //
        // ssCombinedCenterX reuses pmCombinedCenterX's "panels placed at
        // zero gap" formula (see PLACKET-MATCH v2 algorithm notes above,
        // "panels are placed at zero gap, so this IS where the other panel
        // begins"). For Front-Left/Front-Right that assumption is actually
        // TRUE because of the FULL-BUTTON zero-gap placement override
        // (currentX = pmLastFullButtonPanel.rightX, see the main item loop)
        // - Front-Right is force-snapped flush against Front-Left, 0mm gap.
        // Plain "front"/"back" parts get NO such override - they flow
        // through the normal item layout and sit the standard ~5mm tiling
        // gap apart (see "Fixed gaps between artboards: 5mm horizontally"
        // near the top of this file). Reusing the zero-gap formula as-is
        // therefore left every correction exactly 5mm short - confirmed
        // empirically (user testing: 14mm alone was misaligned, but the
        // same correction measured from the real 5mm gap - i.e. 19mm total
        // - lined up correctly). NOT the 2.25in button-placket overlap
        // PM_OVERLAP_PT below (different seam entirely).
        //
        // THAT 5mm IS A VISIBLE GAP, AND THE CONSTANT BELOW IS THE FALLBACK.
        // The row flow tiles pieces on their VISIBLE edges, so 5mm of screen
        // space between two 3pt-outlined pieces leaves their PATHS 5mm +
        // PATTERN_OUTLINE_PT (6.06mm) apart - the same 1.5pt-per-side straddle
        // that cost the placket 3pt (see pmSeamGap). ssSeamGap now MEASURES the
        // real path-to-path distance and ssCloseDistance adds SS_SEW_PT to it,
        // so the normal path is 14mm + whatever the layout actually left, and
        // the empirical 19mm below only runs when that measurement is not
        // meaningful (see ssSeamGap for the one pairing where it is not).
        var SS_SEW_PT = 14 * SM_MM;
        var SS_OVERLAP_PT = 19 * SM_MM;
        // HOOD CENTER DESIGN MATCH: its OWN constants, deliberately not shared
        // with SS_OVERLAP_PT above - the two features answer to different seams
        // and must be tunable apart.
        //
        // The correction decomposes exactly like SS_OVERLAP_PT's does - a fixed
        // sewing allowance plus the real gap the two pieces are laid out at:
        //   HCM_SEW_PT  14mm simulated sewing overlap (each half's own 7mm seam
        //               allowance, same SM_MM basis as SM_SEAM_PT above)
        //   HCM_GAP_PT   5mm of VISIBLE space between the two halves' cut edges,
        //               which is no longer "whatever the pattern drew". The
        //               halves are children of ONE pattern group on ONE
        //               artboard, and the gap the pattern gives them differs per
        //               size - measured on this job's pattern.ai: 6.6pt/2.3mm
        //               (Small), 19.8pt/7mm (XL), 11.2pt/3.9mm (2XL).
        //               hcmNormaliseHalfGap slides the right-hand half so EVERY
        //               size sits exactly HCM_GAP_PT apart (per explicit
        //               instruction: under, over or zero/negative all become it).
        //
        // ALL THREE SEAMS NOW MEASURE THEIR OWN GAP - one behaviour everywhere.
        //
        // The shared mistake was building an overlap out of a VISIBLE gap. Every
        // piece is placed on its visibleBounds, and a 3pt outline straddles its
        // own path (1.5pt per side), so pieces that touch on screen have their
        // CUT LINES 3pt apart and pieces laid out 5mm apart have theirs 6.06mm
        // apart. Simulating the sewn slide from the visible number therefore
        // stopped every design 3pt short of the seam:
        //   placket   pmSeamGap  + pmCloseDistance   (zero visible gap -> 3pt)
        //   side seam ssSeamGap  + ssCloseDistance   (5mm visible -> 5mm + 3pt)
        //   hood      hcmProcessOutsideHood measures rb[0] - lb[2] directly
        // Each keeps its old constant only as the fallback for geometry where
        // the measurement is meaningless (see each function for which case).
        //
        // The placket's 3pt was confirmed on a real job's PM-DIAG and its fix
        // re-confirmed by an end-to-end run: combinedCenterX moved by exactly
        // 1.5pt, half the gap, which is what half a shared graphic owes.
        var HCM_SEW_PT = 14 * SM_MM;
        // 5mm of VISIBLE gap between the two hood halves' cut edges - the same
        // 5mm the normal item layout puts between any two pieces, and the same
        // 5mm SS_OVERLAP_PT assumes at the side seam.
        //
        // It used to be `5 * SM_MM - PATTERN_OUTLINE_PT`, i.e. 3.942mm of visible
        // gap chosen so the two PATHS landed exactly 5mm apart. Changed on
        // explicit instruction: what a person sees and what the cutter works to
        // is the visible gap, so the visible gap is the one that gets set, and
        // every size now prints the same 5mm of space.
        //
        // The paths that result sit 5mm + PATTERN_OUTLINE_PT (6.06mm) apart, and
        // hcmProcessOutsideHood MEASURES that rather than rebuilding it from
        // this constant - so setting the gap for the cutter costs the centre
        // design nothing. This constant is still what the overlap falls back to
        // when the two halves are not laid out as a centre seam at all.
        var HCM_GAP_PT = 5 * SM_MM;
        // Records WHY the last hood clip-in failed. ssClipIntoPanel/
        // pmClipIntoPanel swallow their exception, which turns every failure
        // into the same uninformative "could not re-clip" line; this feature's
        // warnings carry the reason instead (it is what led the harness to the
        // clip-group lookup bug). Declared up here with the rest of the
        // per-run state, not beside its function down in the helpers section -
        // see the PLACKET-MATCH note below on why that section is too late.
        var hcmLastClipError = "";
        var ssQueue = {}; // sizeLabel -> queued Front panel state, waiting for its Back counterpart
        var hoodieFrontBySize = {}; // sizeLabel -> { pastedPattern, baseShape, pastedDesign } for HOODIE's Border/Pocket/Local-Tag-overlap post-pass
        // HOOD-PAIR: sizeLabel -> { leftX, bottomY, width } of the FIRST hood
        // variant placed for that size, so the second one stacks 5mm below it
        // instead of flowing beside it (see hoodieBuildVariant). Same shape and
        // same reasoning as pmLastSleevePanel / ribCuffSleeveBySize above.
        var hoodieLastHoodBySize = {};
        var hoodieWarnings = [];
        // PARM RECOVERY STATE - MUST be initialized HERE, same rule as
        // RENAME_SIZE_WORDS at the top of this file: the per-item loop is an
        // inline statement that runs long before any `var` written further down
        // is assigned, so declaring these next to rollbackInstance() would make them read
        // `undefined` inside the loop.
        //
        // 'PARM' (1346458189) is Illustrator's generic kBadParameterErr. Adobe's
        // SDK raises it from ~3000 places and publishes no list of them, so it can
        // surface on ANY call - which is why the handling below is generic rather
        // than tied to one function. In this job it has only ever meant a stale
        // reference: in M101_Round_Neck-2 the order split across two files, and the
        // first spot-swatch import into the new document - right after
        // startNextOrderDoc()'s orderDoc.close() - threw it. The identical code
        // path ran 13 times either side of that moment without a single failure.
        var PARM_RETRIES = 3;       // extra attempts after the first failure
        var PARM_SLEEP_MS = 3000;   // settle time between attempts
        var PARM_BUDGET = 40;       // whole-job cap on retries, so a genuinely
                                    // corrupt document cannot turn every item
                                    // into a 9-second stall
        var PARM_MAX_ERRORS = 40; // report cap; the rest stay in debug_log.txt
        var parmBudgetUsed = 0;
        var parmErrors = [];      // end-of-job report -> parm_errors.json/.txt
        // DEFERRED EXPORTS - same hoisting rule as everything else in this block.
        //
        // A panel used to be exported the moment it was built, and again after
        // every later step that moved it. SHOULDER-MATCH alone re-exported one
        // Back five times, and the last two of those followed a "resized to 100%
        // and shifted 0mm" no-op - a 14-second render of artwork that had not
        // changed. Job FAZ103-2 spent 17.4 of its 29.6 minutes exporting: 72
        // renders for 34 panels, 59% of the run, and roughly 10 minutes of it
        // pure waste.
        //
        // Now every export is QUEUED by instance name and written once, just
        // before the document holding it is saved. Re-exports simply overwrite
        // their queue entry, so each panel is rendered exactly once, from its
        // final state. Flushing must stay ahead of saveOrderDoc(), which removes
        // artboard 0 and would shift every stored index by one.
        var exportQueue = {};     // instName -> { idx, folder, name, file }
        var exportOrder = [];     // insertion order, so the log reads as built
        // JPG FILE NAMES: sizeLabel -> how many JPGs that size has been given.
        // The written file is named <size><n> - Small1, Small2 ... Small15, and
        // Large starts again at Large1 - per explicit instruction, replacing the
        // old <size>_<part>_Item<n> (Small_Back_Item1). The number runs across
        // the WHOLE size, not per part, so the part name is gone from the file
        // name entirely; debug_log.txt carries the instance -> file mapping for
        // anyone who needs to know which panel a JPG actually is.
        //
        // Deliberately NOT part of exportQueue: the queue is emptied by every
        // flushExports, and a size that spans two order documents must keep
        // counting (Small1..Small10 in one file, Small11..Small15 in the next)
        // instead of restarting and overwriting its own renders.
        var exportFileCounters = {};
        // OUTPUT MODE (form Section 06, plan.export_mode): "ai_only" saves the
        // order .ai exactly as always and skips the render phase entirely -
        // which on a heavy mockup is most of the job's runtime. Anything else,
        // including a plan.json written before this option existed, means render
        // as usual, so nothing changes unless it is deliberately chosen.
        var EXPORT_JPG = (plan.export_mode !== "ai_only");
        var parmContext = { size: "", part: "", instance: "" };
        var sleeveMatchD = {};        // sizeLabel -> { units: [{d,anchor,full}, ...], fromPart } - measured once from Front's right armhole, mirrored everywhere else
        var sleeveMatchWarnings = [];
        var smBodyTried = {};
        // PLACKET-MATCH v2 state - MUST be initialized here (before the main
        // per-item loop runs), not down in the helper-functions section: a
        // bare "var x = {}" only actually assigns when the interpreter's
        // linear execution reaches that line, and the helper-functions
        // section runs AFTER the main loop + end-of-run write-out code (see
        // history PHR 082 for the bug this caused the first time).
        //
        // v2 replaces the old vertical-drop/"Match_"-reference-line model
        // entirely - there is no more artist-drawn reference line; the seam
        // is read directly off each panel's own pattern shape (baseShape).
        // PM_LEFT_IS_BIGGER is decided once per job (a mockup-level
        // property, the same for every size). pmPanelAQueue holds live
        // object references (not just numbers) to each size's Front-Left
        // build, FIFO, consumed when that size's Front-Right is reached
        // (loop/splice order always processes Front-Left first regardless
        // of which side turns out to be the bigger "source" panel).
        var PM_OVERLAP_PT = 2.25 * 72; // 2.25in real placket overlap allowance (1in = 72pt)
        var PM_LEFT_IS_BIGGER = null; // null = not yet decided; true/false once decided
        var pmPanelAQueue = {}; // sizeLabel -> [{ pastedPattern, baseShape, pastedDesign, isLeft }, ...]
        var pmLastFullButtonPanel = null; // zero-gap placement tracking, see placement block below
        // PATTERN SCALE MATCH: Back's own height-fit %, so that the "Pattern"-
        // named group on Front-Left and Front-Right can be pulled onto the exact
        // same % (pmMatchPatternScale). Letting each panel's pattern sit at its
        // own height-fit lets the three drift apart when their mockup art wasn't
        // drawn at identical proportions, which breaks a pattern that has to run
        // continuously across the buttoned-up front. Front-Left/Front-Right
        // always process before Back in the loop, so Back's own ratio isn't
        // known yet when they need it - pmPeekFullButtonScale (see below)
        // computes it early and caches it here per size.
        //
        // ONLY THE PATTERN IS SHARED, and only when PATTERN_MATCH
        // (plan.full_button_pattern_match) is on. Every panel - including the
        // two front halves - still fits its OWN height for everything else, so
        // the logo, number, text and trims stay correctly sized for the panel
        // they are actually printed on. A plain full-button job with the flag
        // off is completely unaffected.
        var pmFullButtonScale = {}; // sizeLabel -> cached scale % (or null if the peek failed)
        // sizeLabel -> { panelSeam, designSeam } in points: Back's hem-corner-
        // to-underarm distance along the side seam, taken during the SAME peek
        // that computes the scale above (so no second duplicate-and-measure).
        // A full-button FRONT half can never find its own underarm - one of its
        // two extreme-x edges is the placket, not a side seam, so the left/right
        // symmetry test in findUnderarmY always fails on it (measured on job
        // 2b17c990: all 10 front panels skipped, 197pt-341pt apart). It borrows
        // Back's side-seam length instead, which is identical by construction:
        // front and back side seams are sewn to each other, so hem-corner to
        // underarm MUST measure the same on both. A percentage of panel height
        // would NOT transfer - Back is ~2in taller than Front on this pattern
        // (36.10in vs 34.06in at 2XL, the back's drop tail).
        // designSeam is UNSCALED mockup units - multiply by the applied scale %
        // before using it against a placed design.
        var pmBackUnderarm = {};
        // sizeLabel -> queued Front-Left state, for pmStripeSeamShift/
        // pmProcessStripeSeam (independent of pmPanelAQueue/Center-Match).
        // MUST be declared here (early, alongside the other per-job state)
        // and not down near pmStripeSeamShift's own definition - a `var`
        // declared later in the file only gets its `= {}` assignment when
        // execution physically reaches that line, which is AFTER the main
        // item-processing loop above it has already started calling
        // pmProcessStripeSeam - confirmed on a real job: pmStripeQueue was
        // still undefined at that point, so `pmStripeQueue[sizeLabel] = ...`
        // threw "undefined is not an object" on every single call, silently
        // (caught by the per-item try/catch, logged as "Error in instance:
        // ... -> undefined is not an object") - the whole stripe-shift
        // feature never ran on any job despite the code being correct.
        var pmStripeQueue = {};
        // SIZE-GROUP LAYOUT: lastSizeLabel drives a forced row-break + a large
        // standalone marker text whenever the running size changes (L -> M),
        // so a size's items always start a fresh row and are easy to spot on
        // the tiled order sheet. pmLastSleevePanel pairs up two CONSECUTIVE
        // Short Sleeve instances of the same size (stacked directly on top of
        // each other, 5mm gap) instead of flowing them side by side - avoids
        // wasted horizontal space, matches how the cutter nests the two short
        // sleeve caps in real layouts. Long/Full sleeves and every other part
        // are unaffected and keep the normal side-by-side flow.
        var lastSizeLabel = null;
        var pmLastSleevePanel = null; // { sizeLabel, leftX, topY, bottomY } or null
        // RIB & CUFF: general (not Hoodie-scoped) - anchored 5mm below its
        // size's own Sleeve instead of the normal row-flow, per explicit
        // instruction. sizeLabel -> { leftX, bottomY } of the last Sleeve
        // placed for that size (last-wins, same simplicity as pmLastSleevePanel).
        var ribCuffSleeveBySize = {};
        var GAP_5MM_PT = 5 * SM_MM;
        var pmShoulderTargetDist = {}; // sizeLabel -> pt distance from the FRONT's own shoulder edge to its Match shape - Front-Left when FULL_BUTTON splits the front, the plain "front" panel otherwise (SHOULDER-MATCH, see pmMeasureShoulderTarget/pmApplyBackShoulderMatch)
        var placketMatchWarnings = [];
        var backLabelWarnings = []; // BACK-LABEL fallback events (neckline center not detected), see placeBackLabel
        if (SM_ON) {
            log("SLEEVE-MATCH: enabled for this job (tolerance +/-1mm).");
            // Fronts/backs must render before sleeves so D is known by then.
            for (var smG = 0; smG < plan.production_groups.length; smG++) {
                var smItems = plan.production_groups[smG].items, smBody = [], smSleeves = [];
                for (var smI = 0; smI < smItems.length; smI++) {
                    var smPart = (smItems[smI].part_name || "").toLowerCase();
                    if (smPart.indexOf("sleeve") !== -1 && !isAccessory(smPart)) smSleeves.push(smItems[smI]);
                    else smBody.push(smItems[smI]);
                }
                plan.production_groups[smG].items = smBody.concat(smSleeves);
            }
        }

        // RIB & CUFF ORDERING: the Rib & Cuff anchors 5mm below its size's own
        // Sleeve (see ribCuffSleeveBySize / the placement block below), and that
        // anchor is only recorded once the Sleeve has actually been placed. A
        // cuff processed BEFORE its sleeve therefore finds no anchor, silently
        // falls back to the normal side-by-side row flow, and prints beside the
        // sleeve instead of under it.
        //
        // Which is exactly what SLEEVE-MATCH's reorder above causes: it moves
        // every sleeve to the END of the group, and "cuff" has no "sleeve" in
        // its part_name, so the cuff stays in the body bucket and ends up in
        // FRONT of the sleeves. Hoodie jobs append the cuff last
        // (main.py _enforce_hoodie_rib_cuff), so this only broke once
        // SLEEVE-MATCH was on - which is why the piece lands correctly on some
        // jobs and beside the sleeve on others.
        //
        // Runs unconditionally, not inside the SM_ON branch: the placement
        // code's precondition is "sleeve first", and that should hold however
        // the item list arrived rather than only when one other feature is on.
        // Must stay AFTER the SLEEVE-MATCH reorder so it has the final say.
        for (var rcG = 0; rcG < plan.production_groups.length; rcG++) {
            var rcItems = plan.production_groups[rcG].items, rcRest = [], rcCuffs = [];
            for (var rcI = 0; rcI < rcItems.length; rcI++) {
                var rcPart = (rcItems[rcI].part_name || "").toLowerCase();
                if (rcPart.indexOf("cuff") !== -1 || rcPart.indexOf("rib") !== -1) rcCuffs.push(rcItems[rcI]);
                else rcRest.push(rcItems[rcI]);
            }
            if (rcCuffs.length > 0 && rcRest.length > 0) {
                plan.production_groups[rcG].items = rcRest.concat(rcCuffs);
                log("RIB & CUFF: moved " + rcCuffs.length + " Rib & Cuff item(s) to the end of the '" +
                    plan.production_groups[rcG].size + "' group so they are placed after that size's Sleeve.");
            }
        }

        // LEFT/RIGHT SLEEVES: when the mockup carries a separate design for
        // each sleeve, one generic sleeve item would print only the first
        // match (Right) and the Left design would never reach production.
        // Expand such items into a Right + Left pair; each side pulls its own
        // mockup design and the pattern tag reads e.g. "Medium Short Sleeve Right".
        function mockupHasBothSleeveSides() {
            var pairs = [
                ["Short Sleeve Right", "Short Sleeve Left"],
                ["Long Sleeve Right", "Long Sleeve Left"],
                ["Right Sleeve", "Left Sleeve"],
                ["Sleeve Right", "Sleeve Left"],
                ["Right_Sleeve", "Left_Sleeve"],
                // side-first naming ("Right Short Sleeve", "LeftShort Sleeve" -
                // findAnywhere strips spaces so both spellings match)
                ["Right Short Sleeve", "Left Short Sleeve"],
                ["Right Long Sleeve", "Left Long Sleeve"]
            ];
            for (var p = 0; p < pairs.length; p++) {
                if (findAnywhere(mockupDoc, pairs[p][0]) && findAnywhere(mockupDoc, pairs[p][1])) return true;
            }
            return false;
        }
        if (mockupHasBothSleeveSides()) {
            log("Mockup has separate Right/Left sleeve designs - expanding sleeve items into per-side prints.");
            for (var sg = 0; sg < plan.production_groups.length; sg++) {
                var sgItems = plan.production_groups[sg].items;
                for (var si = sgItems.length - 1; si >= 0; si--) {
                    var sIt = sgItems[si];
                    var sName = (sIt.part_name || "").toLowerCase();
                    if (sName.indexOf("sleeve") === -1 || sName.indexOf("right") !== -1 || sName.indexOf("left") !== -1) continue;
                    if (isAccessory(sName)) continue;
                    var sideQty = Math.max(1, Math.round((sIt.quantity || 1) / 2));
                    var rightIt = {}, leftIt = {};
                    for (var sk in sIt) { if (sIt.hasOwnProperty(sk)) { rightIt[sk] = sIt[sk]; leftIt[sk] = sIt[sk]; } }
                    rightIt.quantity = sideQty; rightIt.sleeve_side = "Right";
                    leftIt.quantity = sideQty; leftIt.sleeve_side = "Left";
                    sgItems.splice(si, 1, rightIt, leftIt);
                    log("Expanded '" + sIt.part_name + "' (" + plan.production_groups[sg].size + ") into Right + Left (qty " + sideQty + " each).");
                }
            }
        }

        // FULL-BUTTON JERSEY: Front is physically two cut/print pieces (Left
        // + Right, sewn at the center placket seam), not one shared panel -
        // unlike sleeves, BOTH pieces are needed on EVERY unit, so quantity
        // is copied as-is to each side, never halved.
        function mockupHasBothFrontSides() {
            var pairs = [
                ["Front Left", "Front Right"],
                ["Left Front", "Right Front"],
                ["Front_Left", "Front_Right"]
            ];
            for (var p = 0; p < pairs.length; p++) {
                if (findAnywhere(mockupDoc, pairs[p][0]) && findAnywhere(mockupDoc, pairs[p][1])) return true;
            }
            return false;
        }
        if (FULL_BUTTON) {
            if (mockupHasBothFrontSides()) {
                log("FULL-BUTTON: mockup has separate Front Left/Front Right designs - expanding 'front' items into both sides (full quantity each).");
                for (var fg = 0; fg < plan.production_groups.length; fg++) {
                    var fgItems = plan.production_groups[fg].items;
                    for (var fi = fgItems.length - 1; fi >= 0; fi--) {
                        var fIt = fgItems[fi];
                        var fName = (fIt.part_name || "").toLowerCase();
                        if (fName !== "front") continue; // only the generic/unsplit "front" part
                        var leftIt = {}, rightIt = {};
                        for (var fk in fIt) { if (fIt.hasOwnProperty(fk)) { leftIt[fk] = fIt[fk]; rightIt[fk] = fIt[fk]; } }
                        leftIt.part_name = "front-left";
                        rightIt.part_name = "front-right";
                        fgItems.splice(fi, 1, leftIt, rightIt);
                        log("FULL-BUTTON: expanded 'front' (" + plan.production_groups[fg].size + ") into front-left + front-right (qty " + (fIt.quantity || 1) + " each).");
                    }
                }
            } else {
                log("FULL-BUTTON WARNING: full_button_jersey is ON but the mockup has no 'Front Left'/'Front Right' groups - front will render as a single panel. Check the mockup naming.");
            }
        }

        // Calculate total items for progress reporting
        var totalItems = 0;
        for (var pi = 0; pi < plan.production_groups.length; pi++) {
            totalItems += plan.production_groups[pi].items.length;
        }
        var itemsProcessed = 0;

        for (var i = 0; i < plan.production_groups.length; i++) {
            var group = plan.production_groups[i];
            var sizeLabel = getFriendlySize(group.size);

            // SIZE-GROUP LAYOUT: force a fresh row the moment the size changes
            // (even if the previous row still had horizontal room), so one
            // size's items never spill into the same row as another size's.
            if (sizeLabel !== lastSizeLabel) {
                if (lastSizeLabel !== null) {
                    currentX = -7500;
                    currentY -= (rowMaxHeight + refContext.vSpacing);
                    rowMaxHeight = 0;
                }
                // SPLIT PER SIZE: a heavy mockup (see SPLIT_PER_SIZE at the top
                // of main) starts a fresh .ai for EVERY size, not only when the
                // canvas runs out. Skipped while this file is still empty -
                // there would be nothing to save - and skipped for "Universal",
                // which is not a size: the shared accessories ride along in
                // whichever file is open, per explicit instruction.
                if (SPLIT_PER_SIZE && artboardCount > 0 && sizeLabel !== "Universal") {
                    startNextOrderDoc("heavy mockup - one .ai per size, next is " + sizeLabel);
                }
                // Claim the (possibly brand-new) file for this size so
                // orderFileName can name it after the size. The counter goes
                // back to 1 here on purpose: a "_2" earned by a PREVIOUS size
                // that overflowed must never leak into this size's file name.
                if (SPLIT_PER_SIZE && sizeLabel !== "Universal") {
                    orderDocLabel = sizeLabel;
                    orderLabelSeen[sizeLabel] = 1;
                }
                // WHOLE-SIZE ROLLOVER: move the ENTIRE size to a new .ai file
                // when what is left of this one cannot hold it. Skipped when
                // the size would not fit an empty file either (there is
                // nothing to gain by burning a file - the per-piece check
                // below splits it instead) and when this file is still empty.
                var sizeNeedH = estimateSizeGroupHeight(group, sizeLabel);
                if (sizeNeedH > 0 && artboardCount > 0 &&
                    (currentY - sizeNeedH) < ORDER_FLOOR_Y && (ORDER_TOP_Y - sizeNeedH) >= ORDER_FLOOR_Y) {
                    startNextOrderDoc("size " + sizeLabel + " needs about " + Math.round(sizeNeedH) +
                        "pt but only " + Math.round(currentY - ORDER_FLOOR_Y) + "pt is left");
                }
                placeSizeGroupLabel(sizeLabel);
                lastSizeLabel = sizeLabel;
                pmLastSleevePanel = null; // never pair sleeves across a size boundary
            }

            for (var j = 0; j < group.items.length; j++) {
                var item = group.items[j];
                var quantity = item.quantity || 1;
                
                itemsProcessed++;
                var currentProgress = 50 + Math.floor((itemsProcessed / totalItems) * 40);
                updateStatus("Rendering " + sizeLabel + " " + item.part_name + (item.sleeve_side ? " " + item.sleeve_side : "") + "...", currentProgress, false);

                // resolvePartLabel holds the part_name -> pattern-panel-name map
                // (and the "sleeve" fallbacks) so estimateSizeGroupHeight can
                // look up the very same panels this loop is about to place.
                var partLabel = resolvePartLabel(item, sizeLabel);

                // SLEEVE-PAIR: only SHORT sleeves stack (see placement block
                // below) - Long/Full sleeves and everything else keep the
                // normal side-by-side 5mm flow, per explicit instruction.
                var isSleevePart = (item.part_name || "").toLowerCase().indexOf("sleeve") !== -1;
                var isShortSleevePart = isSleevePart && (partLabel.toLowerCase().indexOf("short") !== -1 || (item.part_name || "").toLowerCase().indexOf("half") !== -1);

                var isAcc = isAccessory(item.part_name);
                // RIB & CUFF placement: computed early (before this item's
                // placement below) so it can anchor below its Sleeve instead
                // of the normal row-flow - see ribCuffSleeveBySize above.
                var isRibCuffPart = ((item.part_name || "").toLowerCase().indexOf("cuff") !== -1 || (item.part_name || "").toLowerCase().indexOf("rib") !== -1);
                var targetGroupName = (isAcc || sizeLabel === "Universal") ? partLabel : (sizeLabel + " " + partLabel);
                // Per-side sleeves share the SAME pattern panel (targetGroupName)
                // but get their own instance names, mockup design and tag text.
                var sleeveSide = item.sleeve_side || null;
                var displayGroupName = sleeveSide ? (targetGroupName + " " + sleeveSide) : targetGroupName;

                log("--- START PROCESSING PART: " + displayGroupName + " ---");
                log("Job ID: " + (typeof jobId !== 'undefined' ? jobId : "N/A") + " | Part: " + item.part_name + " | Qty: " + quantity);
                
                var patternObj = findAnywhere(patternDoc, targetGroupName);
                if (!patternObj) {
                    log("CRITICAL: Could not find '" + targetGroupName + "' in Master Pattern document. Skipping.");
                }

                if (patternObj) {
                    log("Found '" + targetGroupName + "' in Pattern.");
                    var masterProcessed = null;

                    for (var q = 0; q < quantity; q++) {
                        // CANVAS FLOOR: does this instance still fit in the
                        // current .ai file? Measured from the PATTERN document's
                        // own panel (the order doc places it at that native
                        // size, see the duplicate + visibleBounds pair below),
                        // so the answer is known BEFORE anything is duplicated
                        // into a document that is about to be closed.
                        // Pieces that anchor to one already placed above them
                        // are exempt: they consume no new row and must never be
                        // separated from the piece they anchor to (which lives
                        // in THIS document) - see the three placement blocks
                        // further down.
                        var anchorsAbove = false;
                        if (FULL_BUTTON && pmLastFullButtonPanel && pmLastFullButtonPanel.sizeLabel === sizeLabel &&
                            isFrontRight(item.part_name) && pmLastFullButtonPanel.isLeft) anchorsAbove = true;
                        else if (isShortSleevePart && pmLastSleevePanel && pmLastSleevePanel.sizeLabel === sizeLabel) anchorsAbove = true;
                        else if (isRibCuffPart && ribCuffSleeveBySize[sizeLabel]) anchorsAbove = true;
                        if (!anchorsAbove && artboardCount > 0) {
                            var needH = patternPieceHeightFor(targetGroupName);
                            if (needH > 0 && (currentY - needH) < ORDER_FLOOR_Y) {
                                startNextOrderDoc("'" + displayGroupName + "' (" + Math.round(needH) +
                                    "pt tall) would hang below the canvas");
                                placeSizeGroupLabel(sizeLabel); // this size continues here - label it again
                                // The accessory master was built in the file we
                                // just closed - rebuild it from the pattern in
                                // this one instead of duplicating a dead ref.
                                masterProcessed = null;
                            }
                        }

                        if (!partCounters[displayGroupName]) partCounters[displayGroupName] = 0;
                        partCounters[displayGroupName]++;
                        var instanceName = displayGroupName + "_Item" + partCounters[displayGroupName];
                        // Names every PARM warning raised while this piece is built,
                        // so the end-of-job report says WHICH size and WHICH piece
                        // the operator has to open and check.
                        parmContext = { size: sizeLabel, part: displayGroupName, instance: instanceName };

                        log("Creating Instance: " + instanceName);
                        var pWidth = 1000, pHeight = 1000;

                        // PANEL ROLLBACK LOOP. A PARM anywhere in the body below
                        // throws this whole piece away and builds it again from
                        // nothing - the pattern re-duplicated, the design re-pasted,
                        // re-coloured, re-scaled, re-anchored, re-clipped.
                        //
                        // Repeating the body is only safe BECAUSE of the rollback:
                        // it runs duplicate(), resize(), translate() and rotate(),
                        // which are all relative and would stack if replayed onto
                        // their own result. rollbackInstance() takes the piece back
                        // to nothing first, so every attempt starts from zero.
                        //
                        // Verified safe to wrap: the 672-line body contains no
                        // `break` or `continue` of its own, so this loop cannot
                        // steal one from an inner statement.
                        var parmSnap = null;
                        var parmAttempts = 1 + PARM_RETRIES;
                        for (var parmTry = 1; parmTry <= parmAttempts; parmTry++) {
                        parmSnap = snapshotInstanceState();
                        // Both are `var`s of runAutomation, so they SURVIVE between
                        // pieces. Clearing them per attempt is what stops a rollback
                        // from deleting the previous piece's design when this one
                        // fails before its own assignment is reached.
                        var pastedPattern = null, pastedDesign = null;
                        try {
                            var preFlowX = currentX, preFlowY = currentY; // row-flow slot before any snap/stack override
                            artboardCount++;
                            if (isAcc && masterProcessed) {
                                log("Using previously processed accessory master for " + instanceName);
                                pastedPattern = masterProcessed.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                            } else {
                                log("Duplicating pattern object to Order document...");
                                // A PARM here needs no special handling: this is the
                                // FIRST thing the panel does, so the rollback loop
                                // above simply runs it again from nothing.
                                pastedPattern = patternObj.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                            }

                            // PATTERN OUTLINE STROKE: set the moment the piece is
                            // duplicated, per explicit instruction - and it has to be
                            // here regardless, because the bounds on the very next line
                            // are what size this piece's artboard. Going 1pt -> 3pt
                            // widens visibleBounds by ~1pt per side, so a piece measured
                            // first and stroked after would lose that much off its own
                            // artboard edge at export.
                            applyPatternOutlineStroke(findPlacementPath(pastedPattern));

                            var bounds = pastedPattern.visibleBounds;
                            pWidth = Math.abs(bounds[2] - bounds[0]); pHeight = Math.abs(bounds[1] - bounds[3]);

                            // FULL-BUTTON: Front-Right sits with ZERO gap against its
                            // Front-Left mate for this size (every other part keeps the
                            // normal ~5-6mm tiling gap - this is a confirmed, narrow
                            // exception, not a general spacing change).
                            //
                            // Front-Right-only check (NOT also Front-Left): each front
                            // item is split into a Left+Right pair placed back-to-back
                            // (see the splice() expansion above), so Front-Right always
                            // immediately follows ITS OWN Front-Left in the loop and can
                            // safely snap next to whatever pmLastFullButtonPanel holds.
                            // Front-Left must NEVER snap - it was symmetrically checking
                            // "!pmLastFullButtonPanel.isLeft" before, which is also true
                            // right after any OTHER item's Front-Right of the same size,
                            // snapping every later item's Front-Left back onto the FIRST
                            // item's own position - every item after the first ended up
                            // stacked exactly on top of item 1 (confirmed via debug_log
                            // X/Y coordinates on a real job, all sizes affected).
                            if (FULL_BUTTON && pmLastFullButtonPanel && pmLastFullButtonPanel.sizeLabel === sizeLabel &&
                                isFrontRight(item.part_name) && pmLastFullButtonPanel.isLeft) {
                                currentX = pmLastFullButtonPanel.rightX;
                                currentY = pmLastFullButtonPanel.topY;
                                log("FULL-BUTTON: placing " + item.part_name + " with zero gap against its " + sizeLabel + " counterpart.");
                            }

                            // SLEEVE-PAIR: stack this Short Sleeve directly below the
                            // immediately-preceding Short Sleeve of the same size (5mm
                            // gap) instead of flowing it into the next column - saves
                            // the horizontal space a second half-sleeve would otherwise
                            // waste. Only ever two consecutive short-sleeve instances
                            // pair up; anything else in between clears pmLastSleevePanel
                            // (see the row-flow bookkeeping below).
                            var sleevePairStacked = false;
                            if (isShortSleevePart && pmLastSleevePanel && pmLastSleevePanel.sizeLabel === sizeLabel) {
                                currentX = pmLastSleevePanel.leftX;
                                currentY = pmLastSleevePanel.bottomY - refContext.spacing;
                                sleevePairStacked = true;
                                log("SLEEVE-PAIR: stacking " + instanceName + " directly below its short-sleeve mate (5mm gap) - no extra row width used.");
                            }

                            // RIB & CUFF: anchored 5mm below its size's own Sleeve
                            // (per explicit instruction, general to every job type)
                            // instead of the normal row-flow - does not consume a
                            // flow slot (see the row-flow bookkeeping below).
                            var ribCuffAnchored = false;
                            var ribCuffAnchor = (isRibCuffPart && ribCuffSleeveBySize[sizeLabel]) ? ribCuffSleeveBySize[sizeLabel] : null;
                            if (ribCuffAnchor) {
                                // CENTRED on the Sleeve, not left-aligned: the Rib &
                                // Cuff is far narrower than its Sleeve (XL: 737pt vs
                                // 1624pt), so sharing the Sleeve's left edge parked it
                                // hard against that edge with every bit of slack piled
                                // on the right. Guarded so a Rib that is somehow WIDER
                                // than its Sleeve keeps the old left-aligned position
                                // instead of being pushed left into the neighbouring
                                // column. width is cached from the same raw duplicate
                                // as leftX/bottomY (before any design is pasted), so
                                // both sides of this subtraction are clean panel sizes.
                                var ribSlack = 0;
                                if (ribCuffAnchor.width && ribCuffAnchor.width > pWidth) ribSlack = (ribCuffAnchor.width - pWidth) / 2;
                                pastedPattern.left = ribCuffAnchor.leftX + ribSlack;
                                pastedPattern.top = ribCuffAnchor.bottomY - GAP_5MM_PT;
                                ribCuffAnchored = true;
                                log("RIB & CUFF: anchored 5mm below its size's Sleeve, centred on it (" + Math.round(ribSlack) + "pt inset) - no extra row width used.");
                            } else {
                                pastedPattern.left = currentX; pastedPattern.top = currentY;
                            }
                            log("Placed pattern at X:" + Math.round(pastedPattern.left) + " Y:" + Math.round(pastedPattern.top) + " (Size: " + Math.round(pWidth) + "x" + Math.round(pHeight) + ")");

                            // Cache this Sleeve's actual final position for RIB &
                            // CUFF above to anchor against.
                            //
                            // A LONG sleeve always wins over a short one, per
                            // explicit instruction: a size can carry both a
                            // Short and a Long Sleeve item, and the Rib & Cuff
                            // belongs under the LONG one. Without this the plain
                            // last-wins rule handed the cuff to whichever sleeve
                            // happened to be processed last.
                            //
                            // Among sleeves of the SAME kind the last one still
                            // wins, which is what puts the cuff under the LOWER
                            // of a stacked short-sleeve pair rather than the one
                            // above it.
                            if (isSleevePart) {
                                var rcIsLong = !isShortSleevePart;
                                var rcPrev = ribCuffSleeveBySize[sizeLabel];
                                // width feeds the RIB & CUFF centring above.
                                if (!rcPrev || rcIsLong || !rcPrev.isLong)
                                ribCuffSleeveBySize[sizeLabel] = { leftX: pastedPattern.left, bottomY: pastedPattern.top - pHeight, width: pWidth, isLong: rcIsLong };
                            }

                            if (FULL_BUTTON && (isFrontLeft(item.part_name) || isFrontRight(item.part_name))) {
                                pmLastFullButtonPanel = { sizeLabel: sizeLabel, isLeft: isFrontLeft(item.part_name), leftX: currentX, rightX: currentX + pWidth, topY: currentY };
                            } else {
                                pmLastFullButtonPanel = null;
                            }

                            // Uses pastedPattern's ACTUAL placed position (not raw
                            // currentX/currentY) - correct for both the normal
                            // row-flow AND the RIB & CUFF anchored-below-Sleeve
                            // case above, where currentX/currentY were left alone.
                            var finalRect = [pastedPattern.left, pastedPattern.top, pastedPattern.left + pWidth, pastedPattern.top - pHeight];
                            // EVERY piece gets a NEWLY ADDED artboard. The document's
                            // own default artboard is deliberately NOT recycled for the
                            // first piece any more: recycling made that one piece the
                            // only one whose artboard was MOVED onto already-placed
                            // artwork instead of being created around it, and it then
                            // ended up sitting exactly 792pt - the default artboard's
                            // own height (11in Letter) - out of line with every other
                            // piece in its row. The now-unused default artboard is
                            // dropped in saveOrderDoc(), after every export is done.
                            var ab = orderDoc.artboards.add(finalRect);
                            ab.artboardRect = finalRect; ab.name = instanceName;
                            // Index of THIS piece's artboard. Read from the document
                            // rather than derived from artboardCount, so it stays right
                            // no matter what else has been added to the document.
                            var abIdx = orderDoc.artboards.length - 1;

                            if (sleeveSide) {
                                // Tag on the pattern only says e.g. "Medium" - per-side
                                // prints must be tellable apart on the cut table.
                                var newTag = sizeLabel + " " + partLabel + " " + sleeveSide;
                                var tagHits = renameSizeTags(pastedPattern, sizeLabel, newTag);
                                if (tagHits > 0) log("Size tag text updated to '" + newTag + "' (" + tagHits + " tag).");
                                else log("WARNING: no '" + sizeLabel + "' tag text found to update for " + displayGroupName + ".");
                            }

                            if (!(isAcc && masterProcessed)) {
                                log("Searching for 'Placement Path' (the main shape) in " + targetGroupName);
                                var baseShape = findPlacementPath(pastedPattern);
                                if (baseShape) {
                                    log("Placement Path found: " + (baseShape.name || "Unnamed Path"));

                                    var hasPers = (item.text_replacements && item.text_replacements.length > 0);
                                    var sourcePartName = sleeveSide ? (item.part_name + "-" + sleeveSide.toLowerCase()) : item.part_name;
                                    log("Searching for source design in Mockup for: " + sourcePartName);
                                    var sourceDesign = getSourceView(sourcePartName, mockupDoc, hasPers);
                                    
                                    var nPartName = item.part_name.toLowerCase();
                                    var isNeck = (nPartName === "neck" || nPartName === "collar" || nPartName === "rib");
                                    var isSleeve = (nPartName.indexOf("sleeve") !== -1);
                                    // Patti (full-button jersey's placket strip) is NOT in isAccessory()
                                    // on purpose - it's sized per-panel like Front/Back/Neck, not shared
                                    // like Twill Tape/Placket (see isAccessory's own comment). But it has
                                    // the same stray-stroke problem as those accessories, so it needs the
                                    // same stroke cleanup without being folded into isAcc's other behavior
                                    // (targetGroupName/master-processing/SLEEVE-MATCH scoping).
                                    var isPatti = (nPartName.indexOf("patti") !== -1);
                                    // RIB & CUFF: same stray-stroke problem as the accessories above,
                                    // same treatment - not folded into isAccessory() since Rib & Cuff
                                    // is sized per-panel like Neck, not shared like Twill Tape/Placket.
                                    var isRibCuff = (nPartName.indexOf("cuff") !== -1 || nPartName.indexOf("rib") !== -1);

                                    if (sourceDesign) {
                                        log("MATCH FOUND in Mockup: " + (sourceDesign.name || "Layer/Group"));
                                        // declared with pastedPattern at the top of
                                        // the rollback loop, so a failed attempt can
                                        // never hand the previous piece's design to
                                        // rollbackInstance()
                                        pastedDesign = null;
                                        try {
                                            if (sourceDesign.typename === "Layer") {
                                                log("Source is a Layer. Grouping all items...");
                                                pastedDesign = orderDoc.groupItems.add();
                                                for (var l = sourceDesign.pageItems.length - 1; l >= 0; l--) sourceDesign.pageItems[l].duplicate(pastedDesign, ElementPlacement.PLACEATBEGINNING);
                                            } else {
                                                log("Duplicating source design object...");
                                                pastedDesign = sourceDesign.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                                            }
                                        // PARM goes up to the panel rollback - see the note on the Merge Error catch.
                                        } catch (eDup) {
                                            parmBail(eDup, "duplicating the mockup design");
                                            log("Duplication failed: " + eDup.message);
                                        }

                                        if (pastedDesign) {
                                            log("Design pasted into Order doc. Starting alignment/cleanup.");
                                            embedPlacedItems(pastedDesign);
                                            fixIndexedRasters(pastedDesign);
                                            mergeAndCleanupSwatches(orderDoc, pastedDesign);
                                            if (pastedDesign.typename !== "GroupItem") {
                                                var wrapper = orderDoc.groupItems.add(); pastedDesign.moveToBeginning(wrapper); pastedDesign = wrapper;
                                            }

                                            // CMYK-DIRECT: the panel's base color comes from THIS part's
                                            // design ('base-path' first, else largest filled path), applied
                                            // exactly as drawn - solid, spot or gradient. Runs after
                                            // mergeAndCleanupSwatches so spots already belong to the order doc.
                                            var designFill = getDesignBaseFill(pastedDesign);
                                            if (designFill) {
                                                try {
                                                    baseShape.fillColor = designFill.color;
                                                    baseShape.filled = true;
                                                    log("Panel base filled from design (" + designFill.src + ", " + designFill.color.typename + ").");
                                                    if (nPartName.indexOf("placket") !== -1 || nPartName.indexOf("patti") !== -1) {
                                                        var siblingCount = fillSiblingPlacementPaths(pastedPattern, baseShape, designFill.color);
                                                        if (siblingCount > 0) log("Also filled " + siblingCount + " sibling panel piece(s) with the same base color (Placket/Patti's two strips).");
                                                    }
                                                } catch (eBF) { log("WARNING: Could not apply design base fill: " + eBF.message); }
                                            } else {
                                                log("WARNING: No filled base shape found in design - panel keeps the pattern file's own fill.");
                                            }
                                            
                                            // log("Checking for 'Loose Logos' that might overlap with this part in Mockup...");
                                            // attachLooseLogos(sourceDesign, pastedDesign);

                                            // ACCESSORY STROKE CLEANUP: removed, per explicit instruction that
                                            // nothing anywhere may strip a stroke. Twill Tape/Tukdi/Placket
                                            // used to have every non-spot stroke in their pasted design wiped
                                            // here, because these small accessory designs rarely carry a
                                            // 'base-path'-driven solid fill for a stray stroke to blend into.
                                            // Their mockup artwork now reaches the print exactly as drawn.

                                            // TEST-PRINT SIZE TAGS: the mockup is a small test print,
                                            // so its size tags are the wrong size for production. The
                                            // designer names that group/layer "remove" in the mockup.
                                            // Delete it BEFORE alignAndScale so the design scales on
                                            // clean bounds and the PATTERN file's own size tags stay visible.
                                            log("Checking for 'remove'-named items (test-print size tags) in " + item.part_name + "...");
                                            removeNamedItems(pastedDesign, "remove");

                                            if (hasPers) {
                                                log("Applying Text Replacements (Name/Number)...");
                                                applyTextReplacements(pastedDesign, item.text_replacements);
                                                log("Applying Logo Replacement (if requested)...");
                                                applyLogoReplacements(pastedDesign, item.text_replacements, sleeveSide);
                                            }

                                            {
                                                // Neck uses the same path as every other part now:
                                                // the mockup's neck design is scaled onto the panel.
                                                var useFrontBackLogic = (isFrontOrBack(item.part_name) || isSleeve);

                                                // Clip release before resize was removed (2026-07-25): the
                                                // 20-min neck grind (job 81babe73) didn't reproduce without it
                                                // (job 1985956b: neck resized in ~13s), and releasing every
                                                // nested clip in the whole design was corrupting unrelated
                                                // clips (small logos got their own mask stripped and replaced
                                                // by the outer panel clip - job bb38703d "ASCEND" gray box).
                                                // releaseInternalClippingMasks() is kept below, unused, in case
                                                // a future pathological design needs a scoped release again.

                                                log("Calculating Alignment & Scaling...");
                                                var designBasePath = findPlacementPath(pastedDesign, true);
                                                if (designBasePath) {
                                                    log("Aligning using first path reference.");
                                                    // SCALE_HEIGHT_ONLY (see the flag's own note up top) decides
                                                    // which of the two scalers runs, for EVERY job type.
                                                    //
                                                    // EVERY panel - full-button or not - now fits its OWN height
                                                    // here. The Back-driven shared % is applied afterwards to the
                                                    // "Pattern"-named group ALONE (pmMatchPatternScale), so only
                                                    // the artwork that actually has to run continuously across the
                                                    // placket seam is forced off its own panel's fit.
                                                    var pmIsFullButtonPanel = FULL_BUTTON && SCALE_HEIGHT_ONLY && (isFrontLeft(item.part_name) || isFrontRight(item.part_name) || isBack(item.part_name));
                                                    // The peek runs on EVERY full-button job, PATTERN_MATCH or
                                                    // not: the same pass also measures Back's side-seam length
                                                    // into pmBackUnderarm, which the SIDE-PANEL FIX needs on
                                                    // both front halves (a front half can never find its own
                                                    // underarm - one of its extreme-x edges is the placket).
                                                    if (pmIsFullButtonPanel) pmPeekFullButtonScale(sizeLabel);
                                                    var scaleInfo = SCALE_HEIGHT_ONLY
                                                        ? pmAlignAndScaleToHeight(pastedDesign, baseShape, designBasePath)
                                                        : alignAndScale(pastedDesign, baseShape, useFrontBackLogic, isSleeve, isNeck, designBasePath);
                                                    if (pmIsFullButtonPanel && PATTERN_MATCH) pmMatchPatternScale(pastedDesign, scaleInfo, pmFullButtonScale[sizeLabel], sizeLabel, item.part_name);
                                                    if (hasPers) normalizePersonalizedText(pastedDesign, scaleInfo);

                                                    // SIDE-PANEL UNDERARM FIX (front/back only): must run
                                                    // BEFORE removeBasePaths - it needs the scaled base-path
                                                    // to know where the design's underarm landed.
                                                    if (isFrontOrBack(item.part_name)) {
                                                        // partName/sizeLabel/scale % are for the BACK-DRIVEN
                                                        // fallback inside: a full-button front half cannot
                                                        // measure its own underarm, so it rebuilds it from
                                                        // Back's cached side-seam length and needs to know
                                                        // which side its armhole is on and what % the design
                                                        // was actually placed at.
                                                        adjustSidePanelsToUnderarm(pastedDesign, designBasePath, baseShape, item.part_name, sizeLabel, (scaleInfo && scaleInfo.sh) ? scaleInfo.sh : null);
                                                        // SIDE-ANCHOR (front/back only, opt-in): horizontal twin of
                                                        // the fix above - same window (needs the scaled base-path,
                                                        // so before removeBasePaths), independent axis, so the two
                                                        // never fight over the same item.
                                                        if (SIDE_ANCHOR) anchorSideGraphicsToSeam(pastedDesign, designBasePath, baseShape, item.part_name, sizeLabel);
                                                        // SHOULDER-ANCHOR: same window again, third axis -
                                                        // rotation. No plan flag: it is a no-op unless the
                                                        // designer noted a band "shoulder", and it must run
                                                        // BEFORE SLEEVE-MATCH so the sleeve follows the band
                                                        // to wherever the rotation puts it.
                                                        anchorShoulderBandsToPanel(pastedDesign, designBasePath, baseShape, item.part_name, sizeLabel);
                                                    }

                                                    // NEW: Only remove items explicitly named "base-path"
                                                    log("Checking for 'base-path' in " + item.part_name + " for removal...");
                                                    var removedCount = removeBasePaths(pastedDesign, item.part_name);
                                                    if (removedCount === 0) log("   - Note: No 'base-path' found to remove in " + item.part_name);
                                                    else log("   - Total removed from " + item.part_name + ": " + removedCount);
                                                } else {
                                                    log("No base path found in design. Using bounds-based alignment.");
                                                    // Same SCALE_HEIGHT_ONLY/PATTERN_MATCH routing as the
                                                    // base-path branch above, minus the reference item
                                                    // (there is none here).
                                                    var pmIsFullButtonFront2 = FULL_BUTTON && SCALE_HEIGHT_ONLY && (isFrontLeft(item.part_name) || isFrontRight(item.part_name) || isBack(item.part_name));
                                                    if (pmIsFullButtonFront2) pmPeekFullButtonScale(sizeLabel);
                                                    var scaleInfo2 = SCALE_HEIGHT_ONLY
                                                        ? pmAlignAndScaleToHeight(pastedDesign, baseShape)
                                                        : alignAndScale(pastedDesign, baseShape, useFrontBackLogic, isSleeve, isNeck);
                                                    if (pmIsFullButtonFront2 && PATTERN_MATCH) pmMatchPatternScale(pastedDesign, scaleInfo2, pmFullButtonScale[sizeLabel], sizeLabel, item.part_name);
                                                    if (hasPers) normalizePersonalizedText(pastedDesign, scaleInfo2);
                                                    if (isFrontOrBack(item.part_name)) {
                                                        log("SIDE-PANEL FIX skipped: design has no base-path to locate its underarm.");
                                                        if (SIDE_ANCHOR) log("SIDE-ANCHOR skipped: design has no base-path, so there is no silhouette edge to measure the seam gap from.");
                                                    }
                                                }

                                                if (isSleeve && PRESERVE_RIB_DISTANCE) {
                                                    log("Organizing Sleeve Bottom/Cuff design (preserving test-print distance)...");
                                                    var mm = 2.83465, sideMargin = 7 * mm;
                                                    // Recover the rib/cuff line's TRUE distance-from-bottom and
                                                    // height as drawn in the mockup (test print): alignAndScale
                                                    // above already stretched the whole design vertically by
                                                    // ribScaleInfo.sh percent to fit this size's panel, so
                                                    // dividing the line's CURRENT (post-stretch) measurements by
                                                    // that same factor undoes the stretch and gives back the
                                                    // mockup-native value - same real-world distance on every
                                                    // size, instead of a hardcoded universal constant.
                                                    var ribScaleInfo = scaleInfo || scaleInfo2;
                                                    var ribScaleY = (ribScaleInfo && ribScaleInfo.sh) ? (ribScaleInfo.sh / 100) : 1;
                                                    if (!ribScaleY || ribScaleY <= 0) ribScaleY = 1;
                                                    // Classify against the PATTERN's own stable shape (baseShape),
                                                    // not the pasted design's own bounds - the design's bounds
                                                    // shrink/grow with however much artwork happens to be drawn
                                                    // (e.g. a full logo on one side, just a couple of construction
                                                    // lines on the other), which made this same rib/cuff line
                                                    // classify as "found" on one sleeve side and "not found" on
                                                    // the other - so only one side got its line correctly
                                                    // repositioned, and they ended up at two different heights.
                                                    // baseShape is the identical physical sleeve panel on both
                                                    // sides, so thresholds off it are consistent for both.
                                                    var dBounds = baseShape.geometricBounds, dWidth = Math.abs(dBounds[2] - dBounds[0]), dHeight = Math.abs(dBounds[1] - dBounds[3]);
                                                    var bThreshold = dBounds[3] + (dHeight * 0.25);
                                                    var ribPaths = [];
                                                    function collectBottomPaths(container) {
                                                        for (var r = 0; r < container.pageItems.length; r++) {
                                                            var it = container.pageItems[r];
                                                            var iName = (it.name || "").toLowerCase();
                                                            if (it.typename === "PathItem" || it.typename === "CompoundPathItem") {
                                                                var isWide = it.width > (dWidth * 0.15), isShort = it.height < (150 * mm), isBottomHalf = (it.top < bThreshold) || (dHeight < 100 * mm);
                                                                var isExplicitRib = (iName.indexOf("rib") !== -1 || iName.indexOf("cuff") !== -1 || iName.indexOf("box") !== -1);
                                                                if ((isWide && isShort && isBottomHalf) || isExplicitRib) ribPaths.push(it);
                                                            } else if (it.typename === "GroupItem") collectBottomPaths(it);
                                                        }
                                                    }
                                                    collectBottomPaths(pastedDesign);
                                                    if (ribPaths.length > 0) {
                                                        log("Found " + ribPaths.length + " paths to align as cuff/rib.");
                                                        var patternBottom = pastedPattern.visibleBounds[3];
                                                        for (var p = 0; p < ribPaths.length; p++) {
                                                            try {
                                                                var rp = ribPaths[p];
                                                                // Direct .width=/.height= assignment throws "Unknown
                                                                // scripting error" on a perfectly flat construction
                                                                // line (near-zero geometric height) - Illustrator
                                                                // can't compute a scale ratio from a ~0 baseline.
                                                                // Use .resize() instead (as everywhere else in this
                                                                // script), skipping the height axis when the path
                                                                // has none to scale from - only its width (and
                                                                // position) matter for a flat rib/cuff marker line.
                                                                var rb = rp.geometricBounds; // [L,T,R,B]
                                                                var curW = Math.abs(rb[2] - rb[0]), curH = Math.abs(rb[1] - rb[3]);
                                                                // Mockup-native (pre-stretch) height and distance-from-
                                                                // panel-bottom for THIS line, recovered by undoing the
                                                                // general design stretch applied above.
                                                                var origH = curH / ribScaleY;
                                                                var origDistFromBottom = (rb[1] - patternBottom) / ribScaleY;
                                                                var targetW = baseShape.width + (sideMargin * 2), targetH = origH;
                                                                if (curW > 0.01) {
                                                                    var swPct = (targetW / curW) * 100;
                                                                    var shPct = (curH > 0.01) ? (targetH / curH) * 100 : 100;
                                                                    rp.resize(swPct, shPct, true, true, true, true, 100, Transformation.TOPLEFT);
                                                                }
                                                                // STROKE OVERHANG - without this the rib lands half its own
                                                                // stroke width TOO LOW, on every size.
                                                                //
                                                                // The two reads above and the write below disagree about
                                                                // whether a stroke counts:
                                                                //   - `rp.geometricBounds` EXCLUDES the stroke, so
                                                                //     origDistFromBottom is the distance to the rib's
                                                                //     unpainted path.
                                                                //   - `rp.top` (like `.left`) is visibleBounds[1] and
                                                                //     INCLUDES it, so assigning that distance puts the
                                                                //     rib's PAINTED top where its path was meant to be.
                                                                // Everything then sits strokeWidth/2 low, and the bottom of
                                                                // the band is clipped away by the panel.
                                                                //
                                                                // Measured on job Knuckle_Headz_Mint: the mockup's "rib" is
                                                                // ONE PathItem carrying a 131.9pt stroke - geometric height
                                                                // 1.959in but PAINTED height 3.791in, geometric top 1.938in
                                                                // above the panel bottom but painted top 2.854in. The log
                                                                // dutifully printed "1.96in from bottom, 1.96in tall" (both
                                                                // geometric, both correct) while every exported sleeve had
                                                                // its rib 0.90in lower than the test print, with the mint
                                                                // gap covering the pinstripes that should run through it.
                                                                //
                                                                // Only the GEOMETRY was stretched by ribScaleY (resize above
                                                                // passes lineScale=100, so the stroke width is untouched by
                                                                // this script and by alignAndScale before it - confirmed,
                                                                // 131.9pt in the mockup AND in the finished order file). So
                                                                // the un-stretch applies to the geometric distance only and
                                                                // the overhang is added back at full size afterwards.
                                                                //
                                                                // Read after the resize so it can never go stale, and zero
                                                                // for an unstroked path - which is exactly the old
                                                                // behaviour, so nothing changes for a rib drawn without one.
                                                                var rbAfter = rp.geometricBounds, rvAfter = rp.visibleBounds;
                                                                var strokeTopOverhang = rvAfter[1] - rbAfter[1];
                                                                if (!(strokeTopOverhang > 0)) strokeTopOverhang = 0;
                                                                rp.left = baseShape.left - sideMargin; rp.top = patternBottom + origDistFromBottom + strokeTopOverhang;
                                                                log("   - Rib/cuff line matched to test print: path " + (Math.round((origDistFromBottom / 72) * 100) / 100) + "in from bottom, " + (Math.round((origH / 72) * 100) / 100) + "in tall" +
                                                                    (strokeTopOverhang > 0
                                                                        ? "; + " + (Math.round((strokeTopOverhang / 72) * 100) / 100) + "in stroke overhang -> painted top " + (Math.round(((origDistFromBottom + strokeTopOverhang) / 72) * 100) / 100) + "in from bottom, painted height " + (Math.round(((rvAfter[1] - rvAfter[3]) / 72) * 100) / 100) + "in."
                                                                        : " (unstroked)."));
                                                            } catch (eRib) {
                                                                log("   - WARNING: could not align rib/cuff path " + p + ": " + eRib.message);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            // SLEEVE-MATCH: after all alignment is final (alignAndScale,
                                            // side-panel underarm fix, rib layout) and BEFORE the clip
                                            // group is built. Front/back: measure this size's D once.
                                            // Sleeve: shift its side art until its own D matches.
                                            if (SM_ON && !isAcc) {
                                                if (isFrontOrBack(item.part_name)) {
                                                    smMeasureBodyD(pastedDesign, baseShape, sizeLabel, item.part_name);
                                                } else if (isSleeve) {
                                                    smApplySleeveMatch(pastedDesign, baseShape, sizeLabel, displayGroupName);
                                                }
                                            }

                                            // LOCAL-TAG label: personalize the size letter, pin the
                                            // label box to its target width (3in adult / 2.5in youth)
                                            // and restore its own clipping mask. Gated by the frontend
                                            // checkbox - a job that doesn't check it never touches
                                            // any "LOCAL TAG" group, even if one happens to exist.
                                            if (LOCAL_TAG_ON) {
                                                var localTagGroupRef = processLocalTagLabel(pastedDesign, sizeLabel, baseShape);
                                                // HOODIE: remember this Front's Local Tag so the Pocket
                                                // overlap-resolution recipe (post-pass, after the main
                                                // loop) can measure/move it - see hoodieFrontBySize above.
                                                if (HOODIE_ON && isFront(item.part_name) && localTagGroupRef) {
                                                    if (!hoodieFrontBySize[sizeLabel]) hoodieFrontBySize[sizeLabel] = {};
                                                    hoodieFrontBySize[sizeLabel].localTagGroup = localTagGroupRef;
                                                    // Clear the tag out from under this size's Pocket NOW, while
                                                    // the Front is still unexported - the Pocket is built much
                                                    // later (buildHoodieExtras), far too late to affect either
                                                    // export. See hoodieResolveLocalTagVsPocket.
                                                    hoodieResolveLocalTagVsPocket(sizeLabel, baseShape, localTagGroupRef);
                                                }
                                            }

                                            log("Finalizing Design Layering (Logos to Front)...");
                                            bringLogosToFront(pastedDesign);
                                            // Catches any linked image added AFTER the initial paste
                                            // (e.g. a LOGO-SWAP duplicate from the logo library) that
                                            // the earlier embedPlacedItems call couldn't have seen yet.
                                            embedPlacedItems(pastedDesign);
                                            fixIndexedRasters(pastedDesign);

                                            if (pastedDesign.pageItems && pastedDesign.pageItems.length > 0) {
                                                log("Setting up Clipping Mask for " + instanceName);
                                                try {
                                                    if (pastedPattern.typename !== "GroupItem") {
                                                        var newGroup = orderDoc.groupItems.add(); newGroup.move(pastedPattern, ElementPlacement.PLACEBEFORE);
                                                        pastedPattern.move(newGroup, ElementPlacement.PLACEATBEGINNING); pastedPattern = newGroup;
                                                    }
                                                    pastedDesign.move(pastedPattern, ElementPlacement.PLACEATBEGINNING);
                                                    var clipMask = baseShape.duplicate(pastedPattern, ElementPlacement.PLACEATBEGINNING);
                                                    var clipGroup = pastedPattern.groupItems.add();
                                                    clipGroup.name = "design_clip_group"; clipGroup.move(baseShape, ElementPlacement.PLACEBEFORE);
                                                    clipMask.move(clipGroup, ElementPlacement.PLACEATBEGINNING); pastedDesign.move(clipGroup, ElementPlacement.PLACEATEND);
                                                    if (clipGroup.pageItems.length >= 2) {
                                                        clipGroup.clipped = true;
                                                        log("Success: Clipping mask active.");
                                                    }
                                                // PARM goes up to the panel rollback - see the note on the Merge Error catch.
                                                } catch (eClip) {
                                                    parmBail(eClip, "the clipping mask setup");
                                                    log("Clipping setup failed: " + eClip.message);
                                                }
                                            }

                                            // PLACKET-MATCH v2 (full-button jersey only): runs once THIS
                                            // panel's own clip is fully built. Front-Left is stored/queued
                                            // per size; when that size's Front-Right reaches this same
                                            // point, the two are joined - see pmProcessPanel/pmJoinPanels.
                                            if (FULL_BUTTON && (isFrontLeft(item.part_name) || isFrontRight(item.part_name))) {
                                                // SHOULDER-MATCH: capture Front-Left's own shoulder-to-Match
                                                // distance now, before pmProcessPanel's placket-match
                                                // join/mirror can touch this panel's content.
                                                if (FRONT_BACK_MATCH && isFrontLeft(item.part_name)) {
                                                    pmMeasureShoulderTarget(baseShape, pastedDesign, sizeLabel, "Front-Left", true);
                                                }
                                                // STRIPE/BACKGROUND SEAM CONTINUITY: gated by its own
                                                // PATTERN_MATCH checkbox (independent of Center-Match) - only
                                                // runs, and only ever touches an object named exactly
                                                // "Pattern", when that checkbox is on. See pmStripeSeamShift/
                                                // pmFindPatternGroup. Runs BEFORE pmProcessPanel on purpose:
                                                // pmProcessPanel re-exports Front-Left's JPG (its snapshot goes
                                                // stale once the join/mirror below touches it) - if the stripe
                                                // shift ran AFTER that re-export, Front-Left's saved JPG would
                                                // keep the pre-correction stripe position forever while
                                                // Front-Right's own (separate, later) export DOES pick it up,
                                                // making the seam correction look Right-side-only even though
                                                // both panels' shapes were actually shifted in-memory
                                                // (confirmed job 6ddd62c9: Front-Right's export ran after the
                                                // shift, Front-Left's did not). Calling this first means
                                                // Front-Left is already corrected by the time pmProcessPanel
                                                // exports it.
                                                if (PATTERN_MATCH) {
                                                    pmProcessStripeSeam(baseShape, pastedDesign, sizeLabel, item.part_name);
                                                }
                                                if (CENTER_MATCH) {
                                                    pmProcessPanel(pastedPattern, baseShape, pastedDesign, sizeLabel, item.part_name, abIdx, instanceName);
                                                }
                                            } else if (FRONT_BACK_MATCH && isFront(item.part_name)) {
                                                // STRIPES MATCH on a job whose front is ONE piece (normal
                                                // jersey or hoodie): the plain "front" panel plays exactly
                                                // the role Front-Left plays above - measured, never
                                                // modified - and Back below is adjusted to it. isFront() is
                                                // "front" EXACTLY, so this can never collide with the
                                                // full-button branch: a job that splits the front has no
                                                // plain "front" part at all, only "front-left"/"front-right".
                                                pmMeasureShoulderTarget(baseShape, pastedDesign, sizeLabel, "Front", false);
                                            }

                                            // SHOULDER-MATCH: resize Back's own Match shape so its
                                            // shoulder-to-shape distance matches the Front's, then
                                            // re-export Back's JPG with the corrected shape.
                                            //
                                            // No longer gated on FULL_BUTTON, and lifted out of the
                                            // else-chain above (isBack is mutually exclusive with every
                                            // branch there): Back is the same panel whatever the front
                                            // looks like, and the ONE front distance stored above is what
                                            // it matches. If no front was measured for this size - the
                                            // Match_ shape is missing, or the plan happens to list Back
                                            // before Front - pmApplyBackShoulderMatch logs it and leaves
                                            // Back untouched, same soft behaviour as before.
                                            if (FRONT_BACK_MATCH && isBack(item.part_name)) {
                                                pmApplyBackShoulderMatch(baseShape, pastedDesign, sizeLabel, abIdx, instanceName);
                                            }

                                            // SIDE-SEAM MATCH: standalone (works with or without Full
                                            // Button Jersey), only ever fires for a PLAIN "front"/"back"
                                            // part - Front queues, Back triggers the join, same queue/
                                            // trigger shape as PLACKET-MATCH's pmProcessPanel above, but
                                            // its own queue (ssQueue) so it runs independently of
                                            // FULL_BUTTON/CENTER_MATCH/FRONT_BACK_MATCH/PATTERN_MATCH.
                                            if (SIDE_SEAM_MATCH && isFront(item.part_name)) {
                                                ssQueue[sizeLabel] = { pastedPattern: pastedPattern, baseShape: baseShape, pastedDesign: pastedDesign };
                                                log("SIDE-SEAM MATCH [" + sizeLabel + "]: Front queued, waiting for its Back counterpart.");
                                            } else if (SIDE_SEAM_MATCH && isBack(item.part_name)) {
                                                var ssFrontState = ssQueue[sizeLabel];
                                                if (!ssFrontState) {
                                                    pmWarn(sizeLabel, "Back", "SIDE-SEAM MATCH: no Front counterpart was queued for this size - skipped.");
                                                } else {
                                                    delete ssQueue[sizeLabel];
                                                    ssProcessPair(ssFrontState, { pastedPattern: pastedPattern, baseShape: baseShape, pastedDesign: pastedDesign }, sizeLabel);
                                                }
                                            }

                                            // HOODIE: caches Front's finished (positioned/colored/designed)
                                            // panel so the post-pass below (after the main loop) can build
                                            // Border 5mm below it and clip Front's design into Pocket at
                                            // Front's own coordinates - object refs only, no coordinate
                                            // snapshots, so bounds are always read fresh at consumption time
                                            // (same live-reference pattern as ssQueue above).
                                            if (HOODIE_ON && isFront(item.part_name)) {
                                                // Merge, don't overwrite - LOCAL-TAG processing above (which
                                                // runs earlier in this same item) may have already stashed
                                                // localTagGroup on this same sizeLabel's entry.
                                                var hfs = hoodieFrontBySize[sizeLabel] || {};
                                                hfs.pastedPattern = pastedPattern; hfs.baseShape = baseShape; hfs.pastedDesign = pastedDesign;
                                                hoodieFrontBySize[sizeLabel] = hfs;
                                            }

                                            // BACK-LABEL: runs on every Back panel (full-button or normal
                                            // jersey alike) that has a "Back Label" named group - a no-op
                                            // otherwise. See placeBackLabel() for the exact rule.
                                            if (isBack(item.part_name)) {
                                                placeBackLabel(baseShape, pastedDesign, sizeLabel, FULL_BUTTON);
                                                // If this panel also went through SHOULDER-MATCH, Match_ may
                                                // now be sitting too close to the label that was just placed
                                                // - resolve that (label down in capped steps first, then
                                                // Match_ up for the remainder, then re-match) rather than
                                                // ever moving the label alone. See pmResolveBackLabelClearance.
                                                //
                                                // Un-gated from FULL_BUTTON along with SHOULDER-MATCH itself:
                                                // the collision it resolves is caused by the resize
                                                // pmApplyBackShoulderMatch just did, so wherever that runs
                                                // this has to run too, or a normal jersey's grown Match_ arc
                                                // would be free to sit on the back label.
                                                if (FRONT_BACK_MATCH) {
                                                    pmResolveBackLabelClearance(baseShape, pastedDesign, sizeLabel, abIdx, instanceName);
                                                }
                                            }
                                        } else {
                                            log("WARNING: Could not paste source design for " + item.part_name);
                                        }
                                    } else {
                                        if (!isAcc) log("SKIP: No matching design found in mockup for " + item.part_name + " - panel keeps the pattern file's own fill.");
                                    }
                                    
                                    if (isAcc) {
                                        log("Accessory Processing: " + item.part_name);
                                        // The mockup group this accessory's colors come from: the design
                                        // getSourceView already found, else the raw-part-name lookup below.
                                        var accMockupGroup = sourceDesign;
                                        if (sourceDesign) {
                                            log("Accessory design pasted from mockup - base fill already applied by getDesignBaseFill.");
                                        } else {
                                        var accColor = null;

                                        // CMYK-DIRECT PARITY: pick the accessory's color with the SAME
                                        // rule every other part uses - getDesignBaseFill ('base-path'
                                        // first, else the largest FILLED path; solid, spot or gradient
                                        // alike). The old code read the largest path's fill directly and
                                        // understood only plain CMYK and spot-with-CMYK-ink, so a gray
                                        // ink, a gradient, or an unfilled largest path all fell through
                                        // to "no color detected" and the accessory silently kept the
                                        // PATTERN file's stock fill - the same class of bug that made
                                        // Rib & Cuff export red on a black garment.
                                        // The group is duplicated into the order doc and run through
                                        // mergeAndCleanupSwatches BEFORE the fill is read: a color object
                                        // taken straight off a mockup item keeps a cross-document
                                        // spot/gradient reference and renders as no-fill once the mockup
                                        // closes.
                                        try {
                                            var mockupAcc = findAnywhere(mockupDoc, item.part_name);
                                            if (!mockupAcc) {
                                                log("Accessory WARNING: no group named '" + item.part_name + "' found in mockup.");
                                            } else {
                                                accMockupGroup = mockupAcc;
                                                var accProbe = null;
                                                try {
                                                    if (mockupAcc.typename === "Layer") {
                                                        // findAnywhere indexes LAYERS by name too, and a Layer has
                                                        // no item-level duplicate() - same case getSourceView's
                                                        // caller handles when it groups a Layer's children.
                                                        accProbe = orderDoc.groupItems.add();
                                                        for (var al = mockupAcc.pageItems.length - 1; al >= 0; al--) {
                                                            mockupAcc.pageItems[al].duplicate(accProbe, ElementPlacement.PLACEATBEGINNING);
                                                        }
                                                    } else {
                                                        accProbe = mockupAcc.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                                                    }
                                                    mergeAndCleanupSwatches(orderDoc, accProbe);
                                                    var accFill = getDesignBaseFill(accProbe);
                                                    if (accFill) {
                                                        // Assigned while accProbe is still alive on purpose: a
                                                        // gradient fill stays valid only while something in the
                                                        // document still references it.
                                                        baseShape.fillColor = accFill.color;
                                                        baseShape.filled = true;
                                                        accColor = accFill.color;
                                                        log("Accessory base filled from mockup (" + accFill.src + ", " + accFill.color.typename + ").");
                                                    } else {
                                                        log("Accessory WARNING: mockup group '" + item.part_name + "' has no filled path to take a color from.");
                                                    }
                                                } catch (eProbe) {
                                                    log("Accessory Color Detection Warning: " + eProbe.message);
                                                }
                                                if (accProbe) { try { accProbe.remove(); } catch (eRm) {} }
                                            }
                                        } catch(eAcc) { log("Accessory Color Detection Warning: " + eAcc.message); }

                                        if (!accColor) {
                                            log("Accessory WARNING: no color detected in mockup - keeping the pattern file's own fill.");
                                        }
                                        }
                                        // ACCESSORY STROKE: per explicit instruction this must come from
                                        // the mockup like every other color, instead of the hardcoded
                                        // near-black ensureBlackStrokes used to force on every stroked
                                        // path of the pattern piece. That near-black is now only the
                                        // fallback for a mockup design that draws no stroke at all.
                                        var accStroke = accMockupGroup ? getDesignStrokeColor(accMockupGroup) : null;
                                        if (accStroke) log("Accessory: stroke color taken from the mockup design (" + accStroke.typename + ").");
                                        else log("Accessory: mockup design draws no stroke - keeping the default dark stroke.");
                                        ensureBlackStrokes(pastedPattern, accStroke);
                                        masterProcessed = pastedPattern;
                                    }
                                } else {
                                    log("WARNING: No Placement Path found in " + targetGroupName);
                                }
                            }

                            // RIB & CUFF: its placement path used to have the stroke
                            // dropped here (the pattern's own outline reads as an
                            // unwanted border once the panel takes the mockup's real
                            // colour). Removed - no stroke is stripped anywhere now,
                            // per explicit instruction, and this piece's outline goes
                            // through applyPatternOutlineStroke like every other one.
                            // Gated by the frontend checkbox - a job that doesn't
                            // check it never recolors a neck, even though the
                            // panel fill it would judge against is right here.
                            if (isNeck && baseShape) {
                                if (NECK_CONTRAST_ON) smartContrast(pastedPattern, baseShape.fillColor);
                                else log("NECK CONTRAST skipped (checkbox off): neck text and labels keep the colors the mockup and pattern drew.");
                            }
                            // Pattern-side brand text (e.g. neck "BIG KID") copied
                            // from the pattern doc can carry a broken appearance
                            // that Illustrator silently refuses to render at export
                            // (its duplicates stay invisible too; a fresh frame with
                            // identical font/size renders fine). Rebuild each frame
                            // AFTER smartContrast so the final fill is carried over.
                            if (isNeck) rebuildTextFrames(pastedPattern);
                            bringPatternLabelsToFront(pastedPattern, orderDoc, baseShape);
                            if (parmTry > 1) log("PARM RECOVERED: " + instanceName + " rebuilt cleanly on attempt " + parmTry + " of " + parmAttempts + ".");
                            break;   // piece complete - leave the rollback loop
                        } catch (eInstance) {
                            // e.line turns "kahin bhi aa jata hai" into an exact
                            // line number the next time this fires.
                            var eAt = "";
                            try { if (eInstance.line) eAt = " (jsx line " + eInstance.line + ")"; } catch (eLn) {}
                            log("Error in instance: " + instanceName + " -> " + eInstance.message + eAt);

                            if (isParmError(eInstance) && parmTry < parmAttempts && parmBudgetUsed < PARM_BUDGET) {
                                // Take the piece back to nothing BEFORE building it
                                // again. rollbackInstance returns false when the
                                // artwork would not come off the canvas - and then we
                                // must NOT rebuild, because that would leave two
                                // copies of this piece stacked in one place, which
                                // nothing downstream would ever flag.
                                if (rollbackInstance(parmSnap, pastedPattern, pastedDesign)) {
                                    pastedPattern = null; pastedDesign = null;
                                    parmBudgetUsed++;
                                    log("PARM ROLLBACK: " + instanceName + " removed from the order document - rebuilding from scratch (attempt " +
                                        parmTry + " of " + parmAttempts + "), in " + (PARM_SLEEP_MS / 1000) + "s...");
                                    $.sleep(PARM_SLEEP_MS);
                                    continue;
                                }
                                log("PARM ROLLBACK FAILED: " + instanceName + " could not be removed from the canvas - not rebuilding, " +
                                    "because a second copy would be stacked on the first.");
                            }

                            if (isParmError(eInstance)) {
                                recordParmError("PANEL FAILED - " + parmWhere() + ": PARM error" + eAt +
                                    ", rebuilt from scratch " + (parmTry - 1) + " time(s) and still failed. " +
                                    "This panel is incomplete - CHECK IT MANUALLY.");
                            }
                            break;   // give up on this piece; the job carries on
                        }
                        }

                        // ARTBOARD FIT (must stay the LAST thing before the export).
                        // The artboard rect is computed from the piece's position
                        // the moment it is duplicated in - long before the design is
                        // pasted, scaled, seam-measured and clipped. If ANY of that
                        // moves the panel afterwards, the artboard no longer frames
                        // it and the JPEG comes out cut off at one edge with blank
                        // paper at the other (reported job bdb2a7a6: every Back and
                        // Short Sleeve sat exactly 792pt above its own artboard, so
                        // the bottom third of each export was empty, while that same
                        // pattern rendered correctly the day before).
                        // Re-fitting through Illustrator's own fitArtboardToSelectedArt
                        // makes the export self-correcting whatever moved: a healthy
                        // piece fits to the identical rect and nothing changes, and
                        // the log names any piece that did drift, with how far.
                        // FIRST put the piece back in the slot the row-flow gave it,
                        // THEN fit the artboard. Order matters: moving the artboard
                        // alone would frame a piece that is still physically sitting
                        // in the row above, which is what made the finished sheet
                        // overlap (job d123b31d - every piece except the very first
                        // one and the Necks had climbed 792pt out of its row).
                        snapPieceToItsSlot(pastedPattern, baseShape, finalRect, instanceName);
                        fitArtboardToPanel(abIdx, baseShape, instanceName);

                        log("Queued JPG for instance: " + instanceName);
                        queueExport( abIdx, exportFolderFor(sizeLabel), instanceName, sizeLabel);
                        log("--- FINISHED " + instanceName + " ---\n");
                        
                        if (ribCuffAnchored) {
                            // Anchored below its Sleeve - never touched currentX/
                            // currentY, so there's nothing to advance or restore;
                            // it consumed no row-flow space at all.
                        } else if (sleevePairStacked) {
                            // Paired sleeve consumed no new column - restore the row-flow
                            // slot to what it was before this pair started, but make sure
                            // the row's height accounts for the full stacked pair (not
                            // just the first sleeve's own height).
                            var pairBottom = currentY - pHeight;
                            var pairTotalHeight = Math.abs(pmLastSleevePanel.topY - pairBottom);
                            if (pairTotalHeight > rowMaxHeight) rowMaxHeight = pairTotalHeight;
                            currentX = preFlowX; currentY = preFlowY;
                            pmLastSleevePanel = null;
                        } else {
                            currentX += pWidth + refContext.spacing;
                            if (pHeight > rowMaxHeight) rowMaxHeight = pHeight;
                            pmLastSleevePanel = isShortSleevePart ? { sizeLabel: sizeLabel, leftX: preFlowX, topY: preFlowY, bottomY: preFlowY - pHeight } : null;
                        }
                        if (currentX > 7500) { currentX = -7500; currentY -= (rowMaxHeight + refContext.vSpacing); rowMaxHeight = 0; }
                    }
                } else log("WARNING: Could not find: " + targetGroupName);

            }

            // HOODIE: build this size's Outside Hood / Inside Hood / Border /
            // Pocket right here, immediately after its Front/Back/Neck/Sleeve
            // items above, so they land in the same row-flow block as the
            // rest of THIS size instead of being deferred to a final pass
            // that only runs after every other size has already been placed
            // (which used to push all hoodie extras to the very end of the
            // order file, size-grouping broken). hoodieFrontBySize[sizeLabel]
            // is populated above as soon as this group's 'front' item is
            // processed, so it's always ready by the time we get here.
            if (HOODIE_ON && hoodieFrontBySize.hasOwnProperty(sizeLabel) && !hoodieFrontBySize[sizeLabel].built) {
                try {
                    updateStatus("Building Hoodie parts (Hood/Border/Pocket) for " + sizeLabel + "...", 90, false);
                    buildHoodieExtras(sizeLabel, hoodieFrontBySize[sizeLabel]);
                } catch (eHoodieInline) { log("HOODIE: error building extras for " + sizeLabel + ": " + eHoodieInline.message); }
                hoodieFrontBySize[sizeLabel].built = true;
            }
        }

        // SLEEVE-MATCH: hand the warnings to the backend (jobDir JSON -> shown
        // on the frontend at end of job) and drop a readable copy into the
        // renders folder so it ships inside the zip next to debug_log.txt.
        if (SM_ON) {
            try {
                if (typeof jobDir !== 'undefined') {
                    var smJsonFile = new File(jobDir + "/sleeve_match_warnings.json");
                    smJsonFile.open("w");
                    smJsonFile.write(JSON.stringify({ warnings: sleeveMatchWarnings }));
                    smJsonFile.close();
                }
                if (sleeveMatchWarnings.length > 0) {
                    var smTxtFile = new File(outputDir + "/sleeve_match_warnings.txt");
                    smTxtFile.open("w");
                    smTxtFile.writeln("SLEEVE-MATCH WARNINGS (" + sleeveMatchWarnings.length + ") - these parts rendered WITHOUT matching, check them manually:");
                    for (var smW = 0; smW < sleeveMatchWarnings.length; smW++) smTxtFile.writeln(" - " + sleeveMatchWarnings[smW]);
                    smTxtFile.close();
                    log("SLEEVE-MATCH: " + sleeveMatchWarnings.length + " warning(s) written to sleeve_match_warnings.txt");
                } else {
                    log("SLEEVE-MATCH: all applicable parts matched within +/-1mm.");
                }
            } catch (eSmw) { log("SLEEVE-MATCH: could not write warnings file: " + eSmw.message); }
        }

        // PLACKET-MATCH: same warnings-file pattern as SLEEVE-MATCH above,
        // gated by the full-button jersey checkbox instead of the sleeve one.
        if (FULL_BUTTON) {
            try {
                if (typeof jobDir !== 'undefined') {
                    var pmJsonFile = new File(jobDir + "/placket_match_warnings.json");
                    pmJsonFile.open("w");
                    pmJsonFile.write(JSON.stringify({ warnings: placketMatchWarnings }));
                    pmJsonFile.close();
                }
                if (placketMatchWarnings.length > 0) {
                    var pmTxtFile = new File(outputDir + "/placket_match_warnings.txt");
                    pmTxtFile.open("w");
                    pmTxtFile.writeln("PLACKET-MATCH WARNINGS (" + placketMatchWarnings.length + ") - these parts rendered WITHOUT placket matching, check them manually:");
                    for (var pmW = 0; pmW < placketMatchWarnings.length; pmW++) pmTxtFile.writeln(" - " + placketMatchWarnings[pmW]);
                    pmTxtFile.close();
                    log("PLACKET-MATCH: " + placketMatchWarnings.length + " warning(s) written to placket_match_warnings.txt");
                } else {
                    log("PLACKET-MATCH: all applicable parts matched within +/-1mm.");
                }
            } catch (ePmw) { log("PLACKET-MATCH: could not write warnings file: " + ePmw.message); }
        }

        // BACK-LABEL: same warnings-file pattern as SLEEVE-MATCH/PLACKET-MATCH
        // above - unconditional (runs on every job; a job with no "Back Label"
        // group just ends up with an empty warnings list).
        try {
            if (typeof jobDir !== 'undefined') {
                var blJsonFile = new File(jobDir + "/back_label_warnings.json");
                blJsonFile.open("w");
                blJsonFile.write(JSON.stringify({ warnings: backLabelWarnings }));
                blJsonFile.close();
            }
            if (backLabelWarnings.length > 0) {
                var blTxtFile = new File(outputDir + "/back_label_warnings.txt");
                blTxtFile.open("w");
                blTxtFile.writeln("BACK-LABEL WARNINGS (" + backLabelWarnings.length + ") - neckline detection fallback, position verification, or Match_ clearance issues below, check manually:");
                for (var blW = 0; blW < backLabelWarnings.length; blW++) blTxtFile.writeln(" - " + backLabelWarnings[blW]);
                blTxtFile.close();
                log("BACK-LABEL: " + backLabelWarnings.length + " warning(s) written to back_label_warnings.txt");
            } else {
                log("BACK-LABEL: neckline center detected normally on every panel (no fallback used).");
            }
        } catch (eBlw) { log("BACK-LABEL: could not write warnings file: " + eBlw.message); }

        // HOODIE: Outside Hood, Inside Hood, Border and Pocket are now built
        // inline per size (see the HOODIE block right after the item loop
        // above), so each size's hoodie extras land next to that size's own
        // Front/Back/Neck/Sleeve instead of all being pushed to the end of
        // the order file. This is just a safety-net fallback for any size
        // that, for whatever reason (e.g. plan never had a plain 'front'
        // item for it - full-button splits it into front-left/front-right),
        // never got marked .built above - still better than silently
        // dropping its hoodie parts.
        if (HOODIE_ON) {
            buildPendingHoodieExtras();
            try {
                if (typeof jobDir !== 'undefined') {
                    var hoodieJsonFile = new File(jobDir + "/hoodie_warnings.json");
                    hoodieJsonFile.open("w");
                    hoodieJsonFile.write(JSON.stringify({ warnings: hoodieWarnings }));
                    hoodieJsonFile.close();
                }
                if (hoodieWarnings.length > 0) {
                    var hoodieTxtFile = new File(outputDir + "/hoodie_warnings.txt");
                    hoodieTxtFile.open("w");
                    hoodieTxtFile.writeln("HOODIE WARNINGS (" + hoodieWarnings.length + ") - check these manually:");
                    for (var hW = 0; hW < hoodieWarnings.length; hW++) hoodieTxtFile.writeln(" - " + hoodieWarnings[hW]);
                    hoodieTxtFile.close();
                    log("HOODIE: " + hoodieWarnings.length + " warning(s) written to hoodie_warnings.txt");
                } else {
                    log("HOODIE: all parts built without warnings.");
                }
            } catch (eHw) { log("HOODIE: could not write warnings file: " + eHw.message); }
        }

        // PARM ERRORS: same warnings-file pattern as sleeve-match / back-label /
        // hoodie above, but deliberately named for the error itself rather than
        // for colour - a PARM can strike anywhere in a panel's build (colour,
        // duplicate, path walk, scaling), and calling the file "colour warnings"
        // sent people looking in the wrong place. The JSON is written even when
        // empty so this run's result can never be confused with a leftover file
        // from a previous run.
        try {
            if (typeof jobDir !== 'undefined') {
                var parmJsonFile = new File(jobDir + "/parm_errors.json");
                parmJsonFile.open("w");
                parmJsonFile.write(JSON.stringify({ errors: parmErrors }));
                parmJsonFile.close();
            }
            if (parmErrors.length > 0) {
                var parmTxtFile = new File(outputDir + "/parm_errors.txt");
                parmTxtFile.open("w");
                parmTxtFile.writeln("PARM ERRORS - " + parmErrors.length + " PANEL(S) FAILED. CHECK THESE MANUALLY.");
                parmTxtFile.writeln("");
                parmTxtFile.writeln("Illustrator raised error 1346458189 ('PARM') while building the panels below.");
                parmTxtFile.writeln("Each panel was deleted and rebuilt from scratch " + PARM_RETRIES + " times, " +
                                    (PARM_SLEEP_MS / 1000) + " seconds apart, and still failed.");
                parmTxtFile.writeln("");
                parmTxtFile.writeln("These panels are NOT complete - colours, clipping, placement or matching may");
                parmTxtFile.writeln("be missing. Open each one in the .ai file and finish it by hand before printing.");
                parmTxtFile.writeln("");
                for (var pE = 0; pE < parmErrors.length; pE++) parmTxtFile.writeln(" - " + parmErrors[pE]);
                parmTxtFile.close();
                log("PARM: " + parmErrors.length + " PANEL(S) FAILED - written to parm_errors.txt (" +
                    parmBudgetUsed + " rebuild attempt(s) used of " + PARM_BUDGET + ").");
            } else if (parmBudgetUsed > 0) {
                log("PARM: " + parmBudgetUsed + " rebuild attempt(s) used, and every panel came out clean - no manual checks needed.");
            } else {
                log("PARM: no PARM errors in this job.");
            }
        } catch (ePw) { log("PARM: could not write parm_errors: " + ePw.message); }

        // Last document's panels - same ordering rule as the split above.
        flushExports(orderFileName(orderDocIndex));

        updateStatus("Saving AI file...", 95, false);
        log("Attempting to save final AI file...");
        saveOrderDoc();
        writeOrderFileIndex();

        try {
            if (orderDoc) { orderDoc.close(SaveOptions.DONOTSAVECHANGES); log("Order doc closed."); }
            if (mockupDoc) { mockupDoc.close(SaveOptions.DONOTSAVECHANGES); log("Mockup doc closed."); }
            if (logoLibraryDoc) { logoLibraryDoc.close(SaveOptions.DONOTSAVECHANGES); log("Logo library doc closed."); }
        } catch (eClose) {
            log("CLOSE ERROR: " + eClose.message);
        }

        // NOT is_ready, and NOT 100. The rendering is done, but the backend
        // still has to stamp the JPEG dpi, build the ~334MB zip and collect the
        // sleeve-match / back-label / PARM reports - and only IT knows whether
        // any of those need the operator's attention. Claiming "ready" here
        // enabled the Download button before the zip existed, and made the bar
        // jump 100 -> 90 -> 100 when the backend carried on afterwards.
        // illustrator_automation.py writes the one true terminal status.
        updateStatus("Finishing up...", 96, false);
        log("Rendering complete at: " + new Date().toTimeString());
    } catch (e) {
        if (typeof logPath !== 'undefined') {
            try { log("CRITICAL JSX ERROR: " + e.message + " (Line: " + e.line + ")"); } catch(eL) {}
        }
        var errLog = new File(outputDir + "/error_log.txt");
        errLog.open("w"); errLog.write("JSX Error: " + e.message + "\nLine: " + e.line); errLog.close();
    }

    // --- HELPER FUNCTIONS ---

    // PARM HANDLING (Illustrator error 1346458189, 'PARM' = kBadParameterErr).
    // See the state block next to hoodieWarnings for what this error actually is
    // and what it has meant in this job.
    function isParmError(e) {
        var m = "";
        try { m = String(e && e.message ? e.message : e); } catch (eM) { return false; }
        return m.indexOf("1346458189") !== -1 || m.indexOf("PARM") !== -1;
    }

    // "2XL - Front Right (2XL Front Right_Item1)" - set by the per-item loop, so
    // every warning names the size and piece the operator has to go and check.
    function parmWhere() {
        var who = (parmContext.size ? parmContext.size : "?") + " - " +
                  (parmContext.part ? parmContext.part : "?");
        if (parmContext.instance) who += " (" + parmContext.instance + ")";
        return who;
    }

    // Used by every stage-level catch that must not swallow a PARM.
    //
    // For a PARM: log WHICH stage it happened in - that is the one detail the
    // rollback handler upstream cannot know - and then hand it up so the panel
    // gets rebuilt. For anything else: return quietly, so the caller's own
    // logging and recovery run exactly as they always have.
    function parmBail(e, stage) {
        if (!isParmError(e)) return;
        var at = "";
        try { if (e.line) at = " (jsx line " + e.line + ")"; } catch (eL) {}
        log("PARM during " + stage + at + " at " + parmWhere() + " - handing this panel to the rollback.");
        throw e;
    }

    function recordParmError(note) {
        // Log it the MOMENT it happens, not only in the end-of-job file: without
        // this a panel could fail mid-run and the debug log said nothing until the
        // very last lines, which is exactly when you are least likely to look.
        log("*** " + note);
        for (var i = 0; i < parmErrors.length; i++) {
            if (parmErrors[i] === note) return;   // one line per piece + step
        }
        if (parmErrors.length === PARM_MAX_ERRORS) {
            parmErrors.push("...more PARM errors occurred - see debug_log.txt for the full list.");
        }
        if (parmErrors.length >= PARM_MAX_ERRORS) return;
        parmErrors.push(note);
    }

    // NOTE: there is deliberately NO per-duplicate retry helper here any more.
    //
    // One existed (safeDuplicate) and it caused more damage than the bug it
    // chased. First it PROBED each copy - walking every descendant reading
    // typename/name/fillColor - and re-duplicated when the probe "looked wrong";
    // that probe cannot tell "this item type has no such property" from "this
    // item is broken", so job FAZ103 rejected every Front and Back design four
    // times over and those panels shipped with NO DESIGN AT ALL. Then, even
    // reduced to reacting to a real PARM, it was a SECOND recovery mechanism
    // sitting inside the panel rollback - two loops that multiply attempts and
    // disagree about who owns the failure.
    //
    // There is now exactly ONE recovery mechanism: a PARM anywhere in a panel's
    // build propagates to the rollback loop, which deletes the panel and builds
    // it again from nothing. The pattern duplicate is the first thing a panel
    // does, so a PARM there is already covered by that same loop - re-running it
    // there is identical to retrying it here, minus the second mechanism.

    // PANEL ROLLBACK. When a PARM lands somewhere in the 672-line instance body,
    // repeating that body is only safe if the panel is first taken back to the
    // state it had before the attempt started - the body runs duplicate(),
    // resize(), translate() and rotate(), all of which STACK if replayed on top
    // of their own result.
    //
    // The panel has a clean boundary that makes this possible: it begins life as
    // ONE duplicate() into the order document, so removing that one item removes
    // the whole piece and everything built into it. What is left to restore is
    // the bookkeeping the body advanced along the way.
    function shallowCopy(obj) {
        var out = {};
        for (var k in obj) { if (obj.hasOwnProperty(k)) out[k] = obj[k]; }
        return out;
    }

    function snapshotInstanceState() {
        var snap = {
            x: currentX, y: currentY, rowH: rowMaxHeight, abCount: artboardCount,
            master: masterProcessed,
            pmFB: pmLastFullButtonPanel, pmSL: pmLastSleevePanel,
            ribCuff: shallowCopy(ribCuffSleeveBySize), ssQ: shallowCopy(ssQueue),
            hoodie: shallowCopy(hoodieFrontBySize), hoodLast: shallowCopy(hoodieLastHoodBySize),
            smD: shallowCopy(sleeveMatchD),
            wSleeve: sleeveMatchWarnings.length, wBack: backLabelWarnings.length,
            wPlacket: placketMatchWarnings.length, wHoodie: hoodieWarnings.length,
            // Hoodie pieces queue their export from INSIDE the rebuilt block, so a
            // failed attempt can leave a queue entry pointing at an artboard the
            // rollback is about to delete. Anything queued during the attempt is
            // dropped with it.
            expLen: exportOrder.length,
            abLen: 0, topLen: 0
        };
        try { snap.abLen = orderDoc.artboards.length; } catch (eA) {}
        try { snap.topLen = orderDoc.pageItems.length; } catch (eT) {}
        return snap;
    }

    // Returns false when the artwork could NOT be removed. The caller must then
    // stop retrying: replaying the body on top of a copy that is still on the
    // canvas would ship a double-pasted panel, and nothing downstream would ever
    // flag that - strictly worse than the error being recovered from.
    function rollbackInstance(snap, piece, design) {
        var cleared = true;
        try { if (piece) piece.remove(); } catch (eP) { cleared = false; }
        try { if (design && design.parent) design.remove(); } catch (eD) {}
        // Anything the failed attempt left at the top of the document (a partial
        // duplicate, a temp group) sits ABOVE the baseline count. New items go in
        // at the beginning, so index 0 is the newest.
        try {
            var guard = 0;
            while (orderDoc.pageItems.length > snap.topLen && guard < 50) {
                orderDoc.pageItems[0].remove();
                guard++;
            }
            if (orderDoc.pageItems.length > snap.topLen) cleared = false;
        } catch (eO) { cleared = false; }
        try {
            while (orderDoc.artboards.length > snap.abLen) {
                orderDoc.artboards[orderDoc.artboards.length - 1].remove();
            }
        } catch (eAb) {}

        currentX = snap.x; currentY = snap.y; rowMaxHeight = snap.rowH; artboardCount = snap.abCount;
        masterProcessed = snap.master;
        pmLastFullButtonPanel = snap.pmFB; pmLastSleevePanel = snap.pmSL;
        ribCuffSleeveBySize = snap.ribCuff; ssQueue = snap.ssQ;
        hoodieFrontBySize = snap.hoodie; hoodieLastHoodBySize = snap.hoodLast;
        sleeveMatchD = snap.smD;
        // Drop exports the failed attempt queued: their artboard indices point at
        // artboards this rollback just removed.
        while (exportOrder.length > snap.expLen) {
            var dropped = exportOrder.pop();
            if (exportQueue.hasOwnProperty(dropped)) delete exportQueue[dropped];
        }
        // Drop warnings the failed attempt raised - it never happened.
        sleeveMatchWarnings.length = snap.wSleeve;
        backLabelWarnings.length = snap.wBack;
        placketMatchWarnings.length = snap.wPlacket;
        hoodieWarnings.length = snap.wHoodie;
        return cleared;
    }

    // The same delete-and-rebuild recovery the main per-item loop gets, for the
    // four hoodie pieces. They are built by their own functions OUTSIDE that
    // loop, so without this a PARM would leave a half-built Hood/Border/Pocket
    // with nothing but a hoodieWarnings line to show for it.
    //
    // The piece built inside `fn` is never handed back, so the rollback leans on
    // the orphan sweep instead: everything added to the order document above the
    // snapshot's baseline item count is removed.
    function buildHoodiePieceWithRollback(sizeLabel, pieceLabel, fn) {
        var attempts = 1 + PARM_RETRIES;
        var savedContext = parmContext;
        parmContext = { size: sizeLabel, part: pieceLabel, instance: sizeLabel + " " + pieceLabel };
        try {
            for (var a = 1; a <= attempts; a++) {
                var snap = snapshotInstanceState();
                try {
                    fn();
                    if (a > 1) log("PARM RECOVERED: " + sizeLabel + " " + pieceLabel + " rebuilt cleanly on attempt " + a + " of " + attempts + ".");
                    return;
                } catch (eHoodPiece) {
                    if (!isParmError(eHoodPiece)) throw eHoodPiece;
                    var at = "";
                    try { if (eHoodPiece.line) at = " (jsx line " + eHoodPiece.line + ")"; } catch (eL) {}
                    log("Error building " + sizeLabel + " " + pieceLabel + " -> " + eHoodPiece.message + at);
                    if (a < attempts && parmBudgetUsed < PARM_BUDGET && rollbackInstance(snap, null, null)) {
                        parmBudgetUsed++;
                        log("PARM ROLLBACK: " + sizeLabel + " " + pieceLabel + " removed from the order document - " +
                            "rebuilding from scratch (attempt " + a + " of " + attempts + "), in " + (PARM_SLEEP_MS / 1000) + "s...");
                        $.sleep(PARM_SLEEP_MS);
                        continue;
                    }
                    recordParmError("PANEL FAILED - " + sizeLabel + " " + pieceLabel + ": PARM error" + at +
                        ", rebuilt from scratch " + (a - 1) + " time(s) and still failed. " +
                        "This panel is incomplete - CHECK IT MANUALLY.");
                    return;
                }
            }
        } finally {
            parmContext = savedContext;
        }
    }

    // MOCK_ SWATCH ALIASES (guard only - see the isolation note at the top of main)
    // Nothing creates these names any more. They survive here for one case: a
    // mockup that already carries "MOCK_<name>" swatches, e.g. a file saved while
    // the old isolation pass was in effect. Such a name is an alias, not a color -
    // shipped as-is it would sit in the saved file as a second swatch holding the
    // same ink as the real one. spotKey compares names ACROSS the prefix (and
    // across formatting), so an alias and the real swatch resolve to one ink.
    // On a normal job every function below is a no-op costing one swatch scan.
    function spotKey(name) {
        return String(name).replace(/^MOCK_/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    // The CMYK behind a swatch, spot or process, as a plain "c/m/y/k" string.
    // Only used to tell a real duplicate from a name clash in the debug log.
    function inkLabel(swatch) {
        try {
            var c = swatch.color;
            if (c && c.typename === "SpotColor") c = c.spot.color;
            if (c && c.typename === "GrayColor") return "0/0/0/" + Math.round(c.gray);
            if (c && c.typename === "CMYKColor") {
                return Math.round(c.cyan) + "/" + Math.round(c.magenta) + "/" + Math.round(c.yellow) + "/" + Math.round(c.black);
            }
        } catch (eI) {}
        return "?";
    }

    // Callers must pass the ORDER document - this renames swatches, and renaming
    // one in the mockup would change a file the job is only allowed to read.
    function getOrCreateSpot(doc, name, cmykInk) {
        // Reuse an existing spot with this name (format-insensitive), else create it
        // with the EXACT CMYK ink from the source file (CMYK-direct flow).
        // A MOCK_ alias counts as "existing": renaming it down to the clean name
        // merges the pair for free, because a rename keeps every item that already
        // references the swatch linked to it. Adding a clean-named twin beside the
        // alias - what this used to do - is what left the duplicate behind.
        var clean = spotKey(name);
        var exact = null, alias = null;
        for (var i = 0; i < doc.spots.length; i++) {
            var sp = doc.spots[i];
            if (spotKey(sp.name) !== clean) continue;
            if (sp.name.indexOf("MOCK_") === 0) { if (!alias) alias = sp; }
            else if (!exact) exact = sp;
        }
        if (exact) return exact;
        if (alias) {
            // Safe rename: the loop above just proved no clean-named spot holds
            // this ink, so the new name cannot collide with another swatch.
            try {
                alias.name = name.replace(/^MOCK_/, "");
                return alias;
            } catch (eRn) { log("   - Could not rename alias '" + alias.name + "': " + eRn.message); }
        }
        var s = doc.spots.add();
        s.name = name.replace(/^MOCK_/, "");
        s.colorType = ColorModel.SPOT;
        var c = new CMYKColor();
        c.cyan = cmykInk.cyan; c.magenta = cmykInk.magenta;
        c.yellow = cmykInk.yellow; c.black = cmykInk.black;
        s.color = c;
        return s;
    }

    // Merges every surviving MOCK_ alias back into the single real swatch for its
    // ink, so the saved file lists each color exactly once.
    //   walkArt = false - the cheap pass, run right after a design has been
    //     relinked. Nothing points at the alias any more (deepReLink just
    //     re-pointed that whole design), so the alias is simply dropped - or
    //     renamed, when no clean-named swatch holds that ink yet.
    //   walkArt = true - the pass run once before the document is saved. Same
    //     merge, but every item still painted with an alias is re-pointed at the
    //     real swatch first, so a paste that re-introduced an alias after the last
    //     cheap pass cannot lose its spot identity when the alias goes away.
    // Removing a swatch never blanks artwork - Illustrator keeps the ink and drops
    // only the name - so the worst case of a missed item is a process color
    // instead of a named spot, never the no-fill of the vanishing-badge bug.
    function unifyMockSwatches(doc, walkArt) {
        try {
            var aliases = [], i, j;
            for (i = 0; i < doc.swatches.length; i++) {
                var nm = "";
                try { nm = doc.swatches[i].name; } catch (eNm) { continue; }
                if (nm.indexOf("MOCK_") !== 0) continue;
                aliases.push({ swatch: doc.swatches[i], name: nm, clean: nm.replace(/^MOCK_/, ""), twin: null });
            }
            if (!aliases.length) return 0;

            // Pair each alias with the real swatch for the same ink, if one exists.
            for (i = 0; i < aliases.length; i++) {
                var key = spotKey(aliases[i].name);
                for (j = 0; j < doc.swatches.length; j++) {
                    var on = "";
                    try { on = doc.swatches[j].name; } catch (eOn) { continue; }
                    if (on.indexOf("MOCK_") === 0 || on === "[None]" || on === "[Registration]") continue;
                    if (spotKey(on) === key) { aliases[i].twin = doc.swatches[j]; break; }
                }
            }

            if (walkArt) relinkAliasArt(doc, aliases);

            var dropped = 0, renamed = 0;
            for (i = aliases.length - 1; i >= 0; i--) {
                try {
                    // Twin present -> this alias is the duplicate, delete it.
                    // No twin -> the alias IS the only carrier of this ink, so a
                    // rename merges it without touching a single item.
                    if (aliases[i].twin) {
                        // Same clean name but a different ink is a name CLASH, not
                        // a duplicate. The order document's swatch wins - the same
                        // call processSubColor's officialSpots[cleanName] match has
                        // always made - but say so, because unlike a true duplicate
                        // this one changes how the piece prints.
                        var aInk = inkLabel(aliases[i].swatch), tInk = inkLabel(aliases[i].twin);
                        if (aInk !== tInk) {
                            log("SWATCHES: name clash - '" + aliases[i].name + "' (" + aInk + ") merged into '" +
                                aliases[i].twin.name + "' (" + tInk + "). The order document's ink wins.");
                        }
                        aliases[i].swatch.remove(); dropped++;
                    }
                    else { aliases[i].swatch.name = aliases[i].clean; renamed++; }
                } catch (eM) { log("SWATCHES: could not merge '" + aliases[i].name + "': " + eM.message); }
            }
            if (walkArt && (dropped || renamed)) {
                log("SWATCHES: merged " + (dropped + renamed) + " MOCK_ alias(es) before save - " + dropped + " duplicate(s) removed, " + renamed + " renamed.");
            }
            return dropped + renamed;
        } catch (eU) { log("SWATCHES: merge pass failed: " + eU.message); }
        return 0;
    }

    // Re-points every item still painted with a MOCK_ alias at the real swatch for
    // the same ink. Only the pre-save pass calls this, and only aliases that have a
    // real twin need it - the rest are about to be renamed, which keeps their items
    // linked automatically.
    function relinkAliasArt(doc, aliases) {
        try {
            var map = {}, wanted = false, i;
            for (i = 0; i < aliases.length; i++) {
                if (!aliases[i].twin) continue;
                var sp = null;
                try {
                    var col = aliases[i].twin.color;
                    if (col && col.typename === "SpotColor") sp = col.spot;
                } catch (eC) {}
                if (sp) { map[aliases[i].name] = sp; wanted = true; }
            }
            if (!wanted) return;

            var relinked = 0;

            function repoint(holder, prop) {
                var c = null;
                try {
                    // Unfilled/unstroked paths must stay unpainted: reading
                    // fillColor on one returns a phantom gray, and writing it back
                    // force-fills the shape (the "sirf outline" bug in applySpot).
                    if (prop === "fillColor" && holder.filled === false) return;
                    if (prop === "strokeColor" && holder.stroked === false) return;
                    c = holder[prop];
                } catch (eG) { return; }
                if (!c || c.typename !== "SpotColor") return;
                var target = null;
                try { target = map[c.spot.name]; } catch (eN) { return; }
                if (!target) return;
                try {
                    var sc = new SpotColor();
                    sc.spot = target;
                    try { sc.tint = c.tint; } catch (eT) {} // keep the drawn tint
                    holder[prop] = sc;
                    relinked++;
                } catch (eS) {}
            }

            function walkItems(container) {
                var items = null;
                try { items = container.pageItems; } catch (eP) { return; }
                if (!items) return;
                for (var k = 0; k < items.length; k++) {
                    var it = items[k], tn = "";
                    try { tn = it.typename; } catch (eTn) { continue; }
                    if (tn === "GroupItem") { walkItems(it); continue; }
                    if (tn === "TextFrame") {
                        try {
                            if (it.textRange.length === 0) continue;
                            var ca = it.textRange.characterAttributes;
                            repoint(ca, "fillColor");
                            repoint(ca, "strokeColor");
                        } catch (eTf) {}
                        continue;
                    }
                    repoint(it, "fillColor");
                    repoint(it, "strokeColor");
                    if (tn === "CompoundPathItem") {
                        try {
                            for (var p = 0; p < it.pathItems.length; p++) {
                                repoint(it.pathItems[p], "fillColor");
                                repoint(it.pathItems[p], "strokeColor");
                            }
                        } catch (eCp) {}
                        continue;
                    }
                    // PluginItem / mesh / live effect: the same generic recurse
                    // deepReLink does - these were the vanishing-badge items.
                    if (tn !== "PathItem") {
                        try { if (it.pageItems && it.pageItems.length) walkItems(it); } catch (eW) {}
                    }
                }
            }

            function walkLayer(layer) {
                walkItems(layer);
                try {
                    for (var s = 0; s < layer.layers.length; s++) walkLayer(layer.layers[s]);
                } catch (eSl) {}
            }

            for (i = 0; i < doc.layers.length; i++) walkLayer(doc.layers[i]);
            if (relinked) log("SWATCHES: re-pointed " + relinked + " item color(s) from a MOCK_ alias to the real swatch.");
        } catch (eR) { log("SWATCHES: alias relink failed: " + eR.message); }
    }

    function mergeAndCleanupSwatches(doc, targetContainer) {
        try {
            var officialSpots = {};
            for (var i = 0; i < doc.spots.length; i++) {
                var sn = doc.spots[i].name;
                officialSpots[sn.toLowerCase().replace(/[^a-z0-9]/g, "")] = doc.spots[i];
            }
            
            // CMYK-DIRECT FLOW: no RGB-based color map / smart-sense value matching.
            // Spot colors from the source (test print) are re-created in the order doc
            // with the SAME name + exact CMYK ink; plain CMYK fills are copied as-is.


            function deepReLink(container) {
                var items = (container.pageItems) ? container.pageItems : [container];
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    if (it.typename === "GroupItem") deepReLink(it);
                    else if (it.typename === "CompoundPathItem") {
                        // Compound paths can have fill/stroke themselves
                        applySpot(it, "fillColor");
                        applySpot(it, "strokeColor");
                        // Also check internal paths just in case
                        if (it.pathItems) {
                            for (var p = 0; p < it.pathItems.length; p++) {
                                applySpot(it.pathItems[p], "fillColor");
                                applySpot(it.pathItems[p], "strokeColor");
                            }
                        }
                    }
                    else if (it.typename === "PathItem") {
                        applySpot(it, "fillColor");
                        applySpot(it, "strokeColor");
                    }
                    else if (it.typename === "TextFrame") {
                        applySpot(it, "fillColor");
                        applySpot(it, "strokeColor");
                    }
                    else {
                        // Unknown / odd item type (PluginItem, live effect, compound shape,
                        // mesh, etc.). The OLD code skipped these silently, so any shape of
                        // this type kept its dangling MOCK_ spot and rendered as no-fill
                        // after the mockup closed (this is the vanishing green/skin badge bug).
                        // Try to recurse into it AND relink its own fill/stroke generically.
                        log("   - PATH RELINK: non-standard item type '" + it.typename + "' (name: " + (it.name || "?") + "). Attempting generic relink + recurse.");
                        try { if (it.pageItems && it.pageItems.length) deepReLink(it); } catch(eR) {}
                        try { applySpot(it, "fillColor"); } catch(eFc) {}
                        try { applySpot(it, "strokeColor"); } catch(eSc) {}
                    }
                }
            }

            // The colour logic here is UNCHANGED and is not the problem: in
            // M101_Round_Neck-2 this exact path ran 13 times on the same text and
            // the same spot without an error, and failed once - on the first item
            // processed after the order file split.
            //
            // Retrying THIS call was tried and does not work: job FAZ102 hit PARM
            // on `obj[prop]` and failed all four attempts, three seconds apart,
            // with the identical error each time. So a PARM is no longer absorbed
            // here - it is allowed to reach the per-instance handler, which throws
            // the whole panel away and rebuilds it from scratch.
            function applySpot(obj, prop) {
                try {
                    var colorObj = null;
                    var isText = (obj.typename === "TextFrame");

                    // UNFILLED/UNSTROKED paths must STAY unpainted. Reading
                    // fillColor on an unfilled path returns a phantom
                    // GrayColor(0); the code below would bake that to WHITE and
                    // force-fill the shape. On the back panels this painted the
                    // mockup's invisible construction paths white ON TOP of the
                    // red side panels ("sirf outline" bug).
                    if (!isText) {
                        try { if (prop === "fillColor" && obj.filled === false) return; } catch (eUF) {}
                        try { if (prop === "strokeColor" && obj.stroked === false) return; } catch (eUS) {}
                    }

                    if (isText) {
                        if (obj.textRange.length === 0) return;
                        log("DEBUG TEXT: Checking '" + obj.contents + "' for " + prop);
                        
                        // Level 1: Character Attributes
                        try { colorObj = obj.textRange.characterAttributes[prop]; } catch(e) {}
                        
                        // Level 2: First Character direct
                        if (!colorObj || colorObj.typename === "NoColor") {
                            try { colorObj = obj.textRange.characters[0].characterAttributes[prop]; if (colorObj && colorObj.typename !== "NoColor") log("   - Using Level 1 (First Character)"); } catch(e) {}
                        }
                        
                        // Level 3: Frame Level
                        if (!colorObj || colorObj.typename === "NoColor") {
                            try { colorObj = obj[prop]; if (colorObj && colorObj.typename !== "NoColor") log("   - Using Level 2 (Frame Level)"); } catch(e) {}
                        }
                        
                        // Level 4: Parent Group Level (Crucial for Group-applied colors)
                        if (!colorObj || colorObj.typename === "NoColor") {
                            var p = obj.parent;
                            while (p && p.typename !== "Layer" && p.typename !== "Document") {
                                try { 
                                    colorObj = p[prop]; 
                                    if (colorObj && colorObj.typename !== "NoColor") {
                                        log("   - Using Level 3 (Parent Group: " + (p.name || "Unnamed") + ")");
                                        break; 
                                    }
                                } catch(e) {}
                                p = p.parent;
                            }
                        }

                        // Level 5: Temporary Expand Check for Appearance-applied colors
                        if (!colorObj || colorObj.typename === "NoColor") {
                            var tempGroup = null;
                            try {
                                log("   - Attempting Level 5 (Temp Expand Appearance via Temp Group)...");
                                var prevSel = [];
                                for (var sIndex = 0; sIndex < doc.selection.length; sIndex++) {
                                    prevSel.push(doc.selection[sIndex]);
                                }
                                
                                // Create a temporary group to isolate the expansion
                                tempGroup = doc.groupItems.add();
                                var tempObj = obj.duplicate(tempGroup, ElementPlacement.PLACEATBEGINNING);
                                
                                doc.selection = null;
                                tempGroup.selected = true;
                                
                                try {
                                    app.executeMenuCommand("expandStyle");
                                } catch(eExp) {
                                    try { app.executeMenuCommand("Expand"); } catch(eExp2) {}
                                }
                                
                                var foundColor = null;
                                function extractColorFromItems(items) {
                                    for (var k = 0; k < items.length; k++) {
                                        var item = items[k];
                                        if (item.typename === "PathItem") {
                                            var c = item[prop];
                                            if (c && c.typename !== "NoColor") {
                                                foundColor = c;
                                                return;
                                            }
                                        } else if (item.typename === "TextFrame") {
                                            var c2 = item.textRange.characterAttributes[prop];
                                            if (c2 && c2.typename !== "NoColor") {
                                                foundColor = c2;
                                                return;
                                            }
                                        } else if (item.typename === "GroupItem") {
                                            extractColorFromItems(item.pageItems);
                                            if (foundColor) return;
                                        }
                                    }
                                }
                                
                                // Check the contents of the tempGroup (which now contains expanded items)
                                extractColorFromItems(tempGroup.pageItems);
                                
                                doc.selection = null;
                                for (var sIndex = 0; sIndex < prevSel.length; sIndex++) {
                                    try { prevSel[sIndex].selected = true; } catch(e) {}
                                }
                                
                                if (foundColor) colorObj = foundColor;
                            } catch(eTemp) {
                                log("   - Temp Expand failed: " + eTemp.message);
                            } finally {
                                // Final safety cleanup: remove the entire temporary group
                                try { if (tempGroup) tempGroup.remove(); } catch(e) {}
                            }
                        }
                        
                        if (colorObj) log("   - Effective Color Type: " + colorObj.typename);
                        else log("   - CRITICAL: Color not found at any level for text.");
                    } else {
                        colorObj = obj[prop];
                    }
                    
                    if (!colorObj || colorObj.typename === "NoColor") return;

                    function processSubColor(c) {
                        if (!c || c.typename === "NoColor") return null;

                        // Log decisions for spot-filled PATHS too (not just text) so the
                        // debug log reveals exactly what happens to shapes like the badge
                        // green/skin, which previously processed silently.
                        var dbg = isText || (c.typename === "SpotColor");

                        if (c.typename === "SpotColor") {
                            var rawName = c.spot.name;
                            var cleanName = rawName.replace(/^MOCK_/, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^mock/, "");
                            if (officialSpots[cleanName]) {
                                var sc = new SpotColor(); sc.spot = officialSpots[cleanName];
                                // TINT lives on the ITEM, not in the swatch: the same spot can
                                // be drawn at 100% on one shape and 50% on another. A fresh
                                // SpotColor starts at 100, so without this a half-strength
                                // shade came back at full strength - right swatch, wrong ink.
                                try { sc.tint = c.tint; } catch (eT) {}
                                return sc; // clean name match - the expected/common case, not logged
                            }

                            // Name match failed - everything below is a fallback path, worth
                            // logging since it means this spot ISN'T a straightforward match.
                            if (dbg) log("   - Spot Name: '" + rawName + "' (Clean: '" + cleanName + "') - no official name match, falling back to CMYK-direct.");

                            // CMYK-DIRECT FLOW: no Excel colors needed. Re-create the SAME
                            // spot (original name + exact CMYK ink) in the order doc so the
                            // design keeps its spot identity, exactly as in the test print.
                            var srcInk = c.spot.color;
                            try { if (srcInk && srcInk.typename === "SpotColor") srcInk = srcInk.spot.color; } catch(eNest) {}
                            var displayName = rawName.replace(/^MOCK_/, "");

                            if (srcInk && srcInk.typename === "GrayColor") {
                                var gInk = new CMYKColor();
                                gInk.cyan = 0; gInk.magenta = 0; gInk.yellow = 0; gInk.black = srcInk.gray;
                                srcInk = gInk;
                            }
                            if (srcInk && srcInk.typename === "CMYKColor") {
                                var newSpot = getOrCreateSpot(doc, displayName, srcInk);
                                officialSpots[cleanName] = newSpot;
                                var scNew = new SpotColor(); scNew.spot = newSpot;
                                try { scNew.tint = c.tint; } catch (eT2) {} // see the tint note above
                                if (dbg) log("   - CMYK-direct: recreated spot '" + displayName + "' in order doc with exact CMYK ink.");
                                return scNew;
                            }
                            if (dbg) log("   - WARNING: spot '" + rawName + "' ink is '" + (srcInk ? srcInk.typename : "null") + "' - expected CMYK in direct flow. Left as-is.");
                            return null;
                        }

                        if (c.typename === "CMYKColor") {
                            // Plain (non-spot) CMYK fill: copy the EXACT values into a fresh
                            // CMYKColor so the object detaches from the source doc.
                            if (dbg) log("   - CMYK-direct: copied exact plain CMYK ink.");
                            var ck = new CMYKColor();
                            ck.cyan = c.cyan; ck.magenta = c.magenta;
                            ck.yellow = c.yellow; ck.black = c.black;
                            return ck;
                        }

                        if (c.typename === "GrayColor") {
                            // Gray is a K-only subset of CMYK - not an RGB shift.
                            if (dbg) log("   - GrayColor mapped to K-only CMYK (" + c.gray + "%).");
                            var gk = new CMYKColor();
                            gk.cyan = 0; gk.magenta = 0; gk.yellow = 0; gk.black = c.gray;
                            return gk;
                        }

                        // RGB / Pattern / other ink: left untouched by design.
                        // The source file must supply CMYK in the direct flow.
                        if (dbg) log("   - Non-CMYK ink '" + c.typename + "' left as-is (no RGB->CMYK conversion in direct flow).");
                        return null;
                    }

                    var updated = processSubColor(colorObj);
                    if (updated) {
                        if (isText) {
                            try {
                                // Apply to character attributes directly.
                                // We avoid setting obj.filled = false or clearAppearance here
                                // because those commands often strip Warp/Arch effects from TextFrames.
                                var ca = obj.textRange.characterAttributes;
                                ca[prop] = updated;
                                if (prop === "strokeColor") ca.strokeWeight = 2.5;
                            } catch(e) {
                                try { obj[prop] = updated; } catch(e2) {}
                            }
                        } else {
                            obj[prop] = updated;
                            if (prop === "fillColor") { try { obj.filled = true; } catch(eFl) {} }
                            if (prop === "strokeColor") { obj.strokeWeight = obj.strokeWeight || 2; obj.stroked = true; }
                        }
                    } else if (colorObj.typename === "GradientColor") {
                        var stops = colorObj.gradient.gradientStops;
                        for (var s = 0; s < stops.length; s++) {
                            var stopUpdated = processSubColor(stops[s].color);
                            if (stopUpdated) stops[s].color = stopUpdated;
                        }
                    } else if (!isText && colorObj.typename === "SpotColor") {
                        // SAFETY NET: a non-text shape whose spot could NOT be resolved by
                        // processSubColor would otherwise keep its dangling MOCK_ spot and
                        // render as no-fill once the mockup closes (the vanishing badge bug).
                        // Force-bake the spot's own ink straight to plain CMYK.
                        try {
                            var fi = colorObj.spot.color;
                            var baked = null;
                            if (fi.typename === "CMYKColor") { baked = new CMYKColor(); baked.cyan = fi.cyan; baked.magenta = fi.magenta; baked.yellow = fi.yellow; baked.black = fi.black; }
                            else if (fi.typename === "GrayColor") { baked = new CMYKColor(); baked.cyan = 0; baked.magenta = 0; baked.yellow = 0; baked.black = Math.round(fi.gray); }
                            if (baked) {
                                obj[prop] = baked;
                                if (prop === "fillColor") { try { obj.filled = true; } catch(eFl2) {} }
                                log("   - FALLBACK: force-baked unresolved spot '" + colorObj.spot.name + "' to CMYK on path '" + (obj.name || "unnamed") + "'.");
                            } else {
                                log("   - WARNING: unresolved spot '" + colorObj.spot.name + "' ink type '" + fi.typename + "' on path '" + (obj.name || "unnamed") + "'.");
                            }
                        // PARM goes up to the panel rollback - see the note on the Merge Error catch.
                        } catch (eBake) {
                            parmBail(eBake, "baking a spot colour to CMYK");
                            log("   - Bake error on spot path: " + eBake.message);
                        }
                    } else if (isText) {
                        log("   - WARNING: No production match found for text color. It will remain in its original mockup color.");
                    }
                } catch(e) {
                    // PARM goes up to the per-instance handler, which rolls this
                    // panel back and rebuilds it. Every other error keeps the old
                    // swallow-and-log behaviour.
                    parmBail(e, "applying a colour");
                    log("ApplySpot Error: " + e.message);
                }
            }
                             
            deepReLink(targetContainer || doc);

            // deepReLink just moved this design off every MOCK_ alias it used, so
            // the aliases are dead weight in the swatch panel now. Dropping them
            // here - while the swatch list is still short and no artwork points at
            // them - is what keeps the pre-save pass a no-op instead of a full
            // document walk. Every paste site calls this function, so no design
            // ever gets past it holding an alias.
            unifyMockSwatches(doc, false);
        // A PARM must NOT be swallowed here. This catch exists so one bad swatch
        // cannot kill a panel, but a PARM means the document itself is in a bad
        // state, and the panel needs rebuilding rather than continuing on top of
        // it. In FAZ103-2 this was the FIRST of six PARMs on 2XL Front Right and
        // it was absorbed here, so the rollback only fired five stages later.
        } catch (eMerge) {
            parmBail(eMerge, "the swatch merge");
            log("Merge Error: " + eMerge.message);
        }
    }

    // `targetParent` is kept in the signature for the four existing call sites
    // but is no longer read: a label is never relocated out of its own piece
    // now, so there is no "somewhere else to put it" to name. See labelClipHost.
    function bringPatternLabelsToFront(container, targetParent, excludeItem) {
        try {
            if (!container || container.typename !== "GroupItem") return;
            var cArea = 0;
            try {
                var cB = container.visibleBounds;
                cArea = Math.abs((cB[2] - cB[0]) * (cB[1] - cB[3]));
            } catch(eB) {}
            var sizePatterns = ["small", "medium", "large", "xl", "2xl", "3xl", "extra", "size", "front", "back", "sleeve", "neck", "label"];
            // Where a label must land so it renders above the design AND stays
            // inside the panel's own silhouette: the nearest CLIPPING group above
            // the label itself, and inside that, its 'design_clip_group' (built
            // by the clip-setup block) when one exists.
            //
            // This used to be resolved ONCE per piece, scanning the piece group's
            // DIRECT children only - which silently assumed "one piece = one
            // clipping group". Front/Back/Sleeve/Neck are drawn that way, so they
            // still resolve to exactly the same group as before. Patti is not: the
            // pattern draws its two button strips as two separate clipping groups
            // inside a plain unclipped wrapper, so `clipGroup.move(baseShape,
            // PLACEBEFORE)` leaves 'design_clip_group' one level deeper than the
            // old lookup could reach. It found nothing, fell through to the
            // document-root branch, and the tag left its piece altogether -
            // measured on job 8fcab6ee, both Patti tags sat loose at the top of
            // Layer 1, unclipped (they still LOOK right in the JPG, which is why
            // this went unnoticed). The Neck reached the same dead end by another
            // route: when everything in its design is named 'remove' or
            // 'base-path' the design ends up empty, no clip group is ever built,
            // and there was nothing to find.
            function labelClipHost(item) {
                var p = null; try { p = item.parent; } catch (e0) { return null; }
                for (var g = 0; p && g < 12; g++) {
                    var tn = ""; try { tn = p.typename; } catch (eT) { return null; }
                    if (tn !== "GroupItem") return null; // hit the layer/document - no clip above
                    var isClipped = false; try { isClipped = !!p.clipped; } catch (eK) {}
                    if (isClipped) {
                        try {
                            for (var c = 0; c < p.groupItems.length; c++)
                                if (p.groupItems[c].name === "design_clip_group") return p.groupItems[c];
                        } catch (eD) {}
                        return p;
                    }
                    try { p = p.parent; } catch (eP) { return null; }
                }
                return null;
            }
            function processRecursive(parent) {
                if (!parent.pageItems || parent.pageItems.length === 0) return;
                for (var i = parent.pageItems.length - 1; i >= 0; i--) {
                    var it = parent.pageItems[i];
                    // Never move the panel base shape or the clipped design group:
                    // the base path is often NAMED like "Small Front", which would
                    // otherwise match the label patterns, jump to the document top
                    // and cover the whole design with the base color.
                    if (excludeItem && it === excludeItem) continue;
                    if ((it.name || "") === "design_clip_group") continue;
                    var iName = (it.name || "").toLowerCase();
                    var isLabel = (it.typename === "TextFrame");
                    if (!isLabel) { for (var n = 0; n < sizePatterns.length; n++) if (iName.indexOf(sizePatterns[n]) !== -1) { isLabel = true; break; } }
                    if (!isLabel && it.typename === "GroupItem") { try { if (it.textFrames && it.textFrames.length > 0) isLabel = true; } catch(e) {} }
                    // A real size label is tiny. Never treat panel-sized shapes or
                    // whole design groups as labels (>10% of the panel area).
                    if (isLabel && it.typename !== "TextFrame" && cArea > 0) {
                        try {
                            var b = it.visibleBounds;
                            if (Math.abs((b[2] - b[0]) * (b[1] - b[3])) > cArea * 0.10) isLabel = false;
                        } catch(eA) {}
                    }
                    if (isLabel) {
                        // The matched item (bare text, or a small group that
                        // merely WRAPS the text) often has a background box
                        // living as a SIBLING of one of its ANCESTORS, not as
                        // its own direct sibling - confirmed structure: text
                        // sits alone in its own group, and THAT group plus
                        // the box are the two children of the group one
                        // level further up. Moving only the matched item
                        // jumps the text to front alone and leaves the box
                        // behind at its original z-order (the "background
                        // missing" bug). Climb the ancestor chain as high as
                        // possible while every step stays tiny (<=10% of the
                        // panel) - this naturally lands on the smallest
                        // ancestor that still bundles the box in, without
                        // ever risking a whole design section.
                        var moveTarget = it;
                        try {
                            var candidate = it.parent;
                            while (candidate && candidate.typename === "GroupItem" && candidate !== container) {
                                var cb = candidate.visibleBounds;
                                var cbArea = Math.abs((cb[2] - cb[0]) * (cb[1] - cb[3]));
                                if (cArea > 0 && cbArea > cArea * 0.10) break;
                                moveTarget = candidate;
                                candidate = candidate.parent;
                            }
                        } catch (eP) {}
                        try {
                            var host = labelClipHost(moveTarget);
                            var hostOk = false;
                            try { hostOk = !!(host && host.pageItems && host.pageItems.length > 0); } catch (eH) {}
                            if (hostOk) {
                                // Right after the clip mask (which must stay
                                // the group's frontmost item) so the label
                                // renders above the design and stays clipped
                                // to the panel silhouette with it.
                                moveTarget.move(host.pageItems[0], ElementPlacement.PLACEAFTER);
                            } else {
                                // No clipping group anywhere above it. Medium Patti
                                // is drawn exactly like this - both size tags sit
                                // outside either strip, as plain children of the
                                // piece. Leave the label where the pattern put it
                                // and only raise it above its own siblings; moving
                                // it to the document root instead used to orphan it
                                // out of the piece for no gain at all.
                                moveTarget.zOrder(ZOrderMethod.BRINGTOFRONT);
                            }
                        } catch(e) {}
                    }
                    else if (it.typename === "GroupItem") { if (it.name !== "design_clip_group") processRecursive(it); }
                }
            }
            processRecursive(container);
        } catch (e) {}
    }

    // Rewrites the pattern's small size-tag text (e.g. "Medium") so per-side
    // sleeve prints read like "Medium Short Sleeve Right". Only exact matches
    // of a size word are touched - design text is never renamed. Matches ANY
    // standard size word, not just THIS job's own sizeLabel: some pattern
    // pieces carry a stale/mismatched sample size baked into their tag (e.g.
    // an "XL Short Sleeve" piece whose tag still literally reads "Medium"
    // from whenever it was drawn) - requiring an exact sizeLabel match left
    // that stale text untouched, so it stayed visible UNDER the newer
    // per-part "X-LARGE" tag box (processLocalTagLabel), overlapping into
    // garbled text on the sleeve JPGs.
    // Spelled-out variants included alongside the short codes: some pattern
    // tags read "X-LARGE" instead of "XL" (job 9984b9e3 - the XL Short
    // Sleeve tag went un-renamed because "x-large" matched neither the
    // sizeLabel nor this list). Compared after stripping spaces/hyphens, so
    // "X-Large", "X-LARGE" and "xlarge" all normalize the same way.
    // RENAME_SIZE_WORDS lives at the very top of runAutomation (search for it
    // there) - it is read by the per-item loop, which runs before any `var`
    // written down here has been assigned. Do not move it back.
    function normalizeSizeWord(s) {
        return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    // The alias group that the size being processed belongs to, or null.
    function sizeAliasesFor(want) {
        if (!want || typeof SIZE_ALIAS_GROUPS === "undefined" || !SIZE_ALIAS_GROUPS) return null;
        for (var g = 0; g < SIZE_ALIAS_GROUPS.length; g++) {
            for (var i = 0; i < SIZE_ALIAS_GROUPS[g].length; i++) {
                if (SIZE_ALIAS_GROUPS[g][i] === want) return SIZE_ALIAS_GROUPS[g];
            }
        }
        return null;
    }
    function renameSizeTags(container, sizeLabel, newText) {
        var count = 0;
        var want = normalizeSizeWord(sizeLabel);
        // The renamed text ("XL" -> "XL Short Sleeve Right") is much longer
        // than the original tag word, so the tag's background/border box
        // (a plain rectangle drawn to fit the short original word) needs to
        // grow with it - otherwise the extra words render outside the box
        // and get visually lost against the garment (job feb7381e: "Small
        // Short Sleeve Right" showed as just "Short Sleeve" on the sleeve).
        function findBoxSibling(scope, exclude) {
            if (!scope || !scope.pageItems) return null;
            for (var s = 0; s < scope.pageItems.length; s++) {
                var sit = scope.pageItems[s];
                if (sit === exclude) continue;
                // NEVER the clipping mask. On a Hood piece the tag's only path
                // sibling IS the piece's clip path (the whole outline), so
                // treating it as the tag's little background box would let
                // resizeTagBox stretch the mask and reshape the panel itself.
                try { if (sit.clipping) continue; } catch (eC1) {}
                if (sit.typename === "PathItem" || sit.typename === "CompoundPathItem") return sit;
            }
            return null;
        }
        function resizeTagBox(box, textFrame) {
            try {
                var tb = textFrame.visibleBounds; // reflects the NEW (renamed) text width
                var textW = Math.abs(tb[2] - tb[0]);
                var bb = box.geometricBounds;
                var boxW = Math.abs(bb[2] - bb[0]);
                var padding = 12; // pt of breathing room each side
                var targetW = textW + padding * 2;
                if (boxW > 0.01 && targetW > boxW) {
                    var pct = (targetW / boxW) * 100;
                    box.resize(pct, 100, true, true, true, true, 100, Transformation.CENTER);
                    log("   - Size-tag background grown to fit renamed text (" + Math.round(pct) + "%).");
                }
            } catch (eBox) { log("   - WARNING: could not resize size-tag background: " + eBox.message); }
        }
        // The pattern's tag is LEFT-justified POINT text, so a renamed tag
        // ("XL" -> "XL Outside Hood") always grows to the RIGHT from a pinned
        // left edge. Each Hood piece sits inside a group clipped to its own
        // outline, and the LEFT piece carries its tag against the piece's
        // RIGHT edge - so the extra words grew straight past the mask and were
        // cut away, leaving just "XL" on the export while the Right piece (tag
        // near its left edge, ~874pt of room) showed the full text. Measured on
        // this job's pattern: left piece overflowed its clip by 114pt.
        // Slide the tag back inside instead of letting the mask eat it.
        function enclosingClipBounds(item) {
            try {
                var p = item.parent;
                for (var guard = 0; p && guard < 12; guard++) {
                    var tn = ""; try { tn = p.typename; } catch (eT) { return null; }
                    if (tn !== "GroupItem") return null; // hit the layer/document - no clip above
                    var isClipped = false; try { isClipped = !!p.clipped; } catch (eK) {}
                    if (isClipped) {
                        for (var i = 0; i < p.pageItems.length; i++) {
                            try { if (p.pageItems[i].clipping) return p.pageItems[i].geometricBounds; } catch (eI) {}
                        }
                        return p.visibleBounds;
                    }
                    p = p.parent;
                }
            } catch (eP) {}
            return null;
        }
        function keepInsideClip(textFrame, box) {
            try {
                var clipB = enclosingClipBounds(textFrame);
                if (!clipB) return; // no clip above it (e.g. Sleeve tags) - nothing can cut it
                var margin = 6;
                var tb = textFrame.visibleBounds;
                var bb = null; if (box) { try { bb = box.visibleBounds; } catch (eB) {} }
                var l = bb ? Math.min(tb[0], bb[0]) : tb[0];
                var r = bb ? Math.max(tb[2], bb[2]) : tb[2];
                // Only move a tag that ACTUALLY spills. Testing against
                // "edge - margin" instead nudged tags that were merely sitting
                // close to an edge but were never being clipped (the Right hood
                // pieces drifted 1-4pt for no reason). The margin is applied to
                // the correction, not to the test.
                var dx = 0;
                if (r > clipB[2]) dx = (clipB[2] - margin) - r;       // spills right -> pull left
                else if (l < clipB[0]) dx = (clipB[0] + margin) - l;  // spills left  -> push right
                if (dx === 0) return;
                // never trade one spill for the opposite one (tag wider than the piece)
                if (dx < 0 && l + dx < clipB[0]) dx = clipB[0] - l;
                if (dx > 0 && r + dx > clipB[2]) dx = clipB[2] - r;
                if (dx === 0) return;
                textFrame.translate(dx, 0);
                if (box) { try { box.translate(dx, 0); } catch (eM) {} }
                log("   - Renamed size tag shifted " + Math.round(dx) + "pt to stay inside the piece outline (it would have been clipped).");
            } catch (eK2) { log("   - WARNING: could not keep the renamed size tag inside the clip: " + eK2.message); }
        }
        function recurse(parent, grandparent) {
            if (!parent.pageItems) return;
            for (var i = 0; i < parent.pageItems.length; i++) {
                var it = parent.pageItems[i];
                if (it.typename === "TextFrame") {
                    var c = "";
                    try { c = normalizeSizeWord(it.contents); } catch (eC) {}
                    var isSizeWord = (c === want);
                    // 1) this size's own aliases first (lets a one-letter "s"
                    //    tag rename on a "Small" order without ever letting a
                    //    stray "L" rename while some other size is processed)
                    if (!isSizeWord) {
                        var aliases = sizeAliasesFor(want);
                        if (aliases) { for (var a = 0; a < aliases.length; a++) if (c === aliases[a]) { isSizeWord = true; break; } }
                    }
                    // 2) then any size word at all - the pattern's wording need
                    //    not match the order's label ("X-Large" vs "XL")
                    if (!isSizeWord) { for (var w = 0; w < RENAME_SIZE_WORDS.length; w++) if (c === RENAME_SIZE_WORDS[w]) { isSizeWord = true; break; } }
                    if (isSizeWord) {
                        // A matched tag can still fail to write if it (or its
                        // parent group) is LOCKED in the Master Pattern file -
                        // Illustrator throws on `.contents =` for a locked
                        // TextFrame. That failure used to be swallowed here
                        // silently, so the caller's "no tag text found"
                        // warning was misleading (a match WAS found - the
                        // write just failed) and the original stale/wrong
                        // word stayed visible with no clue why. Unlock the
                        // frame and its immediate parent (the usual place a
                        // whole tag group gets locked) before writing, and
                        // log the real error if it still fails.
                        var wasLockedSelf = false, wasLockedParent = false;
                        try {
                            try { if (it.locked) { wasLockedSelf = true; it.locked = false; } } catch (eU1) {}
                            try { if (parent.locked) { wasLockedParent = true; parent.locked = false; } } catch (eU2) {}
                            it.contents = newText; count++;
                            var box = findBoxSibling(parent, it) || findBoxSibling(grandparent, parent);
                            if (box) resizeTagBox(box, it);
                            keepInsideClip(it, box);
                        } catch (eS) {
                            log("   - WARNING: matched size-tag text '" + it.contents + "' but could not rename it: " + eS.message +
                                (wasLockedSelf || wasLockedParent ? " (was locked)" : ""));
                        } finally {
                            try { if (wasLockedSelf) it.locked = true; } catch (eL1) {}
                            try { if (wasLockedParent) parent.locked = true; } catch (eL2) {}
                        }
                    }
                } else if (it.typename === "GroupItem") recurse(it, parent);
            }
        }
        try { recurse(container, null); } catch (eR) {}
        return count;
    }

    // A logo/graphic in the mockup can be a LINKED (not embedded) raster
    // PlacedItem - it renders fine while the mockup file is open on its own,
    // because Illustrator resolves the link relative to wherever that file
    // sits. Once duplicated into the order document (which gets saved to a
    // different folder, uploads/{job}/renders/), that same relative link no
    // longer resolves, and Illustrator silently swaps in its generic grey
    // "missing linked image" placeholder - no error, no warning, just a
    // blank textured box in the exported JPG where the logo should be.
    // Embedding right after every design paste makes the artwork fully
    // self-contained, independent of file paths, permanently.
    function embedPlacedItems(container) {
        var count = 0;
        function recurse(parent) {
            if (!parent.pageItems) return;
            for (var i = 0; i < parent.pageItems.length; i++) {
                var it = parent.pageItems[i];
                if (it.typename === "PlacedItem") {
                    try { it.embed(); count++; } catch (eEmb) { log("   - WARNING: could not embed linked image '" + (it.name || "unnamed") + "': " + eEmb.message); }
                } else if (it.typename === "GroupItem") recurse(it);
            }
        }
        try { recurse(container); } catch (eR) {}
        if (count > 0) log("   - Embedded " + count + " linked image(s) so they survive being saved into the order doc.");
        return count;
    }

    // A logo/badge raster in the mockup can be an EMBEDDED image whose
    // internal color space is "Indexed" (a limited color-lookup-table
    // format, typical of GIFs/simple web graphics) rather than RGB/CMYK.
    // Confirmed on a real job (COM inspection): such a raster is not
    // "missing" or broken in any way Illustrator reports - it is already
    // embedded, fully present - but it exports as a faded/grey textured
    // box instead of its real colors, because the CMYK order document has
    // no reliable way to resolve its indexed palette at export time.
    // Re-rasterizing it into the document's own color model (CMYK here)
    // bakes it down to real pixel colors, permanently fixing the export.
    function fixIndexedRasters(container) {
        var count = 0;
        function recurse(parent) {
            if (!parent.pageItems) return;
            for (var i = 0; i < parent.pageItems.length; i++) {
                var it = parent.pageItems[i];
                if (it.typename === "RasterItem") {
                    var isIndexed = false;
                    try { isIndexed = (String(it.imageColorSpace).toLowerCase().indexOf("index") !== -1); } catch (eC) {}
                    if (isIndexed) {
                        try {
                            var opts = new RasterizeOptions();
                            opts.colorModel = RasterizationColorModel.DEFAULTCOLORMODEL;
                            opts.transparency = true;
                            opts.resolution = 300;
                            var b = it.geometricBounds;
                            var newRaster = orderDoc.rasterize(it, b, opts);
                            newRaster.move(it, ElementPlacement.PLACEBEFORE);
                            it.remove();
                            count++;
                        } catch (eRast) { log("   - WARNING: could not fix Indexed-color raster '" + (it.name || "unnamed") + "': " + eRast.message); }
                    }
                } else if (it.typename === "GroupItem") recurse(it);
            }
        }
        try { recurse(container); } catch (eR) {}
        if (count > 0) log("   - Re-rasterized " + count + " Indexed-color image(s) into the document's color mode (was exporting as a faded placeholder box).");
        return count;
    }

    // Deletes every item whose name is "remove" (or starts with "remove",
    // e.g. "Remove", "remove_tags", "REMOVE SIZE") anywhere inside the pasted
    // design. Used to strip the test-print's small size tags so the pattern
    // file's own size tags are what appears in the final order.
    // Removes the design's own 'base-path' - the mockup's garment silhouette,
    // whose fill getDesignBaseFill has already copied onto the panel.
    //
    // Same code that has always run for Front/Back/Sleeve/Neck/Patti etc.; it
    // simply used to be declared INSIDE the main per-item loop, which is why
    // Hood and Border - reaching their design through hoodiePasteDesign - could
    // never call it and kept their base-paths. Lifted out here unchanged so both
    // callers run one implementation instead of two that can drift.
    //
    // The name test stays an EXACT match on the three spellings. removeNamedItems
    // below matches on prefix, which would also take a legitimately-named
    // "base-path guide" with it.
    //
    // `label` is only used in the log lines (the loop passed item.part_name, the
    // hoodie builders pass their warn prefix), and the count comes back as the
    // return value instead of a closed-over variable.
    function removeBasePaths(container, label) {
        var removedCount = 0;
        function walk(c) {
            for (var r = c.pageItems.length - 1; r >= 0; r--) {
                var it = c.pageItems[r];
                var itName = (it.name || "").toLowerCase();
                if (itName === "base-path" || itName === "base_path" || itName === "basepath") {
                    try {
                        log("   - Success: Removing '" + it.name + "' from " + label);
                        it.remove();
                        removedCount++;
                    // PARM goes up to the panel rollback - see the note on the Merge Error catch.
                    } catch (e) {
                        parmBail(e, "removing a base-path");
                        log("   - Removal Error: " + e.message);
                    }
                } else if (it.typename === "GroupItem") {
                    walk(it);
                }
            }
        }
        // it.remove() has its own guard, but `c.pageItems` and `it.name` do not -
        // and that is where M101_Round_Neck-2 lost 2XL Front Right (no "Removal
        // Error" line was logged, so the throw came from the walk, not the
        // removal). A PARM here is left to propagate to the per-instance handler,
        // which rebuilds the whole panel; repeating just this walk was tried and
        // does not clear the error.
        walk(container);
        return removedCount;
    }

    function removeNamedItems(container, targetName) {
        var removedCount = 0;
        var clean = targetName.toLowerCase();
        function recurse(parent) {
            if (!parent.pageItems) return;
            for (var i = parent.pageItems.length - 1; i >= 0; i--) {
                var it = parent.pageItems[i];
                var n = "";
                try { n = (it.name || "").toLowerCase().replace(/^\s+|\s+$/g, ""); } catch (eN) {}
                if (n === clean || n.indexOf(clean) === 0) {
                    try {
                        log("   - Removing '" + it.name + "' (" + it.typename + ") from design.");
                        it.remove();
                        removedCount++;
                    // PARM goes up to the panel rollback - see the note on the Merge Error catch.
                    } catch (eRem) {
                        parmBail(eRem, "removing a named item");
                        log("   - Remove error on '" + n + "': " + eRem.message);
                    }
                } else if (it.typename === "GroupItem") {
                    recurse(it);
                }
            }
        }
        // PARM goes up to the panel rollback - see the note on the Merge Error catch.
        try { recurse(container); } catch (eRec) {
            parmBail(eRec, "removing named items");
            log("removeNamedItems error: " + eRec.message);
        }
        if (removedCount === 0) log("   - Note: no '" + targetName + "'-named item found in this design.");
        else log("   - Total '" + targetName + "' items removed: " + removedCount);
        return removedCount;
    }

    function releaseInternalClippingMasks(group, insideLocalTag) {
        try {
            if (!group || group.typename !== "GroupItem") return;
            var groupIsTag = insideLocalTag || (normalizeItemName(group.name) === "localtag");
            for (var i = group.pageItems.length - 1; i >= 0; i--) {
                var it = group.pageItems[i];
                if (it.typename === "GroupItem") {
                    var inTag = groupIsTag || (normalizeItemName(it.name) === "localtag");
                    if (it.clipped) {
                        // Releasing a clip makes Illustrator STRIP fill/stroke from the
                        // clipping path. If that path is a visible shape (e.g. the badge's
                        // skin scallop / green circle), it would vanish ("shape but no fill").
                        // So capture the clip path's paint BEFORE release and restore it after.
                        var clipPath = null, savedFilled = false, savedFill = null, savedStroked = false, savedStroke = null, savedSW = null;
                        try {
                            for (var ci = 0; ci < it.pageItems.length; ci++) {
                                var cand = it.pageItems[ci];
                                if ((cand.typename === "PathItem" || cand.typename === "CompoundPathItem") && cand.clipping) {
                                    clipPath = cand;
                                    try { savedFilled = cand.filled; if (cand.filled) savedFill = cand.fillColor; } catch(eF) {}
                                    try { savedStroked = cand.stroked; if (cand.stroked) { savedStroke = cand.strokeColor; savedSW = cand.strokeWidth; } } catch(eS) {}
                                    break;
                                }
                            }
                        } catch(eCap) {}

                        it.clipped = false;

                        // LOCAL-TAG label: remember which path was the label's own
                        // mask so processLocalTagLabel can rebuild the clip after
                        // scaling (the release would otherwise lose it forever).
                        if (inTag && clipPath && normalizeItemName(clipPath.name) !== "tagmask") {
                            try { clipPath.name = "TAG-MASK"; log("   - CLIP RELEASE: LOCAL-TAG mask tagged 'TAG-MASK' for re-clip."); } catch(eNm) {}
                        }

                        try {
                            if (clipPath) {
                                if (savedFilled && savedFill) { clipPath.filled = true; clipPath.fillColor = savedFill; }
                                if (savedStroked && savedStroke) { clipPath.stroked = true; clipPath.strokeColor = savedStroke; if (savedSW) clipPath.strokeWidth = savedSW; }
                                if (savedFilled && savedFill) {
                                    // The clip path sits at the TOP of the group (masks always do).
                                    // Now that it is a visible filled shape, it would cover the
                                    // previously-clipped content (green circle + letters). It is the
                                    // badge BACKGROUND, so push it behind its siblings.
                                    try { clipPath.zOrder(ZOrderMethod.SENDTOBACK); } catch(eZ) {}
                                    log("   - CLIP RELEASE: restored fill + sent clip path '" + (clipPath.name || "unnamed") + "' to back (" + savedFill.typename + ").");
                                }
                            }
                        } catch(eRes) {}
                    }
                    releaseInternalClippingMasks(it, inTag);
                }
            }
        } catch (e) {}
    }

    function normalizeItemName(n) {
        var s = "";
        try { s = (n || "").toLowerCase().replace(/[^a-z0-9]/g, ""); } catch (e) {}
        return s;
    }

    // NECK TEXT RENDER FIX: recreates every live text frame in the pattern
    // panel (new frame, same contents/font/size/scale/fill/position/z-order,
    // old frame deleted). Frames duplicated from the pattern document can
    // carry a corrupt appearance that never renders on export - verified by
    // test: the cursed frame AND its duplicates stay invisible while a fresh
    // frame with identical attributes renders. The mockup design inside
    // design_clip_group is skipped - its text is handled by replacement flow.
    function rebuildTextFrames(container) {
        var list = [];
        function collect(c) {
            if ((c.name || "") === "design_clip_group") return;
            if (c.textFrames) for (var i = 0; i < c.textFrames.length; i++) list.push(c.textFrames[i]);
            if (c.groupItems) for (var g = 0; g < c.groupItems.length; g++) collect(c.groupItems[g]);
        }
        collect(container);
        var rebuilt = 0;
        for (var f = 0; f < list.length; f++) {
            var tf = list[f];
            try {
                try { if (tf.hidden) continue; } catch (eH) {}
                var contents = tf.contents;
                if (!contents) continue;
                var pos = tf.position;
                var ca = tf.textRange.characters[0].characterAttributes;
                var font = null, fSize = null, fill = null, hS = null, vS = null, trk = null, ld = null, aL = null, just = null;
                try { font = ca.textFont; } catch (e) {}
                try { fSize = ca.size; } catch (e) {}
                try { fill = ca.fillColor; } catch (e) {}
                try { hS = ca.horizontalScale; } catch (e) {}
                try { vS = ca.verticalScale; } catch (e) {}
                try { trk = ca.tracking; } catch (e) {}
                try { aL = ca.autoLeading; if (!aL) ld = ca.leading; } catch (e) {}
                try { just = tf.textRange.paragraphAttributes.justification; } catch (e) {}

                // Hand-kerning does not survive into the fresh frame either (the
                // new frame's contents assignment drops it, same as in the text
                // replacement flow). Read it per gap off the old frame - it lives
                // on the character AFTER the gap and throws where untouched.
                var kerns = [];
                try {
                    for (var kk = 1; kk < tf.textRange.characters.length; kk++) {
                        var kvv = null;
                        try { kvv = tf.textRange.characters[kk].kerning; } catch (eKk) { kvv = null; }
                        kerns.push((typeof kvv === "number") ? kvv : null);
                    }
                } catch (eKall) {}

                var nf;
                try { nf = tf.parent.textFrames.add(); }
                catch (eP) { nf = tf.layer.textFrames.add(); }
                nf.contents = contents;
                var na = nf.textRange.characterAttributes;
                if (font) na.textFont = font;
                if (fSize) na.size = fSize;
                if (hS !== null) na.horizontalScale = hS;
                if (vS !== null) na.verticalScale = vS;
                if (trk !== null) na.tracking = trk;
                if (aL !== null) { na.autoLeading = aL; if (!aL && ld) na.leading = ld; }
                if (fill && fill.typename !== "NoColor") na.fillColor = fill;
                if (just !== null) { try { nf.textRange.paragraphAttributes.justification = just; } catch (eJ) {} }
                for (var kr = 0; kr < kerns.length; kr++) {
                    if (kerns[kr] === null) continue;
                    try { nf.textRange.characters[kr + 1].kerning = kerns[kr]; } catch (eKw) {}
                }
                try { nf.move(tf, ElementPlacement.PLACEBEFORE); } catch (eM) {}
                nf.position = pos;
                tf.remove();
                rebuilt++;
            // PARM goes up to the panel rollback - see the note on the Merge Error catch.
            } catch (eRb) {
                parmBail(eRb, "rebuilding a text frame");
                log("   - text rebuild error: " + eRb.message);
            }
        }
        if (rebuilt > 0) log("Rebuilt " + rebuilt + " pattern text frame(s) to force re-render.");
    }

    // Depth-first search inside a pasted design for an item whose normalized
    // name matches (e.g. "LOCAL-TAG", "local_tag", "Local Tag" all -> "localtag").
    function findByNormalizedName(container, cleanName, typeName) {
        if (!container || !container.pageItems) return null;
        for (var i = 0; i < container.pageItems.length; i++) {
            var it = container.pageItems[i];
            if ((!typeName || it.typename === typeName) && normalizeItemName(it.name) === cleanName) return it;
            if (it.typename === "GroupItem") {
                var hit = findByNormalizedName(it, cleanName, typeName);
                if (hit) return hit;
            }
        }
        return null;
    }

    // Size-tag letter: XS/S/M/L single-letter style (the neck care label keeps
    // its own SM/MD style - these two are independent). Youth sizes (YXS/YS/
    // YM/YL/YXL) use the same short code as their tag letter - no word-to-
    // abbreviation conversion needed like adult "Large"->"L".
    function sizeToAbbrev(sizeLabel) {
        var m = {
            "xs": "XS", "small": "S", "medium": "M", "large": "L", "xl": "XL", "2xl": "2XL", "3xl": "3XL", "4xl": "4XL",
            "yxs": "YXS", "ys": "YS", "ym": "YM", "yl": "YL", "yxl": "YXL"
        };
        var key = (sizeLabel || "").toLowerCase().replace(/^\s+|\s+$/g, "");
        if (m[key]) return m[key];
        if (key.indexOf("xl") !== -1) return key.toUpperCase(); // 5XL and beyond (and YXL) pass through
        return null;
    }

    // SIZE-GROUP LABEL: a large standalone marker text (e.g. "M") dropped once
    // at the top-left of a size's first row in the Order file, so a human
    // scanning the tiled sheet can tell which size a whole row-group belongs
    // to without checking every panel's own small LOCAL-TAG. Independent of
    // processLocalTagLabel (the tiny per-panel tag baked into each design).
    // Written directly from the Excel-known size (sizeToAbbrev) rather than
    // hunting for a matching object in the pattern file - patterns have no
    // established naming convention for a "big size label" to copy from.
    function placeSizeGroupLabel(sizeLabelText) {
        try {
            var labelText = sizeToAbbrev(sizeLabelText) || sizeLabelText;
            var tf = orderDoc.layers[0].textFrames.add();
            tf.contents = labelText;
            var ca = tf.textRange.characterAttributes;
            ca.size = 200;
            try { ca.textFont = app.textFonts.getByName("ArialMT"); } catch (eFont) {}
            var blk = new CMYKColor(); blk.cyan = 0; blk.magenta = 0; blk.yellow = 0; blk.black = 100;
            ca.fillColor = blk;
            tf.left = currentX; tf.top = currentY;
            var lb = tf.visibleBounds;
            var labelHeight = Math.abs(lb[1] - lb[3]);
            currentY -= (labelHeight + refContext.spacing); // 5mm gap before this size's pieces start
            log("Size-group label '" + labelText + "' placed for size '" + sizeLabelText + "'.");
        } catch (eLbl) {
            log("WARNING: could not place size-group label for '" + sizeLabelText + "': " + eLbl.message);
        }
    }

    // =====================================================================
    // ORDER FILE OVERFLOW -> NEXT .ai FILE
    // (see the ORDER_TOP_Y / ORDER_FLOOR_Y block at the top of main for the
    // why; everything below is the machinery)
    // =====================================================================

    // SPLIT-PER-SIZE names the file after the size it holds
    // (production_ready_order_Large.ai) instead of a running number, so an
    // operator can tell the files apart without opening them. The label is the
    // SAME string the export folders use (Large/, 2XL/, ...), so a file and its
    // renders always carry the same name.
    //
    // A size that still overflows one canvas gets _Large_2.ai, _Large_3.ai -
    // the per-piece overflow check has not gone away, it just rarely fires now.
    // Falls back to the numeric scheme whenever the split is off or no size owns
    // the file yet, so a normal job's file names are untouched.
    function orderFileName(idx) {
        if (SPLIT_PER_SIZE && orderDocLabel) {
            var seen = orderLabelSeen[orderDocLabel] || 1;
            var safeLabel = String(orderDocLabel).replace(/[^a-zA-Z0-9]+/g, "_");
            return "production_ready_order_" + safeLabel + ((seen > 1) ? ("_" + seen) : "") + ".ai";
        }
        return (idx <= 1) ? "production_ready_order.ai" : ("production_ready_order_" + idx + ".ai");
    }

    function clearOrderDocSwatches(doc) {
        for (var sIdx = doc.swatches.length - 1; sIdx >= 0; sIdx--) {
            var sw = doc.swatches[sIdx];
            if (sw.name !== "[None]" && sw.name !== "[Registration]") {
                try { sw.remove(); } catch (e) {}
            }
        }
        log("Swatch panel cleared of default colors.");
    }

    // Saves whatever orderDoc currently holds under this file's own name.
    // Never throws - a failed save is logged exactly like the old single-file
    // save block did, so one bad file cannot lose the rest of the job.
    function saveOrderDoc() {
        var name = orderFileName(orderDocIndex);
        // Last line of defence for the swatch panel: whatever paste happened after
        // the last relink pass could have re-introduced a MOCK_ alias, and an alias
        // must never reach the file - it would sit there as a second swatch with
        // the same ink as the real one. Normally a no-op that costs one scan of
        // doc.swatches; only a genuine leftover pays for the artwork walk.
        unifyMockSwatches(orderDoc, true);
        // Drop the document's own default artboard. Every piece now creates its
        // own artboard (see the placement block), so artboard 0 is the untouched
        // 612x792 Letter default Illustrator hands out with a new document - it
        // has no artwork on it and would ship as a blank first page. Removed only
        // once real artboards exist, and only here, i.e. after every export has
        // already been taken by index.
        try {
            if (orderDoc.artboards.length > 1 && orderDoc.artboards[0].name === "Artboard 1") {
                orderDoc.artboards[0].remove();
                log("Removed the document's unused default artboard from " + name + ".");
            }
        } catch (eAb) { log("Note: could not remove the default artboard from " + name + ": " + eAb.message); }
        try {
            var saveFile = new File(outputDir + "/" + name);
            if (saveFile.exists) {
                try { saveFile.remove(); } catch (eRm) { log("Note: could not remove existing " + name + ", saveAs will overwrite."); }
            }
            orderDoc.saveAs(saveFile, new IllustratorSaveOptions());
            orderDocFiles.push(name);
            log("AI file saved successfully: " + name);
        } catch (eSave) {
            log("SAVE ERROR (" + name + "): " + eSave.message);
        }
    }

    // HOODIE: build the extras of any size that never got them inline. Called
    // BEFORE a document is closed (so a size's Hood/Border/Pocket can never be
    // orphaned in a file its Front no longer lives in) and once more at the end
    // of the job for the last document.
    function buildPendingHoodieExtras() {
        if (!HOODIE_ON) return;
        try {
            for (var hoodieSizeKey in hoodieFrontBySize) {
                if (!hoodieFrontBySize.hasOwnProperty(hoodieSizeKey)) continue;
                if (hoodieFrontBySize[hoodieSizeKey].built) continue;
                updateStatus("Building Hoodie parts (Hood/Border/Pocket)...", 93, false);
                log("HOODIE: " + hoodieSizeKey + " wasn't built inline (no plain 'front' item in its size group) - building now as a fallback, may land out of size order.");
                buildHoodieExtras(hoodieSizeKey, hoodieFrontBySize[hoodieSizeKey]);
                hoodieFrontBySize[hoodieSizeKey].built = true;
            }
        } catch (eHoodie) { log("HOODIE: fallback pass error: " + eHoodie.message); }
    }

    // Save + close the full document and continue the layout at the top of a
    // brand new one. Every cross-document reference is dropped here: the three
    // "anchor to the piece above" caches and the accessory master (reset by the
    // caller) would otherwise point into a closed document.
    function startNextOrderDoc(reason) {
        var closing = orderFileName(orderDocIndex);
        // The NEXT file's name is not predictable here under SPLIT_PER_SIZE (it
        // depends on the size that is about to claim it), so this only reports
        // what is being closed. The new file logs its own name below, after the
        // label and counter have settled.
        log("ORDER FILE: " + reason + " - saving " + closing + " and continuing in a new file.");
        updateStatus("Saving " + closing + "...", 90, false);
        buildPendingHoodieExtras();
        // BEFORE saveOrderDoc(): it drops artboard 0, which would shift every
        // queued artboard index by one. And before close(), obviously - the
        // artwork has to still be here to render.
        flushExports(closing);
        saveOrderDoc();
        try { orderDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) { log("ORDER FILE: could not close " + closing + ": " + eClose.message); }

        orderDocIndex++;
        // Same size, next file: only reached when a single size is too tall for
        // one canvas, which gives _Large_2.ai. Bumped AFTER saveOrderDoc above
        // so the file just written keeps its own name, and immediately reset to
        // 1 by the size-boundary block when a NEW size claims this document.
        if (SPLIT_PER_SIZE && orderDocLabel) {
            orderLabelSeen[orderDocLabel] = (orderLabelSeen[orderDocLabel] || 1) + 1;
        }
        orderDoc = app.documents.add(DocumentColorSpace.CMYK);
        clearOrderDocSwatches(orderDoc);
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        currentX = -7500; currentY = ORDER_TOP_Y; rowMaxHeight = 0; artboardCount = 0;
        pmLastFullButtonPanel = null;
        pmLastSleevePanel = null;
        ribCuffSleeveBySize = {};
        log("ORDER FILE: " + orderFileName(orderDocIndex) + " created (CMYK), layout restarted at Y=" + ORDER_TOP_Y + ".");
    }

    // Only written when the job actually needed more than one file, so a normal
    // single-file job's renders folder is unchanged.
    function writeOrderFileIndex() {
        try {
            if (orderDocFiles.length < 2) return;
            var idxFile = new File(outputDir + "/order_files.txt");
            idxFile.open("w");
            idxFile.writeln("This order did not fit on ONE Illustrator canvas (227.54in square).");
            idxFile.writeln("It was split across " + orderDocFiles.length + " files, in layout order:");
            for (var f = 0; f < orderDocFiles.length; f++) idxFile.writeln("  " + (f + 1) + ". " + orderDocFiles[f]);
            idxFile.close();
            log("ORDER FILE: order split across " + orderDocFiles.length + " files - see order_files.txt.");
        } catch (eIdx) { log("ORDER FILE: could not write order_files.txt: " + eIdx.message); }
    }

    // The pattern panel's own height, plus the ~1pt-per-side that
    // applyPatternOutlineStroke adds once the piece is in the order document.
    // PATTERN PANEL SIZES, MEASURED ONCE, BEFORE THE ORDER DOCUMENT EXISTS.
    //
    // The canvas-overflow checks need to know how big a panel is before it is
    // placed. Reading that out of the PATTERN document while the ORDER document
    // is being laid out is what broke job bdb2a7a6: touching a pattern item's
    // bounds mid-layout moves Illustrator's reported coordinates between the two
    // documents by the gap between their origins - measured here as exactly
    // 792pt, the height of the default artboard every new document is created
    // with. The very next `piece.top = currentY` then lands the piece 792pt off
    // its row while its artboard is cut from the shifted numbers, so rows
    // overlapped and exports came out half blank. Traced line by line:
    //     Found 'XL Back' in Pattern.        [panelTop=7749]
    //     Creating Instance: XL Back_Item1   [panelTop=6957]   <- the read
    //     Placed pattern at Y:7749           [panelTop=7749]   <- placed shifted
    //     Searching for 'Placement Path'     [panelTop=8541]   <- space restored
    // The old code never read pattern bounds at all (it duplicated into the
    // order document first, then measured), which is why this only appeared with
    // the overflow checks.
    //
    // So: every size the job can possibly need is taken here in one pass, while
    // no order document exists to be disturbed, and the item loop only ever
    // reads this cache.
    // Declaration only, filled lazily - prebuildPatternSizes() runs LONG before
    // execution ever reaches this line (same `var` hoisting rule as _nameIndexes
    // above: the declaration hoists, the assignment does not).
    var patternSizeCache;

    // FULL-BUTTON BACK-DRIVEN NUMBERS, MEASURED IN THE SAME PRE-ORDER-DOCUMENT
    // WINDOW AND FOR EXACTLY THE SAME REASON as patternSizeCache above.
    //
    // sizeLabel -> { scale: %, panelSeam: pt|null, designSeam: pt|null }
    //
    // This has to live here rather than in pmFullButtonScale/pmBackUnderarm
    // directly: those are declared further down the main flow, i.e. AFTER the
    // order document is created, so anything written into them at prebuild time
    // would be wiped by their own `= {}` initialisers. pmPeekFullButtonScale
    // copies out of here into them at its first call per size.
    var pmPrebuiltFullButton;

    function patternTargetName(item, sizeLabel) {
        var lbl = resolvePartLabel(item, sizeLabel);
        return (isAccessory(item.part_name) || sizeLabel === "Universal") ? lbl : (sizeLabel + " " + lbl);
    }

    // +10pt covers applyPatternOutlineStroke, which widens the piece by about
    // 1pt per side once it is in the order document.
    function cachePatternSize(item, sizeLabel) {
        try {
            if (!patternSizeCache) patternSizeCache = {};
            var nm = patternTargetName(item, sizeLabel);
            if (patternSizeCache[nm]) return;
            var obj = findAnywhere(patternDoc, nm);
            if (!obj) return;
            var b = obj.visibleBounds;
            patternSizeCache[nm] = { w: Math.abs(b[2] - b[0]) + 10, h: Math.abs(b[1] - b[3]) + 10 };
        } catch (e) {}
    }

    function prebuildPatternSizes() {
        try {
            if (!patternSizeCache) patternSizeCache = {};
            // Full-button jobs split "front" into front-left/front-right later
            // (see mockupHasBothFrontSides), so both names are cached up front.
            var splitsFront = (plan.full_button_jersey === true);
            var measured = 0;
            for (var g = 0; g < plan.production_groups.length; g++) {
                var grp = plan.production_groups[g];
                var sz = getFriendlySize(grp.size);
                for (var i = 0; i < grp.items.length; i++) {
                    var it = grp.items[i];
                    cachePatternSize(it, sz);
                    if (splitsFront && (it.part_name || "").toLowerCase() === "front") {
                        cachePatternSize({ part_name: "front-left" }, sz);
                        cachePatternSize({ part_name: "front-right" }, sz);
                    }
                }
            }
            for (var k in patternSizeCache) { if (patternSizeCache.hasOwnProperty(k)) measured++; }
            log("PATTERN SIZES: pre-measured " + measured + " panel(s) before the order document was created.");
        } catch (e) {
            log("PATTERN SIZES: pre-measure failed (" + e.message + ") - overflow checks will simply skip.");
        }
    }

    // Back's own height-fit % per size, plus Back's side-seam length - the two
    // numbers pmPeekFullButtonScale hands to the full-button front halves.
    //
    // MEASURED HERE, IN THE SAME PRE-ORDER-DOCUMENT WINDOW AS
    // prebuildPatternSizes, AND FOR THE SAME REASON. Both inputs live in other
    // documents (the panel in patternDoc, the design in mockupDoc), and reading
    // a foreign document's bounds while the order document is being laid out
    // shifts Illustrator's reported coordinates between the two by the gap
    // between their origins - exactly 792pt, see prebuildPatternSizes' note.
    // Doing it from inside the item loop put Front-Left 792pt above its row
    // slot; snapPieceToItsSlot pulled the panel back afterwards, but the
    // placket join had already run and had pinned the shared seam graphic to
    // the drifted Y, so Front-Right rendered its half of the design 792pt high.
    //
    // The earlier version dodged the coordinate shift by duplicating both
    // shapes into the order document and measuring the copies, but it parked
    // them at (-50000, 50000) - far outside Illustrator's ~+/-16383pt canvas -
    // and both shapes are clipping paths, so the copies measured 357.38x347.63in
    // against 355.68x277.61in (real: ~27.85x36.07in and 22.68x32.10in). Every
    // size then got one identical 125.2% instead of its own 100/102.4/106.4/
    // 110.2/112.4%, which oversized the design on every panel, pushed the
    // shoulder band above the panel's shoulder line, and left SHOULDER-ANCHOR
    // with "0 usable sample(s)" on all 28 panels. Measuring in place, before
    // the order document exists, is the only version with neither problem.
    function prebuildFullButtonScales() {
        if (plan.full_button_jersey !== true) return;
        try {
            if (!pmPrebuiltFullButton) pmPrebuiltFullButton = {};

            // The Back DESIGN reference is size-independent - one measurement
            // serves every size.
            var backSourceDesign = getSourceView("back", mockupDoc, false);
            if (!backSourceDesign) { log("PLACKET-MATCH: no Back design found in the mockup - full-button sizes will each fall back to their own scale."); return; }
            // findPlacementPath takes a Layer as-is (it only reads .typename and
            // .pageItems), so the Layer case needs no throwaway wrapper group.
            var designRef = findPlacementPath(backSourceDesign, true) || backSourceDesign;
            var oB = pmFitBounds(designRef), oH = Math.abs(oB[1] - oB[3]);
            if (oH <= 0) { log("PLACKET-MATCH: Back design reference measured zero height - full-button sizes will each fall back to their own scale."); return; }
            var designSeam = null;
            try { designSeam = _uaSeamLen(findUnderarmY(designRef, "Back design")); } catch (eD) {}

            // A real full-button scale is always a modest resize (mockup and
            // production panel are drawn at broadly similar real-world
            // proportions). Anything outside this band is a bad measurement,
            // not a real garment, and is dropped so the size falls back to
            // fitting its own panel independently.
            var SANE_MIN = 10, SANE_MAX = 500;

            for (var g = 0; g < plan.production_groups.length; g++) {
                var sizeLabel = getFriendlySize(plan.production_groups[g].size);
                if (pmPrebuiltFullButton[sizeLabel] !== undefined) continue;
                pmPrebuiltFullButton[sizeLabel] = null;

                var backPatternObj = findAnywhere(patternDoc, sizeLabel + " Back");
                if (!backPatternObj) { log("PLACKET-MATCH: no '" + sizeLabel + " Back' pattern piece found - Front/Back will scale independently for this size."); continue; }
                var panelRef = findPlacementPath(backPatternObj);
                if (!panelRef) { log("PLACKET-MATCH: could not find Back's placement path for size '" + sizeLabel + "'."); continue; }

                // pmFitBounds (cut path) for the same reason as every other
                // scaler - and it settles a mismatch specific to this one: the
                // pattern piece has not been through applyPatternOutlineStroke
                // yet, so it still carries the pattern's 1pt while the panel
                // this predicts the scale for is already at 3pt. On geometry
                // neither stroke matters.
                var tB = pmFitBounds(panelRef), targetH = Math.abs(tB[1] - tB[3]);
                var scale = (targetH / oH) * 100;
                log("PEEK-DIAG " + sizeLabel + ": panel name='" + (panelRef.name || "") + "' type=" + panelRef.typename +
                    " W=" + (Math.round((Math.abs(tB[2] - tB[0]) / 72) * 100) / 100) + "in H=" + (Math.round((targetH / 72) * 100) / 100) + "in" +
                    " | design name='" + (designRef.name || "") + "' type=" + designRef.typename +
                    " W=" + (Math.round((Math.abs(oB[2] - oB[0]) / 72) * 100) / 100) + "in H=" + (Math.round((oH / 72) * 100) / 100) + "in");
                if (scale < SANE_MIN || scale > SANE_MAX) {
                    log("WARNING: Back-scale for size '" + sizeLabel + "' is an implausible " + (Math.round(scale * 10) / 10) + "% - Front/Back will scale independently for this size instead.");
                    continue;
                }

                var panelSeam = null;
                try { panelSeam = _uaSeamLen(findUnderarmY(panelRef, sizeLabel + " Back panel")); } catch (eP) {}

                pmPrebuiltFullButton[sizeLabel] = { scale: scale, panelSeam: panelSeam, designSeam: designSeam };
                log("PLACKET-MATCH: Back-driven scale for size '" + sizeLabel + "' = " + (Math.round(scale * 10) / 10) + "%.");
            }
        } catch (e) {
            log("PLACKET-MATCH: full-button pre-measure failed (" + e.message + ") - each size will fall back to its own scale.");
        }
    }

    // 0 = not measured, which every caller treats as "no overflow check".
    function patternPieceHeightFor(name) {
        if (!patternSizeCache) return 0;
        var s = patternSizeCache[name];
        return s ? s.h : 0;
    }

    // Put a finished piece back in the row slot the layout gave it.
    //
    // The row flow hands every piece an exact slot (slotRect, taken from where the
    // piece was actually placed) and then the design is pasted, aligned, scaled,
    // seam-measured and clipped on top of it. On some patterns that processing
    // leaves the whole piece sitting somewhere else - measured on job d123b31d:
    // every piece except the very first one and the Necks ended up exactly 792pt
    // ABOVE its own slot, so pieces climbed into the row above and overlapped it,
    // while the two that had not moved looked like they had "dropped".
    // Moving the piece (panel AND its design together, so their alignment is
    // untouched) is the correction that keeps the whole sheet tiled; re-cutting
    // the artboard alone would only re-frame a piece that is still in the wrong
    // row.
    //
    // MOVE-only, like fitArtboardToPanel below: if the panel no longer measures
    // its slot's size then panelPath is not the panel at all (patterns without a
    // named 'base-path' fall back to whatever path findPlacementPath sees first),
    // and the piece is left exactly where it is rather than dragged by a wrong
    // reference.
    function snapPieceToItsSlot(piece, panelPath, slotRect, label) {
        try {
            if (!piece || !panelPath || !slotRect) return;
            var b = panelPath.visibleBounds;
            var w = Math.abs(b[2] - b[0]), h = Math.abs(b[1] - b[3]);
            var sw = Math.abs(slotRect[2] - slotRect[0]), sh = Math.abs(slotRect[1] - slotRect[3]);
            if (!(sw > 0) || !(sh > 0) || !(w > 0) || !(h > 0)) return;
            if (Math.abs(w - sw) > 0.2 * sw || Math.abs(h - sh) > 0.2 * sh) {
                log("SLOT SNAP [" + label + "]: reference path is " + Math.round(w) + "x" + Math.round(h) +
                    "pt against a " + Math.round(sw) + "x" + Math.round(sh) + "pt slot - too different to trust, piece left where it is.");
                return;
            }
            var dx = slotRect[0] - b[0], dy = slotRect[1] - b[1];
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return; // already in its slot - the normal case
            piece.translate(dx, dy);
            log("SLOT SNAP [" + label + "]: piece had drifted " + Math.round(dx) + "pt across and " +
                Math.round(-dy) + "pt up out of its row slot during processing - moved back.");
        } catch (e) {
            log("SLOT SNAP [" + label + "]: failed - " + e.message);
        }
    }

    // Re-fit one artboard around the panel it belongs to, immediately before that
    // piece is exported - see the call site for why this is needed.
    //
    // Uses Illustrator's OWN fitArtboardToSelectedArt(index) - the documented DOM
    // call behind Object > Artboards > Fit to Selected Art - rather than building
    // a rect out of visibleBounds by hand. That matters: scripted visibleBounds
    // lies about clipped groups (it reports the UNCLIPPED extent), and it also
    // moves with strokes and live effects, so a hand-built rect is only as
    // trustworthy as those numbers. The official call uses Illustrator's own
    // rendered bounds - the same box the Fit to Selected Art menu item would
    // produce - which is exactly what the export then clips to.
    //
    // Fitted to the PANEL OUTLINE, not to the whole piece: the pasted design
    // deliberately bleeds past the cut line, and the artboard must stay the cut
    // piece (that is what the placement rect always meant).
    //
    // Deliberately POSITION-only: if the fit comes back more than 20% away from
    // the size the placement measured, that is not drift but a wrong reference
    // path (patterns without a named 'base-path' fall back to the first path
    // findPlacementPath happens to see), so the original rect is restored.
    function fitArtboardToPanel(idx, panelPath, label) {
        try {
            if (!panelPath) return; // no placement path (accessory master reuse) - nothing to fit to
            if (idx < 0 || idx >= orderDoc.artboards.length) return;

            var ab = orderDoc.artboards[idx];
            var before = ab.artboardRect;
            var bw = Math.abs(before[2] - before[0]), bh = Math.abs(before[1] - before[3]);

            app.activeDocument = orderDoc;
            orderDoc.selection = null;
            panelPath.selected = true;
            orderDoc.fitArtboardToSelectedArt(idx);
            orderDoc.selection = null;

            var after = ab.artboardRect;
            var aw = Math.abs(after[2] - after[0]), ah = Math.abs(after[1] - after[3]);
            if (!(aw > 0) || !(ah > 0) || Math.abs(aw - bw) > 0.2 * bw || Math.abs(ah - bh) > 0.2 * bh) {
                ab.artboardRect = before;
                log("ARTBOARD FIT [" + label + "]: fit came back " + Math.round(aw) + "x" + Math.round(ah) +
                    "pt against a " + Math.round(bw) + "x" + Math.round(bh) + "pt piece - rejected, artboard left as placed.");
                return;
            }

            var dLeft = after[0] - before[0], dTop = after[1] - before[1];
            if (Math.abs(dLeft) >= 1 || Math.abs(dTop) >= 1) {
                log("ARTBOARD FIT [" + label + "]: panel had drifted " + Math.round(dLeft) + "pt across and " +
                    Math.round(-dTop) + "pt down during processing - artboard re-fitted to it.");
            }
        } catch (e) {
            log("ARTBOARD FIT [" + label + "]: failed - " + e.message);
        }
    }

    var _partLabelMap; // lazily built - see the _nameIndexes note above

    // part_name (Excel/plan) -> the panel name the pattern file uses. Shared by
    // the main item loop and estimateSizeGroupHeight so the estimate can never
    // measure a different panel than the one that actually gets placed.
    function resolvePartLabel(item, sizeLabel) {
        if (!_partLabelMap) {
            _partLabelMap = {
                "front": "Front", "back": "Back", "neck": "Neck",
                "front-left": "Front Left", "front_left": "Front Left",
                "front-right": "Front Right", "front_right": "Front Right",
                "sleeve-long": "Long Sleeve", "sleeve_long": "Long Sleeve",
                "sleeve-short": "Short Sleeve", "sleeve_short": "Short Sleeve",
                "sleeve": "Short Sleeve", "sleeve-half": "Short Sleeve", "sleeve_half": "Short Sleeve",
                "sleeve-right": "Right Sleeve", "sleeve_right": "Right Sleeve",
                "sleeve-left": "Left Sleeve", "sleeve_left": "Left Sleeve",
                "cuff": "Rib & Cuff", "twill-tape": "Twill Tape", "twill_tape": "Twill Tape", "tukdi": "Tukdi",
                "placket": "Placket",
                // FULL-BUTTON JERSEY ONLY: the button strip, distinct from
                // "placket" above. NOT in isAccessory() on purpose - its
                // length scales with garment size, so it must be looked
                // up per size ("XL Patti", "Small Patti"...) like Front/
                // Back/Neck, not as one shared Universal piece.
                "patti": "Patti"
            };
        }
        var partLabel = _partLabelMap[item.part_name] || item.part_name;
        if (item.part_name === "sleeve") {
            if (findAnywhere(patternDoc, sizeLabel + " Short Sleeve")) partLabel = "Short Sleeve";
            else if (findAnywhere(patternDoc, sizeLabel + " Long Sleeve")) partLabel = "Long Sleeve";
            else if (findAnywhere(patternDoc, sizeLabel + " Sleeve")) partLabel = "Sleeve";
        }
        return partLabel;
    }

    // How much vertical room this whole size needs, by replaying the SAME row
    // flow the item loop uses over the pattern file's real panel sizes (the
    // order doc places every panel at its native size). Returns 0 when nothing
    // could be measured, which the caller treats as "don't roll over".
    //
    // Deliberately biased to OVER-estimate, because the cost of guessing high
    // is one early file break while guessing low puts a size off the canvas:
    //   - Rib & Cuff and the second sleeve of a stacked pair are counted as
    //     ordinary row items (they really consume no row of their own),
    //   - HOODIE adds two spare rows for the Hood/Border/Pocket extras that
    //     are built after this size's plan items,
    //   - the size-group label's own height is included.
    function estimateSizeGroupHeight(group, sizeLabel) {
        try {
            var x = -7500, dropped = 0, rowH = 0, tallest = 0, measured = 0;
            for (var e = 0; e < group.items.length; e++) {
                var eItem = group.items[e];
                // From the cache ONLY - never the live pattern document, see
                // prebuildPatternSizes for what a mid-layout read does.
                var eSize = patternSizeCache ? patternSizeCache[patternTargetName(eItem, sizeLabel)] : null;
                if (!eSize) continue;
                var ew = eSize.w, eh = eSize.h;
                if (eh > tallest) tallest = eh;
                measured++;
                for (var eq = 0; eq < (eItem.quantity || 1); eq++) {
                    x += ew + refContext.spacing;
                    if (eh > rowH) rowH = eh;
                    if (x > 7500) { x = -7500; dropped += rowH + refContext.vSpacing; rowH = 0; }
                }
            }
            if (measured === 0) return 0;
            var total = dropped + rowH + 250; // 250pt covers the 200pt size-group label + its 5mm gap
            if (HOODIE_ON) total += 2 * (tallest + refContext.vSpacing);
            return total;
        } catch (eEst) {
            log("ORDER FILE: could not estimate height for size " + sizeLabel + " (" + eEst.message + ") - no whole-size rollover for it.");
            return 0;
        }
    }

    // LOCAL TAG LABEL: the mockup carries a "LOCAL-TAG" group - a sewing label
    // whose stitch lines are clipped inside the label box, with a text frame
    // named "SIZE" holding the size letter. Its clip mask is released before
    // scaling like every other internal clip, so after alignAndScale this:
    //   1) rewrites the SIZE text from the production size (Small -> S ...),
    //   2) scales the label so the box is EXACTLY 3in wide for every size,
    //   3) rebuilds the label's own clipping mask from the TAG-MASK path.
    // Finds the PathItem/CompoundPathItem actually acting as a group's clip
    // mask (the one Illustrator is using to hide everything outside it) by
    // its .clipping flag - NOT by name. Name-based lookup ("TAG-MASK") can
    // land on an unrelated same-named leftover (e.g. a stray construction
    // line), silently measuring the wrong shape instead of the real box.
    function findActiveClipPath(group) {
        if (!group || !group.pageItems) return null;
        for (var i = 0; i < group.pageItems.length; i++) {
            var it = group.pageItems[i];
            try { if ((it.typename === "PathItem" || it.typename === "CompoundPathItem") && it.clipping) return it; } catch (eCl) {}
            if (it.typename === "GroupItem") {
                var hit = findActiveClipPath(it);
                if (hit) return hit;
            }
        }
        return null;
    }

    function processLocalTagLabel(designGroup, sizeLabel, baseShape) {
        var tagGroup = findByNormalizedName(designGroup, "localtag", "GroupItem");
        if (!tagGroup) return;
        log("LOCAL-TAG label found - personalizing letter, width and clip...");

        var abbrev = sizeToAbbrev(sizeLabel);
        if (abbrev) {
            var sizeTf = findByNormalizedName(tagGroup, "size", "TextFrame");
            if (sizeTf) {
                try { sizeTf.contents = abbrev; log("   - SIZE text set to '" + abbrev + "'."); }
                catch (eTxt) { log("   - WARNING: could not set SIZE text: " + eTxt.message); }
            } else log("   - WARNING: no 'SIZE' text frame inside LOCAL-TAG - letter left as-is.");
        } else log("   - WARNING: no abbreviation for size '" + sizeLabel + "' - letter left as-is.");

        // Pin the label's BORDERED BOX (the actual clip path, wherever it is
        // nested inside the group - confirmed on a real mockup to sit several
        // groups deep, with every ancestor including the group itself
        // reporting clipped=false) to its target width, height proportional.
        // Youth sizes (YXS/YS/YM/YL/YXL) get a 2.5in tag; every adult size
        // (XS and up) keeps the standard 3in tag.
        // Measuring the whole group instead would include sibling content
        // that sits outside the box (e.g. brand text next to it), inflating
        // the reference width and leaving the box itself short after scaling
        // - confirmed on a real job: group measured 3.91in while its own box
        // was 3.20in, so scaling the whole group to 3in shrank the box to
        // 2.45in instead of 3in.
        try {
            // ExtendScript's JS engine has no Array.prototype.indexOf (ES5) -
            // an object-key lookup works in every version instead.
            var youthSizeKeys = { "yxs": true, "ys": true, "ym": true, "yl": true, "yxl": true };
            var isYouthSize = youthSizeKeys[(sizeLabel || "").toLowerCase().replace(/^\s+|\s+$/g, "")] === true;
            var targetPt = (isYouthSize ? 2.5 : 3) * 72;
            var activeClip = findActiveClipPath(tagGroup);
            var refItem = activeClip || tagGroup;
            var rb = activeClip ? refItem.geometricBounds : refItem.visibleBounds;
            var curW = Math.abs(rb[2] - rb[0]);
            if (curW > 1) {
                var pct = (targetPt / curW) * 100;
                tagGroup.resize(pct, pct, true, true, true, true, pct, Transformation.CENTER);
                log("   - Label scaled to " + (Math.round(pct * 10) / 10) + "% -> box width = " + (targetPt / 72) + "in (" + (isYouthSize ? "youth" : "adult") + ").");
            }
        // PARM goes up to the panel rollback - see the note on the Merge Error catch.
        } catch (eRz) {
            parmBail(eRz, "resizing a pattern label");
            log("   - WARNING: label resize failed: " + eRz.message);
        }

        // Position the label on the Front/Front-Right panel (always the
        // right side of Front - Front Right on a Full Button Jersey, the
        // single Front panel otherwise). Measured on the same BORDERED BOX
        // reference as the resize above (not the whole group) - sibling
        // content (e.g. brand text) can extend past the box and would throw
        // any gap off if the group's own aggregate bounds were used instead.
        try {
            if (baseShape) {
                var posClip = findActiveClipPath(tagGroup);
                var posRefItem = posClip || tagGroup;
                var posRb = posClip ? posRefItem.geometricBounds : posRefItem.visibleBounds;
                var panelB = baseShape.geometricBounds; // [L,T,R,B]

                // HALF THE PANEL'S CUT OUTLINE.
                //
                // Every branch below takes its corner from _smSampleOutline,
                // which samples PATH geometry, and the cut outline straddles
                // that path - half of it outside the corner, half inside. The
                // gap therefore has to start half a stroke further out, or the
                // measurement begins in the MIDDLE of the printed line and
                // buries that half inside the stroke.
                //
                // This was a hardcoded `+ 1.5` in all three branches. Correct
                // only while PATTERN_OUTLINE_PT stays at 3, and silently wrong
                // the moment it doesn't - with nothing in the log to show it.
                // Read off the item now, exactly like placeBackLabel's neck
                // reference does, so a piece that arrives with a different
                // outline (or none at all) still measures from its own real
                // painted edge. On this job it evaluates to 1.5, so today's
                // output is unchanged.
                //
                // The TAG's own edge needs no such correction: posRb is already
                // a painted measure. A clipping mask's own stroke is never
                // drawn, so when one is present its geometricBounds IS the
                // painted boundary; visibleBounds is right only when there is no
                // mask. That is the same rule _blPaintedBounds applies.
                var halfOutline = 0;
                try { if (baseShape.stroked) halfOutline = baseShape.strokeWidth / 2; } catch (eSW2) {}

                if (FULL_BUTTON) {
                    // FULL BUTTON JERSEY: find the panel's TRUE physical
                    // bottom-right corner point on the RAW (un-inset)
                    // outline, then simply offset it 2.5in left and 2in
                    // up - a plain axis-aligned inset from that single
                    // point, not a perpendicular-to-edge inset of the whole
                    // curve.
                    //
                    // Earlier versions inset the entire outline 2.5in inward
                    // first and recovered the corner by intersecting two
                    // edge-fit lines on that inset curve (matching how a
                    // perpendicular seam offset would look) - but the naive
                    // per-vertex inset self-intersects right at a sharp/
                    // angled corner, and a further "walk the inset curve to
                    // find the flush X" step meant to correct for that could
                    // wander the whole panel perimeter and latch onto a
                    // wildly wrong point (confirmed on real jobs: dxFB off
                    // by ~8in). On a panel with a sloped/angled hem near the
                    // corner (confirmed on a real XL panel) that whole
                    // approach also measured the gap along the sloped hem
                    // instead of straight up, landing the label much closer
                    // to the edge than 2.5in even when it didn't wander.
                    // Simply taking the raw corner point and moving it
                    // 2.5in left / 2.5in up directly is what the manual
                    // production technique actually does, and has none of
                    // that fragility.
                    //
                    // The corner point itself is found by maximizing
                    // (x - y) across the RAW sampled outline - the point
                    // simultaneously furthest right AND furthest down - NOT
                    // by finding the sample nearest the panel's raw
                    // bounding-box corner: confirmed on a real panel with a
                    // curved/angled hem that the actual bottom-right corner
                    // of the shape sits over 2in away from the bounding-box
                    // corner, so a nearest-point search anchored on the bbox
                    // corner landed on the wrong part of the outline
                    // entirely. The (x - y) extremal point correctly finds
                    // the true corner regardless of where the bounding-box
                    // corner falls.
                    var INSET_RIGHT_PT = 2.5 * 72 + halfOutline;
                    var INSET_UP_PT = 2 * 72 + halfOutline;
                    var outline = _smSampleOutline(baseShape, 64);
                    if (outline.length >= 8) {
                        var idx = -1, bestScore = -1e18;
                        for (var oi = 0; oi < outline.length; oi++) {
                            var score = outline[oi][0] - outline[oi][1];
                            if (score > bestScore) { bestScore = score; idx = oi; }
                        }
                        var cornerRaw = outline[idx];
                        var cornerX = cornerRaw[0] - INSET_RIGHT_PT;
                        var cornerY = cornerRaw[1] + INSET_UP_PT;
                        var dxFB = cornerX - posRb[2];
                        var dyFB = cornerY - posRb[3];
                        tagGroup.translate(dxFB, dyFB);
                        log("   - LOCAL-TAG-DIAG cornerRaw=(" + (cornerRaw[0] / 72 * 25.4).toFixed(1) + "," + (cornerRaw[1] / 72 * 25.4).toFixed(1) + ")mm" +
                            " cornerTarget=(" + (cornerX / 72 * 25.4).toFixed(1) + "," + (cornerY / 72 * 25.4).toFixed(1) + ")mm" +
                            " dxFB=" + (dxFB / 72 * 25.4).toFixed(1) + "mm dyFB=" + (dyFB / 72 * 25.4).toFixed(1) + "mm" +
                            " labelCornerBefore=(" + (posRb[2] / 72 * 25.4).toFixed(1) + "," + (posRb[3] / 72 * 25.4).toFixed(1) + ")mm");
                        log("   - Label positioned 2.5in+1.5pt left / 2in+1.5pt up from the panel's true bottom-right corner (full-button).");
                    } else {
                        log("   - WARNING: could not sample panel outline for the 2.5in/2in corner - label position left as-is.");
                    }
                } else if (HOODIE_ON) {
                    // HOODIE: same technique as full-button/normal-jersey
                    // above, but its own independent gap - 1in left / 1.5in
                    // up from the panel's true bottom-right corner (per
                    // explicit instruction, distinct from Full Button's
                    // 2.5in/2in and plain jersey's 2.5in/3in). May be moved
                    // again below by the Pocket/Local-Tag overlap recipe.
                    var hRightGapPt = 1 * 72 + halfOutline, hBottomGapPt = 1.5 * 72 + halfOutline;
                    var outlineH = _smSampleOutline(baseShape, 64);
                    if (outlineH.length >= 8) {
                        var idxH = -1, bestScoreH = -1e18;
                        for (var oiH = 0; oiH < outlineH.length; oiH++) {
                            var scoreH = outlineH[oiH][0] - outlineH[oiH][1];
                            if (scoreH > bestScoreH) { bestScoreH = scoreH; idxH = oiH; }
                        }
                        var cornerRawH = outlineH[idxH];
                        var cornerXH = cornerRawH[0] - hRightGapPt;
                        var cornerYH = cornerRawH[1] + hBottomGapPt;
                        var dxH = cornerXH - posRb[2];
                        var dyH = cornerYH - posRb[3];
                        tagGroup.translate(dxH, dyH);
                        log("   - LOCAL-TAG-DIAG cornerRaw=(" + (cornerRawH[0] / 72 * 25.4).toFixed(1) + "," + (cornerRawH[1] / 72 * 25.4).toFixed(1) + ")mm" +
                            " cornerTarget=(" + (cornerXH / 72 * 25.4).toFixed(1) + "," + (cornerYH / 72 * 25.4).toFixed(1) + ")mm" +
                            " dxH=" + (dxH / 72 * 25.4).toFixed(1) + "mm dyH=" + (dyH / 72 * 25.4).toFixed(1) + "mm");
                        log("   - Label positioned " + (hRightGapPt / 72) + "in left / " + (hBottomGapPt / 72) + "in up from the panel's true bottom-right corner (hoodie).");
                    } else {
                        log("   - WARNING: could not sample panel outline for the " + (hRightGapPt / 72) + "in/" + (hBottomGapPt / 72) + "in corner - label position left as-is.");
                    }
                } else {
                    // NORMAL JERSEY: same technique as full-button above -
                    // find the panel's TRUE physical bottom-right corner
                    // point on the RAW outline (the point simultaneously
                    // furthest right AND furthest down), then simply offset
                    // it 2.5in left and 3in up. Axis-aligned from that single
                    // point, not a curve/hem sample - robust on a curved or
                    // angled hem the same way the full-button fix above is.
                    var rightGapPt = 2.5 * 72 + halfOutline, bottomGapPt = 3 * 72 + halfOutline;
                    var outlineN = _smSampleOutline(baseShape, 64);
                    if (outlineN.length >= 8) {
                        var idxN = -1, bestScoreN = -1e18;
                        for (var oiN = 0; oiN < outlineN.length; oiN++) {
                            var scoreN = outlineN[oiN][0] - outlineN[oiN][1];
                            if (scoreN > bestScoreN) { bestScoreN = scoreN; idxN = oiN; }
                        }
                        var cornerRawN = outlineN[idxN];
                        var cornerXN = cornerRawN[0] - rightGapPt;
                        var cornerYN = cornerRawN[1] + bottomGapPt;
                        var dxN = cornerXN - posRb[2];
                        var dyN = cornerYN - posRb[3];
                        tagGroup.translate(dxN, dyN);
                        log("   - LOCAL-TAG-DIAG cornerRaw=(" + (cornerRawN[0] / 72 * 25.4).toFixed(1) + "," + (cornerRawN[1] / 72 * 25.4).toFixed(1) + ")mm" +
                            " cornerTarget=(" + (cornerXN / 72 * 25.4).toFixed(1) + "," + (cornerYN / 72 * 25.4).toFixed(1) + ")mm" +
                            " dxN=" + (dxN / 72 * 25.4).toFixed(1) + "mm dyN=" + (dyN / 72 * 25.4).toFixed(1) + "mm");
                        log("   - Label positioned " + (rightGapPt / 72) + "in left / " + (bottomGapPt / 72) + "in up from the panel's true bottom-right corner (normal jersey).");
                    } else {
                        log("   - WARNING: could not sample panel outline for the " + (rightGapPt / 72) + "in/" + (bottomGapPt / 72) + "in corner - label position left as-is.");
                    }
                }
            } else {
                log("   - WARNING: no panel shape passed - label position left as-is.");
            }
        // PARM goes up to the panel rollback - see the note on the Merge Error catch.
        } catch (ePos) {
            parmBail(ePos, "positioning a pattern label");
            log("   - WARNING: label position failed: " + ePos.message);
        }
        return tagGroup;
    }

    // PERFORMANCE: walking the whole document over COM for EVERY name lookup is
    // extremely slow (minutes per miss). Instead we walk each document ONCE,
    // cache every named item in a lookup table, and answer all subsequent
    // findAnywhere() calls instantly from that index.
    // NOTE: assigned lazily inside findAnywhere - var assignments placed after
    // the main try/catch would not have run yet when the main flow executes.
    var _nameIndexes;

    function _buildNameIndex(container) {
        var index = {};
        function walk(items, depth) {
            if (!items || items.length === 0 || depth > 3) return;
            // First register all names at this level (preserves the old
            // "shallowest match wins" priority), then recurse.
            for (var i = 0; i < items.length; i++) {
                try {
                    var n = (items[i].name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                    if (n && !index[n]) index[n] = items[i];
                } catch (e) {}
            }
            for (var i = 0; i < items.length; i++) {
                try {
                    if (items[i].typename === "GroupItem") walk(items[i].pageItems, depth + 1);
                    else if (items[i].typename === "Layer") { walk(items[i].layers, depth + 1); walk(items[i].pageItems, depth + 1); }
                } catch (e) {}
            }
        }
        walk(container.layers ? container.layers : [container], 0);
        return index;
    }

    function findAnywhere(container, name) {
        if (!container || !name) return null;
        if (!_nameIndexes) _nameIndexes = [];
        var sName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        var idx = null;
        for (var i = 0; i < _nameIndexes.length; i++) {
            if (_nameIndexes[i].c === container) { idx = _nameIndexes[i].x; break; }
        }
        if (!idx) {
            var t0 = new Date().getTime();
            idx = _buildNameIndex(container);
            _nameIndexes.push({ c: container, x: idx });
            var count = 0; for (var k in idx) count++;
            log("Name index built (" + count + " named items, " + (new Date().getTime() - t0) + "ms) - lookups are now instant.");
        }
        return idx[sName] || null;
    }

    // Two-axis INDEPENDENT stretch (design_scale_mode "both"): width and height
    // each get their own %, so the design fills the panel exactly.
    //
    // NO SAFE MARGIN (explicit instruction): this used to inset the target by
    // 7mm on the top and both sides - plus the bottom too for a front/back that
    // wasn't bottom-aligned - so the design stopped short of the panel edge.
    // Removed: it now fits the panel's FULL bounds, the same edges the
    // height-only scaler (pmAlignAndScaleToHeight) already used, so the two
    // modes differ purely in which axes scale. `alignBottom`, `isSleeve` and
    // `isNeck` only ever chose which of those margins applied, so they no
    // longer change anything here - kept in the signature because every call
    // site passes them. (Unrelated to SM_SEAM_PT, the -7mm stitch line
    // SLEEVE-MATCH measures on, and to the rib/cuff sideMargin above.)

    // FIT MEASUREMENT: the CUT PATH, never the painted edge.
    //
    // Every scaler in this file measures the design against the panel through
    // this one function, and it returns geometricBounds on purpose.
    //
    // They all used to read visibleBounds - on both the target and the reference
    // - on the reasoning that pinning the pattern outline to PATTERN_OUTLINE_PT
    // (3pt) made the mockup's 3pt base-path and the panel's 3pt outline cancel
    // out. THEY DO NOT CANCEL. visibleBounds is not "path plus half the stroke":
    // at a sharp corner the MITER JOIN projects several times that, and a Front
    // neckline is not the same shape as a Back one.
    //
    // Measured read-only on this job's mockup (bl_stroke_probe), paint outside
    // the path PER EDGE, on two base-paths that are geometrically IDENTICAL
    // (1681.17 x 1876.67 both) and both stroked at 3pt:
    //
    //            L        T        R        B     centre shift Y
    //   Front  +1.50   +4.91    +1.50    +1.50       +1.70
    //   Back   +1.50   +1.75    +1.50    +1.50       +0.12
    //
    // Left, right and bottom are a clean half-stroke. Only the TOP misbehaves -
    // the neck corner's miter - and it poisons the fit twice over:
    //
    //   1. SCALE, taken from visible heights: Front 114.4668% vs Back 114.6352%.
    //   2. CENTRING, which put the reference's VISIBLE centre on the target's
    //      VISIBLE centre. Front's visible centre sits 1.70pt above its own path
    //      centre, Back's only 0.12pt.
    //
    // Net vertical error of the placed design's geometric centre against the
    // panel's: Front -1.61pt, Back -0.02pt. The 1.59pt between them is a pure
    // translation - constant over the whole panel - which is exactly the "fixed
    // 1.5pt gap" measured by hand when Front is laid over Back in the order
    // file. The same two panels overlay perfectly in the mockup, confirmed by
    // the user: the difference was manufactured here, not inherited.
    //
    // On geometricBounds those two give 114.66108% and 114.66054% - the same
    // number to four decimals - and both errors go to zero.
    //
    // It is also what the measurement MEANS: the design's base-path is the
    // garment silhouette and the panel's path is the cut line, so path-to-path
    // is the honest comparison. The 3pt outline is untouched and still prints as
    // the cut marker; it just no longer decides how big the design gets or where
    // it sits. No-op for anything unstroked (geometric == visible there), so
    // this only ever changes the cases it was meant to.
    function pmFitBounds(item) { return item.geometricBounds; }

    function alignAndScale(obj, target, alignBottom, isSleeve, isNeck, referenceItem) {
        try {
            var tB = pmFitBounds(target);
            var safeTop = tB[1], safeBottom = tB[3], safeLeft = tB[0], safeRight = tB[2];
            var availableW = Math.abs(safeRight - safeLeft), availableH = Math.abs(safeTop - safeBottom);
            var targetCenterX = safeLeft + (availableW / 2), targetCenterY = safeTop - (availableH / 2);
            var ref = referenceItem || obj, oB = pmFitBounds(ref), oW = Math.abs(oB[2] - oB[0]), oH = Math.abs(oB[1] - oB[3]);
            if (oW === 0 || oH === 0) return null;
            var scaleW = (availableW / oW) * 100, scaleH = (availableH / oH) * 100;
            obj.resize(scaleW, scaleH, true, true, true, true, 100, Transformation.CENTER);
            var nB = pmFitBounds(ref), nW = Math.abs(nB[2] - nB[0]), nH = Math.abs(nB[1] - nB[3]);
            obj.left += (targetCenterX - (nB[0] + nW / 2)); obj.top += (targetCenterY - (nB[1] - nH / 2));
            return { sw: scaleW, sh: scaleH };
        } catch (e) {}
        return null;
    }

    // The whole mockup design is stretched non-uniformly (width vs height) to
    // fill the pattern panel, which blows up personalized names/numbers. This
    // restores the mockup proportion on just the replaced text frames: force a
    // uniform scale equal to the width factor, keeping each frame centered
    // where the stretch placed it.
    function normalizePersonalizedText(container, scaleInfo) {
        if (!scaleInfo || !scaleInfo.sw || !scaleInfo.sh) return;
        var k = scaleInfo.sw / scaleInfo.sh;
        if (Math.abs(k - 1) < 0.01) return;
        function recurse(c) {
            if (c.textFrames) {
                for (var i = 0; i < c.textFrames.length; i++) {
                    var tf = c.textFrames[i];
                    var note = (tf.note || "");
                    if (note.indexOf("PERS_TEXT") !== 0) continue;
                    try {
                        var pre = tf.visibleBounds;
                        tf.resize(100, k * 100, true, true, true, true, 100, Transformation.CENTER);
                        // Same edge-anchoring as the fit-to-mockup shrink: the
                        // height change must not grow the gap toward the
                        // nearest text above/below.
                        if (note === "PERS_TEXT_ABOVE" || note === "PERS_TEXT_BELOW") {
                            var post = tf.visibleBounds;
                            if (note === "PERS_TEXT_ABOVE") tf.top += pre[1] - post[1];
                            else tf.top += pre[3] - post[3];
                        }
                        log("Normalized personalized text '" + (tf.contents || "") + "' height to " + Math.round(k * 100) + "% (" + note + ").");
                    // PARM goes up to the panel rollback - see the note on the Merge Error catch.
                    } catch (eN) {
                        parmBail(eN, "normalising personalised text");
                        log("Text normalize error: " + eN.message);
                    }
                }
            }
            if (c.groupItems) for (var g = 0; g < c.groupItems.length; g++) recurse(c.groupItems[g]);
        }
        recurse(container);
    }

    // Personalization anchoring: reports whether the nearest LIVE text frame
    // that overlaps this frame HORIZONTALLY sits above or below it. That side's
    // edge is kept fixed while the frame shrinks/normalizes, so the mockup's
    // name<->number gap survives. Returns "above", "below" or null (no
    // qualifying neighbor -> caller keeps the old center behavior).
    function findVerticalNeighborSide(root, tf, tB) {
        var bestGap = -1, side = null;
        function scan(c) {
            if (c.textFrames) {
                for (var i = 0; i < c.textFrames.length; i++) {
                    var other = c.textFrames[i];
                    if (other === tf) continue;
                    try { if (other.hidden) continue; } catch (eH) {}
                    var oB;
                    try { oB = other.visibleBounds; } catch (eB) { continue; }
                    if (oB[2] < tB[0] || oB[0] > tB[2]) continue;
                    if (oB[3] >= tB[1]) {
                        var gapA = oB[3] - tB[1];
                        if (bestGap < 0 || gapA < bestGap) { bestGap = gapA; side = "above"; }
                    } else if (oB[1] <= tB[3]) {
                        var gapB = tB[3] - oB[1];
                        if (bestGap < 0 || gapB < bestGap) { bestGap = gapB; side = "below"; }
                    }
                }
            }
            if (c.groupItems) for (var g = 0; g < c.groupItems.length; g++) scan(c.groupItems[g]);
        }
        scan(root);
        return side;
    }

    function findPlacementPath(container, useFirstFound) {
        if (!container) return null;
        if (container.typename === "PathItem" || container.typename === "CompoundPathItem") return container;
        // Design reference: prefer the path NAMED 'base-path' (the mockup's
        // garment shape). releaseInternalClippingMasks sends released clip
        // paths to the BACK of their group, so "first path in z-order" can
        // land on a small artwork path and blow the whole design up to
        // panel size. Name lookup is z-order-proof.
        if (useFirstFound) {
            var namedBase = null;
            function findNamed(items) {
                if (!items) return false;
                for (var j = 0; j < items.length; j++) {
                    var nm = "";
                    try { nm = (items[j].name || "").toLowerCase().replace(/[^a-z0-9]/g, ""); } catch (eNm) {}
                    if (nm === "basepath" && (items[j].typename === "PathItem" || items[j].typename === "CompoundPathItem")) { namedBase = items[j]; return true; }
                    if (items[j].typename === "GroupItem" && findNamed(items[j].pageItems)) return true;
                }
                return false;
            }
            findNamed(container.pageItems);
            if (namedBase) { log("Placement reference: found path named '" + namedBase.name + "'."); return namedBase; }
        }
        var found = null, maxArea = -1;
        function search(items) {
            if (!items) return false;
            for (var i = 0; i < items.length; i++) {
                if (items[i].typename === "PathItem" || items[i].typename === "CompoundPathItem") {
                    if ((items[i].name || "").toLowerCase().indexOf("logo") !== -1) continue;
                    if (useFirstFound) { found = items[i]; return true; }
                    // Default: pick the LARGEST path. The first path can be a tiny
                    // notch/guide mark (e.g. sleeve notch), which would make the
                    // whole design scale into a few points and vanish.
                    var area = 0;
                    try { area = Math.abs(items[i].width * items[i].height); } catch(eAr) {}
                    if (area > maxArea) { maxArea = area; found = items[i]; }
                } else if (items[i].typename === "GroupItem") if (search(items[i].pageItems)) return true;
            }
            return false;
        }
        search(container.pageItems); return found;
    }

    // Multi-piece parts (e.g. Placket's two parallel strips, or Patti's two
    // button-band strips) have MORE THAN ONE placement-path-sized shape in
    // the pattern, but findPlacementPath only ever returns one (the largest)
    // as baseShape. Any other shape with a comparable footprint is treated
    // as "another piece of the same panel" and gets the same base color -
    // small trims/notches (well under the threshold) are left untouched.
    function fillSiblingPlacementPaths(container, exclude, color) {
        var filled = 0, exArea = 0;
        try { exArea = Math.abs(exclude.width * exclude.height); } catch (eA) {}
        if (exArea <= 0) return 0;
        function walk(items) {
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (it === exclude) continue;
                if (it.typename === "PathItem" || it.typename === "CompoundPathItem") {
                    if ((it.name || "").toLowerCase().indexOf("logo") !== -1) continue;
                    var area = 0;
                    try { area = Math.abs(it.width * it.height); } catch (eA2) {}
                    if (area >= exArea * 0.3) {
                        try { it.fillColor = color; it.filled = true; filled++; } catch (eF) {}
                    }
                } else if (it.typename === "GroupItem") {
                    walk(it.pageItems);
                }
            }
        }
        walk(container.pageItems);
        return filled;
    }

    // SIDE-PANEL UNDERARM FIX: pattern grading grows garment height mostly
    // ABOVE the armhole, but alignAndScale stretches the design evenly, so
    // side-seam artwork (e.g. red side panels) lands too high on big sizes.
    // The panel's true underarm and the design's own underarm are both read
    // from live path anchors at runtime - no inches are hardcoded, so every
    // customer pattern with set-in sleeves self-calibrates. Panels where the
    // underarm cannot be detected confidently are skipped with a warning so
    // a human can check that print.

    function _uaAnchors(path) {
        // Compound paths: the outline is the largest child; inner holes
        // would pollute the trace.
        var p = path;
        if (path.typename === "CompoundPathItem") {
            var bA = -1; p = null;
            for (var c = 0; c < path.pathItems.length; c++) {
                var a = 0;
                try { a = Math.abs(path.pathItems[c].width * path.pathItems[c].height); } catch (eA) {}
                if (a > bA) { bA = a; p = path.pathItems[c]; }
            }
        }
        var arr = [];
        try {
            var pts = p.pathPoints;
            for (var i = 0; i < pts.length; i++) arr.push([pts[i].anchor[0], pts[i].anchor[1]]);
        } catch (e) {}
        return arr;
    }

    // Walks the outline up from the hem corner on one side until the path
    // turns sharply inward - that turn is the underarm (side seam ends,
    // armhole begins). Works on straight, tapered and flared panels.
    // side: +1 = right edge, -1 = left edge. Returns [x, y] or null.
    function _uaWalkUp(anchors, side, W, H, ymin) {
        var n = anchors.length;
        if (n < 4) return null;
        var hem = -1, bestV = -1e12;
        for (var i = 0; i < n; i++) {
            if (anchors[i][1] <= ymin + 0.15 * H) {
                var v = side * anchors[i][0];
                if (v > bestV) { bestV = v; hem = i; }
            }
        }
        if (hem < 0) return null;
        var fwd = anchors[(hem + 1) % n], bwd = anchors[(hem - 1 + n) % n];
        var dir = (fwd[1] >= bwd[1]) ? 1 : -1;
        var cur = hem;
        for (var s = 0; s < n; s++) {
            var nxt = (cur + dir + n) % n;
            var c = anchors[cur], x2 = anchors[nxt];
            var dy = x2[1] - c[1];
            var dxIn = side * (c[0] - x2[0]);
            if (s > 0) {
                if (dy <= 0) return c;
                if (dxIn > 0.05 * W && dxIn > 0.35 * dy) return c;
            }
            cur = nxt;
        }
        return null;
    }

    // Mirror of _uaWalkUp: walks the outline DOWN from the shoulder/neck
    // band on one side until it turns sharply inward - that turn is the
    // shoulder-to-armhole (or shoulder-to-cap, on a sleeve) corner. side:
    // +1 = right edge, -1 = left edge. Returns [x, y] or null. Used by
    // SLEEVE-MATCH (_smFindCorners) to give every panel a TOP corner
    // alongside the existing bottom/underarm one.
    function _uaWalkDown(anchors, side, W, H, ymax) {
        var n = anchors.length;
        if (n < 4) return null;
        var top = -1, bestV = -1e12;
        for (var i = 0; i < n; i++) {
            if (anchors[i][1] >= ymax - 0.15 * H) {
                var v = side * anchors[i][0];
                if (v > bestV) { bestV = v; top = i; }
            }
        }
        if (top < 0) return null;
        var fwd = anchors[(top + 1) % n], bwd = anchors[(top - 1 + n) % n];
        var dir = (fwd[1] <= bwd[1]) ? 1 : -1; // walk toward descending y
        var cur = top;
        for (var s = 0; s < n; s++) {
            var nxt = (cur + dir + n) % n;
            var c = anchors[cur], x2 = anchors[nxt];
            var dy = c[1] - x2[1]; // positive while still descending
            var dxIn = side * (c[0] - x2[0]);
            if (s > 0) {
                if (dy <= 0) return c;
                if (dxIn > 0.05 * W && dxIn > 0.35 * dy) return c;
            }
            cur = nxt;
        }
        return null;
    }

    // The hem corner on one side: the outermost anchor within the bottom 15%
    // of the outline - the exact point _uaWalkUp starts its climb from,
    // factored out so it can also be asked for on its own. A panel whose
    // underarm came from the widest-point fallback still needs this origin,
    // and so does a front half that is taking Back's side-seam length.
    // side: +1 = right edge, -1 = left edge. Returns y, or null.
    function _uaHemY(anchors, side, H, ymin) {
        var hem = -1, bestV = -1e12;
        for (var i = 0; i < anchors.length; i++) {
            if (anchors[i][1] <= ymin + 0.15 * H) {
                var v = side * anchors[i][0];
                if (v > bestV) { bestV = v; hem = i; }
            }
        }
        if (hem < 0) return null;
        return anchors[hem][1];
    }

    // Path-level wrapper: the hem corner on ONE named side plus the bbox the
    // 15% band was taken from. For callers that only need the origin (a front
    // half applying Back's side-seam length) and cannot run the full detect.
    // side: "left" | "right". Returns { y, H, bottom, top } or null.
    function _uaHemInfo(path, side) {
        var anchors = _uaAnchors(path);
        if (anchors.length < 4) return null;
        var ymin = 1e12, ymax = -1e12;
        for (var i = 0; i < anchors.length; i++) {
            if (anchors[i][1] < ymin) ymin = anchors[i][1];
            if (anchors[i][1] > ymax) ymax = anchors[i][1];
        }
        var H = ymax - ymin;
        if (H <= 0) return null;
        var s = 1;
        if (side === "left") s = -1;
        var hy = _uaHemY(anchors, s, H, ymin);
        if (hy === null) return null;
        return { y: hy, H: H, bottom: ymin, top: ymax };
    }

    // Average side-seam length (hem corner -> underarm) of a findUnderarmY
    // result, using whichever sides could be measured. Null if neither could.
    function _uaSeamLen(u) {
        if (!u) return null;
        if (u.seamL !== null && u.seamR !== null) return (u.seamL + u.seamR) / 2;
        if (u.seamL !== null) return u.seamL;
        if (u.seamR !== null) return u.seamR;
        return null;
    }

    // Locates the underarm height of a garment panel/silhouette path.
    // Two independent estimators, tried in order:
    //   1. CORNER TRACE (_uaWalkUp) - authoritative. Walks the outline up
    //      from each hem corner to the first sharp inward turn. Both sides
    //      must be traceable, land at the same height (patterns are
    //      symmetric) and sit at a plausible fraction of the panel height.
    //   2. WIDEST POINT - fallback. On a straight/tapered panel the top of
    //      the widest run IS the underarm: above it the armhole cuts inward.
    //      This was already measured here as the trace's cross-check; it is
    //      promoted to a real fallback because the trace walks straight PAST
    //      the underarm on the larger graded BACK pieces. Measured on job
    //      2b17c990: Small/Medium Back traced fine (69-70%), while
    //      Large/XL/2XL Back all overshot to 95% - i.e. up at the shoulder -
    //      and were skipped, so SIDE-PANEL FIX never ran on those sizes.
    // The fallback is deliberately held to the SAME symmetry and plausible-
    // height tests as the trace. A full-button front half therefore still
    // fails both (its two extreme-x edges are an armhole and a placket,
    // which can never agree on a height) and is skipped exactly as before,
    // rather than silently adopting a wrong Y. Front halves need Back's
    // measurement handed to them instead - a separate change.
    // Returns null when neither estimator is usable; the caller then skips.
    function findUnderarmY(path, label) {
        var anchors = _uaAnchors(path);
        if (anchors.length < 4) { log("UA-DETECT [" + label + "]: not enough anchor points."); return null; }
        var xmin = 1e12, xmax = -1e12, ymin = 1e12, ymax = -1e12;
        for (var i = 0; i < anchors.length; i++) {
            var a = anchors[i];
            if (a[0] < xmin) xmin = a[0];
            if (a[0] > xmax) xmax = a[0];
            if (a[1] < ymin) ymin = a[1];
            if (a[1] > ymax) ymax = a[1];
        }
        var W = xmax - xmin, H = ymax - ymin;
        if (W <= 0 || H <= 0) return null;

        // Widest-point estimate, taken up front so the cross-check below and
        // the fallback share the one measurement.
        var tol = 0.02 * W, wL = null, wR = null;
        for (var k = 0; k < anchors.length; k++) {
            var p = anchors[k];
            if (p[0] >= xmax - tol && (wR === null || p[1] > wR)) wR = p[1];
            if (p[0] <= xmin + tol && (wL === null || p[1] > wL)) wL = p[1];
        }
        var wY = null;
        if (wL !== null && wR !== null && Math.abs(wL - wR) <= 0.025 * H) {
            var wFrac = (((wL + wR) / 2) - ymin) / H;
            if (wFrac >= 0.35 && wFrac <= 0.9) wY = (wL + wR) / 2;
        }

        // Hem corners, for the side-seam length a front half will borrow.
        // Taken from the same anchor set whichever estimator wins below.
        var hemL = _uaHemY(anchors, -1, H, ymin);
        var hemR = _uaHemY(anchors, 1, H, ymin);

        function found(y, how) {
            log("UA-DETECT [" + label + "]: underarm found " + Math.round(((y - ymin) / H) * 100) + "% up the panel (" + how + ").");
            var sL = null, sR = null;
            if (hemL !== null) sL = y - hemL;
            if (hemR !== null) sR = y - hemR;
            return { y: y, W: W, H: H, top: ymax, bottom: ymin, hemL: hemL, hemR: hemR, seamL: sL, seamR: sR };
        }
        function fallback(why) {
            if (wY === null) {
                log("UA-DETECT [" + label + "]: WARNING - " + why + ", and the widest-point fallback is unusable too. Skipping shift - check this panel manually.");
                return null;
            }
            log("UA-DETECT [" + label + "]: " + why + " - using the widest-point fallback instead.");
            return found(wY, "widest-point fallback");
        }

        var L = _uaWalkUp(anchors, -1, W, H, ymin);
        var R = _uaWalkUp(anchors, 1, W, H, ymin);
        if (!L || !R) return fallback("could not trace a side seam (raglan/unusual cut?)");
        if (Math.abs(L[1] - R[1]) > 0.025 * H) return fallback("left/right traced underarms differ (" + Math.round(Math.abs(L[1] - R[1])) + "pt)");
        var y = (L[1] + R[1]) / 2;
        var frac = (y - ymin) / H;
        if (frac < 0.35 || frac > 0.9) return fallback("corner trace landed at " + Math.round(frac * 100) + "% up the panel, outside the plausible 35-90% band");
        // Cross-check: on straight/tapered panels the widest point sits at
        // the underarm too. Disagreement is not fatal (flared cuts), the
        // symmetric corner trace above is authoritative - but log it.
        var agree = (wL !== null && wR !== null && Math.abs(((wL + wR) / 2) - y) <= 0.025 * H);
        var how = "corner trace, confirmed by widest-point check";
        if (!agree) how = "corner trace; widest-point check differs - flared cut?";
        return found(y, how);
    }

    // Auto-detects side-seam artwork (paths hugging the silhouette's left or
    // right edge whose vertical span CROSSES the design's underarm - side
    // panels may legitimately start above it, running along the armhole
    // curve) and re-anchors it to the panel's true underarm. Front/back only;
    // runs after alignAndScale and before removeBasePaths. Bottom overflow is
    // eaten later by the design_clip_group mask, and side seams stay flush
    // because the shift is purely vertical.
    function adjustSidePanelsToUnderarm(design, designBase, panelPath, partName, sizeLabel, scalePct) {
        try {
            var mm = 2.83465;
            function _mm(v) { return Math.round((Math.abs(v) / mm) * 10) / 10; }
            log("SIDE-PANEL FIX: locating underarm on panel and design...");
            var pUA = findUnderarmY(panelPath, "panel");
            var dUA = findUnderarmY(designBase, "design");
            var pY = null, dY = null, panelH = null;
            if (pUA && dUA) {
                pY = pUA.y; dY = dUA.y; panelH = pUA.H;
            } else {
                // BACK-DRIVEN fallback. Only a full-button front half gets here
                // on purpose: its placket edge is not a side seam, so its own
                // detection can never pass the left/right symmetry test. It
                // rebuilds both underarms from Back's cached side-seam length
                // (pmBackUnderarm), measured from ITS OWN hem corner on the
                // armhole side - the one edge that really is a side seam.
                // Lengths transfer, percentages do not: Back is ~2in taller
                // than Front on this pattern.
                var armSide = null;
                if (isFrontLeft(partName)) armSide = "left";
                else if (isFrontRight(partName)) armSide = "right";
                var rec = (sizeLabel && pmBackUnderarm[sizeLabel]) ? pmBackUnderarm[sizeLabel] : null;
                if (!armSide) { log("SIDE-PANEL FIX: underarm not measurable on this panel and it is not a full-button front half - skipped."); return; }
                if (!rec) { log("SIDE-PANEL FIX [" + partName + "]: no Back side-seam length cached for size '" + sizeLabel + "' - skipped."); return; }
                if (!scalePct || scalePct <= 0) { log("SIDE-PANEL FIX [" + partName + "]: design scale % unknown, cannot convert Back's design seam length - skipped."); return; }
                var pInfo = _uaHemInfo(panelPath, armSide);
                var dInfo = _uaHemInfo(designBase, armSide);
                if (!pInfo || !dInfo) { log("SIDE-PANEL FIX [" + partName + "]: could not locate the " + armSide + " hem corner on panel/design - skipped."); return; }
                pY = pInfo.y + rec.panelSeam;
                dY = dInfo.y + rec.designSeam * (scalePct / 100);
                panelH = pInfo.H;
                log("SIDE-PANEL FIX [" + partName + "]: own underarm not measurable (placket edge) - rebuilt from Back's side-seam length off the " + armSide + " hem corner: panel " + _mm(rec.panelSeam) + "mm, design " + _mm(rec.designSeam * (scalePct / 100)) + "mm at " + (Math.round(scalePct * 10) / 10) + "%.");
            }
            var delta = dY - pY; // >0: design underarm sits too high -> move side art DOWN
            log("SIDE-PANEL FIX: design underarm is " + _mm(delta) + "mm " + (delta >= 0 ? "above" : "below") + " the true underarm.");
            if (Math.abs(delta) < 1 * mm) { log("SIDE-PANEL FIX: within 1mm - nothing to move."); return; }
            if (Math.abs(delta) > 0.15 * panelH) { log("SIDE-PANEL FIX: WARNING - required shift exceeds 15% of panel height. Skipping - check this panel manually."); return; }

            // Reference frame = the design's garment silhouette (base-path):
            // its edges ARE the side seams - except a full-button half's
            // placket edge, excluded below (same convention as pmSeamX:
            // Front-Left's placket is its RIGHT edge).
            var rB = designBase.visibleBounds;
            var rW = Math.abs(rB[2] - rB[0]), rH = Math.abs(rB[1] - rB[3]);
            var placketSide = null;
            if (isFrontLeft(partName)) placketSide = "right";
            else if (isFrontRight(partName)) placketSide = "left";
            var moved = 0;
            function hunt(container) {
                for (var i = 0; i < container.pageItems.length; i++) {
                    var it = container.pageItems[i];
                    var t = it.typename;
                    if (t === "GroupItem") { hunt(it); continue; }
                    if (t !== "PathItem" && t !== "CompoundPathItem") continue;
                    if (it === designBase) continue;
                    var nm = "";
                    try { nm = (it.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""); } catch (eN) {}
                    if (nm === "basepath") continue;
                    var b;
                    try { b = it.visibleBounds; } catch (eB) { continue; }
                    var w = Math.abs(b[2] - b[0]), h = Math.abs(b[1] - b[3]);
                    var hugsLeft = b[0] <= rB[0] + 0.04 * rW;
                    var hugsRight = b[2] >= rB[2] - 0.04 * rW;
                    // A full-button half is sewn to its twin down the placket,
                    // and that edge is NOT a side seam - artwork hugging it must
                    // never be re-anchored. Same guard anchorSideGraphicsToSeam
                    // already carries; it only started mattering here once the
                    // back-driven fallback let front halves reach this code at
                    // all. Without it the "J&S Sports" swoosh - which runs to
                    // the design's placket edge and crosses the underarm height
                    // - was dragged down 11.2mm along with the real side panel
                    // (seen on XL Front-Left in the uatest-20260819 run).
                    if (placketSide === "right") hugsRight = false;
                    else if (placketSide === "left") hugsLeft = false;
                    // spans the underarm: top at/above it, bottom at/below it
                    var spansUA = (b[1] >= dY - 0.06 * rH) && (b[3] <= dY + 0.06 * rH);
                    if ((hugsLeft || hugsRight) && spansUA && h >= 0.10 * rH && h <= 0.85 * rH && w <= 0.45 * rW) {
                        try {
                            it.top = it.top - delta;
                            moved++;
                            log("SIDE-PANEL FIX: re-anchored '" + (it.name || t) + "' (" + (hugsLeft ? "left" : "right") + " seam) " + (delta >= 0 ? "down" : "up") + " " + _mm(delta) + "mm.");
                        // PARM goes up to the panel rollback - see the note on the Merge Error catch.
                        } catch (eM) {
                            parmBail(eM, "the SIDE-PANEL FIX");
                            log("SIDE-PANEL FIX: move failed for '" + (it.name || t) + "': " + eM.message);
                        }
                    }
                }
            }
            hunt(design);
            if (moved === 0) log("SIDE-PANEL FIX: no side-seam artwork found at the underarm - nothing to adjust.");
            else log("SIDE-PANEL FIX: " + moved + " item(s) re-anchored to the true underarm.");
        // PARM goes up to the panel rollback - see the note on the Merge Error catch.
        } catch (e) {
            parmBail(e, "the SIDE-PANEL FIX");
            log("SIDE-PANEL FIX error: " + e.message);
        }
    }

    // ============ DESIGNER TAGS (shared by SIDE-ANCHOR and SHOULDER-ANCHOR) ============
    // Both features identify their artwork by a short word the designer writes,
    // and both look in the SAME two places, in this order:
    //   1. the layer/object NAME - the obvious place, and all a plain piece
    //      ever needs;
    //   2. Illustrator's Attributes-panel NOTE - the fallback for a piece whose
    //      NAME is already load-bearing for another feature. The case that
    //      forces this is SLEEVE-MATCH: it pairs a body unit to its sleeve unit
    //      by exact normalized NAME ("unit 1" <-> "unit 1"), so a band that is
    //      both an armhole-match unit AND a shoulder band cannot be renamed
    //      "shoulder" without silently breaking that pairing. The note is free,
    //      so it carries the marking instead.
    // One consequence worth knowing: because the two channels are read
    // independently, a single piece can carry BOTH markings - name "side",
    // note "shoulder" - and both features will act on it (different axes:
    // SIDE-ANCHOR moves sideways, SHOULDER-ANCHOR rotates, and SIDE-ANCHOR
    // runs first).
    // Matching is case/space/punctuation-insensitive and the regex is ANCHORED
    // on purpose: the mockup also carries "Front side match"/"Back side match"
    // groups for SIDE-SEAM MATCH, and those must never be caught here.
    // Returns the normalized tag that matched, or null.
    function _tagOf(item, re) {
        var s = "";
        try { s = (item.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""); } catch (eN) {}
        if (re.test(s)) return s;
        try { s = (item.note || "").toLowerCase().replace(/[^a-z0-9]/g, ""); } catch (eT) {}
        if (re.test(s)) return s;
        return null;
    }

    // SIDE-ANCHOR (front/back only, opt-in via design_scale_mode =
    // "height_sides"). A height-driven scale preserves the design's aspect
    // ratio, so on a graded panel the design's silhouette ends up narrower
    // than the panel and is then CENTERED - artwork that sat right on a side
    // seam in the mockup drifts inward and prints in the middle of the panel.
    // Anything the designer named "side" is moved back onto its own seam by
    // exactly the gap the uniform scale left behind:
    //     left seam  -> dx = panelLeft  - designSilhouetteLeft
    //     right seam -> dx = panelRight - designSilhouetteRight
    // Nothing is hardcoded: the correction is whatever that gap measures on
    // this size, and it reverses sign by itself if the design happens to be
    // WIDER than the panel. Horizontal only - vertical placement stays
    // whatever adjustSidePanelsToUnderarm decided - and no resize: the piece
    // keeps the size the uniform scale gave it, like the rest of the design.
    //
    // NAMING (case-insensitive, spaces/punctuation ignored): "side" on each
    // seam is enough - the seam is detected from where the piece sits in the
    // mockup. "side left"/"side right" (or "left side"/"right side") force a
    // seam instead, and any of them may be numbered ("side 1", "side 2") so a
    // panel can carry as many as it needs. Read from the NAME first and from
    // the Attributes-panel NOTE only when the name does not match - see
    // _tagOf above for why the note channel exists (a SLEEVE-MATCH "unit 1"
    // cannot be renamed). The pattern is anchored on purpose: the mockup
    // already carries "Front side match"/"Back side match" groups for
    // SIDE-SEAM MATCH, and those must never be caught by this.
    function anchorSideGraphicsToSeam(design, designBase, panelPath, partName, sizeLabel) {
        try {
            var mm = 2.83465;
            // Declared here, not at file scope: this runs from the main flow,
            // which is ABOVE all these helpers - a file-scope `var` would still
            // be undefined at that point (same hoisting rule as patternSizeCache).
            var SIDE_TAG = /^(side(left|right)?|(left|right)side)[0-9]*$/;
            var tag = "SIDE-ANCHOR [" + sizeLabel + " " + partName + "]";
            function mmOf(pt) { return Math.round((Math.abs(pt) / mm) * 10) / 10; }

            var rB = designBase.visibleBounds;  // design's own silhouette [L,T,R,B]
            var pB = panelPath.visibleBounds;   // the pattern panel it was fitted onto
            var rW = Math.abs(rB[2] - rB[0]), pW = Math.abs(pB[2] - pB[0]);
            if (rW <= 0 || pW <= 0) { log(tag + ": silhouette or panel has zero width - skipped."); return; }

            var dxLeft = pB[0] - rB[0];
            var dxRight = pB[2] - rB[2];
            var near = 0.10 * rW;   // how close to the silhouette edge counts as "on the seam"

            // A full-button half is sewn to its twin down the placket, and that
            // edge is NOT a side seam - it must never move. Same convention
            // pmSeamX already owns: Front-Left's placket is its RIGHT edge.
            var placketSide = null;
            if (isFrontLeft(partName)) placketSide = "right";
            else if (isFrontRight(partName)) placketSide = "left";

            var found = 0, moved = 0;

            function anchorOne(it, nm) {
                var label = it.name;
                if (!label) label = it.typename;
                var b;
                try { b = it.visibleBounds; } catch (eB) { log(tag + ": could not measure '" + label + "' - left as is."); return; }
                var gapL = Math.abs(b[0] - rB[0]), gapR = Math.abs(rB[2] - b[2]);

                // An explicit left/right in the name always wins over geometry.
                var seam = null;
                if (nm.indexOf("left") !== -1) seam = "left";
                else if (nm.indexOf("right") !== -1) seam = "right";
                else if (gapL <= near && gapR <= near) {
                    log(tag + ": '" + label + "' touches BOTH seams - a move cannot fix that (it would need stretching). Left as is, check this panel manually.");
                    return;
                } else if (gapL <= near || gapR <= near) {
                    if (gapL <= gapR) seam = "left"; else seam = "right";
                } else {
                    log(tag + ": '" + label + "' is not on either seam in the mockup (nearest edge is " + mmOf(Math.min(gapL, gapR)) + "mm away) - left as is, check its name or its position.");
                    return;
                }

                if (placketSide !== null && seam === placketSide) {
                    log(tag + ": '" + label + "' sits on the placket edge, not a side seam - left as is.");
                    return;
                }

                var dx;
                if (seam === "left") dx = dxLeft; else dx = dxRight;
                if (Math.abs(dx) < 1 * mm) { log(tag + ": '" + label + "' is already within 1mm of the " + seam + " seam - nothing to move."); return; }
                if (Math.abs(dx) > 0.15 * pW) { log(tag + ": WARNING - '" + label + "' would need a " + mmOf(dx) + "mm shift, more than 15% of the panel width. Skipped - check this panel manually."); return; }
                try {
                    // Relative move on purpose: adding a delta never depends on
                    // which bounds `.left` is measured from.
                    it.left = it.left + dx;
                    moved++;
                    var dir = "right";
                    if (dx < 0) dir = "left";
                    log(tag + ": '" + label + "' moved " + mmOf(dx) + "mm " + dir + " onto the " + seam + " seam.");
                } catch (eM) { log(tag + ": move failed for '" + label + "': " + eM.message); }
            }

            function hunt(container) {
                for (var i = 0; i < container.pageItems.length; i++) {
                    var it = container.pageItems[i];
                    var nm = _tagOf(it, SIDE_TAG);
                    if (nm) {
                        // A tagged GROUP moves as ONE unit - deliberately no
                        // recursion into it, so its pieces keep their arrangement.
                        found++;
                        anchorOne(it, nm);
                        continue;
                    }
                    if (it.typename === "GroupItem") hunt(it);
                }
            }

            hunt(design);
            if (found === 0) log(tag + ": no artwork named or noted 'side' in this design - nothing to anchor.");
            else log(tag + ": " + moved + " of " + found + " 'side' item(s) anchored to their seam.");
        // PARM goes up to the panel rollback - see the note on the Merge Error catch.
        } catch (e) {
            parmBail(e, "the SIDE-ANCHOR step");
            log("SIDE-ANCHOR error: " + e.message);
        }
    }

    // ============ SHOULDER-ANCHOR ============
    // Rotates shoulder-band artwork onto the panel's OWN shoulder line.
    //
    // WHY. The mockup is drawn once, on one size's proportions, and the design
    // is only ever uniformly scaled - and a uniform scale preserves angles. The
    // pattern's shoulder slope does NOT stay put: measured across this job's
    // renders it flattens 14.84deg (Small) -> 12.95 (Large) -> 11.20 (2XL) while
    // the mockup's band sits at ~14.8deg on every size. Small therefore matches
    // to within 0.03deg and needs nothing; every size above it opens a wedge of
    // bare panel above the band - 1.4mm at the armhole on Small, 6.6mm on
    // Large, 13.8mm on 2XL - tapering back to ~1.4mm at the neck on all of them.
    //
    // WHY NOT BLEED. Extending the band up into that wedge fills the black but
    // leaves the band TAPERED: 56.4mm at the armhole against 44.0mm at the neck
    // on 2XL. Only rotation gives back a constant width. Nor can the mockup be
    // redrawn to fix it - one drawing carries one angle, and the pattern wants
    // a different angle per size.
    //
    // NAMING - the name FIRST, then the note. Accepted either way, case/space/
    // punctuation-insensitive: "shoulder", "shoulder left", "right shoulder",
    // optionally numbered ("shoulder 2"). A plain shoulder band just carries
    // the NAME, like every other feature in this file.
    // The note fallback exists for the band that is ALSO a SLEEVE-MATCH unit:
    // there the band is called "unit 1", and that name is load-bearing -
    // SLEEVE-MATCH pairs body and sleeve units by exact normalized NAME
    // (_smTargetFor / byName), so renaming it "shoulder" would silently break
    // the pairing unless every sleeve were renamed in lockstep. The note is
    // free, so it carries the shoulder marking instead. See _tagOf above.
    //
    // ORDER. Runs immediately after SIDE-ANCHOR, i.e. BEFORE SLEEVE-MATCH - so
    // SLEEVE-MATCH measures the band where it ENDS UP and carries the new
    // armhole distance out to the sleeve by itself. That is precisely why the
    // pivot does not have to be the armhole end, and it is not: pivoting on
    // whichever end already sits tightest against the cut edge leaves the gap
    // uniform at that tight value with no extra translation, reproducing what
    // Small does naturally.

    // Every closed sub-outline of an item as its own anchor ring, walking into
    // groups. Deliberately NOT _uaAnchors: that keeps only a compound path's
    // largest child (inner holes would pollute an underarm trace), whereas the
    // top silhouette of a band can come from any ring.
    function _saRings(item, out) {
        if (!out) out = [];
        try {
            var t = item.typename;
            if (t === "GroupItem") {
                for (var g = 0; g < item.pageItems.length; g++) _saRings(item.pageItems[g], out);
                return out;
            }
            if (t === "CompoundPathItem") {
                for (var c = 0; c < item.pathItems.length; c++) _saRings(item.pathItems[c], out);
                return out;
            }
            if (t !== "PathItem") return out;
            var pts = item.pathPoints, ring = [];
            for (var i = 0; i < pts.length; i++) ring.push([pts[i].anchor[0], pts[i].anchor[1]]);
            if (ring.length >= 2) out.push(ring);
        } catch (e) {}
        return out;
    }

    // Highest outline y where the vertical line X crosses any ring. Anchor-only
    // (bezier handles ignored) - accurate enough here because both the panel's
    // shoulder edge and a straight-sided band are effectively polygonal along
    // this stretch. Returns null when no ring spans x.
    function _saTopYAt(rings, x) {
        var best = null;
        for (var r = 0; r < rings.length; r++) {
            var ring = rings[r], n = ring.length;
            for (var i = 0; i < n; i++) {
                var a = ring[i], b = ring[(i + 1) % n];
                var lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
                if (x < lo || x > hi) continue;
                var y;
                if (b[0] === a[0]) y = Math.max(a[1], b[1]);
                else y = a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0]));
                if (best === null || y > best) best = y;
            }
        }
        return best;
    }

    // Least-squares slope of column `col` of the samples against x (column 0).
    // Returns null on fewer than 2 samples or a degenerate x spread.
    function _saSlope(samples, col) {
        var n = samples.length;
        if (n < 2) return null;
        var sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (var i = 0; i < n; i++) {
            sx += samples[i][0]; sy += samples[i][col];
            sxx += samples[i][0] * samples[i][0];
            sxy += samples[i][0] * samples[i][col];
        }
        var den = n * sxx - sx * sx;
        if (Math.abs(den) < 1e-9) return null;
        return (n * sxy - sx * sy) / den;
    }

    // Measures the gap between the panel's shoulder cut edge and the band's top
    // edge at up to SA_SAMPLES points across the band, skipping any that land
    // somewhere implausible (past the neckline, or the band already poking out
    // above the panel). Returns surviving [x, gap, bandTopY] triples - the
    // band's own height is kept because the rotation needs BOTH edge angles,
    // not just how fast the gap between them changes (see turnOne).
    function _saSampleGaps(panelRings, bandRings, bandBox, bandH) {
        var out = [];
        var x0 = bandBox[0], x1 = bandBox[2];
        var span = x1 - x0;
        if (span <= 0) return out;
        var SA_SAMPLES = 5;
        // 0.30..0.70 of the band, never its very ends: the outer end runs into
        // the armhole curve and the inner end into the neckline, where the
        // panel's top edge is no longer the shoulder seam.
        //
        // SYMMETRIC ABOUT THE BAND'S CENTRE, and that matters. The window used
        // to be 0.10..0.70 - same 60% span, but 10% clearance on the left and
        // 30% on the right. The sampling walks x left-to-right in absolute
        // page coordinates, so on Back's two bands (mirror twins, verified
        // identical: both 83.03mm thick, 332.25mm long, at +3.96deg/-3.96deg)
        // that window covered MIRROR-OPPOSITE physical stretches - neck-to-mid
        // on one, mid-to-armhole on the other. The gap tapers along the band,
        // so each side found a different minimum, pivoted at a different place
        // and settled at a different residual: 1.6mm of bare panel above one
        // shoulder against 0.4mm above the other, which reads as one shoulder
        // sitting low. Same artwork, same panel - only the sample window was
        // lopsided.
        // 30% clearance at BOTH ends: symmetric, and never closer to either end
        // than the old window already came, so nothing that was avoided before
        // is sampled now.
        for (var i = 0; i < SA_SAMPLES; i++) {
            var x = x0 + span * (0.30 + 0.40 * (i / (SA_SAMPLES - 1)));
            var pTop = _saTopYAt(panelRings, x);
            var bTop = _saTopYAt(bandRings, x);
            if (pTop === null || bTop === null) continue;
            var gap = pTop - bTop;
            if (gap < -2 * 2.83465) continue;      // band already above the cut edge
            if (gap > 0.9 * bandH) continue;       // that is not the shoulder edge
            out.push([x, gap, bTop]);
        }
        return out;
    }

    function anchorShoulderBandsToPanel(design, designBase, panelPath, partName, sizeLabel) {
        try {
            var mm = 2.83465;
            var SHOULDER_TAG = /^(shoulder(left|right)?|(left|right)shoulder)[0-9]*$/;
            var tag = "SHOULDER-ANCHOR [" + sizeLabel + " " + partName + "]";
            function mmOf(pt) { return Math.round((pt / mm) * 10) / 10; }

            var panelRings = _saRings(panelPath);
            if (panelRings.length === 0) { log(tag + ": panel has no traceable outline - skipped."); return; }

            var found = 0, turned = 0;

            function turnOne(band, note) {
                var label = band.name;
                if (!label) label = band.typename;
                var bb;
                try { bb = band.visibleBounds; } catch (eB) { log(tag + ": could not measure '" + label + "' - left as is."); return; }
                var bandH = Math.abs(bb[1] - bb[3]);
                if (bandH <= 0) { log(tag + ": '" + label + "' has zero height - left as is."); return; }

                var samples = _saSampleGaps(panelRings, _saRings(band), bb, bandH);
                if (samples.length < 2) { log(tag + ": '" + label + "' - could not read the panel's shoulder edge above it (" + samples.length + " usable sample(s)) - left as is."); return; }

                // Rotate by the difference of the two ANGLES, not by the angle
                // of the difference of their slopes - atan is not linear, and
                // the shortcut is wrong by a real amount: on this job's 2XL it
                // asks for 3.98deg where the band only needs 3.78deg, leaving
                // 0.5mm of taper behind. Recover both edges separately - the
                // band's own top from the samples, the panel's as band + gap.
                var sGap = _saSlope(samples, 1), sBand = _saSlope(samples, 2);
                if (sGap === null || sBand === null) { log(tag + ": '" + label + "' - gap samples were degenerate - left as is."); return; }
                var bandDeg = Math.atan(sBand) * 180 / Math.PI;
                var panelDeg = Math.atan(sBand + sGap) * 180 / Math.PI;
                // Illustrator rotates counter-clockwise on a positive angle
                // with y pointing up, so this difference is already signed the
                // way rotate() wants it.
                var deg = panelDeg - bandDeg;

                var gLo = samples[0][1], gHi = samples[0][1];
                for (var s = 1; s < samples.length; s++) {
                    if (samples[s][1] < gLo) gLo = samples[s][1];
                    if (samples[s][1] > gHi) gHi = samples[s][1];
                }
                log(tag + ": '" + label + "' gap above the band runs " + mmOf(gLo) + "mm..." + mmOf(gHi) + "mm over " + samples.length + " samples | band " + (Math.round(bandDeg * 100) / 100) + "deg vs panel shoulder " + (Math.round(panelDeg * 100) / 100) + "deg -> off by " + (Math.round(Math.abs(deg) * 100) / 100) + "deg.");

                if (Math.abs(deg) < 0.25) { log(tag + ": '" + label + "' is already within 0.25deg of the shoulder line - nothing to rotate."); return; }
                if (Math.abs(deg) > 15) { log(tag + ": WARNING - '" + label + "' would need a " + (Math.round(Math.abs(deg) * 10) / 10) + "deg rotation, far more than a grading difference. Skipped - check this panel manually."); return; }

                // Rotate about the band's own centre, then correct purely
                // vertically. Equivalent to rotating about an arbitrary pivot
                // for our purposes: the leftover horizontal slide is along the
                // band's own length, and both its ends are cut by the panel's
                // clipping mask anyway. Uses only rotate()/.top - no
                // transformation-matrix API, which keeps this on the same
                // well-worn calls as the rest of the script.
                // rotate() takes SIX arguments in this engine, and the sixth is
                // rotateAbout (a Transformation enum) - there is no
                // changeLineWidths slot, unlike resize() where a 100 sits in
                // that position. Passing resize()'s shape here threw
                // "Illegal argument - argument 6 - Enumerated value expected"
                // on every band of every size in job c5eed114, so the rotation
                // silently never happened. The retry keeps this working if a
                // different Illustrator build does want the 7-argument form.
                var didRotate = false;
                try {
                    band.rotate(deg, true, true, true, true, Transformation.CENTER);
                    didRotate = true;
                } catch (eR1) {
                    try { band.rotate(deg); didRotate = true; }
                    catch (eR2) { log(tag + ": rotate failed for '" + label + "': " + eR1.message); }
                }
                if (!didRotate) return;

                // Re-measure: the gap should now be flat. Bring it to the same
                // relationship the band has on the size the mockup was drawn
                // for - which is a small BLEED PAST the cut edge, not a gap
                // short of it. Measured on Small (the size this mockup is
                // drawn at, where the angles already match and no rotation
                // happens): the gap runs -1mm...-0.9mm, i.e. the band crosses
                // the cut line by about 1mm and the panel's clipping mask
                // trims it. That is what "sits against the cut edge" has to
                // mean here.
                //
                // Targeting gLo - the tightest gap the band happened to have
                // BEFORE rotation - does not reproduce that: gLo is only the
                // minimum inside the 0.30..0.70 sample window, and on a graded
                // size the gap tapers steeply across it (1.6mm..10.7mm on
                // 2XL). Aiming at 1.6mm left a 1.6mm ribbon of bare panel
                // above the band on every larger size, which prints as a dark
                // line along the shoulder. It also made the result depend on
                // the window: widening or narrowing the window moved the
                // finished band.
                //
                // So: never settle for a positive gap. Keep whatever bleed the
                // band already has if it is deeper than SA_BLEED (Math.min),
                // otherwise lift it until it bleeds by SA_BLEED. A bleed costs
                // nothing - the clipping mask removes the overshoot, the same
                // way it already trims both ends of every band.
                var SA_BLEED = -1 * mm; // band crosses the cut edge by 1mm, as on Small
                var bb2;
                try { bb2 = band.visibleBounds; } catch (eB2) { bb2 = bb; }
                var after = _saSampleGaps(panelRings, _saRings(band), bb2, bandH);
                if (after.length < 2) { log(tag + ": '" + label + "' rotated " + (Math.round(deg * 100) / 100) + "deg, but the gap could not be re-read afterwards - left at its rotated height, check this panel."); turned++; return; }
                var aLo = after[0][1], aHi = after[0][1], aSum = 0;
                for (var t2 = 0; t2 < after.length; t2++) {
                    if (after[t2][1] < aLo) aLo = after[t2][1];
                    if (after[t2][1] > aHi) aHi = after[t2][1];
                    aSum += after[t2][1];
                }
                var aMean = aSum / after.length;
                var saTarget = Math.min(gLo, SA_BLEED);
                var lift = aMean - saTarget; // >0: band sits too low now, move it up
                var lifted = false;
                if (Math.abs(lift) >= 1 * mm && Math.abs(lift) <= 0.9 * bandH) {
                    try { band.top = band.top + lift; lifted = true; } catch (eT) { log(tag + ": vertical correction failed for '" + label + "': " + eT.message); }
                }
                turned++;

                // Re-read AFTER the lift, not before it. Reporting the
                // post-rotation/pre-lift numbers made the log claim a 6.4mm gap
                // where the band had actually been brought back to ~1.5mm -
                // and the taper warning below was judging the wrong state too.
                var fLo = aLo, fHi = aHi;
                if (lifted) {
                    var bb3;
                    try { bb3 = band.visibleBounds; } catch (eB3) { bb3 = bb2; }
                    var fin = _saSampleGaps(panelRings, _saRings(band), bb3, bandH);
                    if (fin.length >= 2) {
                        fLo = fin[0][1]; fHi = fin[0][1];
                        for (var f2 = 1; f2 < fin.length; f2++) {
                            if (fin[f2][1] < fLo) fLo = fin[f2][1];
                            if (fin[f2][1] > fHi) fHi = fin[f2][1];
                        }
                    }
                }
                log(tag + ": '" + label + "' rotated " + (Math.round(deg * 100) / 100) + "deg" +
                    (lifted ? " and lifted " + mmOf(lift) + "mm" : "") +
                    " - gap is now " + mmOf(fLo) + "mm..." + mmOf(fHi) + "mm (was " + mmOf(gLo) + "mm..." + mmOf(gHi) + "mm).");
                if ((fHi - fLo) > (gHi - gLo)) log(tag + ": WARNING - '" + label + "' taper got WORSE. Check this panel manually.");
            }

            function hunt(container) {
                for (var i = 0; i < container.pageItems.length; i++) {
                    var it = container.pageItems[i];
                    var nt = _tagOf(it, SHOULDER_TAG);
                    if (nt) {
                        // A tagged GROUP turns as ONE unit - no recursion into
                        // it, so its pieces keep their arrangement.
                        found++;
                        turnOne(it, nt);
                        continue;
                    }
                    if (it.typename === "GroupItem") hunt(it);
                }
            }

            hunt(design);
            if (found === 0) log(tag + ": no artwork named or noted 'shoulder' in this design - nothing to rotate.");
            else log(tag + ": " + turned + " of " + found + " shoulder band(s) aligned to the panel's shoulder line.");
        // PARM goes up to the panel rollback - see the note on the Merge Error catch.
        } catch (e) {
            parmBail(e, "the SHOULDER-ANCHOR step");
            log("SHOULDER-ANCHOR error: " + e.message);
        }
    }

    // ============ SLEEVE-MATCH helpers (side <-> sleeve design matching) ============
    // Everything below is geometry-only and fully dynamic: no colors or
    // millimetres are hardcoded (naming IS required - see below). Designer
    // naming convention (case-insensitive, spaces/punctuation ignored):
    //   - A group called "armhole match" somewhere in the mockup's design
    //     (Front, Back and each Sleeve view all carry their own copy).
    //   - Inside it, each design piece to match is named "unit1"/"unit 1"/...
    //     when the SAME piece crosses both the left and right armhole/cap
    //     (the common case - a design that runs corner to corner), or
    //     "unit left 1"/"unit right 1" when the left and right sides carry
    //     genuinely different pieces (see _smCollectUnits below).
    //   - Numbers are just labels, not order: units are always paired
    //     body<->sleeve by GEOMETRIC position (nearest the relevant corner
    //     first - see _smSortByDistance), not by their name's digit.
    //
    // MEASUREMENT SCOPE (user-confirmed simplification): only the FRONT
    // panel's RIGHT armhole is ever measured. Front-Left, Back and every
    // sleeve's own left/right corners are assumed mirror-symmetric to it,
    // so the single measurement is reused everywhere - Back is never
    // opened for this, and the body's own left corner is never walked.
    //
    // D = the straight pen-tool distance from the -7mm seam corner to
    // where a unit stops covering the seam line, exactly as the customer
    // measures by hand. Two corners exist per side now (bottom/underarm -
    // the original one - and the mirrored top/shoulder one added below);
    // every unit independently uses whichever is closer.

    function smWarn(sizeLabel, partLabel, reason) {
        var msg = sizeLabel + " " + partLabel + ": " + reason;
        sleeveMatchWarnings.push(msg);
        log("SLEEVE-MATCH WARNING: " + msg);
    }

    function _smMM(pt) { return Math.round((pt / SM_MM) * 10) / 10; }

    function _smLargestChildPath(path) {
        if (path.typename === "GroupItem") {
            // named groups are measured by their largest filled member
            var best = null, gA = -1;
            for (var g = 0; g < path.pageItems.length; g++) {
                var cand = _smLargestChildPath(path.pageItems[g]);
                if (!cand) continue;
                var a2 = 0;
                try { a2 = Math.abs(cand.width * cand.height); } catch (eG) {}
                if (a2 > gA) { gA = a2; best = cand; }
            }
            return best;
        }
        var p = path;
        if (path.typename === "CompoundPathItem") {
            var bA = -1; p = null;
            for (var c = 0; c < path.pathItems.length; c++) {
                var a = 0;
                try { a = Math.abs(path.pathItems[c].width * path.pathItems[c].height); } catch (eA) {}
                if (a > bA) { bA = a; p = path.pathItems[c]; }
            }
        }
        return p;
    }

    // Samples ONE PathItem's outline INCLUDING its bezier curvature into a
    // closed polyline (the anchor-only trace in _uaAnchors is fine for
    // corners but far too coarse for arc-length measurement along a curved
    // armhole). Split out from _smSampleOutline below so a ribbon's two
    // rails (see _smIsRibbonUnit) can each be sampled on their own.
    function _smSamplePathItem(p, perSeg) {
        var out = [];
        if (!p) return out;
        var pts;
        try { pts = p.pathPoints; } catch (e) { return out; }
        var n = pts.length;
        if (n < 2) return out;
        for (var i = 0; i < n; i++) {
            var a = pts[i], b = pts[(i + 1) % n];
            var p0 = a.anchor, c1 = a.rightDirection, c2 = b.leftDirection, p1 = b.anchor;
            for (var s = 0; s < perSeg; s++) {
                var t = s / perSeg, mt = 1 - t;
                out.push([
                    mt * mt * mt * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p1[0],
                    mt * mt * mt * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p1[1]
                ]);
            }
        }
        return out;
    }

    function _smSampleOutline(path, perSeg) {
        return _smSamplePathItem(_smLargestChildPath(path), perSeg);
    }

    // RIBBON UNITS (SLEEVE-MATCH only): a "unit" that is itself a compound
    // path made of exactly 2 sub-paths is the classic Outline-Stroke/Expand
    // signature - a designer draws ONE line along the color-block boundary,
    // then expands its stroke into a filled shape for print, which turns it
    // into 2 parallel rails (the two edges of that line's stroke). For
    // these the customer's ask is: the visible white gap between the two
    // rails IS the design, so armhole matching should target THAT gap
    // directly instead of _smLargestChildPath's usual "pick the biggest
    // sub-path, ignore the rest" rule (which would silently throw away one
    // whole rail). Scoped to SLEEVE-MATCH only - every other matching
    // feature (CENTER_MATCH/PLACKET_MATCH/SIDE_SEAM_MATCH/etc) still goes
    // through the ordinary _smSampleOutline/_smLargestChildPath path above,
    // untouched.
    function _smIsRibbonUnit(item) {
        try { return item.typename === "CompoundPathItem" && item.pathItems.length === 2; } catch (e) { return false; }
    }

    // Median nearest-neighbor distance from every sampled point on rail A to
    // its closest point on rail B - median (not mean) so the two end-cap
    // points (which sit off to the side, further from the other rail than
    // the straight run) don't skew the estimate.
    function _smRibbonGap(item) {
        try {
            if (!_smIsRibbonUnit(item)) return null;
            var pA = _smSamplePathItem(item.pathItems[0], 16);
            var pB = _smSamplePathItem(item.pathItems[1], 16);
            if (pA.length < 4 || pB.length < 4) return null;
            var ds = [];
            for (var i = 0; i < pA.length; i++) {
                var best = Infinity;
                for (var j = 0; j < pB.length; j++) {
                    var dx = pA[i][0] - pB[j][0], dy = pA[i][1] - pB[j][1];
                    var d2 = dx * dx + dy * dy;
                    if (d2 < best) best = d2;
                }
                ds.push(Math.sqrt(best));
            }
            ds.sort(function (a, b) { return a - b; });
            return ds[Math.floor(ds.length / 2)];
        } catch (e) { return null; }
    }

    // Offsets a closed sampled outline INWARD by insetPt: the -7mm seam line.
    // Interior side is derived once from the polygon's winding (signed area):
    // for a counter-clockwise outline the interior lies to the LEFT of travel.
    function _smInsetOutline(outline, insetPt) {
        var n = outline.length;
        if (n < 8 || !insetPt) return outline;
        var area = 0;
        for (var i = 0; i < n; i++) {
            var a = outline[i], b = outline[(i + 1) % n];
            area += a[0] * b[1] - b[0] * a[1];
        }
        var leftInward = (area > 0) ? 1 : -1;
        var out = [];
        for (var j = 0; j < n; j++) {
            var p = outline[j], q = outline[(j - 1 + n) % n], r = outline[(j + 1) % n];
            var tx = r[0] - q[0], ty = r[1] - q[1];
            var len = Math.sqrt(tx * tx + ty * ty);
            if (len < 1e-6) { out.push([p[0], p[1]]); continue; }
            var nx = (-ty / len) * leftInward, ny = (tx / len) * leftInward;
            out.push([p[0] + nx * insetPt, p[1] + ny * insetPt]);
        }
        return out;
    }

    // THE SEAM LINE (-7mm), via Illustrator's OWN Offset Path - the same
    // official recipe the Pocket uses at -1in (officialInsetPolygon), per
    // explicit instruction: "offset method wo use krna jo pocket me he ...
    // isi trha idhr bhi 7mm ka lena he".
    //
    // Why it matters here and not just for tidiness: _smInsetOutline above
    // offsets the sampled polyline point-by-point, which its own comment
    // admits produces loop artifacts at corners. Measured on job 33d99084 the
    // two seam lines differ by an average of 5.7pt (2.0mm) and up to 24.2pt
    // (8.5mm) at the corners - on a feature whose whole tolerance is +/-1mm.
    //
    // Three things this must get right, all learned the hard way (PHR 111/112):
    //   - duplicate to the LAYER ROOT. A panel's placement path is itself a
    //     clipping path and Illustrator silently ignores a live effect on one.
    //   - app.redraw() after applyEffect. A live effect is only materialised
    //     on a redraw; without it expandStyle expands nothing, throws nothing,
    //     and the RAW outline comes back looking like a valid inset.
    //   - a shrink guard, because of exactly that silent-success failure mode.
    // Falls back to the polyline inset (never null) so a job can still run if
    // Offset Path is unavailable for any reason.
    function _smSeamOutline(panelPath, outline, label) {
        var probe = null, expanded = null, poly = null, rawAnchors = null;
        try {
            var sb = panelPath.geometricBounds;
            var srcW = Math.abs(sb[2] - sb[0]), srcH = Math.abs(sb[1] - sb[3]);
            app.activeDocument = orderDoc;
            probe = panelPath.duplicate(orderDoc.layers[0], ElementPlacement.PLACEATBEGINNING);
            probe.name = "__SM_SEAM_PROBE";
            probe.applyEffect('<LiveEffect name="Adobe Offset Path"><Dict data="R mlim 4 R ofst -' +
                              SM_SEAM_PT + ' I jntp 2 "/></LiveEffect>');
            app.redraw();
            orderDoc.selection = null;
            probe.selected = true;
            app.executeMenuCommand("expandStyle");
            app.redraw();
            var sel = orderDoc.selection;
            if (!sel || sel.length === 0) {
                log("SLEEVE-MATCH [" + label + "]: Offset Path produced nothing - using the polyline inset instead.");
                return _smInsetOutline(outline, SM_SEAM_PT);
            }
            expanded = sel[0];
            probe = null; // expandStyle consumed it
            orderDoc.selection = null;
            var eb = expanded.geometricBounds;
            var outW = Math.abs(eb[2] - eb[0]), outH = Math.abs(eb[1] - eb[3]);
            // A genuine -7mm inset takes ~2x7mm (39.7pt) off each axis. Anything
            // that has not lost at least ONE inset's worth on both axes did not
            // actually offset - see the silent-no-op failure mode above.
            if ((srcW - outW) < SM_SEAM_PT || (srcH - outH) < SM_SEAM_PT) {
                log("SLEEVE-MATCH [" + label + "]: Offset Path returned an un-inset shape (" +
                    Math.round(outW) + "x" + Math.round(outH) + "pt vs " + Math.round(srcW) + "x" +
                    Math.round(srcH) + "pt) - using the polyline inset instead.");
                return _smInsetOutline(outline, SM_SEAM_PT);
            }
            poly = _smSampleOutline(expanded, 32);
            // Keep the offset path's OWN anchor points too. Sampling + projecting
            // below throws away its corner structure, and the shoulder tip is a
            // real MITER corner on this path (jntp 2) - the very point the
            // customer selects by hand. See _smSeamCorner.
            try {
                var _oPath = (expanded.typename === "GroupItem") ? (_smLargestChildPath(expanded) || expanded) : expanded;
                rawAnchors = _uaAnchors(_oPath);
            } catch (eRa) { rawAnchors = null; }
            if (!poly || poly.length < 8) {
                log("SLEEVE-MATCH [" + label + "]: could not sample the Offset Path result - using the polyline inset instead.");
                return _smInsetOutline(outline, SM_SEAM_PT);
            }
        } catch (eOff) {
            // A PARM here goes to the panel rollback like every other PARM
            // (user's instruction, 2026-08-27): rebuild the piece from scratch
            // rather than quietly finishing it on the fallback inset. The
            // fallback is still correct geometry, but it loses the offset
            // path's own anchor points - and the shoulder tip is a real miter
            // corner on that path (see the rawAnchors note above), so a piece
            // that took this route is not identical to one that did not.
            //
            // parmBail is a no-op for anything that is not a PARM, so a genuine
            // Offset Path limitation still falls through to the inset below.
            // The two NON-exception fallbacks above (un-inset result, unsamplable
            // result) are untouched - those are not errors at all.
            parmBail(eOff, "the sleeve-match seam offset");
            log("SLEEVE-MATCH [" + label + "]: Offset Path failed (" + eOff.message + ") - using the polyline inset instead.");
            return _smInsetOutline(outline, SM_SEAM_PT);
        } finally {
            try { if (probe) probe.remove(); } catch (e1) {}
            try { if (expanded) expanded.remove(); } catch (e2) {}
        }
        // Offset Path returns its own point order and count. Every caller below
        // assumes seam[i] is the inset counterpart of outline[i], so project it
        // back onto the outline's indices (nearest point) rather than rewriting
        // the index arithmetic in five places.
        var projected = [];
        for (var i = 0; i < outline.length; i++) {
            var ox = outline[i][0], oy = outline[i][1], bi = 0, bd = 1e18;
            for (var j = 0; j < poly.length; j++) {
                var dx = poly[j][0] - ox, dy = poly[j][1] - oy;
                var d2 = dx * dx + dy * dy;
                if (d2 < bd) { bd = d2; bi = j; }
            }
            projected.push([poly[bi][0], poly[bi][1]]);
        }
        // Logged on SUCCESS too, deliberately: every fallback above says so, but
        // without this line a silent run could not be told apart from a run that
        // never reached here at all - the exact ambiguity that hid the Pocket's
        // missing redraw for months (PHR 111).
        // Carried on the array itself so no caller signature changes.
        if (rawAnchors && rawAnchors.length >= 6) projected.rawAnchors = rawAnchors;
        log("SLEEVE-MATCH [" + label + "]: seam line taken from Illustrator's Offset Path -7mm" +
            (projected.rawAnchors ? (" (" + projected.rawAnchors.length + " path corners available).") : "."));
        return projected;
    }

    function _smPointInPoly(poly, x, y) {
        var inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var yi = poly[i][1], yj = poly[j][1];
            if ((yi > y) !== (yj > y)) {
                var xi = poly[i][0], xj = poly[j][0];
                if (x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
            }
        }
        return inside;
    }

    // polys here is a list of UNIT shape descriptors (see _smPolysOf) - one
    // entry per matched-art item, each itself a list of that item's own
    // sub-path polygons. A point counts as "in" a unit if it's inside an
    // ODD number of that unit's sub-paths (Illustrator's even-odd compound-
    // path fill rule - e.g. a stroke-expanded ribbon's INK is only the thin
    // band between its two rails, not everything inside the outer rail),
    // OR-ed (union) across the different sibling units in the list.
    function _smInAny(polys, x, y) {
        for (var i = 0; i < polys.length; i++) {
            var sub = polys[i], count = 0;
            for (var j = 0; j < sub.length; j++) if (_smPointInPoly(sub[j], x, y)) count++;
            if ((count % 2) === 1) return true;
        }
        return false;
    }

    // Both corner points of a panel: the underarm corners on a body panel /
    // cap corners on a sleeve (bottom, walking UP - the original, production-
    // proven trace), PLUS the mirrored shoulder/cap-top corners (top, walking
    // DOWN - new). Ltop/Rtop are best-effort: a panel where they can't be
    // traced (raglan cut, no clean shoulder corner) just falls back to
    // bottom-only measurement for every unit on that panel - see
    // _smMeasureUnitD.
    function _smFindCorners(panelPath, label) {
        var anchors = _uaAnchors(panelPath);
        if (anchors.length < 4) { log("SLEEVE-MATCH [" + label + "]: not enough anchor points on panel."); return null; }
        var xmin = 1e12, xmax = -1e12, ymin = 1e12, ymax = -1e12;
        for (var i = 0; i < anchors.length; i++) {
            var a = anchors[i];
            if (a[0] < xmin) xmin = a[0];
            if (a[0] > xmax) xmax = a[0];
            if (a[1] < ymin) ymin = a[1];
            if (a[1] > ymax) ymax = a[1];
        }
        var W = xmax - xmin, H = ymax - ymin;
        if (W <= 0 || H <= 0) return null;
        var L = _uaWalkUp(anchors, -1, W, H, ymin);
        var R = _uaWalkUp(anchors, 1, W, H, ymin);
        if (!L || !R) { log("SLEEVE-MATCH [" + label + "]: could not trace the side-seam corners (raglan/unusual cut?)."); return null; }
        if (Math.abs(L[1] - R[1]) > 0.05 * H) {
            log("SLEEVE-MATCH [" + label + "]: left/right corner heights differ (" + Math.round(Math.abs(L[1] - R[1])) + "pt) - skipping.");
            return null;
        }
        var Ltop = _uaWalkDown(anchors, -1, W, H, ymax);
        var Rtop = _uaWalkDown(anchors, 1, W, H, ymax);
        if (Ltop && Rtop && Math.abs(Ltop[1] - Rtop[1]) > 0.05 * H) { Ltop = null; Rtop = null; }
        return { L: L, R: R, W: W, H: H, Ltop: Ltop, Rtop: Rtop };
    }

    function _smNorm(s) { try { return (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); } catch (e) { return ""; } }

    // Finds a GroupItem anywhere in the design whose name normalizes to
    // exactly "armholematch" (case/space/punctuation-insensitive).
    function _smFindArmholeGroup(container) {
        if (!container || !container.pageItems) return null;
        for (var i = 0; i < container.pageItems.length; i++) {
            var it = container.pageItems[i];
            if (it.typename === "GroupItem") {
                if (_smNorm(it.name) === "armholematch") return it;
                var r = _smFindArmholeGroup(it);
                if (r) return r;
            }
        }
        return null;
    }

    // Collects every "unit..." item inside an "armhole match" group (may be
    // nested a level or two inside plain sub-groups - not required to be a
    // direct child). A matched unit is opaque - never recursed into, so a
    // grouped multi-shape unit is slid/resized as one piece - mirroring how
    // the old MATCH-prefix mode treated a named group. Classifies each by
    // the text right after "unit": "left"/"right" -> tagged (this unit only
    // applies to that one corner); anything else (a number, or nothing) ->
    // continuous (applies to BOTH corners - the common "one design crossing
    // corner to corner" case).
    function _smCollectUnits(container, out) {
        if (!container || !container.pageItems) return;
        for (var i = 0; i < container.pageItems.length; i++) {
            var it = container.pageItems[i];
            var nm = _smNorm(it.name);
            if (nm.indexOf("unit") === 0) {
                var rest = nm.substr(4);
                // if/else, NOT a chained ternary. ExtendScript 4.5.6 (Illustrator
                // CC 2015) parses `a ? X : b ? Y : Z` LEFT-associatively, i.e. as
                // `(a ? X : b) ? Y : Z` - verified live in this app:
                // `true ? 'A' : false ? 'B' : 'C'` returns 'B', not 'A'. That made
                // EVERY "unit left N" tag as "right" (a=true -> 'left' -> truthy ->
                // 'right'), so left-side sleeve units were matched against the
                // RIGHT corner and warned "artwork does not reach the seam", while
                // "unit right N" only worked by accident. Keep this as if/else.
                // "righ" (the common missing-t typo) counts as "right" - it is
                // also a prefix of "right", so this one test accepts both
                // "unit right 1" and "unit righ 1".
                var tag;
                if (rest.indexOf("left") === 0) tag = "left";
                else if (rest.indexOf("righ") === 0) tag = "right";
                else tag = "continuous";
                out.push({ item: it, tag: tag });
                continue;
            }
            if (it.typename === "GroupItem") _smCollectUnits(it, out);
        }
    }

    // Sorts a unit list by straight-line distance from a reference point
    // (nearest first) - a stable, geometry-based order for pairing a body
    // unit with its sleeve counterpart that doesn't depend on how (or
    // whether) the designer numbered them consistently across files.
    function _smSortByDistance(units, ref) {
        if (!ref) return units;
        var withD = [];
        for (var i = 0; i < units.length; i++) {
            var b; try { b = units[i].item.geometricBounds; } catch (e) { continue; }
            var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
            var dx = cx - ref[0], dy = cy - ref[1];
            withD.push({ u: units[i], d: dx * dx + dy * dy });
        }
        withD.sort(function (a, b) { return a.d - b.d; });
        var out = [];
        for (var j = 0; j < withD.length; j++) out.push(withD[j].u);
        return out;
    }

    // Finds this design's "armhole match" group and splits its units into
    // continuous / left-tagged / right-tagged lists. Returns null if no
    // such group exists on this particular pasted instance (pre-flight
    // already guarantees one exists SOMEWHERE in the mockup's Back view
    // when SM_ON, but that doesn't guarantee every instance's own design
    // matches - defensive, not expected in normal use).
    function _smGetUnitSets(design) {
        var grp = _smFindArmholeGroup(design);
        if (!grp) return null;
        var all = [];
        _smCollectUnits(grp, all);
        var sets = { continuous: [], left: [], right: [] };
        for (var i = 0; i < all.length; i++) sets[all[i].tag].push(all[i]);
        return sets;
    }

    // The unit list relevant to ONE side/corner: that side's own tagged
    // units if any exist, otherwise the continuous (untagged) units, which
    // apply to both sides since they're the same piece crossing corner to
    // corner.
    function _smUnitsForSide(sets, side) {
        var tagged = sets[side];
        return (tagged && tagged.length > 0) ? tagged : sets.continuous;
    }

    // A unit's normalized name with any left/right tag removed:
    // "unitleft1"/"unitright1" -> "unit1". Same tag detection as
    // _smCollectUnits above.
    function _smBaseName(nm) {
        if (nm.indexOf("unit") !== 0) return nm;
        var rest = nm.substr(4);
        if (rest.indexOf("left") === 0) return "unit" + rest.substr(4);
        if (rest.indexOf("right") === 0) return "unit" + rest.substr(5);
        if (rest.indexOf("righ") === 0) return "unit" + rest.substr(4); // same missing-t typo as _smCollectUnits
        return nm;
    }

    // The body target for a unit name: its EXACT name first (both panels used
    // the same convention), then its tag-stripped base name.
    //
    // The base-name step is the customer's own naming convention (explicit
    // instruction): ONE piece crossing both corners on the body is named
    // "unit 1", while on the sleeve that same design exists as TWO separate
    // shapes named "unit left 1" / "unit right 1" - both are "unit 1" as far
    // as matching is concerned, so both take the body's "unit 1" measurement
    // (mirrored, exactly like the continuous case). smMeasureBodyD stores the
    // reverse alias too, so a tagged body unit answers an untagged sleeve
    // lookup as well.
    function _smTargetFor(rec, nm) {
        if (rec.byName[nm]) return rec.byName[nm];
        var base = _smBaseName(nm);
        if (base !== nm && rec.byName[base]) return rec.byName[base];
        return null;
    }

    // Every sub-path of a compound-path item, sampled individually (for the
    // even-odd coverage test in _smInAny above) - NOT just the largest one
    // the way _smSampleOutline/_smLargestChildPath picks for simple corner-
    // finding/arc-length work. Without this, a 2-rail ribbon (Outline
    // Stroke/Expand) or any hole-bearing compound path got reduced to its
    // single largest sub-path and treated as a SOLID fill for coverage
    // purposes - so a point deep inside the outer rail (nowhere near the
    // actual thin band of ink) still read as "covered", which is exactly
    // how a unit that never really reaches the seam can still measure a D.
    // Falls back to the ordinary single traced outline for anything that
    // isn't a compound path (or has no usable sub-paths).
    function _smItemSubPolys(item) {
        try {
            if (item.typename === "CompoundPathItem") {
                var out = [];
                for (var i = 0; i < item.pathItems.length; i++) {
                    var pl = _smSamplePathItem(item.pathItems[i], 24);
                    if (pl.length >= 4) out.push(pl);
                }
                if (out.length > 0) return out;
            }
        } catch (e) {}
        var single = _smSampleOutline(item, 24);
        return single.length >= 8 ? [single] : [];
    }

    function _smPolysOf(art) {
        var ps = [];
        for (var i = 0; i < art.length; i++) {
            var sub = _smItemSubPolys(art[i].item);
            if (sub.length > 0) ps.push(sub);
        }
        return ps;
    }

    // VISIBLE-COVERAGE (SLEEVE-MATCH only): flattens a design's contents
    // into front-to-back z-order (Illustrator's pageItems[0] is always the
    // frontmost item, so plain index order already IS z-order; recursing
    // depth-first at each item's own position keeps a nested group's
    // contents correctly interleaved with its siblings). Only filled Path/
    // CompoundPath items are collected - TextFrames/rasters don't occlude
    // the way a solid fill does here. "base-path" is excluded: it's the
    // getDesignBaseFill reference shape (see there), not a real drawn
    // element, and would otherwise occlude everything else in the design
    // since it spans the whole panel.
    function _smFlattenZOrder(container, out) {
        if (!container || !container.pageItems) return;
        for (var i = 0; i < container.pageItems.length; i++) {
            var it = container.pageItems[i];
            if (it.typename === "PathItem" || it.typename === "CompoundPathItem") {
                if (_smNorm(it.name) === "basepath") continue;
                var filled = false;
                try { filled = it.typename === "CompoundPathItem" ? true : !!it.filled; } catch (eF) {}
                if (filled) out.push(it);
            } else if (it.typename === "GroupItem") {
                _smFlattenZOrder(it, out);
            }
        }
    }

    // Everything ahead of `item` in the z-order list that could plausibly
    // occlude it - narrowed to bounding-box overlap with `padBounds`
    // (normally the unit's own bounds unioned with the corner points being
    // measured from) so a whole-design z-order scan doesn't drag in
    // completely unrelated shapes (size tags, logos, reference art
    // elsewhere on the panel).
    function _smOccludersOf(zOrder, item, padBounds) {
        var occ = [];
        for (var i = 0; i < zOrder.length; i++) {
            if (zOrder[i] === item) break;
            var b;
            try { b = zOrder[i].geometricBounds; } catch (eB) { continue; }
            if (b[2] < padBounds[0] || b[0] > padBounds[2] || b[1] < padBounds[3] || b[3] > padBounds[1]) continue;
            occ.push({ item: zOrder[i] });
        }
        return occ;
    }

    // Bounding box of a unit's own geometry unioned with the corner points
    // it's being measured from/against - the region any relevant occluder
    // has to overlap to matter for THIS measurement.
    function _smOcclusionPad(item, corners) {
        var b; try { b = item.geometricBounds; } catch (e) { return null; }
        var pad = [b[0], b[1], b[2], b[3]];
        var pts = [corners.L, corners.R, corners.Ltop, corners.Rtop];
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            if (!p) continue;
            if (p[0] < pad[0]) pad[0] = p[0];
            if (p[1] > pad[1]) pad[1] = p[1];
            if (p[0] > pad[2]) pad[2] = p[0];
            if (p[1] < pad[3]) pad[3] = p[1];
        }
        return pad;
    }

    // A point counts as "this unit is actually visible here" only if it's
    // inside the unit's own ink (existing even-odd _smInAny) AND nothing
    // stacked in front of it (occluderPolys) also covers that point - true
    // render-visible coverage, not just raw shape geometry that might be
    // sitting underneath something else in the artwork (confirmed against
    // a real mockup: a big base-color unit's raw shape "covered" the whole
    // seam, but the customer's own pen-tool measurement of what's actually
    // VISIBLE landed exactly where the next unit drawn on top of it stops).
    function _smVisibleInAny(unitPolys, occluderPolys, x, y) {
        if (!_smInAny(unitPolys, x, y)) return false;
        if (_smInAny(occluderPolys, x, y)) return false;
        return true;
    }

    function _smShiftArt(art, dx, dy) {
        for (var i = 0; i < art.length; i++) {
            try {
                if (dx) art[i].item.left = art[i].item.left + dx;
                if (dy) art[i].item.top = art[i].item.top + dy;
            } catch (e) {}
        }
    }

    function _smScaleArt(art, s, ax, ay, widthOnly) {
        // Resize of the whole matched-art unit about a global anchor (ax, ay) -
        // never one-sided, never tilted.
        //
        // widthOnly (opt-in): scales the X axis alone and leaves height
        // untouched. Used for TOP-anchored matches, where the seam runs roughly
        // horizontally at the anchor, so where the unit's edge crosses it is set
        // by the unit's WIDTH - height has no effect on D at all. Uniform
        // scaling there shrinks the unit vertically for nothing: confirmed on
        // job 33d99084, a 24.1% uniform shrink matched D exactly but pulled the
        // sleeve's centre stripe up off the rib it is drawn running down to.
        for (var i = 0; i < art.length; i++) {
            try {
                var it = art[i].item;
                var b = it.geometricBounds;
                var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
                var sy = widthOnly ? 1 : s;
                it.resize(s * 100, sy * 100, true, true, true, true, 100, Transformation.CENTER);
                it.translate((cx - ax) * (s - 1), (cy - ay) * (sy - 1));
            } catch (e) {}
        }
    }

    function _smLineIntersect(p1, p2, p3, p4) {
        var den = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
        if (Math.abs(den) < 1e-9) return null;
        var t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / den;
        return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
    }

    // Shared tail for _smMeasureAlongEdge/_smMeasureFromTop: given the seam
    // corner S and the walked seam-line section A (both resolved by the
    // caller - they differ only in which raw corner/direction they walked
    // from), finds where `polys` covers the line from S and returns D as
    // the straight pen-tool chord |S->E| - exactly the way the customer
    // measures by hand, NOT the accumulated arc length (always reads
    // longer on a curved armhole).
    //   covered=false : artwork never touches this seam line
    //   full=true     : artwork still covers the seam line where the walked
    //                   section ends (the unit spans the whole edge)
    // firstBoundary: D is the FIRST color boundary from the corner - an
    // ENTRY into the art counts exactly like an EXIT. Always true for the
    // named-unit flow below (kept as a parameter for symmetry/clarity).
    function _smMeasureFromSA(S, A, polys, firstBoundary, occluders) {
        if (!S || A.length === 0 || polys.length === 0) return null;
        var occ = occluders || [];
        function vis(x, y) { return _smVisibleInAny(polys, occ, x, y); }
        function _chord(p) { return Math.sqrt((p[0] - S[0]) * (p[0] - S[0]) + (p[1] - S[1]) * (p[1] - S[1])); }
        var endPt = null, transPt = null, anyIn = false;
        var prev = S, wasIn = vis(S[0], S[1]);
        // SM-COV diagnostics: how much of the walked seam the unit really
        // covers, and whether the walk STARTED inside it. Needed because a
        // rotated shoulder band now reaches the armhole corner, which sends
        // this through the "started inside" path - and the caller has no other
        // way to tell a genuine full-edge unit from a misread one.
        var startIn = wasIn, nIn = 0;
        if (wasIn) anyIn = true;
        for (var m = 0; m < A.length; m++) {
            var c2 = A[m];
            var nowIn = vis(c2[0], c2[1]);
            if (nowIn) { anyIn = true; nIn++; }
            if (firstBoundary && transPt === null && nowIn !== wasIn) {
                // refine the first in/out flip either direction
                var lo1 = 0, hi1 = 1;
                for (var b1 = 0; b1 < 12; b1++) {
                    var mid1 = (lo1 + hi1) / 2;
                    var in1 = vis(prev[0] + (c2[0] - prev[0]) * mid1, prev[1] + (c2[1] - prev[1]) * mid1);
                    if (in1 === wasIn) lo1 = mid1; else hi1 = mid1;
                }
                var t1 = (lo1 + hi1) / 2;
                transPt = [prev[0] + (c2[0] - prev[0]) * t1, prev[1] + (c2[1] - prev[1]) * t1];
            }
            if (wasIn && !nowIn) {
                // refine the exit point E on the chord between the samples
                var lo = 0, hi = 1;
                for (var b = 0; b < 12; b++) {
                    var mid = (lo + hi) / 2;
                    if (vis(prev[0] + (c2[0] - prev[0]) * mid, prev[1] + (c2[1] - prev[1]) * mid)) lo = mid; else hi = mid;
                }
                var tE = (lo + hi) / 2;
                endPt = [prev[0] + (c2[0] - prev[0]) * tE, prev[1] + (c2[1] - prev[1]) * tE];
            }
            prev = c2; wasIn = nowIn;
        }
        var cov = { startIn: startIn, nIn: nIn, nTot: A.length, S: S, A0: A[0], A1: A[A.length - 1] };
        function _r(d, covered, full, E) {
            return { d: d, covered: covered, full: full, S: S, E: E, A: A, cov: cov };
        }
        if (firstBoundary) {
            if (transPt) return _r(_chord(transPt), true, false, transPt);
            if (anyIn) return _r(_chord(A[A.length - 1]), true, true, null);
            return _r(0, false, false, null);
        }
        if (!anyIn) return _r(0, false, false, null);
        if (wasIn || !endPt) return _r(_chord(A[A.length - 1]), true, true, null);
        return _r(_chord(endPt), true, false, endPt);
    }

    // Measures D from the BOTTOM (underarm/cap) corner, walking UP - the
    // original, production-proven direction. The walk's ROUTE (corner
    // sample, climb direction, where the edge ends - apex descent or
    // shoulder flattening) is decided on the ORIGINAL outline, whose
    // geometry is clean; the inset polyline is only used for the actual
    // distance/coverage tests. Offsetting a corner point-by-point creates
    // small loop artifacts right at the corner, so the first samples next
    // to it are skipped and the true seam-line corner S is recovered by
    // intersecting the two inset lines - the same corner the customer
    // measures from.
    // THE ARMHOLE/CAP WALK. Shared by BOTH ends of the seam (_smMeasureAlongEdge
    // from the underarm, _smMeasureFromArmholeTop from the shoulder tip) so the
    // two can never disagree about where the armhole starts and stops.
    function _smArmholeWalk(outline, corner, panelH) {
        var n = outline.length;
        if (n < 8) return null;
        var idx = 0, best = 1e12;
        for (var i = 0; i < n; i++) {
            var ddx = outline[i][0] - corner[0], ddy = outline[i][1] - corner[1];
            var d2 = ddx * ddx + ddy * ddy;
            if (d2 < best) { best = d2; idx = i; }
        }
        // Of the two directions along the outline, the armhole/cap edge is the
        // one that CLIMBS from the corner (the other descends the side seam).
        function rise(dir) {
            var r = 0, j = idx;
            for (var s = 0; s < 6; s++) { var k = (j + dir + n) % n; r += outline[k][1] - outline[j][1]; j = k; }
            return r;
        }
        var dir = (rise(1) >= rise(-1)) ? 1 : -1;

        // Armhole/cap section on the ORIGINAL outline: from the corner to the
        // apex (y starts descending) or to where the outline flattens out
        // (shoulder seam) - the flatness check arms only after a 15% climb,
        // because the armhole itself starts nearly horizontal at the corner.
        var armIdx = [idx];
        var startY = outline[idx][1], apexY = startY;
        var j2 = idx, win = [];
        var panelW = _smOutlineWidth(outline);
        var flatAt = -1, flatX = 0, flatConfirmed = false;
        for (var s2 = 1; s2 < n; s2++) {
            j2 = (j2 + dir + n) % n;
            var cur = outline[j2];
            if (cur[1] > apexY) apexY = cur[1];
            if (cur[1] < apexY - 2) { flatAt = -1; break; } // apex reached - see the note below
            win.push(cur);
            if (win.length > 7) win.splice(0, 1);
            if (panelH && (cur[1] - startY) > 0.15 * panelH && win.length === 7) {
                var runH = Math.abs(win[6][0] - win[0][0]), runV = Math.abs(win[6][1] - win[0][1]);
                // DEFERRED (was an immediate break): this flat window is meant to
                // catch a body panel's SHOULDER SEAM, but the top of any armhole -
                // and the whole top of a sleeve CAP - is naturally flat too, so it
                // also fired while still ON the curve and cut the walk short of the
                // artwork. Measured on job 33d99084 it tripped at ratio 0.286
                // (sleeve) and 0.290 (front) against this same 0.30 threshold, i.e.
                // marginally, and the sleeve's centre stripe - which sits exactly ON
                // the cap apex - came back "no-reach" on every size.
                // So remember the candidate and keep walking: a real shoulder seam
                // goes on running horizontally (confirmed below), whereas a cap apex
                // peaks and immediately descends, which the apex test above catches
                // first and clears the candidate.
                if ((runH + runV) > 1 && runV < 0.3 * runH && flatAt < 0) { flatAt = armIdx.length; flatX = cur[0]; }
            }
            // Confirmation: 20% of the panel's own width travelled horizontally
            // since the flat window opened, without ever reaching the apex. That
            // is a seam, not a peak - stop, and drop everything walked since.
            if (flatAt >= 0 && panelW && Math.abs(cur[0] - flatX) > 0.20 * panelW) { flatConfirmed = true; break; }
            armIdx.push(j2);
        }
        if (flatConfirmed && flatAt >= 0) armIdx.length = flatAt;
        if (armIdx.length < 12) return null;
        return { idx: idx, dir: dir, armIdx: armIdx };
    }

    // THE SEAM RAY for one corner: the seam-line corner S and the walked seam
    // section A. Lifted out of _smMeasureAlongEdge UNCHANGED so the D-CHAIN
    // report below can walk the exact same line the solve measures on - the
    // measurement itself is untouched.
    function _smSeamRay(outline, inset, corner, panelH) {
        var n = outline.length;
        if (n < 8 || inset.length !== n) return null;
        var w = _smArmholeWalk(outline, corner, panelH);
        if (!w) return null;
        var idx = w.idx, dir = w.dir, armIdx = w.armIdx;

        // Seam-line corner S = side-seam inset line x armhole inset line.
        var A = [];
        for (var k = 3; k < armIdx.length; k++) A.push(inset[armIdx[k]]);
        var b1 = inset[(idx - dir * 4 + n) % n], b2 = inset[(idx - dir * 16 + n) % n];
        var S = _smLineIntersect(b1, b2, A[0], A[Math.min(9, A.length - 1)]);
        var iC = inset[idx];
        if (!S || Math.sqrt((S[0] - iC[0]) * (S[0] - iC[0]) + (S[1] - iC[1]) * (S[1] - iC[1])) > 20 * SM_MM) S = iC;
        return { S: S, A: A };
    }

    // D measured from the UNDERARM corner, walking UP the armhole.
    function _smMeasureAlongEdge(outline, inset, corner, polys, panelH, firstBoundary, occluders) {
        if (polys.length === 0) return null;
        var ray = _smSeamRay(outline, inset, corner, panelH);
        if (!ray) return null;
        return _smMeasureFromSA(ray.S, ray.A, polys, firstBoundary, occluders);
    }

    // ===================== D-CHAIN (report only) =====================
    // The solve measures ONE number per unit: corner -> that unit's first
    // boundary. The customer measures the whole chain by hand instead -
    //   corner -> unit1, unit1's own length, unit1 -> unit2, unit2's length, ...
    // for however many units exist. These two helpers reproduce that chain and
    // write it to the log. Nothing here feeds the solve: _smMeasureUnitD and
    // every placement decision stay exactly as they were (explicit instruction:
    // "unit 1 ka a bilkul perfect he, use mat kharab krna").

    // Where ONE unit starts and stops covering the seam ray, as pen-tool chord
    // distances from S. start = first boundary (0 when it already covers the
    // corner), end = last exit (or the end of the walk when it never exits).
    function _smUnitSpan(S, A, polys, occ) {
        if (!S || !A || A.length === 0 || polys.length === 0) return null;
        var occl = occ || [];
        function vis(x, y) { return _smVisibleInAny(polys, occl, x, y); }
        function chord(p) { return Math.sqrt((p[0] - S[0]) * (p[0] - S[0]) + (p[1] - S[1]) * (p[1] - S[1])); }
        function refine(p0, p1, wasInside) {
            var lo = 0, hi = 1;
            for (var b = 0; b < 12; b++) {
                var mid = (lo + hi) / 2;
                var inMid = vis(p0[0] + (p1[0] - p0[0]) * mid, p0[1] + (p1[1] - p0[1]) * mid);
                if (inMid === wasInside) lo = mid; else hi = mid;
            }
            var t = (lo + hi) / 2;
            return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
        }
        var prev = S, wasIn = vis(S[0], S[1]);
        var start = null, end = null, anyIn = false;
        if (wasIn) { start = 0; anyIn = true; }
        for (var m = 0; m < A.length; m++) {
            var c = A[m], nowIn = vis(c[0], c[1]);
            if (nowIn && !wasIn) {
                var pIn = refine(prev, c, wasIn);
                if (start === null) start = chord(pIn);
                anyIn = true;
            } else if (!nowIn && wasIn) {
                end = chord(refine(prev, c, wasIn));
            }
            if (nowIn) anyIn = true;
            prev = c; wasIn = nowIn;
        }
        if (!anyIn) return null;
        if (start === null) start = 0;
        var full = false;
        if (wasIn) { end = chord(A[A.length - 1]); full = true; }
        if (end === null) end = start;
        return { start: start, end: end, full: full };
    }

    // Builds and logs the whole chain for one panel corner, in seam order -
    // fully dynamic, so unit 4 / unit 7 read exactly the same way.
    function _smLogDChain(tag, outline, seam, corner, panelH, units, corners, zOrder) {
        try {
            if (!units || units.length === 0) return;
            var ray = _smSeamRay(outline, seam, corner, panelH);
            if (!ray) { log("D-CHAIN [" + tag + "]: could not walk this seam."); return; }
            var spans = [];
            for (var i = 0; i < units.length; i++) {
                var polys = _smPolysOf([units[i]]);
                if (polys.length === 0) continue;
                var pad = _smOcclusionPad(units[i].item, corners);
                var occ = pad ? _smPolysOf(_smOccludersOf(zOrder, units[i].item, pad)) : [];
                var sp = _smUnitSpan(ray.S, ray.A, polys, occ);
                if (!sp) continue;
                sp.name = units[i].item.name || "unnamed";
                spans.push(sp);
            }
            if (spans.length === 0) { log("D-CHAIN [" + tag + "]: no unit reaches this seam."); return; }
            spans.sort(function (p, q) { return p.start - q.start; });
            var parts = ["corner->'" + spans[0].name + "' = " + _smMM(spans[0].start) + "mm"];
            for (var s = 0; s < spans.length; s++) {
                var lenTxt = "'" + spans[s].name + "' length = " + _smMM(spans[s].end - spans[s].start) + "mm";
                if (spans[s].full) lenTxt += " (runs to the end of the seam)";
                parts.push(lenTxt);
                if (s + 1 < spans.length) {
                    parts.push("'" + spans[s].name + "'->'" + spans[s + 1].name + "' = " + _smMM(spans[s + 1].start - spans[s].end) + "mm");
                }
            }
            log("D-CHAIN [" + tag + "]: " + parts.join(" | "));
        } catch (e) { log("D-CHAIN [" + tag + "]: could not build the chain - " + e.message); }
    }
    // =================== end D-CHAIN (report only) ===================

    // Panel width straight off the sampled outline, so the flat-window
    // confirmation above needs no extra parameter threaded through every caller.
    function _smOutlineWidth(outline) {
        var lo = 1e18, hi = -1e18;
        for (var i = 0; i < outline.length; i++) {
            if (outline[i][0] < lo) lo = outline[i][0];
            if (outline[i][0] > hi) hi = outline[i][0];
        }
        return (hi > lo) ? (hi - lo) : 0;
    }

    // D measured from the ARMHOLE'S TOP CORNER, walking DOWN the armhole - the
    // exact mirror of _smMeasureAlongEdge above, and the customer's own method:
    // "jese bottom me napty hen ... top se -7mm chor kr, and right se -7mm chor
    // kr, usi point se napty hen jahn tk unit 1 he".
    //
    // The top corner is the END OF THE ARMHOLE WALK, not the panel's highest
    // point. That distinction is the whole reason an earlier attempt at this
    // was wrong: on a FRONT the global apex sits near the NECK, ~550pt away from
    // the shoulder tip where the armhole actually ends, so anchoring there
    // measured from the wrong end of the shoulder. Deriving it from the walk
    // also makes it correct on a sleeve for free - there the same walk ends at
    // the cap apex, which IS that panel's top-of-armhole.
    //
    // S is recovered by intersecting the shoulder's -7mm line with the armhole's
    // -7mm line, the same trick the underarm end uses, because a plain
    // perpendicular offset lands SHORT of a corner: measured on job 33d99084 the
    // nearest offset point to the front's corner is 11.49mm away, not 7mm. On a
    // sleeve's smooth cap peak that intersection is ill-conditioned, so the same
    // 20mm sanity guard falls back to the perpendicular point - which is exactly
    // right there (measured: a clean 7.00mm).
    // WHERE THE ARMHOLE'S TOP ACTUALLY IS. Deriving it from the end of the
    // armhole walk was wrong: on a body panel the walk runs past the shoulder
    // tip and stops at the NECK-side high point instead (measured on this
    // mockup: it anchored at (-6030, 7629) and gave 149.5mm where the customer
    // measures 33.82mm from (-5645, 7503), the shoulder tip itself).
    //
    // Two panel shapes, two rules - and the caller always knows which it has:
    //   BODY   the shoulder tip = the OUTERMOST point of the top band on this
    //          side. The armhole ends there and the shoulder seam begins.
    //   SLEEVE the CENTRE of the cap top - the point sewn to the shoulder. Its
    //          top is a broad flat arc, so "the highest sample" is ambiguous
    //          and lands off-centre.
    // A REAL CORNER on the -7mm path, on this side, above the underarm - the
    // shoulder tip. Two things make this work where a height band did not:
    //   - it reads the OFFSET path's OWN anchors, the exact points the customer
    //     clicks when measuring by hand;
    //   - a miter corner turns far harder than the smooth armhole/neckline
    //     either side of it. Measured on this mockup the two shoulder corners
    //     turn 88.0 and 79.5 degrees while every curve point is 49.9 or less,
    //     so the 60-degree cut sits in a wide gap - and unlike "the top 20% of
    //     panel height" it does not care WHERE on the panel the shoulder sits.
    // Of the two shoulder corners the OUTER one is the tip; the inner one is
    // where the shoulder seam meets the neckline.
    function _smSeamCorner(anchors, corner, midX, label) {
        // Declared INSIDE the function on purpose: this helpers section runs
        // after the main loop, so a bare `var` up here is still undefined when
        // the loop calls in - the same hoisting trap the PLACKET-MATCH state
        // hit (see its note near the top of runAutomation).
        var SM_CORNER_MIN = 60 * Math.PI / 180;
        var n = anchors.length;
        if (n < 6) return null;
        var ylo = 1e18, yhi = -1e18;
        for (var y = 0; y < n; y++) {
            if (anchors[y][1] < ylo) ylo = anchors[y][1];
            if (anchors[y][1] > yhi) yhi = anchors[y][1];
        }
        var H = yhi - ylo, midY = (ylo + yhi) / 2;

        // Every qualifying corner on one side, outermost first.
        function pick(wantRight) {
            var best = null, bestOut = wantRight ? -1e18 : 1e18, count = 0;
            for (var i = 0; i < n; i++) {
                var p = anchors[i];
                if (wantRight ? (p[0] < midX) : (p[0] > midX)) continue;   // this side only
                if (p[1] < corner[1]) continue;                            // above the underarm
                var a = anchors[(i - 1 + n) % n], b = anchors[(i + 1) % n];
                var v1x = p[0] - a[0], v1y = p[1] - a[1], v2x = b[0] - p[0], v2y = b[1] - p[1];
                var l1 = Math.sqrt(v1x * v1x + v1y * v1y), l2 = Math.sqrt(v2x * v2x + v2y * v2y);
                if (l1 < 1e-6 || l2 < 1e-6) continue;
                var ca = (v1x * v2x + v1y * v2y) / (l1 * l2);
                if (ca > 1) ca = 1;
                if (ca < -1) ca = -1;
                if (Math.acos(ca) < SM_CORNER_MIN) continue;               // a curve, not a corner
                count++;
                if (wantRight ? (p[0] > bestOut) : (p[0] < bestOut)) { bestOut = p[0]; best = p; }
            }
            return { pt: best, count: count };
        }

        var mineWantRight = (corner[0] > midX);
        var mine = pick(mineWantRight), other = pick(!mineWantRight);
        if (!mine.pt) return null;

        // ---- VALIDATION. The underarm finder is guarded three ways
        // (_smFindCorners' 5% height match, findUnderarmY's range and
        // widest-point cross-check); the shoulder tip had none, so a wrong
        // corner was returned silently. These are the mirror of those.
        //
        // A: patterns are symmetric, so both shoulder tips must sit at the same
        //    height - the same 5%-of-H test _smFindCorners applies to underarms.
        if (other.pt && Math.abs(mine.pt[1] - other.pt[1]) > 0.05 * H) {
            if (label) log("SLEEVE-MATCH [" + label + "]: shoulder-tip corners disagree left/right by " +
                _smMM(Math.abs(mine.pt[1] - other.pt[1])) + "mm (limit " + _smMM(0.05 * H) +
                "mm) - rejecting the corner and using the height rule instead.");
            return null;
        }
        // B: a shoulder tip below the middle of the panel is not a shoulder tip.
        if (mine.pt[1] <= midY) {
            if (label) log("SLEEVE-MATCH [" + label + "]: shoulder-tip corner landed in the LOWER half of the panel" +
                " - rejecting it and using the height rule instead.");
            return null;
        }
        // C: two corners per side is the shoulder tip and the neck junction.
        //    More than that means something else is being picked up (a notch,
        //    a placket step) - not fatal, but it must not pass unnoticed.
        if (label && mine.count > 2) {
            log("SLEEVE-MATCH [" + label + "]: " + mine.count + " sharp corners on this side of the -7mm path" +
                " (expected 2) - the outermost was used, check this panel if the match looks wrong.");
        }
        return mine.pt;
    }

    function _smArmholeTopIndex(outline, inset, corner, isSleeve, label) {
        var n = outline.length;
        var top = -1e18, bot = 1e18, lo = 1e18, hi = -1e18;
        for (var i = 0; i < n; i++) {
            if (outline[i][1] > top) top = outline[i][1];
            if (outline[i][1] < bot) bot = outline[i][1];
            if (outline[i][0] < lo) lo = outline[i][0];
            if (outline[i][0] > hi) hi = outline[i][0];
        }
        var H = top - bot, midX = (lo + hi) / 2;
        if (H <= 0) return -1;
        if (isSleeve) {
            var best = -1, bd = 1e18;
            for (var s = 0; s < n; s++) {
                if (outline[s][1] < top - 0.03 * H) continue; // topmost band only
                var dxc = Math.abs(outline[s][0] - midX);
                if (dxc < bd) { bd = dxc; best = s; }
            }
            return best;
        }
        // BODY: take the shoulder tip off the -7mm path's own corner anchors.
        var C = (inset && inset.rawAnchors) ? _smSeamCorner(inset.rawAnchors, corner, midX, label) : null;
        if (C) {
            var ci = 0, cd = 1e18;
            for (var q = 0; q < n; q++) {
                var qdx = inset[q][0] - C[0], qdy = inset[q][1] - C[1];
                var q2 = qdx * qdx + qdy * qdy;
                if (q2 < cd) { cd = q2; ci = q; }
            }
            return ci;
        }
        // Fallback only - and it SAYS so, because this is a height threshold and
        // this feature has already been broken three separate times by one.
        if (label) log("SLEEVE-MATCH [" + label + "]: no corner found on the -7mm path - falling back to the top-20% height rule for the shoulder tip.");
        var wantRight = (corner[0] > midX);
        var bi = -1, bv = wantRight ? -1e18 : 1e18;
        for (var b = 0; b < n; b++) {
            if (outline[b][1] < top - 0.20 * H) continue;      // top band only
            if (wantRight ? (outline[b][0] > bv) : (outline[b][0] < bv)) { bv = outline[b][0]; bi = b; }
        }
        return bi;
    }

    function _smMeasureFromArmholeTop(outline, inset, corner, polys, panelH, firstBoundary, occluders, isSleeve) {
        var n = outline.length;
        if (n < 8 || inset.length !== n || polys.length === 0) return null;
        var ti = _smArmholeTopIndex(outline, inset, corner, isSleeve, null);
        if (ti < 0) return null;

        // Travel toward THIS side's underarm corner - down the armhole on a
        // body, down that half of the cap on a sleeve.
        function endDist(dir) {
            var j = ti;
            for (var s = 0; s < 8; s++) j = (j + dir + n) % n;
            var ex = outline[j][0] - corner[0], ey = outline[j][1] - corner[1];
            return ex * ex + ey * ey;
        }
        var dir = (endDist(1) <= endDist(-1)) ? 1 : -1;

        var A = [], j2 = ti;
        for (var s2 = 1; s2 < n; s2++) {
            j2 = (j2 + dir + n) % n;
            if (outline[j2][1] < corner[1]) break;   // past the underarm corner
            A.push(inset[j2]);
            if (A.length > n / 2) break;
        }
        if (A.length < 6) return null;

        // BODY: the anchor is a real corner, so recover it by intersecting the
        // shoulder's -7mm line with the armhole's -7mm line - a plain
        // perpendicular offset lands short of a corner.
        // SLEEVE: the cap top is smooth, that intersection is ill-conditioned,
        // and it shifted the anchor ~25pt off centre - which sent each side's
        // walk to the FAR edge of a centred unit (42mm instead of 33mm). Take
        // the perpendicular -7mm point there, which is what a smooth curve wants.
        var iT = inset[ti], S = iT;
        if (!isSleeve) {
            var b1 = inset[(ti - dir * 4 + n) % n], b2 = inset[(ti - dir * 16 + n) % n];
            var X = _smLineIntersect(b1, b2, A[0], A[Math.min(9, A.length - 1)]);
            if (X && Math.sqrt((X[0] - iT[0]) * (X[0] - iT[0]) + (X[1] - iT[1]) * (X[1] - iT[1])) <= 20 * SM_MM) S = X;
        }

        return _smMeasureFromSA(S, A, polys, firstBoundary, occluders);
    }

    // Mirror of _smMeasureAlongEdge: measures D from the TOP (shoulder/cap-
    // apex) corner, walking DOWN toward the underarm instead of up from it.
    // Same seam-corner line-intersection trick and the same shared
    // _smMeasureFromSA tail - only the direction and the "trough" stop
    // condition (descend, then start climbing back up = past the underarm)
    // differ from the bottom version.
    function _smMeasureFromTop(outline, inset, cornerTop, polys, panelH, firstBoundary, occluders) {
        var n = outline.length;
        if (n < 8 || inset.length !== n || polys.length === 0) return null;
        var idx = 0, best = 1e12;
        for (var i = 0; i < n; i++) {
            var ddx = outline[i][0] - cornerTop[0], ddy = outline[i][1] - cornerTop[1];
            var d2 = ddx * ddx + ddy * ddy;
            if (d2 < best) { best = d2; idx = i; }
        }
        function fall(dir) {
            var r = 0, j = idx;
            for (var s = 0; s < 6; s++) { var k = (j + dir + n) % n; r += outline[j][1] - outline[k][1]; j = k; }
            return r;
        }
        var dir = (fall(1) >= fall(-1)) ? 1 : -1;

        var armIdx = [idx];
        var startY = outline[idx][1], troughY = startY;
        var j2 = idx, win = [];
        for (var s2 = 1; s2 < n; s2++) {
            j2 = (j2 + dir + n) % n;
            var cur = outline[j2];
            if (cur[1] < troughY) troughY = cur[1];
            if (cur[1] > troughY + 2) break;
            win.push(cur);
            if (win.length > 7) win.splice(0, 1);
            if (panelH && (startY - cur[1]) > 0.15 * panelH && win.length === 7) {
                var runH = Math.abs(win[6][0] - win[0][0]), runV = Math.abs(win[6][1] - win[0][1]);
                if ((runH + runV) > 1 && runV < 0.3 * runH) break;
            }
            armIdx.push(j2);
        }
        if (armIdx.length < 12) return null;

        var A = [];
        for (var k = 3; k < armIdx.length; k++) A.push(inset[armIdx[k]]);
        var b1 = inset[(idx - dir * 4 + n) % n], b2 = inset[(idx - dir * 16 + n) % n];
        var S = _smLineIntersect(b1, b2, A[0], A[Math.min(9, A.length - 1)]);
        var iC = inset[idx];
        if (!S || Math.sqrt((S[0] - iC[0]) * (S[0] - iC[0]) + (S[1] - iC[1]) * (S[1] - iC[1])) > 20 * SM_MM) S = iC;

        return _smMeasureFromSA(S, A, polys, firstBoundary, occluders);
    }

    // The customer's pen-tool mark: the point on the walked seam section A
    // whose straight-line distance from the seam corner S equals dist. Returns
    // null when dist lies beyond the walked edge.
    function _smPointAtChord(S, A, dist) {
        function ch(p) { return Math.sqrt((p[0] - S[0]) * (p[0] - S[0]) + (p[1] - S[1]) * (p[1] - S[1])); }
        var prev = A[0], prevC = ch(prev);
        if (prevC >= dist) return prev;
        for (var i = 1; i < A.length; i++) {
            var c = ch(A[i]);
            if (c >= dist) {
                var f = (c === prevC) ? 0 : (dist - prevC) / (c - prevC);
                return [prev[0] + (A[i][0] - prev[0]) * f, prev[1] + (A[i][1] - prev[1]) * f];
            }
            prev = A[i]; prevC = c;
        }
        return null;
    }

    // Measures ONE unit's D against ONE side's corner pair (bottom + top,
    // whichever is available), picking whichever end the unit sits closer
    // to as both its target distance and its anchor (top -> the matching
    // sleeve corner's OWN top corner, bottom -> its OWN bottom corner - see
    // smApplyOneUnit/smApplySleeveMatch). Returns null if the unit doesn't
    // reach this side's seam line from either end at all.
    function _smMeasureUnitD(outline, seam, corners, side, unitPolys, panelH, occluders, isSleeve) {
        var cB = (side === "left") ? corners.L : corners.R;
        var cT = (side === "left") ? corners.Ltop : corners.Rtop;
        var mB = cB ? _smMeasureAlongEdge(outline, seam, cB, unitPolys, panelH, true, occluders) : null;
        // The legacy "top" candidate (via _uaWalkDown's Ltop/Rtop) is NOT
        // measured any more. _uaWalkDown lands on the hem/cuff - 0% of panel
        // height on every panel tested - so it never produced a real answer,
        // but it sat in the same min() as the good candidates where any bogus
        // small value would have won. The armhole-top anchor below replaces it.
        var mT = null;
        // APEX candidate (both directions): artwork sitting on the top of the
        // armhole/cap belongs to the shoulder end of the seam, and its distance
        // is only meaningful measured from there - see _smMeasureFromApex.
        // Without this a centred sleeve stripe has no anchor at all: it is far
        // from both underarm corners and the "top" corners are unusable
        // (_uaWalkDown lands on the hem/cuff on real panels - measured on job
        // 33d99084: Ltop/Rtop at 0% of panel height on BOTH the front and the
        // sleeve), so the unit came back "no-reach" and never matched.
        var mA = cB ? _smMeasureFromArmholeTop(outline, seam, cB, unitPolys, panelH, true, occluders, isSleeve) : null;
        var hasB = mB && mB.covered, hasT = mT && mT.covered, hasA = mA && mA.covered;
        if (!hasB && !hasT && !hasA) return null;
        if ((hasB && mB.full) || (hasT && mT.full) || (hasA && mA.full)) {
            // Carry the coverage detail out with the verdict instead of
            // dropping it. Which anchor declared "full", and how much of its
            // walk was really inside the unit, is the only way to tell a
            // genuine full-edge unit from a misread - and a rotated shoulder
            // band now reaches the armhole-top corner, which sends
            // _smMeasureFromSA down its "started inside" path.
            var _cv = null, _which = "";
            if (hasB && mB.full) { _cv = mB.cov; _which = "bottom"; }
            else if (hasA && mA.full) { _cv = mA.cov; _which = "armholetop"; }
            return { full: true, cov: _cv, covFrom: _which };
        }
        // "jo km ho d, whn se measure krna start krna" - the nearest end of this
        // side's seam wins: its underarm corner, or its armhole TOP corner.
        var best = null;
        if (hasB) best = { d: mB.d, anchor: "bottom", full: false };
        if (hasT && (!best || mT.d < best.d)) best = { d: mT.d, anchor: "top", full: false };
        if (hasA && (!best || mA.d < best.d)) best = { d: mA.d, anchor: "armholetop", full: false };
        return best;
    }

    // Measures every unit's D on the BACK panel's RIGHT armhole ONLY (user-
    // confirmed simplification: the front, the other side and both of a
    // sleeve's own corners are mirror-symmetric to it, so this single
    // measurement is reused everywhere else - see smApplySleeveMatch). Runs
    // once per size (cached in sleeveMatchD).
    //
    // BACK, not front, on explicit instruction: the back carries the same
    // armhole design, and on a FULL-BUTTON jersey the back is still one whole
    // panel while the front is split into two halves. Measuring the back means
    // the same code covers both garment types - a half-front has only one real
    // armhole (the other side is the straight centre cut), which would need the
    // armhole side chosen explicitly and would defeat the left/right symmetry
    // checks in _smFindCorners and _smSeamCorner.
    function smMeasureBodyD(design, panelPath, sizeLabel, partName) {
        try {
            if (sleeveMatchD[sizeLabel]) return;
            if (!isBack(partName)) return;
            var triedKey = sizeLabel + "|" + partName;
            if (smBodyTried[triedKey]) return; // identical geometry per instance - measure/warn once
            smBodyTried[triedKey] = true;

            var corners = _smFindCorners(panelPath, partName + " " + sizeLabel);
            if (!corners) { smWarn(sizeLabel, partName, "underarm corners not detected on the body panel - sleeves of this size will render without matching"); return; }
            var outline = _smSampleOutline(panelPath, 32);
            if (outline.length < 8) { smWarn(sizeLabel, partName, "could not sample the panel outline - sleeves of this size will render without matching"); return; }
            var seam = _smSeamOutline(panelPath, outline, partName + " " + sizeLabel);

            var sets = _smGetUnitSets(design);
            if (!sets) { smWarn(sizeLabel, partName, "no 'armhole match' group found on this design - sleeves of this size will render without matching"); return; }

            var units = _smUnitsForSide(sets, "right");
            if (units.length === 0) {
                log("SLEEVE-MATCH [" + partName + " " + sizeLabel + "]: no unit found on the right armhole side - sleeves of this size will render without matching.");
                return;
            }
            // VISIBLE-COVERAGE: flatten this design's own z-order once so
            // each unit's D reflects what's actually VISIBLE (not covered
            // by some other design element drawn on top of it) - see
            // _smFlattenZOrder/_smVisibleInAny above. Confirmed against a
            // real mockup: a big base-color unit's raw shape reached all
            // the way to the corner, but the customer's own pen-tool
            // measurement of the visible boundary matched exactly where
            // the NEXT unit (drawn on top of it) stops covering it.
            var zOrder = [];
            _smFlattenZOrder(design, zOrder);
            // NAME-KEYED (customer's convention): "unit1" on Front and
            // "unit1" on the sleeve are the SAME design element by the
            // artist's own naming, not just "whichever is Nth-closest to
            // the corner" - distance-sort position isn't stable across two
            // panels with different shapes (confirmed: it silently paired
            // Front's ribbon unit against the sleeve's plain-path unit).
            // Matching by normalized name is exact and immune to that.
            var byName = {};
            var namedCount = 0;
            for (var u = 0; u < units.length; u++) {
                var nm = _smNorm(units[u].item.name);
                var polys = _smPolysOf([units[u]]);
                if (polys.length === 0) { smWarn(sizeLabel, partName, "unit '" + units[u].item.name + "': could not sample its outline - skipped"); continue; }
                var pad = _smOcclusionPad(units[u].item, corners);
                var occluders = pad ? _smPolysOf(_smOccludersOf(zOrder, units[u].item, pad)) : [];
                var res = _smMeasureUnitD(outline, seam, corners, "right", polys, corners.H, occluders);
                if (!res) { log("SLEEVE-MATCH [" + partName + " " + sizeLabel + "] '" + units[u].item.name + "': does not reach the armhole edge."); continue; }
                res.gap = _smRibbonGap(units[u].item); // null unless this unit is a 2-rail ribbon (Outline Stroke/Expand) - see _smIsRibbonUnit
                byName[nm] = res;
                // Tag-stripped alias so an untagged sleeve unit ("unit 1") can
                // still find a tagged body unit's measurement - the mirror of
                // the sleeve-side fallback in _smTargetFor. Never overwrites a
                // real measurement stored under that exact name.
                var bn = _smBaseName(nm);
                if (bn !== nm && !byName[bn]) byName[bn] = res;
                namedCount++;
                if (res.full) {
                    // SM-COV extras: the unit's own painted box and whether its
                    // path is closed. 35/35 samples reading "inside" cannot come
                    // from a band that only sits on the shoulder, so the next
                    // thing to rule out is the POLYGON: an OPEN path gets closed
                    // from its last point straight back to its first, which
                    // sweeps a huge phantom area across the whole panel.
                    var _ub = "?", _closed = "?";
                    try { var _b = units[u].item.visibleBounds; _ub = "[" + Math.round(_b[0]) + "," + Math.round(_b[1]) + "," + Math.round(_b[2]) + "," + Math.round(_b[3]) + "]"; } catch (eUB) {}
                    try { _closed = units[u].item.closed; } catch (eCL) {}
                    // polys is NESTED: polys[item][subPath][point]. Walk all
                    // three levels - reading it one level too shallow is what
                    // made the previous run report a 1-point polygon.
                    var _pb = "?";
                    try {
                        var _x0 = 1e12, _y0 = 1e12, _x1 = -1e12, _y1 = -1e12, _np = 0, _ns = 0;
                        for (var _s = 0; _s < polys.length; _s++) {
                            var _subs = polys[_s]; _ns += _subs.length;
                            for (var _t = 0; _t < _subs.length; _t++) {
                                var _pl = _subs[_t]; _np += _pl.length;
                                for (var _q = 0; _q < _pl.length; _q++) {
                                    if (_pl[_q][0] < _x0) _x0 = _pl[_q][0];
                                    if (_pl[_q][0] > _x1) _x1 = _pl[_q][0];
                                    if (_pl[_q][1] < _y0) _y0 = _pl[_q][1];
                                    if (_pl[_q][1] > _y1) _y1 = _pl[_q][1];
                                }
                            }
                        }
                        if (_np > 0) _pb = "[" + Math.round(_x0) + "," + Math.round(_y1) + "," + Math.round(_x1) + "," + Math.round(_y0) + "] subs=" + _ns + " pts=" + _np;
                        else _pb = "EMPTY subs=" + _ns;
                    } catch (ePB) {}
                    var _walk = "";
                    if (res.cov && res.cov.S) {
                        function _pt(p) { if (!p) return "?"; return "(" + Math.round(p[0]) + "," + Math.round(p[1]) + ")"; }
                        _walk = " | walk S=" + _pt(res.cov.S) + " A0=" + _pt(res.cov.A0) + " Aend=" + _pt(res.cov.A1);
                    }
                    log("SLEEVE-MATCH [" + partName + " " + sizeLabel + "] '" + units[u].item.name + "': covers the full edge." +
                        (res.covFrom ? " SM-COV from=" + res.covFrom : "") +
                        (res.cov ? " startedInside=" + res.cov.startIn + " samplesInside=" + res.cov.nIn + "/" + res.cov.nTot : "") +
                        " | unitBounds=" + _ub + " closed=" + _closed + " polyBox=" + _pb + _walk);
                }
                else log("SLEEVE-MATCH [" + partName + " " + sizeLabel + "] '" + units[u].item.name + "': D = " + _smMM(res.d) + "mm (" + res.anchor + " anchor)" + (res.gap != null ? ", ribbon gap = " + _smMM(res.gap) + "mm" : "") + ".");
            }
            if (namedCount === 0) {
                log("SLEEVE-MATCH [" + partName + " " + sizeLabel + "]: no unit reached the armhole edge - sleeves of this size will render without matching.");
                return;
            }
            // D-CHAIN (report only): the same right armhole, written out the way
            // the customer measures it by hand - corner->unit1, unit1's length,
            // unit1->unit2, unit2's length, ... A unit sitting ON the corner
            // simply reads corner->unit = 0 and its own length after that.
            _smLogDChain(partName + " " + sizeLabel + " right armhole", outline, seam, corners.R, corners.H, units, corners, zOrder);
            sleeveMatchD[sizeLabel] = { byName: byName, fromPart: partName };
            log("SLEEVE-MATCH: stored " + namedCount + " unit target(s) for size " + sizeLabel + " from " + partName + "'s right armhole (mirrored to the other side and to the front).");
        // parmBail FIRST: this catch sits between _smSeamOutline and the panel
        // rollback loop, so without it a PARM raised down there would be turned
        // into a warning here and the rebuild would never happen. No-op for
        // everything that is not a PARM, which still becomes a warning.
        } catch (e) { parmBail(e, "measuring the body armhole"); smWarn(sizeLabel, partName, "error while measuring body D: " + e.message); }
    }

    // After a panel's units are all independently placed, flags (never
    // blocks) any pair whose bounding boxes now overlap - independent
    // moves can converge on the same spot when their solves diverge in
    // opposite directions.
    function _smWarnOverlaps(boxes, sizeLabel, label) {
        for (var i = 0; i < boxes.length; i++) {
            for (var j = i + 1; j < boxes.length; j++) {
                var a = boxes[i].b, b = boxes[j].b;
                if (!a || !b) continue;
                var ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
                var oy = Math.min(a[1], b[1]) - Math.max(a[3], b[3]);
                if (ox > SM_MM && oy > SM_MM) {
                    smWarn(sizeLabel, label, boxes[i].label + " and " + boxes[j].label + " now overlap after independent matching - check them manually");
                }
            }
        }
    }

    // Generic per-unit solver: art is slid (and, for big mismatches,
    // uniformly resized) until every entry in `targets` reads within
    // +/-1mm of its own target D - never one target fixed at another's
    // expense. targets.length === 1 for a single-corner (tagged) unit;
    // === 2 for a continuous unit that crosses both of THIS panel's
    // corners at once (2-axis solve, same principle the old MATCH-named
    // flow used). Each targets[i] = { corner, cornerTop, d, anchor } -
    // anchor ("top"/"bottom") was decided once back on the body
    // measurement and is reused as-is so a unit never flip-flops mid-solve.
    function _smSolveUnit(art, targets, outline, seam, corners, panelH, sizeLabel, label, unitLabel, occluders, allowHorizontal) {
        // WHICH CORRECTIONS THIS SOLVE MAY USE - see SM_MODE's own note up top.
        // In "auto" the sideways slide stays limited to left/right-TAGGED units
        // (a continuous piece must stay centered); the three explicit modes
        // ignore the tagging and allow exactly the one correction the user
        // picked for this article.
        // AXIS RULE (explicit instruction): a left/right-TAGGED unit moves ONLY
        // sideways (either direction - the left copy and the right copy run
        // through this same mirrored path, never two separate rules), and a
        // continuous "unit 1" moves ONLY up/down because it has to stay centered.
        // No cross-axis fallback either way: if the allowed axis cannot close the
        // gap, the resize takes over, and if that fails too the unit is left
        // alone with a warning.
        var tagged = (allowHorizontal === true);
        var allowSlideX = (SM_MODE === "horizontal") || (SM_MODE === "auto" && tagged);
        var allowSlideY = (SM_MODE === "vertical") || (SM_MODE === "auto" && !tagged);
        var allowResize = (SM_MODE === "resize") || (SM_MODE === "auto");
        function measureOne(t) {
            var polys = _smPolysOf(art);
            // The solver itself is anchor-agnostic - it just needs the same
            // measurement the body target was taken with, so the sleeve's own
            // apex/corner is used to mirror whichever end the body used.
            if (t.anchor === "armholetop") return _smMeasureFromArmholeTop(outline, seam, t.corner, polys, panelH, true, occluders, t.isSleeve);
            if (t.anchor === "top") return _smMeasureFromTop(outline, seam, t.cornerTop, polys, panelH, true, occluders);
            return _smMeasureAlongEdge(outline, seam, t.corner, polys, panelH, true, occluders);
        }
        function measureAll() {
            var out = [];
            for (var i = 0; i < targets.length; i++) out.push(measureOne(targets[i]));
            return out;
        }
        function valid(ms) {
            for (var i = 0; i < ms.length; i++) if (!ms[i] || !ms[i].covered) return false;
            return true;
        }
        function within(ms) {
            for (var i = 0; i < ms.length; i++) if (Math.abs(targets[i].d - ms[i].d) > SM_TOL_PT) return false;
            return true;
        }
        function residual(ms) {
            var s = 0; for (var i = 0; i < ms.length; i++) s += Math.abs(targets[i].d - ms[i].d);
            return s;
        }

        var ms = measureAll();
        if (!valid(ms) && targets.length === 1) {
            // RESCUE (customer's ask, corrected): if the unit doesn't touch
            // the walked seam section at all yet, the normal iterative
            // solve below never gets a first foothold to start from - it
            // needs a real move just to make contact. Don't ASSUME which
            // direction is correct (an earlier version guessed "always up"
            // from one lucky case - no reason that holds for every
            // unit/size) - actually test both directions of an axis, at a
            // growing distance from the ORIGINAL position (not cumulative
            // drift), and commit to whichever direction makes contact
            // first. PRIORITY (customer's ask): a left/right-TAGGED unit
            // isn't required to stay centered, so try the horizontal axis
            // FIRST, then fall back to vertical only if neither horizontal
            // direction ever makes contact; a continuous (untagged) unit
            // never gets a horizontal try at all - vertical only, same as
            // its normal solve below. Not undo-tracked (matches the
            // occluder-move exception below), so even if the solve still
            // can't reach +/-1mm afterward, the unit is left as close to
            // the seam as this search got instead of untouched.
            function rescueAxis(axIsX) {
                // 60% SEARCH (customer's ask): a flat 30% cap left some units
                // permanently unrescued even though a bigger move would have
                // made contact. 100% of corners.H (full panel height) was
                // tried and overshot - it let the rescue travel far enough to
                // drag the unit past its natural position (XL Short Sleeve
                // 'unit 4' ended up dead straight instead of following the
                // body's own angled seam). 60% is the compromise cap.
                var rGuard = 0.60 * corners.H;
                var rStep = Math.max(5 * SM_MM, 0.01 * corners.H);
                var rTotal = 0;
                while (!valid(ms) && rTotal < rGuard) {
                    var tryTotal = Math.min(rTotal + rStep, rGuard);
                    var pdx = axIsX ? tryTotal : 0, pdy = axIsX ? 0 : tryTotal;
                    _smShiftArt(art, pdx, pdy);
                    var msPos = measureAll();
                    _smShiftArt(art, -pdx, -pdy);
                    _smShiftArt(art, -pdx, -pdy);
                    var msNeg = measureAll();
                    _smShiftArt(art, pdx, pdy);
                    if (valid(msPos)) { _smShiftArt(art, pdx, pdy); ms = msPos; return { total: tryTotal, dir: 1 }; }
                    if (valid(msNeg)) { _smShiftArt(art, -pdx, -pdy); ms = msNeg; return { total: tryTotal, dir: -1 }; }
                    rTotal = tryTotal;
                    rStep *= 1.6; // grow the search
                }
                return null;
            }
            var rescueResult = null, rescueAxisName = "";
            if (allowSlideX) { rescueResult = rescueAxis(true); rescueAxisName = "left/right"; }
            if (!rescueResult && allowSlideY) { rescueResult = rescueAxis(false); rescueAxisName = "up/down"; }
            if (rescueResult) log("SLEEVE-MATCH [" + unitLabel + "]: rescued - moved " + _smMM(rescueResult.total) + "mm (" + rescueAxisName + (rescueResult.dir > 0 ? ", positive" : ", negative") + " direction) to make first contact with the seam.");
        }
        if (!valid(ms)) { smWarn(sizeLabel, label, unitLabel + ": artwork does not reach the seam - rendered without matching"); return; }

        var guard = 0.30 * corners.H; // never wander more than 30% of the panel height
        var totalX = 0, totalY = 0, totalScale = 1, iter = 0;
        var ops = []; // exact do-history so a failed match can be undone precisely
        // BEST-EFFORT TRACKING: a solve that can't reach the +/-1mm tolerance
        // used to just revert to the untouched original - throwing away every
        // partial improvement a slide/resize DID make along the way, which
        // looked like "nothing happened at all". bestLen is the ops[] length
        // at the lowest total residual seen; on failure we unwind down to
        // THAT point instead of all the way to zero, so the art always ends
        // up at the closest position/size this solve ever actually reached.
        var bestResidual = residual(ms), bestLen = 0;
        function checkpoint() {
            if (!valid(ms)) return;
            var r = residual(ms);
            if (r < bestResidual) { bestResidual = r; bestLen = ops.length; }
        }
        function undoOp(op) {
            if (op[0] === 0) { _smShiftArt(art, -op[1], -op[2]); totalX -= op[1]; totalY -= op[2]; }
            else { _smScaleArt(art, 1 / op[1], op[2], op[3], op[4]); totalScale /= op[1]; }
        }
        function opShift(dx, dy) { _smShiftArt(art, dx, dy); ops.push([0, dx, dy]); totalX += dx; totalY += dy; }
        function opScale(s, ax, ay, wo) { _smScaleArt(art, s, ax, ay, wo); ops.push([1, s, ax, ay, wo]); totalScale *= s; }
        // If a step loses seam coverage entirely (mid-solve ms goes invalid -
        // e.g. a slide pushed the unit past the end of the walked seam
        // section), undo JUST that one step immediately instead of leaving an
        // unmeasurable state behind for the next within(ms)/checkpoint() call
        // to choke on. Returns false to tell the calling phase to stop.
        function stepAndMeasure() {
            ms = measureAll();
            if (!valid(ms)) { undoOp(ops.pop()); ms = measureAll(); return false; }
            checkpoint();
            return true;
        }

        // PROPORTIONAL RESIZE: anchored at the art's TOP-CENTER so its top
        // keeps its coverage while the crossings move. Newton on the AVERAGE
        // residual across all targets; the slide solve afterwards handles
        // any remaining per-target difference.
        //
        // WIDTH-ONLY for a TOP-anchored target: at the top of a cap/armhole the
        // seam runs roughly horizontally, so D is set by the unit's width and
        // its height is irrelevant to the match - scaling height there only
        // shortens artwork that is drawn to run the full panel (see
        // _smScaleArt). Bottom-anchored targets keep the uniform resize.
        function scaleRounds() {
            if (!valid(ms)) return;
            var widthOnly = false;
            for (var wi = 0; wi < targets.length; wi++) if (targets[wi].anchor === "armholetop") widthOnly = true;
            // "resize" mode is PROPORTIONAL by definition (user's wording:
            // "small kr skte he or bra proportionally") - the top-anchored
            // width-only shortcut would change the shape, which is exactly what
            // the explicit mode exists to avoid.
            if (SM_MODE === "resize") widthOnly = false;
            var abnd = null;
            for (var ab = 0; ab < art.length; ab++) {
                try {
                    var bb = art[ab].item.geometricBounds;
                    if (!abnd) abnd = [bb[0], bb[1], bb[2], bb[3]];
                    else {
                        if (bb[0] < abnd[0]) abnd[0] = bb[0];
                        if (bb[1] > abnd[1]) abnd[1] = bb[1];
                        if (bb[2] > abnd[2]) abnd[2] = bb[2];
                        if (bb[3] < abnd[3]) abnd[3] = bb[3];
                    }
                } catch (eAb) {}
            }
            if (!abnd) return;
            var aX = (abnd[0] + abnd[2]) / 2, aY = abnd[1];
            var round = 0;
            while (!within(ms) && round < 5) {
                round++; iter++;
                var rSum = 0; for (var ri = 0; ri < ms.length; ri++) rSum += (targets[ri].d - ms[ri].d);
                var rAvg = rSum / ms.length;
                if (Math.abs(rAvg) <= SM_TOL_PT) return;
                var sProbe = 1.01;
                _smScaleArt(art, sProbe, aX, aY, widthOnly);
                var msS = measureAll();
                _smScaleArt(art, 1 / sProbe, aX, aY, widthOnly);
                if (!valid(msS)) return;
                var gSum = 0; for (var gi = 0; gi < ms.length; gi++) gSum += (msS[gi].d - ms[gi].d);
                var gAvg = (gSum / ms.length) / (sProbe - 1);
                if (Math.abs(gAvg) < 1e-6) return;
                var sStep = 1 + rAvg / gAvg;
                if (sStep > 1.1) sStep = 1.1;
                if (sStep < 0.9) sStep = 0.9;
                // TOTAL resize cap, +/-45% (was +25%/-20%, then +/-30%). Raised
                // on explicit instruction, twice, and the second time only after
                // the ANCHOR was fixed - at +/-30% Large/XL/2XL on job ce816a24
                // still fell 3.6/2.9/3.8mm short, needing ~41%/38.5%/41%.
                // Those gaps are real geometry, not a mis-measurement: the front
                // design scales with front HEIGHT (2128->2557pt across sizes)
                // while the sleeve's barely does (763->816pt), so the two drift
                // further apart the bigger the size. The cap still exists so a
                // wildly mis-drawn unit warns instead of being stretched into
                // nonsense; only its width changed.
                if (totalScale * sStep > 1.45) sStep = 1.45 / totalScale;
                if (totalScale * sStep < 0.55) sStep = 0.55 / totalScale;
                if (Math.abs(sStep - 1) < 0.0005) return;
                opScale(sStep, aX, aY, widthOnly);
                if (!stepAndMeasure()) return;
            }
        }

        // SLIDE: 1 target -> move along the seam toward the customer's
        // pen-tool mark (like the original single-side loop). 2 targets ->
        // 2-axis solve (up/down AND left/right at once - the two corners
        // respond differently to each axis, so solving the 2x2 system hits
        // BOTH at once; an average-of-both move stalls whenever the two
        // corners' curves differ, which is every real cap).
        function solveByTranslation(maxIter) {
            if (!allowSlideX && !allowSlideY) return; // resize-only mode: nothing may move
            var it2 = 0;
            while (!within(ms) && it2 < maxIter) {
                it2++; iter++;
                var dx, dy;
                if (targets.length === 2) {
                    var probe = 2;
                    _smShiftArt(art, probe, 0); var mx = measureAll(); _smShiftArt(art, -probe, 0);
                    _smShiftArt(art, 0, probe); var my = measureAll(); _smShiftArt(art, 0, -probe);
                    if (!valid(mx) || !valid(my)) return;
                    var jA = (mx[0].d - ms[0].d) / probe, jB = (my[0].d - ms[0].d) / probe;
                    var jC = (mx[1].d - ms[1].d) / probe, jD = (my[1].d - ms[1].d) / probe;
                    var rL = targets[0].d - ms[0].d, rR = targets[1].d - ms[1].d;
                    var det = jA * jD - jB * jC;
                    if (Math.abs(det) > 1e-4) {
                        dx = (rL * jD - jB * rR) / det;
                        dy = (jA * rR - rL * jC) / det;
                    } else {
                        // Degenerate geometry (both corners react identically):
                        // fall back to the legacy along-edge averaged move.
                        var T0 = ms[0].E ? _smPointAtChord(ms[0].S, ms[0].A, targets[0].d) : null;
                        var T1 = ms[1].E ? _smPointAtChord(ms[1].S, ms[1].A, targets[1].d) : null;
                        var vx = 0, vy = 0, n = 0;
                        if (T0) { vx += T0[0] - ms[0].E[0]; vy += T0[1] - ms[0].E[1]; n++; }
                        if (T1) { vx += T1[0] - ms[1].E[0]; vy += T1[1] - ms[1].E[1]; n++; }
                        if (n === 0) return;
                        dx = vx / n; dy = vy / n;
                    }
                } else {
                    // SINGLE-TARGET (customer's ask): no left/right slide - the
                    // mockup's units aren't left/right-tagged pieces, they're
                    // one design meant to stay centered on the panel, so a
                    // horizontal correction here would push it off-center.
                    // Only vertical (up/down) position error is corrected by
                    // sliding; any remaining along-the-curve distance is
                    // closed by scaleRounds' proportional resize instead.
                    //
                    // TRY DIRECTIONS, PRIORITY-ORDERED (customer's ask):
                    // don't extrapolate a single Newton step from a tiny 2pt
                    // probe - on a curved, non-linear seam that risks a
                    // badly wrong direction/size (confirmed: after a big
                    // ribbon-gap resize threw the residual out to 45mm, a
                    // Newton extrapolation from a 2pt probe couldn't recover
                    // it). Instead take REAL trial steps and commit to
                    // whichever direction genuinely reduces the residual
                    // most. PRIORITY: a left/right-TAGGED unit (allowHorizontal)
                    // isn't required to stay centered, so try horizontal
                    // FIRST and only fall back to vertical if neither
                    // horizontal direction helps; a continuous (untagged)
                    // unit never tries horizontal at all - vertical only,
                    // same rule as everywhere else in this solve. Re-runs
                    // every iteration, so the step shrinks naturally as the
                    // residual does - a coarse search along the seam
                    // instead of a one-shot guess.
                    var r0 = targets[0].d - ms[0].d; // signed residual - want this driven to 0
                    var r0abs = Math.abs(r0);
                    if (r0abs <= SM_TOL_PT) return;
                    var trialStep = Math.min(Math.max(r0abs * 0.6, 2), 0.15 * corners.H);
                    function tryDir(shiftArt, tdx, tdy) {
                        _smShiftArt(shiftArt, tdx, tdy);
                        var mt = measureAll();
                        _smShiftArt(shiftArt, -tdx, -tdy);
                        if (!valid(mt) || !mt[0]) return null;
                        return Math.abs(targets[0].d - mt[0].d);
                    }
                    function bestOf(shiftArt, axIsX) {
                        var pdx = axIsX ? trialStep : 0, pdy = axIsX ? 0 : trialStep;
                        var rPos = tryDir(shiftArt, pdx, pdy), rNeg = tryDir(shiftArt, -pdx, -pdy);
                        var b = { dx: 0, dy: 0, r: r0abs };
                        if (rPos !== null && rPos < b.r) { b.dx = pdx; b.dy = pdy; b.r = rPos; }
                        if (rNeg !== null && rNeg < b.r) { b.dx = -pdx; b.dy = -pdy; b.r = rNeg; }
                        return b.r < r0abs ? b : null;
                    }
                    var best = null;
                    if (allowSlideX) best = bestOf(art, true);
                    if (!best && allowSlideY) best = bestOf(art, false);

                    // OCCLUDED UNIT (customer's diagnosis, confirmed when no
                    // direction on the unit itself helps): sliding THIS unit
                    // only tucks it further under/out from whatever's drawn
                    // in front of it - its own visible crossing barely moves
                    // because what's actually visible there is bounded by
                    // the OCCLUDER's edge, not this unit's own edge. Try
                    // moving the occluder the same priority-ordered way
                    // instead - it directly controls where that visible
                    // boundary falls. Applied straight to the occluder (not
                    // through this solve's own ops/undo bookkeeping, which
                    // only tracks `art`) since it's a different object; left
                    // in place even if this unit's own solve ultimately
                    // fails, since it's a real, physically correct
                    // repositioning of the shape actually responsible for
                    // the boundary.
                    if (!best) {
                        if (!occluders || occluders.length === 0) return;
                        // Try each occluder (largest area first - the tiny
                        // decorative bits that also happen to be technically
                        // "in front" almost never control the visible
                        // boundary; the big shape actually forming the
                        // cutoff edge usually does) until one shows real
                        // sensitivity.
                        var occSorted = occluders.slice().sort(function (a, b) {
                            var aa = 0, ba = 0;
                            try { aa = Math.abs(a.item.width * a.item.height); } catch (eAa) {}
                            try { ba = Math.abs(b.item.width * b.item.height); } catch (eBa) {}
                            return ba - aa;
                        });
                        var moved = false;
                        for (var oi = 0; oi < occSorted.length && !moved; oi++) {
                            var occArt = [occSorted[oi]];
                            var oBest = allowSlideX ? bestOf(occArt, true) : null;
                            if (!oBest && allowSlideY) oBest = bestOf(occArt, false);
                            if (!oBest) continue;
                            _smShiftArt(occArt, oBest.dx, oBest.dy);
                            ms = measureAll();
                            checkpoint();
                            moved = true;
                        }
                        if (!moved) return; // no occluder controls this boundary either - genuinely stuck
                        continue; // re-evaluate from scratch next iteration - another step (own or occluder) may still be needed
                    }

                    dx = best.dx; dy = best.dy;
                }
                var stepLen = Math.sqrt(dx * dx + dy * dy);
                var maxStep = 0.15 * corners.H;
                if (stepLen > maxStep) { dx *= maxStep / stepLen; dy *= maxStep / stepLen; }
                var nX = totalX + dx, nY = totalY + dy;
                if (Math.sqrt(nX * nX + nY * nY) > guard) return;
                // STEP-SHRINK RETRY: the full computed step can overshoot past
                // where the art still crosses the walked seam line at all
                // (loses coverage - stepAndMeasure undoes it and reports
                // false). Instead of giving up on the whole solve at that
                // point, retry the SAME direction at half, quarter, eighth...
                // of the step - finds the largest step that still lands on
                // covered ground instead of surrendering after one overshoot.
                var trialDx = dx, trialDy = dy, landed = false;
                for (var shrink = 0; shrink < 5; shrink++) {
                    opShift(trialDx, trialDy);
                    if (stepAndMeasure()) { landed = true; break; }
                    trialDx /= 2; trialDy /= 2;
                    if (Math.abs(trialDx) < 0.05 && Math.abs(trialDy) < 0.05) break; // sub-hundredth-mm, not worth it
                }
                if (!landed) return;
            }
        }

        // Big COMMON mismatch (all targets off by much the same amount)
        // means the mockup drew the art at the wrong size for this panel -
        // resize first (user policy), then fine-slide. Small mismatches
        // are placement errors - the slide alone fixes them.
        //
        // RIBBON UNITS (see _smIsRibbonUnit) are the one exception: resize
        // here is driven purely by the position residual, with no idea of
        // the rail-to-rail gap it's also reshaping - independently-sized
        // resizes on the left-corner copy vs the right-corner copy is
        // exactly what produced the customer-reported uneven stripe width.
        // Position for a ribbon is settled by translation only here; the
        // caller (smApplyOneUnit/smApplySleeveMatch) resizes it afterward
        // through smApplyRibbonGap instead, to the SAME target gap on both
        // corners, then re-runs this solve translate-only again to
        // re-tighten position.
        // TAGGED UNITS ARE THE EXCEPTION (explicit instruction): "jab left and
        // right hoga, to pehle left/right move kiya jayega, phir resize" - a
        // left/right-tagged piece is free to travel along its own side of the
        // seam, so it gets the SLIDE first and keeps the size the artist drew;
        // resize only runs if sliding alone cannot reach the target. The
        // resize-first rule above still governs CONTINUOUS units: those must
        // stay centered (no horizontal slide at all), so a big common residual
        // there really is a wrong-size problem, not a placement one.
        var isRibbon = (art.length === 1 && _smIsRibbonUnit(art[0].item));
        var rSum0 = 0; for (var r0 = 0; r0 < ms.length; r0++) rSum0 += (targets[r0].d - ms[r0].d);
        var rAvg0 = rSum0 / ms.length;
        if (!tagged && allowResize && !isRibbon && Math.abs(rAvg0) > SM_TOL_PT * 3) scaleRounds();
        solveByTranslation(15);
        if (!within(ms)) { if (allowResize && !isRibbon) scaleRounds(); solveByTranslation(15); }

        if (within(ms)) {
            var dTxt = []; for (var dl = 0; dl < ms.length; dl++) dTxt.push(_smMM(ms[dl].d) + "mm");
            log("SLEEVE-MATCH [" + unitLabel + "]: matched at D = " + dTxt.join(", ") + " (moved " + _smMM(Math.sqrt(totalX * totalX + totalY * totalY)) + "mm" + (totalScale !== 1 ? ", resized " + (Math.round(Math.abs(totalScale - 1) * 1000) / 10) + "%" : "") + " in " + iter + " step(s)).");
        } else {
            // BEST-EFFORT: unwind only back to the closest state this solve
            // ever reached (bestLen), never all the way to the untouched
            // original - a failed solve used to mean literally zero change
            // even when a slide/resize got most of the way there.
            while (ops.length > bestLen) undoOp(ops.pop());
            var finalMs = measureAll();
            var offs = [];
            for (var fo = 0; fo < targets.length; fo++) {
                var have = (finalMs[fo] && finalMs[fo].covered) ? finalMs[fo].d : null;
                offs.push(have != null ? _smMM(Math.abs(targets[fo].d - have)) + "mm" : "not covered");
            }
            var movedFinal = Math.sqrt(totalX * totalX + totalY * totalY);
            smWarn(sizeLabel, label, unitLabel + ": could not reach target D within +/-1mm - placed at closest reachable position instead (off by " + offs.join(", ") + ", moved " + _smMM(movedFinal) + "mm" + (totalScale !== 1 ? ", resized " + (Math.round(Math.abs(totalScale - 1) * 1000) / 10) + "%" : "") + ")");
        }
    }

    // RIBBON UNITS (SLEEVE-MATCH only, see _smIsRibbonUnit/_smRibbonGap
    // above): resizes a ribbon in place - anchored at its own bounding-box
    // center, so its just-solved position barely moves - until its own
    // rail-to-rail gap matches t.gap, the SAME value measured once on
    // Front's right armhole (smMeasureBodyD). Called identically for the
    // left-corner copy and the right-corner copy of a design, so both
    // always converge on the exact same width - a real mirror, not two
    // independent solves that happen to usually land close. Returns true
    // if it actually resized anything (caller re-runs the translate-only
    // position solve afterward to re-tighten position, since a gap resize
    // also nudges the seam-crossing point a little).
    function smApplyRibbonGap(art, t, sizeLabel, label, unitLabel) {
        try {
            if (!t || t.gap == null || art.length !== 1) return false;
            // A rail-to-rail width match IS a resize, so the move-only modes skip
            // it - in those the stripe keeps exactly the width the mockup drew.
            if (SM_MODE === "horizontal" || SM_MODE === "vertical") {
                log("SLEEVE-MATCH [" + unitLabel + "]: ribbon width left as drawn (" + SM_MODE + " mode - no resizing).");
                return false;
            }
            var item = art[0].item;
            if (!_smIsRibbonUnit(item)) return false;
            var curGap = _smRibbonGap(item);
            if (!curGap || curGap <= 0) { smWarn(sizeLabel, label, unitLabel + ": could not measure its own rail-to-rail gap - width left unmatched"); return false; }
            var s = t.gap / curGap;
            if (Math.abs(s - 1) < 0.002) return false; // already within ~0.2% of target - not worth a resize
            var b = item.geometricBounds;
            var ax = (b[0] + b[2]) / 2, ay = (b[1] + b[3]) / 2;
            _smScaleArt(art, s, ax, ay);
            log("SLEEVE-MATCH [" + unitLabel + "]: ribbon width matched to " + _smMM(t.gap) + "mm (was " + _smMM(curGap) + "mm).");
            return true;
        } catch (e) { smWarn(sizeLabel, label, unitLabel + ": error while matching ribbon width: " + e.message); return false; }
    }

    // Wraps _smSolveUnit for a single-corner (tagged) unit: one target,
    // this side's own corner pair as the anchor candidates.
    function smApplyOneUnit(art, t, side, corners, outline, seam, sizeLabel, label, unitLabel, appliedBoxes, occluders) {
        var target = {
            corner: (side === "left") ? corners.L : corners.R,
            cornerTop: (side === "left") ? corners.Ltop : corners.Rtop,
            d: t.d, anchor: t.anchor, isSleeve: true
        };
        if (target.anchor === "top" && !target.cornerTop) {
            smWarn(sizeLabel, label, unitLabel + ": body target anchors from the top, but this sleeve panel has no detectable top corner on this side - rendered without matching");
            return;
        }
        if (target.anchor === "armholetop") {
            // Same rule as the continuous branch, scoped to this unit's own side.
            var aSide = _smMeasureFromArmholeTop(outline, seam, target.corner, _smPolysOf(art), corners.H, true, occluders, true);
            if (!aSide || !aSide.covered) {
                smWarn(sizeLabel, label, unitLabel + ": body target anchors from the top of the armhole, but this unit does not reach the top of the sleeve's cap on this side - rendered without matching");
                return;
            }
            log("SLEEVE-MATCH [" + unitLabel + "]: matching from the TOP of the cap (body measured from the top of its armhole).");
        }
        _smSolveUnit(art, [target], outline, seam, corners, corners.H, sizeLabel, label, unitLabel, occluders, true);
        if (smApplyRibbonGap(art, t, sizeLabel, label, unitLabel)) {
            _smSolveUnit(art, [target], outline, seam, corners, corners.H, sizeLabel, label, unitLabel, occluders, true);
        }
        try { appliedBoxes.push({ label: unitLabel, b: art[0].item.geometricBounds }); } catch (e) {}
    }

    // Applies the size's shared target unit list (measured once, on
    // Front's right armhole - see smMeasureBodyD) to a sleeve panel. Two
    // branches:
    //   - CONTINUOUS: this sleeve's own design has no left/right-tagged
    //     units at all - each shared unit crosses BOTH of the sleeve's own
    //     corners at once, so it gets ONE dual-target solve per unit
    //     (never two independent single-target slides that could pull it
    //     apart in opposite directions).
    //   - TAGGED: the sleeve's own left- and/or right-tagged units are
    //     each matched independently, through their own side's corner,
    //     against the SAME shared target list (mirrored, not
    //     re-measured) - so a sleeve's left corner and right corner both
    //     get real, independent placement even though only one body
    //     measurement drives both.
    function smApplySleeveMatch(design, panelPath, sizeLabel, label) {
        try {
            var rec = sleeveMatchD[sizeLabel];
            if (!rec) { smWarn(sizeLabel, label, "no body target available for this size (Back missing, corners undetected, or no armhole-match units found) - rendered without matching"); return; }
            var corners = _smFindCorners(panelPath, label);
            if (!corners) { smWarn(sizeLabel, label, "cap corners not detected on the sleeve panel - rendered without matching"); return; }
            var outline = _smSampleOutline(panelPath, 32);
            if (outline.length < 8) { smWarn(sizeLabel, label, "could not sample the sleeve outline - rendered without matching"); return; }
            var seam = _smSeamOutline(panelPath, outline, label);

            var sets = _smGetUnitSets(design);
            if (!sets) { smWarn(sizeLabel, label, "no 'armhole match' group found on this sleeve's design - rendered without matching"); return; }

            var appliedBoxes = [];
            var usingContinuous = (sets.left.length === 0 && sets.right.length === 0 && sets.continuous.length > 0);

            // VISIBLE-COVERAGE: same z-order flatten as smMeasureBodyD, scoped
            // to THIS sleeve's own pasted design - see _smFlattenZOrder above.
            var zOrder = [];
            _smFlattenZOrder(design, zOrder);

            // DIAGNOSTIC (read-only - no move/resize, purely informational):
            // logs this sleeve panel's OWN native D per real unit name,
            // exactly as currently drawn, BEFORE any matching is attempted -
            // lets a "what does the sleeve currently measure" question be
            // answered straight from the log, without running the solve.
            (function () {
                var allUnits = [].concat(sets.continuous, sets.left, sets.right);
                for (var di = 0; di < allUnits.length; di++) {
                    var dItem = allUnits[di].item;
                    var dPolys = _smPolysOf([allUnits[di]]);
                    var dPad = _smOcclusionPad(dItem, corners);
                    var dOcc = dPad ? _smPolysOf(_smOccludersOf(zOrder, dItem, dPad)) : [];
                    var dL = _smMeasureUnitD(outline, seam, corners, "left", dPolys, corners.H, dOcc, true);
                    var dR = _smMeasureUnitD(outline, seam, corners, "right", dPolys, corners.H, dOcc, true);
                    function dFmt(m) {
                        if (!m) return "no-reach";
                        if (m.full) return "FULL-COVER";
                        return _smMM(m.d) + "mm(" + m.anchor + ")";
                    }
                    log("SLEEVE-MATCH [" + label + "] native (pre-match) '" + (dItem.name || "unnamed") + "': left=" + dFmt(dL) + " right=" + dFmt(dR) + ".");
                }
                // D-CHAIN (report only) for both of this sleeve's own corners,
                // BEFORE anything is moved - compare these against the body's
                // chain logged in smMeasureBodyD.
                _smLogDChain(label + " left cap (pre-match)", outline, seam, corners.L, corners.H, allUnits, corners, zOrder);
                _smLogDChain(label + " right cap (pre-match)", outline, seam, corners.R, corners.H, allUnits, corners, zOrder);
            })();

            if (usingContinuous) {
                // NAME-KEYED (customer's convention): match Front's "unit1"
                // to the sleeve's own "unit1", not by distance-sort position
                // - see the byName comment in smMeasureBodyD above.
                var units = sets.continuous;
                for (var i = 0; i < units.length; i++) {
                    var nm = _smNorm(units[i].item.name);
                    var t = _smTargetFor(rec, nm);
                    var unitLabel = label + " '" + (units[i].item.name || "unnamed") + "'";
                    if (!t) { smWarn(sizeLabel, label, unitLabel + ": no unit named '" + units[i].item.name + "' (or '" + _smBaseName(nm) + "') found on the body reference - rendered without matching"); continue; }
                    var art = [units[i]];
                    var pad = _smOcclusionPad(units[i].item, corners);
                    var occluders = pad ? _smPolysOf(_smOccludersOf(zOrder, units[i].item, pad)) : [];
                    if (t.full) {
                        var mFL = _smMeasureUnitD(outline, seam, corners, "left", _smPolysOf(art), corners.H, occluders, true);
                        var mFR = _smMeasureUnitD(outline, seam, corners, "right", _smPolysOf(art), corners.H, occluders, true);
                        if (mFL && mFL.full && mFR && mFR.full) log("SLEEVE-MATCH [" + unitLabel + "]: full-edge coverage on both corners - OK.");
                        else smWarn(sizeLabel, label, unitLabel + ": body covers the full armhole but the sleeve does not - rendered without matching");
                        continue;
                    }
                    // LEFT-ANCHORED (customer's ask): a continuous unit is ONE
                    // rigid piece crossing both corners, and the mockup's own
                    // left/right crossings are rarely pixel-identical (real
                    // hand-drawn art, a couple mm of natural asymmetry - see
                    // the base-path-vs-unit center-offset finding). Solving a
                    // 2x2 system to force BOTH corners onto the target at once
                    // let the two corners pull the shift in different
                    // directions (confirmed: an 8mm ribbon-width fix triggered
                    // an unexpected 28mm secondary correction). Solving the
                    // LEFT corner alone and letting the single resulting
                    // shift+scale carry the whole piece is guaranteed
                    // mirror-consistent by construction - right ends up
                    // wherever that one rigid transform puts it, not
                    // independently re-aimed.
                    var targets = [
                        { corner: corners.L, cornerTop: corners.Ltop, d: t.d, anchor: t.anchor, isSleeve: true }
                    ];
                    if (targets[0].anchor === "top" && !targets[0].cornerTop) {
                        smWarn(sizeLabel, label, unitLabel + ": body target anchors from the top, but this sleeve panel has no detectable top corner - rendered without matching");
                        continue;
                    }
                    if (targets[0].anchor === "armholetop") {
                        // Same anchor, derived from this panel's OWN walk: on a
                        // sleeve the armhole walk ends at the cap apex, which is
                        // where the shoulder is sewn - the counterpart of the
                        // body's shoulder-tip corner.
                        var aNow = _smMeasureFromArmholeTop(outline, seam, corners.L, _smPolysOf(art), corners.H, true, occluders, true);
                        if (!aNow || !aNow.covered) {
                            smWarn(sizeLabel, label, unitLabel + ": body target anchors from the top of the armhole, but this unit does not reach the top of the sleeve's cap - rendered without matching");
                            continue;
                        }
                        log("SLEEVE-MATCH [" + unitLabel + "]: matching from the TOP of the cap (body measured from the top of its armhole), currently " +
                            _smMM(aNow.d) + "mm vs target " + _smMM(t.d) + "mm.");
                    }
                    _smSolveUnit(art, targets, outline, seam, corners, corners.H, sizeLabel, label, unitLabel, occluders);
                    if (smApplyRibbonGap(art, t, sizeLabel, label, unitLabel)) {
                        _smSolveUnit(art, targets, outline, seam, corners, corners.H, sizeLabel, label, unitLabel, occluders);
                    }
                    // POST-MATCH VERIFY (both sides). A continuous unit is solved
                    // against the LEFT corner only and the single rigid transform
                    // is trusted to carry the right - true for a pure resize about
                    // the unit's own centre, but a translation step moves the unit
                    // off centre and the two sides then differ. Nothing logged
                    // that, so "is the other side also on target?" could only be
                    // answered by re-opening the file and measuring. Now it is in
                    // the log for every unit, every size.
                    try {
                        var vPolys = _smPolysOf(art);
                        var vL = _smMeasureUnitD(outline, seam, corners, "left", vPolys, corners.H, occluders, true);
                        var vR = _smMeasureUnitD(outline, seam, corners, "right", vPolys, corners.H, occluders, true);
                        function vFmt(m) { return m ? (m.full ? "FULL" : _smMM(m.d) + "mm(" + m.anchor + ")") : "no-reach"; }
                        var vGap = (vL && vR && !vL.full && !vR.full) ? (" | L/R differ by " + _smMM(Math.abs(vL.d - vR.d)) + "mm") : "";
                        log("SLEEVE-MATCH [" + unitLabel + "] VERIFY after match: left=" + vFmt(vL) +
                            " right=" + vFmt(vR) + " (target " + _smMM(t.d) + "mm)" + vGap + ".");
                    } catch (eV) {}
                    try { appliedBoxes.push({ label: unitLabel, b: art[0].item.geometricBounds }); } catch (eB) {}
                }
            } else {
                // NAME-KEYED here too: a tagged unit's own name (e.g. "unit
                // left 1") is looked up against the body reference's byName
                // map, falling back to its tag-stripped base name ("unit 1")
                // when the body carried the piece untagged - the customer's
                // normal case, one continuous piece on the body vs two
                // separate shapes on the sleeve. See _smTargetFor.
                var sides = ["left", "right"];
                for (var s = 0; s < sides.length; s++) {
                    var side = sides[s];
                    var corner = (side === "left") ? corners.L : corners.R;
                    var sUnits = sets[side].length ? sets[side] : sets.continuous;
                    if (sUnits.length === 0) { log("SLEEVE-MATCH [" + label + "] " + side + ": sleeve design has no unit for this side."); continue; }
                    for (var u = 0; u < sUnits.length; u++) {
                        var nmU = _smNorm(sUnits[u].item.name);
                        var t2 = _smTargetFor(rec, nmU);
                        var uLabel = label + " " + side + " '" + (sUnits[u].item.name || "unnamed") + "'";
                        if (!t2) { smWarn(sizeLabel, label, uLabel + ": no unit named '" + sUnits[u].item.name + "' (or '" + _smBaseName(nmU) + "') found on the body reference - rendered without matching"); continue; }
                        var uArt = [sUnits[u]];
                        var padU = _smOcclusionPad(sUnits[u].item, corners);
                        var occludersU = padU ? _smPolysOf(_smOccludersOf(zOrder, sUnits[u].item, padU)) : [];
                        if (t2.full) {
                            var mF = _smMeasureUnitD(outline, seam, corners, side, _smPolysOf(uArt), corners.H, occludersU, true);
                            if (mF && mF.full) log("SLEEVE-MATCH [" + uLabel + "]: full-edge coverage - OK.");
                            else smWarn(sizeLabel, label, uLabel + ": body covers the full armhole but the sleeve does not - rendered without matching");
                            continue;
                        }
                        smApplyOneUnit(uArt, t2, side, corners, outline, seam, sizeLabel, label, uLabel, appliedBoxes, occludersU);
                    }
                }
            }
            // D-CHAIN (report only) once more, now that every unit has been
            // placed - the after-match twin of the pre-match chains above, so a
            // single log read shows what the matching actually changed.
            (function () {
                var allAfter = [].concat(sets.continuous, sets.left, sets.right);
                _smLogDChain(label + " left cap (after match)", outline, seam, corners.L, corners.H, allAfter, corners, zOrder);
                _smLogDChain(label + " right cap (after match)", outline, seam, corners.R, corners.H, allAfter, corners, zOrder);
            })();

            // OVERLAP CHECK DISABLED (customer's ask): units overlapping after
            // independent matching isn't treated as an issue here, so this no
            // longer runs/logs anything - _smWarnOverlaps itself is left
            // defined above in case it's needed again later.
            // _smWarnOverlaps(appliedBoxes, sizeLabel, label);
        // parmBail FIRST - same reason as the matching catch in smMeasureBodyD:
        // this is the other path into _smSeamOutline, and swallowing a PARM
        // here would hide it from the panel rollback.
        } catch (e) { parmBail(e, "sleeve matching"); smWarn(sizeLabel, label, "error during sleeve matching: " + e.message); }
    }

    // =========================== end SLEEVE-MATCH helpers ===========================

    // =========================== PLACKET-MATCH v2 helpers (full-button jersey) ===========================
    // Front-Left and Front-Right are physically sewn together at the center
    // placket seam - a real OVERLAP (buttons closing over each other), not a
    // butt seam. v2 replaces the old artist-drawn "Match_" reference line
    // model entirely (user is dropping that naming convention) with pure
    // geometry read directly off each panel's own pattern shape.
    //
    // Algorithm (user-confirmed, walked through step by step):
    //  1. Panel A = whichever side (Front-Left or Front-Right) has the
    //     bigger total filled design area in the mockup (PM_LEFT_IS_BIGGER,
    //     decided once - a mockup-level property, same for every size).
    //     Panel B = the other side.
    //  2. The seam/center edge of a panel is simply the touching side of
    //     its own baseShape bounds (right edge if it's Front-Left, left
    //     edge if Front-Right) - panels are placed at zero gap, so this IS
    //     where the other panel begins. No named reference object needed.
    //  3. Seam-crossing ("shared") design graphics = filled shapes/text in
    //     Panel A's design that touch/reach that edge.
    //  4. Those graphics are cut out of Panel A as one rigid unit (their
    //     relative arrangement to each other is preserved) and repositioned
    //     using a closed-form equivalent of "reflect Panel A 90 degrees onto
    //     Panel B, overlap Panel B 2.25in onto Panel A (simulating the real
    //     sewn/buttoned-closed placket), group both, and center the shared
    //     graphic on that combined span": since a vertical-axis reflect
    //     never changes Y, and the combined span's horizontal center is a
    //     simple function of both panels' own outer edges and the 2.25in
    //     overlap, the final X is computed directly rather than literally
    //     performed as a sequence of Illustrator UI actions - see
    //     pmJoinPanels for the exact formula. Vertical position is left
    //     exactly where Panel A's own design placed it.
    //  5. The (now correctly positioned) shared unit is duplicated and
    //     clipped separately into BOTH panels' own design_clip_group, then
    //     the floating original is discarded - two independent panels,
    //     ready for separate printing, that reform as one continuous,
    //     centered image once physically sewn/buttoned closed.
    //
    // Flow: Front-Left always renders first (splice order), so it is always
    // queued in pmPanelAQueue and Front-Right always triggers the join -
    // regardless of which side is actually "Panel A" (see pmProcessPanel).

    function pmWarn(sizeLabel, partLabel, reason) {
        var msg = sizeLabel + " " + partLabel + ": " + reason;
        placketMatchWarnings.push(msg);
        log("PLACKET-MATCH WARNING: " + msg);
    }

    // Total filled area of a design (mockup-level, used once to decide
    // which side is "Panel A" - the bigger source side). Excludes the
    // panel's own base-path (a garment-outline placeholder, not design -
    // and near-identical in area on both sides since the two panel shapes
    // are mirror images, which would otherwise swamp any real difference in
    // actual design content) and "remove"-named items (test-print-only size
    // tags, same convention removeNamedItems already uses). TextFrame area
    // (bounding box) counts too - a text banner is real design content, and
    // ignoring it undercounts a text-heavy side entirely.
    function pmTotalFilledArea(container) {
        var total = 0;
        function walk(items) {
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                var nm = ""; try { nm = (it.name || "").toLowerCase(); } catch (eN) {}
                if (nm === "base-path" || nm === "base_path" || nm === "basepath" || nm === "remove") continue;
                if (it.typename === "GroupItem") { walk(it.pageItems); continue; }
                if (it.typename === "TextFrame") {
                    try {
                        if (it.contents === "") continue;
                        var bT = it.geometricBounds;
                        total += Math.abs((bT[2] - bT[0]) * (bT[1] - bT[3]));
                    } catch (eT) {}
                    continue;
                }
                if (it.typename !== "PathItem" && it.typename !== "CompoundPathItem") continue;
                var filled = false;
                try { filled = !!it.filled; } catch (eF) {}
                if (!filled && it.typename === "CompoundPathItem") {
                    try { filled = it.pathItems.length > 0 && !!it.pathItems[0].filled; } catch (eF2) {}
                }
                if (!filled) continue;
                try { total += Math.abs(it.width * it.height); } catch (eA) {}
            }
        }
        if (container && container.pageItems) walk(container.pageItems);
        return total;
    }

    function pmDecideBiggerSide() {
        if (PM_LEFT_IS_BIGGER !== null) return;
        // Area-measurement approach (getSourceView + pmTotalFilledArea walk
        // over mockupDoc) is disabled - confirmed via direct repro (job
        // de99d444) that calling it this deep into the job (after mockupDoc/
        // orderDoc have accumulated a lot of state from earlier panels) can
        // hang for 10+ minutes, even though the exact same walk takes under
        // 200ms against a freshly-opened mockup. Hardcoded instead: Front-Left
        // is always Panel A (source side), Front-Right is always Panel B.
        // var leftSrc = getSourceView("front-left", mockupDoc, false);
        // var rightSrc = getSourceView("front-right", mockupDoc, false);
        // var leftArea = leftSrc ? pmTotalFilledArea(leftSrc) : 0;
        // var rightArea = rightSrc ? pmTotalFilledArea(rightSrc) : 0;
        // PM_LEFT_IS_BIGGER = (leftArea >= rightArea);
        PM_LEFT_IS_BIGGER = true;
        log("PLACKET-MATCH: Panel A (source side) = Front-Left (fixed).");
    }

    // Uniform (aspect-preserving) scale driven by HEIGHT only, centered on
    // the target both axes - the full-button-front-specific replacement for
    // alignAndScale's normal two-axis independent stretch.
    function pmAlignAndScaleToHeight(obj, target, referenceItem) {
        try {
            var tB = pmFitBounds(target); // [L,T,R,B] - cut path, see pmFitBounds
            var targetCenterX = (tB[0] + tB[2]) / 2, targetCenterY = (tB[1] + tB[3]) / 2;
            var targetH = Math.abs(tB[1] - tB[3]);
            var ref = referenceItem || obj;
            var oB = pmFitBounds(ref), oH = Math.abs(oB[1] - oB[3]);
            if (oH === 0) return null;
            var scale = (targetH / oH) * 100;
            obj.resize(scale, scale, true, true, true, true, 100, Transformation.CENTER);
            var nB = pmFitBounds(ref), nW = Math.abs(nB[2] - nB[0]), nH = Math.abs(nB[1] - nB[3]);
            obj.left += (targetCenterX - (nB[0] + nW / 2));
            obj.top += (targetCenterY - (nB[1] - nH / 2));
            return { sw: scale, sh: scale };
        } catch (e) {}
        return null;
    }

    // PATTERN-ONLY SCALE MATCH (PATTERN_MATCH). Every panel has already been
    // scaled to fit its OWN height by the time this runs; this pulls just the
    // "Pattern"-named group onto Back's shared % so a continuous pattern still
    // lines up across the buttoned-up front, and leaves everything else (logo,
    // number, text, trims) at the panel's own correct fit.
    //
    // The correction is a RATIO, not the shared % itself: the pattern is already
    // sitting at this panel's own scale, so getting it to a net sharedPct means
    // applying (sharedPct / ownPct). On Back that is 1.0 by construction -
    // pmPeekFullButtonScale computes the shared % with the very same formula
    // pmAlignAndScaleToHeight just used on Back - so Back is always a no-op and
    // only the two front halves actually move. Resize is about the pattern's own
    // CENTRE; the horizontal seam alignment that follows is pmStripeSeamShift's
    // job (it translates, and it runs after this).
    function pmMatchPatternScale(design, ownScaleInfo, sharedPct, sizeLabel, partLabel) {
        var tag = "PATTERN-SCALE [" + sizeLabel + " " + partLabel + "]";
        if (!sharedPct) { log(tag + ": Back's shared scale is unavailable - pattern left at this panel's own fit."); return; }
        var ownPct = (ownScaleInfo && ownScaleInfo.sh) ? ownScaleInfo.sh : 0;
        if (!ownPct || ownPct <= 0) { log(tag + ": this panel's own scale is unknown - pattern left as is."); return; }
        var pat = pmFindPatternGroup(design);
        if (!pat) { log(tag + ": no 'Pattern'-named artwork in this design - nothing to match."); return; }
        var corr = (sharedPct / ownPct) * 100;
        var r1 = function (n) { return Math.round(n * 10) / 10; };
        if (Math.abs(corr - 100) < 0.05) { log(tag + ": pattern is already at Back's " + r1(sharedPct) + "% - nothing to do."); return; }
        // A correction this large means one of the two scales is wrong rather
        // than the panels genuinely differing - same reasoning as the peek's own
        // sanity band. Better to leave the pattern at its panel's honest fit
        // than to blow it up on a bad number.
        if (corr < 50 || corr > 200) { log(tag + ": WARNING - matching Back would need a " + r1(corr) + "% resize (panel's own " + r1(ownPct) + "% vs Back's " + r1(sharedPct) + "%). Too far to be a grading difference - left as is, check this panel manually."); return; }
        try {
            pat.resize(corr, corr, true, true, true, true, 100, Transformation.CENTER);
            log(tag + ": pattern resized " + r1(corr) + "% (panel's own " + r1(ownPct) + "% -> Back's " + r1(sharedPct) + "%); rest of the design left at " + r1(ownPct) + "%.");
        } catch (e) {
            log(tag + ": pattern resize failed - " + e.message);
        }
    }

    // Hands this size its Back-driven numbers: the scale % that
    // pmMatchPatternScale pulls the front halves' "Pattern" artwork onto, and
    // Back's side-seam length that the SIDE-PANEL FIX needs on both front
    // halves (a front half can never find its own underarm - one of its two
    // extreme-x edges is the placket, not a side seam).
    //
    // Both were already measured by prebuildFullButtonScales, BEFORE the order
    // document existed. This is only the copy-out, so it touches no other
    // document and cannot shift any coordinate - see prebuildFullButtonScales
    // for the 792pt reason that matters, and prebuildPatternSizes for the
    // original diagnosis.
    //
    // Kept as a per-size call rather than filling pmFullButtonScale wholesale
    // up front because pmFullButtonScale/pmBackUnderarm are declared further
    // down the main flow, after the order document is created: their own `= {}`
    // initialisers would wipe anything written before that point.
    function pmPeekFullButtonScale(sizeLabel) {
        if (pmFullButtonScale[sizeLabel] !== undefined) return; // already done for this size
        pmFullButtonScale[sizeLabel] = null;                    // default until proven otherwise

        var pre = pmPrebuiltFullButton ? pmPrebuiltFullButton[sizeLabel] : null;
        if (!pre) {
            log("PLACKET-MATCH: no pre-measured Back scale for size '" + sizeLabel + "' - Front/Back scale independently for this size.");
            return;
        }

        pmFullButtonScale[sizeLabel] = pre.scale;
        log("PLACKET-MATCH: Back-driven scale for size '" + sizeLabel + "' = " + (Math.round(pre.scale * 10) / 10) + "%" +
            (PATTERN_MATCH ? " (Front-Left/Front-Right 'Pattern' artwork will be matched to this; every panel still fits its own height otherwise)."
                           : " (measured for the Back-driven underarm only - pattern match is off, so every panel just fits its own height)."));

        if (pre.panelSeam !== null && pre.designSeam !== null) {
            pmBackUnderarm[sizeLabel] = { panelSeam: pre.panelSeam, designSeam: pre.designSeam };
            log("UA-BACK-DRIVEN [" + sizeLabel + "]: Back side-seam length = " +
                (Math.round((pre.panelSeam / 2.83465) * 10) / 10) + "mm (panel), " +
                (Math.round(((pre.designSeam * pre.scale / 100) / 2.83465) * 10) / 10) + "mm (design at " + (Math.round(pre.scale * 10) / 10) + "%) - Front-Left/Front-Right will use this.");
        } else {
            log("UA-BACK-DRIVEN [" + sizeLabel + "]: Back's own underarm could not be measured - Front halves will skip SIDE-PANEL FIX as before.");
        }
    }

    // The seam-side X of a panel's own pattern shape: right edge if it's
    // Front-Left, left edge if Front-Right (panels sit at zero gap, so this
    // IS where the other panel begins - no separate detection needed).
    function pmSeamX(baseShape, isLeftPanel) {
        try {
            var b = baseShape.geometricBounds; // [L,T,R,B]
            return isLeftPanel ? b[2] : b[0];
        } catch (e) { return null; }
    }

    // Seam-crossing shared design: ONLY an item explicitly named "Center"
    // (case/spacing-insensitive) that touches the seam edge. Originally this
    // geometrically grabbed ANY filled/stroked path or text touching the
    // seam, which also caught incidental decorative lines that just happen
    // to reach the edge without being the actual shared/split design -
    // wrongly donating them into the join/re-clip pipeline and, when the
    // re-clip didn't fully preserve them, leaving a panel blank (job
    // 5bad86bd). Requiring the "Center" name (artist-applied, same name on
    // BOTH sides since either side can end up as the source panel) makes
    // this exact instead of geometry-guessed. A named match is treated as
    // one rigid unit - not recursed into further.
    function pmCollectSeamArt(design, seamX, isLeftPanel) {
        var pad = 2; // pt - tolerate float rounding right at the touching edge
        var list = [];
        function touchesSeam(bb) {
            return isLeftPanel ? (bb[2] >= seamX - pad) : (bb[0] <= seamX + pad);
        }
        function hunt(container) {
            if (!container.pageItems) return;
            for (var i = 0; i < container.pageItems.length; i++) {
                var it = container.pageItems[i];
                var nm = ""; try { nm = normalizeSizeWord(it.name); } catch (eN) {}
                if (nm === "center") {
                    var b; try { b = it.geometricBounds; } catch (eB) { continue; }
                    if (touchesSeam(b)) list.push({ item: it });
                    continue;
                }
                if (it.typename === "GroupItem") hunt(it);
            }
        }
        hunt(design);
        return list;
    }

    // Called once per Front-Left/Front-Right panel, right after its own
    // clip mask is built. Front-Left is always queued (splice order
    // guarantees it renders first); Front-Right always triggers the join -
    // regardless of which side is actually "Panel A" (the bigger/source
    // side), which is decided separately inside pmJoinPanels.
    function pmProcessPanel(pastedPattern, baseShape, pastedDesign, sizeLabel, partName, artboardIdx, instName) {
        try {
            pmDecideBiggerSide();
            var state = { pastedPattern: pastedPattern, baseShape: baseShape, pastedDesign: pastedDesign, isLeft: isFrontLeft(partName), artboardIdx: artboardIdx, instName: instName };
            if (isFrontLeft(partName)) {
                if (!pmPanelAQueue[sizeLabel]) pmPanelAQueue[sizeLabel] = [];
                pmPanelAQueue[sizeLabel].push(state);
                log("PLACKET-MATCH: Front-Left " + sizeLabel + " built and queued, waiting for its Front-Right counterpart.");
                return;
            }
            var queue = pmPanelAQueue[sizeLabel];
            if (!queue || queue.length === 0) {
                pmWarn(sizeLabel, "Front Right", "no Front-Left counterpart found queued for this size - rendered without placket matching");
                return;
            }
            var left = queue.shift();
            var right = state;
            var a = PM_LEFT_IS_BIGGER ? left : right;
            var b = PM_LEFT_IS_BIGGER ? right : left;
            pmJoinPanels(a, b, sizeLabel);
            pmMirrorMatchLine(a, b, sizeLabel);

            // The queued panel ("left" here, regardless of which side ends
            // up being Panel A/B) already had its JPG exported BEFORE this
            // join ran - that snapshot is now stale (it predates the
            // shared-graphic re-clip and the Match_ line mirror). Re-export
            // it now so the preview JPG matches the true final content,
            // same as the saved .ai file.
            try {
                log("Re-queued JPG for " + left.instName + " (content updated by PLACKET-MATCH).");
                queueExport( left.artboardIdx, exportFolderFor(sizeLabel), left.instName, sizeLabel);
            } catch (eReexp) { log("PLACKET-MATCH: could not re-export " + left.instName + ": " + eReexp.message); }
        } catch (e) { pmWarn(sizeLabel, partName, "error during placket matching: " + e.message); }
    }

    // Finds the ONE object anywhere inside `design` (recursing into groups)
    // whose name normalizes (lowercased, non-alphanumeric stripped - same
    // rule as normalizeSizeWord) to exactly "pattern" - the ONLY thing
    // pmStripeSeamShift ever treats as "the striped/background pattern" to
    // shift for seam continuity. No area-based guessing: there used to be a
    // size-heuristic fallback here ("whichever PathItem/CompoundPathItem/
    // GroupItem has the biggest bounding box is probably the pattern"), but
    // that is exactly what produced a visible doubled stripe line on job
    // 6ddd62c9 - the heuristic grabbed one stripe segment out of 70+ separate
    // sibling paths instead of the whole motif. Removed entirely per explicit
    // decision: an artist-named "Pattern" group/shape (same convention as
    // "Center" and "Match_"/"LOCAL TAG" elsewhere in this file) is required
    // instead, gated by its own PATTERN_MATCH checkbox. If the name is
    // missing, illustrator_automation.py's pre-flight (_mockup_has_pattern_object)
    // already refuses to start the job at all when PATTERN_MATCH is checked -
    // a null return here should not happen in practice, and pmStripeSeamShift
    // still handles it gracefully (pmWarn) if it somehow does.
    function pmFindPatternGroup(design) {
        var found = null;
        function walk(container) {
            if (found || !container.pageItems) return;
            for (var i = 0; i < container.pageItems.length; i++) {
                var it = container.pageItems[i];
                var nm = ""; try { nm = normalizeSizeWord(it.name); } catch (eN) {}
                if (nm === "pattern") { found = it; return; }
                if (it.typename === "GroupItem") walk(it);
                if (found) return;
            }
        }
        walk(design);
        return found;
    }

    // The "true" center of the combined Front-Left+Front-Right span once
    // Panel B is simulated sliding PM_OVERLAP_PT onto Panel A (the button-
    // placket overlap) - shared by pmJoinPanels (Center-Match's shared
    // graphic) and pmStripeSeamShift (stripe/background continuity, runs
    // independently of Center-Match) so both use the exact same geometry.
    // How far apart the two panels' CUT LINES actually sit in the flat layout.
    //
    // The row flow butts Front-Right against Front-Left using visibleBounds, so
    // the two PAINTED outlines touch - but the cut line is the PATH, and the
    // outline straddles it (half outside, half inside). Two touching 3pt
    // outlines therefore leave their paths 1.5pt + 1.5pt = PATTERN_OUTLINE_PT
    // apart. Confirmed on this job's PM-DIAG: Front-Left's path ends at
    // -6415.33987785396 and Front-Right's begins at -6412.33987785396, exactly
    // 3pt later.
    //
    // MEASURED, never assumed to be PATTERN_OUTLINE_PT: an unstroked pattern
    // leaves the paths already touching and must get 0, and a pattern that
    // arrives with some other outline width must get its own number. Same rule
    // the size-tag placement already follows - a hardcoded 1.5 there was
    // "correct only while PATTERN_OUTLINE_PT stays at 3, and silently wrong the
    // moment it doesn't".
    //
    // Negative (panels already overlapping) is clamped to 0: that is not a gap
    // to close, and feeding it back in would push the seam the wrong way.
    function pmSeamGap(a, b) {
        try {
            var abA = a.baseShape.geometricBounds, abB = b.baseShape.geometricBounds; // [L,T,R,B]
            var seamA = a.isLeft ? abA[2] : abA[0]; // Panel A's seam edge
            var seamB = b.isLeft ? abB[2] : abB[0]; // Panel B's seam edge
            var gap = b.isLeft ? (seamA - seamB) : (seamB - seamA);
            return (gap > 0) ? gap : 0;
        } catch (e) { return 0; }
    }

    // Everything Panel B travels when the garment is closed: the placket
    // overlap itself, PLUS the flat layout's path-to-path gap above - the cut
    // lines have to meet before the overlap even starts.
    function pmCloseDistance(a, b) { return PM_OVERLAP_PT + pmSeamGap(a, b); }

    function pmCombinedCenterX(a, b) {
        var abA = a.baseShape.geometricBounds, abB = b.baseShape.geometricBounds; // [L,T,R,B]
        var outerA = a.isLeft ? abA[0] : abA[2]; // Panel A's far (non-seam) edge
        var outerB = b.isLeft ? abB[0] : abB[2]; // Panel B's far (non-seam) edge
        var close = pmCloseDistance(a, b);
        var sewnOuterB = b.isLeft ? (outerB + close) : (outerB - close);
        return (outerA + sewnOuterB) / 2;
    }

    // STRIPE/BACKGROUND SEAM CONTINUITY (Full Button Jersey, gated by its own
    // PATTERN_MATCH checkbox): each panel's "Pattern"-named striped/
    // background shape (per pmFindPatternGroup - an exact artist-given name,
    // not a size guess) was independently scaled+centered on its OWN panel's
    // own center - the true sewn/overlapped seam sits at a slightly different
    // X (same PM_OVERLAP_PT geometry pmJoinPanels uses for its "Center"-named
    // shared graphic), so left uncorrected the pattern shows a small but
    // visible break at the seam (confirmed against real jobs: matches the
    // manual per-side nudge needed to keep stripes continuous - ~0.53in/side
    // on one job's XL, ~0.15in/side on that same job's Medium). Unlike
    // pmJoinPanels, this needs no "Center"-named shared graphic at all -
    // Panel A's OWN "Pattern" shape stands in as the reference point (same
    // role pmJoinPanels' cut-out "Center" graphic plays there).
    function pmStripeSeamShift(a, b, sizeLabel) {
        try {
            var aShape = pmFindPatternGroup(a.pastedDesign);
            var bShape = pmFindPatternGroup(b.pastedDesign);
            if (!aShape && !bShape) { log("PLACKET-MATCH [" + sizeLabel + "]: STRIPE-SHIFT skipped - no object named 'Pattern' found on either panel."); return; }

            var combinedCenterX = pmCombinedCenterX(a, b);
            // Panel A's own shape is preferred as the reference (matches
            // pmJoinPanels' convention where the correction is measured off
            // Panel A's own content); if A has no shape, fall back to B's
            // and flip the sign so "dx" still means "Panel A's own correction".
            var refShape = aShape || bShape;
            var rb = refShape.geometricBounds; // [L,T,R,B]
            var curCenterX = (rb[0] + rb[2]) / 2;
            var dx = combinedCenterX - curCenterX;
            if (!aShape) dx = -dx;

            // Guard is much looser than pmJoinPanels' 50% - the striped/
            // background shape is routinely drawn deliberately OVERSIZED
            // (extending well past the panel on purpose, so the clip mask
            // trims it regardless of exact panel proportions - confirmed:
            // a real mockup's stripe group measured 34.51in wide against a
            // 12.46in panel). Its own geometric center is naturally far
            // from the panel's center as a result, so a large dx here is
            // normal, not a sign of bad geometry the way it would be for
            // pmJoinPanels' Center-Match graphic (which IS panel-sized).
            // Still guarded, generously, purely against genuine corruption/
            // mismeasurement (e.g. the Large-size scale-peek glitch).
            var guard = Math.max(a.baseShape.width, b.baseShape.width) * 4;
            if (Math.abs(dx) > guard) {
                pmWarn(sizeLabel, "Front", "stripe/background centering correction (" + _smMM(dx) + "mm) exceeds the sanity guard (4x panel width) - pattern left at its natural position, check this size manually");
                return;
            }
            if (aShape) { try { aShape.translate(dx, 0); } catch (eShiftA) {} }
            if (bShape) { try { bShape.translate(-dx, 0); } catch (eShiftB) {} }
            log("PLACKET-MATCH: " + sizeLabel + "'s striped/background pattern shifted by the seam correction (" + _smMM(dx) + "mm) on each side for seam continuity" +
                (aShape ? "" : " (Panel A: no shape found, skipped)") + (bShape ? "" : " (Panel B: no shape found, skipped)") + ".");
        } catch (e) { pmWarn(sizeLabel, "Front", "error during stripe seam-continuity shift: " + e.message); }
    }

    // Front-Left queues; Front-Right triggers the shift - same queue/trigger
    // shape as pmProcessPanel, but its OWN queue (pmStripeQueue) so this
    // runs even when Center-Match is off and pmProcessPanel is never called.
    function pmProcessStripeSeam(baseShape, pastedDesign, sizeLabel, partName) {
        if (isFrontLeft(partName)) {
            pmStripeQueue[sizeLabel] = { baseShape: baseShape, pastedDesign: pastedDesign, isLeft: true };
            log("PLACKET-MATCH [" + sizeLabel + "]: STRIPE-SHIFT Front-Left queued, waiting for its Front-Right counterpart.");
            return;
        }
        var left = pmStripeQueue[sizeLabel];
        if (!left) { log("PLACKET-MATCH [" + sizeLabel + "]: STRIPE-SHIFT skipped - no Front-Left counterpart was queued for this size."); return; }
        delete pmStripeQueue[sizeLabel];
        pmDecideBiggerSide(); // shared, once-per-job decision - same source side as Center-Match uses
        var right = { baseShape: baseShape, pastedDesign: pastedDesign, isLeft: false };
        var a = PM_LEFT_IS_BIGGER ? left : right;
        var b = PM_LEFT_IS_BIGGER ? right : left;
        pmStripeSeamShift(a, b, sizeLabel);
    }

    // a = Panel A (bigger/source side), b = Panel B (target side).
    function pmJoinPanels(a, b, sizeLabel) {
        var seamXa = pmSeamX(a.baseShape, a.isLeft);
        if (seamXa === null) { pmWarn(sizeLabel, "Front", "could not read Panel A's pattern bounds - rendered without placket matching"); return; }

        var art = pmCollectSeamArt(a.pastedDesign, seamXa, a.isLeft);
        if (art.length === 0) { log("PLACKET-MATCH [" + sizeLabel + "]: no design touches the seam edge on the bigger side - nothing to match."); return; }

        // Duplicate (not cut) the seam-crossing graphics out of Panel A as
        // one rigid unit (preserves their relative arrangement to each
        // other, e.g. a logo AND a separate text banner both crossing the
        // seam). Keeping A's real originals in place until the corrected
        // copy is CONFIRMED re-clipped means a failed clip (Illustrator COM
        // hiccup, resource contention, etc.) never leaves either panel with
        // nothing - see the okA/okB handling below.
        var sharedGroup = orderDoc.groupItems.add();
        var aOriginals = [];
        for (var i = 0; i < art.length; i++) {
            aOriginals.push(art[i].item);
            try { art[i].item.duplicate(sharedGroup, ElementPlacement.PLACEATEND); } catch (eMv) {}
        }
        if (sharedGroup.pageItems.length === 0) { try { sharedGroup.remove(); } catch (eR) {} return; }

        // Simulated-sewn centering pass: physically, Panel B slides
        // PM_OVERLAP_PT toward Panel A (buttons closing), Panel B in front,
        // and the shared graphic is centered on the resulting combined,
        // overlapped span - closed-form equivalent of the manual group/
        // center/ungroup process (a vertical reflect never changes Y, so
        // only X needs recomputing here).
        var combinedCenterX = pmCombinedCenterX(a, b);

        var gB = sharedGroup.geometricBounds; // [L,T,R,B]
        var curCenterX = (gB[0] + gB[2]) / 2;
        var dx = combinedCenterX - curCenterX;
        log("PM-DIAG " + sizeLabel + ": a.isLeft=" + a.isLeft + " b.isLeft=" + b.isLeft +
            " abA=" + JSON.stringify(a.baseShape.geometricBounds) + " abB=" + JSON.stringify(b.baseShape.geometricBounds) +
            " combinedCenterX=" + combinedCenterX + " gB=" + JSON.stringify(gB) + " curCenterX=" + curCenterX + " dx=" + dx);

        // Guard: an implausibly large correction means something is
        // geometrically off (e.g. the two panels aren't real mirror-sized
        // pattern pieces) - warn and leave the graphic at Panel A's natural
        // position rather than shipping something wildly wrong.
        var guard = Math.max(a.baseShape.width, b.baseShape.width) * 0.5;
        if (Math.abs(dx) > guard) {
            pmWarn(sizeLabel, "Front", "centering correction (" + _smMM(dx) + "mm) exceeds 50% of the panel width - shared graphic left at its natural position, check this size manually");
        } else if (dx) {
            sharedGroup.left = sharedGroup.left + dx;
        }

        // Each panel's OWN normal build already independently drew its own
        // (imprecise) copy of whatever touches the seam - e.g. Panel B's
        // own mockup design already has its own logo/text near the seam.
        // Leaving that in place while also clipping in the newly corrected,
        // precisely-positioned copy would show BOTH at once (a visible
        // duplicate/ghosted logo - confirmed on a real job). But only
        // remove each panel's own pre-existing copy AFTER confirming the
        // corrected replacement actually made it into that SAME panel -
        // otherwise a clip failure deletes the original and never delivers
        // the replacement, leaving that panel with nothing at all
        // (confirmed on a real job: Panel A ended up with neither its own
        // logo/text nor the corrected copy).
        var okA = pmClipIntoPanel(sharedGroup, a);
        if (okA) {
            for (var oa = 0; oa < aOriginals.length; oa++) { try { aOriginals[oa].remove(); } catch (eRmA) {} }
        } else {
            pmWarn(sizeLabel, a.isLeft ? "Front-Left" : "Front-Right", "could not re-clip the shared graphic - kept its own original content instead, check this size manually");
        }

        // Panel B's own print file is flat/zero-gap (unfolded) - it is NOT
        // physically at its final, sewn/overlapped position relative to
        // Panel A. combinedCenterX above was computed in the FINAL (post-
        // overlap) frame, which is directly Panel A's own flat frame (A
        // never moves). To get the SAME design content to land correctly
        // once B is later physically closed onto A, the copy clipped into B's
        // flat file must be pre-shifted by the inverse of that future move -
        // otherwise, verified by literally performing the 2.25in close-up on a
        // real job's output, the shared graphic shows a PM_OVERLAP_PT-sized gap
        // right at the seam (confirmed: "Trojans" rendered as "Trjans", the "o"
        // fell into the gap).
        //
        // pmCloseDistance, not PM_OVERLAP_PT alone: B's real travel includes
        // closing the flat layout's path-to-path gap first (see pmSeamGap).
        // The same distance combinedCenterX above was built from - the two must
        // describe one movement or the graphic lands off by their difference.
        var bUnfoldShift = b.isLeft ? -pmCloseDistance(a, b) : pmCloseDistance(a, b);
        var sharedForB = sharedGroup.duplicate(orderDoc, ElementPlacement.PLACEATEND);
        sharedForB.left = sharedForB.left + bUnfoldShift;
        var okB = pmClipIntoPanel(sharedForB, b);
        try { sharedForB.remove(); } catch (eRemB) {}
        if (okB) {
            pmRemoveOwnSeamArt(b);
        } else {
            pmWarn(sizeLabel, b.isLeft ? "Front-Left" : "Front-Right", "could not re-clip the shared graphic - kept its own original content instead, check this size manually");
        }

        try { sharedGroup.remove(); } catch (eRem) {}

        if (okA && okB) log("PLACKET-MATCH: shared seam graphic re-centered and re-clipped into both " + sizeLabel + " panels.");
    }

    // Removes a panel's OWN pre-existing seam-crossing candidates (from its
    // own independent mockup design) before the corrected, shared copy is
    // clipped in - otherwise both the original and the corrected copy
    // render at once (a visible duplicate/ghosted logo).
    function pmRemoveOwnSeamArt(panel) {
        var seamX = pmSeamX(panel.baseShape, panel.isLeft);
        if (seamX === null) return;
        var existing = pmCollectSeamArt(panel.pastedDesign, seamX, panel.isLeft);
        for (var i = 0; i < existing.length; i++) {
            try { existing[i].item.remove(); } catch (eRm) {}
        }
    }

    // Duplicates sharedArt into panel's own design_clip_group (built earlier
    // by the normal per-part clip mechanism). Returns true on success.
    function pmClipIntoPanel(sharedArt, panel) {
        try {
            var clipGrp = null;
            for (var i = 0; i < panel.pastedPattern.groupItems.length; i++) {
                if (panel.pastedPattern.groupItems[i].name === "design_clip_group") { clipGrp = panel.pastedPattern.groupItems[i]; break; }
            }
            if (!clipGrp) return false;
            // In front of the panel's own design (panel.pastedDesign) so the
            // corrected shared graphic actually shows OVER the rest of the
            // design - still behind clipGrp's clip mask (which must stay the
            // group's frontmost item for `clipped=true` to keep working).
            // PLACEATEND put this at the very BACK of clipGrp instead (behind
            // pastedDesign too), hiding the re-centered "Center" text behind
            // the whole rest of the panel's design - confirmed on a real job.
            var copy = sharedArt.duplicate(orderDoc, ElementPlacement.PLACEATEND);
            copy.move(panel.pastedDesign, ElementPlacement.PLACEBEFORE);
            return true;
        } catch (e) { return false; }
    }

    // ---------------------------------------------------------------
    // SIDE-SEAM MATCH (Front <-> Back torso side seam). Standalone feature
    // (see SIDE_SEAM_MATCH above) - reuses PLACKET-MATCH's duplicate/
    // recenter/clip technique (pmJoinPanels/pmClipIntoPanel above) but for
    // a caller-supplied exact object name and overlap distance instead of
    // the hardcoded "Center"/PM_OVERLAP_PT, and with Front ALWAYS the
    // source panel (no pmDecideBiggerSide-style dynamic pick - the naming
    // itself already tells us which panel owns the reference copy: "Front
    // side match" objects live on Front, "Back side match" objects are
    // Back's own (imprecise, artist-drawn) copy that gets discarded once
    // the corrected copy is clipped in - same role Panel B's own "Center"
    // copy plays in pmJoinPanels/pmRemoveOwnSeamArt).
    // ---------------------------------------------------------------

    // Finds the ONE item anywhere inside `design` (recursing into groups)
    // whose name normalizes (pmFindPatternGroup's rule: lowercased, non-
    // alphanumeric stripped) to exactly `wantNorm`. No area-based guessing.
    function ssFindNamed(design, wantNorm) {
        var found = null;
        function walk(container) {
            if (found || !container.pageItems) return;
            for (var i = 0; i < container.pageItems.length; i++) {
                var it = container.pageItems[i];
                var nm = ""; try { nm = normalizeSizeWord(it.name); } catch (eN) {}
                if (nm === wantNorm) { found = it; return; }
                if (it.typename === "GroupItem") walk(it);
                if (found) return;
            }
        }
        walk(design);
        return found;
    }

    // How far apart the Front and Back panels' CUT LINES actually sit, on the
    // two sides this pairing sews together - the side-seam twin of pmSeamGap,
    // kept separate for the same reason ssClipIntoPanel is (the two features
    // are meant to stay independent).
    //
    // The row flow tiles pieces on their VISIBLE edges 5mm apart, and each 3pt
    // outline straddles its own path (1.5pt per side), so those two pieces have
    // their PATHS 5mm + PATTERN_OUTLINE_PT apart. That 3pt is exactly what
    // SS_OVERLAP_PT's flat "14 + 5" never counted.
    //
    // RETURNS 0 WHEN THE MEASUREMENT IS MEANINGLESS, and ssCloseDistance falls
    // back to SS_OVERLAP_PT there rather than to 14mm. ssProcessPair's Left
    // pairing labels Back as the LEFT member of the pair (its seam is Back's
    // right edge, Front's is Front's left edge), but the layout puts Back to
    // the RIGHT of Front - so the two named seam edges face away from each
    // other and the subtraction comes out hugely negative, not slightly off.
    // The Right and generic pairings do match the layout and measure the real
    // 5mm + 3pt.
    function ssSeamGap(front, back) {
        try {
            var abF = front.baseShape.geometricBounds, abB = back.baseShape.geometricBounds; // [L,T,R,B]
            var seamF = front.isLeft ? abF[2] : abF[0]; // Front's seam edge
            var seamB = back.isLeft ? abB[2] : abB[0];  // Back's seam edge
            var gap = back.isLeft ? (seamF - seamB) : (seamB - seamF);
            return (gap > 0) ? gap : 0;
        } catch (e) { return 0; }
    }

    // Everything Back travels when the side seam is closed: the flat layout's
    // real path-to-path gap, PLUS the 14mm the two panels then overlap by. Same
    // shape as pmCloseDistance, and the same reason - the cut lines have to
    // meet before the overlap even starts.
    //
    // SS_OVERLAP_PT is the fallback for the unmeasurable pairing above, not the
    // normal path. It is the same sum by assumption (14 + a 5mm gap taken on
    // faith); the measured form is 1.06mm wider on a 3pt pattern.
    function ssCloseDistance(front, back) {
        var gap = ssSeamGap(front, back);
        return gap ? (SS_SEW_PT + gap) : SS_OVERLAP_PT;
    }

    // Same closed-form "simulated sewn overlap" center as pmCombinedCenterX,
    // parameterized on ssCloseDistance instead of pmCloseDistance: front/back
    // isLeft flags say which panel's OWN far (non-seam) edge anchors which
    // side of the combined span, set per-pairing by ssProcessPair below.
    function ssCombinedCenterX(front, back) {
        var abF = front.baseShape.geometricBounds, abB = back.baseShape.geometricBounds; // [L,T,R,B]
        var outerF = front.isLeft ? abF[0] : abF[2];
        var outerB = back.isLeft ? abB[0] : abB[2];
        var close = ssCloseDistance(front, back);
        var sewnOuterB = back.isLeft ? (outerB + close) : (outerB - close);
        return (outerF + sewnOuterB) / 2;
    }

    // Duplicates sharedArt into panel's own design_clip_group - identical
    // technique to pmClipIntoPanel above (kept separate rather than shared
    // since the two features are meant to stay fully independent).
    function ssClipIntoPanel(sharedArt, panel) {
        try {
            var clipGrp = null;
            for (var i = 0; i < panel.pastedPattern.groupItems.length; i++) {
                if (panel.pastedPattern.groupItems[i].name === "design_clip_group") { clipGrp = panel.pastedPattern.groupItems[i]; break; }
            }
            if (!clipGrp) return false;
            var copy = sharedArt.duplicate(orderDoc, ElementPlacement.PLACEATEND);
            copy.move(panel.pastedDesign, ElementPlacement.PLACEBEFORE);
            return true;
        } catch (e) { return false; }
    }

    // Joins one Front/Back side-seam pair: takes Front's own `frontName`-
    // named object as the single source of truth, centers a copy of it on
    // the combined SS_OVERLAP_PT-overlapped span (so half naturally falls
    // on each panel once each panel's own clip mask trims it - same
    // "half front / half back" result as PLACKET-MATCH's Center-Match),
    // clips corrected copies into BOTH panels' design_clip_group, then
    // removes Front's original and Back's own `backName`-named copy (if
    // any) so the old, imprecise content doesn't double up with the new
    // centered one.
    function ssJoinOneSeam(front, back, frontName, backName, sizeLabel, seamLabel) {
        var shared = ssFindNamed(front.pastedDesign, frontName);
        if (!shared) {
            pmWarn(sizeLabel, "Front", "SIDE-SEAM MATCH (" + seamLabel + "): no '" + frontName + "'-named object found on Front - skipped.");
            return;
        }

        var sharedGroup = orderDoc.groupItems.add();
        try { shared.duplicate(sharedGroup, ElementPlacement.PLACEATEND); } catch (eMv) {}
        if (sharedGroup.pageItems.length === 0) { try { sharedGroup.remove(); } catch (eR) {} return; }

        var combinedCenterX = ssCombinedCenterX(front, back);
        var gB = sharedGroup.geometricBounds; // [L,T,R,B]
        var curCenterX = (gB[0] + gB[2]) / 2;
        var dx = combinedCenterX - curCenterX;

        // Same 50%-of-panel-width sanity guard as pmJoinPanels - an
        // implausibly large correction means the two panels aren't real
        // mirror-sized pattern pieces; leave the graphic at its natural
        // position and warn rather than ship something wildly wrong.
        var guard = Math.max(front.baseShape.width, back.baseShape.width) * 0.5;
        if (Math.abs(dx) > guard) {
            pmWarn(sizeLabel, "Front", "SIDE-SEAM MATCH (" + seamLabel + "): centering correction (" + _smMM(dx) + "mm) exceeds 50% of the panel width - shared graphic left at its natural position, check this size manually");
        } else if (dx) {
            sharedGroup.left = sharedGroup.left + dx;
        }

        var okFront = ssClipIntoPanel(sharedGroup, front);
        if (okFront) { try { shared.remove(); } catch (eRmF) {} }
        else { pmWarn(sizeLabel, "Front", "SIDE-SEAM MATCH (" + seamLabel + "): could not re-clip the shared graphic into Front - kept its own original content instead, check this size manually"); }

        // Back's flat print file is zero-gap/unfolded, same reasoning as
        // pmJoinPanels' bUnfoldShift: pre-shift the copy clipped into Back
        // by the inverse of the future physical close-up so the design
        // still lands correctly once Back is sewn onto Front.
        //
        // ssCloseDistance, the same distance combinedCenterX above was built
        // from - the two must describe one movement or the graphic lands off by
        // their difference.
        var ssClose = ssCloseDistance(front, back);
        var bUnfoldShift = back.isLeft ? -ssClose : ssClose;
        var sharedForBack = sharedGroup.duplicate(orderDoc, ElementPlacement.PLACEATEND);
        sharedForBack.left = sharedForBack.left + bUnfoldShift;
        var okBack = ssClipIntoPanel(sharedForBack, back);
        try { sharedForBack.remove(); } catch (eRemB) {}
        if (okBack) {
            var backOwn = ssFindNamed(back.pastedDesign, backName);
            if (backOwn) { try { backOwn.remove(); } catch (eRmB) {} }
        } else {
            pmWarn(sizeLabel, "Back", "SIDE-SEAM MATCH (" + seamLabel + "): could not re-clip the shared graphic into Back - kept its own original content instead, check this size manually");
        }

        try { sharedGroup.remove(); } catch (eRem) {}

        if (okFront && okBack) {
            var ssGap = ssSeamGap(front, back);
            log("SIDE-SEAM MATCH: " + sizeLabel + "'s '" + frontName + "'/'" + backName + "' graphic re-centered and re-clipped across Front/Back (" + seamLabel + " seam, " +
                _smMM(ssClose) + "mm simulated overlap = " +
                (ssGap ? (_smMM(SS_SEW_PT) + "mm sewing + the " + _smMM(ssGap) + "mm measured path gap")
                       : (_smMM(SS_OVERLAP_PT) + "mm constant - the two panels are not laid out on the sides this pairing sews, so the gap could not be measured")) + ").");
        }
    }

    // Entry point called once per size, when Back's own clip group has just
    // been built (see the main item loop above). Runs whichever named
    // pair(s) actually exist on this size's Front/Back:
    //   - explicit Left pair ("Front Left side match" + "Back Right side
    //     match") and/or explicit Right pair ("Front Right side match" +
    //     "Back Left side match") - independently, either or both;
    //   - falls back to the generic pair ("Front side match" + "Back side
    //     match", Right-seam only) ONLY when neither explicit pair ran.
    // If nothing at all is found, this size is skipped with a warning -
    // illustrator_automation.py's pre-flight is what refuses to START the
    // job when the checkbox is on but no such name exists ANYWHERE in the
    // mockup (same convention as CENTER_MATCH/PATTERN_MATCH); a per-size
    // miss here (e.g. one order line's test print is missing the object
    // others have) is treated as a soft warning, not a hard stop, matching
    // pmStripeSeamShift's precedent.
    function ssProcessPair(front, back, sizeLabel) {
        var ranAny = false;

        var fL = ssFindNamed(front.pastedDesign, "frontleftsidematch");
        var bR = ssFindNamed(back.pastedDesign, "backrightsidematch");
        if (fL && bR) {
            ssJoinOneSeam(
                { pastedPattern: front.pastedPattern, baseShape: front.baseShape, pastedDesign: front.pastedDesign, isLeft: false },
                { pastedPattern: back.pastedPattern, baseShape: back.baseShape, pastedDesign: back.pastedDesign, isLeft: true },
                "frontleftsidematch", "backrightsidematch", sizeLabel, "Left"
            );
            ranAny = true;
        }

        var fR = ssFindNamed(front.pastedDesign, "frontrightsidematch");
        var bL = ssFindNamed(back.pastedDesign, "backleftsidematch");
        if (fR && bL) {
            ssJoinOneSeam(
                { pastedPattern: front.pastedPattern, baseShape: front.baseShape, pastedDesign: front.pastedDesign, isLeft: true },
                { pastedPattern: back.pastedPattern, baseShape: back.baseShape, pastedDesign: back.pastedDesign, isLeft: false },
                "frontrightsidematch", "backleftsidematch", sizeLabel, "Right"
            );
            ranAny = true;
        }

        if (!ranAny) {
            var fG = ssFindNamed(front.pastedDesign, "frontsidematch");
            var bG = ssFindNamed(back.pastedDesign, "backsidematch");
            if (fG && bG) {
                ssJoinOneSeam(
                    { pastedPattern: front.pastedPattern, baseShape: front.baseShape, pastedDesign: front.pastedDesign, isLeft: true },
                    { pastedPattern: back.pastedPattern, baseShape: back.baseShape, pastedDesign: back.pastedDesign, isLeft: false },
                    "frontsidematch", "backsidematch", sizeLabel, "Right (generic)"
                );
                ranAny = true;
            }
        }

        if (!ranAny) {
            pmWarn(sizeLabel, "Front/Back", "SIDE-SEAM MATCH: no 'Front side match'/'Back side match' (or explicit Left/Right) named objects found for this size - skipped.");
        }
    }

    // Finds EVERY item anywhere inside `design` whose name starts with
    // "match_" (case-insensitive) - a design may have more than one such
    // trim line/mark, and all of them need mirroring, not just the first.
    // Each panel has its OWN independent copy of each.
    function pmFindMatchLines(design) {
        var found = [];
        function hunt(container) {
            if (!container.pageItems) return;
            for (var i = 0; i < container.pageItems.length; i++) {
                var it = container.pageItems[i];
                var nm = ""; try { nm = (it.name || "").toLowerCase(); } catch (eN) {}
                // Prefix-only match ("match", "match_", "Match_Front Right", ...)
                // - artists name these inconsistently per job/side, so the
                // trailing underscore can't be required.
                if (nm.indexOf("match") === 0) { found.push(it); continue; }
                if (it.typename === "GroupItem") hunt(it);
            }
        }
        hunt(design);
        return found;
    }

    // Panel A and Panel B are mirror-image pattern pieces meeting at the
    // SAME zero-gap seam boundary - reflecting Panel A's own trim line
    // across that boundary lands it, already correctly positioned, on
    // Panel B's side. This replaces whatever Panel B independently had
    // (guarantees perfect left/right symmetry) instead of trusting two
    // separately hand-drawn copies to already match. User-specified
    // procedure: duplicate A's panel, reflect it, compare against B to
    // find what's identical (currently just this trim line), cut that,
    // discard the reflected duplicate, clip the cut piece into B.
    // The panel's design_clip_group - items must be DIRECT children of
    // this to have their z-order correctly compared against whatever
    // pmJoinPanels already clipped in (a nested sub-group's own
    // zOrder(SENDTOBACK) only reorders within that sub-group - it does
    // NOT push it behind a sibling group added later via PLACEATEND,
    // confirmed on a real job: the line stayed visually in front because
    // it was still nested inside the panel's original "Front <Side>"
    // sub-group, structurally ahead of the newly re-clipped logo/text).
    function pmFindClipGroup(panel) {
        for (var i = 0; i < panel.pastedPattern.groupItems.length; i++) {
            if (panel.pastedPattern.groupItems[i].name === "design_clip_group") return panel.pastedPattern.groupItems[i];
        }
        return null;
    }

    function pmMirrorMatchLine(a, b, sizeLabel) {
        try {
            var linesA = pmFindMatchLines(a.pastedDesign);
            if (linesA.length === 0) { log("PLACKET-MATCH: no Match_ line found on the bigger side - skipping line mirror for " + sizeLabel); return; }

            var seamXa = pmSeamX(a.baseShape, a.isLeft);
            if (seamXa === null) { pmWarn(sizeLabel, "Front", "could not read seam edge for Match_ line mirror"); return; }

            var clipGrpA = pmFindClipGroup(a);
            if (!clipGrpA) { pmWarn(sizeLabel, a.isLeft ? "Front-Left" : "Front-Right", "could not find clip group for Match_ line(s)"); return; }

            var clipGrpB = pmFindClipGroup(b);
            if (!clipGrpB) { pmWarn(sizeLabel, b.isLeft ? "Front-Left" : "Front-Right", "could not find clip group for mirrored Match_ line(s)"); return; }

            // Panel B's own match_-named line(s), if any - kept alive (NOT
            // removed up front) so each one's own z-order slot, relative to
            // whatever else the artist layered around it in B's own design,
            // can be reused as the exact insertion point for the mirrored
            // replacement below - i.e. read the test print's own stacking
            // order instead of guessing one.
            var linesB = pmFindMatchLines(b.pastedDesign);

            for (var i = 0; i < linesA.length; i++) {
                var lineA = linesA[i];

                // Reflect a duplicate of A's line about the vertical axis
                // at the seam edge (A and B meet almost exactly there at
                // zero gap): mirror the shape about its own center first,
                // then shift that mirrored shape so its center lands at
                // the true reflection of its original center about
                // x = seamXa.
                var mirrored = lineA.duplicate(orderDoc, ElementPlacement.PLACEATEND);
                mirrored.resize(-100, 100, true, true, true, true, 100, Transformation.CENTER);
                var mb = mirrored.geometricBounds; // [L,T,R,B]
                var curCenter = (mb[0] + mb[2]) / 2;
                var desiredCenter = (2 * seamXa) - curCenter;
                mirrored.left += (desiredCenter - curCenter);

                // job 41d6ecf9: an absolute PLACEATEND/PLACEATBEGINNING
                // buried the line behind (or brought it in front of)
                // whatever else happens to be in the design - wrong
                // whenever some OTHER element (not just pinstripes, not
                // just text) is meant to sit on the other side of it.
                // Correct source of truth: Panel B's OWN original match
                // line already sat in the artist's correct stacking
                // position relative to everything else in B's own design
                // (it's the same design, just the wrong shape/rotation) -
                // so slot the mirrored replacement into THAT exact spot,
                // then discard the original.
                if (linesB[i]) {
                    mirrored.move(linesB[i], ElementPlacement.PLACEBEFORE);
                    try { linesB[i].remove(); } catch (eRB) {}
                } else {
                    // No corresponding original on B's side to read a
                    // position from (count mismatch) - best-effort default.
                    mirrored.move(clipGrpB, ElementPlacement.PLACEATBEGINNING);
                }

                // A's OWN line is untouched (no move at all): it already
                // sits inside clipGrpA, nested exactly where the mockup had
                // it - pastedDesign (which contains it) was moved into
                // clipGrpA as one whole unit when the clip mask was built,
                // so its stacking order relative to text/pinstripes/
                // anything else was never disturbed.
            }
            // Any of B's own match lines beyond linesA's count (no A
            // counterpart to mirror) are stale leftovers - remove them too.
            for (var r = linesA.length; r < linesB.length; r++) { try { linesB[r].remove(); } catch (eRB2) {} }

            log("PLACKET-MATCH: " + linesA.length + " Match_ line(s) mirrored from the bigger side onto " + sizeLabel + "'s other panel.");
        } catch (e) { pmWarn(sizeLabel, "Front", "error mirroring Match_ line: " + e.message); }
    }

    // Collects every TextFrame under container into out[], recursing through
    // nested groups but never descending into excludeGroup (a clip group
    // built from duplicated content elsewhere - its own bounds are known to
    // go stale right after .clipped=true, see hoodieBuildPocket).
    function pmCollectTextFrames(container, excludeGroup, out) {
        if (!container || container === excludeGroup) return;
        if (container.textFrames) {
            for (var t = 0; t < container.textFrames.length; t++) out.push(container.textFrames[t]);
        }
        if (container.groupItems) {
            for (var g = 0; g < container.groupItems.length; g++) {
                if (container.groupItems[g] !== excludeGroup) pmCollectTextFrames(container.groupItems[g], excludeGroup, out);
            }
        }
    }

    // Combined geometricBounds [L,T,R,B] of a list of page items.
    // Geometric (path-only) union. For anything the EYE judges use
    // _blPaintedBounds instead - this one ignores strokes.
    function pmCombinedBounds(items) {
        var b = null;
        for (var i = 0; i < items.length; i++) {
            var bb; try { bb = items[i].geometricBounds; } catch (eB) { continue; }
            if (!b) { b = [bb[0], bb[1], bb[2], bb[3]]; continue; }
            if (bb[0] < b[0]) b[0] = bb[0];
            if (bb[1] > b[1]) b[1] = bb[1];
            if (bb[2] > b[2]) b[2] = bb[2];
            if (bb[3] < b[3]) b[3] = bb[3];
        }
        return b;
    }

    // SHOULDER-MATCH geometry helpers: sample a PathItem (open or closed -
    // an open stroke line must NOT wrap its last point back to its first)
    // into a bezier-flattened polyline, so a curve's crossing of a
    // horizontal Y line can be found the same way a straight line's can.
    function pmSamplePathItem(path, perSeg) {
        var out = [];
        var pts;
        try { pts = path.pathPoints; } catch (e) { return out; }
        var n = pts.length;
        if (n < 2) return out;
        var closed = false;
        try { closed = !!path.closed; } catch (eC) {}
        var segCount = closed ? n : (n - 1);
        for (var i = 0; i < segCount; i++) {
            var a = pts[i], b = pts[(i + 1) % n];
            var p0 = a.anchor, c1 = a.rightDirection, c2 = b.leftDirection, p1 = b.anchor;
            for (var s = 0; s <= perSeg; s++) {
                var t = s / perSeg, mt = 1 - t;
                out.push([
                    mt * mt * mt * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p1[0],
                    mt * mt * mt * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p1[1]
                ]);
            }
        }
        return out;
    }

    // Flattens an item (PathItem or CompoundPathItem, whatever pmFindMatchLines
    // returns) into a list of sampled polylines.
    function pmSampleItemPolylines(item, perSeg) {
        var polys = [];
        try {
            if (item.typename === "PathItem") {
                var pl = pmSamplePathItem(item, perSeg);
                if (pl.length >= 2) polys.push(pl);
            } else if (item.typename === "CompoundPathItem") {
                for (var i = 0; i < item.pathItems.length; i++) {
                    var pl2 = pmSamplePathItem(item.pathItems[i], perSeg);
                    if (pl2.length >= 2) polys.push(pl2);
                }
            }
        } catch (e) {}
        return polys;
    }

    // SHOULDER-MATCH stitch-line geometry: the raw bounding-box shoulder-tip
    // corner is only ever a cut-line corner, not where the garment is
    // actually sewn - the customer's own check (Ctrl+` offset) is done 7mm
    // in from there, same seam allowance SLEEVE-MATCH already accounts for
    // (SM_SEAM_PT). A raw-edge crossing also implicitly treated the
    // shoulder/top edge as perfectly horizontal, which it usually isn't -
    // both approximations are dropped here in favor of measuring on the
    // panel's own -7mm inset outline (the true stitch line), the same way
    // SLEEVE-MATCH measures D.

    // Which array-index direction from `idx` runs along the shoulder/top
    // edge (mostly horizontal movement) vs. the outer side edge (mostly
    // vertical movement) - sampled a few points each way and compared.
    function pmSeamEdgeDirection(outline, idx) {
        var n = outline.length;
        function horizRatio(dir) {
            var j = idx, dx = 0, dy = 0;
            for (var s = 0; s < 8; s++) {
                var k = (j + dir + n) % n;
                dx += Math.abs(outline[k][0] - outline[j][0]);
                dy += Math.abs(outline[k][1] - outline[j][1]);
                j = k;
            }
            return dx / (dy + 1e-6);
        }
        return (horizRatio(1) >= horizRatio(-1)) ? 1 : -1;
    }

    // The -7mm stitch-line shoulder corner: nearest-index lookup on the raw
    // outline (clean geometry for locating the corner), then the true
    // corner is recovered by intersecting the INSET outline's outer-side
    // edge with its shoulder-top edge - the same "recover the corner by
    // intersecting the two inset edges" trick as SLEEVE-MATCH's seam corner
    // S, since offsetting a sharp corner point-by-point creates loop
    // artifacts right at the corner itself.
    function pmSeamCorner(outline, seam, rawX, rawY) {
        var n = outline.length;
        if (n < 8 || seam.length !== n) return null;
        var idx = 0, best = 1e12;
        for (var i = 0; i < n; i++) {
            var ddx = outline[i][0] - rawX, ddy = outline[i][1] - rawY;
            var d2 = ddx * ddx + ddy * ddy;
            if (d2 < best) { best = d2; idx = i; }
        }
        var shoulderDir = pmSeamEdgeDirection(outline, idx);
        var sideDir = -shoulderDir;
        var sd1 = seam[(idx + sideDir * 4 + n) % n], sd2 = seam[(idx + sideDir * 16 + n) % n];
        var sh1 = seam[(idx + shoulderDir * 4 + n) % n], sh2 = seam[(idx + shoulderDir * 16 + n) % n];
        var S = _smLineIntersect(sd1, sd2, sh1, sh2);
        var iC = seam[idx];
        if (!S || Math.sqrt((S[0] - iC[0]) * (S[0] - iC[0]) + (S[1] - iC[1]) * (S[1] - iC[1])) > 20 * SM_MM) S = iC;
        return { S: S, idx: idx, shoulderDir: shoulderDir };
    }

    // Like _smLineIntersect but also confirms the intersection actually
    // falls ON both finite segments, not just somewhere on the infinite
    // lines through them.
    function _pmSegXing(p1, p2, p3, p4) {
        var pt = _smLineIntersect(p1, p2, p3, p4);
        if (!pt) return null;
        var e = 0.05;
        function within(a, b, v) { var lo = Math.min(a, b) - e, hi = Math.max(a, b) + e; return v >= lo && v <= hi; }
        if (!within(p1[0], p2[0], pt[0]) || !within(p1[1], p2[1], pt[1])) return null;
        if (!within(p3[0], p4[0], pt[0]) || !within(p3[1], p4[1], pt[1])) return null;
        return pt;
    }

    // Walks the -7mm inset (stitch-line) outline from the seam corner along
    // the shoulder edge, and returns the STRAIGHT chord distance from the
    // corner to the nearest point where any Match_ line actually crosses
    // that stitch line - the stitch-line equivalent of a raw-edge crossing,
    // measured the same "chord from the seam corner" way SLEEVE-MATCH
    // measures D (not arc length, which always reads longer on a curve).
    // The walk is capped at one panel-width of travel: the crossing is
    // always well within a single shoulder's own width in practice, and
    // walking further risks wrapping past the neckline into the far side.
    function pmSeamShoulderCrossDist(outline, seam, corner, lines, panelW) {
        var n = seam.length;
        var idx = corner.idx, dir = corner.shoulderDir, S = corner.S;
        var linePolys = [];
        for (var li = 0; li < lines.length; li++) {
            var polys = pmSampleItemPolylines(lines[li], 24);
            for (var pp = 0; pp < polys.length; pp++) linePolys.push(polys[pp]);
        }
        if (linePolys.length === 0) return null;

        var prev = S, budget = Math.max(20, Math.floor(n * 0.5)), traveled = 0, j = idx;
        for (var s = 0; s < budget; s++) {
            j = (j + dir + n) % n;
            var cur = seam[j];
            traveled += Math.sqrt((cur[0] - prev[0]) * (cur[0] - prev[0]) + (cur[1] - prev[1]) * (cur[1] - prev[1]));
            if (traveled > panelW) break;
            for (var lp = 0; lp < linePolys.length; lp++) {
                var poly = linePolys[lp];
                for (var k = 0; k < poly.length - 1; k++) {
                    var xPt = _pmSegXing(prev, cur, poly[k], poly[k + 1]);
                    if (xPt) {
                        var dx = xPt[0] - S[0], dy = xPt[1] - S[1];
                        return Math.sqrt(dx * dx + dy * dy);
                    }
                }
            }
            prev = cur;
        }
        return null;
    }

    // Resize a list of raw items about a GLOBAL anchor point (ax, ay) -
    // proportional resize on BOTH axes (all 4 sides), so a Match_ shape's
    // proportions stay correct instead of only stretching horizontally.
    // An earlier width-only version (scaleY locked at 100%) traded that
    // off to keep a Match_ shape's vertical position/extent untouched, so
    // it would never fight with BACK-LABEL's vertical clearance nudge (see
    // pmResolveBackLabelClearance, which re-runs SHOULDER-MATCH after its
    // own nudge to restore alignment either way) - confirmed acceptable
    // with the 4-side version in testing. Each item is resized about its
    // OWN center, then translated so the net effect is scaling about the
    // shared anchor.
    function pmScaleMatchItems(items, s, ax, ay) {
        for (var i = 0; i < items.length; i++) {
            try {
                var it = items[i];
                var b = it.geometricBounds;
                var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
                it.resize(s * 100, s * 100, true, true, true, true, 100, Transformation.CENTER);
                it.translate((cx - ax) * (s - 1), (cy - ay) * (s - 1));
            } catch (e) {}
        }
    }

    // SHOULDER-MATCH: measured once per size, on the job's front panel, the
    // moment that panel's own clip is built. `partLabel` is only for logs;
    // `isSplitFront` says whether that panel is a full-button HALF front
    // (Front-Left) or a whole one-piece front (normal jersey / hoodie) - see
    // the travel-cap note below, it is the single geometric difference between
    // the two cases. NOT a bounding-box
    // distance, and NOT a raw-cut-edge distance either (both earlier
    // versions were wrong - the Match shape's bbox top legitimately bleeds
    // past the panel's own top edge, and the raw cut-line corner isn't
    // where the garment is actually sewn together, that's 7mm in from
    // there). The real quantity, confirmed against the customer's own
    // overlay check (Front placed over Back, outline view): the straight
    // chord distance, ON THE -7MM STITCH LINE, from Front-Left's own
    // shoulder-tip stitch-line corner (its outer/non-seam side) to the
    // point where its Match shape actually CROSSES that stitch line.
    // Captured here (before any later placket-match join/mirror can touch
    // Front-Left's content) so the target reflects Front-Left's own design
    // as originally drawn, regardless of what happens to it afterwards.
    function pmMeasureShoulderTarget(baseShape, pastedDesign, sizeLabel, partLabel, isSplitFront) {
        partLabel = partLabel || "Front-Left"; // ES3: no default parameters
        try {
            var lines = pmFindMatchLines(pastedDesign);
            if (lines.length === 0) { log("SHOULDER-MATCH: no Match shape found on " + partLabel + " for size " + sizeLabel + " - Back will not be adjusted."); return; }
            var panelB = baseShape.geometricBounds; // [L,T,R,B]
            var outline = _smSampleOutline(baseShape, 48);
            if (outline.length < 8) { pmWarn(sizeLabel, partLabel, "could not sample panel outline for shoulder-match"); return; }
            var seam = _smInsetOutline(outline, SM_SEAM_PT);
            // LEFT bound either way. On Front-Left that is its outer (non-seam)
            // side, the only shoulder it has. On a one-piece front it is simply
            // the left shoulder - ONE side is measured and applied to both of
            // Back's shoulders, exactly as before (the front design is drawn
            // symmetric about the centre line, so both sides read the same).
            var corner = pmSeamCorner(outline, seam, panelB[0], panelB[1]);
            if (!corner) { pmWarn(sizeLabel, partLabel, "could not resolve the -7mm stitch-line shoulder corner"); return; }
            var panelW = Math.abs(panelB[2] - panelB[0]);
            // How far the walk from the shoulder corner may travel looking for
            // the Match_ crossing. A split front half spans ONE shoulder, so a
            // full panel-width of travel can never wrap onto a second one. A
            // WHOLE front spans BOTH shoulders with the neckline between them,
            // and its neck is far deeper than Back's - a full-width walk from
            // the left shoulder tip can descend into the neck curve and climb
            // back up the RIGHT shoulder, where a Match_ line would return a
            // perfectly plausible but badly wrong (far too large) distance, and
            // nothing downstream could tell. Half the width is the same
            // physical reach a split half already gets, measured on the same
            // garment - not a tighter rule, the same one.
            var travelCap = isSplitFront ? panelW : (panelW * 0.5);
            var dist = pmSeamShoulderCrossDist(outline, seam, corner, lines, travelCap);
            if (dist === null) { pmWarn(sizeLabel, partLabel, "Match shape does not reach its own shoulder stitch line - cannot measure shoulder distance"); return; }
            log("SHOULDER-MATCH-DIAG [" + sizeLabel + "] " + partLabel + ": stitch corner=(" + _smMM(corner.S[0]) + "," + _smMM(corner.S[1]) + ")mm, dist to Match crossing=" + _smMM(dist) + "mm (walk capped at " + _smMM(travelCap) + "mm).");
            pmShoulderTargetDist[sizeLabel] = dist;
            log("SHOULDER-MATCH: " + partLabel + " stitch-line shoulder-to-Match distance for size " + sizeLabel + " = " + _smMM(dist) + "mm (target for Back).");
        } catch (e) { pmWarn(sizeLabel, partLabel, "error measuring shoulder-match target: " + e.message); }
    }

    // SHOULDER-MATCH: Back carries ONE Match shape wide enough to reach both
    // shoulders. The FRONT's own stitch-line shoulder-to-crossing distance -
    // the single number pmMeasureShoulderTarget stored, measured on one
    // shoulder - is the target for BOTH of Back's shoulders. That holds for
    // either kind of front: Front-Left/Front-Right are the same design
    // mirrored, and a one-piece front is drawn symmetric about its own centre
    // line, so the chord distance reads the same on each side either way
    // (unlike a raw X-difference, a chord length carries no left/right sign to
    // flip, which is why one measurement transfers to both shoulders at all).
    // Two independent knobs are needed to hit two targets at once: a
    // uniform SCALE (about the shape's own combined center - Alt+Shift-
    // style, never tilted) controls overall size, and a horizontal-only
    // SHIFT repositions it without resizing. Both crossing points move
    // non-linearly with either knob (sampled curves against a sampled
    // stitch line, not a bounding box), so this solves it the same way the
    // project's existing SLEEVE-MATCH curve-matching does but in 2
    // dimensions: measure the real geometry, numerically probe how each
    // knob actually moves each side's distance (a small Jacobian), solve
    // the 2x2 linear system for the correction, re-measure, repeat until
    // both sides are within +/-0.01pt (~0.0035mm) of target.
    function pmApplyBackShoulderMatch(baseShape, pastedDesign, sizeLabel, artboardIdx, instName) {
        try {
            var target = pmShoulderTargetDist[sizeLabel];
            if (target === undefined) { log("SHOULDER-MATCH: no Front target distance stored for size " + sizeLabel + " - Back left as-is."); return; }
            var lines = pmFindMatchLines(pastedDesign);
            if (lines.length === 0) { log("SHOULDER-MATCH: no Match shape found on Back for size " + sizeLabel + " - nothing to resize."); return; }

            var panelB = baseShape.geometricBounds;
            var panelW = Math.abs(panelB[2] - panelB[0]);
            var outline = _smSampleOutline(baseShape, 48);
            if (outline.length < 8) { pmWarn(sizeLabel, "Back", "could not sample panel outline for shoulder-match"); return; }
            var seam = _smInsetOutline(outline, SM_SEAM_PT);
            var leftCorner = pmSeamCorner(outline, seam, panelB[0], panelB[1]);
            var rightCorner = pmSeamCorner(outline, seam, panelB[2], panelB[1]);
            if (!leftCorner || !rightCorner) { pmWarn(sizeLabel, "Back", "could not resolve the -7mm stitch-line shoulder corners"); return; }

            function measure() {
                var dl = pmSeamShoulderCrossDist(outline, seam, leftCorner, lines, panelW);
                var dr = pmSeamShoulderCrossDist(outline, seam, rightCorner, lines, panelW);
                if (dl === null || dr === null) return null;
                return { left: dl, right: dr };
            }
            function shift(items, dx) {
                for (var s = 0; s < items.length; s++) { try { items[s].translate(dx, 0); } catch (eS) {} }
            }

            var m0 = measure();
            if (m0 === null) { pmWarn(sizeLabel, "Back", "Match shape does not reach its own shoulder stitch line - cannot measure shoulder distance"); return; }
            log("SHOULDER-MATCH-DIAG [" + sizeLabel + "] Back: left stitch corner=(" + _smMM(leftCorner.S[0]) + "," + _smMM(leftCorner.S[1]) + ")mm curDist=" + _smMM(m0.left) + "mm target=" + _smMM(target) +
                "mm | right stitch corner=(" + _smMM(rightCorner.S[0]) + "," + _smMM(rightCorner.S[1]) + ")mm curDist=" + _smMM(m0.right) + "mm target=" + _smMM(target) + "mm.");
            var TOL = 0.01; // pt, per side
            if (Math.abs(m0.left - target) < TOL && Math.abs(m0.right - target) < TOL) {
                log("SHOULDER-MATCH [" + sizeLabel + "]: Back's stitch-line shoulder-to-Match distances already match the Front on both sides - no adjustment needed.");
                return;
            }

            var b0 = pmCombinedBounds(lines);
            if (!b0) { pmWarn(sizeLabel, "Back", "could not read Match shape bounds for shoulder-match"); return; }
            var anchorX = (b0[0] + b0[2]) / 2, anchorY = (b0[1] + b0[3]) / 2;

            var guardRange = 3; // beyond a 3x grow/shrink the input geometry is wrong, not just a small mismatch
            var EPS_S = 0.01, EPS_T = 1; // small nudges used to numerically probe sensitivity
            var Scur = 1, Tcur = 0, cur = m0, ok = false, reverted = false, iter = 0;

            while (!ok && iter < 12) {
                iter++;
                var fL = cur.left - target, fR = cur.right - target;

                pmScaleMatchItems(lines, (Scur + EPS_S) / Scur, anchorX, anchorY);
                var mS = measure();
                pmScaleMatchItems(lines, Scur / (Scur + EPS_S), anchorX, anchorY); // revert probe
                if (mS === null) { pmWarn(sizeLabel, "Back", "lost the Match shape's edge crossing while probing scale - left as-is, check this size manually"); reverted = true; break; }

                shift(lines, EPS_T);
                var mT = measure();
                shift(lines, -EPS_T); // revert probe
                if (mT === null) { pmWarn(sizeLabel, "Back", "lost the Match shape's edge crossing while probing shift - left as-is, check this size manually"); reverted = true; break; }

                var dLdS = (mS.left - cur.left) / EPS_S, dRdS = (mS.right - cur.right) / EPS_S;
                var dLdT = (mT.left - cur.left) / EPS_T, dRdT = (mT.right - cur.right) / EPS_T;
                var det = dLdS * dRdT - dLdT * dRdS;
                if (!isFinite(det) || Math.abs(det) < 1e-9) { pmWarn(sizeLabel, "Back", "shoulder-match geometry is degenerate (scale and shift affect both sides identically) - left as-is, check this size manually"); reverted = true; break; }

                var dS = (-fL * dRdT + fR * dLdT) / det;
                var dT = (-dLdS * fR + dRdS * fL) / det;
                var Snext = Scur + dS, Tnext = Tcur + dT;
                if (!isFinite(Snext) || Snext <= 0 || Snext > guardRange || Snext < (1 / guardRange)) { pmWarn(sizeLabel, "Back", "shoulder-match scale factor went out of a sane range - left as-is, check this size manually"); reverted = true; break; }

                pmScaleMatchItems(lines, Snext / Scur, anchorX, anchorY);
                shift(lines, dT);
                var mNext = measure();
                if (mNext === null) {
                    pmWarn(sizeLabel, "Back", "lost the Match shape's edge crossing while resizing/shifting - reverted, check this size manually");
                    shift(lines, -dT);
                    pmScaleMatchItems(lines, Scur / Snext, anchorX, anchorY);
                    reverted = true; break;
                }
                Scur = Snext; Tcur = Tnext; cur = mNext;
                ok = (Math.abs(cur.left - target) < TOL && Math.abs(cur.right - target) < TOL);
            }

            if (reverted) return;
            if (!ok) {
                pmWarn(sizeLabel, "Back", "could not converge the two-sided shoulder-match within " + iter + " steps (left " + _smMM(cur.left) + "mm/target " + _smMM(target) +
                    "mm, right " + _smMM(cur.right) + "mm/target " + _smMM(target) + "mm) - left at closest reached, check this size manually");
            }

            log("SHOULDER-MATCH [" + sizeLabel + "]: Back Match shape resized to " + Math.round(Scur * 100) + "% and shifted " + _smMM(Tcur) + "mm in " + iter + " step(s) - left " +
                _smMM(cur.left) + "mm (target " + _smMM(target) + "mm), right " + _smMM(cur.right) + "mm (target " + _smMM(target) + "mm).");

            try {
                log("Re-queued JPG for " + instName + " (Back resized by SHOULDER-MATCH).");
                queueExport( artboardIdx, exportFolderFor(sizeLabel), instName, sizeLabel);
            } catch (eReexp) { log("SHOULDER-MATCH: could not re-export " + instName + ": " + eReexp.message); }
        } catch (e) { pmWarn(sizeLabel, "Back", "error during shoulder matching: " + e.message); }
    }
    // =========================== end PLACKET-MATCH v2 helpers ===========================

    // =========================== BACK-LABEL ===========================
    // Where the panel's OWN outline crosses the vertical line X = targetX -
    // used to find the true "top center" height (the neckline's own dip at
    // center), NOT the shoulder-corner height the overall bounding box top
    // would give (user confirmed via a marked-up render: measure from the
    // neck curve at center, not from the shoulder-tip corners). A closed
    // panel outline crosses any interior X twice (top/neck edge, bottom
    // hem) - preferMax picks the higher (top) crossing.
    function pmFindCrossingYAtX(shape, targetX, preferMax) {
        var polys = pmSampleItemPolylines(shape, 48);
        var best = null;
        for (var p = 0; p < polys.length; p++) {
            var poly = polys[p];
            for (var i = 0; i < poly.length - 1; i++) {
                var x0 = poly[i][0], x1 = poly[i + 1][0];
                if ((x0 >= targetX) === (x1 >= targetX)) continue; // no crossing this segment
                var t = (targetX - x0) / (x1 - x0);
                var y = poly[i][1] + t * (poly[i + 1][1] - poly[i][1]);
                if (best === null || (preferMax ? (y > best) : (y < best))) best = y;
            }
        }
        return best;
    }

    // Finds the Back panel's white label-logo group, named "Back Label"
    // (case/spacing-insensitive - "Back Label", "back_label", "BackLabel"
    // all match). A named GROUP is one unit, never recursed into.
    function findBackLabelArt(design) {
        var found = [];
        function hunt(container) {
            if (!container.pageItems) return;
            for (var i = 0; i < container.pageItems.length; i++) {
                var it = container.pageItems[i];
                var nm = ""; try { nm = (it.name || "").replace(/\s+/g, "").toLowerCase(); } catch (eN) {}
                if (nm.indexOf("backlabel") === 0) { found.push(it); continue; }
                if (it.typename === "GroupItem") hunt(it);
            }
        }
        hunt(design);
        return found;
    }

    // Forces the Back panel's "Back Label" group to sit an exact distance
    // below top-center - 2.5in for full-button jerseys, 1.5in otherwise
    // (1in = 72pt) - regardless of wherever it originally sat in the
    // pattern/mockup (absolute override, not a relative nudge; it can move
    // up just as easily as down). The label ALWAYS lands exactly here - it
    // is never pushed for a Match_ collision anymore (that used to happen
    // here; it's now handled the other way around, see
    // pmResolveBackLabelClearance, which moves Match_ instead and keeps
    // this label untouched).
    //
    // The label's top is its PAINTED top (_blPaintedBounds - visibleBounds per
    // leaf, so a stroke counts), not its geometric one, per explicit
    // instruction. The badge on this job's mockup is a circle with a heavy
    // white ring: geometricBounds stops at the circle PATH and leaves half that
    // ring hanging above it, so a "1.50in" placement printed short. Measured off
    // the job's own 300-ppi renders, every size came out at 1.417-1.420in
    // against the 1.500in the log claimed - a consistent 0.08in (~5.9pt) that
    // the ring plus the panel's own 3pt cut-line stroke were eating. Painted
    // bounds put the white ring itself at the intended distance, which is the
    // edge the eye and the designer's mockup both judge.
    //
    // The NECK end is measured on the panel's VISIBLE edge too, per explicit
    // instruction - both ends of the 1.5in are painted edges, one rule.
    //
    // pmFindCrossingYAtX samples PATH geometry, and the cut outline
    // (PATTERN_OUTLINE_PT, 3pt) straddles that path: half above the neck curve,
    // half below. Starting the measurement at the path therefore starts it in
    // the MIDDLE of the printed line and buries 1.5pt of the 1.5in inside the
    // stroke. Half the stroke width is added back so the measurement starts at
    // the outer edge of the line the eye sees. Read off the item rather than
    // assuming PATTERN_OUTLINE_PT, so a piece that reaches here with a different
    // outline (or none) still measures from its own real edge.
    //
    // This was deliberately NOT done at first - the argument being that the 3pt
    // outline is a cut MARKER rather than garment artwork, so the 1.5in belonged
    // to the seam line the cutter works to. Overruled: the label end of the
    // measurement is already on painted bounds, and one measurement with two
    // different rules at its two ends is the thing that produced the original
    // short placement. Effect: the label sits 1.5pt (0.02in) lower than it did.
    function placeBackLabel(baseShape, pastedDesign, sizeLabel, isFullButton) {
        try {
            var labelItems = findBackLabelArt(pastedDesign);
            if (labelItems.length === 0) return; // no "Back Label" group on this panel - nothing to do

            var lb = _blPaintedBounds(labelItems); // [L,T,R,B] - painted, stroke included
            if (!lb) { log("BACK-LABEL WARNING: could not read 'Back Label' bounds for size " + sizeLabel + "."); return; }

            var pb = baseShape.geometricBounds; // [L,T,R,B] - the cut path
            // Horizontal centring stays on the PATH: a stroke is symmetric left
            // to right, so the path centre and the painted centre agree, and the
            // path one cannot be dragged sideways by a miter spike on one edge.
            var centerX = (pb[0] + pb[2]) / 2;

            // Half the cut outline, to lift the reference from the middle of the
            // printed line to its outer edge (see the note above the function).
            var halfOutline = 0;
            try { if (baseShape.stroked) halfOutline = baseShape.strokeWidth / 2; } catch (eSW) {}

            // "Top center" = the neckline's own curve at center X, not the
            // shoulder-tip corners (which is all the bounding box top gives).
            var neckCenterY = pmFindCrossingYAtX(baseShape, centerX, true);
            var topRefY, offsetPt;
            if (neckCenterY !== null) {
                // +y is UP, so the painted neck edge sits half a stroke ABOVE
                // the path. At the centre of the neck dip the curve's tangent is
                // horizontal, so that offset is purely vertical here.
                topRefY = neckCenterY + halfOutline;
                offsetPt = (isFullButton ? 2.5 : 1.5) * 72;
            } else {
                // FALLBACK: neckline center could not be detected from the
                // panel's outline - fall back to the bounding-box top
                // (shoulder-tip height) with a bigger, safer 4in offset
                // (instead of the normal 2.5in/1.5in) so the label doesn't
                // land too close to the neck. Reported to debug_log.txt and
                // surfaced to the frontend (back_label_warnings.json).
                // visibleBounds here, not pb - same painted-edge rule as above,
                // and this box already carries the stroke.
                var vbTop = null;
                try { vbTop = baseShape.visibleBounds[1]; } catch (eVB) {}
                topRefY = (vbTop === null) ? pb[1] : vbTop;
                offsetPt = 4 * 72;
                var fbMsg = "size " + sizeLabel + ": could not detect the neckline center on Back - 'Back Label' positioned 4in below the shoulder-top line as a fallback (check placement manually).";
                backLabelWarnings.push(fbMsg);
                log("BACK-LABEL WARNING: " + fbMsg);
            }
            var targetTopY = topRefY - offsetPt;

            var curCenterX = (lb[0] + lb[2]) / 2;
            var dx = centerX - curCenterX;
            var dy = targetTopY - lb[1];
            for (var i = 0; i < labelItems.length; i++) {
                try { labelItems[i].translate(dx, dy); } catch (eT) {}
            }

            // VERIFY: re-measure the group's actual position after moving it -
            // don't just trust the math, in case a per-item translate above
            // silently failed on one piece of a multi-item "Back Label" group.
            // Same painted measure the placement used, or the check would pass
            // on a number the print does not show.
            var lbAfter = _blPaintedBounds(labelItems);
            var TOL_PT = 0.5; // pt
            if (!lbAfter) {
                log("BACK-LABEL WARNING: could not re-measure 'Back Label' after moving it for size " + sizeLabel + " - final position not verified.");
            } else if (Math.abs(lbAfter[1] - targetTopY) > TOL_PT) {
                var expectedIn = (topRefY - targetTopY) / 72, actualIn = (topRefY - lbAfter[1]) / 72;
                var vMsg = "size " + sizeLabel + ": 'Back Label' verification failed - expected " + expectedIn.toFixed(2) + "in below top-center but measured " + actualIn.toFixed(2) + "in (some pieces of the group may not have moved) - check manually.";
                backLabelWarnings.push(vMsg);
                log("BACK-LABEL WARNING: " + vMsg);
            } else {
                var finalIn = (topRefY - lbAfter[1]) / 72;
                // Report the geometric top alongside it: the difference IS the
                // stroke overhang this fix stopped losing, so a future run shows
                // at a glance how much ink sits above the path on that mockup.
                var geoAfter = pmCombinedBounds(labelItems);
                // +y is UP, so the painted top is the LARGER number.
                var overhangPt = geoAfter ? (lbAfter[1] - geoAfter[1]) : null;
                log("BACK-LABEL: 'Back Label' verified at " + finalIn.toFixed(2) + "in below top-center for size " + sizeLabel
                    + " - painted neck edge to painted label top (outline half-width "
                    + (Math.round(halfOutline * 100) / 100) + "pt added to the neck; label's own stroke sits "
                    + (overhangPt === null ? "?" : (Math.round(overhangPt * 10) / 10)) + "pt above its geometric top).");
            }
        } catch (e) {
            log("BACK-LABEL WARNING: could not position 'Back Label' for size " + sizeLabel + ": " + e.message);
        }
    }

    // BACK-LABEL/SHOULDER-MATCH clearance. If the Match_ arc's painted bottom
    // leaves less than CLEARANCE_PT above the label's painted top, the LABEL
    // slides down by the shortfall - the arc is never touched.
    //
    // It used to be the other way round (arc up, label pinned). Reversed on
    // explicit instruction, and the geometry agrees: the arc is load-bearing,
    // because pmApplyBackShoulderMatch sizes it against the Front's shoulder
    // distance, so moving it fights the very match it is about to be refitted
    // to. The label carries no such constraint.
    //
    // The label's travel is capped at BUDGET_PT in TOTAL, so its intended
    // 2.5in/1.5in offset becomes a 2.5in-2.8in range rather than an open-ended
    // slide. A shortfall bigger than the budget is REPORTED, not absorbed.
    //
    // SHOULDER-MATCH is still re-run after each move: shifting the label can
    // change what the next round measures, and re-matching can move the arc in
    // turn, so the two are iterated until they hold together. Each step is
    // small, so it settles in a couple of rounds.

    // PAINTED bounds of a set of items - what the eye actually judges, which is
    // what a visual clearance has to be measured against.
    //
    // Two corrections over plain geometricBounds on the group:
    //   - visibleBounds, not geometricBounds, so a stroke counts. Confirmed on
    //     this job: 'Match_mix' carries a 60pt stroke and its visible bottom
    //     sits exactly 30pt - half the width - below its geometric one. That
    //     30pt is why the arc could paint onto the badge while the check still
    //     reported a healthy gap, and why the paths looked fine in outline view.
    //   - groups are WALKED INTO rather than measured whole. "Back Label" here
    //     turned out to hold the badge AND the number, so its own bounds run
    //     1513pt (21in) top to bottom; only leaf art gives a top that means
    //     anything. A clipped group is the one exception - it paints only
    //     inside its mask, so the mask is what gets measured.
    function _blPaintedBounds(items) {
        var b = null;
        function take(bb) {
            if (!bb) return;
            if (!b) { b = [bb[0], bb[1], bb[2], bb[3]]; return; }
            if (bb[0] < b[0]) b[0] = bb[0];
            if (bb[1] > b[1]) b[1] = bb[1];
            if (bb[2] > b[2]) b[2] = bb[2];
            if (bb[3] < b[3]) b[3] = bb[3];
        }
        function walk(it) {
            var t = "";
            try { t = it.typename; } catch (eT) { return; }
            if (t === "GroupItem") {
                var clipped = false;
                try { clipped = !!it.clipped; } catch (eC) {}
                var n = 0;
                try { n = it.pageItems.length; } catch (eL) { n = 0; }
                if (clipped) {
                    for (var c = 0; c < n; c++) {
                        var isMask = false;
                        try { isMask = !!it.pageItems[c].clipping; } catch (eM) {}
                        // The mask itself is never painted, so its own stroke
                        // must not widen the result - geometric on purpose.
                        if (isMask) { try { take(it.pageItems[c].geometricBounds); } catch (eB3) {} return; }
                    }
                }
                if (n === 0) { try { take(it.visibleBounds); } catch (eB4) {} return; }
                for (var i = 0; i < n; i++) walk(it.pageItems[i]);
                return;
            }
            try { take(it.visibleBounds); } catch (eB2) {}
        }
        for (var k = 0; k < items.length; k++) walk(items[k]);
        return b;
    }

    function pmResolveBackLabelClearance(baseShape, pastedDesign, sizeLabel, artboardIdx, instName) {
        try {
            var labelItems = findBackLabelArt(pastedDesign);
            var matchItems = pmFindMatchLines(pastedDesign);
            if (labelItems.length === 0 || matchItems.length === 0) return; // nothing to resolve

            // 0.16in, not the 0.3in this used to ask for: 0.16in is what the
            // MOCKUP itself draws. Measured straight out of mockup.ai with the
            // same painted-bounds rule used below - Back Label's painted top
            // 815.7, Match_mix's painted bottom 827.5, i.e. 11.8pt = 0.16in.
            // (Geometrically those same two read 51pt = 0.71in apart, because
            // Match_mix carries a 60pt stroke and the label about 18pt - which
            // is exactly why the old geometric check was content while the arc
            // visibly sat on the badge.) Asking for 0.3in would have pushed the
            // label 0.14in below where the designer put it on every panel.
            var CLEARANCE_PT = 0.16 * 72;
            var BUDGET_PT = 0.3 * 72;      // the MOST the label may travel down, total
            var ARC_BUDGET_PT = 1.5 * 72;  // and the most the Match_ shape may travel up
            var TOL_PT = 0.5; // pt - "close enough" so floating-point/geometry
            // noise near the exact boundary doesn't burn rounds re-nudging and
            // re-exporting for a fraction of a point that's invisible in print.
            var movedDown = 0; // how much of BUDGET_PT the label has spent
            var arcMoved = 0;  // how much of ARC_BUDGET_PT the Match_ shape has spent

            for (var round = 0; round < 5; round++) {
                // Painted edge to painted edge on BOTH sides - this is a
                // clearance the eye judges, and the label's own top has to come
                // from its leaf art too (its group spans badge AND number).
                var lb = _blPaintedBounds(labelItems);
                var mb = _blPaintedBounds(matchItems);
                if (!lb || !mb) { log("BACK-LABEL WARNING: could not re-measure 'Back Label'/Match_ bounds while resolving clearance for size " + sizeLabel + "."); return; }

                // BL-DIAG (temporary): the clearance below is computed from the
                // COMBINED bounds of every "match"-prefixed item, so a trim arc
                // the artist did NOT name "Match_..." is invisible to it and can
                // sit right on top of the label while this still reports a
                // healthy gap. Reported on job 2b17c990/uatest-20260819 (2XL
                // Back): the yellow neck arc touches the badge although the
                // check settled at 0.29in. Print what is actually being measured
                // so the next run names the culprit instead of guessing.
                if (round === 0) {
                    // Print geometric AND visible bottoms plus the stroke width
                    // for every item, because which of the two actually tracks
                    // the painted edge is the whole question here: a heavy
                    // stroke should push visibleBounds well past geometric, and
                    // if it does not, the paint is coming from somewhere else
                    // (an appearance/effect, or an item not named "match" at
                    // all) and no bounds fix can catch it.
                    function _blOne(it) {
                        var nm = "";
                        try { nm = it.name || ("<unnamed " + it.typename + ">"); } catch (eN1) { nm = "<unreadable>"; }
                        var gB = null, vB = null, sw = null, st = false;
                        try { gB = it.geometricBounds; } catch (e1) {}
                        try { vB = it.visibleBounds; } catch (e2) {}
                        try { st = !!it.stroked; } catch (e3) {}
                        try { sw = it.strokeWidth; } catch (e4) {}
                        var s = "'" + nm + "' (" + it.typename + ")";
                        if (gB) s += " geoBottom=" + (Math.round(gB[3] * 10) / 10);
                        if (vB) s += " visBottom=" + (Math.round(vB[3] * 10) / 10);
                        s += " stroked=" + st;
                        if (sw !== null) s += " strokeW=" + (Math.round(sw * 10) / 10) + "pt";
                        return s;
                    }
                    var dParts = [];
                    for (var dI = 0; dI < matchItems.length; dI++) dParts.push(_blOne(matchItems[dI]));
                    var lParts = [];
                    for (var lI = 0; lI < labelItems.length; lI++) lParts.push(_blOne(labelItems[lI]));
                    log("BL-DIAG " + sizeLabel + " LABEL (" + labelItems.length + "): " + lParts.join(" | ") +
                        " || combined top used=" + (Math.round(lb[1] * 10) / 10));
                    log("BL-DIAG " + sizeLabel + " MATCH (" + matchItems.length + "): " + dParts.join(" | ") +
                        " || combined bottom used=" + (Math.round(mb[3] * 10) / 10) +
                        " || gap=" + (Math.round((mb[3] - lb[1]) * 10) / 10) + "pt (need " + CLEARANCE_PT + "pt)");
                }

                var gap = mb[3] - lb[1]; // Match_'s painted bottom minus the label's painted top
                if (gap >= CLEARANCE_PT - TOL_PT) {
                    if (round > 0) log("BACK-LABEL: clearance settled for size " + sizeLabel + " after " + round + " round(s) (gap " + (gap / 72).toFixed(2) + "in | label moved down " + (movedDown / 72).toFixed(2) + "in, Match_ moved up " + (arcMoved / 72).toFixed(2) + "in in total).");
                    return;
                }

                // THE LABEL GOES FIRST, THE ARC TAKES WHAT IS LEFT.
                //
                // The label is preferred because it carries no other job: the
                // arc is load-bearing, pmApplyBackShoulderMatch sizes it against
                // the Front's shoulder distance. But the label alone cannot
                // finish, and the reason is worth writing down: SHOULDER-MATCH
                // grows the arc to close a Back/Front difference (XL: 126.3mm
                // vs 114.3mm, arc resized to 109%), and growing it drives its
                // BOTTOM down onto the badge. On XL that is a 1.09in shortfall
                // against a 0.3in label budget - the label can never cover it,
                // and a label-only pass cannot even converge, because moving
                // the label does not change the shoulder-to-arc distance, so
                // the re-match that follows has nothing to do.
                //
                // So: label down to its BUDGET_PT cap (its 2.5in placement is
                // worth protecting), then the arc up for the remainder, then
                // re-match - which now DOES have work, because the arc moved.
                // Both travels are capped and anything left over is reported.
                var need = CLEARANCE_PT - gap;

                var labelRoom = BUDGET_PT - movedDown;
                if (labelRoom < 0) labelRoom = 0;
                var labelDy = need;
                if (labelDy > labelRoom) labelDy = labelRoom;

                var arcRoom = ARC_BUDGET_PT - arcMoved;
                if (arcRoom < 0) arcRoom = 0;
                var arcDy = need - labelDy;
                if (arcDy > arcRoom) arcDy = arcRoom;

                if (labelDy <= TOL_PT && arcDy <= TOL_PT) {
                    var stuckMsg = "size " + sizeLabel + ": both budgets are spent ('Back Label' down " + (movedDown / 72).toFixed(2) + "in of " + (BUDGET_PT / 72).toFixed(2) + "in, Match_ arc up " + (arcMoved / 72).toFixed(2) + "in of " + (ARC_BUDGET_PT / 72).toFixed(2) + "in) and the arc is still " + (need / 72).toFixed(2) + "in too close (gap " + (gap / 72).toFixed(2) + "in, want " + (CLEARANCE_PT / 72).toFixed(2) + "in) - check this panel manually.";
                    backLabelWarnings.push(stuckMsg);
                    log("BACK-LABEL WARNING: " + stuckMsg);
                    return;
                }

                // translate's +y is UP: the label goes down, the arc goes up.
                if (labelDy > 0) {
                    for (var i = 0; i < labelItems.length; i++) { try { labelItems[i].translate(0, -labelDy); } catch (eT) {} }
                    movedDown += labelDy;
                }
                if (arcDy > 0) {
                    for (var m = 0; m < matchItems.length; m++) { try { matchItems[m].translate(0, arcDy); } catch (eT2) {} }
                    arcMoved += arcDy;
                }

                var parts = [];
                if (labelDy > 0) parts.push("label down " + (labelDy / 72).toFixed(2) + "in");
                if (arcDy > 0) parts.push("arc up " + (arcDy / 72).toFixed(2) + "in");
                var shortfallLeft = need - labelDy - arcDy;
                log("BACK-LABEL: Match_ arc was " + (gap / 72).toFixed(2) + "in from 'Back Label' (size " + sizeLabel + ", need " + (CLEARANCE_PT / 72).toFixed(2) + "in) - " + parts.join(" + ") +
                    (shortfallLeft > TOL_PT ? " (still " + (shortfallLeft / 72).toFixed(2) + "in short, budgets capped)" : "") +
                    ", re-matching with Front...");

                pmApplyBackShoulderMatch(baseShape, pastedDesign, sizeLabel, artboardIdx, instName);
            }

            var lbF = _blPaintedBounds(labelItems), mbF = _blPaintedBounds(matchItems);
            var finalGap = (lbF && mbF) ? (mbF[3] - lbF[1]) : null;
            var msg = "size " + sizeLabel + ": could not settle Match_/Back Label clearance and the Front shoulder-match together after 5 rounds" +
                (finalGap !== null ? " (final gap " + (finalGap / 72).toFixed(2) + "in, need " + (CLEARANCE_PT / 72).toFixed(2) + "in)" : "") +
                " - label moved down " + (movedDown / 72).toFixed(2) + "in of " + (BUDGET_PT / 72).toFixed(2) + "in, Match_ moved up " + (arcMoved / 72).toFixed(2) + "in of " + (ARC_BUDGET_PT / 72).toFixed(2) + "in - check manually.";
            backLabelWarnings.push(msg);
            log("BACK-LABEL WARNING: " + msg);
        } catch (e) {
            log("BACK-LABEL WARNING: error resolving Match_/Back Label clearance for size " + sizeLabel + ": " + e.message);
        }
    }
    // =========================== end BACK-LABEL ===========================

    // CMYK-DIRECT: returns the panel base fill from a pasted design.
    // Priority: an item named 'base-path' (the mockup's panel shape, same names
    // removeBasePaths deletes later), else the LARGEST filled path. The fill
    // object is returned AS-IS - solid CMYK, spot or gradient - no conversion.
    function getDesignBaseFill(design) {
        var named = null, largest = null, maxArea = -1;
        function fillOf(it) {
            try {
                if (it.typename === "CompoundPathItem") {
                    var p = (it.pathItems && it.pathItems.length) ? it.pathItems[0] : null;
                    return (p && p.filled) ? p.fillColor : null;
                }
                if (it.filled) return it.fillColor;
            } catch (e) {}
            return null;
        }
        function consider(it) {
            if (it.typename !== "PathItem" && it.typename !== "CompoundPathItem") return;
            var n = "";
            try { n = (it.name || "").toLowerCase().replace(/^\s+|\s+$/g, ""); } catch (eN) {}
            if (!named && (n === "base-path" || n === "base_path" || n === "basepath")) named = it;
            if (n.indexOf("logo") !== -1) return;
            if (fillOf(it)) {
                var area = 0;
                try { area = Math.abs(it.width * it.height); } catch (eA) {}
                if (area > maxArea) { maxArea = area; largest = it; }
            }
        }
        function walk(container) {
            var items = null;
            try { items = container.pageItems; } catch (eP) {}
            // A design can BE a single path rather than contain one - the
            // mockup's Twill Tape is a bare PathItem on real jobs, not a group.
            // findPlacementPath has always handled that (it returns the
            // container itself); without this the caller sees "no fill found"
            // and the part silently keeps the pattern file's stock color.
            if (!items) { consider(container); return; }
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (it.typename === "GroupItem") { walk(it); continue; }
                consider(it);
            }
        }
        walk(design);
        var namedFill = named ? fillOf(named) : null;
        if (namedFill) return { color: namedFill, src: "'" + named.name + "'" };
        var largestFill = largest ? fillOf(largest) : null;
        if (largestFill) return { color: largestFill, src: "largest filled path" };
        return null;
    }

    // CMYK-DIRECT: turns a color read off a MOCKUP item into an equivalent that
    // is safe to assign inside orderDoc. Same rules as mergeAndCleanupSwatches'
    // processSubColor (spot re-created with its exact ink, plain CMYK copied,
    // gray mapped to K-only), because a color object taken straight off a
    // mockup item keeps a cross-document reference and renders as no-fill once
    // the mockup closes. Gradients cannot survive the crossing as gradients, so
    // they collapse to their first stop - the caller logs that.
    function resolveInkForOrderDoc(c) {
        try {
            if (!c || c.typename === "NoColor") return null;
            if (c.typename === "GradientColor") {
                try { c = c.gradient.gradientStops[0].color; } catch (eG) { return null; }
                if (!c || c.typename === "NoColor") return null;
            }
            if (c.typename === "SpotColor") {
                var ink = c.spot.color;
                try { if (ink && ink.typename === "SpotColor") ink = ink.spot.color; } catch (eN) {}
                if (ink && ink.typename === "GrayColor") {
                    var gi = new CMYKColor(); gi.cyan = 0; gi.magenta = 0; gi.yellow = 0; gi.black = ink.gray;
                    ink = gi;
                }
                if (ink && ink.typename === "CMYKColor") {
                    var sp = getOrCreateSpot(orderDoc, c.spot.name.replace(/^MOCK_/, ""), ink);
                    var sc = new SpotColor(); sc.spot = sp;
                    // Carry the item's own tint across - a fresh SpotColor is 100%.
                    try { sc.tint = c.tint; } catch (eT) {}
                    return sc;
                }
                return null;
            }
            if (c.typename === "CMYKColor") {
                var ck = new CMYKColor();
                ck.cyan = c.cyan; ck.magenta = c.magenta; ck.yellow = c.yellow; ck.black = c.black;
                return ck;
            }
            if (c.typename === "GrayColor") {
                var gk = new CMYKColor();
                gk.cyan = 0; gk.magenta = 0; gk.yellow = 0; gk.black = c.gray;
                return gk;
            }
        } catch (e) {}
        return null;
    }

    // CMYK-DIRECT: the stroke color the mockup actually draws on a design.
    // Selection mirrors getDesignBaseFill - a path named 'base-path' if it is
    // stroked, else the LARGEST stroked path - and the result is always run
    // through resolveInkForOrderDoc, so the caller never receives a raw
    // cross-document color. Returns null when the design draws no stroke.
    function getDesignStrokeColor(design) {
        var named = null, largest = null, maxArea = -1;
        function strokeOf(it) {
            try {
                if (it.typename === "CompoundPathItem") {
                    var p = (it.pathItems && it.pathItems.length) ? it.pathItems[0] : null;
                    return (p && p.stroked) ? p.strokeColor : null;
                }
                if (it.stroked) return it.strokeColor;
            } catch (e) {}
            return null;
        }
        function consider(it) {
            if (it.typename !== "PathItem" && it.typename !== "CompoundPathItem") return;
            var n = "";
            try { n = (it.name || "").toLowerCase().replace(/^\s+|\s+$/g, ""); } catch (eN) {}
            if (!named && (n === "base-path" || n === "base_path" || n === "basepath") && strokeOf(it)) named = it;
            if (n.indexOf("logo") !== -1) return;
            if (strokeOf(it)) {
                var area = 0;
                try { area = Math.abs(it.width * it.height); } catch (eA) {}
                if (area > maxArea) { maxArea = area; largest = it; }
            }
        }
        function walk(container) {
            var items = null;
            try { items = container.pageItems; } catch (eI) {}
            // Same bare-path case as getDesignBaseFill above: the mockup's
            // Twill Tape is a single stroked PathItem, so without this the
            // accessory stroke would always fall back to the default dark ink.
            if (!items) { consider(container); return; }
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (it.typename === "GroupItem") { walk(it); continue; }
                consider(it);
            }
        }
        try { walk(design); } catch (eW) { return null; }
        var pick = strokeOf(named) || strokeOf(largest);
        return pick ? resolveInkForOrderDoc(pick) : null;
    }

    function isolateGraphics(container) {
        try {
            if (!container || container.pageItems.length < 2) return;
            var pathsToDelete = [], maxArea = 0;
            function findMax(items) {
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    if (it.typename === "PathItem" || it.typename === "CompoundPathItem") {
                        var area = Math.abs(it.width * it.height); if (area > maxArea) maxArea = area;
                    } else if (it.typename === "GroupItem") findMax(it.pageItems);
                }
            }
            findMax(container.pageItems);
            function collect(items) {
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    if (it.typename === "PathItem" || it.typename === "CompoundPathItem") {
                        if (Math.abs(it.width * it.height) >= maxArea * 0.9) pathsToDelete.push(it);
                    } else if (it.typename === "GroupItem") collect(it.pageItems);
                }
            }
            collect(container.pageItems);
            for (var d = 0; d < pathsToDelete.length; d++) pathsToDelete[d].remove();
        } catch (e) {}
    }

    function getSourceView(part, mockupDoc, hasPers) {
        var nPart = part.toLowerCase();
        if (isAccessory(nPart)) {
            // Accessories look up ONLY their own design group - no logo fallback.
            var accTargets;
            if (nPart.indexOf("placket") !== -1) accTargets = ["Placket"];
            else if (nPart.indexOf("tukdi") !== -1) accTargets = ["Tukdi"];
            else accTargets = ["Twill Tape"];
            for (var ac = 0; ac < accTargets.length; ac++) { var accFound = findAnywhere(mockupDoc, accTargets[ac]); if (accFound) return accFound; }
            return null;
        }
        // RIB & CUFF: looked up the same way as the accessories above (per
        // explicit instruction: "jo logic twill tape ki he") - its own group
        // in the mockup only, so the panel takes the colour the designer
        // actually drew on the mockup's rib/cuff. "cuff" matched none of the
        // branches below, so it used to fall straight through to the generic
        // logo fallback; on a real job that found nothing at all and the panel
        // silently kept the PATTERN file's stock fill (debug_log: "SKIP: No
        // matching design found in mockup for cuff" -> Rib & Cuff exported
        // red while the garment was black/grey).
        // Early return WITHOUT the logo fallback, same reason as accessories:
        // a logo is not this panel's colour.
        if (nPart.indexOf("cuff") !== -1) {
            // findAnywhere strips non-alphanumerics, so "Rib & Cuff",
            // "Rib&Cuff" and "Rib Cuff" are all the same lookup key.
            var ribTargets = ["Rib & Cuff", "Rib and Cuff", "Cuff & Rib", "Cuff and Rib", "Cuff", "Rib"];
            for (var rc = 0; rc < ribTargets.length; rc++) {
                var ribFound = findAnywhere(mockupDoc, ribTargets[rc]);
                if (ribFound) return ribFound;
            }
            return null;
        }
        var targets = [];
        if (nPart.indexOf("sleeve") !== -1) {
            if (nPart.indexOf("right") !== -1) targets.push("Right Sleeve", "Right_Sleeve", "RightSleeve", "Short Sleeve Right", "Long Sleeve Right", "Sleeve Right", "Right Short Sleeve", "Right Long Sleeve", "Sleeve");
            else if (nPart.indexOf("left") !== -1) targets.push("Left Sleeve", "Left_Sleeve", "LeftSleeve", "Short Sleeve Left", "Long Sleeve Left", "Sleeve Left", "Left Short Sleeve", "Left Long Sleeve", "Sleeve");
            else targets.push("Short Sleeve", "Short_Sleeve", "Long Sleeve", "Long_Sleeve", "Full Sleeve", "Sleeve", "sleeve", "Sleeves", "Short Sleeve Right", "Short Sleeve Left", "Long Sleeve Right", "Long Sleeve Left", "Right Short Sleeve", "Left Short Sleeve", "Right Long Sleeve", "Left Long Sleeve", "Right Sleeve", "Left Sleeve");
        }
        else if (nPart.indexOf("front") !== -1) {
            // FULL-BUTTON: "front-left"/"front-right" (see mockupHasBothFrontSides).
            if (nPart.indexOf("left") !== -1) targets = ["Front Left", "Left Front", "Front_Left", "FrontLeft"];
            else if (nPart.indexOf("right") !== -1) targets = ["Front Right", "Right Front", "Front_Right", "FrontRight"];
            else targets = ["front", "FRONT", "Front View", "Front_View"];
        }
        else if (nPart.indexOf("patti") !== -1) targets = ["Patti", "patti", "PATTI"];
        else if (nPart.indexOf("back") !== -1) targets = ["back", "BACK", "Back View", "Back_View"];
        else if (nPart.indexOf("neck") !== -1) targets = ["Neck", "neck", "NECK", "collar", "Rib"];
        targets.push("logo", "LOGO", "Logo_Group");
        for (var t = 0; t < targets.length; t++) { var found = findAnywhere(mockupDoc, targets[t]); if (found) return found; }
        return null;
    }

    // Recolors the text sitting ON a panel to pure white or pure black,
    // whichever reads against that panel's own background color.
    // `skipDesignGroup` (opt-in, default OFF so the long-standing Neck call at
    // the top of this file is untouched) keeps the recursion out of
    // 'design_clip_group' - the pasted MOCKUP artwork. Without it this walks
    // into the design too (the design is nested inside the panel group by the
    // clip setup) and flattens the designer's own text to one flat ink, which
    // is fine for Neck (its design is just brand text) but destroys artwork on
    // a piece like the Hood.
    function smartContrast(group, bgColor, skipDesignGroup) {
        try {
            if (!bgColor) return;
            // Per-part fills can now be spot or gradient: judge brightness from
            // the spot's ink / the gradient's first stop.
            try {
                if (bgColor.typename === "GradientColor") bgColor = bgColor.gradient.gradientStops[0].color;
                if (bgColor.typename === "SpotColor") bgColor = bgColor.spot.color;
            } catch (eBg) {}
            var b = 0;
            if (bgColor.typename === "CMYKColor") b = (1 - (bgColor.cyan/100 * 0.3 + bgColor.magenta/100 * 0.59 + bgColor.yellow/100 * 0.11 + bgColor.black/100));
            else if (bgColor.typename === "RGBColor") b = (0.299 * bgColor.red + 0.587 * bgColor.green + 0.114 * bgColor.blue) / 255;
            var c = new CMYKColor(); if (b < 0.5) { c.cyan=0; c.magenta=0; c.yellow=0; c.black=0; } else { c.cyan=0; c.magenta=0; c.yellow=0; c.black=100; }
            function applyToText(container) {
                if (container.textFrames) for (var t = 0; t < container.textFrames.length; t++) container.textFrames[t].textRange.characterAttributes.fillColor = c;
                if (container.pathItems) {
                    for (var p = 0; p < container.pathItems.length; p++) {
                        var it = container.pathItems[p];
                        var n = (it.name || "").toLowerCase();
                        if (n.indexOf("label") !== -1 || n.indexOf("size") !== -1 || n.indexOf("logo") !== -1) {
                            if (it.filled) it.fillColor = c; if (it.stroked) it.strokeColor = c;
                        }
                    }
                }
                if (container.groupItems) for (var g = 0; g < container.groupItems.length; g++) {
                    if (skipDesignGroup) {
                        var gn = "";
                        try { gn = container.groupItems[g].name || ""; } catch (eGn) {}
                        if (gn === "design_clip_group") continue;
                    }
                    applyToText(container.groupItems[g]);
                }
            }
            applyToText(group);
        } catch (e) {}
    }

    function applyTextReplacements(container, replacements) {
        for (var i = 0; i < replacements.length; i++) {
            var rep = replacements[i];
            if (!rep.layer_name) continue;

            var lName = rep.layer_name.toUpperCase();
            var targets = [lName];
            
            if (lName.indexOf("NAME") !== -1) {
                targets.push("PLAYER NAME", "NAME_LAYER");
            } else if (lName.indexOf("NUMBER") !== -1 || lName === "NUM" || lName === "#") {
                targets.push("NUMBER", "NUM", "#", "PLAYER NUMBER");
            }

            for (var t = 0; t < targets.length; t++) {
                replaceInContainer(container, targets[t], rep.new_value, false, container);
            }
        }
    }

    // LOGO-SWAP: replaces the mockup's own baked-in logo placeholder (any
    // item whose name contains "logo") with a matching named group/layer
    // duplicated from the logo-library document. Matching is name-only
    // (findAnywhere's normalized index - same engine used for part lookup),
    // footprint-preserving (new logo is scaled to fit + centered inside the
    // placeholder's bounds, aspect ratio kept). No match at any step ->
    // skip + warn, leave the mockup's own logo untouched (same pattern as
    // UA-DETECT / sleeve-match elsewhere in this script).
    function applyLogoReplacements(pastedDesign, replacements, sleeveSide) {
        if (!replacements || replacements.length === 0) return;

        function findByLayer(layerName) {
            for (var i = 0; i < replacements.length; i++) {
                if ((replacements[i].layer_name || "").toUpperCase() === layerName) return replacements[i];
            }
            return null;
        }

        // Sleeve items render once per side (Right/Left) with the same
        // text_replacements array - prefer the side-specific entry, fall
        // back to a generic LOGO that applies to both sides.
        var rep = sleeveSide ? (findByLayer(sleeveSide.toUpperCase() + " SLEEVE LOGO") || findByLayer("LOGO"))
                              : findByLayer("LOGO");
        if (!rep || !rep.new_value) return;

        if (!logoLibraryDoc) {
            log("LOGO WARNING: '" + rep.new_value + "' requested but no logo library file was uploaded - keeping mockup's own logo.");
            return;
        }

        var libraryLogo = findAnywhere(logoLibraryDoc, rep.new_value);
        if (!libraryLogo) {
            log("LOGO WARNING: '" + rep.new_value + "' not found in logo library (check the group/layer name matches the Excel value exactly) - keeping mockup's own logo.");
            return;
        }

        // Locate the mockup's own logo placeholder inside the pasted design -
        // its bounds + z-order slot become the footprint for the new logo.
        var placeholder = null;
        function findPlaceholder(items) {
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                var nm = (it.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                if (nm.indexOf("logo") !== -1) { placeholder = it; return true; }
                if (it.typename === "GroupItem" && findPlaceholder(it.pageItems)) return true;
            }
            return false;
        }
        try { findPlaceholder(pastedDesign.pageItems); } catch (eFp) {}

        if (!placeholder) {
            log("LOGO WARNING: '" + rep.new_value + "' requested but no logo placeholder found in the mockup design for this part - skipping.");
            return;
        }

        try {
            var pB = placeholder.visibleBounds; // [left, top, right, bottom]
            var pCenterX = (pB[0] + pB[2]) / 2, pCenterY = (pB[1] + pB[3]) / 2;
            var pW = Math.abs(pB[2] - pB[0]), pH = Math.abs(pB[1] - pB[3]);

            // Cross-document duplicate() only accepts a CONTAINER (document/
            // layer/group) as the target - relativeObject being another page
            // item (PLACEBEFORE/PLACEAFTER) is a same-document-only operation
            // and throws Illustrator error 1346458189 ('PARM') across docs.
            // So: duplicate into orderDoc (container-target, cross-doc safe),
            // then move() next to the placeholder (same-doc, item-relative).
            var newLogo;
            if (libraryLogo.typename === "Layer") {
                newLogo = orderDoc.groupItems.add();
                for (var ll = libraryLogo.pageItems.length - 1; ll >= 0; ll--) {
                    libraryLogo.pageItems[ll].duplicate(newLogo, ElementPlacement.PLACEATBEGINNING);
                }
            } else {
                newLogo = libraryLogo.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
            }
            newLogo.move(placeholder, ElementPlacement.PLACEBEFORE);
            mergeAndCleanupSwatches(orderDoc, newLogo);

            var newB = newLogo.visibleBounds;
            var newW = Math.abs(newB[2] - newB[0]), newH = Math.abs(newB[1] - newB[3]);
            if (newW > 0 && newH > 0 && pW > 0 && pH > 0) {
                var scalePct = Math.min(pW / newW, pH / newH) * 100;
                newLogo.resize(scalePct, scalePct, true, true, true, true, 100, Transformation.CENTER);
            }
            var afterB = newLogo.visibleBounds;
            var afterW = Math.abs(afterB[2] - afterB[0]), afterH = Math.abs(afterB[1] - afterB[3]);
            newLogo.left += (pCenterX - (afterB[0] + afterW / 2));
            newLogo.top += (pCenterY - (afterB[1] - afterH / 2));
            newLogo.name = "Logo";

            placeholder.remove();
            log("LOGO: '" + rep.new_value + "' placed from library (footprint-matched to mockup placeholder).");
        } catch (eLogoSwap) {
            log("LOGO ERROR: failed to place '" + rep.new_value + "' from library: " + eLogoSwap.message);
        }
    }

    // ---- GLYPH COLLISION MEASUREMENT -------------------------------------
    // Both halves are MEASURED on the live text, never assumed, because the
    // outline treatment on a number ("77" over a black keyline over a white
    // outline) is an APPEARANCE, not a character stroke: probed on the job
    // mockup, tf.stroked came back undefined and characterAttributes reported
    // strokeWeight 1 while the painted outline was ~21pt a side.
    //
    // Neither of the two obvious measurements works alone:
    //   * tf.visibleBounds is ADVANCE-based, not ink-based. Proof: on seven
    //     different digit pairs ("78" "12" "25" "11" "88" "10" "47") the
    //     quantity W(AB)-W(A)-W(B) came back at exactly -37.5 every time. A
    //     real ink gap cannot be identical across pairs with different side
    //     bearings - so the frame width cannot see where the ink is, which is
    //     why the old total-width guard below never caught a collision.
    //   * createOutline() gives true per-glyph ink boxes but DROPS the
    //     appearance (probed: visibleBounds === geometricBounds on every
    //     outlined glyph), so its gaps are INK gaps with no paint on them.
    // Put together they are exactly what is needed:
    //     paintedGap = inkGap - paintOverhang
    // and that constant -37.5 IS the paint overhang, which is why it was
    // constant. Verified against the finished 300 DPI JPEG of job 8fcab6ee:
    // predicted 0.71pt for "77" and 20.4pt for "87", measured 1.0 and 22.3.

    // Total width the text's appearance paints beyond its advance box (both
    // sides together). W(A)+W(B)-W(AB) cancels the advances and leaves it.
    // Kerning is forced to 0 on the pair so only the appearance is left.
    function measurePaintOverhang(tf, doc, size, font) {
        var probe = null;
        try {
            var src = "";
            try { src = tf.contents; } catch (eC) { return null; }
            if (src.length < 2) return null;
            var a = src.charAt(0), b = src.charAt(1);
            probe = tf.duplicate(doc.layers[0], ElementPlacement.PLACEATEND);

            function widthOf(s) {
                probe.contents = s;                       // wipes formatting - re-apply
                var attrs = probe.textRange.characterAttributes;
                if (size) try { attrs.size = size; } catch (eS) {}
                if (font) try { attrs.textFont = font; } catch (eF) {}
                for (var i = 1; i < probe.textRange.characters.length; i++) {
                    try { probe.textRange.characters[i].kerning = 0; } catch (eK) {}
                }
                var vb = probe.visibleBounds;
                return Math.abs(vb[2] - vb[0]);
            }

            var wA = widthOf(a), wB = widthOf(b), wAB = widthOf(a + b);
            probe.remove(); probe = null;
            var overhang = wA + wB - wAB;
            // A plain unstyled frame legitimately measures ~0 - that is not a
            // failure, it means there is no outline to merge, and the guard
            // still has to stop literal ink overlap. Only a nonsense reading is
            // rejected: an overhang wider than the pair itself, or a negative
            // one, means the widths came off something else (a clipped copy, a
            // contents assignment that did not take).
            if (overhang < -1 || overhang >= wAB) return null;
            return (overhang > 0) ? overhang : 0;
        } catch (e) {
            try { if (probe) probe.remove(); } catch (e2) {}
            return null;
        }
    }

    // Ink gap between each adjacent pair of GLYPHS, left to right. The copy is
    // outlined on layer 0 rather than in place: a duplicate made where the text
    // sits stays inside the design's clipping mask, and a clipped item reports
    // cropped bounds (the mockup's own '25' reads 891.6pt clipped vs 918.1pt
    // free). Whitespace produces no glyph, so the count is returned for the
    // caller to line up against its own characters.
    function measureGlyphInkGaps(tf, doc) {
        var dup = null, grp = null;
        try {
            dup = tf.duplicate(doc.layers[0], ElementPlacement.PLACEATEND);
            grp = dup.createOutline();       // consumes dup, returns a GroupItem
            dup = null;
            var items = [];
            (function collect(c) {
                for (var i = 0; i < c.pageItems.length; i++) {
                    var it = c.pageItems[i];
                    if (it.typename === "GroupItem") collect(it); else items.push(it);
                }
            })(grp);
            if (items.length < 2) { grp.remove(); return null; }
            var boxes = [];
            for (var b = 0; b < items.length; b++) {
                var vb = items[b].visibleBounds;
                boxes.push([vb[0], vb[2]]);
            }
            boxes.sort(function (p, q) { return p[0] - q[0]; });
            var gaps = [];
            for (var g = 1; g < boxes.length; g++) gaps.push(boxes[g][0] - boxes[g - 1][1]);
            grp.remove();
            return { gaps: gaps, glyphs: boxes.length };
        } catch (e) {
            try { if (grp) grp.remove(); } catch (e2) {}
            try { if (dup) dup.remove(); } catch (e3) {}
            return null;
        }
    }

    // TEXT SPACING: carries the mockup's hand-kerning onto the replacement.
    // Applies to numbers AND names - a designer tightens a player name the same
    // way they tighten a number.
    //
    // Manual kerning (the Alt+Arrow nudge a designer makes between two digits)
    // is stored on the character AFTER the gap, and `tf.contents = value` wipes
    // it exactly like it wipes size and font. It is NOT on characterAttributes -
    // that object exposes only kerningMethod and tracking, and reading
    // characterAttributes.kerning returns undefined (probed against a real job
    // mockup). The value is reachable only as character.kerning, which THROWS
    // ("There is no manual kerning amount set at this location") on any pair the
    // designer never touched.
    //
    // A throwing/absent gap therefore needs NO action: an untouched pair was
    // rendering at the font's own auto kerning, and the replacement text gets
    // that same auto kerning for free. Only hand-set amounts have to be carried.
    //
    // Writing works with kerningMethod left at AUTO - switching to NOAUTOKERN
    // first was measured to give an identical result, so it is not done.
    //
    // Mapping: gap i of the new value takes gap i of the placeholder; a longer
    // value repeats the last hand-set gap, a shorter one uses the leading gaps.
    // A uniformly tightened placeholder therefore reproduces exactly on any
    // replacement; a placeholder kerned pair-by-pair (optical kerning on
    // specific letter pairs) can only be approximated on a different string,
    // which is what the repeat rule does.
    //
    // WORD GAPS ARE LEFT ALONE: a gap touching a space or line break keeps the
    // font's own spacing. Word spacing in a name is not the same decision as
    // letter tightening, and the placeholder's word count rarely matches the
    // replacement's ("PLAYER NAME" -> "RODRIGUEZ").
    //
    // OVERLAP GUARD: the amount is in ems, so a value whose glyphs are wider than
    // the placeholder's can tighten far enough for digits to touch. Tightening per
    // gap is capped at MAX_GAP_TIGHTEN of one character's average advance; past
    // that every gap is eased by the same factor, so the spacing still reads as
    // the designer's intent, just short of colliding.
    //
    // The ceiling is MEASURED, not guessed. Rendering "78" down a kerning ladder in
    // the job's own mockup (CollegeSlabSC at 884pt) gave: -40 clean, -100 glyphs
    // touching, -160 clearly overlapped. As a fraction of one character's advance
    // those are 0.075 / 0.189 / 0.302. A first guess of 0.30 therefore permitted
    // visible overlap; 0.15 (~-80 on that font) is the last value that still reads
    // as separate digits. Bounds cannot settle this by themselves - visibleBounds
    // includes the stroke, so an ink-gap calculation comes out constant across
    // every digit pair and says nothing about collision.
    // FUNCTIONS, NOT `var`, ON PURPOSE - see the note on the two floor
    // constants below. Same trap, same reason.
    function MAX_GAP_TIGHTEN() { return 0.15; }

    // COLLISION FLOOR: the smallest PAINTED gap (ink gap minus the appearance's
    // own overhang, both measured above) two glyphs may be left with.
    //
    // Held as a fraction of the MEASURED OVERHANG, not of the font size. What
    // makes two digits read as merged is the outline running into itself, so
    // the sliver that has to survive belongs to the outline's scale: a heavy
    // white keyline needs a wider sliver than a hairline does, at the same
    // point size. Tying it to the font size instead would be a second hidden
    // assumption about a mockup we have not seen.
    //
    // 0.25 is bracketed by job 8fcab6ee's own artwork rather than picked:
    // clean pairs measured 22.4pt ('87'), 16.8pt (the designer's own '25') and
    // 15.5pt ('88'); merged pairs measured 3.8pt ('12'), 0.8pt ('77') and
    // -6.1pt ('78'). Anything from ~4 to ~15pt separates the two groups, and
    // 0.25 x 42.9pt overhang = 10.7pt sits inside that band near its low end -
    // the smallest correction that still clears, which is what was asked for.
    // Every clean pair, including the placeholder, stays untouched.
    //
    // The second term only matters for text with no outline at all (overhang
    // measures ~0): there is nothing to merge, so the floor collapses to a
    // hairline and the guard does little more than forbid literal overlap.
    // DECLARED AS FUNCTIONS BECAUSE `var` SILENTLY BROKE THIS GUARD.
    //
    // applyTextSpacing is called from the main loop, which runs THOUSANDS OF
    // LINES ABOVE this point. A `var` here is hoisted to the top of the scope
    // but not ASSIGNED until execution reaches this line - which it never does
    // before the numbers are printed. So the guard read `undefined`, computed
    //     floorPt = Math.max(42.9 * undefined, 1011 * undefined) = NaN
    // and every `painted < floorPt - 0.01` test came back false, because ALL
    // comparisons against NaN are false. The guard therefore declared every
    // pair clear and did nothing, all the way down to a painted gap of -1.8pt
    // (job M101_Round_Neck-2: '77' and '78' shipped with their keylines
    // touching). Function declarations are hoisted WITH their body, so these
    // are correct no matter where the first call comes from.
    function MIN_PAINTED_GAP_OF_OVERHANG() { return 0.25; }
    function MIN_PAINTED_GAP_OF_SIZE()     { return 0.005; }

    function applyTextSpacing(tf, savedKerns, savedTracking, label) {
        var n = 0;
        try { n = tf.textRange.characters.length; } catch (eN) { return; }

        // Tracking is a plain documented attribute and is restored whatever the
        // digit count is - a single digit still carries its own tracking.
        if (savedTracking !== null && savedTracking !== undefined) {
            try { tf.textRange.characterAttributes.tracking = savedTracking; } catch (eT) {}
        }

        if (n < 2) return;                                   // no gap to carry
        if (!savedKerns || savedKerns.length === 0) return;   // 1-char placeholder: nothing was measured, keep default

        var lastKnown = null;
        for (var q = 0; q < savedKerns.length; q++) {
            if (typeof savedKerns[q] === "number") lastKnown = savedKerns[q];
        }
        if (lastKnown === null) return;                       // placeholder was never hand-kerned

        function gapValue(i) {
            if (i < savedKerns.length) {
                return (typeof savedKerns[i] === "number") ? savedKerns[i] : null;
            }
            return lastKnown;                                 // past the placeholder's gaps: repeat the last one
        }

        var wDefault = null;
        try { var b0 = tf.visibleBounds; wDefault = Math.abs(b0[2] - b0[0]); } catch (eW) {}

        function isSpacey(idx) {
            try { return /^[\s\r\n\t]$/.test(tf.textRange.characters[idx].contents); } catch (eS) { return true; }
        }

        var live = [];                                       // what each gap is actually set to
        function applyAll(scale) {
            var applied = 0;
            live = [];
            for (var g = 1; g < n; g++) {
                var v = gapValue(g - 1);
                if (v === null) { live.push(null); continue; }
                if (isSpacey(g) || isSpacey(g - 1)) { live.push(null); continue; }   // word gap: leave the font's own spacing
                var set = Math.round(v * scale);
                try { tf.textRange.characters[g].kerning = set; applied++; live.push(set); }
                catch (eA) { live.push(null); }
            }
            return applied;
        }

        var appliedCount = applyAll(1);
        if (appliedCount === 0) return;

        var wKerned = null;
        try { var b1 = tf.visibleBounds; wKerned = Math.abs(b1[2] - b1[0]); } catch (eW2) {}

        if (wDefault && wKerned && wDefault > 0) {
            var tightenPerGap = (wDefault - wKerned) / (n - 1);
            var maxTighten    = (wDefault / n) * MAX_GAP_TIGHTEN();
            if (tightenPerGap > maxTighten) {
                var ease = maxTighten / tightenPerGap;
                applyAll(ease);
                try { var b2 = tf.visibleBounds; wKerned = Math.abs(b2[2] - b2[0]); } catch (eW3) {}
                log("   - spacing guard: '" + label + "' kerning eased to " + Math.round(ease * 100) + "% of the mockup's (digits would have overlapped).");
            }
        }

        log("   - spacing: carried " + appliedCount + " gap(s) from mockup onto '" + label + "'"
            + ((wDefault && wKerned) ? (" (width " + Math.round(wDefault) + " -> " + Math.round(wKerned) + "pt)") : "") + ".");

        // COLLISION GUARD. The mockup's amount stays exactly as the designer set
        // it; this only steps in where carrying it onto DIFFERENT glyphs would
        // make the paint touch. The mockup's value is an em offset on the
        // ADVANCE, so it is the same number of points on every pair, while the
        // ink each pair leaves behind is not - on job 8fcab6ee the same -40
        // left '87' 22.4pt of painted gap and '77' 0.8pt.
        // EVERY exit below logs. Job M101_Round_Neck-2 rendered '77' with a
        // 0.17mm painted gap and '78' with the outlines actually overlapping,
        // and the whole 921-line log carried NOT ONE guard line - so the guard
        // was provably not acting, but its five silent `return`s and its
        // silent all-clear path are indistinguishable from the outside. Never
        // leave this function without saying what it decided.
        function guardBail(why) { log("   - spacing guard: '" + label + "' SKIPPED - " + why + "."); }

        var doc = null;
        try { doc = app.activeDocument; } catch (eD) { doc = null; }
        if (!doc) { guardBail("no active document to measure in"); return; }

        var size = null, font = null;
        try { size = tf.textRange.characterAttributes.size; } catch (eSz) {}
        try { font = tf.textRange.characterAttributes.textFont; } catch (eFt) {}
        if (!size || size <= 0) { guardBail("could not read the type size"); return; }

        var overhang = measurePaintOverhang(tf, doc, size, font);
        if (overhang === null) { guardBail("paint overhang unmeasurable (probe rejected) - designer's value left alone"); return; }
        var ink = measureGlyphInkGaps(tf, doc);
        if (!ink) { guardBail("could not outline a copy to read per-glyph ink gaps"); return; }

        // glyph index per character: whitespace paints nothing, so the glyph
        // list is shorter than the character list whenever a name has a space.
        var glyphOf = [], seen = 0;
        for (var c = 0; c < n; c++) glyphOf.push(isSpacey(c) ? -1 : seen++);
        if (seen !== ink.glyphs) {                        // could not line them up - do not guess
            guardBail(seen + " painting character(s) but " + ink.glyphs + " outlined glyph(s) - cannot line them up");
            return;
        }

        var floorPt = Math.max(overhang * MIN_PAINTED_GAP_OF_OVERHANG(),
                               size * MIN_PAINTED_GAP_OF_SIZE());
        // A NaN floor is the failure mode that shipped merged digits: every
        // `painted < NaN` is false, so the guard passed artwork whose keylines
        // overlapped by 1.8pt while reporting nothing. Never compare against a
        // floor that is not a real positive number - say so and stop instead.
        if (!(floorPt > 0)) { guardBail("collision floor came out " + floorPt + " - refusing to compare against it"); return; }

        // How far one kerning unit actually moves a glyph is NOT assumed to be
        // size/1000. Measured on job 8fcab6ee it came out 0.886pt where that
        // formula predicts 1.011 - the text carries a horizontal scale, and the
        // em a font reports is not obliged to match the point size either. The
        // predicted value is only the opening guess; the first round measures
        // the real slope and the loop corrects on it. That is what keeps this
        // correct on a font nobody has tested.
        var slope = size / 1000;
        var slopeMeasured = false;

        // Which gaps this guard may touch: a real glyph-to-glyph pair that
        // actually received a carried value.
        var pairs = [];
        for (var g2 = 1; g2 < n; g2++) {
            if (live[g2 - 1] === null) continue;           // word gap or never applied
            var gi = glyphOf[g2 - 1], gj = glyphOf[g2];
            if (gi < 0 || gj < 0 || gj !== gi + 1) continue;
            pairs.push({ ch: g2, glyph: gi, kern: live[g2 - 1], from: null });
        }
        if (pairs.length === 0) { guardBail("no glyph-to-glyph pair carried a value"); return; }

        var MAX_ROUNDS = 4;
        var touched = false;
        var clearedAt = null;    // painted gaps of the round that found nothing to fix
        for (var round = 0; round < MAX_ROUNDS; round++) {
            // NOT named 'short': that is a reserved word in Illustrator's ES3
            // engine and the whole bundle dies at parse time with
            // "Error 9: Illegal use of reserved word 'short'".
            var tooTight = [];
            for (var p = 0; p < pairs.length; p++) {
                var painted = ink.gaps[pairs[p].glyph] - overhang;
                if (pairs[p].from === null) pairs[p].from = painted;
                if (painted < floorPt - 0.01) tooTight.push({ p: pairs[p], painted: painted });
            }
            if (tooTight.length === 0) {                   // every pair clear - designer's value kept
                clearedAt = [];
                for (var pc = 0; pc < pairs.length; pc++) {
                    clearedAt.push(Math.round((ink.gaps[pairs[pc].glyph] - overhang) * 10) / 10);
                }
                break;
            }
            if (round === MAX_ROUNDS - 1) {
                log("   - spacing guard: '" + label + "' still short of the "
                    + Math.round(floorPt * 10) / 10 + "pt floor after " + MAX_ROUNDS
                    + " rounds - left at its best attempt, CHECK THIS NUMBER BY EYE.");
                break;
            }

            for (var s2 = 0; s2 < tooTight.length; s2++) {
                var add = Math.ceil((floorPt - tooTight[s2].painted) / slope);
                if (add < 1) add = 1;
                tooTight[s2].p.kern += add;
                tooTight[s2].added = add;
                try { tf.textRange.characters[tooTight[s2].p.ch].kerning = tooTight[s2].p.kern; touched = true; } catch (eO) {}
            }

            ink = measureGlyphInkGaps(tf, doc);
            if (!ink || ink.glyphs !== seen) return;        // lost the measurement - stop where it is

            // Refine the slope from what the nudge actually achieved. Uses the
            // widest nudge of the round, so the reading is least sensitive to
            // the outline's own rounding.
            if (!slopeMeasured) {
                var best = null;
                for (var s3 = 0; s3 < tooTight.length; s3++) {
                    if (!best || tooTight[s3].added > best.added) best = tooTight[s3];
                }
                if (best && best.added > 0) {
                    var moved = (ink.gaps[best.p.glyph] - overhang) - best.painted;
                    var m = moved / best.added;
                    if (m > 0.05 && m < 10) { slope = m; slopeMeasured = true; }
                }
            }
        }

        if (touched) {
            try { var b3 = tf.visibleBounds; wKerned = Math.abs(b3[2] - b3[0]); } catch (eW4) {}
            var was = [], now = [], kerns = [];
            for (var q = 0; q < pairs.length; q++) {
                was.push(Math.round(pairs[q].from * 10) / 10);
                now.push(Math.round((ink.gaps[pairs[q].glyph] - overhang) * 10) / 10);
                kerns.push(live[pairs[q].ch - 1] + "->" + pairs[q].kern);
            }
            log("   - spacing guard: '" + label + "' painted gap " + was.join("/") + " -> " + now.join("/")
                + "pt (floor " + Math.round(floorPt * 10) / 10 + "pt), kerning " + kerns.join(", ")
                + ". Measured: outline overhang " + Math.round(overhang * 10) / 10
                + "pt, " + Math.round(slope * 1000) / 1000 + "pt per kerning unit.");
        } else if (clearedAt !== null) {
            // The other way this guard ends: it measured every pair and decided
            // nothing needed moving. Logged with the SAME numbers as the acting
            // branch, because a wrong overhang reading shows up here as a
            // plausible-looking "all clear" on digits that are visibly merged -
            // that is exactly what a silent no-op could not tell us apart from.
            log("   - spacing guard: '" + label + "' left as the designer set it - painted gap "
                + clearedAt.join("/") + "pt, all at or above the " + Math.round(floorPt * 10) / 10
                + "pt floor. Measured: outline overhang " + Math.round(overhang * 10) / 10
                + "pt over " + ink.glyphs + " glyph(s) at size " + Math.round(size) + "pt.");
        }
    }

    function replaceInContainer(container, target, value, alreadyMatched, root) {
        if (!target || !container) return;
        root = root || container;
        var tUpper = target.toUpperCase();
        var cName = (container.name || "").toUpperCase();
        var currentMatch = alreadyMatched || (cName.indexOf(tUpper) !== -1);

        if (container.textFrames && container.textFrames.length > 0) {
            for (var k = 0; k < container.textFrames.length; k++) {
                var tf = container.textFrames[k];
                if (tf.hidden) continue;

                var tfName = (tf.name || "").toUpperCase();
                var tfCont = (tf.contents || "").toUpperCase();
                
                if (currentMatch || tfName.indexOf(tUpper) !== -1 || tfCont.indexOf(tUpper) !== -1) {
                    // Mockup footprint: replaced text must occupy the same
                    // width and center as the original text (e.g. 66 -> 666).
                    var preBounds = null;
                    try { preBounds = tf.visibleBounds; } catch (ePreB) {}

                    // Nearest LIVE text straight above/below decides the anchor
                    // edge: shrinking must not grow the gap toward that text
                    // (e.g. name sitting at a fixed margin above the number).
                    var anchorSide = preBounds ? findVerticalNeighborSide(root, tf, preBounds) : null;

                    var savedFillSpotName   = null;
                    var savedStrokeSpotName = null;
                    var savedFillColor      = null; // Fallback raw color
                    var savedStrokeColor     = null; // Fallback raw color
                    var savedFillTint       = null; // % of the spot this text was drawn at
                    var savedStrokeTint     = null;
                    var savedStrokeWeight   = null;
                    var savedSize           = null;
                    var savedFont           = null;
                    var savedKerns          = null; // per-gap hand-kerning, see applyNumberSpacing
                    var savedTracking       = null;

                    try {
                        if (tf.textRange.length > 0) {
                            var charAttrs = tf.textRange.characters[0].characterAttributes;
                            
                            // 1. Check Character Level
                            var fc = charAttrs.fillColor;
                            var sc = charAttrs.strokeColor;
                            
                            // 2. Fallback to Frame Level if character is "NoColor"
                            if (!fc || fc.typename === "NoColor") try { fc = tf.fillColor; } catch(e) {}
                            if (!sc || sc.typename === "NoColor") try { sc = tf.strokeColor; } catch(e) {}
                            
                            // 3. Fallback to Parent Group Level (Appearance-applied colors often live here)
                            var p = tf.parent;
                            while ((!fc || fc.typename === "NoColor") && p && p.typename === "GroupItem") {
                                try { fc = p.fillColor; } catch(e) {}
                                p = p.parent;
                            }
                            p = tf.parent;
                            while ((!sc || sc.typename === "NoColor") && p && p.typename === "GroupItem") {
                                try { sc = p.strokeColor; } catch(e) {}
                                p = p.parent;
                            }

                            if (fc && fc.typename !== "NoColor") {
                                // The spot is restored BY NAME below, which builds a fresh
                                // SpotColor at 100%. The tint is a property of this text, not
                                // of the swatch, so it has to be remembered separately or a
                                // half-strength label comes back at full strength.
                                if (fc.typename === "SpotColor") {
                                    savedFillSpotName = fc.spot.name;
                                    try { savedFillTint = fc.tint; } catch (eT) {}
                                }
                                savedFillColor = fc;
                            }
                            if (sc && sc.typename !== "NoColor") {
                                if (sc.typename === "SpotColor") {
                                    savedStrokeSpotName = sc.spot.name;
                                    try { savedStrokeTint = sc.tint; } catch (eT) {}
                                }
                                savedStrokeColor = sc;
                            }

                            try { savedStrokeWeight = charAttrs.strokeWeight || tf.strokeWeight; } catch(e) {}
                            try { savedSize         = charAttrs.size; }        catch(e) {}
                            try { savedFont         = charAttrs.textFont; }    catch(e) {}
                            try { savedTracking     = charAttrs.tracking; }    catch(e) {}

                            // Hand-kerning, one entry per gap. It lives on the
                            // character AFTER the gap and throws where the pair
                            // was never touched - a null entry simply means
                            // "leave that gap on the font's auto kerning".
                            try {
                                var nSrcChars = tf.textRange.characters.length;
                                if (nSrcChars > 1) {
                                    savedKerns = [];
                                    for (var kg = 1; kg < nSrcChars; kg++) {
                                        var kv = null;
                                        // A gap touching a space is word spacing, not letter
                                        // tightening - never record it, or it becomes the
                                        // value repeated across a longer replacement.
                                        var spacey = false;
                                        try {
                                            spacey = /^[\s\r\n\t]$/.test(tf.textRange.characters[kg].contents)
                                                  || /^[\s\r\n\t]$/.test(tf.textRange.characters[kg - 1].contents);
                                        } catch (eSp) { spacey = true; }
                                        if (!spacey) { try { kv = tf.textRange.characters[kg].kerning; } catch (eKg) { kv = null; } }
                                        savedKerns.push((typeof kv === "number") ? kv : null);
                                    }
                                }
                            } catch (eKerns) {}
                        }
                    } catch(eStyle) { log("STYLE SAVE ERROR: " + eStyle.message); }

                    tf.contents = value;
                    tf.zOrder(ZOrderMethod.BRINGTOFRONT);
                    tf.hidden = false;
                    // Mark for size normalization after alignAndScale; the
                    // suffix tells the normalizer which edge to keep anchored.
                    try { tf.note = (anchorSide === "above") ? "PERS_TEXT_ABOVE" : ((anchorSide === "below") ? "PERS_TEXT_BELOW" : "PERS_TEXT"); } catch (eNote) {}

                    // Disable object-level fill/stroke to let character-level show through
                    try { tf.filled = false; tf.stroked = false; } catch(eClear) {}

                    try {
                        var activeDoc = app.activeDocument;
                        var rangeAttrs = tf.textRange.characterAttributes;

                        // Re-apply Fill
                        var finalFill = null;
                        if (savedFillSpotName) {
                            try {
                                var spot = activeDoc.spots.getByName(savedFillSpotName);
                                finalFill = new SpotColor(); finalFill.spot = spot;
                                if (savedFillTint !== null) { try { finalFill.tint = savedFillTint; } catch (eT) {} }
                            } catch(e) {}
                        }
                        if (!finalFill) finalFill = savedFillColor;

                        if (finalFill && finalFill.typename !== "NoColor") {
                            rangeAttrs.fillColor = finalFill;
                            for (var ci = 0; ci < tf.textRange.characters.length; ci++) {
                                tf.textRange.characters[ci].characterAttributes.fillColor = finalFill;
                            }
                        }

                        // Re-apply Stroke
                        var finalStroke = null;
                        if (savedStrokeSpotName) {
                            try {
                                var spot = activeDoc.spots.getByName(savedStrokeSpotName);
                                finalStroke = new SpotColor(); finalStroke.spot = spot;
                                if (savedStrokeTint !== null) { try { finalStroke.tint = savedStrokeTint; } catch (eT) {} }
                            } catch(e) {}
                        }
                        if (!finalStroke) finalStroke = savedStrokeColor;

                        if (finalStroke && finalStroke.typename !== "NoColor") {
                            rangeAttrs.strokeColor = finalStroke;
                            for (var ci = 0; ci < tf.textRange.characters.length; ci++) {
                                tf.textRange.characters[ci].characterAttributes.strokeColor = finalStroke;
                            }
                            if (savedStrokeWeight) {
                                rangeAttrs.strokeWeight = savedStrokeWeight;
                                for (var ci = 0; ci < tf.textRange.characters.length; ci++) {
                                    tf.textRange.characters[ci].characterAttributes.strokeWeight = savedStrokeWeight;
                                }
                            }
                        }

                        if (savedSize) rangeAttrs.size = savedSize;
                        if (savedFont) rangeAttrs.textFont = savedFont;

                    } catch(eReapply) { log("STYLE RE-APPLY ERROR: " + eReapply.message); }

                    // Fit-to-mockup: the replacement may legitimately be wider
                    // than the placeholder ("9" -> "29"), so allow up to
                    // FIT_WIDTH_ALLOWANCE x the placeholder width at full font
                    // size before shrinking; past that, shrink uniformly
                    // (width AND height, same ratio) down to the allowed width
                    // so letter shapes stay undistorted, then place it back on
                    // the original text's center.
                    // DYNAMIC NUMBER FIT: a number may occupy the placeholder's
                    // width per digit. Same digit count -> must match the
                    // placeholder's width exactly (so "13"->"13" stays as drawn
                    // and a fatter "29" shrinks just enough to match "13"'s
                    // width - how much depends on the actual font). More digits
                    // -> proportionally more room (3 digits over a 2-digit
                    // placeholder = 1.5x its width, the approved "666" look).
                    // Fewer digits are naturally narrower and stay full size.
                    // Names keep the flat 1.5x allowance.
                    var digitsOnly = /^\s*\d+\s*$/.test(value || "") ? value.replace(/\s/g, "") : null;
                    var FIT_WIDTH_ALLOWANCE = 1.5;
                    if (digitsOnly) {
                        var origDigits = 0;
                        try { origDigits = ((tfCont || "").replace(/[^0-9]/g, "")).length; } catch (eOD) {}
                        if (origDigits < 1) origDigits = 2;
                        FIT_WIDTH_ALLOWANCE = Math.max(1.02, digitsOnly.length / origDigits);
                        log("Number fit: " + digitsOnly.length + " digit(s) over " + origDigits + "-digit placeholder -> width allowance " + (Math.round(FIT_WIDTH_ALLOWANCE * 100) / 100) + "x.");
                    }

                    // Carry the mockup's hand-kerning onto the replacement. MUST run
                    // before the fit block below: kerning changes visibleBounds, and
                    // that is exactly what the fit measures to decide whether to
                    // shrink and where to re-center.
                    applyTextSpacing(tf, savedKerns, savedTracking, value);

                    if (preBounds) {
                        try {
                            var origW = Math.abs(preBounds[2] - preBounds[0]);
                            var origCX = (preBounds[0] + preBounds[2]) / 2;
                            var origCY = (preBounds[1] + preBounds[3]) / 2;
                            var postB = tf.visibleBounds;
                            var newW = Math.abs(postB[2] - postB[0]);
                            var allowedW = origW * FIT_WIDTH_ALLOWANCE;
                            if (origW > 0 && newW > allowedW + 0.5) {
                                var fitK = (allowedW / newW) * 100;
                                tf.resize(fitK, fitK, true, true, true, true, 100, Transformation.CENTER);
                                log("Text '" + value + "' wider than " + FIT_WIDTH_ALLOWANCE + "x mockup original: uniformly scaled to " + Math.round(fitK) + "% (fits " + FIT_WIDTH_ALLOWANCE + "x placeholder width).");
                            }
                            var finalB = tf.visibleBounds;
                            tf.left += origCX - (finalB[0] + finalB[2]) / 2;
                            if (anchorSide === "above") {
                                // Text above: keep the TOP edge so the gap to it stays as in the mockup.
                                tf.top += preBounds[1] - finalB[1];
                                log("Anchored '" + value + "' to TOP edge (nearest text is above).");
                            } else if (anchorSide === "below") {
                                // Text below: keep the BOTTOM edge.
                                tf.top += preBounds[3] - finalB[3];
                                log("Anchored '" + value + "' to BOTTOM edge (nearest text is below).");
                            } else {
                                tf.top += origCY - (finalB[1] + finalB[3]) / 2;
                            }
                        } catch (eFit) { log("Fit-to-mockup error: " + eFit.message); }
                    }
                }
            }
        }

        if (container.groupItems) {
            for (var g = 0; g < container.groupItems.length; g++) {
                replaceInContainer(container.groupItems[g], target, value, currentMatch, root);
            }
        }
    }

    // ------------------------------------------------------------------
    // EXPORT FOLDER PER SIZE
    // Every piece's JPG lands in a sub-folder of the render folder named
    // after its size CODE - "Large" -> L, "Small" -> S, "2XL" -> 2XL,
    // "YM" -> YM - so a size's whole set of patterns sits together.
    // Universal accessories (Placket / Twill Tape / Tukdi) have no size and
    // stay in the render root, alongside the .ai files and the logs.
    // ------------------------------------------------------------------
    function sizeFolderCode(sizeLabel) {
        // getFriendlySize already collapsed every spelling to one label, so
        // only its three spelled-out words need shortening here; XS/XL/2XL
        // and the youth codes are already the short form.
        var up = (sizeLabel || "").toUpperCase();
        if (up === "SMALL") return "S";
        if (up === "MEDIUM") return "M";
        if (up === "LARGE") return "L";
        // A size the pattern names something unexpected still gets a folder,
        // with anything a Windows path can't hold turned into "_".
        return String(sizeLabel).replace(/[^a-zA-Z0-9]/g, "_");
    }

    function exportFolderFor(sizeLabel) {
        // Cache hangs off the function itself, not a `var` in this scope: the
        // first export happens in the main loop far ABOVE this line, where a
        // plain `var exportFolderCache = {}` would still be hoisted-undefined.
        if (!exportFolderFor.cache) exportFolderFor.cache = {};
        var cache = exportFolderFor.cache;

        if (!sizeLabel || sizeLabel === "Universal") return outputDir;
        // AI FILE ONLY: the folder is created HERE, when a panel is queued, but
        // whether anything gets rendered into it is decided later, in
        // flushExports. So an ai_only job used to finish with an empty XL/ and
        // 2XL/ sitting in the output (confirmed on job White_testing). Nothing
        // will be written, so create nothing; the returned path is still stored
        // on the queue entry and simply never used.
        if (!EXPORT_JPG) return outputDir;
        var code = sizeFolderCode(sizeLabel);
        if (!code) return outputDir;
        if (cache[code]) return cache[code];
        // A folder that cannot be created must never cost us the render:
        // fall back to the root so the JPG still exists, just unfiled.
        var path = outputDir + "/" + code;
        try {
            var f = new Folder(path);
            if (!f.exists && !f.create()) {
                log("EXPORT: could not create size folder '" + code + "' - exporting to the render root instead.");
                path = outputDir;
            }
        } catch (eFolder) {
            log("EXPORT: size folder '" + code + "' error: " + eFolder.message + " - exporting to the render root instead.");
            path = outputDir;
        }
        cache[code] = path;
        return path;
    }

    // Record a panel to be rendered later. Called wherever the old code called
    // exportResult directly. Queuing by NAME is what collapses the repeats: a
    // step that moves a panel after it was first queued just replaces the entry
    // with the newer artboard index, instead of paying for another render.
    // The JPG's own file name: the size, then a number that runs across the
    // whole size - Small1, Small2, ... - with every size counting from 1 again.
    // Universal accessories have no size to number by (they render to the output
    // root, not a size folder), so they keep their instance name: Twill_Tape_Item1.
    function nextExportFileName(sizeLabel, instanceName) {
        if (!sizeLabel || sizeLabel === "Universal") return instanceName;
        var n = (exportFileCounters[sizeLabel] || 0) + 1;
        exportFileCounters[sizeLabel] = n;
        return sizeLabel + n;
    }

    function queueExport(idx, folder, name, sizeLabel) {
        // ALREADY QUEUED = a re-export (PLACKET-MATCH and SHOULDER-MATCH both
        // re-queue a panel whose content they just changed). Point the entry at
        // the newer artboard and KEEP the file name it was already given: taking
        // a fresh number here would burn one number per re-export and leave gaps,
        // and the panel would land in a different file than the log promised.
        if (exportQueue.hasOwnProperty(name)) {
            exportQueue[name].idx = idx;
            exportQueue[name].folder = folder;
            return;
        }
        exportOrder.push(name);
        var file = nextExportFileName(sizeLabel, name);
        exportQueue[name] = { idx: idx, folder: folder, name: name, file: file };
        // The file name no longer says which panel this is, so record the
        // mapping where an operator can find it.
        log("EXPORT NAME: " + name + " -> " + file + ".jpg");
    }

    // Render everything queued for the CURRENT document, then clear the queue.
    // Must run before saveOrderDoc(), which drops artboard 0 and would leave
    // every stored index pointing one artboard to the left.
    function flushExports(why) {
        var names = exportOrder, jobs = exportQueue;
        exportOrder = []; exportQueue = {};
        if (!names.length) return 0;
        // AI FILE ONLY: the queue is still emptied above - it has to be, or it
        // would grow for the whole job - only the rendering is skipped.
        if (!EXPORT_JPG) {
            log("EXPORT: skipped " + names.length + " JPG(s) for " + why + " - this job is set to 'AI file only'.");
            return 0;
        }
        log("EXPORT: rendering " + names.length + " JPG(s) for " + why + " - one per panel, from its final state.");
        var done = 0, failed = 0;
        for (var i = 0; i < names.length; i++) {
            var job = jobs[names[i]];
            if (!job) continue;
            // Keep status.json moving: a long flush is otherwise a silent gap,
            // which looks like a hung job on the frontend and starves the
            // watchdog that reads this file's mtime.
            updateStatus("Exporting (" + (i + 1) + " of " + names.length + ")...", 90, false);
            if (exportResult(orderDoc, job.idx, job.folder, job.file || job.name)) done++;
            else failed++;
        }
        // QUEUED vs WRITTEN. The render used to be the one step that could fail
        // in complete silence - exportResult swallowed every error - so a
        // permission problem, a full disk or two panels resolving to the same
        // file name showed up only as "kuch files kam hain", days later. The two
        // numbers must match; when they do not, the EXPORT FAILED lines above
        // name the files.
        log("EXPORT: " + done + " JPG(s) written of " + names.length + " queued for " + why +
            (failed ? " - " + failed + " FAILED, see the EXPORT FAILED line(s) above." : "."));
        return done;
    }

    // Returns true only when the file was actually written. The old version
    // returned nothing and caught every error into an empty block, so a failed
    // render was indistinguishable from a successful one - see the queued-vs-
    // written check in flushExports.
    function exportResult(doc, idx, folder, name) {
        var target = folder + "/" + name.replace(/[^a-zA-Z0-9]/g, '_') + ".jpg";
        try {
            doc.artboards.setActiveArtboardIndex(idx);
            var opt = new ExportOptionsJPEG(); opt.artBoardClipping = true; opt.antiAliasing = true; opt.imageColorSpace = ImageColorSpace.CMYK;
            // These four match the JPEG Options dialog the user exports by hand
            // with, so a scripted render is the same file as a manual one.
            // Print resolution: the scale is the ONLY dpi control ExportOptionsJPEG
            // exposes (no .resolution property), and 100% = 72 ppi. See EXPORT_DPI.
            opt.horizontalScale = EXPORT_SCALE_PCT; opt.verticalScale = EXPORT_SCALE_PCT;
            // Quality: dialog slider is 0-10, qualitySetting is 0-100, so the
            // dialog's "5 (Medium)" is 50 here.
            opt.qualitySetting = 50;
            // Compression Method: false = Baseline (Standard). The default true
            // means "optimized for web viewing" = Baseline Optimized, which some
            // print RIPs handle worse.
            opt.optimization = false;
            doc.exportFile(new File(target), ExportType.JPEG, opt);
            return true;
        } catch (e) {
            log("EXPORT FAILED: " + target + " - " + e.message);
            return false;
        }
    }

    // Paints every stroked path in `container` one color. `strokeColor` is the
    // ink the MOCKUP draws (see getDesignStrokeColor at the call site) - per
    // explicit instruction the accessory's stroke must come from the mockup
    // like every other color. The hardcoded near-black below is now only the
    // fallback for a mockup design that draws no stroke at all.
    function ensureBlackStrokes(container, strokeColor) {
        try {
            var black = strokeColor;
            if (!black) { black = new CMYKColor(); black.cyan = 56; black.magenta = 56; black.yellow = 53; black.black = 92; }
            function recurse(items) {
                for (var i = 0; i < items.length; i++) {
                    if (items[i].typename === "PathItem") { if (items[i].stroked) items[i].strokeColor = black; }
                    else if (items[i].typename === "GroupItem") recurse(items[i].pageItems);
                }
            }
            recurse(container.pageItems || [container]);
        } catch (e) {}
    }

    // PATTERN OUTLINE STROKE: pins the pattern piece's own cut outline to
    // PATTERN_OUTLINE_PT. Scope is deliberately ONE path - the placement path
    // the caller hands in. Design artwork, size-tag boxes and every other stroke
    // in the piece keep exactly what they had (explicit instruction: "strokes
    // sirf pattern ki", only the outline).
    //
    // Width only: the stroke's COLOR is never touched, so a pattern drawn with a
    // coloured cut line keeps it. An UNSTROKED outline is left unstroked rather
    // than given an invented 3pt black line.
    //
    // Callers must run this BEFORE the piece's bounds are measured for its
    // artboard: going 1pt -> 3pt grows visibleBounds by ~1pt per side, and a
    // piece measured at 1pt then stroked at 3pt loses that much off its own
    // artboard edge on export.
    function applyPatternOutlineStroke(outline) {
        if (!outline) return false;
        try {
            if (!outline.stroked) return false;
            if (outline.strokeWidth === PATTERN_OUTLINE_PT) return false;
            outline.strokeWidth = PATTERN_OUTLINE_PT;
            return true;
        } catch (e) { return false; }
    }

    // clearAllStrokes was REMOVED here, per explicit instruction that no stroke
    // may be stripped anywhere in the file. It walked a container recursively and
    // set stroked=false on every PathItem that did not carry a SpotColor stroke
    // (TextFrames were skipped - their strokes belong to replaceInContainer).
    //
    // Its four callers are gone with it: accessory/Patti/Rib&Cuff designs in the
    // main loop, hoodiePasteDesign's pasted design, and the whole-piece wipes in
    // hoodieBuildVariant and hoodieBuildBorder. Those last two were also what
    // erased the Hood's and Border's own cut outline - the reason a 3pt pattern
    // outline could not survive to export on those pieces.
    //
    // Every stroke a mockup or pattern was drawn with now reaches the print as
    // drawn. Only applyPatternOutlineStroke changes a stroke at all, and it
    // changes exactly one property (width) on exactly one path (the outline).

    function bringLogosToFront(container) {
        try {
            function recurse(items) {
                for (var i = items.length - 1; i >= 0; i--) {
                    var it = items[i];
                    if (it.hidden) continue;
                    if (((it.name || "").toLowerCase().indexOf("logo") !== -1) || (it.typename === "TextFrame")) { try { it.zOrder(ZOrderMethod.BRINGTOFRONT); } catch(e) {} }
                    if (it.typename === "GroupItem") recurse(it.pageItems);
                }
            }
            recurse(container.pageItems || [container]);
        } catch (e) {}
    }

    function rectsIntersect(r1, r2) { return !(r2[0] > r1[2] || r2[2] < r1[0] || r2[1] < r1[3] || r2[3] > r1[1]); }

    function attachLooseLogos(sourceItem, targetGroup) {
        try {
            if (!sourceItem || !targetGroup) return;
            var baseBounds; try { baseBounds = sourceItem.visibleBounds; } catch (e) { return; }
            var searchLayer = sourceItem; while (searchLayer.parent && searchLayer.parent.typename !== "Document") { searchLayer = searchLayer.parent; }
            function checkRecursive(container) {
                if (!container.pageItems || container.pageItems.length === 0) return;
                for (var i = container.pageItems.length - 1; i >= 0; i--) {
                    var item = container.pageItems[i];
                    if (item === sourceItem || item.hidden || item.locked || item.typename === "Guide") continue;
                    try { if (rectsIntersect(baseBounds, item.visibleBounds)) { if (item.typename === "GroupItem" && (!item.name || item.pageItems.length > 5)) checkRecursive(item); else item.duplicate(targetGroup, ElementPlacement.PLACEATBEGINNING); } } catch (e) {}
                }
            }
            if (searchLayer.typename === "Layer") checkRecursive(searchLayer);
            else { var p = sourceItem.parent; if (p && p.pageItems) checkRecursive(p); }
        } catch (e3) {}
    }

    function isAccessory(p) { var n = p.toLowerCase(); return n.indexOf("twill") !== -1 || n.indexOf("tukdi") !== -1 || n.indexOf("tape") !== -1 || n.indexOf("placket") !== -1; }
    // FULL-BUTTON: "front-left"/"front-right" only ever exist when
    // FULL_BUTTON expanded a "front" item (see mockupHasBothFrontSides
    // block), so this needs no separate flag check here.
    function isFrontOrBack(p) { var n = (p || "").toLowerCase(); return n === "front" || n === "back" || n === "front-left" || n === "front-right" || n === "front_left" || n === "front_right"; }
    function isFront(p) { var n = (p || "").toLowerCase(); return n === "front"; }
    function isFrontLeft(p) { var n = (p || "").toLowerCase(); return n === "front-left" || n === "front_left"; }
    function isFrontRight(p) { var n = (p || "").toLowerCase(); return n === "front-right" || n === "front_right"; }
    function isBack(p) { var n = (p || "").toLowerCase(); return n === "back"; }
    function getFriendlySize(s) {
        // Youth codes (YXS/YS/YM/YL/YXL) map to themselves - unlike adult
        // codes, the pattern file's own panel names already use the short
        // code directly (e.g. "YXS Front"), not a spelled-out word.
        var m = {
            "XS": "XS", "S": "Small", "M": "Medium", "L": "Large", "XL": "XL", "XXL": "2XL", "2XL": "2XL", "3XL": "3XL", "XXXL": "3XL", "4XL": "4XL", "XXXXL": "4XL",
            "YXS": "YXS", "YS": "YS", "YM": "YM", "YL": "YL", "YXL": "YXL"
        };
        var up = (s || "").toUpperCase();
        if (m[up]) return m[up];
        // ADULT "A" PREFIX: some Excel sheets explicitly mark adult sizes
        // with a leading "A" (AXS/AS/AM/AL/AXL/A2XL/...) to visually pair
        // with the youth "Y" prefix above - it's the SAME size as the
        // un-prefixed code (AM = M), never a distinct size of its own.
        // Strip it and re-look up ONLY when what's left is a known code -
        // no entry above starts with "A", so this never mis-strips a real
        // size name.
        if (up.length > 1 && up.charAt(0) === "A" && m[up.substring(1)]) return m[up.substring(1)];
        return s;
    }

    // ============================================================
    // HOODIE: Outside Hood / Inside Hood / Border / Pocket
    // ============================================================
    // Naming flexibility (per explicit instruction): "Left"/"Right" alone,
    // or with a "Hood" qualifier in either word order, all mean the same
    // side - both on the pattern's "{Size} Hood" group and the mockup's
    // Outside/Inside Hood groups. Same for "Outside Hood"/"Hood Outside"
    // and "Inside Hood"/"Hood Inside" themselves.
    function hoodieSideOf(nm) {
        // Substring match, not an exact-name set - the pattern's own
        // per-size Left/Right children carry the size as a prefix
        // (confirmed on a real job: "2XL Right Hood", "XL Left Hood",
        // "Small Left Hood" - an exact "left"/"lefthood"/"hoodleft" set
        // never matches these). "left"/"right" as substrings, mutually
        // exclusive, is robust to any surrounding size/word order.
        var hasLeft = nm.indexOf("left") !== -1, hasRight = nm.indexOf("right") !== -1;
        if (hasLeft && !hasRight) return "left";
        if (hasRight && !hasLeft) return "right";
        return null;
    }

    function hoodieFindSides(group) {
        var left = null, right = null;
        function walk(container) {
            if (!container || !container.pageItems) return;
            for (var i = 0; i < container.pageItems.length; i++) {
                var it = container.pageItems[i];
                var nm = normalizeItemName(it.name);
                var side = hoodieSideOf(nm);
                if (side === "left" && !left) left = it;
                else if (side === "right" && !right) right = it;
                if (it.typename === "GroupItem") walk(it);
            }
        }
        walk(group);
        return { left: left, right: right };
    }

    // Uses the SAME cached name index as findAnywhere (built once, reused
    // for every lookup) instead of a raw manual walk - a manual walk over
    // mockupDoc on a large mockup file is exactly the "minutes per miss"
    // trap findAnywhere's own caching was built to avoid (confirmed: an
    // earlier uncached version of this function hung a real job past the
    // 10-minute watchdog and got Illustrator force-killed).
    function hoodieFindMockupVariant(wantOutside) {
        if (wantOutside) return findAnywhere(mockupDoc, "Outside Hood") || findAnywhere(mockupDoc, "Hood Outside");
        return findAnywhere(mockupDoc, "Inside Hood") || findAnywhere(mockupDoc, "Hood Inside");
    }

    function hoodieFindMockupBorder() {
        var found = findAnywhere(mockupDoc, "Border");
        return found;
    }

    // Duplicates `mockupSideGroup`'s design onto `patternSideShape` (a
    // pattern piece already in its FINAL position) - same cleanup/color/
    // stroke pipeline as the main per-item loop's generic design paste,
    // scoped down to just what Hood/Border need (no personalization, no
    // accessory branch).
    function hoodiePasteDesign(patternSideShape, mockupSideGroup, warnPrefix) {
        // Largest-area lookup, same reason as hoodieBuildPocket below:
        // patternSideShape is a PATTERN piece and 'base-path' is a mockup-side
        // name, so useFirstFound only ever degraded this to "first path in
        // z-order" - which can be a notch/guide mark rather than the outline.
        var baseShape = findPlacementPath(patternSideShape);
        if (!baseShape) { hoodieWarnings.push(warnPrefix + ": no placement path found on the pattern piece - left as pattern's own fill."); return null; }
        var pastedDesign;
        try {
            pastedDesign = mockupSideGroup.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
        // PARM goes up to buildHoodiePieceWithRollback, which rebuilds this piece.
        } catch (eDup) {
            parmBail(eDup, "duplicating the mockup design for a hoodie piece");
            hoodieWarnings.push(warnPrefix + ": could not duplicate mockup design - " + eDup.message); return null;
        }
        embedPlacedItems(pastedDesign);
        fixIndexedRasters(pastedDesign);
        mergeAndCleanupSwatches(orderDoc, pastedDesign);
        if (pastedDesign.typename !== "GroupItem") {
            var wrapper = orderDoc.groupItems.add(); pastedDesign.moveToBeginning(wrapper); pastedDesign = wrapper;
        }
        var designFill = getDesignBaseFill(pastedDesign);
        if (designFill) { try { baseShape.fillColor = designFill.color; baseShape.filled = true; } catch (eBF) {} }

        // TEST-PRINT SIZE TAGS: same cleanup the main per-item loop does (search
        // "remove'-named items" above). Hood/Border came in through this
        // function instead of that loop, so the mockup's "remove"-named group
        // (the small test-print size tags, e.g. "S-outside"/"S-inside") was
        // never stripped and rode along onto every Hood and Border export.
        // Runs BEFORE alignAndScale for the same reason as there - the design
        // must scale on clean bounds.
        log("HOODIE: checking for 'remove'-named items (test-print size tags) in " + warnPrefix + "...");
        removeNamedItems(pastedDesign, "remove");

        // Hood halves and the Border scale by the same job-wide SCALE_HEIGHT_ONLY
        // choice as every panel in the main loop. No full-button shared-% layer
        // here - that one is about keeping Front-Left/Front-Right/Back consistent
        // across the placket seam, which these pieces have nothing to do with.
        if (SCALE_HEIGHT_ONLY) pmAlignAndScaleToHeight(pastedDesign, baseShape, null);
        else alignAndScale(pastedDesign, baseShape, true, false, false, null);

        // BASE-PATH REMOVAL: the main per-item loop deletes the design's own
        // 'base-path' right after scaling (search "removeBasePaths(pastedDesign"),
        // but that helper is declared INSIDE that loop, so Hood and Border - which
        // come through this function instead - never had it and kept theirs.
        //
        // It went unnoticed while clearAllStrokes still ran here: a leftover
        // base-path sat behind the artwork at roughly the panel's own colour, and
        // its stroke had just been wiped. Now that nothing strips strokes, that
        // leftover keeps the 3pt outline the mockup drew it with and prints as a
        // line inside the panel - so it has to go, and every design carries a
        // base-path now.
        //
        // AFTER the scale, exactly like the main loop: the scale measures the
        // design against this very path, so removing it earlier would leave
        // nothing to measure. Calls the SAME removeBasePaths the main loop uses.
        log("Checking for 'base-path' in " + warnPrefix + " for removal...");
        var hoodBaseRemoved = removeBasePaths(pastedDesign, warnPrefix);
        if (hoodBaseRemoved === 0) log("   - Note: No 'base-path' found to remove in " + warnPrefix);
        else log("   - Total removed from " + warnPrefix + ": " + hoodBaseRemoved);

        // CLIP: same recipe as the main per-item loop's clip setup (search
        // "design_clip_group" above) - nest pastedDesign inside the pattern
        // piece's own group and clip it to a fresh duplicate of baseShape.
        // Without this, pastedDesign is left as an independent top-level
        // object in orderDoc, never actually joined to (or clipped against)
        // the pattern piece - only baseShape's OWN flat fillColor (set just
        // above from designFill) ends up visible, hiding the design behind
        // it entirely. This was the "solid black, no design" bug on
        // Hood/Border exports (confirmed: baseShape's flat color IS black
        // for this job, so the actual card/dice artwork was rendering
        // completely hidden behind it).
        try {
            if (pastedDesign.pageItems && pastedDesign.pageItems.length > 0) {
                if (patternSideShape.typename !== "GroupItem") {
                    var newGroup = orderDoc.groupItems.add(); newGroup.move(patternSideShape, ElementPlacement.PLACEBEFORE);
                    patternSideShape.move(newGroup, ElementPlacement.PLACEATBEGINNING); patternSideShape = newGroup;
                }
                pastedDesign.move(patternSideShape, ElementPlacement.PLACEATBEGINNING);
                var clipMask = baseShape.duplicate(patternSideShape, ElementPlacement.PLACEATBEGINNING);
                var clipGroup = patternSideShape.groupItems.add();
                clipGroup.name = "design_clip_group"; clipGroup.move(baseShape, ElementPlacement.PLACEBEFORE);
                clipMask.move(clipGroup, ElementPlacement.PLACEATBEGINNING); pastedDesign.move(clipGroup, ElementPlacement.PLACEATEND);
                if (clipGroup.pageItems.length >= 2) {
                    clipGroup.clipped = true;
                    log("HOODIE: " + warnPrefix + " - clipping mask active.");
                }
            }
        // PARM goes up to buildHoodiePieceWithRollback, which rebuilds this piece.
        } catch (eClip) {
            parmBail(eClip, "the hoodie clip setup");
            hoodieWarnings.push(warnPrefix + ": clip setup failed - " + eClip.message);
        }
        return pastedDesign;
    }

    // ---------------------------------------------------------------
    // HOOD CENTRE DESIGN MATCH (Outside Hood's Left <-> Right halves).
    // Gated by HOOD_CENTER_MATCH. Same duplicate/recentre/clip technique as
    // SIDE-SEAM MATCH (ssJoinOneSeam above), reimplemented rather than
    // called: ssJoinOneSeam reports through pmWarn -> placketMatchWarnings,
    // and that list is only ever written out for a FULL_BUTTON job (see the
    // PLACKET-MATCH warnings block after the item loop), so every warning
    // from a plain hoodie job would be silently dropped. Keeping an
    // independent hcm* copy also follows the precedent ssClipIntoPanel sets
    // for pmClipIntoPanel - "the two features are meant to stay fully
    // independent".
    // ---------------------------------------------------------------

    // Finds the ONE item anywhere inside `design` whose name normalizes to
    // exactly `wantNorm`. Same rule (lowercased, non-alphanumeric stripped)
    // and same no-area-guessing stance as ssFindNamed.
    function hcmFindNamed(design, wantNorm) {
        var found = null;
        function walk(container) {
            if (found || !container.pageItems) return;
            for (var i = 0; i < container.pageItems.length; i++) {
                var it = container.pageItems[i];
                var nm = ""; try { nm = normalizeSizeWord(it.name); } catch (eN) {}
                if (nm === wantNorm) { found = it; return; }
                if (it.typename === "GroupItem") walk(it);
                if (found) return;
            }
        }
        walk(design);
        return found;
    }

    // Mirrors `item` across the VERTICAL line x = axisX - Illustrator's
    // Reflect dialog at Angle 90, i.e. a -100% horizontal resize.
    //
    // The axis is an explicit parameter rather than just Transformation.CENTER
    // because this feature reflects, CLIPS NEW ARTWORK IN, then reflects back.
    // Clipping changes the group's bounding box, so a second "about its own
    // centre" reflect would mirror about a DIFFERENT axis and leave the piece
    // shifted off its artboard. Re-anchoring to the same axis both times makes
    // the pair an exact round trip.
    function hcmReflectAbout(item, axisX) {
        var before = item.geometricBounds; // [L,T,R,B]
        item.resize(-100, 100, true, true, true, true, 100, Transformation.CENTER);
        var after = item.geometricBounds;
        var wantLeft = (2 * axisX) - before[2]; // where the mirrored left edge belongs
        var dx = wantLeft - after[0];
        if (dx) item.translate(dx, 0, true, true, true, true);
    }

    // Duplicates sharedArt into panel's own design_clip_group - same technique
    // as ssClipIntoPanel/pmClipIntoPanel above, with ONE difference that is not
    // cosmetic: the clip group is searched for RECURSIVELY.
    //
    // Those two look at direct children only, which is right for them - the
    // main per-item loop adds the clip group straight onto the pasted pattern
    // group. hoodiePasteDesign instead does `clipGroup.move(baseShape,
    // PLACEBEFORE)`, so the clip group lands wherever the placement path
    // lives, and on this pattern's hood halves that is NOT the half's top
    // level. A direct-children-only lookup found nothing on all three sizes
    // (harness: "no clip group" x6), so every re-clip silently failed and the
    // feature was a guaranteed no-op.
    function hcmFindClipGroup(container) {
        var found = null;
        function walk(c) {
            if (found || !c.groupItems) return;
            for (var i = 0; i < c.groupItems.length; i++) {
                if (c.groupItems[i].name === "design_clip_group") { found = c.groupItems[i]; return; }
                walk(c.groupItems[i]);
                if (found) return;
            }
        }
        walk(container);
        return found;
    }

    function hcmClipIntoPanel(sharedArt, panel) {
        hcmLastClipError = "";
        try {
            var clipGrp = hcmFindClipGroup(panel.pastedPattern);
            if (!clipGrp) { hcmLastClipError = "no 'design_clip_group' inside this half"; return false; }
            var copy = sharedArt.duplicate(orderDoc, ElementPlacement.PLACEATEND);
            copy.move(panel.pastedDesign, ElementPlacement.PLACEBEFORE);
            return true;
        } catch (e) { hcmLastClipError = e.message; return false; }
    }

    // Closed-form "simulated sewn overlap" centre, same shape as
    // ssCombinedCenterX but on the caller's measured overlapPt: isLeft says
    // which half's OWN far (non-seam) edge anchors which end of the combined
    // span. overlapPt is passed in rather than read from a constant because the
    // gap half of it is measured per piece - see hcmProcessOutsideHood.
    function hcmCombinedCentreX(src, dst, overlapPt) {
        var abS = src.baseShape.geometricBounds, abD = dst.baseShape.geometricBounds; // [L,T,R,B]
        var outerS = src.isLeft ? abS[0] : abS[2];
        var outerD = dst.isLeft ? abD[0] : abD[2];
        var sewnOuterD = dst.isLeft ? (outerD + overlapPt) : (outerD - overlapPt);
        return (outerS + sewnOuterD) / 2;
    }

    // Joins the hood's centre seam: `src`'s own srcName-named object is the
    // single source of truth, a copy is centred on the combined
    // overlapPt-overlapped span so half naturally falls on each half once
    // each one's clip mask trims it, corrected copies are clipped into BOTH,
    // then src's original and dst's own (imprecise, artist-drawn) dstName copy
    // are removed so the old content doesn't double up with the new one.
    function hcmJoinHoodCentre(src, dst, srcName, dstName, sizeLabel, overlapPt) {
        var shared = hcmFindNamed(src.pastedDesign, srcName);
        if (!shared) {
            hoodieWarnings.push(sizeLabel + " Outside Hood " + src.sideName + ": no '" + srcName + "'-named object found - centre match skipped for this size.");
            return false;
        }

        var sharedGroup = orderDoc.groupItems.add();
        try { shared.duplicate(sharedGroup, ElementPlacement.PLACEATEND); } catch (eMv) {}
        if (sharedGroup.pageItems.length === 0) { try { sharedGroup.remove(); } catch (eR) {} return false; }

        var gB = sharedGroup.geometricBounds; // [L,T,R,B]
        var dx = hcmCombinedCentreX(src, dst, overlapPt) - ((gB[0] + gB[2]) / 2);

        // Same 50%-of-panel-width sanity guard as ssJoinOneSeam - an
        // implausibly large correction means the two halves aren't real
        // mirror-sized pattern pieces; leave the graphic where it naturally
        // falls and warn rather than ship something wildly wrong.
        var guard = Math.max(src.baseShape.width, dst.baseShape.width) * 0.5;
        if (Math.abs(dx) > guard) {
            hoodieWarnings.push(sizeLabel + " Outside Hood: centring correction (" + _smMM(dx) + "mm) exceeds 50% of the half's width - shared graphic left at its natural position, check this size manually.");
        } else if (dx) {
            sharedGroup.left = sharedGroup.left + dx;
        }

        var okSrc = hcmClipIntoPanel(sharedGroup, src);
        if (okSrc) { try { shared.remove(); } catch (eRmS) {} }
        else { hoodieWarnings.push(sizeLabel + " Outside Hood " + src.sideName + ": could not re-clip the shared graphic (" + hcmLastClipError + ") - kept its own original content, check this size manually."); }

        // Each cut half's flat print file is unfolded/zero-gap, same reasoning
        // as ssJoinOneSeam's bUnfoldShift: pre-shift the copy going into the
        // second half by the inverse of the future physical close-up so the
        // design still lands correctly once the centre seam is sewn.
        var unfoldShift = dst.isLeft ? -overlapPt : overlapPt;
        var sharedForDst = sharedGroup.duplicate(orderDoc, ElementPlacement.PLACEATEND);
        sharedForDst.left = sharedForDst.left + unfoldShift;
        var okDst = hcmClipIntoPanel(sharedForDst, dst);
        try { sharedForDst.remove(); } catch (eRemD) {}
        if (okDst) {
            var dstOwn = hcmFindNamed(dst.pastedDesign, dstName);
            if (dstOwn) { try { dstOwn.remove(); } catch (eRmD) {} }
        } else {
            hoodieWarnings.push(sizeLabel + " Outside Hood " + dst.sideName + ": could not re-clip the shared graphic (" + hcmLastClipError + ") - kept its own original content, check this size manually.");
        }

        try { sharedGroup.remove(); } catch (eRem) {}
        return okSrc && okDst;
    }

    // Slides the RIGHT-hand half sideways until the two halves sit exactly
    // HCM_GAP_PT apart, per explicit instruction: more than that, less than
    // that, zero or negative (halves touching/overlapping on the sheet) all
    // become it, so every size is identical. The literal is deliberately not
    // repeated here - HCM_GAP_PT is the single place it lives, and the log lines
    // below print whatever it currently is.
    //
    // Measured on VISIBLE bounds (per explicit instruction) - the space between
    // the two printed CUT EDGES, stroke included, which is the gap a person
    // actually sees and the one the cutter works to. It was geometricBounds
    // before, and since applyPatternOutlineStroke widens each outline to
    // PATTERN_OUTLINE_PT (3pt), half of each facing stroke sat inside the gap,
    // so a geometric gap printed about 1.06mm narrower than it measured.
    //
    // Runs for BOTH Outside and Inside hoods, and is NOT gated on
    // HOOD_CENTER_MATCH (per explicit instruction). Being able to cut the two
    // halves apart is a production requirement; it has nothing to do with
    // whether a design crosses the centre seam. It used to sit behind
    // `HOOD_CENTER_MATCH && wantOutside`, which is why a hoodie job with that
    // checkbox off exported Inside hoods whose two halves touched and read as
    // one fused silhouette.
    //
    // MUST run AFTER applyPatternOutlineStroke: visibleBounds includes the
    // stroke, so measuring while the outline is still the pattern's 1pt would
    // set the wrong gap and the widening afterwards would eat into it.
    //
    // Left and Right come from the NAMES the designer gave the two halves in
    // Illustrator (hoodieFindSides), per explicit instruction - there is no
    // mirror/flip guesswork here and no measuring of which half sits where.
    // The RIGHT-named half is always the one that moves; the gap between the
    // two decides only HOW FAR and in which direction (on this job's pattern
    // Small's 2.3mm gap moves it right, XL's 7mm and 2XL's 3.9mm move it left).
    //
    // MUST also run before hoodieBuildVariant measures w/h for the artboard - a
    // half pushed right AFTER that measurement grows the piece past its own
    // artboard edge and the export loses the difference (Small's +0.7mm).
    // Called from there, not from hcmProcessOutsideHood, for exactly that
    // reason.
    //
    // Measured on the placement PATHS, not the piece groups: the group box
    // spans the pasted mockup design's overhang, and at call time no design is
    // pasted yet anyway. The piece GROUP is what translates, so the half's tag
    // and every other child travel with it.
    function hcmNormaliseHalfGap(patternSides, hoodBases, sizeLabel, variantLabel) {
        var who = sizeLabel + " " + variantLabel + " Hood";
        var lBase = hoodBases[0], rBase = hoodBases[1];
        if (!lBase || !rBase) {
            hoodieWarnings.push(who + ": no placement path on one of the halves - the " + _smMM(HCM_GAP_PT) + "mm centre gap could not be set, halves left at the pattern's own gap.");
            return false;
        }

        var lb = lBase.visibleBounds, rb = rBase.visibleBounds; // [L,T,R,B], stroke included
        var gapPt = rb[0] - lb[2];      // Right half's left cut edge minus Left half's right cut edge
        var shift = HCM_GAP_PT - gapPt; // + moves the Right half further right

        // Same shape of sanity guard as hcmJoinHoodCentre's. It only fires when
        // the two named halves are not sitting side by side at all - stacked
        // vertically, or the Right-named piece drawn to the LEFT of the
        // Left-named one, which makes gapPt hugely negative. Sliding a cut piece
        // that far would ruin it, so leave both alone and say why.
        var guard = Math.max(Math.abs(lb[2] - lb[0]), Math.abs(rb[2] - rb[0])) * 0.5;
        if (Math.abs(shift) > guard) {
            hoodieWarnings.push(who + ": the Left and Right halves measure " + _smMM(gapPt) + "mm apart, so setting the " + _smMM(HCM_GAP_PT) + "mm centre gap would move the Right half " +
                _smMM(shift) + "mm - more than half a panel's width. Check that the two halves are named correctly and sit side by side; halves left as the pattern drew them.");
            return false;
        }

        if (Math.abs(shift) > 0.01) {
            patternSides.right.translate(shift, 0, true, true, true, true);
            log("HOOD GAP [" + who + "]: cut edges were " + _smMM(gapPt) + "mm apart; Right half moved " +
                _smMM(shift) + "mm to set the standard " + _smMM(HCM_GAP_PT) + "mm visible gap.");
        } else {
            log("HOOD GAP [" + who + "]: cut edges already " + _smMM(HCM_GAP_PT) + "mm apart - no move needed.");
        }
        return true;
    }

    // The whole reflect -> match -> reflect-back cycle for ONE Outside Hood
    // build. Both halves are mirrored first, per explicit instruction: on this
    // pattern the halves lie Left-then-Right with the WRONG edges facing each
    // other, so the centre-back edges the design actually crosses only become
    // adjacent once each half is flipped in place. The match runs on that
    // adjacency, then both are flipped back so the exported cut pieces keep
    // the orientation the pattern drew.
    //
    // Each half is reflected about its own PLACEMENT PATH's centre line, not
    // its group bounding box: the pasted mockup design can overhang the panel
    // (the same clipped-group overhang hoodieBuildBorder documents), and
    // mirroring about a box that includes that overhang would slide the panel
    // itself off its slot.
    //
    // The reflect-back sits in a finally block on purpose - a half left
    // mirrored because the join threw would be a silently WRONG cut piece,
    // which is far worse than an unmatched design.
    function hcmProcessOutsideHood(patternSides, hoodBases, designs, sizeLabel) {
        var lPiece = patternSides.left, rPiece = patternSides.right;
        var lBase = hoodBases[0], rBase = hoodBases[1];
        var lDesign = designs[0], rDesign = designs[1];

        // hoodieBuildVariant already refuses to go on without both halves, so
        // this cannot fire today - but the very next line dereferences
        // .typename, and "null is not an object" thrown from here would abort
        // the whole size's hood build with a stack trace instead of a warning.
        if (!lPiece || !rPiece) {
            hoodieWarnings.push(sizeLabel + " Outside Hood: a Left/Right half is missing - centre match skipped.");
            return;
        }
        if (lPiece.typename !== "GroupItem" || rPiece.typename !== "GroupItem") {
            hoodieWarnings.push(sizeLabel + " Outside Hood: a half is a bare path rather than a group, so it has no clip group to match into - centre match skipped.");
            return;
        }
        if (!lBase || !rBase) {
            hoodieWarnings.push(sizeLabel + " Outside Hood: no placement path found on one of the halves - centre match skipped.");
            return;
        }
        if (!lDesign || !rDesign) {
            hoodieWarnings.push(sizeLabel + " Outside Hood: one half's mockup design did not paste - centre match skipped.");
            return;
        }

        var lb = lBase.geometricBounds, rb = rBase.geometricBounds; // [L,T,R,B]
        var lAxis = (lb[0] + lb[2]) / 2, rAxis = (rb[0] + rb[2]) / 2;
        // MEASURED, AND USED: this is the real distance the centre design has to
        // cross. hcmNormaliseHalfGap sets HCM_GAP_PT of VISIBLE space between
        // the two cut edges, and each half's 3pt outline puts a further 1.5pt
        // inside that gap, so the PATHS end up HCM_GAP_PT + PATTERN_OUTLINE_PT
        // apart. Measuring is also the self-check that the normalisation
        // actually took - a gapPt far off that sum means it was skipped (its own
        // warning says why), and a normalisation that was skipped for good
        // reason still leaves a real gap this has to bridge.
        var gapPt = rb[0] - lb[2];

        // OVERLAP = 14mm sewing + the MEASURED path-to-path gap.
        //
        // This was `HCM_SEW_PT + HCM_GAP_PT` for a while, so that all three
        // seams built their overlap from constants and ignored the strokes. The
        // cost was the same 3pt (1.06mm) error the placket carried. Now that
        // pmSeamGap measures the placket's gap and ssSeamGap measures the side
        // seam's, all three bridge the real distance and this is back to the
        // measured form it started as.
        //
        // The constant sum stays as the fallback for geometry the normalisation
        // could not fix - halves stacked vertically, or the Right-named half
        // drawn to the LEFT of the Left-named one, which makes gapPt negative or
        // absurdly wide. That is not a seam to bridge, and feeding it in would
        // throw the design clear off the piece.
        var gapUsable = (gapPt >= 0 && gapPt <= Math.min(lb[2] - lb[0], rb[2] - rb[0]) * 0.5);
        var overlapPt = HCM_SEW_PT + (gapUsable ? gapPt : HCM_GAP_PT);
        if (gapUsable) {
            log("HOOD CENTRE MATCH [" + sizeLabel + "]: panel paths sit " + _smMM(gapPt) + "mm apart; applying a " +
                _smMM(overlapPt) + "mm overlap correction (" + _smMM(HCM_SEW_PT) + "mm sewing + the " +
                _smMM(gapPt) + "mm measured path gap, which is the " + _smMM(HCM_GAP_PT) +
                "mm visible centre gap plus the " + _smMM(gapPt - HCM_GAP_PT) + "mm of outline that falls inside it).");
        } else {
            hoodieWarnings.push(sizeLabel + " Outside Hood: the two halves' paths measure " + _smMM(gapPt) +
                "mm apart, which is not a centre seam - the " + _smMM(HCM_GAP_PT) +
                "mm gap constant was used for the overlap instead. Check that the halves are named correctly and sit side by side.");
            log("HOOD CENTRE MATCH [" + sizeLabel + "]: measured path gap " + _smMM(gapPt) +
                "mm is not usable; applying a " + _smMM(overlapPt) + "mm overlap correction (" +
                _smMM(HCM_SEW_PT) + "mm sewing + " + _smMM(HCM_GAP_PT) + "mm gap constant).");
        }

        hcmReflectAbout(lPiece, lAxis);
        hcmReflectAbout(rPiece, rAxis);
        log("HOOD CENTRE MATCH [" + sizeLabel + "]: both Outside Hood halves reflected 90 degrees (vertical axis).");
        try {
            // isLeft is MEASURED, never inferred from the piece's name: it
            // means "this half anchors the LEFT end of the combined span",
            // which after the flip is purely a question of where each half
            // now sits on the sheet.
            var lNow = lBase.geometricBounds, rNow = rBase.geometricBounds;
            var leftHalfIsOnLeft = (lNow[0] <= rNow[0]);
            // BOTH halves carry the same "Center" name, and that is deliberate -
            // the source/destination roles come from the HALVES, not from the
            // object names: the Right half's "Center" is the source of truth (its
            // artwork survives), the Left half's "Center" is that half's own
            // imprecise copy, removed once the corrected one is clipped in.
            // Each lookup is scoped to its own half's pasted design, so one word
            // can serve both. Same trick pmCollectSeamArt already relies on
            // ("same name on BOTH sides since either side can end up as the
            // source panel"); ssJoinOneSeam takes the other route and gives each
            // side its own name, which is why it passes two different strings.
            var src = { pastedPattern: rPiece, baseShape: rBase, pastedDesign: rDesign, isLeft: !leftHalfIsOnLeft, sideName: "Right" };
            var dst = { pastedPattern: lPiece, baseShape: lBase, pastedDesign: lDesign, isLeft: leftHalfIsOnLeft, sideName: "Left" };
            if (hcmJoinHoodCentre(src, dst, "center", "center", sizeLabel, overlapPt)) {
                log("HOOD CENTRE MATCH: " + sizeLabel + " Outside Hood - the Right half's 'Center' re-centred across both halves and re-clipped into each (" +
                    _smMM(overlapPt) + "mm simulated overlap).");
            }
        } catch (eJoin) {
            hoodieWarnings.push(sizeLabel + " Outside Hood: centre match failed (" + eJoin.message + ") - halves exported without matching.");
        } finally {
            hcmReflectAbout(rPiece, rAxis);
            hcmReflectAbout(lPiece, lAxis);
            log("HOOD CENTRE MATCH [" + sizeLabel + "]: both halves reflected back to their original orientation.");
        }
    }

    // Builds ONE Hood variant (Outside or Inside) for a size: a fresh
    // duplicate of the pattern's whole "{Size} Hood" group (Left+Right kept
    // in their own pattern-relative positions - no invented geometric
    // join, per explicit instruction), each side's design pasted from the
    // mockup's matching Outside/Inside Hood side, both sides' strokes
    // cleared, placed as one flowed item (own artboard, exported, then
    // advances the shared row-flow exactly like the main per-item loop).
    function hoodieBuildVariant(hoodGroup, sizeLabel, wantOutside, variantLabel) {
        var mockupVariant = hoodieFindMockupVariant(wantOutside);
        if (!mockupVariant) { hoodieWarnings.push(sizeLabel + " " + variantLabel + " Hood: no matching group found in mockup - skipped."); return; }
        var mockupSides = hoodieFindSides(mockupVariant);
        if (!mockupSides.left || !mockupSides.right) { hoodieWarnings.push(sizeLabel + " " + variantLabel + " Hood: mockup group is missing a Left/Right child - skipped."); return; }

        var dupHood;
        try { dupHood = hoodGroup.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING); }
        // PARM goes up to buildHoodiePieceWithRollback, which rebuilds this piece.
        catch (eDup) {
            parmBail(eDup, "duplicating the Hood pattern group");
            hoodieWarnings.push(sizeLabel + " " + variantLabel + " Hood: could not duplicate pattern group - " + eDup.message); return;
        }

        var patternSides = hoodieFindSides(dupHood);
        if (!patternSides.left || !patternSides.right) { hoodieWarnings.push(sizeLabel + " " + variantLabel + " Hood: pattern group is missing a Left/Right child - skipped."); return; }

        // Captured BEFORE the design is pasted. hoodiePasteDesign duplicates the
        // panel outline to build its clip mask; that copy is the SAME size and
        // lands EARLIER in z-order, so a findPlacementPath run afterwards returns
        // the MASK, not the panel. The mask is unfilled, so its fillColor reports
        // a phantom Gray(0) - read as a white panel - and every hood got a black
        // tag regardless of its real color (invisible on a black hood, and only
        // readable on a light one by luck). Object references only: the fill is
        // still read after the paste, so it is the final panel color.
        var hoodBases = [findPlacementPath(patternSides.left), findPlacementPath(patternSides.right)];

        // PATTERN OUTLINE STROKE: same 1pt -> 3pt as the main loop, applied here
        // at duplication time so the design pasted below aligns onto an outline
        // that is ALREADY 3pt, and so w/h just below size the artboard around the
        // wider stroke.
        //
        // Now also has to come BEFORE the centre gap below: that gap is measured
        // on visibleBounds, which includes the stroke, so it can only be set
        // once both outlines are at their final width.
        applyPatternOutlineStroke(hoodBases[0]);
        applyPatternOutlineStroke(hoodBases[1]);

        // HOOD CENTRE GAP: leave HCM_GAP_PT of visible space between the two
        // halves' cut edges. Runs for BOTH hood variants and regardless of
        // HOOD_CENTER_MATCH (per explicit instruction) - two pieces that touch
        // on the sheet cannot be cut apart, which is a production requirement
        // rather than part of the design-matching feature it used to be gated
        // behind.
        //
        // Deliberately sequenced HERE - after the strokes, but before w/h are
        // measured and before dupHood is placed - so the artboard cut below is
        // sized around where the halves END UP. Moving a half after that
        // measurement would push it past its own artboard edge and the export
        // would silently lose the overhang (Small's Right half moves +0.7mm).
        hcmNormaliseHalfGap(patternSides, hoodBases, sizeLabel, variantLabel);

        var b = dupHood.visibleBounds;
        var w = Math.abs(b[2] - b[0]), h = Math.abs(b[1] - b[3]);

        // HOOD-PAIR: the second hood variant of a size stacks 5mm directly
        // below the first (per explicit instruction: Outside Hood sits 5mm
        // under Inside Hood, and buildHoodieExtras builds Inside first for
        // exactly that reason) instead of flowing beside it. The two are the
        // same pattern piece twice over, so side-by-side spent a full extra
        // column on a shape identical in width to its neighbour.
        //
        // Centred on the first hood the same way RIB & CUFF centres on its
        // Sleeve, with the same guard: a second hood somehow WIDER than the
        // first keeps the shared left edge rather than being pushed left into
        // the neighbouring column.
        var hoodAnchor = hoodieLastHoodBySize[sizeLabel] || null;
        var hoodStacked = false;
        if (hoodAnchor) {
            var hoodSlack = 0;
            if (hoodAnchor.width && hoodAnchor.width > w) hoodSlack = (hoodAnchor.width - w) / 2;
            dupHood.left = hoodAnchor.leftX + hoodSlack;
            dupHood.top = hoodAnchor.bottomY - GAP_5MM_PT;
            delete hoodieLastHoodBySize[sizeLabel]; // pair closed - never chain a third
            hoodStacked = true;
            log("HOOD-PAIR: stacking " + sizeLabel + " " + variantLabel + " Hood 5mm below its counterpart, centred on it (" +
                Math.round(hoodSlack) + "pt inset) - no extra row width used.");
        } else {
            dupHood.left = currentX; dupHood.top = currentY;
        }
        // The piece's ACTUAL placed position, which is no longer always
        // currentX/currentY - the artboard below must be cut around where it
        // really sits or a stacked hood exports its neighbour's slot.
        var placedX = dupHood.left, placedY = dupHood.top;

        // Pattern tag text: the size word the pattern already carries (e.g.
        // "Medium") with nothing but " Outside" / " Inside" added after it, per
        // explicit instruction - the size is already printed on the piece, so the
        // only thing worth adding is which of the two hood layers this is. The
        // word "Hood" used to be appended too and is deliberately gone; the piece
        // shape says that much on its own.
        //
        // renameSizeTags matches on sizeLabel, so sizeLabel IS the word already
        // on the pattern - rebuilding the text from it keeps that word exactly as
        // drawn rather than substituting a different spelling for it.
        //
        // SAME text on both the Left and Right physical pieces (no Left/Right
        // suffix): the pattern only ever carries a plain size word, and only the
        // mockup distinguishes Outside from Inside.
        var hoodTagText = sizeLabel + " " + variantLabel;
        var tagHitsL = renameSizeTags(patternSides.left, sizeLabel, hoodTagText);
        if (tagHitsL > 0) log("HOODIE: " + variantLabel + " Hood Left-piece tag updated to '" + hoodTagText + "' (" + tagHitsL + " tag).");
        var tagHitsR = renameSizeTags(patternSides.right, sizeLabel, hoodTagText);
        if (tagHitsR > 0) log("HOODIE: " + variantLabel + " Hood Right-piece tag updated to '" + hoodTagText + "' (" + tagHitsR + " tag).");

        // Return values captured (they used to be discarded): HOOD CENTRE
        // MATCH below needs each half's pasted design group to find its own
        // "Center"-named object in, and to know which item the corrected copy
        // must be clipped in FRONT of. Each half's group is also what keeps the
        // two same-named objects apart - see hcmProcessOutsideHood.
        var hoodDesignL = hoodiePasteDesign(patternSides.left, mockupSides.left, sizeLabel + " " + variantLabel + " Hood Left");
        var hoodDesignR = hoodiePasteDesign(patternSides.right, mockupSides.right, sizeLabel + " " + variantLabel + " Hood Right");

        // PATTERN SIZE TAG: the tag IS renamed correctly above (the log confirms
        // "1 tag" per half), but hoodiePasteDesign drops the design clip group in
        // FRONT of the piece's outline (clipGroup.move(baseShape, PLACEBEFORE)),
        // which also puts it above the piece's own tag group - so a hood design
        // that covers the tag area paints the tag out and it never reaches the
        // export. IDENTICAL failure to the one hoodieBuildBorder documents and
        // fixes with this same call; the main per-item loop and the Pocket both
        // carry it too. Hood was simply the one builder it was never added to,
        // which is why the tags vanish only on hoods whose design reaches them.
        // Per half, not on dupHood as a whole: each half owns its own clip group,
        // and the helper looks for design_clip_group inside the container it is
        // handed. Runs BEFORE the centre match so the reflect round trip below
        // carries the tag along in its final z-position.
        bringPatternLabelsToFront(patternSides.left, patternSides.left, null);
        bringPatternLabelsToFront(patternSides.right, patternSides.right, null);

        // SMART CONTRAST: the pattern's own size tag sits straight on the panel
        // color, so on a dark hood it exports as black-on-black. Same treatment
        // Neck already gets (search "isNeck && baseShape"), applied to BOTH
        // variants (Outside and Inside) and both physical pieces, each judged
        // against its OWN panel color - hoodiePasteDesign filled each side's
        // placement path from that side's mockup design just above.
        // skipDesignGroup=true: only the pattern's tag is recolored, the pasted
        // mockup artwork keeps every color the designer drew.
        var hoodSides = [patternSides.left, patternSides.right];
        var hoodSideNames = ["Left", "Right"];
        for (var hs = 0; hs < hoodSides.length; hs++) {
            try {
                // hoodieFindSides matches on name alone, so a side CAN come back
                // as a bare PathItem. Then it holds no tag to recolor (and
                // renameSizeTags above could not have found one either) - say so
                // instead of no-op'ing silently inside smartContrast.
                if (hoodSides[hs].typename !== "GroupItem") {
                    hoodieWarnings.push(sizeLabel + " " + variantLabel + " Hood " + hoodSideNames[hs] +
                        ": side is a bare " + hoodSides[hs].typename + ", not a group - it carries no size tag to recolor.");
                    continue;
                }
                var hoodBase = hoodBases[hs];
                if (!hoodBase) {
                    hoodieWarnings.push(sizeLabel + " " + variantLabel + " Hood " + hoodSideNames[hs] +
                        ": no placement path found - size tag left in its original color, check it is readable.");
                    continue;
                }
                // Resolved before the call on purpose: smartContrast's own
                // brightness math understands CMYK and RGB only, so a GrayColor
                // (which is also what an UNFILLED path reports) scores 0 and
                // would put WHITE text on a white panel. resolveInkForOrderDoc
                // maps gray to K-only CMYK. Done here rather than inside
                // smartContrast so the long-standing Neck call is untouched.
                var hoodBg = resolveInkForOrderDoc(hoodBase.fillColor) || hoodBase.fillColor;
                smartContrast(hoodSides[hs], hoodBg, true);
            } catch (eSC) {
                hoodieWarnings.push(sizeLabel + " " + variantLabel + " Hood " + hoodSideNames[hs] +
                    ": smart contrast failed (" + eSC.message + ") - size tag left in its original color.");
            }
        }

        // HOOD CENTRE DESIGN MATCH: OUTSIDE Hood only (Inside Hood is
        // deliberately untouched, per explicit instruction). Runs here - after
        // both halves' designs are pasted AND clipped, before the artboard is
        // cut and exported - because the match works on those very clip groups,
        // and its reflect/reflect-back pair must be finished before the export
        // reads the piece. The artboard rect below is unaffected: w/h were
        // measured before any design was pasted, and the reflect round trip
        // leaves both halves exactly where they started.
        if (HOOD_CENTER_MATCH && wantOutside) {
            hcmProcessOutsideHood(patternSides, hoodBases, [hoodDesignL, hoodDesignR], sizeLabel);
        }

        var instanceName = sizeLabel + " " + variantLabel + " Hood";
        dupHood.name = instanceName;
        artboardCount++;
        var finalRect = [placedX, placedY, placedX + w, placedY - h];
        var ab = orderDoc.artboards.add(finalRect);
        ab.artboardRect = finalRect; ab.name = instanceName;
        queueExport( orderDoc.artboards.length - 1, exportFolderFor(sizeLabel), instanceName, sizeLabel);

        if (hoodStacked) {
            // Consumed no new column - currentX already cleared the hood this
            // one sits under. The ROW still has to be tall enough for both, so
            // measure from the top of the first hood down to the bottom of this
            // one. Taken from the anchor rather than currentY, which may have
            // moved if the first hood's own advance broke the row.
            var stackH = hoodAnchor.topY - (placedY - h);
            if (stackH > rowMaxHeight) rowMaxHeight = stackH;
        } else {
            // First hood of this size: remember it so the other variant can
            // stack under it, then advance the flow as usual.
            hoodieLastHoodBySize[sizeLabel] = { leftX: placedX, topY: placedY, bottomY: placedY - h, width: w };
            currentX += w + refContext.spacing;
            if (h > rowMaxHeight) rowMaxHeight = h;
        }
        if (currentX > 7500) { currentX = -7500; currentY -= (rowMaxHeight + refContext.vSpacing); rowMaxHeight = 0; }
        log("HOODIE: " + instanceName + " built and exported.");
    }

    // Border: ONE piece only (Front's and Back's are identical, per
    // explicit instruction - no separate Back copy). Positioned 5mm below
    // Front's own FINISHED position (same left edge), on its own artboard -
    // anchored to Front, not part of the shared row-flow, so it never
    // consumes/advances currentX/currentY.
    function hoodieBuildBorder(borderPiece, sizeLabel, frontState) {
        var borderMockup = hoodieFindMockupBorder();
        if (!borderMockup) { hoodieWarnings.push(sizeLabel + " Border: no 'Border' group found in mockup - skipped."); return; }

        var dupBorder;
        try { dupBorder = borderPiece.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING); }
        // PARM goes up to buildHoodiePieceWithRollback, which rebuilds this piece.
        catch (eDup) {
            parmBail(eDup, "duplicating the Border pattern piece");
            hoodieWarnings.push(sizeLabel + " Border: could not duplicate pattern piece - " + eDup.message); return;
        }

        // X and Y come from DIFFERENT boxes on purpose.
        //
        // LEFT: the Front's own pattern outline, same reasoning hoodieBuildPocket
        // spells out below ("target is always baseShape, never the raw pasted
        // group"). The group's box also spans the pasted mockup design, whose
        // clip group reports its pre-clip extent - measured on this job it ran
        // 270pt (Small) / 310pt (XL) / 326pt (2XL) past the panel's left edge.
        // Anchoring to that put the Border a different, size-dependent distance
        // LEFT of its own Front every time, while the Front, the size label and
        // every other row all start at the same margin. baseShape puts the
        // Border's left edge exactly under the Front's.
        //
        // TOP: still measured from the GROUP's bottom, deliberately left alone.
        // That bottom includes the same design overhang (77pt below the hem on
        // XL), so the Border clears the Front's artwork instead of running into
        // it, and the vertical flow - including the 15mm gap to the next size's
        // row, which rowMaxHeight below is what actually guarantees - stays
        // byte-for-byte what it already was.
        var frontOutlineB = frontState.baseShape ? frontState.baseShape.visibleBounds : frontState.pastedPattern.visibleBounds;
        var frontB = frontState.pastedPattern.visibleBounds; // [L,T,R,B]
        var bb = dupBorder.visibleBounds;
        var bw = Math.abs(bb[2] - bb[0]), bh = Math.abs(bb[1] - bb[3]);
        dupBorder.left = frontOutlineB[0];
        dupBorder.top = frontB[3] - GAP_5MM_PT;

        hoodiePasteDesign(dupBorder, borderMockup, sizeLabel + " Border");

        // PATTERN SIZE TAG: hoodiePasteDesign drops the design clip group in
        // FRONT of the piece's outline (clipGroup.move(baseShape, PLACEBEFORE)),
        // which also puts it above the piece's own tag group - the Border piece
        // is just [outline, tag group] - and the Border design is a solid hem
        // band covering the whole piece, so the tag ("Small" / "X-Large" /
        // "2X-Large" on this pattern) was painted over and never reached the
        // export. The main per-item loop lands in the exact same stacking and
        // fixes it with this call (search "bringPatternLabelsToFront(pastedPattern"),
        // which is why Front/Back/Sleeve/Rib & Cuff all show their tags - Border
        // simply never went through that loop.
        // The helper routes the tag to just under the clip mask, so it renders
        // above the design and stays clipped to the piece, and it carries the
        // tag's background box up together with the text.
        // Plain container here, no clipHost hunt like the Pocket needs:
        // design_clip_group is a DIRECT child of dupBorder, which is what
        // bringPatternLabelsToFront looks for.
        // Safe to run before the artboard below - bw/bh were measured at the top
        // of this function, so re-ordering z now cannot change the export size.
        bringPatternLabelsToFront(dupBorder, dupBorder, null);

        var instanceName = sizeLabel + " Border";
        dupBorder.name = instanceName;
        artboardCount++;
        var finalRect = [dupBorder.left, dupBorder.top, dupBorder.left + bw, dupBorder.top - bh];
        var ab = orderDoc.artboards.add(finalRect);
        ab.artboardRect = finalRect; ab.name = instanceName;
        queueExport( orderDoc.artboards.length - 1, exportFolderFor(sizeLabel), instanceName, sizeLabel);

        // The Border hangs BELOW its Front, outside the Front's own height, and
        // this function never touched the row-height tracker - so rowMaxHeight
        // only ever knew about the Front. The next row (forced on the size
        // change, or on a horizontal wrap) then dropped by the Front's height
        // alone and its artboards landed straight on top of the Border.
        // Grow the row to reach the Border's bottom edge instead.
        // Measured from currentY, the row's own top: if a wrap moved the flow
        // to a new row after the Front was placed, the difference goes negative
        // and the tracker is correctly left alone.
        var rowNeed = currentY - (dupBorder.top - bh);
        if (rowNeed > rowMaxHeight) {
            rowMaxHeight = rowNeed;
            log("HOODIE: row height extended to " + Math.round(rowNeed) + "pt so the next row clears " + instanceName + ".");
        }
        log("HOODIE: " + instanceName + " built and exported 5mm below Front.");
    }

    // POCKET vs LOCAL TAG, resolved while the FRONT is still being built and
    // BEFORE the Front is exported - that timing is the whole point. The
    // Pocket itself is built much later (buildHoodieExtras, after the Front's
    // exportResult), so any tag move made there is invisible in both exports:
    // the Front JPG is already on disk, and the Pocket renders a duplicate of
    // the design taken at clip time.
    //
    // Stages a throwaway copy of this size's Pocket on the Front using the
    // exact same alignment hoodieBuildPocket uses (h-centre on the panel,
    // bottom flush with the panel hem), insets its outline 1in inward (that
    // outer band is stitching margin, so only the inset area really covers
    // the tag), and tests that against the tag. The copy is measurement-only
    // and always removed again - nothing it does reaches the artwork.
    //
    // Shifts, in order, with the caller's hard limits:
    //   1. down 0.5in  (tag starts 1.5in up -> 1.0in is as low as it may go)
    //   2. right 0.5in (by the measured overlap, capped at 0.5in)
    function hoodieResolveLocalTagVsPocket(sizeLabel, frontBaseShape, localTagGroup) {
        if (!localTagGroup || !frontBaseShape) return;
        var pocketPiece = findAnywhere(patternDoc, sizeLabel + " Pocket");
        if (!pocketPiece) return; // no Pocket for this size - nothing to clear

        var tmpPocket = null;
        try {
            tmpPocket = pocketPiece.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
            var tmpBase = findPlacementPath(tmpPocket);
            if (!tmpBase) { hoodieWarnings.push(sizeLabel + ": Pocket/Local Tag check - no placement path on the Pocket piece, skipped."); return; }

            // Same alignment as hoodieBuildPocket (both sides measured off the
            // pattern pieces' own placement paths, never the pasted groups).
            var frontB = frontBaseShape.visibleBounds; // [L,T,R,B]
            var pbB = tmpBase.visibleBounds;
            var pw = Math.abs(pbB[2] - pbB[0]);
            var dx = (((frontB[0] + frontB[2]) / 2) - pw / 2) - pbB[0];
            var dy = frontB[3] - pbB[3];
            tmpPocket.translate(dx, dy);

            var ONE_INCH_PT = 72, HALF_INCH_PT = 36;
            var pocketPoly = _smSampleOutline(tmpBase, 32); // raw outline, staged position

            // The rule is "the pocket's outer 1in band is stitching margin, so
            // the tag only matters if it reaches INSIDE that band".
            //
            // _smInsetOutline is deliberately NOT used to build that band. It
            // offsets each sampled vertex along its own normal, which
            // self-intersects at sharp corners once the offset gets large.
            // Harmless at SLEEVE-MATCH's 7mm (19.8pt), not at 1in (72pt, 3.6x
            // bigger): measured on a real Small job it reported a LARGER
            // overlap with the tag (25.4pt) than the RAW outline did (18.7pt),
            // which a genuine inward offset can never do, and its bounding box
            // came out only ~42pt narrower per side instead of 72pt.
            //
            // Instead this asks Illustrator for the real thing (below), and
            // falls back to a direct depth test - inside the pocket AND more
            // than 1in from its edge - if Illustrator refuses. Both were
            // verified to agree on a real Small job.
            function distToPoly(poly, x, y) {
                var best = 1e18;
                for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                    var ax = poly[j][0], ay = poly[j][1], bx = poly[i][0], by = poly[i][1];
                    var vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy, t = 0;
                    if (len2 > 1e-9) {
                        t = ((x - ax) * vx + (y - ay) * vy) / len2;
                        if (t < 0) t = 0; else if (t > 1) t = 1;
                    }
                    var dx2 = x - (ax + t * vx), dy2 = y - (ay + t * vy);
                    var d = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    if (d < best) best = d;
                }
                return best;
            }

            // Rightmost point of `r` that lies inside the polygon (and, when
            // marginPt > 0, deeper than that margin), or null when the rect
            // never gets that deep. Sampled on a grid across the rect - the tag
            // box is ~3in x 1.8in, so a 24x12 grid resolves it to about 9pt,
            // far finer than the shifts below.
            function deepestXInRect(poly, r, marginPt) {
                var COLS = 24, ROWS = 12, mx = null;
                for (var i = 0; i <= COLS; i++) {
                    var x = r[0] + (r[2] - r[0]) * (i / COLS);
                    if (mx !== null && x <= mx) continue; // can only improve on mx
                    for (var j = 0; j <= ROWS; j++) {
                        var y = r[3] + (r[1] - r[3]) * (j / ROWS);
                        if (!_smPointInPoly(poly, x, y)) continue;
                        if (marginPt > 0 && distToPoly(poly, x, y) <= marginPt) continue;
                        mx = x;
                        break;
                    }
                }
                return mx;
            }

            // Illustrator's OWN Offset Path, scripted: the "Adobe Offset Path"
            // live effect plus expandStyle is exactly what
            // Object > Path > Offset Path > -1 in does by hand, with corners and
            // self-intersections resolved by Illustrator rather than by our own
            // maths. Returns the offset outline as a sampled polygon and always
            // deletes the temporary artwork it created; null if Illustrator
            // refuses, in which case the caller uses the distance test instead.
            // The XML dict is undocumented by Adobe (community-derived), so its
            // behaviour was verified empirically on this install: ofst is in
            // POINTS and a negative value shrinks inward.
            function officialInsetPolygon(srcPath) {
                var probe = null, expanded = null;
                try {
                    var srcB = srcPath.geometricBounds;
                    var srcW = Math.abs(srcB[2] - srcB[0]), srcH = Math.abs(srcB[1] - srcB[3]);
                    // expandStyle acts on the ACTIVE document's selection, so the
                    // order doc has to be frontmost for it (it is where all the
                    // work happens anyway - pattern/mockup are only read from).
                    // Set BEFORE the effect so the redraw below materialises it in
                    // this document and not in whichever doc a lookup left active.
                    app.activeDocument = orderDoc;
                    // PLACEATBEGINNING on orderDoc.layers[0], never in place: the
                    // placement path is itself a clipping path, and Illustrator
                    // ignores a live effect applied to one.
                    probe = srcPath.duplicate(orderDoc.layers[0], ElementPlacement.PLACEATBEGINNING);
                    probe.applyEffect('<LiveEffect name="Adobe Offset Path"><Dict data="R mlim 4 R ofst -' + ONE_INCH_PT + ' I jntp 2 "/></LiveEffect>');
                    // MANDATORY - not cosmetic. A live effect is only materialised
                    // on a redraw; without this, expandStyle runs against
                    // un-rendered artwork and silently expands NOTHING. It throws
                    // no exception, so the catch below never fires, and the RAW
                    // outline comes back looking like a valid inset - which then
                    // sets testMargin to 0 and switches the entire 1in rule off.
                    // Confirmed by a 4-way probe (destination x redraw): only
                    // "layers[0] + redraw" produces a real inset; the other three
                    // shrink the shape by 0pt. This line existed in the original
                    // verification script (scratchpad pocket_test/compare_offset.jsx)
                    // and was lost when the recipe was ported here - it is why every
                    // Small hoodie got a 0.5in tag shift it did not need, while
                    // XL/2XL happened to pass anyway (their tag never touched the
                    // raw outline at all). See PHR 111.
                    app.redraw();
                    orderDoc.selection = null;
                    probe.selected = true;
                    app.executeMenuCommand("expandStyle");
                    app.redraw();
                    var sel = orderDoc.selection;
                    if (!sel || sel.length === 0) return null;
                    expanded = sel[0];
                    probe = null; // expandStyle consumed it
                    orderDoc.selection = null;
                    var poly = _smSampleOutline(expanded, 32);
                    if (!poly || poly.length < 8) return null;
                    // Trust it only if the shape ACTUALLY shrank. A silent no-op
                    // must fall through to the 1in depth test rather than pass a
                    // raw outline off as an inset - an exception is not the only
                    // way this step can fail. A genuine -1in inset takes at least
                    // 144pt off each axis (more where the edges are slanted:
                    // measured 229pt x 188pt on a real pocket), so 100pt is a
                    // generous floor that still catches a 0pt no-op.
                    var iL = 1e18, iT = -1e18, iR = -1e18, iB = 1e18;
                    for (var pi = 0; pi < poly.length; pi++) {
                        var px = poly[pi][0], py = poly[pi][1];
                        if (px < iL) iL = px; if (px > iR) iR = px;
                        if (py > iT) iT = py; if (py < iB) iB = py;
                    }
                    if ((srcW - Math.abs(iR - iL)) < 100 || (srcH - Math.abs(iT - iB)) < 100) {
                        log("HOODIE: " + sizeLabel + " Offset Path returned an un-inset shape (" +
                            Math.round(Math.abs(iR - iL)) + "x" + Math.round(Math.abs(iT - iB)) +
                            "pt vs source " + Math.round(srcW) + "x" + Math.round(srcH) +
                            "pt) - falling back to the distance test.");
                        return null;
                    }
                    return poly;
                } catch (eOff) {
                    log("HOODIE: " + sizeLabel + " Offset Path unavailable (" + eOff.message + ") - falling back to the distance test.");
                    return null;
                } finally {
                    if (probe) { try { probe.remove(); } catch (eRp) {} }
                    if (expanded) { try { expanded.remove(); } catch (eRe) {} }
                    try { orderDoc.selection = null; } catch (eSel) {}
                }
            }

            // Measure the tag by the SAME box processLocalTagLabel pins to 3in
            // (2.5in youth) - its active clip path - not by the whole LOCAL-TAG
            // group. The group also carries sibling brand text sitting outside
            // that box: measured 3.67in against a 3.00in box on a real Small
            // job, with 46.6pt of that surplus on the right and only 1.5pt on
            // the left. Same reason processLocalTagLabel measures the box for
            // its own width pinning - the printed label is the box, not the
            // group's extent. The GROUP is still what moves; only the
            // measurement changes.
            function tagRect() {
                var clip = findActiveClipPath(localTagGroup);
                return clip ? clip.geometricBounds : localTagGroup.visibleBounds;
            }

            // Prefer Illustrator's own -1in Offset Path; the distance test is
            // only the fallback. Both agreed on a real Small job (tag clear at
            // 1.5in-up), so the fallback is a safety net, not a second opinion.
            var insetPoly = officialInsetPolygon(tmpBase);
            var testPoly = insetPoly || pocketPoly;
            var testMargin = insetPoly ? 0 : ONE_INCH_PT;
            log("HOODIE: " + sizeLabel + " Pocket/Local-Tag check using " +
                (insetPoly ? "Illustrator's Offset Path -1in." : "the 1in depth test (Offset Path unavailable)."));

            var tagBounds = tagRect();
            if (deepestXInRect(testPoly, tagBounds, testMargin) === null) {
                log("HOODIE: " + sizeLabel + " Local Tag already clear of the Pocket - not moved.");
                return;
            }

            localTagGroup.translate(0, -0.5 * 72);
            tagBounds = tagRect();
            var deepX = deepestXInRect(testPoly, tagBounds, testMargin);
            if (deepX === null) {
                log("HOODIE: " + sizeLabel + " Local Tag cleared Pocket after the 0.5in bottom-shift alone (now 1.0in up).");
                return;
            }

            // Push it 0.1in CLEAR of however deep it actually sits, not just
            // flush with the deepest point (still capped at 0.5in): landing
            // exactly on that point leaves the edges touching, which the
            // re-check below can still count as a hit and warn about an
            // overlap that is really zero.
            var CLEARANCE_PT = 0.1 * 72;
            var overlapX = deepX - tagBounds[0];
            if (overlapX > 0) {
                localTagGroup.translate(Math.min(overlapX + CLEARANCE_PT, HALF_INCH_PT), 0);
                tagBounds = tagRect();
            }
            if (deepestXInRect(testPoly, tagBounds, testMargin) !== null) {
                hoodieWarnings.push(sizeLabel + ": Pocket and Local Tag still overlap after the 0.5in bottom-shift and 0.5in right-shift (both at their limit) - check manually.");
            } else {
                log("HOODIE: " + sizeLabel + " Local Tag cleared Pocket after bottom-shift + right-shift.");
            }
        } catch (eChk) {
            hoodieWarnings.push(sizeLabel + ": Pocket/Local Tag overlap check failed - " + eChk.message);
        } finally {
            // Measurement-only copy - must never survive into the order file,
            // including on the early returns above.
            if (tmpPocket) { try { tmpPocket.remove(); } catch (eRm) {} }
        }
    }

    // The size tag inside a Pocket piece's clipping group - the thing the
    // operator selects before hitting Ctrl+B. Returns the BACKMOST one so the
    // pasted design ends up behind every tag, not just the first: XL/2XL pocket
    // pieces carry two (a tag group plus a loose TextFrame), and pasting behind
    // only the frontmost would leave the other one under the design.
    // Direct children only - the tag is always a child of the clipping group
    // itself, and going deeper risks selecting text that belongs to artwork.
    function hoodiePocketBackmostLabel(host, skipItem) {
        var found = null;
        try {
            for (var i = 0; i < host.pageItems.length; i++) {
                var it = host.pageItems[i];
                if (it === skipItem) continue;
                var isLabel = (it.typename === "TextFrame");
                if (!isLabel && it.typename === "GroupItem") {
                    try { isLabel = (it.textFrames && it.textFrames.length > 0); } catch (eTf) {}
                }
                if (isLabel) found = it; // keep going - last match is the backmost
            }
        } catch (eL) {}
        return found;
    }

    // POCKET: staged on Front (h-center/v-bottom, exactly where it sits on
    // the body) so Front's FINISHED base color + design can be clipped into
    // it unmoved (continuation look, per explicit instruction: same
    // placement -> same design shows through -> reads as continuous once
    // stitched). Runs the Pocket/Local-Tag overlap recipe at THIS staged
    // position (the only point where both actually occupy the same
    // coordinate space), then relocates the finished result into the
    // normal row-flow like any other item - no custom gap rule, per
    // explicit correction.
    function hoodieBuildPocket(pocketPiece, sizeLabel, frontState) {
        var dupPocket;
        try { dupPocket = pocketPiece.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING); }
        // PARM goes up to buildHoodiePieceWithRollback, which rebuilds this piece.
        catch (eDup) {
            parmBail(eDup, "duplicating the Pocket pattern piece");
            hoodieWarnings.push(sizeLabel + " Pocket: could not duplicate pattern piece - " + eDup.message); return;
        }

        // Largest-area lookup (no useFirstFound): 'base-path' is a MOCKUP-side
        // name and never exists in the master pattern, so passing true here
        // only ever fell through to "first path in z-order" - which the
        // findPlacementPath comment itself warns can be a tiny notch/guide
        // mark. Every other pattern-side caller (Front/Back/Sleeve above) uses
        // this same plain largest-area call.
        var pocketBaseShape = findPlacementPath(dupPocket);
        if (!pocketBaseShape) { hoodieWarnings.push(sizeLabel + " Pocket: no placement path found on the pattern piece - skipped."); return; }

        // Stage: horizontal-center / vertical-bottom against Front's own
        // FINISHED bounds (front's bottom edge, front's own width).
        //
        // BOTH sides are measured off the PATTERN PIECE'S OWN PLACEMENT PATH,
        // never the duplicated group's bounds:
        //   - Front: frontState.baseShape, not frontState.pastedPattern. The
        //     group also carries the size tag and cut/notch marks that sit
        //     BELOW the panel hem, so its bottom is lower than the garment
        //     itself. Bottom-aligning to that pushed the pocket past the hem,
        //     into a band where Front has no colour or design at all - the
        //     clip below then had nothing to pull in there and the pocket
        //     exported with an empty white strip along its bottom.
        //   - Pocket: pocketBaseShape, same reason (a tag/notch in the group
        //     would skew its width and offset the horizontal centring).
        // This is also what alignAndScale does everywhere else in this file:
        // target is always baseShape, never the raw pasted group.
        // Translate by the resulting delta so the whole piece (shape + tag)
        // still moves as one rigid unit.
        var frontB = frontState.baseShape.visibleBounds; // [L,T,R,B] - Front's pattern outline (hem), not the group
        var pbB = pocketBaseShape.visibleBounds; // [L,T,R,B] - true outline shape only
        var pw = Math.abs(pbB[2] - pbB[0]), ph = Math.abs(pbB[1] - pbB[3]);
        var frontCenterX = (frontB[0] + frontB[2]) / 2;
        var dx = (frontCenterX - pw / 2) - pbB[0];
        var dy = frontB[3] - pbB[3]; // shape's own bottom edge flush with Front's bottom edge
        dupPocket.translate(dx, dy);

        // NOTE: the Pocket/Local-Tag overlap recipe does NOT live here. It has
        // to run while the FRONT is still being built, before the Front is
        // exported (line ~1046) - see hoodieResolveLocalTagVsPocket. Sitting
        // here it could never affect anything: the Front's JPG was already
        // written by this point, and the tag the Pocket shows is a duplicate
        // taken by the clip block below, so a later move of the Front's own
        // tag left both exports unchanged.

        // Clip Front's base color + design into the pocket's own outline,
        // AT this staged position - a straight duplicate (no alignAndScale,
        // no repositioning) of both, so whatever design content already
        // sits under the pocket's footprint on Front is exactly what shows
        // through it. Built INSIDE the pattern piece itself (same recipe as
        // the proven Hood/Border clip in hoodiePasteDesign above - clipGroup
        // as a child of the pattern piece's own group; see clipHost below for
        // exactly which group) instead of as an
        // independent top-level orderDoc group - a real job showed the
        // top-level version silently failing to confine anything: the
        // export came out as Front's full, un-clipped body + design instead
        // of the small pocket cutout. Also adds the same pageItems.length
        // guard + success/failure log that hoodiePasteDesign already has,
        // so a future clip failure shows up in debug_log.txt instead of
        // silently exporting wrong artwork.
        //
        // WHERE the clip group is hosted decides everything here. What actually
        // confines the Front artwork to the pocket silhouette is the PATTERN
        // PIECE'S OWN clipping group - the one the designer built, whose mask is
        // this very outline path. This function's own clipGroup.clipped=true does
        // NOT confine anything on its own (measured on job f6b1c036: even a fresh,
        // purpose-built mask path left the export completely unclipped), it only
        // marks the paths - which is why the "clipping mask active" log below was
        // never a guarantee and no warning ever fired.
        //
        // That clipping group is NOT always the top-level piece group, and the
        // pattern nests it differently per size:
        //   "Small Pocket"      -> the piece group itself has clipped=true
        //   "XL"/"2XL Pocket"   -> clipped=false; the clip sits one level deeper
        //                          in an unnamed child group
        // Hosting on dupPocket unconditionally (what this used to do) therefore
        // dropped the Front's colour + design OUTSIDE the mask on XL/2XL, and they
        // exported as Front's full black body filling the entire artboard while
        // Small came out correct - exactly the symptom reported on that job.
        // Anchor on the outline's own parent chain instead, so the content follows
        // the mask wherever the pattern happens to nest it, at any size.
        var clipHost = null;
        for (var hostNode = pocketBaseShape.parent; hostNode; hostNode = hostNode.parent) {
            var hostIsClipped = false;
            try { hostIsClipped = (hostNode.typename === "GroupItem" && hostNode.clipped === true); } catch (eHostChk) {}
            if (hostIsClipped) { clipHost = hostNode; break; }
            if (hostNode === dupPocket) break; // never walk out of the piece itself
        }
        if (!clipHost) {
            // No designer-built clip anywhere around the outline - fall back to the
            // old behaviour, but say so instead of silently exporting a full-bleed
            // rectangle of the Front.
            clipHost = dupPocket;
            hoodieWarnings.push(sizeLabel + " Pocket: no clipping group found around the piece's outline - the Front design may export unclipped, check this piece.");
        }

        // THE MANUAL SOP, RUN AS THE ACTUAL MENU COMMAND (per explicit
        // instruction). By hand the operator selects the piece's already-clipped
        // label and hits Ctrl+B - Edit > Paste in Back - and the design lands
        // inside the piece's own clipping group, directly behind the label: one
        // clip (the pattern's), label and its background box untouched on top,
        // base colour intact. app.executeMenuCommand("pasteBack") IS that menu
        // item, so Illustrator resolves the clipping itself.
        //
        // Re-implementing Paste-in-Back through the DOM does NOT work here and
        // was measured on this pattern: moving the content BELOW the outline
        // comes out inverted (design renders OUTSIDE the pocket silhouette, the
        // outline's own white fill covers everything inside - 72% white instead
        // of 27%, all three sizes). Placing it ABOVE in its own clip group does
        // confine correctly, but then the label is buried and has to be dug back
        // out with bringPatternLabelsToFront's "is this small enough to be a
        // label" guesswork - that is the fallback below, not the first choice.
        // Verified side by side on the real pattern: pasteBack gave Small 26.9%
        // / XL 27.4% white WITH the tag visible; the DOM route gave the same
        // silhouette but no tag at all.
        var clipGroup = null, pastedBehindLabel = false;
        var labelAnchor = hoodiePocketBackmostLabel(clipHost, pocketBaseShape);
        if (labelAnchor) {
            var stageGroup = null;
            try {
                // One group holding exactly what Ctrl+B should paste: the
                // Front's finished base colour with its design on top.
                stageGroup = orderDoc.groupItems.add();
                stageGroup.name = "design_clip_group"; // the name is how we find it again after the paste
                frontState.baseShape.duplicate(stageGroup, ElementPlacement.PLACEATEND);
                frontState.pastedDesign.duplicate(stageGroup, ElementPlacement.PLACEATBEGINNING);

                app.activeDocument = orderDoc;
                orderDoc.selection = null;
                stageGroup.selected = true;
                app.executeMenuCommand("copy");
                orderDoc.selection = null;
                stageGroup.remove(); stageGroup = null;

                labelAnchor.selected = true;
                app.executeMenuCommand("pasteBack");
                // Find the paste BY NAME among the clipping group's direct
                // children - never by trusting orderDoc.selection. On a Small
                // pocket (label anchor is a GroupItem, not a TextFrame) the
                // selection comes back holding TWO items: the pasted group AND
                // the anchor itself, still selected. Reading selection[0] would
                // have grabbed the pattern's own tag group, and the reject path
                // would then have DELETED it.
                var nameHits = [];
                for (var ci = 0; ci < clipHost.pageItems.length; ci++) {
                    if ((clipHost.pageItems[ci].name || "") === "design_clip_group") nameHits.push(clipHost.pageItems[ci]);
                }
                if (nameHits.length === 1) {
                    clipGroup = nameHits[0];
                    pastedBehindLabel = true;
                    log("HOODIE: " + sizeLabel + " Pocket - design pasted behind the label (Paste in Back) inside the piece's clipping group" +
                        (clipHost === dupPocket ? " (piece group)" : " (nested group)") + ".");
                } else {
                    // Only ever remove what we ourselves pasted (matched by name).
                    for (var pd = 0; pd < nameHits.length; pd++) { try { nameHits[pd].remove(); } catch (ePr) {} }
                }
                orderDoc.selection = null;
            } catch (ePaste) {
                if (stageGroup) { try { stageGroup.remove(); } catch (eSg) {} }
                try { orderDoc.selection = null; } catch (eSel) {}
                hoodieWarnings.push(sizeLabel + " Pocket: Paste in Back failed (" + ePaste.message + ") - fell back to the scripted clip.");
            }
        }

        if (!clipGroup) {
            // FALLBACK: content on top in its own clip group, then the label
            // lifted back over it. Same finished stacking, reached without the
            // clipboard - used when there is no label to paste behind, or when
            // the menu command did not give back exactly what we expect.
            var clipShape, frontColorCopy, frontDesignCopy;
            try {
                clipShape = pocketBaseShape.duplicate(clipHost, ElementPlacement.PLACEATBEGINNING);
                frontColorCopy = frontState.baseShape.duplicate(clipHost, ElementPlacement.PLACEATBEGINNING);
                frontDesignCopy = frontState.pastedDesign.duplicate(clipHost, ElementPlacement.PLACEATBEGINNING);
            // PARM goes up to buildHoodiePieceWithRollback, which rebuilds this piece.
            } catch (eClipDup) {
                parmBail(eClipDup, "duplicating the Front design for the Pocket clip");
                hoodieWarnings.push(sizeLabel + " Pocket: could not duplicate Front's color/design for clipping - " + eClipDup.message); return;
            }
            clipGroup = clipHost.groupItems.add();
            clipGroup.name = "design_clip_group";
            frontColorCopy.moveToBeginning(clipGroup);
            frontDesignCopy.moveToBeginning(clipGroup);
            clipShape.moveToBeginning(clipGroup); // topmost - acts as the clip mask
            clipGroup.moveToBeginning(clipHost);  // inside the group that carries the mask
            if (clipGroup.pageItems.length >= 2) {
                try {
                    clipGroup.clipped = true;
                    log("HOODIE: " + sizeLabel + " Pocket - design hosted in the piece's clipping group" +
                        (clipHost === dupPocket ? " (piece group)" : " (nested group)") + " [fallback, no Paste in Back].");
                // PARM goes up to buildHoodiePieceWithRollback, which rebuilds this piece.
                } catch (eClip) {
                    parmBail(eClip, "the Pocket clip");
                    hoodieWarnings.push(sizeLabel + " Pocket: clip failed - " + eClip.message);
                }
            } else {
                hoodieWarnings.push(sizeLabel + " Pocket: clip group had too few items - design left unclipped.");
            }
        }
        // Reading .visibleBounds straight after re-parenting artwork into a
        // clipping group in a busy orderDoc can report stale bounds (the
        // un-clipped extent of the largest child - here frontColorCopy, which is
        // Front's FULL body silhouette) instead of the true clipped-down pocket
        // size - same trap documented in pmPeekFullButtonScale above (a real job
        // once got a wildly wrong measurement this exact way). Force a redraw
        // before anything below reads bounds off pocketFinal.
        try { app.redraw(); } catch (eRdPocket) {}

        // clipGroup is already nested inside dupPocket (on top, inside the
        // piece's own clipping group) - no separate wrapper group needed.
        var pocketFinal = dupPocket;

        // Relocate the finished Pocket into the normal row-flow (own
        // artboard, exported), same mechanics as Outside/Inside Hood above.
        //
        // NOT pocketFinal.visibleBounds here - reading bounds through the
        // just-clipped group can still report the pre-clip extent of its
        // largest duplicated child (frontColorCopy = Front's FULL body
        // silhouette) even after redraw, on a real job (confirmed: exported
        // artboard came out shoulder-to-hem tall, matching Front's height,
        // with the actual pocket-shaped design sitting in a fraction of it -
        // same trap the comment above already warns about, redraw alone
        // didn't fully cover it). pocketBaseShape is a plain, never-clipped
        // PathItem, so its own bounds are always exactly the true pocket
        // outline. Combined with any tag TextFrames outside the clip group
        // (so the size tag still ships with the export, per instruction) -
        // clipGroup itself is deliberately never measured.
        var tagFrames = [];
        pmCollectTextFrames(dupPocket, clipGroup, tagFrames);
        var fb = pmCombinedBounds([pocketBaseShape].concat(tagFrames));
        var fw = Math.abs(fb[2] - fb[0]), fh = Math.abs(fb[1] - fb[3]);

        // PATTERN SIZE TAG - fallback path only. Paste in Back already put the
        // design BEHIND the tag, so on that path there is nothing to rescue and
        // this must not run (the pasted group carries no clip mask of its own,
        // so the helper would wedge the tag in between the design and the base
        // colour). On the fallback path the design went on TOP of the piece and
        // buried the tag, which is why the Pocket used to export with no tag at
        // all while Front/Back/Sleeve/Rib & Cuff all showed theirs - only the
        // main per-item loop calls this helper (search
        // "bringPatternLabelsToFront(pastedPattern"), never the hoodie builders.
        // Runs AFTER fb is measured above, so the artboard is still sized on the
        // tag's original placement - the call only re-orders z, never moves art.
        // Passing clipHost (not dupPocket) on purpose: the helper looks for
        // 'design_clip_group' among its container's DIRECT children only, and on
        // XL/2XL that group lives one level deeper (see clipHost above). With
        // clipHost it finds the clip group at every size and routes the tag just
        // under the clip mask - above the design, still clipped to the pocket
        // silhouette - instead of dumping it at the document root.
        if (!pastedBehindLabel) bringPatternLabelsToFront(clipHost, clipHost, pocketBaseShape);
        pocketFinal.translate(currentX - fb[0], currentY - fb[1]);
        var instanceName = sizeLabel + " Pocket";
        pocketFinal.name = instanceName;
        artboardCount++;
        var finalRect = [currentX, currentY, currentX + fw, currentY - fh];
        var ab = orderDoc.artboards.add(finalRect);
        ab.artboardRect = finalRect; ab.name = instanceName;
        queueExport( orderDoc.artboards.length - 1, exportFolderFor(sizeLabel), instanceName, sizeLabel);
        currentX += fw + refContext.spacing;
        if (fh > rowMaxHeight) rowMaxHeight = fh;
        if (currentX > 7500) { currentX = -7500; currentY -= (rowMaxHeight + refContext.vSpacing); rowMaxHeight = 0; }
        log("HOODIE: " + instanceName + " built and exported.");
    }

    // Top-level HOODIE orchestrator, called once per size that had a Front
    // processed by the main loop (see hoodieFrontBySize caching above).
    function buildHoodieExtras(sizeLabel, frontState) {
        var hoodGroup = findAnywhere(patternDoc, sizeLabel + " Hood");
        if (!hoodGroup) {
            hoodieWarnings.push(sizeLabel + ": no 'Hood' group found in pattern - Outside/Inside Hood skipped.");
        } else {
            // INSIDE FIRST, per explicit instruction: the two stack (HOOD-PAIR
            // in hoodieBuildVariant) and the Outside Hood is the one that must
            // end up 5mm BELOW, so Inside has to be the one placed first and
            // become the anchor. Swapping these two lines swaps which hood is
            // on top - nothing else depends on the order.
            // Each piece gets its OWN rollback, so a PARM on the Outside Hood
            // cannot cost the Inside Hood that was already built cleanly.
            buildHoodiePieceWithRollback(sizeLabel, "Inside Hood", function () {
                hoodieBuildVariant(hoodGroup, sizeLabel, false, "Inside");
            });
            buildHoodiePieceWithRollback(sizeLabel, "Outside Hood", function () {
                hoodieBuildVariant(hoodGroup, sizeLabel, true, "Outside");
            });
        }

        var borderPiece = findAnywhere(patternDoc, sizeLabel + " Border");
        if (!borderPiece) {
            hoodieWarnings.push(sizeLabel + ": no 'Border' group found in pattern - Border skipped.");
        } else {
            buildHoodiePieceWithRollback(sizeLabel, "Border", function () {
                hoodieBuildBorder(borderPiece, sizeLabel, frontState);
            });
        }

        var pocketPiece = findAnywhere(patternDoc, sizeLabel + " Pocket");
        if (!pocketPiece) {
            hoodieWarnings.push(sizeLabel + ": no 'Pocket' group found in pattern - Pocket skipped.");
        } else {
            buildHoodiePieceWithRollback(sizeLabel, "Pocket", function () {
                hoodieBuildPocket(pocketPiece, sizeLabel, frontState);
            });
        }
    }
}
runAutomation();