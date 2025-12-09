/**
 * Noise Detector
 *
 * Detects duplicate data, UI elements, and formatting artifacts
 * that have leaked into contact fields.
 */

// UI element patterns that should not appear in contact data
const UI_PATTERNS = [
  /^(View|Edit|Delete|Save|Cancel|Close|Submit)\s*/i,
  /\b(Click\s+here|Read\s+more|Learn\s+more|See\s+more)\b/i,
  /\b(Loading|Please\s+wait)\b/i,
  /^(Menu|Home|Back|Next|Previous)\s*/i,
  /\b(Sign\s+in|Log\s+in|Register|Sign\s+up)\b/i
];

// Label patterns that should be stripped
const LABEL_PATTERNS = [
  /^(Email|E-mail):?\s*/i,
  /^(Phone|Tel|Telephone):?\s*/i,
  /^(Fax):?\s*/i,
  /^(Address|Location|Office):?\s*/i,
  /^(Name):?\s*/i,
  /^(Title|Position|Role):?\s*/i,
  /^(Bio|About|Description):?\s*/i
];

// Phone pattern for cross-field detection
const PHONE_PATTERN = /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

// Email pattern for cross-field detection
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Detect noise in a field value
 * @param {string} fieldName - Name of the field (email, phone, name, etc.)
 * @param {string} value - Value to check
 * @param {Object} allFields - All fields for cross-reference
 * @returns {Object} - { hasNoise, noiseItems, cleanValue }
 */
function detectNoise(fieldName, value, allFields = {}) {
  if (!value || typeof value !== 'string') {
    return {
      hasNoise: false,
      noiseItems: [],
      cleanValue: value
    };
  }

  const noiseItems = [];
  let cleanValue = value.trim();

  // Check for UI elements
  for (const pattern of UI_PATTERNS) {
    if (pattern.test(cleanValue)) {
      noiseItems.push({
        type: 'ui_element',
        pattern: pattern.toString(),
        matched: cleanValue.match(pattern)?.[0]
      });
    }
  }

  // Check for labels (only if not the appropriate field)
  for (const pattern of LABEL_PATTERNS) {
    const match = cleanValue.match(pattern);
    if (match) {
      cleanValue = cleanValue.replace(pattern, '').trim();
      noiseItems.push({
        type: 'label',
        pattern: pattern.toString(),
        matched: match[0]
      });
    }
  }

  // Cross-field duplicate detection
  const crossFieldNoise = detectCrossFieldDuplicates(fieldName, cleanValue, allFields);
  if (crossFieldNoise.length > 0) {
    noiseItems.push(...crossFieldNoise);

    // Remove cross-field duplicates from value
    for (const item of crossFieldNoise) {
      if (item.value) {
        cleanValue = cleanValue.replace(item.value, '').trim();
      }
    }
  }

  // Clean up formatting artifacts
  const formattingNoise = detectFormattingArtifacts(cleanValue);
  if (formattingNoise.length > 0) {
    noiseItems.push(...formattingNoise);
    cleanValue = cleanFormattingArtifacts(cleanValue);
  }

  return {
    hasNoise: noiseItems.length > 0,
    noiseItems,
    cleanValue: cleanValue.length > 0 ? cleanValue : null
  };
}

/**
 * Detect data that appears in multiple fields
 * @param {string} fieldName - Current field name
 * @param {string} value - Current field value
 * @param {Object} allFields - All fields for cross-reference
 * @returns {Array} - Noise items detected
 */
function detectCrossFieldDuplicates(fieldName, value, allFields) {
  const noise = [];

  // Skip if checking phone or email field itself
  if (fieldName === 'phone') {
    // Check if phone appears in non-phone fields
    return noise;
  }

  if (fieldName === 'email') {
    // Check if email appears in non-email fields
    return noise;
  }

  // Check for phone number in non-phone fields
  if (fieldName !== 'phone' && allFields.phone) {
    const phoneMatch = value.match(PHONE_PATTERN);
    if (phoneMatch) {
      const foundPhone = phoneMatch[0];
      const knownPhone = normalizePhone(allFields.phone);
      const foundNormalized = normalizePhone(foundPhone);

      // Check if it's the same phone (duplicate)
      if (knownPhone === foundNormalized || knownPhone.includes(foundNormalized) || foundNormalized.includes(knownPhone)) {
        noise.push({
          type: 'duplicate_phone',
          field: 'phone',
          value: foundPhone,
          message: `Phone "${foundPhone}" duplicated from phone field`
        });
      }
    }
  }

  // Check for email in non-email fields
  if (fieldName !== 'email' && allFields.email) {
    const emailMatch = value.match(EMAIL_PATTERN);
    if (emailMatch) {
      const foundEmail = emailMatch[0].toLowerCase();
      const knownEmail = allFields.email.toLowerCase();

      if (foundEmail === knownEmail) {
        noise.push({
          type: 'duplicate_email',
          field: 'email',
          value: emailMatch[0],
          message: `Email "${emailMatch[0]}" duplicated from email field`
        });
      }
    }
  }

  return noise;
}

/**
 * Detect formatting artifacts
 * @param {string} value - Value to check
 * @returns {Array} - Formatting artifacts found
 */
function detectFormattingArtifacts(value) {
  const artifacts = [];

  // Check for excessive newlines
  if ((value.match(/\n/g) || []).length > 2) {
    artifacts.push({
      type: 'excessive_newlines',
      count: (value.match(/\n/g) || []).length
    });
  }

  // Check for excessive whitespace
  if (/\s{3,}/.test(value)) {
    artifacts.push({
      type: 'excessive_whitespace',
      matched: value.match(/\s{3,}/)?.[0]
    });
  }

  // Check for HTML entities
  if (/&[a-z]+;|&#\d+;/i.test(value)) {
    artifacts.push({
      type: 'html_entities',
      matched: value.match(/&[a-z]+;|&#\d+;/gi)
    });
  }

  // Check for HTML tags
  if (/<[^>]+>/.test(value)) {
    artifacts.push({
      type: 'html_tags',
      matched: value.match(/<[^>]+>/g)
    });
  }

  return artifacts;
}

/**
 * Clean formatting artifacts from value
 * @param {string} value - Value to clean
 * @returns {string} - Cleaned value
 */
function cleanFormattingArtifacts(value) {
  if (!value) return value;

  return value
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize phone for comparison
 * @param {string} phone - Phone to normalize
 * @returns {string} - Digits only
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Check if value contains only noise (no useful data)
 * @param {string} value - Value to check
 * @returns {boolean}
 */
function isOnlyNoise(value) {
  if (!value || typeof value !== 'string') return true;

  // Check against all UI patterns
  for (const pattern of UI_PATTERNS) {
    if (pattern.test(value)) {
      const withoutMatch = value.replace(pattern, '').trim();
      if (withoutMatch.length < 2) return true;
    }
  }

  // Check against label patterns
  let cleaned = value;
  for (const pattern of LABEL_PATTERNS) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  return cleaned.length < 2;
}

/**
 * Get a summary of noise types found in a contact
 * @param {Object} contact - Contact with all fields
 * @returns {Object} - Summary of noise by field
 */
function summarizeContactNoise(contact) {
  const summary = {};
  const fields = ['name', 'email', 'phone', 'location', 'title', 'bio'];

  for (const field of fields) {
    if (contact[field]) {
      const result = detectNoise(field, contact[field], contact);
      if (result.hasNoise) {
        summary[field] = {
          noiseCount: result.noiseItems.length,
          noiseTypes: result.noiseItems.map(n => n.type),
          cleanValue: result.cleanValue
        };
      }
    }
  }

  return summary;
}

module.exports = {
  detectNoise,
  detectCrossFieldDuplicates,
  detectFormattingArtifacts,
  cleanFormattingArtifacts,
  isOnlyNoise,
  summarizeContactNoise,
  UI_PATTERNS,
  LABEL_PATTERNS,
  PHONE_PATTERN,
  EMAIL_PATTERN
};
