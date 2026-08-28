id: 001
title: Convert RGB to CMYK in Production Script
stage: refactor
date_iso: 2026-06-20
surface: agent
model: gemini-3.1-flash-lite
feature: production_automation
branch: main
user: user
command: N/A
labels:
  - color-management
  - extendscript
  - automation
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files_yaml:
  - Backend/scripts/automate_production.jsx
tests_yaml:
  - N/A
prompt_text: |
  convert rgb color swatch mode into cmyk , """These are results for how to convert rgb color to cmyk color mode in illustrator through extendscriptSearch instead for how to convert rgb color to cmyk color mode in illustrator through extenscriptAI OverviewTo convert a document's color mode from RGB to CMYK using ExtendScript, you must use the app.executeMenuCommand() method because the document color space property (DocumentColorSpace) is read-only after creation. Adobe +2Change Document Color Mode Run this menu command shortcut to instantly change the active document's profile:javascriptif (app.documents.length > 0) {    var doc = app.activeDocument;    // Check if the document is currently in RGB mode    if (doc.documentColorSpace == DocumentColorSpace.RGB) {        // Execute the internal menu command to convert to CMYK        app.executeMenuCommand('doc-color-cmyk');    }}Use code with caution.Convert Specific Swatches or Object Colors Changing the document profile converts global artboard rendering but individual swatches and objects may still hold unlinked RGB data types. You can target individual components using methods verified on the Adobe Community Forum: Adobe +2Option A: Sample Conversion MethodUse app.convertSampleColor() to accurately translate data profiles based on the native Adobe Color Engine: Adobe +1javascript// Define your original RGB color valuesvar rgbArr = [255, 0, 0]; // Pure Red// Convert the RGB values to CMYK values using the built-in application enginevar cmykValues = app.convertSampleColor(ImageColorSpace.RGB, rgbArr, ImageColorSpace.CMYK, ColorConvertPurpose.defaultpurpose);// Apply to a new CMYKColor object instancevar newCmykColor = new CMYKColor();newCmykColor.cyan = cmykValues[0];newCmykColor.magenta = cmykValues[1];newCmykColor.yellow = cmykValues[2];newCmykColor.black = cmykValues[3];Use code with caution.Option B: Clean Document SwatchesIf you want to cycle through and force-redefine saved color swatches directly inside the swatches panel: Adobejavascriptvar docSwatches = app.activeDocument.colors;for (var i = 0; i < docSwatches.length; i++) {    try {        // Shift the container space property directly to CMYK        docSwatches[i].space = ColorSpace.CMYK;    } catch(e) {        // Ignore locked or unconvertible system elements    }}Use code with caution.If you are dealing with complex artworks, tell me:Are you looking to target embedded raster images or purely vector path geometries?Do you need to convert Spot/Pantone colors to process colors as well? Adobe +3I can customize a script loop to sweep across all compound layer items.9 sitesIllustrator script that will convert all SPOT colors to Process (CMYK)11-Sept-2023 — does anybody have a script that will convert all spot colors in an illustrator doc to process... and after that i willl need to co...AdobeColor conversion script? - Adobe Community10-May-2016 — I tried changing the 'typename' of the Color object, which I've seen suggested, but it made no difference (the docs do say it is r...AdobeConvert RGB to CMYK Illustrator CS4 js - Adobe Community23-Jun-2010 — 3 replies. Hi, I need to convert RGB ai file to CMYK mode. I tried: myDoc. documentColorSpace = DocumentColorSpace. CMYK; I realiz...AdobeChange RGB color to CMYK color via Javascript - Adobe Community08-May-2008 — 6 replies. ... Is there any way to find the mode in the illustrator file via script? ... Thanks Larry. But I can't find any OpenOp...Adobergb to cmyk script - Adobe Community22-Aug-2018 — Try this, note that the conversion numbers depend on your document's assigned RGB and CMYK profiles: * 1var c=app.activeDocument.c...AdobeRGB to CMYK with Actions - Google GroupsConverting an RGB EPS to CMYK is not the issue. Having Actions save the menu command "File->Document Color Mode->CMYK Color" as an...Google GroupsChanging document color mode from RGB to CMYK? - Reddit01-Jan-2025 — Just do the conversion on export. Make a custom PDF export. Title it "EXPORT USING THIS ONE" Save the export settings. For pure ve...Reddit·r/AdobeIllustratorShow all"""
response_text: |
  I have updated `Backend/scripts/automate_production.jsx` to force all objects in the production document to be CMYK by adding a `forceCmykRecursive` call on the document's page items after the initial setup. This ensures that even if objects were brought over as RGB, they are converted to CMYK during the production process.
