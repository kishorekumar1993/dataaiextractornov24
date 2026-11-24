// Universal Crawler & Prompt Engine for Site Intelligence Crawler
// Compatible with Service Worker (MV3), Popup, Content Script, and Node.js

const CrawlerEngine = (() => {
  // Regex patterns for HTML processing in environments without DOM
  const SCRIPT_STYLE_REGEX = /<(?:script|style|noscript|svg|canvas|iframe|template|nav)\b[^<]*(?:(?!<\/(?:script|style|noscript|svg|canvas|iframe|template|nav)>)<[^<]*)*<\/(?:script|style|noscript|svg|canvas|iframe|template|nav)>/gi;
  const HTML_TAG_REGEX = /<[^>]+>/g;
  const A_HREF_REGEX = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const PHONE_REGEX = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}/g;

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
    const fetchFn = options.fetchFn || fetch;
    const cleanUrl = targetUrl.split("#")[0].split("?")[0].replace(/\/$/, "");
    const urlObj = new URL(cleanUrl);
    const origin = urlObj.origin;
    const hostname = urlObj.hostname;

    // 1. Fetch main page
    const mainResp = await fetchFn(cleanUrl);
    if (!mainResp.ok) {
      throw new Error(`Failed to fetch ${cleanUrl}: HTTP ${mainResp.status}`);
    }
    const mainHtml = await mainResp.text();
    const mainText = cleanHtmlToText(mainHtml);
    const mainLinks = extractLinks(mainHtml, origin);
    const mainContacts = extractContactsAndProducts(mainText, mainHtml);

    // 2. Select priority subpages to crawl
    const maxPages = options.crawlDepth || 5;
    const priorityLinks = selectPriorityPages(mainLinks, cleanUrl, maxPages);

    // 3. Fetch subpages
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

    // 4. Build text compilation
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

    // 5. Call Gemini API
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

    return aiResult;
  }

  return {
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
