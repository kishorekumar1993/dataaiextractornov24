// Universal Crawler & Prompt Engine for Site Intelligence Crawler
// Compatible with Service Worker (MV3), Popup, Content Script, and Node.js

const CrawlerEngine = (() => {
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

  function cleanHtmlToText(html) {
    if (!html) return "";
    let text = html.replace(SCRIPT_STYLE_REGEX, " ");
    text = text.replace(HTML_TAG_REGEX, " ");
    text = text.replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return text.replace(/[\r\n]+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();
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
   - Floor Designations: Expand any floor abbreviation:
     * When attached directly to a number without ordinal suffix: "1F" -> "1Floor", "2F" -> "2Floor", "3F" / "3f." -> "3Floor" (e.g., "1F" -> "1Floor"; "3f.-6" -> "3Floor - 6").
     * When ordinal suffix is present: "1st F" / "1st Fl." -> "1st Floor", "2nd F" / "2nd Fl." -> "2nd Floor", "3rd F" / "3rd Fl." -> "3rd Floor" (e.g., "1st F" -> "1st Floor"). Retain any sub-unit hyphenated numbers intact.
   - State & Province Abbreviations (MANDATORY EXPANSION): Always expand 2-letter or shortened state, province, and territory abbreviations into their complete official names (e.g., "WI" MUST be expanded to "Wisconsin", "CA" -> "California", "TX" -> "Texas", "NY" -> "New York", "IL" -> "Illinois", "PA" -> "Pennsylvania", "OH" -> "Ohio", "ON" -> "Ontario", "BC" -> "British Columbia", etc.). State abbreviations MUST NEVER be deleted or removed from the address—they MUST be expanded to their full form.
   - Directional Prefixes Attached to Numbers: Expand directional letters attached directly to numerical identifiers or grid coordinates into their full form:
     * "N173" -> "North173"
     * "W21640" -> "West21640"
     * "S[Number]" -> "South[Number]" (e.g., "S100" -> "South100")
     * "E[Number]" -> "East[Number]" (e.g., "E200" -> "East200")
   - Standalone Directional Words: "N." / "N" -> "North", "S." / "S" -> "South", "E." / "E" -> "East", "W." / "W" -> "West", "NW" -> "Northwest", "NE" -> "Northeast", "SW" -> "Southwest", "SE" -> "Southeast".
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

**D. Original Address Structure and Punctuation**
1. Preserve the original address sequence and structure.
2. Keep internal commas in their original positions.
3. Special characters, hyphens, slashes, ampersands ("&"), numbers, and symbols within the address MUST be kept exactly the same as shown on the website. Preserve meaningful hyphens, slashes, ampersands (&), numbers, coordinate identifiers (such as North173 West21640), and symbols. Keep coordinates and building numbers intact.
4. DO NOT change or expand special characters into words (e.g., NEVER replace "&" with "and", NEVER replace "@" with "at"). Keep special characters always as it is.
5. Do not add artificial linking words such as "in" or "of".
6. Do not add extra commas or remove meaningful internal commas.

**E. Mandatory Cleanup**
1. Remove pincode, postal codes, and ZIP codes completely from the address:
   - ONLY remove the postal code/zip code/pincode numbers (e.g., in "Jackson, WI 53037", remove ONLY "53037").
   - CRITICAL: DO NOT remove the state or province abbreviation (such as "WI") when removing the pincode! The state abbreviation "WI" MUST NOT be removed—it MUST be expanded to "Wisconsin" (e.g. "Jackson, WI 53037" -> "Jackson, Wisconsin").
2. Remove unwanted text at the initial (start) of the address (e.g., remove leading labels like "Address:", "Location:", "HQ:", "Registered Office:", bullet points, colons, hyphens, and company name prefixes).
3. Remove unwanted text and punctuation at the end of the address (e.g., remove trailing periods, commas, colons, hyphens, phone/fax numbers, email, or trailing notes).
4. Remove the country name.
5. Remove parentheses, square brackets, and curly brackets.
6. Do not remove meaningful internal address information.

**F. Final Validation**
Before returning companyAddress:
- Verify that the selected address is the HQ or Registered Head Office.
- Verify that all recognizable abbreviations have been expanded.
- Verify that state/province abbreviations (e.g., WI -> Wisconsin) are expanded into their full names and NOT removed.
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
13. "numberOfProducts": String representation of number of products or services offered (default "3").
14. "productImages": String representation of number of product images identified (default "3").
    - CRITICAL IMAGE EXCLUSION RULE (Rule 15): Images related to the following categories are STRICTLY PROHIBITED and MUST NEVER be counted as product images:
      * Porn / Adult Content
      * Medicine
      * Food
      * Weapons
      * Aircraft / Marine
      * Chemicals
      * Alcohol
      * Animals
    - If all images on the website fall under these prohibited categories, "productImages" MUST be "0". Otherwise, default is "3".
15. "numberOfProductDescriptions": String representation of product descriptions present (default "3").

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
          crawledPages.push({
            url: link.url,
            category: link.category,
            textSnippet: subText.slice(0, 5000)
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

    // 5. Build text compilation
    let pagesText = `MAIN / INITIAL PAGE (${cleanUrl}):\n`;
    pagesText += `Content:\n${mainText.slice(0, 8000)}\n\n`;

    crawledPages.forEach((p, idx) => {
      pagesText += `--- CRAWLED SUBPAGE ${idx + 1}: [${p.category.toUpperCase()}] ${p.url} ---\n`;
      pagesText += `Content:\n${p.textSnippet}\n\n`;
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
    buildSystemInstruction,
    buildUserPrompt,
    crawlAndExtractUrl
  };
})();

// Export for Node.js / module environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = CrawlerEngine;
}