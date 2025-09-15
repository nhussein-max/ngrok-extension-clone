## Overview

This repository contains both a Python script and a Chrome browser extension for linting JSON annotation files used in ML model evaluation tasks. Both tools perform the same validation checks:

- Mismatches between `aspect_ratings` and `model_issues` tables.
- Inconsistencies in base response ratings (e.g., rating 7 with issues present).
- Preference consistency with issues (e.g., no preferring a response with issues over one without).
- Cannot have an issue and "No Issues" chosen simultaneously on model issues table.

## Python Script

The Python script loads `input.json` from the same directory and outputs errors or a success message for each entry (handles single objects or arrays).

## Browser Extension

The Chrome extension automatically detects and validates annotation data in real-time, eliminating the need for manual JSON extraction. It provides:
- **Automatic detection** of annotation and history endpoints
- **Real-time validation** with visual feedback
- **Tab-specific results** for multiple annotation tasks
- **Copy/export functionality** for results and data

## Installation & Usage

### Chrome Extension (Recommended)

1. **Install the Extension:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked" and select the `extension` folder
   - The extension will appear in your extensions list

2. **Usage:**
   - Navigate to your annotation interface
   - The extension automatically detects annotation data
   - View results via on-page notifications or click the extension icon
   - Use "Copy Results" to get formatted output
   - Each browser tab maintains its own validation state

The JSON should include keys like `base_response`, `responses`, `aspect_ratings`, and `model_issues`.

## Features Comparison

| Feature | Python Script | Chrome Extension |
|---------|---------------|------------------|
| Manual JSON extraction | ✅ Required | ❌ Automatic |
| Real-time validation | ❌ | ✅ |
| Visual feedback | ❌ | ✅ |
| Tab-specific results | ❌ | ✅ |
| Copy formatted results | ❌ | ✅ |
| Export raw data | ❌ | ✅ |
| Works offline | ✅ | ❌ |

## Output Format

Both tools produce identical output:
```
- Error message 1
- Error message 2
```
or
```
No issues found.
```

## Extension Features

- **Automatic Detection**: Monitors `annotation` and `history` endpoints
- **Array Handling**: Uses last annotation from history arrays
- **Tab Isolation**: Each browser tab maintains separate validation state
- **Visual Feedback**: On-page notifications and extension badge
- **Copy/Export**: Easy copying of results and raw data export

## Notes
- Always double-check results manually.
- The extension requires annotation data to contain required fields: `base_response`, `responses`, `aspect_ratings`, `model_issues`
- For multiple annotations (arrays), the extension uses the most recent (last) entry
- If issues arise or for suggestions/bugs, contact mbasaran@teachx.ai