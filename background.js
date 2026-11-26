// Background Service Worker for Manifest V3
importScripts("companyNormalizer.js", "addressNormalizer.js", "restrictionValidator.js", "geminiClient.js", "requestQueue.js", "crawlerEngine.js");

const queueManager = new CrawlerQueueManager({
  concurrency: 1,
  interRequestDelayMs: 1000
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log("Site Intelligence Crawler Extension installed / updated.");

  // Set default settings if not already present
  const res = await chrome.storage.local.get(["geminiModel", "fallbackModel", "crawlDepth", "concurrency", "interRequestDelayMs"]);
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
    await chrome.storage.local.set(updates);
  }

  await queueReady;
});

// Initialize queue once when service worker wakes up
const queueReady = queueManager.init().catch(err => console.warn("Queue init error:", err));

// Listener for subpage fetch requests and queue management
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Fetch subpage
  if (request.action === "fetchUrl") {
    let parsedUrl;
    try {
      parsedUrl = new URL(request.url);
    } catch (_) {
      sendResponse({ success: false, error: "Invalid URL" });
      return false;
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      sendResponse({ success: false, error: `Unsupported protocol: ${parsedUrl.protocol}` });
      return false;
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 20000) : null;

    fetch(parsedUrl.href, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller ? controller.signal : undefined
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
        sendResponse({ success: false, error: error.name === "AbortError" ? "Fetch timed out after 20s" : error.message });
      })
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
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
    queueReady
      .then(() => queueManager.enqueue(request.task))
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 3. Queue Status
  if (request.action === "getQueueStatus") {
    queueReady
      .then(() => sendResponse({ success: true, status: queueManager.getStatus() }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 4. Retry Failed
  if (request.action === "retryFailedTasks") {
    queueReady
      .then(() => queueManager.retryAllFailed())
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
  const CRAWL_CACHE_VERSION = "v8";
  if (request.action === "crawlAndExtractForPortal") {
    (async () => {
      try {
        await queueReady;
        const cleanKey = request.targetUrl.toLowerCase().split("#")[0].split("?")[0].replace(/\/$/, "");
        const cached = !request.forceRefresh ? queueManager.completedMap[cleanKey] : null;
        if (cached && cached.cacheVersion === CRAWL_CACHE_VERSION && cached.data && cached.completedAt) {
          const ageMs = Date.now() - (Date.parse(cached.completedAt) || 0);
          if (ageMs >= 0 && ageMs < 15 * 60 * 1000) {
            sendResponse({
              success: true,
              data: cached.data,
              meta: { ...(cached.meta || {}), cached: true }
            });
            return;
          }
        }

        const stored = await chrome.storage.local.get([
          "geminiApiKey",
          "geminiModel",
          "fallbackModel",
          "backendProxyUrl",
          "backendProxyToken",
          "crawlDepth"
        ]);

        const apiKey = stored.geminiApiKey || "";
        const primaryModel = stored.geminiModel || "gemini-3.5-flash-lite";
        const fallbackModel = stored.fallbackModel || "gemini-3.1-flash-lite";
        const backendProxyUrl = stored.backendProxyUrl || "";
        const backendProxyToken = stored.backendProxyToken || "";
        const crawlDepth = parseInt(stored.crawlDepth, 10) || 5;

        // If API key is not configured, CrawlerEngine runs in resilient offline heuristic extraction mode
        if (!apiKey && !backendProxyUrl) {
          console.warn("Gemini API key not configured. Crawling will run in resilient offline heuristic mode.");
        }

        const renderTabFallback = async (url) => {
          if (!chrome.tabs || !chrome.scripting) return "";
          let tabId = null;
          try {
            const tab = await chrome.tabs.create({ url, active: false });
            tabId = tab.id;
            await new Promise((resolve) => {
              const timer = setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                resolve();
              }, 10000);
              const onUpdated = (id, info) => {
                if (id === tabId && info.status === "complete") {
                  clearTimeout(timer);
                  chrome.tabs.onUpdated.removeListener(onUpdated);
                  setTimeout(resolve, 800); // allow SPA hydration
                }
              };
              chrome.tabs.onUpdated.addListener(onUpdated);
            });
            const [res] = await chrome.scripting.executeScript({
              target: { tabId },
              func: () => (document.documentElement ? document.documentElement.outerHTML : "")
            });
            return res && res.result ? res.result : "";
          } catch (_) {
            return "";
          } finally {
            if (tabId !== null) {
              try { await chrome.tabs.remove(tabId); } catch (_) {}
            }
          }
        };

        const result = await CrawlerEngine.crawlAndExtractUrl(request.targetUrl, {
          apiKey,
          primaryModel,
          fallbackModel,
          backendProxyUrl,
          backendProxyToken,
          crawlDepth,
          renderTabFallback
        });

        if (result && result.data && CrawlerEngine.applyBusinessTypeEligibilityRule) {
          result.data = CrawlerEngine.applyBusinessTypeEligibilityRule(result.data);
        }

        // Cache completed result (bounded)
        queueManager.recordCompleted(cleanKey, {
          cacheVersion: CRAWL_CACHE_VERSION,
          data: result.data,
          meta: result.meta,
          completedAt: new Date().toISOString()
        });
        await queueManager.saveState();

        sendResponse({
          success: result.success !== false,
          data: result.data,
          meta: { ...(result.meta || {}), qcValidation: result.qcValidation || null }
        });
      } catch (err) {
        console.error("Portal crawl error in service worker:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
