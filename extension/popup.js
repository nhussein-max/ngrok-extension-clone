// Popup script to display lint results and handle user actions
document.addEventListener('DOMContentLoaded', function() {
    const statusEl = document.getElementById('status');
    const resultsEl = document.getElementById('results');
    const errorsEl = document.getElementById('errors');
    const timestampEl = document.getElementById('timestamp');
    
    // Load stored results
    loadStoredResults();
    
    // Manual lint button
    document.getElementById('manualLint').addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {type: 'MANUAL_LINT'});
            window.close();
        });
    });
    
    // Export data button
    document.getElementById('exportData').addEventListener('click', function() {
        exportAnnotationData();
    });
    
    function loadStoredResults() {
        chrome.storage.local.get(['lastLintResults'], function(result) {
            if (result.lastLintResults) {
                displayResults(result.lastLintResults);
            }
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
        
        // Display errors if any
        if (!success) {
            errorsEl.innerHTML = errors.map(error => 
                `<div class="error-item">${escapeHtml(error)}</div>`
            ).join('');
        } else {
            errorsEl.innerHTML = '<div style="color: #28a745; font-weight: 500;">All validation checks passed!</div>';
        }
        
        // Display timestamp
        const date = new Date(timestamp);
        timestampEl.textContent = `Last checked: ${date.toLocaleString()}`;
    }
    
    function exportAnnotationData() {
        chrome.storage.local.get(['lastLintResults'], function(result) {
            if (result.lastLintResults && result.lastLintResults.data) {
                const data = JSON.stringify(result.lastLintResults.data, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                chrome.downloads.download({
                    url: url,
                    filename: `annotation_data_${Date.now()}.json`,
                    saveAs: true
                });
            } else {
                alert('No annotation data available to export.');
            }
        });
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

// Listen for storage changes to update UI in real-time
chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'local' && changes.lastLintResults) {
        displayResults(changes.lastLintResults.newValue);
    }
});
