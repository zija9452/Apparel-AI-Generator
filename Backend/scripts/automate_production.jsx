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

        // 0. CLEAN SLATE: Delete all default swatches and any pre-existing 'base-color' or 'MOCK_base-color' to avoid confusion
        for (var i = orderDoc.swatches.length - 1; i >= 0; i--) {
            var s = orderDoc.swatches[i];
            var sNameLower = s.name.toLowerCase();
            // Explicitly remove "base-color" or "MOCK_base-color" if they exist
            if (sNameLower === "base-color" || sNameLower === "mock_base-color") {
                try { s.remove(); log("Removed pre-existing swatch '" + s.name + "'."); } catch(e) { log("Error removing swatch '" + s.name + "': " + e.message); }
            } else if (s.name !== "[None]" && s.name !== "[Registration]") {
                try { s.remove(); } catch(e) {}
            }
        }
        // Also ensure no spot color "base-color" or "MOCK_base-color" exists if we are recreating it
        for (var i = orderDoc.spots.length - 1; i >= 0; i--) { // Iterate backwards for safe removal
            var spotNameLower = orderDoc.spots[i].name.toLowerCase();
            if (spotNameLower === "base-color" || spotNameLower === "mock_base-color") {
                try { orderDoc.spots[i].remove(); log("Removed pre-existing spot '" + orderDoc.spots[i].name + "'."); } catch(e) { log("Error removing spot '" + orderDoc.spots[i].name + "': " + e.message); }
            }
        }
        log("Swatch panel cleared of default colors and any pre-existing 'base-color' or 'MOCK_base-color'.");

        // 1. PRE-FLIGHT COLOR DETECTION (Smart Swatch & Object Lookup)
        var mockupSourceRGB = null; 
        var detectedCMYK = { c: 0, m: 0, y: 0, k: 0 }; // Renamed from 'detected' to avoid confusion
        var colorFound = false;

        try {
            // Strategy A: Direct Swatch Lookup (Mockup document)
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
            
            if (colorFound) {
                updateSwatchToCMYK(orderDoc, "base-color", detectedCMYK);
            } else {
                log("No base color detected from mockup. Defaulting to CMYK (0,0,0,0) as spot color.");
                updateSwatchToCMYK(orderDoc, "base-color", { c: 0, m: 0, y: 0, k: 0 }); // Ensure it's always a spot
            }
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

        // 3. CAPTURE FINAL BASE COLOR REFERENCE (ALWAYS as a SpotColor from the spots collection)
        var finalBaseColor = null;
        try {
            var baseSpot = orderDoc.spots.getByName("base-color");
            finalBaseColor = baseSpot.color; // Get the SpotColor object
            log("Global base color linked to spot swatch: '" + baseSpot.name + "'.");
        } catch (eFinal) { 
            log("CRITICAL ERROR: 'base-color' spot swatch not found after setup: " + eFinal.message);
            // Fallback, though this should ideally not be hit if updateSwatchToCMYK always works
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