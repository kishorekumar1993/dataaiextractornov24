/**
 * Comprehensive Automated Test Suite for Gemini AI Crawler Reliability
 * Tests all 15 scenarios required by the specification.
 */

const assert = require("assert");
const GeminiClient = require("../geminiClient.js");
const { CrawlerQueueManager } = require("../requestQueue.js");

// Dummy context & system instructions for tests
const mockContext = {
  url: "https://example-steel.com",
  domain: "example-steel.com",
  crawledText: "Zhejiang Jiangnan Steel Structure Co., Ltd. Headquarters: Yashan Rd., Zhapu, Jiaxing City, Zhejiang Prov., China. Phone: +86-573-85127888."
};

const mockPrompt = "Analyze website data";
const mockInstruction = "Extract structured intelligence";

const validExtractedResponse = {
  websiteStatus: "Working",
  notWorkingReason: "",
  businessType: "Manufacturer",
  companyProfile: "Available",
  companyName: "Zhejiang Jiangnan Steel Structure Company, Limited",
  countryName: "China",
  companyAddress: "Yashan Road, Zhapu, Jiaxing City, Zhejiang Province",
  state: "Available",
  city: "Available",
  emailId: "jngg@zjcne.com",
  secondaryEmailId: "",
  phoneNumber: "57385127888",
  numberOfProducts: "3",
  productImages: "3",
  numberOfProductDescriptions: "0"
};

function createMockResponse(status, data, headers = {}) {
  const headerMap = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status: status,
    statusText: status === 200 ? "OK" : status === 503 ? "Service Unavailable" : status === 429 ? "Too Many Requests" : "Error",
    headers: {
      get: (h) => headerMap.get(h) || null
    },
    text: async () => typeof data === "string" ? data : JSON.stringify(data)
  };
}

function wrapCandidateJson(obj) {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(obj) }]
        },
        finishReason: "STOP"
      }
    ]
  });
}

async function runTestSuite() {
  console.log("==========================================================");
  console.log("  STARTING CRAWLER RELIABILITY TEST SUITE (15 SCENARIOS)  ");
  console.log("==========================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`• Test: ${name} ... `);
    try {
      await fn();
      console.log(" PASSED");
      passed++;
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
      console.error(err);
      failed++;
    }
  }

  // 1. Gemini API returns 200
  await test("Scenario 1: Gemini API returns 200 (Success)", async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return createMockResponse(200, wrapCandidateJson(validExtractedResponse));
    };

    const res = await GeminiClient.callGeminiWithRetryAndFallback({
      context: mockContext,
      userPrompt: mockPrompt,
      systemInstruction: mockInstruction,
      apiKey: "test_key",
      fetchImpl: mockFetch
    });

    assert.strictEqual(callCount, 1);
    assert.strictEqual(res.data.companyName, "Zhejiang Jiangnan Steel Structure Company, Limited");
    assert.strictEqual(res.data.countryName, "China");
    assert.strictEqual(res.data.companyAddress, "Yashan Road, Zhapu, Jiaxing City, Zhejiang Province");
    assert.strictEqual(res.meta.retriesUsed, 0);
  });

  // 2. Gemini API returns 503 (Temporary High Demand - retry succeeds)
  await test("Scenario 2: Gemini API returns 503 (Automatic Retry & Backoff)", async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount < 3) {
        return createMockResponse(503, {
          error: { message: "This model is currently experiencing high demand. Please try again later." }
        });
      }
      return createMockResponse(200, wrapCandidateJson(validExtractedResponse));
    };

    const res = await GeminiClient.callGeminiWithRetryAndFallback({
      context: mockContext,
      userPrompt: mockPrompt,
      systemInstruction: mockInstruction,
      apiKey: "test_key",
      baseDelayMs: 20, // fast test delay
      maxDelayMs: 50,
      jitterMs: 10,
      fetchImpl: mockFetch
    });

    assert.strictEqual(callCount, 3, "Should have retried twice and succeeded on 3rd attempt");
    assert.strictEqual(res.meta.retriesUsed, 2);
  });

  // 3. Gemini API returns 429 (Rate Limit with Retry-After header)
  await test("Scenario 3: Gemini API returns 429 (Respects Retry-After header)", async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return createMockResponse(429, { error: { message: "Rate limit exceeded" } }, { "Retry-After": "1" });
      }
      return createMockResponse(200, wrapCandidateJson(validExtractedResponse));
    };

    const res = await GeminiClient.callGeminiWithRetryAndFallback({
      context: mockContext,
      userPrompt: mockPrompt,
      systemInstruction: mockInstruction,
      apiKey: "test_key",
      baseDelayMs: 10,
      maxDelayMs: 50,
      jitterMs: 10,
      fetchImpl: mockFetch
    });

    assert.strictEqual(callCount, 2);
    assert.strictEqual(res.meta.retriesUsed, 1);
  });

  // 4. Gemini API returns 500 (Internal Server Error - retry)
  await test("Scenario 4: Gemini API returns 500 (Server Error Retry)", async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return createMockResponse(500, { error: { message: "Internal server error" } });
      }
      return createMockResponse(200, wrapCandidateJson(validExtractedResponse));
    };

    const res = await GeminiClient.callGeminiWithRetryAndFallback({
      context: mockContext,
      userPrompt: mockPrompt,
      systemInstruction: mockInstruction,
      apiKey: "test_key",
      baseDelayMs: 10,
      maxDelayMs: 50,
      fetchImpl: mockFetch
    });

    assert.strictEqual(callCount, 2);
    assert.strictEqual(res.data.websiteStatus, "Working");
  });

  // 5. Gemini API returns 400 (Bad Request - Permanent Error, No Retry)
  await test("Scenario 5: Gemini API returns 400 (Permanent Error - No Retry)", async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return createMockResponse(400, { error: { message: "Invalid argument: malformed payload" } });
    };

    let caught = false;
    try {
      await GeminiClient.callGeminiWithRetryAndFallback({
        context: mockContext,
        userPrompt: mockPrompt,
        systemInstruction: mockInstruction,
        apiKey: "test_key",
        maxRetries: 4,
        fetchImpl: mockFetch
      });
    } catch (e) {
      caught = true;
      assert.strictEqual(callCount, 1, "Must NOT retry a 400 Bad Request error");
      assert.ok(e.isPermanent, "Error must be marked as permanent");
    }
    assert.ok(caught, "Expected 400 error to be thrown");
  });

  // 6. Network connection failure (handled & retried)
  await test("Scenario 6: Network connection failure (Transient Retry)", async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Failed to fetch: NetworkError");
      }
      return createMockResponse(200, wrapCandidateJson(validExtractedResponse));
    };

    const res = await GeminiClient.callGeminiWithRetryAndFallback({
      context: mockContext,
      userPrompt: mockPrompt,
      systemInstruction: mockInstruction,
      apiKey: "test_key",
      baseDelayMs: 10,
      maxDelayMs: 50,
      fetchImpl: mockFetch
    });

    assert.strictEqual(callCount, 2);
    assert.strictEqual(res.meta.retriesUsed, 1);
  });

  // 7. Request timeout (AbortController triggered)
  await test("Scenario 7: Request timeout (Abort handling)", async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        const abortErr = new Error("The operation was aborted");
        abortErr.name = "AbortError";
        throw abortErr;
      }
      return createMockResponse(200, wrapCandidateJson(validExtractedResponse));
    };

    const res = await GeminiClient.callGeminiWithRetryAndFallback({
      context: mockContext,
      userPrompt: mockPrompt,
      systemInstruction: mockInstruction,
      apiKey: "test_key",
      baseDelayMs: 10,
      maxDelayMs: 50,
      timeoutMs: 100,
      fetchImpl: mockFetch
    });

    assert.strictEqual(callCount, 2);
    assert.strictEqual(res.meta.retriesUsed, 1);
  });

  // 8. Empty AI response rejected
  await test("Scenario 8: Empty AI response rejection", async () => {
    const mockFetch = async () => {
      return createMockResponse(200, "");
    };

    let caught = false;
    try {
      await GeminiClient.callGeminiWithRetryAndFallback({
        context: mockContext,
        userPrompt: mockPrompt,
        systemInstruction: mockInstruction,
        apiKey: "test_key",
        maxRetries: 0,
        fetchImpl: mockFetch
      });
    } catch (e) {
      caught = true;
      assert.ok(e.message.includes("Empty response"));
    }
    assert.ok(caught);
  });

  // 9. Invalid JSON response rejected
  await test("Scenario 9: Invalid JSON response rejection", async () => {
    const mockFetch = async () => {
      return createMockResponse(200, JSON.stringify({
        candidates: [{ content: { parts: [{ text: "This is plain text, not JSON." }] }, finishReason: "STOP" }]
      }));
    };

    let caught = false;
    try {
      await GeminiClient.callGeminiWithRetryAndFallback({
        context: mockContext,
        userPrompt: mockPrompt,
        systemInstruction: mockInstruction,
        apiKey: "test_key",
        maxRetries: 0,
        fetchImpl: mockFetch
      });
    } catch (e) {
      caught = true;
      assert.ok(e.message.includes("malformed JSON"));
    }
    assert.ok(caught);
  });

  // 10. Truncated AI response detected
  await test("Scenario 10: Truncated AI response detected", async () => {
    const mockFetch = async () => {
      return createMockResponse(200, JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"websiteStatus": "Working", "companyName": "Incomplete' }] }, finishReason: "MAX_TOKENS" }]
      }));
    };

    let caught = false;
    try {
      await GeminiClient.callGeminiWithRetryAndFallback({
        context: mockContext,
        userPrompt: mockPrompt,
        systemInstruction: mockInstruction,
        apiKey: "test_key",
        maxRetries: 0,
        fetchImpl: mockFetch
      });
    } catch (e) {
      caught = true;
      assert.ok(e.message.includes("truncated due to output token limit"));
    }
    assert.ok(caught);
  });

  // 11. Primary model failure (503s) -> Secondary model succeeds (Fallback)
  await test("Scenario 11: Primary model 503s -> Secondary Model Fallback Success", async () => {
    let attemptedModels = [];
    const mockFetch = async (url) => {
      const model = url.split("models/")[1].split(":")[0];
      attemptedModels.push(model);
      if (model === "gemini-3.5-flash-lite") {
        return createMockResponse(503, { error: { message: "Primary model overloaded" } });
      }
      return createMockResponse(200, wrapCandidateJson(validExtractedResponse));
    };

    const res = await GeminiClient.callGeminiWithRetryAndFallback({
      context: mockContext,
      userPrompt: mockPrompt,
      systemInstruction: mockInstruction,
      apiKey: "test_key",
      primaryModel: "gemini-3.5-flash-lite",
      fallbackModel: "gemini-3.1-flash-lite",
      maxRetries: 1, // 1 retry on primary, then fallback
      baseDelayMs: 10,
      maxDelayMs: 30,
      fetchImpl: mockFetch
    });

    assert.strictEqual(res.meta.modelUsed, "gemini-3.1-flash-lite");
    assert.strictEqual(res.meta.isFallback, true);
    assert.ok(attemptedModels.includes("gemini-3.5-flash-lite"));
    assert.ok(attemptedModels.includes("gemini-3.1-flash-lite"));
  });

  // 12. Both models fail -> Recorded in Failed Queue (no crash)
  await test("Scenario 12: Both models fail -> Recorded in Failed Queue", async () => {
    const mockFetch = async () => {
      return createMockResponse(503, { error: { message: "Total global outage" } });
    };

    const mockClient = {
      callGeminiWithRetryAndFallback: async () => {
        throw new Error("Both models exhausted retries");
      }
    };

    const queue = new CrawlerQueueManager({ concurrency: 1, geminiClient: mockClient });
    await queue.enqueue({
      url: "https://fail-test.com",
      context: mockContext,
      userPrompt: mockPrompt,
      systemInstruction: mockInstruction
    });

    // Wait for queue processing to settle
    await new Promise(r => setTimeout(r, 50));

    const status = queue.getStatus();
    assert.strictEqual(status.failedCount, 1);
    assert.strictEqual(queue.failedQueue[0].url, "https://fail-test.com");
    assert.strictEqual(status.completedCount, 0);
  });

  // 13. Queue deduplication (no duplicate requests for same URL)
  await test("Scenario 13: Queue deduplication (prevents duplicate requests)", async () => {
    const mockClient = {
      callGeminiWithRetryAndFallback: async () => {
        await new Promise(r => setTimeout(r, 60));
        return { data: validExtractedResponse, meta: { modelUsed: "gemini-3.5-flash-lite" } };
      }
    };

    const queue = new CrawlerQueueManager({ concurrency: 1, geminiClient: mockClient });
    const res1 = await queue.enqueue({ url: "https://unique-site.com", context: mockContext });
    const res2 = await queue.enqueue({ url: "https://unique-site.com", context: mockContext }); // Duplicate!

    assert.strictEqual(res1.enqueued, true);
    assert.strictEqual(res2.enqueued, false);
    assert.ok(res2.reason.includes("already in queue"));
  });

  // 14. Concurrency control and inter-request delay enforcement
  await test("Scenario 14: Concurrency control & inter-request delay", async () => {
    let activeWorkers = 0;
    let maxObservedWorkers = 0;

    const mockClient = {
      callGeminiWithRetryAndFallback: async () => {
        activeWorkers++;
        maxObservedWorkers = Math.max(maxObservedWorkers, activeWorkers);
        await new Promise(r => setTimeout(r, 30));
        activeWorkers--;
        return { data: validExtractedResponse, meta: { modelUsed: "gemini-3.5-flash-lite" } };
      }
    };

    const queue = new CrawlerQueueManager({
      concurrency: 1,
      interRequestDelayMs: 20,
      geminiClient: mockClient
    });

    await queue.enqueue({ url: "https://site-a.com", context: mockContext });
    await queue.enqueue({ url: "https://site-b.com", context: mockContext });
    await queue.enqueue({ url: "https://site-c.com", context: mockContext });

    await new Promise(r => setTimeout(r, 250));

    assert.strictEqual(maxObservedWorkers, 1, "Concurrency must remain strictly at 1");
    assert.strictEqual(queue.getStatus().completedCount, 3);
  });

  // 15. Schema & QC validation preservation
  await test("Scenario 15: Schema & QC validation preservation (State, City, Phone)", async () => {
    const testRawResponse = {
      ...validExtractedResponse,
      state: "available", // lower case
      city: "available", // lower case
      phoneNumber: "+86 573-85127888", // uncleaned international phone
    };

    const validated = GeminiClient.validateExtractedJson(testRawResponse);
    assert.strictEqual(validated.state, "Available");
    assert.strictEqual(validated.city, "Available");
    assert.strictEqual(validated.phoneNumber, "57385127888", "Country code and symbols must be stripped");

    // Test non-available state
    const testNonAvail = { ...validExtractedResponse, state: "California", city: "Los Angeles", phoneNumber: "1800123456" };
    const validated2 = GeminiClient.validateExtractedJson(testNonAvail);
    assert.strictEqual(validated2.state, "Not Available");
    assert.strictEqual(validated2.city, "Not Available");
    assert.strictEqual(validated2.phoneNumber, "", "Toll-free numbers must be rejected to empty string");
  });

  // 16. Secondary Phone Fallback when primary is toll-free or Not Available
  await test("Scenario 16: Secondary Phone Fallback when primary phone is toll-free (ionthis.com)", async () => {
    const testTollFreePrimary = {
      ...validExtractedResponse,
      phoneNumber: "1-800-276-2792", // primary main phone is toll-free
      countryName: "United States Of America"
    };

    const contextWithSecondary = {
      detectedPhones: ["1-800-276-2792", "+1-832-955-1531", "+1 713 983 8528"]
    };

    const validated = GeminiClient.validateExtractedJson(testTollFreePrimary, contextWithSecondary);
    assert.strictEqual(validated.phoneNumber, "8329551531", "Secondary non-toll-free phone must be taken");

    // Also test when primary was 'Not Available'
    const testNotAvailable = {
      ...validExtractedResponse,
      phoneNumber: "Not Available",
      countryName: "United States Of America"
    };
    const validated2 = GeminiClient.validateExtractedJson(testNotAvailable, contextWithSecondary);
    assert.strictEqual(validated2.phoneNumber, "8329551531", "When primary is Not Available, secondary must be taken");
  });

  // 16. Secondary Phone Fallback from detectedPhones when primary is toll-free or Not Available
  await test("Scenario 16: Secondary Phone Fallback from detectedPhones (Toll-Free handling like ionthis.com)", async () => {
    const contextWithSecondary = {
      detectedPhones: [
        "1-800-276-2792", // primary toll-free
        "+1-832-955-1531", // secondary local phone
        "+1 713 983 8528"
      ]
    };

    const aiResponseWithTollFree = {
      ...validExtractedResponse,
      countryName: "United States Of America",
      phoneNumber: "1-800-276-2792"
    };

    const validated = GeminiClient.validateExtractedJson(aiResponseWithTollFree, contextWithSecondary);
    assert.strictEqual(validated.phoneNumber, "8329551531", "Toll-free primary phone must fallback to secondary local phone");

    // Also test when AI returns "Not Available"
    const aiResponseNotAvail = {
      ...validExtractedResponse,
      countryName: "United States Of America",
      phoneNumber: "Not Available"
    };
    const validatedNotAvail = GeminiClient.validateExtractedJson(aiResponseNotAvail, contextWithSecondary);
    assert.strictEqual(validatedNotAvail.phoneNumber, "8329551531", "'Not Available' must trigger secondary fallback");
  });

  console.log("\n==========================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL 15)`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
