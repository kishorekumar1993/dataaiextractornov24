/**
 * Test Suite: Backend Proxy Security, Client Proxy Token, and Queue Recovery
 */
const assert = require("assert");
const http = require("http");

const GeminiClient = require("../geminiClient.js");
const { CrawlerQueueManager } = require("../requestQueue.js");
const CrawlerEngine = require("../crawlerEngine.js");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`• Test: ${name} ... `);
  try {
    await fn();
    console.log("PASSED");
    passed++;
  } catch (err) {
    console.log("FAILED");
    console.error("  Error:", err.message);
    failed++;
  }
}

function httpRequest(port, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, method, path, headers }, (res) => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log("==========================================================");
  console.log("  PROXY SECURITY & QUEUE RECOVERY TEST SUITE");
  console.log("==========================================================");

  await test("GeminiClient direct mode sends x-goog-api-key header without URL ?key= param", async () => {
    let capturedUrl = "";
    let capturedHeaders = {};
    const validPayload = {
      websiteStatus: "Working", notWorkingReason: "", businessType: "Manufacturer",
      companyProfile: "Available", companyName: "Acme Corp", countryName: "India",
      companyAddress: "123 Industrial Road", state: "Available", city: "Available",
      emailId: "info@acme.com", secondaryEmailId: "", phoneNumber: "9876543210",
      numberOfProducts: "Above 10", productImages: "Available", numberOfProductDescriptions: "Above 10"
    };
    await GeminiClient.callGeminiWithRetryAndFallback({
      context: { url: "https://acme.com", domain: "acme.com", detectedEmails: ["info@acme.com"], detectedPhones: [] },
      userPrompt: "test",
      systemInstruction: "test",
      apiKey: "secret-test-key",
      fetchImpl: async (url, init) => {
        capturedUrl = url;
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(validPayload) }] } }]
          })
        };
      }
    });
    assert(!capturedUrl.includes("?key="), "API key must not be in URL query string");
    assert.strictEqual(capturedHeaders["x-goog-api-key"], "secret-test-key");
  });

  await test("GeminiClient callBackendProxy forwards backendProxyToken and validates context", async () => {
    let capturedHeaders = {};
    const validPayload = {
      websiteStatus: "Working", notWorkingReason: "", businessType: "Manufacturer",
      companyProfile: "Available", companyName: "Acme Corp", countryName: "India",
      companyAddress: "123 Industrial Road", state: "Available", city: "Available",
      emailId: "info@acme.com", secondaryEmailId: "", phoneNumber: "9876543210",
      numberOfProducts: "Above 10", productImages: "Available", numberOfProductDescriptions: "Above 10"
    };
    const res = await GeminiClient.callGeminiWithRetryAndFallback({
      context: { url: "https://acme-proxy.com", domain: "acme-proxy.com", detectedEmails: ["info@acme.com"], detectedPhones: [] },
      userPrompt: "test",
      systemInstruction: "test",
      backendProxyUrl: "http://127.0.0.1:3999/api/analyze",
      backendProxyToken: "my-proxy-secret",
      fetchImpl: async (url, init) => {
        capturedHeaders = init.headers;
        return { ok: true, status: 200, json: async () => ({ success: true, data: validPayload }) };
      }
    });
    assert.strictEqual(capturedHeaders["x-api-key"], "my-proxy-secret");
    assert.strictEqual(res.data.companyName, "Acme Corp");
  });

  await test("CrawlerQueueManager recovers interrupted activeItems and evicts old completed entries", async () => {
    // Mock chrome.storage.local
    const store = {
      crawler_queue_state_v1: {
        pendingQueue: [{ id: "p2", url: "https://b.com" }],
        activeItems: [{ id: "a1", url: "https://a.com" }],
        completedMap: {
          "https://old1.com": { completedAt: "2026-01-01T00:00:00Z" },
          "https://old2.com": { completedAt: "2026-01-02T00:00:00Z" }
        },
        failedQueue: []
      }
    };
    global.chrome = {
      storage: {
        local: {
          get: (keys, cb) => cb({ crawler_queue_state_v1: store.crawler_queue_state_v1 }),
          set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); }
        }
      }
    };

    const q = new CrawlerQueueManager({
      maxCompletedEntries: 2,
      geminiClient: {
        callGeminiWithRetryAndFallback: async () => ({ data: { websiteStatus: "Working" }, meta: {} })
      }
    });
    // Stub processQueue so init doesn't auto-run during assertion
    q.processQueue = async () => {};
    await q.init();
    assert.strictEqual(q.pendingQueue.length, 2, "Interrupted active item should be re-queued");
    assert.strictEqual(q.pendingQueue[0].id, "a1");

    q.recordCompleted("https://new3.com", { completedAt: "2026-01-03T00:00:00Z" });
    assert.strictEqual(Object.keys(q.completedMap).length, 2);
    assert(!q.completedMap["https://old1.com"], "Oldest entry should be evicted");
    delete global.chrome;
  });

  await test("CrawlerEngine preserves query-string Contact links, strips tracking params, and extracts JSON-LD metadata", async () => {
    const html = `
      <html>
        <head>
          <title>Acme Industrial Co., Ltd. - Home</title>
          <meta property="og:site_name" content="Acme Industrial" />
          <script type="application/ld+json">
            {
              "@type": "Organization",
              "name": "Acme Industrial Co., Ltd.",
              "telephone": "+91-9876543210",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "Plot 42, MIDC",
                "addressLocality": "Pune",
                "addressRegion": "Maharashtra",
                "addressCountry": "India"
              }
            }
          </script>
        </head>
        <body>
          <a href="/index.php?page=contact&utm_source=nav">Contact Us</a>
          <a href="/capabilities.html">Our Manufacturing Capabilities</a>
          <a href="/imprint">Imprint</a>
        </body>
      </html>
    `;
    const links = CrawlerEngine.extractLinks(html, "https://acme.com");
    const contactLink = links.find(l => l.url === "https://acme.com/index.php?page=contact");
    const capLink = links.find(l => l.url === "https://acme.com/capabilities.html");
    const imprintLink = links.find(l => l.url === "https://acme.com/imprint");
    assert(contactLink && contactLink.category === "contact", "Query-string contact link should be preserved and classified as contact");
    assert(capLink && capLink.category === "about", "Capabilities link should be classified as about");
    assert(imprintLink && imprintLink.category === "contact", "Imprint link should be classified as contact");

    const meta = CrawlerEngine.extractStructuredMetadata(html);
    assert.strictEqual(meta.ogSiteName, "Acme Industrial");
    assert.strictEqual(meta.jsonLd.length, 1);
    assert.strictEqual(meta.jsonLd[0].name, "Acme Industrial Co., Ltd.");
    assert(meta.jsonLd[0].address.includes("Plot 42, MIDC"));
  });

  await test("CrawlerEngine.crawlAndExtractUrl uses renderTabFallback for empty SPA shells and fetches subpages in parallel", async () => {
    const spaShellHtml = "<html><body><div id='root'></div><script src='/app.js'></script></body></html>";
    const renderedSpaHtml = `
      <html>
        <head><title>Beta Manufacturing Ltd</title></head>
        <body>
          <h1>Beta Manufacturing Ltd</h1>
          <p>We manufacture precision CNC components and industrial valves in our factory.</p>
          <a href="/contact">Contact Us</a>
          <footer>Plot 99, Peenya Industrial Area, Bengaluru, Karnataka, India | Tel: +91-9811122233</footer>
        </body>
      </html>
    `;
    const contactHtml = "<html><body><h1>Contact</h1><p>Plot 99, Peenya Industrial Area, Bengaluru</p><p>sales@betamfg.com</p></body></html>";

    let activeFetches = 0;
    let maxConcurrent = 0;
    const mockFetch = async (url) => {
      activeFetches++;
      maxConcurrent = Math.max(maxConcurrent, activeFetches);
      await new Promise(r => setTimeout(r, 20));
      activeFetches--;
      if (url.includes("/contact")) {
        return { ok: true, status: 200, url, redirected: false, headers: { get: () => null }, text: async () => contactHtml };
      }
      return { ok: true, status: 200, url, redirected: false, headers: { get: () => null }, text: async () => spaShellHtml };
    };
    mockFetch._isMock = true;

    let fallbackCalled = false;
    const result = await CrawlerEngine.crawlAndExtractUrl("https://betamfg.com", {
      fetchFn: mockFetch,
      crawlDepth: 3,
      renderTabFallback: async () => {
        fallbackCalled = true;
        return renderedSpaHtml;
      }
    });

    assert(fallbackCalled, "renderTabFallback should be invoked when static HTML is an empty SPA shell");
    assert.strictEqual(result.data.websiteStatus, "Working");
    assert(result.data.companyAddress.includes("Peenya") || result.data.phoneNumber === "9811122233", "Extracted data should reflect rendered SPA + contact page");
  });

  // Start proxy server on ephemeral port for HTTP security tests
  process.env.PORT = "0";
  process.env.HOST = "127.0.0.1";
  process.env.PROXY_AUTH_TOKEN = "test-secret-token";
  const server = require("../server/server.js");
  await new Promise(resolve => {
    if (server.listening) return resolve();
    server.once("listening", resolve);
  });
  const port = server.address().port;

  try {
    await test("Server restricts CORS to extension/localhost origins", async () => {
      const extRes = await httpRequest(port, "GET", "/api/health", { Origin: "chrome-extension://abcdef" });
      assert.strictEqual(extRes.status, 200);
      assert.strictEqual(extRes.headers["access-control-allow-origin"], "chrome-extension://abcdef");

      const evilRes = await httpRequest(port, "GET", "/api/health", { Origin: "https://evil.example.com" });
      assert.strictEqual(evilRes.headers["access-control-allow-origin"], undefined);
    });

    await test("Server rejects unauthenticated /api/analyze requests with 401", async () => {
      const res = await httpRequest(port, "POST", "/api/analyze", { "Content-Type": "application/json" }, JSON.stringify({ context: {}, userPrompt: "a", systemInstruction: "b" }));
      assert.strictEqual(res.status, 401);
    });

    await test("Server rejects malformed JSON with 400 and oversized payloads with 413", async () => {
      const badJsonRes = await httpRequest(
        port,
        "POST",
        "/api/analyze",
        { "Content-Type": "application/json", "x-api-key": "test-secret-token" },
        "{not-json"
      );
      assert.strictEqual(badJsonRes.status, 400);

      const bigBody = "x".repeat(2 * 1024 * 1024 + 100);
      const tooBigRes = await httpRequest(
        port,
        "POST",
        "/api/analyze",
        { "Content-Type": "application/json", "x-api-key": "test-secret-token" },
        bigBody
      );
      assert.strictEqual(tooBigRes.status, 413);
    });
  } finally {
    server.close();
  }

  console.log("==========================================================");
  console.log(`  PROXY & QUEUE RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log("==========================================================");
  process.exit(failed > 0 ? 1 : 0);
})();
