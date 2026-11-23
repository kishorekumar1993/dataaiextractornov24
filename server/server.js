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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const DEFAULT_PRIMARY = process.env.PRIMARY_MODEL || "gemini-3.5-flash-lite";
const DEFAULT_FALLBACK = process.env.FALLBACK_MODEL || "gemini-3.1-flash-lite";

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

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
    let bodyText = "";
    req.on("data", chunk => { bodyText += chunk; });
    req.on("end", async () => {
      try {
        if (!GEMINI_API_KEY || GEMINI_API_KEY === "your_gemini_api_key_here") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: "Backend GEMINI_API_KEY is not configured in .env file."
          }));
          return;
        }

        const payload = JSON.parse(bodyText || "{}");
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

server.listen(PORT, () => {
  console.log(`[Crawler Proxy Server] Running on http://localhost:${PORT}`);
  console.log(`[Crawler Proxy Server] API Key configured: ${Boolean(GEMINI_API_KEY && GEMINI_API_KEY !== "your_gemini_api_key_here")}`);
});

module.exports = server;
