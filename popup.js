// Popup script to display lint results and handle user actions
document.addEventListener('DOMContentLoaded', function() {
    const statusEl = document.getElementById('status');
    const resultsEl = document.getElementById('results');
    const errorsEl = document.getElementById('errors');
    const timestampEl = document.getElementById('timestamp');
    
    // Load stored results
    loadStoredResults();
    
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
    
    function displayResults(results) {
        const { errors, success, timestamp, url } = results;
        
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
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

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
    }
});

function displayResults(results) {
    const { errors, success, timestamp, url } = results;
    
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
