(function postqlDebugBanner() {
  if (document.getElementById('postql-debug-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'postql-debug-banner';
  banner.textContent = 'PostQL content script loaded';
  banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#007bfc;color:#fff;padding:2px 0;font-size:12px;text-align:center;z-index:9999999;pointer-events:none;opacity:0.85;';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3000);
})();

function log(level, message, data = {}) {
  if (process.env.NODE_ENV !== 'production') {
    const timestamp = new Date().toISOString();
    console[level](`[PostQL] [${timestamp}] ${message}`, data);
  }
}

log('info', 'content.js script loaded');

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    log('error', 'JSON parsing failed', { error: e.message, text });
    throw new PostQLError('Invalid JSON', { error: e.message, text });
  }
}

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

function isValidPostmanResponsePage() {
  try {
    const hostname = window.location.hostname;
    const validDomains = ['postman.com', 'postman.co'];
    const isValidDomain = validDomains.some(domain => {
      const regex = new RegExp(`(^|\\.)${domain.replace('.', '\\.')}$`);
      return regex.test(hostname);
    });
    if (!isValidDomain) {
      log('warn', 'Invalid domain', { hostname });
      return false;
    }
    const responseViewer = document.querySelector('.response-viewer-tab-content') ||
                          document.querySelector('[data-testid="response-pane"]') ||
                          document.querySelector('div[class*="response"]') ||
                          document.querySelector('.monaco-editor');
    if (!responseViewer) {
      log('warn', 'Response viewer not found', { selectors: ['.response-viewer-tab-content', '[data-testid="response-pane"]', 'div[class*="response"]', '.monaco-editor'] });
      return false;
    }
    log('info', 'Valid Postman response page detected', { hostname });
    return true;
  } catch (e) {
    log('error', 'Error checking Postman page', { error: e.message });
    return false;
  }
}

async function extractJsonFromPage({ sendToBackend = false } = {}) {
  if (!isValidPostmanResponsePage()) {
    throw new PostQLError('Invalid Postman response page', { hostname: window.location.hostname });
  }

  // Layer 1: DOM-Based Copy
  try {
    log('info', 'Attempting DOM-based copy extraction');
    let jsonData;
    let attempts = 5, delay = 1000;
    const copyButtonSelectors = [
      '[data-testid="text-editor-copy-button-response-body"]',
      '[aria-label="Copy to Clipboard"]',
      '.copy-response-button',
      'button[class*="copy"]'
    ];
    let copyButton;
    while (attempts--) {
      copyButton = copyButtonSelectors.map(selector => document.querySelector(selector)).find(btn => btn);
      if (copyButton) break;
      log('info', `Waiting for copy button... (${attempts} attempts left)`, { selectors: copyButtonSelectors });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
    if (!copyButton) {
      log('error', 'Copy button not found', { selectors: copyButtonSelectors });
      throw new PostQLError('Copy button not found', { selectors: copyButtonSelectors });
    }
    log('info', 'Copy button found, triggering click');
    copyButton.click();
    const clipboardText = await navigator.clipboard.readText();
    if (!clipboardText) {
      log('error', 'Empty clipboard after copy action');
      throw new PostQLError('Empty clipboard after copy action');
    }
    jsonData = safeParse(clipboardText);
    if (jsonData && typeof jsonData === 'object') {
      log('info', 'JSON extracted via DOM-based copy');
      const jsonSize = JSON.stringify(jsonData).length;
      if (jsonSize > 5 * 1024 * 1024) {
        log('error', 'JSON too large', { size: jsonSize });
        throw new PostQLError('JSON too large', { size: jsonSize });
      }
      if (sendToBackend) {
        const backendUrl = chrome.runtime.getManifest().backend_url || 'https://postql.onrender.com/api/query';
        log('info', 'Sending JSON to backend (DOM)', { backendUrl });
        const resp = await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ json: jsonData, query: '' })
        });
        if (!resp.ok) {
          log('error', 'Backend storage failed (DOM)', { status: resp.status });
          throw new PostQLError('Backend storage failed', { status: resp.status });
        }
        log('info', 'JSON sent to backend successfully (DOM)');
        return jsonData;
      } else {
        log('info', 'Storing JSON in chrome.storage.local (DOM)');
        await chrome.storage.local.set({ postql_json: jsonData });
        log('info', 'JSON stored successfully (DOM)');
        return jsonData;
      }
    }
  } catch (e) {
    log('warn', 'DOM-based copy extraction failed, trying Monaco editor', { error: e.message });
  }

  // Layer 2: Monaco Editor Scraping
  try {
    log('info', 'Attempting Monaco editor extraction');
    let jsonData;
    let attempts = 5, delay = 1000;
    const monacoSelectors = [
      '.monaco-editor .view-line',
      '[data-testid="response-pane"] pre',
      'div[class*="response"] pre',
      'pre'
    ];
    let textElement;
    while (attempts--) {
      textElement = monacoSelectors.map(selector => document.querySelector(selector)).find(el => el);
      if (textElement) break;
      log('info', `Waiting for Monaco editor text... (${attempts} attempts left)`, { selectors: monacoSelectors });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
    if (!textElement) {
      log('error', 'Monaco editor text not found', { selectors: monacoSelectors });
      throw new PostQLError('Monaco editor text not found', { selectors: monacoSelectors });
    }
    const jsonText = textElement.textContent.trim();
    if (!jsonText) {
      log('error', 'Empty Monaco editor text', { selector: textElement.tagName });
      throw new PostQLError('Empty Monaco editor text', { selector: textElement.tagName });
    }
    jsonData = safeParse(jsonText);
    if (jsonData && typeof jsonData === 'object') {
      log('info', 'JSON extracted via Monaco editor');
      const jsonSize = JSON.stringify(jsonData).length;
      if (jsonSize > 5 * 1024 * 1024) {
        log('error', 'JSON too large', { size: jsonSize });
        throw new PostQLError('JSON too large', { size: jsonSize });
      }
      if (sendToBackend) {
        const backendUrl = chrome.runtime.getManifest().backend_url || 'https://postql.onrender.com/api/query';
        log('info', 'Sending JSON to backend (Monaco)', { backendUrl });
        const resp = await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ json: jsonData, query: '' })
        });
        if (!resp.ok) {
          log('error', 'Backend storage failed (Monaco)', { status: resp.status });
          throw new PostQLError('Backend storage failed', { status: resp.status });
        }
        log('info', 'JSON sent to backend successfully (Monaco)');
        return jsonData;
      } else {
        log('info', 'Storing JSON in chrome.storage.local (Monaco)');
        await chrome.storage.local.set({ postql_json: jsonData });
        log('info', 'JSON stored successfully (Monaco)');
        return jsonData;
      }
    }
  } catch (e) {
    log('warn', 'Monaco editor extraction failed, trying network interception', { error: e.message });
  }

  // Layer 3: Network Interception
  try {
    log('info', 'Attempting network interception extraction');
    let jsonData;
    let attempts = 5, delay = 1000;
    window.__postql_network_data = window.__postql_network_data || [];
    if (!window.__postql_interceptor_injected) {
      log('info', 'Injecting network interceptor');
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          const originalFetch = window.fetch;
          window.fetch = async function(url, options) {
            const response = await originalFetch(url, options);
            const clone = response.clone();
            if (url.includes('/api/') || url.includes('/v1/')) {
              try {
                const data = await clone.json();
                window.__postql_network_data = window.__postql_network_data || [];
                window.__postql_network_data.push({ url, data });
                console.log('[PostQL] Intercepted network response', { url, data });
              } catch (e) {
                console.log('[PostQL] Failed to parse network response', { url, error: e.message });
              }
            }
            return response;
          };
        })();
      `;
      document.head.appendChild(script);
      window.__postql_interceptor_injected = true;
      log('info', 'Network interceptor injected');
    }
    while (attempts--) {
      const latestResponse = window.__postql_network_data
        .filter(item => item.url.includes('/api/') || item.url.includes('/v1/'))
        .slice(-1)[0];
      if (latestResponse && latestResponse.data && typeof latestResponse.data === 'object') {
        jsonData = latestResponse.data;
        log('info', 'JSON extracted via network interception', { url: latestResponse.url });
        break;
      }
      log('info', `Waiting for network response... (${attempts} attempts left)`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
    if (!jsonData) {
      log('error', 'No JSON found in network interception', { intercepted: window.__postql_network_data.length });
      throw new PostQLError('No JSON found in network interception', { intercepted: window.__postql_network_data.length });
    }
    const jsonSize = JSON.stringify(jsonData).length;
    if (jsonSize > 5 * 1024 * 1024) {
      log('error', 'JSON too large', { size: jsonSize });
      throw new PostQLError('JSON too large', { size: jsonSize });
    }
    if (sendToBackend) {
      const backendUrl = chrome.runtime.getManifest().backend_url || 'https://postql.onrender.com/api/query';
      log('info', 'Sending JSON to backend (Network)', { backendUrl });
      const resp = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: jsonData, query: '' })
      });
      if (!resp.ok) {
        log('error', 'Backend storage failed (Network)', { status: resp.status });
        throw new PostQLError('Backend storage failed', { status: resp.status });
      }
      log('info', 'JSON sent to backend successfully (Network)');
      return jsonData;
    } else {
      log('info', 'Storing JSON in chrome.storage.local (Network)');
      await chrome.storage.local.set({ postql_json: jsonData });
      log('info', 'JSON stored successfully (Network)');
      return jsonData;
    }
  } catch (e) {
    log('error', 'Network interception extraction failed', { error: e.message });
    throw new PostQLError('All extraction methods failed', { error: e.message });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleRequest = async () => {
    try {
      if (!request || typeof request !== 'object' || !request.action) {
        log('error', 'Malformed request', { request });
        throw new PostQLError('Malformed request', { request });
      }
      log('info', `Received message with action: ${request.action}`);
      switch (request.action) {
        case 'ping':
          return { success: true, version: chrome.runtime.getManifest().version };
        case 'getJson':
          const jsonData = await extractJsonFromPage();
          log('info', 'JSON retrieved for getJson action');
          return {
            success: true,
            json: jsonData,
            timestamp: new Date().toISOString()
          };
        default:
          log('error', 'Unknown action', { action: request.action });
          throw new PostQLError('Unknown action', { action: request.action });
      }
    } catch (error) {
      log('error', 'Message handler error', { error });
      return {
        success: false,
        error: error instanceof PostQLError ? error.toJSON() : { error: 'UnknownError', message: error.message || String(error) }
      };
    }
  };
  handleRequest().then(sendResponse);
  return true;
});

function injectPostQLModal(errorMessage = null) {
  if (document.getElementById('postql-modal')) {
    log('info', 'Modal already exists, skipping injection');
    return;
  }
  log('info', 'Injecting PostQL modal', { errorMessage });
  const modal = document.createElement('div');
  modal.id = 'postql-modal';
  modal.style.cssText = `
    position: fixed; right: 32px; bottom: 32px; z-index: 100000;
    background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.2);
    padding: 20px; min-width: 340px; max-width: 400px; font-family: sans-serif;
    transition: box-shadow 0.1s; cursor: default;
  `;

  const header = document.createElement('div');
  header.id = 'postql-modal-header';
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;cursor:move;-webkit-user-select:none;user-select:none;';
  const title = document.createElement('span');
  title.style.cssText = 'font-weight:bold;font-size:1.1em;';
  title.textContent = 'PostQL ✨';
  const closeButton = document.createElement('button');
  closeButton.id = 'postql-close';
  closeButton.style.cssText = 'background:none;border:none;font-size:1.2em;cursor:pointer;';
  closeButton.textContent = '×';
  header.appendChild(title);
  header.appendChild(closeButton);

  const queryInput = document.createElement('textarea');
  queryInput.id = 'postql-query';
  queryInput.placeholder = 'Ask anything about this response...';
  queryInput.style.cssText = 'width:100%;height:60px;margin-bottom:10px;';
  queryInput.disabled = !!errorMessage;

  const runButton = document.createElement('button');
  runButton.id = 'postql-run';
  runButton.style.cssText = 'width:100%;padding:8px 0;background:#007bfc;color:#fff;border:none;border-radius:4px;cursor:pointer;';
  runButton.textContent = 'Ask';
  runButton.disabled = !!errorMessage;

  const retryButton = document.createElement('button');
  retryButton.id = 'postql-retry';
  retryButton.style.cssText = 'width:100%;padding:8px 0;background:#28a745;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-top:8px;';
  retryButton.textContent = 'Retry Extraction';
  retryButton.style.display = errorMessage ? 'block' : 'none';

  const resultDiv = document.createElement('div');
  resultDiv.id = 'postql-result';
  resultDiv.style.cssText = 'margin-top:12px;font-size:0.98em;color:#222;';
  resultDiv.textContent = errorMessage || '';

  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'postql-loading';
  loadingDiv.style.cssText = 'display:none;margin-top:8px;color:#007bfc;';
  loadingDiv.textContent = 'Loading...';

  modal.appendChild(header);
  modal.appendChild(queryInput);
  modal.appendChild(runButton);
  modal.appendChild(retryButton);
  modal.appendChild(loadingDiv);
  modal.appendChild(resultDiv);
  document.body.appendChild(modal);
  log('info', 'Modal injected successfully', { zIndex: modal.style.zIndex });

  closeButton.onclick = () => {
    log('info', 'Modal closed by user');
    modal.remove();
  };
  retryButton.onclick = async () => {
    log('info', 'User triggered retry extraction');
    retryButton.disabled = true;
    retryButton.textContent = 'Retrying...';
    resultDiv.textContent = 'Attempting to extract JSON...';
    try {
      const json = await extractJsonFromPage();
      if (!json) {
        throw new PostQLError('No JSON extracted on retry');
      }
      await chrome.storage.local.set({ postql_json: json });
      queryInput.disabled = false;
      runButton.disabled = false;
      retryButton.style.display = 'none';
      resultDiv.textContent = 'JSON extracted successfully. Enter your query.';
      log('info', 'Retry extraction successful');
    } catch (e) {
      resultDiv.textContent = e.message || 'Failed to extract JSON. Please retry or refresh the page.';
      log('error', 'Retry extraction failed', { error: e.message });
    } finally {
      retryButton.disabled = false;
      retryButton.textContent = 'Retry Extraction';
    }
  };
  runButton.onclick = async () => {
    const q = queryInput.value.trim().replace(/[<>]/g, '').slice(0, 256);
    if (!q) {
      resultDiv.textContent = 'Please enter a query';
      log('warn', 'Empty query submitted');
      return;
    }

    queryInput.readOnly = true;
    runButton.disabled = true;
    runButton.textContent = 'Processing...';
    runButton.style.opacity = '0.7';
    runButton.style.cursor = 'wait';
    loadingDiv.style.display = 'block';
    resultDiv.textContent = 'Querying...';
    log('info', 'Submitting query', { query: q });

    async function getPostqlJson() {
      return new Promise((resolve, reject) => {
        if (!chrome.storage?.local) {
          log('error', 'Chrome storage unavailable');
          reject(new PostQLError('Chrome storage unavailable'));
        }
        chrome.storage.local.get('postql_json', (result) => {
          if (chrome.runtime.lastError) {
            log('error', 'Storage error', { error: chrome.runtime.lastError.message });
            reject(new PostQLError('Storage error', { error: chrome.runtime.lastError.message }));
          } else {
            resolve(result.postql_json);
          }
        });
      });
    }

    try {
      const json = await getPostqlJson();
      if (!json) {
        resultDiv.textContent = 'No JSON found in storage. Please retry extraction or refresh the page.';
        log('error', 'No JSON in storage for query');
        retryButton.style.display = 'block';
        return;
      }
      const backendUrl = chrome.runtime.getManifest().backend_url || 'https://postql.onrender.com/api/query';
      log('info', 'Sending query to backend', { backendUrl });
      const resp = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json, query: q })
      });
      if (!resp.ok) {
        log('error', 'Backend request failed', { status: resp.status });
        throw new PostQLError('Backend request failed', { status: resp.status });
      }
      const data = await resp.json();
      resultDiv.textContent = data?.data?.result || data?.result || 'No result found';
      log('info', 'Query result received', { result: resultDiv.textContent });
    } catch (e) {
      resultDiv.textContent = e instanceof PostQLError ? e.message : 'Backend error.';
      log('error', 'Query processing failed', { error: e.message });
      retryButton.style.display = 'block';
    } finally {
      queryInput.readOnly = false;
      runButton.disabled = false;
      runButton.textContent = 'Ask';
      runButton.style.opacity = '1';
      runButton.style.cursor = 'pointer';
      loadingDiv.style.display = 'none';
    }
  };

  let isDragging = false, startX, startY, startLeft, startTop;
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    modal.style.transition = 'none';
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
    log('info', 'Modal drag started');
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const rect = modal.getBoundingClientRect();
    modal.style.left = Math.max(0, Math.min(startLeft + dx, window.innerWidth - rect.width)) + 'px';
    modal.style.top = Math.max(0, Math.min(startTop + dy, window.innerHeight - rect.height)) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      modal.style.transition = '';
      document.body.style.userSelect = '';
      log('info', 'Modal drag ended');
    }
  });
}

async function postqlAutoInit() {
  if (!isValidPostmanResponsePage()) {
    log('info', 'Not a valid Postman response page, skipping initialization');
    return;
  }
  let attempts = 5;
  let errorMessage = null;
  while (attempts--) {
    log('info', `Attempt ${5 - attempts} to extract JSON`);
    try {
      const json = await extractJsonFromPage();
      if (!json) {
        log('warn', 'No JSON extracted');
        throw new PostQLError('No JSON extracted');
      }
      log('info', 'JSON extracted successfully');
      await chrome.storage.local.set({ postql_json: json });
      log('info', 'Injecting PostQL modal');
      injectPostQLModal();
      return;
    } catch (e) {
      log('error', 'Failed to extract JSON from page', { error: e.message });
      errorMessage = e.message || 'Failed to extract JSON. Please retry or refresh the page.';
      if (attempts === 0) {
        log('error', 'Failed to extract JSON from page after 5 attempts');
        injectPostQLModal(errorMessage);
      }
    }
  }
}

if (document.readyState === 'loading') {
  log('info', 'Document still loading, waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', () => {
    log('info', 'DOMContentLoaded, running postqlAutoInit');
    postqlAutoInit();
  });
} else {
  log('info', 'Document already loaded, running postqlAutoInit');
  postqlAutoInit();
}

let debounceTimeout;
const observer = new MutationObserver(() => {
  log('info', 'DOM mutation detected, scheduling postqlAutoInit');
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    log('info', 'Running debounced postqlAutoInit');
    postqlAutoInit();
  }, 1500);
});
observer.observe(document.body, { childList: true, subtree: true });
log('info', 'MutationObserver initialized');