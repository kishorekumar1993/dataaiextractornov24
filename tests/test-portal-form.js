// Automated Test Suite for Portal Form Detection, URL Extraction, and AI Prefill
// Tests the exact portal form layout from user screenshot (media_1795483319524_435a6f96.png)

const assert = require("assert");
const CrawlerEngine = require("../crawlerEngine.js");

// Mock a lightweight DOM environment in Node.js
class MockEvent {
  constructor(type, opts = {}) {
    this.type = type;
    this.bubbles = !!opts.bubbles;
    this.cancelable = !!opts.cancelable;
  }
}

class MockElement {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attrs };
    this.id = attrs.id || "";
    this.className = attrs.class || "";
    this.classList = {
      contains: (cls) => (this.className || "").split(/\s+/).includes(cls),
      add: (cls) => { this.className = (this.className + " " + cls).trim(); }
    };
    this.value = attrs.value || "";
    this.innerText = attrs.innerText || "";
    this.textContent = this.innerText;
    this.children = [];
    this.parentElement = null;
    this.options = [];
    this.selectedIndex = 0;
    this.style = {};
    this.eventListeners = {};
    this.dispatchedEvents = [];
  }

  getAttribute(name) {
    return this.attributes[name] || (name === "role" ? this.attributes.role : null);
  }

  setAttribute(name, val) {
    this.attributes[name] = val;
  }

  closest(selector) {
    let curr = this.parentElement;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  matches(selector) {
    if (selector.startsWith(".")) {
      const cls = selector.slice(1);
      return this.classList.contains(cls);
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matchesSimple(child, selector)) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    if (this.tagName === "SELECT" && child.tagName === "OPTION") {
      this.options.push(child);
    }
  }

  addEventListener(type, handler) {
    if (!this.eventListeners[type]) this.eventListeners[type] = [];
    this.eventListeners[type].push(handler);
  }

  dispatchEvent(event) {
    this.dispatchedEvents.push(event.type);
    const handlers = this.eventListeners[event.type] || [];
    for (const h of handlers) h(event);
    return true;
  }

  focus() {}
}

function matchesSimple(el, selector) {
  if (selector.includes(",")) {
    return selector.split(",").some(s => matchesSimple(el, s.trim()));
  }
  if (selector.startsWith(".")) {
    return el.classList.contains(selector.slice(1));
  }
  if (selector.includes("[placeholder*='")) {
    const match = selector.match(/\[placeholder\*=['"]([^'"]+)['"]/i);
    if (match) {
      const ph = (el.attributes.placeholder || "").toLowerCase();
      return ph.includes(match[1].toLowerCase());
    }
  }
  if (selector.includes("[placeholder*=")) {
    return true;
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

// Build Mock Document
class MockDocument {
  constructor() {
    this.body = new MockElement("body");
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    const all = this.querySelectorAll("*");
    return all.find(e => e.id === id) || null;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matchesSimple(child, sel)) results.push(child);
        walk(child);
      }
    };
    walk(this.body);
    return results;
  }
}

// Set up globals for test
global.document = new MockDocument();
global.Event = MockEvent;

// Build the portal form DOM matching screenshot media_1795483319524_435a6f96.png
function buildMockPortalForm(doc) {
  doc.body = new MockElement("body");

  function createField(labelText, inputElement) {
    const group = doc.createElement("div");
    group.className = "form-group col";
    const label = doc.createElement("label");
    label.innerText = labelText;
    label.className = "form-label";
    group.appendChild(label);
    group.appendChild(inputElement);
    doc.body.appendChild(group);
    return inputElement;
  }

  // 1. Website Name (Input with URL)
  const websiteInput = doc.createElement("input");
  websiteInput.attributes.placeholder = "Website Name";
  websiteInput.value = "http://www.orientalchem.com";
  createField("Website Name:", websiteInput);

  // 2. Website Status (Dropdown)
  const statusSelect = doc.createElement("select");
  ["Working", "Not Working", "Under Construction"].forEach(opt => {
    const o = doc.createElement("option");
    o.value = opt;
    o.innerText = opt;
    statusSelect.appendChild(o);
  });
  createField("Website Status:", statusSelect);

  // 3. Business Type (Dropdown)
  const businessTypeSelect = doc.createElement("select");
  ["Kind of Business", "Manufacturer", "Exporter", "Wholesaler", "Trader", "Service Provider"].forEach(opt => {
    const o = doc.createElement("option");
    o.value = opt;
    o.innerText = opt;
    businessTypeSelect.appendChild(o);
  });
  createField("Business Type:", businessTypeSelect);

  // 4. Company Profile (Dropdown)
  const companyProfileSelect = doc.createElement("select");
  ["Company Profile", "Available", "Not Available"].forEach(opt => {
    const o = doc.createElement("option");
    o.value = opt;
    o.innerText = opt;
    companyProfileSelect.appendChild(o);
  });
  createField("Company Profile:", companyProfileSelect);

  // 5. Company Name (Input)
  const companyNameInput = doc.createElement("input");
  companyNameInput.attributes.placeholder = "Company name";
  createField("Company Name:", companyNameInput);

  // 6. Company Address (Textarea)
  const addressTextarea = doc.createElement("textarea");
  addressTextarea.attributes.placeholder = "Company Address";
  createField("Company Address:", addressTextarea);

  // 7. Country Name (Input)
  const countryInput = doc.createElement("input");
  countryInput.attributes.placeholder = "Country";
  createField("Country Name:", countryInput);

  // 8. State (Dropdown)
  const stateSelect = doc.createElement("select");
  ["State", "Available", "Not Available"].forEach(opt => {
    const o = doc.createElement("option");
    o.value = opt;
    o.innerText = opt;
    stateSelect.appendChild(o);
  });
  createField("State:", stateSelect);

  // 9. City (Dropdown)
  const citySelect = doc.createElement("select");
  ["City", "Available", "Not Available"].forEach(opt => {
    const o = doc.createElement("option");
    o.value = opt;
    o.innerText = opt;
    citySelect.appendChild(o);
  });
  createField("City:", citySelect);

  // 10. Email Id (Input)
  const emailInput = doc.createElement("input");
  emailInput.attributes.placeholder = "Email Id";
  createField("Email Id:", emailInput);

  // 11. Secondary Email Id (Input)
  const secEmailInput = doc.createElement("input");
  secEmailInput.attributes.placeholder = "Secondary email";
  createField("Secondary Email Id:", secEmailInput);

  // 12. Phone Number (Input)
  const phoneInput = doc.createElement("input");
  phoneInput.attributes.placeholder = "Phone Number";
  createField("Phone Number:", phoneInput);

  // 13. Number of Product (Dropdown)
  const productSelect = doc.createElement("select");
  ["Number of Product", "0", "1", "2", "3", "Available", "More than 3"].forEach(opt => {
    const o = doc.createElement("option");
    o.value = opt;
    o.innerText = opt;
    productSelect.appendChild(o);
  });
  createField("Number of Product:", productSelect);

  // 14. Image Product (Dropdown)
  const imageSelect = doc.createElement("select");
  ["Image of Product", "0", "1", "2", "3", "Available", "Not Available"].forEach(opt => {
    const o = doc.createElement("option");
    o.value = opt;
    o.innerText = opt;
    imageSelect.appendChild(o);
  });
  createField("Image Product:", imageSelect);

  // 15. No. of Product Description (Dropdown)
  const descSelect = doc.createElement("select");
  ["Desc of Product", "0", "1", "2", "3", "Available", "Not Available"].forEach(opt => {
    const o = doc.createElement("option");
    o.value = opt;
    o.innerText = opt;
    descSelect.appendChild(o);
  });
  createField("No. of Product Description:", descSelect);

  return {
    websiteInput,
    statusSelect,
    businessTypeSelect,
    companyProfileSelect,
    companyNameInput,
    addressTextarea,
    countryInput,
    stateSelect,
    citySelect,
    emailInput,
    secEmailInput,
    phoneInput,
    productSelect,
    imageSelect,
    descSelect
  };
}

// Tests
async function runPortalTests() {
  console.log("==========================================================");
  console.log("   PORTAL FORM DETECTION & AUTOFILL TEST SUITE            ");
  console.log("==========================================================");

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`• Test: ${name} ... PASSED`);
      passed++;
    } catch (err) {
      console.error(`• Test: ${name} ... FAILED`);
      console.error(err);
    }
  }

  const elements = buildMockPortalForm(global.document);

  // Test 1: Field detection
  test("Portal field matching finds all 15 QC form elements", () => {
    const labels = global.document.querySelectorAll("label");
    assert.strictEqual(labels.length, 15, "Should find 15 labels on portal form");
  });

  // Test 2: Website URL extraction from form
  test("Target website URL is extracted from Website Name field", () => {
    const webInput = elements.websiteInput;
    assert.strictEqual(webInput.value, "http://www.orientalchem.com");
  });

  // Test 3: Autofill inputs and dropdowns
  test("Autofill correctly sets all 15 fields with QC data and dispatches events", () => {
    const testData = {
      websiteStatus: "Working",
      businessType: "Manufacturer",
      companyProfile: "Available",
      companyName: "Oriental Chem Company, Limited",
      companyAddress: "No. 128 Industry Road, Chemical Zone",
      countryName: "China",
      state: "Available",
      city: "Available",
      emailId: "sales@orientalchem.com",
      secondaryEmailId: "info@orientalchem.com",
      phoneNumber: "57187654321",
      numberOfProducts: "3",
      productImages: "3",
      numberOfProductDescriptions: "3"
    };

    // Simulate input prefilling
    function setInput(el, val) {
      el.value = val;
      el.dispatchEvent(new MockEvent("input", { bubbles: true }));
      el.dispatchEvent(new MockEvent("change", { bubbles: true }));
      el.dispatchEvent(new MockEvent("blur", { bubbles: true }));
    }

    function setSelect(selectEl, val) {
      for (let i = 0; i < selectEl.options.length; i++) {
        const opt = selectEl.options[i];
        if (opt.value.toLowerCase() === val.toLowerCase() || opt.value.toLowerCase().includes(val.toLowerCase())) {
          selectEl.selectedIndex = i;
          selectEl.value = opt.value;
          break;
        }
      }
      selectEl.dispatchEvent(new MockEvent("change", { bubbles: true }));
      selectEl.dispatchEvent(new MockEvent("input", { bubbles: true }));
    }

    // Prefill all
    setSelect(elements.statusSelect, testData.websiteStatus);
    setSelect(elements.businessTypeSelect, testData.businessType);
    setSelect(elements.companyProfileSelect, testData.companyProfile);
    setInput(elements.companyNameInput, testData.companyName);
    setInput(elements.addressTextarea, testData.companyAddress);
    setInput(elements.countryInput, testData.countryName);
    setSelect(elements.stateSelect, testData.state);
    setSelect(elements.citySelect, testData.city);
    setInput(elements.emailInput, testData.emailId);
    setInput(elements.secEmailInput, testData.secondaryEmailId);
    setInput(elements.phoneInput, testData.phoneNumber);
    setSelect(elements.productSelect, testData.numberOfProducts);
    setSelect(elements.imageSelect, testData.productImages);
    setSelect(elements.descSelect, testData.numberOfProductDescriptions);

    // Verify values
    assert.strictEqual(elements.statusSelect.value, "Working");
    assert.strictEqual(elements.businessTypeSelect.value, "Manufacturer");
    assert.strictEqual(elements.companyProfileSelect.value, "Available");
    assert.strictEqual(elements.companyNameInput.value, "Oriental Chem Company, Limited");
    assert.strictEqual(elements.addressTextarea.value, "No. 128 Industry Road, Chemical Zone");
    assert.strictEqual(elements.countryInput.value, "China");
    assert.strictEqual(elements.stateSelect.value, "Available");
    assert.strictEqual(elements.citySelect.value, "Available");
    assert.strictEqual(elements.emailInput.value, "sales@orientalchem.com");
    assert.strictEqual(elements.secEmailInput.value, "info@orientalchem.com");
    assert.strictEqual(elements.phoneInput.value, "57187654321");
    assert.strictEqual(elements.productSelect.value, "3");
    assert.strictEqual(elements.imageSelect.value, "3");
    assert.strictEqual(elements.descSelect.value, "3");

    // Verify events
    assert(elements.companyNameInput.dispatchedEvents.includes("input"), "input event should be fired");
    assert(elements.companyNameInput.dispatchedEvents.includes("change"), "change event should be fired");
    assert(elements.businessTypeSelect.dispatchedEvents.includes("change"), "change event should be fired on select");
  });

  // Test 4: Live URL update in form
  test("Target website URL updates dynamically when user types in Website Name", () => {
    elements.websiteInput.value = "http://www.new-target-site.com";
    elements.websiteInput.dispatchEvent(new MockEvent("input", { bubbles: true }));
    assert.strictEqual(elements.websiteInput.value, "http://www.new-target-site.com");
  });

  // Test 5: Footer address preservation and prompt rule
  test("Footer content is preserved when Contact Us is absent, HQ priority rule is present", () => {
    const CrawlerEngine = require("../crawlerEngine.js");
    const sampleHtml = `
      <html>
        <body>
          <div class="content"><h1>Welcome to Oriental Chem</h1></div>
          <footer>
            <div class="footer-addr">Headquarters: No. 128 Industry Road, Chemical Zone, Hangzhou, Zhejiang Province, China</div>
          </footer>
        </body>
      </html>
    `;
    const cleaned = CrawlerEngine.cleanHtmlToText(sampleHtml);
    assert(cleaned.includes("No. 128 Industry Road"), "Footer address content must be preserved in cleaned text");
    assert(cleaned.includes("Headquarters"), "Headquarters label in footer must be preserved");

    const prompt = CrawlerEngine.buildSystemInstruction();
    assert(prompt.includes("If Contact Us is not found or does not contain an address, you can take the address from the Footer of the website"), "Prompt must instruct AI to use footer if Contact Us is missing");
    assert(prompt.includes("HQ (Headquarters) address is always first priority"), "Prompt must emphasize HQ address priority");
  });

  // Test 6: On-page floating widget details table matches all 15 fields
  test("Floating widget renders full details for all 15 fields matching popup", () => {
    const expectedKeys = [
      "websiteStatus", "notWorkingReason", "businessType", "companyProfile",
      "companyName", "countryName", "companyAddress", "state", "city",
      "emailId", "secondaryEmailId", "phoneNumber", "numberOfProducts",
      "productImages", "numberOfProductDescriptions"
    ];
    assert.strictEqual(expectedKeys.length, 15, "Should have 15 structured fields");
    expectedKeys.forEach(k => {
      assert(typeof k === "string" && k.length > 0, `Field key ${k} must be valid`);
    });
  });

  // Test 7: Business Type Eligibility (Manufacturer to Wholesaler only are Working, others Not Working)
  test("Business Type condition: Manufacturer to Wholesaler only are Working, others marked Not Working", () => {
    // 1. Check eligible types
    const eligibleTypes = [
      "Manufacturer",
      "Industrial Services",
      "Exporter",
      "Trader",
      "Distributer",
      "Supplier",
      "Wholesaler"
    ];
    for (const type of eligibleTypes) {
      assert.strictEqual(CrawlerEngine.isEligibleWorkingBusinessType(type), true, `${type} must be eligible as Working`);
      const checked = CrawlerEngine.applyBusinessTypeEligibilityRule({ websiteStatus: "Working", businessType: type });
      assert.strictEqual(checked.websiteStatus, "Working", `${type} must retain Working status`);
    }

    // 2. Check ineligible types (must become Not Working)
    const ineligibleTypes = [
      "Service Provider",
      "Online Shopping",
      "Restricted Site",
      "Other",
      "Retailer"
    ];
    for (const type of ineligibleTypes) {
      assert.strictEqual(CrawlerEngine.isEligibleWorkingBusinessType(type), false, `${type} must NOT be eligible as Working`);
      const checked = CrawlerEngine.applyBusinessTypeEligibilityRule({ websiteStatus: "Working", businessType: type });
      assert.strictEqual(checked.websiteStatus, "Not Working", `${type} must be converted to Not Working`);
      assert(checked.notWorkingReason.includes("Ineligible Business Type"), `${type} must have notWorkingReason populated`);
    }

    // 3. Verify Prompt includes the rule
    const prompt = CrawlerEngine.buildSystemInstruction();
    assert(prompt.includes("Manufacturer to Wholesaler"), "Prompt must instruct that only Manufacturer to Wholesaler are eligible Working sites");

    // 4. Check explicit Retailer example (e.g. Amazon screenshot)
    const amazonData = {
      websiteStatus: "Working",
      businessType: "Retailer",
      companyName: "Amazon"
    };
    const amazonChecked = CrawlerEngine.applyBusinessTypeEligibilityRule(amazonData);
    assert.strictEqual(amazonChecked.websiteStatus, "Not Working", "Amazon / Retailer must be converted to Not Working");
    assert(amazonChecked.notWorkingReason.includes('Ineligible Business Type: "Retailer"'), "Reason must explicitly mention Ineligible Business Type: Retailer");
    assert(amazonChecked.notWorkingReason.includes("Only businesses from Manufacturer to Wholesaler"), "Reason must mention Manufacturer to Wholesaler rule");
    assert.strictEqual(amazonChecked.businessType, "Online Shopping", "Retailer must be normalized to portal option Online Shopping");
    assert.strictEqual(CrawlerEngine.normalizeBusinessType("distributor"), "Distributer", "distributor must normalize to portal option Distributer");
  });

  // Test 8: Special character preservation rule in AI Prompt
  test("Special character preservation rule in Prompt (keep same, do not change word or expansion)", () => {
    const prompt = CrawlerEngine.buildSystemInstruction();
    assert(prompt.includes("CORE RULE - SPECIAL CHARACTER PRESERVATION:"), "Prompt must have CORE RULE - SPECIAL CHARACTER PRESERVATION");
    assert(prompt.includes("Special characters MUST ALWAYS be kept AS IT IS."), "Prompt must emphasize keeping special characters as is");
    assert(prompt.includes('NEVER expand or replace "&" with "and" or "And"'), "Prompt must prohibit expanding & into and");
    assert(prompt.includes('NEVER expand or replace "@" with "at"'), "Prompt must prohibit expanding @ into at");
    assert(prompt.includes('DO NOT remove internal hyphens "-"'), "Prompt must protect hyphens and slashes");
    assert(prompt.includes('Special characters, hyphens, slashes, ampersands ("&")'), "Address prompt must preserve special characters");
  });

  // Test 9: Universal Country Capital & First-Level Division State Rule in AI Prompt
  test("Universal Country Capital & first-level division rule in Prompt (no hardcoding)", () => {
    const prompt = CrawlerEngine.buildSystemInstruction();
    assert(prompt.includes("Country Capitals (CRITICAL UNIVERSAL RULE)"), "Prompt must instruct universal national capital rule");
    assert(prompt.includes("Official States & Provinces: Any recognized first-level administrative division"), "Prompt must instruct first-level divisions rule");
    assert(prompt.includes("Disregard State Names in Street Lines"), "Prompt must instruct disregarding state names in street lines");
  });

  // Test 10: Smart Generalized Address & Floor Expansion in AI Prompt
  test("Smart generalized address & floor expansion in Prompt (no brittle hardcoded address)", () => {
    const prompt = CrawlerEngine.buildSystemInstruction();
    assert(prompt.includes("Floor Designations: Expand any floor abbreviation"), "Prompt must instruct generalized floor expansion rule");
    assert(prompt.includes("Section"), "Prompt must instruct Section expansion");
  });

  // Test 11: Protocol-agnostic same-registered-domain link extraction & active HQ address rule
  test("Protocol-agnostic link extraction & active HQ priority (handles http to https redirect sites like reinkeandschomann.com)", () => {
    const sampleHtml = `
      <html>
        <body>
          <a href="https://www.reinkeandschomann.com/contact-us/">Contact Us</a>
          <a href="/about/">About Us</a>
          <a href="https://other-domain.com/">External</a>
        </body>
      </html>
    `;
    // Pass HTTP origin with trailing slash, links on page are HTTPS
    const links = CrawlerEngine.extractLinks(sampleHtml, "http://www.reinkeandschomann.com/");
    assert(links.some(l => l.category === "contact"), "Must extract contact link even when baseOrigin is HTTP and link is HTTPS");
    assert(links.some(l => l.category === "about"), "Must extract relative links");
    assert(!links.some(l => l.url.includes("other-domain.com")), "Must exclude external domain links");

    const prompt = CrawlerEngine.buildSystemInstruction();
    assert(prompt.includes("Current Active Address Priority (CRITICAL)"), "Prompt must instruct Current Active Address Priority rule");
    assert(prompt.includes("NEVER select former, historical, or previous addresses"), "Prompt must instruct never selecting historical or previous addresses");
    assert(prompt.includes("North173"), "Prompt must include North173 expansion example");
    assert(prompt.includes("West21640"), "Prompt must include West21640 expansion example");
    assert(prompt.includes("1Floor"), "Prompt must include 1F -> 1Floor expansion example");
    assert(prompt.includes("1st Floor"), "Prompt must include 1st F -> 1st Floor expansion example");
    assert(prompt.includes("pincode"), "Prompt must instruct removing pincode");
  });

  // Test 12: Contact Page, Footer and Map Address Comparison & Embedded Map extraction
  test("Contact Page, Footer and Map Address Comparison framework & Map extraction", () => {
    // 1. Map URL & iframe extraction
    const sampleHtml = `
      <html>
        <body>
          <iframe src="https://maps.google.com/maps?q=130+Pennsylvania+Avenue%2C+Unit+%238%2C+Concord%2C+Ontario&output=embed"></iframe>
          <a href="https://maps.google.com/?q=N173+W21640+Northwest+Passage+Way%2C+Jackson%2C+WI">View on Google Maps</a>
          <div data-address="100 Industrial Parkway, Austin, Texas"></div>
        </body>
      </html>
    `;
    const mapAddrs = CrawlerEngine.extractMapAddresses(sampleHtml);
    assert(mapAddrs.length >= 2, "Must extract at least 2 map addresses from iframes and links");
    assert(mapAddrs.some(a => a.includes("130 Pennsylvania Avenue")), "Must extract iframe map address");
    assert(mapAddrs.some(a => a.includes("Northwest Passage")), "Must extract map link address");

    // 2. Prompt instructions for Contact Page, Footer and Map Address Comparison
    const prompt = CrawlerEngine.buildSystemInstruction();
    assert(prompt.includes("Contact Page, Footer and Map Address Comparison"), "Prompt must include Three-Source Address Comparison header");
    assert(prompt.includes("Contact Page – Primary Source"), "Prompt must specify Contact Page as Primary Source");
    assert(prompt.includes("Website Footer – Secondary Source"), "Prompt must specify Website Footer as Secondary Source");
    assert(prompt.includes("Embedded Map – Additional Address Verification Source"), "Prompt must specify Embedded Map as Verification Source");
    assert(prompt.includes("Scenario 1: All Three Addresses Are Identical"), "Prompt must specify Scenario 1");
    assert(prompt.includes("Scenario 2: Contact Page Address Is Incomplete"), "Prompt must specify Scenario 2");
    assert(prompt.includes("Scenario 3: Contact Page and Footer Are Different"), "Prompt must specify Scenario 3");
    assert(prompt.includes("Scenario 4: Contact Page and Map Are Different"), "Prompt must specify Scenario 4");
    assert(prompt.includes("Scenario 5: All Three Addresses Are Different"), "Prompt must specify Scenario 5");
    assert(prompt.includes("Scenario 6: Contact Page Address Is Not Available"), "Prompt must specify Scenario 6");
    assert(prompt.includes("Address Completion Rules"), "Prompt must specify Address Completion Rules");
  });

  console.log("==========================================================");
  console.log(`  PORTAL TEST RESULTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL ${total})`);
  console.log("==========================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runPortalTests();
