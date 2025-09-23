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
    
    // Initialize email toggle state as undefined - will be set by content script
    window.L1LinterEmailToggleState = undefined;
    
    // Store metadata from /content requests
    window.L1LinterMetadata = null;
    window.L1LinterWaitingForMetadata = false;
    window.L1LinterPendingAnnotations = [];
    
    // Function to get current email toggle state with fallback
    function getCurrentEmailToggleState() {
        // If state is undefined, default to false (more conservative approach)
        return window.L1LinterEmailToggleState !== undefined ? window.L1LinterEmailToggleState : false;
    }
    
    // Function to process annotation data
    function processAnnotationData(annotationData, url, source, isHistoryData = false, historyArray = null) {
        console.log('L1 Annotation Linter: Processing annotation data with metadata:', window.L1LinterMetadata);
        
        setTimeout(() => {
            window.postMessage({
                type: 'ANNOTATION_DATA',
                data: annotationData,
                url: url,
                source: source,
                isHistoryData: isHistoryData,
                historyArray: historyArray,
                metadata: window.L1LinterMetadata,
                emailToggleState: getCurrentEmailToggleState()
            }, '*');
        }, 100);
    }
    
    // Function to process pending annotations when metadata becomes available
    function processPendingAnnotations() {
        if (window.L1LinterPendingAnnotations.length > 0) {
            console.log('L1 Annotation Linter: Processing', window.L1LinterPendingAnnotations.length, 'pending annotations with new metadata');
            
            const pending = [...window.L1LinterPendingAnnotations];
            window.L1LinterPendingAnnotations = [];
            
            pending.forEach(annotation => {
                processAnnotationData(
                    annotation.data,
                    annotation.url,
                    annotation.source,
                    annotation.isHistoryData,
                    annotation.historyArray
                );
            });
        }
    }
    
    // Listen for email toggle state changes from content script
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;
        
        if (event.data.type === 'EMAIL_TOGGLE_CHANGED') {
            console.log('L1 Annotation Linter: Email toggle state changed to:', event.data.showEmail);
            // Store the current email toggle state for future annotation processing
            window.L1LinterEmailToggleState = event.data.showEmail;
        }
    });
    
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
                            // Process save requests immediately (they don't depend on fresh metadata)
                            processAnnotationData(annotationData, url, 'save');
                        }
                    }
                } catch (e) {
                    console.log('L1 Annotation Linter: Could not parse save request body:', e);
                }
            }
        }
        
        // Proceed with the original request
        const response = await originalFetch.apply(this, args);
        
        // Check if this is an annotation, history, or content request (for responses)
        if (typeof url === 'string' && (url.includes('annotation') || url.includes('history') || url.includes('content'))) {
            console.log('L1 Annotation Linter: Intercepted response from', url);
            
            // Clone response to avoid consuming the original
            const clonedResponse = response.clone();
            
            try {
                const data = await clonedResponse.json();
                
                // Handle /content requests to extract metadata
                if (url.includes('content') && data && data.metadata) {
                    console.log('L1 Annotation Linter: Found metadata in /content response:', data.metadata);
                    window.L1LinterMetadata = data.metadata;
                    window.L1LinterWaitingForMetadata = false;
                    
                    // Process any pending annotations that were waiting for metadata
                    processPendingAnnotations();
                    
                    return response; // Don't process content as annotation data
                }
                
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
                    
                    // If we don't have metadata yet and this is a response (not save), wait for it
                    if (!window.L1LinterMetadata && url.includes('annotation') && !url.includes('save')) {
                        console.log('L1 Annotation Linter: No metadata available yet, queueing annotation for later processing');
                        window.L1LinterWaitingForMetadata = true;
                        window.L1LinterPendingAnnotations.push({
                            data: annotationData,
                            url: url,
                            source: 'response',
                            isHistoryData: isHistoryData,
                            historyArray: originalHistoryArray
                        });
                        
                        // Set a timeout to process pending annotations even without metadata
                        setTimeout(() => {
                            if (window.L1LinterWaitingForMetadata && window.L1LinterPendingAnnotations.length > 0) {
                                console.log('L1 Annotation Linter: Timeout reached, processing annotations without metadata');
                                processPendingAnnotations();
                                window.L1LinterWaitingForMetadata = false;
                            }
                        }, 5000); // Wait max 5 seconds for metadata
                    } else {
                        // Process immediately
                        processAnnotationData(annotationData, url, 'response', isHistoryData, originalHistoryArray);
                    }
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
                        // Process save requests immediately (they don't depend on fresh metadata)
                        processAnnotationData(annotationData, this._url, 'save');
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
                        
                        // If we don't have metadata yet and this is a response (not save), wait for it
                        if (!window.L1LinterMetadata && this._url.includes('annotation') && !this._url.includes('save')) {
                            console.log('L1 Annotation Linter: No metadata available yet, queueing XHR annotation for later processing');
                            window.L1LinterWaitingForMetadata = true;
                            window.L1LinterPendingAnnotations.push({
                                data: annotationData,
                                url: this._url,
                                source: 'response',
                                isHistoryData: isHistoryData,
                                historyArray: originalHistoryArray
                            });
                            
                            // Set a timeout to process pending annotations even without metadata
                            setTimeout(() => {
                                if (window.L1LinterWaitingForMetadata && window.L1LinterPendingAnnotations.length > 0) {
                                    console.log('L1 Annotation Linter: Timeout reached, processing XHR annotations without metadata');
                                    processPendingAnnotations();
                                    window.L1LinterWaitingForMetadata = false;
                                }
                            }, 5000); // Wait max 5 seconds for metadata
                        } else {
                            // Process immediately
                            processAnnotationData(annotationData, this._url, 'response', isHistoryData, originalHistoryArray);
                        }
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
