document.addEventListener('DOMContentLoaded', function() {
    const queryInput = document.getElementById('query-input');
    const queryButton = document.getElementById('query-button');
    const resultDiv = document.getElementById('result');

    queryButton.addEventListener('click', async () => {
        const query = queryInput.value.trim();
        if (!query) {
            resultDiv.textContent = 'Please enter a query.';
            return;
        }

        resultDiv.textContent = 'Running query...';

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Send a message to the content script to get the JSON data
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getJson' });
            
            if (!response.json) {
                resultDiv.textContent = 'No JSON data found in the current page.';
                return;
            }

            // Send the query to our backend
            const backendResponse = await fetch('https://postql-backend.onrender.com/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ json: response.json, query })
            });

            if (!backendResponse.ok) {
                throw new Error('Failed to process query');
            }

            const data = await backendResponse.json();
            resultDiv.textContent = data.result;

        } catch (error) {
            resultDiv.textContent = 'Error: ' + error.message;
        }
    });

    // Handle Enter key
    queryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            queryButton.click();
        }
    });
});
