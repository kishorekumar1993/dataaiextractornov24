// Content script for Site Intelligence Crawler & QC Portal Autofill
(() => {
  // Field definitions matching the QC Data Entry Portal Form
  const PORTAL_FIELD_SPECS = [
    {
      key: "websiteUrl",
      labels: ["website name", "website url", "web site", "website"],
      placeholders: ["website name", "enter website", "http"],
      type: "input"
    },
    {
      key: "websiteStatus",
      labels: ["website status", "site status", "status"],
      placeholders: ["website status", "status"],
      type: "select"
    },
    {
      key: "businessType",
      labels: ["business type", "kind of business", "type of business"],
      placeholders: ["kind of business", "business type"],
      type: "select"
    },
    {
      key: "companyProfile",
      labels: ["company profile", "profile"],
      placeholders: ["company profile"],
      type: "select"
    },
    {
      key: "companyName",
      labels: ["company name", "name of company"],
      placeholders: ["company name"],
      type: "input"
    },
    {
      key: "companyAddress",
      labels: ["company address", "address", "registered address"],
      placeholders: ["company address"],
      type: "textarea"
    },
    {
      key: "countryName",
      labels: ["country name", "country"],
      placeholders: ["country"],
      type: "input"
    },
    {
      key: "state",
      labels: ["state", "province", "state/province"],
      placeholders: ["state"],
      type: "select"
    },
    {
      key: "city",
      labels: ["city", "town"],
      placeholders: ["city"],
      type: "select"
    },
    {
      key: "emailId",
      labels: ["email id", "primary email", "email"],
      placeholders: ["email id", "email"],
      type: "input"
    },
    {
      key: "secondaryEmailId",
      labels: ["secondary email id", "secondary email", "alternate email"],
      placeholders: ["secondary email", "secondary email id"],
      type: "input"
    },
    {
      key: "phoneNumber",
      labels: ["phone number", "phone", "contact number"],
      placeholders: ["phone number", "phone"],
      type: "input"
    },
    {
      key: "numberOfProducts",
      labels: ["number of product", "no. of product", "product count", "number of products"],
      placeholders: ["number of product"],
      type: "select"
    },
    {
      key: "productImages",
      labels: ["image product", "image of product", "product image", "product images"],
      placeholders: ["image of product", "image product"],
      type: "select"
    },
    {
      key: "numberOfProductDescriptions",
      labels: ["no. of product description", "desc of product", "product description", "no. of description"],
      placeholders: ["desc of product", "no. of product description"],
      type: "select"
    }
  ];

  // ==========================================
  // 1. Message Listener
  // ==========================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractCurrentPageData") {
      try {
        const pageData = extractPageData();
        sendResponse({ success: true, data: pageData });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === "detectPortalForm") {
      try {
        const detection = detectPortalForm();
        sendResponse({ success: true, ...detection });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === "getPortalTargetUrl") {
      try {
        const detection = detectPortalForm();
        sendResponse({ success: true, targetUrl: detection.targetUrl });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === "autofillPortalForm") {
      try {
        const fillResult = prefillPortalForm(request.data);
        sendResponse({ success: true, ...fillResult });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
  });

  // ==========================================
  // 2. Portal Form Detection Logic
  // ==========================================
  function detectPortalForm() {
    const fieldMap = {};
    let matchedCount = 0;

    for (const spec of PORTAL_FIELD_SPECS) {
      const el = findFieldElement(spec);
      if (el) {
        fieldMap[spec.key] = el;
        matchedCount++;
      }
    }

    // A portal is detected if at least 3 distinct portal fields match
    const isPortal = matchedCount >= 3;
    let targetUrl = "";

    if (fieldMap.websiteUrl) {
      targetUrl = getElementValue(fieldMap.websiteUrl);
    }

    // If websiteUrl wasn't found by spec, search by input near "http" or "Queue URL"
    if (!targetUrl) {
      const queueInput = document.querySelector("input[value*='http'], input[placeholder*='http']");
      if (queueInput) {
        targetUrl = queueInput.value;
        fieldMap.websiteUrl = queueInput;
      }
    }

    // Clean target URL
    if (targetUrl) {
      targetUrl = targetUrl.trim();
      if (!/^https?:\/\//i.test(targetUrl) && targetUrl.includes(".")) {
        targetUrl = "http://" + targetUrl;
      }
    }

    // If portal is detected, ensure floating widget is mounted
    if (isPortal) {
      setupFloatingWidget(targetUrl);
    }

    return {
      isPortal,
      matchedCount,
      targetUrl
    };
  }

  function findFieldElement(spec) {
    // 1. Search by associated labels / text containers
    const allLabels = Array.from(document.querySelectorAll("label, span, div, p, strong, b"));
    for (const lbl of allLabels) {
      const text = (lbl.innerText || lbl.textContent || "").trim().toLowerCase().replace(/[:*]/g, "").trim();
      if (text && spec.labels.some(alias => text === alias || text.startsWith(alias) || text.endsWith(alias))) {
        // A. Check for 'for' attribute
        if (lbl.htmlFor) {
          const target = document.getElementById(lbl.htmlFor);
          if (target && isInputField(target)) return target;
        }

        // B. Check inside the same parent or container
        const container = lbl.closest(".form-group, .field, .form-item, .col, .row, div") || lbl.parentElement;
        if (container) {
          const input = container.querySelector("input, textarea, select, [role='combobox'], [role='listbox']");
          if (input && isInputField(input)) return input;
        }

        // C. Check next element sibling
        let next = lbl.nextElementSibling;
        while (next) {
          if (isInputField(next)) return next;
          const nestedInput = next.querySelector("input, textarea, select, [role='combobox']");
          if (nestedInput) return nestedInput;
          next = next.nextElementSibling;
        }
      }
    }

    // 2. Search by placeholder attribute
    for (const ph of spec.placeholders) {
      const byPlaceholder = document.querySelector(`input[placeholder*='${ph}' i], textarea[placeholder*='${ph}' i]`);
      if (byPlaceholder) return byPlaceholder;
    }

    // 3. Search by name or id attribute
    for (const alias of spec.labels) {
      const cleanAlias = alias.replace(/\s+/g, "");
      const byId = document.getElementById(cleanAlias) || 
                   document.querySelector(`[name*='${cleanAlias}' i], [id*='${cleanAlias}' i], [data-field*='${cleanAlias}' i]`);
      if (byId && isInputField(byId)) return byId;
    }

    return null;
  }

  function isInputField(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || 
           el.getAttribute("role") === "combobox" || el.getAttribute("role") === "listbox" ||
           el.classList.contains("custom-select") || el.classList.contains("dropdown");
  }

  function getElementValue(el) {
    if (!el) return "";
    if (el.tagName.toLowerCase() === "select") {
      return el.options[el.selectedIndex]?.text || el.value || "";
    }
    return el.value || el.innerText || el.textContent || "";
  }

  // ==========================================
  // 3. Form Prefilling Engine
  // ==========================================
  function prefillPortalForm(data) {
    if (!data) return { filledCount: 0, errors: ["No data provided"] };

    const detection = detectPortalForm();
    let filledCount = 0;
    const filledFields = [];
    const errors = [];

    // Map extracted JSON to portal fields
    const fillPlan = [
      { key: "websiteStatus", value: data.websiteStatus || "Working" },
      { key: "businessType", value: data.businessType || "" },
      { key: "companyProfile", value: data.companyProfile || "Available" },
      { key: "companyName", value: data.companyName || "" },
      { key: "companyAddress", value: data.companyAddress || "" },
      { key: "countryName", value: data.countryName || "" },
      { key: "state", value: data.state || "Available" },
      { key: "city", value: data.city || "Available" },
      { key: "emailId", value: data.emailId || "" },
      { key: "secondaryEmailId", value: data.secondaryEmailId || "" },
      { key: "phoneNumber", value: data.phoneNumber || "" },
      { key: "numberOfProducts", value: data.numberOfProducts || "3" },
      { key: "productImages", value: data.productImages || "3" },
      { key: "numberOfProductDescriptions", value: data.numberOfProductDescriptions || "0" }
    ];

    for (const item of fillPlan) {
      const spec = PORTAL_FIELD_SPECS.find(s => s.key === item.key);
      if (!spec) continue;

      const el = findFieldElement(spec);
      if (el) {
        try {
          const success = setFieldValue(el, item.value, spec.type);
          if (success) {
            filledCount++;
            filledFields.push(item.key);
            flashHighlight(el);
          }
        } catch (e) {
          errors.push(`Failed to set ${item.key}: ${e.message}`);
        }
      }
    }

    return {
      filledCount,
      filledFields,
      errors
    };
  }

  function setFieldValue(el, value, preferredType) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();

    // 1. Standard Select Dropdown
    if (tag === "select") {
      return setSelectValue(el, value);
    }

    // 2. Custom Dropdown or Combobox
    if (el.getAttribute("role") === "combobox" || el.classList.contains("dropdown") || preferredType === "select") {
      const customSelectSuccess = setCustomDropdownValue(el, value);
      if (customSelectSuccess) return true;
    }

    // 3. Text Input / Textarea
    return setNativeInputValue(el, value);
  }

  function setNativeInputValue(el, value) {
    const strVal = value === undefined || value === null ? "" : String(value);
    el.focus();

    // React/Vue prototype setter descriptor bypass
    const prototype = Object.getPrototypeOf(el);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, strVal);
    } else {
      el.value = strVal;
    }

    // Dispatch input & change events
    el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
    return true;
  }

  function setSelectValue(selectEl, value) {
    if (!selectEl || !selectEl.options) return false;
    const targetStr = String(value).trim().toLowerCase();
    let matchIdx = -1;

    // 1. Exact match on value or text
    for (let i = 0; i < selectEl.options.length; i++) {
      const opt = selectEl.options[i];
      const optVal = opt.value.trim().toLowerCase();
      const optText = opt.text.trim().toLowerCase();
      if (optVal === targetStr || optText === targetStr) {
        matchIdx = i;
        break;
      }
    }

    // 2. Partial match
    if (matchIdx === -1) {
      for (let i = 0; i < selectEl.options.length; i++) {
        const opt = selectEl.options[i];
        const optVal = opt.value.trim().toLowerCase();
        const optText = opt.text.trim().toLowerCase();
        if ((targetStr && optVal.includes(targetStr)) || (targetStr && optText.includes(targetStr)) ||
            (optVal && targetStr.includes(optVal)) || (optText && targetStr.includes(optText))) {
          matchIdx = i;
          break;
        }
      }
    }

    // 3. Number prefix match for product counts (e.g. "3" -> "3+" or "3 Products")
    if (matchIdx === -1 && /^\d+$/.test(targetStr)) {
      for (let i = 0; i < selectEl.options.length; i++) {
        const opt = selectEl.options[i];
        if (opt.value.trim().startsWith(targetStr) || opt.text.trim().startsWith(targetStr)) {
          matchIdx = i;
          break;
        }
      }
    }

    if (matchIdx !== -1) {
      selectEl.selectedIndex = matchIdx;
      selectEl.value = selectEl.options[matchIdx].value;
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      selectEl.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    return false;
  }

  function setCustomDropdownValue(el, value) {
    const strVal = String(value).trim();
    // Look for hidden input inside parent or container
    const container = el.closest(".dropdown, .select, [class*='select'], [class*='dropdown']") || el.parentElement;
    if (container) {
      const hiddenInput = container.querySelector("input[type='hidden'], input");
      if (hiddenInput && hiddenInput !== el) {
        setNativeInputValue(hiddenInput, strVal);
      }
    }

    // Update visible text node inside dropdown trigger
    const textNode = el.querySelector(".selected-value, .label, span, div") || el;
    if (textNode) {
      textNode.textContent = strVal;
    }

    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function flashHighlight(el) {
    if (!el) return;
    const origTransition = el.style.transition;
    const origOutline = el.style.outline;
    const origBoxShadow = el.style.boxShadow;
    const origBg = el.style.backgroundColor;

    el.style.transition = "all 0.3s ease";
    el.style.outline = "2px solid #10b981";
    el.style.boxShadow = "0 0 10px rgba(16, 185, 129, 0.4)";
    el.style.backgroundColor = "rgba(16, 185, 129, 0.08)";

    setTimeout(() => {
      el.style.outline = origOutline;
      el.style.boxShadow = origBoxShadow;
      el.style.backgroundColor = origBg;
      el.style.transition = origTransition;
    }, 2500);
  }

  // ==========================================
  // 4. On-Page Floating Assistant Widget
  // ==========================================
  function setupFloatingWidget(initialUrl) {
    if (document.getElementById("site-intel-portal-widget")) {
      updateFloatingWidgetTarget(initialUrl);
      return;
    }

    // Create container
    const widget = document.createElement("div");
    widget.id = "site-intel-portal-widget";
    widget.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      width: 320px;
      padding: 12px 14px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 10px;
      backdrop-filter: blur(8px);
      transition: all 0.2s ease;
    `;

    widget.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:8px;">
        <div style="display:flex; align-items:center; gap:6px; font-weight:600; font-size:13px; color:#38bdf8;">
          <span>🕷️</span>
          <span>AI QC Autofill</span>
          <span style="background:rgba(16,185,129,0.15); color:#34d399; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700;">PROVISIONED</span>
        </div>
        <button id="site-intel-close-btn" style="background:none; border:none; color:#64748b; font-size:16px; cursor:pointer; line-height:1; padding:2px;">✕</button>
      </div>

      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="font-size:11px; color:#94a3b8; font-weight:500;">TARGET WEBSITE:</div>
        <div id="site-intel-widget-target" style="font-size:12px; font-weight:600; color:#f8fafc; word-break:break-all; background:#1e293b; padding:6px 8px; border-radius:6px; border:1px solid #334155;">
          ${initialUrl || "Detecting URL from form..."}
        </div>
      </div>

      <div id="site-intel-status-line" style="font-size:11px; color:#94a3b8; display:none;">
        Ready to analyze and fill portal form.
      </div>

      <button id="site-intel-action-btn" style="
        background: #2563eb;
        color: #ffffff;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: background 0.2s ease;
      ">
        <span>⚡</span>
        <span id="site-intel-btn-text">Crawl & Autofill Form</span>
      </button>
    `;

    document.body.appendChild(widget);

    // Event listeners for widget
    const closeBtn = widget.querySelector("#site-intel-close-btn");
    closeBtn.addEventListener("click", () => {
      widget.style.display = "none";
    });

    const actionBtn = widget.querySelector("#site-intel-action-btn");
    actionBtn.addEventListener("mouseenter", () => { actionBtn.style.background = "#1d4ed8"; });
    actionBtn.addEventListener("mouseleave", () => { actionBtn.style.background = "#2563eb"; });
    actionBtn.addEventListener("click", handleWidgetCrawlAndFill);

    // Listen to input changes on Website Name field to update widget live
    const websiteSpec = PORTAL_FIELD_SPECS[0];
    const websiteEl = findFieldElement(websiteSpec);
    if (websiteEl) {
      websiteEl.addEventListener("input", () => {
        updateFloatingWidgetTarget(getElementValue(websiteEl));
      });
      websiteEl.addEventListener("change", () => {
        updateFloatingWidgetTarget(getElementValue(websiteEl));
      });
    }
  }

  function updateFloatingWidgetTarget(url) {
    const targetEl = document.getElementById("site-intel-widget-target");
    if (targetEl) {
      targetEl.textContent = url || "Please enter URL in Website Name field";
    }
  }

  async function handleWidgetCrawlAndFill() {
    const actionBtn = document.getElementById("site-intel-action-btn");
    const btnText = document.getElementById("site-intel-btn-text");
    const statusLine = document.getElementById("site-intel-status-line");

    // Get latest URL from form
    const detection = detectPortalForm();
    let url = detection.targetUrl;

    if (!url) {
      alert("Please enter a valid website URL in the 'Website Name' field first.");
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = "http://" + url;
    }

    // Set UI to loading state
    actionBtn.disabled = true;
    actionBtn.style.opacity = "0.7";
    actionBtn.style.cursor = "not-allowed";
    btnText.textContent = "Crawling & Analyzing...";
    statusLine.style.display = "block";
    statusLine.textContent = "⏳ Fetching website pages...";

    try {
      // Send crawl request to background service worker
      statusLine.textContent = "🤖 Analyzing with Gemini AI...";
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: "crawlAndExtractForPortal",
          targetUrl: url
        }, resolve);
      });

      if (!response || !response.success) {
        throw new Error(response?.error || "Crawl & AI extraction failed");
      }

      statusLine.textContent = "📝 Prefilling portal form fields...";
      const fillResult = prefillPortalForm(response.data);

      btnText.textContent = "✓ Form Filled!";
      actionBtn.style.background = "#10b981";
      statusLine.textContent = `✅ Successfully filled ${fillResult.filledCount} fields!`;

      setTimeout(() => {
        actionBtn.disabled = false;
        actionBtn.style.opacity = "1";
        actionBtn.style.cursor = "pointer";
        actionBtn.style.background = "#2563eb";
        btnText.textContent = "Crawl & Autofill Again";
      }, 3500);

    } catch (err) {
      console.error("Widget crawl error:", err);
      btnText.textContent = "Error";
      actionBtn.style.background = "#ef4444";
      statusLine.textContent = `❌ ${err.message}`;

      setTimeout(() => {
        actionBtn.disabled = false;
        actionBtn.style.opacity = "1";
        actionBtn.style.cursor = "pointer";
        actionBtn.style.background = "#2563eb";
        btnText.textContent = "Crawl & Autofill Form";
      }, 3500);
    }
  }

  // ==========================================
  // 5. Existing Web Extraction Functions
  // ==========================================
  function extractPageData() {
    const origin = window.location.origin;
    const hostname = window.location.hostname;

    // 1. Meta information
    const title = document.title || "";
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || 
                     document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || "";

    // 2. Extract JSON-LD structured data
    const jsonLdData = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const parsed = JSON.parse(script.textContent);
        jsonLdData.push(parsed);
      } catch (e) {}
    });

    // 3. Find all internal links
    const internalLinks = new Map();
    const allLinks = Array.from(document.querySelectorAll("a[href]"));

    for (const a of allLinks) {
      let href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        continue;
      }

      try {
        const resolved = new URL(href, origin);
        if (resolved.origin === origin && !isAssetFile(resolved.pathname)) {
          const cleanUrl = resolved.origin + resolved.pathname;
          const linkText = (a.innerText || "").trim().toLowerCase();
          const pathLower = resolved.pathname.toLowerCase();

          const category = classifyLink(cleanUrl, pathLower, linkText);
          if (!internalLinks.has(cleanUrl)) {
            internalLinks.set(cleanUrl, {
              url: cleanUrl,
              text: (a.innerText || "").trim(),
              category: category
            });
          }
        }
      } catch (e) {}
    }

    // 4. Product heuristics
    const productData = detectProducts();

    // 5. Clean text content
    const cleanText = extractCleanText(document.body);

    // 6. Regex email & phone detection
    const emails = Array.from(new Set(cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []));
    const phones = Array.from(new Set(cleanText.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}/g) || []))
      .filter(p => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15);

    return {
      url: window.location.href,
      origin: origin,
      hostname: hostname,
      title: title,
      metaDescription: metaDesc,
      ogSiteName: ogSiteName,
      jsonLd: jsonLdData,
      internalLinks: Array.from(internalLinks.values()),
      productData: productData,
      cleanText: cleanText.slice(0, 15000),
      detectedEmails: emails.slice(0, 5),
      detectedPhones: phones.slice(0, 5)
    };
  }

  function classifyLink(url, pathname, text) {
    if (pathname === "/" || pathname === "" || text === "home") {
      return "home";
    }
    if (/about|company|profile|who-we-are|introduction|overview|history/i.test(pathname) || 
        /about|company|profile|who we are|our story/i.test(text)) {
      return "about";
    }
    if (/contact|contact-us|reach-us|get-in-touch|support|feedback|location/i.test(pathname) || 
        /contact|reach us|touch with us/i.test(text)) {
      return "contact";
    }
    if (/product|products|item|items|catalog|catalogue|goods|collection|services|solutions|portfolio/i.test(pathname) || 
        /product|item|catalog|our products|services/i.test(text)) {
      return "product";
    }
    return "other";
  }

  function isAssetFile(path) {
    return /\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|pdf|zip|rar|tar|gz|mp4|webm|mp3|wav|woff|woff2|ttf|eot)$/i.test(path);
  }

  function detectProducts() {
    const productSelectors = [
      '[itemtype*="Product"]',
      '.product-item', '.product-card', '.product',
      '.item-card', '.grid-item', '.catalog-item',
      '.woocommerce-loop-product__link'
    ];

    let foundProducts = 0;
    for (const sel of productSelectors) {
      const items = document.querySelectorAll(sel);
      if (items.length > foundProducts) {
        foundProducts = items.length;
      }
    }

    const productImgSelectors = [
      '[itemtype*="Product"] img',
      '.product-item img', '.product-card img', '.product img',
      'img[src*="product"]', 'img[alt*="product"]', 'img[class*="product"]'
    ];
    let productImagesCount = 0;
    for (const sel of productImgSelectors) {
      const imgs = document.querySelectorAll(sel);
      if (imgs.length > productImagesCount) {
        productImagesCount = imgs.length;
      }
    }

    if (productImagesCount === 0 && (window.location.pathname.includes("product") || window.location.pathname.includes("catalog"))) {
      productImagesCount = document.querySelectorAll("main img, .content img, article img").length;
    }

    const descSelectors = [
      '[itemprop="description"]', '.product-description', '.product-desc', '.item-desc', '.short-description'
    ];
    let descCount = 0;
    for (const sel of descSelectors) {
      const descs = document.querySelectorAll(sel);
      if (descs.length > descCount) {
        descCount = descs.length;
      }
    }

    return {
      numberOfProducts: foundProducts,
      productImages: productImagesCount,
      numberOfProductDescriptions: descCount
    };
  }

  function extractCleanText(rootNode) {
    if (!rootNode) return "";
    const clone = rootNode.cloneNode(true);

    const dropTags = ["script", "style", "noscript", "svg", "canvas", "iframe", "template", "nav"];
    dropTags.forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });

    let text = clone.innerText || clone.textContent || "";
    // If there is an explicit footer, ensure its content is preserved
    const footerEl = rootNode.querySelector("footer, [class*='footer' i], [id*='footer' i]");
    if (footerEl) {
      const footerText = (footerEl.innerText || footerEl.textContent || "").trim();
      if (footerText && !text.includes(footerText)) {
        text += "\n\n--- FOOTER (CONTACT / ADDRESS INFO) ---\n" + footerText;
      }
    }
    text = text.replace(/[\r\n]+/g, "\n")
               .replace(/[ \t]+/g, " ")
               .replace(/\n\s*\n/g, "\n\n")
               .trim();
    return text;
  }

  // Auto-detect portal on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => detectPortalForm());
  } else {
    detectPortalForm();
  }
})();
