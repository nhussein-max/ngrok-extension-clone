# L1 Patch Validator

A Chrome browser extension with a local Python server for validating code patches in Docker/Podman containers. Automatically captures annotation data from task pages and validates that patches apply correctly and pass tests.

## Features

- **Automatic Data Capture**: Intercepts annotation data containing Dockerfiles, patches, and test scripts
- **Container-Based Validation**: Builds Docker containers and applies patches in isolated environments
- **Two Validation Modes**:
  - **Check Patches Apply** (fast): Only verifies patches apply cleanly with `git apply`
  - **Run Full Validation** (thorough): Applies patches and runs test scripts
- **Detailed Results**: Color-coded patch status with expandable test output
- **Tab-Specific State**: Each browser tab maintains its own validation data

## Requirements

- **Python 3.8+**
- **Docker** or **Podman** (for container builds)
- **Chrome** or Chromium-based browser

## Installation

### 1. Install the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select this folder
4. The extension icon will appear in your browser toolbar

### 2. Set Up the Python Server

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On macOS/Linux
# or: venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt
```

### 3. Start the Server

```bash
source venv/bin/activate
python server.py
```

The server runs on `http://127.0.0.1:5050`. Keep it running while using the extension.

## Usage

1. **Navigate to a task page** containing annotation data with:
   - `dockerfile`: The Dockerfile to build the test environment
   - `test_scripts`: Shell script(s) to run tests
   - `*_diff` or `*_patch` fields: Code patches to validate

2. **Open the extension popup** by clicking the extension icon

3. **View loaded data**: The popup shows what was captured:
   - Dockerfile status (loaded/missing)
   - Test Scripts status (loaded/missing)
   - Detected patches

4. **Run validation**:
   - **Check Patches Apply**: Quick check that patches apply cleanly
   - **Run Full Validation**: Apply patches and run test scripts

5. **Review results**:
   - **Green (checkmark)**: Patch applies (and tests pass, if running full validation)
   - **Yellow (warning)**: Patch applies but tests fail
   - **Red (X)**: Patch fails to apply
   - Click on any patch to view detailed test output

## Status Indicators

| Icon | Color | Meaning |
|------|-------|---------|
| checkmark | Green | Patch applies cleanly / Tests pass |
| warning | Yellow | Patch applies but tests fail |
| X | Red | Patch failed to apply |

## How It Works

1. **Data Capture**: The extension injects a script that intercepts network requests containing annotation data

2. **Container Build**: When you run validation, the server builds a Docker container from the provided Dockerfile

3. **Patch Validation**: For each patch:
   - Apply the patch using `git apply`
   - Run test scripts (if full validation)
   - Revert the patch with `git apply -R`
   - Record results

4. **Results Display**: The popup shows per-patch results with clickable details

## API Endpoints

The validation server exposes:

- `GET /health` - Server health check
- `POST /validate` - Validate all patches in annotation data
- `POST /validate?check_only=true` - Only check if patches apply
- `POST /validate-single` - Validate a single patch

## Troubleshooting

**Server Offline**: Make sure `server.py` is running and accessible at `http://127.0.0.1:5050`

**No Data Loaded**: Navigate to a task page that contains annotation data with the required fields

**Container Build Failed**: Check that Docker/Podman is running and the Dockerfile is valid

**Patch Failed to Apply**: The patch may have conflicts or target files that don't exist in the container

## File Structure

```
L1-check/
├── manifest.json      # Extension manifest
├── background.js      # Service worker (handles validation requests)
├── content.js         # Content script (bridges injected script to extension)
├── injected.js        # Injected script (captures network requests)
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
├── server.py          # Python validation server
├── requirements.txt   # Python dependencies
└── README.md          # This file
```

## Contact

For issues or suggestions, contact mbasaran@teachx.ai
