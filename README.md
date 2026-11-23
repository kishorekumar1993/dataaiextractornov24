# 🕷️ Site Intelligence Web Crawler Extension (Production AI Edition)

A high-reliability Google Chrome Extension (Manifest V3) that crawls website pages (Home, About Us, Company Profile, Contact Us, Products, Services) and extracts structured corporate intelligence in your required JSON format using Google Gemini API with production-grade 503 resilience, exponential backoff, model fallback, and queue management.

---

## 📋 Target Output Format

The extension outputs the exact JSON structure requested:

```json
{
  "websiteStatus": "Working",
  "notWorkingReason": "",
  "businessType": "Manufacturer",
  "companyProfile": "Available",
  "companyName": "Zhejiang Jiangnan Steel Structure Company, Limited",
  "countryName": "China",
  "companyAddress": "Yashan Road Zhapu In Jiaxing City Of Zhejiang Province",
  "state": "Available",
  "city": "Available",
  "emailId": "jngg@zjcne.com",
  "secondaryEmailId": "",
  "phoneNumber": "57385127888",
  "numberOfProducts": "3",
  "productImages": "3",
  "numberOfProductDescriptions": "0"
}
```

---

## 🛡️ Production Reliability & 503 Fix Architecture

### 1. Transient Error Handling (HTTP 503 & 429)
- **Automatic Retry:** Handles `503 Service Unavailable` ("model experiencing high demand"), `429 Rate Limit`, `500`, `502`, `504`, `408`, and network timeouts.
- **Exponential Backoff & Jitter:** Automatically spaces retries using formula:  
  `delay = min(16s, 1.5s * 2^attempt + random_jitter)`
- **Respects `Retry-After` Header:** Automatically waits for server-specified cooldowns when provided.
- **Permanent Errors Guard:** Permanent 4xx errors (`400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`) fail immediately without burning quota on useless retries.

### 2. Dual-Model Failover (Primary & Secondary Fallback)
- **Primary Model:** High-throughput default model (`gemini-2.5-flash`).
- **Secondary Model:** Auto-failover model (`gemini-1.5-flash` or configurable alternative).
- If the primary model exhausts its 4 retries due to high demand, the engine automatically switches to the secondary model with a fresh retry budget.
- Both models use the identical extraction prompt and strict JSON schema.
- Displays an engine badge in the UI showing which model processed the site (e.g. `Engine: gemini-2.5-flash` or `Fallback: gemini-1.5-flash`).

### 3. Centralized AI Request Queue (`requestQueue.js`)
- **Concurrency Control:** Default concurrency of 1 (configurable) to prevent burst rate-limiting when crawling batches.
- **Configurable Inter-Request Delay:** Ensures a clean 1,000ms delay between consecutive AI calls.
- **Deduplication:** Prevents duplicate requests for the same website.
- **Persistent State:** Saves pending, active, completed, and failed tasks to `chrome.storage.local`. If the browser or popup is closed, state is preserved and resumes cleanly.
- **Zero Data Loss:** Successfully extracted websites are permanently saved in the local completion map.
- **One-Click Retry Failed:** A "Retry Failed" button allows bulk re-enqueueing of transient failures.

### 4. API Key Security & Backend Proxy (`server/`)
- **Direct Mode (Secure Header):** Sends the API key via `x-goog-api-key` HTTP header rather than exposing it in the browser request URL (`?key=...`).
- **Secure Backend Proxy Mode:** Optional Node.js proxy server included in `server/server.js`:
  - Keeps your `GEMINI_API_KEY` stored on your server in `.env`.
  - Extension points to `http://localhost:3000/api/analyze`.
  - Zero API key exposure to browser network inspect tools.

---

## 🚀 How to Install and Load into Chrome / Edge

### Step 1: Open Extensions Page
1. Open Google Chrome or Microsoft Edge.
2. In the address bar, type:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. Press **Enter**.

### Step 2: Enable Developer Mode
- In the top right corner of the Extensions page, toggle **Developer mode** to **ON**.

### Step 3: Load Unpacked Extension
1. Click the **Load unpacked** button (top left).
2. Browse to and select the directory:
   ```
   D:\extension\crawlerextension
   ```
3. Click **Select Folder**. The extension **Site Intelligence Crawler (Gemini AI)** will appear in your extensions list.

---

## 🔑 Configuration Options

Open the extension popup and click the **⚙️ Settings** icon:

1. **Gemini API Key:** Paste your key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. **Primary Model:** Choose `gemini-2.5-flash` (recommended for speed and accuracy).
3. **Secondary Fallback Model:** Choose `gemini-1.5-flash` (recommended for extreme stability during Google demand spikes).
4. **Backend Proxy URL (Optional):** Enter `http://localhost:3000/api/analyze` if running the included proxy server.
5. Click **Test Connection** to verify your setup, then click **Save Settings**.

---

## 🖥️ Running the Optional Secure Backend Proxy

If you want the API key completely hidden on a backend server:

```bash
cd server
copy .env.example .env
# Edit .env and paste your GEMINI_API_KEY
node server.js
```
The server will start on `http://localhost:3000`. In the extension settings, enter `http://localhost:3000/api/analyze` as the **Backend Proxy URL**.

---

## 🧪 Automated Reliability Test Suite

A standalone test suite covering all 15 failure and recovery scenarios is included:

```bash
node tests/test-crawler-reliability.js
```

### Verified Test Scenarios:
- ✅ **Scenario 1:** Gemini API returns 200 (Success)
- ✅ **Scenario 2:** Gemini API returns 503 (Exponential backoff & retry success)
- ✅ **Scenario 3:** Gemini API returns 429 (Rate limit with `Retry-After` header)
- ✅ **Scenario 4:** Gemini API returns 500 (Internal server error retry)
- ✅ **Scenario 5:** Gemini API returns 400 (Permanent error - no retry)
- ✅ **Scenario 6:** Network connection failure (Transient retry)
- ✅ **Scenario 7:** Request timeout (AbortController handling)
- ✅ **Scenario 8:** Empty AI response rejection
- ✅ **Scenario 9:** Invalid JSON response rejection
- ✅ **Scenario 10:** Truncated AI response detection
- ✅ **Scenario 11:** Primary model 503s -> Secondary model fallback success
- ✅ **Scenario 12:** Both models fail -> Recorded in Failed Queue
- ✅ **Scenario 13:** Queue deduplication (prevents duplicate requests)
- ✅ **Scenario 14:** Concurrency control & inter-request delay
- ✅ **Scenario 15:** Schema & QC validation preservation (State, City, Phone)

---

## 📁 Project Structure

```
d:\extension\crawlerextension/
├── manifest.json                  # Manifest V3 configuration
├── popup.html                     # Extension popup UI (modern dark theme)
├── popup.css                      # Styling, responsive layout, animations, badges
├── popup.js                       # Crawler orchestration & UI controller
├── geminiClient.js                # Resilient AI client with retry, backoff & fallback
├── requestQueue.js                # Centralized request queue & state persistence
├── content.js                     # In-page DOM inspector & link classifier
├── background.js                  # Background service worker
├── icons/                         # Extension icons (16x16, 48x48, 128x128)
├── server/
│   ├── server.js                  # Secure Node.js proxy server
│   ├── package.json               # Server metadata & dependencies
│   └── .env.example               # Example server environment configuration
├── tests/
│   └── test-crawler-reliability.js # 15-scenario automated test runner
└── README.md                      # Complete documentation & operational guide
```
