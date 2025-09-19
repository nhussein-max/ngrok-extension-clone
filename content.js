// Content script to monitor network requests and extract JSON data
console.log('L1 Annotation Linter: Content script loaded');

let injectedScript = null;

function injectNetworkMonitor() {
    // Remove existing injected script if it exists
    if (injectedScript && injectedScript.parentNode) {
        injectedScript.remove();
    }
    
    // Inject new script to intercept network requests
    injectedScript = document.createElement('script');
    injectedScript.src = chrome.runtime.getURL('injected.js');
    injectedScript.onload = function() {
        console.log('L1 Annotation Linter: Network monitor injected');
        
        // Send initial email toggle state after injection
        try {
            chrome.storage.local.get(['emailToggleState'], function(result) {
                if (chrome.runtime.lastError) {
                    console.log('L1 Annotation Linter: Error getting email toggle state:', chrome.runtime.lastError.message);
                    return;
                }
                const showEmail = result.emailToggleState !== false; // Default to true if not set
                console.log('L1 Annotation Linter: Sending initial email toggle state:', showEmail);
                window.postMessage({
                    type: 'EMAIL_TOGGLE_CHANGED',
                    showEmail: showEmail
                }, '*');
            });
        } catch (error) {
            console.log('L1 Annotation Linter: Error sending initial email toggle state:', error.message);
        }
    };
    (document.head || document.documentElement).appendChild(injectedScript);
}

// Initial injection
injectNetworkMonitor();

// Re-inject on page navigation (SPA support)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log('L1 Annotation Linter: Page navigation detected, re-injecting monitor');
        
        // Clear any existing notifications
        clearNotifications();
        
        // Reset badge
        chrome.runtime.sendMessage({type: 'RESET_BADGE'});
        
        // Re-inject script after a short delay to ensure page is ready
        setTimeout(() => {
            injectNetworkMonitor();
        }, 100);
    }
}).observe(document, {subtree: true, childList: true});

// Listen for messages from injected script
window.addEventListener('message', function(event) {
    if (event.source !== window) return;

    if (event.data.type === 'ANNOTATION_DATA') {
        console.log('L1 Annotation Linter: Received annotation data', event.data.data);

        // Send to background script for processing
        chrome.runtime.sendMessage({
            type: 'LINT_ANNOTATION',
            data: event.data.data,
            url: window.location.href,
            source: event.data.source || 'response',
            isHistoryData: event.data.isHistoryData || false,
            historyArray: event.data.historyArray || null,
            emailToggleState: event.data.emailToggleState
        });
    }
});

// Listen for storage changes to update email toggle behavior in real-time
chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'local' && changes.emailToggleState) {
        console.log('L1 Annotation Linter: Email toggle state changed to:', changes.emailToggleState.newValue);
        
        // Notify injected script about email toggle state change
        window.postMessage({
            type: 'EMAIL_TOGGLE_CHANGED',
            showEmail: changes.emailToggleState.newValue
        }, '*');
        
        // Refresh existing notification with new toggle state
        refreshExistingNotification(changes.emailToggleState.newValue);
    }
});

// Listen for lint results from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LINT_RESULTS') {
        // Use email toggle state from background script if available, otherwise check storage
        if (message.emailToggleState !== undefined) {
            const emailToShow = message.emailToggleState ? message.email : null;
            displayLintResults(message.errors, message.success, message.source, emailToShow);
        } else {
            // Fallback to checking storage (for backward compatibility)
            chrome.storage.local.get(['emailToggleState'], function(result) {
                const showEmail = result.emailToggleState !== false; // Default to true if not set
                const emailToShow = showEmail ? message.email : null;
                displayLintResults(message.errors, message.success, message.source, emailToShow);
            });
        }
    } else if (message.type === 'REFRESH_NOTIFICATION') {
        // Refresh existing notification with new toggle state
        refreshExistingNotification(message.showEmail);
    }
});

function displayLintResults(errors, success, source, email) {
    // Remove existing notification
    clearNotifications();
    
    // Determine if this is from a save request and if task is incomplete
    const isFromSave = source === 'save';
    const isIncomplete = errors.length === 1 && errors[0].includes('Task not complete');
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'l1-linter-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        background: ${success ? '#d4edda' : (isIncomplete ? '#fff3cd' : '#f8d7da')};
        border: 1px solid ${success ? '#c3e6cb' : (isIncomplete ? '#ffeaa7' : '#f5c6cb')};
        color: ${success ? '#155724' : (isIncomplete ? '#856404' : '#721c24')};
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    
    if (success) {
        notification.innerHTML = `
            ${email ? `<div style="font-size: 14px; color: #155724; margin-bottom: 12px; padding: 10px; background: #d1ecf1; border-radius: 4px; border: 1px solid #bee5eb; font-weight: 600;">📧 ${email}</div>` : ''}
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="color: #28a745; margin-right: 8px;">${isFromSave ? '💾' : '✅'}</span>
                <strong>${isFromSave ? 'Saved Successfully' : 'Annotation Valid'}</strong>
            </div>
            <div style="font-family: monospace; font-size: 13px;">No issues found.</div>
        `;
    } else if (isIncomplete) {
        notification.innerHTML = `
            ${email ? `<div style="font-size: 14px; color: #856404; margin-bottom: 12px; padding: 10px; background: #fff3cd; border-radius: 4px; border: 1px solid #ffeaa7; font-weight: 600;">📧 ${email}</div>` : ''}
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="color: #ffc107; margin-right: 8px;">⏳</span>
                <strong>Task Not Complete</strong>
            </div>
            <div style="font-family: monospace; font-size: 13px;">${isFromSave ? 'Saved with incomplete data.' : 'Annotation data is incomplete.'}</div>
        `;
    } else {
        const errorList = errors.map(error => `- ${error}`).join('\n');
        notification.innerHTML = `
            ${email ? `<div style="font-size: 14px; color: #721c24; margin-bottom: 12px; padding: 10px; background: #f8d7da; border-radius: 4px; border: 1px solid #f5c6cb; font-weight: 600;">📧 ${email}</div>` : ''}
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="color: #dc3545; margin-right: 8px;">❌</span>
                <strong>${isFromSave ? 'Saved with Issues' : 'Issues Found'} (${errors.length})</strong>
            </div>
            <pre style="font-family: monospace; font-size: 11px; margin: 0; white-space: pre-wrap; max-height: 200px; overflow-y: auto;">${errorList}</pre>
        `;
    }
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: inherit;
        opacity: 0.7;
    `;
    closeBtn.onclick = () => notification.remove();
    notification.appendChild(closeBtn);
    
    document.body.appendChild(notification);
    
    // Animate in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    });
    
    // Auto-remove after different times based on type
    let autoRemoveTime = 10000; // Default 10 seconds
    if (isIncomplete) {
        autoRemoveTime = 6000; // 6 seconds for incomplete tasks
    } else if (!success) {
        autoRemoveTime = 0; // Keep error messages until manually closed
    }
    
    if (autoRemoveTime > 0) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => notification.remove(), 300);
            }
        }, autoRemoveTime);
    }
}

function clearNotifications() {
    const existing = document.getElementById('l1-linter-notification');
    if (existing) {
        existing.remove();
    }
}

function refreshExistingNotification(showEmail) {
    console.log('L1 Annotation Linter: Refreshing existing notification with showEmail:', showEmail);

    // Get the latest lint results from storage (use current tab ID from URL)
    chrome.storage.local.get(['lastLintResults'], function(result) {
        let latestResults = result.lastLintResults;

        if (latestResults) {
            console.log('L1 Annotation Linter: Found existing results, refreshing notification');
            // Re-display the notification with the new email toggle state
            const emailToShow = showEmail ? latestResults.email : null;
            displayLintResults(latestResults.errors, latestResults.success, latestResults.source, emailToShow);
        } else {
            console.log('L1 Annotation Linter: No existing results found in storage');
            // Check if there's currently a visible notification and update it directly
            const existingNotification = document.getElementById('l1-linter-notification');
            if (existingNotification) {
                console.log('L1 Annotation Linter: Found existing notification, updating it directly');
                updateExistingNotification(existingNotification, showEmail);
            } else {
                console.log('L1 Annotation Linter: No existing notification found, toggle state updated for future notifications');
            }
        }
    });
}

function updateExistingNotification(notificationElement, showEmail) {
    // Find the email div within the notification
    const emailDiv = notificationElement.querySelector('div[style*="font-size: 14px"]');
    if (emailDiv) {
        if (showEmail) {
            // Email should be shown, but we need the email content
            // Get the latest results to get the email
            chrome.storage.local.get(['lastLintResults'], function(result) {
                let latestResults = result.lastLintResults;
                if (latestResults && latestResults.email) {
                    emailDiv.innerHTML = `📧 ${latestResults.email}`;
                    emailDiv.style.display = 'block';
                }
            });
        } else {
            // Hide the email
            emailDiv.style.display = 'none';
        }
    }
}
