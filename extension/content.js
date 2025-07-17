function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console[level](`[PostQL] [${timestamp}] ${message}`, data);
}

log('info', 'content.js script loaded');

function isValidPostmanResponsePage() {
  try {
    const hostname = window.location.hostname;
    const validDomains = ['postman.com', 'postman.co'];
    const isValidDomain = validDomains.some(domain => new RegExp(`(^|\\.)${domain.replace('.', '\\.')}$`).test(hostname));
    if (!isValidDomain) {
      log('warn', 'Invalid domain', { hostname });
      return false;
    }

    // AI Agent: Scan DOM for response-like elements
    const responseElements = aiAgentDiscoverResponseElements();
    if (responseElements.length > 0) {
      log('info', 'AI-detected response elements', { elements: responseElements.map(e => e.tagName) });
      return true;
    }
    log('warn', 'No response elements found by AI agent');
    return false;
  } catch (e) {
    log('error', 'Error checking Postman page', { error: e.message });
    return false;
  }
}

function aiAgentDiscoverResponseElements() {
  // Hypothetical AI agent logic
  const candidates = document.querySelectorAll('pre, code, div[class*="response"], [data-testid]');
  const responseElements = [];
  for (let elem of candidates) {
    if (aiAgentIsResponseLike(elem)) {
      responseElements.push(elem);
    }
  }
  return responseElements;
}

function aiAgentIsResponseLike(element) {
  // Heuristic or lightweight NLP model to check if element contains JSON-like content
  const text = element.textContent.trim();
  return text.startsWith('{') || text.startsWith('[') || element.getAttribute('data-testid')?.includes('response');
}

async function waitForResponseTab(maxAttempts = 10, delay = 500) {
  log('info', 'Waiting for response tab');
  let attempts = 0;
  while (attempts < maxAttempts) {
      if (isValidPostmanResponsePage()) {
          log('info', 'Response tab detected');
          return true;
      }
      attempts++;
      log('info', `Waiting for response tab... (${maxAttempts - attempts} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
  }
  log('warn', 'Failed to detect response tab after max attempts');
  return false;
}

function setupResponseObserver() {
  if (!isValidPostmanResponsePage()) {
    log('info', 'Not a valid Postman response page, setting up delayed check');
    waitForResponseTab().then(() => setupResponseObserver());
    return;
  }

  const responseArea = aiAgentDiscoverResponseElements()[0];
  if (!responseArea) {
    log('error', 'No response area found for observer');
    return;
  }

  const observer = new MutationObserver((mutations) => {
    log('info', 'Response area mutation detected');
    if (isValidPostmanResponsePage()) {
      log('info', 'Response tab now available, initializing or updating');
      postqlAutoInit();
    }
  });

  observer.observe(responseArea, { childList: true, subtree: true, characterData: true });
  log('info', 'Response area MutationObserver initialized');
}

function setupSendButtonListener() {
  if (!isValidPostmanResponsePage()) {
      log('info', 'Not a valid Postman response page, skipping send button listener');
      return;
  }

  const sendButtonSelectors = [
      '[data-testid="send-request-button"]',
      'button[class*="send"]',
      '[aria-label="Send Request"]'
  ];
  const sendButton = sendButtonSelectors.find(selector => document.querySelector(selector));
  if (!sendButton) {
      log('warn', 'Send button not found', { selectors: sendButtonSelectors });
      return;
  }

  sendButton.addEventListener('click', () => {
      log('info', 'Send button clicked, preparing for response');
      // No fixed delay; rely on MutationObserver
  });
  log('info', 'Send button listener attached');
}

async function extractJsonFromPage() {
  if (!isValidPostmanResponsePage()) {
    throw new Error('Not a valid Postman response page');
  }

  const strategies = [
    { name: 'DOM-based copy', fn: tryDomCopy },
    { name: 'Monaco editor scraping', fn: tryMonacoScraping },
    { name: 'AI-driven DOM scan', fn: tryAiDomScan },
    { name: 'User-guided selection', fn: tryUserGuidedSelection }
  ];

  for (let strategy of strategies) {
    try {
      log('info', `Attempting ${strategy.name}`);
      const jsonData = await strategy.fn();
      if (jsonData) {
        log('info', `JSON extracted via ${strategy.name}`);
        // Store success for learning
        aiAgentRecordSuccess(strategy.name);
        return jsonData;
      }
    } catch (e) {
      log('warn', `${strategy.name} failed`, { error: e.message });
      aiAgentRecordFailure(strategy.name, e.message);
    }
  }

  log('warn', 'All extraction strategies failed');
  return null;
}

async function tryDomCopy() {
  const copyButtonSelectors = [
    '[data-testid="text-editor-copy-button-response-body"]',
    '[aria-label="Copy to Clipboard"]',
    'button[class*="copy"]'
  ];
  let copyButton;
  for (let selector of copyButtonSelectors) {
    copyButton = document.querySelector(selector);
    if (copyButton) break;
  }
  if (!copyButton) throw new Error('Copy button not found');
  copyButton.click();
  const clipboardText = await navigator.clipboard.readText();
  if (!clipboardText) throw new Error('Clipboard empty');
  return JSON.parse(clipboardText);
}

async function tryMonacoScraping() {
  const monacoSelectors = [
    '.monaco-editor .view-line',
    '[data-testid="response-pane"] pre',
    'div[class*="response"] pre',
    'pre'
  ];
  let textElement;
  for (let selector of monacoSelectors) {
    textElement = document.querySelector(selector);
    if (textElement && textElement.textContent.trim()) break;
  }
  if (!textElement || !textElement.textContent.trim()) {
    throw new Error('No text element found');
  }
  return JSON.parse(textElement.textContent.trim());
}

async function tryAiDomScan() {
  const responseElements = aiAgentDiscoverResponseElements();
  for (let elem of responseElements) {
    try {
      return JSON.parse(elem.textContent.trim());
    } catch (e) {
      continue;
    }
  }
  throw new Error('No valid JSON found in AI scan');
}

async function tryUserGuidedSelection() {
  // Prompt user to select response area (via modal or highlight)
  const userSelection = await promptUserForSelection();
  if (userSelection) {
    return JSON.parse(userSelection);
  }
  throw new Error('User-guided selection failed');
}

function aiAgentRecordSuccess(strategyName) {
  // Store success in chrome.storage.local or send to telemetry
  chrome.storage.local.set({ [`lastSuccess_${strategyName}`]: Date.now() });
}

function aiAgentRecordFailure(strategyName, error) {
  // Store failure reason for learning
  chrome.storage.local.set({ [`lastFailure_${strategyName}`]: { error, timestamp: Date.now() } });
}

async function postqlAutoInit() {
  if (!isValidPostmanResponsePage()) {
      log('info', 'Not a valid Postman response page, skipping initialization');
      return;
  }
  log('info', 'Initializing or updating PostQL');

  let jsonData = null;
  try {
      jsonData = await extractJsonFromPage();
      if (jsonData) {
          log('info', 'JSON extracted successfully');
      } else {
          log('warn', 'No JSON extracted, modal will be in read-only mode');
      }
  } catch (e) {
      log('error', 'JSON extraction failed', { error: e.message });
  }

  // Only inject or update modal if not already present
  if (!document.getElementById('postql-modal')) {
      injectPostQLModal(jsonData);
  } else {
      updatePostQLModal(jsonData);
  }
  log('info', 'PostQL initialized or updated successfully');
}

function injectPostQLModal(jsonData = null) {
  log('info', 'Injecting PostQL modal', { hasJson: !!jsonData });
  const modal = document.createElement('div');
  modal.id = 'postql-modal';
  modal.style.cssText = `
      position: fixed; right: 32px; bottom: 32px; z-index: 100000;
      background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.2);
      padding: 20px; min-width: 340px; max-width: 400px; font-family: sans-serif;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;cursor:move;-webkit-user-select:none;user-select:none;';
  const title = document.createElement('span');
  title.style.cssText = 'font-weight:bold;font-size:1.1em;';
  title.textContent = 'PostQL ✨';
  const closeButton = document.createElement('button');
  closeButton.style.cssText = 'background:none;border:none;font-size:1.2em;cursor:pointer;';
  closeButton.textContent = '×';
  header.appendChild(title);
  header.appendChild(closeButton);

  const queryInput = document.createElement('textarea');
  queryInput.id = 'postql-query';
  queryInput.placeholder = 'Ask anything about this response...';
  queryInput.style.cssText = 'width:100%;height:60px;margin-bottom:10px;';
  queryInput.disabled = !jsonData;

  const runButton = document.createElement('button');
  runButton.id = 'postql-run';
  runButton.style.cssText = 'width:100%;padding:8px 0;background:#007bfc;color:#fff;border:none;border-radius:4px;cursor:pointer;';
  runButton.textContent = 'Ask';
  runButton.disabled = !jsonData;

  const retryButton = document.createElement('button');
  retryButton.id = 'postql-retry';
  retryButton.style.cssText = 'width:100%;padding:8px 0;background:#28a745;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-top:8px;';
  retryButton.textContent = 'Retry Extraction';
  retryButton.style.display = jsonData ? 'none' : 'block';
  retryButton.onclick = () => postqlAutoInit();

  const resultDiv = document.createElement('div');
  resultDiv.id = 'postql-result';
  resultDiv.style.cssText = 'margin-top:12px;font-size:0.98em;color:#222;';
  resultDiv.textContent = jsonData ? 'Enter your query.' : 'No response data found. Please wait or retry.';

  modal.appendChild(header);
  modal.appendChild(queryInput);
  modal.appendChild(runButton);
  modal.appendChild(retryButton);
  modal.appendChild(resultDiv);

  document.body.appendChild(modal);
  log('info', 'Modal injected successfully', { zIndex: modal.style.zIndex });

  closeButton.onclick = () => {
      log('info', 'Modal closed by user');
      modal.remove();
  };
}

function updatePostQLModal(jsonData) {
  const modal = document.getElementById('postql-modal');
  if (!modal) return;

  const queryInput = modal.querySelector('#postql-query');
  const runButton = modal.querySelector('#postql-run');
  const retryButton = modal.querySelector('#postql-retry');
  const resultDiv = modal.querySelector('#postql-result');

  queryInput.disabled = !jsonData;
  runButton.disabled = !jsonData;
  retryButton.style.display = jsonData ? 'none' : 'block';
  resultDiv.textContent = jsonData ? 'Enter your query.' : 'No response data found. Please wait or retry.';
  log('info', 'Modal updated', { hasJson: !!jsonData });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
      log('info', 'DOMContentLoaded, setting up observers and listeners');
      setupResponseObserver();
      setupSendButtonListener();
  });
} else {
  log('info', 'Document already loaded, setting up observers and listeners');
  setupResponseObserver();
  setupSendButtonListener();
}