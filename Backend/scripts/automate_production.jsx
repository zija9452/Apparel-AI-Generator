function runAutomation() {
    try {
        if (typeof planPath === 'undefined') return;

        var planFile = new File(planPath);
        planFile.open("r");
        var plan = JSON.parse(planFile.read());
        planFile.close();

        var patternDoc = app.activeDocument;
        
        // Ensure alerts are suppressed globally
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
        
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
            // 1. Rename ALL swatches AND spots in the mockup to prevent naming collisions
            // We also force them to CMYK here so they match the Order Doc definition (avoids "Conflict" popups)
            
            // Rename Spots first
            for (var sp = mockupDoc.spots.length - 1; sp >= 0; sp--) {
                var spot = mockupDoc.spots[sp];
                if (spot.name !== "[Registration]" && spot.name.indexOf("MOCK_") !== 0) {
                    try { 
                        // Force CMYK mode on the spot itself
                        if (spot.color.typename === "RGBColor") {
                            spot.color = rgbToCmyk(spot.color);
                        }
                        spot.name = "MOCK_" + spot.name; 
                    } catch(e) {}
                }
            }

            for (var s = mockupDoc.swatches.length - 1; s >= 0; s--) {
                var sw = mockupDoc.swatches[s];
                if (sw.name !== "[None]" && sw.name !== "[Registration]" && sw.name.indexOf("MOCK_") !== 0) {
                    try { 
                        // Force CMYK mode on the swatch
                        if (sw.color.typename === "RGBColor") {
                            sw.color = rgbToCmyk(sw.color);
                        } else if (sw.color.typename === "SpotColor" && sw.color.spot.color.typename === "RGBColor") {
                            sw.color.spot.color = rgbToCmyk(sw.color.spot.color);
                        }
                        sw.name = "MOCK_" + sw.name; 
                    } catch(e) {}
                }
            }
            log("All Mockup swatches/spots isolated with 'MOCK_' prefix and converted to CMYK.");
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
                                            
                                            // --- NEW: Programmatically merge duplicates to avoid popup ---
                                            mergeDuplicateSwatches(orderDoc);
                                            
                                            if (pastedDesign.typename !== "GroupItem") {
                                                var wrapper = orderDoc.groupItems.add(); pastedDesign.moveToBeginning(wrapper); pastedDesign = wrapper;
                                            }
                                            
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
    function mergeDuplicateSwatches(doc) {
        try {
            var swatches = doc.swatches;
            var masterSwatches = {}; // Name -> Swatch object
            
            // First pass: Identify master swatches
            for (var i = 0; i < swatches.length; i++) {
                var sw = swatches[i];
                if (sw.name === "[None]" || sw.name === "[Registration]") continue;
                if (!masterSwatches[sw.name]) {
                    masterSwatches[sw.name] = sw;
                }
            }

            // Second pass: Find duplicates and merge
            for (var i = swatches.length - 1; i >= 0; i--) {
                var sw = swatches[i];
                if (sw.name === "[None]" || sw.name === "[Registration]") continue;
                
                var master = masterSwatches[sw.name];
                if (sw !== master) {
                    // This is a duplicate. Replace usages and remove.
                    try {
                        sw.remove(master);
                        log("Merged duplicate swatch: " + sw.name);
                    } catch(e) {
                        log("Merge error for " + sw.name + ": " + e.message);
                    }
                }
            }
        } catch(e) { log("Error in mergeDuplicateSwatches: " + e.message); }
    }

    function updateSwatchToCMYK(doc, name, cmyk) {
        try {
            var targetName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
            var s = null;
            // Check if swatch already exists to avoid duplicates
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
            
            var mockupColorMap = {};
            try {
                if (typeof mockupDoc !== 'undefined' && mockupDoc && mockupDoc.swatches) {
                    var mapCount = 0;
                    var officialKeys = []; for (var k in officialSpots) officialKeys.push(k);
                    log("DEBUG: Official Spots in Excel: " + officialKeys.join(", "));
                    
                    for (var j = 0; j < mockupDoc.swatches.length; j++) {
                        var sw = mockupDoc.swatches[j];
                        var swCleanName = sw.name.replace(/^MOCK_/, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^mock/, "");
                        if (officialSpots[swCleanName]) {
                            var scObj = sw.color;
                            if (scObj.typename === "SpotColor") scObj = scObj.spot.color;
                            if (scObj.typename === "RGBColor") {
                                mockupColorMap[swCleanName] = { r: Math.round(scObj.red), g: Math.round(scObj.green), b: Math.round(scObj.blue) };
                                mapCount++;
                            }
                        } else {
                            if (sw.name !== "[None]" && sw.name !== "[Registration]") log("   - No Excel match for Mockup Swatch: " + sw.name + " (Clean: " + swCleanName + ")");
                        }
                    }
                    log("DEBUG: mockupColorMap populated with " + mapCount + " swatches.");
                }
            } catch(eMap) { log("Color Map Warning: " + eMap.message); }

            // --- NEW: Sync Mockup Swatches with Excel CMYK values and Force CMYK mode ---
            try {
                log("Syncing all swatches to CMYK mode...");
                for (var s = 0; s < doc.swatches.length; s++) {
                    var sw = doc.swatches[s];
                    if (sw.name === "[None]" || sw.name === "[Registration]") continue;
                    
                    try {
                        var swCleanName = sw.name.replace(/^MOCK_/, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^mock/, "");
                        var targetSpot = officialSpots[swCleanName];
                        
                        if (sw.color.typename === "SpotColor") {
                            var spot = sw.color.spot;
                            if (targetSpot) {
                                spot.color = targetSpot.color;
                                log("   - Swatch Sync: Spot '" + sw.name + "' linked to Excel CMYK.");
                            } else if (spot.color.typename === "RGBColor") {
                                spot.color = rgbToCmyk(spot.color);
                                log("   - Swatch Sync: Spot '" + sw.name + "' converted to CMYK.");
                            }
                        } else if (sw.color.typename === "RGBColor") {
                            if (targetSpot) {
                                sw.color = targetSpot.color;
                                log("   - Swatch Sync: Swatch '" + sw.name + "' linked to Excel CMYK.");
                            } else {
                                sw.color = rgbToCmyk(sw.color);
                                log("   - Swatch Sync: Swatch '" + sw.name + "' converted to CMYK.");
                            }
                        }
                    } catch(e) { log("   - Swatch Sync Error (" + sw.name + "): " + e.message); }
                }
            } catch(eSync) { log("Swatch Sync Critical Error: " + eSync.message); }

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