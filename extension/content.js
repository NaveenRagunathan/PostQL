// Store the current JSON data and state
let currentJson = null;
let isInitialized = false;

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
    if (!window.location.hostname.endsWith('postman.com')) {
      throw new PostQLError('Not a Postman domain', { url: window.location.href });
    }
    
    const responseViewer = document.querySelector('.response-viewer-tab-content');
    if (!responseViewer) {
      throw new PostQLError('Not a valid Postman response tab');
    }
    
    return true;
  } catch (error) {
    console.error('PostQL: Validation error:', error);
    return false;
  }
}

// Extract JSON from the current page
function extractJsonFromPage() {
  const context = { selector: '.response-viewer-tab-content pre' };
  
  try {
    if (!isValidPostmanResponsePage()) {
      throw new PostQLError('Not a valid Postman response page');
    }

    const jsonElement = document.querySelector(context.selector);
    if (!jsonElement) {
      throw new PostQLError('JSON element not found', { selector: context.selector });
    }

    const jsonText = jsonElement.textContent.trim();
    if (!jsonText) {
      throw new PostQLError('Empty JSON response');
    }

    return JSON.parse(jsonText);
  } catch (error) {
    console.error('PostQL: Failed to extract JSON:', {
      error: error instanceof PostQLError ? error.toJSON() : error,
      context
    });
    throw error;
  }
}

// Handle messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleRequest = async () => {
    try {
      switch (request.action) {
        case 'ping':
          return { success: true, version: chrome.runtime.getManifest().version };
          
        case 'getJson':
          const jsonData = extractJsonFromPage();
          currentJson = jsonData; // Store the parsed JSON
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
        error: error instanceof PostQLError ? error.toJSON() : error.message
      };
    }
  };

  const response = handleRequest();
  return response instanceof Promise ? response.then(sendResponse) : sendResponse(response);
});

// Initialize the content script
function initialize() {
  if (isInitialized) return;
  
  try {
    if (isValidPostmanResponsePage()) {
      console.log('PostQL: Content script initialized');
      isInitialized = true;
      
      // Notify the background script that we're ready
      chrome.runtime.sendMessage({ action: 'contentScriptReady' });
    }
  } catch (error) {
    console.error('PostQL: Initialization failed:', error);
  }
}

// Run initialization when the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Watch for dynamic content changes
const observer = new MutationObserver(() => {
  if (isValidPostmanResponsePage() && !isInitialized) {
    initialize();
  }
});

// Start observing the document with the configured parameters
observer.observe(document.body, { 
  childList: true, 
  subtree: true,
  attributes: true,
  characterData: true
});

addStyles();

console.log('PostQL: Content script v3 loaded.');
