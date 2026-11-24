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

      // Query content script for initial scan
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

    // UI state
    startCrawlBtn.disabled = true;
    startCrawlBtnText.textContent = "Crawling & Analyzing...";
    progressSection.classList.remove("hidden");
    resultsSection.classList.add("hidden");
    updateProgress(5, "Scanning page DOM...", "Extracting base page content and discovery tree...");

    try {
      // Step 1: Ensure initial page data
      let baseData = initialPageData;
      if (!baseData) {
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

      const extractedJson = extractionResult.data;

      // Save to queue completed map so it persists
      const cleanKey = currentTab.url.toLowerCase();
      queueManager.completedMap[cleanKey] = {
        data: extractedJson,
        meta: extractionResult.meta,
        completedAt: new Date().toISOString()
      };
      await queueManager.saveState();
      updateQueueUI();

      // Step 6: Render results
      updateProgress(100, "Done!", "Intelligence extraction complete.");
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
      startCrawlBtnText.textContent = "Start Crawl & Analyze";
    }
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

      ["script", "style", "noscript", "svg", "canvas", "iframe", "nav", "footer"].forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
      });

      const title = doc.title || "";
      const text = (doc.body ? (doc.body.innerText || doc.body.textContent) : "")
        .replace(/[\r\n]+/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();

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

Field extraction guidelines:
1. "websiteStatus": "Working" if the site loaded and provided business content. If it was down, broken, parked, or under construction, set accordingly.
2. "notWorkingReason": Empty string "" if working, otherwise specify reason.
3. "businessType": e.g. "Manufacturer", "Exporter", "Wholesaler", "Trader", "Service Provider", "Retailer", or combination.
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

7. "companyAddress": Complete address in full form preserving the original template and punctuation:
   - First letter in each word must be capitalized only (Title Case), NOT all the characters.
   - Preserve Original Template and Punctuation:
     * Keep the original address structure, sequence, and internal commas EXACTLY as shown on the website.
     * DO NOT add any extra commas, and DO NOT remove commas from the middle of the address. Put it as it is.
     * DO NOT insert artificial linking words like "in" or "of" that are not present in the original website address.
     * ONLY remove special characters, symbols, and punctuation at the START and END of the address (e.g., remove leading ":", "-", bullets at the beginning, and remove trailing commas, periods, hyphens at the very end).
   - Mandatory Abbreviation Expansion to Full Form:
     * "Rd." / "Rd" -> "Road"
     * "St." / "St" -> "Street"
     * "Ave." / "Ave" -> "Avenue"
     * "Blvd." / "Blvd" -> "Boulevard"
     * "Bldg." / "Bldg" -> "Building"
     * "Dist." / "Dist" -> "District"
     * "Prov." / "Prov" -> "Province"
     * "Ind." / "Ind" -> "Industrial"
     * "Fl." / "Fl" / "F" -> "Floor"
     * "Rm." / "Rm" -> "Room"
     * "No." / "No" -> "Number"
     * "Ste." / "Ste" -> "Suite"
     * "Hwy." / "Hwy" -> "Highway"
     * "Dr." / "Dr" -> "Drive"
     * "Ln." / "Ln" -> "Lane"
   - Cleanup Rules:
     * Remove the postal code / zip code.
     * Remove the country name.
     * Remove the company name if prefixed or included in the address line.
     * Remove brackets (parentheses, square brackets, curly brackets).
     * Priority: Always select the Headquarters (HQ) or Registered Head Office.
     * Select only one address (do NOT combine multiple branches).
     * Example: If website shows "Headquarters: Yashan Rd., Zhapu, Jiaxing City, Zhejiang Prov., 314201, China", output: "Yashan Road, Zhapu, Jiaxing City, Zhejiang Province".

8. "state": Strictly output ONLY the exact string "Available" or "Not Available" (NEVER output the state name itself):
   - Select "Available" ONLY if an actual State, County, Province, or Prefecture is explicitly present in the address.
   - Select "Not Available" if no State, County, Province, or Prefecture is present in the address.
   - CRITICAL RULE: ONLY (County, Province, Prefecture) or an official State can be considered as State.
   - DO NOT consider a City, Town, District, Municipality, Special Municipality, Suburb, or Country as a State. If only a city or district is present in the address without a State/Province/County/Prefecture, "state" MUST be "Not Available".

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
15. "numberOfProductDescriptions": String representation of product descriptions present (e.g. "0").

Return ONLY the raw JSON object. Do not enclose in markdown code blocks like \`\`\`json.`;
  }

  function buildUserPrompt(context) {
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

    // Populate JSON Viewer
    jsonViewer.textContent = JSON.stringify(data, null, 2);
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
