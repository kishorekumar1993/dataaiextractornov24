/**
 * RestrictionValidator Module
 * 
 * Centralized Restriction & Ineligibility Detection Engine for Universal Web Crawler.
 * Evaluates website content, crawled subpages, images (via metadata inspection),
 * online shopping capabilities, and business type eligibility across 20 prohibited categories:
 * 
 *  1. Porn / Adult Content
 *  2. Medicine
 *  3. Medical Equipment
 *  4. Hospital
 *  5. Healthcare
 *  6. Defence
 *  7. Weapons
 *  8. Knives
 *  9. Aircraft
 * 10. Aviation
 * 11. Aerospace
 * 12. Marine
 * 13. Shipbuilding
 * 14. Chemicals
 * 15. Alcohol
 * 16. Tobacco
 * 17. Animals
 * 18. Food
 * 19. Gambling
 * 20. Hacking Services
 * 
 * Design Principles:
 * - Multi-page awareness: checks homepage, About Us, Contact, Products, and other crawled subpages.
 * - Contextual matching: avoids isolated keyword triggers using negative exclusions (e.g. "marine grade steel",
 *   "food processing machinery", "air knife", "chemical resistant coating", "aerospace precision CNC").
 * - Image metadata inspection: analyzes alt, title, src, and surrounding DOM without claiming visual verification.
 * - Online shopping detection across all pages with strict preservation of the Manufacturer exception.
 * - Bounded Manufacturer Exception: prevents manufacturers of prohibited goods from bypassing restrictions.
 * - Centralized QC Validator returning exact status ("Working", "Not Working", "Manual Review"), reasons, and evidence.
 * 
 * Compatibility: Manifest V3 Service Worker, Popup, Content Scripts, and Node.js.
 */

const RestrictionValidator = (() => {
  // Common HTML stripping helpers
  const SCRIPT_STYLE_REGEX = /<(?:script|style|noscript|svg|canvas|iframe|template)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|canvas|iframe|template)>/gi;
  const HTML_TAG_REGEX = /<[^>]+>/g;

  function stripHtml(html) {
    if (!html) return "";
    return html.replace(SCRIPT_STYLE_REGEX, " ")
      .replace(HTML_TAG_REGEX, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Definition of 20 Prohibited Categories ordered from most specific to broad
  const PROHIBITED_CATEGORIES = {
    PORN_ADULT: {
      id: "porn_adult",
      name: "Porn / Adult Content",
      positive: [
        /\b(?:porn|pornography|pornographic|xxx|adult video|sex shop|sex toys?|erotic massage|escort service|adult entertainment|strip club|cam girls?|webcam models?|erotic boutique|bdsm)\b/i,
        /\b(?:hardcore porn|softcore porn|erotic films?|adult dating|adult novelties)\b/i
      ],
      negativeExclusions: [
        /\badult education\b/i,
        /\badult learning\b/i,
        /\badult swimming\b/i,
        /\badult size(?:s)?\b/i,
        /\badult supervision\b/i,
        /\badult dose\b/i
      ],
      reason: "Unpaid Category: Pornographic or adult content website."
    },

    DEFENCE: {
      id: "defence",
      name: "Defence",
      positive: [
        /\b(?:military defense contractors?|military defence contractors?|defense equipment suppliers?|military ordnance|armored military vehicles?|armoured military vehicles?|military combat vehicles?|military tactical gear|electronic warfare systems?|military weapon systems?|armed forces procurement suppliers?|military munitions?|naval defense systems?)\b/i,
        /\b(?:defense systems and military equipment|defence systems and military equipment|defense contractor)\b/i
      ],
      negativeExclusions: [
        /\bdefense against corrosion\b/i,
        /\bdefensive driving\b/i,
        /\bpest defense\b/i,
        /\bcyber defense\b/i,
        /\bnetwork defense\b/i
      ],
      reason: "Unpaid Category: Military defence systems, ordnance, or military contractor."
    },

    WEAPONS: {
      id: "weapons",
      name: "Weapons",
      positive: [
        /\b(?:weapons?|firearms?|guns|rifles?|handguns?|shotguns?|assault weapons?|ammunition|pistols?|submachine guns?|artillery|missile systems?|ballistic armor|body armor|bulletproof vests?|explosive devices?|grenades?|rocket launchers?|weapon optics|sniper scopes?|combat firearms?)\b/i
      ],
      negativeExclusions: [
        /\bglue guns?\b/i,
        /\bheat guns?\b/i,
        /\bspray guns?\b/i,
        /\bgrease guns?\b/i,
        /\bstud welding guns?\b/i,
        /\bbarcode scanner guns?\b/i,
        /\bweapon detection\b/i,
        /\bsecurity screening scanners?\b/i
      ],
      reason: "Unpaid Category: Companies involved in armor, weapons manufacturing, trading, supply, exporting, or repairing services."
    },

    KNIVES: {
      id: "knives",
      name: "Knives",
      positive: [
        /\b(?:combat knives|combat knife|tactical knives|tactical knife|hunting knives|hunting knife|pocket knives|pocket knife|folding knives|folding knife|survival knives|survival knife|switchblades?|bowie knives?|kitchen knives|chef knives?|butcher knives?|culinary cutlery knives?|daggers?|bayonets?)\b/i,
        /\b(?:knife sets?|custom knifemaker|damascus knife|throwing knives?|stiletto knife)\b/i
      ],
      negativeExclusions: [
        /\bindustrial (?:slitting|granulator|machine|guillotine|rotary|pelletizer) knives\b/i,
        /\bmachine knives\b/i,
        /\bslitting knives\b/i,
        /\bgranulator knives\b/i,
        /\bguillotine knives\b/i,
        /\bair kni(?:fe|ves)\b/i,
        /\bkni(?:fe|ves) gate valves?\b/i,
        /\bkni(?:fe|ves) switch(?:es)?\b/i,
        /\bknife sharpener for industrial\b/i
      ],
      reason: "Unpaid Category: Knives, blades, tactical cutlery, or consumer weapon cutlery company."
    },

    MEDICINE: {
      id: "medicine",
      name: "Medicine",
      positive: [
        /\b(?:pharmaceutical drugs?|prescription medicine|otc medicine|tablet formulation|antibiotics?|cough syrup|vaccines?|clinical therapeutics?|pharmacology|medicinal chemistry|chemist shop|pharmacy dispensary|pharmaceutical formulations?|active pharmaceutical ingredients?|api manufacturing)\b/i,
        /\b(?:pharmaceuticals?|medicines?|drug formulation|oral suspension|injectable medicine|analgesic tablets?)\b/i
      ],
      negativeExclusions: [
        /\bmedicine cabinet\b/i,
        /\bpharmaceutical machinery\b/i,
        /\bpharmaceutical packaging (?:machine|equipment|line)\b/i,
        /\btablet (?:press|compression machine|tooling)\b/i,
        /\bcapsule filling machine\b/i,
        /\bcleanroom (?:panels?|equipment|doors?)\b/i
      ],
      reason: "Unpaid Category: Pharmaceutical or medicinal products manufacturer, supplier, or trader."
    },

    MEDICAL_EQUIPMENT: {
      id: "medical_equipment",
      name: "Medical Equipment",
      positive: [
        /\b(?:medical devices?|surgical instruments?|patient monitoring equipment|ultrasound machines?|mri scanners?|x-ray diagnostic systems?|dialysis machines?|defibrillators?|hospital beds?|orthopedic implants?|catheters? supply|endoscopy equipment|ventilators?|surgical supplies?|diagnostic medical equipment|medical disposable supplies?)\b/i,
        /\b(?:stethoscopes?|sphygmomanometers?|infusion pumps?|electrocardiographs?|surgical forceps|scalpels? supply)\b/i
      ],
      negativeExclusions: [
        /\bprecision (?:machining|cnc|parts) for medical\b/i,
        /\bmedical grade (?:silicone|tubing|stainless steel|titanium|polymer|resins?)\b/i,
        /\bmedical industry components?\b/i,
        /\bcontract manufacturing for medical oem\b/i
      ],
      reason: "Unpaid Category: Medical devices or medical equipment manufacturer, supplier, or trader."
    },

    HOSPITAL: {
      id: "hospital",
      name: "Hospital",
      positive: [
        /\b(?:general hospital|acute care hospital|emergency room|hospital clinic|inpatient hospital facility|maternity hospital|children's hospital|psychiatric hospital|trauma center|hospital wards?|admitted to hospital|hospital healthcare center)\b/i,
        /\b(?:our hospital provides|hospital emergency services|hospital inpatient care)\b/i
      ],
      negativeExclusions: [
        /\bhospitality\b/i,
        /\bhospital-grade (?:flooring|lighting|paint|curtains?)\b/i,
        /\bhospital cleanroom\b/i,
        /\bcleanroom panels for hospitals\b/i
      ],
      reason: "Unpaid Category: Hospital or acute clinical facility."
    },

    HEALTHCARE: {
      id: "healthcare",
      name: "Healthcare",
      positive: [
        /\b(?:healthcare clinic|medical practice|urgent care center|physician offices?|nursing homes?|hospice care|home healthcare agency|outpatient care|telemedicine services?|dental clinic|chiropractic clinic|pediatric care clinic|physical therapy clinic|health wellness clinic)\b/i,
        /\b(?:schedule a doctor appointment|our doctors and physicians|patient care services)\b/i
      ],
      negativeExclusions: [
        /\bhealthcare (?:software|saas|it solutions?|data|erp)\b/i,
        /\bppe manufacturer\b/i,
        /\bindustrial safety\b/i
      ],
      reason: "Unpaid Category: Healthcare, clinic, or medical practice service provider."
    },

    AIRCRAFT: {
      id: "aircraft",
      name: "Aircraft",
      positive: [
        /\b(?:aircraft manufacturers?|airplane assembly|commercial aircraft|private jets?|passenger aircraft|cargo planes?|gliders?|ultralight aircraft|helicopters?|aircraft charter|aircraft leasing)\b/i,
        /\b(?:airplanes?|aeroplanes?|rotary aircraft|fixed wing aircraft)\b/i
      ],
      negativeExclusions: [
        /\baircraft grade (?:aluminum|aluminium|titanium|alloys?|steel)\b/i,
        /\baircraft fasteners?\b/i,
        /\baircraft ground support equipment\b/i,
        /\baircraft maintenance tooling\b/i,
        /\bprecision machining for aircraft\b/i
      ],
      reason: "Unpaid Category: Aircraft manufacturing, sales, charter, or assembly company."
    },

    AVIATION: {
      id: "aviation",
      name: "Aviation",
      positive: [
        /\b(?:airline flights?|air passenger transport|book flights online|commercial airlines?|aviation passenger services?|flight schools?|flight academy|airport operations?|air charter operators?|pilot training academy)\b/i,
        /\b(?:passenger airline|scheduled air services)\b/i
      ],
      negativeExclusions: [
        /\baviation fuel filters?\b/i,
        /\baviation grade\b/i,
        /\baviation lighting equipment\b/i,
        /\bground handling equipment for aviation\b/i
      ],
      reason: "Unpaid Category: Airline, aviation passenger transport, or flight services company."
    },

    AEROSPACE: {
      id: "aerospace",
      name: "Aerospace",
      positive: [
        /\b(?:aerospace launch vehicles?|space (?:exploration )?rockets?|spacecraft manufacturing|spacecraft assembly|satellite manufacturing|orbital propulsion|space exploration vehicles?|aerospace missile systems?|space mission systems?|lunar landers?)\b/i,
        /\b(?:space rockets assembly|aerospace payload launch)\b/i
      ],
      negativeExclusions: [
        /\baerospace (?:cnc|precision) machining\b/i,
        /\baerospace grade (?:titanium|aluminum|alloy|materials?|fasteners?)\b/i,
        /\baerospace coating\b/i,
        /\baerospace precision components?\b/i,
        /\bprecision sheet metal for aerospace\b/i,
        /\bas9100\b/i
      ],
      reason: "Unpaid Category: Aerospace, rocket launch, spacecraft, or satellite systems company."
    },

    MARINE: {
      id: "marine",
      name: "Marine",
      positive: [
        /\b(?:marine vessels?|yachts?|motor yachts?|boats?|marine passenger ferry|boat dealerships?|marinas?|marine shipping operators?|cruise lines?|speedboats?|offshore workboats?|tugboats?)\b/i,
        /\b(?:luxury yachts|yacht charter|boat sales and brokerage)\b/i
      ],
      negativeExclusions: [
        /\bmarine grade (?:stainless steel|aluminum|aluminium|plywood|fasteners?|valves?|coatings?|grease|bronze)\b/i,
        /\bmarine 316\b/i,
        /\bmarine pumps? manufacturer\b/i,
        /\bmarine hardware components?\b/i,
        /\bmarine engine parts?\b/i
      ],
      reason: "Unpaid Category: Marine vessels, yachts, boat building, passenger shipping, or marina operations."
    },

    SHIPBUILDING: {
      id: "shipbuilding",
      name: "Shipbuilding",
      positive: [
        /\b(?:shipyards?|shipbuilding and repair|naval shipyards?|dry dock vessel construction|commercial shipbuilders?|ship building|hull construction|shipwrights?|ship building yard)\b/i,
        /\b(?:construction of ships|ship conversion yard)\b/i
      ],
      negativeExclusions: [
        /\bshipbuilding steel plates?\b/i,
        /\bvalves for shipbuilding\b/i,
        /\bshipbuilding cables?\b/i,
        /\bcoatings for shipbuilding\b/i
      ],
      reason: "Unpaid Category: Shipbuilding, shipyard, dry dock, or vessel repair facility."
    },

    CHEMICALS: {
      id: "chemicals",
      name: "Chemicals",
      positive: [
        /\b(?:chemical manufacturers?|industrial chemicals supply|petrochemicals?|solvent manufacturing|inorganic acids?|sulfuric acid|hydrochloric acid|nitric acid|caustic soda|synthetic resins? manufacturing|pesticides? manufacturer|specialty chemicals blending|fertilizer manufacturing|raw chemical distributors?|bulk chemical trading)\b/i,
        /\b(?:production of basic chemicals|chemical synthesis plant)\b/i
      ],
      negativeExclusions: [
        /\bchemical resistant (?:coatings?|valves?|pumps?|linings?|tubing|flooring|plastics?|tanks?)\b/i,
        /\bchemical resistance\b/i,
        /\bchemical storage tanks?\b/i,
        /\bchemical processing (?:equipment|machinery|pumps?|valves?)\b/i,
        /\bchemical fume hoods?\b/i
      ],
      reason: "Unpaid Category: Chemical manufacturer, petrochemical, pesticide, or bulk chemical distributor."
    },

    ALCOHOL: {
      id: "alcohol",
      name: "Alcohol",
      positive: [
        /\b(?:alcoholic beverages?|liquor store|liquor|whiskey|whisky|vodka|beer|beers|wine|wines|spirits|distiller(?:y|ies)|brewer(?:y|ies)|winer(?:y|ies)|craft beer|cider brewery|rum distillery|gin distillery|tequila|bourbon|scotch|champagne|liqueur|alcoholic drinks?|pub and bar)\b/i,
        /\b(?:distillery and brewery|fine wines and spirits)\b/i
      ],
      negativeExclusions: [
        /\bisopropyl alcohol\b/i,
        /\bdenatured alcohol\b/i,
        /\balcohol wipes?\b/i,
        /\balcohol rubbing\b/i,
        /\bbrewery (?:tanks?|equipment|machinery)\b/i,
        /\bbrewing equipment manufacturer\b/i
      ],
      reason: "Unpaid Category: Alcoholic beverage manufacturer, distillery, brewery, winery, or liquor supplier."
    },

    TOBACCO: {
      id: "tobacco",
      name: "Tobacco",
      positive: [
        /\b(?:cigarettes?|tobacco products?|cigar manufacturers?|cigars?|vape shop|e-cigarettes?|vaping products?|nicotine pouches?|rolling tobacco|hookah lounge|shisha tobacco|bidi manufacturing)\b/i,
        /\b(?:tobacco and vape|e-liquids?)\b/i
      ],
      negativeExclusions: [
        /\btobacco curing machinery\b/i,
        /\banti-tobacco\b/i,
        /\btobacco moisture meters?\b/i
      ],
      reason: "Unpaid Category: Tobacco, cigarette, cigar, or vaping product manufacturer, supplier, or trader."
    },

    FOOD: {
      id: "food",
      name: "Food",
      positive: [
        /\b(?:edible food products?|packaged foods?|bakery|restaurant|cafe|catering service|snack foods?|confectionery|dairy products?|processed meats?|frozen foods?|organic groceries|culinary spices?|seasonings?|beverages?|juices?|fresh produce|canned foods?|sauces and condiments|food items?)\b/i,
        /\b(?:delicious food|tasty snacks|gourmet meals|wholesome recipes|food catering|food supply company)\b/i
      ],
      negativeExclusions: [
        /\b(?:alcoholic|brewery|distillery|spirits|whiskey|vodka|wine|beer)\b/i,
        /\bfood processing (?:machinery|equipment|line|plant)\b/i,
        /\bfood packaging (?:machinery|equipment|line)\b/i,
        /\bfood-grade (?:tubing|silicone|stainless steel|conveyor|lubricant|grease|belts?|valves?|pumps?)\b/i,
        /\bconveyor belts for food\b/i,
        /\bfood storage bins?\b/i,
        /\bfood service equipment manufacturing\b/i
      ],
      reason: "Unpaid Category: Food, beverage, restaurant, or edible consumer products company."
    },

    ANIMALS: {
      id: "animals",
      name: "Animals",
      positive: [
        /\b(?:live animals?|pet shop|dog breeding|cat breeding|horse breeding|poultry farming|livestock trading|cattle ranching|pig farming|fish farming|aquaculture of fish|selling puppies|selling kittens|exotic animals?|zoos?|equestrian center)\b/i,
        /\b(?:breeder of dogs|breeder of cats|livestock animals)\b/i
      ],
      negativeExclusions: [
        /\banimal feed (?:machinery|processing|pellet mill)\b/i,
        /\blivestock (?:fencing|housing equipment|feeders?)\b/i,
        /\bveterinary (?:equipment|instruments?|autoclaves?)\b/i,
        /\bpet food packaging (?:machinery|machines?)\b/i,
        /\banimal healthcare software\b/i
      ],
      reason: "Unpaid Category: Live animal breeding, livestock farming, pets, or live animal sales."
    },

    GAMBLING: {
      id: "gambling",
      name: "Gambling",
      positive: [
        /\b(?:online casino|sports betting|sportsbook|gambling|slot machines?|sports wagering|poker online|live dealer roulette|lottery betting|real money gaming|online betting platform)\b/i,
        /\b(?:casino games? online|betting odds|wager real money)\b/i
      ],
      negativeExclusions: [
        /\bcasino chip manufacturing\b/i,
        /\bgaming tokens? stamping\b/i,
        /\bamusement arcade machines?\b/i
      ],
      reason: "Unpaid Category: Online gambling or online gaming website."
    },

    HACKING_SERVICES: {
      id: "hacking_services",
      name: "Hacking Services",
      positive: [
        /\b(?:hacking services?|hire a hacker|crack passwords?|exploit kits?|ddos for hire|malware development|botnet rentals?|bypass security hacking|blackhat hacking|illegal database dumps?)\b/i,
        /\b(?:rent a hacker|password recovery crack service)\b/i
      ],
      negativeExclusions: [
        /\bethical hacking\b/i,
        /\bpenetration testing\b/i,
        /\bcybersecurity (?:auditing|consulting|firm)\b/i,
        /\banti-hacking\b/i,
        /\bhacking defense\b/i
      ],
      reason: "Unpaid Category: Hacking services or hacking information website."
    }
  };

  /**
   * Evaluates text contextually against all 20 prohibited categories.
   * Returns detection results with evidence and confidence score.
   */
  function detectTextRestrictions(text, url = "", pageCategory = "general") {
    if (!text && !url) return null;
    const clean = stripHtml(text || "");
    const lower = clean.toLowerCase();
    const urlLower = (url || "").toLowerCase();

    for (const key of Object.keys(PROHIBITED_CATEGORIES)) {
      const def = PROHIBITED_CATEGORIES[key];

      // 1. Check negative exclusions first
      let excluded = false;
      if (def.negativeExclusions && def.negativeExclusions.length > 0) {
        for (const neg of def.negativeExclusions) {
          if (neg.test(clean)) {
            excluded = true;
            break;
          }
        }
      }
      if (excluded) {
        continue;
      }

      // 2. Check positive matching
      let matchedPattern = null;
      for (const pos of def.positive) {
        const match = clean.match(pos);
        if (match) {
          matchedPattern = match[0];
          break;
        }
      }

      // Also check URL pattern for strong indicators (e.g. adult, casino, weapons)
      if (!matchedPattern && urlLower) {
        if (def.id === "porn_adult" && /\b(porn|xxx|sex-shop|adult-video)\b/i.test(urlLower)) {
          matchedPattern = "URL token: " + urlLower;
        } else if (def.id === "gambling" && /\b(casino|betting|poker|slots)\b/i.test(urlLower)) {
          matchedPattern = "URL token: " + urlLower;
        } else if (def.id === "weapons" && /\b(firearms|guns|weapons|armory)\b/i.test(urlLower)) {
          matchedPattern = "URL token: " + urlLower;
        }
      }

      if (matchedPattern) {
        return {
          categoryId: def.id,
          categoryName: def.name,
          reason: def.reason,
          confidence: "high",
          matchedSnippet: matchedPattern,
          pageCategory: pageCategory,
          sourceUrl: url
        };
      }
    }

    return null;
  }

  /**
   * Inspects all <img> tags in an HTML document across metadata attributes (src, alt, title, class, surrounding DOM).
   * Note: This inspects HTML metadata ONLY and does not perform vision/pixel verification.
   */
  function detectImageRestrictions(html, pageUrl = "") {
    if (!html) {
      return {
        totalImages: 0,
        prohibitedImages: 0,
        cleanImages: 0,
        prohibitedDetails: [],
        allImagesProhibited: false
      };
    }

    const imgTagRegex = /<img\b([^>]*)>/gi;
    let match;
    const allImages = [];

    while ((match = imgTagRegex.exec(html)) !== null) {
      const attrs = match[1];
      const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
      const altMatch = attrs.match(/\balt=["']([^"']+)["']/i);
      const titleMatch = attrs.match(/\btitle=["']([^"']+)["']/i);
      const classMatch = attrs.match(/\bclass=["']([^"']+)["']/i);

      allImages.push({
        rawTag: match[0],
        src: srcMatch ? srcMatch[1] : "",
        alt: altMatch ? altMatch[1] : "",
        title: titleMatch ? titleMatch[1] : "",
        className: classMatch ? classMatch[1] : ""
      });
    }

    const prohibitedDetails = [];

    for (const img of allImages) {
      // Form metadata text for inspection
      const metadataText = [img.alt, img.title, img.className].filter(Boolean).join(" ");
      const srcText = img.src || "";

      // Check text restrictions on metadata text
      let textResult = detectTextRestrictions(metadataText, srcText, "image_metadata");
      if (textResult) {
        prohibitedDetails.push({
          src: img.src,
          alt: img.alt,
          title: img.title,
          category: textResult.categoryName,
          confidence: "high",
          evidence: `[Metadata Inspection] Prohibited category "${textResult.categoryName}" detected via ALT/Title: "${metadataText || textResult.matchedSnippet}"`,
          sourceUrl: pageUrl
        });
        continue;
      }

      // Check filenames only if they have very specific, unambiguous names (never on single ambiguous words)
      const filename = srcText.split("/").pop().split("?")[0].toLowerCase();
      if (
        /\b(?:porn|xxx|handgun|assault-rifle|ammunition|whiskey-bottle|vodka-bottle|cigarette-pack|vape-pod|slot-machine|casino-chips?)\b/i.test(filename)
      ) {
        prohibitedDetails.push({
          src: img.src,
          alt: img.alt,
          title: img.title,
          category: "Prohibited Image Metadata",
          confidence: "medium",
          evidence: `[Metadata Inspection] Prohibited category detected via unambiguous image filename: "${filename}"`,
          sourceUrl: pageUrl
        });
      }
    }

    const totalImages = allImages.length;
    const prohibitedImages = prohibitedDetails.length;
    const cleanImages = Math.max(0, totalImages - prohibitedImages);
    const allImagesProhibited = totalImages > 0 && cleanImages === 0;

    return {
      totalImages,
      prohibitedImages,
      cleanImages,
      prohibitedDetails,
      allImagesProhibited
    };
  }

  /**
   * Online Shopping Detection across all crawled pages.
   * Detects: Add to Cart, Add to Bag, Buy Now, Checkout, Payment Gateway, Shopping Cart.
   */
  function detectOnlineShopping(html, text = "", url = "") {
    if (!html && !text) return { detected: false, signals: [] };

    const stripped = (html || "").replace(SCRIPT_STYLE_REGEX, " ");
    const lowerHtml = stripped.toLowerCase();
    const cleanText = (text || stripHtml(html)).toLowerCase();
    const signals = [];

    // 1. Explicit button text / labels
    if (
      lowerHtml.includes("add to cart") ||
      cleanText.includes("add to cart") ||
      /<button[^>]*>[^<]*add to cart[^<]*<\/button>/i.test(stripped) ||
      /<input[^>]*value=["'][^"']*add to cart[^"']*["']/i.test(stripped)
    ) {
      signals.push("Add to Cart");
    }

    if (
      lowerHtml.includes("add to bag") ||
      cleanText.includes("add to bag") ||
      /<button[^>]*>[^<]*add to bag[^<]*<\/button>/i.test(stripped)
    ) {
      signals.push("Add to Bag");
    }

    if (
      lowerHtml.includes("buy now") ||
      cleanText.includes("buy now") ||
      /<button[^>]*>[^<]*buy now[^<]*<\/button>/i.test(stripped) ||
      /<a[^>]*class=["'][^"']*(?:buy-now|buynow)[^"']*["']/i.test(stripped)
    ) {
      signals.push("Buy Now");
    }

    if (
      (cleanText.includes("checkout") && (cleanText.includes("payment") || cleanText.includes("order total"))) ||
      /<a[^>]*href=["'][^"']*\/(?:checkout|cart\/checkout)["']/i.test(stripped)
    ) {
      signals.push("Checkout");
    }

    if (
      lowerHtml.includes("shopping cart") ||
      cleanText.includes("shopping cart") ||
      /class=["'][^"']*(?:shopping-cart|cart-contents|cart-icon)[^"']*["']/i.test(stripped)
    ) {
      signals.push("Shopping Cart");
    }

    // 2. Payment Gateway integration signals
    if (
      /https:\/\/js\.stripe\.com\/v\d|paypal\.com\/sdk\/js|checkout\.shopify\.com|woocommerce_params|square\.com\/v\d\/paymentform|razorpay\.com\/v\d\/checkout/i.test(html)
    ) {
      signals.push("Payment Gateway");
    }

    return {
      detected: signals.length > 0,
      signals: Array.from(new Set(signals)),
      sourceUrl: url
    };
  }

  /**
   * Centralized Restriction Validator
   * Validates crawled pages, image metadata, and business types against all unpaid rules.
   */
  function validateWebsiteRestrictions({
    crawledPages = [],
    initialHtml = "",
    initialUrl = "",
    finalUrl = "",
    businessType = "",
    traceStatus = null
  }) {
    const evidence = [];

    // Compile all pages for comprehensive inspection
    const pages = [];
    if (initialHtml) {
      pages.push({
        url: finalUrl || initialUrl,
        category: "home",
        html: initialHtml,
        textSnippet: stripHtml(initialHtml)
      });
    }

    if (Array.isArray(crawledPages)) {
      for (const p of crawledPages) {
        const existing = pages.find(e => e.url === p.url);
        if (existing) {
          if (p.textSnippet && p.textSnippet.length > existing.textSnippet.length) {
            existing.textSnippet = p.textSnippet;
          }
          if (p.html && p.html.length > existing.html.length) {
            existing.html = p.html;
          }
        } else {
          pages.push({
            url: p.url,
            category: p.category || "subpage",
            html: p.html || "",
            textSnippet: p.textSnippet || (p.html ? stripHtml(p.html) : "")
          });
        }
      }
    }

    // 1. Text restriction detection across ALL crawled pages
    for (const page of pages) {
      const textMatch = detectTextRestrictions(page.textSnippet, page.url, page.category);
      if (textMatch) {
        evidence.push({
          type: "PROHIBITED_TEXT",
          category: textMatch.categoryName,
          snippet: textMatch.matchedSnippet,
          sourceUrl: page.url,
          pageCategory: page.category
        });

        return {
          websiteStatus: "Not Working",
          restrictionReason: textMatch.reason,
          category: textMatch.categoryName,
          confidence: "high",
          evidence: evidence,
          sourcePage: page.url,
          isEligible: false,
          manualReviewRequired: false
        };
      }
    }

    // 2. Image restriction detection across ALL crawled pages
    let totalImagesAcrossPages = 0;
    let prohibitedImagesAcrossPages = 0;
    let cleanImagesAcrossPages = 0;
    const allProhibitedImageDetails = [];

    for (const page of pages) {
      if (page.html) {
        const imgRes = detectImageRestrictions(page.html, page.url);
        totalImagesAcrossPages += imgRes.totalImages;
        prohibitedImagesAcrossPages += imgRes.prohibitedImages;
        cleanImagesAcrossPages += imgRes.cleanImages;
        if (imgRes.prohibitedDetails.length > 0) {
          allProhibitedImageDetails.push(...imgRes.prohibitedDetails);
        }
      }
    }

    if (totalImagesAcrossPages > 0 && cleanImagesAcrossPages === 0 && prohibitedImagesAcrossPages > 0) {
      // Rule 15: If all images on the site belong to prohibited categories -> Not Working
      return {
        websiteStatus: "Not Working",
        restrictionReason: `Unpaid Category: All identified product images belong to prohibited categories (${allProhibitedImageDetails[0]?.category || 'Disallowed Content'}).`,
        category: "Prohibited Images",
        confidence: "high",
        evidence: allProhibitedImageDetails,
        sourcePage: allProhibitedImageDetails[0]?.sourceUrl || finalUrl,
        isEligible: false,
        manualReviewRequired: false
      };
    }

    // 3. Online shopping detection across ALL crawled pages
    const shoppingSignals = [];
    let shoppingSourceUrl = "";
    for (const page of pages) {
      const shopRes = detectOnlineShopping(page.html, page.textSnippet, page.url);
      if (shopRes.detected) {
        shopRes.signals.forEach(s => shoppingSignals.push(s));
        if (!shoppingSourceUrl) shoppingSourceUrl = page.url;
      }
    }

    const uniqueShoppingSignals = Array.from(new Set(shoppingSignals));
    const isManufacturer = (businessType || "").toLowerCase().includes("manufacturer");

    if (uniqueShoppingSignals.length > 0) {
      if (!isManufacturer) {
        // Non-manufacturer with online selling -> Not Working
        const reason = `Unpaid Category: Non-manufacturer website with online product selling options (${uniqueShoppingSignals.join(", ")}). Only manufacturers with online selling are eligible.`;
        return {
          websiteStatus: "Not Working",
          restrictionReason: reason,
          category: "Online Shopping",
          confidence: "high",
          evidence: [{ type: "ONLINE_SHOPPING", signals: uniqueShoppingSignals, sourceUrl: shoppingSourceUrl }],
          sourcePage: shoppingSourceUrl || finalUrl,
          isEligible: false,
          manualReviewRequired: false
        };
      }
      // If Manufacturer: Allowed to have online shopping for own products (Preserve Manufacturer Exception)
    }

    // 4. Trace Result status preservation (Subdomain, Free Hosting, Non-English, Redirect, Flash)
    if (traceStatus && traceStatus.websiteStatus && traceStatus.websiteStatus !== "Working") {
      return {
        websiteStatus: traceStatus.websiteStatus,
        restrictionReason: traceStatus.nonWorkingReason || "",
        category: traceStatus.websiteStatus,
        confidence: "high",
        evidence: [{ type: "TRACE_CLASSIFICATION", status: traceStatus.websiteStatus, reason: traceStatus.nonWorkingReason }],
        sourcePage: traceStatus.finalUrl || finalUrl,
        isEligible: false,
        manualReviewRequired: Boolean(traceStatus.manualReviewRequired)
      };
    }

    // 5. Eligible Working Site
    return {
      websiteStatus: "Working",
      restrictionReason: "",
      category: "Eligible Commercial Entity",
      confidence: "high",
      evidence: [],
      sourcePage: finalUrl || initialUrl,
      isEligible: true,
      manualReviewRequired: false,
      imageStats: {
        total: totalImagesAcrossPages,
        prohibited: prohibitedImagesAcrossPages,
        clean: cleanImagesAcrossPages
      }
    };
  }

  /**
   * Final QC Validator:
   * Post-extraction gatekeeper ensuring business type rules, prohibited goods, and product counts are completely compliant.
   * Prevents manufacturer exceptions from bypassing unrelated restrictions.
   */
  function validateFinalQC(extractedData, crawledPages = [], options = {}) {
    if (!extractedData) return extractedData;

    const currentStatus = extractedData.websiteStatus || "Working";
    const rawType = String(extractedData.businessType || "").trim();

    // 1. Run full restriction validation across all crawled pages
    const restrictionCheck = validateWebsiteRestrictions({
      crawledPages: crawledPages,
      initialHtml: options.initialHtml || "",
      initialUrl: options.initialUrl || extractedData.websiteName || "",
      finalUrl: options.finalUrl || extractedData.websiteName || "",
      businessType: rawType,
      traceStatus: options.traceStatus || null
    });

    if (restrictionCheck.websiteStatus !== "Working") {
      extractedData.websiteStatus = restrictionCheck.websiteStatus;
      extractedData.notWorkingReason = restrictionCheck.restrictionReason;
      extractedData.nonWorkingReason = restrictionCheck.restrictionReason;
      return extractedData;
    }

    // 2. Rule 4: Business Type Eligibility (Manufacturer to Wholesaler only)
    const ELIGIBLE_TYPES = [
      "manufacturer",
      "industrial services",
      "exporter",
      "trader",
      "distributer",
      "distributor",
      "supplier",
      "wholesaler"
    ];

    const isEligibleType = ELIGIBLE_TYPES.some(t => rawType.toLowerCase().includes(t));
    if (!isEligibleType && currentStatus === "Working") {
      extractedData.websiteStatus = "Not Working";
      const reason = `Ineligible Business Type: "${rawType || 'Other'}". Only businesses from Manufacturer to Wholesaler (Manufacturer, Industrial Services, Exporter, Trader, Distributer, Supplier, Wholesaler) are eligible Working sites; other business types are marked Not Working.`;
      extractedData.notWorkingReason = reason;
      extractedData.nonWorkingReason = reason;
      return extractedData;
    }

    // 3. Prohibited Image exclusion from product count & QC rule compliance
    if (restrictionCheck.imageStats) {
      if (restrictionCheck.imageStats.clean === 0 && restrictionCheck.imageStats.total > 0) {
        extractedData.productImages = "0";
      }
    }

    return extractedData;
  }

  return {
    PROHIBITED_CATEGORIES,
    stripHtml,
    detectTextRestrictions,
    detectImageRestrictions,
    detectOnlineShopping,
    validateWebsiteRestrictions,
    validateFinalQC
  };
})();

// Export for Node.js / module & Service Worker environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = RestrictionValidator;
}
if (typeof self !== "undefined") {
  self.RestrictionValidator = RestrictionValidator;
}
if (typeof globalThis !== "undefined") {
  globalThis.RestrictionValidator = RestrictionValidator;
}
