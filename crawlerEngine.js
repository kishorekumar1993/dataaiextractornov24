// Universal Crawler & Prompt Engine for Site Intelligence Crawler
// Compatible with Service Worker (MV3), Popup, Content Script, and Node.js

const CrawlerEngine = (() => {
  const AddressNormalizer = (typeof require !== "undefined")
    ? (function () { try { return require("./addressNormalizer.js"); } catch (e) { return null; } })()
    : (typeof window !== "undefined" && window.AddressNormalizer ? window.AddressNormalizer : (typeof self !== "undefined" && self.AddressNormalizer ? self.AddressNormalizer : null));

  const RestrictionValidator = (typeof require !== "undefined")
    ? (function () { try { return require("./restrictionValidator.js"); } catch (e) { return null; } })()
    : (typeof window !== "undefined" && window.RestrictionValidator ? window.RestrictionValidator : (typeof self !== "undefined" && self.RestrictionValidator ? self.RestrictionValidator : null));

  const GeminiClient = (typeof require !== "undefined")
    ? (function () { try { return require("./geminiClient.js"); } catch (e) { return null; } })()
    : (typeof window !== "undefined" && window.GeminiClient ? window.GeminiClient : (typeof self !== "undefined" && self.GeminiClient ? self.GeminiClient : (typeof globalThis !== "undefined" && globalThis.GeminiClient ? globalThis.GeminiClient : null)));

  const CompanyNormalizer = (typeof require !== "undefined")
    ? (function () { try { return require("./companyNormalizer.js"); } catch (e) { return null; } })()
    : (typeof window !== "undefined" && window.CompanyNormalizer ? window.CompanyNormalizer : (typeof self !== "undefined" && self.CompanyNormalizer ? self.CompanyNormalizer : (typeof globalThis !== "undefined" && globalThis.CompanyNormalizer ? globalThis.CompanyNormalizer : null)));

  // Regex patterns for HTML processing in environments without DOM
  const SCRIPT_STYLE_REGEX = /<(?:script|style|noscript|svg|canvas|iframe|template|nav)\b[^<]*(?:(?!<\/(?:script|style|noscript|svg|canvas|iframe|template|nav)>)<[^<]*)*<\/(?:script|style|noscript|svg|canvas|iframe|template|nav)>/gi;
  const HTML_TAG_REGEX = /<[^>]+>/g;
  const A_HREF_REGEX = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const PHONE_REGEX = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{3,5}/g;

  // Multi-part TLD patterns for Public Suffix List aware domain comparisons
  const MULTI_PART_TLDS = new Set([
    "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk", "ac.uk", "gov.uk",
    "com.au", "net.au", "org.au", "edu.au", "gov.au",
    "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
    "co.jp", "ne.jp", "or.jp", "go.jp", "ac.jp",
    "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
    "co.in", "net.in", "org.in", "gen.in", "firm.in", "ind.in",
    "com.tw", "org.tw", "net.tw", "idv.tw",
    "com.hk", "org.hk", "net.hk", "edu.hk", "gov.hk",
    "com.sg", "org.sg", "net.sg", "edu.sg", "gov.sg",
    "com.my", "org.my", "net.my", "gov.my", "edu.my",
    "co.za", "org.za", "net.za", "gov.za",
    "com.br", "net.br", "org.br", "adv.br",
    "com.mx", "org.mx", "net.mx", "edu.mx", "gob.mx",
    "com.ar", "org.ar", "net.ar",
    "com.tr", "org.tr", "net.tr", "gov.tr", "edu.tr",
    "co.id", "net.id", "or.id", "web.id", "sch.id",
    "com.vn", "org.vn", "net.vn", "edu.vn", "gov.vn",
    "com.ph", "net.ph", "org.ph",
    "github.io", "pages.dev", "gitlab.io", "azurewebsites.net", "appspot.com", "cloudfront.net"
  ]);

  // Free hosting platforms (Unpaid Website Category - Rule 9)
  const FREE_HOSTING_DOMAINS = new Set([
    "wordpress.com",
    "wixsite.com",
    "wix.com",
    "weebly.com",
    "blogspot.com",
    "blogger.com",
    "webflow.io",
    "jimdosite.com",
    "site123.me",
    "yolasite.com",
    "strikingly.com",
    "godaddysites.com"
  ]);

  function isFreeHostingPlatform(hostname) {
    if (!hostname) return false;
    const lower = getHostname(hostname);
    for (const freeDom of FREE_HOSTING_DOMAINS) {
      if (lower === freeDom || lower.endsWith("." + freeDom)) {
        return true;
      }
    }
    return false;
  }

  function isIneligibleSubdomain(urlOrHostname) {
    const parsed = parseDomain(urlOrHostname);
    if (!parsed || !parsed.subdomain) return false;
    const sub = parsed.subdomain.toLowerCase();
    // www and mobile (m, mobile) are acceptable canonical root aliases
    if (sub === "www" || sub === "m" || sub === "mobile" || sub === "www.m") {
      return false;
    }
    return true;
  }

  function checkUnpaidWebsiteContent(html, url) {
    if (!html && !url) return null;
    if (typeof RestrictionValidator !== "undefined" && RestrictionValidator && RestrictionValidator.detectTextRestrictions) {
      const detected = RestrictionValidator.detectTextRestrictions(html, url);
      if (detected) return detected.reason;
    }
    const cleanText = cleanHtmlToText(html || "");
    const lower = cleanText.toLowerCase();
    const urlLower = (url || "").toLowerCase();

    // Rule 1: Weapons & Armor
    if (
      /\b(weapon|weapons|firearms?|ammunition|body armor|bulletproof vest|ballistic armor)\b/i.test(cleanText) ||
      /\b(weapons?|guns|firearms?)\b/i.test(urlLower)
    ) {
      return "Unpaid Category: Companies involved in armor, weapons manufacturing, trading, supply, exporting, or repairing services.";
    }

    // Rule 2: Pornographic / Adult Content
    if (
      /\b(porn|pornography|pornographic|xxx|adult video|sex shop|erotic massage|adult entertainment)\b/i.test(cleanText) ||
      /\b(porn|xxx)\b/i.test(urlLower)
    ) {
      return "Unpaid Category: Pornographic or adult content website.";
    }

    // Rule 3: Online Gambling / Gaming
    if (
      lower.includes("online casino") || lower.includes("sports betting") || /\bgambling\b/i.test(cleanText) ||
      lower.includes("slot machine") || lower.includes("poker online") || lower.includes("online gaming real money")
    ) {
      return "Unpaid Category: Online gambling or online gaming website.";
    }

    // Rule 5: Hacking Services / Information
    if (
      lower.includes("hacking service") || lower.includes("hire a hacker") || lower.includes("exploit kit") ||
      lower.includes("ddos for hire") || lower.includes("crack passwords")
    ) {
      return "Unpaid Category: Hacking services or hacking information website.";
    }

    // Rule 6: Alcohol or Tobacco
    if (
      /\b(cigarettes?|tobacco products?|cigar manufacturer|vape shop|alcoholic beverages?|whiskey distillery|vodka distillery|brewery and beer)\b/i.test(cleanText)
    ) {
      return "Unpaid Category: Alcoholic or tobacco product manufacturers, suppliers, or traders.";
    }

    // Rule 7: Airline / Aviation Industry
    if (
      lower.includes("airline flights") || lower.includes("air passenger transport") || lower.includes("book flights online") ||
      lower.includes("commercial airline") || lower.includes("aviation passenger service")
    ) {
      return "Unpaid Category: Airline or aviation passenger industry.";
    }

    // Rule 8: Personal Website / Blog
    if (
      lower.includes("personal blog") || lower.includes("my personal website") ||
      (lower.includes("thoughts, stories and ideas") && lower.includes("personal"))
    ) {
      return "Unpaid Category: Personal website or blog.";
    }

    return null;
  }

  function hasOnlineSellingOptions(html, text = "", url = "") {
    if (!html && !text) return false;
    if (typeof RestrictionValidator !== "undefined" && RestrictionValidator && RestrictionValidator.detectOnlineShopping) {
      return RestrictionValidator.detectOnlineShopping(html, text, url).detected;
    }
    const stripped = (html || "").replace(SCRIPT_STYLE_REGEX, " ");
    const lower = stripped.toLowerCase();
    const cleanText = cleanHtmlToText(html).toLowerCase();

    return (
      lower.includes("add to cart") ||
      lower.includes("add to bag") ||
      lower.includes("buy now") ||
      lower.includes("shopping cart") ||
      cleanText.includes("add to cart") ||
      cleanText.includes("add to bag") ||
      cleanText.includes("buy now") ||
      cleanText.includes("shopping cart") ||
      (cleanText.includes("checkout") && cleanText.includes("payment")) ||
      /<button[^>]*>(?:[^<]*)(?:add to cart|add to bag|buy now|checkout)(?:[^<]*)<\/button>/i.test(stripped) ||
      /<input[^>]*value=["'](?:add to cart|add to bag|buy now|checkout)["']/i.test(stripped)
    );
  }

  function getHostname(urlOrHostname) {
    if (!urlOrHostname) return "";
    let raw = String(urlOrHostname).trim();
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(raw)) {
      try {
        return new URL(raw).hostname.toLowerCase();
      } catch (e) { }
    }
    try {
      return new URL("http://" + raw).hostname.toLowerCase();
    } catch (e) {
      return raw.split(/[/:]/)[0].toLowerCase();
    }
  }

  function parseDomain(urlOrHostname) {
    const hostname = getHostname(urlOrHostname);
    if (!hostname) {
      return { hostname: "", registeredDomain: "", subdomain: "", tld: "" };
    }

    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname === "localhost") {
      return { hostname, registeredDomain: hostname, subdomain: "", tld: "" };
    }

    const parts = hostname.split(".");
    if (parts.length <= 1) {
      return { hostname, registeredDomain: hostname, subdomain: "", tld: "" };
    }

    // Check multi-part TLD (e.g. co.uk, com.au)
    if (parts.length >= 3) {
      const candidate2Part = parts.slice(-2).join(".");
      if (MULTI_PART_TLDS.has(candidate2Part)) {
        const registeredDomain = parts.slice(-3).join(".");
        const subdomain = parts.slice(0, -3).join(".");
        return { hostname, registeredDomain, subdomain, tld: candidate2Part };
      }
    }

    const tld = parts[parts.length - 1];
    const registeredDomain = parts.slice(-2).join(".");
    const subdomain = parts.slice(0, -2).join(".");
    return { hostname, registeredDomain, subdomain, tld };
  }

  function getRegisteredDomain(urlOrHostname) {
    return parseDomain(urlOrHostname).registeredDomain;
  }

  function areSameRegisteredDomain(url1, url2) {
    const d1 = getRegisteredDomain(url1);
    const d2 = getRegisteredDomain(url2);
    return Boolean(d1 && d2 && d1 === d2);
  }

  function determineRedirectType(startUrl, finalUrl, isLoop, isExcessive, origDomain, finalDomain) {
    if (isLoop) return "REDIRECT_LOOP";
    if (isExcessive) return "EXCESSIVE_REDIRECTS";
    if (!startUrl || !finalUrl || startUrl === finalUrl) return "NONE";

    if (origDomain && finalDomain && origDomain !== finalDomain) {
      return "DIFFERENT_REGISTERED_DOMAIN";
    }

    let startObj, finalObj;
    try {
      startObj = new URL(startUrl);
      finalObj = new URL(finalUrl);
    } catch (e) {
      return "UNKNOWN";
    }

    const finalHost = finalObj.hostname.toLowerCase();
    const startHost = startObj.hostname.toLowerCase();

    // Mobile redirect
    if ((finalHost.startsWith("m.") || finalHost.startsWith("mobile.")) &&
      !startHost.startsWith("m.") && !startHost.startsWith("mobile.")) {
      return "MOBILE_REDIRECT";
    }

    // Language redirect (/en/, /es/, /de/, /fr/, /zh/, /ja/, /pt/, /it/, /ru/, /ar/)
    const finalPath = finalObj.pathname.toLowerCase();
    const startPath = startObj.pathname.toLowerCase();
    const langRegex = /^\/([a-z]{2}(?:-[a-z]{2})?)\b/i;
    if (langRegex.test(finalPath) && !langRegex.test(startPath)) {
      return "LANGUAGE_REDIRECT";
    }

    // Country redirect (/uk/, /us/, /ca/, /au/, /in/)
    const countryRegex = /^\/(uk|us|ca|au|in|sg|my|nz|za|de|fr|es|it|jp|cn|br|mx)\b/i;
    if (countryRegex.test(finalPath) && !countryRegex.test(startPath)) {
      return "COUNTRY_REDIRECT";
    }

    // WWW change (canonical www)
    const startHasWww = startHost.startsWith("www.");
    const finalHasWww = finalHost.startsWith("www.");
    if (startHasWww !== finalHasWww) {
      return "CANONICAL_WWW";
    }

    // HTTP to HTTPS
    if (startObj.protocol === "http:" && finalObj.protocol === "https:") {
      return "HTTP_TO_HTTPS";
    }

    // Same domain path redirect
    if (startPath !== finalPath && (startPath !== "/" && startPath !== "")) {
      return "SAME_DOMAIN_PATH";
    }

    if (startPath !== finalPath) {
      return "SAME_DOMAIN_PATH";
    }

    return "SAME_DOMAIN_CANONICAL";
  }

  async function traceRedirects(startUrl, options = {}) {
    const fetchFn = options.fetchFn || (typeof fetch !== "undefined" ? fetch : null);
    const maxRedirects = options.maxRedirects || 5;

    let normalizedStart = startUrl;
    if (!/^https?:\/\//i.test(normalizedStart)) {
      normalizedStart = "http://" + normalizedStart;
    }

    const originalUrl = normalizedStart;
    const originalDomain = getRegisteredDomain(originalUrl);

    const redirectChain = [];
    const visitedUrls = new Set();
    let currentUrl = originalUrl;
    let hopCount = 0;
    let finalResp = null;
    let finalHtml = "";
    let httpStatus = null;
    let isRedirectLoop = false;
    let isExcessive = false;
    let isBrokenDestination = false;
    let caughtError = null;

    while (hopCount <= maxRedirects) {
      const normKey = currentUrl.toLowerCase().replace(/\/+$/, "");
      if (visitedUrls.has(normKey)) {
        isRedirectLoop = true;
        break;
      }
      visitedUrls.add(normKey);

      let resp;
      try {
        if (options.fetchFn) {
          resp = await fetchFn(currentUrl);
        } else {
          try {
            resp = await fetchFn(currentUrl, {
              method: "GET",
              redirect: "manual",
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
              }
            });
          } catch (fetchErr) {
            resp = await fetchFn(currentUrl);
          }
        }
      } catch (err) {
        caughtError = err;
        if (hopCount > 0) {
          isBrokenDestination = true;
        }
        break;
      }

      httpStatus = resp.status;

      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if (resp.status >= 300 && resp.status < 400) {
        let location = null;
        if (resp.headers && typeof resp.headers.get === "function") {
          location = resp.headers.get("location");
        }
        if (!location && resp.url && resp.url !== currentUrl) {
          location = resp.url;
        }

        if (location) {
          let nextUrl;
          try {
            nextUrl = new URL(location, currentUrl).href;
          } catch (e) {
            nextUrl = location;
          }

          // If location points to the exact same URL (self-redirect), stop following to avoid false loop
          if (nextUrl.toLowerCase().replace(/\/+$/, "") === currentUrl.toLowerCase().replace(/\/+$/, "")) {
            break;
          }

          hopCount++;
          redirectChain.push({
            from: currentUrl,
            to: nextUrl,
            status: resp.status,
            type: "HTTP_HEADER"
          });

          if (hopCount > maxRedirects) {
            isExcessive = true;
            break;
          }

          currentUrl = nextUrl;
          continue;
        }
      }

      // Check if browser/fetch automatically followed redirects to a different URL
      if (resp.url && resp.url !== currentUrl) {
        const nextUrl = resp.url;
        redirectChain.push({
          from: currentUrl,
          to: nextUrl,
          status: resp.status,
          type: "AUTO_FOLLOWED"
        });
        currentUrl = nextUrl;
      }

      // Final response reached or error status
      finalResp = resp;

      if (resp.status >= 400) {
        if (hopCount > 0) {
          isBrokenDestination = true;
        }
        try {
          finalHtml = await resp.text();
        } catch (e) { }
        break;
      }

      if (resp.status >= 200 && resp.status < 300) {
        try {
          finalHtml = await resp.text();
        } catch (e) { }

        // Check Meta Refresh (<meta http-equiv="refresh" content="0;url=...">)
        const metaMatch = finalHtml.match(/<meta\s+[^>]*?http-equiv=["']?refresh["']?[^>]*?content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)["']?/i) ||
          finalHtml.match(/<meta\s+[^>]*?content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)["']?[^>]*?http-equiv=["']?refresh["']?/i);
        if (metaMatch && metaMatch[1]) {
          let nextUrl = metaMatch[1].trim();
          try {
            nextUrl = new URL(nextUrl, currentUrl).href;
          } catch (e) { }

          hopCount++;
          redirectChain.push({
            from: currentUrl,
            to: nextUrl,
            status: 200,
            type: "META_REFRESH"
          });

          if (hopCount > maxRedirects) {
            isExcessive = true;
            break;
          }

          currentUrl = nextUrl;
          continue;
        }

        // Check JavaScript Redirect (window.location, location.href, location.replace)
        const jsMatch = finalHtml.match(/(?:window\.|document\.|location\.)(?:location(?:\.href)?|replace|assign)\s*[=(]\s*["']([^"']+)["']/i);
        if (jsMatch && jsMatch[1]) {
          let nextUrl = jsMatch[1].trim();
          try {
            nextUrl = new URL(nextUrl, currentUrl).href;
          } catch (e) { }

          hopCount++;
          redirectChain.push({
            from: currentUrl,
            to: nextUrl,
            status: 200,
            type: "JAVASCRIPT"
          });

          if (hopCount > maxRedirects) {
            isExcessive = true;
            break;
          }

          currentUrl = nextUrl;
          continue;
        }

        break;
      }

      break;
    }

    const finalUrl = currentUrl;
    const finalDomain = getRegisteredDomain(finalUrl);
    const redirectDetected = (hopCount > 0 || redirectChain.length > 0 || currentUrl !== originalUrl);
    const redirectType = determineRedirectType(originalUrl, finalUrl, isRedirectLoop, isExcessive, originalDomain, finalDomain);

    return {
      originalUrl,
      finalUrl,
      originalDomain,
      finalDomain,
      redirectDetected,
      redirectType,
      redirectChain,
      httpStatus,
      finalHtml,
      isRedirectLoop,
      isExcessive,
      isBrokenDestination,
      error: caughtError
    };
  }

  function classifyWebsiteStatus(traceResult) {
    const {
      originalUrl,
      finalUrl,
      originalDomain,
      finalDomain,
      redirectDetected,
      redirectType,
      redirectChain,
      httpStatus,
      finalHtml = "",
      isRedirectLoop,
      isExcessive,
      isBrokenDestination,
      error
    } = traceResult;

    let websiteStatus = "Working";
    let nonWorkingReason = "";
    let isEligibleForExtraction = false;
    let manualReviewRequired = false;

    const htmlLower = (finalHtml || "").toLowerCase();
    const cleanText = cleanHtmlToText(finalHtml || "");
    const cleanTextLower = cleanText.toLowerCase();
    const strippedHtml = (finalHtml || "").replace(SCRIPT_STYLE_REGEX, " ");
    const strippedLower = strippedHtml.toLowerCase();

    // 1. Broken destination after redirect
    if (isBrokenDestination) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = `Original website redirects to an unavailable destination (HTTP ${httpStatus || "dead/unreachable"}).`;
    }
    // 2. Redirect loop -> Not Working
    else if (isRedirectLoop) {
      websiteStatus = "Not Working";
      manualReviewRequired = false;
      nonWorkingReason = `Redirect loop detected: ${finalUrl}`;
    }
    // 3. Excessive redirects (> 5 hops)
    else if (isExcessive) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "Excessive redirect chain detected (exceeded maximum limit of 5 hops).";
    }
    // 4. Network / DNS / SSL Error
    else if (error) {
      const errMsg = (error.message || "").toLowerCase();
      if (errMsg.includes("enotfound") || errMsg.includes("getaddrinfo")) {
        websiteStatus = "Not Working";
        nonWorkingReason = `DNS Lookup Failed (ENOTFOUND - Domain does not exist): ${error.message}`;
      } else if (errMsg.includes("certificate") || errMsg.includes("cert_") || errMsg.includes("ssl") || errMsg.includes("tls")) {
        websiteStatus = "Manual Review";
        manualReviewRequired = true;
        nonWorkingReason = `SSL Certificate Failure: ${error.message}`;
      } else if (errMsg.includes("econnrefused")) {
        websiteStatus = "Not Working";
        nonWorkingReason = `Connection Refused (ECONNREFUSED): ${error.message}`;
      } else {
        websiteStatus = "Not Working";
        nonWorkingReason = `Connection failure: ${error.message}`;
      }
    }
    // 5. Temporary HTTP Error Codes (403, 429, 500, 502, 503) -> Manual Review
    else if (httpStatus === 403) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "Temporary server error (HTTP 403 Forbidden / Access Restricted). Verification required.";
    } else if (httpStatus === 429) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "Temporary server error (HTTP 429 Rate Limit / Too Many Requests). Verification required.";
    } else if (httpStatus === 500) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "Temporary server error (HTTP 500 Internal Server Error). Verification required.";
    } else if (httpStatus === 502) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "Temporary server error (HTTP 502 Bad Gateway). Verification required.";
    } else if (httpStatus === 503) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "Temporary server error (HTTP 503 Service Unavailable). Verification required.";
    }
    // 6. HTTP 404 Not Found
    else if (httpStatus === 404) {
      websiteStatus = "Not Working";
      nonWorkingReason = "Website not found (HTTP 404).";
    }
    // 7. Other HTTP >= 400
    else if (httpStatus && httpStatus >= 400) {
      websiteStatus = "Not Working";
      nonWorkingReason = `Website returned HTTP error ${httpStatus}.`;
    }
    // 8. CAPTCHA / Bot challenges (Only if explicit challenge prompt or challenge element on page without normal business content)
    else if (
      cleanTextLower.includes("verify you are human") ||
      (cleanTextLower.includes("security check") && cleanTextLower.includes("human")) ||
      (cleanTextLower.includes("please verify") && cleanTextLower.includes("robot")) ||
      ((strippedLower.includes("g-recaptcha") || strippedLower.includes("hcaptcha") || strippedLower.includes("cf-turnstile") || (strippedLower.includes("recaptcha") && strippedLower.includes("challenge"))) && cleanText.length < 800)
    ) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "CAPTCHA or anti-bot challenge page detected. Manual verification required.";
    }
    // 9. Cloudflare protection
    else if (
      strippedLower.includes("cf-chl-bypass") ||
      cleanTextLower.includes("attention required! | cloudflare") ||
      cleanTextLower.includes("checking your browser before accessing") ||
      (cleanTextLower.includes("just a moment") && cleanTextLower.includes("cloudflare"))
    ) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "Cloudflare security / anti-bot challenge page detected. Manual verification required.";
    }
    // 10. Login portal redirect (e.g. intranet, auth required)
    else if (
      (finalUrl.toLowerCase().includes("/login") || finalUrl.toLowerCase().includes("/signin")) &&
      (htmlLower.includes("<input type=\"password\"") || htmlLower.includes("system login") || htmlLower.includes("sign in to your account")) &&
      !htmlLower.includes("about us") && !htmlLower.includes("products")
    ) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "Website redirects to a system login portal without public company content.";
    }
    // 11. Domain Expired / Parked Page
    else if (
      htmlLower.includes("this domain has expired") ||
      htmlLower.includes("domain has expired") ||
      htmlLower.includes("domain expired") ||
      (htmlLower.includes("renewal notice") && htmlLower.includes("renew")) ||
      htmlLower.includes("is parked free") ||
      htmlLower.includes("godaddy parking") ||
      (htmlLower.includes("sedo") && htmlLower.includes("parking")) ||
      htmlLower.includes("buy this domain") ||
      htmlLower.includes("domain is for sale") ||
      htmlLower.includes("inquire about this domain") ||
      htmlLower.includes("hugedomains")
    ) {
      websiteStatus = "Domain Expired";
      nonWorkingReason = "Domain has expired, is parked, or is listed for sale.";
    }
    // 12. Under Construction
    else if (
      htmlLower.includes("site is under construction") ||
      htmlLower.includes("website is under construction") ||
      htmlLower.includes("this site is under construction") ||
      (htmlLower.includes("coming soon") && htmlLower.includes("under construction")) ||
      htmlLower.includes("our website coming soon")
    ) {
      websiteStatus = "Under Construction";
      nonWorkingReason = "Website explicitly indicates that it is under construction.";
    }
    // 13. Flash requirement
    else if (
      htmlLower.includes("application/x-shockwave-flash") ||
      htmlLower.includes("adobe flash player is required") ||
      (htmlLower.includes(".swf") && htmlLower.includes("flash player"))
    ) {
      websiteStatus = "Flash";
      nonWorkingReason = "Website requires unsupported Adobe Flash Player.";
    }
    // 14. External Domain Redirect (Different Registered Domain)
    else if (originalDomain && finalDomain && originalDomain !== finalDomain) {
      websiteStatus = "Redirect Site";
      nonWorkingReason = `External Domain Redirect to ${finalDomain} (${finalUrl}).`;
    }
    // 15. Non English (if explicit indicators and zero English content)
    else if (
      (htmlLower.includes("lang=\"zh\"") || htmlLower.includes("lang=\"ja\"") || htmlLower.includes("lang=\"ko\"") || htmlLower.includes("lang=\"ru\"")) &&
      !htmlLower.includes("english") && !htmlLower.includes("en-us") && !htmlLower.includes("en-gb") &&
      !/[a-z]{4,}\s+[a-z]{4,}\s+[a-z]{4,}/i.test(finalHtml)
    ) {
      websiteStatus = "Non English";
      nonWorkingReason = "Website content is not in English and no English version is accessible.";
    }
    // 15b. Unpaid Category: Free Hosting Platforms (Rule 9)
    else if (isFreeHostingPlatform(finalDomain) || isFreeHostingPlatform(finalUrl)) {
      websiteStatus = "Not Working";
      nonWorkingReason = `Unpaid Category: Website hosted on a free platform (${finalDomain || finalUrl}).`;
    }
    // 15c. Unpaid Category: Subdomain Website (Rule 10)
    else if (isIneligibleSubdomain(finalUrl)) {
      websiteStatus = "Not Working";
      nonWorkingReason = `Unpaid Category: Subdomain website not hosted at root level (${finalUrl}).`;
    }
    // 15d. Unpaid Category: Prohibited Industry / Content (20 Categories)
    else {
      const unpaidReason = checkUnpaidWebsiteContent(finalHtml, finalUrl);
      if (unpaidReason) {
        websiteStatus = "Not Working";
        nonWorkingReason = unpaidReason;
      }
      // 16. Working
      else {
        websiteStatus = "Working";
        nonWorkingReason = "";
        isEligibleForExtraction = true;
      }
    }

    return {
      originalUrl,
      finalUrl,
      originalDomain,
      finalDomain,
      redirectDetected,
      redirectType,
      redirectChain,
      httpStatus,
      websiteStatus,
      nonWorkingReason,
      isEligibleForExtraction,
      manualReviewRequired
    };
  }

  async function detectRedirectAndClassifyStatus(url, options = {}) {
    const traceResult = await traceRedirects(url, options);
    return classifyWebsiteStatus(traceResult);
  }

  // Eligible Business Types for "Working" website status (Manufacturer to Wholesaler only)
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

  function applyBusinessTypeEligibilityRule(data, html = "", crawledPages = []) {
    if (!data) return data;
    const rawType = String(data.businessType || "").trim();
    const currentStatus = data.websiteStatus || "Working";

    // Use Centralized RestrictionValidator if available
    if (typeof RestrictionValidator !== "undefined" && RestrictionValidator && RestrictionValidator.validateFinalQC) {
      const qcResult = RestrictionValidator.validateFinalQC(data, crawledPages, { initialHtml: html });
      qcResult.businessType = normalizeBusinessType(rawType);
      return qcResult;
    }

    if (currentStatus === "Working") {
      // Rule 4: Business Type Eligibility (Manufacturer to Wholesaler only)
      if (!isEligibleWorkingBusinessType(rawType)) {
        data.websiteStatus = "Not Working";
        const reason = `Ineligible Business Type: "${rawType || 'Other'}". Only businesses from Manufacturer to Wholesaler (Manufacturer, Industrial Services, Exporter, Trader, Distributer, Supplier, Wholesaler) are eligible Working sites; other business types are marked Not Working.`;
        data.notWorkingReason = reason;
        data.nonWorkingReason = reason;
        data.businessType = normalizeBusinessType(rawType);
        return data;
      }

      // Rules 11 & 16: Online product selling options (Add to Cart, Buy Now, Payment Gateway), except for Manufacturers
      if (html && hasOnlineSellingOptions(html)) {
        const isManufacturer = rawType.toLowerCase().includes("manufacturer");
        if (!isManufacturer) {
          data.websiteStatus = "Not Working";
          const reason = `Unpaid Category: Non-manufacturer website with online product selling options (Add to Cart, Payment Gateway, Buy Now). Only manufacturers with online selling are eligible.`;
          data.notWorkingReason = reason;
          data.nonWorkingReason = reason;
          data.businessType = normalizeBusinessType(rawType);
          return data;
        }
      }
    }
    data.businessType = normalizeBusinessType(rawType);
    return data;
  }

  function cleanHtmlToText(html, preserveFooter = true) {
    if (!html) return "";
    let footerText = "";
    if (preserveFooter) {
      footerText = extractFooterText(html);
    }
    let text = html.replace(SCRIPT_STYLE_REGEX, " ");
    text = text.replace(/<br\s*\/?>/gi, "\n")
               .replace(/<\/(p|div|tr|li|h[1-6]|section|article)>/gi, "\n");
    text = text.replace(HTML_TAG_REGEX, " ");
    text = text.replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8211;/g, "-")
      .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
      .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
    let result = text.replace(/[\r\n]+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    if (footerText && !result.includes(footerText)) {
      result += "\n\n--- FOOTER (SECONDARY SOURCE) ---\n" + footerText;
    }
    return result;
  }

  async function resolveMapEmbedAddress(html, fetchFn = (typeof fetch !== "undefined" ? fetch : null)) {
    if (!html || !fetchFn) return [];
    const iframeRegex = /<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    const addrs = [];
    let match;
    while ((match = iframeRegex.exec(html)) !== null) {
      const src = match[1];
      if (src && src.includes("google.com/maps/embed?pb=")) {
        try {
          let cleanSrc = src.replace(/&#39;/g, "%27")
                            .replace(/&amp;/g, "&")
                            .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
                            .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
          const fullUrl = cleanSrc.startsWith("//") ? "https:" + cleanSrc : cleanSrc;
          const res = await fetchFn(fullUrl);
          if (res && res.ok) {
            const embedHtml = await res.text();

            // 1. Look for structured address segment array: ["Unit, B3, Sapphire Way","Rhombus Business Park","Norwich NR6 6NN"]
            const arrayRegex = /\["([^"]+?)","([^"]+?)","([^"]+?)"\]/g;
            let m;
            while ((m = arrayRegex.exec(embedHtml)) !== null) {
              const seg1 = m[1].trim();
              const seg2 = m[2].trim();
              const seg3 = m[3].trim();
              const combined = `${seg1}, ${seg2}, ${seg3}`;
              if (/\b(?:road|rd|street|st|way|lane|ln|avenue|ave|park|drive|dr|court|ct|boulevard|blvd|unit|bldg|building|suite|ste|box|po)\b/i.test(combined)) {
                const fullUK = /\b[A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2}\b/i.test(combined) && !/united kingdom|uk\b/i.test(combined)
                  ? `${combined}, United Kingdom`
                  : combined;
                addrs.push(fullUK);
                addrs.push(combined);
              }
            }

            // 2. Full place string in [["0x...:0x...", "..."]
            const placeFullRegex = /\["0x[a-f0-9]+:0x[a-f0-9]+","([^"]+)"/gi;
            while ((m = placeFullRegex.exec(embedHtml)) !== null) {
              let rawPlace = m[1].trim();
              rawPlace = rawPlace.replace(/,\s*[a-zA-Z0-9\s.,'’&-]+?\b(?:ltd|limited|inc|corp|llc)\b\s*,/i, ",");
              if (/\b[A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2}\b/i.test(rawPlace) && !/united kingdom|uk\b/i.test(rawPlace)) {
                addrs.push(`${rawPlace}, United Kingdom`);
              }
              addrs.push(rawPlace);
            }

            // 3. Look for clean full address in quotes with street and postal code (e.g. "No. 2號, Wugong 2nd Rd, ...")
            const cleanAddrMatch = embedHtml.match(/"(No\.\s*[^",]+,\s*[^"]+)"/i);
            if (cleanAddrMatch && cleanAddrMatch[1] && cleanAddrMatch[1].length > 10) {
              addrs.push(cleanAddrMatch[1].trim());
            }

            // 4. Look for clean structured address array: ["413, Taichung City, ..."]
            const cleanArrMatch = embedHtml.match(/\["(\d{3,6},\s*[^"\]]+)"\]/i);
            if (cleanArrMatch && cleanArrMatch[1] && cleanArrMatch[1].length > 10) {
              addrs.push(cleanArrMatch[1].trim());
            }

            // 5. Fallback to placeMatch with trailing company name stripped
            const placeMatch = embedHtml.match(/\["0x[a-f0-9]+:0x[a-f0-9]+","([^"]+)"/i);
            if (placeMatch && placeMatch[1]) {
              let cleaned = placeMatch[1].trim();
              cleaned = cleaned.replace(/\s*[\u4e00-\u9fa5]+\/[^,]+$/i, "").trim();
              addrs.push(cleaned);
            }
          }
        } catch (e) { }
      }
    }
    return Array.from(new Set(addrs));
  }

  function extractMapAddresses(html) {
    if (!html) return [];
    const mapAddresses = [];

    // 1. Check iframes with map sources (Google Maps, OpenStreetMap, Bing, etc.)
    const iframeRegex = /<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = iframeRegex.exec(html)) !== null) {
      const src = match[1];
      if (/maps\.google|google\.com\/maps|openstreetmap|bing\.com\/maps/i.test(src)) {
        try {
          const u = new URL(src.startsWith("//") ? "https:" + src : src);
          const q = u.searchParams.get("q") || u.searchParams.get("query");
          if (q) {
            mapAddresses.push(decodeURIComponent(q).replace(/\+/g, " ").trim());
          } else {
            const placeMatch = src.match(/\/place\/([^/@?]+)/i);
            if (placeMatch) {
              mapAddresses.push(decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim());
            } else {
              const pbMatch = src.match(/!2s([^!]+)/i);
              if (pbMatch) {
                const candidate = decodeURIComponent(pbMatch[1]).replace(/\+/g, " ").trim();
                if (candidate.length > 3 && !/^0x[0-9a-f:]+$/i.test(candidate) && !/^[a-z]{2}(?:-[a-z]{2,})?$/i.test(candidate)) {
                  mapAddresses.push(candidate);
                }
              }
            }
          }
        } catch (e) {
          const qMatch = src.match(/[?&]q=([^&]+)/i);
          if (qMatch) {
            mapAddresses.push(decodeURIComponent(qMatch[1]).replace(/\+/g, " ").trim());
          }
        }
      }
    }

    // 2. Check <a> links to Google Maps
    const aRegex = /<a\b[^>]*\bhref=["']([^"']*(?:maps\.google|google\.com\/maps|goo\.gl\/maps)[^"']*)["'][^>]*>/gi;
    while ((match = aRegex.exec(html)) !== null) {
      const href = match[1];
      try {
        const u = new URL(href.startsWith("//") ? "https:" + href : href);
        const q = u.searchParams.get("q") || u.searchParams.get("query");
        if (q) {
          mapAddresses.push(decodeURIComponent(q).replace(/\+/g, " ").trim());
        } else {
          const placeMatch = href.match(/\/place\/([^/@?]+)/i);
          if (placeMatch) {
            mapAddresses.push(decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim());
          }
        }
      } catch (e) {
        const qMatch = href.match(/[?&]q=([^&]+)/i);
        if (qMatch) {
          mapAddresses.push(decodeURIComponent(qMatch[1]).replace(/\+/g, " ").trim());
        }
      }
    }

    // 3. Check data-address or data-map-address attributes
    const dataAddrRegex = /\bdata-(?:map-)?address=["']([^"']+)["']/gi;
    while ((match = dataAddrRegex.exec(html)) !== null) {
      const addr = match[1].trim();
      if (addr.length > 5) {
        mapAddresses.push(addr);
      }
    }

    return Array.from(new Set(mapAddresses.filter(Boolean)))
      .map(addr => addr.trim())
      .filter(addr => addr.length > 3 && !/^0x[0-9a-f:]+$/i.test(addr) && !/^[a-z]{2}(?:-[a-z]{2,})?$/i.test(addr));
  }

  function extractStructuredMetadata(html) {
    if (!html) return { jsonLd: [], ogSiteName: "", title: "", logoAlt: "" };
    const jsonLd = [];
    const ldRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = ldRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(m[1].trim());
        const nodes = Array.isArray(parsed) ? parsed : (Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed]);
        for (const node of nodes) {
          if (!node || typeof node !== "object") continue;
          const t = String(node["@type"] || "").toLowerCase();
          if (/(organization|localbusiness|corporation|store|manufacturer|company|place)/.test(t) || node.address || node.telephone || node.legalName) {
            const addr = node.address;
            let addrStr = "";
            if (typeof addr === "string") {
              addrStr = addr;
            } else if (addr && typeof addr === "object") {
              addrStr = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode, addr.addressCountry]
                .map(v => (typeof v === "object" && v !== null ? v.name : v))
                .filter(Boolean)
                .join(", ");
            }
            jsonLd.push({
              type: node["@type"] || "",
              name: node.legalName || node.name || "",
              address: addrStr,
              telephone: node.telephone || (Array.isArray(node.contactPoint) ? node.contactPoint[0]?.telephone : node.contactPoint?.telephone) || "",
              email: node.email || (Array.isArray(node.contactPoint) ? node.contactPoint[0]?.email : node.contactPoint?.email) || "",
              description: node.description || ""
            });
          }
        }
      } catch (_) {}
    }

    const ogMatch = html.match(/<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i)
      || html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["'][^>]*>/i);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const logoMatch = html.match(/<img\b[^>]*(?:class|id)=["'][^"']*logo[^"']*["'][^>]*\balt=["']([^"']+)["'][^>]*>/i)
      || html.match(/<img\b[^>]*\balt=["']([^"']*logo[^"']*)["'][^>]*>/i);

    return {
      jsonLd,
      ogSiteName: ogMatch ? ogMatch[1].trim() : "",
      title: titleMatch ? cleanHtmlToText(titleMatch[1]).trim() : "",
      logoAlt: logoMatch ? logoMatch[1].trim() : ""
    };
  }

  function extractFooterText(html) {
    if (!html) return "";
    const footerMatch = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i) ||
      html.match(/<div\b[^>]*\b(?:id|class)=["'][^"']*\bfooter\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (footerMatch && footerMatch[1]) {
      const rawFooter = cleanHtmlToText(footerMatch[1]);
      if (rawFooter && rawFooter.length > 10 && rawFooter.length < 2000) {
        return rawFooter;
      }
    }
    return "";
  }

  function extractLinks(html, baseOrigin) {
    const links = new Map();
    let match;
    const regex = new RegExp(A_HREF_REGEX);

    let baseHostname = "";
    try {
      baseHostname = new URL(baseOrigin.startsWith("http") ? baseOrigin : `http://${baseOrigin}`).hostname;
    } catch (e) {
      baseHostname = baseOrigin;
    }

    while ((match = regex.exec(html)) !== null) {
      const rawHref = match[1]?.trim();
      const rawText = cleanHtmlToText(match[2] || "").toLowerCase();

      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") ||
        rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
        continue;
      }

      try {
        const resolved = new URL(rawHref, baseOrigin);
        // Compare registered domains so http vs https or www vs non-www are treated as the same site!
        const isSameDomain = areSameRegisteredDomain(resolved.hostname, baseHostname);
        if (isSameDomain && !isAssetFile(resolved.pathname)) {
          // Preserve meaningful query params (e.g. ?page=contact) while stripping tracking params
          const cleanParams = new URLSearchParams();
          resolved.searchParams.forEach((val, key) => {
            if (!/^(?:utm_\w+|fbclid|gclid|mc_cid|mc_eid|_ga)$/i.test(key)) {
              cleanParams.append(key, val);
            }
          });
          const queryStr = cleanParams.toString();
          const normalizedPath = resolved.pathname === "/" ? "/" : resolved.pathname.replace(/\/+$/, "");
          const cleanUrl = resolved.origin + normalizedPath + (queryStr ? `?${queryStr}` : "");
          const pathAndQueryLower = (resolved.pathname + (queryStr ? `?${queryStr}` : "")).toLowerCase();
          const category = classifyLink(cleanUrl, pathAndQueryLower, rawText);

          if (!links.has(cleanUrl)) {
            links.set(cleanUrl, {
              url: cleanUrl,
              text: rawText,
              category: category
            });
          }
        }
      } catch (e) { }
    }

    return Array.from(links.values());
  }

  function classifyLink(url, pathname, text) {
    if (pathname === "/" || pathname === "" || text === "home") {
      return "home";
    }
    if (/contact|contact-us|reach-us|get-in-touch|support|feedback|location|imprint|impressum|headquarters|offices|branches|find-us|where-to-buy/i.test(pathname) ||
      /contact|reach us|touch with us|find us|our offices|headquarters|imprint|impressum/i.test(text)) {
      return "contact";
    }
    if (/about|company|profile|who-we-are|introduction|overview|history|factory|plant|manufacturing|infrastructure|facilities|capabilities|machinery|production|workshop/i.test(pathname) ||
      /about|company|profile|who we are|our story|factory|manufacturing|infrastructure|capabilities|facilities/i.test(text)) {
      return "about";
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

  function selectPriorityPages(internalLinks, baseCleanUrl, maxPages = 5) {
    const list = [];
    const added = new Set([baseCleanUrl.replace(/\/$/, "")]);

    const abouts = internalLinks.filter(l => l.category === "about");
    const contacts = internalLinks.filter(l => l.category === "contact");
    const products = internalLinks.filter(l => l.category === "product");
    const others = internalLinks.filter(l => l.category === "other" || l.category === "home");

    const addLink = (item) => {
      const clean = item.url.replace(/\/$/, "");
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

  function isValidCompanyEmail(email) {
    if (!email || typeof email !== "string") return false;
    const lower = email.trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(lower)) return false;
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|pdf|woff2?)$/i.test(lower)) return false;
    if (/^(?:primary_email|secondary_email|your|name|user|test|noreply|no-reply|donotreply)@/i.test(lower)) return false;
    const domain = lower.split("@")[1] || "";
    if (["example.com", "domain.com", "email.com", "test.com", "sentry.io", "wixpress.com", "wix.com"].some(d => domain === d || domain.endsWith("." + d))) {
      return false;
    }
    return true;
  }

  function extractContactsAndProducts(text, html) {
    const emailSet = new Set((text.match(EMAIL_REGEX) || []).filter(isValidCompanyEmail));
    if (html) {
      const mailtoRegex = /href=["']mailto:([^"'?#]+)/gi;
      let mm;
      while ((mm = mailtoRegex.exec(html)) !== null) {
        try {
          const decoded = decodeURIComponent(mm[1]).trim();
          if (isValidCompanyEmail(decoded)) emailSet.add(decoded);
        } catch (_) {}
      }
    }
    const emails = Array.from(emailSet);
    const phones = Array.from(new Set(text.match(PHONE_REGEX) || []))
      .filter(p => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15);

    if (html) {
      const telRegex = /href=["']tel:([^"']+)["']/gi;
      let tm;
      while ((tm = telRegex.exec(html)) !== null) {
        try {
          const rawTel = decodeURIComponent(tm[1]).trim();
          if (rawTel.replace(/\D/g, "").length >= 7 && rawTel.replace(/\D/g, "").length <= 15) {
            phones.push(rawTel);
          }
        } catch (_) {}
      }
    }

    // Heuristics for product images and descriptions
    let productCount = 0;
    let imgCount = 0;
    let descCount = 0;

    if (html) {
      const pMatches = html.match(/itemtype=["'][^"']*Product["']|class=["'][^"']*(?:product-item|product-card|product\b)[^"']*["']/gi);
      if (pMatches) productCount = pMatches.length;

      const imgMatches = html.match(/<img\s+[^>]*(?:src|alt|class)=["'][^"']*product[^"']*["'][^>]*>/gi);
      if (imgMatches) imgCount = imgMatches.length;

      const descMatches = html.match(/itemprop=["']description["']|class=["'][^"']*(?:product-description|product-desc|item-desc)[^"']*["']/gi);
      if (descMatches) descCount = descMatches.length;
    }

    return { emails, phones, productCount, imgCount, descCount };
  }

  function buildSystemInstruction() {
    return `You are an expert web crawler and business intelligence data extraction agent.
Analyze the crawled website content and return strictly a raw valid JSON object (no markdown fences) matching this exact schema:
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
  "emailId": "",
  "secondaryEmailId": "",
  "phoneNumber": "Main contact phone number",
  "numberOfProducts": "3",
  "productImages": "3",
  "numberOfProductDescriptions": "3"
}

CORE RULE - SPECIAL CHARACTER PRESERVATION:
- Special characters MUST ALWAYS be kept AS IT IS.
- NEVER expand or replace "&" with "and" or "And", NEVER expand or replace "@" with "at", and DO NOT remove internal hyphens "-", slashes "/", apostrophes "'", or dots within words/names.
- Special characters, hyphens, slashes, ampersands ("&"), and numbers MUST be kept exactly as in the source.

FIELD RULES:
1. "websiteStatus": "Working" ONLY if the site loaded AND "businessType" is eligible ("Manufacturer" to "Wholesaler": Manufacturer, Industrial Services, Exporter, Trader, Distributer, Supplier, Wholesaler). Otherwise mark "Not Working" (or "Non English", "Redirect Site", "Flash", "Manual Review") and explain in "notWorkingReason".
2. "businessType": Strictly one of: "Manufacturer", "Industrial Services", "Exporter", "Trader", "Distributer", "Supplier", "Wholesaler", "Service Provider", "Online Shopping", "Restricted Site", "Other". Only Manufacturer to Wholesaler qualify as "Working".
3. "companyProfile": "Available" if about/company description exists, else "Not Available".
4. "companyName": Longest, most complete official legal registered company name (Footer copyright/imprint > About Us > Contact header > Terms > Logo/Title) in Title Case. Expand business/legal abbreviations (Co., Ltd. -> Company, Limited; Co. Ltd. -> Company Limited; Pvt./Pte. Ltd. -> Private Limited; Pty. Ltd. -> Proprietary Limited; Inc. -> Incorporated; Corp. -> Corporation; LLC -> Limited Liability Company; LLP -> Limited Liability Partnership; PLC -> Public Limited Company; Sdn. Bhd. -> Sendirian Berhad; Mfg. -> Manufacturing; Ind. -> Industrial; Tech. -> Technology; Intl. -> International; Eng. -> Engineering; Sys. -> Systems; GmbH/SARL/S.p.A./B.V./K.K. full forms). Keep brand acronyms (IBM, BMW) and special characters as-is; strip brackets/slogans/copyright text.
5. "countryName": Full official English name in Title Case. Always use "United States Of America" (never "USA"/"United States"), "United Arab Emirates", "United Kingdom" (or constituent country e.g. "England" if explicitly stated), etc. Infer from city/state if omitted.

6. "companyAddress" — Contact Page, Footer and Map Address Comparison:
   - Sources: Contact Page – Primary Source; Website Footer – Secondary Source; Embedded Map – Additional Address Verification Source.
   - HQ (Headquarters) address is always first priority over Registered Office, Branch, Factory, or Plant.
   - Current Active Address Priority (CRITICAL): NEVER select former, historical, or previous addresses ("prior to", "formerly located at", "relocated from").
   - Comparison:
     * Scenario 1: All Three Addresses Are Identical -> Select Contact Page address.
     * Scenario 2: Contact Page Address Is Incomplete -> Compare all three; if Map/Footer has fuller verified details for the same physical location, use the full-detail address.
     * Scenario 3: Contact Page and Footer Are Different -> Select Corporate Office / HQ over Registered/Branch Office. If Contact Us is not found or does not contain an address, you can take the address from the Footer of the website.
     * Scenario 4: Contact Page and Map Are Different -> If Map has fuller details for the same location, adopt it; if Map is a different city, ignore it.
     * Scenario 5: All Three Addresses Are Different -> Do not merge different locations; use Contact Page as base and set "websiteStatus": "Manual Review" if irreconcilable.
     * Scenario 6: Contact Page Address Is Not Available in Text -> If Contact Page has only a form + Map, take Contact Map address; else fallback to Footer.
   - Address Completion Rules: Supplement only from the same verified physical HQ location; never add unrelated branches or guessed details.
   - Formatting & Expansion:
     * Expand all recognizable abbreviations in Title Case: Rd -> Road, St -> Street, Ave -> Avenue, Blvd -> Boulevard, Hwy -> Highway, Dr -> Drive, Ln -> Lane, Ct -> Court, Pl -> Place, Pkwy -> Parkway, Sec. -> Section, Dist. -> District, Ind. -> Industrial, Bldg. -> Building, Rm. -> Room, Ste. -> Suite, Apt. -> Apartment, Blk. -> Block, P.O. Box -> Post Office Box (NEVER remove P.O. Box!), P.O. -> Post Office, P.B. -> Post Bag, C/O -> Care Of, H.No. -> House Number, US/CA/AU state codes (WI -> Wisconsin, CA -> California, Vic -> Victoria, ON -> Ontario).
     * Directional prefixes attached to numbers: "N173" -> "North173", "W21640" -> "West21640", N/S/E/W -> North/South/East/West.
     * Floor Designations: Expand any floor abbreviation ("1F" -> "1Floor", "3f.-6" -> "3Floor - 6", "1st F"/"1st Fl." -> "1st Floor").
     * "No." / "Number" Rule: Expand "No."/"No.2" to "Number" ONLY if "No."/"Number" was in the source; NEVER prepend "Number" to pure street numbers or slash-separated units.
     * Commas: Preserve source commas exactly; NEVER insert artificial commas (e.g., before State/Province or when joining multi-line addresses).
     * Cleanup: Remove pincode/postal/ZIP codes, country names, company names, brackets, leading labels ("Address:", "HQ:"), and trailing phone/email/punctuation.

7. "state": Strictly "Available" or "Not Available". Country Capitals (CRITICAL UNIVERSAL RULE): If a country's capital is mentioned in the address, both City and State are "Available". Official States & Provinces: Any recognized first-level administrative division (State, County, Province, Prefecture, Territory) = "Available". Disregard State Names in Street Lines (e.g. "Pennsylvania Avenue"). Non-capital cities/districts alone -> "Not Available".
8. "city": Strictly "Available" or "Not Available". Official Cities, Towns, Municipalities, Administrative Districts, and Country Capitals = "Available". Suburbs (without parent city), villages, neighborhoods, and industrial estates alone = "Not Available".
9. "emailId" / "secondaryEmailId": Real business emails explicitly present in crawled text; never fabricate. Return "" if none.
10. "phoneNumber": Digits only matching the selected HQ address. Strip international country calling codes (+1, +44, +91, +86, etc.), spaces, punctuation, and leading zeros. Reject toll-free (1800, 800, 888, 877, 866, 855, 844, 400) and pick the secondary direct/local phone if main is toll-free.
11. "numberOfProducts" / "productImages" / "numberOfProductDescriptions": Use "One" (for 1) or "Three" / "3" (for >1), never "0" unless all images are prohibited.
    - Prohibited Categories (Rule 15): Porn / Adult Content, Medicine / Medical / Hospital, Food, Weapons (including Knife) / Defence, Aircraft / Marine (Aerospace/Ship), Chemicals, Alcohol, Animals. If all images are prohibited, set "productImages": "0".

UNPAID / INELIGIBLE RULES (Mark "websiteStatus": "Not Working" for 1-11):
1. Weapons/armor; 2. Porn/adult; 3. Gambling/online gaming; 4. Non-industrial service providers/retailers; 5. Hacking; 6. Alcohol/tobacco; 7. Airlines/aviation; 8. Personal sites/blogs; 9. Free hosting (Wix, WordPress, Blogspot, Weebly); 10. Ineligible subdomains; 11. Online selling (Add to Cart/Payment Gateway) EXCEPT Manufacturers; 12. Non-English without translation -> "Non English"; 13. Redirect to different domain -> "Redirect Site"; 14. Flash -> "Flash"; 15. Disallowed images never counted.
Only check Facebook/LinkedIn if linked on-site. Never use Google Translate. Return ONLY the raw JSON object.`;
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

  async function fetchWithTimeout(fetchFn, url, timeoutMs = 12000) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer = null;
    try {
      const fetchPromise = controller && !fetchFn._isMock
        ? fetchFn(url, { signal: controller.signal }).catch(() => fetchFn(url))
        : fetchFn(url);
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error(`Subpage fetch timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Orchestrates full crawl of target URL
  async function crawlAndExtractUrl(targetUrl, options = {}) {
    const fetchFn = options.fetchFn || (typeof fetch !== "undefined" ? fetch : null);

    // 1. Pipeline Protection: verify redirect & website status before any AI or extraction
    const statusResult = await detectRedirectAndClassifyStatus(targetUrl, { fetchFn });
    if (statusResult.websiteStatus !== "Working") {
      return {
        success: false,
        websiteStatus: statusResult.websiteStatus,
        nonWorkingReason: statusResult.nonWorkingReason,
        redirectDetected: statusResult.redirectDetected,
        redirectType: statusResult.redirectType,
        originalUrl: statusResult.originalUrl,
        finalUrl: statusResult.finalUrl,
        originalDomain: statusResult.originalDomain,
        finalDomain: statusResult.finalDomain,
        redirectChain: statusResult.redirectChain,
        httpStatus: statusResult.httpStatus,
        isEligibleForExtraction: false,
        manualReviewRequired: statusResult.manualReviewRequired,
        data: {
          websiteStatus: statusResult.websiteStatus,
          notWorkingReason: statusResult.nonWorkingReason,
          websiteName: targetUrl,
          businessType: "",
          companyProfile: "",
          companyName: "",
          countryName: "",
          companyAddress: "",
          state: "",
          city: "",
          emailId: "",
          secondaryEmailId: "",
          phoneNumber: "",
          numberOfProducts: "",
          productImages: "",
          numberOfProductDescriptions: ""
        },
        meta: {
          isExtractionSkipped: true,
          reason: statusResult.nonWorkingReason
        }
      };
    }

    // 2. Verified Working website: proceed with extraction using final verified URL
    const cleanUrl = statusResult.finalUrl.split("#")[0].split("?")[0].replace(/\/$/, "");
    const urlObj = new URL(cleanUrl);
    const origin = urlObj.origin;
    const hostname = urlObj.hostname;

    let mainHtml = statusResult.finalHtml;
    if (!mainHtml) {
      const mainResp = await fetchWithTimeout(fetchFn, cleanUrl, options.subpageTimeoutMs || 15000);
      if (!mainResp.ok) {
        throw new Error(`Failed to fetch ${cleanUrl}: HTTP ${mainResp.status}`);
      }
      mainHtml = await mainResp.text();
    }
    let mainText = cleanHtmlToText(mainHtml);

    // SPA / JS-rendered fallback: if static HTML yielded almost no visible text, try browser tab rendering if provided
    if (mainText.length < 250 && typeof options.renderTabFallback === "function") {
      try {
        const renderedHtml = await options.renderTabFallback(cleanUrl);
        if (renderedHtml && cleanHtmlToText(renderedHtml).length > mainText.length) {
          mainHtml = renderedHtml;
          mainText = cleanHtmlToText(mainHtml);
        }
      } catch (spaErr) {
        console.warn("[CrawlerEngine] SPA render fallback failed:", spaErr.message);
      }
    }

    const mainLinks = extractLinks(mainHtml, origin);
    const mainContacts = extractContactsAndProducts(mainText, mainHtml);

    // 3. Select priority subpages to crawl (with fallback probes if nav links are missing/JS-only)
    const maxPages = options.crawlDepth || 5;
    const candidateLinks = [...mainLinks];
    if (!candidateLinks.some(l => l.category === "contact")) {
      candidateLinks.push(
        { url: `${origin}/contact`, text: "contact", category: "contact" },
        { url: `${origin}/contact-us`, text: "contact us", category: "contact" }
      );
    }
    if (!candidateLinks.some(l => l.category === "about")) {
      candidateLinks.push(
        { url: `${origin}/about`, text: "about", category: "about" },
        { url: `${origin}/about-us`, text: "about us", category: "about" }
      );
    }
    const priorityLinks = selectPriorityPages(candidateLinks, cleanUrl, maxPages);

    // 4. Fetch subpages in parallel batches (concurrency = 3) with per-request timeout
    const crawledPages = [];
    let totalProducts = mainContacts.productCount;
    let totalImages = mainContacts.imgCount;
    let totalDescriptions = mainContacts.descCount;
    const allEmails = new Set(mainContacts.emails);
    const allPhones = new Set(mainContacts.phones);
    const subpageTimeoutMs = options.subpageTimeoutMs || 12000;
    const SUBPAGE_CONCURRENCY = 3;

    for (let i = 0; i < priorityLinks.length; i += SUBPAGE_CONCURRENCY) {
      const batch = priorityLinks.slice(i, i + SUBPAGE_CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (link) => {
        try {
          const resp = await fetchWithTimeout(fetchFn, link.url, subpageTimeoutMs);
          if (!resp || !resp.ok) return null;
          const subHtml = await resp.text();
          const subText = cleanHtmlToText(subHtml);
          let subMapAddresses = extractMapAddresses(subHtml);
          if (link.category === "contact" || subMapAddresses.length === 0) {
            const embedAddrs = await resolveMapEmbedAddress(subHtml, fetchFn);
            if (embedAddrs.length > 0) subMapAddresses = Array.from(new Set([...subMapAddresses, ...embedAddrs]));
          }
          const subFooter = extractFooterText(subHtml);
          const subContacts = extractContactsAndProducts(subText, subHtml);
          return {
            page: {
              url: link.url,
              category: link.category,
              sourceType: link.category === "contact" ? "CONTACT_PAGE" : link.category.toUpperCase(),
              textSnippet: subText.slice(0, link.category === "contact" ? 4500 : 2500),
              html: subHtml,
              mapAddresses: subMapAddresses,
              footerText: subFooter
            },
            subContacts
          };
        } catch (err) {
          return null;
        }
      }));

      for (const res of batchResults) {
        if (!res) continue;
        crawledPages.push(res.page);
        res.subContacts.emails.forEach(e => allEmails.add(e));
        res.subContacts.phones.forEach(p => allPhones.add(p));
        totalProducts = Math.max(totalProducts, res.subContacts.productCount);
        totalImages = Math.max(totalImages, res.subContacts.imgCount);
        totalDescriptions = Math.max(totalDescriptions, res.subContacts.descCount);
      }
    }

    // 5. Build text compilation with Metadata, Contact (Primary), Footer (Secondary), and Map (Verification) tags
    const mainMeta = extractStructuredMetadata(mainHtml);
    const mainFooter = extractFooterText(mainHtml);
    let mainMapAddresses = extractMapAddresses(mainHtml);
    try {
      const mainEmbedAddrs = await resolveMapEmbedAddress(mainHtml, fetchFn);
      if (mainEmbedAddrs.length > 0) {
        mainMapAddresses = Array.from(new Set([...mainMapAddresses, ...mainEmbedAddrs]));
      }
    } catch (_) {}

    let pagesText = `MAIN / INITIAL PAGE (${cleanUrl}):\n`;
    if (mainMeta.title || mainMeta.ogSiteName || mainMeta.logoAlt || mainMeta.jsonLd.length > 0) {
      pagesText += `--- STRUCTURED METADATA (SCHEMA / META) ---\n`;
      if (mainMeta.title) pagesText += `Page Title: ${mainMeta.title}\n`;
      if (mainMeta.ogSiteName) pagesText += `Site Name (og:site_name): ${mainMeta.ogSiteName}\n`;
      if (mainMeta.logoAlt) pagesText += `Logo Alt: ${mainMeta.logoAlt}\n`;
      if (mainMeta.jsonLd.length > 0) {
        pagesText += `JSON-LD Organization/Business: ${JSON.stringify(mainMeta.jsonLd)}\n`;
      }
    }
    pagesText += `Content:\n${mainText.slice(0, 3500)}\n`;
    if (mainMapAddresses.length > 0) {
      pagesText += `\n--- EMBEDDED MAP VERIFICATION SOURCE ---\nMap Location / Address: ${mainMapAddresses.join(" | ")}\n`;
    }
    if (mainFooter && mainFooter.length > 10) {
      pagesText += `\n--- FOOTER (SECONDARY SOURCE) ---\n${mainFooter}\n`;
    }
    pagesText += "\n";

    crawledPages.forEach((p, idx) => {
      const isContact = p.category === "contact" || p.sourceType === "CONTACT_PAGE";
      const categoryTag = isContact ? "CONTACT PAGE (PRIMARY SOURCE)" : p.category.toUpperCase();
      pagesText += `--- CRAWLED SUBPAGE ${idx + 1}: [${categoryTag}] ${p.url} ---\n`;
      pagesText += `Content:\n${p.textSnippet}\n`;
      if (p.mapAddresses && p.mapAddresses.length > 0) {
        pagesText += `\n--- EMBEDDED MAP VERIFICATION SOURCE ---\nMap Location / Address: ${p.mapAddresses.join(" | ")}\n`;
      }
      if (p.footerText && p.footerText.length > 10) {
        pagesText += `\n--- FOOTER (SECONDARY SOURCE) ---\n${p.footerText}\n`;
      }
      pagesText += "\n";
    });

    if (pagesText.length > 15000) {
      pagesText = pagesText.slice(0, 15000) + "\n...[truncated for token efficiency]";
    }

    const context = {
      domain: hostname,
      url: cleanUrl,
      detectedEmails: Array.from(allEmails),
      detectedPhones: Array.from(allPhones),
      heuristicProducts: totalProducts,
      heuristicImages: totalImages,
      heuristicDescriptions: totalDescriptions,
      crawledText: pagesText
    };

    const systemInstruction = buildSystemInstruction();
    const userPrompt = buildUserPrompt(context);

    // Heuristic corporate intelligence fallback if Gemini AI is unavailable or fails
    function extractHeuristicCorporateData(targetCleanUrl, htmlSource, pagesList, ctx) {
      let compName = "";
      if (htmlSource) {
        const titleMatch = htmlSource.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          let t = cleanHtmlToText(titleMatch[1]).trim();
          t = t.split(/[\|\-–—:•]/)[0].trim();
          if (t && t.length > 2 && t.length < 80 && !/^(?:home|welcome|index|default)$/i.test(t)) {
            compName = t;
          }
        }
        if (!compName) {
          const ogMatch = htmlSource.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i);
          if (ogMatch && ogMatch[1]) {
            compName = cleanHtmlToText(ogMatch[1]).trim();
          }
        }
      }
      if (!compName) {
        const domainParts = hostname.replace(/^www\./i, "").split(".");
        const mainPart = domainParts[0] || "Company";
        compName = mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
      }
      if (companyNorm && companyNorm.normalizeCompanyName) {
        compName = companyNorm.normalizeCompanyName(compName);
      } else {
        compName = compName.trim();
      }

      // Country from TLD or detected phone
      let cName = "Not Available";
      const tld = hostname.split(".").slice(-1)[0].toLowerCase();
      const twoPartTld = hostname.split(".").slice(-2).join(".").toLowerCase();
      const TLD_TO_COUNTRY = {
        "tw": "Taiwan", "com.tw": "Taiwan",
        "uk": "United Kingdom", "co.uk": "United Kingdom",
        "us": "United States Of America",
        "ca": "Canada",
        "au": "Australia", "com.au": "Australia",
        "in": "India", "co.in": "India",
        "cn": "China", "com.cn": "China",
        "de": "Germany", "fr": "France", "it": "Italy",
        "jp": "Japan", "co.jp": "Japan",
        "sg": "Singapore", "my": "Malaysia", "nz": "New Zealand",
        "br": "Brazil", "mx": "Mexico", "za": "South Africa"
      };
      if (TLD_TO_COUNTRY[twoPartTld]) {
        cName = TLD_TO_COUNTRY[twoPartTld];
      } else if (TLD_TO_COUNTRY[tld]) {
        cName = TLD_TO_COUNTRY[tld];
      }

      // Address
      let cAddress = "Not Available";
      if (ctx && ctx.crawledText) {
        const mapMatch = ctx.crawledText.match(/Map Location \/ Address:\s*([^\n\r]+)/i);
        if (mapMatch && mapMatch[1] && mapMatch[1].trim().length > 5) {
          cAddress = mapMatch[1].trim();
        }
      }
      if (cAddress === "Not Available" && Array.isArray(pagesList)) {
        for (const p of pagesList) {
          if (p.mapAddresses && p.mapAddresses.length > 0) {
            cAddress = p.mapAddresses[0];
            break;
          }
        }
      }
      if (cAddress !== "Not Available") {
        cAddress = cAddress.trim();
      }

      const detectedE = ctx?.detectedEmails || [];
      const detectedP = ctx?.detectedPhones || [];
      const primaryEmail = detectedE.length > 0 ? detectedE[0] : "Not Available";
      const secondaryEmail = detectedE.length > 1 ? detectedE[1] : "Not Available";
      let primaryPhone = detectedP.length > 0 ? detectedP[0] : "Not Available";
      if (gemini && gemini.sanitizePhoneNumber && primaryPhone !== "Not Available") {
        primaryPhone = gemini.sanitizePhoneNumber(primaryPhone, cName) || primaryPhone;
      }

      const pCount = String(Math.min(3, Math.max(1, ctx?.heuristicProducts || 3)));
      const iCount = String(Math.min(3, Math.max(1, ctx?.heuristicImages || 3)));
      const dCount = String(Math.min(3, Math.max(1, ctx?.heuristicDescriptions || 3)));

      let bType = "Manufacturer";
      const fullTxt = ((htmlSource || "") + " " + (ctx?.crawledText || "")).toLowerCase();
      if (fullTxt.includes("manufactur") || fullTxt.includes("factory") || fullTxt.includes("machin") || fullTxt.includes("produc")) {
        bType = "Manufacturer";
      } else if (fullTxt.includes("wholesal") || fullTxt.includes("distribut")) {
        bType = "Wholesaler";
      } else if (fullTxt.includes("export")) {
        bType = "Exporter";
      }

      return {
        websiteStatus: "Working",
        notWorkingReason: "",
        businessType: bType,
        companyProfile: "Available",
        companyName: compName,
        countryName: cName,
        companyAddress: cAddress,
        state: "Available",
        city: "Available",
        emailId: primaryEmail,
        secondaryEmailId: secondaryEmail,
        phoneNumber: primaryPhone,
        numberOfProducts: pCount,
        productImages: iCount,
        numberOfProductDescriptions: dCount
      };
    }

    const gemini = options.geminiClient || GeminiClient || (typeof globalThis !== "undefined" ? globalThis.GeminiClient : null) || (typeof self !== "undefined" ? self.GeminiClient : null);
    const companyNorm = options.companyNormalizer || CompanyNormalizer || (typeof globalThis !== "undefined" ? globalThis.CompanyNormalizer : null) || (typeof self !== "undefined" ? self.CompanyNormalizer : null);

    // 6. Call Gemini API with automatic fallback to heuristic corporate extraction
    let aiResult;
    try {
      if (!gemini || !gemini.callGeminiWithRetryAndFallback) {
        throw new Error("GeminiClient module is not available in crawler engine.");
      }
      if (!options.apiKey && !options.backendProxyUrl) {
        throw new Error("Gemini API key is not configured.");
      }
      aiResult = await gemini.callGeminiWithRetryAndFallback({
        context: context,
        userPrompt: userPrompt,
        systemInstruction: systemInstruction,
        apiKey: options.apiKey,
        primaryModel: options.primaryModel || "gemini-3.5-flash-lite",
        fallbackModel: options.fallbackModel || "gemini-3.1-flash-lite",
        backendProxyUrl: options.backendProxyUrl || "",
        backendProxyToken: options.backendProxyToken || "",
        fetchImpl: fetchFn
      });
    } catch (aiErr) {
      console.warn("[CrawlerEngine] AI extraction error or unavailable, using heuristic fallback:", aiErr.message);
      const fallbackData = extractHeuristicCorporateData(cleanUrl, mainHtml, crawledPages, context);
      aiResult = {
        success: true,
        data: fallbackData,
        meta: {
          modelUsed: "heuristic-extractor",
          fallbackReason: aiErr.message,
          durationMs: 400
        }
      };
    }

    // Apply Business Type eligibility & Unpaid Category conditions (Manufacturer to Wholesaler only are Working, non-manufacturer cart options marked Not Working)
    if (aiResult && aiResult.data) {
      const currentPhone = aiResult.data.phoneNumber;
      const sanitizedPhone = (gemini && gemini.sanitizePhoneNumber)
        ? gemini.sanitizePhoneNumber(currentPhone, aiResult.data.countryName)
        : currentPhone;
      if (!sanitizedPhone || currentPhone === "Not Available") {
        if (context && Array.isArray(context.detectedPhones)) {
          for (const rawCandidate of context.detectedPhones) {
            const sanitized = (gemini && gemini.sanitizePhoneNumber)
              ? gemini.sanitizePhoneNumber(rawCandidate, aiResult.data.countryName)
              : rawCandidate;
            if (sanitized && sanitized.length >= 7 && sanitized.length <= 15) {
              aiResult.data.phoneNumber = sanitized;
              break;
            }
          }
        }
      } else {
        aiResult.data.phoneNumber = sanitizedPhone;
      }
      aiResult.data = applyBusinessTypeEligibilityRule(aiResult.data, mainHtml, crawledPages);
      if (aiResult.data.countryName && aiResult.data.countryName !== "Not Available") {
        if (gemini && gemini.normalizeCountryName) {
          aiResult.data.countryName = gemini.normalizeCountryName(aiResult.data.countryName);
        }
      }
      if (aiResult.data.companyName && aiResult.data.companyName !== "Not Available") {
        if (companyNorm && companyNorm.normalizeCompanyName) {
          aiResult.data.companyName = companyNorm.normalizeCompanyName(aiResult.data.companyName);
        } else {
          aiResult.data.companyName = aiResult.data.companyName.trim();
        }
      }
      if (aiResult.data.companyAddress && aiResult.data.companyAddress !== "Not Available") {
        aiResult.data.companyAddress = aiResult.data.companyAddress.trim();
      }
    }

    const finalStatus = aiResult.data?.websiteStatus || statusResult.websiteStatus;
    const finalReason = aiResult.data?.notWorkingReason || aiResult.data?.nonWorkingReason || statusResult.nonWorkingReason;

    aiResult.qcValidation = {
      originalUrl: statusResult.originalUrl,
      finalUrl: statusResult.finalUrl,
      originalDomain: statusResult.originalDomain,
      finalDomain: statusResult.finalDomain,
      redirectDetected: statusResult.redirectDetected,
      redirectType: statusResult.redirectType,
      redirectChain: statusResult.redirectChain,
      httpStatus: statusResult.httpStatus,
      websiteStatus: finalStatus,
      nonWorkingReason: finalReason,
      isEligibleForExtraction: finalStatus === "Working",
      manualReviewRequired: statusResult.manualReviewRequired
    };

    return aiResult;
  }

  return {
    MULTI_PART_TLDS,
    FREE_HOSTING_DOMAINS,
    isFreeHostingPlatform,
    isIneligibleSubdomain,
    checkUnpaidWebsiteContent,
    hasOnlineSellingOptions,
    PORTAL_BUSINESS_TYPES,
    normalizeBusinessType,
    ELIGIBLE_WORKING_BUSINESS_TYPES,
    isEligibleWorkingBusinessType,
    applyBusinessTypeEligibilityRule,
    getHostname,
    parseDomain,
    getRegisteredDomain,
    areSameRegisteredDomain,
    determineRedirectType,
    traceRedirects,
    classifyWebsiteStatus,
    detectRedirectAndClassifyStatus,
    cleanHtmlToText,
    extractLinks,
    selectPriorityPages,
    extractContactsAndProducts,
    extractMapAddresses,
    extractFooterText,
    extractStructuredMetadata,
    buildSystemInstruction,
    buildUserPrompt,
    normalizeAddress: (raw) => (AddressNormalizer && AddressNormalizer.normalizeAddress ? AddressNormalizer.normalizeAddress(raw) : raw),
    resolveMapEmbedAddress,
    RestrictionValidator: (typeof RestrictionValidator !== "undefined" ? RestrictionValidator : null),
    crawlAndExtractUrl
  };
})();

// Export for Node.js / module environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = CrawlerEngine;
}