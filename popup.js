// Main controller for Site Intelligence Crawler Extension with Production AI Reliability
document.addEventListener("DOMContentLoaded", async () => {
  // DOM Elements
  const siteDomainEl = document.getElementById("siteDomain");
  const siteUrlEl = document.getElementById("siteUrl");
  const apiKeyWarning = document.getElementById("apiKeyWarning");
  const openSettingsLink = document.getElementById("openSettingsLink");
  const settingsBtn = document.getElementById("settingsBtn");
  const startCrawlBtn = document.getElementById("startCrawlBtn");
  const startCrawlBtnText = document.getElementById("startCrawlBtnText");
  const crawlDepthSelect = document.getElementById("crawlDepth");

  // Pills
  const pillHome = document.getElementById("pillHome");
  const pillAbout = document.getElementById("pillAbout");
  const pillContact = document.getElementById("pillContact");
  const pillProducts = document.getElementById("pillProducts");

  // Queue Status Elements
  const queueCountLabel = document.getElementById("queueCountLabel");
  const retryFailedBtn = document.getElementById("retryFailedBtn");

  // Progress
  const progressSection = document.getElementById("progressSection");
  const progressStatus = document.getElementById("progressStatus");
  const progressPercent = document.getElementById("progressPercent");
  const progressBar = document.getElementById("progressBar");
  const progressLog = document.getElementById("progressLog");

  // Results
  const resultsSection = document.getElementById("resultsSection");
  const tabDetailsBtn = document.getElementById("tabDetailsBtn");
  const tabJsonBtn = document.getElementById("tabJsonBtn");
  const detailsTab = document.getElementById("detailsTab");
  const jsonTab = document.getElementById("jsonTab");
  const dataTableBody = document.getElementById("dataTableBody");
  const jsonViewer = document.getElementById("jsonViewer");
  const resStatus = document.getElementById("resStatus");
  const resBusinessType = document.getElementById("resBusinessType");
  const resProductCount = document.getElementById("resProductCount");
  const modelExecutionText = document.getElementById("modelExecutionText");
  const copyJsonBtn = document.getElementById("copyJsonBtn");
  const downloadCsvBtn = document.getElementById("downloadCsvBtn");
  const downloadJsonBtn = document.getElementById("downloadJsonBtn");
  const autofillPortalBtn = document.getElementById("autofillPortalBtn");

  // Portal Form Banner & Manual URL Elements
  const portalBanner = document.getElementById("portalBanner");
  const portalTargetUrlText = document.getElementById("portalTargetUrlText");
  const quickAutofillBtn = document.getElementById("quickAutofillBtn");
  const manualUrlToggleBtn = document.getElementById("manualUrlToggleBtn");
  const manualUrlSection = document.getElementById("manualUrlSection");
  const manualUrlInput = document.getElementById("manualUrlInput");
  const loadManualUrlBtn = document.getElementById("loadManualUrlBtn");
  const manualUrlFeedback = document.getElementById("manualUrlFeedback");

  // Settings Modal
  const settingsModal = document.getElementById("settingsModal");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const modelSelect = document.getElementById("modelSelect");
  const fallbackModelSelect = document.getElementById("fallbackModelSelect");
  const backendProxyUrlInput = document.getElementById("backendProxyUrl");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const testApiKeyBtn = document.getElementById("testApiKeyBtn");
  const settingsMessage = document.getElementById("settingsMessage");
  const toggleKeyVisibility = document.getElementById("toggleKeyVisibility");

  // State
  let currentTab = null;
  let initialPageData = null;
  let lastExtractedResult = null;
  let apiKey = "";
  let geminiModel = "gemini-3.5-flash-lite";
  let fallbackModel = "gemini-3.1-flash-lite";
  let backendProxyUrl = "";
  let isPortalDetected = false;
  let portalTargetUrl = "";

  function isValidUrlOrDomain(str) {
    if (!str || typeof str !== "string") return false;
    const clean = str.trim();
    if (/^\d+$/.test(clean)) return false; // reject pure numbers/IDs like "538611", "538613"
    if (/^https?:\/\//i.test(clean)) return true;
    if (/^www\.[a-z0-9-]+/i.test(clean)) return true;
    if (/[a-z0-9-]+\.(?:com|org|net|co|io|biz|info|us|uk|ca|in|de|cn|jp|fr|au|nl|ru|tw|hk|site|online|tech|co\.uk)\b/i.test(clean)) return true;
    return false;
  }

  // Initialize Queue Manager
  const queueManager = new CrawlerQueueManager({
    concurrency: 1,
    interRequestDelayMs: 1000
  });

  await queueManager.init();
  updateQueueUI();

  // 1. Load Settings from chrome.storage
  await loadSettings();

  // 2. Detect and inspect active tab
  await inspectCurrentTab();

  // Event Listeners
  settingsBtn.addEventListener("click", () => openSettings());
  openSettingsLink.addEventListener("click", () => openSettings());
  closeSettingsBtn.addEventListener("click", () => closeSettings());
  toggleKeyVisibility.addEventListener("click", togglePassword);
  saveSettingsBtn.addEventListener("click", saveSettings);
  testApiKeyBtn.addEventListener("click", testConnection);

  tabDetailsBtn.addEventListener("click", () => switchTab("details"));
  tabJsonBtn.addEventListener("click", () => switchTab("json"));

  copyJsonBtn.addEventListener("click", copyJsonToClipboard);
  downloadJsonBtn.addEventListener("click", downloadJsonFile);
  downloadCsvBtn.addEventListener("click", downloadCsvFile);
  if (autofillPortalBtn) {
    autofillPortalBtn.addEventListener("click", autofillActivePortalTab);
  }
  if (quickAutofillBtn) {
    quickAutofillBtn.addEventListener("click", startCrawlAndAnalyze);
  }

  if (retryFailedBtn) {
    retryFailedBtn.addEventListener("click", handleRetryFailed);
  }

  startCrawlBtn.addEventListener("click", startCrawlAndAnalyze);

  // Settings Handlers
  async function loadSettings() {
    const data = await chrome.storage.local.get([
      "geminiApiKey",
      "geminiModel",
      "fallbackModel",
      "backendProxyUrl",
      "crawlDepth"
    ]);

    if (data.geminiApiKey) {
      apiKey = data.geminiApiKey;
      apiKeyInput.value = apiKey;
      apiKeyWarning.classList.add("hidden");
    } else {
      apiKeyWarning.classList.remove("hidden");
    }

    if (data.geminiModel) {
      geminiModel = data.geminiModel;
    } else {
      geminiModel = "gemini-3.5-flash-lite";
    }
    modelSelect.value = geminiModel;

    if (data.fallbackModel) {
      fallbackModel = data.fallbackModel;
    } else {
      fallbackModel = "gemini-3.1-flash-lite";
    }
    if (fallbackModelSelect) fallbackModelSelect.value = fallbackModel;

    if (data.backendProxyUrl) {
      backendProxyUrl = data.backendProxyUrl;
      if (backendProxyUrlInput) backendProxyUrlInput.value = backendProxyUrl;
    }

    if (data.crawlDepth) {
      crawlDepthSelect.value = data.crawlDepth;
    }
  }

  function openSettings() {
    settingsMessage.classList.add("hidden");
    settingsModal.classList.remove("hidden");
  }

  function closeSettings() {
    settingsModal.classList.add("hidden");
  }

  function togglePassword() {
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
  }

  async function saveSettings() {
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;
    const fallback = fallbackModelSelect ? fallbackModelSelect.value : "gemini-3.1-flash-lite";
    const proxyUrl = backendProxyUrlInput ? backendProxyUrlInput.value.trim() : "";
    const depth = crawlDepthSelect.value;

    if (!key && !proxyUrl) {
      showSettingsMessage("Please enter a Gemini API Key or a Backend Proxy URL.", "error");
      return;
    }

    await chrome.storage.local.set({
      geminiApiKey: key,
      geminiModel: model,
      fallbackModel: fallback,
      backendProxyUrl: proxyUrl,
      crawlDepth: depth
    });

    apiKey = key;
    geminiModel = model;
    fallbackModel = fallback;
    backendProxyUrl = proxyUrl;

    apiKeyWarning.classList.add("hidden");
    showSettingsMessage("Settings saved successfully!", "success");
    setTimeout(() => closeSettings(), 1000);
  }

  async function testConnection() {
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;
    const proxyUrl = backendProxyUrlInput ? backendProxyUrlInput.value.trim() : "";

    if (!key && !proxyUrl) {
      showSettingsMessage("Enter an API key or Backend Proxy URL first.", "error");
      return;
    }

    showSettingsMessage("Testing API connection...", "success");

    try {
      if (proxyUrl) {
        // Test backend proxy health
        const healthUrl = proxyUrl.replace(/\/api\/analyze$/, "/api/health");
        const res = await fetch(healthUrl);
        const data = await res.json();
        if (res.ok && data.status === "ok") {
          showSettingsMessage(`Backend Proxy connected! Key configured: ${data.keyConfigured}`, "success");
        } else {
          showSettingsMessage(`Proxy error: ${data.error || "Cannot reach proxy"}`, "error");
        }
        return;
      }

      // Test Direct API with key in param and header
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Ping. Respond with 'OK'." }] }]
        })
      });

      const json = await res.json();
      if (res.ok && json.candidates && json.candidates.length > 0) {
        showSettingsMessage("Connection successful! API Key is valid and active.", "success");
      } else {
        const errMsg = json.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        showSettingsMessage(`API Error: ${errMsg}`, "error");
      }
    } catch (err) {
      showSettingsMessage(`Network Error: ${err.message}`, "error");
    }
  }

  function showSettingsMessage(msg, type) {
    settingsMessage.textContent = msg;
    settingsMessage.className = `settings-message ${type}`;
    settingsMessage.classList.remove("hidden");
  }

  function updateQueueUI() {
    const status = queueManager.getStatus();
    if (queueCountLabel) {
      if (status.activeCount > 0 || status.pendingCount > 0) {
        queueCountLabel.textContent = `⏳ Processing (${status.activeCount} active, ${status.pendingCount} pending)`;
      } else if (status.failedCount > 0) {
        queueCountLabel.textContent = `⚠️ Queue: ${status.completedCount} completed, ${status.failedCount} failed`;
      } else {
        queueCountLabel.textContent = `⚡ Ready (${status.completedCount} processed)`;
      }
    }

    if (retryFailedBtn) {
      if (status.failedCount > 0) {
        retryFailedBtn.classList.remove("hidden");
        retryFailedBtn.textContent = `Retry (${status.failedCount}) Failed`;
      } else {
        retryFailedBtn.classList.add("hidden");
      }
    }
  }

  async function handleRetryFailed() {
    const count = await queueManager.retryAllFailed();
    updateQueueUI();
    alert(`Re-enqueued ${count} failed tasks for processing.`);
  }

  // Known QC Portal URL detection
  function isKnownPortalUrl(url) {
    if (!url || typeof url !== "string") return false;
    const lower = url.toLowerCase();
    return lower.includes("cpworkportal") ||
           lower.includes("user_data_url_work") ||
           lower.includes("kishorekumar1993.github.io") ||
           lower.includes("/dataextraction");
  }

  // Robust asynchronous inspection of active tab DOM for portal and website URL
  async function detectPortalTargetUrlFromTab(tabId, tabUrl) {
    let target = "";
    let isPortal = isKnownPortalUrl(tabUrl);

    // 1. Try sending message to content script
    try {
      const res = await new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, { action: "detectPortalForm" }, (response) => {
          if (chrome.runtime && chrome.runtime.lastError) return resolve(null);
          resolve(response);
        });
      });
      if (res) {
        if (res.isPortal) isPortal = true;
        if (res.targetUrl && isValidUrlOrDomain(res.targetUrl)) {
          target = res.targetUrl.trim();
        }
      }
    } catch (_) {}

    // 2. Direct script execution in tab to inspect live DOM elements
    if (!target) {
      try {
        const [evalRes] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const isValid = (val) => {
              if (!val || typeof val !== "string") return false;
              const c = val.trim();
              if (/^\d+$/.test(c)) return false;
              if (/^https?:\/\//i.test(c)) return true;
              if (/^www\.[a-z0-9-]+/i.test(c)) return true;
              if (/[a-z0-9-]+\.(?:com|org|net|co|io|biz|info|us|uk|ca|in|de|cn|jp|fr|au|nl|ru|tw|hk|site|online|tech|co\.uk)\b/i.test(c)) return true;
              return false;
            };

            const inputs = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='button']):not([type='submit'])"));

            // A. Check labels matching website name / website url
            const allLabels = Array.from(document.querySelectorAll("label, span, div, p, strong, b"));
            for (const el of allLabels) {
              const txt = (el.innerText || el.textContent || "").trim().toLowerCase().replace(/[:*]/g, "").trim();
              if (["website name", "website url", "web site name", "web site url", "website"].some(a => txt === a || txt.startsWith(a) || txt.includes(a))) {
                if (el.htmlFor) {
                  const targetInput = document.getElementById(el.htmlFor);
                  if (targetInput && isValid(targetInput.value)) return { isPortal: true, targetUrl: targetInput.value.trim() };
                }
                const container = el.closest(".form-group, .form-field, .input-group, .col, .row, div") || el.parentElement;
                if (container) {
                  const inps = Array.from(container.querySelectorAll("input:not([type='hidden'])"));
                  for (const inp of inps) {
                    if (isValid(inp.value)) return { isPortal: true, targetUrl: inp.value.trim() };
                  }
                }
              }
            }

            // B. Input adjacent to "click here" button
            const clickBtn = Array.from(document.querySelectorAll("button, a, input[type='button'], span, div")).find(el => {
              const t = (el.innerText || el.textContent || el.value || "").trim().toLowerCase();
              return t === "click here";
            });
            if (clickBtn) {
              const container = clickBtn.closest(".input-group, .form-group, .field, .col, .row, div") || clickBtn.parentElement;
              if (container) {
                const inps = Array.from(container.querySelectorAll("input:not([type='hidden'])"));
                for (const inp of inps) {
                  if (isValid(inp.value)) return { isPortal: true, targetUrl: inp.value.trim() };
                }
              }
            }

            // C. Any input containing a valid website URL
            for (const inp of inputs) {
              if (isValid(inp.value)) return { isPortal: true, targetUrl: inp.value.trim() };
            }

            return { isPortal: false, targetUrl: "" };
          }
        });

        if (evalRes && evalRes.result) {
          if (evalRes.result.isPortal) isPortal = true;
          if (evalRes.result.targetUrl && isValidUrlOrDomain(evalRes.result.targetUrl)) {
            target = evalRes.result.targetUrl.trim();
          }
        }
      } catch (_) {}
    }

    return { isPortal, targetUrl: target };
  }

  // Active Tab Inspection
  async function inspectCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
        siteDomainEl.textContent = "Unsupported Page";
        siteUrlEl.textContent = "Please navigate to a regular website (http/https).";
        startCrawlBtn.disabled = true;
        return;
      }

      currentTab = tab;
      const isKnownPortal = isKnownPortalUrl(tab.url);

      // Perform synchronous / awaited portal target detection
      const portalDetection = await detectPortalTargetUrlFromTab(tab.id, tab.url);
      const isPortal = isKnownPortal || portalDetection.isPortal || isValidUrlOrDomain(portalDetection.targetUrl);

      if (isPortal) {
        isPortalDetected = true;
        portalTargetUrl = isValidUrlOrDomain(portalDetection.targetUrl) ? portalDetection.targetUrl.trim() : "";
        portalBanner.classList.remove("hidden");
        portalTargetUrlText.textContent = portalTargetUrl || "(No URL in form yet)";
        startCrawlBtnText.textContent = "⚡ Crawl Target & Autofill Portal";

        if (portalTargetUrl) {
          try {
            const pUrl = new URL(portalTargetUrl.startsWith("http") ? portalTargetUrl : "http://" + portalTargetUrl);
            siteDomainEl.textContent = pUrl.hostname + " (QC Portal Target)";
            siteUrlEl.textContent = portalTargetUrl;
          } catch (e) {
            siteDomainEl.textContent = portalTargetUrl + " (QC Portal Target)";
            siteUrlEl.textContent = portalTargetUrl;
          }
          if (manualUrlInput) {
            manualUrlInput.value = portalTargetUrl;
          }
        } else {
          siteDomainEl.textContent = "QC Portal (Waiting for Target URL)";
          siteUrlEl.textContent = "Please enter or paste target website URL below";
        }
      } else {
        isPortalDetected = false;
        portalBanner.classList.add("hidden");
        const urlObj = new URL(tab.url);
        siteDomainEl.textContent = urlObj.hostname;
        siteUrlEl.textContent = tab.url;
        startCrawlBtnText.textContent = "Start Crawl & Analyze";
      }

      // Check if we already have a successfully processed result for this website
      const checkUrl = isPortal && portalTargetUrl ? portalTargetUrl : tab.url;
      const cached = queueManager.getCompletedResult(checkUrl);
      if (cached && cached.data) {
        lastExtractedResult = cached.data;
        renderResults(cached.data, cached.meta || { modelUsed: geminiModel, isFallback: false, retriesUsed: 0, cached: true });
      }

      // Query content script for page categories / links if available
      chrome.tabs.sendMessage(tab.id, { action: "extractCurrentPageData" }, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) return;
        if (response && response.success && response.data) {
          initialPageData = response.data;
          updatePills(initialPageData.internalLinks);
        }
      });
    } catch (err) {
      console.error("Tab inspection error:", err);
      siteDomainEl.textContent = "Error reading tab";
      siteUrlEl.textContent = err.message;
    }
  }

  // Manual Edit / Load URL event handlers
  if (manualUrlToggleBtn && manualUrlSection) {
    manualUrlToggleBtn.addEventListener("click", () => {
      manualUrlSection.classList.toggle("hidden");
      if (!manualUrlSection.classList.contains("hidden")) {
        if (manualUrlInput && portalTargetUrl) {
          manualUrlInput.value = portalTargetUrl;
        }
        manualUrlInput?.focus();
      }
    });
  }

  function handleManualUrlLoad() {
    if (!manualUrlInput) return;
    let raw = manualUrlInput.value.trim();
    if (!raw) {
      showManualUrlFeedback("Please enter a website URL", "error");
      return;
    }
    if (!/^https?:\/\//i.test(raw) && raw.includes(".")) {
      raw = "http://" + raw;
    }
    if (!isValidUrlOrDomain(raw)) {
      showManualUrlFeedback("Invalid website URL (e.g. http://www.techmarkets.co.uk)", "error");
      return;
    }

    portalTargetUrl = raw;
    isPortalDetected = true;
    portalBanner.classList.remove("hidden");
    portalTargetUrlText.textContent = portalTargetUrl;
    startCrawlBtnText.textContent = "⚡ Crawl Target & Autofill Portal";

    try {
      const pUrl = new URL(portalTargetUrl.startsWith("http") ? portalTargetUrl : "http://" + portalTargetUrl);
      siteDomainEl.textContent = pUrl.hostname + " (QC Portal Target)";
      siteUrlEl.textContent = portalTargetUrl;
    } catch (_) {
      siteDomainEl.textContent = portalTargetUrl + " (QC Portal Target)";
      siteUrlEl.textContent = portalTargetUrl;
    }

    showManualUrlFeedback(`✓ Target loaded: ${portalTargetUrl}`, "success");

    // Push into active portal tab form
    if (currentTab && currentTab.id) {
      chrome.tabs.sendMessage(currentTab.id, {
        action: "setPortalTargetUrl",
        url: portalTargetUrl
      }, () => {
        chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          func: (newUrl) => {
            const inputs = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='button']):not([type='submit'])"));
            const webInp = inputs.find(el => {
              const name = (el.name || "").toLowerCase();
              const id = (el.id || "").toLowerCase();
              return name.includes("website") || id.includes("website");
            }) || inputs[0];
            if (webInp) {
              webInp.value = newUrl;
              webInp.dispatchEvent(new Event("input", { bubbles: true }));
              webInp.dispatchEvent(new Event("change", { bubbles: true }));
            }
          },
          args: [portalTargetUrl]
        }).catch(() => {});
      });
    }
  }

  if (loadManualUrlBtn) {
    loadManualUrlBtn.addEventListener("click", handleManualUrlLoad);
  }
  if (manualUrlInput) {
    manualUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleManualUrlLoad();
      }
    });
  }

  function showManualUrlFeedback(msg, type) {
    if (!manualUrlFeedback) return;
    manualUrlFeedback.textContent = msg;
    manualUrlFeedback.className = `manual-url-feedback ${type}`;
    manualUrlFeedback.classList.remove("hidden");
    setTimeout(() => {
      if (type === "success") {
        manualUrlSection?.classList.add("hidden");
        manualUrlFeedback?.classList.add("hidden");
      }
    }, 2500);
  }

  function updatePills(links = []) {
    const categories = new Set(links.map(l => l.category));
    if (currentTab?.url) {
      const path = new URL(currentTab.url).pathname.toLowerCase();
      if (path === "/" || path === "") categories.add("home");
      if (path.includes("about") || path.includes("company")) categories.add("about");
      if (path.includes("contact")) categories.add("contact");
      if (path.includes("product") || path.includes("catalog")) categories.add("product");
    }

    if (categories.has("home")) pillHome.classList.add("active");
    if (categories.has("about")) pillAbout.classList.add("active");
    if (categories.has("contact")) pillContact.classList.add("active");
    if (categories.has("product")) pillProducts.classList.add("active");
  }

  // Main Crawl & Analysis Flow
  async function startCrawlAndAnalyze() {
    if (!apiKey && apiKeyInput && apiKeyInput.value.trim()) {
      apiKey = apiKeyInput.value.trim();
    }

    if (!apiKey && !backendProxyUrl) {
      openSettings();
      showSettingsMessage("Please provide your Gemini API key or Backend Proxy URL before starting.", "error");
      return;
    }

    if (!currentTab) {
      alert("No active web page detected.");
      return;
    }

    // If on a portal form, get the target URL from the portal form input
    if (isPortalDetected) {
      const urlRes = await new Promise(resolve => {
        chrome.tabs.sendMessage(currentTab.id, { action: "getPortalTargetUrl" }, resolve);
      });
      if (urlRes && isValidUrlOrDomain(urlRes.targetUrl)) {
        portalTargetUrl = urlRes.targetUrl.trim();
        portalTargetUrlText.textContent = portalTargetUrl;
      } else {
        // Fallback: direct DOM extraction if content script returned empty or numeric ID
        try {
          const [evalResult] = await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
              const isValid = (s) => s && typeof s === "string" && !/^\d+$/.test(s.trim()) && (/^https?:\/\//i.test(s.trim()) || /^www\.[a-z0-9-]+/i.test(s.trim()) || /[a-z0-9-]+\.(?:com|org|net|co|io|biz|info|us|uk|ca|in|de|cn|jp|fr|au|nl|ru|tw|hk|site|online|tech|co\.uk)\b/i.test(s.trim()));
              const inps = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='button']):not([type='submit'])"));
              for (const inp of inps) {
                const v = (inp.value || "").trim();
                if (isValid(v)) return v;
              }
              const clickBtn = Array.from(document.querySelectorAll("button, a, input[type='button'], span, div")).find(el => (el.innerText || el.textContent || el.value || "").trim().toLowerCase() === "click here");
              if (clickBtn) {
                const c = clickBtn.closest("div, .input-group, .form-group") || clickBtn.parentElement;
                if (c) {
                  const textInps = Array.from(c.querySelectorAll("input:not([type='hidden'])"));
                  for (const inp of textInps) {
                    const v = (inp.value || "").trim();
                    if (isValid(v)) return v;
                  }
                }
              }
              return "";
            }
          });
          if (evalResult && evalResult.result && isValidUrlOrDomain(evalResult.result)) {
            portalTargetUrl = evalResult.result.trim();
            portalTargetUrlText.textContent = portalTargetUrl;
          }
        } catch (_) {}
      }

      if (!portalTargetUrl || !isValidUrlOrDomain(portalTargetUrl)) {
        alert("Please enter a valid website URL in the 'Website Name' field of the portal form first (e.g. http://www.wmwatson.co.uk).");
        return;
      }
    }

    // UI state
    startCrawlBtn.disabled = true;
    startCrawlBtnText.textContent = isPortalDetected ? "Crawling Target & Filling Form..." : "Crawling & Analyzing...";
    progressSection.classList.remove("hidden");
    resultsSection.classList.add("hidden");
    updateProgress(5, "Scanning page DOM...", "Extracting base page content and discovery tree...");

    try {
      // Step 0: Pipeline Protection & Status Verification
      let activeCrawlUrl = isPortalDetected ? portalTargetUrl : (currentTab ? currentTab.url : "");
      if (!/^https?:\/\//i.test(activeCrawlUrl)) {
        activeCrawlUrl = "http://" + activeCrawlUrl;
      }

      updateProgress(8, "Verifying Website Status & Redirects...", activeCrawlUrl);
      const statusResult = await CrawlerEngine.detectRedirectAndClassifyStatus(activeCrawlUrl);

      if (statusResult.websiteStatus !== "Working") {
        updateProgress(100, `Pipeline Stopped: ${statusResult.websiteStatus}`, statusResult.nonWorkingReason);
        const nonWorkingData = {
          websiteStatus: statusResult.websiteStatus,
          notWorkingReason: statusResult.nonWorkingReason,
          websiteName: activeCrawlUrl,
          businessType: "Not Available",
          companyProfile: "Not Available",
          companyName: "Not Available",
          countryName: "Not Available",
          companyAddress: "Not Available",
          state: "Not Available",
          city: "Not Available",
          emailId: "Not Available",
          secondaryEmailId: "Not Available",
          phoneNumber: "Not Available",
          numberOfProducts: "Not Available",
          productImages: "Not Available",
          numberOfProductDescriptions: "Not Available"
        };
        lastExtractedResult = nonWorkingData;
        renderResults(nonWorkingData, {
          qcValidation: statusResult,
          modelUsed: "Pipeline Protection (AI Skipped)",
          isFallback: false
        });

        if (isPortalDetected && currentTab) {
          chrome.tabs.sendMessage(currentTab.id, {
            action: "autofillPortalForm",
            data: nonWorkingData,
            meta: { qcValidation: statusResult }
          });
        }

        startCrawlBtn.disabled = false;
        startCrawlBtnText.textContent = isPortalDetected ? "⚡ Crawl Target & Autofill Portal" : "Start Crawl & Analyze";
        return;
      }

      // Final verified working URL
      activeCrawlUrl = statusResult.finalUrl;

      // Step 1: Ensure initial page data
      let baseData = initialPageData;

      if (isPortalDetected) {
        updateProgress(10, "Fetching Target Site...", activeCrawlUrl);
        const urlObj = new URL(activeCrawlUrl);
        const mainResp = await fetchAndParseSubpage(activeCrawlUrl);
        let internalLinks = [];
        try {
          const rawHtml = await fetchRawHtml(activeCrawlUrl);
          if (rawHtml) {
            internalLinks = CrawlerEngine.extractLinks(rawHtml, urlObj.origin);
          }
        } catch (e) { }

        baseData = {
          url: activeCrawlUrl,
          origin: urlObj.origin,
          hostname: urlObj.hostname,
          title: mainResp ? mainResp.title : urlObj.hostname,
          cleanText: mainResp ? mainResp.textSnippet : "",
          internalLinks: internalLinks,
          detectedEmails: mainResp ? mainResp.emails : [],
          detectedPhones: mainResp ? mainResp.phones : [],
          productData: {
            numberOfProducts: mainResp ? mainResp.productCount : 0,
            productImages: mainResp ? mainResp.imgCount : 0,
            numberOfProductDescriptions: mainResp ? mainResp.descCount : 0
          }
        };
        updatePills(baseData.internalLinks);
      } else if (!baseData) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const res = await new Promise(resolve => {
          chrome.tabs.sendMessage(tab.id, { action: "extractCurrentPageData" }, resolve);
        });
        if (res && res.success) {
          baseData = res.data;
          initialPageData = baseData;
        } else {
          baseData = {
            url: tab.url,
            origin: new URL(tab.url).origin,
            hostname: new URL(tab.url).hostname,
            title: tab.title || "",
            cleanText: "Unable to inspect DOM directly. Fetching URL content.",
            internalLinks: [],
            detectedEmails: [],
            detectedPhones: [],
            productData: { numberOfProducts: 0, productImages: 0, numberOfProductDescriptions: 0 }
          };
        }
      }

      updateProgress(15, "Selecting priority pages...", `Found ${baseData.internalLinks.length} internal links.`);

      // Step 2: Choose priority pages to crawl
      const maxPages = parseInt(crawlDepthSelect.value, 10) || 5;
      const targetUrls = selectPriorityPages(baseData, maxPages);

      updateProgress(25, "Crawling subpages...", `Queueing ${targetUrls.length} key pages.`);

      // Step 3: Fetch & parse subpages
      const crawledPages = [];
      let totalProductsCount = baseData.productData?.numberOfProducts || 0;
      let totalProductImages = baseData.productData?.productImages || 0;
      let totalDescriptions = baseData.productData?.numberOfProductDescriptions || 0;
      const allEmails = new Set(baseData.detectedEmails || []);
      const allPhones = new Set(baseData.detectedPhones || []);

      const stepIncrement = 45 / Math.max(targetUrls.length, 1);
      let currentProgress = 25;

      for (let i = 0; i < targetUrls.length; i++) {
        const item = targetUrls[i];
        currentProgress += stepIncrement;
        updateProgress(
          Math.min(70, Math.round(currentProgress)),
          `Crawling: ${item.category.toUpperCase()} (${i + 1}/${targetUrls.length})`,
          item.url
        );

        try {
          const pageResult = await fetchAndParseSubpage(item.url);
          if (pageResult) {
            crawledPages.push({
              url: item.url,
              category: item.category,
              title: pageResult.title,
              textSnippet: pageResult.textSnippet,
              html: pageResult.html || "",

              // Preserve separately extracted address sources
              mapAddresses: pageResult.mapAddresses || [],
              footerText: pageResult.footerText || "",
              sourceType: item.category === "contact"
                ? "CONTACT_PAGE"
                : item.category.toUpperCase()
            });

            // Merge detected contacts & products
            pageResult.emails.forEach(e => allEmails.add(e));
            pageResult.phones.forEach(p => allPhones.add(p));
            totalProductsCount = Math.max(totalProductsCount, pageResult.productCount);
            totalProductImages = Math.max(totalProductImages, pageResult.imgCount);
            totalDescriptions = Math.max(totalDescriptions, pageResult.descCount);
          }
        } catch (crawlErr) {
          console.warn(`Failed to crawl ${item.url}:`, crawlErr);
        }
      }

      // Step 4: Compile context for Gemini
      updateProgress(75, "Compiling knowledge...", "Preparing structured context for Gemini AI...");
      const aggregatedContext = buildContextPrompt(
        baseData,
        crawledPages,
        Array.from(allEmails),
        Array.from(allPhones),
        {
          products: totalProductsCount,
          images: totalProductImages,
          descriptions: totalDescriptions
        }
      );

      const systemInstruction = buildSystemInstruction();
      const userPrompt = buildUserPrompt(aggregatedContext);

      // Step 5: Send to Gemini API with robust retries, jitter, and model fallback
      updateProgress(85, "Analyzing with Gemini AI...", `Running model ${geminiModel}...`);

      const extractionResult = await GeminiClient.callGeminiWithRetryAndFallback({
        context: aggregatedContext,
        userPrompt: userPrompt,
        systemInstruction: systemInstruction,
        apiKey: apiKey,
        primaryModel: geminiModel,
        fallbackModel: fallbackModel,
        backendProxyUrl: backendProxyUrl,
        onProgress: (p) => {
          if (p.status === "retrying" || p.status === "backed_off" || p.status === "network_retry") {
            updateProgress(88, "Retrying AI Request...", p.message);
          } else if (p.status === "fallback") {
            updateProgress(90, "Fallback Model Engaged", p.message);
          } else if (p.message) {
            progressLog.textContent = p.message;
          }
        }
      });

      let extractedJson = extractionResult.data;
      if (extractedJson) {
        const currentPhone = extractedJson.phoneNumber;
        const sanitizedPhone = (typeof GeminiClient !== "undefined" && GeminiClient.sanitizePhoneNumber)
          ? GeminiClient.sanitizePhoneNumber(currentPhone, extractedJson.countryName)
          : currentPhone;
        if (!sanitizedPhone || currentPhone === "Not Available") {
          if (aggregatedContext && Array.isArray(aggregatedContext.detectedPhones)) {
            for (const rawCandidate of aggregatedContext.detectedPhones) {
              const sanitized = typeof GeminiClient !== "undefined" && GeminiClient.sanitizePhoneNumber
                ? GeminiClient.sanitizePhoneNumber(rawCandidate, extractedJson.countryName)
                : "";
              if (sanitized && sanitized.length >= 7 && sanitized.length <= 15) {
                extractedJson.phoneNumber = sanitized;
                break;
              }
            }
          }
        } else {
          extractedJson.phoneNumber = sanitizedPhone;
        }
        if (extractedJson.countryName && extractedJson.countryName !== "Not Available") {
          if (typeof GeminiClient !== "undefined" && GeminiClient.normalizeCountryName) {
            extractedJson.countryName = GeminiClient.normalizeCountryName(extractedJson.countryName);
          }
        }
        if (extractedJson.companyName && typeof CompanyNormalizer !== "undefined" && CompanyNormalizer.normalizeCompanyName) {
          extractedJson.companyName = CompanyNormalizer.normalizeCompanyName(extractedJson.companyName);
        } else if (extractedJson.companyName) {
          extractedJson.companyName = extractedJson.companyName.trim();
        }
        if (extractedJson.companyAddress && typeof AddressNormalizer !== "undefined" && AddressNormalizer.normalizeAddress) {
          extractedJson.companyAddress = AddressNormalizer.normalizeAddress(extractedJson.companyAddress);
        }
      }
      if (typeof CrawlerEngine !== "undefined" && CrawlerEngine.applyBusinessTypeEligibilityRule) {
        extractedJson = CrawlerEngine.applyBusinessTypeEligibilityRule(extractedJson, initialPageData?.html || "", crawledPages);
      }

      // If Not Working, mark Not Working and empty all other items
      if (String(extractedJson.websiteStatus || "").trim().toLowerCase() === "not working") {
        extractedJson.websiteStatus = "Not Working";
        extractedJson.businessType = "";
        extractedJson.companyProfile = "";
        extractedJson.companyName = "";
        extractedJson.companyAddress = "";
        extractedJson.countryName = "";
        extractedJson.state = "";
        extractedJson.city = "";
        extractedJson.emailId = "";
        extractedJson.secondaryEmailId = "";
        extractedJson.phoneNumber = "";
        extractedJson.numberOfProducts = "";
        extractedJson.productImages = "";
        extractedJson.numberOfProductDescriptions = "";
      }

      if (statusResult) {
        statusResult.websiteStatus = extractedJson.websiteStatus;
        if (extractedJson.notWorkingReason) {
          statusResult.nonWorkingReason = extractedJson.notWorkingReason;
        }
        extractionResult.meta.qcValidation = statusResult;
      }

      // Save to queue completed map so it persists
      const cleanKey = currentTab.url.toLowerCase();
      queueManager.completedMap[cleanKey] = {
        data: extractedJson,
        meta: extractionResult.meta,
        completedAt: new Date().toISOString()
      };
      await queueManager.saveState();
      updateQueueUI();

      // Step 6: Autofill if on Portal Form, then render results
      if (isPortalDetected && currentTab) {
        updateProgress(95, "Prefilling Portal Form...", "Transferring AI data to form fields...");
        try {
          const fillRes = await new Promise(resolve => {
            chrome.tabs.sendMessage(currentTab.id, {
              action: "autofillPortalForm",
              data: extractedJson,
              meta: extractionResult.meta
            }, resolve);
          });
          if (fillRes && fillRes.success) {
            updateProgress(100, "Done!", `Portal form autofilled (${fillRes.filledCount} fields populated)!`);
          } else {
            updateProgress(100, "Done!", "Intelligence extraction complete.");
          }
        } catch (fillErr) {
          console.warn("Autofill messaging error:", fillErr);
          updateProgress(100, "Done!", "Intelligence extracted (portal prefill skipped).");
        }
      } else {
        updateProgress(100, "Done!", "Intelligence extraction complete.");
      }

      lastExtractedResult = extractedJson;
      renderResults(extractedJson, extractionResult.meta);

    } catch (err) {
      console.error("Crawl error:", err);
      updateProgress(0, "Extraction Error", err.message);

      // Record in failed queue
      if (currentTab?.url) {
        queueManager.failedQueue.push({
          id: "task_err_" + Date.now(),
          url: currentTab.url,
          error: err.message,
          failedAt: new Date().toISOString()
        });
        await queueManager.saveState();
        updateQueueUI();
      }

      alert(`Error during crawl/analysis: ${err.message}`);
    } finally {
      startCrawlBtn.disabled = false;
      startCrawlBtnText.textContent = isPortalDetected ? "⚡ Crawl Target & Autofill Portal" : "Start Crawl & Analyze";
    }
  }

  async function autofillActivePortalTab() {
    if (!lastExtractedResult) {
      alert("No extracted intelligence data available yet. Please crawl a website first.");
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, {
      action: "autofillPortalForm",
      data: lastExtractedResult,
      meta: { modelUsed: geminiModel }
    }, (res) => {
      if (res && res.success) {
        const orig = autofillPortalBtn.textContent;
        autofillPortalBtn.textContent = `✓ Filled (${res.filledCount})`;
        setTimeout(() => { autofillPortalBtn.textContent = orig; }, 2000);
      } else {
        alert("Failed to prefill form: " + (res?.error || "Make sure you are on the portal form tab."));
      }
    });
  }

  async function fetchRawHtml(url) {
    try {
      const resp = await fetch(url, { headers: { "Accept": "text/html" } });
      if (resp.ok) return await resp.text();
    } catch (e) { }
    const bgRes = await new Promise(resolve => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return resolve(null);
        chrome.runtime.sendMessage({ action: "fetchUrl", url: url }, (res) => {
          if (chrome.runtime && chrome.runtime.lastError) return resolve(null);
          resolve(res);
        });
      } catch (e) {
        resolve(null);
      }
    });
    if (bgRes && bgRes.success) return bgRes.text;
    return "";
  }

  function selectPriorityPages(baseData, maxPages) {
    const list = [];
    const currentClean = (baseData.url || "").split("#")[0].split("?")[0].replace(/\/$/, "");
    const added = new Set([currentClean]);

    const links = baseData.internalLinks || [];
    const abouts = links.filter(l => l.category === "about");
    const contacts = links.filter(l => l.category === "contact");
    const products = links.filter(l => l.category === "product");
    const others = links.filter(l => l.category === "other" || l.category === "home");

    const addLink = (item) => {
      const clean = item.url.split("#")[0].split("?")[0].replace(/\/$/, "");
      if (!added.has(clean) && list.length < maxPages) {
        added.add(clean);
        list.push(item);
      }
    };

    if (contacts.length > 0) addLink(contacts[0]);
    if (abouts.length > 0) addLink(abouts[0]);
    if (products.length > 0) addLink(products[0]);
    if (products.length > 1) addLink(products[1]);
    if (abouts.length > 1) addLink(abouts[1]);
    if (contacts.length > 1) addLink(contacts[1]);

    for (const l of products.slice(2)) addLink(l);
    for (const l of others) addLink(l);

    return list;
  }

  async function fetchAndParseSubpage(url) {
    try {
      let html = "";
      try {
        const resp = await fetch(url, { headers: { "Accept": "text/html" } });
        if (resp.ok) html = await resp.text();
      } catch (e) {
        const bgRes = await new Promise(resolve => {
          try {
            if (!chrome.runtime || !chrome.runtime.id) return resolve(null);
            chrome.runtime.sendMessage({ action: "fetchUrl", url: url }, (res) => {
              if (chrome.runtime && chrome.runtime.lastError) return resolve(null);
              resolve(res);
            });
          } catch (err) {
            resolve(null);
          }
        });
        if (bgRes && bgRes.success) html = bgRes.text;
      }

      if (!html) return null;

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Extract Map Addresses before removing iframes
      let mapAddresses = typeof CrawlerEngine !== "undefined" && CrawlerEngine.extractMapAddresses
        ? CrawlerEngine.extractMapAddresses(html)
        : [];
      if (typeof CrawlerEngine !== "undefined" && CrawlerEngine.resolveMapEmbedAddress) {
        try {
          const embedAddrs = await CrawlerEngine.resolveMapEmbedAddress(html, fetch);
          if (embedAddrs && embedAddrs.length > 0) {
            mapAddresses = Array.from(new Set([...mapAddresses, ...embedAddrs]));
          }
        } catch (e) { }
      }

      ["script", "style", "noscript", "svg", "canvas", "iframe", "nav"].forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
      });

      const title = doc.title || "";
      let text = (doc.body ? (doc.body.innerText || doc.body.textContent) : "")
        .replace(/[\r\n]+/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();

      // Preserve explicit footer text if present
      const footerEl = doc.querySelector("footer, [class*='footer' i], [id*='footer' i]");
      if (footerEl) {
        const footerText = (footerEl.innerText || footerEl.textContent || "").trim();
        if (footerText && !text.includes(footerText)) {
          text += "\n\n--- FOOTER (CONTACT / ADDRESS INFO) ---\n" + footerText;
        }
      }

      const emails = Array.from(new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []));
      const phones = Array.from(new Set(text.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}/g) || []))
        .filter(p => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15);

      const telLinks = doc.querySelectorAll("a[href*='tel:']");
      telLinks.forEach(tl => {
        try {
          const href = tl.getAttribute("href") || "";
          const m = href.match(/tel:([^?&#]+)/i);
          if (m && m[1]) {
            const rawTel = decodeURIComponent(m[1]).trim();
            if (rawTel.replace(/\D/g, "").length >= 7 && rawTel.replace(/\D/g, "").length <= 15) {
              phones.push(rawTel);
            }
          }
        } catch (_) {}
      });

      const productCount = doc.querySelectorAll('[itemtype*="Product"], .product, .product-item, .product-card, .catalog-item').length;
      const imgCount = doc.querySelectorAll('img[src*="product"], img[alt*="product"], .product img').length;
      const descCount = doc.querySelectorAll('.product-desc, .product-description, [itemprop="description"]').length;

      let extractedFooter = "";
      const footerElement = doc.querySelector("footer, [class*='footer' i], [id*='footer' i]");
      if (footerElement) {
        extractedFooter = (footerElement.innerText || footerElement.textContent || "").trim();
      }

      return {
        title,
        textSnippet: text.slice(0, 12000),
        html: html,
        footerText: extractedFooter,
        emails,
        phones,
        productCount,
        imgCount,
        descCount,
        mapAddresses
      };
    } catch (e) {
      console.warn("Error parsing subpage:", e);
      return null;
    }
  }

  function buildContextPrompt(baseData, crawledPages, emails, phones, counts) {
    let pagesText = `MAIN / INITIAL PAGE (${baseData.url}):\n`;
    pagesText += `Title: ${baseData.title}\n`;
    if (baseData.metaDescription) pagesText += `Meta Description: ${baseData.metaDescription}\n`;
    if (baseData.ogSiteName) pagesText += `Site Name: ${baseData.ogSiteName}\n`;
    pagesText += `Content:\n${baseData.cleanText.slice(0, 8000)}\n\n`;

    let mainMapAddresses = (baseData.mapAddresses && baseData.mapAddresses.length > 0)
      ? baseData.mapAddresses
      : (typeof CrawlerEngine !== "undefined" && CrawlerEngine.extractMapAddresses
        ? CrawlerEngine.extractMapAddresses(baseData.html || "")
        : []);
    if (mainMapAddresses.length > 0) {
      pagesText += `\n--- EMBEDDED MAP VERIFICATION SOURCE ---\nMap Location / Address: ${mainMapAddresses.join(" | ")}\n`;
    }
    if (baseData.footerText && baseData.footerText.length > 10) {
      pagesText += `\n--- FOOTER (SECONDARY SOURCE) ---\n${baseData.footerText}\n`;
    }
    pagesText += "\n";

    crawledPages.forEach((p, idx) => {
      const isContact = p.category === "contact" || p.sourceType === "CONTACT_PAGE";
      const categoryTag = isContact ? "CONTACT PAGE (PRIMARY SOURCE)" : p.category.toUpperCase();
      pagesText += `--- CRAWLED SUBPAGE ${idx + 1}: [${categoryTag}] ${p.url} ---\n`;
      pagesText += `Title: ${p.title}\n`;
      pagesText += `Content:\n${p.textSnippet}\n`;
      if (p.mapAddresses && p.mapAddresses.length > 0) {
        pagesText += `\n--- EMBEDDED MAP VERIFICATION SOURCE ---\nMap Location / Address: ${p.mapAddresses.join(" | ")}\n`;
      }
      if (p.footerText && p.footerText.length > 10) {
        pagesText += `\n--- FOOTER (SECONDARY SOURCE) ---\n${p.footerText}\n`;
      }
      pagesText += "\n";
    });

    return {
      domain: baseData.hostname,
      url: baseData.url,
      detectedEmails: emails,
      detectedPhones: phones,
      heuristicProducts: counts.products,
      heuristicImages: counts.images,
      heuristicDescriptions: counts.descriptions,
      crawledText: pagesText
    };
  }

  function buildSystemInstruction() {
    if (typeof CrawlerEngine !== "undefined" && CrawlerEngine.buildSystemInstruction) {
      return CrawlerEngine.buildSystemInstruction();
    }
    return `You are an expert web crawler and business intelligence data extraction agent.
Your task is to analyze content gathered from crawling a website (Home, About Us, Company Profile, Contact Us, and Product pages) and extract structured corporate intelligence.

You MUST respond strictly with a valid JSON object matching this exact schema:
{
  "websiteStatus": "Working",
  "notWorkingReason": "",
  "businessType": "Manufacturer",
  "companyProfile": "Available",
  "companyName": "Exact Company Name",
  "countryName": "Country of company",
  "companyAddress": "Full physical or registered address",
  "state": "Available",
  "city": "Available",
  "emailId": "primary_email@domain.com",
  "secondaryEmailId": "secondary_email@domain.com or empty string",
  "phoneNumber": "Main contact phone number",
  "numberOfProducts": "3",
  "productImages": "3",
  "numberOfProductDescriptions": "3"
}

CORE RULE - SPECIAL CHARACTER PRESERVATION:
- All special characters (such as "&", "-", "/", "@", "'", ".", "+", "%", "#", etc.) MUST be kept exactly the same as in the original source content.
- DO NOT change special characters into words or expansions:
  * NEVER expand or replace "&" with "and" or "And" (always keep "&" as it is).
  * NEVER expand or replace "@" with "at" (always keep "@" as it is).
  * NEVER remove, replace, or alter hyphens "-", slashes "/", apostrophes "'", dots, or symbols within words or names.
- Special characters MUST ALWAYS be kept AS IT IS.

Address Formatting Rules:
1. Preserve the Original Address: Extract the address exactly as provided by the official website. Do not add unwanted words, missing details, or information that is not present in the source.
2. Special Characters: Do not add, remove, replace, or modify special characters appearing between words or address components. Preserve them exactly as provided.
3. Abbreviation Expansion: Expand all abbreviated words into their complete full forms wherever applicable. Do not abbreviate any words.
4. Capitalization: Start every word with a capital letter (Title Case).
5. Unwanted Content: Remove unnecessary words or unwanted special characters only when they are not part of the actual address. Do not remove meaningful address details.
6. Address Accuracy: Do not change the original meaning, word order, or address structure while applying formatting rules.

Company Name Formatting Rules:
1. Abbreviation Expansion: Expand all abbreviated words in the company name into their complete full forms wherever applicable.
2. Capitalization: Start every word with a capital letter (Title Case).
3. Special Characters: Preserve all special characters in the original company name exactly as provided. Do not add, remove, or modify them.
4. Name Accuracy: Do not add unwanted words or modify the actual company name.
5. Brand Names: Preserve officially established brand names, trademarks, and acronyms when expanding them would change the registered or recognized name.

Important Rule: Apply abbreviation expansion only to words. Never modify special characters. Preserve the original address and company name accurately while correcting word capitalization and expanding applicable abbreviations.

Field extraction guidelines:
1. "websiteStatus": Keep "websiteStatus" strictly as "Working" or "Not Working" (and skip redirect/subdomain sites as required by QC). "Working" ONLY IF the site loaded AND its Business Type is an eligible category from "Manufacturer" to "Wholesaler" (Manufacturer, Industrial Services, Exporter, Trader, Distributer, Supplier, Wholesaler).
   - CRITICAL ELIGIBILITY RULE: If the business type is anything outside Manufacturer to Wholesaler (such as Service Provider, Online Shopping, Restricted Site, Other, Retailer), "websiteStatus" MUST be marked as "Not Working", and state the reason in "notWorkingReason".
   - If the site is down, broken, parked, or under construction, mark accordingly.
2. "notWorkingReason": Empty string "" if working, otherwise explain any disqualification, error, or unknown edge case requiring technical team confirmation in "notWorkingReason" (e.g., "Ineligible Business Type: Service Provider (Only Manufacturer to Wholesaler are eligible)", redirect site, ineligible subdomain, or DNS/HTTP error).
3. "businessType": Select strictly from the portal dropdown options:
   - "Manufacturer"
   - "Industrial Services"
   - "Exporter"
   - "Trader"
   - "Distributer"
   - "Supplier"
   - "Wholesaler"
   - "Service Provider"
   - "Online Shopping"
   - "Restricted Site"
   - "Other"
   NOTE ON ELIGIBILITY: Only "Manufacturer" through "Wholesaler" qualify as "Working" sites. All other business types (Service Provider, Online Shopping, Restricted Site, Other) MUST be marked "Not Working" in websiteStatus.
4. "companyProfile": "Available" if company description/about information was found, or "Not Available".
5. "companyName": Complete official legal registered company name with all abbreviations expanded into their full forms:
   - MULTI-SOURCE EXTRACTION PRIORITY (MANDATORY TO PREVENT INCOMPLETE COMPANY NAMES):
     * Priority 1: Footer Legal Copyright / Imprint Notice: Check footer lines like "© [Year] [Exact Legal Registered Name]" or "Copyright [Year] [Full Name] All Rights Reserved" (e.g. "© 2026 Lamb's Signs Limited", "© 2024 Four C Plus (Internet) Company Limited", "© 2023 ANSON Hydraulics Industrial Co., Ltd."). This almost always contains the statutory, official registered corporate name.
     * Priority 2: About Us / Company Profile / History: Look for statutory incorporation or opening introduction phrases: "[Full Name] was founded/incorporated in...", "Welcome to [Full Name]".
     * Priority 3: Contact Us Page Corporate Header / Address Block: Often lists the full legal corporate entity above or alongside the physical headquarters address (e.g., "Four C Plus (Internet) Company Limited, 3rd Floor...").
     * Priority 4: Terms of Service / Privacy Policy / Legal Imprint: Statutory statements defining the legal entity operating the business.
     * Priority 5: Header Logo / Page Title: Often contains only a truncated brand/trade name or acronym (e.g., "Lamb's Signs", "ANSON", "4C Plus").
     * CRITICAL FULL-COMPLETENESS RULE (NEVER LEAVE COMPANY NAME INCOMPLETE):
       - ALWAYS select the LONGEST, MOST COMPLETE LEGAL REGISTERED NAME over a truncated brand name or header logo!
       - NEVER omit internal functional/industry words (e.g. NEVER truncate "Anson Hydraulics Industrial Company, Limited" to "Anson" or "Anson Hydraulics").
       - NEVER omit the legal corporate entity suffix (e.g. NEVER output "Lamb's Signs" without "Limited"; NEVER output "Oriental Chem" without "Company, Limited").
       - If a website displays both a short trade/brand name (e.g. "ANSON") and a full legal corporate name (e.g. "ANSON Hydraulics Industrial Co., Ltd."), YOU MUST ALWAYS SELECT THE FULL LEGAL CORPORATE NAME: "Anson Hydraulics Industrial Company, Limited".
   - Mandatory Abbreviation Expansion to Full Form:
     * General / English Legal & Corporate Types:
       - "Co., Ltd." / "Co.,Ltd" / "Co. Ltd." / "Co Ltd" -> "Company, Limited"
       - "Co." / "Co" -> "Company"
       - "Ltd." / "Ltd" -> "Limited"
       - "Pvt. Ltd." / "Pvt Ltd" -> "Private Limited"
       - "Pte. Ltd." / "Pte Ltd" -> "Private Limited"
       - "Pty. Ltd." / "Pty Ltd" -> "Proprietary Limited"
       - "Corp." / "Corp" -> "Corporation"
       - "Inc." / "Inc" -> "Incorporated"
       - "Mfg." / "Mfg" -> "Manufacturing"
       - "Intl." / "Int'l" -> "International"
       - "Tech." / "Tech" -> "Technology"
       - "Grp." / "Grp" -> "Group"
       - "LLC" / "L.L.C." -> "Limited Liability Company"
       - "LLP" / "L.L.P." -> "Limited Liability Partnership"
       - "PLC" / "Plc" -> "Public Limited Company"
       - "Sdn. Bhd." / "Sdn Bhd" -> "Sendirian Berhad"
       - "Bhd." / "Bhd" -> "Berhad"
       - Example: "Zhejiang Jiangnan Steel Structure Co., Ltd." MUST be expanded to "Zhejiang Jiangnan Steel Structure Company, Limited".
     * Internal Industry & Business Descriptors Inside Company Name (EXPAND EVERY ABBREVIATED WORD):
       - "Mfg." / "Mfg" -> "Manufacturing"
       - "Ind." / "Inds." -> "Industrial" / "Industries"
       - "Tech." / "Technol." -> "Technology"
       - "Intl." / "Int'l" -> "International"
       - "Grp." -> "Group"
       - "Eng." / "Engg." -> "Engineering"
       - "Ent." / "Ents." -> "Enterprises"
       - "Sol." / "Sols." -> "Solutions"
       - "Sys." -> "Systems"
       - "Serv." / "Svc." / "Svcs." -> "Services"
       - "Prod." / "Prods." -> "Products"
       - "Dev." -> "Development"
       - "Chem." -> "Chemical"
       - "Equip." / "Eqpt." -> "Equipment"
        - "Mfr." / "Mfr" -> "Manufacturer", "Mfrs." -> "Manufacturers", "Mach." -> "Machinery", "Instr." -> "Instruments"
        - "Assoc." -> "Associates", "Bros." -> "Brothers", "Mgmt." / "Mgmt" -> "Management", "Mktg." -> "Marketing"
        - "Natl." / "Nat'l" -> "National", "Mech." -> "Mechanical", "Elec." -> "Electrical", "Electr." -> "Electronics"
        - "Const." / "Constr." -> "Construction", "Fab." -> "Fabrication", "Pkg." -> "Packaging", "Prec." -> "Precision"
        - "Lab." -> "Laboratory", "Labs." -> "Laboratories", "Mat." / "Matl." -> "Material", "Matls." -> "Materials"
        - "Comm." / "Comms." -> "Communications", "Dist." / "Distr." -> "Distribution", "Sci." -> "Scientific"
        - "Std." -> "Standard", "Struct." -> "Structural", "Telecom." / "Telecomm." -> "Telecommunications"
        - "Transp." -> "Transportation", "Whsle." -> "Wholesale", "Hdwe." / "Hdw." -> "Hardware", "Auto." -> "Automotive"
        - Always expand any other recognizable abbreviated business word into its full English form.
     * Country-Specific Company Name & Legal Entity Expansions:
       - United States & Canada: "Inc." -> "Incorporated", "Corp." -> "Corporation", "LLC" / "L.L.C." -> "Limited Liability Company", "LP" -> "Limited Partnership", "LLP" -> "Limited Liability Partnership", "PLLC" -> "Professional Limited Liability Company".
       - United Kingdom, Australia, New Zealand, South Africa, India, Singapore, Malaysia, Hong Kong (Commonwealth): "Ltd." -> "Limited", "Pvt. Ltd." -> "Private Limited", "Pte. Ltd." (Singapore/Southeast Asia) -> "Private Limited", "Pty. Ltd." (Australia/South Africa) -> "Proprietary Limited", "PLC" / "Plc" -> "Public Limited Company", "LLP" -> "Limited Liability Partnership", "Sdn. Bhd." (Malaysia) -> "Sendirian Berhad", "Bhd." -> "Berhad".
       - Germany, Austria, Switzerland (DACH): "GmbH" -> "Gesellschaft Mit Beschränkter Haftung", "AG" -> "Aktiengesellschaft", "KG" -> "Kommanditgesellschaft", "GmbH & Co. KG" -> "Gesellschaft Mit Beschränkter Haftung & Co. KG", "e.K." / "e.Kfm." -> "Eingetragener Kaufmann".
       - France, Belgium, Luxembourg, Switzerland (Romandy): "SARL" / "S.A.R.L." -> "Société À Responsabilité Limitée", "SA" / "S.A." -> "Société Anonyme", "SAS" / "S.A.S." -> "Société Par Actions Simplifiée", "SNC" -> "Société En Nom Collectif".
       - Italy: "S.p.A." / "SpA" -> "Società Per Azioni", "S.r.l." / "Srl" -> "Società A Responsabilità Limitata".
       - Spain, Mexico & Latin America: "S.A." / "SA" -> "Sociedad Anónima", "S.L." / "SL" -> "Sociedad Limitada", "S.A. de C.V." -> "Sociedad Anónima De Capital Variable", "S.R.L." -> "Sociedad De Responsabilidad Limitada", "Ltda." -> "Limitada".
       - Netherlands & Belgium (Flanders): "B.V." / "BV" -> "Besloten Vennootschap", "N.V." / "NV" -> "Naamloze Vennootschap".
       - Nordics (Sweden, Norway, Denmark, Finland): "AB" (Sweden) -> "Aktiebolag", "AS" / "A/S" (Norway/Denmark) -> "Aksjeselskap", "Oy" (Finland) -> "Osakeyhtiö", "Oyj" -> "Julkinen Osakeyhtiö".
       - China, Taiwan, Japan, Korea: "Co., Ltd." -> "Company, Limited", "Corp." -> "Corporation", "Mfg." -> "Manufacturing", "Ind." -> "Industrial", "Tech." -> "Technology", "Intl." -> "International", "Grp." -> "Group", "K.K." (Japan) -> "Kabushiki Kaisha", "Y.K." (Japan) -> "Yugen Kaisha".
   - Extract exclusively from the official website content.
   - Prioritize the official legal name over trade/operational name.
   - Special Character Preservation Rule:
     * Special characters (such as "&", "-", "/", "@", "'", ".", "+", "%", "#") MUST be kept exactly the same as on the website.
     * DO NOT change special characters into words or expansions (e.g., NEVER replace "&" with "and" or "And"; always keep "&" as it is).
     * DO NOT remove internal hyphens "-", slashes "/", or special characters. Always keep special characters as it is.
     * Only remove outer brackets and decorative leading/trailing bullets/symbols at the very beginning or end if not part of the name.
   - If a country name is part of the registered company name, retain it.
   - Remove brackets (parentheses, square brackets) and bracketed supplementary notes.
   - Remove leading/trailing symbols and unnecessary special characters.
   - Preserve officially recognized brand acronyms (e.g., IBM, BMW) unless their full form is explicitly stated as part of the legal name.
   - First letter in each word must be capitalized only (Title Case), NOT all the characters. Example: "Zhejiang Jiangnan Steel Structure Company, Limited".

6. "countryName": Country where company is based or registered, strictly following these rules:
   - MANDATORY FULL OFFICIAL ORIGINAL NAME RULE: You must ALWAYS write the complete, full official original name of the country. Never use abbreviations, acronyms, or shortened forms.
   - CRITICAL MANDATORY RULE FOR UNITED STATES: Always output the full official name "United States Of America"! NEVER output "United States", "USA", "U.S.", or "U.S.A.". If the company is located in the US, "countryName" MUST ALWAYS BE "United States Of America"!
   - CRITICAL RULE FOR ALL COUNTRIES: All countries must be written in their complete, original, full official names in Title Case (e.g., "United States Of America", "United Arab Emirates", "United Kingdom", "Germany", "China", "Australia", "Canada", "Saudi Arabia").
   - First letter in each word must be capitalized only, NOT all characters (Title Case).
   - If the country name is not available directly on the site, check social media links/profiles, or infer it using the city and state name from the address. Locality must be considered for the country name.
   - Special Rule for United Kingdom:
     * For United Kingdom (England, Wales, Scotland, Northern Ireland): If "England" and "United Kingdom" both are mentioned, you must take England as the country name (prioritize the specific constituent country/locality: England, Wales, Scotland, Northern Ireland).
### 7. companyAddress – Complete Address Extraction, Full-Form Expansion and Title Case Normalization

**Contact Page, Footer and Map Address Comparison – Complete Address Extraction**

**A. Three-Source Address Comparison Framework**
1. Objective:
   Extract the most complete Headquarters (HQ) address by comparing three official website sources:
   - Contact Page – Primary Source (ABSOLUTE HIGHEST PRIORITY)
   - Website Footer – Secondary Source
   - Embedded Map – Additional Address Verification Source

2. Address Extraction Rules:
   - Extract the address separately from the Contact Page body text, Contact Page Embedded Map, and Footer.
   - CRITICAL CONTACT PAGE MAP PRIORITY: If in the Contact Page the address is not available in text (or the contact page contains only an inquiry form), but the Contact Page includes an Embedded Map, YOU MUST TAKE THE CONTACT MAP ADDRESS as the primary address! The Contact Map is on the Contact Page and directly represents the verified physical headquarters address.
   - Compare all available addresses component by component.
   - Identify missing address components in the Contact Page text.
   - Check whether the Footer or Map provides additional information belonging to the same physical location.

3. Strict Address Selection Logic:
   - Scenario 1: All Three Addresses Are Identical
     * Select the Contact Page address.
   - Scenario 2: Contact Page Address Is Incomplete (Compare Which One Has Full Details)
     * CRITICAL FULL DETAILS RULE: You MUST compare all three addresses component by component to determine WHICH ONE HAS FULL DETAILS!
     * If the Contact Page text or Footer only contains partial details (e.g. "No.2, Wugong 2nd Rd., Wufeng Dist., Taichung City" which is missing the local village/locality, or "Shashi Gardens" which is missing the road name), but the Embedded Map provides the MORE COMPLETE / FULL DETAIL address for that exact physical location (e.g. including the village, locality, sub-district, or official street name such as "Beiliu Village" in "Number 2, Wugong 2nd Road, Beiliu Village, Wufeng District, Taichung City", or "Shashi Park Rd" in "B-14, Shashi Park Rd, I, Mayur Vihar, New Delhi, Delhi"):
       - The Map address HAS FULL DETAILS and provides the most complete verified headquarters address!
       - YOU MUST SELECT AND PUT THE FULL DETAIL MAP ADDRESS AS THE FINAL COMPANY ADDRESS!
       - NEVER discard or omit the extra verified locality, village, or street details from the Map.
       - USE THE VERIFIED MAP ADDRESS FORMULATION DIRECTLY (e.g. "Number 2, Wugong 2nd Road, Beiliu Village, Wufeng District, Taichung City" or "B-14, Shashi Park Rd, I, Mayur Vihar, New Delhi, Delhi")!
       - "No." / "Number" Availability: Expand "No." or "No.2" to "Number" ONLY if "No." or "No" or "Number" was present in the original source address (e.g. "No.2, Wugong 2nd Rd." -> "Number 2, Wugong 2nd Road"). If "No." or "Number" was NOT available in the source address (e.g. "2, Wugong 2nd Rd." or "45 Main Street"), DO NOT put or add "Number" or "No." — keep pure numbers as-is!
       - NEVER concatenate both colony and road names together into an artificial combined address (e.g. never output "Shashi Gardens, Shashi Park Road").
       - Preserve the original commas present in that verified Map address.
     * Preserve all valid Contact Page information.
   - Scenario 3: Contact Page and Footer Are Different (Corporate Office / Headquarters vs. Registered Office / Branch Priority - MANDATORY QC RULE)
     * Always prioritize HEADQUARTERS (HQ) / CORPORATE OFFICE / MAIN OFFICE over Registered Office, Branch Office, Sales Office, Plant, or Factory.
     * When a website or contact page lists multiple offices or both a "Corporate Office" / "Headquarters" (e.g. "Corporate Office: 3rd Floor, Mahalaxmi Plaza, VC-2 Sector-3, Vaishali, Ghaziabad") and a "Registered Office" (e.g. "Registered Office: B-14, Shashi Gardens, Mayur Vihar - I, Delhi"), you MUST ALWAYS select the CORPORATE OFFICE / HEADQUARTERS address!
     * A Registered Office is merely a legal registration address. The Corporate Office / Headquarters is the active physical location of executive operations.
     * The Phone Number MUST match the selected Headquarters / Corporate Office (e.g. "1202770608" for Corporate Office in Ghaziabad, NOT the Registered Office phone/mobile "99532...").
     * If both Contact Page body and Footer are present:
       - If Footer contains the designated "CORPORATE OFFICE" or "HEADQUARTERS", and the Contact Page body only lists a "REGISTERED OFFICE" or secondary branch, SELECT THE CORPORATE OFFICE / HEADQUARTERS and its corresponding telephone number!
       - If Contact Page text has no address or only an inquiry form, but has an Embedded Map, you MUST take the Contact Map address!
       - Use Footer information when it provides the verified Corporate Office / Headquarters, or completes missing components of the exact same physical address, or when the Contact Page contains NO address and NO embedded map at all.
   - Scenario 4: Contact Page and Map Are Different (Compare Which One Has Full Details)
     * Compare building number, street, locality, village, district, city and state to check which address has full details.
     * If the Map contains additional verified components or MORE COMPLETE / FULL DETAILS of the same location (e.g. verified street/road name like "Shashi Park Rd", or village/locality like "Beiliu Village", unit, phase, locality, city, state), ADOPT THE VERIFIED FULL DETAIL MAP ADDRESS FORMULATION DIRECTLY for that exact location (e.g. "Number 2, Wugong 2nd Road, Beiliu Village, Wufeng District, Taichung City" or "B-14, Shashi Park Rd, I, Mayur Vihar, New Delhi, Delhi").
     * "No." / "Number" Availability: Expand "No." or "No.2" to "Number" ONLY if "No." or "No" or "Number" was present in the original source address. If "No." or "Number" was NOT available in the original address, do NOT add or put "Number" or "No."!
     * Preserve the verified commas present in the Map address.
     * If the Map points to a completely different location/city, ignore it.
   - Scenario 5: All Three Addresses Are Different
     * Do not automatically select the longest address.
     * Do not merge different locations.
     * Select the Contact Page address as the base (using Contact Map if Contact text is not available).
     * Supplement it only when additional components are verified as belonging to the same physical HQ location.
     * If the difference cannot be resolved, flag "websiteStatus": "Manual Review", with reason "Manual Review Required: Conflicting addresses across Contact, Footer, and Map that cannot be reconciled".
   - Scenario 6: Contact Page Address Is Not Available in Text (or Contact Page contains only Form / Map):
     * CRITICAL CONTACT MAP PRIORITY (MANDATORY): If in the Contact Page the address is not available in text (e.g. the contact page body only contains an inquiry/contact form, or has no text address block), but the Contact Page includes an Embedded Map, YOU MUST TAKE THE CONTACT MAP ADDRESS! The Contact Page Map is located directly on the Contact Page and represents the verified physical headquarters address of the company.
     * COMPARE WHICH ONE HAS FULL DETAILS: Compare the Contact Map address and Footer address:
       - If the Map address provides fuller / more complete details (e.g. includes village/locality like "Beiliu Village", building number, road, district, city), YOU MUST PUT THE FULL DETAIL MAP ADDRESS!
       - "No." / "Number" Availability: If "No." or "No" or "Number" is available in the original source address, expand it to "Number" (e.g. "No.2, Wugong 2nd Rd." -> "Number 2, Wugong 2nd Road, Beiliu Village, Wufeng District, Taichung City"). If "No." or "Number" is NOT available in the source address (e.g. "45 Main St." or "Unit B3"), DO NOT add or put "Number" or "No." — keep pure numbers as-is, and if not available, remove/do not include "Number"!
       - Clean and remove any trailing company name, Chinese corporate name, or slash-separated business registration name appended to the map address (e.g., strip "安頌液壓工業股份有限公司/ANSON Hydraulics Industrial Co., Ltd." or "/Company Name").
       - Remove country name (e.g., "Taiwan") and postal/ZIP codes (e.g., "413", "41353").
       - Clean native building/lot numbers (e.g., convert "No. 2號" to "Number 2", but if "No." was not present, e.g. "2號", keep as "2").
       - Expand street, district, and administrative abbreviations (e.g., "Rd" -> "Road", "Dist." -> "District") in Title Case while preserving original commas.
     * Fallback (Only when NO Contact Map is present): If Contact Us is not found or does not contain an address, you can take the address from the Footer of the website.
     * Only flag "websiteStatus": "Manual Review" with reason "Manual Review Required: Conflicting addresses across Contact, Footer, and Map that cannot be reconciled" if no valid address exists across all sources.

4. Address Completion Rules:
   Compare these components:
   - Building / House Number
   - Street Number and Street Name
   - Road / Avenue
   - Area / Locality
   - City
   - State / Province
   - Other meaningful address details
   Additional information can be included ONLY when:
   - It belongs to the same physical address.
   - It does not contradict the Contact Page.
   - It is verified using the official website or its embedded map.
   - Never add unrelated branch addresses, nearby landmarks, or guessed geographic details.

5. Address Normalization:
   CRITICAL NEGATIVE RULE - UNWANTED "NUMBER" PROHIBITION:
   - NEVER prepend or add the word "Number" to street numbers or addresses starting with digits!
   - Example: "12900 - 87th Avenue, Surrey, BC V3W 3H9, Canada" MUST BE "12900 - 87th Avenue, Surrey, British Columbia" (NEVER "Number 12900 - 87th Avenue")!
   - Pure street/building numbers (e.g. "12900", "45 Main Street", "100 Parkway", "Unit B3") must NEVER have "Number" added.
   - ONLY include "Number" if the original source text explicitly had "No." or "Number".
   Apply the existing address formatting rules:
   - Expand abbreviated words into their full forms.
   - Use Title Case (first letter of each word capitalized).
   - Remove postal codes / ZIP codes / pincode ONLY (CRITICAL: P.O. Box is a mailing address line, NOT a postal code! NEVER remove P.O. Box / Post Office Box; always retain and expand P.O. Box into "Post Office Box [Number]").
   - Remove country names.
   - Remove company names.
   - Remove brackets.
   - Remove unnecessary trailing punctuation and special characters.
   - Preserve meaningful building numbers and street identifiers.
   - Punctuation & Comma Handling:
     * Commas present in the source address (such as the Embedded Map address or Contact address) MUST BE PRESERVED (e.g. "B-14, Shashi Park Rd, I, Mayur Vihar, New Delhi, Delhi" must keep its commas).
     * Do NOT strip away commas that exist in the original source address.
     * Do NOT invent or insert artificial commas where none existed in the source text (e.g., do not insert a comma before a state abbreviation if no comma was in the original text).

6. Headquarters & Active Address Priority:
   - Always prioritize the Headquarters (HQ) or Corporate Office address. HQ / Corporate Office address is always first priority over Registered Office, Branch Office, Factory, or Plant.
   - When a company lists both a "Corporate Office" and a "Registered Office", ALWAYS select the Corporate Office as the headquarters.
   - Primary Location Priority: If the Contact Page or Footer designates a Corporate Office or Headquarters, that address is the primary source of truth.
   - Corresponding Phone Number: The extracted phone number MUST correspond to the selected Corporate Office / Headquarters address, not to a secondary branch or registered office. If the main contact number is a toll-free number, take the second phone or direct local contact number instead.
   - Select only one address. Never combine multiple branch addresses.
   - Use only information available on the official website.
   - Current Active Address Priority (CRITICAL): Always select the CURRENT active headquarters or operational address. NEVER select former, historical, or previous addresses (e.g., text stating "prior to [date] was located at...", "formerly located at...", "previous address", or "relocated from...").

**B. Universal & Contextual Abbreviation Expansion (MANDATORY)**
Expand every recognizable abbreviation, shortened word, delivery and box abbreviation (such as P.O. Box, PBS, Post Bag), directional token, floor/unit token, and administrative/street term into its full form in Title Case according to the surrounding geographic and business context—without hardcoding specific companies or sites.
- Contextual & Regional Expansion: Use surrounding city, district, state/province, and country context to resolve shortened locality or street tokens (for example, expanding "Kb" to "Kampung Baru" in a Balakong / Seri Kembangan context, or expanding regional street/estate/district abbreviations when clear from context).
- What Stays Unexpanded: Keep pure lot/plot/unit/house numbers, numeric coordinates, and non-abbreviated proper names or established brand acronyms as-is. NEVER artificially add "Number" or "No." before numbers unless "No." or "No" or "Number" was explicitly present in the original text. Only leave a token unexpanded when it is genuinely an ambiguous code/reference with no clear geographic or domain expansion.

1. Universal Abbreviation Mappings (expand abbreviations into their complete, grammatically standard English or native equivalents):
   - Universal / International Thoroughfares:
     * "Rd." / "Rd" -> "Road", "St." / "St" -> "Street", "Ave." / "Ave" -> "Avenue", "Blvd." / "Blvd" -> "Boulevard", "Hwy." / "Hwy" -> "Highway", "Dr." / "Dr" -> "Drive", "Ln." / "Ln" -> "Lane", "Way", "Ct." / "Ct" -> "Court", "Pl." / "Pl" -> "Place", "Cir." / "Cir" -> "Circle", "Pkwy." / "Pkwy" -> "Parkway", "Ter." / "Terr." -> "Terrace"
   - Universal Divisions, Units & Buildings:
     * "Sec." / "Sec" -> "Section" (e.g., "Sec. 3" -> "Section 3"), "Dist." / "Dist" -> "District", "Prov." / "Prov" -> "Province", "Ind." / "Ind" -> "Industrial", "Bldg." / "Bldg" -> "Building", "Rm." / "Rm" -> "Room", "Ste." / "Ste" -> "Suite", "Apt." / "Apt" -> "Apartment", "Blk." / "Blk" -> "Block", "Sq." / "Sq" -> "Square", "Ctr." / "Ctr" -> "Center", "Plz." / "Plz" -> "Plaza"
     * "No." / "No" / "No.2" -> "Number" (CRITICAL SOURCE AVAILABILITY RULE: ONLY PUT IF AVAILABLE IN ORIGINAL ADDRESS; IF NOT AVAILABLE, REMOVE / DO NOT ADD):
       - If "No." or "No" or "No.2" or "No 2" or "Number" is AVAILABLE in the original source address, expand it to "Number" in Title Case (e.g., "No. 2" -> "Number 2", "No.2" -> "Number 2", "No. 45" -> "Number 45", "No. 2號" -> "Number 2", "H.No. 12" -> "House Number 12").
       - If "No." or "Number" is NOT AVAILABLE in the original source address (e.g. the text merely says "45 Main Street", "Unit B3", "100 Industrial Parkway", "Plot 14", "B-14 Shashi Gardens"), DO NOT PUT OR ADD "Number" or "No."! Keep pure numbers/identifiers as-is without prepending "Number". If "No." / "Number" was not in the source text, remove / do not inject it!
   - Box, Delivery & Administrative Abbreviations (MANDATORY RETENTION & EXPANSION):
     * "P.O. Box" / "PO Box" -> MUST ALWAYS BE KEPT AND EXPANDED to "Post Office Box" (e.g. "P.O. Box 450" -> "Post Office Box 450", "PO Box 123" -> "Post Office Box 123", "P.O. Box" -> "Post Office Box").
       CRITICAL RULE: NEVER REMOVE P.O. BOX! P.O. Box is an essential mailing and delivery address line, NOT a postal code. ONLY postal/ZIP code numbers (e.g. 53037, 90210, 201010) are removed—P.O. Box itself MUST ALWAYS BE PRESERVED!
     * "P.O." / "P.O" -> "Post Office" (e.g. "P.O. Mayur Vihar" -> "Post Office Mayur Vihar")
     * "P.B." / "PB" -> "Post Bag" (e.g. "P.B. No." -> "Post Bag Number")
     * "Kb" / "KB" / "K.B.":
       - In postal / locked bag context (when followed by a number or No., e.g. "Kb 123", "K.B. No. 45", "Kb 500"): -> "Kotak Berkunci Number" (or "Kotak Berkunci")
       - In Malaysian state/locality context (e.g. "KB, Kelantan" or "KB Kelantan"): -> "Kota Bharu"
       - In Indonesian regency context ("Kb." / "Kab."): -> "Kabupaten"
     * "C/O" / "c/o" -> "Care Of"
     * "H.No." / "H.No" / "H No" -> "House Number"
     * "G/F" -> "Ground Floor", "M/F" -> "Mezzanine Floor", "B/F" -> "Basement Floor"
   - Floor Designations: Expand any floor abbreviation into "Floor":
     * Universal floor pattern: Any number directly attached to or followed by "f", "F", "fl", "Fl", or "fl." (e.g. "1F", "2F", "3f.", "3f.-6", "3F-6", "4F-1", "5FL", "10F", "1st F", "2nd Fl.") MUST be expanded with "Floor":
       - When attached directly to a number without ordinal suffix: "1F" -> "1Floor", "2F" -> "2Floor", "3f." / "3F" -> "3Floor", "3f.-6" -> "3Floor - 6" (or "3Floor.-6").
       - When ordinal suffix is present: "1st F" / "1st Fl." -> "1st Floor", "2nd F" / "2nd Fl." -> "2nd Floor", "3rd F" / "3rd Fl." -> "3rd Floor".
       - NEVER leave raw single-letter "f" or "F" unexpanded when referring to floors! Retain any sub-unit hyphenated numbers intact.
   - Country-Specific Address & Region Expansions:
     * United States & Canada:
       - State & Province Abbreviations (MANDATORY EXPANSION): Always expand 2-letter or shortened state, province, and territory abbreviations into their complete official names (e.g., "WI" MUST be expanded to "Wisconsin", "CA" -> "California", "TX" -> "Texas", "NY" -> "New York", "IL" -> "Illinois", "PA" -> "Pennsylvania", "OH" -> "Ohio", "FL" -> "Florida", "MI" -> "Michigan", "GA" -> "Georgia", "NC" -> "North Carolina", "NJ" -> "New Jersey", "VA" -> "Virginia", "WA" -> "Washington", "ON" -> "Ontario", "BC" -> "British Columbia", "QC" -> "Quebec", "AB" -> "Alberta", etc.). State abbreviations MUST NEVER be deleted or removed from the address—they MUST be expanded to their full form.
       - Directional Prefixes Attached to Numbers: Expand directional letters attached directly to numerical identifiers or grid coordinates into their full form:
         * "N173" -> "North173"
         * "W21640" -> "West21640"
         * "S[Number]" -> "South[Number]" (e.g., "S100" -> "South100")
         * "E[Number]" -> "East[Number]" (e.g., "E200" -> "East200")
       - Standalone Directional Words: "N." / "N" -> "North", "S." / "S" -> "South", "E." / "E" -> "East", "W." / "W" -> "West", "NW" -> "Northwest", "NE" -> "Northeast", "SW" -> "Southwest", "SE" -> "Southeast".
       - Thoroughfares: "Expwy" / "Expy" -> "Expressway", "Fwy" -> "Freeway", "Pkwy" -> "Parkway", "Tpke" -> "Turnpike".
     * United Kingdom & Ireland:
       - Counties: "Co." -> "County" (e.g., "Co. Durham" -> "County Durham"), "Yorks" -> "Yorkshire", "Lancs" -> "Lancashire", "Hants" -> "Hampshire", "Berks" -> "Berkshire", "Staffs" -> "Staffordshire".
       - Thoroughfares & Units: "Cres." -> "Crescent", "Cl." -> "Close", "Sq." -> "Square", "Ter." -> "Terrace", "Grv." -> "Grove", "Prom." -> "Promenade", "Pde." -> "Parade", "Gdns." -> "Gardens", "Ind. Est." -> "Industrial Estate", "Bus. Pk." -> "Business Park", "Trading Est." -> "Trading Estate", "Bldgs." -> "Buildings", "Hse." -> "House".
     * Australia & New Zealand:
       - States & Territories: "NSW" -> "New South Wales", "VIC" -> "Victoria", "QLD" -> "Queensland", "WA" -> "Western Australia", "SA" -> "South Australia", "TAS" -> "Tasmania", "ACT" -> "Australian Capital Territory", "NT" -> "Northern Territory".
       - Thoroughfares: "Hwy" -> "Highway", "Esp" / "Espl" -> "Esplanade", "Pde" -> "Parade", "Tce" / "Ter" -> "Terrace", "Cct" -> "Circuit".
     * Germany, Austria, Switzerland:
       - "Str." / "Str" -> "Strasse" (or "Straße"), "Weg" -> "Way", "Pl." / "Plz." -> "Platz", "Gasse" -> "Lane", "Ind.-Gebiet" / "Gewerbegebiet" -> "Industrial Area" / "Commercial Area".
     * France, Belgium, Switzerland:
       - "Av." / "Ave" -> "Avenue", "Bd" / "Blvd" -> "Boulevard", "All." -> "Allée", "Imp." -> "Impasse", "Pl." -> "Place", "Z.I." / "ZI" -> "Zone Industrielle", "Z.A." / "ZA" -> "Zone D'activité", "Bât." -> "Bâtiment", "Étg." -> "Étage".
     * Spain, Mexico & Latin America:
       - "C/" / "C." / "Cl." -> "Calle", "Av." / "Avda." -> "Avenida", "Pº" / "P.º" -> "Paseo", "Pza." -> "Plaza", "Ctra." -> "Carretera", "Pol. Ind." / "P.I." -> "Polígono Industrial", "Edif." -> "Edificio", "Piso" -> "Floor", "Dpto." / "Depto." -> "Departamento".
     * Italy:
       - "V." / "Vle" -> "Viale", "C.so" -> "Corso", "P.za" -> "Piazza", "L.go" -> "Largo", "Z.I." -> "Zona Industriale", "Pal." -> "Palazzo", "P." / "P.no" -> "Piano".
     * China, Taiwan, Hong Kong, Singapore, East Asia:
       - "Sec." / "Sec" -> "Section" (e.g., "Sec. 3" -> "Section 3"), "Dist." / "Dist" -> "District" (e.g., "Da'an Dist." -> "Da'an District"), "Prov." -> "Province", "Rd." -> "Road", "St." -> "Street", "Ln." -> "Lane", "Aly." -> "Alley", "No." -> "Number", "Ind. Park" / "Ind. Zone" -> "Industrial Park" / "Industrial Zone", "Bldg." -> "Building", "Rm." -> "Room", "Fl." / "F" / "f." -> "Floor" (e.g., "3f.-6" -> "3Floor - 6").
2. Apply expansion throughout the entire address, including street names, building names, directional references, administrative divisions, floor designations, and other address components.
3. Expand recognizable abbreviations even when they are attached directly to numbers, provided their meaning is clear from the address context.
4. Use contextual understanding to identify the correct full form. Do not restrict expansion to a predefined abbreviation list.
5. Do not leave recognizable address abbreviations in shortened form when their full meaning is clear.
6. Do not invent expansions for ambiguous identifiers, proper names, or reference codes.

**C. Title Case Formatting (STRICT)**
1. Capitalize only the first letter of each word.
2. All remaining letters must be lowercase.
3. Never convert ordinary address words into ALL CAPITAL LETTERS.
4. Apply Title Case after completing abbreviation expansion.
5. Preserve the intended meaning and correct word boundaries.

**D. Original Structure & Special Characters (STRICT)**
- Expand abbreviations and remove postal/ZIP codes and country names BEFORE finalizing the string—do NOT leave abbreviations unexpanded just because they appeared short in the raw text.
- Preserve existing commas, hyphens ("-"), slashes ("/"), ampersands ("&"), and numbers from the chosen source address; NEVER expand "&" to "and" or "@" to "at", and NEVER add extra commas or special characters that were not in the source text.
- Trim leading/trailing spaces and strip stray leading/trailing punctuation or brackets.
1. STRICT SOURCE COMMA PRESERVATION – ZERO ARTIFICIAL COMMAS:
   - Preserve commas ONLY when they exist in the original selected address.
   - NEVER insert a comma between address components during normalization or abbreviation expansion.
   - MULTI-LINE ADDRESS RULE (CRITICAL): When an address on a webpage is formatted across multiple lines (<br>, <p>, <div>, or line breaks) WITHOUT commas at the end of the lines, join those lines with a SINGLE SPACE, NEVER with a comma! Only preserve commas that were explicitly written in the source text (e.g. "A3/A4 Barton Industrial Estate\nFaldo Road\nBarton-Le-Clay\nBedford, Bedfordshire\nMK45 4RP\nUnited Kingdom" -> "A3/A4 Barton Industrial Estate Faldo Road Barton-Le-Clay Bedford, Bedfordshire").
   - NEVER automatically insert commas before City, District, State, Province, or Suburb.
   - Do not use standard address formatting conventions to introduce additional commas.
   - When removing postal codes, country names, company names, or unwanted text, do not introduce new commas.
   - If removing a component leaves duplicate or unnecessary commas, clean them without removing meaningful original separators.
   - Compare the final address against the original source character by character to validate comma positions.
   - Examples:
     * Original: "12900 - 87th Avenue Surrey BC V3W 3H9 Canada" -> Expected: "12900 - 87th Avenue Surrey British Columbia"
     * Original: "45 Main Street, Richmond, BC V6X 1A1, Canada" -> Expected: "45 Main Street, Richmond, British Columbia"
     * Original: "Building 12 Sector 5 Noida Uttar Pradesh" -> Expected: "Building 12 Sector 5 Noida Uttar Pradesh"
   - Never insert commas that were not present in the original address.
   - UNIVERSAL STATE / PROVINCE COMMA RULE (CRITICAL):
     * NEVER insert an artificial comma before a state, province, or territory if the original address text did not contain a comma there!
     * For example, if the original address wrote "Bayswater Vic" or "Jackson WI" or "Concord ON" without a comma, you MUST expand to "Bayswater Victoria", "Jackson Wisconsin", "Concord Ontario" WITHOUT inserting a comma (do NOT output "Bayswater, Victoria").
     * ONLY output a comma before the state if that exact comma was explicitly present in the original website address text (e.g., "Jackson, WI" -> "Jackson, Wisconsin"). If there was NO comma before the state abbreviation in the original text, DO NOT ADD ANY COMMA!
2. Preserve the original address sequence and structure exactly as it appears.
3. Keep internal commas and punctuation ONLY in their exact original positions. Do not add extra commas or remove meaningful original commas.
4. Special characters, hyphens, slashes, ampersands ("&"), numbers, and symbols within the address MUST be kept exactly the same as shown on the website. Preserve meaningful hyphens, slashes, ampersands (&), numbers, coordinate identifiers (such as North173 West21640), and symbols. Keep coordinates and building numbers intact.
5. DO NOT change or expand special characters into words (e.g., NEVER replace "&" with "and", NEVER replace "@" with "at"). Keep special characters always as it is.
6. Do not add artificial linking words such as "in" or "of".
7. Strict rule: If available in the original address, then provide; else do NOT provide any added comma or special character.
8. "No." or "Number" Source Availability: Put "Number" ONLY if "No." or "Number" was available in the original source address. If NOT available in the source address, do NOT put or add "Number" or "No." (remove / omit any artificial "Number" prefix and keep pure numbers as originally written).

**E. Mandatory Cleanup**
1. Remove pincode, postal codes, and ZIP codes completely from the address:
   - CRITICAL: POSTAL CODE ONLY TO BE REMOVED — NEVER REMOVE P.O. BOX!
     * "P.O. Box" (Post Office Box) is a PHYSICAL DELIVERY & MAILING ADDRESS, NOT a postal code!
     * ONLY postal code / ZIP code / pincode numbers (e.g. 5-digit US ZIP like 53037 or 90210, 6-digit pincode like 201010, Canadian or international postal numbers) are to be removed.
     * UNDER NO CIRCUMSTANCES should "P.O. Box", "PO Box", "Post Office Box", "P.O.", "Box [Number]", "Post Bag", or "Kotak Berkunci" be deleted or removed when cleaning postal codes!
     * You MUST ALWAYS PRESERVE and EXPAND "P.O. Box [Number]" into "Post Office Box [Number]" (e.g. in "P.O. Box 450, 100 Main Street, Springfield, IL 62701", remove ONLY "62701", and RETAIN "Post Office Box 450, 100 Main Street, Springfield, Illinois").
   - ONLY remove the postal code/zip code/pincode numbers themselves.
   - CRITICAL: DO NOT remove the state or province abbreviation (such as "WI" or "Vic") when removing the pincode! The state abbreviation MUST NOT be removed—it MUST be expanded to its full name (e.g. "WI" -> "Wisconsin", "Vic" -> "Victoria").
   - Comma preservation when removing pincodes: If the original address wrote "Jackson, WI 53037" (with a comma), expand to "Jackson, Wisconsin". If the original address wrote "Bayswater Vic 3153" or "Jackson WI 53037" (WITHOUT a comma), expand to "Bayswater Victoria" or "Jackson Wisconsin" with NO comma added! Never inject an extra comma before the state!
2. Remove unwanted text at the initial (start) of the address (e.g., remove leading labels like "Address:", "Location:", "HQ:", "Registered Office:", bullet points, colons, hyphens, and company name prefixes).
3. Remove unwanted text and punctuation at the end of the address (e.g., remove trailing periods, commas, colons, hyphens, phone/fax numbers, email, or trailing notes).
4. Remove the country name.
5. Remove parentheses, square brackets, and curly brackets.
6. Do not remove meaningful internal address information.

**F. Final Validation**
Before returning companyAddress:
- Verify that the selected address is the HQ or Registered Head Office using Contact, Footer, and Map comparison.
- Verify that all recognizable abbreviations have been expanded.
- Verify that state/province abbreviations (e.g., WI -> Wisconsin) are expanded into their full names and NOT removed.
- Verify that directional prefixes have been expanded when their meaning is clear, including prefixes attached to numerical identifiers.
- Verify that all expanded words follow Title Case, not ALL CAPS.
- Verify that the original numbers and meaningful punctuation are preserved, and that NO commas or special characters have been added (provide only if available in original address, else do not provide; never add an artificial comma before state/province if missing in the original text).
- Verify that postal codes, country names, company names, and brackets are removed (and verify that Post Office Box / P.O. Box is RETAINED and NOT removed).
- Verify that "Number" is included ONLY if "No." or "Number" was present in the original source address (if "No." or "Number" was not available in the original text, verify that "Number" was NOT added and pure numbers remain as originally written).
- Verify that only one complete address is returned.

8. "state": Strictly output ONLY the exact string "Available" or "Not Available" (NEVER output the state name itself):
   - If the state name is given in the address, select "Available"; if not, select "Not Available".
   - Note: (County, Province, Prefecture) should be considered as State.
   - Country Capitals (CRITICAL UNIVERSAL RULE): (If a country's capital is mentioned in the address, then both City and State are considered available.)
   - Official States & Provinces: Any recognized first-level administrative division of any country worldwide (States, Counties, Provinces, Prefectures, Cantons, Departments, Federal Territories, Special/Direct-controlled Municipalities) qualifies as State = "Available", even when the word "State", "County", "Province", or "Prefecture" is not explicitly written after the name.
   - Disregard State Names in Street Lines: If a state, county, or province name appears solely as part of a street name (e.g., "Pennsylvania Avenue", "Washington Boulevard"), it does NOT count as State.
   - Do NOT consider an ordinary non-capital town, village, suburb, or industrial estate as State.

9. "city": STRICT CITY VS SUBURB CLASSIFICATION – MANDATORY (Strictly output ONLY the exact string "Available" or "Not Available", NEVER output the city name itself):
   - If the city name is given in the address, select "Available"; if not, select "Not Available".
   - Note: (Town, District, Municipality) should be considered as City.
   - Country Capitals: (If a country's capital is mentioned in the address, then both City and State are considered available.)
   - CRITICAL ANTI-SUBURB RULE: NEVER assume a place name is a city just because it appears before a State/Province or at the end of an address! In many countries (Australia, UK, India, USA, Canada, etc.), addresses are written as [Street], [Suburb/Locality], [State] without the parent city (e.g., "41 Barry Street, Bayswater, Victoria" or "10 Smith Street, Silverwater, New South Wales"). Here Bayswater and Silverwater are SUBURBS, NOT cities — you MUST output "city": "Not Available"!
   - Default to "Not Available" unless you can positively verify that the locality is an independently recognized official City, Town, Municipality, or Administrative District (or a Country Capital, which sets BOTH "city" and "state" to "Available").
   Before marking "city": "Available", independently classify the extracted locality:
   A. Qualifies as City – "Available":
      - Officially recognized and independently identifiable cities (and country capitals).
      - Official towns.
      - Official municipalities.
      - Official administrative districts, where the district is explicitly identified as an administrative division.
   B. Does NOT Qualify as City – "Not Available":
      - Suburbs (e.g., Bayswater, Silverwater, Tullamarine, Dandenong South, Andheri, etc.).
      - Neighborhoods & residential areas.
      - Villages & localities.
      - Industrial estates, industrial parks, business parks, MIDC/industrial zones.
      - Housing colonies, postal delivery areas, informal settlement names.
   C. AUSTRALIA ADDRESSES – MANDATORY SUBURB VS CITY RULE (CRITICAL):
      - In Australia, street addresses almost ALWAYS follow the format [Street], [Suburb] [State] WITHOUT writing the metropolitan city name (Melbourne, Sydney, Brisbane, Perth, Adelaide, etc.).
      - Every Australian metropolitan or industrial locality before a State (Victoria/VIC, New South Wales/NSW, Queensland/QLD, Western Australia/WA, South Australia/SA, Tasmania/TAS) is a SUBURB, NOT a city and NOT a town!
      - Therefore, for ANY Australian address:
        * Mark "city": "Not Available" when the locality is a suburb (e.g. Bayswater, Braeside, Campbellfield, Dandenong South, Derrimut, Epping, Keysborough, Laverton North, Moorabbin, Oakleigh South, Somerton, Sunshine, Thomastown, Tullamarine, Silverwater, Wetherill Park, Smithfield, Ingleburn, Minto, Seven Hills, Malaga, Welshpool, Wangara, Canning Vale, Bibra Lake, Osborne Park, Kewdale, Wingfield, Regency Park, Pooraka, Lonsdale, Acacia Ridge, Archerfield, Brendale, Darra, Eagle Farm, Geebung, Pinkenba, Rocklea, Wacol, Yatala, etc.).
        * Mark "city": "Available" ONLY if an actual official Australian City / Regional City (e.g., Sydney, Melbourne, Brisbane, Perth, Adelaide, Hobart, Darwin, Canberra, Gold Coast, Newcastle, Wollongong, Geelong, Townsville, Cairns, Toowoomba, Ballarat, Bendigo, Launceston, Albury, Rockhampton, Mackay, Bunbury, Wagga Wagga, Coffs Harbour, Shepparton, Tamworth, Dubbo, etc.) is explicitly written in the address!
        * Canberra is Australia's national capital -> BOTH "city": "Available" and "state": "Available".
   D. Multiple Locality Components:
      When an address contains both a suburb and an official city:
      - Do not classify the suburb as the city.
      - Identify the actual official city separately.
      - Mark "Available" only when an official city, town, municipality, or qualifying administrative district is explicitly present.
      - If only a suburb is present (without the parent official city), mark "Not Available".
   D. Examples (FOLLOW STRICTLY):
      - "41 Barry Street, Bayswater, Victoria" -> Bayswater is a suburb (Melbourne is not written) -> "city": "Not Available", "state": "Available".
      - "10 Smith Street, Silverwater, New South Wales" -> Silverwater is a suburb (Sydney is not written) -> "city": "Not Available", "state": "Available".
      - "Plot 14, Peenya Industrial Area, Karnataka" -> Industrial area/suburb (Bengaluru is not written) -> "city": "Not Available", "state": "Available".
      - "12900 - 87th Avenue Surrey British Columbia" -> Surrey is an official incorporated city -> "city": "Available", "state": "Available".
      - "500 Main Street, Bandra, Mumbai, Maharashtra" -> Mumbai is an official city explicitly present -> "city": "Available", "state": "Available".
      - "Number 2, Wugong 2nd Road, Wufeng District, Taichung City" -> Official district & city -> "city": "Available".
   E. Mandatory Validation:
      Before returning the result, verify:
      1. Is this locality an officially recognized city, town, municipality, or administrative district?
      2. Is it merely a suburb, village, industrial estate, or neighborhood within a larger metropolitan city?
      3. Am I mistaking it for a city only because it sits before the State or at the end of the address?
      Never assume that the last locality in an address is the city.
      Return only "Available" or "Not Available". Do not use geographical proximity or assumptions to convert a suburb into a city.

10. "emailId": Primary contact email address.
11. "secondaryEmailId": Alternative email if present, else "".
12. "phoneNumber": Primary contact phone number strictly formatted according to these rules:
    - Take the complete phone number, but ALWAYS REMOVE the international country code for ANY country (e.g., strip +1 for USA/Canada, +44 for UK, +91 for India, +86 for China, +49 for Germany, +33 for France, +81 for Japan, +61 for Australia, +971 for UAE, +65 for Singapore, or ANY other country calling code).
    - Remove all special characters, hyphens, plus signs, brackets, dots, and slashes.
    - Remove all spaces (digits only).
    - TOLL-FREE NUMBERS & SECONDARY PHONE SELECTION (MANDATORY RULE):
      * Do NOT take toll-free numbers (e.g., numbers starting with 1800, 800, 888, 877, 866, 855, 844, 400).
      * IF MAIN CONTACT NUMBER IS TOLL-FREE: If the primary contact number on the website/contact page is toll-free (e.g., "1-800-276-2792" as on ionthis.com), YOU MUST EXTRACT THE SECOND DIRECT LOCAL PHONE NUMBER (e.g., "+1-832-955-1531" -> "8329551531", or "+1 713 983 8528" -> "7139838528").
      * NEVER return empty string "" if a secondary direct phone or local contact number is present on the website, contact page, or in heuristically detected phone numbers! Always check for a second contact number or local line.
    - Do NOT take numbers starting with zero. Strip any leading zeros so the phone number never starts with 0.
    - Examples:
      * USA: "+1 (555) 234-5678" -> "5552345678"
      * Main is toll-free, second is local: "1-800-555-0199 / (212) 555-0144" -> take the second phone: "2125550144"
      * UK: "+44 20 7946 0958" -> "2079460958"
      * India: "+91 98765 43210" -> "9876543210"
      * China: "+86-573-85127888" -> "57385127888"
      * Domestic with 0: "0573-85127888" -> "57385127888" (leading 0 removed)
    - If no valid non-toll-free phone number exists across all sources, return "".
13. "numberOfProducts": String representation of number of products or services offered: Set using "One" (for 1) or "Three" (for more than 3)—never "0" (default "3" or "Three").
14. "productImages": String representation of number of product images identified: Set using "One" (for 1) or "Three" (for more than 3)—never "0". If all images on the site belong to prohibited categories, set "productImages" to "0". Otherwise default "3" (or "Three").
    - CRITICAL IMAGE EXCLUSION RULE (Rule 15): Images related to the following categories are STRICTLY PROHIBITED and MUST NEVER be counted as product images:
      * Porn / Adult Content (Adult/Porn)
      * Medicine, Medical, Hospital
      * Food
      * Weapons (including Knife), Defence
      * Aircraft, Aerospace, Marine, Ship (Aircraft / Marine)
      * Chemicals
      * Alcohol
      * Animals
    - Prohibited Categories (All Lists & Images): Never count or pass sites/images involving Adult/Porn, Medicine, Medical, Hospital, Food, Weapons (including Knife), Defence, Aircraft, Aerospace, Marine, Ship, Chemicals, Alcohol, or Animals.
    - If all images on the website fall under these prohibited categories, "productImages" MUST be "0". Otherwise, default is "3" (or "Three").
15. "numberOfProductDescriptions": String representation of product descriptions present: Set using "One" (for 1) or "Three" (for more than 3)—never "0" (default "3" or "Three").

CRITICAL QC RULES - UNPAID WEBSITES (INELIGIBLE FOR BILLING):
The following categories are NOT eligible for billing and MUST be classified with "websiteStatus": "Not Working" (unless noted):
1. Companies involved in armor, weapons manufacturing, trading, supply, exporting, or repairing services -> Not Working.
2. Pornographic or adult content websites -> Not Working.
3. Online gambling or online gaming websites -> Not Working.
4. Service provider websites (e.g., restaurants, salons, retailers, etc.), EXCEPT for industrial service providers -> Not Working.
5. Websites related to hacking services or hacking information -> Not Working.
6. Websites of alcoholic or tobacco product manufacturers, suppliers, or traders -> Not Working.
7. Websites related to the airline or aviation industry -> Not Working.
8. Personal websites, blogs, etc. -> Not Working.
9. Websites hosted on free platforms (e.g., WordPress, Wix, Weebly, Blogspot, etc.) -> Not Working.
10. Subdomain websites (i.e., not hosted at the root level, e.g. multimedia/entertainment streaming subdomains, non-canonical third-level subdomains) -> Not Working.
11. Websites with online product selling options (e.g., Add to Cart, Payment Gateway, Buy Now options), EXCEPT for manufacturers -> Not Working.
12. Websites in a non-English language without a translation option -> Status: "Non English".
13. URL redirecting websites – if redirected to a different registered domain -> Status: "Redirect Site".
14. Websites designed in Flash format where text is not copyable -> Status: "Flash".
15. Disallowed product images (Porn, Medicine, Food, Weapons, Aircraft/Marine, Chemicals, Alcohol, Animals) must never be counted.
16. For any unpaid category 1 to 11, set "websiteStatus": "Not Working" and explain the exact rule in "notWorkingReason".

ADDITIONAL QC RULES:
- Only check Facebook and LinkedIn if their official links appear on the website.
- Never use Google Translate.
- Select only one branch (prioritizing Headquarters: HQ (Headquarters) address is always first priority).
- Flag any unfamiliar edge case not covered by the instruction sheet for technical team confirmation (explain in "notWorkingReason").

Return ONLY the raw JSON object. Do not enclose in markdown code blocks like \`\`\`json.`;
  }

  function buildUserPrompt(context) {
    if (typeof CrawlerEngine !== "undefined" && CrawlerEngine.buildUserPrompt) {
      return CrawlerEngine.buildUserPrompt(context);
    }
    return `Analyze the following crawled website data and extract all corporate details according to the required schema:

Website Domain: ${context.domain}
Active URL: ${context.url}
Heuristically detected emails: ${JSON.stringify(context.detectedEmails)}
Heuristically detected phone numbers: ${JSON.stringify(context.detectedPhones)}
Heuristically detected product indicators: products=${context.heuristicProducts}, images=${context.heuristicImages}, descriptions=${context.heuristicDescriptions}

CRAWLED PAGES TEXT CONTENT:
${context.crawledText}`;
  }

  function renderResults(data, meta = {}) {
    resultsSection.classList.remove("hidden");

    // Display model execution metadata badge
    if (modelExecutionText) {
      const modelLabel = meta.modelUsed || geminiModel;
      const isFb = meta.isFallback ? " (Fallback Model Used)" : "";
      const retries = meta.retriesUsed ? ` · ${meta.retriesUsed} retries` : "";
      const time = meta.durationMs ? ` · ${(meta.durationMs / 1000).toFixed(1)}s` : "";
      modelExecutionText.textContent = `Engine: ${modelLabel}${isFb}${retries}${time}`;
    }

    // Badges
    resStatus.textContent = data.websiteStatus || "Working";
    if (data.websiteStatus?.toLowerCase() !== "working") {
      resStatus.style.color = "#f87171";
    } else {
      resStatus.style.color = "#34d399";
    }
    resBusinessType.textContent = data.businessType || "N/A";
    resProductCount.textContent = data.numberOfProducts || "0";

    // Build Table
    dataTableBody.innerHTML = "";
    const keyLabels = [
      { key: "websiteStatus", label: "Website Status" },
      { key: "notWorkingReason", label: "Not Working Reason" },
      { key: "businessType", label: "Business Type" },
      { key: "companyProfile", label: "Company Profile" },
      { key: "companyName", label: "Company Name" },
      { key: "countryName", label: "Country" },
      { key: "companyAddress", label: "Address" },
      { key: "state", label: "State / Province" },
      { key: "city", label: "City" },
      { key: "emailId", label: "Email ID" },
      { key: "secondaryEmailId", label: "Secondary Email" },
      { key: "phoneNumber", label: "Phone Number" },
      { key: "numberOfProducts", label: "Number of Products" },
      { key: "productImages", label: "Product Images" },
      { key: "numberOfProductDescriptions", label: "Product Descriptions" }
    ];

    keyLabels.forEach(item => {
      const val = data[item.key];
      const tr = document.createElement("tr");

      const tdKey = document.createElement("td");
      tdKey.className = "data-key";
      tdKey.textContent = item.label;

      const tdVal = document.createElement("td");
      tdVal.className = "data-val";
      if (val === undefined || val === null || val === "") {
        tdVal.textContent = "—";
        tdVal.classList.add("empty");
      } else {
        tdVal.textContent = String(val);
      }

      tr.appendChild(tdKey);
      tr.appendChild(tdVal);
      dataTableBody.appendChild(tr);
    });

    // Populate JSON Viewer with QC validation and extracted data
    const fullOutput = meta.qcValidation ? {
      qcOutput: {
        originalUrl: meta.qcValidation.originalUrl,
        finalUrl: meta.qcValidation.finalUrl,
        originalDomain: meta.qcValidation.originalDomain,
        finalDomain: meta.qcValidation.finalDomain,
        redirectDetected: meta.qcValidation.redirectDetected,
        redirectType: meta.qcValidation.redirectType,
        redirectChain: meta.qcValidation.redirectChain,
        httpStatus: meta.qcValidation.httpStatus,
        websiteStatus: meta.qcValidation.websiteStatus,
        nonWorkingReason: meta.qcValidation.nonWorkingReason,
        isEligibleForExtraction: meta.qcValidation.isEligibleForExtraction,
        manualReviewRequired: meta.qcValidation.manualReviewRequired
      },
      extractedCorporateData: data
    } : data;

    jsonViewer.textContent = JSON.stringify(fullOutput, null, 2);
  }

  function updateProgress(percent, status, log) {
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressStatus.textContent = status;
    if (log) progressLog.textContent = log;
  }

  function switchTab(tabName) {
    if (tabName === "details") {
      tabDetailsBtn.classList.add("active");
      tabJsonBtn.classList.remove("active");
      detailsTab.classList.add("active");
      jsonTab.classList.remove("active");
    } else {
      tabJsonBtn.classList.add("active");
      tabDetailsBtn.classList.remove("active");
      jsonTab.classList.add("active");
      detailsTab.classList.remove("active");
    }
  }

  function copyJsonToClipboard() {
    if (!lastExtractedResult) return;
    const jsonStr = JSON.stringify(lastExtractedResult, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      const orig = copyJsonBtn.textContent;
      copyJsonBtn.textContent = "✓ Copied!";
      setTimeout(() => { copyJsonBtn.textContent = orig; }, 1500);
    });
  }

  function downloadJsonFile() {
    if (!lastExtractedResult) return;
    const jsonStr = JSON.stringify(lastExtractedResult, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const domain = (siteDomainEl.textContent || "extracted").replace(/[^a-zA-Z0-9.-]/g, "_");
    a.href = url;
    a.download = `${domain}_intelligence.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsvFile() {
    if (!lastExtractedResult) return;
    const keys = Object.keys(lastExtractedResult);
    const values = keys.map(k => {
      let val = lastExtractedResult[k] || "";
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    });

    const csvContent = `${keys.join(",")}\n${values.join(",")}\n`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const domain = (siteDomainEl.textContent || "extracted").replace(/[^a-zA-Z0-9.-]/g, "_");
    a.href = url;
    a.download = `${domain}_intelligence.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
});
