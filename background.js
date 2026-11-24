// Background Service Worker for Manifest V3
importScripts("companyNormalizer.js", "addressNormalizer.js", "geminiClient.js", "requestQueue.js", "crawlerEngine.js");

const queueManager = new CrawlerQueueManager({
  concurrency: 1,
  interRequestDelayMs: 1000
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log("Site Intelligence Crawler Extension installed / updated.");

  // Set default settings if not already present
  chrome.storage.local.get(["geminiModel", "fallbackModel", "crawlDepth", "concurrency", "interRequestDelayMs"], (res) => {
    const updates = {};
    if (!res.geminiModel) {
      updates.geminiModel = "gemini-3.5-flash-lite";
    }
    if (!res.fallbackModel) {
      updates.fallbackModel = "gemini-3.1-flash-lite";
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
        sendResponse({
          success: true,
          text: text,
          status: response.status,
          finalUrl: response.url || request.url,
          redirected: Boolean(response.redirected)
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open
  }

  // 1b. Website Redirect Detection & Status Classification
  if (request.action === "detectRedirectAndClassifyStatus") {
    CrawlerEngine.detectRedirectAndClassifyStatus(request.url, request.options || {})
      .then(res => sendResponse({ success: true, result: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
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

  // 6. Crawl & Extract for Portal Autofill (orchestrated in background)
  if (request.action === "crawlAndExtractForPortal") {
    (async () => {
      try {
        const stored = await chrome.storage.local.get([
          "geminiApiKey",
          "geminiModel",
          "fallbackModel",
          "backendProxyUrl",
          "crawlDepth"
        ]);

        const apiKey = stored.geminiApiKey || "";
        const primaryModel = stored.geminiModel || "gemini-3.5-flash-lite";
        const fallbackModel = stored.fallbackModel || "gemini-3.1-flash-lite";
        const backendProxyUrl = stored.backendProxyUrl || "";
        const crawlDepth = parseInt(stored.crawlDepth, 10) || 5;

        if (!apiKey && !backendProxyUrl) {
          throw new Error("Gemini API key is not configured. Please open extension settings and provide an API key.");
        }

        const result = await CrawlerEngine.crawlAndExtractUrl(request.targetUrl, {
          apiKey,
          primaryModel,
          fallbackModel,
          backendProxyUrl,
          crawlDepth
        });

        if (result && result.data && CrawlerEngine.applyBusinessTypeEligibilityRule) {
          result.data = CrawlerEngine.applyBusinessTypeEligibilityRule(result.data);
        }

        // Cache completed result
        const cleanKey = request.targetUrl.toLowerCase().split("#")[0].split("?")[0].replace(/\/$/, "");
        queueManager.completedMap[cleanKey] = {
          data: result.data,
          meta: result.meta,
          completedAt: new Date().toISOString()
        };
        await queueManager.saveState();

        sendResponse({ success: true, data: result.data, meta: result.meta });
      } catch (err) {
        console.error("Portal crawl error in service worker:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
