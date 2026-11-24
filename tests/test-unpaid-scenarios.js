// Automated Test Suite for Unpaid Website Categories & Ineligibility for Billing Rules (16 Rules)
const assert = require("assert");
const CrawlerEngine = require("../crawlerEngine.js");

function createMockResponse(opts) {
  return {
    status: opts.status !== undefined ? opts.status : 200,
    ok: opts.status >= 200 && opts.status < 300,
    url: opts.url || "http://example.com",
    redirected: Boolean(opts.redirected),
    headers: {
      get: (h) => (h.toLowerCase() === "location" ? opts.location || null : null)
    },
    text: async () => opts.html || "<html><body><h1>Example</h1></body></html>"
  };
}

async function runUnpaidWebsiteTests() {
  console.log("==========================================================================");
  console.log("   UNPAID WEBSITES & INELIGIBILITY FOR BILLING TEST SUITE (16 RULES)");
  console.log("==========================================================================");

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`• Rule Test: ${name} ... PASSED`);
      passed++;
    } catch (err) {
      console.error(`• Rule Test: ${name} ... FAILED`);
      console.error(err);
    }
  }

  // Rule 1: Weapons / Armor
  await test("Rule 1: Weapons / Armor manufacturing, trading, or supply -> Not Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Tactical Ballistics Corp</h1><p>We supply ballistic armor, firearms, and ammunition to defense forces.</p></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://tactical-armor.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert(res.nonWorkingReason.includes("armor") || res.nonWorkingReason.includes("weapons"));
  });

  // Rule 2: Adult / Pornographic
  await test("Rule 2: Pornographic or adult content websites -> Not Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Adult World</h1><p>Adult entertainment and xxx video club.</p></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://adult-content-test.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert(res.nonWorkingReason.includes("adult") || res.nonWorkingReason.includes("Pornographic"));
  });

  // Rule 3: Online Gambling / Gaming
  await test("Rule 3: Online gambling or online gaming websites -> Not Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Royal Casino Online</h1><p>Sports betting, slot machine, poker online and casino games.</p></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://online-casino-test.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert(res.nonWorkingReason.includes("gambling") || res.nonWorkingReason.includes("gaming"));
  });

  // Rule 4: Non-industrial service provider / Retailer
  await test("Rule 4: Non-industrial service provider / Retailer -> Not Working", async () => {
    const data = {
      websiteStatus: "Working",
      businessType: "Retailer"
    };
    const checked = CrawlerEngine.applyBusinessTypeEligibilityRule(data);
    assert.strictEqual(checked.websiteStatus, "Not Working");
    assert(checked.notWorkingReason.includes("Ineligible Business Type"));
  });

  // Rule 5: Hacking services
  await test("Rule 5: Hacking services or hacking information -> Not Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Cyber Elite</h1><p>Professional hacking service, hire a hacker, exploit kits for hire.</p></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://hackers-for-hire.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert(res.nonWorkingReason.includes("Hacking"));
  });

  // Rule 6: Alcoholic or tobacco products
  await test("Rule 6: Alcoholic or tobacco product manufacturers/suppliers -> Not Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Highland Whiskey Distillery</h1><p>Manufacturer of alcoholic beverages, scotch whiskey and spirits.</p></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://highland-whiskey.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert(res.nonWorkingReason.includes("Alcoholic") || res.nonWorkingReason.includes("tobacco"));
  });

  // Rule 7: Airline / Aviation industry
  await test("Rule 7: Airline or aviation passenger transport industry -> Not Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Skyline Airways</h1><p>Commercial airline flights and air passenger transport.</p></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://skyline-airways.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert(res.nonWorkingReason.includes("Airline") || res.nonWorkingReason.includes("aviation"));
  });

  // Rule 8: Personal website / blog
  await test("Rule 8: Personal website or blog -> Not Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>John Doe's Corner</h1><p>Welcome to my personal blog where I share my thoughts and daily journal.</p></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://johndoe-personal.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert(res.nonWorkingReason.includes("Personal") || res.nonWorkingReason.includes("blog"));
  });

  // Rule 9: Free hosting platforms (WordPress, Wix, Weebly, Blogspot)
  await test("Rule 9: Websites hosted on free platforms (e.g. *.wixsite.com, *.wordpress.com) -> Not Working", async () => {
    const freeDomains = [
      "https://mycompany.wordpress.com",
      "https://business.wixsite.com/mysite",
      "https://shop.weebly.com",
      "https://updates.blogspot.com"
    ];
    for (const url of freeDomains) {
      assert.strictEqual(CrawlerEngine.isFreeHostingPlatform(url), true, `${url} must be identified as free platform`);
      const res = await CrawlerEngine.detectRedirectAndClassifyStatus(url, {
        fetchFn: async () => createMockResponse({ status: 200, url, html: "<html><body>Welcome</body></html>" })
      });
      assert.strictEqual(res.websiteStatus, "Not Working", `${url} must be marked Not Working`);
      assert(res.nonWorkingReason.includes("free platform"), `${url} reason must mention free platform`);
    }
  });

  // Rule 10: Subdomain websites (not hosted at root level)
  await test("Rule 10: Ineligible Subdomain websites (e.g. video.stream.com, music.hub.com) -> Not Working", async () => {
    const subdomains = [
      "https://video.streamingcorp.com",
      "https://music.entertainmentportal.com",
      "https://blog.companycorp.com"
    ];
    for (const url of subdomains) {
      assert.strictEqual(CrawlerEngine.isIneligibleSubdomain(url), true, `${url} must be identified as subdomain`);
      const res = await CrawlerEngine.detectRedirectAndClassifyStatus(url, {
        fetchFn: async () => createMockResponse({ status: 200, url, html: "<html><body>Subdomain content</body></html>" })
      });
      assert.strictEqual(res.websiteStatus, "Not Working", `${url} must be marked Not Working`);
      assert(res.nonWorkingReason.includes("Subdomain"), `${url} reason must mention Subdomain`);
    }

    // Root domains with www or mobile should NOT be flagged as ineligible subdomains
    assert.strictEqual(CrawlerEngine.isIneligibleSubdomain("https://www.example.com"), false, "www.example.com is valid root");
    assert.strictEqual(CrawlerEngine.isIneligibleSubdomain("https://m.example.com"), false, "m.example.com is valid mobile root");
  });

  // Rules 11 & 16: Online product selling options (Add to Cart / Buy Now)
  await test("Rules 11 & 16: Online selling options except for Manufacturers", async () => {
    const ecomHtml = `<html><body><button>Add to Cart</button><button>Buy Now</button></body></html>`;

    // 1. Non-Manufacturer (e.g. Wholesaler or Trader) with Add to Cart -> Not Working
    const traderData = {
      websiteStatus: "Working",
      businessType: "Trader"
    };
    const traderChecked = CrawlerEngine.applyBusinessTypeEligibilityRule(traderData, ecomHtml);
    assert.strictEqual(traderChecked.websiteStatus, "Not Working", "Trader with online cart options must be Not Working");
    assert(traderChecked.notWorkingReason.includes("online product selling options"));

    // 2. Manufacturer with Add to Cart -> Allowed as Working (Manufacturer exception)
    const mfgData = {
      websiteStatus: "Working",
      businessType: "Manufacturer"
    };
    const mfgChecked = CrawlerEngine.applyBusinessTypeEligibilityRule(mfgData, ecomHtml);
    assert.strictEqual(mfgChecked.websiteStatus, "Working", "Manufacturer with online cart options is eligible");
  });

  // Rule 12: Non-English website
  await test("Rule 12: Non-English language website without translation -> Non English", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html lang="ja"><head><title>会社情報</title></head><body><h1>企業概要</h1><p>当社は日本の製造会社です。</p></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://japanese-only-site.co.jp", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Non English");
  });

  // Rule 13: External redirect website
  await test("Rule 13: URL redirect to different registered domain -> Redirect Site", async () => {
    const fetchFn = async (url) => {
      if (url.includes("origin-domain.com")) {
        return createMockResponse({ status: 301, location: "https://final-destination.com/", url });
      }
      return createMockResponse({ status: 200, url: "https://final-destination.com/" });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://origin-domain.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Redirect Site");
  });

  // Rule 14: Flash website
  await test("Rule 14: Website designed in Flash format -> Flash", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><object type="application/x-shockwave-flash" data="site.swf"><p>Adobe Flash Player is required</p></object></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://flash-intro-site.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Flash");
  });

  // Rule 15: Disallowed images
  await test("Rule 15: Disallowed images rule documented in System Prompt", () => {
    const prompt = CrawlerEngine.buildSystemInstruction();
    assert(prompt.includes("Porn / Adult Content"), "Prompt must prohibit Porn images");
    assert(prompt.includes("Medicine"), "Prompt must prohibit Medicine images");
    assert(prompt.includes("Food"), "Prompt must prohibit Food images");
    assert(prompt.includes("Weapons"), "Prompt must prohibit Weapons images");
    assert(prompt.includes("Aircraft / Marine"), "Prompt must prohibit Aircraft/Marine images");
    assert(prompt.includes("Chemicals"), "Prompt must prohibit Chemicals images");
    assert(prompt.includes("Alcohol"), "Prompt must prohibit Alcohol images");
    assert(prompt.includes("Animals"), "Prompt must prohibit Animals images");
  });

  // Industrial Supplier with JS Framework Bundle (ascmetals.com)
  await test("Legitimate industrial supplier (ascmetals.com) with framework JS bundle -> Working", async () => {
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://www.ascmetals.com");
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.isEligibleForExtraction, true);
    assert.strictEqual(res.redirectDetected, true);
    assert.strictEqual(res.redirectType, "HTTP_TO_HTTPS");
    assert.strictEqual(res.finalDomain, "ascmetals.com");

    const extractionData = {
      websiteStatus: "Working",
      businessType: "Supplier",
      companyName: "ASC Metals Lincoln Ltd"
    };
    const validated = CrawlerEngine.applyBusinessTypeEligibilityRule(extractionData, res.finalHtml);
    assert.strictEqual(validated.websiteStatus, "Working");
  });

  console.log("==========================================================================");
  console.log(`  UNPAID SCENARIOS RESULTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL ${total})`);
  console.log("==========================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runUnpaidWebsiteTests();
