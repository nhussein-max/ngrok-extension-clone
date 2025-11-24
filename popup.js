// Popup script for L1 Patch Validator

let serverConnected = false;
let isValidating = false;

document.addEventListener('DOMContentLoaded', function() {
    // Check server status
    checkServerStatus();

    // Load stored annotation data
    loadStoredData();

    // Setup run buttons
    const runButton = document.getElementById('run-button');
    const checkButton = document.getElementById('check-button');

    if (runButton) {
        runButton.addEventListener('click', () => runValidation(false));
    }
    if (checkButton) {
        checkButton.addEventListener('click', () => runValidation(true));
    }
});

function checkServerStatus() {
    const serverStatusEl = document.getElementById('server-status');

    chrome.runtime.sendMessage({ type: 'CHECK_SERVER_STATUS' }, function(response) {
        if (chrome.runtime.lastError) {
            updateServerStatus(false);
            return;
        }
        updateServerStatus(response && response.connected);
    });
}

function updateServerStatus(connected) {
    serverConnected = connected;
    const serverStatusEl = document.getElementById('server-status');
    if (serverStatusEl) {
        serverStatusEl.className = `server-status ${connected ? 'connected' : 'disconnected'}`;
        serverStatusEl.textContent = connected ? 'Server: Online' : 'Server: Offline';
    }
    updateRunButton();
}

function loadStoredData() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTabId = tabs[0].id;
        const tabKey = `annotationData_${currentTabId}`;
        const resultsKey = `lintResults_${currentTabId}`;

        chrome.storage.local.get([tabKey, resultsKey], function(result) {
            if (result[tabKey]) {
                displayLoadedData(result[tabKey]);
            }
            if (result[resultsKey]) {
                displayResults(result[resultsKey], result[resultsKey].checkOnly);
            }
        });
    });
}

function extractValue(field) {
    if (field && typeof field === 'object' && '_sf_rich' in field) {
        return field.value || '';
    }
    return field || '';
}

function displayLoadedData(data) {
    const noDataEl = document.getElementById('no-data');
    const loadedDataEl = document.getElementById('loaded-data');
    const runSectionEl = document.getElementById('run-section');

    // Extract values
    const dockerfile = extractValue(data.dockerfile);
    const testScripts = extractValue(data.test_scripts);

    // Find patches
    const patchKeys = Object.keys(data).filter(key =>
        key.endsWith('_diff') || key.endsWith('_patch')
    ).filter(key => {
        const value = extractValue(data[key]);
        return value && value !== 'NA';
    });

    // Check if we have any data
    const hasDockerfile = !!dockerfile;
    const hasTestScripts = !!testScripts;
    const hasPatches = patchKeys.length > 0;
    const hasAnyData = hasDockerfile || hasTestScripts || hasPatches;

    if (!hasAnyData) {
        noDataEl.classList.remove('hidden');
        loadedDataEl.classList.add('hidden');
        runSectionEl.classList.add('hidden');
        return;
    }

    // Show loaded data section
    noDataEl.classList.add('hidden');
    loadedDataEl.classList.remove('hidden');
    runSectionEl.classList.remove('hidden');

    // Update dockerfile status
    const dockerfileIcon = document.getElementById('dockerfile-icon');
    const dockerfileStatus = document.getElementById('dockerfile-status');
    if (hasDockerfile) {
        dockerfileIcon.textContent = '✓';
        dockerfileIcon.className = 'data-icon loaded';
        dockerfileStatus.textContent = 'Loaded';
        dockerfileStatus.className = 'data-status loaded';
    } else {
        dockerfileIcon.textContent = '✗';
        dockerfileIcon.className = 'data-icon missing';
        dockerfileStatus.textContent = 'Missing';
        dockerfileStatus.className = 'data-status missing';
    }

    // Update test scripts status
    const testscriptsIcon = document.getElementById('testscripts-icon');
    const testscriptsStatus = document.getElementById('testscripts-status');
    if (hasTestScripts) {
        testscriptsIcon.textContent = '✓';
        testscriptsIcon.className = 'data-icon loaded';
        testscriptsStatus.textContent = 'Loaded';
        testscriptsStatus.className = 'data-status loaded';
    } else {
        testscriptsIcon.textContent = '✗';
        testscriptsIcon.className = 'data-icon missing';
        testscriptsStatus.textContent = 'Missing';
        testscriptsStatus.className = 'data-status missing';
    }

    // Update patches status
    const patchesIcon = document.getElementById('patches-icon');
    const patchesStatus = document.getElementById('patches-status');
    const patchesList = document.getElementById('patches-list');

    if (hasPatches) {
        patchesIcon.textContent = '✓';
        patchesIcon.className = 'data-icon loaded';
        patchesStatus.textContent = `${patchKeys.length} found`;
        patchesStatus.className = 'data-status loaded';

        // Show patch names
        patchesList.classList.remove('hidden');
        patchesList.innerHTML = patchKeys.map(key => {
            const name = key.replace('_diff', '').replace('_patch', '');
            return `<span class="patch-tag">${escapeHtml(name)}</span>`;
        }).join('');
    } else {
        patchesIcon.textContent = '✗';
        patchesIcon.className = 'data-icon missing';
        patchesStatus.textContent = '0 found';
        patchesStatus.className = 'data-status missing';
        patchesList.classList.add('hidden');
    }

    updateRunButton();
}

function updateRunButton() {
    const runButton = document.getElementById('run-button');
    const checkButton = document.getElementById('check-button');

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTabId = tabs[0].id;
        const tabKey = `annotationData_${currentTabId}`;

        chrome.storage.local.get([tabKey], function(result) {
            const data = result[tabKey];

            if (!data) {
                if (runButton) {
                    runButton.className = 'run-button disabled';
                    runButton.textContent = 'No Data Loaded';
                    runButton.disabled = true;
                }
                if (checkButton) {
                    checkButton.className = 'run-button disabled';
                    checkButton.textContent = 'No Data Loaded';
                    checkButton.disabled = true;
                }
                return;
            }

            const dockerfile = extractValue(data.dockerfile);
            const testScripts = extractValue(data.test_scripts);

            // Check button only needs dockerfile
            if (checkButton) {
                if (isValidating) {
                    checkButton.className = 'run-button running';
                    checkButton.textContent = 'Checking...';
                    checkButton.disabled = true;
                    checkButton.style.background = '#6c757d';
                } else if (!serverConnected) {
                    checkButton.className = 'run-button disabled';
                    checkButton.textContent = 'Server Offline';
                    checkButton.disabled = true;
                    checkButton.style.background = '';
                } else if (!dockerfile) {
                    checkButton.className = 'run-button disabled';
                    checkButton.textContent = 'No Dockerfile';
                    checkButton.disabled = true;
                    checkButton.style.background = '';
                } else {
                    checkButton.className = 'run-button ready';
                    checkButton.textContent = 'Check Patches Apply';
                    checkButton.disabled = false;
                    checkButton.style.background = '#17a2b8';
                }
            }

            // Run button needs dockerfile + test scripts
            if (runButton) {
                if (isValidating) {
                    runButton.className = 'run-button running';
                    runButton.textContent = 'Validating...';
                    runButton.disabled = true;
                } else if (!serverConnected) {
                    runButton.className = 'run-button disabled';
                    runButton.textContent = 'Server Offline';
                    runButton.disabled = true;
                } else if (!dockerfile || !testScripts) {
                    runButton.className = 'run-button disabled';
                    runButton.textContent = 'Missing Dockerfile or Tests';
                    runButton.disabled = true;
                } else {
                    runButton.className = 'run-button ready';
                    runButton.textContent = 'Run Full Validation';
                    runButton.disabled = false;
                }
            }
        });
    });
}

function runValidation(checkOnly = false) {
    if (isValidating || !serverConnected) return;

    isValidating = true;
    updateRunButton();

    // Show running status
    const statusEl = document.getElementById('status');
    statusEl.classList.remove('hidden');
    statusEl.className = 'status waiting';
    statusEl.innerHTML = `
        <div class="status-icon">⏳</div>
        <div class="status-text">${checkOnly ? 'Checking patches...' : 'Running validation...'}</div>
    `;

    // Clear previous results
    document.getElementById('patch-results').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('test-output-section').classList.add('hidden');

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTabId = tabs[0].id;

        chrome.runtime.sendMessage({
            type: 'RUN_VALIDATION',
            tabId: currentTabId,
            checkOnly: checkOnly
        }, function(response) {
            isValidating = false;
            updateRunButton();

            if (chrome.runtime.lastError) {
                showError('Failed to run validation: ' + chrome.runtime.lastError.message);
                return;
            }

            if (response && response.success !== undefined) {
                displayResults(response, checkOnly);
            } else if (response && response.error) {
                showError(response.error);
            }
        });
    });
}

function showError(message) {
    const statusEl = document.getElementById('status');
    statusEl.classList.remove('hidden');
    statusEl.className = 'status error';
    statusEl.innerHTML = `
        <div class="status-icon">❌</div>
        <div class="status-text">${escapeHtml(message)}</div>
    `;
}

function displayResults(results, checkOnly = false) {
    const { errors, success, timestamp, patchResults, validationType } = results;

    const statusEl = document.getElementById('status');
    const patchResultsEl = document.getElementById('patch-results');
    const patchListEl = document.getElementById('patch-list');
    const resultsEl = document.getElementById('results');
    const errorsEl = document.getElementById('errors');
    const timestampEl = document.getElementById('timestamp');

    // Update status with detailed breakdown
    statusEl.classList.remove('hidden');

    if (patchResults && patchResults.length > 0) {
        const appliedCount = patchResults.filter(p => p.applied).length;
        const failedToApply = patchResults.filter(p => !p.applied).length;
        const testsPassedCount = patchResults.filter(p => p.applied && p.tests_passed === true).length;
        const testsFailedCount = patchResults.filter(p => p.applied && p.tests_passed === false).length;
        const totalCount = patchResults.length;

        if (checkOnly) {
            // Check-only mode
            if (appliedCount === totalCount) {
                statusEl.className = 'status success';
                statusEl.innerHTML = `
                    <div class="status-icon">✅</div>
                    <div class="status-text">All ${appliedCount} patches apply cleanly!</div>
                `;
            } else {
                statusEl.className = 'status error';
                statusEl.innerHTML = `
                    <div class="status-icon">❌</div>
                    <div class="status-text">${failedToApply}/${totalCount} patches failed to apply</div>
                `;
            }
        } else {
            // Full validation mode - show breakdown
            let statusHtml = '';

            if (failedToApply > 0) {
                statusEl.className = 'status error';
                statusHtml = `<div class="status-icon">❌</div>
                    <div class="status-text">${failedToApply} failed to apply`;
            } else if (testsFailedCount > 0) {
                statusEl.className = 'status warning';
                statusHtml = `<div class="status-icon">⚠️</div>
                    <div class="status-text">${appliedCount}/${totalCount} apply, ${testsFailedCount} tests failed`;
            } else {
                statusEl.className = 'status success';
                statusHtml = `<div class="status-icon">✅</div>
                    <div class="status-text">All ${testsPassedCount} patches passed!</div>`;
            }

            statusEl.innerHTML = statusHtml + '</div>';
        }
    } else if (errors && errors.length > 0) {
        statusEl.className = 'status error';
        statusEl.innerHTML = `
            <div class="status-icon">❌</div>
            <div class="status-text">${errors.length} error${errors.length === 1 ? '' : 's'}</div>
        `;
    }

    // Show patch results
    if (patchResults && patchResults.length > 0) {
        patchResultsEl.classList.remove('hidden');
        patchListEl.innerHTML = '';

        for (const patch of patchResults) {
            const patchName = patch.patch_key.replace('_diff', '').replace('_patch', '');

            // Determine status based on mode
            // - passed (green): applies + tests pass (or check-only mode applies)
            // - warning (yellow): applies but tests fail
            // - failed (red): doesn't apply
            let statusClass, statusIcon, statusText;

            if (!patch.applied) {
                // Failed to apply = red
                statusClass = 'failed';
                statusIcon = '✗';
                statusText = 'Failed to apply';
            } else if (patch.tests_passed === null) {
                // Check-only mode, applied = green
                statusClass = 'passed';
                statusIcon = '✓';
                statusText = 'Applies cleanly';
            } else if (patch.tests_passed) {
                // Applied + tests passed = green
                statusClass = 'passed';
                statusIcon = '✓';
                statusText = 'Tests passed';
            } else {
                // Applied but tests failed = yellow warning
                statusClass = 'warning';
                statusIcon = '⚠';
                statusText = 'Applied but tests failed';
            }

            const hasOutput = patch.test_output && patch.test_output.trim();

            const patchEl = document.createElement('div');
            patchEl.className = `patch-item ${statusClass}`;
            patchEl.innerHTML = `
                <span class="patch-icon">${statusIcon}</span>
                <span class="patch-name">${escapeHtml(patchName)}</span>
                <span class="patch-status">${statusText}</span>
                ${patch.applied ? `<button class="vscode-btn" data-patch-key="${escapeHtml(patch.patch_key)}">VS Code</button>` : ''}
            `;

            // Add click handler for test output
            if (hasOutput) {
                patchEl.querySelector('.patch-name').style.cursor = 'pointer';
                patchEl.querySelector('.patch-name').addEventListener('click', () => {
                    showTestOutput(patchName, patch.test_output);
                });
            }

            // Add click handler for VS Code button
            const vscodeBtn = patchEl.querySelector('.vscode-btn');
            if (vscodeBtn) {
                vscodeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openPatchInVSCode(patch.patch_key, vscodeBtn);
                });
            }

            patchListEl.appendChild(patchEl);
        }
    } else {
        patchResultsEl.classList.add('hidden');
    }

    // Show errors if any
    resultsEl.classList.remove('hidden');
    if (!success && errors && errors.length > 0) {
        const errorList = errors.map(error => `- ${escapeHtml(error)}`).join('\n');
        errorsEl.innerHTML = `<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; margin: 0; background: #f8f9fa; padding: 12px; border-radius: 4px; border: 1px solid #e9ecef;">${errorList}</pre>`;
    } else {
        errorsEl.innerHTML = '';
    }

    // Timestamp
    if (timestamp) {
        const date = new Date(timestamp);
        timestampEl.textContent = `Last validated: ${date.toLocaleString()}`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTestOutput(patchName, output) {
    const section = document.getElementById('test-output-section');
    const title = document.getElementById('test-output-title');
    const outputEl = document.getElementById('test-output');
    const closeBtn = document.getElementById('test-output-close');

    title.textContent = `Test Output: ${patchName}`;
    outputEl.textContent = output;
    section.classList.remove('hidden');

    closeBtn.onclick = () => {
        section.classList.add('hidden');
    };
}

function openPatchInVSCode(patchKey, button) {
    // Disable button while loading
    button.disabled = true;
    button.textContent = 'Opening...';

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTabId = tabs[0].id;

        chrome.runtime.sendMessage({
            type: 'OPEN_PATCH_IN_VSCODE',
            tabId: currentTabId,
            patchKey: patchKey
        }, function(response) {
            if (chrome.runtime.lastError) {
                button.textContent = 'Error';
                setTimeout(() => {
                    button.textContent = 'VS Code';
                    button.disabled = false;
                }, 2000);
                return;
            }

            if (response && response.success) {
                button.textContent = 'Opened!';
                setTimeout(() => {
                    button.textContent = 'VS Code';
                    button.disabled = false;
                }, 2000);
            } else {
                button.textContent = 'Error';
                console.error('Failed to open in VS Code:', response?.error);
                setTimeout(() => {
                    button.textContent = 'VS Code';
                    button.disabled = false;
                }, 2000);
            }
        });
    });
}

// Listen for storage changes
chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'local') {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTabId = tabs[0].id;
            const dataKey = `annotationData_${currentTabId}`;
            const resultsKey = `lintResults_${currentTabId}`;

            if (changes[dataKey]) {
                displayLoadedData(changes[dataKey].newValue);
            }
            if (changes[resultsKey]) {
                const newResults = changes[resultsKey].newValue;
                displayResults(newResults, newResults.checkOnly);
            }
        });
    }
});
