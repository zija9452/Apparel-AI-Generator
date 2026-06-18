function runAutomation() {
    try {
        app.displayDialogs = 1; // Suppress all Illustrator dialogs (1 = DialogModes.NO)
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS; // Force suppression of all alerts
        
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
            for (var sp = mockupDoc.spots.length - 1; sp >= 0; sp--) {
                var spot = mockupDoc.spots[sp];
                if (spot.name !== "[Registration]" && spot.name.indexOf("MOCK_") !== 0) {
                    try { 
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

        for (var i = orderDoc.swatches.length - 1; i >= 0; i--) {
            var s = orderDoc.swatches[i];
            var sNameLower = s.name.toLowerCase();
            if (sNameLower === "base-color" || sNameLower === "mock_base-color") {
                try { s.remove(); log("Removed pre-existing swatch '" + s.name + "'."); } catch(e) { log("Error removing swatch '" + s.name + "': " + e.message); }
            } else if (s.name !== "[None]" && s.name !== "[Registration]") {
                try { s.remove(); } catch(e) {}
            }
        }
        for (var i = orderDoc.spots.length - 1; i >= 0; i--) {
            var spotNameLower = orderDoc.spots[i].name.toLowerCase();
            if (spotNameLower === "base-color" || spotNameLower === "mock_base-color") {
                try { orderDoc.spots[i].remove(); log("Removed pre-existing spot '" + orderDoc.spots[i].name + "'."); } catch(e) { log("Error removing spot '" + orderDoc.spots[i].name + "': " + e.message); }
            }
        }
        log("Swatch panel cleared of default colors and any pre-existing 'base-color' or 'MOCK_base-color'.");

        var mockupSourceRGB = null; 
        var detectedCMYK = { c: 0, m: 0, y: 0, k: 0 };
        var colorFound = false;

        try {
            try {
                var mockupSwatch = mockupDoc.swatches.getByName("base-color");
                if (mockupSwatch) {
                    var sc = (mockupSwatch.color.typename === "SpotColor") ? mockupSwatch.color.spot.color : mockupSwatch.color;
                    if (sc.typename === "RGBColor") {
                        mockupSourceRGB = { r: Math.round(sc.red), g: Math.round(sc.green), b: Math.round(sc.blue) };
                        detectedCMYK = rgbToCmyk(sc);
                    } else if (sc.typename === "CMYKColor") {
                        detectedCMYK = { c: sc.cyan, m: sc.magenta, y: sc.yellow, k: sc.black };
                    }
                    colorFound = true;
                    log("Base color detected directly from Mockup Swatch panel.");
                }
            } catch(e) {}

            if (!colorFound) {
                var sampleFront = findAnywhere(mockupDoc, "Front") || findAnywhere(mockupDoc, "Front View") || findAnywhere(mockupDoc, "front");
                if (sampleFront) {
                    var samplePath = findPlacementPath(sampleFront);
                    if (samplePath && samplePath.filled) {
                        var fc = samplePath.fillColor;
                        if (fc.typename === "RGBColor") {
                            mockupSourceRGB = { r: Math.round(fc.red), g: Math.round(fc.green), b: Math.round(fc.blue) };
                            detectedCMYK = rgbToCmyk(fc);
                        }
                        else if (fc.typename === "CMYKColor") { detectedCMYK = { c: fc.cyan, m: fc.magenta, y: fc.yellow, k: fc.black }; }
                        colorFound = true;
                        log("Base color detected from 'Front' object.");
                    }
                }
            }
            
            if (colorFound) {
                updateSwatchToCMYK(orderDoc, "base-color", detectedCMYK);
            } else {
                log("No base color detected from mockup. Defaulting to CMYK (0,0,0,0) as spot color.");
                updateSwatchToCMYK(orderDoc, "base-color", { c: 0, m: 0, y: 0, k: 0 });
            }
            if (mockupSourceRGB) log("Mockup Source RGB Captured: R:" + mockupSourceRGB.r + " G:" + mockupSourceRGB.g + " B:" + mockupSourceRGB.b);

        } catch (ePre) { log("Pre-flight color detection failed: " + ePre.message); }

        if (plan.color_mapping && plan.color_mapping.length > 0) {
            log("Applying Excel Color Overrides/Replacements...");
            for (var c = 0; c < plan.color_mapping.length; c++) {
                var entry = plan.color_mapping[c];
                if (entry.color && typeof entry.color.c !== 'undefined') {
                    updateSwatchToCMYK(orderDoc, entry.swatch_name, entry.color);
                }
            }
        }

        var finalBaseColor = null;
        try {
            var baseSpot = orderDoc.spots.getByName("base-color");
            finalBaseColor = baseSpot.color;
            log("Global base color linked to spot swatch: '" + baseSpot.name + "'.");
        } catch (eFinal) { 
            log("CRITICAL ERROR: 'base-color' spot swatch not found after setup: " + eFinal.message);
            if (orderDoc.swatches.length > 0) {
                finalBaseColor = orderDoc.swatches[0].color;
                log("WARNING: Using first available swatch as fallback for finalBaseColor.");
            } else {
                var fallbackCMYK = new CMYKColor(); fallbackCMYK.cyan=0; fallbackCMYK.magenta=0; fallbackCMYK.yellow=0; fallbackCMYK.black=0;
                finalBaseColor = fallbackCMYK;
                log("WARNING: No swatches available, using black CMYK as fallback.");
            }
        }

        var margin = 500, currentX = -7500, currentY = 8000, artboardCount = 0, rowMaxHeight = 0;
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
                                pastedPattern = masterProcessed.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                            } else {
                                pastedPattern = patternObj.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                            }

                            var bounds = pastedPattern.visibleBounds;
                            pWidth = Math.abs(bounds[2] - bounds[0]); pHeight = Math.abs(bounds[1] - bounds[3]);
                            pastedPattern.left = currentX; pastedPattern.top = currentY;
                            
                            var finalRect = [currentX, currentY, currentX + pWidth, currentY - pHeight];
                            var ab = (artboardCount === 1 && orderDoc.artboards.length === 1) ? orderDoc.artboards[0] : orderDoc.artboards.add(finalRect);
                            ab.artboardRect = finalRect; ab.name = instanceName;

                            if (!(isAcc && masterProcessed)) {
                                var baseShape = findPlacementPath(pastedPattern);
                                if (baseShape) {
                                    baseShape.fillColor = finalBaseColor;
                                    baseShape.filled = true;

                                    var hasPers = (item.text_replacements && item.text_replacements.length > 0);
                                    var sourceDesign = getSourceView(item.part_name, mockupDoc, hasPers);
                                    
                                    var nPartName = item.part_name.toLowerCase();
                                    var isNeck = (nPartName === "neck" || nPartName === "collar" || nPartName === "rib");
                                    var isSleeve = (nPartName.indexOf("sleeve") !== -1);
                                    
                                    if (sourceDesign && !isAcc) {
                                        var pastedDesign = null;
                                        try {
                                            if (sourceDesign.typename === "Layer") {
                                                pastedDesign = orderDoc.groupItems.add();
                                                for (var l = sourceDesign.pageItems.length - 1; l >= 0; l--) sourceDesign.pageItems[l].duplicate(pastedDesign, ElementPlacement.PLACEATBEGINNING);
                                            } else {
                                                pastedDesign = sourceDesign.duplicate(orderDoc, ElementPlacement.PLACEATBEGINNING);
                                            }
                                        } catch (eDup) { log("Duplication failed: " + eDup.message); }

                                        if (pastedDesign) {
                                            mergeAndCleanupSwatches(orderDoc, pastedDesign);
                                            if (pastedDesign.typename !== "GroupItem") {
                                                var wrapper = orderDoc.groupItems.add(); pastedDesign.moveToBeginning(wrapper); pastedDesign = wrapper;
                                            }
                                            
                                            if (isSleeve) {
                                                pastedDesign.rotate(-73); 
                                            }
                                            
                                            clearAllStrokes(pastedDesign);
                                            
                                            if (hasPers) {
                                                applyTextReplacements(pastedDesign, item.text_replacements);
                                            }

                                            if (isNeck) {
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
                                            } else {
                                                var useFrontBackLogic = (item.part_name === "front" || item.part_name === "back" || isSleeve);
                                                var designBasePath = findPlacementPath(pastedDesign, true);
                                                if (designBasePath) {
                                                    alignAndScale(pastedDesign, baseShape, useFrontBackLogic, isSleeve, isNeck, designBasePath);
                                                    releaseInternalClippingMasks(pastedDesign);
                                                    
                                                    function removeBasePaths(container) {
                                                        for (var r = container.pageItems.length - 1; r >= 0; r--) {
                                                            var it = container.pageItems[r];
                                                            var itName = (it.name || "").toLowerCase();
                                                            if (itName === "base-path" || itName === "base_path" || itName === "basepath") {
                                                                try { it.remove(); } catch(e) {}
                                                            } else if (it.typename === "GroupItem") {
                                                                removeBasePaths(it);
                                                            }
                                                        }
                                                    }
                                                    removeBasePaths(pastedDesign);
                                                } else {
                                                    alignAndScale(pastedDesign, baseShape, useFrontBackLogic, isSleeve, isNeck);
                                                }

                                                if (isSleeve) {
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
                                                        var patternBottom = pastedPattern.visibleBounds[3];
                                                        for (var p = 0; p < ribPaths.length; p++) {
                                                            var rp = ribPaths[p];
                                                            rp.width = baseShape.width + (sideMargin * 2); rp.height = ribTotalHeight;
                                                            rp.left = baseShape.left - sideMargin; rp.top = patternBottom + ribInsideHeight;
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            bringLogosToFront(pastedDesign);
                                            
                                            if (pastedDesign.pageItems && pastedDesign.pageItems.length > 0) {
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
                                                    }
                                                } catch (eClip) {}
                                            }
                                        }
                                    }
                                    
                                    if (isAcc) {
                                        var accColor = finalBaseColor;
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
                                                        } catch(e) {
                                                            var cmyk = (rawColor.spot.color.typename === "RGBColor") ? rgbToCmyk(rawColor.spot.color) : rawColor.spot.color;
                                                            accColor = cmyk;
                                                        }
                                                    } else if (rawColor.typename === "RGBColor") {
                                                        accColor = rgbToCmyk(rawColor);
                                                    }
                                                }
                                            }
                                        } catch(eAcc) {}

                                        baseShape.fillColor = accColor;
                                        baseShape.filled = true;
                                        ensureBlackStrokes(pastedPattern);
                                        masterProcessed = pastedPattern;
                                    }
                                }
                            }

                            if (isNeck && baseShape) smartContrast(pastedPattern, baseShape.fillColor);
                            bringPatternLabelsToFront(pastedPattern, orderDoc); 
                        } catch (eInstance) { log("Error in instance: " + instanceName + " -> " + eInstance.message); }

                        exportResult(orderDoc, artboardCount - 1, outputDir, instanceName);
                        
                        currentX += pWidth + refContext.spacing;
                        if (pHeight > rowMaxHeight) rowMaxHeight = pHeight;
                        if (currentX > 7500) { currentX = -8000; currentY -= (rowMaxHeight + refContext.spacing); rowMaxHeight = 0; }
                    }
                }
            }
        }
        
        updateStatus("Saving AI file...", 95, false);
        try {
            var saveFile = new File(outputDir + "/production_ready_order.ai");
            if (saveFile.exists) { try { saveFile.remove(); } catch(e) {} }
            orderDoc.saveAs(saveFile, new IllustratorSaveOptions());
        } catch (eSave) {}

        try {
            if (orderDoc) { orderDoc.close(SaveOptions.DONOTSAVECHANGES); }
            if (mockupDoc) { mockupDoc.close(SaveOptions.DONOTSAVECHANGES); }
        } catch (eClose) {}

        updateStatus("Production Ready", 100, true); 
        logFile.close();
    } catch (e) {
        if (typeof logFile !== 'undefined' && logFile.close) {
            log("CRITICAL JSX ERROR: " + e.message + " (Line: " + e.line + ")");
            try { logFile.close(); } catch(eL) {}
        }
        var errLog = new File(outputDir + "/error_log.txt");
        errLog.open("w"); errLog.write("JSX Error: " + e.message + "\nLine: " + e.line); errLog.close();
    }

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
        } catch (err) {}
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
                    for (var j = 0; j < mockupDoc.swatches.length; j++) {
                        var sw = mockupDoc.swatches[j];
                        var swCleanName = sw.name.replace(/^MOCK_/, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^mock/, "");
                        if (officialSpots[swCleanName]) {
                            var scObj = sw.color;
                            if (scObj.typename === "SpotColor") scObj = scObj.spot.color;
                            if (scObj.typename === "RGBColor") {
                                mockupColorMap[swCleanName] = { r: Math.round(scObj.red), g: Math.round(scObj.green), b: Math.round(scObj.blue) };
                            }
                        }
                    }
                }
            } catch(eMap) {}

            try {
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
                            } else if (spot.color.typename === "RGBColor") {
                                spot.color = rgbToCmyk(spot.color);
                            }
                        } else if (sw.color.typename === "RGBColor") {
                            if (targetSpot) {
                                sw.color = targetSpot.color;
                            } else {
                                sw.color = rgbToCmyk(sw.color);
                            }
                        }
                    } catch(e) {}
                }
            } catch(eSync) {}

            function deepReLink(container) {
                var items = (container.pageItems) ? container.pageItems : [container];
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    if (it.typename === "GroupItem") deepReLink(it);
                    else if (it.typename === "CompoundPathItem") {
                        applySpot(it, "fillColor");
                        applySpot(it, "strokeColor");
                        if (it.pathItems) {
                            for (var p = 0; p < it.pathItems.length; p++) {
                                applySpot(it.pathItems[p], "fillColor");
                                applySpot(it.pathItems[p], "strokeColor");
                            }
                        }
                    }
                    else if (it.typename === "PathItem" || it.typename === "TextFrame") {
                        applySpot(it, "fillColor");
                        applySpot(it, "strokeColor");
                    }
                }
            }

            function applySpot(obj, prop) {
                try {
                    var colorObj = null;
                    var isText = (obj.typename === "TextFrame");
                    if (isText) {
                        if (obj.textRange.length === 0) return;
                        try { colorObj = obj.textRange.characterAttributes[prop]; } catch(e) {}
                        if (!colorObj || colorObj.typename === "NoColor") {
                            try { colorObj = obj.textRange.characters[0].characterAttributes[prop]; } catch(e) {}
                        }
                        if (!colorObj || colorObj.typename === "NoColor") {
                            try { colorObj = obj[prop]; } catch(e) {}
                        }
                    } else {
                        colorObj = obj[prop];
                    }
                    if (!colorObj || colorObj.typename === "NoColor") return;

                    function processSubColor(c) {
                        if (!c || c.typename === "NoColor") return null;
                        if (c.typename === "SpotColor") {
                            var rawName = c.spot.name;
                            var cleanName = rawName.replace(/^MOCK_/, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^mock/, ""); 
                            if (officialSpots[cleanName]) {
                                var sc = new SpotColor(); sc.spot = officialSpots[cleanName];
                                return sc;
                            }
                        } 
                        var rgb = [];
                        try {
                            if (c.typename === "RGBColor") {
                                rgb = [c.red, c.green, c.blue];
                            } else if (c.typename === "CMYKColor") {
                                rgb = app.convertSampleColor(ImageColorSpace.CMYK, [c.cyan, c.magenta, c.yellow, c.black], ImageColorSpace.RGB, ColorConvertPurpose.defaultpurpose);
                            } else if (c.typename === "GrayColor") {
                                var g = 255 - (c.gray * 2.55);
                                rgb = [g, g, g];
                            } else if (c.typename === "SpotColor" && c.spot.color.typename === "RGBColor") {
                                rgb = [c.spot.color.red, c.spot.color.green, c.spot.color.blue];
                            } else if (c.typename === "SpotColor" && c.spot.color.typename === "GrayColor") {
                                var g2 = 255 - (c.spot.color.gray * 2.55);
                                rgb = [g2, g2, g2];
                            } else return null;
                        } catch(e) { return null; }

                        var cr = Math.round(rgb[0]), cg = Math.round(rgb[1]), cb = Math.round(rgb[2]);
                        var bestMatch = null, minDiff = 15;
                        for (var mName in mockupColorMap) {
                            var target = mockupColorMap[mName];
                            var diff = Math.abs(cr - target.r) + Math.abs(cg - target.g) + Math.abs(cb - target.b);
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestMatch = mName;
                            }
                        }
                        if (bestMatch) {
                            var sc2 = new SpotColor();
                            sc2.spot = officialSpots[bestMatch];
                            return sc2;
                        } else {
                            var r = cr / 255, g = cg / 255, b = cb / 255;
                            var k = 1 - Math.max(r, Math.max(g, b));
                            var cmyk = new CMYKColor();
                            if (k < 1) {
                                cmyk.cyan = Math.round((1 - r - k) / (1 - k) * 100);
                                cmyk.magenta = Math.round((1 - g - k) / (1 - k) * 100);
                                cmyk.yellow = Math.round((1 - b - k) / (1 - k) * 100);
                            } else { cmyk.cyan = 0; cmyk.magenta = 0; cmyk.yellow = 0; }
                            cmyk.black = Math.round(k * 100);
                            return cmyk;
                        }
                    }

                    var updated = processSubColor(colorObj);
                    if (updated) {
                        if (isText) {
                            try {
                                var ca = obj.textRange.characterAttributes;
                                ca[prop] = updated;
                                if (prop === "strokeColor") ca.strokeWeight = 2.5;
                            } catch(e) {
                                try { obj[prop] = updated; } catch(e2) {}
                            }
                        } else {
                            obj[prop] = updated;
                            if (prop === "strokeColor") { obj.strokeWeight = obj.strokeWeight || 2; obj.stroked = true; }
                        }
                    } else if (colorObj.typename === "GradientColor") {
                        var stops = colorObj.gradient.gradientStops;
                        for (var s = 0; s < stops.length; s++) {
                            var stopUpdated = processSubColor(stops[s].color);
                            if (stopUpdated) stops[s].color = stopUpdated;
                        }
                    }
                } catch(e) {}
            }
                             
            deepReLink(targetContainer || doc);

            for (var i = doc.swatches.length - 1; i >= 0; i--) {
                var sw = doc.swatches[i];
                if (sw.name !== "[None]" && sw.name !== "[Registration]" && sw.name.indexOf("MOCK_") === 0) {
                    try {
                        var cleanName = sw.name.replace(/^MOCK_/, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^mock/, "");
                        var targetSpot = null;
                        for (var k = 0; k < doc.spots.length; k++) {
                            if (doc.spots[k].name.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanName) {
                                targetSpot = doc.spots[k];
                                break;
                            }
                        }
                        if (targetSpot) {
                            sw.remove(targetSpot);
                        } else {
                            sw.remove();
                        }
                    } catch(e) {}
                }
            }
        } catch (eMerge) {}
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
        for (var i = 0; i < replacements.length; i++) {
            var rep = replacements[i];
            if (!rep.layer_name) continue;
            var lName = rep.layer_name.toUpperCase();
            var targets = [lName];
            if (lName.indexOf("NAME") !== -1) { targets.push("PLAYER NAME", "NAME_LAYER"); } 
            else if (lName.indexOf("NUMBER") !== -1 || lName === "NUM" || lName === "#") { targets.push("NUMBER", "NUM", "#", "PLAYER NUMBER"); }
            for (var t = 0; t < targets.length; t++) { replaceInContainer(container, targets[t], rep.new_value, false); }
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
                if (tf.hidden) continue;
                var tfName = (tf.name || "").toUpperCase();
                var tfCont = (tf.contents || "").toUpperCase();
                if (currentMatch || tfName.indexOf(tUpper) !== -1 || tfCont.indexOf(tUpper) !== -1) {
                    var savedFillSpotName = null, savedStrokeSpotName = null, savedFillColor = null, savedStrokeColor = null, savedStrokeWeight = null, savedSize = null, savedFont = null;
                    try {
                        if (tf.textRange.length > 0) {
                            var charAttrs = tf.textRange.characters[0].characterAttributes;
                            var fc = charAttrs.fillColor; var sc = charAttrs.strokeColor;
                            if (!fc || fc.typename === "NoColor") try { fc = tf.fillColor; } catch(e) {}
                            if (!sc || sc.typename === "NoColor") try { sc = tf.strokeColor; } catch(e) {}
                            var p = tf.parent;
                            while ((!fc || fc.typename === "NoColor") && p && p.typename === "GroupItem") { try { fc = p.fillColor; } catch(e) {} p = p.parent; }
                            p = tf.parent;
                            while ((!sc || sc.typename === "NoColor") && p && p.typename === "GroupItem") { try { sc = p.strokeColor; } catch(e) {} p = p.parent; }
                            if (fc && fc.typename !== "NoColor") { if (fc.typename === "SpotColor") savedFillSpotName = fc.spot.name; savedFillColor = fc; }
                            if (sc && sc.typename !== "NoColor") { if (sc.typename === "SpotColor") savedStrokeSpotName = sc.spot.name; savedStrokeColor = sc; }
                            try { savedStrokeWeight = charAttrs.strokeWeight || tf.strokeWeight; } catch(e) {}
                            try { savedSize = charAttrs.size; } catch(e) {}
                            try { savedFont = charAttrs.textFont; } catch(e) {}
                        }
                    } catch(eStyle) {}
                    tf.contents = value;
                    tf.zOrder(ZOrderMethod.BRINGTOFRONT);
                    tf.hidden = false;
                    try { tf.filled = false; tf.stroked = false; } catch(eClear) {}
                    try {
                        var activeDoc = app.activeDocument;
                        var rangeAttrs = tf.textRange.characterAttributes;
                        var finalFill = null;
                        if (savedFillSpotName) { try { var spot = activeDoc.spots.getByName(savedFillSpotName); finalFill = new SpotColor(); finalFill.spot = spot; } catch(e) {} }
                        if (!finalFill) finalFill = savedFillColor;
                        if (finalFill && finalFill.typename !== "NoColor") {
                            rangeAttrs.fillColor = finalFill;
                            for (var ci = 0; ci < tf.textRange.characters.length; ci++) { tf.textRange.characters[ci].characterAttributes.fillColor = finalFill; }
                        }
                        var finalStroke = null;
                        if (savedStrokeSpotName) { try { var spot = activeDoc.spots.getByName(savedStrokeSpotName); finalStroke = new SpotColor(); finalStroke.spot = spot; } catch(e) {} }
                        if (!finalStroke) finalStroke = savedStrokeColor;
                        if (finalStroke && finalStroke.typename !== "NoColor") {
                            rangeAttrs.strokeColor = finalStroke;
                            for (var ci = 0; ci < tf.textRange.characters.length; ci++) { tf.textRange.characters[ci].characterAttributes.strokeColor = finalStroke; }
                            if (savedStrokeWeight) {
                                rangeAttrs.strokeWeight = savedStrokeWeight;
                                for (var ci = 0; ci < tf.textRange.characters.length; ci++) { tf.textRange.characters[ci].characterAttributes.strokeWeight = savedStrokeWeight; }
                            }
                        }
                        if (savedSize) rangeAttrs.size = savedSize;
                        if (savedFont) rangeAttrs.textFont = savedFont;
                    } catch(eReapply) {}
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
                    if (it.typename === "TextFrame") continue;
                    if (it.typename === "PathItem") {
                        var isSpot = false;
                        try { if (it.stroked && it.strokeColor && it.strokeColor.typename === "SpotColor") isSpot = true; } catch(e) {}
                        if (!isSpot) it.stroked = false;
                    } 
                    else if (it.typename === "GroupItem") recurse(it.pageItems);
                    else if (it.typename === "CompoundPathItem") recurse(it.pathItems);
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
                    if (it.hidden) continue;
                    if (((it.name || "").toLowerCase().indexOf("logo") !== -1) || (it.typename === "TextFrame")) { try { it.zOrder(ZOrderMethod.BRINGTOFRONT); } catch(e) {} }
                    if (it.typename === "GroupItem") recurse(it.pageItems);
                }
            }
            recurse(container.pageItems || [container]);
        } catch (e) {}
    }

    function rgbToCmyk(rgb) {
        var r = rgb.red / 255, g = rgb.green / 255, b = rgb.blue / 255;
        var k = 1 - Math.max(r, Math.max(g, b));
        var cmyk = new CMYKColor();
        if (k < 1) {
            cmyk.cyan = Math.round((1 - r - k) / (1 - k) * 100);
            cmyk.magenta = Math.round((1 - g - k) / (1 - k) * 100);
            cmyk.yellow = Math.round((1 - b - k) / (1 - k) * 100);
        } else { cmyk.cyan = 0; cmyk.magenta = 0; cmyk.yellow = 0; }
        cmyk.black = Math.round(k * 100);
        return cmyk;
    }

    function isAccessory(p) { var n = p.toLowerCase(); return n.indexOf("twill") !== -1 || n.indexOf("tukdi") !== -1 || n.indexOf("tape") !== -1; }
    function getFriendlySize(s) { 
        var m = { "XS": "XS", "S": "Small", "M": "Medium", "L": "Large", "XL": "XL", "XXL": "2XL", "2XL": "2XL", "3XL": "3XL", "XXXL": "3XL", "4XL": "4XL", "XXXXL": "4XL" }; 
        return m[s.toUpperCase()] || s; 
    }
}
runAutomation();
