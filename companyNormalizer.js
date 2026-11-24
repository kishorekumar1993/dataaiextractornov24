/**
 * CompanyNormalizer Module
 * Deterministic normalization and expansion for corporate company names:
 * 1. Resolves abbreviations into complete official legal forms (e.g. Co., Ltd. -> Company, Limited).
 * 2. Expands internal business/industry descriptors (Mfg. -> Manufacturing, Ind. -> Industrial).
 * 3. Removes decorative slogans, website titles, trailing copyright clutter, and brackets.
 * 4. Preserves special characters (&, -, ', /, +) without replacing '&' with 'and'.
 * 5. Applies intelligent Title Case.
 */

const CompanyNormalizer = (() => {
  // Common corporate legal suffixes mapped to their complete expanded form
  const LEGAL_ENTITY_EXPANSIONS = [
    // Multi-part compound types first
    { regex: /\b(?:co\.,?\s*ltd\.?|co\.,ltd\.?|co\s+ltd\.?|co\.\s+ltd)\b/gi, replacement: "Company, Limited" },
    { regex: /\b(?:pvt\.,?\s*ltd\.?|pvt\s+ltd\.?|private\s+ltd\.?)\b/gi, replacement: "Private Limited" },
    { regex: /\b(?:pte\.,?\s*ltd\.?|pte\s+ltd\.?)\b/gi, replacement: "Private Limited" },
    { regex: /\b(?:pty\.,?\s*ltd\.?|pty\s+ltd\.?)\b/gi, replacement: "Proprietary Limited" },
    { regex: /\b(?:sdn\.,?\s*bhd\.?|sdn\s+bhd\.?)\b/gi, replacement: "Sendirian Berhad" },
    { regex: /\b(?:s\.a\.\s+de\s+c\.v\.|sa\s+de\s+cv)\b/gi, replacement: "Sociedad Anónima De Capital Variable" },
    { regex: /\bgmbh\s*&\s*co\.?\s*kg\b/gi, replacement: "Gesellschaft Mit Beschränkter Haftung & Co. KG" },
    
    // Single legal types
    { regex: /\b(?:co\.)(?=\s|$)/gi, replacement: "Company" },
    { regex: /\b(?:ltd\.|ltd)(?=\s|$)/gi, replacement: "Limited" },
    { regex: /\b(?:inc\.|inc)(?=\s|$)/gi, replacement: "Incorporated" },
    { regex: /\b(?:corp\.|corp)(?=\s|$)/gi, replacement: "Corporation" },
    { regex: /\b(?:l\.l\.c\.|llc)(?=\s|$)/gi, replacement: "Limited Liability Company" },
    { regex: /\b(?:l\.l\.p\.|llp)(?=\s|$)/gi, replacement: "Limited Liability Partnership" },
    { regex: /\b(?:p\.l\.c\.|plc)(?=\s|$)/gi, replacement: "Public Limited Company" },
    { regex: /\b(?:bhd\.|bhd)(?=\s|$)/gi, replacement: "Berhad" },
    { regex: /\b(?:gmbh)(?=\s|$)/gi, replacement: "Gesellschaft Mit Beschränkter Haftung" },
    { regex: /\b(?:ag)(?=\s|$)/g, replacement: "Aktiengesellschaft" },
    { regex: /\b(?:s\.a\.r\.l\.|sarl)(?=\s|$)/gi, replacement: "Société À Responsabilité Limitée" },
    { regex: /\b(?:s\.a\.|sa)(?=\s|$)/g, replacement: "Société Anonyme" },
    { regex: /\b(?:s\.a\.s\.|sas)(?=\s|$)/gi, replacement: "Société Par Actions Simplifiée" },
    { regex: /\b(?:s\.p\.a\.|spa)(?=\s|$)/gi, replacement: "Società Per Azioni" },
    { regex: /\b(?:s\.r\.l\.|srl)(?=\s|$)/gi, replacement: "Società A Responsabilità Limitata" },
    { regex: /\b(?:s\.l\.|sl)(?=\s|$)/g, replacement: "Sociedad Limitada" },
    { regex: /\b(?:b\.v\.|bv)(?=\s|$)/gi, replacement: "Besloten Vennootschap" },
    { regex: /\b(?:n\.v\.|nv)(?=\s|$)/gi, replacement: "Naamloze Vennootschap" },
    { regex: /\b(?:k\.k\.)(?=\s|$)/gi, replacement: "Kabushiki Kaisha" }
  ];

  // Industry / descriptive abbreviation expansions
  const INDUSTRY_EXPANSIONS = [
    { regex: /\b(?:mfg\.|mfg)(?=\s|$)/gi, replacement: "Manufacturing" },
    { regex: /\b(?:ind\.|inds\.)(?=\s|$)/gi, replacement: "Industrial" },
    { regex: /\b(?:tech\.|technol\.)(?=\s|$)/gi, replacement: "Technology" },
    { regex: /\b(?:intl\.|int'l)(?=\s|$)/gi, replacement: "International" },
    { regex: /\b(?:grp\.)(?=\s|$)/gi, replacement: "Group" },
    { regex: /\b(?:eng\.|engg\.)(?=\s|$)/gi, replacement: "Engineering" },
    { regex: /\b(?:ent\.|ents\.)(?=\s|$)/gi, replacement: "Enterprises" },
    { regex: /\b(?:sol\.|sols\.)(?=\s|$)/gi, replacement: "Solutions" },
    { regex: /\b(?:sys\.)(?=\s|$)/gi, replacement: "Systems" },
    { regex: /\b(?:serv\.|svc\.|svcs\.)(?=\s|$)/gi, replacement: "Services" },
    { regex: /\b(?:prod\.|prods\.)(?=\s|$)/gi, replacement: "Products" },
    { regex: /\b(?:dev\.)(?=\s|$)/gi, replacement: "Development" },
    { regex: /\b(?:chem\.)(?=\s|$)/gi, replacement: "Chemical" },
    { regex: /\b(?:equip\.|eqpt\.)(?=\s|$)/gi, replacement: "Equipment" }
  ];

  /**
   * Title cases a single token while preserving acronyms and numbers
   */
  function titleCaseToken(token) {
    if (!token) return "";
    // Preserve acronyms of 2-4 uppercase characters (e.g. IBM, BMW, 4C, AG, KG)
    if (token === token.toUpperCase() && token.length <= 4 && /^[A-Z0-9&+-]+$/.test(token)) {
      return token;
    }
    // Alphanumeric with numbers (e.g. 4CPlus, 3D, B2B)
    if (/\d/.test(token)) {
      return token;
    }
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  }

  /**
   * Normalizes a raw company name string
   */
  function normalizeCompanyName(name) {
    if (!name || typeof name !== "string") return "";

    let raw = name.trim();
    if (!raw || raw.toLowerCase() === "not available") return "Not Available";

    // 1. Decode HTML entities
    raw = raw.replace(/&nbsp;/g, " ")
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

    // 2. Strip copyright headers and common trailing clutter
    // e.g. "© 2024 Lamb's Signs Ltd. All rights reserved." -> "Lamb's Signs Ltd"
    raw = raw.replace(/^(?:copyright|\(c\)|©)\s*(?:\d{4})?\s*,?\s*/i, "");
    raw = raw.replace(/\s*(?:all\s+rights?\s+reserved|all\s+right\s+reserved).*$/i, "");
    // Strip trailing slogan or description following a delimiter after a corporate entity
    raw = raw.replace(/\b(?:ltd|limited|inc|incorporated|corp|corporation|llc|llp|gmbh|co|company|pvt\s+ltd|pte\s+ltd|bhd)\b\s*[-|•–—]\s*.*$/i, (match) => {
      return match.replace(/\s*[-|•–—]\s*.*$/, "");
    });
    raw = raw.replace(/\s*[-|•–—]\s*(?:home|official\s+website|welcome|manufacturer|supplier|about\s+us|contact\s+us|products?|services?).*$/i, "");

    // 3. Remove leading labels: "Company Name:", "Name:", "Welcome to "
    raw = raw.replace(/^(?:company\s+name|business\s+name|legal\s+name|name|welcome\s+to)\s*[:\-]?\s*/i, "");

    // 4. Remove brackets around secondary corporate terms, e.g. "Four C Plus (Internet) Company Limited" -> "Four C Plus Internet Company Limited"
    raw = raw.replace(/\(([^)]+)\)/g, " $1 ");
    raw = raw.replace(/\[([^\]]+)\]/g, " $1 ");

    // 5. Expand internal industry and descriptive abbreviations
    for (const item of INDUSTRY_EXPANSIONS) {
      raw = raw.replace(item.regex, item.replacement);
    }

    // 6. Expand legal corporate entity abbreviations
    for (const item of LEGAL_ENTITY_EXPANSIONS) {
      raw = raw.replace(item.regex, item.replacement);
    }

    // Clean multiple spaces and trim
    raw = raw.replace(/[ \t]+/g, " ").trim();

    // 7. Ensure clean comma formatting for Company, Limited
    raw = raw.replace(/\bCompany\s+Limited\b/g, "Company, Limited");
    raw = raw.replace(/\bCompany,\s*,?\s*Limited\b/g, "Company, Limited");

    // 8. Title Case the tokens while preserving special characters
    const words = raw.split(" ");
    const titleCasedWords = words.map(w => {
      // Check if word has attached punctuation
      const m = w.match(/^([("']*)(\S*?)([)"',.]*)$/);
      if (m) {
        const prefix = m[1] || "";
        const core = m[2] || "";
        const suffix = m[3] || "";
        // Special words in German/French/Spanish that stay lower
        const lowerWords = new Set(["de", "mit", "par", "per", "à", "en", "nom"]);
        if (lowerWords.has(core.toLowerCase()) && prefix === "" && suffix === "") {
          return core.toLowerCase();
        }
        return prefix + titleCaseToken(core) + suffix;
      }
      return titleCaseToken(w);
    });

    let result = titleCasedWords.join(" ");

    // 9. Clean up unnecessary trailing punctuation but keep meaningful symbols
    result = result.replace(/[,;.\-:]+$/, "").trim();

    // If company ends with "Company Limited" ensure standard comma: "Company, Limited"
    result = result.replace(/\bCompany\s+Limited\b/g, "Company, Limited");
    result = result.replace(/\bCompany,\s*Limited\b/g, "Company, Limited");

    return result;
  }

  return {
    normalizeCompanyName,
    titleCaseToken
  };
})();

// Export for Node.js / module environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = CompanyNormalizer;
}
