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
    
    // Copy results button
    document.getElementById('copyResults').addEventListener('click', function() {
        copyResultsToClipboard();
    });
    
    // Export markdown button
    document.getElementById('exportMarkdown').addEventListener('click', function() {
        exportMarkdownReport();
    });
    
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
    
    function exportAnnotationData() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTabId = tabs[0].id;
            const tabKey = `lintResults_${currentTabId}`;
            
            chrome.storage.local.get([tabKey, 'lastLintResults'], function(result) {
                const data = result[tabKey]?.data || result.lastLintResults?.data;
                
                if (data) {
                    const jsonData = JSON.stringify(data, null, 2);
                    const blob = new Blob([jsonData], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    
                    chrome.downloads.download({
                        url: url,
                        filename: `annotation_data_${Date.now()}.json`,
                        saveAs: true
                    });
                } else {
                    alert('No annotation data available to export for this tab.');
                }
            });
        });
    }
    
    function copyResultsToClipboard() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTabId = tabs[0].id;
            const tabKey = `lintResults_${currentTabId}`;
            
            chrome.storage.local.get([tabKey, 'lastLintResults'], function(result) {
                const lintData = result[tabKey] || result.lastLintResults;
                
                if (lintData) {
                    const { errors, success } = lintData;
                    
                    // Format like Python script output without Entry 1:
                    let output = '';
                    if (success) {
                        output = 'No issues found.';
                    } else {
                        output = errors.map(error => `- ${error}`).join('\n');
                    }
                    
                    // Copy to clipboard
                    navigator.clipboard.writeText(output).then(() => {
                        // Show brief feedback
                        const btn = document.getElementById('copyResults');
                        const originalText = btn.textContent;
                        btn.textContent = 'Copied!';
                        btn.style.background = '#28a745';
                        setTimeout(() => {
                            btn.textContent = originalText;
                            btn.style.background = '#6c757d';
                        }, 1500);
                    }).catch(err => {
                        console.error('Failed to copy: ', err);
                        alert('Failed to copy to clipboard');
                    });
                } else {
                    alert('No results available to copy for this tab.');
                }
            });
        });
    }
    
    function exportMarkdownReport() {
        chrome.storage.local.get(['lastLintResults'], function(result) {
            if (result.lastLintResults) {
                const { errors, success, timestamp, url } = result.lastLintResults;
                const date = new Date(timestamp);
                
                let markdown = `# L1 Annotation Linter Report\n\n`;
                markdown += `**Date:** ${date.toLocaleString()}\n`;
                markdown += `**URL:** ${url || 'N/A'}\n\n`;
                markdown += `## Entry 1:\n`;
                
                if (success) {
                    markdown += `No issues found.\n`;
                } else {
                    errors.forEach(error => {
                        markdown += `- ${error}\n`;
                    });
                }
                
                const blob = new Blob([markdown], { type: 'text/markdown' });
                const downloadUrl = URL.createObjectURL(blob);
                
                chrome.downloads.download({
                    url: downloadUrl,
                    filename: `lint_report_${Date.now()}.md`,
                    saveAs: true
                });
            } else {
                alert('No lint results available to export.');
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
