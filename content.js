// Content script for L1 Patch Validator
console.log('L1 Patch Validator: Content script loaded');

let injectedScript = null;

function injectNetworkMonitor() {
    // Remove existing injected script if it exists
    if (injectedScript && injectedScript.parentNode) {
        injectedScript.remove();
    }

    // Inject script to intercept network requests
    injectedScript = document.createElement('script');
    injectedScript.src = chrome.runtime.getURL('injected.js');
    injectedScript.onload = function() {
        console.log('L1 Patch Validator: Network monitor injected');
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
        console.log('L1 Patch Validator: Page navigation detected, re-injecting monitor');

        // Reset badge
        chrome.runtime.sendMessage({type: 'RESET_BADGE'});

        // Re-inject script after a short delay
        setTimeout(() => {
            injectNetworkMonitor();
        }, 100);
    }
}).observe(document, {subtree: true, childList: true});

// Listen for messages from injected script
window.addEventListener('message', function(event) {
    if (event.source !== window) return;

    if (event.data.type === 'ANNOTATION_DATA') {
        console.log('L1 Patch Validator: Received annotation data', event.data.data);

        // Send to background script for storage
        chrome.runtime.sendMessage({
            type: 'ANNOTATION_DATA_RECEIVED',
            data: event.data.data
        });
    }
});
