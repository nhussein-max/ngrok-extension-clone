// Injected script to intercept network requests
(function() {
    'use strict';
    
    console.log('L1 Annotation Linter: Injected script loaded');
    
    // Prevent multiple injections
    if (window.L1LinterInjected) {
        console.log('L1 Annotation Linter: Already injected, skipping');
        return;
    }
    window.L1LinterInjected = true;
    
    // Store original fetch
    const originalFetch = window.fetch;
    
    // Override fetch to intercept annotation requests
    window.fetch = async function(...args) {
        const url = args[0];
        
        // Check if this is a save request and intercept the request body BEFORE sending
        if (typeof url === 'string' && url.includes('save')) {
            console.log('L1 Annotation Linter: Intercepted save request to', url);
            
            // Try to get the request body if it was sent as JSON
            if (args[1] && args[1].body) {
                try {
                    const requestData = JSON.parse(args[1].body);
                    if (requestData && requestData.annotations) {
                        const annotationData = requestData.annotations;
                        console.log('L1 Annotation Linter: Found annotation data in save request');
                        
                        // Check if this looks like annotation data
                        if (annotationData && typeof annotationData === 'object' && 
                            ('base_response' in annotationData || 'responses' in annotationData || 'model_issues' in annotationData)) {
                            
                            // Send annotation data for linting immediately
                            setTimeout(() => {
                                window.postMessage({
                                    type: 'ANNOTATION_DATA',
                                    data: annotationData,
                                    url: url,
                                    source: 'save'
                                }, '*');
                            }, 100);
                        }
                    }
                } catch (e) {
                    console.log('L1 Annotation Linter: Could not parse save request body:', e);
                }
            }
        }
        
        // Proceed with the original request
        const response = await originalFetch.apply(this, args);
        
        // Check if this is an annotation or history request (for responses)
        if (typeof url === 'string' && (url.includes('annotation') || url.includes('history'))) {
            console.log('L1 Annotation Linter: Intercepted response from', url);
            
            // Clone response to avoid consuming the original
            const clonedResponse = response.clone();
            
            try {
                const data = await clonedResponse.json();
                
                // Handle both single annotations and arrays (history endpoint)
                let annotationData = data;
                let isHistoryData = false;
                let originalHistoryArray = null;
                
                if (Array.isArray(data) && data.length > 0) {
                    // This is history data - store the original array
                    isHistoryData = true;
                    originalHistoryArray = data;
                    // Use the last annotation from the array (most recent)
                    annotationData = data[data.length - 1];
                    console.log('L1 Annotation Linter: Found annotation array, using last entry');
                }
                
                // Check if this looks like annotation data
                if (annotationData && typeof annotationData === 'object' && 
                    ('base_response' in annotationData || 'responses' in annotationData || 'model_issues' in annotationData)) {
                    
                    console.log('L1 Annotation Linter: Found annotation data');
                    
                    // Small delay to ensure DOM is ready
                    setTimeout(() => {
                        window.postMessage({
                            type: 'ANNOTATION_DATA',
                            data: annotationData,
                            url: url,
                            source: 'response',
                            isHistoryData: isHistoryData,
                            historyArray: originalHistoryArray
                        }, '*');
                    }, 100);
                }
            } catch (e) {
                console.log('L1 Annotation Linter: Error parsing response:', e);
            }
        }
        
        return response;
    };
    
    // Also intercept XMLHttpRequest for older implementations
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url;
        return originalXHROpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
        // Check for save requests and intercept the request data
        if (this._url && this._url.includes('save') && args[0]) {
            try {
                const requestData = JSON.parse(args[0]);
                if (requestData && requestData.annotations) {
                    const annotationData = requestData.annotations;
                    console.log('L1 Annotation Linter: Found annotation data in XHR save request');
                    
                    if (annotationData && typeof annotationData === 'object' && 
                        ('base_response' in annotationData || 'responses' in annotationData || 'model_issues' in annotationData)) {
                        
                        setTimeout(() => {
                            window.postMessage({
                                type: 'ANNOTATION_DATA',
                                data: annotationData,
                                url: this._url,
                                source: 'save'
                            }, '*');
                        }, 100);
                    }
                }
            } catch (e) {
                console.log('L1 Annotation Linter: Could not parse XHR save request body:', e);
            }
        }
        
        // Handle response data for annotation/history requests
        if (this._url && (this._url.includes('annotation') || this._url.includes('history'))) {
            const originalOnLoad = this.onload;
            this.onload = function(e) {
                try {
                    const data = JSON.parse(this.responseText);
                    
                    // Handle both single annotations and arrays (history endpoint)
                    let annotationData = data;
                    let isHistoryData = false;
                    let originalHistoryArray = null;
                    
                    if (Array.isArray(data) && data.length > 0) {
                        // This is history data - store the original array
                        isHistoryData = true;
                        originalHistoryArray = data;
                        // Use the last annotation from the array (most recent)
                        annotationData = data[data.length - 1];
                        console.log('L1 Annotation Linter: Found annotation array via XHR, using last entry');
                    }
                    
                    if (annotationData && typeof annotationData === 'object' && 
                        ('base_response' in annotationData || 'responses' in annotationData || 'model_issues' in annotationData)) {
                        
                        console.log('L1 Annotation Linter: Found annotation data via XHR');
                        
                        setTimeout(() => {
                            window.postMessage({
                                type: 'ANNOTATION_DATA',
                                data: annotationData,
                                url: this._url,
                                source: 'response',
                                isHistoryData: isHistoryData,
                                historyArray: originalHistoryArray
                            }, '*');
                        }, 100);
                    }
                } catch (err) {
                    console.log('L1 Annotation Linter: Error parsing XHR response:', err);
                }
                
                if (originalOnLoad) {
                    originalOnLoad.apply(this, arguments);
                }
            };
        }
        
        return originalXHRSend.apply(this, args);
    };
    
})();
