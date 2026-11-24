// Universal Crawler & Prompt Engine for Site Intelligence Crawler
// Compatible with Service Worker (MV3), Popup, Content Script, and Node.js

const CrawlerEngine = (() => {
  const AddressNormalizer = (typeof require !== "undefined")
    ? (function () { try { return require("./addressNormalizer.js"); } catch (e) { return null; } })()
    : (typeof window !== "undefined" && window.AddressNormalizer ? window.AddressNormalizer : null);

  // Regex patterns for HTML processing in environments without DOM
  const SCRIPT_STYLE_REGEX = /<(?:script|style|noscript|svg|canvas|iframe|template|nav)\b[^<]*(?:(?!<\/(?:script|style|noscript|svg|canvas|iframe|template|nav)>)<[^<]*)*<\/(?:script|style|noscript|svg|canvas|iframe|template|nav)>/gi;
  const HTML_TAG_REGEX = /<[^>]+>/g;
  const A_HREF_REGEX = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const PHONE_REGEX = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}/g;

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

  function hasOnlineSellingOptions(html) {
    if (!html) return false;
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
    // 15d. Unpaid Category: Prohibited Industry / Content (Rules 1, 2, 3, 5, 6, 7, 8)
    else if (checkUnpaidWebsiteContent(finalHtml, finalUrl)) {
      websiteStatus = "Not Working";
      nonWorkingReason = checkUnpaidWebsiteContent(finalHtml, finalUrl);
    }
    // 16. Working
    else {
      websiteStatus = "Working";
      nonWorkingReason = "";
      isEligibleForExtraction = true;
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

  function applyBusinessTypeEligibilityRule(data, html = "") {
    if (!data) return data;
    const rawType = String(data.businessType || "").trim();
    const currentStatus = data.websiteStatus || "Working";

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
    text = text.replace(/<br\s*\/?>/gi, ", ")
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
          const cleanUrl = resolved.origin + resolved.pathname;
          const pathLower = resolved.pathname.toLowerCase();
          const category = classifyLink(cleanUrl, pathLower, rawText);

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

  function extractContactsAndProducts(text, html) {
    const emails = Array.from(new Set(text.match(EMAIL_REGEX) || []));
    const phones = Array.from(new Set(text.match(PHONE_REGEX) || []))
      .filter(p => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15);

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
5. "companyName": Complete official legal or operational company name with all abbreviations expanded into their full forms:
   - Mandatory Abbreviation Expansion to Full Form:
     * General / English Legal & Corporate Types:
       - "Co." / "Co" -> "Company"
       - "Ltd." / "Ltd" -> "Limited"
       - "Pvt." / "Pvt" -> "Private" (e.g., "Pvt. Ltd." -> "Private Limited")
       - "Pty." / "Pty" -> "Proprietary" (e.g., "Pty. Ltd." -> "Proprietary Limited")
       - "Corp." / "Corp" -> "Corporation"
       - "Inc." / "Inc" -> "Incorporated"
       - "Mfg." / "Mfg" -> "Manufacturing"
       - "Intl." / "Int'l" -> "International"
       - "Tech." / "Tech" -> "Technology"
       - "Grp." / "Grp" -> "Group"
       - "LLC" -> "Limited Liability Company"
       - "LLP" -> "Limited Liability Partnership"
       - Example: "Zhejiang Jiangnan Steel Structure Co., Ltd." MUST be expanded to "Zhejiang Jiangnan Steel Structure Company, Limited".
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
   - You must write the country name in full form.
   - First letter in each word must be capitalized only, NOT all characters (e.g., "China", "United States Of America", "Germany").
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
       - ALWAYS expand "No." or "No.2" to "Number" (e.g. "Number 2").
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
     * Always expand "No." / "No.2" into "Number" (e.g. "Number 2").
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
       - Always expand "No." / "No.2" into "Number" (e.g. "Number 2, Wugong 2nd Road, Beiliu Village, Wufeng District, Taichung City").
       - Clean and remove any trailing company name, Chinese corporate name, or slash-separated business registration name appended to the map address (e.g., strip "安頌液壓工業股份有限公司/ANSON Hydraulics Industrial Co., Ltd." or "/Company Name").
       - Remove country name (e.g., "Taiwan") and postal/ZIP codes (e.g., "413", "41353").
       - Clean native building/lot numbers (e.g., convert "No. 2號" or "2號" to "Number 2" or "2").
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
   Apply the existing address formatting rules:
   - Expand abbreviated words into their full forms.
   - Use Title Case (first letter of each word capitalized).
   - Remove postal codes / ZIP codes / pincode.
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
   - Corresponding Phone Number: The extracted phone number MUST correspond to the selected Corporate Office / Headquarters address, not to a secondary branch or registered office.
   - Select only one address. Never combine multiple branch addresses.
   - Use only information available on the official website.
   - Current Active Address Priority (CRITICAL): Always select the CURRENT active headquarters or operational address. NEVER select former, historical, or previous addresses (e.g., text stating "prior to [date] was located at...", "formerly located at...", "previous address", or "relocated from...").

**B. Universal & Contextual Abbreviation Expansion (MANDATORY)**
Expand every recognizable abbreviation, shortened word, postal/box abbreviation (such as P.O. Box, PBS, Post Bag), directional token, floor/unit token, and administrative/street term into its full form in Title Case according to the surrounding geographic and business context—without hardcoding specific companies or sites.
- Contextual & Regional Expansion: Use surrounding city, district, state/province, and country context to resolve shortened locality or street tokens (for example, expanding "Kb" to "Kampung Baru" in a Balakong / Seri Kembangan context, or expanding regional street/estate/district abbreviations when clear from context).
- What Stays Unexpanded: Keep pure lot/plot/unit/house numbers, numeric coordinates, and non-abbreviated proper names or established brand acronyms as-is. Only leave a token unexpanded when it is genuinely an ambiguous code/reference with no clear geographic or domain expansion.

1. Universal Abbreviation Mappings (expand abbreviations into their complete, grammatically standard English or native equivalents):
   - Universal / International Thoroughfares:
     * "Rd." / "Rd" -> "Road", "St." / "St" -> "Street", "Ave." / "Ave" -> "Avenue", "Blvd." / "Blvd" -> "Boulevard", "Hwy." / "Hwy" -> "Highway", "Dr." / "Dr" -> "Drive", "Ln." / "Ln" -> "Lane", "Way", "Ct." / "Ct" -> "Court", "Pl." / "Pl" -> "Place", "Cir." / "Cir" -> "Circle", "Pkwy." / "Pkwy" -> "Parkway", "Ter." / "Terr." -> "Terrace"
   - Universal Divisions, Units & Buildings:
     * "Sec." / "Sec" -> "Section" (e.g., "Sec. 3" -> "Section 3"), "Dist." / "Dist" -> "District", "Prov." / "Prov" -> "Province", "Ind." / "Ind" -> "Industrial", "Bldg." / "Bldg" -> "Building", "Rm." / "Rm" -> "Room", "No." / "No" / "No.2" -> "Number" (MANDATORY EXPANSION: Always expand "No." or "No" or "No.2" or "No. 2" into "Number", e.g. "No. 2" -> "Number 2", "No.2" -> "Number 2", "No. 45" -> "Number 45", "No. 2號" -> "Number 2". NEVER leave "No." or "No" unexpanded!), "Ste." / "Ste" -> "Suite", "Apt." / "Apt" -> "Apartment", "Blk." / "Blk" -> "Block", "Sq." / "Sq" -> "Square", "Ctr." / "Ctr" -> "Center", "Plz." / "Plz" -> "Plaza"
   - Postal, Delivery & Administrative Abbreviations:
     * "P.O. Box" / "PO Box" -> "Post Office Box"
     * "P.O." / "P.O" -> "Post Office" (e.g. "P.O. Mayur Vihar" -> "Post Office Mayur Vihar")
     * "P.B." / "PB" -> "Post Bag" (e.g. "P.B. No." -> "Post Bag Number")
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
1. CRITICAL: PRESERVE SOURCE COMMAS & DO NOT ADD ARTIFICIAL PUNCTUATION:
   - If a comma or special character is available in the source address (Contact Page or Map), you MUST preserve and provide it (do NOT strip away existing commas!).
   - If a comma or special character is NOT available in the original address, DO NOT PROVIDE OR ADD IT!
   - NEVER add artificial commas, hyphens, slashes, dots, or any other punctuation between address elements if they were not in the original address.
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

**E. Mandatory Cleanup**
1. Remove pincode, postal codes, and ZIP codes completely from the address:
   - CRITICAL PINCODE / POSTAL CODE REMOVAL: All postal codes, ZIP codes, and pincodes (e.g. 5-digit US ZIPs like 53037 or 90210, 6-digit pincodes, UK alphanumeric postal codes, Canadian alphanumeric postal codes, etc.) MUST BE 100% REMOVED from the address. Under NO circumstances should any postal code or pincode numbers remain in companyAddress!
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
- Verify that postal codes, country names, company names, and brackets are removed.
- Verify that only one complete address is returned.

8. "state": Strictly output ONLY the exact string "Available" or "Not Available" (NEVER output the state name itself):
   - What Qualifies as State = "Available":
     * Official States & Provinces: Any recognized first-level administrative division of any country worldwide (e.g., States, Provinces, Counties, Prefectures, Cantons, Departments, Federal Territories, or Special/Direct-controlled Municipalities), even when the word "State" or "Province" is not explicitly written after the name.
     * Country Capitals (CRITICAL UNIVERSAL RULE): If the address contains the Country's Capital city (any national capital or capital city of any country/region worldwide, e.g. Taipei / Taipei City for Taiwan, Washington D.C., London, Paris, Tokyo, Beijing, New Delhi, Berlin, Ottawa, etc., whether written with or without the word "City"), "state" MUST ALWAYS be marked as "Available"! Capital cities hold primary state-level administrative status.
   - Disregard State Names in Street Lines:
     * If a state or province name appears solely as part of a street name (e.g., "Pennsylvania Avenue", "Washington Boulevard"), it does not count as the state. Only count it if an actual state, province, or capital division is present in the address location itself.
   - Select "Available" whenever an official State, Province, County, Prefecture, or Country Capital is present.
   - Select "Not Available" ONLY when the address contains strictly an ordinary non-capital local town/suburb without any state, province, county, or country capital present.
   - DO NOT consider an ordinary local town, village, or suburb as a State.

9. "city": Strictly output ONLY the exact string "Available" or "Not Available" (NEVER output the city name itself):
   - Select "Available" ONLY if an actual official City, Town, District, or Municipality is explicitly present in the address.
   - CRITICAL SUBURB RULE (SUBURB IS NOT A CITY): A suburb is NOT a city! Suburbs, neighborhoods, residential areas, communities, localities, and villages MUST NEVER be considered as City. If an address contains only a suburb, neighborhood, or village (or if the only locality is a suburb), "city" MUST BE MARKED AS "Not Available".
   - Select "Not Available" if no official City, Town, District, or Municipality is present.
   - Note: ONLY an official (Town, District, Municipality, or incorporated City) should be considered as City. Do NOT take any suburb, neighborhood, locality, or village as City.

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
    return `Analyze the following crawled website data and extract all corporate details according to the required schema:

Website Domain: ${context.domain}
Active URL: ${context.url}
Heuristically detected emails: ${JSON.stringify(context.detectedEmails)}
Heuristically detected phone numbers: ${JSON.stringify(context.detectedPhones)}
Heuristically detected product indicators: products=${context.heuristicProducts}, images=${context.heuristicImages}, descriptions=${context.heuristicDescriptions}

CRAWLED PAGES TEXT CONTENT:
${context.crawledText}`;
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
      const mainResp = await fetchFn(cleanUrl);
      if (!mainResp.ok) {
        throw new Error(`Failed to fetch ${cleanUrl}: HTTP ${mainResp.status}`);
      }
      mainHtml = await mainResp.text();
    }
    const mainText = cleanHtmlToText(mainHtml);
    const mainLinks = extractLinks(mainHtml, origin);
    const mainContacts = extractContactsAndProducts(mainText, mainHtml);

    // 3. Select priority subpages to crawl
    const maxPages = options.crawlDepth || 5;
    const priorityLinks = selectPriorityPages(mainLinks, cleanUrl, maxPages);

    // 4. Fetch subpages
    const crawledPages = [];
    let totalProducts = mainContacts.productCount;
    let totalImages = mainContacts.imgCount;
    let totalDescriptions = mainContacts.descCount;
    const allEmails = new Set(mainContacts.emails);
    const allPhones = new Set(mainContacts.phones);

    for (const link of priorityLinks) {
      try {
        const resp = await fetchFn(link.url);
        if (resp.ok) {
          const subHtml = await resp.text();
          const subText = cleanHtmlToText(subHtml);
          let subMapAddresses = extractMapAddresses(subHtml);
          if (link.category === "contact" || subMapAddresses.length === 0) {
            const embedAddrs = await resolveMapEmbedAddress(subHtml, fetchFn);
            if (embedAddrs.length > 0) subMapAddresses = Array.from(new Set([...subMapAddresses, ...embedAddrs]));
          }
          const subFooter = extractFooterText(subHtml);
          crawledPages.push({
            url: link.url,
            category: link.category,
            sourceType: link.category === "contact" ? "CONTACT_PAGE" : link.category.toUpperCase(),
            textSnippet: subText.slice(0, link.category === "contact" ? 12000 : 5000),
            mapAddresses: subMapAddresses,
            footerText: subFooter
          });

          const subContacts = extractContactsAndProducts(subText, subHtml);
          subContacts.emails.forEach(e => allEmails.add(e));
          subContacts.phones.forEach(p => allPhones.add(p));
          totalProducts = Math.max(totalProducts, subContacts.productCount);
          totalImages = Math.max(totalImages, subContacts.imgCount);
          totalDescriptions = Math.max(totalDescriptions, subContacts.descCount);
        }
      } catch (err) {
        // Continue if one subpage fails
      }
    }

    // 5. Build text compilation with Contact (Primary), Footer (Secondary), and Map (Verification) tags
    const mainMapAddresses = extractMapAddresses(mainHtml);
    let pagesText = `MAIN / INITIAL PAGE (${cleanUrl}):\n`;
    pagesText += `Content:\n${mainText.slice(0, 8000)}\n`;
    if (mainMapAddresses.length > 0) {
      pagesText += `\n--- EMBEDDED MAP VERIFICATION SOURCE ---\nMap Location / Address: ${mainMapAddresses.join(" | ")}\n`;
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

    // 6. Call Gemini API
    const aiResult = await GeminiClient.callGeminiWithRetryAndFallback({
      context: context,
      userPrompt: userPrompt,
      systemInstruction: systemInstruction,
      apiKey: options.apiKey,
      primaryModel: options.primaryModel || "gemini-3.5-flash-lite",
      fallbackModel: options.fallbackModel || "gemini-3.1-flash-lite",
      backendProxyUrl: options.backendProxyUrl || "",
      fetchFn: fetchFn
    });

    // Apply Business Type eligibility & Unpaid Category conditions (Manufacturer to Wholesaler only are Working, non-manufacturer cart options marked Not Working)
    if (aiResult && aiResult.data) {
      aiResult.data = applyBusinessTypeEligibilityRule(aiResult.data, mainHtml);
      if (aiResult.data.companyAddress && aiResult.data.companyAddress !== "Not Available") {
        if (AddressNormalizer && AddressNormalizer.normalizeAddress) {
          aiResult.data.companyAddress = AddressNormalizer.normalizeAddress(aiResult.data.companyAddress);
        }
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
    buildSystemInstruction,
    buildUserPrompt,
    normalizeAddress: (raw) => (AddressNormalizer && AddressNormalizer.normalizeAddress ? AddressNormalizer.normalizeAddress(raw) : raw),
    resolveMapEmbedAddress,
    crawlAndExtractUrl
  };
})();

// Export for Node.js / module environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = CrawlerEngine;
}