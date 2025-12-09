/**
 * Location Cleaner
 *
 * Removes phone numbers and other noise from location strings.
 * Handles contaminated locations like "New York\n +1-212-558-3960" -> "New York"
 */

// Phone patterns to detect and remove from locations
const PHONE_PATTERNS = [
  /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,  // US formats
  /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,  // International
  /\d{10}/g  // Plain 10 digits
];

// Email pattern to detect and remove
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Common noise patterns in location fields
const NOISE_PATTERNS = [
  /\bPhone:?\s*/gi,
  /\bTel:?\s*/gi,
  /\bFax:?\s*/gi,
  /\bEmail:?\s*/gi,
  /\bOffice:?\s*/gi
];

/**
 * Clean a location string by removing phones, emails, and noise
 * @param {string} location - Original location (potentially contaminated)
 * @param {string[]} knownPhones - Array of known phone numbers for this contact
 * @returns {Object} - { cleaned, removedNoise, isMultiLocation, locations }
 */
function cleanLocation(location, knownPhones = []) {
  if (!location || typeof location !== 'string') {
    return {
      cleaned: null,
      removedNoise: [],
      isMultiLocation: false,
      locations: []
    };
  }

  let cleaned = location.trim();
  const removedNoise = [];

  // Normalize known phones for comparison
  const normalizedKnownPhones = knownPhones.map(p => normalizePhoneForComparison(p));

  // Remove phone numbers
  for (const pattern of PHONE_PATTERNS) {
    const matches = cleaned.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Check if this matches a known phone
        const normalizedMatch = normalizePhoneForComparison(match);
        const isKnownPhone = normalizedKnownPhones.some(kp =>
          normalizedMatch.includes(kp) || kp.includes(normalizedMatch)
        );

        if (isKnownPhone || matches.length > 0) {
          removedNoise.push(`phone: ${match}`);
        }

        cleaned = cleaned.replace(match, ' ');
      }
    }
  }

  // Remove emails
  const emailMatches = cleaned.match(EMAIL_PATTERN);
  if (emailMatches) {
    for (const match of emailMatches) {
      removedNoise.push(`email: ${match}`);
      cleaned = cleaned.replace(match, ' ');
    }
  }

  // Remove noise labels
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Check for multi-location BEFORE cleaning whitespace (preserve newlines)
  const locations = extractMultipleLocations(cleaned);
  const isMultiLocation = locations.length > 1;

  // Clean up whitespace and newlines
  cleaned = cleanWhitespace(cleaned);

  // If multi-location, use first location as primary
  if (isMultiLocation) {
    cleaned = locations[0];
  }

  // Validate cleaned location
  if (!isValidLocation(cleaned)) {
    cleaned = null;
  }

  return {
    cleaned,
    removedNoise,
    isMultiLocation,
    locations
  };
}

/**
 * Extract multiple locations from a single string
 * @param {string} location - Location string
 * @returns {string[]} - Array of locations
 */
function extractMultipleLocations(location) {
  if (!location) return [];

  // Split by common separators
  const separators = /[\n;|,](?!\s*\d)/; // Don't split on comma before numbers (addresses)
  const parts = location.split(separators)
    .map(s => s.trim())
    .filter(s => s.length > 0 && isValidLocation(s));

  // If no valid splits, return original as single location
  if (parts.length === 0 && isValidLocation(location)) {
    return [location];
  }

  return parts;
}

/**
 * Normalize phone for comparison (remove all formatting)
 * @param {string} phone - Phone string
 * @returns {string} - Digits only
 */
function normalizePhoneForComparison(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Clean whitespace and formatting artifacts
 * @param {string} str - String to clean
 * @returns {string}
 */
function cleanWhitespace(str) {
  return str
    .replace(/\n/g, ' ')       // Newlines to spaces
    .replace(/\r/g, '')        // Remove carriage returns
    .replace(/\s+/g, ' ')      // Multiple spaces to single
    .trim();
}

/**
 * Validate location format
 * @param {string} location - Location to validate
 * @returns {boolean}
 */
function isValidLocation(location) {
  if (!location || typeof location !== 'string') return false;
  if (location.length < 2 || location.length > 200) return false;

  // Must contain at least one letter (not just numbers/symbols)
  if (!/[a-zA-Z]/.test(location)) return false;

  // Must not be just a phone number
  const digitsOnly = location.replace(/\D/g, '');
  if (digitsOnly.length >= 10 && digitsOnly.length <= 12) {
    // Likely a phone number, not a location
    return false;
  }

  return true;
}

/**
 * Check if location contains phone numbers
 * @param {string} location - Location to check
 * @returns {boolean}
 */
function hasPhoneInLocation(location) {
  if (!location) return false;

  for (const pattern of PHONE_PATTERNS) {
    if (pattern.test(location)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract phone from location if present
 * @param {string} location - Location string
 * @returns {string|null} - Extracted phone or null
 */
function extractPhoneFromLocation(location) {
  if (!location) return null;

  for (const pattern of PHONE_PATTERNS) {
    const match = location.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

module.exports = {
  cleanLocation,
  extractMultipleLocations,
  hasPhoneInLocation,
  extractPhoneFromLocation,
  isValidLocation,
  PHONE_PATTERNS,
  EMAIL_PATTERN,
  NOISE_PATTERNS
};
