// --- PostQL content.js loaded ---
(function postqlDebugBanner() {
  if (document.getElementById('postql-debug-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'postql-debug-banner';
  banner.textContent = 'PostQL content script loaded';
  banner.style = 'position:fixed;top:0;left:0;width:100%;background:#007bfc;color:#fff;padding:2px 0;font-size:12px;text-align:center;z-index:9999999;pointer-events:none;opacity:0.85;';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3000);
})();

console.log('[PostQL] content.js script loaded');

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Error class for PostQL specific errors
class PostQLError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PostQLError';
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

// Check if we're on a valid Postman response page
function isValidPostmanResponsePage() {
  try {
    const hostname = window.location.hostname;
    const validDomains = ['postman.com', 'postman.co'];
    const isValidDomain = validDomains.some(domain => {
      const regex = new RegExp(`(^|\\.)${domain.replace('.', '\\.')}$`);
      return regex.test(hostname);
    });
    if (!isValidDomain) return false;
    const responseViewer = document.querySelector('.response-viewer-tab-content');
    return !!responseViewer;
  } catch {
    return false;
  }
}

// Extract JSON from the current page
function extractJsonFromPage() {
  try {
    if (!isValidPostmanResponsePage()) return null;
    // Find Monaco editor inside the response viewer
    const editor = document.querySelector('.response-viewer-tab-content .monaco-editor');
    if (!editor) return null;
    // Get all lines of the JSON response
    const lines = Array.from(editor.querySelectorAll('.view-line')).map(line => line.textContent);
    if (!lines.length) return null;
    const jsonText = lines.join('\n').trim();
    const parsed = safeParse(jsonText);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

// Handle messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleRequest = async () => {
    try {
      if (!request || typeof request !== 'object' || !request.action) {
        throw new PostQLError('Malformed request', { request });
      }
      switch (request.action) {
        case 'ping':
          return { success: true, version: chrome.runtime.getManifest().version };
        case 'getJson':
          const jsonData = extractJsonFromPage();
          PostQLState.currentJson = jsonData;
          return {
            success: true,
            json: jsonData,
            timestamp: new Date().toISOString()
          };
        default:
          throw new PostQLError('Unknown action', { action: request.action });
      }
    } catch (error) {
      console.error('PostQL: Message handler error:', error);
      return {
        success: false,
        error: error instanceof PostQLError ? error.toJSON() : (error && error.message ? error.message : error)
      };
    }
  };
  const response = handleRequest();
  return response instanceof Promise ? response.then(sendResponse) : sendResponse(response);
});

// --- PostQL: New Modal/NLP Query UI ---

function injectPostQLModal() {
  if (document.getElementById('postql-modal')) return; // prevent duplicates
  const modal = document.createElement('div');
  modal.id = 'postql-modal';
  // Start in lower right, but use left/top for drag
  modal.style = `
    position: fixed; left: unset; top: unset; right: 32px; bottom: 32px; z-index: 99999;
    background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.2);
    padding: 20px; min-width: 340px; max-width: 400px; font-family: sans-serif;
    transition: box-shadow 0.1s;
    cursor: default;
  `;
  modal.innerHTML = `
    <div id="postql-modal-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;cursor:move;-webkit-user-select:none;user-select:none;">
      <span style="font-weight:bold;font-size:1.1em;">PostQL ✨</span>
      <button id="postql-close" style="background:none;border:none;font-size:1.2em;cursor:pointer;">×</button>
    </div>
    <textarea id="postql-query" placeholder="Ask anything about this response..." style="width:100%;height:60px;margin-bottom:10px;"></textarea>
    <button id="postql-run" style="width:100%;padding:8px 0;background:#007bfc;color:#fff;border:none;border-radius:4px;cursor:pointer;">Ask</button>
    <div id="postql-result" style="margin-top:12px;font-size:0.98em;color:#222;"></div>
  `;
  document.body.appendChild(modal);
  document.getElementById('postql-close').onclick = () => modal.remove();
  document.getElementById('postql-run').onclick = async function() {
    const queryInput = document.getElementById('postql-query');
    const runButton = this; // Reference to the clicked button
    
    const q = queryInput.value.trim();
    if (!q) return;
    
    // Disable input and button during processing
    queryInput.readOnly = true;
    runButton.disabled = true;
    runButton.textContent = 'Processing...';
    runButton.style.opacity = '0.7';
    runButton.style.cursor = 'wait';
    document.getElementById('postql-result').textContent = 'Querying...';
    // Wrap chrome.storage.local.get in a Promise with error handling
    async function getPostqlJson() {
      return new Promise((resolve, reject) => {
        try {
          if (!chrome.storage || !chrome.storage.local) {
            throw new Error('Chrome storage is not available');
          }
          chrome.storage.local.get('postql_json', (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result.postql_json);
            }
          });
        } catch (e) {
          reject(e);
        }
      });
    }

    let json;
    try {
      json = await getPostqlJson();
      if (!json) {
        document.getElementById('postql-result').textContent = 'No JSON found in storage.';
        return;
      }
    } catch (e) {
      console.error('Error accessing Chrome storage:', e);
      document.getElementById('postql-result').textContent = 'Error: Could not access storage. Please refresh the page and try again.';
      return;
    }
    try {
      const resp = await fetch('https://postql.onrender.com/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json, query: q })
      });
      const data = await resp.json();
      // Extract just the result text from the response
      const resultText = data?.data?.result || data?.result || 'No result found';
      document.getElementById('postql-result').textContent = resultText;
    } catch (e) {
      document.getElementById('postql-result').textContent = 'Backend error.';
    } finally {
      // Re-enable input and button when done
      const queryInput = document.getElementById('postql-query');
      const runButton = document.getElementById('postql-run');
      if (queryInput) queryInput.readOnly = false;
      if (runButton) {
        runButton.disabled = false;
        runButton.textContent = 'Ask';
        runButton.style.opacity = '1';
        runButton.style.cursor = 'pointer';
      }
    }
  };

  // --- Make modal draggable ---
  const header = modal.querySelector('#postql-modal-header');
  let isDragging = false, startX, startY, startLeft, startTop;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    modal.style.transition = 'none';
    // Set left/top if not already (from right/bottom)
    if (modal.style.right && !modal.style.left) {
      const rect = modal.getBoundingClientRect();
      modal.style.left = rect.left + 'px';
      modal.style.top = rect.top + 'px';
      modal.style.right = '';
      modal.style.bottom = '';
    }
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(modal.style.left, 10);
    startTop = parseInt(modal.style.top, 10);
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    modal.style.left = (startLeft + dx) + 'px';
    modal.style.top = (startTop + dy) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      modal.style.transition = '';
      document.body.style.userSelect = '';
    }
  });
}


async function postqlAutoInit() {
  // Step 1: Check if valid Postman response page
  if (!isValidPostmanResponsePage()) {
    console.info('[PostQL] Not a valid Postman response page');
    return;
  }
  console.info('[PostQL] Valid Postman response page detected');

  // Step 2: Try extracting JSON
  const json = extractJsonFromPage();
  if (!json) {
    console.info('[PostQL] Failed to extract JSON from page');
    return;
  }
  console.info('[PostQL] JSON extracted successfully');

  await chrome.storage.local.set({ postql_json: json });
  console.info('[PostQL] Injecting PostQL modal...');
  injectPostQLModal();
}


// Run on load and on DOM changes
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', postqlAutoInit);
} else {
  postqlAutoInit();
}

const observer = new MutationObserver(() => {
  postqlAutoInit();
});
observer.observe(document.body, { childList: true, subtree: true });

