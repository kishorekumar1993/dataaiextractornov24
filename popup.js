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
  const backendProxyTokenInput = document.getElementById("backendProxyToken");
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
  let backendProxyToken = "";
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
      "backendProxyToken",
      "crawlDepth",
      "autoCrawl",
      "autoSubmitNotWorking"
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

    if (data.backendProxyToken) {
      backendProxyToken = data.backendProxyToken;
      if (backendProxyTokenInput) backendProxyTokenInput.value = backendProxyToken;
    }

    if (data.crawlDepth) {
      crawlDepthSelect.value = data.crawlDepth;
    }

    const autoCrawlToggle = document.getElementById("autoCrawlToggle");
    const autoSubmitNotWorkingToggle = document.getElementById("autoSubmitNotWorkingToggle");
    if (autoCrawlToggle) autoCrawlToggle.checked = Boolean(data.autoCrawl);
    if (autoSubmitNotWorkingToggle) autoSubmitNotWorkingToggle.checked = Boolean(data.autoSubmitNotWorking);
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
    const proxyToken = backendProxyTokenInput ? backendProxyTokenInput.value.trim() : "";
    const depth = crawlDepthSelect.value;

    if (!key && !proxyUrl) {
      showSettingsMessage("Please enter a Gemini API Key or a Backend Proxy URL.", "error");
      return;
    }

    const autoCrawlToggle = document.getElementById("autoCrawlToggle");
    const autoSubmitNotWorkingToggle = document.getElementById("autoSubmitNotWorkingToggle");
    const autoCrawlVal = autoCrawlToggle ? Boolean(autoCrawlToggle.checked) : false;
    const autoSubmitNwVal = autoSubmitNotWorkingToggle ? Boolean(autoSubmitNotWorkingToggle.checked) : false;

    await chrome.storage.local.set({
      geminiApiKey: key,
      geminiModel: model,
      fallbackModel: fallback,
      backendProxyUrl: proxyUrl,
      backendProxyToken: proxyToken,
      crawlDepth: depth,
      autoCrawl: autoCrawlVal,
      autoSubmitNotWorking: autoSubmitNwVal
    });

    apiKey = key;
    geminiModel = model;
    fallbackModel = fallback;
    backendProxyUrl = proxyUrl;
    backendProxyToken = proxyToken;

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

      // Test Direct API with x-goog-api-key header (never in URL query string)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
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
      // Delegate full crawl & AI extraction to background service worker so closing popup does not abort it
      let activeCrawlUrl = isPortalDetected ? portalTargetUrl : (currentTab ? currentTab.url : "");
      if (!/^https?:\/\//i.test(activeCrawlUrl)) {
        activeCrawlUrl = "http://" + activeCrawlUrl;
      }

      updateProgress(20, "Crawling & Analyzing in Background...", activeCrawlUrl);
      const bgResult = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "crawlAndExtractForPortal",
          targetUrl: activeCrawlUrl
        }, (res) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          resolve(res);
        });
      });

      if (!bgResult || (!bgResult.success && !bgResult.data)) {
        throw new Error((bgResult && bgResult.error) || "Background crawl & extraction failed");
      }

      const extractionResult = {
        data: bgResult.data,
        meta: bgResult.meta || {}
      };
      let extractedJson = extractionResult.data;

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

      await queueManager.init();
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
