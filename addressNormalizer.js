// Universal Address Normalizer Module
// Supports contextual abbreviation expansion, Title Case normalization,
// unit/directional/number preservation, and uncertainty preservation without hallucination.

const AddressNormalizer = (() => {
  // Directional abbreviations (contextually expanded when not part of an alphanumeric code)
  const DIRECTIONALS = {
    "n": "North", "n.": "North",
    "s": "South", "s.": "South",
    "e": "East", "e.": "East",
    "w": "West", "w.": "West",
    "ne": "Northeast", "ne.": "Northeast",
    "nw": "Northwest", "nw.": "Northwest",
    "se": "Southeast", "se.": "Southeast",
    "sw": "Southwest", "sw.": "Southwest"
  };

  // Thoroughfare abbreviations (contextually expanded in street position)
  const THOROUGHFARES = {
    "rd": "Road", "rd.": "Road",
    "st": "Street", "st.": "Street",
    "ave": "Avenue", "ave.": "Avenue", "av": "Avenue", "av.": "Avenue",
    "blvd": "Boulevard", "blvd.": "Boulevard",
    "dr": "Drive", "dr.": "Drive",
    "ln": "Lane", "ln.": "Lane",
    "ct": "Court", "ct.": "Court",
    "pl": "Place", "pl.": "Place",
    "cir": "Circle", "cir.": "Circle",
    "pkwy": "Parkway", "pkwy.": "Parkway", "pky": "Parkway",
    "hwy": "Highway", "hwy.": "Highway",
    "ter": "Terrace", "ter.": "Terrace", "terr": "Terrace", "terr.": "Terrace",
    "sq": "Square", "sq.": "Square",
    "expy": "Expressway", "exp": "Expressway",
    "cres": "Crescent", "cres.": "Crescent",
    "cl": "Close", "cl.": "Close",
    "esp": "Esplanade", "esp.": "Esplanade",
    "aly": "Alley", "aly.": "Alley",
    "brg": "Bridge", "brg.": "Bridge",
    "rdg": "Ridge", "rdg.": "Ridge"
  };

  // Unit, Division & Building abbreviations
  const UNITS = {
    "ste": "Suite", "ste.": "Suite",
    "apt": "Apartment", "apt.": "Apartment",
    "rm": "Room", "rm.": "Room",
    "bldg": "Building", "bldg.": "Building",
    "blk": "Block", "blk.": "Block",
    "sec": "Section", "sec.": "Section",
    "dist": "District", "dist.": "District",
    "ind": "Industrial", "ind.": "Industrial",
    "plz": "Plaza", "plz.": "Plaza",
    "ctr": "Center", "ctr.": "Center",
    "no": "Number", "no.": "Number",
    "dept": "Department", "dept.": "Department",
    "div": "Division", "div.": "Division"
  };

  // Roman numerals that should stay uppercase
  const ROMAN_NUMERALS = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]);

  // Uncertain / Ambiguous abbreviations that MUST be preserved as-is without guessing
  const UNCERTAIN_PRESERVE = new Set([
    "apo", "fpo", "dpo", "hq", "n/a", "co", "corp", "inc", "ltd", "llc", "llp", "gmbh", "plc"
  ]);

  /**
   * Applies proper Title Case to an alphanumeric token while respecting
   * building numbers, unit IDs, Roman numerals, and acronyms.
   */
  function titleCaseToken(token) {
    if (!token) return "";

    // If token is a Roman numeral (e.g. "I", "II", "III"), keep uppercase
    if (ROMAN_NUMERALS.has(token.toUpperCase())) {
      return token.toUpperCase();
    }

    // If token is an uncertain/reserved acronym, preserve standard casing
    if (UNCERTAIN_PRESERVE.has(token.toLowerCase())) {
      return token.toUpperCase();
    }

    // If token is a number directly attached to "Floor" (e.g. "3Floor", "1Floor")
    const floorMatch = token.match(/^(\d+)(floor)$/i);
    if (floorMatch) {
      return floorMatch[1] + "Floor";
    }

    // If token contains hyphen (e.g. "B-14", "VC-2", "Sector-3")
    if (token.includes("-")) {
      const parts = token.split("-");
      // Check if it's alphanumeric code like B-14, VC-2, or Phase-I
      return parts.map((p, idx) => {
        if (/^[a-zA-Z]$/.test(p)) return p.toUpperCase();
        if (ROMAN_NUMERALS.has(p.toUpperCase())) return p.toUpperCase();
        if (/^\d+$/.test(p)) return p;
        if (/^[A-Z0-9]+$/.test(p) && p.length <= 4) return p.toUpperCase();
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      }).join("-");
    }

    // If alphanumeric starting with letter followed by number (e.g. "N173", "W21640", "Unit8", "#8")
    if (/^[A-Za-z]\d+$/.test(token)) {
      return token.charAt(0).toUpperCase() + token.slice(1);
    }
    if (/^#[A-Za-z0-9]+$/.test(token)) {
      return token.toUpperCase();
    }

    // Pure numbers
    if (/^\d+$/.test(token)) {
      return token;
    }

    // Standard word title casing
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  }

  /**
   * Intelligently normalizes an address string:
   * 1. Preserves street numbers, unit numbers, directional identifiers, and meaning.
   * 2. Contextually expands abbreviations:
   *    - P.O. Box -> Post Office Box, P.O. -> Post Office
   *    - Kb / K.B. -> Kotak Berkunci (or Kota Bharu / Kabupaten contextually)
   *    - Rd -> Road, St -> Street, Ste -> Suite, F/Fl -> Floor
   * 3. Preserves uncertain or ambiguous abbreviations as-is.
   * 4. Applies proper Title Case.
   * 5. Never invents missing address information.
   * 6. Preserves existing commas and punctuation while cleaning trailing clutter.
   */
  function normalizeAddress(rawAddress, options = {}) {
    if (!rawAddress || typeof rawAddress !== "string") {
      return rawAddress || "";
    }

    let addr = rawAddress.trim();
    if (!addr || addr.toLowerCase() === "not available") {
      return "Not Available";
    }

    // Remove outer brackets or parentheses
    addr = addr.replace(/^\(([^)]+)\)$/, "$1").replace(/^\[([^\]]+)\]$/, "$1");

    // Clean multiple spaces and normalize line breaks into single spaces with comma if needed
    addr = addr.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    // If multiline, ensure line breaks with no commas get preserved cleanly without losing word boundaries
    addr = addr.replace(/,\s*\n/g, ", ").replace(/\n/g, " ");
    addr = addr.replace(/[ \t]+/g, " ").trim();

    // Remove trailing unwanted punctuation at the end of the entire address
    addr = addr.replace(/[,;.\-:]+$/, "").trim();

    // 1. Contextual Postal expansions: P.O. / PO / Post Office
    // "P.O. Box" / "PO Box" -> "Post Office Box"
    addr = addr.replace(/\b(?:p\.?o\.?|po)\s+box\b/gi, "Post Office Box");
    // "P.O." / "P.O" standalone or before name -> "Post Office"
    addr = addr.replace(/\b(?:p\.o\.|p\.o)(?=\s|$)/gi, "Post Office");

    // 2. Contextual Postal expansions: P.B. / Post Bag
    addr = addr.replace(/\b(?:p\.?b\.?|pb)\s+(?:no\.?|number)\b/gi, "Post Bag Number");
    addr = addr.replace(/\b(?:p\.b\.|p\.b)(?=\s|$)/gi, "Post Bag");

    // 3. Contextual Postal & Regional expansions: KB / K.B. / Kb
    // A. In Locked Bag context: followed by number or No/Number (e.g. "K.B. 123", "KB No. 45", "Kb 500")
    addr = addr.replace(/\b(?:k\.?b\.?|kb)\s+(?:no\.?|number|#)?\s*(\d+)\b/gi, "Kotak Berkunci Number $1");
    // B. In city/state context: "KB, Kelantan" or "KB Kelantan"
    addr = addr.replace(/\b(?:k\.?b\.?|kb)\s*,\s*(kelantan|malaysia)\b/gi, "Kota Bharu, $1");
    addr = addr.replace(/\b(?:k\.?b\.?|kb)\s+(kelantan)\b/gi, "Kota Bharu $1");
    // C. In Indonesian regency context: "Kab." / "Kb." before regency name (e.g. "Kb. Bandung", "Kab. Bogor")
    addr = addr.replace(/\b(?:kab\.|kb\.)\s+([a-zA-Z]+)\b/gi, "Kabupaten $1");

    // 4. Other administrative prefixes
    addr = addr.replace(/\b(?:c\/o)\b/gi, "Care Of");
    addr = addr.replace(/\b(?:g\/f)\b/gi, "Ground Floor");
    addr = addr.replace(/\b(?:m\/f)\b/gi, "Mezzanine Floor");
    addr = addr.replace(/\b(?:b\/f)\b/gi, "Basement Floor");
    addr = addr.replace(/\b(?:h\.?no\.?|h\s+no\.?)\s*([a-zA-Z0-9\/-]+)\b/gi, "House Number $1");

    // 5. Contextual floor expansion on raw string before tokenization (e.g. "3F", "2nd Fl.", "1st F")
    addr = addr.replace(/\b(\d+)(?:st|nd|rd|th)?\s*(?:fl\.|fl|f)\b/gi, (match, num) => {
      if (match.toLowerCase().includes("st") || match.toLowerCase().includes("nd") || 
          match.toLowerCase().includes("rd") || match.toLowerCase().includes("th")) {
        const ordMatch = match.match(/^(\d+(?:st|nd|rd|th))/i);
        return (ordMatch ? ordMatch[1].toLowerCase() : num) + " Floor";
      }
      return num + "Floor";
    });

    // Tokenize into phrases by comma or segment to preserve original punctuation structure
    const segments = addr.split(",");
    const normalizedSegments = segments.map((seg, segIdx) => {
      let trimmedSeg = seg.trim();
      if (!trimmedSeg) return "";

      const tokens = trimmedSeg.split(" ");
      const normalizedTokens = tokens.map((token, tokenIdx) => {
        let prefix = "";
        let suffix = "";

        // Separate leading/trailing punctuation attached to token (e.g. quotes, brackets, dots, colons)
        const match = token.match(/^([(\[{'"#]*)(\S*?)([)\]}'":;.]*)$/);
        let coreToken = token;
        if (match) {
          prefix = match[1] || "";
          coreToken = match[2] || "";
          suffix = match[3] || "";
        }

        if (!coreToken) return token;

        const lower = coreToken.toLowerCase();

        // 1. Check Uncertain / Ambiguous abbreviations -> preserve as-is
        if (UNCERTAIN_PRESERVE.has(lower)) {
          return prefix + titleCaseToken(coreToken) + suffix;
        }

        // 2. Check Roman numerals -> keep uppercase
        if (ROMAN_NUMERALS.has(coreToken.toUpperCase())) {
          return prefix + coreToken.toUpperCase() + suffix;
        }

        // 3. Contextual Unit Expansion (e.g., Ste -> Suite, Apt -> Apartment, Bldg -> Building)
        if (UNITS[lower]) {
          return prefix + UNITS[lower] + suffix;
        }

        // 4. Contextual Thoroughfare Expansion (e.g., Rd -> Road, St -> Street, Ave -> Avenue)
        if (THOROUGHFARES[lower]) {
          return prefix + THOROUGHFARES[lower] + suffix;
        }

        // 5. Contextual Directional Expansion (e.g., N -> North, SW -> Southwest)
        if (DIRECTIONALS[lower]) {
          return prefix + DIRECTIONALS[lower] + suffix;
        }

        // 6. Default to intelligent Title Case preserving alphanumeric IDs and numbers
        return prefix + titleCaseToken(coreToken) + suffix;
      });

      return normalizedTokens.join(" ");
    });

    // Rejoin segments with original commas
    let result = normalizedSegments.filter(Boolean).join(", ");

    // Clean up spacing around punctuation while preserving building hyphens (like B-14, VC-2)
    result = result.replace(/\s*,\s*/g, ", ")
                   .replace(/([a-zA-Z]{2,})\s*-\s*([a-zA-Z0-9]+)/g, "$1 - $2")
                   .replace(/\s+/g, " ")
                   .replace(/[,;.\-:]+$/, "")
                   .trim();

    return result;
  }

  return {
    DIRECTIONALS,
    THOROUGHFARES,
    UNITS,
    ROMAN_NUMERALS,
    UNCERTAIN_PRESERVE,
    titleCaseToken,
    normalizeAddress
  };
})();

// Export for Node.js / module environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = AddressNormalizer;
}
