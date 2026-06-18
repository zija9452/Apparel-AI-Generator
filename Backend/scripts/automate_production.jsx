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

        var logFile = new File(outputDir + "/debug_log.txt");
        logFile.open("w");
        function log(msg) { logFile.writeln(new Date().toTimeString() + ": " + msg); }
        
        updateStatus("Automation started", 40, false);
        log("Automation started");
        
        var mockupDoc = app.open(new File(mockupPath));
        log("Mockup opened");

        // --- NEW: Mockup Swatch Isolation (Name-only) ---
        try {
            // 1. Rename ALL swatches in the mockup to prevent naming collisions
            // We keep them as SPOT colors so we can still track them by name for relinking.
            for (var s = mockupDoc.swatches.length - 1; s >= 0; s--) {
                var sw = mockupDoc.swatches[s];
                if (sw.name !== "[None]" && sw.name !== "[Registration]" && sw.name.indexOf("MOCK_") !== 0) {
                    try { sw.name = "MOCK_" + sw.name; } catch(e) {}
                }
            }
            log("All Mockup swatches isolated with 'MOCK_' prefix (Spot identity preserved).");
        } catch(e) { log("Isolation Warning: " + e.message); }

        var refContext = { spacing: 500 };
        if (typeof referencePath !== 'undefined' && referencePath !== null) {
            var refFile = new File(referencePath);
            if (refFile.exists) {
                var refDoc = app.open(refFile);
                if (refDoc.artboards.length > 1) {
                    refContext.spacing = Math.abs(refDoc.artboards[1].artboardRect[0] - refDoc.artboards[0].artboardRect[2]);
                    log("Reference spacing detected: " + refContext.spacing);
                }
                refDoc.close(SaveOptions.DONOTSAVECHANGES);
            }
        }

        updateStatus("Creating new Order file...", 45, false);
        var orderDoc = app.documents.add(DocumentColorSpace.CMYK); 
        log("New Order document created (CMYK)");

        // 0. CLEAN SLATE: Delete all default swatches to avoid confusion
        for (var i = orderDoc.swatches.length - 1; i >= 0; i--) {
            var s = orderDoc.swatches[i];
            if (s.name !== "[None]" && s.name !== "[Registration]") {
                try { s.remove(); } catch(e) {}
            }
        }
        log("Swatch panel cleared of default colors.");

        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        // 1. PRE-FLIGHT COLOR DETECTION (Smart Swatch & Object Lookup)
        var mockupSourceRGB = null; 
        try {
            var detected = { c: 0, m: 0, y: 0, k: 0 };
            var colorFound = false;

            // Strategy A: Direct Swatch Lookup
            try {
                var mockupSwatch = mockupDoc.swatches.getByName("base-color");
                if (mockupSwatch) {
                    var sc = (mockupSwatch.typename === "Spot") ? mockupSwatch.color : mockupSwatch.color;
                    if (sc.typename === "RGBColor") {
                        mockupSourceRGB = { r: Math.round(sc.red), g: Math.round(sc.green), b: Math.round(sc.blue) };
                        detected = rgbToCmyk(sc);
                    } else if (sc.typename === "CMYKColor") {
                        detected = { c: sc.cyan, m: sc.magenta, y: sc.yellow, k: sc.black };
                    }
                    colorFound = true;
                    log("Base color detected directly from Mockup Swatch panel.");
                }
            } catch(e) {}

            // Strategy B: Object Lookup (Fallback)
            if (!colorFound) {
                var sampleFront = findAnywhere(mockupDoc, "Front") || findAnywhere(mockupDoc, "Front View") || findAnywhere(mockupDoc, "front");
                if (sampleFront) {
                    var samplePath = findPlacementPath(sampleFront);
                    if (samplePath && samplePath.filled) {
                        var fc = samplePath.fillColor;
                        if (fc.typename === "RGBColor") {
                            mockupSourceRGB = { r: Math.round(fc.red), g: Math.round(fc.green), b: Math.round(fc.blue) };
                            detected = rgbToCmyk(fc);
                        }
                        else if (fc.typename === "CMYKColor") { detected.c = fc.cyan; detected.m = fc.magenta; detected.y = fc.yellow; detected.k = fc.black; }
                        colorFound = true;
                        log("Base color detected from 'Front' object.");
                    }
                }
            }
            
            if (colorFound) updateSwatchToCMYK(orderDoc, "base-color", detected);
            if (mockupSourceRGB) log("Mockup Source RGB Captured: R:" + mockupSourceRGB.r + " G:" + mockupSourceRGB.g + " B:" + mockupSourceRGB.b);

        } catch (ePre) { log("Pre-flight color detection failed: " + ePre.message); }

        // 2. APPLY EXCEL COLOR MAPPING (The 'Replacement' Logic)
        // If Excel says 'Red' should be CMYK(0,100,100,0), we update the global swatch
        if (plan.color_mapping && plan.color_mapping.length > 0) {
            log("Applying Excel Color Overrides/Replacements...");
            for (var c = 0; c < plan.color_mapping.length; c++) {
                var entry = plan.color_mapping[c];
                if (entry.color && typeof entry.color.c !== 'undefined') {
                    // This updates the 'Global Swatch' in the Order doc.
                    // Any object in the design that used this swatch name will now use the Excel CMYK value.
                    updateSwatchToCMYK(orderDoc, entry.swatch_name, entry.color);
                }
            }
        }

        // 3. CAPTURE FINAL BASE COLOR REFERENCE
        var finalBaseColor = null;
        try {
            finalBaseColor = orderDoc.swatches.getByName("base-color").color;
            log("Global base color linked to swatch.");
        } catch (eFinal) { 
            if (orderDoc.swatches.length > 0) finalBaseColor = orderDoc.swatches[0].color;
            log("WARNING: base-color swatch not found, using first available.");
        }

        var margin = 500, currentX = -7500, currentY = 8000, artboardCount = 0, rowMaxHeight = 0;

        // Calculate total items for progress reporting
        var totalItems = 0;
        for (var pi = 0; pi < plan.production_groups.length; pi++) {
            totalItems += plan.production_groups[pi].items.length;
        }
        var itemsProcessed = 0;

        for (var i = 0; i < plan.production_groups.length; i++) {
            var group = plan.production_groups[i];
            var sizeLabel = getFriendlySize(group.size);

            for (var j = 0; j < group.items.length; j++) {
                var item = group.items[j];
                var quantity = item.quantity || 1;
                
                itemsProcessed++;
                var currentProgress = 50 + Math.floor((itemsProcessed / totalItems) * 40);
                updateStatus("Rendering " + sizeLabel + " " + item.part_name + "...", currentProgress, false);

                var partMap = {
                    "front": "Front", "back": "Back", "neck": "Neck",
                    "sleeve-long": "Long Sleeve", "sleeve_long": "Long Sleeve",
                    "sleeve-short": "Short Sleeve", "sleeve_short": "Short Sleeve",
                    "sleeve": "Short Sleeve", "sleeve-half": "Short Sleeve", "sleeve_half": "Short Sleeve",
                    "sleeve-right": "Right Sleeve", "sleeve_right": "Right Sleeve",
                    "sleeve-left": "Left Sleeve", "sleeve_left": "Left Sleeve",
                    "cuff": "Rib & Cuff", "twill-tape": "Twill Tape", "twill_tape": "Twill Tape", "tukdi": "Tukdi"
                };
                var partLabel = partMap[item.part_name] || item.part_name;

                if (item.part_name === "sleeve") {
                    if (findAnywhere(patternDoc, sizeLabel + " Short Sleeve")) partLabel = "Short Sleeve";
                    else if (findAnywhere(patternDoc, sizeLabel + " Long Sleeve")) partLabel = "Long Sleeve";
                    else if (findAnywhere(patternDoc, sizeLabel + " Sleeve")) partLabel = "Sleeve";
                }

                var isAcc = isAccessory(item.part_name);
                var targetGroupName = (isAcc || sizeLabel === "Universal") ? partLabel : (sizeLabel + " " + partLabel);
                
                log("--- START PROCESSING PART: " + targetGroupName + " ---");
                log("Job ID: " + (typeof jobId !== 'undefined' ? jobId : "N/A") + " | Part: " + item.part_name + " | Qty: " + quantity);
                
                var patternObj = findAnywhere(patternDoc, targetGroupName);
                if (!patternObj) {
                    log("CRITICAL: Could not find '" + targetGroupName + "' in Master Pattern document. Skipping.");
                }

                if (patternObj) {
                    log("Found '" + targetGroupName + "' in Pattern.");
                    var masterProcessed = null;

                    for (var q = 0; q < quantity; q++) {
                        var instanceName = targetGroupName + "_Item" + (j + 1);
                        if (quantity > 1) instanceName += "_Qty" + (q + 1);
                        
                        log("Creating Instance: " + instanceName);
                        var pWidth = 1000, pHeight = 1000; 

                        try {
                            artboardCount++;
                            var pastedPattern;
                            if (isAcc && masterProcessed) {
                                log("Using previously processed accessory master for " + instanceName);
                                pastedPattern = masterProcessed.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                            } else {
                                log("Duplicating pattern object to Order document...");
                                pastedPattern = patternObj.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                            }

                            var bounds = pastedPattern.visibleBounds;
                            pWidth = Math.abs(bounds[2] - bounds[0]); pHeight = Math.abs(bounds[1] - bounds[3]);
                            pastedPattern.left = currentX; pastedPattern.top = currentY;
                            log("Placed pattern at X:" + Math.round(currentX) + " Y:" + Math.round(currentY) + " (Size: " + Math.round(pWidth) + "x" + Math.round(pHeight) + ")");
                            
                            var finalRect = [currentX, currentY, currentX + pWidth, currentY - pHeight];
                            var ab = (artboardCount === 1 && orderDoc.artboards.length === 1) ? orderDoc.artboards[0] : orderDoc.artboards.add(finalRect);
                            ab.artboardRect = finalRect; ab.name = instanceName;

                            if (!(isAcc && masterProcessed)) {
                                log("Searching for 'Placement Path' (the main shape) in " + targetGroupName);
                                var baseShape = findPlacementPath(pastedPattern);
                                if (baseShape) {
                                    log("Placement Path found: " + (baseShape.name || "Unnamed Path"));
                                    // Use the globally captured color
                                    baseShape.fillColor = finalBaseColor;
                                    baseShape.filled = true;
                                    log("Panel base filled with global color.");

                                    var hasPers = (item.text_replacements && item.text_replacements.length > 0);
                                    log("Searching for source design in Mockup for: " + item.part_name);
                                    var sourceDesign = getSourceView(item.part_name, mockupDoc, hasPers);
                                    
                                    var nPartName = item.part_name.toLowerCase();
                                    var isNeck = (nPartName === "neck" || nPartName === "collar" || nPartName === "rib");
                                    var isSleeve = (nPartName.indexOf("sleeve") !== -1);
                                    
                                    if (sourceDesign && !isAcc) {
                                        log("MATCH FOUND in Mockup: " + (sourceDesign.name || "Layer/Group"));
                                        var pastedDesign = null;
                                        try {
                                            if (sourceDesign.typename === "Layer") {
                                                log("Source is a Layer. Grouping all items...");
                                                pastedDesign = orderDoc.groupItems.add();
                                                for (var l = sourceDesign.pageItems.length - 1; l >= 0; l--) sourceDesign.pageItems[l].duplicate(pastedDesign, ElementPlacement.PLACEATBEGINNING);
                                            } else {
                                                log("Duplicating source design object...");
                                                pastedDesign = sourceDesign.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                                            }
                                        } catch (eDup) { log("Duplication failed: " + eDup.message); }

                                        if (pastedDesign) {
                                            log("Design pasted into Order doc. Starting alignment/cleanup.");
                                            mergeAndCleanupSwatches(orderDoc, pastedDesign);
                                            if (pastedDesign.typename !== "GroupItem") {
                                                var wrapper = orderDoc.groupItems.add(); pastedDesign.moveToBeginning(wrapper); pastedDesign = wrapper;
                                            }
                                            
                                            // log("Checking for 'Loose Logos' that might overlap with this part in Mockup...");
                                            // attachLooseLogos(sourceDesign, pastedDesign);
                                            
                                            if (isSleeve) {
                                                log("Sleeve detected. Rotating design -73 degrees for alignment.");
                                                pastedDesign.rotate(-73); 
                                            }
                                            
                                            clearAllStrokes(pastedDesign);
                                            
                                            if (hasPers) {
                                                log("Applying Text Replacements (Name/Number)...");
                                                applyTextReplacements(pastedDesign, item.text_replacements);
                                            }

                                            if (isNeck) {
                                                log("Applying Color Sensing Sandwich Logic for Neck/Rib");
                                                var mm = 2.83465, margin = 7 * mm;
                                                var colors = [];
                                                function getColors(container) {
                                                    for (var c = 0; c < container.pageItems.length; c++) {
                                                        var it = container.pageItems[c];
                                                        if (it.typename === "PathItem" && it.filled) colors.push({color: it.fillColor, y: it.top});
                                                        else if (it.typename === "GroupItem") getColors(it);
                                                    }
                                                }
                                                getColors(pastedDesign);
                                                colors.sort(function(a, b) { return b.y - a.y; });
                                                var topColor = (colors.length > 0) ? colors[0].color : finalBaseColor;
                                                var secondColor = topColor;
                                                for (var ci = 1; ci < colors.length; ci++) { if (colors[ci].color !== topColor) { secondColor = colors[ci].color; break; } }
                                                var pW = baseShape.width + (margin * 2), pH = baseShape.height + (margin * 2), pL = baseShape.left - margin, pT = baseShape.top + margin, innerH = baseShape.height;
                                                var neckGroup = orderDoc.groupItems.add();
                                                var s1 = neckGroup.pathItems.rectangle(pT, pL, pW, margin + (innerH * 0.5));
                                                s1.filled = true; s1.fillColor = topColor; s1.stroked = false;
                                                var s2 = neckGroup.pathItems.rectangle(pT - (margin + (innerH * 0.5)), pL, pW, innerH * 0.5);
                                                s2.filled = true; s2.fillColor = secondColor; s2.stroked = false;
                                                var s3 = neckGroup.pathItems.rectangle(pT - (margin + innerH), pL, pW, margin);
                                                s3.filled = true; s3.fillColor = topColor; s3.stroked = false;
                                                pastedDesign.remove(); pastedDesign = neckGroup;
                                                log("Sandwich logic completed.");
                                            } else {
                                                var useFrontBackLogic = (item.part_name === "front" || item.part_name === "back" || isSleeve);
                                                log("Calculating Alignment & Scaling...");
                                                var designBasePath = findPlacementPath(pastedDesign, true);
                                                if (designBasePath) {
                                                    log("Aligning using first path reference.");
                                                    alignAndScale(pastedDesign, baseShape, useFrontBackLogic, isSleeve, isNeck, designBasePath);
                                                    releaseInternalClippingMasks(pastedDesign);
                                                    
                                                    // NEW: Only remove items explicitly named "base-path"
                                                    log("Checking for 'base-path' in " + item.part_name + " for removal...");
                                                    var removedCount = 0;
                                                    function removeBasePaths(container) {
                                                        for (var r = container.pageItems.length - 1; r >= 0; r--) {
                                                            var it = container.pageItems[r];
                                                            var itName = (it.name || "").toLowerCase();
                                                            if (itName === "base-path" || itName === "base_path" || itName === "basepath") {
                                                                try { 
                                                                    log("   - Success: Removing '" + it.name + "' from " + item.part_name);
                                                                    it.remove(); 
                                                                    removedCount++;
                                                                } catch(e) { log("   - Removal Error: " + e.message); }
                                                            } else if (it.typename === "GroupItem") {
                                                                removeBasePaths(it);
                                                            }
                                                        }
                                                    }
                                                    removeBasePaths(pastedDesign);
                                                    if (removedCount === 0) log("   - Note: No 'base-path' found to remove in " + item.part_name);
                                                    else log("   - Total removed from " + item.part_name + ": " + removedCount);
                                                } else {
                                                    log("No base path found in design. Using bounds-based alignment.");
                                                    alignAndScale(pastedDesign, baseShape, useFrontBackLogic, isSleeve, isNeck);
                                                }

                                                if (isSleeve) {
                                                    log("Organizing Sleeve Bottom/Cuff design...");
                                                    var mm = 2.83465, ribTotalHeight = 63.5 * mm, ribInsideHeight = 50.8 * mm, sideMargin = 7 * mm;
                                                    var dBounds = pastedDesign.visibleBounds, dWidth = Math.abs(dBounds[2] - dBounds[0]), dHeight = Math.abs(dBounds[1] - dBounds[3]);
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
                                                            var rp = ribPaths[p];
                                                            rp.width = baseShape.width + (sideMargin * 2); rp.height = ribTotalHeight;
                                                            rp.left = baseShape.left - sideMargin; rp.top = patternBottom + ribInsideHeight;
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            log("Finalizing Design Layering (Logos to Front)...");
                                            bringLogosToFront(pastedDesign);
                                            
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
                                                    clipMask.move(clipGroup, ElementPlacement.PLACEATBEGINNING