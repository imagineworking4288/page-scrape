/**
 * Name Cleaner
 *
 * Removes title suffixes from names and extracts titles separately.
 * Handles contaminated names like "Arthur S. AdlerPartner" -> "Arthur S. Adler"
 */

// Title patterns to detect and remove from names
const TITLE_PATTERNS = [
  // Common legal titles (order matters - longer patterns first)
  /\s*(Senior\s+Partner|Managing\s+Partner|Senior\s+Associate|Senior\s+Counsel)$/i,
  /\s*(Of\s+Counsel|Special\s+Counsel|General\s+Counsel)$/i,
  /\s*(Co-Chair|Vice\s+Chair|Chair)$/i,
  /\s*(Partner|Associate|Counsel)$/i,

  // Without space prefix (concatenated)
  /(Senior\s*Partner|Managing\s*Partner|Senior\s*Associate|Senior\s*Counsel)$/i,
  /(Of\s*Counsel|Special\s*Counsel|General\s*Counsel)$/i,
  /(Co-Chair|Vice\s*Chair|Chair)$/i,
  /(Partner|Associate|Counsel)$/i
];

// Title normalization map
const TITLE_NORMALIZATION = {
  'partner': 'Partner',
  'senior partner': 'Senior Partner',
  'managing partner': 'Managing Partner',
  'associate': 'Associate',
  'senior associate': 'Senior Associate',
  'counsel': 'Counsel',
  'of counsel': 'Of Counsel',
  'special counsel': 'Special Counsel',
  'general counsel': 'General Counsel',
  'senior counsel': 'Senior Counsel',
  'chair': 'Chair',
  'co-chair': 'Co-Chair',
  'vice chair': 'Vice Chair'
};

/**
 * Clean a name by removing embedded titles
 * @param {string} name - Original name (potentially contaminated)
 * @param {string|null} profileTitle - Title from profile page (for validation)
 * @returns {Object} - { cleaned, extractedTitle, wasContaminated }
 */
function cleanName(name, profileTitle = null) {
  if (!name || typeof name !== 'string') {
    return {
      cleaned: null,
      extractedTitle: null,
      wasContaminated: false
    };
  }

  let cleaned = name.trim();
  let extractedTitle = null;
  let wasContaminated = false;

  // Try each pattern
  for (const pattern of TITLE_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      // Extract the matched title
      const matchedTitle = match[1] || match[0];
      extractedTitle = normalizeTitle(matchedTitle.trim());

      // Remove the title from the name
      cleaned = cleaned.replace(pattern, '').trim();
      wasContaminated = true;
      break;
    }
  }

  // If profile title provided, validate/prefer it
  if (profileTitle && !extractedTitle) {
    extractedTitle = normalizeTitle(profileTitle);
  } else if (profileTitle && extractedTitle) {
    // Use profile title if different (profile is source of truth)
    const normalizedProfile = normalizeTitle(profileTitle);
    if (normalizedProfile !== extractedTitle) {
      extractedTitle = normalizedProfile;
    }
  }

  // Final cleanup
  cleaned = cleanWhitespace(cleaned);

  // Validate cleaned name
  if (!isValidName(cleaned)) {
    // If cleaning made name invalid, return original
    return {
      cleaned: name.trim(),
      extractedTitle: extractedTitle,
      wasContaminated: false
    };
  }

  return {
    cleaned,
    extractedTitle,
    wasContaminated
  };
}

/**
 * Normalize a title string
 * @param {string} title - Raw title
 * @returns {string} - Normalized title
 */
function normalizeTitle(title) {
  if (!title) return null;

  const lower = title.toLowerCase().trim();
  return TITLE_NORMALIZATION[lower] || capitalizeWords(title.trim());
}

/**
 * Capitalize first letter of each word
 * @param {string} str - String to capitalize
 * @returns {string}
 */
function capitalizeWords(str) {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Clean whitespace and formatting artifacts
 * @param {string} str - String to clean
 * @returns {string}
 */
function cleanWhitespace(str) {
  return str
    .replace(/\s+/g, ' ')      // Multiple spaces to single
    .replace(/\n/g, ' ')       // Newlines to spaces
    .replace(/\r/g, '')        // Remove carriage returns
    .trim();
}

/**
 * Validate name format
 * @param {string} name - Name to validate
 * @returns {boolean}
 */
function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length < 2 || name.length > 100) return false;
  if (!/^[A-Z]/.test(name)) return false; // Must start with capital

  // Must be mostly alphabetic with allowed punctuation
  const alphaCount = (name.match(/[a-zA-Z]/g) || []).length;
  const totalLength = name.replace(/\s/g, '').length;
  if (alphaCount / totalLength < 0.7) return false;

  return true;
}

/**
 * Extract title from a name if embedded (without cleaning)
 * @param {string} name - Name to check
 * @returns {string|null} - Extracted title or null
 */
function extractTitleFromName(name) {
  if (!name || typeof name !== 'string') return null;

  for (const pattern of TITLE_PATTERNS) {
    const match = name.match(pattern);
    if (match) {
      return normalizeTitle((match[1] || match[0]).trim());
    }
  }

  return null;
}

/**
 * Check if name contains an embedded title
 * @param {string} name - Name to check
 * @returns {boolean}
 */
function hasEmbeddedTitle(name) {
  if (!name || typeof name !== 'string') return false;

  for (const pattern of TITLE_PATTERNS) {
    if (pattern.test(name)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  cleanName,
  normalizeTitle,
  extractTitleFromName,
  hasEmbeddedTitle,
  isValidName,
  TITLE_PATTERNS,
  TITLE_NORMALIZATION
};
