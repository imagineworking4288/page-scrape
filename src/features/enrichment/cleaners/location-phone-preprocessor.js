/**
 * Location-Phone Preprocessor
 *
 * Parses mixed location/phone strings from profile pages and structures
 * US vs international data. Prioritizes US locations and phone numbers.
 *
 * Example input: "Frankfurt+49-69-4272-5200New York+1-212-558-4000"
 * Example output:
 *   location: "New York"
 *   phone: "+1-212-558-4000"
 *   alternateLocation: "Frankfurt"
 *   alternatePhone: "+49-69-4272-5200"
 */

// US city rankings (1 = highest priority)
const US_CITY_RANKINGS = {
  'New York': 1,
  'New York City': 1,
  'NYC': 1,
  'Los Angeles': 2,
  'LA': 2,
  'Chicago': 3,
  'San Francisco': 4,
  'SF': 4,
  'Washington, D.C.': 5,
  'Washington D.C.': 5,
  'Washington': 5,
  'D.C.': 5,
  'DC': 5,
  'Boston': 6,
  'Houston': 7,
  'Miami': 8,
  'Seattle': 9,
  'Austin': 10
};

// Pattern to detect phone numbers in location strings
// Matches: +1-212-558-3960, +49-69-4272-5200, etc.
const PHONE_IN_LOCATION_PATTERN = /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{3,4}[-.\s]?\d{4}/g;

// US phone number pattern (starts with +1)
const US_PHONE_PATTERN = /^\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/;

// Pattern to split location-phone pairs
// Captures: city name followed by phone number
const LOCATION_PHONE_SPLIT_PATTERN = /([A-Za-z\s.,'-]+?)(\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{3,4}[-.\s]?\d{4})/g;

class LocationPhonePreprocessor {
  constructor(logger = null) {
    this.logger = logger;
  }

  /**
   * Safe logger helper - checks if logger exists before calling
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Message to log
   */
  _log(level, message) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message);
    } else if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info(message);
    }
  }

  /**
   * Check if location string needs preprocessing
   * @param {string} location - Location string to check
   * @returns {boolean} - True if location contains phone numbers
   */
  needsPreprocessing(location) {
    if (!location || typeof location !== 'string') {
      return false;
    }
    // Check if location contains a phone number pattern
    PHONE_IN_LOCATION_PATTERN.lastIndex = 0;
    return PHONE_IN_LOCATION_PATTERN.test(location);
  }

  /**
   * Main entry point - preprocess contact's location and phone data
   * @param {Object} contact - Contact object with location and phone fields
   * @returns {Object} - Modified contact with structured location/phone + alternates
   */
  preprocessLocationPhone(contact) {
    if (!contact) {
      return contact;
    }

    const rawLocation = contact.location;
    const existingPhone = contact.phone;

    // Check if preprocessing is needed
    if (!this.needsPreprocessing(rawLocation)) {
      return contact;
    }

    try {
      // Parse location string into location-phone pairs
      const pairs = this.parseLocationPhoneString(rawLocation);

      if (pairs.length === 0) {
        // Parsing failed - return unchanged
        this._log('debug', `[LocationPhonePreprocessor] No pairs extracted from: "${rawLocation}"`);
        return contact;
      }

      // Categorize into US vs international
      const categorized = this.categorizeLocationPhone(pairs);

      // Select primary location and phone (US priority)
      const result = this.selectPrimaryAndAlternates(categorized, existingPhone);

      // Build preprocessed contact
      const preprocessedContact = { ...contact };

      // Set primary location and phone
      if (result.primaryLocation) {
        preprocessedContact.location = result.primaryLocation;
      }
      if (result.primaryPhone) {
        preprocessedContact.phone = this.normalizePhone(result.primaryPhone);
      }

      // Set alternate fields only if they have values
      if (result.alternateLocations.length > 0) {
        preprocessedContact.alternateLocation = result.alternateLocations.join(', ');
      }
      if (result.alternatePhones.length > 0) {
        preprocessedContact.alternatePhone = result.alternatePhones
          .map(p => this.normalizePhone(p))
          .join('; ');
      }

      // Add preprocessing metadata
      if (!preprocessedContact._enrichment) {
        preprocessedContact._enrichment = {};
      }
      preprocessedContact._enrichment.locationPhonePreprocessed = true;
      preprocessedContact._enrichment.preprocessingDetails = {
        originalLocation: rawLocation,
        originalPhone: existingPhone,
        pairsFound: pairs.length,
        usLocationsFound: categorized.usData.length,
        internationalLocationsFound: categorized.internationalData.length
      };

      this._log('debug', `[LocationPhonePreprocessor] Preprocessed ${contact.name || 'Unknown'}: ` +
        `location="${preprocessedContact.location}", phone="${preprocessedContact.phone}", ` +
        `alternateLocation="${preprocessedContact.alternateLocation || 'none'}", ` +
        `alternatePhone="${preprocessedContact.alternatePhone || 'none'}"`);

      return preprocessedContact;

    } catch (error) {
      this._log('error', `[LocationPhonePreprocessor] Error preprocessing: ${error.message}`);
      return contact; // Return unchanged on error
    }
  }

  /**
   * Parse mixed location/phone string into location-phone pairs
   * @param {string} rawLocation - Raw location string
   * @returns {Array<{location: string, phone: string}>} - Array of pairs
   */
  parseLocationPhoneString(rawLocation) {
    if (!rawLocation || typeof rawLocation !== 'string') {
      return [];
    }

    const pairs = [];

    // Normalize: replace newlines with empty string to handle "New York\n+1-212..."
    let normalized = rawLocation
      .replace(/\r\n/g, '')
      .replace(/\n/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Try to match location-phone pairs
    LOCATION_PHONE_SPLIT_PATTERN.lastIndex = 0;
    let match;

    while ((match = LOCATION_PHONE_SPLIT_PATTERN.exec(normalized)) !== null) {
      const location = match[1].trim();
      const phone = match[2].trim();

      if (location && phone) {
        pairs.push({ location, phone });
      }
    }

    // If no pairs found with pattern, try alternative parsing
    if (pairs.length === 0) {
      // Try splitting by phone patterns
      const phones = normalized.match(PHONE_IN_LOCATION_PATTERN);
      if (phones && phones.length > 0) {
        // Extract locations by removing phones from string
        let remaining = normalized;
        for (const phone of phones) {
          remaining = remaining.replace(phone, '|||PHONE|||');
        }

        const locationParts = remaining.split('|||PHONE|||')
          .map(s => s.trim())
          .filter(s => s.length > 0 && /[A-Za-z]/.test(s));

        // Pair locations with phones in order
        for (let i = 0; i < Math.min(locationParts.length, phones.length); i++) {
          pairs.push({
            location: locationParts[i],
            phone: phones[i]
          });
        }
      }
    }

    return pairs;
  }

  /**
   * Categorize location-phone pairs into US vs international
   * @param {Array<{location: string, phone: string}>} pairs - Location-phone pairs
   * @returns {{usData: Array, internationalData: Array}}
   */
  categorizeLocationPhone(pairs) {
    const usData = [];
    const internationalData = [];

    for (const pair of pairs) {
      const isUSPhone = this.isUSPhone(pair.phone);
      const usRank = this.getUSCityRank(pair.location);

      if (isUSPhone || usRank !== null) {
        usData.push({
          ...pair,
          rank: usRank !== null ? usRank : 999, // Unranked US cities get low priority
          isUSPhone
        });
      } else {
        internationalData.push(pair);
      }
    }

    // Sort US data by rank (lower = higher priority)
    usData.sort((a, b) => a.rank - b.rank);

    return { usData, internationalData };
  }

  /**
   * Select primary location/phone and collect alternates
   * @param {{usData: Array, internationalData: Array}} categorized - Categorized data
   * @param {string} existingPhone - Contact's existing phone (if any)
   * @returns {Object} - { primaryLocation, primaryPhone, alternateLocations, alternatePhones }
   */
  selectPrimaryAndAlternates(categorized, existingPhone) {
    const result = {
      primaryLocation: null,
      primaryPhone: null,
      alternateLocations: [],
      alternatePhones: []
    };

    const { usData, internationalData } = categorized;

    // Priority 1: Highest-ranked US location with US phone
    if (usData.length > 0) {
      // Use highest-ranked US location as primary
      result.primaryLocation = usData[0].location;
      result.primaryPhone = usData[0].phone;

      // Remaining US locations/phones become alternates
      for (let i = 1; i < usData.length; i++) {
        result.alternateLocations.push(usData[i].location);
        result.alternatePhones.push(usData[i].phone);
      }

      // International data also becomes alternates
      for (const intl of internationalData) {
        result.alternateLocations.push(intl.location);
        result.alternatePhones.push(intl.phone);
      }
    }
    // Priority 2: Only international data available
    else if (internationalData.length > 0) {
      // Use first international location as primary
      result.primaryLocation = internationalData[0].location;
      result.primaryPhone = internationalData[0].phone;

      // Remaining international become alternates
      for (let i = 1; i < internationalData.length; i++) {
        result.alternateLocations.push(internationalData[i].location);
        result.alternatePhones.push(internationalData[i].phone);
      }
    }

    // If we already have an existing US phone and it's not in our results,
    // and we selected a non-US phone, prefer the existing US phone
    if (existingPhone && this.isUSPhone(existingPhone) && !this.isUSPhone(result.primaryPhone)) {
      // Swap: existing US phone becomes primary, selected phone becomes alternate
      if (result.primaryPhone) {
        result.alternatePhones.unshift(result.primaryPhone);
      }
      result.primaryPhone = existingPhone;
    }

    return result;
  }

  /**
   * Check if phone is a US phone number
   * @param {string} phone - Phone number
   * @returns {boolean}
   */
  isUSPhone(phone) {
    if (!phone || typeof phone !== 'string') {
      return false;
    }
    // Normalize phone for comparison
    const normalized = phone.replace(/\s/g, '');
    return US_PHONE_PATTERN.test(normalized) || normalized.startsWith('+1');
  }

  /**
   * Get US city ranking (null if not a ranked US city)
   * @param {string} location - Location string
   * @returns {number|null} - Rank (1-10) or null
   */
  getUSCityRank(location) {
    if (!location || typeof location !== 'string') {
      return null;
    }

    const normalized = location.trim();

    // Check exact match first
    if (US_CITY_RANKINGS[normalized] !== undefined) {
      return US_CITY_RANKINGS[normalized];
    }

    // Check case-insensitive match
    const lowerLocation = normalized.toLowerCase();
    for (const [city, rank] of Object.entries(US_CITY_RANKINGS)) {
      if (city.toLowerCase() === lowerLocation) {
        return rank;
      }
      // Check if location contains the city name
      if (lowerLocation.includes(city.toLowerCase())) {
        return rank;
      }
    }

    return null;
  }

  /**
   * Normalize phone number to consistent format
   * @param {string} phone - Phone number
   * @returns {string} - Normalized phone
   */
  normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') {
      return phone;
    }

    // Extract digits and country code
    const trimmed = phone.trim();

    // If already well-formatted, return as-is
    if (/^\+\d{1,3}-\d{2,4}-\d{3,4}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    // For US phones, format to +1-XXX-XXX-XXXX
    if (trimmed.startsWith('+1')) {
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length === 11) {
        return `+1-${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
      }
    }

    // For international phones, preserve general format
    return trimmed;
  }
}

module.exports = LocationPhonePreprocessor;
