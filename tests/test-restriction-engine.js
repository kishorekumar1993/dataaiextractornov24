// Automated Test Suite for Universal Crawler Restriction Detection Engine (20 Prohibited Categories + Image + Shopping + QC)
const assert = require("assert");
const RestrictionValidator = require("../restrictionValidator.js");
const CrawlerEngine = require("../crawlerEngine.js");

function createMockResponse(opts) {
  return {
    status: opts.status !== undefined ? opts.status : 200,
    ok: opts.status >= 200 && opts.status < 300,
    url: opts.url || "http://example.com",
    redirected: Boolean(opts.redirected),
    headers: {
      get: (h) => (h.toLowerCase() === "location" ? opts.location || null : null)
    },
    text: async () => opts.html || "<html><body><h1>Example</h1></body></html>"
  };
}

async function runRestrictionTestSuite() {
  console.log("==========================================================================");
  console.log("   UNIVERSAL RESTRICTION DETECTION ENGINE TEST SUITE (20 CATEGORIES)      ");
  console.log("==========================================================================");

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

  // =========================================================================
  // SECTION 1: ALL 20 PROHIBITED CATEGORIES (POSITIVE DETECTION)
  // =========================================================================

  const prohibitedSamples = [
    {
      id: "porn_adult",
      name: "1. Porn / Adult Content",
      text: "Welcome to our adult entertainment portal featuring xxx adult video and erotic massage.",
      expectedReasonMatch: "Pornographic"
    },
    {
      id: "medicine",
      name: "2. Medicine",
      text: "Global exporter of pharmaceutical drugs, tablet formulation, antibiotics, and active pharmaceutical ingredients.",
      expectedReasonMatch: "Pharmaceutical"
    },
    {
      id: "medical_equipment",
      name: "3. Medical Equipment",
      text: "We manufacture medical devices, surgical instruments, ultrasound machines, and hospital beds.",
      expectedReasonMatch: "Medical devices"
    },
    {
      id: "hospital",
      name: "4. Hospital",
      text: "St. Jude Acute Care Hospital offering general hospital services and 24/7 emergency room trauma care.",
      expectedReasonMatch: "Hospital"
    },
    {
      id: "healthcare",
      name: "5. Healthcare",
      text: "Premier outpatient healthcare clinic, urgent care center, and patient medical practice.",
      expectedReasonMatch: "Healthcare"
    },
    {
      id: "food",
      name: "6. Food",
      text: "Artisan gourmet bakery and wholesale confectionery producing edible food products and delicious snacks.",
      expectedReasonMatch: "Food"
    },
    {
      id: "weapons",
      name: "7. Weapons",
      text: "Manufacturer of tactical firearms, assault weapons, ammunition, and ballistic armor vests.",
      expectedReasonMatch: "weapons"
    },
    {
      id: "knives",
      name: "8. Knives",
      text: "Custom knifemaker forging combat knives, tactical knives, hunting knives, and kitchen cutlery knives.",
      expectedReasonMatch: "Knives"
    },
    {
      id: "defence",
      name: "9. Defence",
      text: "Prime military defense contractor supplying armored military combat vehicles and military weapon systems.",
      expectedReasonMatch: "Military defence"
    },
    {
      id: "aircraft",
      name: "10. Aircraft",
      text: "Commercial aircraft manufacturers and private jets assembly facility.",
      expectedReasonMatch: "Aircraft"
    },
    {
      id: "aviation",
      name: "11. Aviation",
      text: "Scheduled commercial airlines offering airline flights, passenger transport, and book flights online.",
      expectedReasonMatch: "Airline"
    },
    {
      id: "aerospace",
      name: "12. Aerospace",
      text: "Designer of aerospace launch vehicles, space exploration rockets, and satellite manufacturing.",
      expectedReasonMatch: "Aerospace"
    },
    {
      id: "marine",
      name: "13. Marine",
      text: "Luxury motor yachts dealership, boat sales, yacht charter, and marina facility.",
      expectedReasonMatch: "Marine vessels"
    },
    {
      id: "shipbuilding",
      name: "14. Shipbuilding",
      text: "Commercial shipyards specializing in dry dock vessel construction, naval shipbuilding and repair.",
      expectedReasonMatch: "Shipbuilding"
    },
    {
      id: "chemicals",
      name: "15. Chemicals",
      text: "Bulk chemical manufacturers producing sulfuric acid, petrochemical solvents, and synthetic resins.",
      expectedReasonMatch: "Chemical manufacturer"
    },
    {
      id: "alcohol",
      name: "16. Alcohol",
      text: "Highland single malt scotch whiskey distillery and craft brewery producing alcoholic beverages.",
      expectedReasonMatch: "Alcoholic beverage"
    },
    {
      id: "animals",
      name: "17. Animals",
      text: "Licensed pedigree dog breeding kennel, livestock cattle ranching, and selling live puppies.",
      expectedReasonMatch: "Live animal"
    },
    {
      id: "tobacco",
      name: "18. Tobacco",
      text: "Manufacturer of premium cigars, rolling tobacco, cigarettes, and vape shop liquids.",
      expectedReasonMatch: "Tobacco"
    },
    {
      id: "gambling",
      name: "19. Gambling",
      text: "Licensed online casino offering sports betting, slot machines, and poker online.",
      expectedReasonMatch: "Online gambling"
    },
    {
      id: "hacking_services",
      name: "20. Hacking Services",
      text: "Hire a hacker to crack passwords, bypass security hacking, and ddos for hire.",
      expectedReasonMatch: "Hacking services"
    }
  ];

  for (const sample of prohibitedSamples) {
    await test(`Prohibited Category: ${sample.name} -> Not Working`, () => {
      const res = RestrictionValidator.detectTextRestrictions(sample.text);
      assert(res !== null, `Expected detection for ${sample.name}`);
      assert.strictEqual(res.categoryId, sample.id);
      assert(res.reason.toLowerCase().includes(sample.expectedReasonMatch.toLowerCase()),
        `Reason "${res.reason}" should contain "${sample.expectedReasonMatch}"`);
    });
  }

  // =========================================================================
  // SECTION 2: CONTEXTUAL NEGATIVE EXCLUSIONS (PREVENT FALSE POSITIVES)
  // =========================================================================

  const falsePositiveExclusionCases = [
    {
      name: "Marine Grade Stainless Steel (Industrial Metal Supplier)",
      text: "We stock 316 marine grade stainless steel fasteners, marine grade aluminum sheets, and corrosion resistant marine hardware components.",
      category: "marine"
    },
    {
      name: "Food Processing Machinery (Industrial Equipment Manufacturer)",
      text: "Manufacturer of food processing machinery, stainless steel food packaging equipment, and food-grade conveyor belts.",
      category: "food"
    },
    {
      name: "Aerospace Precision CNC Machining (Contract Manufacturer)",
      text: "Precision aerospace CNC machining, AS9100 certified manufacturing of aerospace grade titanium alloy components.",
      category: "aerospace"
    },
    {
      name: "Chemical Resistant Valves & Tanks (Industrial Equipment Supplier)",
      text: "Supplying chemical resistant fluoropolymer valves, chemical storage tanks, and industrial chemical pumps.",
      category: "chemicals"
    },
    {
      name: "Hospital Flooring & Cleanroom Panels (Building Material Supplier)",
      text: "We manufacture hospital-grade flooring systems, cleanroom panels for hospitals, and medical facility lighting.",
      category: "hospital"
    },
    {
      name: "Precision CNC for Medical Sector (Contract Precision Machining)",
      text: "Contract precision machining for medical parts, medical grade silicone tubing extrusion, and dental implant blanks.",
      category: "medical_equipment"
    },
    {
      name: "Industrial Machine Knives (Industrial Tooling Manufacturer)",
      text: "Manufacturer of industrial machine knives, granulator knives, slitting knives, and rotary shear blades.",
      category: "knives"
    },
    {
      name: "Air Knife Systems (Industrial Drying Equipment)",
      text: "High velocity air knife blowoff systems and industrial drying solutions for conveyor lines.",
      category: "knives"
    },
    {
      name: "Industrial Isopropyl Alcohol Solvent (Chemical Cleaning Solvent)",
      text: "Distributor of 99% pure industrial isopropyl alcohol for electronics cleaning and alcohol wipes.",
      category: "alcohol"
    },
    {
      name: "Animal Feed Pellet Mill (Agricultural Machinery)",
      text: "Heavy duty animal feed machinery, livestock fencing, and pet food packaging machinery manufacturer.",
      category: "animals"
    },
    {
      name: "Network & Cyber Defense (IT Infrastructure)",
      text: "Enterprise cyber defense, network defense architecture, and penetration testing services.",
      category: "defence"
    }
  ];

  for (const fp of falsePositiveExclusionCases) {
    await test(`False Positive Exclusion: ${fp.name} -> Allowed as Eligible (Not flagged as ${fp.category})`, () => {
      const res = RestrictionValidator.detectTextRestrictions(fp.text);
      if (res !== null) {
        assert.notStrictEqual(res.categoryId, fp.category,
          `Expected ${fp.name} NOT to be flagged as ${fp.category}, but got ${res.categoryId}`);
      } else {
        assert.strictEqual(res, null, `Expected no prohibited trigger for ${fp.name}`);
      }
    });
  }

  // =========================================================================
  // SECTION 3: IMAGE RESTRICTION METADATA INSPECTION
  // =========================================================================

  await test("Image Metadata Inspection: Prohibited image detected via ALT attribute", () => {
    const html = `<div>
      <img src="/images/catalog/item101.jpg" alt="Combat Tactical Knife Fixed Blade" />
      <img src="/images/logo.png" alt="Company Logo" />
    </div>`;
    const res = RestrictionValidator.detectImageRestrictions(html, "https://company.com/products");
    assert.strictEqual(res.totalImages, 2);
    assert.strictEqual(res.prohibitedImages, 1);
    assert.strictEqual(res.cleanImages, 1);
    assert.strictEqual(res.allImagesProhibited, false);
    assert.strictEqual(res.prohibitedDetails[0].category, "Knives");
    assert(res.prohibitedDetails[0].evidence.includes("[Metadata Inspection]"));
    assert(res.prohibitedDetails[0].evidence.includes("Combat Tactical Knife"));
  });

  await test("Image Metadata Inspection: All images prohibited -> AllImagesProhibited is True", () => {
    const html = `<div>
      <img src="/products/whiskey.jpg" alt="Single Malt Scotch Whiskey Bottle" />
      <img src="/products/vodka.jpg" alt="Premium Vodka Distillery Bottle" />
    </div>`;
    const res = RestrictionValidator.detectImageRestrictions(html, "https://distillery.com");
    assert.strictEqual(res.totalImages, 2);
    assert.strictEqual(res.prohibitedImages, 2);
    assert.strictEqual(res.cleanImages, 0);
    assert.strictEqual(res.allImagesProhibited, true);
  });

  await test("Image Metadata Inspection: Ambiguous filename alone is NOT claimed as prohibited", () => {
    const html = `<div>
      <img src="/assets/shot.png" alt="Product Screenshot" />
      <img src="/assets/blade.png" alt="Industrial Rotor Blade" />
    </div>`;
    const res = RestrictionValidator.detectImageRestrictions(html, "https://machinery.com");
    assert.strictEqual(res.prohibitedImages, 0);
    assert.strictEqual(res.cleanImages, 2);
    assert.strictEqual(res.allImagesProhibited, false);
  });

  // =========================================================================
  // SECTION 4: MULTI-PAGE ONLINE SHOPPING & CART DETECTION
  // =========================================================================

  await test("Online Shopping Detection: Add to Cart button identified", () => {
    const html = `<div class="product-actions"><button type="submit" class="btn">Add to Cart</button></div>`;
    const res = RestrictionValidator.detectOnlineShopping(html);
    assert.strictEqual(res.detected, true);
    assert(res.signals.includes("Add to Cart"));
  });

  await test("Online Shopping Detection: Payment Gateway integration identified", () => {
    const html = `<html><head><script src="https://js.stripe.com/v3/"></script></head><body>Welcome</body></html>`;
    const res = RestrictionValidator.detectOnlineShopping(html);
    assert.strictEqual(res.detected, true);
    assert(res.signals.includes("Payment Gateway"));
  });

  // =========================================================================
  // SECTION 5: MANUFACTURER EXCEPTION PRESERVATION & BOUNDARY ENFORCEMENT
  // =========================================================================

  await test("Manufacturer Exception Preserved: Legitimate manufacturer with Add to Cart -> Working", () => {
    const shopHtml = `<div><button>Add to Cart</button></div>`;
    const mfgData = {
      websiteStatus: "Working",
      businessType: "Manufacturer",
      websiteName: "https://valvemfg.com"
    };
    const mfgQc = RestrictionValidator.validateFinalQC(mfgData, [
      { url: "https://valvemfg.com", html: shopHtml, textSnippet: "Manufacturer of industrial stainless steel valves" }
    ], { initialHtml: shopHtml });

    assert.strictEqual(mfgQc.websiteStatus, "Working");
    assert.strictEqual(mfgQc.businessType, "Manufacturer");
  });

  await test("Manufacturer Exception Denied for Non-Manufacturer: Trader with Add to Cart -> Not Working", () => {
    const shopHtml = `<div><button>Add to Cart</button></div>`;
    const traderData = {
      websiteStatus: "Working",
      businessType: "Trader",
      websiteName: "https://toolstrader.com"
    };
    const traderQc = RestrictionValidator.validateFinalQC(traderData, [
      { url: "https://toolstrader.com", html: shopHtml, textSnippet: "We trade and distribute hand tools" }
    ], { initialHtml: shopHtml });

    assert.strictEqual(traderQc.websiteStatus, "Not Working");
    assert(traderQc.notWorkingReason.includes("Non-manufacturer website with online product selling options"));
  });

  await test("Manufacturer Exception Containment: Manufacturer of WEAPONS with Add to Cart -> Not Working (No Bypass!)", () => {
    const shopHtml = `<div><button>Add to Cart</button></div>`;
    const weaponMfgData = {
      websiteStatus: "Working",
      businessType: "Manufacturer",
      websiteName: "https://tacticalarmsmfg.com"
    };
    const weaponMfgQc = RestrictionValidator.validateFinalQC(weaponMfgData, [
      { url: "https://tacticalarmsmfg.com", html: shopHtml, textSnippet: "Manufacturer of tactical firearms, assault weapons, and ammunition" }
    ], { initialHtml: shopHtml });

    assert.strictEqual(weaponMfgQc.websiteStatus, "Not Working");
    assert(weaponMfgQc.notWorkingReason.includes("weapons") || weaponMfgQc.notWorkingReason.includes("armor"));
  });

  await test("Manufacturer Exception Containment: Manufacturer of FOOD with Add to Cart -> Not Working (No Bypass!)", () => {
    const shopHtml = `<div><button>Add to Cart</button></div>`;
    const foodMfgData = {
      websiteStatus: "Working",
      businessType: "Manufacturer",
      websiteName: "https://snackfoodmfg.com"
    };
    const foodMfgQc = RestrictionValidator.validateFinalQC(foodMfgData, [
      { url: "https://snackfoodmfg.com", html: shopHtml, textSnippet: "Manufacturer of packaged food snacks, confectionery, and baked goods" }
    ], { initialHtml: shopHtml });

    assert.strictEqual(foodMfgQc.websiteStatus, "Not Working");
    assert(foodMfgQc.notWorkingReason.includes("Food") || foodMfgQc.notWorkingReason.includes("beverage"));
  });

  // =========================================================================
  // SECTION 6: CENTRALIZED QC & CRAWLER ENGINE INTEGRATION
  // =========================================================================

  await test("CrawlerEngine.detectRedirectAndClassifyStatus detects Pharma through RestrictionValidator", async () => {
    const fetchFn = async (url) => {
      return createMockResponse({
        status: 200,
        url,
        html: `<html><body><h1>BioPharma Formulations</h1><p>We are a manufacturer of pharmaceutical drugs, tablet formulation, and prescription medicine.</p></body></html>`
      });
    };
    const res = await CrawlerEngine.detectRedirectAndClassifyStatus("https://biopharma-pharma.com", { fetchFn });
    assert.strictEqual(res.websiteStatus, "Not Working");
    assert(res.nonWorkingReason.includes("Pharmaceutical") || res.nonWorkingReason.includes("medicinal"));
  });

  await test("CrawlerEngine.applyBusinessTypeEligibilityRule executes centralized RestrictionValidator", () => {
    const shopHtml = `<div><button>Buy Now</button></div>`;
    const data = {
      websiteStatus: "Working",
      businessType: "Wholesaler",
      websiteName: "https://wholesale-outlet.com"
    };
    const validated = CrawlerEngine.applyBusinessTypeEligibilityRule(data, shopHtml);
    assert.strictEqual(validated.websiteStatus, "Not Working");
    assert(validated.notWorkingReason.includes("Non-manufacturer"));
  });

  console.log("==========================================================================");
  console.log(`  RESTRICTION ENGINE RESULTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL ${total})`);
  console.log("==========================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runRestrictionTestSuite();
