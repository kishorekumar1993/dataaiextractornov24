// Background Service Worker for Manifest V3
chrome.runtime.onInstalled.addListener(() => {
  console.log("Site Intelligence Crawler Extension installed successfully.");
  // Set default settings if not already present
  chrome.storage.local.get(["geminiModel", "crawlDepth"], (res) => {
    if (!res.geminiModel) {
      chrome.storage.local.set({ geminiModel: "gemini-3.5-flash-lite" });
    }
    if (!res.crawlDepth) {
      chrome.storage.local.set({ crawlDepth: 5 });
    }
  });
});

// Listener for subpage fetch requests to handle any potential CORS/CSP edge cases
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchUrl") {
    fetch(request.url, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const text = await response.text();
        sendResponse({ success: true, text: text, status: response.status });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});
