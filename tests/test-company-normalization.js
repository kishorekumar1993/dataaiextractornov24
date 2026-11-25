const assert = require("assert");
const CompanyNormalizer = require("../companyNormalizer.js");

console.log("==========================================================");
console.log("   COMPANY NAME NORMALIZATION MODULE TEST SUITE           ");
console.log("==========================================================");

let total = 0;
let passed = 0;

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

// 1. Legal Entity Expansions
test("Expand Co., Ltd. / Co.,Ltd / Co. Ltd. -> Company, Limited", () => {
  const norm1 = CompanyNormalizer.normalizeCompanyName("Zhejiang Jiangnan Steel Structure Co., Ltd.");
  assert.strictEqual(norm1, "Zhejiang Jiangnan Steel Structure Company, Limited");

  const norm2 = CompanyNormalizer.normalizeCompanyName("ANSON Hydraulics Industrial Co.,Ltd.");
  assert.strictEqual(norm2, "Anson Hydraulics Industrial Company, Limited");

  const norm3 = CompanyNormalizer.normalizeCompanyName("Oriental Chem Co. Ltd.");
  assert.strictEqual(norm3, "Oriental Chem Company, Limited");
});

test("Expand Ltd. / Ltd -> Limited with apostrophes and symbols", () => {
  const norm1 = CompanyNormalizer.normalizeCompanyName("Lamb's Signs Ltd");
  assert.strictEqual(norm1, "Lamb's Signs Limited");

  const norm2 = CompanyNormalizer.normalizeCompanyName("Apex Signs & Engraving Ltd.");
  assert.strictEqual(norm2, "Apex Signs & Engraving Limited");
  assert(norm2.includes("&"), "Ampersand '&' must be preserved, never replaced by 'and'");
});

test("Expand Pvt. Ltd. / Pte. Ltd. / Pty. Ltd. / Sdn. Bhd.", () => {
  const norm1 = CompanyNormalizer.normalizeCompanyName("Tata Consultancy Services Pvt. Ltd.");
  assert.strictEqual(norm1, "Tata Consultancy Services Private Limited");

  const norm2 = CompanyNormalizer.normalizeCompanyName("Singapore Trading Pte. Ltd.");
  assert.strictEqual(norm2, "Singapore Trading Private Limited");

  const norm3 = CompanyNormalizer.normalizeCompanyName("Sime Darby Plantation Sdn. Bhd.");
  assert.strictEqual(norm3, "Sime Darby Plantation Sendirian Berhad");
});

test("Expand Inc. / Corp. / LLC / LLP / PLC", () => {
  const norm1 = CompanyNormalizer.normalizeCompanyName("Reinke & Schomann Inc.");
  assert.strictEqual(norm1, "Reinke & Schomann Incorporated");

  const norm2 = CompanyNormalizer.normalizeCompanyName("Apex Dynamics Corp.");
  assert.strictEqual(norm2, "Apex Dynamics Corporation");

  const norm3 = CompanyNormalizer.normalizeCompanyName("Midwest Manufacturing LLC");
  assert.strictEqual(norm3, "Midwest Manufacturing Limited Liability Company");
});

// 2. Industry & Descriptive abbreviation expansions
test("Expand Mfg. -> Manufacturing, Ind. -> Industrial, Tech. -> Technology", () => {
  const norm1 = CompanyNormalizer.normalizeCompanyName("General Mfg. Co.");
  assert.strictEqual(norm1, "General Manufacturing Company");

  const norm2 = CompanyNormalizer.normalizeCompanyName("Anson Ind. Equip. Ltd.");
  assert.strictEqual(norm2, "Anson Industrial Equipment Limited");

  const norm3 = CompanyNormalizer.normalizeCompanyName("Precision Tech. Sol. Ltd.");
  assert.strictEqual(norm3, "Precision Technology Solutions Limited");
});

// 3. Remove parentheses and bracketed secondary names
test("Clean secondary bracketed terms (e.g. Four C Plus (Internet) Company Limited)", () => {
  const norm = CompanyNormalizer.normalizeCompanyName("Four C Plus (Internet) Company Limited");
  assert.strictEqual(norm, "Four C Plus Internet Company, Limited");
});

// 4. Strip copyright and website title clutter
test("Strip copyright headers and slogan/title clutter", () => {
  const norm1 = CompanyNormalizer.normalizeCompanyName("© 2026 Lamb's Signs Limited. All Rights Reserved.");
  assert.strictEqual(norm1, "Lamb's Signs Limited");

  const norm2 = CompanyNormalizer.normalizeCompanyName("Lamb's Signs Ltd - Premier Sign Makers in Norwich");
  assert.strictEqual(norm2, "Lamb's Signs Limited");
});

// 5. Acronym and Title Case preservation
test("Preserve acronyms and proper casing (IBM, BMW, 4CPlus)", () => {
  const norm1 = CompanyNormalizer.normalizeCompanyName("IBM Global Services");
  assert.strictEqual(norm1, "IBM Global Services");

  const norm2 = CompanyNormalizer.normalizeCompanyName("4CPlus Internet Co.");
  assert.strictEqual(norm2, "4CPlus Internet Company");
});

// 6. Expanded industry & business descriptors (Bros., Assoc., Mach., Mgmt., Natl., Elec., Fab., Prec., comma-followed)
test("Expand extended industry/business abbreviations (Bros., Assoc., Mach., Mgmt., Natl., Elec., Fab., Prec.)", () => {
  assert.strictEqual(
    CompanyNormalizer.normalizeCompanyName("Smith Bros. Mach. & Equip. Co., Ltd."),
    "Smith Brothers Machinery & Equipment Company, Limited"
  );
  assert.strictEqual(
    CompanyNormalizer.normalizeCompanyName("Natl. Prec. Fab. & Elec. Assoc. Inc."),
    "National Precision Fabrication & Electrical Associates Incorporated"
  );
  assert.strictEqual(
    CompanyNormalizer.normalizeCompanyName("Apex Mfg., Inc."),
    "Apex Manufacturing, Incorporated"
  );
});

console.log("==========================================================");
console.log(`  COMPANY NAME RESULTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL ${total})`);
console.log("==========================================================");

if (passed !== total) {
  process.exit(1);
}
