const assert = require("assert");
const CrawlerEngine = require("../crawlerEngine.js");
const GeminiClient = require("../geminiClient.js");

console.log("==========================================================");
console.log("   REAL-SITE END-TO-END ADDRESS & CRAWL REGRESSION SUITE  ");
console.log("==========================================================");

function makeHtmlResponse(html, finalUrl) {
  return {
    ok: true,
    status: 200,
    url: finalUrl,
    headers: { get: (h) => (h.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => html
  };
}

function makeMockGemini(responseData) {
  return {
    ...GeminiClient,
    callGeminiWithRetryAndFallback: async (opts) => GeminiClient.callGeminiWithRetryAndFallback({
      ...opts,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => null },
        text: async () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ notWorkingReason: "", ...responseData }) }] }, finishReason: "STOP" }]
        })
      })
    })
  };
}

async function runTests() {
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`• Test: ${name} ... PASSED`);
      passed++;
    } catch (err) {
      console.error(`• Test: ${name} ... FAILED`);
      console.error(err);
    }
  }

  // 1. yog.com.tw — Must NOT truncate "Taichung Industrial District, Taichung City"
  await test("yog.com.tw: Preserves full Taiwan address without truncating industrial district/city", async () => {
    const html = `<html><body>
      <h1>GAU JIING Industrial Co., Ltd.</h1>
      <p>No.46, 23rd Rd., Taichung Industrial District, Taichung City 40850, Taiwan.</p>
      <p>EMAIL: gaujing@gmail.com | TEL: +886-4-23502188</p>
    </body></html>`;
    const res = await CrawlerEngine.crawlAndExtractUrl("http://www.yog.com.tw", {
      apiKey: "test",
      fetchFn: async (u) => makeHtmlResponse(html, u),
      geminiClient: makeMockGemini({
        websiteStatus: "Working",
        businessType: "Manufacturer",
        companyProfile: "Available",
        companyName: "Gau Jiing Industrial Co., Ltd.",
        countryName: "Taiwan",
        companyAddress: "No.46, 23rd Rd., Taichung Industrial District, Taichung City 40850, Taiwan.",
        state: "Not Available",
        city: "Available",
        emailId: "gaujing@gmail.com",
        secondaryEmailId: "",
        phoneNumber: "+886-4-23502188",
        numberOfProducts: "3",
        productImages: "3",
        numberOfProductDescriptions: "3"
      })
    });
    assert.strictEqual(res.data.companyAddress, "Number 46, 23rd Road, Taichung Industrial District, Taichung City");
    assert.strictEqual(res.data.state, "Not Available");
    assert.strictEqual(res.data.city, "Available");
  });

  // 2. mcmachinery.com — <select> country list stripped & multi-line <Thoroughfare> <City> split
  await test("mcmachinery.com: Strips <select> dropdown noise and splits multi-line street/city", async () => {
    const optionsHtml = Array.from({ length: 240 }, (_, i) => `<option value="${i}">Country ${i}</option>`).join("");
    const html = `<html><body>
      <form><select name="country">${optionsHtml}</select></form>
      <div>MC Machinery Systems, Inc.</div>
      <div>85 Northwest Point Blvd.\nElk Grove Village, IL 60007</div>
      <div>Main Phone: 630-860-4210 | sales@mcmachinery.com</div>
    </body></html>`;
    const text = CrawlerEngine.cleanHtmlToText(html);
    assert(!text.includes("Country 239"), "<select> options must be stripped");

    const res = await CrawlerEngine.crawlAndExtractUrl("http://www.mcmachinery.com", {
      apiKey: "test",
      fetchFn: async (u) => makeHtmlResponse(html, u),
      geminiClient: makeMockGemini({
        websiteStatus: "Working",
        businessType: "Manufacturer",
        companyProfile: "Available",
        companyName: "MC Machinery Systems, Inc.",
        countryName: "United States Of America",
        companyAddress: "85 Northwest Point Boulevard Elk Grove Village, Illinois",
        state: "Available",
        city: "Available",
        emailId: "sales@mcmachinery.com",
        secondaryEmailId: "",
        phoneNumber: "630-860-4210",
        numberOfProducts: "3",
        productImages: "3",
        numberOfProductDescriptions: "3"
      })
    });
    assert.strictEqual(res.data.companyAddress, "85 Northwest Point Boulevard, Elk Grove Village, Illinois");
  });

  // 3. anson-hyd.com — CJK company fragments stripped from address
  await test("anson-hyd.com: Strips CJK company name fragments from address", async () => {
    const html = `<html><body>
      <div>ANSON Hydraulics Industrial Co., Ltd.</div>
      <div>No. 2, Wugong 2nd Rd., Wufeng Dist., Taichung City, Taiwan</div>
      <div>sales@anson-hyd.com | 04-23335286</div>
    </body></html>`;
    const res = await CrawlerEngine.crawlAndExtractUrl("http://www.anson-hyd.com", {
      apiKey: "test",
      fetchFn: async (u) => makeHtmlResponse(html, u),
      geminiClient: makeMockGemini({
        websiteStatus: "Working",
        businessType: "Manufacturer",
        companyProfile: "Available",
        companyName: "Anson Hydraulics Industrial Co., Ltd.",
        countryName: "Taiwan",
        companyAddress: "No. 2, Wugong 2nd Rd., 2號安頌液壓工業股份有限公司/ANSON Hydraulics Industrial Co., Wufeng Dist., Taichung City",
        state: "Not Available",
        city: "Available",
        emailId: "sales@anson-hyd.com",
        secondaryEmailId: "",
        phoneNumber: "423335286",
        numberOfProducts: "3",
        productImages: "3",
        numberOfProductDescriptions: "3"
      })
    });
    assert(!/[\u4e00-\u9fff]/.test(res.data.companyAddress), `Must not contain CJK: ${res.data.companyAddress}`);
    assert(!/ANSON/i.test(res.data.companyAddress), `Must not contain company fragment: ${res.data.companyAddress}`);
    assert(res.data.companyAddress.includes("Number 2, Wugong 2nd Road"), `Got: ${res.data.companyAddress}`);
  });

  // 4. store-rite.com — Deduplicates ", ON, Ontario" and title-cases hyphenated company name
  await test("store-rite.com: Deduplicates province code + full name and normalizes Store-Rite", async () => {
    const html = `<html><body>
      <div>Store-rite Systems Inc.</div>
      <div>1090 Meyerside Drive, Mississauga, ON L5T 1J4, Canada</div>
      <div>info@store-rite.com | 905-670-5121</div>
    </body></html>`;
    const res = await CrawlerEngine.crawlAndExtractUrl("http://www.store-rite.com", {
      apiKey: "test",
      fetchFn: async (u) => makeHtmlResponse(html, u),
      geminiClient: makeMockGemini({
        websiteStatus: "Working",
        businessType: "Manufacturer",
        companyProfile: "Available",
        companyName: "Store-rite Systems Inc.",
        countryName: "Canada",
        companyAddress: "1090 Meyerside Drive, Mississauga, ON, Ontario",
        state: "Available",
        city: "Available",
        emailId: "info@store-rite.com",
        secondaryEmailId: "",
        phoneNumber: "9056705121",
        numberOfProducts: "3",
        productImages: "3",
        numberOfProductDescriptions: "3"
      })
    });
    assert.strictEqual(res.data.companyAddress, "1090 Meyerside Drive, Mississauga, Ontario");
    assert.strictEqual(res.data.companyName, "Store-Rite Systems Incorporated");
  });

  // 5. wfenergycontrols.com.au — Strips hallucinated Number & expands WA -> Western Australia & Pty Ltd -> Proprietary Limited
  await test("wfenergycontrols.com.au: Strips hallucinated Number, expands WA and Pty Ltd", async () => {
    const html = `<html><body>
      <div>WF Energy Controls Pty Ltd</div>
      <div>38-46 Sparks Road, Henderson WA 6166, Australia</div>
      <div>sales@wfenergycontrols.com.au</div>
    </body></html>`;
    const res = await CrawlerEngine.crawlAndExtractUrl("https://www.wfenergycontrols.com.au", {
      apiKey: "test",
      fetchFn: async (u) => makeHtmlResponse(html, u),
      geminiClient: makeMockGemini({
        websiteStatus: "Working",
        businessType: "Manufacturer",
        companyProfile: "Available",
        companyName: "WF Energy Controls Pty Ltd",
        countryName: "Australia",
        companyAddress: "Number 38 - 46 Sparks Road, Henderson, WA 6166",
        state: "Available",
        city: "Available",
        emailId: "sales@wfenergycontrols.com.au",
        secondaryEmailId: "",
        phoneNumber: "",
        numberOfProducts: "3",
        productImages: "3",
        numberOfProductDescriptions: "3"
      })
    });
    assert.strictEqual(res.data.companyAddress, "38-46 Sparks Road, Henderson, Western Australia");
    assert.strictEqual(res.data.companyName, "WF Energy Controls Proprietary Limited");
  });

  // 6. South Korea ccTLD (.co.kr) — Blocked pre-API as Not Working
  await test("Unsupported ccTLD (.co.kr): Marks Not Working pre-API without calling Gemini", async () => {
    let geminiCalled = false;
    const res = await CrawlerEngine.crawlAndExtractUrl("http://www.example.co.kr", {
      apiKey: "test",
      fetchFn: async (u) => makeHtmlResponse("<html><body>Seoul, South Korea</body></html>", u),
      geminiClient: {
        ...GeminiClient,
        callGeminiWithRetryAndFallback: async () => {
          geminiCalled = true;
          throw new Error("Should not call Gemini for .co.kr");
        }
      }
    });
    assert.strictEqual(geminiCalled, false);
    assert.strictEqual(res.data.websiteStatus, "Not Working");
  });

  console.log("==========================================================");
  console.log(`  REAL-SITE RESULTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL ${total})`);
  console.log("==========================================================");
  if (passed !== total) process.exit(1);
}

runTests();
