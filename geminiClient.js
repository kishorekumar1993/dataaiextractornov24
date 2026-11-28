/**
 * Production-grade Gemini AI Client with:
 * - Exponential backoff with randomized jitter
 * - Automatic retry on 503 (high demand), 429 (rate limit), 500, 502, 504, 408 & network errors
 * - Retry-After header parsing
 * - Primary & Secondary model fallback
 * - Secure Header Authentication (x-goog-api-key)
 * - Optional Backend Proxy support
 * - Strict schema & QC response validation
 * - In-flight deduplication
 * - Structured audit logging
 */

(() => {
  // Global international calling codes for phone sanitization (all countries + common aliases)
  const COUNTRY_CODES = [
    { name: "united states of america", code: "1" },
    { name: "united states", code: "1" },
    { name: "usa", code: "1" },
    { name: "us", code: "1" },
    { name: "canada", code: "1" },
    { name: "dominican republic", code: "1" },
    { name: "puerto rico", code: "1" },
    { name: "jamaica", code: "1" },
    { name: "trinidad and tobago", code: "1" },
    { name: "bahamas", code: "1" },
    { name: "barbados", code: "1" },
    { name: "russia", code: "7" },
    { name: "russian federation", code: "7" },
    { name: "kazakhstan", code: "7" },
    { name: "egypt", code: "20" },
    { name: "south africa", code: "27" },
    { name: "greece", code: "30" },
    { name: "netherlands", code: "31" },
    { name: "holland", code: "31" },
    { name: "belgium", code: "32" },
    { name: "france", code: "33" },
    { name: "spain", code: "34" },
    { name: "hungary", code: "36" },
    { name: "italy", code: "39" },
    { name: "romania", code: "40" },
    { name: "switzerland", code: "41" },
    { name: "austria", code: "43" },
    { name: "united kingdom", code: "44" },
    { name: "england", code: "44" },
    { name: "scotland", code: "44" },
    { name: "wales", code: "44" },
    { name: "northern ireland", code: "44" },
    { name: "uk", code: "44" },
    { name: "denmark", code: "45" },
    { name: "sweden", code: "46" },
    { name: "norway", code: "47" },
    { name: "poland", code: "48" },
    { name: "germany", code: "49" },
    { name: "peru", code: "51" },
    { name: "mexico", code: "52" },
    { name: "cuba", code: "53" },
    { name: "argentina", code: "54" },
    { name: "brazil", code: "55" },
    { name: "chile", code: "56" },
    { name: "colombia", code: "57" },
    { name: "venezuela", code: "58" },
    { name: "malaysia", code: "60" },
    { name: "australia", code: "61" },
    { name: "indonesia", code: "62" },
    { name: "philippines", code: "63" },
    { name: "new zealand", code: "64" },
    { name: "singapore", code: "65" },
    { name: "thailand", code: "66" },
    { name: "japan", code: "81" },
    { name: "south korea", code: "82" },
    { name: "republic of korea", code: "82" },
    { name: "korea", code: "82" },
    { name: "vietnam", code: "84" },
    { name: "viet nam", code: "84" },
    { name: "china", code: "86" },
    { name: "turkey", code: "90" },
    { name: "turkiye", code: "90" },
    { name: "india", code: "91" },
    { name: "pakistan", code: "92" },
    { name: "afghanistan", code: "93" },
    { name: "sri lanka", code: "94" },
    { name: "myanmar", code: "95" },
    { name: "iran", code: "98" },
    { name: "south sudan", code: "211" },
    { name: "morocco", code: "212" },
    { name: "algeria", code: "213" },
    { name: "tunisia", code: "216" },
    { name: "libya", code: "218" },
    { name: "gambia", code: "220" },
    { name: "senegal", code: "221" },
    { name: "mauritania", code: "222" },
    { name: "mali", code: "223" },
    { name: "guinea", code: "224" },
    { name: "ivory coast", code: "225" },
    { name: "cote d'ivoire", code: "225" },
    { name: "burkina faso", code: "226" },
    { name: "niger", code: "227" },
    { name: "togo", code: "228" },
    { name: "benin", code: "229" },
    { name: "mauritius", code: "230" },
    { name: "liberia", code: "231" },
    { name: "sierra leone", code: "232" },
    { name: "ghana", code: "233" },
    { name: "nigeria", code: "234" },
    { name: "chad", code: "235" },
    { name: "central african republic", code: "236" },
    { name: "cameroon", code: "237" },
    { name: "cape verde", code: "238" },
    { name: "sao tome and principe", code: "239" },
    { name: "equatorial guinea", code: "240" },
    { name: "gabon", code: "241" },
    { name: "republic of the congo", code: "242" },
    { name: "democratic republic of the congo", code: "243" },
    { name: "angola", code: "244" },
    { name: "guinea-bissau", code: "245" },
    { name: "seychelles", code: "248" },
    { name: "sudan", code: "249" },
    { name: "rwanda", code: "250" },
    { name: "ethiopia", code: "251" },
    { name: "somalia", code: "252" },
    { name: "djibouti", code: "253" },
    { name: "kenya", code: "254" },
    { name: "tanzania", code: "255" },
    { name: "uganda", code: "256" },
    { name: "burundi", code: "257" },
    { name: "mozambique", code: "258" },
    { name: "zambia", code: "260" },
    { name: "madagascar", code: "261" },
    { name: "zimbabwe", code: "263" },
    { name: "namibia", code: "264" },
    { name: "malawi", code: "265" },
    { name: "lesotho", code: "266" },
    { name: "botswana", code: "267" },
    { name: "eswatini", code: "268" },
    { name: "comoros", code: "269" },
    { name: "eritrea", code: "291" },
    { name: "portugal", code: "351" },
    { name: "luxembourg", code: "352" },
    { name: "ireland", code: "353" },
    { name: "iceland", code: "354" },
    { name: "albania", code: "355" },
    { name: "malta", code: "356" },
    { name: "cyprus", code: "357" },
    { name: "finland", code: "358" },
    { name: "bulgaria", code: "359" },
    { name: "lithuania", code: "370" },
    { name: "latvia", code: "371" },
    { name: "estonia", code: "372" },
    { name: "moldova", code: "373" },
    { name: "armenia", code: "374" },
    { name: "belarus", code: "375" },
    { name: "andorra", code: "376" },
    { name: "monaco", code: "377" },
    { name: "san marino", code: "378" },
    { name: "vatican city", code: "379" },
    { name: "ukraine", code: "380" },
    { name: "serbia", code: "381" },
    { name: "montenegro", code: "382" },
    { name: "croatia", code: "385" },
    { name: "slovenia", code: "386" },
    { name: "bosnia and herzegovina", code: "387" },
    { name: "north macedonia", code: "389" },
    { name: "czech republic", code: "420" },
    { name: "czechia", code: "420" },
    { name: "slovakia", code: "421" },
    { name: "liechtenstein", code: "423" },
    { name: "belize", code: "501" },
    { name: "guatemala", code: "502" },
    { name: "el salvador", code: "503" },
    { name: "honduras", code: "504" },
    { name: "nicaragua", code: "505" },
    { name: "costa rica", code: "506" },
    { name: "panama", code: "507" },
    { name: "haiti", code: "509" },
    { name: "bolivia", code: "591" },
    { name: "guyana", code: "592" },
    { name: "ecuador", code: "593" },
    { name: "paraguay", code: "595" },
    { name: "suriname", code: "597" },
    { name: "uruguay", code: "598" },
    { name: "timor-leste", code: "670" },
    { name: "brunei", code: "673" },
    { name: "nauru", code: "674" },
    { name: "papua new guinea", code: "675" },
    { name: "tonga", code: "676" },
    { name: "solomon islands", code: "677" },
    { name: "vanuatu", code: "678" },
    { name: "fiji", code: "679" },
    { name: "palau", code: "680" },
    { name: "samoa", code: "685" },
    { name: "kiribati", code: "686" },
    { name: "tuvalu", code: "688" },
    { name: "micronesia", code: "691" },
    { name: "marshall islands", code: "692" },
    { name: "north korea", code: "850" },
    { name: "hong kong", code: "852" },
    { name: "macau", code: "853" },
    { name: "macao", code: "853" },
    { name: "cambodia", code: "855" },
    { name: "laos", code: "856" },
    { name: "bangladesh", code: "880" },
    { name: "taiwan", code: "886" },
    { name: "maldives", code: "960" },
    { name: "lebanon", code: "961" },
    { name: "jordan", code: "962" },
    { name: "syria", code: "963" },
    { name: "iraq", code: "964" },
    { name: "kuwait", code: "965" },
    { name: "saudi arabia", code: "966" },
    { name: "yemen", code: "967" },
    { name: "oman", code: "968" },
    { name: "palestine", code: "970" },
    { name: "united arab emirates", code: "971" },
    { name: "uae", code: "971" },
    { name: "israel", code: "972" },
    { name: "bahrain", code: "973" },
    { name: "qatar", code: "974" },
    { name: "bhutan", code: "975" },
    { name: "mongolia", code: "976" },
    { name: "nepal", code: "977" },
    { name: "tajikistan", code: "992" },
    { name: "turkmenistan", code: "993" },
    { name: "azerbaijan", code: "994" },
    { name: "georgia", code: "995" },
    { name: "kyrgyzstan", code: "996" },
    { name: "uzbekistan", code: "998" }
  ];

  const RETRYABLE_STATUS_CODES = new Set([503, 429, 500, 502, 504, 408]);
  const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

  const REQUIRED_SCHEMA_FIELDS = [
    "websiteStatus",
    "notWorkingReason",
    "businessType",
    "companyProfile",
    "companyName",
    "countryName",
    "companyAddress",
    "state",
    "city",
    "emailId",
    "secondaryEmailId",
    "phoneNumber",
    "numberOfProducts",
    "productImages",
    "numberOfProductDescriptions"
  ];

  // In-flight request map for deduplication
  const inFlightRequests = new Map();

  /**
   * Main entrypoint to call Gemini with retries and fallback
   */
  async function callGeminiWithRetryAndFallback(options) {
    const {
      context,
      userPrompt,
      systemInstruction,
      apiKey = "",
      primaryModel = "gemini-3.5-flash-lite",
      fallbackModel = "gemini-3.1-flash-lite",
      backendProxyUrl = "",
      backendProxyToken = "",
      onProgress = () => { },
      maxRetries = 4, // 1 initial + 4 retries = 5 attempts per model
      baseDelayMs = 1500,
      maxDelayMs = 16000,
      jitterMs = 800,
      timeoutMs = 45000,
      fetchImpl = (typeof fetch !== "undefined" ? fetch : null)
    } = options;

    if (!fetchImpl) {
      throw new Error("No fetch implementation available.");
    }

    // Deduplication Key based on website URL or domain
    const dedupKey = (context.url || context.domain || "default_req").toLowerCase();
    if (inFlightRequests.has(dedupKey)) {
      onProgress({ status: "waiting", message: "A request for this website is already in flight. Waiting for result..." });
      return await inFlightRequests.get(dedupKey);
    }

    const promise = (async () => {
      // 1. If backend proxy mode is active, send request to backend proxy
      if (backendProxyUrl && backendProxyUrl.trim() !== "") {
        return await callBackendProxy({
          backendProxyUrl,
          backendProxyToken,
          context,
          userPrompt,
          systemInstruction,
          primaryModel,
          fallbackModel,
          timeoutMs,
          fetchImpl,
          onProgress
        });
      }

      // 2. Direct API Mode
      if (!apiKey || apiKey.trim() === "") {
        throw new Error("Gemini API Key is missing. Please configure it in settings or provide a backend proxy URL.");
      }

      const modelsToTry = [
        { name: primaryModel, isFallback: false },
        { name: fallbackModel, isFallback: true }
      ].filter((m, idx, arr) => m.name && (idx === 0 || m.name !== arr[0].name));

      let lastError = null;

      for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
        const currentModel = modelsToTry[mIdx];
        const isFallback = currentModel.isFallback;

        if (isFallback) {
          onProgress({
            status: "fallback",
            message: `Primary model (${primaryModel}) unavailable. Switching to fallback model (${currentModel.name})...`
          });
          logStructuredEvent({
            event: "model_fallback",
            websiteUrl: context.url,
            provider: "google-gemini",
            fromModel: primaryModel,
            toModel: currentModel.name,
            reason: lastError ? lastError.message : "Primary retries exhausted"
          });
        }

        try {
          const result = await executeModelRequestWithRetries({
            modelName: currentModel.name,
            isFallback,
            context,
            userPrompt,
            systemInstruction,
            apiKey,
            maxRetries,
            baseDelayMs,
            maxDelayMs,
            jitterMs,
            timeoutMs,
            fetchImpl,
            onProgress
          });

          return result;
        } catch (err) {
          lastError = err;
          // If permanent client error (e.g. 400 Bad Request, 401 Invalid Key, 403 Forbidden), do not fallback
          if (err.isPermanent) {
            throw err;
          }
          // Otherwise continue to next fallback model
        }
      }

      throw new Error(`All configured AI models failed. Last error: ${lastError ? lastError.message : "Unknown error"}`);
    })();

    inFlightRequests.set(dedupKey, promise);

    try {
      return await promise;
    } finally {
      inFlightRequests.delete(dedupKey);
    }
  }

  /**
   * Executes request for a single model with exponential backoff & jitter
   */
  async function executeModelRequestWithRetries(opts) {
    const {
      modelName,
      isFallback,
      context,
      userPrompt,
      systemInstruction,
      apiKey,
      maxRetries,
      baseDelayMs,
      maxDelayMs,
      jitterMs,
      timeoutMs,
      fetchImpl,
      onProgress
    } = opts;

    let attempt = 0;

    while (attempt <= maxRetries) {
      const startTime = Date.now();
      let response = null;
      let abortController = null;
      let timer = null;

      try {
        if (attempt > 0) {
          onProgress({
            status: "retrying",
            model: modelName,
            attempt,
            maxRetries,
            message: `Retrying request with ${modelName} (attempt ${attempt + 1}/${maxRetries + 1})...`
          });
        }

        // Prepare request body
        const requestBody = {
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }]
            }
          ],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0,
            maxOutputTokens: 1024
          }
        };

        // Authenticate using x-goog-api-key header (avoid leaking API key in URL query string)
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

        abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
        if (abortController) {
          timer = setTimeout(() => abortController.abort(), timeoutMs);
        }

        const headers = { "Content-Type": "application/json" };
        if (apiKey) {
          headers["x-goog-api-key"] = apiKey;
        }

        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(requestBody),
          signal: abortController ? abortController.signal : undefined
        });

        if (timer) clearTimeout(timer);

        const durationMs = Date.now() - startTime;

        // 1. Handle HTTP OK
        if (response.ok) {
          const jsonText = await response.text();
          const parsedData = validateAndParseGeminiResponse(jsonText, modelName, context);

          logStructuredEvent({
            event: "api_success",
            websiteUrl: context.url,
            provider: "google-gemini",
            model: modelName,
            isFallback,
            attempt,
            httpStatus: response.status,
            durationMs,
            status: "success"
          });

          return {
            data: parsedData,
            meta: {
              modelUsed: modelName,
              isFallback,
              retriesUsed: attempt,
              durationMs
            }
          };
        }

        // 2. Handle HTTP Errors
        const errorBodyText = await response.text();
        let apiErrorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errObj = JSON.parse(errorBodyText);
          if (errObj.error?.message) {
            apiErrorMessage = errObj.error.message;
          }
        } catch (_) { }

        // Check if permanent 4xx error
        if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
          const permErr = new Error(`Gemini API permanent failure [HTTP ${response.status}]: ${apiErrorMessage}`);
          permErr.isPermanent = true;
          permErr.httpStatus = response.status;
          logStructuredEvent({
            event: "api_permanent_failure",
            websiteUrl: context.url,
            provider: "google-gemini",
            model: modelName,
            isFallback,
            attempt,
            httpStatus: response.status,
            durationMs,
            failureReason: apiErrorMessage,
            status: "failed"
          });
          throw permErr;
        }

        // Check if retryable error (503, 429, 500, 502, 504, 408)
        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          if (attempt >= maxRetries) {
            const maxRetryErr = new Error(`Model ${modelName} exhausted max retries (${maxRetries}). Last error: [HTTP ${response.status}] ${apiErrorMessage}`);
            maxRetryErr.httpStatus = response.status;
            throw maxRetryErr;
          }

          // Calculate delay with exponential backoff & jitter
          const retryAfterHeader = response.headers ? response.headers.get("Retry-After") : null;
          let delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs, jitterMs, retryAfterHeader);

          onProgress({
            status: "backed_off",
            model: modelName,
            attempt: attempt + 1,
            delayMs,
            message: `Model ${modelName} returned HTTP ${response.status} (${apiErrorMessage.slice(0, 80)}). Waiting ${(delayMs / 1000).toFixed(1)}s before retry...`
          });

          logStructuredEvent({
            event: "api_retry_backoff",
            websiteUrl: context.url,
            provider: "google-gemini",
            model: modelName,
            isFallback,
            attempt,
            httpStatus: response.status,
            delayMs,
            failureReason: apiErrorMessage
          });

          await sleep(delayMs);
          attempt++;
          continue;
        }

        // Other unexpected status codes
        throw new Error(`Unexpected Gemini API HTTP ${response.status}: ${apiErrorMessage}`);

      } catch (err) {
        if (timer) clearTimeout(timer);

        if (err.isPermanent) {
          throw err;
        }

        // Abort / Timeout / Network error handling
        const isAbort = err.name === "AbortError" || (err.message && err.message.toLowerCase().includes("abort"));
        const isNetworkError = !response || isAbort || (err.message && err.message.toLowerCase().includes("fetch"));

        if (isNetworkError && attempt < maxRetries) {
          const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs, jitterMs, null);
          const reason = isAbort ? `Request timed out after ${timeoutMs}ms` : err.message;

          onProgress({
            status: "network_retry",
            model: modelName,
            attempt: attempt + 1,
            delayMs,
            message: `Network/Timeout issue (${reason}). Retrying in ${(delayMs / 1000).toFixed(1)}s...`
          });

          logStructuredEvent({
            event: "api_network_retry",
            websiteUrl: context.url,
            provider: "google-gemini",
            model: modelName,
            isFallback,
            attempt,
            delayMs,
            failureReason: reason
          });

          await sleep(delayMs);
          attempt++;
          continue;
        }

        throw err;
      }
    }

    throw new Error(`Model ${modelName} failed after ${maxRetries} retries.`);
  }

  /**
   * Backend Proxy Client for secure environments where the key is kept on a server
   */
  async function callBackendProxy(opts) {
    const {
      backendProxyUrl,
      backendProxyToken = "",
      context,
      userPrompt,
      systemInstruction,
      primaryModel,
      fallbackModel,
      timeoutMs,
      fetchImpl,
      onProgress
    } = opts;

    onProgress({ status: "backend_proxy", message: `Sending request through secure backend proxy: ${backendProxyUrl}...` });

    let timer = null;
    let abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (abortController) {
      timer = setTimeout(() => abortController.abort(), timeoutMs);
    }

    try {
      const proxyHeaders = { "Content-Type": "application/json" };
      if (backendProxyToken && backendProxyToken.trim() !== "") {
        proxyHeaders["x-api-key"] = backendProxyToken.trim();
      }
      const response = await fetchImpl(backendProxyUrl, {
        method: "POST",
        headers: proxyHeaders,
        body: JSON.stringify({
          context,
          userPrompt,
          systemInstruction,
          primaryModel,
          fallbackModel
        }),
        signal: abortController ? abortController.signal : undefined
      });

      if (timer) clearTimeout(timer);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Backend proxy error [HTTP ${response.status}]: ${errText}`);
      }

      const proxyResult = await response.json();
      if (!proxyResult.success || !proxyResult.data) {
        throw new Error(proxyResult.error || "Backend proxy returned invalid response format");
      }

      // Re-validate data locally as QC guarantee
      const validated = validateExtractedJson(proxyResult.data, context);

      return {
        data: validated,
        meta: proxyResult.meta || {
          modelUsed: proxyResult.modelUsed || primaryModel,
          isFallback: !!proxyResult.isFallback,
          retriesUsed: proxyResult.retriesUsed || 0,
          durationMs: proxyResult.durationMs || 0
        }
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Backoff with jitter and Retry-After support
   */
  function calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs, jitterMs, retryAfterHeader) {
    // 1. Exponential Backoff: base * 2^attempt
    let delay = baseDelayMs * Math.pow(2, attempt);

    // 2. Add randomized jitter: [0, jitterMs)
    const jitter = Math.floor(Math.random() * jitterMs);
    delay = Math.min(maxDelayMs, delay + jitter);

    // 3. Respect Retry-After header if provided by server
    if (retryAfterHeader) {
      const parsedSeconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
        const serverWaitMs = parsedSeconds * 1000;
        delay = Math.max(delay, Math.min(maxDelayMs, serverWaitMs));
      } else {
        const parsedDate = Date.parse(retryAfterHeader);
        if (!isNaN(parsedDate)) {
          const dateWaitMs = Math.max(0, parsedDate - Date.now());
          delay = Math.max(delay, Math.min(maxDelayMs, dateWaitMs));
        }
      }
    }

    return delay;
  }

  /**
   * Validates raw Gemini response structure & extracts candidate text
   */
  function validateAndParseGeminiResponse(rawResponseBodyText, modelName, context = null) {
    if (!rawResponseBodyText || rawResponseBodyText.trim() === "") {
      throw new Error(`Empty response received from ${modelName}`);
    }

    let parsedResponse = null;
    try {
      parsedResponse = JSON.parse(rawResponseBodyText);
    } catch (e) {
      throw new Error(`Failed to parse Gemini API response wrapper: ${e.message}`);
    }

    const candidate = parsedResponse.candidates?.[0];
    if (!candidate) {
      if (parsedResponse.promptFeedback?.blockReason) {
        throw new Error(`Prompt blocked by safety filters: ${parsedResponse.promptFeedback.blockReason}`);
      }
      throw new Error(`No candidates returned by model ${modelName}`);
    }

    if (candidate.finishReason && candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
      throw new Error(`Model execution finished with non-standard reason: ${candidate.finishReason}`);
    }

    const partText = candidate.content?.parts?.[0]?.text;
    if (!partText || partText.trim() === "") {
      throw new Error(`Candidate content is empty from ${modelName}`);
    }

    // Strip markdown fences if present
    const cleanedJsonText = partText
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/```$/, "")
      .trim();

    let extractedObject = null;
    try {
      extractedObject = JSON.parse(cleanedJsonText);
    } catch (jsonErr) {
      // Check if truncated
      if (candidate.finishReason === "MAX_TOKENS") {
        throw new Error(`Response was truncated due to output token limit: ${jsonErr.message}`);
      }
      throw new Error(`Model generated malformed JSON: ${jsonErr.message}. Output was: "${cleanedJsonText.slice(0, 150)}..."`);
    }

    return validateExtractedJson(extractedObject, context);
  }

  /**
   * Enforces all QC Schema rules and sanitizes phone numbers
   */
  function validateExtractedJson(obj, context = null) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error("Extracted result is not a valid JSON object.");
    }

    // Check mandatory fields
    const missingFields = REQUIRED_SCHEMA_FIELDS.filter(field => !(field in obj));
    if (missingFields.length > 0) {
      throw new Error(`Extracted JSON is missing mandatory fields: ${missingFields.join(", ")}`);
    }

    // Clone clean result
    const clean = {};
    for (const key of REQUIRED_SCHEMA_FIELDS) {
      clean[key] = obj[key] !== undefined && obj[key] !== null ? String(obj[key]) : "";
    }

    // Strict validation for State & City (never assume Available if companyAddress is missing / Not Available)
    const hasAddress = Boolean(clean.companyAddress && clean.companyAddress.trim() && clean.companyAddress.trim().toLowerCase() !== "not available");
    const rawState = clean.state.trim().toLowerCase();
    clean.state = (hasAddress && rawState === "available") ? "Available" : "Not Available";

    const rawCity = clean.city.trim().toLowerCase();
    clean.city = (hasAddress && rawCity === "available") ? "Available" : "Not Available";

    // Validate emailId & secondaryEmailId (reject placeholders/assets, fallback to context.detectedEmails if needed)
    const isRealEmail = (e) => {
      if (!e || typeof e !== "string") return false;
      const lower = e.trim().toLowerCase();
      if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(lower)) return false;
      if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|pdf|woff2?)$/i.test(lower)) return false;
      const [localPart = "", dom = ""] = lower.split("@");
      if (/^(?:primary_email|secondary_email|contact_privacy|your|you|name|yourname|your_name|user|username|youremail|your\.email|myemail|someone|sample|demo|placeholder|fake|dummy|test|testing|abc|xyz|john\.?doe|jane\.?doe|noreply|no-reply|donotreply|do-not-reply|mailer-daemon)$/i.test(localPart)) {
        return false;
      }
      return !["example.com", "example.org", "example.net", "domain.com", "domain.org", "yourdomain.com", "yourdomain.org", "yoursite.com", "mysite.com", "website.com", "company.com", "yourcompany.com", "your-company.com", "yourbusiness.com", "mybusiness.com", "examplecompany.com", "companyname.com", "email.com", "mail.com", "test.com", "test.org", "sample.com", "doe.com", "sentry.io", "wixpress.com", "wix.com", "w3.org", "schema.org", "facebook.com", "fbcdn.net", "godaddy.com", "squarespace.com", "shopify.com"].some(d => dom === d || dom.endsWith("." + d));
    };
    const isPresentInSource = (e) => {
      if (!e) return false;
      // Only enforce source presence in real crawls where detectedEmails array is provided
      if (!context || !Array.isArray(context.detectedEmails)) return true;
      const lower = e.trim().toLowerCase();
      if (context.detectedEmails.some(de => String(de).trim().toLowerCase() === lower)) return true;
      if (context.crawledText && context.crawledText.toLowerCase().includes(lower)) return true;
      return false;
    };
    clean.emailId = String(clean.emailId || "").replace(/[\s\u00A0]+/g, "");
    clean.secondaryEmailId = String(clean.secondaryEmailId || "").replace(/[\s\u00A0]+/g, "");

    if (!isRealEmail(clean.emailId) || !isPresentInSource(clean.emailId)) {
      const fallbackEmail = (context && Array.isArray(context.detectedEmails)) ? context.detectedEmails.find(isRealEmail) : "";
      clean.emailId = String(fallbackEmail || "").replace(/[\s\u00A0]+/g, "");
    }
    if (!isRealEmail(clean.secondaryEmailId) || !isPresentInSource(clean.secondaryEmailId) || clean.secondaryEmailId.toLowerCase() === clean.emailId.toLowerCase()) {
      clean.secondaryEmailId = "";
    }

    // Sanitize phone number (strip country code, leading zeros, toll-free, spaces)
    if (clean.phoneNumber) {
      clean.phoneNumber = sanitizePhoneNumber(clean.phoneNumber, clean.countryName);
    }

    // Secondary Phone Fallback: If phone is empty (e.g. main was toll-free) or Not Available, scan detectedPhones in context
    if ((!clean.phoneNumber || clean.phoneNumber === "Not Available") && context && Array.isArray(context.detectedPhones)) {
      for (const rawCandidate of context.detectedPhones) {
        const sanitized = sanitizePhoneNumber(rawCandidate, clean.countryName);
        if (sanitized && sanitized.length >= 7 && sanitized.length <= 15) {
          clean.phoneNumber = sanitized;
          break;
        }
      }
    }

    // Preserve extracted companyName without altering casing or inserting commas
    if (clean.companyName) {
      clean.companyName = clean.companyName.trim();
    }
    if (clean.companyAddress) {
      clean.companyAddress = clean.companyAddress.trim();
    }
    if (clean.countryName) {
      clean.countryName = normalizeCountryName(clean.countryName);
    }
    if (typeof obj.stateReason === "string" && obj.stateReason.trim()) {
      clean.stateReason = obj.stateReason.trim();
    }
    if (typeof obj.cityReason === "string" && obj.cityReason.trim()) {
      clean.cityReason = obj.cityReason.trim();
    }

    return clean;
  }

  /**
   * Capitalizes the first letter of each word and lowercases the rest
   */
  function toTitleCase(str) {
    if (!str) return "";
    return String(str).replace(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:'[A-Za-z]+)?/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  const COUNTRY_ALIASES = {
    "usa": "United States Of America",
    "u.s.a.": "United States Of America",
    "u.s.a": "United States Of America",
    "u.s.": "United States Of America",
    "u.s": "United States Of America",
    "us": "United States Of America",
    "united states": "United States Of America",
    "united states of america": "United States Of America",
    "uae": "United Arab Emirates",
    "u.a.e.": "United Arab Emirates",
    "u.a.e": "United Arab Emirates",
    "united arab emirates": "United Arab Emirates",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "u.k": "United Kingdom",
    "great britain": "United Kingdom",
    "britain": "United Kingdom",
    "ksa": "Saudi Arabia",
    "k.s.a.": "Saudi Arabia",
    "k.s.a": "Saudi Arabia",
    "prc": "China",
    "p.r.c.": "China",
    "p.r.c": "China",
    "p.r. china": "China",
    "peoples republic of china": "China",
    "people's republic of china": "China",
    "roc": "Taiwan",
    "r.o.c.": "Taiwan",
    "chinese taipei": "Taiwan",
    "republic of china": "Taiwan",
    "rok": "South Korea",
    "republic of korea": "South Korea",
    "korea": "South Korea",
    "czechia": "Czech Republic",
    "holland": "Netherlands",
    "the netherlands": "Netherlands",
    "turkiye": "Turkey",
    "türkiye": "Turkey",
    "russian federation": "Russia",
    "viet nam": "Vietnam",
    "hong kong sar": "Hong Kong",
    "macao": "Macau",
    "macau sar": "Macau",
    "deutschland": "Germany",
    "espana": "Spain",
    "españa": "Spain",
    "italia": "Italy",
    "brasil": "Brazil",
    "méxico": "Mexico",
    "schweiz": "Switzerland",
    "suisse": "Switzerland",
    "svizzera": "Switzerland",
    "osterreich": "Austria",
    "österreich": "Austria",
    "belgie": "Belgium",
    "belgië": "Belgium",
    "belgique": "Belgium",
    "sverige": "Sweden",
    "norge": "Norway",
    "danmark": "Denmark",
    "suomi": "Finland",
    "polska": "Poland",
    "burma": "Myanmar",
    "cote d'ivoire": "Ivory Coast",
    "côte d'ivoire": "Ivory Coast",
    "swaziland": "Eswatini",
    "republic of kenya": "Kenya",
    "ke": "Kenya"
  };

  function normalizeCountryName(rawCountry) {
    if (!rawCountry) return "";
    const trimmed = String(rawCountry).trim();
    const alias = COUNTRY_ALIASES[trimmed.toLowerCase()];
    if (alias) return alias;
    return toTitleCase(trimmed);
  }

  /**
   * Phone number sanitizer enforcing:
   * - Digits only
   * - Strips international calling code for any country
   * - Strips leading zeros so number never starts with 0
   * - Rejects toll-free numbers
   */
  function sanitizePhoneNumber(rawPhone, countryName = "") {
    if (!rawPhone) return "";
    let phone = String(rawPhone).trim();

    // Strip trailing extension suffixes (e.g. "ext. 102", "extension 45", "x123")
    phone = phone.replace(/(?:\s*(?:ext\.?|extension|x)\s*\d+)\s*$/i, "").trim();

    // Reject copyright/date year ranges (e.g. "2006-2025", "2005-2026") and DDMMYYYY/MMDDYYYY dates (e.g. "12-10-2025", "12102025")
    const rawDigits = phone.replace(/\D/g, "");
    if (
      /^(?:19|20)\d{2}\s*[-–—\/]\s*(?:19|20)\d{2}$/.test(phone) ||
      /^(?:19|20)\d{2}(?:19|20)\d{2}$/.test(rawDigits) ||
      /^(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}$/.test(phone) ||
      /^(?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])[-/.](?:19|20)\d{2}$/.test(phone) ||
      (/^\d{8}$/.test(rawDigits) && /(?:19\d{2}|20[0-3]\d)$/.test(rawDigits) && /^(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])|^(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])/.test(rawDigits))
    ) {
      return "";
    }

    // Check toll-free prefixes before stripping punctuation (handles +1 (800), (800), 1-833, 0800, 0808, 0500, 00800, 1800, 1860, 0120, 400)
    if (
      /^(?:\+?1[-.\s]?)?\(?(?:800|888|877|866|855|844|833)\)?[-.\s]?\d/.test(phone) ||
      /^(?:0800|0808|0500|00800|1800|1860|0120|400)[-.\s]?\d/.test(phone) ||
      /^1?(?:800|888|877|866|855|844|833)\d{7}$/.test(rawDigits) ||
      /^(?:0800|0808|0500|00800|1800|1860|0120)\d{5,}$/.test(rawDigits)
    ) {
      return "";
    }

    const normCountry = normalizeCountryName(countryName || "");
    const lowerCountry = normCountry.toLowerCase();
    const matchedCountry = COUNTRY_CODES.find(c =>
      lowerCountry === c.name ||
      new RegExp(`(?:^|\\b)${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|$)`, "i").test(lowerCountry)
    );
    const hasIntlPrefix = /^\s*(?:\+|00|\(\+\d+\))/.test(phone);

    // Normalize (+886) / + / 00 international prefixes before extracting digits
    phone = phone.replace(/^\s*(?:\+|00)/, "").replace(/\D/g, "");

    // Strip country code if matchedCountry applies, or if an explicit + / 00 international prefix was present
    if (matchedCountry && phone.startsWith(matchedCountry.code) && (phone.length - matchedCountry.code.length) >= 7) {
      phone = phone.slice(matchedCountry.code.length);
    } else if (hasIntlPrefix) {
      const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
      for (const item of sortedCodes) {
        if (phone.startsWith(item.code) && (phone.length - item.code.length) >= 7) {
          phone = phone.slice(item.code.length);
          break;
        }
      }
    } else if (phone.length === 11 && phone.startsWith("1") && !/^1300/.test(phone)) {
      // Strip leading 1 on 11-digit NANP numbers even when countryName is unavailable
      phone = phone.slice(1);
    } else if (!matchedCountry && /^(?:886|852|853|81|82|86|91|44|49|61|60|65)/.test(phone) && phone.length >= 10) {
      // Strip common international country calling code if phone starts with it + separator or >= 10 digits
      const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
      for (const item of sortedCodes) {
        if (phone.startsWith(item.code) && (phone.length - item.code.length) >= 7) {
          phone = phone.slice(item.code.length);
          break;
        }
      }
    }

    // Strip leading zeros so number never starts with 0 (e.g. UK +44 (0)1582 -> 01582 -> 1582)
    phone = phone.replace(/^0+/, "");

    // Re-check matchedCountry in case leading 0 preceded the country code
    if (matchedCountry && phone.startsWith(matchedCountry.code) && (phone.length - matchedCountry.code.length) >= 8) {
      phone = phone.slice(matchedCountry.code.length).replace(/^0+/, "");
    }

    // Final toll-free check on cleaned digits (catches +44 800..., +49 800..., +1 800..., 400...)
    if (/^(?:800|888|877|866|855|844|833)\d{6,7}$/.test(phone) || /^(?:400|1800|1860)\d{6,}$/.test(phone)) {
      return "";
    }

    // Reject invalid/too-short numbers or anything still starting with 0
    if (!phone || phone.startsWith("0") || phone.length < 7) {
      return "";
    }

    return phone;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  let logWriteChain = Promise.resolve();

  function logStructuredEvent(eventData) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, ...eventData };

    // Format safe log without exposing secrets
    console.log(`[SiteIntelligence AI Log] [${eventData.event}]`, JSON.stringify(logEntry));

    // Persist to chrome.storage.local log buffer serialized to avoid read-modify-write races
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      logWriteChain = logWriteChain.then(() => new Promise((resolve) => {
        try {
          chrome.storage.local.get(["ai_structured_logs"], (res) => {
            const logs = (res && res.ai_structured_logs) || [];
            logs.push(logEntry);
            if (logs.length > 100) logs.shift();
            chrome.storage.local.set({ ai_structured_logs: logs }, () => resolve());
          });
        } catch (_) {
          resolve();
        }
      }));
    }
  }

  // Export for browser window, service worker global, or Node CommonJS
  const exportsObj = {
    callGeminiWithRetryAndFallback,
    validateAndParseGeminiResponse,
    validateExtractedJson,
    normalizeCountryName,
    sanitizePhoneNumber,
    calculateBackoffDelay,
    RETRYABLE_STATUS_CODES,
    NON_RETRYABLE_STATUS_CODES,
    REQUIRED_SCHEMA_FIELDS
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObj;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.GeminiClient = exportsObj;
  }
})();
