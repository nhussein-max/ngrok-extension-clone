# L1 Annotation Linter Browser Extension

A Chrome extension that automatically validates JSON annotation files used in ML model evaluation tasks, eliminating the need for manual JSON extraction from DevTools.

## Features

- **Automatic Detection**: Monitors network requests for annotation data (`annotation` and `history` endpoints)
- **Real-time Validation**: Automatically lints annotation data as it loads
- **Visual Feedback**: Shows validation results with on-page notifications and extension badge
- **Comprehensive Checks**: 
  - Aspect ratings vs model issues table consistency
  - Base response rating validation 
  - Preference consistency with issues
  - Prevents mixing "no_issues" with other issues
- **Manual Controls**: Popup interface for viewing detailed results and exporting data

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select the `extension` folder
4. The extension will appear in your extensions list

## Usage

1. Navigate to your ML annotation interface
2. The extension automatically monitors for annotation data
3. When annotation data is detected, it's automatically validated
4. Results are shown via:
   - On-page notification (top-right corner)
   - Extension badge (green ✓ for success, red number for error count)
   - Detailed popup (click extension icon)

## Manual Actions

- **Manual Lint**: Click the extension icon and use "Manual Lint" to re-validate current data
- **Export Data**: Save the current annotation JSON data to a file for offline analysis

## Validation Rules

The extension performs the same validation checks as the original Python script:

1. **Table Consistency**: Ensures aspect_ratings and model_issues tables match in structure and logic
2. **Rating Validation**: Checks that base response ratings align with identified issues
3. **Preference Logic**: Validates that preference rankings are consistent with issue presence
4. **Issue Conflicts**: Prevents "no_issues" from being combined with other issue types

## Development

The extension consists of:
- `manifest.json`: Extension configuration
- `content.js`: Content script for DOM interaction
- `injected.js`: Network request interception
- `background.js`: Background processing and storage
- `linter.js`: Core validation logic (ported from Python)
- `popup.html/js`: User interface

## Troubleshooting

- Ensure the extension has permissions for the annotation website
- Check browser console for any error messages
- If automatic detection fails, use the manual lint feature
- Verify that annotation data contains required fields: `base_response`, `responses`, `model_issues`, `aspect_ratings`

## Notes

- The extension works with both fetch() and XMLHttpRequest network calls
- Annotation data is temporarily stored locally for the popup interface
- All validation happens locally in the browser - no data is sent to external servers
