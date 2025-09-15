## Overview

This Python script performs basic linting on JSON annotation files used in labeling tasks (e.g., via Starfleet). It checks for:
- Mismatches between `aspect_ratings` and `model_issues` tables.
- Inconsistencies in base response ratings (e.g., rating 7 with issues present).
- Preference consistency with issues (e.g., no preferring a response with issues over one without).

It loads `input.json` from the same directory and outputs errors or a success message for each entry (handles single objects or arrays).

## How to Obtain input.json
- Open the task in Google Chrome.
- Open DevTools (F12 or right-click > Inspect), go to the Network tab.
- Refresh the page, if Network tab is empty.
- Look for requests named `annotation` (in labeling state) or `history` (when observing the task).
- Copy the JSON response body and save it as `input.json` in the script's directory.

## Usage
1. Place the JSON file as `input.json` in the same directory as the script.
2. Run the script:
   ```
   python lint.py
   ```
3. Review the console output for linting errors.

The JSON should include keys like `base_response`, `responses`, `aspect_ratings`, and `model_issues`.

## Notes
- Always double-check results manually.
- If issues arise or for suggestions/bugs, contact mbasaran@teachx.ai