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

    // Setup More Info toggle
    const moreInfoToggle = document.getElementById('more-info-toggle');
    if (moreInfoToggle) {
        moreInfoToggle.addEventListener('click', toggleMoreInfo);
    }

    // Setup Fetch Data button
    const fetchDataBtn = document.getElementById('fetch-data-btn');
    if (fetchDataBtn) {
        fetchDataBtn.addEventListener('click', fetchDataFromPage);
    }

    // Setup Reload Data button
    const reloadDataBtn = document.getElementById('reload-data-btn');
    if (reloadDataBtn) {
        reloadDataBtn.addEventListener('click', reloadPageData);
    }
});

function reloadPageData() {
    const reloadBtn = document.getElementById('reload-data-btn');
    if (reloadBtn) {
        reloadBtn.disabled = true;
        reloadBtn.textContent = '⏳';
    }

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs || tabs.length === 0) {
            console.log('No active tab found');
            if (reloadBtn) {
                reloadBtn.disabled = false;
                reloadBtn.textContent = '🔄';
            }
            return;
        }

        const tab = tabs[0];

        // Try to inject content script first (in case it's not loaded yet)
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        }).then(() => {
            console.log('Content script injected/verified');
            // Wait a moment for content script to initialize
            setTimeout(() => {
                sendMessageToContentScript(tab.id, reloadBtn);
            }, 100);
        }).catch((error) => {
            console.log('Could not inject content script:', error);
            // Content script might already be loaded, try sending message anyway
            sendMessageToContentScript(tab.id, reloadBtn);
        });
    });
}

function sendMessageToContentScript(tabId, reloadBtn) {
    // Send message to content script to trigger data extraction
    chrome.tabs.sendMessage(tabId, {
        type: 'TRIGGER_PAGE_DATA_EXTRACTION'
    }, function(response) {
        // Check for errors (content script not available)
        if (chrome.runtime.lastError) {
            console.log('Content script not available:', chrome.runtime.lastError.message);
            console.log('Try refreshing the page first, then use this button');
            if (reloadBtn) {
                reloadBtn.disabled = false;
                reloadBtn.textContent = '🔄';
            }
            // Just reload any existing stored data
            loadStoredData();
            return;
        }

        if (reloadBtn) {
            reloadBtn.disabled = false;
            reloadBtn.textContent = '🔄';
        }

        if (response && response.success) {
            console.log('Data extraction successful');
            // Data extraction was triggered, UI will update via storage changes
            setTimeout(() => loadStoredData(), 500); // Small delay to allow data to be stored
        } else {
            console.log('Failed to trigger page data extraction');
        }
    });
}

function fetchDataFromPage() {
    const fetchBtn = document.getElementById('fetch-data-btn');
    if (fetchBtn) {
        fetchBtn.textContent = 'Fetching...';
        fetchBtn.disabled = true;
    }

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const tab = tabs[0];

        // Send message to background to fetch data from page
        chrome.runtime.sendMessage({
            type: 'FETCH_PAGE_DATA',
            tabId: tab.id,
            url: tab.url
        }, function(response) {
            if (fetchBtn) {
                fetchBtn.textContent = 'Fetch Data from Page';
                fetchBtn.disabled = false;
            }

            if (response && response.success) {
                // Data will be stored and UI will update via storage listener
                loadStoredData();
            } else {
                alert(response?.error || 'Failed to fetch data from page');
            }
        });
    });
}

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
    const taskLabelsEl = document.getElementById('task-labels');

    // Extract values
    const dockerfile = extractValue(data.dockerfile);
    const testScripts = extractValue(data.test_scripts);

    // Extract task metadata
    const language = extractValue(data.language);
    const promptCategory = extractValue(data.prompt_category);
    const promptType = extractValue(data.prompt_type);

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

    // Display task labels
    let labelsHtml = '';
    if (language) {
        labelsHtml += `<span class="task-label language"><span class="task-label-icon">💻</span>${escapeHtml(language)}</span>`;
    }
    if (promptCategory) {
        const categoryDisplay = formatCategoryName(promptCategory);
        labelsHtml += `<span class="task-label category"><span class="task-label-icon">📁</span>${escapeHtml(categoryDisplay)}</span>`;
    }
    if (promptType) {
        const typeDisplay = formatTypeName(promptType);
        labelsHtml += `<span class="task-label type"><span class="task-label-icon">🏷️</span>${escapeHtml(typeDisplay)}</span>`;
    }
    taskLabelsEl.innerHTML = labelsHtml;
    taskLabelsEl.style.display = labelsHtml ? 'flex' : 'none';

    // Update dockerfile status
    const dockerfileIcon = document.getElementById('dockerfile-icon');
    dockerfileIcon.textContent = hasDockerfile ? '✓' : '✗';
    dockerfileIcon.className = `data-icon ${hasDockerfile ? 'loaded' : 'missing'}`;

    // Update test scripts status
    const testscriptsIcon = document.getElementById('testscripts-icon');
    testscriptsIcon.textContent = hasTestScripts ? '✓' : '✗';
    testscriptsIcon.className = `data-icon ${hasTestScripts ? 'loaded' : 'missing'}`;

    // Update patches status
    const patchesIcon = document.getElementById('patches-icon');
    const patchesStatus = document.getElementById('patches-status');
    const patchesList = document.getElementById('patches-list');

    patchesIcon.textContent = hasPatches ? '✓' : '✗';
    patchesIcon.className = `data-icon ${hasPatches ? 'loaded' : 'missing'}`;
    patchesStatus.textContent = patchKeys.length.toString();
    patchesStatus.className = `data-status ${hasPatches ? 'loaded' : 'missing'}`;

    if (hasPatches) {
        patchesList.classList.remove('hidden');

        // Check if gold_patch exists for similarity calculation
        const hasGoldPatch = data.gold_patch;
        const goldPatchContent = hasGoldPatch ? extractValue(data.gold_patch) : null;
        const isGoldPatchValid = goldPatchContent && goldPatchContent !== 'NA';

        patchesList.innerHTML = patchKeys.map(key => {
            const name = key.replace('_diff', '').replace('_patch', '');
            let similarityBadge = '';

            // Calculate similarity if gold_patch exists
            if (isGoldPatchValid) {
                try {
                    const patchContent = extractValue(data[key]);
                    if (patchContent && patchContent !== 'NA') {
                        const similarity = calculateDiffSimilarity(goldPatchContent, patchContent);

                        // Determine color class
                        let colorClass = '';
                        if (similarity >= 80) colorClass = 'high';
                        else if (similarity >= 50) colorClass = 'medium';
                        else colorClass = 'low';

                        similarityBadge = ` <span class="patch-tag-similarity ${colorClass}">${similarity}%</span>`;
                    }
                } catch (error) {
                    console.error(`Error calculating similarity for ${name}:`, error);
                }
            }

            return `<span class="patch-tag">${escapeHtml(name)}${similarityBadge}</span>`;
        }).join('');
    } else {
        patchesList.classList.add('hidden');
    }

    // Display More Info (rubrics, ranking explanation)
    displayMoreInfo(data);

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
            console.log('Data loaded:', data);
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
    document.getElementById('validation-summary').classList.add('hidden');

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

/**
 * Calculate diff similarity between golden patch and model patch
 * Based on line-by-line comparison algorithm
 * @param {string} goldenDiff - The reference/golden patch content
 * @param {string} modelDiff - The patch to compare against golden
 * @returns {number} Similarity percentage (0-100)
 */
function calculateDiffSimilarity(goldenDiff, modelDiff) {
    // Handle edge cases
    if (!goldenDiff || !modelDiff) return 0;
    if (goldenDiff === modelDiff) return 100;

    // Split into lines and normalize (trim whitespace, filter empty lines)
    const goldenLines = goldenDiff.split('\n').map(line => line.trim()).filter(line => line);
    const modelLines = modelDiff.split('\n').map(line => line.trim()).filter(line => line);

    // Handle empty diffs
    if (goldenLines.length === 0) return modelLines.length === 0 ? 100 : 0;
    if (modelLines.length === 0) return 0;

    // Create frequency map for model lines (handle duplicates)
    const modelLineMap = new Map();
    modelLines.forEach(line => {
        modelLineMap.set(line, (modelLineMap.get(line) || 0) + 1);
    });

    // Count unmatched lines from golden diff
    let unmatchedCount = 0;
    for (const goldenLine of goldenLines) {
        const count = modelLineMap.get(goldenLine) || 0;
        if (count > 0) {
            // Line matched, decrement count
            modelLineMap.set(goldenLine, count - 1);
        } else {
            // Line not found in model
            unmatchedCount++;
        }
    }

    // Calculate similarity: (matched lines) / (total golden lines) * 100
    const similarity = ((goldenLines.length - unmatchedCount) / goldenLines.length) * 100;
    return Math.round(similarity);
}

function displayResults(results, checkOnly = false) {
    // Fetch annotation data from Chrome storage to enable similarity comparison
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTabId = tabs[0].id;
        const tabKey = `annotationData_${currentTabId}`;

        chrome.storage.local.get([tabKey], function(result) {
            const annotationData = result[tabKey];
            renderResultsWithData(results, checkOnly, annotationData);
        });
    });
}

function renderResultsWithData(results, checkOnly = false, annotationData = null) {
    const { errors, success, timestamp, patchResults, validationType, containerBuilt, containerCached, testsExecuted, baseTestsPassed, baseTestOutput } = results;

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

    // Show validation summary (container and test status)
    const validationSummaryEl = document.getElementById('validation-summary');
    const containerIconEl = document.getElementById('container-icon');
    const containerLabelEl = document.getElementById('container-label');
    const baseTestsIconEl = document.getElementById('base-tests-icon');
    const baseTestsLabelEl = document.getElementById('base-tests-label');
    const testsIconEl = document.getElementById('tests-icon');
    const testsLabelEl = document.getElementById('tests-label');

    if (validationSummaryEl) {
        validationSummaryEl.classList.remove('hidden');

        // Container status
        if (containerBuilt) {
            containerIconEl.textContent = containerCached ? '📦' : '🏗️';
            containerIconEl.className = 'summary-icon success';
            containerLabelEl.textContent = containerCached ? 'Container (cached)' : 'Container Built';
            containerLabelEl.style.cursor = 'default';
            containerLabelEl.onclick = null;
        } else {
            containerIconEl.textContent = '💥';
            containerIconEl.className = 'summary-icon failed';
            containerLabelEl.textContent = 'Container Failed';
            containerLabelEl.style.cursor = 'pointer';
            containerLabelEl.onclick = () => {
                const errorMsg = errors && errors.length > 0 ? errors.join('\n') : 'Unknown error';
                showTestOutput('Container Build Error', errorMsg);
            };
        }

        // Base tests status (tests run before any patches)
        if (checkOnly) {
            baseTestsIconEl.textContent = '⏭️';
            baseTestsIconEl.className = 'summary-icon skipped';
            baseTestsLabelEl.textContent = 'Base Tests Skipped';
            baseTestsLabelEl.style.cursor = 'default';
            baseTestsLabelEl.onclick = null;
        } else if (baseTestsPassed === true) {
            baseTestsIconEl.textContent = '✅';
            baseTestsIconEl.className = 'summary-icon success';
            baseTestsLabelEl.textContent = 'Base Tests Passed';
            baseTestsLabelEl.style.cursor = 'pointer';
            baseTestsLabelEl.onclick = () => {
                showTestOutput('Base Test Output (no patches)', baseTestOutput || 'No output');
            };
        } else if (baseTestsPassed === false) {
            baseTestsIconEl.textContent = '❌';
            baseTestsIconEl.className = 'summary-icon failed';
            baseTestsLabelEl.textContent = 'Base Tests Failed';
            baseTestsLabelEl.style.cursor = 'pointer';
            baseTestsLabelEl.onclick = () => {
                showTestOutput('Base Test Output (no patches)', baseTestOutput || 'No output');
            };
        } else {
            baseTestsIconEl.textContent = '⏭️';
            baseTestsIconEl.className = 'summary-icon skipped';
            baseTestsLabelEl.textContent = 'Base Tests Not Run';
            baseTestsLabelEl.style.cursor = 'default';
            baseTestsLabelEl.onclick = null;
        }

        // Patch tests status - only show if tests actually ran
        const patchTestsItem = testsIconEl.parentElement;
        if (checkOnly || !testsExecuted) {
            // Hide patch tests line - details shown in results below
            patchTestsItem.style.display = 'none';
        } else {
            patchTestsItem.style.display = 'flex';
            testsIconEl.textContent = '🧪';
            testsIconEl.className = 'summary-icon success';
            testsLabelEl.textContent = 'Patch Tests Ran';
        }
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
                <span class="patch-status">${statusText}${hasOutput ? ' (click for details)' : ''}</span>
                ${patch.local_path ? `<button class="vscode-btn">VS Code</button>` : ''}
            `;

            // Add click handler for output (test output or apply error)
            if (hasOutput) {
                patchEl.querySelector('.patch-name').style.cursor = 'pointer';
                patchEl.querySelector('.patch-status').style.cursor = 'pointer';
                const showOutput = () => {
                    const title = patch.applied ? `Test Output: ${patchName}` : `Apply Error: ${patchName}`;
                    showTestOutput(title, patch.test_output);
                };
                patchEl.querySelector('.patch-name').addEventListener('click', showOutput);
                patchEl.querySelector('.patch-status').addEventListener('click', showOutput);
            }

            // Add click handler for VS Code button (instant - opens cached folder)
            const vscodeBtn = patchEl.querySelector('.vscode-btn');
            if (vscodeBtn && patch.local_path) {
                vscodeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openPatchInVSCode(patch.local_path, vscodeBtn);
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

function showTestOutput(titleText, output) {
    const section = document.getElementById('test-output-section');
    const title = document.getElementById('test-output-title');
    const outputEl = document.getElementById('test-output');
    const closeBtn = document.getElementById('test-output-close');

    title.textContent = titleText;
    outputEl.textContent = output;
    section.classList.remove('hidden');

    closeBtn.onclick = () => {
        section.classList.add('hidden');
    };
}

function openPatchInVSCode(localPath, button) {
    // Disable button while opening
    button.disabled = true;
    button.textContent = 'Opening...';

    chrome.runtime.sendMessage({
        type: 'OPEN_PATCH_IN_VSCODE',
        localPath: localPath
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
            }, 1000);
        } else {
            const errorMsg = response?.error || 'Unknown error';
            button.textContent = 'Error';
            button.title = errorMsg;
            console.error('Failed to open in VS Code:', errorMsg);
            alert('VS Code Error: ' + errorMsg);
            setTimeout(() => {
                button.textContent = 'VS Code';
                button.title = '';
                button.disabled = false;
            }, 2000);
        }
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

// More Info toggle
function toggleMoreInfo() {
    const content = document.getElementById('more-info-content');
    const arrow = document.getElementById('more-info-arrow');

    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        arrow.classList.add('expanded');
    } else {
        content.classList.add('hidden');
        arrow.classList.remove('expanded');
    }
}

// Display rubrics and ranking explanation
function displayMoreInfo(data) {
    const moreInfoSection = document.getElementById('more-info-section');
    const dockerfileSection = document.getElementById('dockerfile-section');
    const dockerfileContent = document.getElementById('dockerfile-content');
    const testscriptsSection = document.getElementById('testscripts-section');
    const testscriptsContent = document.getElementById('testscripts-content');
    const rubricsSection = document.getElementById('rubrics-section');
    const rubricsList = document.getElementById('rubrics-list');
    const rubricsCount = document.getElementById('rubrics-count');
    const scoresSection = document.getElementById('scores-section');
    const scoresList = document.getElementById('scores-list');
    const rankingSection = document.getElementById('ranking-section');
    const rankingContent = document.getElementById('ranking-content');

    // Extract dockerfile and test scripts
    const dockerfile = extractValue(data.dockerfile);
    const testScripts = extractValue(data.test_scripts);

    // Extract rubrics
    const rubrics = data.rubrics?.items || [];

    // Extract ranking scores
    const rankingScores = extractValue(data.overall_preference_rating);

    // Extract ranking explanation
    const rankingExplanation = extractValue(data.overall_preference_explanation);

    // Check if we have any info to show
    const hasDockerfile = !!dockerfile;
    const hasTestScripts = !!testScripts;
    const hasRubrics = rubrics.length > 0;
    const hasScores = Array.isArray(rankingScores) && rankingScores.length > 0;
    const hasExplanation = !!rankingExplanation;

    if (!hasDockerfile && !hasTestScripts && !hasRubrics && !hasScores && !hasExplanation) {
        moreInfoSection.classList.add('hidden');
        return;
    }

    moreInfoSection.classList.remove('hidden');

    // Display dockerfile
    if (hasDockerfile) {
        dockerfileSection.classList.remove('hidden');
        dockerfileContent.innerHTML = `<div class="code-block">${escapeHtml(dockerfile)}</div>`;
    } else {
        dockerfileSection.classList.add('hidden');
    }

    // Display test scripts
    if (hasTestScripts) {
        testscriptsSection.classList.remove('hidden');
        testscriptsContent.innerHTML = `<div class="code-block">${escapeHtml(testScripts)}</div>`;
    } else {
        testscriptsSection.classList.add('hidden');
    }

    // Display rubrics
    if (hasRubrics) {
        rubricsSection.classList.remove('hidden');
        rubricsCount.textContent = `(${rubrics.length})`;

        let invalidCount = 0;
        rubricsList.innerHTML = rubrics.map((rubric, index) => {
            const text = rubric.text || '';
            const { type, isValid, cleanText } = parseRubric(text);

            if (!isValid) invalidCount++;

            const itemClass = isValid ? type : 'invalid';
            const tagClass = isValid ? type : 'invalid';
            const tagText = isValid ? `[${type.charAt(0).toUpperCase() + type.slice(1)}]` : '[Missing Tag]';

            let html = `<div class="rubric-item ${itemClass}">`;

            if (!isValid) {
                html += `<div class="rubric-warning">⚠️ Missing [Explicit] or [Implicit] tag</div>`;
            }

            html += `<span class="rubric-tag ${tagClass}">${tagText}</span>`;
            html += `<span>${escapeHtml(cleanText)}</span>`;
            html += `</div>`;

            return html;
        }).join('');

        // Update count with warning if invalid rubrics
        if (invalidCount > 0) {
            rubricsCount.textContent = `(${rubrics.length}, ${invalidCount} invalid)`;
            rubricsCount.style.background = '#f8d7da';
            rubricsCount.style.color = '#721c24';
        } else {
            rubricsCount.style.background = '';
            rubricsCount.style.color = '';
        }
    } else {
        rubricsSection.classList.add('hidden');
    }

    // Display ranking scores
    if (hasScores) {
        scoresSection.classList.remove('hidden');
        scoresList.innerHTML = rankingScores.map(score => {
            const name = formatModelName(score.id || '');
            const rating = score.rating || 0;
            return `
                <div class="score-item">
                    <span class="score-name">${escapeHtml(name)}</span>
                    <span class="score-value score-${rating}">${rating}</span>
                </div>
            `;
        }).join('');
    } else {
        scoresSection.classList.add('hidden');
    }

    // Display ranking explanation
    if (hasExplanation) {
        rankingSection.classList.remove('hidden');
        rankingContent.textContent = rankingExplanation;
    } else {
        rankingSection.classList.add('hidden');
    }
}

// Format model name from id (e.g., "response_grok_a" -> "Grok A")
function formatModelName(id) {
    return id
        .replace('response_', '')
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Parse rubric text to extract type and validate format
function parseRubric(text) {
    const explicitMatch = text.match(/^\s*\[Explicit\]/i);
    const implicitMatch = text.match(/^\s*\[Implicit\]/i);

    if (explicitMatch) {
        return {
            type: 'explicit',
            isValid: true,
            cleanText: text.replace(/^\s*\[Explicit\]\s*/i, '').trim()
        };
    } else if (implicitMatch) {
        return {
            type: 'implicit',
            isValid: true,
            cleanText: text.replace(/^\s*\[Implicit\]\s*/i, '').trim()
        };
    } else {
        return {
            type: 'unknown',
            isValid: false,
            cleanText: text.trim()
        };
    }
}

// Format prompt category name (e.g., "create_code" -> "Create Code")
function formatCategoryName(category) {
    const categoryMap = {
        'create_code': 'Create Code',
        'refactor_code': 'Refactor Code',
        'fix_code': 'Fix Code'
    };
    return categoryMap[category] || category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Format prompt type name (e.g., "zero_to_one" -> "0→1")
function formatTypeName(type) {
    const typeMap = {
        'zero_to_one': '0→1',
        '0_to_1': '0→1',
        'iteration': 'Iteration'
    };
    return typeMap[type] || type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
