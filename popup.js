// Popup script to display lint results and handle user actions

// DOM elements - declared globally so storage listener can access them
let statusEl, resultsEl, errorsEl, timestampEl, emailSectionEl, emailContentEl, emailToggleEl;

document.addEventListener('DOMContentLoaded', function() {
    statusEl = document.getElementById('status');
    resultsEl = document.getElementById('results');
    errorsEl = document.getElementById('errors');
    timestampEl = document.getElementById('timestamp');
    emailSectionEl = document.getElementById('email-section');
    emailContentEl = document.getElementById('email-content');
    emailToggleEl = document.getElementById('email-toggle');

    // Load stored results
    loadStoredResults();

    // Load saved toggle state
    loadToggleState();

    // Add toggle event listener
    if (emailToggleEl) {
        emailToggleEl.addEventListener('change', function() {
            saveToggleState(this.checked);
            updateEmailVisibility();
            // Also refresh the overlay notification in the active tab
            refreshOverlayNotification(this.checked);
        });
    }
    
    function loadStoredResults() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTabId = tabs[0].id;
            const tabKey = `lintResults_${currentTabId}`;

            chrome.storage.local.get([tabKey, 'lastLintResults'], function(result) {
                if (result[tabKey]) {
                    // Use tab-specific results if available
                    displayResults(result[tabKey]);
                } else if (result.lastLintResults && result.lastLintResults.tabId === currentTabId) {
                    // Fallback to lastLintResults if it's for current tab
                    displayResults(result.lastLintResults);
                }
            });
        });
    }

    function loadToggleState() {
        chrome.storage.local.get(['emailToggleState'], function(result) {
            const savedState = result.emailToggleState;
            if (emailToggleEl) {
                // Default to true (checked) if no saved state
                emailToggleEl.checked = savedState !== undefined ? savedState : true;
                updateEmailVisibility();
            }
        });
    }

    function saveToggleState(isChecked) {
        chrome.storage.local.set({ emailToggleState: isChecked });
    }

    function updateEmailVisibility() {
        if (!emailSectionEl) return;

        // Always show email section if there's email data, regardless of toggle state
        // The toggle only controls whether email content is shown
        // Email section visibility is handled by displayResults function
    }
    
    // displayResults function moved to global scope to avoid duplication
});

// Helper function for escaping HTML (needed by global displayResults)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Listen for storage changes to update UI in real-time
chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'local') {
        // Check if any tab-specific results changed for current tab
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTabId = tabs[0].id;
            const tabKey = `lintResults_${currentTabId}`;

            if (changes[tabKey]) {
                displayResults(changes[tabKey].newValue);
            } else if (changes.lastLintResults && changes.lastLintResults.newValue?.tabId === currentTabId) {
                displayResults(changes.lastLintResults.newValue);
            }
        });

        // Also handle email toggle state changes
        if (changes.emailToggleState) {
            console.log('L1 Annotation Linter: Email toggle state changed in popup, updating display');
            // Re-display current results with new toggle state
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const currentTabId = tabs[0].id;
                const tabKey = `lintResults_${currentTabId}`;

                chrome.storage.local.get([tabKey, 'lastLintResults'], function(result) {
                    let latestResults = result[tabKey] || result.lastLintResults;
                    if (latestResults) {
                        displayResults(latestResults);
                    }
                });
            });
        }
    }
});

function displayResults(results) {
    const { errors, success, timestamp, url, email } = results;

    // Always show email section if there's email data, but respect toggle state for content
    if (email && email.trim()) {
        emailSectionEl.classList.remove('hidden');
        // Check toggle state to determine whether to show email content
        chrome.storage.local.get(['emailToggleState'], function(result) {
            const showEmail = result.emailToggleState !== false; // Default to true if not set
            if (showEmail) {
                emailContentEl.textContent = email;
                emailContentEl.style.display = 'block';
            } else {
                emailContentEl.textContent = '';
                emailContentEl.style.display = 'none';
            }
        });
        // Ensure email section is always at the top
        emailSectionEl.style.order = '-1';
    } else {
        emailSectionEl.classList.add('hidden');
    }
    
    // Update status
    statusEl.className = `status ${success ? 'success' : 'error'}`;
    statusEl.innerHTML = `
        <div class="status-icon">${success ? '✅' : '❌'}</div>
        <div class="status-text">
            ${success ? 'No issues found' : `${errors.length} issue${errors.length === 1 ? '' : 's'} found`}
        </div>
    `;
    
    // Show results section
    resultsEl.classList.remove('hidden');
    
    // Display errors in Python script format
    if (!success) {
        const errorList = errors.map(error => `- ${escapeHtml(error)}`).join('\n');
        errorsEl.innerHTML = `<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; margin: 0; background: #f8f9fa; padding: 12px; border-radius: 4px; border: 1px solid #e9ecef;">${errorList}</pre>`;
    } else {
        errorsEl.innerHTML = '<div style="color: #28a745; font-weight: 500;">No issues found.</div>';
    }
    
    // Display timestamp
    const date = new Date(timestamp);
    timestampEl.textContent = `Last checked: ${date.toLocaleString()}`;
}

function refreshOverlayNotification(showEmail) {
    console.log('L1 Annotation Linter: Refreshing overlay notification with showEmail:', showEmail);
    // Send message to content script to refresh the overlay notification
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'REFRESH_NOTIFICATION',
                showEmail: showEmail
            }).then(function(response) {
                console.log('L1 Annotation Linter: Overlay notification refresh message sent successfully');
            }).catch(function(error) {
                // Content script might not be ready, which is fine
                console.log('L1 Annotation Linter: Could not refresh overlay notification:', error.message);
            });
        } else {
            console.log('L1 Annotation Linter: No active tab found to refresh overlay notification');
        }
    });
}
