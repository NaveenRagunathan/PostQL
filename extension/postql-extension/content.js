let cachedJson = null;

// Function to inject the UI
function injectUI() {
  // Don't re-inject if the UI already exists.
  if (document.getElementById('postql-main-container')) return;

  console.log('PostQL: Injecting UI.');

  // --- Main Container (for dragging and theming) ---
  const mainContainer = document.createElement('div');
  mainContainer.id = 'postql-main-container';

  // --- Draggable Header ---
  const header = document.createElement('div');
  header.id = 'postql-header';
  header.textContent = 'PostQL - Drag Me';

  // --- Input and Button Container ---
  const inputContainer = document.createElement('div');
  inputContainer.id = 'postql-input-container';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'postql-query-input';
  input.placeholder = 'Ask a question... (Press Enter to submit)';

  const button = document.createElement('button');
  button.id = 'postql-query-button';
  button.textContent = 'Run Query';

  // --- Result Display ---
  const resultDiv = document.createElement('div');
  resultDiv.id = 'postql-result';
  resultDiv.textContent = 'Your results will appear here.';

  // --- Assemble UI ---
  inputContainer.appendChild(input);
  inputContainer.appendChild(button);
  mainContainer.appendChild(header);
  mainContainer.appendChild(inputContainer);
  mainContainer.appendChild(resultDiv);
  document.body.appendChild(mainContainer); // Append to body to avoid CSS conflicts

  // --- Feature 1: Submit on Enter Key ---
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      button.click();
    }
  });

  // --- Feature 2: Draggable UI ---
  let isDragging = false;
  let offsetX, offsetY;
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - mainContainer.getBoundingClientRect().left;
    offsetY = e.clientY - mainContainer.getBoundingClientRect().top;
    mainContainer.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      mainContainer.style.left = `${e.clientX - offsetX}px`;
      mainContainer.style.top = `${e.clientY - offsetY}px`;
    }
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
    mainContainer.style.cursor = 'default';
  });

  // --- Feature 3: Theme Detection ---
  const themeObserver = new MutationObserver(() => {
    const isDark = document.body.classList.contains('theme-dark');
    mainContainer.classList.toggle('dark-mode', isDark);
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  mainContainer.classList.toggle('dark-mode', document.body.classList.contains('theme-dark'));

  // --- Main Query Logic ---
  button.onclick = async () => {
    const query = input.value;
    if (!query) {
      resultDiv.textContent = 'Please enter a query.';
      return;
    }
    resultDiv.textContent = 'Running query...';

    const executeQuery = async (json) => {
      try {
        const response = await fetch('https://postql-backend.onrender.com/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ json, query }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          resultDiv.textContent = `Error: ${errorData.error || 'Failed to process query'}`;
          return;
        }
        const data = await response.json();
        resultDiv.textContent = data.result;
      } catch (error) {
        resultDiv.textContent = `Error: ${error.message}`;
      }
    };

    // Try to get JSON from clipboard first
    try {
      const clipboardText = await navigator.clipboard.readText();
      const json = JSON.parse(clipboardText);
      await executeQuery(json);
    } catch (error) {
      console.error('Failed to get JSON from clipboard:', error);
      // If clipboard fails, try to get JSON from the page
      try {
        const elements = document.querySelectorAll('.response-viewer-tab-content');
        for (const element of elements) {
          const jsonText = element.textContent.trim();
          if (jsonText) {
            const json = JSON.parse(jsonText);
            await executeQuery(json);
            return;
          }
        }
        resultDiv.textContent = 'No JSON data found in clipboard or page.';
      } catch (error) {
        console.error('Failed to get JSON from page:', error);
        resultDiv.textContent = 'No valid JSON data found. Please copy JSON data to clipboard or ensure it is visible on the page.';
      }
    }
  };

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getJson') {
      // Handle async clipboard reading
      navigator.clipboard.readText()
        .then(clipboardText => {
          try {
            const json = JSON.parse(clipboardText);
            sendResponse({ json });
          } catch (error) {
            // Try page content
            try {
              const elements = document.querySelectorAll('.response-viewer-tab-content');
              for (const element of elements) {
                const jsonText = element.textContent.trim();
                if (jsonText) {
                  const json = JSON.parse(jsonText);
                  sendResponse({ json });
                  return;
                }
              }
            } catch (error) {
              console.error('Failed to get JSON from page:', error);
            }
            sendResponse(null);
          }
        })
        .catch(error => {
          console.error('Failed to read clipboard:', error);
          sendResponse(null);
        });
      return true; // Will respond asynchronously
    }
  });
}

// --- CSS Styles ---
function addStyles() {
  if (document.getElementById('postql-styles')) return;
  const style = document.createElement('style');
  style.id = 'postql-styles';
  style.textContent = `
    :root {
      --postql-bg: #f9f9f9; 
      --postql-text: #333; 
      --postql-border: #ccc; 
      --postql-header-bg: #e0e0e0; 
      --postql-input-bg: #fff; 
      --postql-result-bg: #fff; 
      --postql-button-bg: #007bff; 
      --postql-button-text: #fff;
    }
    #postql-main-container { 
      display: flex; 
      flex-direction: column; 
      position: fixed; 
      bottom: 20px; 
      right: 20px; 
      width: 500px; 
      height: 400px; 
      background-color: var(--postql-bg); 
      border: 1px solid var(--postql-border); 
      border-radius: 8px; 
      box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
      z-index: 9999; 
      font-family: sans-serif; 
      color: var(--postql-text); 
    }
    #postql-main-container.dark-mode { 
      --postql-bg: #3a3a3a; 
      --postql-text: #f0f0f0; 
      --postql-border: #555; 
      --postql-header-bg: #4a4a4a; 
      --postql-input-bg: #2a2a2a; 
      --postql-result-bg: #2a2a2a; 
      --postql-button-bg: #0d6efd; 
    }
    #postql-header { 
      padding: 8px 12px; 
      background-color: var(--postql-header-bg); 
      cursor: grab; 
      border-top-left-radius: 7px; 
      border-top-right-radius: 7px; 
      border-bottom: 1px solid var(--postql-border); 
      font-size: 14px; 
      font-weight: bold; 
    }
    #postql-input-container { 
      display: flex; 
      padding: 10px; 
    }
    #postql-query-input { 
      flex-grow: 1; 
      padding: 8px; 
      border: 1px solid var(--postql-border); 
      border-radius: 4px; 
      margin-right: 10px; 
      background-color: var(--postql-input-bg); 
      color: var(--postql-text); 
    }
    #postql-query-button { 
      padding: 8px 12px; 
      border: none; 
      background-color: var(--postql-button-bg); 
      color: var(--postql-button-text); 
      border-radius: 4px; 
      cursor: pointer; 
      transition: background-color 0.2s; 
    }
    #postql-query-button:hover { 
      opacity: 0.9; 
    }
    #postql-result { 
      flex-grow: 1; 
      padding: 12px; 
      margin: 0 10px 10px 10px; 
      background-color: var(--postql-result-bg); 
      border: 1px solid var(--postql-border); 
      border-radius: 4px; 
      overflow-y: auto; 
      white-space: pre-wrap; 
      font-family: monospace; 
    }
  `;
  document.head.appendChild(style);
}

// --- Initializer ---
const observer = new MutationObserver(() => {
  const targetPane = document.querySelector('.response-viewer-tab-content');
  const ui = document.getElementById('postql-main-container');

  if (targetPane && !ui) {
    // If the pane exists but our UI doesn't, inject it and clear any old cache.
    cachedJson = null;
    injectUI();
  } else if (!targetPane && ui) {
    // If the pane is gone but our UI exists, remove it and clear the cache.
    ui.remove();
    cachedJson = null;
  }
});

observer.observe(document.body, { childList: true, subtree: true });
addStyles();

console.log('PostQL: Content script v3 loaded.');
