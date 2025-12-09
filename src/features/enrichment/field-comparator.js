/**
 * Field Comparator
 *
 * Implements the decision algorithm for comparing original vs profile data.
 * Determines the appropriate action (ENRICHED, VALIDATED, CLEANED, REPLACED, etc.)
 * for each field based on comparison logic.
 */

const cleaners = require('./cleaners');

/**
 * Compare and merge original field with profile field
 * @param {string|null} originalField - Original value from scrape
 * @param {string|null} profileField - Value from profile page
 * @param {string} fieldName - Name of the field (email, phone, name, etc.)
 * @param {Object} contact - Full contact object for cross-reference
 * @returns {Object} - ComparisonResult
 */
function compareAndMerge(originalField, profileField, fieldName, contact = {}) {
  // Normalize inputs
  const original = normalizeValue(originalField);
  const profile = normalizeValue(profileField);

  // 1. ENRICHMENT: Original missing, profile has data
  if (!original && profile) {
    return {
      value: profile,
      action: 'ENRICHED',
      confidence: 'high',
      originalValue: null,
      extracted: null,
      removedNoise: null,
      flag: null,
      needsReview: false
    };
  }

  // 2. Both missing - nothing to do
  if (!original && !profile) {
    return {
      value: null,
      action: 'UNCHANGED',
      confidence: null,
      originalValue: null,
      extracted: null,
      removedNoise: null,
      flag: null,
      needsReview: false
    };
  }

  // 3. VALIDATION: Exact match (case-insensitive for email)
  if (valuesMatch(original, profile, fieldName)) {
    return {
      value: original,
      action: 'VALIDATED',
      confidence: 'high',
      originalValue: null,
      extracted: null,
      removedNoise: null,
      flag: null,
      needsReview: false
    };
  }

  // 4. Profile missing, keep original
  if (original && !profile) {
    return {
      value: original,
      action: 'UNCHANGED',
      confidence: 'medium',
      originalValue: null,
      extracted: null,
      removedNoise: null,
      flag: null,
      needsReview: false
    };
  }

  // 5. CLEANING: Check if original is contaminated
  const contamination = checkContamination(original, profile, fieldName, contact);
  if (contamination.isContaminated) {
    return {
      value: contamination.cleanValue || profile,
      action: 'CLEANED',
      confidence: 'high',
      originalValue: original,
      extracted: contamination.extracted,
      removedNoise: contamination.removedNoise,
      flag: null,
      needsReview: false
    };
  }

  // 6. NOISE REMOVAL: Check if extra data is duplicate
  const noiseResult = cleaners.detectNoise(fieldName, original, contact);
  if (noiseResult.hasNoise) {
    return {
      value: profile || noiseResult.cleanValue,
      action: 'CLEANED',
      confidence: 'medium',
      originalValue: original,
      extracted: null,
      removedNoise: noiseResult.noiseItems.map(n => n.value || n.matched || n.type),
      flag: null,
      needsReview: false
    };
  }

  // 7. ENRICHMENT: Profile more detailed (original is substring of profile)
  if (profile && original && profile.toLowerCase().includes(original.toLowerCase())) {
    return {
      value: profile,
      action: 'ENRICHED',
      confidence: 'medium',
      originalValue: original,
      extracted: null,
      removedNoise: null,
      flag: null,
      needsReview: false
    };
  }

  // 8. ENRICHMENT: Original more detailed (profile is substring of original - keep original)
  if (original && profile && original.toLowerCase().includes(profile.toLowerCase())) {
    return {
      value: original,
      action: 'VALIDATED',
      confidence: 'medium',
      originalValue: null,
      extracted: null,
      removedNoise: null,
      flag: null,
      needsReview: false
    };
  }

  // 9. MISMATCH: Complete disagreement - profile wins (source of truth)
  if (original && profile && !valuesMatch(original, profile, fieldName)) {
    return {
      value: profile,
      action: 'REPLACED',
      confidence: 'low',
      originalValue: original,
      extracted: null,
      removedNoise: null,
      flag: `${fieldName}_mismatch`,
      needsReview: true
    };
  }

  // 10. Default: keep original
  return {
    value: original,
    action: 'UNCHANGED',
    confidence: 'medium',
    originalValue: null,
    extracted: null,
    removedNoise: null,
    flag: null,
    needsReview: false
  };
}

/**
 * Normalize a value for comparison
 * @param {*} value - Value to normalize
 * @returns {string|null}
 */
function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return String(value);
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Check if two values match (considering field type)
 * @param {string} original - Original value
 * @param {string} profile - Profile value
 * @param {string} fieldName - Field name
 * @returns {boolean}
 */
function valuesMatch(original, profile, fieldName) {
  if (!original || !profile) return false;

  // Case-insensitive for email
  if (fieldName === 'email') {
    return original.toLowerCase() === profile.toLowerCase();
  }

  // Normalize phone for comparison
  if (fieldName === 'phone') {
    const originalDigits = original.replace(/\D/g, '');
    const profileDigits = profile.replace(/\D/g, '');
    // Compare last 10 digits (ignore country code differences)
    const originalLast10 = originalDigits.slice(-10);
    const profileLast10 = profileDigits.slice(-10);
    return originalLast10 === profileLast10;
  }

  // Case-sensitive comparison for other fields
  return original === profile;
}

/**
 * Check if original value is contaminated
 * @param {string} original - Original value
 * @param {string} profile - Profile value (expected clean version)
 * @param {string} fieldName - Field name
 * @param {Object} contact - Full contact for cross-reference
 * @returns {Object} - { isContaminated, cleanValue, extracted, removedNoise }
 */
function checkContamination(original, profile, fieldName, contact) {
  const result = {
    isContaminated: false,
    cleanValue: null,
    extracted: null,
    removedNoise: []
  };

  if (!original) return result;

  // Name field: check for embedded title
  if (fieldName === 'name') {
    if (cleaners.hasEmbeddedTitle(original)) {
      const cleaned = cleaners.cleanName(original, contact.title || profile);
      if (cleaned.wasContaminated) {
        return {
          isContaminated: true,
          cleanValue: cleaned.cleaned,
          extracted: { title: cleaned.extractedTitle },
          removedNoise: [cleaned.extractedTitle]
        };
      }
    }
  }

  // Location field: check for phone numbers
  if (fieldName === 'location') {
    if (cleaners.hasPhoneInLocation(original)) {
      const knownPhones = contact.phone ? [contact.phone] : [];
      const cleaned = cleaners.cleanLocation(original, knownPhones);
      if (cleaned.removedNoise.length > 0) {
        return {
          isContaminated: true,
          cleanValue: cleaned.cleaned,
          extracted: null,
          removedNoise: cleaned.removedNoise
        };
      }
    }
  }

  // Check if original contains profile value plus extra noise
  if (profile && original.includes(profile) && original.length > profile.length) {
    const extra = original.replace(profile, '').trim();
    if (extra.length > 0) {
      return {
        isContaminated: true,
        cleanValue: profile,
        extracted: null,
        removedNoise: [extra]
      };
    }
  }

  return result;
}

/**
 * Calculate overall confidence for a set of comparisons
 * @param {Object} comparisons - Object with field comparisons
 * @returns {string} - 'high', 'medium', or 'low'
 */
function calculateOverallConfidence(comparisons) {
  const confidenceLevels = Object.values(comparisons)
    .map(c => c.confidence)
    .filter(c => c !== null);

  if (confidenceLevels.length === 0) return 'low';

  const highCount = confidenceLevels.filter(c => c === 'high').length;
  const lowCount = confidenceLevels.filter(c => c === 'low').length;

  if (lowCount > confidenceLevels.length / 2) return 'low';
  if (highCount > confidenceLevels.length / 2) return 'high';
  return 'medium';
}

/**
 * Build field confidence object from comparisons
 * @param {Object} comparisons - Object with field comparisons
 * @returns {Object} - Field name to confidence mapping
 */
function buildFieldConfidences(comparisons) {
  const confidences = {};
  for (const [field, comparison] of Object.entries(comparisons)) {
    if (comparison.confidence) {
      confidences[field] = comparison.confidence;
    }
  }
  return confidences;
}

/**
 * Count actions by type from comparisons
 * @param {Object} comparisons - Object with field comparisons
 * @returns {Object} - Action counts
 */
function countActions(comparisons) {
  const counts = {
    ENRICHED: 0,
    VALIDATED: 0,
    CLEANED: 0,
    REPLACED: 0,
    UNCHANGED: 0
  };

  for (const comparison of Object.values(comparisons)) {
    if (comparison.action && counts.hasOwnProperty(comparison.action)) {
      counts[comparison.action]++;
    }
  }

  return counts;
}

/**
 * Get flags from comparisons
 * @param {Object} comparisons - Object with field comparisons
 * @returns {string[]} - Array of flags
 */
function getFlags(comparisons) {
  return Object.values(comparisons)
    .map(c => c.flag)
    .filter(f => f !== null);
}

/**
 * Check if any comparison needs manual review
 * @param {Object} comparisons - Object with field comparisons
 * @returns {boolean}
 */
function needsManualReview(comparisons) {
  return Object.values(comparisons).some(c => c.needsReview);
}

/**
 * Compare all fields between original contact and profile data
 * @param {Object} originalContact - Original scraped contact
 * @param {Object} profileData - Data extracted from profile
 * @returns {Object} - Field-by-field comparisons
 */
function compareAllFields(originalContact, profileData) {
  const fields = ['name', 'email', 'phone', 'title', 'location', 'bio'];
  const comparisons = {};

  for (const field of fields) {
    comparisons[field] = compareAndMerge(
      originalContact[field],
      profileData[field],
      field,
      originalContact
    );
  }

  return comparisons;
}

/**
 * Apply comparisons to create enriched contact
 * @param {Object} originalContact - Original contact
 * @param {Object} comparisons - Field comparisons
 * @param {Object} profileData - Profile data (for new fields)
 * @returns {Object} - Enriched contact
 */
function applyComparisons(originalContact, comparisons, profileData) {
  const enriched = { ...originalContact };

  // Apply comparison results
  for (const [field, comparison] of Object.entries(comparisons)) {
    enriched[field] = comparison.value;
  }

  // Add any extracted data (e.g., title extracted from name)
  for (const [field, comparison] of Object.entries(comparisons)) {
    if (comparison.extracted) {
      for (const [extractedField, extractedValue] of Object.entries(comparison.extracted)) {
        if (!enriched[extractedField]) {
          enriched[extractedField] = extractedValue;
        }
      }
    }
  }

  // Add new fields from profile that weren't in original
  const newFields = ['bio', 'education', 'practiceAreas', 'barAdmissions'];
  for (const field of newFields) {
    if (profileData[field] && !originalContact[field]) {
      enriched[field] = profileData[field];
    }
  }

  return enriched;
}

module.exports = {
  compareAndMerge,
  compareAllFields,
  applyComparisons,
  normalizeValue,
  valuesMatch,
  checkContamination,
  calculateOverallConfidence,
  buildFieldConfidences,
  countActions,
  getFlags,
  needsManualReview
};
