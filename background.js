// Background Service Worker for Manifest V3
importScripts("geminiClient.js", "requestQueue.js");

const queueManager = new CrawlerQueueManager({
  concurrency: 1,
  interRequestDelayMs: 1000
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log("Site Intelligence Crawler Extension installed / updated.");

  // Set default settings if not already present
  chrome.storage.local.get(["geminiModel", "fallbackModel", "crawlDepth", "concurrency", "interRequestDelayMs"], (res) => {
    const updates = {};
    // Ensure default model is a valid, high-availability model
    if (!res.geminiModel || res.geminiModel.includes("3.5") || res.geminiModel.includes("3.1")) {
      updates.geminiModel = "gemini-2.5-flash";
    }
    if (!res.fallbackModel) {
      updates.fallbackModel = "gemini-1.5-flash";
    }
    if (!res.crawlDepth) {
      updates.crawlDepth = 5;
    }
    if (!res.concurrency) {
      updates.concurrency = 1;
    }
    if (!res.interRequestDelayMs) {
      updates.interRequestDelayMs = 1000;
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });

  await queueManager.init();
});

// Initialize queue when service worker wakes up
queueManager.init().catch(err => console.warn("Queue init error:", err));

// Listener for subpage fetch requests and queue management
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Fetch subpage
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
    return true; // Keep message channel open
  }

  // 2. Queue Enqueue
  if (request.action === "enqueueCrawlerTask") {
    queueManager.enqueue(request.task)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 3. Queue Status
  if (request.action === "getQueueStatus") {
    sendResponse({ success: true, status: queueManager.getStatus() });
    return false;
  }

  // 4. Retry Failed
  if (request.action === "retryFailedTasks") {
    queueManager.retryAllFailed()
      .then(count => sendResponse({ success: true, retriedCount: count }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 5. Direct Gemini Call with retry & fallback
  if (request.action === "callGeminiApi") {
    GeminiClient.callGeminiWithRetryAndFallback(request.options)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message, isPermanent: err.isPermanent }));
    return true;
  }
});
