// Injected script to intercept network requests for L1 Patch Validator
(function() {
    'use strict';

    console.log('L1 Patch Validator: Injected script loaded');

    // Prevent multiple injections
    if (window.L1ValidatorInjected) {
        console.log('L1 Patch Validator: Already injected, skipping');
        return;
    }
    window.L1ValidatorInjected = true;

    // Check if data looks like annotation data (supports both old and new formats)
    function isAnnotationData(data) {
        if (!data || typeof data !== 'object') return false;
        // New format: container validation fields
        if ('dockerfile' in data || 'test_scripts' in data) return true;
        // Check for patch fields (*_diff or *_patch)
        const hasPatchFields = Object.keys(data).some(key =>
            key.endsWith('_diff') || key.endsWith('_patch')
        );
        if (hasPatchFields) return true;
        // Old format fields (for backwards compatibility)
        if ('base_response' in data || 'responses' in data || 'model_issues' in data) return true;
        return false;
    }

    // Send annotation data to content script
    function sendAnnotationData(data) {
        console.log('L1 Patch Validator: Sending annotation data');
        window.postMessage({
            type: 'ANNOTATION_DATA',
            data: data
        }, '*');
    }

    // Store original fetch
    const originalFetch = window.fetch;

    // Override fetch to intercept annotation requests
    window.fetch = async function(...args) {
        const url = args[0];

        // Check if this is a save request
        if (typeof url === 'string' && url.includes('save')) {
            if (args[1] && args[1].body) {
                try {
                    const requestData = JSON.parse(args[1].body);
                    if (requestData && requestData.annotations && isAnnotationData(requestData.annotations)) {
                        console.log('L1 Patch Validator: Found annotation data in save request');
                        sendAnnotationData(requestData.annotations);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }

        // Proceed with original request
        const response = await originalFetch.apply(this, args);

        // Check response for annotation data
        if (typeof url === 'string' && (url.includes('annotation') || url.includes('history') || url.includes('task'))) {
            try {
                const clonedResponse = response.clone();
                const data = await clonedResponse.json();

                // Handle arrays (history endpoint)
                let annotationData = data;
                if (Array.isArray(data) && data.length > 0) {
                    annotationData = data[data.length - 1];
                }

                if (isAnnotationData(annotationData)) {
                    console.log('L1 Patch Validator: Found annotation data in response');
                    sendAnnotationData(annotationData);
                }
            } catch (e) {
                // Ignore parse errors
            }
        }

        return response;
    };

    // Also intercept XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url;
        return originalXHROpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        // Check for save requests
        if (this._url && this._url.includes('save') && args[0]) {
            try {
                const requestData = JSON.parse(args[0]);
                if (requestData && requestData.annotations && isAnnotationData(requestData.annotations)) {
                    console.log('L1 Patch Validator: Found annotation data in XHR save request');
                    sendAnnotationData(requestData.annotations);
                }
            } catch (e) {
                // Ignore parse errors
            }
        }

        // Handle response data
        if (this._url && (this._url.includes('annotation') || this._url.includes('history') || this._url.includes('task'))) {
            const originalOnLoad = this.onload;
            this.onload = function(e) {
                try {
                    const data = JSON.parse(this.responseText);

                    let annotationData = data;
                    if (Array.isArray(data) && data.length > 0) {
                        annotationData = data[data.length - 1];
                    }

                    if (isAnnotationData(annotationData)) {
                        console.log('L1 Patch Validator: Found annotation data via XHR');
                        sendAnnotationData(annotationData);
                    }
                } catch (e) {
                    // Ignore parse errors
                }

                if (originalOnLoad) {
                    originalOnLoad.apply(this, arguments);
                }
            };
        }

        return originalXHRSend.apply(this, args);
    };

})();
