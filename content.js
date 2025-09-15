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
        setTimeout(injectNetworkMonitor, 100);
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
            url: window.location.href
        });
    }
});

// Listen for lint results from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LINT_RESULTS') {
        displayLintResults(message.errors, message.success);
    }
});

function displayLintResults(errors, success) {
    // Remove existing notification
    clearNotifications();
    
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
        background: ${success ? '#d4edda' : '#f8d7da'};
        border: 1px solid ${success ? '#c3e6cb' : '#f5c6cb'};
        color: ${success ? '#155724' : '#721c24'};
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    
    if (success) {
        notification.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="color: #28a745; margin-right: 8px;">✅</span>
                <strong>Annotation Valid</strong>
            </div>
            <div style="font-family: monospace; font-size: 13px;">No issues found.</div>
        `;
    } else {
        const errorList = errors.map(error => `- ${error}`).join('\n');
        notification.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="color: #dc3545; margin-right: 8px;">❌</span>
                <strong>Issues Found (${errors.length})</strong>
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
    
    // Auto-remove after 10 seconds for success, keep errors until manually closed
    if (success) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => notification.remove(), 300);
            }
        }, 10000);
    }
}

function clearNotifications() {
    const existing = document.getElementById('l1-linter-notification');
    if (existing) {
        existing.remove();
    }
}
