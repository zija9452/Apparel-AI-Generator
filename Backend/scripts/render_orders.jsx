/**
 * AI Apparel Order Generator - Production Renderer
 * Matches Artboard Names with Plan Parts and applies Personalization.
 */

function main() {
    var planFile = File.openDialog("Select the Production Plan JSON file");
    if (!planFile) return;

    planFile.open("r");
    var planData = JSON.parse(planFile.read());
    planFile.close();

    var doc = app.activeDocument;
    if (!doc) {
        alert("Please open your Illustrator Pattern/Mockup file first!");
        return;
    }

    // 1. Ensure CMYK Mode for Printing
    if (doc.documentColorSpace !== DocumentColorSpace.CMYK) {
        try {
            app.executeMenuCommand('doc-color-cmyk');
        } catch (e) {
            alert("Warning: Could not auto-switch to CMYK. Please do it manually.");
        }
    }

    // 2. Apply CMYK Color Mappings
    if (planData.color_mapping) {
        for (var i = 0; i < planData.color_mapping.length; i++) {
            var entry = planData.color_mapping[i];
            updateSwatchToCMYK(doc, entry.swatch_name, entry.color);
        }
    }

    var outputFolder = Folder.selectDialog("Select output folder for Assets");
    if (!outputFolder) return;

    // 3. Process Production Groups (Sizes)
    for (var g = 0; g < planData.production_groups.length; g++) {
        var group = planData.production_groups[g];
        
        for (var it = 0; it < group.items.length; it++) {
            var item = group.items[it];
            
            // Find the correct Artboard by Name
            var abIndex = findArtboardByName(doc, item.part_name);
            if (abIndex !== -1) {
                doc.artboards.setActiveArtboardIndex(abIndex);
                
                // Apply Personalization (Text Replacement)
                for (var r = 0; r < item.text_replacements.length; r++) {
                    var rep = item.text_replacements[r];
                    replaceTextOnArtboard(doc, abIndex, rep.layer_name, rep.new_value);
                }

                // Export this specific artboard
                var fileName = group.size + "_" + item.part_name + "_qty" + item.quantity + ".jpg";
                exportActiveArtboardToJpeg(doc, new File(outputFolder + "/" + fileName));
            }
        }
    }

    alert("Production Complete! Check the output folder.");
}

function findArtboardByName(doc, name) {
    for (var i = 0; i < doc.artboards.length; i++) {
        if (doc.artboards[i].name.indexOf(name) !== -1) {
            return i;
        }
    }
    return -1;
}

function replaceTextOnArtboard(doc, abIndex, targetName, newValue) {
    if (!newValue || newValue === "") return;
    
    // Search for text frames in the document that match the target name
    // and are within the bounds of the active artboard
    var abBounds = doc.artboards[abIndex].artboardRect;
    
    for (var i = 0; i < doc.textFrames.length; i++) {
        var tf = doc.textFrames[i];
        if (tf.name === targetName || tf.contents.indexOf(targetName) !== -1) {
            // Optional: Check if tf is within abBounds
            tf.contents = newValue;
        }
    }
}

function updateSwatchToCMYK(doc, name, cmyk) {
    try {
        var targetName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        
        // Delete existing to avoid RGB residue or naming conflicts
        for (var i = doc.swatches.length - 1; i >= 0; i--) {
            var sName = doc.swatches[i].name.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (sName === targetName) {
                doc.swatches[i].remove();
            }
        }

        var s = doc.swatches.add();
        s.name = name;
        
        var newColor = new CMYKColor();
        newColor.cyan = Math.round(parseFloat(cmyk.c) * 100) / 100;
        newColor.magenta = Math.round(parseFloat(cmyk.m) * 100) / 100;
        newColor.yellow = Math.round(parseFloat(cmyk.y) * 100) / 100;
        newColor.black = Math.round(parseFloat(cmyk.k) * 100) / 100;
        
        s.color = newColor;
    } catch (e) {}
}

function exportActiveArtboardToJpeg(doc, file) {
    var exportOptions = new ExportOptionsJPEG();
    exportOptions.antiAliasing = true;
    exportOptions.qualitySetting = 100;
    exportOptions.artBoardClipping = true;
    exportOptions.imageColorSpace = ImageColorSpace.CMYK; // FORCED CMYK EXPORT
    doc.exportFile(file, ExportType.JPEG, exportOptions);
}

main();
