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

    if (request.action === "setPortalTargetUrl") {
      try {
        const url = request.url;
        const websiteInput = findWebsiteInputElement();
        if (websiteInput) {
          setNativeInputValue(websiteInput, url);
        }
        updateFloatingWidgetTarget(url);
        sendResponse({ success: true, targetUrl: url });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === "autofillPortalForm") {
      try {
        const fillResult = prefillPortalForm(request.data);
        renderWidgetDetails(request.data, request.meta);
        const statusLine = document.getElementById("site-intel-status-line");
        triggerAutoSubmitIfNotWorking(request.data, request.data?.websiteName || "", statusLine);
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
  function isValidUrlOrDomain(str) {
    if (!str || typeof str !== "string") return false;
    const clean = str.trim();
    if (/^\d+$/.test(clean)) return false; // reject pure numbers/IDs like "538611", "538613"
    if (/^https?:\/\//i.test(clean)) return true;
    if (/^www\.[a-z0-9-]+/i.test(clean)) return true;
    if (/[a-z0-9-]+\.(?:com|org|net|co|io|biz|info|us|uk|ca|in|de|cn|jp|fr|au|nl|ru|tw|hk|site|online|tech|co\.uk)\b/i.test(clean)) return true;
    return false;
  }

  function isVisibleTextInput(el) {
    if (!el || el.tagName.toLowerCase() !== "input") return false;
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "hidden" || type === "button" || type === "submit" || type === "checkbox" || type === "radio" || type === "image" || type === "file") {
      return false;
    }
    const val = (el.value || "").trim();
    if (/^\d+$/.test(val)) return false; // Pure number like 538619 is an ID, NEVER a website URL!
    const name = (el.getAttribute("name") || "").toLowerCase();
    const id = (el.getAttribute("id") || "").toLowerCase();
    if (name.endsWith("_id") || name === "id" || id.endsWith("_id") || id === "id") {
      return false;
    }
    return true;
  }

  // Cache for findWebsiteInputElement to avoid repeated expensive DOM queries
  let _cachedWebsiteInput = null;
  let _cacheTimestamp = 0;
  const CACHE_TTL_MS = 5000; // Re-query at most once every 5s

  function invalidateWebsiteInputCache() {
    _cachedWebsiteInput = null;
    _cacheTimestamp = 0;
  }

  function findWebsiteInputElement() {
    const now = Date.now();
    // Return cached element if still in DOM and cache is fresh
    if (_cachedWebsiteInput && document.contains(_cachedWebsiteInput) && (now - _cacheTimestamp) < CACHE_TTL_MS) {
      return _cachedWebsiteInput;
    }

    // Never inspect inputs inside our own floating widget
    const inputs = Array.from(
      document.querySelectorAll(
        "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='checkbox']):not([type='radio']):not([type='file'])"
      )
    ).filter(el => {
      // In browser, check layout & visibility; in Node test runner fallback safely
      const hasBounding = typeof el.getBoundingClientRect === "function";
      const rect = hasBounding ? el.getBoundingClientRect() : { width: 100, height: 30 };
      const style = (typeof window !== "undefined" && typeof window.getComputedStyle === "function" && el.ownerDocument && el.ownerDocument.defaultView)
        ? window.getComputedStyle(el)
        : { display: "block", visibility: "visible" };

      return (
        ((rect.width > 0 && rect.height > 0) || !hasBounding) &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !el.disabled &&
        !el.closest("#site-intel-portal-widget")
      );
    });

    // Strict URL validation
    const isWebsiteUrl = value => {
      if (!value || typeof value !== "string" || /^\d+$/.test(value.trim())) return false;

      try {
        const normalized = /^https?:\/\//i.test(value.trim())
          ? value.trim()
          : "https://" + value.trim();

        const url = new URL(normalized);

        return (
          ["http:", "https:"].includes(url.protocol) &&
          url.hostname.includes(".") &&
          !/^\d+$/.test(url.hostname)
        );
      } catch {
        return false;
      }
    };

    // PRIORITY 1: Exact Website Name / Website URL label
    const labels = Array.from(
      document.querySelectorAll("label, span, p, strong, b, div")
    );

    for (const label of labels) {
      const text = (label.innerText || label.textContent || "")
        .trim()
        .toLowerCase()
        .replace(/[:*]/g, "")
        .trim();

      const isWebsiteLabel = ["website name", "website url", "web site name", "web site url", "website"].some(alias =>
        text === alias || text.startsWith(alias) || text.includes(alias)
      );
      if (!isWebsiteLabel) continue;

      if (label.htmlFor) {
        const target = document.getElementById(label.htmlFor);
        if (inputs.includes(target)) {
          _cachedWebsiteInput = target;
          _cacheTimestamp = Date.now();
          return target;
        }
      }

      const container = label.closest(
        ".form-group, .form-field, .form-item, .input-group, .col"
      ) || label.parentElement;

      if (container) {
        const candidate = Array.from(
          container.querySelectorAll("input")
        ).find(el => inputs.includes(el));

        if (candidate) {
          _cachedWebsiteInput = candidate;
          _cacheTimestamp = Date.now();
          return candidate;
        }
      }
    }

    // PRIORITY 2: Website-specific placeholder
    const placeholderMatch = inputs.find(el => {
      const ph = (el.placeholder || "").toLowerCase();
      return ph.includes("website") || ph.includes("enter website");
    });

    if (placeholderMatch) {
      _cachedWebsiteInput = placeholderMatch;
      _cacheTimestamp = Date.now();
      return placeholderMatch;
    }

    // PRIORITY 3: Input with website-specific name or ID
    const namedMatch = inputs.find(el => {
      const name = (el.name || "").toLowerCase();
      const id = (el.id || "").toLowerCase();

      return (
        (name.includes("website") || id.includes("website")) &&
        !name.endsWith("_id") &&
        !id.endsWith("_id")
      );
    });

    if (namedMatch) {
      _cachedWebsiteInput = namedMatch;
      _cacheTimestamp = Date.now();
      return namedMatch;
    }

    // PRIORITY 4: Check input immediately adjacent to "click here" button (on cpworkportal.online)
    const clickHereBtn = Array.from(document.querySelectorAll("button, a, input[type='button'], span, div")).find(el => {
      const t = (el.innerText || el.textContent || el.getAttribute("value") || "").trim().toLowerCase();
      return t === "click here";
    });
    if (clickHereBtn) {
      const container = clickHereBtn.closest(".input-group, .form-group, .field, .col, .row, div") || clickHereBtn.parentElement;
      if (container) {
        const candidate = Array.from(container.querySelectorAll("input")).find(el => inputs.includes(el));
        if (candidate) {
          _cachedWebsiteInput = candidate;
          _cacheTimestamp = Date.now();
          return candidate;
        }
      }
    }

    // PRIORITY 5: Existing valid URL as last resort
    const result = inputs.find(el => isWebsiteUrl(el.value)) || null;
    _cachedWebsiteInput = result;
    _cacheTimestamp = Date.now();
    return result;
  }

  function detectPortalForm() {
    const fieldMap = {};
    let matchedCount = 0;

    for (const spec of PORTAL_FIELD_SPECS) {
      if (spec.key === "websiteUrl") continue;
      const el = findFieldElement(spec);
      if (el) {
        fieldMap[spec.key] = el;
        matchedCount++;
      }
    }

    // Dedicated detection for website URL input
    const websiteInput = findWebsiteInputElement();
    let targetUrl = "";
    if (websiteInput) {
      fieldMap.websiteUrl = websiteInput;
      matchedCount++;
      const val = getElementValue(websiteInput);
      if (isValidUrlOrDomain(val)) {
        targetUrl = val.trim();
      }
    }

    // Fallback: If targetUrl still not found or purely numeric, search inputs for validated URL
    if (!targetUrl || /^\d+$/.test(targetUrl)) {
      const allTextInputs = Array.from(document.querySelectorAll("input:not([type='hidden'])"));
      for (const inp of allTextInputs) {
        if (isValidUrlOrDomain(inp.value)) {
          targetUrl = inp.value.trim();
          fieldMap.websiteUrl = inp;
          break;
        }
      }
    }

    // A portal is detected if at least 3 distinct portal fields match
    const isPortal = matchedCount >= 3;

    // Clean target URL
    if (targetUrl) {
      targetUrl = targetUrl.trim();
      if (!/^https?:\/\//i.test(targetUrl) && targetUrl.includes(".")) {
        targetUrl = "http://" + targetUrl;
      }
    }
    if (!isValidUrlOrDomain(targetUrl)) {
      targetUrl = "";
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
  // Business Type Eligibility & Portal Normalization (Manufacturer to Wholesaler only are Working)
  // ==========================================
  const PORTAL_BUSINESS_TYPES = [
    "Manufacturer",
    "Industrial Services",
    "Exporter",
    "Trader",
    "Distributer",
    "Supplier",
    "Wholesaler",
    "Service Provider",
    "Online Shopping",
    "Restricted Site",
    "Other"
  ];

  const ELIGIBLE_WORKING_BUSINESS_TYPES = [
    "manufacturer",
    "industrial services",
    "exporter",
    "trader",
    "distributer",
    "distributor",
    "supplier",
    "wholesaler"
  ];

  function normalizeBusinessType(raw) {
    if (!raw) return "Other";
    const str = String(raw).trim().toLowerCase();

    // Check exact portal match first
    const exact = PORTAL_BUSINESS_TYPES.find(p => p.toLowerCase() === str);
    if (exact) return exact;

    // Semantic normalization to official portal dropdown options:
    if (str.includes("manufactur")) return "Manufacturer";
    if (str.includes("industrial service") || str.includes("industrial")) return "Industrial Services";
    if (str.includes("export")) return "Exporter";
    if (str.includes("trade") || str.includes("trading")) return "Trader";
    if (str.includes("distribut")) return "Distributer";
    if (str.includes("suppl")) return "Supplier";
    if (str.includes("wholesale")) return "Wholesaler";

    // Ineligible categories (marked Not Working):
    if (str.includes("retail") || str.includes("shopping") || str.includes("store") || str.includes("shop") || str.includes("ecommerce") || str.includes("e-commerce") || str.includes("marketplace")) {
      return "Online Shopping";
    }
    if (str.includes("restrict") || str.includes("blocked") || str.includes("prohibit")) {
      return "Restricted Site";
    }
    if (str.includes("service")) {
      return "Service Provider";
    }
    return "Other";
  }

  function isEligibleWorkingBusinessType(businessType) {
    if (!businessType) return false;
    const b = String(businessType).toLowerCase().trim();
    return ELIGIBLE_WORKING_BUSINESS_TYPES.some(eligible => b.includes(eligible));
  }

  const ALLOWED_COUNTRIES = new Set([
    "united states of america", "taiwan", "england", "canada", "china",
    "united kingdom", "australia", "malaysia", "india", "south africa",
    "new zealand", "ireland", "thailand",
    "south korea", "singapore", "hong kong", "pakistan",
    "united arab emirates", "kenya"
  ]);

  function applyBusinessTypeEligibility(data) {
    if (!data) return data;
    const rawType = String(data.businessType || "").trim();
    const alreadyNotWorking = String(data.websiteStatus || "").trim().toLowerCase() === "not working";
    if (!alreadyNotWorking && !isEligibleWorkingBusinessType(rawType)) {
      data.websiteStatus = "Not Working";
      const reason = `Ineligible Business Type: "${rawType || 'Other'}". Only businesses from Manufacturer to Wholesaler (Manufacturer, Industrial Services, Exporter, Trader, Distributer, Supplier, Wholesaler) are eligible Working sites; all other types are marked Not Working.`;
      data.notWorkingReason = reason;
      data.nonWorkingReason = reason;
    }
    const rawCountry = String(data.countryName || "").trim();
    if (String(data.websiteStatus || "").trim().toLowerCase() === "working" && rawCountry && rawCountry.toLowerCase() !== "not available") {
      const normCountry = (typeof GeminiClient !== "undefined" && GeminiClient.normalizeCountryName)
        ? GeminiClient.normalizeCountryName(rawCountry)
        : rawCountry;
      if (!ALLOWED_COUNTRIES.has(normCountry.toLowerCase())) {
        const reason = `Unsupported Country: "${normCountry}" is not in the allowed countries list.`;
        data.websiteStatus = "Not Working";
        data.notWorkingReason = reason;
        data.nonWorkingReason = reason;
      }
    }
    data.businessType = normalizeBusinessType(rawType);
    return data;
  }

  function prefillPortalForm(data) {
    if (!data) return { filledCount: 0, errors: ["No data provided"] };
    applyBusinessTypeEligibility(data);

    const statusLower = String(data.websiteStatus || "").trim().toLowerCase();
    const isNotWorking = statusLower === "not working" || statusLower === "redirect site";
    if (isNotWorking) {
      data.websiteStatus = "Not Working";
      // When site is Not Working, empty all other extracted items
      data.businessType = "";
      data.companyProfile = "";
      data.companyName = "";
      data.companyAddress = "";
      data.countryName = "";
      data.state = "";
      data.city = "";
      data.emailId = "";
      data.secondaryEmailId = "";
      data.phoneNumber = "";
      data.numberOfProducts = "";
      data.productImages = "";
      data.numberOfProductDescriptions = "";
    }

    let filledCount = 0;
    const filledFields = [];
    const errors = [];

    function normalizeCountryName(country) {
      if (!country) return "";
      if (typeof GeminiClient !== "undefined" && typeof GeminiClient.normalizeCountryName === "function") {
        return GeminiClient.normalizeCountryName(country);
      }
      const c = String(country).trim();
      const aliases = {
        "usa": "United States Of America", "u.s.a.": "United States Of America", "u.s.a": "United States Of America",
        "u.s.": "United States Of America", "u.s": "United States Of America", "us": "United States Of America",
        "united states": "United States Of America", "united states of america": "United States Of America",
        "uae": "United Arab Emirates", "u.a.e.": "United Arab Emirates", "united arab emirates": "United Arab Emirates",
        "uk": "United Kingdom", "u.k.": "United Kingdom", "great britain": "United Kingdom",
        "ksa": "Saudi Arabia", "k.s.a.": "Saudi Arabia",
        "prc": "China", "p.r.c.": "China", "p.r. china": "China",
        "roc": "Taiwan", "r.o.c.": "Taiwan", "chinese taipei": "Taiwan",
        "rok": "South Korea", "republic of korea": "South Korea", "korea": "South Korea",
        "czechia": "Czech Republic", "holland": "Netherlands", "turkiye": "Turkey", "türkiye": "Turkey",
        "russian federation": "Russia", "viet nam": "Vietnam", "hong kong sar": "Hong Kong"
      };
      return aliases[c.toLowerCase()] || c;
    }

    function resolveProductCountDefault(val) {
      if (val === undefined || val === null || val === "" || val === "Not Available") {
        return "3";
      }
      const str = String(val).trim().toLowerCase();
      if (str === "one" || str === "1") return "1";
      if (str === "two" || str === "2") return "2";
      if (str === "0") return "0";
      return "3";
    }

    // Map extracted JSON to portal fields (if Not Working, mark Not Working and empty all other fields)
    const fillPlan = isNotWorking
      ? [
        { key: "websiteStatus", value: "Not Working" },
        { key: "businessType", value: "" },
        { key: "companyProfile", value: "" },
        { key: "companyName", value: "" },
        { key: "companyAddress", value: "" },
        { key: "countryName", value: "" },
        { key: "state", value: "" },
        { key: "city", value: "" },
        { key: "emailId", value: "" },
        { key: "secondaryEmailId", value: "" },
        { key: "phoneNumber", value: "" },
        { key: "numberOfProducts", value: "" },
        { key: "productImages", value: "" },
        { key: "numberOfProductDescriptions", value: "" }
      ]
      : [
        { key: "websiteStatus", value: data.websiteStatus || "Working" },
        { key: "businessType", value: data.businessType || "" },
        { key: "companyProfile", value: data.companyProfile || "Available" },
        { key: "companyName", value: (data.companyName || "").trim() },
        { key: "companyAddress", value: data.companyAddress || "" },
        { key: "countryName", value: normalizeCountryName(data.countryName || "") },
        { key: "state", value: data.state || "Available" },
        { key: "city", value: data.city || "Available" },
        { key: "emailId", value: data.emailId || "" },
        { key: "secondaryEmailId", value: data.secondaryEmailId || "" },
        { key: "phoneNumber", value: data.phoneNumber || "" },
        { key: "numberOfProducts", value: resolveProductCountDefault(data.numberOfProducts) },
        { key: "productImages", value: resolveProductCountDefault(data.productImages) },
        { key: "numberOfProductDescriptions", value: resolveProductCountDefault(data.numberOfProductDescriptions) }
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
    const targetStr = String(value === undefined || value === null ? "" : value).trim().toLowerCase();

    // If clearing/emptying a select (e.g. Not Working), reset to empty/placeholder option
    if (targetStr === "") {
      let emptyIdx = 0;
      for (let i = 0; i < selectEl.options.length; i++) {
        if (selectEl.options[i].value.trim() === "") {
          emptyIdx = i;
          break;
        }
      }
      selectEl.selectedIndex = emptyIdx;
      selectEl.value = selectEl.options[emptyIdx] ? selectEl.options[emptyIdx].value : "";
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      selectEl.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

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

    // 4. Synonym / alias matching for portal options
    if (matchIdx === -1) {
      const aliases = {
        "distributor": ["distributer"],
        "distributer": ["distributor"],
        "retailer": ["online shopping", "other"],
        "retail": ["online shopping", "other"],
        "ecommerce": ["online shopping"],
        "e-commerce": ["online shopping"],
        "shopping": ["online shopping"],
        "marketplace": ["online shopping", "other"],
        "service": ["service provider"],
        "services": ["service provider"],
        "consulting": ["service provider"]
      };

      const mappedList = aliases[targetStr] || [];
      for (const mapped of mappedList) {
        for (let i = 0; i < selectEl.options.length; i++) {
          const optText = selectEl.options[i].text.trim().toLowerCase();
          const optVal = selectEl.options[i].value.trim().toLowerCase();
          if (optText.includes(mapped) || optVal.includes(mapped)) {
            matchIdx = i;
            break;
          }
        }
        if (matchIdx !== -1) break;
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
  let lastWidgetData = null;

  function setupFloatingWidget(initialUrl) {
    let currentTargetUrl = isValidUrlOrDomain(initialUrl) ? initialUrl.trim() : "";
    const currentWebEl = findWebsiteInputElement();
    if (currentWebEl) {
      const v = getElementValue(currentWebEl);
      if (isValidUrlOrDomain(v)) {
        currentTargetUrl = v.trim();
      }
    }

    // Reuse existing widget if already mounted in DOM to prevent tearing down UI
    const existingWidget = document.getElementById("site-intel-portal-widget");
    if (existingWidget) {
      if (currentTargetUrl) {
        updateFloatingWidgetTarget(currentTargetUrl);
      }
      return existingWidget;
    }

    const existingLauncher = document.getElementById("site-intel-launcher-btn");
    if (existingLauncher) {
      existingLauncher.remove();
    }

    // Always clear old bottom position from localStorage
    try {
      localStorage.removeItem("site_intel_widget_pos");
    } catch (_) { }

    // Default position: Top-Right (top: 15px, right: 20px, bottom: auto !important)
    const defaultTop = "15px";
    const defaultRight = "20px";

    // Create container
    const widget = document.createElement("div");
    widget.id = "site-intel-portal-widget";
    widget.style.cssText = `
      position: fixed !important;
      top: ${defaultTop} !important;
      right: ${defaultRight} !important;
      left: auto !important;
      bottom: auto !important;
      z-index: 999999 !important;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.6), 0 8px 12px -6px rgba(0, 0, 0, 0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      width: 360px;
      max-height: 440px !important;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(8px);
      overflow: hidden;
      user-select: none;
    `;

    widget.innerHTML = `
      <!-- Header (Draggable) -->
      <div id="site-intel-widget-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding:10px 14px; background:#1e293b; cursor:grab; user-select:none;">
        <div style="display:flex; align-items:center; gap:6px; font-weight:600; font-size:13px; color:#38bdf8; pointer-events:none;">
          <span>🕷️</span>
          <span>AI QC Autofill</span>
          <span style="background:rgba(16,185,129,0.15); color:#34d399; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700;">PROVISIONED</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <!-- Move / Switch Corner Button -->
          <button id="site-intel-dock-btn" title="Move to Other Corner (Top-Right / Top-Left / Bottom-Left)" style="background:none; border:none; color:#94a3b8; font-size:13px; cursor:pointer; line-height:1; padding:2px 4px; border-radius:4px;">↔️</button>
          <!-- Minimize Button -->
          <button id="site-intel-min-btn" title="Minimize / Expand" style="background:none; border:none; color:#94a3b8; font-size:14px; cursor:pointer; line-height:1; padding:2px 4px; border-radius:4px;">—</button>
          <!-- Close Button -->
          <button id="site-intel-close-btn" title="Hide Widget (Re-open with pill)" style="background:none; border:none; color:#94a3b8; font-size:15px; cursor:pointer; line-height:1; padding:2px 4px; border-radius:4px;">✕</button>
        </div>
      </div>

      <!-- Widget Body -->
      <div id="site-intel-widget-body" style="padding:12px 14px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; max-height:calc(85vh - 45px);">
        <!-- Target Site Row -->
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; color:#94a3b8; font-weight:600; letter-spacing:0.3px;">TARGET WEBSITE:</span>
            <button id="site-intel-edit-btn" style="background:none; border:none; color:#38bdf8; font-size:11px; cursor:pointer; padding:0; text-decoration:underline;">✏️ Edit / Load URL</button>
          </div>
          <div id="site-intel-widget-target" style="font-size:12px; font-weight:600; color:#f8fafc; word-break:break-all; background:#1e293b; padding:6px 10px; border-radius:6px; border:1px solid #334155;">
            ${currentTargetUrl || "Detecting URL from form..."}
          </div>
          <!-- Manual URL Inline Input -->
          <div id="site-intel-manual-box" style="display:none; gap:6px; margin-top:4px;">
            <input type="text" id="site-intel-manual-input" placeholder="Paste or type URL (e.g. http://...)" style="flex:1; background:#0f172a; border:1px solid #38bdf8; border-radius:4px; color:#fff; font-size:11px; padding:5px 8px; outline:none;" />
            <button id="site-intel-manual-load-btn" style="background:#2563eb; color:#fff; border:none; border-radius:4px; font-size:11px; font-weight:600; padding:5px 10px; cursor:pointer;">Load</button>
          </div>
        </div>

        <!-- Status Line -->
        <div id="site-intel-status-line" style="font-size:12px; color:#94a3b8; display:none; padding:4px 0;">
          Ready to analyze and fill portal form.
        </div>

        <!-- Automation Toggles -->
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:#1e293b; padding:6px 10px; border-radius:6px; border:1px solid #334155; font-size:11px;">
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer; color:#cbd5e1;">
            <input type="checkbox" id="site-intel-auto-crawl-chk" style="accent-color:#38bdf8; cursor:pointer; margin:0;" />
            <span>Auto Crawl</span>
          </label>
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer; color:#cbd5e1;">
            <input type="checkbox" id="site-intel-auto-submit-nw-chk" style="accent-color:#10b981; cursor:pointer; margin:0;" />
            <span>Auto Submit (Not Working)</span>
          </label>
        </div>

        <!-- Main Action Button -->
        <button id="site-intel-action-btn" style="
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 9px 12px;
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

        <!-- Extracted Details Section (Full details view matching popup) -->
        <div id="site-intel-details-section" style="display:none; flex-direction:column; gap:8px; border-top:1px solid #334155; padding-top:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; font-weight:700; color:#38bdf8; letter-spacing:0.3px;">📊 EXTRACTED CORPORATE DETAILS</span>
            <button id="site-intel-copy-btn" title="Copy JSON" style="background:#1e293b; color:#94a3b8; border:1px solid #334155; border-radius:4px; font-size:11px; padding:3px 8px; cursor:pointer;">📋 Copy JSON</button>
          </div>

          <!-- Badges -->
          <div id="site-intel-summary-badges" style="display:flex; gap:6px; flex-wrap:wrap; font-size:11px;">
            <span id="site-intel-badge-status" style="background:rgba(16,185,129,0.15); color:#34d399; padding:2px 7px; border-radius:4px; font-weight:600;">Status: Working</span>
            <span id="site-intel-badge-type" style="background:#1e293b; color:#cbd5e1; padding:2px 7px; border-radius:4px; border:1px solid #334155;">Manufacturer</span>
            <span id="site-intel-badge-engine" style="background:#1e293b; color:#60a5fa; padding:2px 7px; border-radius:4px; border:1px solid #334155;">gemini-3.5-flash-lite</span>
          </div>

          <!-- Key-Value Table showing ALL 15 fields -->
          <div style="max-height:240px; overflow-y:auto; border:1px solid #334155; border-radius:6px; background:#020617;">
            <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left;">
              <tbody id="site-intel-table-body">
                <!-- Dynamically populated rows -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    // Draggable Implementation on Header
    const header = widget.querySelector("#site-intel-widget-header");
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let widgetStartLeft = 0;
    let widgetStartTop = 0;

    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      isDragging = true;
      header.style.cursor = "grabbing";

      const rect = widget.getBoundingClientRect();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      widgetStartLeft = rect.left;
      widgetStartTop = rect.top;

      widget.style.right = "auto";
      widget.style.bottom = "auto";
      widget.style.left = `${widgetStartLeft}px`;
      widget.style.top = `${widgetStartTop}px`;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      let newLeft = widgetStartLeft + dx;
      let newTop = widgetStartTop + dy;

      const maxLeft = Math.max(10, window.innerWidth - widget.offsetWidth - 10);
      const maxTop = Math.max(10, window.innerHeight - widget.offsetHeight - 80);
      newLeft = Math.max(10, Math.min(maxLeft, newLeft));
      newTop = Math.max(10, Math.min(maxTop, newTop));

      widget.style.left = `${newLeft}px`;
      widget.style.top = `${newTop}px`;
      widget.style.bottom = "auto";
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = "grab";
      }
    });

    // Corner dock toggle button (Cycles strictly between Top-Right -> Top-Left -> Upper-Right, NEVER Bottom!)
    const dockBtn = widget.querySelector("#site-intel-dock-btn");
    const corners = [
      { top: "15px", right: "20px", left: "auto", bottom: "auto" },   // Top-Right
      { top: "15px", left: "240px", right: "auto", bottom: "auto" },  // Top-Left (beside portal title)
      { top: "70px", right: "20px", left: "auto", bottom: "auto" }    // Upper-Right
    ];
    let currentCornerIdx = 0;
    dockBtn.addEventListener("click", () => {
      currentCornerIdx = (currentCornerIdx + 1) % corners.length;
      const c = corners[currentCornerIdx];
      widget.style.top = c.top;
      widget.style.right = c.right;
      widget.style.left = c.left;
      widget.style.bottom = "auto";
    });

    // Floating launcher button to restore widget when closed (Always placed at Top-Right, NEVER Bottom!)
    let launcher = document.getElementById("site-intel-launcher-btn");
    if (!launcher) {
      launcher = document.createElement("button");
      launcher.id = "site-intel-launcher-btn";
      launcher.title = "Open AI QC Autofill Widget";
      launcher.innerHTML = "🕷️ <span style='font-size:12px; font-weight:600;'>AI QC</span>";
      launcher.style.cssText = `
        position: fixed !important;
        top: 15px !important;
        right: 20px !important;
        bottom: auto !important;
        left: auto !important;
        z-index: 999998 !important;
        background: #0f172a;
        color: #38bdf8;
        border: 1px solid #334155;
        border-radius: 20px;
        padding: 6px 12px;
        display: none;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
      `;
      launcher.addEventListener("click", () => {
        widget.style.display = "flex";
        launcher.style.display = "none";
      });
      document.body.appendChild(launcher);
    }

    // Event listeners
    const closeBtn = widget.querySelector("#site-intel-close-btn");
    closeBtn.addEventListener("click", () => {
      widget.style.display = "none";
      launcher.style.display = "flex";
    });

    const minBtn = widget.querySelector("#site-intel-min-btn");
    const widgetBody = widget.querySelector("#site-intel-widget-body");
    let isMinimized = false;
    minBtn.addEventListener("click", () => {
      isMinimized = !isMinimized;
      if (isMinimized) {
        widgetBody.style.display = "none";
        minBtn.textContent = "+";
        widget.style.width = "auto";
        widget.style.maxHeight = "42px";
      } else {
        widgetBody.style.display = "flex";
        minBtn.textContent = "—";
        widget.style.width = "360px";
        widget.style.maxHeight = "440px";
      }
    });

    const actionBtn = widget.querySelector("#site-intel-action-btn");
    actionBtn.addEventListener("mouseenter", () => { actionBtn.style.background = "#1d4ed8"; });
    actionBtn.addEventListener("mouseleave", () => { actionBtn.style.background = "#2563eb"; });
    actionBtn.addEventListener("click", handleWidgetCrawlAndFill);

    // Automation toggles (synced globally via chrome.storage.local across all portal tabs)
    const autoCrawlChk = widget.querySelector("#site-intel-auto-crawl-chk");
    const autoSubmitNwChk = widget.querySelector("#site-intel-auto-submit-nw-chk");

    const syncCheckboxesFromGlobals = () => {
      if (autoCrawlChk) autoCrawlChk.checked = globalAutoCrawl;
      if (autoSubmitNwChk) autoSubmitNwChk.checked = globalAutoSubmitNotWorking;
    };

    // Load global settings from chrome.storage.local
    loadGlobalAutomationSettings().then(() => {
      syncCheckboxesFromGlobals();
      if (globalAutoCrawl) {
        const targetEl = document.getElementById("site-intel-widget-target");
        const liveTarget = targetEl ? (targetEl.innerText || targetEl.textContent || "").trim() : "";
        const urlToCrawl = isValidUrlOrDomain(liveTarget) ? liveTarget : currentTargetUrl;
        if (isValidUrlOrDomain(urlToCrawl)) {
          scheduleAutoCrawl(urlToCrawl);
        }
      }
    });

    // Sync live if changed from popup settings or another tab (register once)
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged && (typeof window === "undefined" || !window.__siteIntelStorageListenerAttached)) {
      if (typeof window !== "undefined") window.__siteIntelStorageListenerAttached = true;
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (changes.autoCrawl) {
          globalAutoCrawl = Boolean(changes.autoCrawl.newValue);
          try { localStorage.setItem("site_intel_auto_crawl", globalAutoCrawl ? "true" : "false"); } catch (_) { }
        }
        if (changes.autoSubmitNotWorking) {
          globalAutoSubmitNotWorking = Boolean(changes.autoSubmitNotWorking.newValue);
          try { localStorage.setItem("site_intel_auto_submit_not_working", globalAutoSubmitNotWorking ? "true" : "false"); } catch (_) { }
        }
        syncCheckboxesFromGlobals();
        if (globalAutoCrawl) {
          const targetEl = document.getElementById("site-intel-widget-target");
          const liveTarget = targetEl ? (targetEl.innerText || targetEl.textContent || "").trim() : "";
          if (isValidUrlOrDomain(liveTarget)) {
            scheduleAutoCrawl(liveTarget);
          }
        }
      });
    }

    if (autoCrawlChk) {
      autoCrawlChk.checked = getAutoCrawlEnabled();
      autoCrawlChk.addEventListener("change", () => {
        globalAutoCrawl = Boolean(autoCrawlChk.checked);
        try { localStorage.setItem("site_intel_auto_crawl", globalAutoCrawl ? "true" : "false"); } catch (_) { }
        if (isExtensionContextValid() && chrome.storage && chrome.storage.local) {
          try { chrome.storage.local.set({ autoCrawl: globalAutoCrawl }); } catch (_) { }
        }
        if (globalAutoCrawl) {
          const targetEl = document.getElementById("site-intel-widget-target");
          const displayed = targetEl ? (targetEl.innerText || targetEl.textContent || "").trim() : "";
          if (isValidUrlOrDomain(displayed)) {
            scheduleAutoCrawl(displayed);
          }
        } else if (autoCrawlTimer) {
          clearTimeout(autoCrawlTimer);
          autoCrawlTimer = null;
        }
      });
    }
    if (autoSubmitNwChk) {
      autoSubmitNwChk.checked = getAutoSubmitNotWorkingEnabled();
      autoSubmitNwChk.addEventListener("change", () => {
        globalAutoSubmitNotWorking = Boolean(autoSubmitNwChk.checked);
        try { localStorage.setItem("site_intel_auto_submit_not_working", globalAutoSubmitNotWorking ? "true" : "false"); } catch (_) { }
        if (isExtensionContextValid() && chrome.storage && chrome.storage.local) {
          try { chrome.storage.local.set({ autoSubmitNotWorking: globalAutoSubmitNotWorking }); } catch (_) { }
        }
      });
    }

    const copyBtn = widget.querySelector("#site-intel-copy-btn");
    copyBtn.addEventListener("click", () => {
      if (!lastWidgetData) return;
      navigator.clipboard.writeText(JSON.stringify(lastWidgetData, null, 2)).then(() => {
        copyBtn.textContent = "✓ Copied!";
        setTimeout(() => { copyBtn.textContent = "📋 Copy JSON"; }, 2000);
      });
    });

    // Manual Edit / Load URL event listeners
    const editBtn = widget.querySelector("#site-intel-edit-btn");
    const manualBox = widget.querySelector("#site-intel-manual-box");
    const manualInput = widget.querySelector("#site-intel-manual-input");
    const manualLoadBtn = widget.querySelector("#site-intel-manual-load-btn");

    if (editBtn && manualBox) {
      editBtn.addEventListener("click", () => {
        const isHidden = manualBox.style.display === "none";
        manualBox.style.display = isHidden ? "flex" : "none";
        if (isHidden && manualInput) {
          manualInput.value = currentTargetUrl || "";
          manualInput.focus();
        }
      });
    }

    const applyManualUrl = () => {
      if (!manualInput) return;
      let raw = manualInput.value.trim();
      if (!raw) return;
      if (!/^https?:\/\//i.test(raw) && raw.includes(".")) {
        raw = "http://" + raw;
      }
      if (!isValidUrlOrDomain(raw)) {
        alert("Please enter a valid website URL (e.g. http://www.techmarkets.co.uk)");
        return;
      }
      currentTargetUrl = raw;
      updateFloatingWidgetTarget(raw);

      // Write into Website Name input element in form
      const websiteEl = findWebsiteInputElement();
      if (websiteEl) {
        setNativeInputValue(websiteEl, raw);
      }

      const statusEl = document.getElementById("site-intel-status-line");
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.textContent = `✓ Target URL loaded: ${raw}`;
      }
      if (manualBox) manualBox.style.display = "none";
    };

    if (manualLoadBtn) {
      manualLoadBtn.addEventListener("click", applyManualUrl);
    }
    if (manualInput) {
      manualInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyManualUrl();
        }
      });
    }

    // Listen to input changes on Website Name field to update widget live (deduplicated per element)
    const attachedSyncElements = typeof WeakSet !== "undefined" ? new WeakSet() : null;
    const attachSync = () => {
      const websiteEl = findWebsiteInputElement();
      if (websiteEl && (!attachedSyncElements || !attachedSyncElements.has(websiteEl))) {
        if (attachedSyncElements) attachedSyncElements.add(websiteEl);
        const syncTarget = () => {
          const val = getElementValue(websiteEl);
          if (isValidUrlOrDomain(val)) {
            updateFloatingWidgetTarget(val.trim());
          } else {
            updateFloatingWidgetTarget("");
          }
        };
        websiteEl.addEventListener("input", syncTarget);
        websiteEl.addEventListener("change", syncTarget);
      }
    };
    attachSync();

    // Ensure observer and periodic interval are started only once per session
    if (typeof window !== "undefined" && !window.__siteIntelSyncStarted) {
      window.__siteIntelSyncStarted = true;

      // MutationObserver to detect when portal loads next record asynchronously via AJAX.
      // Debounced to max ~2 fires/second; observes childList only (NOT attributes) to avoid
      // firing on every value-change and hanging the browser.
      if (typeof MutationObserver !== "undefined" && document.body) {
        try {
          let mutationDebounceTimer = null;
          const portalObserver = new MutationObserver(() => {
            if (mutationDebounceTimer) return; // already scheduled — skip
            mutationDebounceTimer = setTimeout(() => {
              mutationDebounceTimer = null;
              // Invalidate cached element so we re-detect after DOM change
              invalidateWebsiteInputCache();
              const el = findWebsiteInputElement();
              if (el) {
                const v = getElementValue(el);
                if (isValidUrlOrDomain(v)) {
                  updateFloatingWidgetTarget(v.trim());
                  attachSync();
                } else {
                  updateFloatingWidgetTarget("");
                }
              }
            }, 500); // debounce: at most 2 fires/second
          });
          // childList + subtree only — NO attributes (attributes fires constantly and hangs the tab)
          portalObserver.observe(document.body, { childList: true, subtree: true });
        } catch (_) { }
      }

      // Periodic check in case portal loads next task record asynchronously (e.g. Next Record on cpworkportal.online).
      // Throttled to 2500ms; skips when widget is hidden or a crawl is in progress to prevent browser hang.
      setInterval(() => {
        // Skip during active crawl — do NOT block background crawl with heavy DOM queries
        if (isWidgetCrawling) return;
        // Skip if widget doesn't exist and auto-crawl is disabled
        const widget = document.getElementById("site-intel-portal-widget");
        if ((!widget || widget.style.display === "none") && !getAutoCrawlEnabled()) return;

        const el = findWebsiteInputElement();
        if (el) {
          const v = getElementValue(el);
          if (isValidUrlOrDomain(v)) {
            const trimmed = v.trim();
            const targetEl = document.getElementById("site-intel-widget-target");
            if (targetEl && targetEl.textContent.trim() !== trimmed) {
              updateFloatingWidgetTarget(trimmed);
            } else if (getAutoCrawlEnabled() && normalizeTargetKey(trimmed) !== lastAutoCrawledUrl) {
              scheduleAutoCrawl(trimmed);
            }
          }
        }
      }, 2500); // 2.5s instead of 1s — still fast enough for async record loads
    }
  }

  let globalAutoCrawl = (() => {
    try { return localStorage.getItem("site_intel_auto_crawl") === "true"; } catch (_) { return false; }
  })();
  let globalAutoSubmitNotWorking = (() => {
    try { return localStorage.getItem("site_intel_auto_submit_not_working") === "true"; } catch (_) { return false; }
  })();

  function loadGlobalAutomationSettings() {
    return new Promise((resolve) => {
      if (isExtensionContextValid() && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.get(["autoCrawl", "autoSubmitNotWorking"], (res) => {
            if (res && typeof res.autoCrawl === "boolean") {
              globalAutoCrawl = res.autoCrawl;
              try { localStorage.setItem("site_intel_auto_crawl", globalAutoCrawl ? "true" : "false"); } catch (_) { }
            }
            if (res && typeof res.autoSubmitNotWorking === "boolean") {
              globalAutoSubmitNotWorking = res.autoSubmitNotWorking;
              try { localStorage.setItem("site_intel_auto_submit_not_working", globalAutoSubmitNotWorking ? "true" : "false"); } catch (_) { }
            }
            resolve();
          });
          return;
        } catch (_) { }
      }
      resolve();
    });
  }

  function getAutoCrawlEnabled() {
    return globalAutoCrawl;
  }

  function getAutoSubmitNotWorkingEnabled() {
    return globalAutoSubmitNotWorking;
  }

  let lastAutoCrawledUrl = "";
  let pendingAutoCrawlKey = "";
  let autoCrawlTimer = null;
  let autoSubmitTimer = null;
  let lastAutoSubmittedKey = "";

  function normalizeTargetKey(url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (!isValidUrlOrDomain(trimmed)) return "";
    return (/^https?:\/\//i.test(trimmed) ? trimmed : "http://" + trimmed).toLowerCase();
  }

  function scheduleAutoCrawl(url) {
    if (!getAutoCrawlEnabled()) return;
    if (isWidgetCrawling) return;
    const key = normalizeTargetKey(url);
    if (!key || key === lastAutoCrawledUrl) return;
    // Do NOT reset timer if already scheduled for the same URL (prevents MutationObserver starvation)
    if (autoCrawlTimer && pendingAutoCrawlKey === key) return;
    if (autoCrawlTimer) clearTimeout(autoCrawlTimer);
    pendingAutoCrawlKey = key;
    autoCrawlTimer = setTimeout(() => {
      autoCrawlTimer = null;
      pendingAutoCrawlKey = "";
      if (!getAutoCrawlEnabled() || isWidgetCrawling) return;
      const targetEl = document.getElementById("site-intel-widget-target");
      const latest = targetEl ? (targetEl.innerText || targetEl.textContent || "").trim() : url;
      const latestKey = normalizeTargetKey(latest);
      if (latestKey && latestKey !== lastAutoCrawledUrl) {
        handleWidgetCrawlAndFill();
      }
    }, 900);
  }

  function findPortalSubmitButton() {
    const candidates = Array.from(
      document.querySelectorAll("button, input[type='submit'], input[type='button'], a.btn, [role='button']")
    ).filter(el => {
      if (el.closest("#site-intel-portal-widget")) return false;
      if (el.disabled) return false;
      const hasBounding = typeof el.getBoundingClientRect === "function";
      const rect = hasBounding ? el.getBoundingClientRect() : { width: 100, height: 30 };
      if (hasBounding && (rect.width <= 0 || rect.height <= 0)) return false;
      const style = (typeof window !== "undefined" && typeof window.getComputedStyle === "function")
        ? window.getComputedStyle(el)
        : { display: "block", visibility: "visible" };
      if (style.display === "none" || style.visibility === "hidden") return false;
      const text = (el.innerText || el.textContent || el.value || "").trim().toLowerCase();
      return text === "submit" || text.includes("submit") || el.type === "submit";
    });
    // Prefer exact "submit" text or native type="submit" first
    const exact = candidates.find(el => (el.innerText || el.textContent || el.value || "").trim().toLowerCase() === "submit");
    if (exact) return exact;
    const nativeSubmit = candidates.find(el => el.type === "submit");
    return nativeSubmit || candidates[0] || null;
  }

  function triggerAutoSubmitIfNotWorking(extractedData, targetUrl = "", statusLine = null) {
    if (!extractedData || !getAutoSubmitNotWorkingEnabled()) return false;
    const statusLower = String(extractedData.websiteStatus || "").trim().toLowerCase();
    const isNotWorkingSite = statusLower === "not working" || statusLower === "redirect site";
    if (!isNotWorkingSite) return false;

    const key = normalizeTargetKey(targetUrl || extractedData.websiteName || "");
    if (key && key === lastAutoSubmittedKey) return false;

    const submitBtn = findPortalSubmitButton();
    if (!submitBtn) return false;

    if (autoSubmitTimer) clearTimeout(autoSubmitTimer);
    if (statusLine) statusLine.textContent = "🚀 Not Working — Auto-submitting form...";
    autoSubmitTimer = setTimeout(() => {
      autoSubmitTimer = null;
      if (!getAutoSubmitNotWorkingEnabled()) return;
      const btn = findPortalSubmitButton();
      if (!btn) return;
      if (key) lastAutoSubmittedKey = key;
      try {
        btn.click();
      } catch (_) { }
    }, 800);
    return true;
  }

  function updateFloatingWidgetTarget(url) {
    const targetEl = document.getElementById("site-intel-widget-target");
    if (targetEl) {
      const valid = Boolean(url && isValidUrlOrDomain(url));
      targetEl.textContent = valid ? url.trim() : "Detecting URL from form...";
      if (valid) {
        scheduleAutoCrawl(url.trim());
      }
    }
  }

  // Renders the full details table into the on-page floating widget matching the popup structured view
  function renderWidgetDetails(data, meta = {}) {
    if (!data) return;
    applyBusinessTypeEligibility(data);
    lastWidgetData = data;

    const detailsSection = document.getElementById("site-intel-details-section");
    const tableBody = document.getElementById("site-intel-table-body");
    const badgeStatus = document.getElementById("site-intel-badge-status");
    const badgeType = document.getElementById("site-intel-badge-type");
    const badgeEngine = document.getElementById("site-intel-badge-engine");

    if (!detailsSection || !tableBody) return;
    detailsSection.style.display = "flex";

    // Update badges
    if (badgeStatus) {
      const isWorking = (data.websiteStatus || "").toLowerCase() === "working";
      badgeStatus.textContent = `Status: ${data.websiteStatus || "Working"}`;
      badgeStatus.style.color = isWorking ? "#34d399" : "#f87171";
      badgeStatus.style.background = isWorking ? "rgba(16,185,129,0.15)" : "rgba(248,113,113,0.15)";
    }
    if (badgeType) {
      badgeType.textContent = data.businessType || "N/A";
    }
    if (badgeEngine) {
      const model = meta.modelUsed || "gemini-3.5-flash-lite";
      const time = meta.durationMs ? ` · ${(meta.durationMs / 1000).toFixed(1)}s` : "";
      badgeEngine.textContent = `${model}${time}`;
    }

    // Populate all 15 fields
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

    tableBody.innerHTML = "";
    keyLabels.forEach((item, idx) => {
      const val = data[item.key];
      const row = document.createElement("tr");
      row.style.background = idx % 2 === 0 ? "rgba(30, 41, 59, 0.4)" : "transparent";
      row.style.borderBottom = "1px solid rgba(51, 65, 85, 0.4)";

      const tdKey = document.createElement("td");
      tdKey.style.padding = "5px 8px";
      tdKey.style.color = "#94a3b8";
      tdKey.style.fontWeight = "500";
      tdKey.style.width = "40%";
      tdKey.textContent = item.label;

      const tdVal = document.createElement("td");
      tdVal.style.padding = "5px 8px";
      tdVal.style.fontWeight = "600";
      if (val === undefined || val === null || val === "") {
        tdVal.textContent = "—";
        tdVal.style.color = "#475569";
      } else {
        tdVal.textContent = String(val);
        tdVal.style.color = "#f8fafc";
      }

      row.appendChild(tdKey);
      row.appendChild(tdVal);
      tableBody.appendChild(row);
    });
  }

  function isExtensionContextValid() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  let isWidgetCrawling = false;
  let buttonResetTimer = null;

  async function handleWidgetCrawlAndFill(e) {
    if (e) {
      try { e.preventDefault?.(); e.stopPropagation?.(); } catch (_) { }
    }

    if (isWidgetCrawling) {
      console.log("Crawl already in progress, ignoring double-click.");
      return;
    }
    if (buttonResetTimer) {
      clearTimeout(buttonResetTimer);
      buttonResetTimer = null;
    }
    isWidgetCrawling = true;

    try {
      const actionBtn = document.getElementById("site-intel-action-btn");
      const btnText = document.getElementById("site-intel-btn-text");
      const statusLine = document.getElementById("site-intel-status-line");

      // Guard: Check if extension context is still valid (handles extension reloads/updates)
      if (!isExtensionContextValid()) {
        if (statusLine) {
          statusLine.style.display = "block";
          statusLine.textContent = "🔄 Extension was updated or reloaded. Please refresh this page (F5) to reconnect.";
        }
        if (btnText) btnText.textContent = "🔄 Refresh Page to Reconnect";
        if (actionBtn) {
          actionBtn.style.background = "#f59e0b";
          actionBtn.disabled = false;
          actionBtn.style.opacity = "1";
          actionBtn.style.cursor = "pointer";
          actionBtn.style.pointerEvents = "";
          actionBtn.onclick = () => window.location.reload();
        }
        return;
      }

      // Get latest URL: Priority 1 is the widget's displayed target (what is literally visible on the widget)
      let url = "";
      const targetEl = document.getElementById("site-intel-widget-target");
      if (targetEl) {
        const displayed = (targetEl.innerText || targetEl.textContent || "").trim();
        if (isValidUrlOrDomain(displayed)) {
          url = displayed;
        }
      }

      // Priority 2: Direct inspection of Website Name input element
      if (!url) {
        const websiteEl = findWebsiteInputElement();
        if (websiteEl) {
          const v = getElementValue(websiteEl);
          if (isValidUrlOrDomain(v)) {
            url = v.trim();
          }
        }
      }

      // Priority 3: Fallback detectPortalForm
      if (!url) {
        const detection = detectPortalForm();
        if (isValidUrlOrDomain(detection.targetUrl)) {
          url = detection.targetUrl.trim();
        }
      }

      if (!url || !isValidUrlOrDomain(url)) {
        if (statusLine) {
          statusLine.style.display = "block";
          statusLine.textContent = "⚠️ Please enter a valid website URL in Website Name.";
        }
        alert("Please enter a valid website URL in the 'Website Name' field first (e.g. http://www.fongding.com.tw).");
        return;
      }

      if (!/^https?:\/\//i.test(url)) {
        url = "http://" + url;
      }

      // Set UI to loading state immediately
      if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.style.opacity = "0.7";
        actionBtn.style.cursor = "not-allowed";
        actionBtn.style.pointerEvents = "none";
      }
      if (btnText) {
        btnText.textContent = "Crawling & Analyzing...";
      }
      if (statusLine) {
        statusLine.style.display = "block";
        statusLine.textContent = "⏳ Fetching website pages...";
      }

      try {
        // Send crawl request to background service worker
        if (statusLine) statusLine.textContent = "🤖 Analyzing with Gemini AI...";
        const response = await new Promise((resolve, reject) => {
          try {
            if (!chrome.runtime || !chrome.runtime.id) {
              return reject(new Error("Extension context invalidated. Please refresh this page (F5) to reconnect."));
            }
            chrome.runtime.sendMessage({
              action: "crawlAndExtractForPortal",
              targetUrl: url
            }, (res) => {
              if (chrome.runtime && chrome.runtime.lastError) {
                const errMsg = chrome.runtime.lastError.message || "Communication failed";
                return reject(new Error(errMsg.includes("context invalidated") ? "Extension context invalidated. Please refresh this page (F5) to reconnect." : errMsg));
              }
              resolve(res);
            });
          } catch (e) {
            reject(e);
          }
        });

        if (!response) {
          throw new Error("No response received from crawler engine.");
        }

        if (!response.success && !response.data) {
          throw new Error(response.error || "Crawl & AI extraction failed");
        }

        const extractedData = response.data || { websiteStatus: "Not Working", notWorkingReason: response.error };

        if (statusLine) statusLine.textContent = "📝 Prefilling portal form fields...";
        const fillResult = prefillPortalForm(extractedData);

        // Render full extracted details in widget
        renderWidgetDetails(extractedData, response.meta);

        lastAutoCrawledUrl = normalizeTargetKey(url);

        if (btnText) btnText.textContent = "✓ Form Filled!";
        if (actionBtn) actionBtn.style.background = "#10b981";
        if (statusLine) statusLine.textContent = `✅ Successfully filled ${fillResult.filledCount} fields! All details shown below.`;

        // Auto Submit if websiteStatus is Not Working (or Redirect Site) and Auto Submit (Not Working) is enabled
        triggerAutoSubmitIfNotWorking(extractedData, url, statusLine);

        buttonResetTimer = setTimeout(() => {
          buttonResetTimer = null;
          if (isWidgetCrawling) return;
          if (actionBtn) {
            actionBtn.disabled = false;
            actionBtn.style.opacity = "1";
            actionBtn.style.cursor = "pointer";
            actionBtn.style.pointerEvents = "";
            actionBtn.style.background = "#2563eb";
          }
          if (btnText) btnText.textContent = "⚡ Crawl & Autofill Again";
        }, 3500);

      } catch (err) {
        const isContextInvalidated = /context invalidated/i.test(err?.message || "");
        if (isContextInvalidated) {
          console.warn("Site Intelligence: Extension context invalidated due to extension reload. Please refresh the page.");
          if (statusLine) {
            statusLine.style.display = "block";
            statusLine.textContent = "🔄 Extension was updated or reloaded. Please refresh this page (F5) to reconnect.";
          }
          if (btnText) btnText.textContent = "🔄 Refresh Page to Reconnect";
          if (actionBtn) {
            actionBtn.style.background = "#f59e0b";
            actionBtn.disabled = false;
            actionBtn.style.opacity = "1";
            actionBtn.style.cursor = "pointer";
            actionBtn.style.pointerEvents = "";
            actionBtn.onclick = () => window.location.reload();
          }
          return;
        }

        const isApiKeyError = /api key/i.test(err?.message || "");
        console.error("Widget crawl error:", err);
        if (btnText) btnText.textContent = isApiKeyError ? "⚙️ API Key Required" : "Error";
        if (actionBtn) {
          actionBtn.style.background = isApiKeyError ? "#f59e0b" : "#ef4444";
          actionBtn.disabled = false;
          actionBtn.style.opacity = "1";
          actionBtn.style.cursor = "pointer";
          actionBtn.style.pointerEvents = "";
        }
        if (statusLine) {
          statusLine.style.display = "block";
          statusLine.textContent = isApiKeyError
            ? "⚠️ Gemini API key is missing. Click the extension toolbar icon to set your API key."
            : `❌ ${err.message}`;
        }

        if (!isApiKeyError) {
          setTimeout(() => {
            if (actionBtn) {
              actionBtn.disabled = false;
              actionBtn.style.opacity = "1";
              actionBtn.style.cursor = "pointer";
              actionBtn.style.pointerEvents = "";
              actionBtn.style.background = "#2563eb";
            }
            if (btnText) btnText.textContent = "⚡ Crawl & Autofill Form";
          }, 3500);
        }
      }
    } finally {
      isWidgetCrawling = false;
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
      } catch (e) { }
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
      } catch (e) { }
    }

    // 4. Product heuristics
    const productData = detectProducts();

    // 5. Clean text content
    const cleanText = extractCleanText(document.body);

    // 6. Regex email & phone detection
    const emails = Array.from(new Set(cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []));
    const phones = Array.from(new Set(cleanText.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}/g) || []))
      .filter(p => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15);

    // 7. Extract Map Addresses and Footer from main page DOM
    const mapAddresses = [];
    const iframes = document.querySelectorAll("iframe[src*='maps.google'], iframe[src*='google.com/maps'], iframe[src*='openstreetmap'], iframe[src*='bing.com/maps']");
    iframes.forEach(iframe => {
      const src = iframe.getAttribute("src") || "";
      const qMatch = src.match(/[?&]q=([^&]+)/i) || src.match(/\/place\/([^/@?]+)/i) || src.match(/!2s([^!]+)/i);
      if (qMatch) {
        try {
          mapAddresses.push(decodeURIComponent(qMatch[1]).replace(/\+/g, " ").trim());
        } catch (e) {
          mapAddresses.push(qMatch[1].replace(/\+/g, " ").trim());
        }
      }
    });

    const mapLinks = document.querySelectorAll("a[href*='maps.google'], a[href*='google.com/maps'], a[href*='goo.gl/maps']");
    mapLinks.forEach(a => {
      const href = a.getAttribute("href") || "";
      const qMatch = href.match(/[?&]q=([^&]+)/i) || href.match(/\/place\/([^/@?]+)/i);
      if (qMatch) {
        try {
          mapAddresses.push(decodeURIComponent(qMatch[1]).replace(/\+/g, " ").trim());
        } catch (e) {
          mapAddresses.push(qMatch[1].replace(/\+/g, " ").trim());
        }
      }
    });

    const footerEl = document.querySelector("footer, [class*='footer' i], [id*='footer' i]");
    const footerText = footerEl ? (footerEl.innerText || footerEl.textContent || "").trim() : "";
    const htmlSnippet = document.documentElement ? document.documentElement.outerHTML.slice(0, 50000) : "";

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
      detectedPhones: phones.slice(0, 5),
      mapAddresses: Array.from(new Set(mapAddresses)),
      footerText: footerText,
      html: htmlSnippet
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

    // Extract Embedded Map addresses before removing iframes
    const mapAddresses = [];
    const iframes = rootNode.querySelectorAll("iframe[src*='maps.google'], iframe[src*='google.com/maps'], iframe[src*='openstreetmap'], iframe[src*='bing.com/maps']");
    iframes.forEach(iframe => {
      const src = iframe.getAttribute("src") || "";
      const qMatch = src.match(/[?&]q=([^&]+)/i) || src.match(/\/place\/([^/@?]+)/i) || src.match(/!2s([^!]+)/i);
      if (qMatch) {
        try {
          mapAddresses.push(decodeURIComponent(qMatch[1]).replace(/\+/g, " ").trim());
        } catch (e) {
          mapAddresses.push(qMatch[1].replace(/\+/g, " ").trim());
        }
      }
    });

    const dropTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS", "IFRAME", "TEMPLATE", "NAV"]);
    const blockTags = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "LI", "TR", "TD", "TH", "H1", "H2", "H3", "H4", "H5", "H6", "BR", "HR"]);
    const parts = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 3) {
        const t = node.nodeValue;
        if (t && t.trim()) parts.push(t.trim());
        return;
      }
      if (node.nodeType !== 1) return;
      if (dropTags.has(node.tagName)) return;
      try {
        if (typeof window !== "undefined" && typeof window.getComputedStyle === "function" && node.ownerDocument && node.ownerDocument.defaultView) {
          const st = window.getComputedStyle(node);
          if (st && (st.display === "none" || st.visibility === "hidden")) return;
        }
      } catch (_) { }
      const isBlock = blockTags.has(node.tagName);
      if (isBlock) parts.push("\n");
      for (let child = node.firstChild; child; child = child.nextSibling) {
        walk(child);
      }
      if (isBlock) parts.push("\n");
    };
    walk(rootNode);
    let text = parts.join(" ");
    // If there is an explicit footer, ensure its content is preserved
    const footerEl = rootNode.querySelector("footer, [class*='footer' i], [id*='footer' i]");
    if (footerEl) {
      const footerText = (footerEl.innerText || footerEl.textContent || "").trim();
      if (footerText && !text.includes(footerText)) {
        text += "\n\n--- FOOTER (SECONDARY SOURCE) ---\n" + footerText;
      }
    }

    if (mapAddresses.length > 0) {
      text += "\n\n--- EMBEDDED MAP VERIFICATION SOURCE ---\nMap Location / Address: " + Array.from(new Set(mapAddresses)).join(" | ");
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
