console.log('[PostQL] popup.js script loaded');
document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const queryInput = document.getElementById('query-input');
    const runQueryBtn = document.getElementById('run-query');
    const resultDiv = document.getElementById('result');
    const statusDiv = document.getElementById('status');
    const copyBtn = document.getElementById('copy-result');
    const clearBtn = document.getElementById('clear-query');

    // Initialize the popup
    initializePopup();

    // Event Listeners
    runQueryBtn.addEventListener('click', runQuery);
    queryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') runQuery();
    });
    copyBtn.addEventListener('click', copyResult);
    clearBtn.addEventListener('click', clearQuery);

    // Initialize the popup state
    async function initializePopup() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log('[PostQL][popup] Checking tab:', tab ? tab.url : tab);
            const isValid = await checkPostmanPage(tab);
            console.log('[PostQL][popup] checkPostmanPage result:', isValid);
            if (!isValid) {
                disableUI('Not a valid Postman response tab or cannot communicate with content script. Tab URL: ' + (tab ? tab.url : 'N/A'));
            } else {
                enableUI();
            }
        } catch (error) {
            console.error('Initialization error:', error);
            showError('Failed to initialize. Please refresh and try again.');
        }
    }

    // Check if current tab is a valid Postman page
    async function checkPostmanPage(tab) {
        try {
            if (!tab?.url?.includes('postman.com')) {
                console.warn('[PostQL][popup] Tab URL does not include postman.com:', tab?.url);
                return false;
            }
            // Check if we can access the content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' })
                .catch((e) => { console.warn('[PostQL][popup] ping failed:', e); return null; });
            console.log('[PostQL][popup] ping response:', response);
            return !!response?.success;
        } catch (error) {
            console.error('Error checking Postman page:', error);
            return false;
        }
    }

    // Main query execution function
    async function runQuery() {
        const query = queryInput.value.trim();
        if (!query) {
            showError('Please enter a query');
            return;
        }
        // Simple input validation: limit length and basic pattern
        if (query.length > 256) {
            showError('Query is too long (max 256 characters)');
            return;
        }
        if (/[^\w\s.,?!:;\-()\[\]{}'"/]/.test(query)) {
            showError('Invalid characters in query');
            return;
        }
        setLoadingState(true);
        clearResult();
        let retries = 2;
        while (retries >= 0) {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                // Step 1: Get JSON from content script
                const jsonResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getJson' });
                if (!jsonResponse?.success) {
                    throw new Error(jsonResponse?.error?.message || 'Failed to get JSON data from Postman');
                }
                // Step 2: Process the query
                const result = await processQuery(query, jsonResponse.json);
                // Step 3: Display results
                displayResult(result);
                showStatus('Query completed successfully', 'success');
                return;
            } catch (error) {
                if (error.name === 'AbortError') {
                    showError('Query timed out. Please try again.');
                    break;
                }
                if (retries > 0 && (error.message.includes('Network') || error.message.includes('Failed to fetch'))) {
                    retries--;
                    showStatus('Network error, retrying...', 'warning');
                    continue;
                }
                if (error.message && error.message.startsWith('Invalid') || error.message.startsWith('Please enter')) {
                    showError(error.message);
                } else {
                    showError('System error: ' + (error.message || 'Unknown error'));
                }
                break;
            } finally {
                setLoadingState(false);
            }
        }
    }

    // Process the query using the API
    async function processQuery(query, jsonData) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
            // Try to get backend URL from manifest, fallback to default
            let backendUrl = 'https://postql.onrender.com/api/query';
            try {
                const manifest = chrome.runtime.getManifest();
                if (manifest && manifest.backend_url) {
                    backendUrl = manifest.backend_url;
                }
            } catch (e) {}
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ json: jsonData, query }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `API Error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.result || 'No results found';
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            throw error;
        }
    }

    // UI Helper Functions
    function setLoadingState(isLoading) {
        runQueryBtn.disabled = isLoading;
        runQueryBtn.textContent = isLoading ? 'Processing...' : 'Run Query';
        if (isLoading) {
            showStatus('Processing your query...', 'info');
        }
    }

    function showStatus(message, type = 'info') {
        statusDiv.textContent = message;
        statusDiv.style.color = type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff';
    }

    function showError(message) {
        showStatus(message, 'error');
        resultDiv.textContent = '';
    }

    function displayResult(result) {
        resultDiv.textContent = result;
        resultDiv.scrollIntoView({ behavior: 'smooth' });
    }

    function clearResult() {
        resultDiv.textContent = '';
    }

    function clearQuery() {
        queryInput.value = '';
        resultDiv.textContent = '';
        showStatus('Ready', 'info');
        queryInput.focus();
    }

    async function copyResult() {
        if (!resultDiv.textContent) return;
        
        try {
            await navigator.clipboard.writeText(resultDiv.textContent);
            showStatus('Result copied to clipboard!', 'success');
            setTimeout(() => showStatus('Ready', 'info'), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
            showError('Failed to copy result');
        }
    }

    function disableUI(message) {
        queryInput.disabled = true;
        runQueryBtn.disabled = true;
        copyBtn.disabled = true;
        clearBtn.disabled = true;
        showStatus('[DISABLED] ' + message, 'error');
        console.warn('[PostQL][popup] UI disabled:', message);
    }

    function enableUI() {
        queryInput.disabled = false;
        runQueryBtn.disabled = false;
        showStatus('Ready to query!', 'info');
    }
});
