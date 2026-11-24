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

  function getHostname(urlOrHostname) {
    if (!urlOrHostname) return "";
    let raw = String(urlOrHostname).trim();
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(raw)) {
      try {
        return new URL(raw).hostname.toLowerCase();
      } catch (e) {}
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
        } catch (e) {}
        break;
      }

      if (resp.status >= 200 && resp.status < 300) {
        try {
          finalHtml = await resp.text();
        } catch (e) {}

        // Check Meta Refresh (<meta http-equiv="refresh" content="0;url=...">)
        const metaMatch = finalHtml.match(/<meta\s+[^>]*?http-equiv=["']?refresh["']?[^>]*?content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)["']?/i) ||
                          finalHtml.match(/<meta\s+[^>]*?content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)["']?[^>]*?http-equiv=["']?refresh["']?/i);
        if (metaMatch && metaMatch[1]) {
          let nextUrl = metaMatch[1].trim();
          try {
            nextUrl = new URL(nextUrl, currentUrl).href;
          } catch (e) {}

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
          } catch (e) {}

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

    // 1. Broken destination after redirect
    if (isBrokenDestination) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = `Original website redirects to an unavailable destination (HTTP ${httpStatus || "dead/unreachable"}).`;
    }
    // 2. Redirect loop
    else if (isRedirectLoop) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
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
    // 8. CAPTCHA / Bot challenges
    else if (
      htmlLower.includes("g-recaptcha") ||
      htmlLower.includes("hcaptcha") ||
      htmlLower.includes("cf-turnstile") ||
      htmlLower.includes("verify you are human") ||
      (htmlLower.includes("security check") && htmlLower.includes("human")) ||
      (htmlLower.includes("recaptcha") && htmlLower.includes("challenge"))
    ) {
      websiteStatus = "Manual Review";
      manualReviewRequired = true;
      nonWorkingReason = "CAPTCHA or anti-bot challenge page detected. Manual verification required.";
    }
    // 9. Cloudflare protection
    else if (
      htmlLower.includes("cf-chl-bypass") ||
      htmlLower.includes("attention required! | cloudflare") ||
      htmlLower.includes("checking your browser before accessing")
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

    while ((match = regex.exec(html)) !== null) {
      const rawHref = match[1]?.trim();
      const rawText = cleanHtmlToText(match[2] || "").toLowerCase();

      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") || 
          rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
        continue;
      }

      try {
        const resolved = new URL(rawHref, baseOrigin);
        if (resolved.origin === baseOrigin && !isAssetFile(resolved.pathname)) {
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
      } catch (e) {}
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
     * If Contact Us is not found or does not contain an address, you can take the address from the Footer of the website. Note: HQ (Headquarters) address is always first priority.
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

    aiResult.qcValidation = {
      originalUrl: statusResult.originalUrl,
      finalUrl: statusResult.finalUrl,
      originalDomain: statusResult.originalDomain,
      finalDomain: statusResult.finalDomain,
      redirectDetected: statusResult.redirectDetected,
      redirectType: statusResult.redirectType,
      redirectChain: statusResult.redirectChain,
      httpStatus: statusResult.httpStatus,
      websiteStatus: statusResult.websiteStatus,
      nonWorkingReason: statusResult.nonWorkingReason,
      isEligibleForExtraction: statusResult.isEligibleForExtraction,
      manualReviewRequired: statusResult.manualReviewRequired
    };

    return aiResult;
  }

  return {
    MULTI_PART_TLDS,
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