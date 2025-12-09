/**
 * Title Extractor
 *
 * Extracts and normalizes professional titles from various sources.
 * Handles titles embedded in names, profile page semantic HTML, and text patterns.
 */

const { extractTitleFromName, normalizeTitle } = require('./name-cleaner');

// Title patterns for extraction from text
const TITLE_PATTERNS_TEXT = [
  // Role patterns
  /\b(Senior\s+Partner|Managing\s+Partner|Founding\s+Partner)\b/i,
  /\b(Senior\s+Associate|Junior\s+Associate)\b/i,
  /\b(Senior\s+Counsel|Special\s+Counsel|General\s+Counsel|Of\s+Counsel)\b/i,
  /\b(Partner|Associate|Counsel)\b/i,
  /\b(Chair|Co-Chair|Vice\s+Chair)\b/i,
  /\b(Director|Managing\s+Director)\b/i,
  /\b(Principal|Senior\s+Principal)\b/i,

  // Practice area leaders
  /\b(Practice\s+Group\s+(?:Leader|Chair|Head))\b/i,
  /\b((?:Department|Section)\s+(?:Chair|Head))\b/i,
  /\b(Co-Chair,?\s+\w+(?:\s+\w+)*\s+Practice)\b/i
];

// Common title normalizations
const TITLE_NORMALIZATION_MAP = {
  'partner': 'Partner',
  'senior partner': 'Senior Partner',
  'managing partner': 'Managing Partner',
  'founding partner': 'Founding Partner',
  'associate': 'Associate',
  'senior associate': 'Senior Associate',
  'junior associate': 'Junior Associate',
  'counsel': 'Counsel',
  'of counsel': 'Of Counsel',
  'special counsel': 'Special Counsel',
  'general counsel': 'General Counsel',
  'senior counsel': 'Senior Counsel',
  'chair': 'Chair',
  'co-chair': 'Co-Chair',
  'vice chair': 'Vice Chair',
  'director': 'Director',
  'managing director': 'Managing Director',
  'principal': 'Principal',
  'senior principal': 'Senior Principal'
};

/**
 * Extract title from multiple sources with priority
 * @param {string} name - Name field (may have embedded title)
 * @param {Object} profileData - Data extracted from profile page
 * @returns {Object} - { title, source, confidence }
 */
function extractTitle(name, profileData = {}) {
  // Priority 1: Profile page semantic HTML
  if (profileData.title) {
    return {
      title: normalizeExtractedTitle(profileData.title),
      source: 'profile-html',
      confidence: 'high'
    };
  }

  // Priority 2: Profile page structured data
  if (profileData.structuredData && profileData.structuredData.jobTitle) {
    return {
      title: normalizeExtractedTitle(profileData.structuredData.jobTitle),
      source: 'profile-structured-data',
      confidence: 'high'
    };
  }

  // Priority 3: Extract from name field
  if (name) {
    const nameTitle = extractTitleFromName(name);
    if (nameTitle) {
      return {
        title: nameTitle,
        source: 'name-field',
        confidence: 'medium'
      };
    }
  }

  // Priority 4: Text patterns in profile bio/description
  if (profileData.bio) {
    const bioTitle = extractTitleFromText(profileData.bio);
    if (bioTitle) {
      return {
        title: bioTitle,
        source: 'profile-bio',
        confidence: 'low'
      };
    }
  }

  return {
    title: null,
    source: null,
    confidence: null
  };
}

/**
 * Extract title from free text
 * @param {string} text - Text to search
 * @returns {string|null} - Extracted title or null
 */
function extractTitleFromText(text) {
  if (!text || typeof text !== 'string') return null;

  // Try each pattern
  for (const pattern of TITLE_PATTERNS_TEXT) {
    const match = text.match(pattern);
    if (match) {
      return normalizeExtractedTitle(match[1] || match[0]);
    }
  }

  return null;
}

/**
 * Normalize an extracted title
 * @param {string} title - Raw title
 * @returns {string} - Normalized title
 */
function normalizeExtractedTitle(title) {
  if (!title) return null;

  // Clean up whitespace
  title = title.trim().replace(/\s+/g, ' ');

  // Check normalization map
  const lower = title.toLowerCase();
  if (TITLE_NORMALIZATION_MAP[lower]) {
    return TITLE_NORMALIZATION_MAP[lower];
  }

  // Title case each word
  return title.replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Check if a string looks like a professional title
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function looksLikeTitle(text) {
  if (!text || typeof text !== 'string') return false;

  const lower = text.toLowerCase().trim();

  // Check against known titles
  if (TITLE_NORMALIZATION_MAP[lower]) return true;

  // Check against patterns
  for (const pattern of TITLE_PATTERNS_TEXT) {
    if (pattern.test(text)) return true;
  }

  return false;
}

/**
 * Compare two titles for equivalence
 * @param {string} title1 - First title
 * @param {string} title2 - Second title
 * @returns {boolean} - True if equivalent
 */
function titlesMatch(title1, title2) {
  if (!title1 || !title2) return false;

  const normalized1 = normalizeExtractedTitle(title1);
  const normalized2 = normalizeExtractedTitle(title2);

  return normalized1 === normalized2;
}

/**
 * Parse complex title strings (e.g., "Partner, Co-Chair Litigation")
 * @param {string} title - Complex title string
 * @returns {Object} - { primary, secondary, roles }
 */
function parseComplexTitle(title) {
  if (!title) {
    return {
      primary: null,
      secondary: null,
      roles: []
    };
  }

  // Split by comma or semicolon
  const parts = title.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0);

  if (parts.length === 0) {
    return {
      primary: null,
      secondary: null,
      roles: []
    };
  }

  return {
    primary: normalizeExtractedTitle(parts[0]),
    secondary: parts.length > 1 ? normalizeExtractedTitle(parts[1]) : null,
    roles: parts.map(p => normalizeExtractedTitle(p))
  };
}

module.exports = {
  extractTitle,
  extractTitleFromText,
  normalizeExtractedTitle,
  looksLikeTitle,
  titlesMatch,
  parseComplexTitle,
  TITLE_PATTERNS_TEXT,
  TITLE_NORMALIZATION_MAP
};
