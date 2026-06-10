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
                                                    clipMask.move(clipGroup, ElementPlacement.PLACEATBEGINNING); pastedDesign.move(clipGroup, ElementPlacement.PLACEATEND);
                                                    if (clipGroup.pageItems.length >= 2) {
                                                        clipGroup.clipped = true;
                                                        log("Success: Clipping mask active.");
                                                    }
                                                } catch (eClip) { log("Clipping setup failed: " + eClip.message); }
                                            }
                                        } else {
                                            log("WARNING: Could not paste source design for " + item.part_name);
                                        }
                                    } else {
                                        if (!isAcc) log("SKIP: No matching design found in mockup for " + item.part_name);
                                    }
                                    
                                    if (isAcc) {
                                        log("Accessory Processing: " + item.part_name);
                                        var accColor = finalBaseColor;
                                        
                                        // Dynamic Color Detection for Accessories
                                        try {
                                            var mockupAcc = findAnywhere(mockupDoc, item.part_name);
                                            if (mockupAcc) {
                                                var accPath = findPlacementPath(mockupAcc);
                                                if (accPath && accPath.filled) {
                                                    var rawColor = accPath.fillColor;
                                                    if (rawColor.typename === "SpotColor") {
                                                        var spotName = rawColor.spot.name.replace(/^MOCK_/, "");
                                                        try {
                                                            accColor = orderDoc.swatches.getByName(spotName).color;
                                                            log("Accessory: Matched Excel/Global swatch '" + spotName + "'");
                                                        } catch(e) {
                                                            // Auto-convert if swatch not in order doc
                                                            var cmyk = (rawColor.spot.color.typename === "RGBColor") ? rgbToCmyk(rawColor.spot.color) : rawColor.spot.color;
                                                            accColor = cmyk;
                                                            log("Accessory: Swatch '" + spotName + "' not in Excel, auto-converted to CMYK.");
                                                        }
                                                    } else if (rawColor.typename === "RGBColor") {
                                                        accColor = rgbToCmyk(rawColor);
                                                        log("Accessory: Raw RGB detected, auto-converted to CMYK.");
                                                    }
                                                }
                                            }
                                        } catch(eAcc) { log("Accessory Color Detection Warning: " + eAcc.message); }

                                        baseShape.fillColor = accColor;
                                        baseShape.filled = true;
                                        ensureBlackStrokes(pastedPattern);
                                        log("Accessory base filled with detected color.");
                                        masterProcessed = pastedPattern;
                                    }
                                } else {
                                    log("WARNING: No Placement Path found in " + targetGroupName);
                                }
                            }

                            if (isNeck && baseShape) smartContrast(pastedPattern, baseShape.fillColor);
                            bringPatternLabelsToFront(pastedPattern, orderDoc); 
                        } catch (eInstance) { log("Error in instance: " + instanceName + " -> " + eInstance.message); }

                        log("Exporting JPG for instance: " + instanceName);
                        exportResult(orderDoc, artboardCount - 1, outputDir, instanceName);
                        log("--- FINISHED " + instanceName + " ---\n");
                        
                        currentX += pWidth + refContext.spacing;
                        if (pHeight > rowMaxHeight) rowMaxHeight = pHeight;
                        if (currentX > 7500) { currentX = -8000; currentY -= (rowMaxHeight + refContext.spacing); rowMaxHeight = 0; }
                    }
                } else log("WARNING: Could not find: " + targetGroupName);

            }
        }
        
        updateStatus("Saving AI file...", 95, false);
        log("Attempting to save final AI file...");
        try {
            var saveFile = new File(outputDir + "/production_ready_order.ai");
            if (saveFile.exists) {
                try { saveFile.remove(); } catch(e) { log("Note: Could not remove existing file, saveAs will overwrite."); }
            }
            orderDoc.saveAs(saveFile, new IllustratorSaveOptions());
            log("AI file saved successfully.");
        } catch (eSave) {
            log("SAVE ERROR: " + eSave.message);
        }

        try {
            if (orderDoc) { orderDoc.close(SaveOptions.DONOTSAVECHANGES); log("Order doc closed."); }
            if (mockupDoc) { mockupDoc.close(SaveOptions.DONOTSAVECHANGES); log("Mockup doc closed."); }
        } catch (eClose) {
            log("CLOSE ERROR: " + eClose.message);
        }

        updateStatus("Production Ready", 100, true); 
        log("Production Ready at: " + new Date().toTimeString());
        logFile.close();
    } catch (e) {
        if (typeof logFile !== 'undefined' && logFile.close) {
            log("CRITICAL JSX ERROR: " + e.message + " (Line: " + e.line + ")");
            try { logFile.close(); } catch(eL) {}
        }
        var errLog = new File(outputDir + "/error_log.txt");
        errLog.open("w"); errLog.write("JSX Error: " + e.message + "\nLine: " + e.line); errLog.close();
    }

    // --- HELPER FUNCTIONS ---
    function updateSwatchToCMYK(doc, name, cmyk) {
        try {
            var targetName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
            var s = null;
            for (var i = 0; i < doc.spots.length; i++) {
                if (doc.spots[i].name.toLowerCase().replace(/[^a-z0-9]/g, "") === targetName) {
                    s = doc.spots[i]; break;
                }
            }
            if (!s) {
                s = doc.spots.add();
                s.name = name;
            }
            s.colorType = ColorModel.SPOT;
            var newColor = new CMYKColor();
            newColor.cyan = Math.round(parseFloat(cmyk.c) * 100) / 100;
            newColor.magenta = Math.round(parseFloat(cmyk.m) * 100) / 100;
            newColor.yellow = Math.round(parseFloat(cmyk.y) * 100) / 100;
            newColor.black = Math.round(parseFloat(cmyk.k) * 100) / 100;
            s.color = newColor;
            log("GLOBAL CMYK SWATCH: '" + s.name + "' is now active and linked.");
        } catch (err) { log("ERROR in Global Swatch: " + err.message); }
    }

    function mergeAndCleanupSwatches(doc, targetContainer) {
        try {
            var officialSpots = {};
            for (var i = 0; i < doc.spots.length; i++) {
                var sn = doc.spots[i].name;
                officialSpots[sn.toLowerCase().replace(/[^a-z0-9]/g, "")] = doc.spots[i];
            }
            
            // NEW: Build a map of what 'Excel-mapped colors' look like in the Mockup (RGB)
            var mockupColorMap = {};
            try {
                if (typeof mockupDoc !== 'undefined' && mockupDoc && mockupDoc.swatches) {
                    for (var j = 0; j < mockupDoc.swatches.length; j++) {
                        var sw = mockupDoc.swatches[j];
                        var swName = sw.name.toLowerCase().replace(/[^a-z0-9]/g, "");
                        if (officialSpots[swName]) {
                            var scObj = (sw.typename === "Spot") ? sw.color : sw.color;
                            if (scObj.typename === "RGBColor") {
                                mockupColorMap[swName] = { r: Math.round(scObj.red), g: Math.round(scObj.green), b: Math.round(scObj.blue) };
                            }
                        }
                    }
                }
            } catch(eMap) { log("Color Map Warning: " + eMap.message); }

            function deepReLink(container) {
                var items = (container.pageItems) ? container.pageItems : [container];
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    if (it.typename === "GroupItem") deepReLink(it);
                    else if (it.typename === "PathItem" || it.typename === "CompoundPathItem" || it.typename === "TextFrame") {
                        applySpot(it, "fillColor");
                        applySpot(it, "strokeColor");
                    }
                }
            }

            function applySpot(obj, prop) {
                try {
                    var colorObj;
                    if (obj.typename === "TextFrame") {
                        if (prop === "fillColor") colorObj = obj.textRange.characterAttributes.fillColor;
                        else if (prop === "strokeColor") colorObj = obj.textRange.characterAttributes.strokeColor;
                    } else {
                        colorObj = obj[prop];
                    }
                    
                    if (!colorObj) return;

                    // Support for Nested Color processing (for Gradients)
                    function processSubColor(c) {
                        if (!c) return null;
                        
                        // CASE 1: Direct Spot Swatch Match (Best Case)
                        if (c.typename === "SpotColor") {
                            var rawName = c.spot.name;
                            var cleanName = rawName.replace(/^MOCK_/, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^mock/, ""); 
                            
                            log("Checking Spot: '" + rawName + "' -> Cleaned: '" + cleanName + "'");
                            
                            if (officialSpots[cleanName]) {
                                var sc = new SpotColor(); 
                                sc.spot = officialSpots[cleanName];
                                log(">>> MATCH: Linked '" + rawName + "' to Excel Swatch '" + officialSpots[cleanName].name + "'");
                                return sc;
                            } else {
                                log("No match for '" + cleanName + "' in Excel spots.");
                            }
                        }                         
                        // CASE 2: Smart Excel/Mockup Linkage (Match by detected RGB values)
                        else if (c.typename === "RGBColor") {
                            var cr = Math.round(c.red), cg = Math.round(c.green), cb = Math.round(c.blue);
                            
                            // Check against all registered Excel colors found in mockup
                            for (var mName in mockupColorMap) {
                                var target = mockupColorMap[mName];
                                if (Math.abs(cr - target.r) < 3 && Math.abs(cg - target.g) < 3 && Math.abs(cb - target.b) < 3) {
                                    var sc2 = new SpotColor();
                                    sc2.spot = officialSpots[mName];
                                    log("Smart Link: Match found for '" + mName + "' using RGB sensing.");
                                    return sc2;
                                }
                            }

                            // Fallback to Base Color if it matches mockupSourceRGB
                            if (mockupSourceRGB) {
                                if (Math.abs(cr - mockupSourceRGB.r) < 3 && Math.abs(cg - mockupSourceRGB.g) < 3 && Math.abs(cb - mockupSourceRGB.b) < 3) {
                                    var scBase = new SpotColor(); scBase.spot = doc.spots.getByName("base-color");
                                    return scBase;
                                }
                            }
                        }
                        return null;
                    }

                    // A: SOLID COLORS
                    var updated = processSubColor(colorObj);
                    if (updated) {
                        if (obj.typename === "TextFrame") {
                            if (prop === "fillColor") obj.textRange.characterAttributes.fillColor = updated;
                            else if (prop === "strokeColor") obj.textRange.characterAttributes.strokeColor = updated;
                        }
                        else obj[prop] = updated;
                    }
                    
                    // B: GRADIENT COLORS (Deep Scan)
                    else if (colorObj.typename === "GradientColor") {
                        var stops = colorObj.gradient.gradientStops;
                        for (var s = 0; s < stops.length; s++) {
                            var stopUpdated = processSubColor(stops[s].color);
                            if (stopUpdated) stops[s].color = stopUpdated;
                        }
                    }
                } catch(e) {}
            }
            
            deepReLink(targetContainer || doc);
            
            for (var d = doc.swatches.length - 1; d >= 0; d--) {
                var dName = doc.swatches[d].name.toLowerCase().replace(/[^a-z0-9]/g, "");
                var cName = dName.replace(/^mock/, "");
                for (var key in officialSpots) {
                    if (cName.indexOf(key) === 0 && dName !== key) {
                        try { doc.swatches[d].remove(); } catch(e) {}
                        break;
                    }
                }
            }
        } catch (eMerge) { log("Merge Error: " + eMerge.message); }
    }

    function bringPatternLabelsToFront(container, targetParent) {
        try {
            if (!container || container.typename !== "GroupItem") return;
            var dest = targetParent || container;
            var sizePatterns = ["small", "medium", "large", "xl", "2xl", "3xl", "extra", "size", "front", "back", "sleeve", "neck", "label"];
            function processRecursive(parent) {
                if (!parent.pageItems || parent.pageItems.length === 0) return;
                for (var i = parent.pageItems.length - 1; i >= 0; i--) {
                    var it = parent.pageItems[i];
                    var iName = (it.name || "").toLowerCase();
                    var isLabel = (it.typename === "TextFrame");
                    if (!isLabel) { for (var n = 0; n < sizePatterns.length; n++) if (iName.indexOf(sizePatterns[n]) !== -1) { isLabel = true; break; } }
                    if (!isLabel && it.typename === "GroupItem") { try { if (it.textFrames && it.textFrames.length > 0) isLabel = true; } catch(e) {} }
                    if (isLabel) { try { it.move(dest, ElementPlacement.PLACEATBEGINNING); it.zOrder(ZOrderMethod.BRINGTOFRONT); } catch(e) {} }
                    else if (it.typename === "GroupItem") { if (it.name !== "design_clip_group") processRecursive(it); }
                }
            }
            processRecursive(container);
        } catch (e) {}
    }

    function releaseInternalClippingMasks(group) {
        try {
            if (!group || group.typename !== "GroupItem") return;
            for (var i = group.pageItems.length - 1; i >= 0; i--) {
                var it = group.pageItems[i];
                if (it.typename === "GroupItem") { if (it.clipped) it.clipped = false; releaseInternalClippingMasks(it); }
            }
        } catch (e) {}
    }

    function findAnywhere(container, name) {
        if (!container || !name) return null;
        var sName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        function search(items, depth) {
            if (!items || items.length === 0 || depth > 3) return null;
            for (var i = 0; i < items.length; i++) {
                if ((items[i].name || "").toLowerCase().replace(/[^a-z0-9]/g, "") === sName) return items[i];
            }
            for (var i = 0; i < items.length; i++) {
                var found = null;
                try {
                    if (items[i].typename === "GroupItem") found = search(items[i].pageItems, depth + 1);
                    else if (items[i].typename === "Layer") found = search(items[i].layers, depth + 1) || search(items[i].pageItems, depth + 1);
                } catch (e) {}
                if (found) return found;
            }
            return null;
        }
        return search(container.layers ? container.layers : [container], 0);
    }

    function alignAndScale(obj, target, alignBottom, isSleeve, isNeck, referenceItem) {
        try {
            var mm = 2.83465, margin7 = 7 * mm, margin1Inch = 25.4 * mm;
            var tB = target.visibleBounds;
            var mBottom = (alignBottom || isSleeve) ? margin1Inch : margin7;
            var safeTop = tB[1] - margin7, safeBottom = tB[3] + mBottom, safeLeft = tB[0] + margin7, safeRight = tB[2] - margin7;
            var availableW = Math.abs(safeRight - safeLeft), availableH = Math.abs(safeTop - safeBottom);
            var targetCenterX = safeLeft + (availableW / 2), targetCenterY = safeTop - (availableH / 2);
            var ref = referenceItem || obj, oB = ref.visibleBounds, oW = Math.abs(oB[2] - oB[0]), oH = Math.abs(oB[1] - oB[3]);
            if (oW === 0 || oH === 0) return;
            var wBleed = isSleeve ? 1.06 : 1.03;
            obj.resize((availableW / oW) * 100 * wBleed, (availableH / oH) * 100, true, true, true, true, 100, Transformation.CENTER);
            var nB = ref.visibleBounds, nW = Math.abs(nB[2] - nB[0]), nH = Math.abs(nB[1] - nB[3]);
            obj.left += (targetCenterX - (nB[0] + nW / 2)); obj.top += (targetCenterY - (nB[1] - nH / 2));
        } catch (e) {}
    }

    function findPlacementPath(container, isMockupIsolation) {
        if (!container) return null;
        if (container.typename === "PathItem" || container.typename === "CompoundPathItem") return container;
        var found = null;
        function search(items) {
            if (!items) return false;
            for (var i = 0; i < items.length; i++) {
                if (items[i].typename === "PathItem" || items[i].typename === "CompoundPathItem") {
                    if ((items[i].name || "").toLowerCase().indexOf("logo") !== -1) continue;
                    found = items[i]; return true; 
                } else if (items[i].typename === "GroupItem") if (search(items[i].pageItems)) return true;
            }
            return false;
        }
        search(container.pageItems); return found;
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
        var nPart = part.toLowerCase(); if (isAccessory(nPart)) return null;
        var targets = [];
        if (nPart.indexOf("sleeve") !== -1) {
            if (nPart.indexOf("right") !== -1) targets.push("Right Sleeve", "Right_Sleeve", "RightSleeve", "Sleeve");
            else if (nPart.indexOf("left") !== -1) targets.push("Left Sleeve", "Left_Sleeve", "LeftSleeve", "Sleeve");
            else targets.push("Short Sleeve", "Short_Sleeve", "Long Sleeve", "Long_Sleeve", "Full Sleeve", "Sleeve", "sleeve", "Sleeves");
        }
        else if (nPart.indexOf("front") !== -1) targets = ["front", "FRONT", "Front View", "Front_View"];
        else if (nPart.indexOf("back") !== -1) targets = ["back", "BACK", "Back View", "Back_View"];
        else if (nPart.indexOf("neck") !== -1) targets = ["Neck", "neck", "NECK", "collar", "Rib"];
        targets.push("logo", "LOGO", "Logo_Group");
        for (var t = 0; t < targets.length; t++) { var found = findAnywhere(mockupDoc, targets[t]); if (found) return found; }
        return null;
    }

    function smartContrast(group, bgColor) {
        try {
            if (!bgColor) return;
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
                if (container.groupItems) for (var g = 0; g < container.groupItems.length; g++) applyToText(container.groupItems[g]);
            }
            applyToText(group);
        } catch (e) {}
    }

    function applyTextReplacements(container, replacements) {
        log("DEBUG: Starting specific text replacements. Count: " + replacements.length);
        for (var i = 0; i < replacements.length; i++) {
            var rep = replacements[i];
            if (!rep.layer_name) continue;

            var lName = rep.layer_name.toUpperCase();
            var targets = [lName];
            
            // Smart Alising: Only add relevant aliases to avoid cross-over
            if (lName.indexOf("NAME") !== -1) {
                targets.push("PLAYER NAME", "NAME_LAYER");
            } else if (lName.indexOf("NUMBER") !== -1 || lName === "NUM" || lName === "#") {
                targets.push("NUMBER", "NUM", "#", "PLAYER NUMBER");
            }

            log("DEBUG: Processing '" + lName + "' replacement with value: '" + rep.new_value + "'");
            
            for (var t = 0; t < targets.length; t++) {
                replaceInContainer(container, targets[t], rep.new_value, false);
            }
        }
    }

    function replaceInContainer(container, target, value, alreadyMatched) {
        if (!target || !container) return;
        var tUpper = target.toUpperCase();
        var cName = (container.name || "").toUpperCase();
        var currentMatch = alreadyMatched || (cName.indexOf(tUpper) !== -1);

        if (container.textFrames && container.textFrames.length > 0) {
            for (var k = 0; k < container.textFrames.length; k++) {
                var tf = container.textFrames[k];
                var tfName = (tf.name || "").toUpperCase();
                var tfCont = (tf.contents || "").toUpperCase();
                
                log("DEBUG: Checking TextFrame - Name: '" + tf.name + "', Contents: '" + tf.contents + "'");

                if (currentMatch || tfName.indexOf(tUpper) !== -1 || tfCont.indexOf(tUpper) !== -1) {
                    log(">>> SUCCESS: Replacing '" + tf.contents + "' with '" + value + "' in '" + tf.name + "'");
                    tf.contents = value;
                    tf.zOrder(ZOrderMethod.BRINGTOFRONT);
                    tf.hidden = false;
                }
            }
        }

        if (container.groupItems) {
            for (var g = 0; g < container.groupItems.length; g++) {
                replaceInContainer(container.groupItems[g], target, value, currentMatch);
            }
        }
    }

    function exportResult(doc, idx, folder, name) {
        try {
            doc.artboards.setActiveArtboardIndex(idx);
            var opt = new ExportOptionsJPEG(); opt.artBoardClipping = true; opt.antiAliasing = true; opt.qualitySetting = 80; opt.imageColorSpace = ImageColorSpace.CMYK;
            doc.exportFile(new File(folder + "/" + name.replace(/[^a-zA-Z0-9]/g, '_') + ".jpg"), ExportType.JPEG, opt);
        } catch (e) {}
    }

    function ensureBlackStrokes(container) {
        try {
            var black = new CMYKColor(); black.cyan = 56; black.magenta = 56; black.yellow = 53; black.black = 92;
            function recurse(items) {
                for (var i = 0; i < items.length; i++) {
                    if (items[i].typename === "PathItem") { if (items[i].stroked) items[i].strokeColor = black; }
                    else if (items[i].typename === "GroupItem") recurse(items[i].pageItems);
                }
            }
            recurse(container.pageItems || [container]);
        } catch (e) {}
    }

    function clearAllStrokes(container) {
        try {
            function recurse(items) {
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    if (it.typename === "PathItem") {
                        // Only clear the stroke if it's NOT a spot color (which we just linked)
                        // This protects intentional design strokes like outlines on text-shapes
                        var isSpot = false;
                        try {
                            if (it.stroked && it.strokeColor && it.strokeColor.typename === "SpotColor") isSpot = true;
                        } catch(e) {}
                        
                        if (!isSpot) it.stroked = false;
                    } 
                    else if (it.typename === "GroupItem") recurse(it.pageItems);
                }
            }
            recurse(container.pageItems || [container]);
        } catch (e) {}
    }

    function bringLogosToFront(container) {
        try {
            function recurse(items) {
                for (var i = items.length - 1; i >= 0; i--) {
                    var it = items[i];
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

    function collectAndDuplicateDesign(baseItem, targetDoc) {
        var group = targetDoc.groupItems.add(); group.name = "Captured_Design";
        try {
            if (baseItem.typename === "Layer") {
                for (var l = baseItem.pageItems.length - 1; l >= 0; l--) { if (!baseItem.pageItems[l].hidden && !baseItem.pageItems[l].locked) try { baseItem.pageItems[l].duplicate(group, ElementPlacement.PLACEATBEGINNING); } catch (e) {} }
            } else try { baseItem.duplicate(group, ElementPlacement.PLACEATBEGINNING); } catch (e2) {}
        } catch (e) {}
        return group;
    }
    
    function forceCmykRecursive(item) {
        if (!item) return;
        try {
            if (item.typename === "GroupItem") {
                for (var i = 0; i < item.pageItems.length; i++) forceCmykRecursive(item.pageItems[i]);
            } else if (item.typename === "PathItem" || item.typename === "CompoundPathItem") {
                if (item.filled) item.fillColor = anyToCmyk(item.fillColor);
                if (item.stroked) item.strokeColor = anyToCmyk(item.strokeColor);
            } else if (item.typename === "TextFrame") {
                item.textRange.characterAttributes.fillColor = anyToCmyk(item.textRange.characterAttributes.fillColor);
            }
        } catch (e) {}
    }

    function anyToCmyk(color) {
        if (color.typename === "RGBColor") return rgbToCmyk(color);
        if (color.typename === "SpotColor" && color.color.typename === "RGBColor") {
            color.color = rgbToCmyk(color.color);
        }
        return color;
    }

    function rgbToCmyk(rgb) {
        var r = rgb.red / 255, g = rgb.green / 255, b = rgb.blue / 255;
        var k = 1 - Math.max(r, Math.max(g, b));
        var cmyk = new CMYKColor();
        if (k < 1) {
            cmyk.cyan = Math.round((1 - r - k) / (1 - k) * 100);
            cmyk.magenta = Math.round((1 - g - k) / (1 - k) * 100);
            cmyk.yellow = Math.round((1 - b - k) / (1 - k) * 100);
        } else {
            cmyk.cyan = 0; cmyk.magenta = 0; cmyk.yellow = 0;
        }
        cmyk.black = Math.round(k * 100);
        return cmyk;
    }

    function isAccessory(p) { var n = p.toLowerCase(); return n.indexOf("twill") !== -1 || n.indexOf("tukdi") !== -1 || n.indexOf("tape") !== -1; }
    function getFriendlySize(s) { 
        var m = { 
            "XS": "XS", "S": "Small", "M": "Medium", "L": "Large", "XL": "XL", 
            "XXL": "2XL", "2XL": "2XL", "3XL": "3XL", "XXXL": "3XL", "4XL": "4XL", "XXXXL": "4XL" 
        }; 
        return m[s.toUpperCase()] || s; 
    }
}
runAutomation();