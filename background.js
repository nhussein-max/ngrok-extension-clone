// Background script for L1 Patch Validator

console.log('L1 Patch Validator: Background script loaded');

// Configuration
const VALIDATION_SERVER_URL = 'http://127.0.0.1:5050';

// Helper function to extract value from _sf_rich format
function extractValue(field) {
    if (field && typeof field === 'object' && '_sf_rich' in field) {
        return field.value || '';
    }
    return field || '';
}

// Call the validation server
async function validateWithServer(annotationData, checkOnly = false) {
    try {
        const url = checkOnly
            ? `${VALIDATION_SERVER_URL}/validate?check_only=true`
            : `${VALIDATION_SERVER_URL}/validate`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(annotationData)
        });

        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        // Check if server is running
        try {
            await fetch(`${VALIDATION_SERVER_URL}/health`);
        } catch (healthError) {
            return {
                success: false,
                error: 'Validation server is not running. Start server.py first.',
                patch_results: [],
                container_built: false
            };
        }

        return {
            success: false,
            error: `Server error: ${error.message}`,
            patch_results: [],
            container_built: false
        };
    }
}

// Convert server validation results to error format
function formatValidationResults(serverResult) {
    const errors = [];

    if (serverResult.error) {
        errors.push(serverResult.error);
    }

    if (!serverResult.container_built && !serverResult.error) {
        errors.push('Container failed to build');
    }

    if (serverResult.patch_results) {
        for (const patch of serverResult.patch_results) {
            if (!patch.applied) {
                errors.push(`${patch.patch_key}: Failed to apply patch`);
            } else if (patch.tests_passed === false) {
                errors.push(`${patch.patch_key}: Tests failed`);
            }
        }
    }

    return errors;
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // Store annotation data when received (no auto-validation)
    if (message.type === 'ANNOTATION_DATA_RECEIVED') {
        console.log('L1 Patch Validator: Storing annotation data');

        const tabId = sender.tab.id;
        const dataKey = `annotationData_${tabId}`;

        // Get existing data and merge with new data (new data takes priority)
        chrome.storage.local.get([dataKey], function(result) {
            const existingData = result[dataKey] || {};
            const mergedData = { ...existingData, ...message.data };

            // Store the merged annotation data
            chrome.storage.local.set({
                [dataKey]: mergedData
            });

            console.log('L1 Patch Validator: Merged data - existing keys:', Object.keys(existingData).length, 'new keys:', Object.keys(message.data).length);

            // Update badge to show data is loaded (based on merged data)
            const dockerfile = extractValue(mergedData.dockerfile);
            const testScripts = extractValue(mergedData.test_scripts);

            if (dockerfile && testScripts) {
                chrome.action.setBadgeText({ text: '●', tabId: tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#007bff', tabId: tabId });
            } else {
                chrome.action.setBadgeText({ text: '○', tabId: tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#6c757d', tabId: tabId });
            }
        });

        return true;
    }

    // Run validation when button clicked
    if (message.type === 'RUN_VALIDATION') {
        const checkOnly = message.checkOnly || false;
        console.log('L1 Patch Validator: Running validation, checkOnly:', checkOnly);

        const tabId = message.tabId;
        const dataKey = `annotationData_${tabId}`;
        const resultsKey = `lintResults_${tabId}`;

        chrome.storage.local.get([dataKey], async function(result) {
            const data = result[dataKey];

            if (!data) {
                sendResponse({ error: 'No annotation data loaded' });
                return;
            }

            const dockerfile = extractValue(data.dockerfile);
            const testScripts = extractValue(data.test_scripts);

            if (!dockerfile) {
                sendResponse({ error: 'Missing dockerfile' });
                return;
            }

            if (!checkOnly && !testScripts) {
                sendResponse({ error: 'Missing test_scripts for full validation' });
                return;
            }

            // Update badge to show validating
            chrome.action.setBadgeText({ text: '...', tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#ffc107', tabId: tabId });

            try {
                const serverResult = await validateWithServer(data, checkOnly);
                const errors = formatValidationResults(serverResult);
                const success = serverResult.success;

                const resultData = {
                    errors: errors,
                    success: success,
                    timestamp: Date.now(),
                    patchResults: serverResult.patch_results || [],
                    containerBuilt: serverResult.container_built,
                    containerCached: serverResult.container_cached,
                    testsExecuted: serverResult.tests_executed,
                    baseTestsPassed: serverResult.base_tests_passed,
                    baseTestOutput: serverResult.base_test_output,
                    validationType: 'container',
                    checkOnly: checkOnly
                };

                // Store results
                chrome.storage.local.set({
                    [resultsKey]: resultData
                });

                // Update badge
                if (success) {
                    chrome.action.setBadgeText({ text: '✓', tabId: tabId });
                    chrome.action.setBadgeBackgroundColor({ color: '#28a745', tabId: tabId });
                } else {
                    chrome.action.setBadgeText({ text: errors.length.toString(), tabId: tabId });
                    chrome.action.setBadgeBackgroundColor({ color: '#dc3545', tabId: tabId });
                }

                sendResponse(resultData);

            } catch (error) {
                const errorResult = {
                    errors: [`Validation error: ${error.message}`],
                    success: false,
                    timestamp: Date.now(),
                    patchResults: [],
                    validationType: 'container'
                };

                chrome.action.setBadgeText({ text: '!', tabId: tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#dc3545', tabId: tabId });

                sendResponse(errorResult);
            }
        });

        return true; // Keep channel open for async response
    }

    // Check server status
    if (message.type === 'CHECK_SERVER_STATUS') {
        fetch(`${VALIDATION_SERVER_URL}/health`)
            .then(response => response.json())
            .then(data => {
                sendResponse({ connected: true, ...data });
            })
            .catch(error => {
                sendResponse({ connected: false, error: error.message });
            });
        return true;
    }

    // Open patch in VS Code (instant - uses cached path)
    if (message.type === 'OPEN_PATCH_IN_VSCODE') {
        const localPath = message.localPath;

        if (!localPath) {
            sendResponse({ success: false, error: 'No cached path - run validation first' });
            return true;
        }

        fetch(`${VALIDATION_SERVER_URL}/open-patch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ local_path: localPath })
        })
        .then(response => response.json())
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));

        return true;
    }


    // Reset badge
    if (message.type === 'RESET_BADGE') {
        chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
        return true;
    }

    return true;
});

// Clear data when tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        chrome.action.setBadgeText({ text: '', tabId: tabId });
        chrome.storage.local.remove([`annotationData_${tabId}`, `lintResults_${tabId}`]);
    }
});

// Clear data when tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    chrome.storage.local.remove([`annotationData_${tabId}`, `lintResults_${tabId}`]);
});
