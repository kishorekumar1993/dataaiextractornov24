// Content script to extract live DOM data from the current active tab
(() => {
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractCurrentPageData") {
      try {
        const pageData = extractPageData();
        sendResponse({ success: true, data: pageData });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true; // Keep message channel open
    }
  });

  function extractPageData() {
    const origin = window.location.origin;
    const hostname = window.location.hostname;

    // 1. Meta information
    const title = document.title || "";
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || 
                     document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || "";

    // 2. Extract JSON-LD structured data (Organizations, Products, LocalBusiness)
    const jsonLdData = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const parsed = JSON.parse(script.textContent);
        jsonLdData.push(parsed);
      } catch (e) {
        // ignore invalid json
      }
    });

    // 3. Find all internal links
    const internalLinks = new Map(); // url -> { text, category }
    const allLinks = Array.from(document.querySelectorAll("a[href]"));

    for (const a of allLinks) {
      let href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        continue;
      }

      try {
        const resolved = new URL(href, origin);
        // Only keep same origin / same root domain links
        if (resolved.origin === origin && !isAssetFile(resolved.pathname)) {
          const cleanUrl = resolved.origin + resolved.pathname; // strip hash & params for clean crawling
          const linkText = (a.innerText || "").trim().toLowerCase();
          const pathLower = resolved.pathname.toLowerCase();

          // Classify the link
          const category = classifyLink(cleanUrl, pathLower, linkText);
          if (!internalLinks.has(cleanUrl)) {
            internalLinks.set(cleanUrl, {
              url: cleanUrl,
              text: (a.innerText || "").trim(),
              category: category
            });
          }
        }
      } catch (e) {
        // ignore malformed URLs
      }
    }

    // 4. Product heuristics in current page
    const productData = detectProducts();

    // 5. Clean text content of current page
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
      cleanText: cleanText.slice(0, 15000), // Cap length for initial page
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
    // Search for product items via microdata, classes, or patterns
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

    // Count product images (images inside products or with alt/src matching product)
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

    // If still 0, general img count on catalog/product pages
    if (productImagesCount === 0 && (window.location.pathname.includes("product") || window.location.pathname.includes("catalog"))) {
      productImagesCount = document.querySelectorAll("main img, .content img, article img").length;
    }

    // Number of product descriptions
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

    // Remove noise tags
    const dropTags = ["script", "style", "noscript", "svg", "canvas", "iframe", "template", "nav", "footer"];
    dropTags.forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });

    let text = clone.innerText || clone.textContent || "";
    // Clean up excessive whitespace
    text = text.replace(/[\r\n]+/g, "\n")
               .replace(/[ \t]+/g, " ")
               .replace(/\n\s*\n/g, "\n\n")
               .trim();
    return text;
  }
})();
