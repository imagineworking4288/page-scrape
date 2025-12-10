/**
 * Multi-Location Handler
 *
 * Parses multi-location data from contact fields and prioritizes
 * locations based on configurable rules (US priority by default).
 */

class MultiLocationHandler {
  constructor(logger) {
    this.logger = logger;

    // US states (all 50 + DC)
    this.usStates = new Set([
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
    ]);

    // Major US cities for detection
    this.usCities = new Set([
      'New York', 'Washington', 'Los Angeles', 'Chicago', 'Houston',
      'Philadelphia', 'Phoenix', 'San Antonio', 'San Diego', 'Dallas',
      'San Jose', 'Austin', 'Jacksonville', 'San Francisco', 'Boston',
      'Seattle', 'Denver', 'Miami', 'Atlanta', 'Portland', 'Las Vegas',
      'Detroit', 'Memphis', 'Nashville', 'Baltimore', 'Charlotte'
    ]);

    // Phone country codes
    this.phoneCountryCodes = {
      '1': 'US',
      '44': 'UK',
      '49': 'Germany',
      '33': 'France',
      '81': 'Japan',
      '86': 'China',
      '852': 'Hong Kong',
      '65': 'Singapore',
      '61': 'Australia',
      '91': 'India'
    };
  }

  /**
   * Safe logger helper
   * @param {string} level - Log level
   * @param {string} message - Message to log
   */
  _log(level, message) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message);
    }
  }

  /**
   * Parse multi-location data from raw location string
   * @param {string} rawLocation - Raw location field value
   * @param {string} primaryPhone - Primary phone number
   * @param {boolean} prioritizeUS - Whether to prioritize US locations
   * @returns {Object} - Parsed location data
   */
  parse(rawLocation, primaryPhone, prioritizeUS = true) {
    if (!rawLocation) {
      return {
        isMultiLocation: false,
        primaryLocation: null,
        primaryPhone: primaryPhone,
        additionalLocations: [],
        allLocations: [],
        locationData: {},
        rawLocation: null
      };
    }

    try {
      // Step 1: Split into segments
      const segments = this.splitLocationSegments(rawLocation);
      this._log('debug', `[MultiLocationHandler] Split into ${segments.length} segments`);

      // Step 2: Parse into location-phone pairs
      const locationPairs = this.parseLocationPairs(segments, primaryPhone);
      this._log('debug', `[MultiLocationHandler] Found ${locationPairs.length} location pairs`);

      // Step 3: Prioritize locations
      const prioritized = this.prioritizeLocations(locationPairs, prioritizeUS);

      // Step 4: Build result
      const result = {
        isMultiLocation: locationPairs.length > 1,
        primaryLocation: prioritized[0]?.location || null,
        primaryPhone: prioritized[0]?.phone || primaryPhone,
        additionalLocations: prioritized.slice(1).map(p => p.location),
        allLocations: prioritized.map(p => p.location),
        locationData: this.buildLocationData(prioritized),
        rawLocation
      };

      if (result.isMultiLocation) {
        this._log('info', `[MultiLocationHandler] Multi-location detected: ${result.allLocations.join(', ')}`);
      }

      return result;
    } catch (error) {
      this._log('error', `[MultiLocationHandler] Error parsing location: ${error.message}`);
      return {
        isMultiLocation: false,
        primaryLocation: rawLocation,
        primaryPhone: primaryPhone,
        additionalLocations: [],
        allLocations: [rawLocation],
        locationData: {},
        rawLocation
      };
    }
  }

  /**
   * Split raw location into segments
   * @param {string} rawLocation - Raw location string
   * @returns {string[]} - Array of segments
   */
  splitLocationSegments(rawLocation) {
    return rawLocation
      .split(/\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Parse segments into location-phone pairs
   * @param {string[]} segments - Array of segments
   * @param {string} primaryPhone - Primary phone number
   * @returns {Array} - Array of {location, phone} pairs
   */
  parseLocationPairs(segments, primaryPhone) {
    const pairs = [];
    let currentPhone = null;
    let pendingLocation = null;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Check if segment is a phone number
      if (this.isPhoneNumber(segment)) {
        currentPhone = segment;

        // If we have a pending location, associate this phone with it
        if (pendingLocation) {
          pairs.push({ location: pendingLocation, phone: currentPhone });
          pendingLocation = null;
        }
      }
      // Check if segment contains embedded phone number
      else if (this.hasEmbeddedPhone(segment)) {
        const phoneMatch = segment.match(/(\+\d+[\d\s\-\(\)]+)/);
        const location = segment.replace(/\+\d+[\d\s\-\(\)]+/g, '').trim();

        if (location && this.looksLikeLocation(location)) {
          pairs.push({ location, phone: phoneMatch[1] });
        }
      }
      // Segment looks like a location
      else if (this.looksLikeLocation(segment)) {
        // If we have a pending location without phone, add it with last known phone
        if (pendingLocation) {
          pairs.push({ location: pendingLocation, phone: currentPhone });
        }
        pendingLocation = segment;
      }
    }

    // Handle any remaining pending location
    if (pendingLocation) {
      pairs.push({ location: pendingLocation, phone: currentPhone || primaryPhone });
    }

    // If no pairs found, use the raw location
    if (pairs.length === 0 && segments.length > 0) {
      const firstLocation = segments.find(s => this.looksLikeLocation(s));
      if (firstLocation) {
        pairs.push({ location: firstLocation, phone: primaryPhone });
      }
    }

    return pairs;
  }

  /**
   * Check if string is a phone number
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  isPhoneNumber(text) {
    const cleaned = text.replace(/[\s\-\(\)]/g, '');
    return /^\+?\d{7,15}$/.test(cleaned);
  }

  /**
   * Check if string contains embedded phone number
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  hasEmbeddedPhone(text) {
    return /\+\d+[\d\s\-\(\)]{7,}/.test(text);
  }

  /**
   * Check if text looks like a location
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  looksLikeLocation(text) {
    // Must have at least one letter
    if (!/[a-zA-Z]/.test(text)) return false;

    // Must not be mostly numbers
    const digitCount = (text.match(/\d/g) || []).length;
    if (digitCount > text.length / 2) return false;

    // Common location patterns
    const patterns = [
      /^[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*$/,  // "New York", "Frankfurt"
      /^[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*,\s*[A-Z]{2}$/,  // "New York, NY", "Austin, TX"
      /Washington,?\s*D\.?C\.?/i,          // "Washington, D.C."
      /^St\.\s+[A-Z][a-z]+/,               // "St. Louis"
    ];

    return patterns.some(p => p.test(text));
  }

  /**
   * Prioritize locations based on rules
   * @param {Array} locationPairs - Array of {location, phone} pairs
   * @param {boolean} prioritizeUS - Whether to prioritize US locations
   * @returns {Array} - Sorted array of location pairs
   */
  prioritizeLocations(locationPairs, prioritizeUS) {
    if (!prioritizeUS || locationPairs.length <= 1) {
      return locationPairs;
    }

    const usLocations = [];
    const intlLocations = [];

    for (const pair of locationPairs) {
      if (this.isUSLocation(pair.location, pair.phone)) {
        usLocations.push(pair);
      } else {
        intlLocations.push(pair);
      }
    }

    this._log('debug', `[MultiLocationHandler] Found ${usLocations.length} US locations, ${intlLocations.length} international`);
    return [...usLocations, ...intlLocations];
  }

  /**
   * Check if location is in the US
   * @param {string} location - Location name
   * @param {string} phone - Associated phone number
   * @returns {boolean}
   */
  isUSLocation(location, phone) {
    // Method 1: Check phone country code
    if (phone) {
      const countryCode = this.extractCountryCode(phone);
      if (countryCode === '1') return true;
      if (countryCode && countryCode !== '1') return false;
    }

    // Method 2: Check for US state abbreviations
    const stateMatch = location.match(/,\s*([A-Z]{2})\b/);
    if (stateMatch && this.usStates.has(stateMatch[1])) return true;

    // Method 3: Check for "Washington, D.C."
    if (location.match(/Washington,?\s*D\.?C\.?/i)) return true;

    // Method 4: Check for known US cities
    for (const city of this.usCities) {
      if (location.includes(city)) return true;
    }

    return false;
  }

  /**
   * Extract country code from phone number
   * @param {string} phone - Phone number
   * @returns {string|null} - Country code or null
   */
  extractCountryCode(phone) {
    if (!phone) return null;

    const cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // Try common prefixes (longest first)
    const prefixes = ['852', '44', '49', '91', '86', '81', '65', '61', '33', '1'];
    for (const prefix of prefixes) {
      if (cleaned.startsWith(`+${prefix}`)) return prefix;
    }

    return null;
  }

  /**
   * Build location data map
   * @param {Array} prioritized - Prioritized location pairs
   * @returns {Object} - Map of location to data
   */
  buildLocationData(prioritized) {
    const data = {};

    for (let i = 0; i < prioritized.length; i++) {
      const pair = prioritized[i];
      const countryCode = this.extractCountryCode(pair.phone);
      const country = countryCode ? this.phoneCountryCodes[countryCode] : null;

      data[pair.location] = {
        phone: pair.phone,
        countryCode,
        country,
        isPrimary: i === 0
      };
    }

    return data;
  }
}

module.exports = MultiLocationHandler;
