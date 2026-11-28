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

// 2. P.O. and Kb expansion tests
test("P.O. and P.O. Box expansion (P.O. Box -> Post Office Box, P.O. -> Post Office)", () => {
  const input1 = "P.O. Box 450, 100 Main Street, Springfield";
  const norm1 = AddressNormalizer.normalizeAddress(input1);
  assert(norm1.includes("Post Office Box 450"), `Expected 'Post Office Box 450', got: ${norm1}`);

  const input2 = "P.O. Mayur Vihar, Phase - I, Delhi";
  const norm2 = AddressNormalizer.normalizeAddress(input2);
  assert(norm2.includes("Post Office Mayur Vihar"), `Expected 'Post Office Mayur Vihar', got: ${norm2}`);
});

test("Kb / K.B. contextual expansion (Kotak Berkunci for locked bag, Kota Bharu for city, Kabupaten for regency)", () => {
  // Locked bag in postal address
  const input1 = "Kb 123, Pejabat Pos, Serdang, Selangor";
  const norm1 = AddressNormalizer.normalizeAddress(input1);
  assert(norm1.includes("Kotak Berkunci Number 123"), `Expected Kotak Berkunci Number 123, got: ${norm1}`);

  const input2 = "K.B. No. 45, Jalan Ampang, Kuala Lumpur";
  const norm2 = AddressNormalizer.normalizeAddress(input2);
  assert(norm2.includes("Kotak Berkunci Number 45"), `Expected Kotak Berkunci Number 45, got: ${norm2}`);

  // City context in Kelantan
  const input3 = "Jalan Sultanah Zainab, KB, Kelantan";
  const norm3 = AddressNormalizer.normalizeAddress(input3);
  assert(norm3.includes("Kota Bharu, Kelantan"), `Expected Kota Bharu, Kelantan, got: ${norm3}`);

  // Indonesian regency context
  const input4 = "Jalan Raya Tajur, Kb. Bogor, Jawa Barat";
  const norm4 = AddressNormalizer.normalizeAddress(input4);
  assert(norm4.includes("Kabupaten Bogor"), `Expected Kabupaten Bogor, got: ${norm4}`);
});

// 3. Preserve street numbers, unit numbers, directional identifiers and original address meaning
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

// 4. Apply proper Title Case
test("Proper Title Case application across lowercase and uppercase input", () => {
  const input = "41 BARRY STREET, BAYSWATER, VICTORIA";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert.strictEqual(normalized, "41 Barry Street, Bayswater, Victoria");

  const inputLower = "41 barry street, bayswater, victoria";
  const normalizedLower = AddressNormalizer.normalizeAddress(inputLower);
  assert.strictEqual(normalizedLower, "41 Barry Street, Bayswater, Victoria");
});

// 5. Never invent missing address information
test("Never invent missing address information (no hallucinations of unmentioned city/state)", () => {
  const input = "128 Industry Road, Chemical Zone";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert.strictEqual(normalized, "128 Industry Road, Chemical Zone");
  assert(!normalized.includes("China") && !normalized.includes("Hangzhou"), "Must not invent unmentioned country or city");
});

// 6. Preserve uncertain abbreviations
test("Preserve uncertain abbreviations without guessing (APO, HQ, unknown codes)", () => {
  const input = "APO Box 450, C/O Operations, HQ Building";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert(normalized.includes("APO Box 450"), `Expected APO Box preserved, got: ${normalized}`);
  assert(normalized.includes("Care Of Operations"), `Expected Care Of preserved, got: ${normalized}`);
  assert(normalized.includes("HQ Building"), `Expected HQ preserved, got: ${normalized}`);
});

// 7. Comma and punctuation preservation
test("Preserve source commas and clean trailing clutter", () => {
  const input = "B-14, Shashi Park Rd, I, Mayur Vihar, New Delhi, Delhi,";
  const normalized = AddressNormalizer.normalizeAddress(input);
  assert(!normalized.endsWith(","), "Trailing comma must be removed");
  assert.strictEqual(normalized, "B-14, Shashi Park Road, I, Mayur Vihar, New Delhi, Delhi");
});

// 8. Number prefix handling (Never add Number before pure street digits, strip if artificially injected)
test("Strip unwanted leading Number before pure street numbers or hyphenated addresses (12900 - 87th Avenue)", () => {
  const input1 = "Number 12900 - 87th Avenue, Surrey, British Columbia";
  const normalized1 = AddressNormalizer.normalizeAddress(input1);
  assert.strictEqual(normalized1, "12900 - 87th Avenue, Surrey, British Columbia");

  const input2 = "12900 - 87th Avenue, Surrey, BC";
  const normalized2 = AddressNormalizer.normalizeAddress(input2);
  assert.strictEqual(normalized2, "12900 - 87th Avenue, Surrey, British Columbia");

  const inputWithExplicitNo = "No. 2, Wugong 2nd Rd, Wufeng Dist, Taichung City";
  const normalizedExplicit = AddressNormalizer.normalizeAddress(inputWithExplicitNo);
  assert(normalizedExplicit.startsWith("Number 2"), `Expected 'Number 2' when No. was explicit, got: ${normalizedExplicit}`);
});

// 9. Strict Source Comma Preservation (Zero Artificial Commas)
test("Zero artificial commas inserted during normalization or postal/country removal", () => {
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("12900 - 87th Avenue Surrey BC V3W 3H9 Canada"),
    "12900 - 87th Avenue Surrey British Columbia"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("45 Main Street, Richmond, BC V6X 1A1, Canada"),
    "45 Main Street, Richmond, British Columbia"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("Building 12 Sector 5 Noida Uttar Pradesh"),
    "Building 12 Sector 5 Noida Uttar Pradesh"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("12900 - 87th Avenue\nSurrey BC V3W 3H9\nCanada"),
    "12900 - 87th Avenue Surrey British Columbia"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("A3/A4 Barton Industrial Estate\nFaldo Road\nBarton-Le-Clay\nBedford, Bedfordshire\nMK45 4RP\nUnited Kingdom"),
    "A3/A4 Barton Industrial Estate Faldo Road Barton-Le-Clay Bedford, Bedfordshire"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("4/95 Garling St, O'Connor Western Australia"),
    "4/95 Garling Street, O'Connor Western Australia"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("Number 4/95 Garling St, O'Connor Western Australia"),
    "4/95 Garling Street, O'Connor Western Australia"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("Number 6/97 Lewis Road, Wantirna South Victoria"),
    "6/97 Lewis Road, Wantirna South Victoria"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("65 Basaltic Road Concord Ontario"),
    "65 Basaltic Road Concord Ontario"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("65 Basaltic Road, Concord, Ontario"),
    "65 Basaltic Road, Concord, Ontario"
  );
});

// 10. Guard against false-positive country/postal/directional corruption
test("Protect US state Georgia, Highway numbers, and single-letter Block/Avenue labels", () => {
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("100 Peachtree Street, Atlanta, Georgia"),
    "100 Peachtree Street, Atlanta, Georgia"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("Block E, Sector 5, Noida"),
    "Block E, Sector 5, Noida"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("120 Avenue E, Bayonne, New Jersey"),
    "120 Avenue E, Bayonne, New Jersey"
  );
  assert.strictEqual(
    AddressNormalizer.normalizeAddress("Highway 12345, Austin, Texas"),
    "Highway 12345, Austin, Texas"
  );
});

console.log("==========================================================");
console.log(`  ADDRESS NORMALIZATION RESULTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL ${total})`);
console.log("==========================================================");

if (passed !== total) {
  process.exit(1);
}
