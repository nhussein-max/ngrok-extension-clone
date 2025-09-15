// Background script to handle linting
importScripts('linter.js');

console.log('L1 Annotation Linter: Background script loaded');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LINT_ANNOTATION') {
        console.log('L1 Annotation Linter: Processing annotation data');
        
        try {
            const errors = lintAnnotation(message.data);
            const success = errors.length === 0;
            
            // Store latest results
            chrome.storage.local.set({
                lastLintResults: {
                    errors: errors,
                    success: success,
                    timestamp: Date.now(),
                    url: message.url,
                    data: message.data
                }
            });
            
            // Send results back to content script
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'LINT_RESULTS',
                errors: errors,
                success: success
            });
            
            // Update badge
            chrome.action.setBadgeText({
                text: success ? '✓' : errors.length.toString(),
                tabId: sender.tab.id
            });
            
            chrome.action.setBadgeBackgroundColor({
                color: success ? '#28a745' : '#dc3545',
                tabId: sender.tab.id
            });
            
            console.log('L1 Annotation Linter: Found', errors.length, 'errors');
            
        } catch (error) {
            console.error('L1 Annotation Linter: Error during linting:', error);
            
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'LINT_RESULTS',
                errors: [`Linting error: ${error.message}`],
                success: false
            });
        }
    } else if (message.type === 'RESET_BADGE') {
        // Clear badge when page navigation occurs
        chrome.action.setBadgeText({
            text: '',
            tabId: sender.tab.id
        });
    }
    
    return true; // Keep the message channel open for async response
});

// Clear badge when tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        chrome.action.setBadgeText({
            text: '',
            tabId: tabId
        });
    }
});
