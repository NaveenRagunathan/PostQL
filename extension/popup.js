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
            const isValid = await checkPostmanPage(tab);
            
            if (!isValid) {
                disableUI('Please open a Postman response tab');
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
                return false;
            }
            
            // Check if we can access the content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' })
                .catch(() => null);
                
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

        setLoadingState(true);
        clearResult();
        
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
            
        } catch (error) {
            console.error('Query execution error:', error);
            showError(error.message || 'An error occurred while processing your query');
        } finally {
            setLoadingState(false);
        }
    }

    // Process the query using the API
    async function processQuery(query, jsonData) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
            
            const response = await fetch('https://postql.onrender.com/api/query', {
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
        showError(message || 'Not available on this page');
    }

    function enableUI() {
        queryInput.disabled = false;
        runQueryBtn.disabled = false;
        showStatus('Ready to query!', 'info');
    }
});
