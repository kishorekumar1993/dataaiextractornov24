/**
 * Secure Backend Proxy Server for Site Intelligence Crawler
 * 
 * Provides:
 * - Secure server-side Gemini API execution (API key never exposed to browser)
 * - Environment variable secrets management (GEMINI_API_KEY)
 * - Automatic retry on 503, 429, 500, 502, 504 with exponential backoff & jitter
 * - Primary & Secondary model fallback
 * - CORS support for Chrome Extensions
 * - Response validation & sanitization
 */

const http = require("http");
const path = require("path");
const fs = require("fs");

// Load .env if present without requiring external package
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const GeminiClient = require("../geminiClient.js");

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
const DEFAULT_PRIMARY = process.env.PRIMARY_MODEL || "gemini-3.5-flash-lite";
const DEFAULT_FALLBACK = process.env.FALLBACK_MODEL || "gemini-3.1-flash-lite";
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB request limit

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "";
  if (
    origin.startsWith("chrome-extension://") ||
    origin === "http://localhost" ||
    origin.startsWith("http://localhost:") ||
    origin === "http://127.0.0.1" ||
    origin.startsWith("http://127.0.0.1:") ||
    (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN)
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
}

function isAuthorized(req) {
  if (!PROXY_AUTH_TOKEN) return true;
  const apiKeyHeader = req.headers["x-api-key"];
  const authHeader = req.headers["authorization"] || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return apiKeyHeader === PROXY_AUTH_TOKEN || bearerToken === PROXY_AUTH_TOKEN;
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let url;
  try {
    const hostHeader = req.headers.host || `${HOST}:${PORT}`;
    url = new URL(req.url, `http://${hostHeader}`);
  } catch (_) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Malformed request URL." }));
    return;
  }

  // Health endpoint
  if (req.method === "GET" && url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      keyConfigured: Boolean(GEMINI_API_KEY && GEMINI_API_KEY !== "your_gemini_api_key_here"),
      primaryModel: DEFAULT_PRIMARY,
      fallbackModel: DEFAULT_FALLBACK
    }));
    return;
  }

  // Analyze endpoint
  if (req.method === "POST" && url.pathname === "/api/analyze") {
    if (!isAuthorized(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    let aborted = false;

    req.on("data", chunk => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Request payload too large." }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", async () => {
      if (aborted) return;
      try {
        let payload;
        try {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          payload = JSON.parse(bodyText || "{}");
        } catch (_) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Invalid JSON request body." }));
          return;
        }

        if (!GEMINI_API_KEY || GEMINI_API_KEY === "your_gemini_api_key_here") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: "Backend GEMINI_API_KEY is not configured in .env file."
          }));
          return;
        }
        const {
          context,
          userPrompt,
          systemInstruction,
          primaryModel = DEFAULT_PRIMARY,
          fallbackModel = DEFAULT_FALLBACK
        } = payload;

        if (!context || !userPrompt || !systemInstruction) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: "Missing required fields: context, userPrompt, or systemInstruction."
          }));
          return;
        }

        // Execute Gemini call with retry and fallback on the server
        const result = await GeminiClient.callGeminiWithRetryAndFallback({
          context,
          userPrompt,
          systemInstruction,
          apiKey: GEMINI_API_KEY,
          primaryModel,
          fallbackModel,
          maxRetries: 4,
          baseDelayMs: 1500,
          maxDelayMs: 16000,
          fetchImpl: globalThis.fetch
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          data: result.data,
          meta: result.meta
        }));

      } catch (err) {
        console.error("[Proxy Error]:", err.message);
        res.writeHead(err.httpStatus || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          error: err.message
        }));
      }
    });
    return;
  }

  // Not found
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, HOST, () => {
  console.log(`[Crawler Proxy Server] Running on http://${HOST}:${PORT}`);
  console.log(`[Crawler Proxy Server] API Key configured: ${Boolean(GEMINI_API_KEY && GEMINI_API_KEY !== "your_gemini_api_key_here")}`);
});

module.exports = server;
