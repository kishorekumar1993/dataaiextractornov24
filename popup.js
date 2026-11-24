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

  // Portal Form Banner Elements
  const portalBanner = document.getElementById("portalBanner");
  const portalTargetUrlText = document.getElementById("portalTargetUrlText");
  const quickAutofillBtn = document.getElementById("quickAutofillBtn");

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
      const urlObj = new URL(tab.url);
      siteDomainEl.textContent = urlObj.hostname;
      siteUrlEl.textContent = tab.url;

      // Check if we already have a successfully processed result for this website
      const cached = queueManager.getCompletedResult(tab.url);
      if (cached && cached.data) {
        lastExtractedResult = cached.data;
        renderResults(cached.data, cached.meta || { modelUsed: geminiModel, isFallback: false, retriesUsed: 0, cached: true });
      }

      // Ensure content script is injected
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
      } catch (e) {
        // Content script might already be injected, continue
      }

      // Query content script for initial scan and portal detection
      chrome.tabs.sendMessage(tab.id, { action: "detectPortalForm" }, (portalRes) => {
        if (!chrome.runtime.lastError && portalRes && portalRes.isPortal) {
          isPortalDetected = true;
          portalTargetUrl = portalRes.targetUrl || "";
          portalBanner.classList.remove("hidden");
          portalTargetUrlText.textContent = portalTargetUrl || "(No URL in form yet)";
          startCrawlBtnText.textContent = "⚡ Crawl Target & Autofill Portal";
          if (portalTargetUrl) {
            try {
              const pUrl = new URL(portalTargetUrl.startsWith("http") ? portalTargetUrl : "http://" + portalTargetUrl);
              siteDomainEl.textContent = pUrl.hostname + " (QC Portal Target)";
              siteUrlEl.textContent = portalTargetUrl;
            } catch (e) { }
          }
        } else {
          isPortalDetected = false;
          portalBanner.classList.add("hidden");
          startCrawlBtnText.textContent = "Start Crawl & Analyze";
        }
      });

      chrome.tabs.sendMessage(tab.id, { action: "extractCurrentPageData" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          console.warn("Could not extract initial page data directly:", chrome.runtime.lastError);
          return;
        }

        initialPageData = response.data;
        updatePills(initialPageData.internalLinks);
      });
    } catch (err) {
      console.error("Tab inspection error:", err);
      siteDomainEl.textContent = "Error reading tab";
      siteUrlEl.textContent = err.message;
    }
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
      if (urlRes && urlRes.targetUrl) {
        portalTargetUrl = urlRes.targetUrl.trim();
        portalTargetUrlText.textContent = portalTargetUrl;
      }

      if (!portalTargetUrl) {
        alert("Please enter a website URL in the 'Website Name' field of the portal form first.");
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
              textSnippet: pageResult.textSnippet
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
      if (typeof CrawlerEngine !== "undefined" && CrawlerEngine.applyBusinessTypeEligibilityRule) {
        extractedJson = CrawlerEngine.applyBusinessTypeEligibilityRule(extractedJson);
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
      chrome.runtime.sendMessage({ action: "fetchUrl", url: url }, resolve);
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

    if (abouts.length > 0) addLink(abouts[0]);
    if (contacts.length > 0) addLink(contacts[0]);
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
          chrome.runtime.sendMessage({ action: "fetchUrl", url: url }, resolve);
        });
        if (bgRes && bgRes.success) html = bgRes.text;
      }

      if (!html) return null;

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

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

      const productCount = doc.querySelectorAll('[itemtype*="Product"], .product, .product-item, .product-card, .catalog-item').length;
      const imgCount = doc.querySelectorAll('img[src*="product"], img[alt*="product"], .product img').length;
      const descCount = doc.querySelectorAll('.product-desc, .product-description, [itemprop="description"]').length;

      return {
        title,
        textSnippet: text.slice(0, 5000),
        emails,
        phones,
        productCount,
        imgCount,
        descCount
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

    crawledPages.forEach((p, idx) => {
      pagesText += `--- CRAWLED SUBPAGE ${idx + 1}: [${p.category.toUpperCase()}] ${p.url} ---\n`;
      pagesText += `Title: ${p.title}\n`;
      pagesText += `Content:\n${p.textSnippet}\n\n`;
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
  "numberOfProductDescriptions": "0"
}

CORE RULE - SPECIAL CHARACTER PRESERVATION:
- All special characters (such as "&", "-", "/", "@", "'", ".", "+", "%", "#", etc.) MUST be kept exactly the same as in the original source content.
- DO NOT change special characters into words or expansions:
  * NEVER expand or replace "&" with "and" or "And" (always keep "&" as it is).
  * NEVER expand or replace "@" with "at" (always keep "@" as it is).
  * NEVER remove, replace, or alter hyphens "-", slashes "/", apostrophes "'", dots, or symbols within words or names.
- Special characters MUST ALWAYS be kept AS IT IS.

Field extraction guidelines:
1. "websiteStatus": "Working" ONLY IF the site loaded AND its Business Type is an eligible category from "Manufacturer" to "Wholesaler" (Manufacturer, Industrial Services, Exporter, Trader, Distributer, Supplier, Wholesaler).
   - CRITICAL ELIGIBILITY RULE: If the business type is anything outside Manufacturer to Wholesaler (such as Service Provider, Online Shopping, Restricted Site, Other, Retailer), "websiteStatus" MUST be marked as "Not Working", and state the reason in "notWorkingReason".
   - If the site is down, broken, parked, or under construction, mark accordingly.
2. "notWorkingReason": Empty string "" if working, otherwise specify the exact reason (e.g., "Ineligible Business Type: Service Provider (Only Manufacturer to Wholesaler are eligible)", or DNS/HTTP error).
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
5. "companyName": Complete official legal or operational company name with all abbreviations expanded into their full forms:
   - Mandatory Abbreviation Expansion to Full Form:
     * "Co." / "Co" -> "Company"
     * "Ltd." / "Ltd" -> "Limited"
     * "Pvt." / "Pvt" -> "Private" (e.g., "Pvt. Ltd." -> "Private Limited")
     * "Corp." / "Corp" -> "Corporation"
     * "Inc." / "Inc" -> "Incorporated"
     * "Mfg." / "Mfg" -> "Manufacturing"
     * "Intl." / "Int'l" -> "International"
     * "Tech." / "Tech" -> "Technology"
     * "Grp." / "Grp" -> "Group"
     * "LLC" -> "Limited Liability Company"
     * "LLP" -> "Limited Liability Partnership"
     * Example: "Zhejiang Jiangnan Steel Structure Co., Ltd." MUST be expanded to "Zhejiang Jiangnan Steel Structure Company, Limited".
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
   - You must write the country name in full form.
   - First letter in each word must be capitalized only, NOT all characters (e.g., "China", "United States Of America", "Germany").
   - If the country name is not available directly on the site, check social media links/profiles, or infer it using the city and state name from the address. Locality must be considered for the country name.
   - Special Rule for United Kingdom:
     * For United Kingdom (England, Wales, Scotland, Northern Ireland): If "England" and "United Kingdom" both are mentioned, you must take England as the country name (prioritize the specific constituent country/locality: England, Wales, Scotland, Northern Ireland).
### 7. companyAddress – Complete Address Extraction, Full-Form Expansion and Title Case Normalization

Extract the complete Headquarters (HQ) or Registered Head Office address from the official website and normalize it according to the following mandatory rules.

**A. Address Selection Rules**
1. Always prioritize the Headquarters (HQ) or Registered Head Office address. HQ (Headquarters) address is always first priority.
2. If Contact Us is not found or does not contain an address, you can take the address from the Footer of the website.
3. Select only one address. Never combine multiple branch addresses.
4. Use only information available on the official website.
5. Current Active Address Priority (CRITICAL): Always select the CURRENT active headquarters or operational address. NEVER select former, historical, or previous addresses (e.g., text stating "prior to [date] was located at...", "formerly located at...", "previous address", or "relocated from...").

**B. Universal Abbreviation Expansion (MANDATORY)**
1. Identify and expand all recognizable abbreviations, shortened words, and directional references into their complete standard English full forms:
   - Thoroughfares: "Rd." / "Rd" -> "Road", "St." / "St" -> "Street", "Ave." / "Ave" -> "Avenue", "Blvd." / "Blvd" -> "Boulevard", "Hwy." / "Hwy" -> "Highway", "Dr." / "Dr" -> "Drive", "Ln." / "Ln" -> "Lane"
   - Divisions & Units: "Sec." / "Sec" -> "Section" (e.g., "Sec. 3" -> "Section 3"), "Dist." / "Dist" -> "District", "Prov." / "Prov" -> "Province", "Ind." / "Ind" -> "Industrial", "Bldg." / "Bldg" -> "Building", "Rm." / "Rm" -> "Room", "No." / "No" -> "Number", "Ste." / "Ste" -> "Suite", "Apt." / "Apt" -> "Apartment", "Blk." / "Blk" -> "Block", "Sq." / "Sq" -> "Square", "Ctr." / "Ctr" -> "Center", "Plz." / "Plz" -> "Plaza"
   - Floor Designations: Expand any floor abbreviation (such as "Fl.", "Fl", "F.", "F", or numeric prefixes like "[Number]F", "[Number]f.", "[Number]Fl.") into its complete ordinal/written floor form (e.g., 1F -> 1st Floor, 2F -> 2nd Floor, 3F / 3f. -> 3rd Floor, etc.). Retain any sub-unit hyphenated numbers intact.
2. Apply expansion throughout the entire address, including street names, building names, directional references, administrative divisions, floor designations, and other address components.
3. Expand recognizable abbreviations even when they are attached directly to numbers, provided their meaning is clear from the address context.
4. Use contextual understanding to identify the correct full form. Do not restrict expansion to a predefined abbreviation list.
5. Do not leave recognizable address abbreviations in shortened form when their full meaning is clear.
6. Do not invent expansions for ambiguous identifiers, proper names, alphanumeric coordinate grid designations (such as Wisconsin/rural fire grid coordinates like N173 W21640), or reference codes. Keep numerical grid coordinates intact.

**C. Title Case Formatting (STRICT)**
1. Capitalize only the first letter of each word.
2. All remaining letters must be lowercase.
3. Never convert ordinary address words into ALL CAPITAL LETTERS.
4. Apply Title Case after completing abbreviation expansion.
5. Preserve the intended meaning and correct word boundaries.

**D. Original Address Structure and Punctuation**
1. Preserve the original address sequence and structure.
2. Keep internal commas in their original positions.
3. Special characters, hyphens, slashes, ampersands ("&"), numbers, and symbols within the address MUST be kept exactly the same as shown on the website. Preserve meaningful hyphens, slashes, ampersands (&), numbers, alphanumeric coordinate identifiers (such as fire coordinates or grid numbers), and symbols. Keep alphanumeric grid coordinates and building numbers intact.
4. DO NOT change or expand special characters into words (e.g., NEVER replace "&" with "and", NEVER replace "@" with "at"). Keep special characters always as it is.
5. Do not add artificial linking words such as "in" or "of".
6. Do not add extra commas or remove meaningful internal commas.

**E. Mandatory Cleanup**
1. Remove postal codes and ZIP codes.
2. Remove the country name.
3. Remove the company name if included or prefixed in the address.
4. Remove parentheses, square brackets, and curly brackets.
5. Remove unnecessary trailing punctuation.
6. Do not remove meaningful internal address information.

**F. Final Validation**
Before returning companyAddress:
- Verify that the selected address is the HQ or Registered Head Office.
- Verify that all recognizable abbreviations have been expanded.
- Verify that directional prefixes have been expanded when their meaning is clear, including prefixes attached to numerical identifiers.
- Verify that all expanded words follow Title Case, not ALL CAPS.
- Verify that the original numbers and meaningful punctuation are preserved.
- Verify that postal codes, country names, company names, and brackets are removed.
- Verify that only one complete address is returned.

8. "state": Strictly output ONLY the exact string "Available" or "Not Available" (NEVER output the state name itself):
   - Select "Available" ONLY if an actual State, County, Province, or Prefecture is explicitly present in the address.
   - What Qualifies as State = "Available":
     * Official States & Provinces: Any recognized first-level administrative division of any country worldwide (e.g., States, Provinces, Counties, Prefectures, Cantons, Departments, Federal Territories, or Special Administrative Regions), even when the word "State" or "Province" is not explicitly written after the name.
     * Country Capitals (CRITICAL UNIVERSAL RULE): If the address contains the Country's Capital city (any national capital city of any country worldwide), "state" MUST ALWAYS be marked as "Available" (national capitals hold primary state-level administrative status equivalent to federal capital territories / special municipalities).
   - Disregard State Names in Street Lines:
     * If a state or province name appears solely as part of a street name (e.g., "Pennsylvania Avenue", "Washington Boulevard"), it does not count as the state. Only count it if an actual state, province, or capital division is present in the address location itself.
   - Select "Not Available" ONLY when the address contains strictly a local city, town, or district without any state, province, county, prefecture, or national capital present.
   - DO NOT consider a general City, Town, District, Municipality, Suburb, or Country as a State unless it is an official first-level province/state division or the country's national capital.

9. "city": Strictly output ONLY the exact string "Available" or "Not Available" (NEVER output the city name itself):
   - Select "Available" ONLY if a City, Town, District, or Municipality is explicitly present in the address.
   - Select "Not Available" if no City, Town, District, or Municipality is present.
   - Note: ONLY (Town, District, Municipality) should be considered as City. Do NOT take any suburb, neighborhood, locality, or village as City.

10. "emailId": Primary contact email address.
11. "secondaryEmailId": Alternative email if present, else "".
12. "phoneNumber": Primary contact phone number strictly formatted according to these rules:
    - Take the complete phone number, but ALWAYS REMOVE the international country code for ANY country (e.g., strip +1 for USA/Canada, +44 for UK, +91 for India, +86 for China, +49 for Germany, +33 for France, +81 for Japan, +61 for Australia, +971 for UAE, +65 for Singapore, or ANY other country calling code).
    - Remove all special characters, hyphens, plus signs, brackets, dots, and slashes.
    - Remove all spaces (digits only).
    - Do NOT take toll-free numbers (e.g., numbers starting with 1800, 800, 888, 877, 866, 855, 844, 400).
    - Do NOT take numbers starting with zero. Strip any leading zeros so the phone number never starts with 0.
    - Examples:
      * USA: "+1 (555) 234-5678" -> "5552345678"
      * UK: "+44 20 7946 0958" -> "2079460958"
      * India: "+91 98765 43210" -> "9876543210"
      * China: "+86-573-85127888" -> "57385127888"
      * Domestic with 0: "0573-85127888" -> "57385127888" (leading 0 removed)
    - If no valid non-toll-free phone number exists, return "".
13. "numberOfProducts": String representation of number of products or services offered (e.g. "3").
14. "productImages": String representation of number of product images identified (e.g. "3").
    - CRITICAL IMAGE EXCLUSION RULE (Rule 15): Images related to the following categories are STRICTLY PROHIBITED and MUST NEVER be counted as product images:
      * Porn / Adult Content
      * Medicine
      * Food
      * Weapons
      * Aircraft / Marine
      * Chemicals
      * Alcohol
      * Animals
    - If all images on the website fall under these prohibited categories, "productImages" MUST be "0".
15. "numberOfProductDescriptions": String representation of product descriptions present (e.g. "0").

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
