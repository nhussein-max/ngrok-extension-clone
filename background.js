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
            const isFromSave = message.source === 'save';
            
            // Extract email from the annotation data
            let email = message.data.email || null;
            
            // Determine email visibility
            const processLinting = (showEmailInResults) => {
                // For history data, find the email from the last reviewLevel 0 entry
                if (message.isHistoryData && message.historyArray && Array.isArray(message.historyArray)) {
                    console.log('L1 Annotation Linter: Processing history data, looking for last reviewLevel 0 email');
                    
                    // Find the last entry with reviewLevel 0
                    for (let i = message.historyArray.length - 1; i >= 0; i--) {
                        const entry = message.historyArray[i];
                        if (entry && entry.reviewLevel === 0 && entry.email) {
                            email = entry.email;
                            console.log('L1 Annotation Linter: Found email from reviewLevel 0:', email);
                            break;
                        }
                    }
                }
                
                // Store latest results per tab
                const tabKey = `lintResults_${sender.tab.id}`;
                chrome.storage.local.set({
                    [tabKey]: {
                        errors: errors,
                        success: success,
                        timestamp: Date.now(),
                        url: message.url,
                        data: message.data,
                        email: email,
                        tabId: sender.tab.id,
                        source: message.source,
                        emailToggleState: showEmailInResults
                    },
                    lastLintResults: {
                        errors: errors,
                        success: success,
                        timestamp: Date.now(),
                        url: message.url,
                        data: message.data,
                        email: email,
                        tabId: sender.tab.id,
                        source: message.source,
                        emailToggleState: showEmailInResults
                    }
                });
                
                // Send results back to content script
                chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'LINT_RESULTS',
                    errors: errors,
                    success: success,
                    email: email,
                    source: message.source,
                    emailToggleState: showEmailInResults
                });
                
                // Update badge
                chrome.action.setBadgeText({
                    text: success ? (isFromSave ? '💾' : '✓') : errors.length.toString(),
                    tabId: sender.tab.id
                });
                
                chrome.action.setBadgeBackgroundColor({
                    color: success ? '#28a745' : '#dc3545',
                    tabId: sender.tab.id
                });
                
                console.log('L1 Annotation Linter: Found', errors.length, 'errors');
            };
            
            // Check email toggle state - use from injected script if available, otherwise check storage
            if (message.emailToggleState !== undefined) {
                processLinting(message.emailToggleState);
            } else {
                // Fallback to checking storage (for backward compatibility)
                chrome.storage.local.get(['emailToggleState'], function(result) {
                    const showEmailInResults = result.emailToggleState !== false;
                    processLinting(showEmailInResults);
                });
            }
            
        } catch (error) {
            console.error('L1 Annotation Linter: Error during linting:', error);
            
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'LINT_RESULTS',
                errors: [`Linting error: ${error.message}`],
                success: false,
                source: message.source
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

// Clear badge and tab-specific data when tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        chrome.action.setBadgeText({
            text: '',
            tabId: tabId
        });
        
        // Clear tab-specific storage when navigating away
        const tabKey = `lintResults_${tabId}`;
        chrome.storage.local.remove([tabKey]);
    }
});

// Clear tab-specific data when tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    const tabKey = `lintResults_${tabId}`;
    chrome.storage.local.remove([tabKey]);
});
