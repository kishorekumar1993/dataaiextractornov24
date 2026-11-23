# 🕷️ Site Intelligence Web Crawler Extension (Gemini AI)

A Google Chrome Extension (Manifest V3) that crawls website pages (Home, About Us, Company Profile, Contact Us, Products, Services, Catalog) and uses the Google Gemini API to extract structured corporate intelligence in your required JSON format.

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

## ✨ Features

- **Automated Page Discovery:** Automatically discovers and categorizes internal links into:
  - 🏠 **Home Page** (`/`, root)
  - 🏢 **About & Company Profile** (`/about`, `/about-us`, `/company`, `/profile`, `/who-we-are`)
  - 📞 **Contact Page** (`/contact`, `/contact-us`, `/reach-us`, `/support`)
  - 📦 **Products & Services** (`/products`, `/product`, `/catalog`, `/collection`, `/services`)
- **Multi-Page Crawler:** Fetches key subpages, extracts clean text, strips advertising and script noise, and identifies contact details (emails, phone numbers, addresses).
- **Product Indicator Analysis:** Evaluates product counts, product images, and product descriptions directly from page DOM and HTML heuristics.
- **Powered by Gemini AI:** Uses Google Gemini (default `gemini-2.5-flash`, configurable to `gemini-2.0-flash` or `gemini-1.5-flash/pro`) with structured JSON schema output mode (`response_mime_type: "application/json"`).
- **Rich User Interface:**
  - **Live Progress Stepper:** Shows real-time crawling status and progress bar.
  - **Structured Key-Value Table:** Easy-to-read cards and table of all 15 intelligence fields.
  - **Raw JSON Viewer:** With one-click **📋 Copy JSON** button.
  - **Export Options:** One-click **📥 Download CSV** and **💾 Download JSON**.
  - **Customizable Depth:** Quick (3 pages), Standard (5 pages), or Deep (8 pages).

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

## 🔑 How to Setup Gemini API Key

1. Click the **Extensions puzzle icon** in Chrome's toolbar and pin **Site Intelligence**.
2. Click on the extension icon to open the popup.
3. Click the **⚙️ Settings** gear icon (or the "Configure now" warning banner).
4. Get your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
5. Paste your API key into the input field and select your preferred model:
   - `gemini-2.5-flash` (Recommended: fastest, high accuracy)
   - `gemini-2.0-flash`
   - `gemini-1.5-flash`
6. Click **Test Connection** to verify your key, then click **Save Settings**.

---

## 📖 How to Use

1. Navigate to any business or company website you want to inspect (e.g. any manufacturer, supplier, or corporate site).
2. Click the **Site Intelligence** extension icon.
3. The extension will automatically detect the active website and show which page types were discovered (Home, About, Contact, Products).
4. Select your crawl depth (3, 5, or 8 pages).
5. Click **⚡ Start Crawl & Analyze**.
6. Watch the live progress as it crawls each page and sends the synthesized intelligence to Gemini AI.
7. View the structured results or switch to the **{ } JSON** tab to copy or export your data as CSV/JSON!

---

## 📁 Project Structure

```
d:\extension\crawlerextension/
├── manifest.json       # Manifest V3 configuration and permissions
├── popup.html          # Extension popup UI (modern dark theme)
├── popup.css           # Styling, responsive layout, animations, badges
├── popup.js            # Link discovery, subpage crawling, and Gemini API integration
├── content.js          # In-page DOM inspector, internal link classifier, product heuristics
├── background.js       # Background service worker for subpage fetches and storage defaults
├── icons/              # Extension icons (16x16, 48x48, 128x128)
└── README.md           # Documentation and user guide
```
