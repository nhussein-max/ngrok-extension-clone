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

// Extract page data function
function extractPageData() {
    const result = {};

    // Find all paragraphs containing bracketed text like [Est Time Spent]
    const questionElements = document.querySelectorAll('p[dir="auto"][class*="text-base"][class*="leading-relaxed"]');

    questionElements.forEach(questionEl => {
        const text = questionEl.textContent || '';
        const bracketMatch = text.match(/\[([^\]]+)\]/);

        if (bracketMatch) {
            const questionName = bracketMatch[1];

            // Find the closest common parent that contains both the question and textarea
            let container = questionEl.closest('div[class*="flex"][class*="flex-col"]');

            if (!container) {
                // Try broader search
                container = questionEl.closest('div[style*="opacity"]') ||
                           questionEl.closest('div[class*="rounded"]') ||
                           questionEl.closest('div[class*="bg-"]');
            }

            if (container) {
                // Find the visible textarea within this container (not hidden/aria-hidden)
                const textarea = container.querySelector('textarea:not([aria-hidden]):not([readonly])');

                if (textarea) {
                    const value = textarea.value || '';
                    result[questionName] = value;
                    console.log(`Extracted: ${questionName} = "${value}"`);
                }
            }
        }
    });

    console.log('Full extracted data:', result);
    return result;
}

// Initial injection
injectNetworkMonitor();

// Extract and send page data
function sendPageData() {
    const pageData = extractPageData();

    if (Object.keys(pageData).length > 0) {
        chrome.runtime.sendMessage({
            type: 'PAGE_DATA_EXTRACTED',
            data: pageData
        });
    }
}

// Extract data immediately and on content changes
sendPageData();

// Also extract when DOM changes (for dynamic content)
const observer = new MutationObserver(() => {
    // Debounce to avoid too many calls
    clearTimeout(window.extractTimeout);
    window.extractTimeout = setTimeout(sendPageData, 1000);
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

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
