// Comprehensive Test Suite for Redirect Detection & Website Status Classification
// Covers all 33 required scenarios + Real Website Validation (http://www.lw-machinetools.com)

const assert = require("assert");
const CrawlerEngine = require("../crawlerEngine.js");

function createMockResponse(opts) {
  return {
    status: opts.status !== undefined ? opts.status : 200,
    ok: opts.status >= 200 && opts.status < 300,
    url: opts.url || "http://example.com",
    redirected: Boolean(opts.redirected),
    headers: {
      get: (headerName) => {
        const h = headerName.toLowerCase();
        if (h === "location") return opts.location || null;
        return null;
      }
    },
    text: async () => opts.html || "<html><body><h1>Welcome to our Company</h1><p>We are a manufacturer.</p></body></html>"
  };
}

async function runTestSuite() {
  console.log("==========================================================================");
  console.log("   WEBSITE REDIRECT DETECTION & STATUS CLASSIFICATION TEST SUITE (33 SCENARIOS)");
  console.log("==========================================================================");

  let passed = 0;
  let total = 0;

  async function test(scenarioNum, scenarioName, fn) {
    total++;
    try {
      await fn();
      console.log(`• Scenario ${scenarioNum}: ${scenarioName} ... PASSED`);
      passed++;
    } catch (err) {
      console.error(`• Scenario ${scenarioNum}: ${scenarioName} ... FAILED`);
      console.error(err);
    }
  }

  // 1. HTTP to HTTPS
  await test(1, "HTTP to HTTPS redirect (Same Domain -> Working)", async () => {
    const fetchFn = async (url) => {
      if (url === "http://example.com") {
        return createMockResponse({
          status: 301,
          location: "https://example.com/",
          url: "http://example.com"
        });
      }
      return createMockResponse({
        status: 200,
        url: "https://example.com/",
        html: "<html><body><h1>Example Company</h1><p>Welcome to our site</p></body></html>"
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://example.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.redirectDetected, true);
    assert.strictEqual(res.redirectType, "HTTP_TO_HTTPS");
    assert.strictEqual(res.isEligibleForExtraction, true);
    assert.strictEqual(res.finalUrl, "https://example.com/");
  });

  // 2. WWW to non-WWW
  await test(2, "WWW to non-WWW redirect (Same Domain -> Working)", async () => {
    const fetchFn = async (url) => {
      if (url === "http://www.example.com") {
        return createMockResponse({
          status: 301,
          location: "https://example.com/",
          url: "http://www.example.com"
        });
      }
      return createMockResponse({ status: 200, url: "https://example.com/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://www.example.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.redirectDetected, true);
    assert(res.redirectType === "CANONICAL_WWW" || res.redirectType === "HTTP_TO_HTTPS");
    assert.strictEqual(res.isEligibleForExtraction, true);
  });

  // 3. Non-WWW to WWW
  await test(3, "Non-WWW to WWW redirect (Same Domain -> Working)", async () => {
    const fetchFn = async (url) => {
      if (url === "https://example.com") {
        return createMockResponse({
          status: 301,
          location: "https://www.example.com/",
          url: "https://example.com"
        });
      }
      return createMockResponse({ status: 200, url: "https://www.example.com/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.redirectDetected, true);
    assert.strictEqual(res.redirectType, "CANONICAL_WWW");
    assert.strictEqual(res.isEligibleForExtraction, true);
  });

  // 4. Same-domain path redirect
  await test(4, "Same-domain path redirect (/home -> / -> Working)", async () => {
    const fetchFn = async (url) => {
      if (url.includes("/home")) {
        return createMockResponse({
          status: 302,
          location: "https://example.com/",
          url: url
        });
      }
      return createMockResponse({ status: 200, url: "https://example.com/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com/home", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.redirectDetected, true);
    assert.strictEqual(res.redirectType, "SAME_DOMAIN_PATH");
    assert.strictEqual(res.isEligibleForExtraction, true);
  });

  // 5. External-domain redirect (Different Registered Domain -> Redirect Site)
  await test(5, "External-domain redirect (abc.com -> xyz.com -> Redirect Site)", async () => {
    const fetchFn = async (url) => {
      if (url.includes("abc.com")) {
        return createMockResponse({
          status: 301,
          location: "https://xyz.com/",
          url: url
        });
      }
      return createMockResponse({ status: 200, url: "https://xyz.com/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://abc.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Redirect Site");
    assert.strictEqual(res.redirectDetected, true);
    assert.strictEqual(res.redirectType, "DIFFERENT_REGISTERED_DOMAIN");
    assert.strictEqual(res.isEligibleForExtraction, false);
    assert(res.nonWorkingReason.includes("External Domain Redirect"));
    assert(res.nonWorkingReason.includes("xyz.com"));
  });

  // 6. Domain forwarding
  await test(6, "Domain forwarding (brand acquisition -> Redirect Site)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 302,
        location: "https://conglomerate.com/brands/sub",
        url: url
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://old-brand.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Redirect Site");
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 7. Redirect loop (A -> B -> A -> Not Working)
  await test(7, "Redirect loop detection (A -> B -> A -> Not Working)", async () => {
    const fetchFn = async (url) => {
      if (url.includes("/page-a")) {
        return createMockResponse({ status: 302, location: "https://example.com/page-b", url });
      }
      if (url.includes("/page-b")) {
        return createMockResponse({ status: 302, location: "https://example.com/page-a", url });
      }
      return createMockResponse({ status: 302, location: "https://example.com/page-b", url });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com/page-a", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert.strictEqual(res.redirectType, "REDIRECT_LOOP");
    assert.strictEqual(res.manualReviewRequired, false);
    assert.strictEqual(res.isEligibleForExtraction, false);
    assert(res.nonWorkingReason.includes("Redirect loop"));
  });

  // 8. Too many redirects (> 5 hops -> Manual Review)
  await test(8, "Excessive redirects detection (> 5 hops -> Manual Review)", async () => {
    let hop = 0;
    const fetchFn = async (url) => {
      hop++;
      return createMockResponse({
        status: 302,
        location: `https://example.com/step-${hop}`,
        url
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com/step-0", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.redirectType, "EXCESSIVE_REDIRECTS");
    assert.strictEqual(res.manualReviewRequired, true);
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 9. JavaScript redirect in HTML
  await test(9, "JavaScript redirect detection (window.location -> Redirect Site)", async () => {
    const fetchFn = async (url) => {
      if (url.includes("js-from.com")) {
        return createMockResponse({
          status: 200,
          url,
          html: `<html><head><script>window.location.href = "https://js-target.com/home";</script></head><body>Redirecting...</body></html>`
        });
      }
      return createMockResponse({ status: 200, url: "https://js-target.com/home" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://js-from.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Redirect Site");
    assert.strictEqual(res.redirectType, "DIFFERENT_REGISTERED_DOMAIN");
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 10. Meta refresh redirect
  await test(10, "Meta refresh redirect (<meta http-equiv='refresh'> -> Redirect Site)", async () => {
    const fetchFn = async (url) => {
      if (url.includes("meta-from.com")) {
        return createMockResponse({
          status: 200,
          url,
          html: `<html><head><meta http-equiv="refresh" content="0;url=https://meta-target.com/"></head><body>Redirecting...</body></html>`
        });
      }
      return createMockResponse({ status: 200, url: "https://meta-target.com/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://meta-from.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Redirect Site");
    assert.strictEqual(res.redirectType, "DIFFERENT_REGISTERED_DOMAIN");
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 11. CAPTCHA page
  await test(11, "CAPTCHA verification challenge (reCAPTCHA/hCaptcha -> Manual Review)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Security Check</h1><p>Please verify you are a human to continue.</p><div class="g-recaptcha"></div></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example-captcha.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 12. Cloudflare challenge
  await test(12, "Cloudflare challenge page (cf-chl-bypass / Turnstile -> Manual Review)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 403,
        url,
        html: `<html><head><title>Attention Required! | Cloudflare</title></head><body><div id="cf-chl-bypass">Checking your browser before accessing... Ray ID: 88921a</div></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example-cf.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 13. DNS failure
  await test(13, "DNS resolution failure (ENOTFOUND -> Not Working)", async () => {
    const fetchFn = async () => {
      const err = new Error("getaddrinfo ENOTFOUND invalid-nonexistent-domain.xyz");
      throw err;
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://invalid-nonexistent-domain.xyz", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert.strictEqual(res.isEligibleForExtraction, false);
    assert(res.nonWorkingReason.includes("DNS Lookup Failed") || res.nonWorkingReason.includes("ENOTFOUND"));
  });

  // 14. SSL failure
  await test(14, "SSL certificate error (CERT_HAS_EXPIRED -> Manual Review)", async () => {
    const fetchFn = async () => {
      throw new Error("certificate has expired");
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://expired-ssl.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert(res.nonWorkingReason.includes("SSL Certificate Failure"));
  });

  // 15. Expired domain
  await test(15, "Expired domain page ('domain has expired' -> Domain Expired)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>This domain has expired</h1><p>Renew this domain renewal notice today.</p></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://expired-domain-example.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Domain Expired");
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 16. Parked domain
  await test(16, "Parked domain page ('domain is for sale' / Sedo / GoDaddy -> Domain Expired)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>example.com is parked free, courtesy of GoDaddy parking</h1><p>Buy this domain or inquire about this domain.</p></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://parked-example.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Domain Expired");
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 17. HTTP 404
  await test(17, "HTTP 404 Not Found (Not Working)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({ status: 404, url, html: "<html><body>404 Not Found</body></html>" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com/dead", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert.strictEqual(res.isEligibleForExtraction, false);
    assert(res.nonWorkingReason.includes("HTTP 404"));
  });

  // 18. HTTP 403
  await test(18, "HTTP 403 Forbidden (Temporary Server Error -> Manual Review)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({ status: 403, url, html: "<html><body>403 Forbidden</body></html>" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com/protected", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert.strictEqual(res.isEligibleForExtraction, false);
    assert(res.nonWorkingReason.includes("HTTP 403"));
  });

  // 19. HTTP 429
  await test(19, "HTTP 429 Rate Limit (Temporary Server Error -> Manual Review)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({ status: 429, url, html: "<html><body>Too Many Requests</body></html>" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com/rate-limited", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert(res.nonWorkingReason.includes("HTTP 429"));
  });

  // 20. HTTP 500
  await test(20, "HTTP 500 Internal Error (Temporary Server Error -> Manual Review)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({ status: 500, url, html: "<html><body>500 Internal Error</body></html>" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com/server-error", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert(res.nonWorkingReason.includes("HTTP 500"));
  });

  // 21. HTTP 502
  await test(21, "HTTP 502 Bad Gateway (Temporary Server Error -> Manual Review)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({ status: 502, url, html: "<html><body>502 Bad Gateway</body></html>" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com/bad-gateway", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert(res.nonWorkingReason.includes("HTTP 502"));
  });

  // 22. HTTP 503
  await test(22, "HTTP 503 Service Unavailable (Temporary Server Error -> Manual Review)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({ status: 503, url, html: "<html><body>503 Service Unavailable</body></html>" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://example.com/overload", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert(res.nonWorkingReason.includes("HTTP 503"));
  });

  // 23. Language redirect
  await test(23, "Language redirect (/en/ -> Same Domain -> Working)", async () => {
    const fetchFn = async (url) => {
      if (url === "https://multilang.com") {
        return createMockResponse({ status: 302, location: "https://multilang.com/en/", url });
      }
      return createMockResponse({ status: 200, url: "https://multilang.com/en/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://multilang.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.redirectType, "LANGUAGE_REDIRECT");
    assert.strictEqual(res.isEligibleForExtraction, true);
  });

  // 24. Country-based redirect
  await test(24, "Country-based redirect (/uk/ -> Same Domain -> Working)", async () => {
    const fetchFn = async (url) => {
      if (url === "https://globalcorp.com") {
        return createMockResponse({ status: 302, location: "https://globalcorp.com/uk/", url });
      }
      return createMockResponse({ status: 200, url: "https://globalcorp.com/uk/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://globalcorp.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.isEligibleForExtraction, true);
  });

  // 25. Mobile redirect
  await test(25, "Mobile redirect (example.com -> m.example.com -> Working)", async () => {
    const fetchFn = async (url) => {
      if (url === "http://example.com") {
        return createMockResponse({ status: 302, location: "https://m.example.com/", url });
      }
      return createMockResponse({ status: 200, url: "https://m.example.com/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://example.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.redirectType, "MOBILE_REDIRECT");
    assert.strictEqual(res.isEligibleForExtraction, true);
  });

  // 26. Short URL redirect
  await test(26, "Short URL redirect (bit.ly/xyz -> external destination -> Redirect Site)", async () => {
    const fetchFn = async (url) => {
      if (url.includes("bit.ly")) {
        return createMockResponse({ status: 301, location: "https://targetcompany.com/", url });
      }
      return createMockResponse({ status: 200, url: "https://targetcompany.com/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://bit.ly/xyz", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Redirect Site");
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 27. Login redirect
  await test(27, "Login portal redirect (redirects to /login, no public content -> Manual Review)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url: "https://intranet.example.com/login",
        html: `<html><body><h1>System Login</h1><form><input type="text" name="login"><input type="password" name="password"></form></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://intranet.example.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert(res.nonWorkingReason.includes("login"));
  });

  // 28. Broken destination
  await test(28, "Broken destination (redirects to 404 or dead link -> Manual Review)", async () => {
    const fetchFn = async (url) => {
      if (url === "http://original-site.com") {
        return createMockResponse({ status: 301, location: "https://destination-dead.com/", url });
      }
      return createMockResponse({ status: 404, url: "https://destination-dead.com/" });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://original-site.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Manual Review");
    assert.strictEqual(res.manualReviewRequired, true);
    assert.strictEqual(res.isEligibleForExtraction, false);
    assert(res.nonWorkingReason.includes("unavailable destination"));
  });

  // 29. Under-construction page
  await test(29, "Under-construction page ('site is under construction' -> Under Construction)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Site is under construction</h1><p>Our website coming soon, please check back.</p></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://construction-example.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Under Construction");
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 30. Flash-only website
  await test(30, "Flash-only website (.swf / Adobe Flash Player required -> Flash)", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><object type="application/x-shockwave-flash" data="intro.swf"><p>Adobe Flash Player is required to view this site</p></object></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://flash-site.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Flash");
    assert.strictEqual(res.isEligibleForExtraction, false);
  });

  // 31. Accessible homepage with broken images
  await test(31, "Accessible homepage with broken images -> Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Acme Industrial Corporation</h1><p>Manufacturer of industrial valves.</p><img src="broken_img_1.jpg"><img src="broken_img_2.jpg"></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://acme-valves.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.isEligibleForExtraction, true);
    assert.strictEqual(res.nonWorkingReason, "");
  });

  // 32. Accessible homepage with missing product pages
  await test(32, "Accessible homepage with missing product pages -> Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Global Logistics Services</h1><p>Freight forwarding and customs clearance.</p><a href="/about">About Us</a></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://global-logistics.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.isEligibleForExtraction, true);
    assert.strictEqual(res.nonWorkingReason, "");
  });

  // 33. Accessible homepage with incomplete contact information
  await test(33, "Accessible homepage with incomplete contact information -> Working", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>Tech Solutions Inc</h1><p>Software development services.</p><p>Email: contact@techsolutions.com</p></body></html>`
      });
    };

    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://techsolutions.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Working");
    assert.strictEqual(res.isEligibleForExtraction, true);
    assert.strictEqual(res.nonWorkingReason, "");
  });

  // =========================================================================
  // REAL WEBSITE VALIDATION: http://www.lw-machinetools.com
  // =========================================================================
  console.log("\n==========================================================================");
  console.log("   REAL WEBSITE VALIDATION: http://www.lw-machinetools.com");
  console.log("==========================================================================");

  await test("REAL-SITE", "Real live website validation (http://www.lw-machinetools.com)", async () => {
    // Real fetch
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("http://www.lw-machinetools.com");
    console.log("    Original URL:", res.originalUrl);
    console.log("    Final URL:", res.finalUrl);
    console.log("    Original Domain:", res.originalDomain);
    console.log("    Final Domain:", res.finalDomain);
    console.log("    Redirect Detected:", res.redirectDetected);
    console.log("    Redirect Type:", res.redirectType);
    console.log("    Website Status:", res.websiteStatus);
    console.log("    Is Eligible For Extraction:", res.isEligibleForExtraction);

    assert.strictEqual(res.originalDomain, "lw-machinetools.com", "Original registered domain must be lw-machinetools.com");
    assert.strictEqual(res.finalDomain, "lw-machinetools.com", "Final registered domain must remain lw-machinetools.com");
    assert.strictEqual(res.redirectDetected, true, "HTTP to HTTPS redirect must be detected");
    assert(res.finalUrl.startsWith("https://"), "Final URL must be HTTPS");
    assert.strictEqual(res.websiteStatus, "Working", "Must be classified as Working");
    assert.strictEqual(res.isEligibleForExtraction, true, "Must be eligible for extraction");
    assert.notStrictEqual(res.websiteStatus, "Redirect Site", "Must NOT be classified as Redirect Site");
  });

  console.log("\n==========================================================================");
  console.log(`   TEST RESULTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL ${total})`);
  console.log("==========================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
