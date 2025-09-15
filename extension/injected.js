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
        const response = await originalFetch.apply(this, args);
        
        // Check if this is an annotation or history request
        const url = args[0];
        if (typeof url === 'string' && (url.includes('annotation') || url.includes('history'))) {
            console.log('L1 Annotation Linter: Intercepted request to', url);
            
            // Clone response to avoid consuming the original
            const clonedResponse = response.clone();
            
            try {
                const data = await clonedResponse.json();
                
                // Check if this looks like annotation data
                if (data && typeof data === 'object' && 
                    ('base_response' in data || 'responses' in data || 'model_issues' in data)) {
                    
                    console.log('L1 Annotation Linter: Found annotation data');
                    
                    // Small delay to ensure DOM is ready
                    setTimeout(() => {
                        window.postMessage({
                            type: 'ANNOTATION_DATA',
                            data: data,
                            url: url
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
        if (this._url && (this._url.includes('annotation') || this._url.includes('history'))) {
            const originalOnLoad = this.onload;
            this.onload = function(e) {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data && typeof data === 'object' && 
                        ('base_response' in data || 'responses' in data || 'model_issues' in data)) {
                        
                        console.log('L1 Annotation Linter: Found annotation data via XHR');
                        
                        setTimeout(() => {
                            window.postMessage({
                                type: 'ANNOTATION_DATA',
                                data: data,
                                url: this._url
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
