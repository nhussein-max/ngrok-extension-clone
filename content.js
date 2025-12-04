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
                // First, try to find a visible textarea within this container
                const textarea = container.querySelector('textarea:not([aria-hidden]):not([readonly])');

                if (textarea) {
                    const value = textarea.value || '';
                    result[questionName] = value;
                    console.log(`Extracted textarea: ${questionName} = "${value}"`);
                } else {
                    // If no textarea, look for checked radio buttons
                    const checkedRadio = container.querySelector('input[type="radio"]:checked');

                    if (checkedRadio) {
                        // Get the associated label text
                        const label = checkedRadio.closest('label');
                        if (label) {
                            // Find the descriptive text in the label (usually in a p element)
                            const labelText = label.querySelector('p[dir="auto"]')?.textContent ||
                                            label.textContent?.trim() ||
                                            '';

                            if (labelText) {
                                result[questionName] = labelText;
                                console.log(`Extracted radio: ${questionName} = "${labelText}"`);
                            }
                        }
                    } else {
                        // If no radio buttons, look for dropdown buttons (buttons with span.truncate containing selected value)
                        const dropdownButton = container.querySelector('button[aria-haspopup] span.truncate');

                        if (dropdownButton) {
                            const selectedValue = dropdownButton.textContent?.trim() || '';
                            if (selectedValue) {
                                result[questionName] = selectedValue;
                                console.log(`Extracted dropdown: ${questionName} = "${selectedValue}"`);
                            }
                        }
                    }
                }
            }
        }
    });

    return result;
}

// Format page data function
function formatPageData(data) {
    const formatted = {};

    for (const [key, value] of Object.entries(data)) {
        // Convert to lowercase and replace spaces with underscores
        let formattedKey = key.toLowerCase().replace(/\s+/g, '_');
        let formattedValue = value;

        // Rename fields to match the backend expectations
        switch (formattedKey) {
            case 'test_script':
                formattedKey = 'test_scripts';
                break;
            case 'codebase_language':
                formattedKey = 'language';
                break;
            case 'ranking_explanation':
                formattedKey = 'overall_preference_explanation';
                break;
        }

        // Add the formatted key and value to the formatted object
        formatted[formattedKey] = formattedValue;
    }

    return formatted;
}

// Extract and send page data
function sendPageData() {
    const pageData = extractPageData();
    const formattedData = formatPageData(pageData);

    if (Object.keys(formattedData).length > 0) {
        // Send using the same message format as annotation data
        chrome.runtime.sendMessage({
            type: 'ANNOTATION_DATA_RECEIVED',
            data: formattedData
        });
    }
}

// Listen for messages from popup to trigger data extraction
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRIGGER_PAGE_DATA_EXTRACTION') {
        console.log('L1 Patch Validator: Triggering page data extraction');
        sendPageData();
        sendResponse({ success: true });
        return true; // Required to keep message channel open
    }
    return false;
});
