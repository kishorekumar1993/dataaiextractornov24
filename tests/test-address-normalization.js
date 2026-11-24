const assert = require("assert");
const AddressNormalizer = require("../addressNormalizer.js");

console.log("==========================================================");
console.log("   ADDRESS NORMALIZATION MODULE TEST SUITE                ");
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

// 1. Contextual abbreviation expansion
test("Contextual thoroughfare expansion (Rd -> Road, St -> Street, Ave -> Avenue, Blvd -> Boulevard)", () => {
  const input = "B-14, Shashi Park Rd, I, Mayur Vihar, New Delhi, Delhi";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert(normalized.includes("Shashi Park Road"), `Expected 'Shashi Park Road', got: ${normalized}`);
  assert(normalized.includes("B-14"), `Expected 'B-14', got: ${normalized}`);
  assert(normalized.includes(", I, Mayur Vihar"), `Expected Roman numeral I preserved with commas, got: ${normalized}`);
});

test("Contextual unit and building expansion (Ste -> Suite, Apt -> Apartment, Bldg -> Building, Rm -> Room)", () => {
  const input = "100 Industrial Pkwy, Bldg 4, Ste 200, Austin, Texas";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert(normalized.includes("Industrial Parkway"), `Expected Parkway, got: ${normalized}`);
  assert(normalized.includes("Building 4"), `Expected Building 4, got: ${normalized}`);
  assert(normalized.includes("Suite 200"), `Expected Suite 200, got: ${normalized}`);
});

test("Floor designation contextual expansion (3F -> 3Floor, 2nd Fl. -> 2nd Floor)", () => {
  const input1 = "3F Mahalaxmi Plaza, Sector - 3, Vaishali";
  assert(AddressNormalizer.normalizeAddress(input1).includes("3Floor"), `Expected 3Floor, got: ${AddressNormalizer.normalizeAddress(input1)}`);

  const input2 = "2nd Fl. Tech Center, Innovation Way";
  assert(AddressNormalizer.normalizeAddress(input2).includes("2nd Floor"), `Expected 2nd Floor, got: ${AddressNormalizer.normalizeAddress(input2)}`);
});

// 2. Preserve street numbers, unit numbers, directional identifiers and original address meaning
test("Preserve street numbers, unit numbers, and alphanumeric block identifiers", () => {
  const input = "N173 W21640 Northwest Passage Way, Jackson, Wisconsin";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert(normalized.includes("N173 W21640"), `Expected alphanumeric directional block identifiers preserved, got: ${normalized}`);
  assert(normalized.includes("Northwest Passage Way"), `Expected Northwest Passage Way, got: ${normalized}`);
});

test("Preserve standalone directional identifiers (N, S, E, W, NW, SE)", () => {
  const input = "500 Main St N, Unit #8, Springfield";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert(normalized.includes("Main Street North"), `Expected Main Street North, got: ${normalized}`);
  assert(normalized.includes("Unit #8"), `Expected Unit #8 preserved, got: ${normalized}`);
});

test("Preserve Roman numerals and alphanumeric phase identifiers (Mayur Vihar - I, Phase II)", () => {
  const input = "B-14, Shashi Park Rd, Phase - II, New Delhi";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert(normalized.includes("Phase - II"), `Expected Phase - II preserved in uppercase, got: ${normalized}`);
});

// 3. Apply proper Title Case
test("Proper Title Case application across lowercase and uppercase input", () => {
  const input = "41 BARRY STREET, BAYSWATER, VICTORIA";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert.strictEqual(normalized, "41 Barry Street, Bayswater, Victoria");

  const inputLower = "41 barry street, bayswater, victoria";
  const normalizedLower = AddressNormalizer.normalizeAddress(inputLower);
  assert.strictEqual(normalizedLower, "41 Barry Street, Bayswater, Victoria");
});

// 4. Never invent missing address information
test("Never invent missing address information (no hallucinations of unmentioned city/state)", () => {
  const input = "128 Industry Road, Chemical Zone";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert.strictEqual(normalized, "128 Industry Road, Chemical Zone");
  assert(!normalized.includes("China") && !normalized.includes("Hangzhou"), "Must not invent unmentioned country or city");
});

// 5. Preserve uncertain abbreviations
test("Preserve uncertain abbreviations without guessing (PO Box, C/O, HQ, unknown codes)", () => {
  const input = "PO Box 450, C/O Operations, HQ Building";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert(normalized.includes("PO Box 450"), `Expected PO Box preserved, got: ${normalized}`);
  assert(normalized.includes("C/O Operations"), `Expected C/O preserved, got: ${normalized}`);
  assert(normalized.includes("HQ Building"), `Expected HQ preserved, got: ${normalized}`);
});

// 6. Comma and punctuation preservation
test("Preserve source commas and clean trailing clutter", () => {
  const input = "B-14, Shashi Park Rd, I, Mayur Vihar, New Delhi, Delhi,";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert(!normalized.endsWith(","), "Trailing comma must be removed");
  assert.strictEqual(normalized, "B-14, Shashi Park Road, I, Mayur Vihar, New Delhi, Delhi");
});

console.log("==========================================================");
console.log(`  ADDRESS NORMALIZATION RESULTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL ${total})`);
console.log("==========================================================");

if (passed !== total) {
  process.exit(1);
}
