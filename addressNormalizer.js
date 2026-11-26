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
    "rdg": "Ridge", "rdg.": "Ridge",
    "jl": "Jalan", "jl.": "Jalan", "jln": "Jalan", "jln.": "Jalan"
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
    "indl": "Industrial", "indl.": "Industrial",
    "plz": "Plaza", "plz.": "Plaza",
    "ctr": "Center", "ctr.": "Center",
    "no": "Number", "no.": "Number",
    "vil": "Village", "vil.": "Village",
    "twp": "Township", "twp.": "Township",
    "subdist": "Subdistrict", "subdist.": "Subdistrict",
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

    // If token contains slash (e.g. "A3/A4", "12/14")
    if (token.includes("/")) {
      return token.split("/").map(p => titleCaseToken(p)).join("/");
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

    // UK postal code components: outward codes (e.g. "NR6", "SW1A", "EC1A") and inward codes (e.g. "6NN", "1AA"), excluding ordinals (1st, 2nd, 3rd, 4th)
    if ((/^[A-Za-z]{1,2}\d[A-Za-z0-9]?$/i.test(token) || /^\d[A-Za-z]{2}$/i.test(token)) && !/^\d+(?:st|nd|rd|th)$/i.test(token)) {
      return token.toUpperCase();
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

    // Apostrophe names (e.g. O'Connor -> O'Connor, D'Angelo -> D'Angelo, while Lamb's -> Lamb's)
    const aposMatch = token.match(/^([A-Za-zÀ-ÖØ-öø-ÿ]+)(['’])([A-Za-zÀ-ÖØ-öø-ÿ]+)$/);
    if (aposMatch) {
      const first = aposMatch[1].charAt(0).toUpperCase() + aposMatch[1].slice(1).toLowerCase();
      const sep = aposMatch[2];
      const rest = aposMatch[3];
      const restCased = rest.length === 1
        ? rest.toLowerCase()
        : rest.charAt(0).toUpperCase() + rest.slice(1).toLowerCase();
      return first + sep + restCased;
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

    // Decode HTML entities
    addr = addr.replace(/&nbsp;/g, " ")
               .replace(/&amp;/g, "&")
               .replace(/&lt;/g, "<")
               .replace(/&gt;/g, ">")
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .replace(/&#8217;/g, "'")
               .replace(/&#8216;/g, "'")
               .replace(/&#8220;/g, '"')
               .replace(/&#8221;/g, '"')
               .replace(/&#8211;/g, "-")
               .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
               .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Remove outer brackets or parentheses only if wrapping the entire address
    addr = addr.replace(/^\(([^)]+)\)$/, "$1").replace(/^\[([^\]]+)\]$/, "$1");

    // Clean multiple spaces and preserve newlines as spaces (NEVER insert artificial commas for newlines)
    addr = addr.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    addr = addr.replace(/,\s*\n/g, ", ").replace(/\n+/g, " ");
    addr = addr.replace(/[ \t]+/g, " ").trim();

    // 1. Clean Chinese 號 character on building numbers (e.g. "No. 2號" -> "Number 2", "2號" -> "2")
    addr = addr.replace(/\bNo\.\s*(\d+)號/gi, "Number $1");
    addr = addr.replace(/(\d+)號/g, "$1");

    // 2. Expand No. / No attached or preceding numbers (e.g. "No. 2" -> "Number 2", "No.2" -> "Number 2", "No. 45" -> "Number 45")
    addr = addr.replace(/\b(?:no\.|no)\s*(\d+)/gi, "Number $1");
    addr = addr.replace(/\bno\.(?=\s|$)/gi, "Number");

    // 3. Strip leading company name prefix if followed by address elements (e.g. "Lamb's Signs Ltd, Unit B3...")
    addr = addr.replace(/^[a-zA-Z0-9\s.,'’&-]+?\b(?:ltd|limited|inc|incorporated|corp|corporation|llc|llp|gmbh|pvt\s+ltd|pte\s+ltd)\b\s*,\s*/i, "");

    // 4. Remove trailing company registration names (e.g. /ANSON Hydraulics... or native Chinese company titles at the end)
    addr = addr.replace(/\/[a-zA-Z0-9\s.,&\-]+(?:Co\.|Ltd\.|Inc\.|Corp\.|Limited|Company)[^,]*$/i, "").trim();
    addr = addr.replace(/[\u4e00-\u9fa5]{2,}[^,]*$/i, "").trim();

    // 5. Remove UK postcodes (e.g. NR6 6NN, SW1A 1AA, MK45 4RP)
    addr = addr.replace(/(?:,\s*|\s+)\b[a-zA-Z]{1,2}\d[a-zA-Z0-9]?\s*\d[a-zA-Z]{2}\b/gi, "");
    // Canadian postcodes (e.g. M5V 2T6)
    addr = addr.replace(/(?:,\s*|\s+)\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/gi, "");
    // Dutch postcodes (e.g. 1012 JS)
    addr = addr.replace(/(?:,\s*|\s+)\b\d{4}\s*[A-Z]{2}\b/gi, "");
    // Hyphenated postal codes attached to city/locality (e.g. Ghaziabad-201010 or Delhi - 110091)
    addr = addr.replace(/(?:,\s*|\s*)-\s*\d{5,6}\b/g, "");
    // Labeled postal codes (e.g. PIN: 201010, ZIP: 90210)
    addr = addr.replace(/(?:,\s*|\s+)\b(?:postal\s+code|postcode|zip\s*code|zip|pincode|pin)\s*:?\s*\b\d{5,6}\b/gi, "");
    // Postal code at end of string or preceding a country name (protecting units/boxes/suites/numbers)
    addr = addr.replace(/(?<!\b(?:box|suite|ste|number|no|kb|room|rm|apt|unit|building|bldg|sector|house|fl|floor|lot|plot)\s+)(?:,\s*|\s+)\b\d{5,6}\b(?=\s*(?:,|$|\b(?:india|usa|united states|taiwan|malaysia|singapore|china|australia|canada)\b))/gi, "");
    // Leading detached postal code (e.g. "413, Taichung City...")
    addr = addr.replace(/^\b\d{3,6}\b,\s*/, "");
    // Trailing 5-digit US zip with optional 4-digit extension at end of string
    addr = addr.replace(/(?<!\b(?:box|suite|ste|number|no|kb|room|rm|apt|unit|building|bldg|sector|house|fl|floor|lot|plot)\s+)(?:,\s*|\s+)\b\d{5}(?:-\d{4})?\s*$/, "");

    // 6. Remove country names at the end of the address (protecting "Western Australia" and "South Australia")
    addr = addr.replace(/(?:,\s*|\s+)\b(?!(?:Australia)\b(?<=Western\s+Australia|South\s+Australia))(?:Afghanistan|Albania|Algeria|Andorra|Angola|Argentina|Armenia|(?<!\bWestern\s+|\bSouth\s+)Australia|Austria|Azerbaijan|Bahamas|Bahrain|Bangladesh|Barbados|Belarus|Belgium|Belize|Benin|Bhutan|Bolivia|Bosnia|Botswana|Brazil|Brunei|Bulgaria|Burkina Faso|Burundi|Cambodia|Cameroon|Canada|Cape Verde|Central African Republic|Chad|Chile|China|Colombia|Comoros|Congo|Costa Rica|Croatia|Cuba|Cyprus|Czech Republic|Denmark|Djibouti|Dominica|Dominican Republic|East Timor|Ecuador|Egypt|El Salvador|Equatorial Guinea|Eritrea|Estonia|Ethiopia|Fiji|Finland|France|Gabon|Gambia|Georgia|Germany|Ghana|Greece|Grenada|Guatemala|Guinea|Guyana|Haiti|Honduras|Hungary|Iceland|India|Indonesia|Iran|Iraq|Ireland|Israel|Italy|Ivory Coast|Jamaica|Japan|Jordan|Kazakhstan|Kenya|Kiribati|Kuwait|Kyrgyzstan|Laos|Latvia|Lebanon|Lesotho|Liberia|Libya|Liechtenstein|Lithuania|Luxembourg|Macedonia|Madagascar|Malawi|Malaysia|Maldives|Mali|Malta|Marshall Islands|Mauritania|Mauritius|Mexico|Micronesia|Moldova|Monaco|Mongolia|Montenegro|Morocco|Mozambique|Myanmar|Namibia|Nauru|Nepal|Netherlands|New Zealand|Nicaragua|Niger|Nigeria|North Korea|Norway|Oman|Pakistan|Palau|Panama|Papua New Guinea|Paraguay|Peru|Philippines|Poland|Portugal|Qatar|Romania|Russia|Rwanda|Saint Kitts and Nevis|Saint Lucia|Saint Vincent|Samoa|San Marino|Saudi Arabia|Senegal|Serbia|Seychelles|Sierra Leone|Singapore|Slovakia|Slovenia|Solomon Islands|Somalia|South Africa|South Korea|South Sudan|Spain|Sri Lanka|Sudan|Suriname|Swaziland|Sweden|Switzerland|Syria|Taiwan|Tajikistan|Tanzania|Thailand|Togo|Tonga|Trinidad and Tobago|Tunisia|Turkey|Turkmenistan|Tuvalu|Uganda|Ukraine|United Arab Emirates|UAE|United Kingdom|UK|U\.K\.|United States|United States of America|USA|U\.S\.A\.|Uruguay|Uzbekistan|Vanuatu|Vatican City|Venezuela|Vietnam|Yemen|Zambia|Zimbabwe)\s*$/i, "");

    // Remove trailing unwanted punctuation at the end of the entire address
    addr = addr.replace(/,\s*,/g, ",").replace(/[,;.\-:]+$/, "").trim();

    // Separate missing space after thoroughfare words/abbreviations like "Jl.KM" -> "Jl. KM" or "Jalan.kilometer" -> "Jalan kilometer"
    addr = addr.replace(/\b(jalan|jln?|road|rd|street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl)\.(?=[A-Za-z])/gi, "$1 ");
    // Expand "Km" / "Km." -> "Kilometer" only when immediately followed by a number (e.g. "Km 606" -> "Kilometer 606")
    addr = addr.replace(/\bkm\.?(?=\s+\d)/gi, "Kilometer");

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
          const s = (suffix === ".") ? "" : suffix;
          return prefix + UNITS[lower] + s;
        }

        // 4. Contextual Thoroughfare Expansion (e.g., Rd -> Road, St -> Street, Ave -> Avenue)
        if (THOROUGHFARES[lower]) {
          const s = (suffix === ".") ? "" : suffix;
          return prefix + THOROUGHFARES[lower] + s;
        }

        // 5. Contextual Directional Expansion (e.g., N -> North, SW -> Southwest)
        if (DIRECTIONALS[lower]) {
          const s = (suffix === ".") ? "" : suffix;
          return prefix + DIRECTIONALS[lower] + s;
        }

        // 6. Default to intelligent Title Case preserving alphanumeric IDs and numbers
        return prefix + titleCaseToken(coreToken) + suffix;
      });

      return normalizedTokens.join(" ");
    });

    // Rejoin segments with original commas
    let result = normalizedSegments.filter(Boolean).join(", ");

    // Clean up spacing around punctuation while preserving tight hyphens (like Barton-Le-Clay) and spaced hyphens (like Phase - II)
    result = result.replace(/\s*,\s*/g, ", ")
                   .replace(/([a-zA-Z]{2,})(?:\s+-\s*|\s*-\s+)([a-zA-Z0-9]+)/g, "$1 - $2")
                   .replace(/\s+/g, " ")
                   .replace(/[,;.\-:]+$/, "")
                   .trim();

    // Always strip artificial "Number " before slash unit/street numbers (e.g. "Number 6/97" -> "6/97", "Number 4/95" -> "4/95")
    result = result.replace(/\bNumber\s+(\d+\s*\/\s*\d+)/gi, "$1");

    // Strip unwanted leading "Number " before pure street numbers or hyphenated numbers (e.g. "Number 12900 - 87th Avenue" -> "12900 - 87th Avenue")
    // ONLY keep "Number" if the original raw address explicitly contained "no." or "no"
    const hadExplicitNo = /\bno\.?\b/i.test(rawAddress);
    if (!hadExplicitNo) {
      result = result.replace(/^Number\s+(\d+\s*[-–—]\s*\d+)/i, "$1")
                     .replace(/^Number\s+(\d+\s+[A-Za-z])/i, "$1");
    }

    // Expand common Canadian province abbreviations (without inserting any commas)
    result = result.replace(/\bBC\b/gi, "British Columbia");

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
