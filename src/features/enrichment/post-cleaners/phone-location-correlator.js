/**
 * Phone-Location Correlator
 *
 * Validates that phone numbers correlate with their associated locations.
 * Detects mismatches at country and city levels.
 */

class PhoneLocationCorrelator {
  constructor(logger) {
    this.logger = logger;

    // US area codes to major cities
    this.usAreaCodes = {
      '212': 'New York', '646': 'New York', '917': 'New York', '718': 'New York',
      '202': 'Washington', '213': 'Los Angeles', '310': 'Los Angeles',
      '415': 'San Francisco', '312': 'Chicago', '773': 'Chicago',
      '617': 'Boston', '857': 'Boston', '206': 'Seattle',
      '713': 'Houston', '512': 'Austin', '305': 'Miami', '404': 'Atlanta',
      '214': 'Dallas', '602': 'Phoenix', '503': 'Portland', '702': 'Las Vegas'
    };

    this.countryPhonePrefixes = {
      '1': { country: 'US', cities: this.usAreaCodes },
      '44': { country: 'UK', cities: { '20': 'London' } },
      '49': { country: 'Germany', cities: { '30': 'Berlin', '69': 'Frankfurt', '89': 'Munich' } },
      '33': { country: 'France', cities: { '1': 'Paris' } },
      '86': { country: 'China', cities: { '10': 'Beijing', '21': 'Shanghai' } },
      '852': { country: 'Hong Kong', cities: {} },
      '65': { country: 'Singapore', cities: {} },
      '81': { country: 'Japan', cities: { '3': 'Tokyo' } },
      '61': { country: 'Australia', cities: { '2': 'Sydney', '3': 'Melbourne' } },
      '91': { country: 'India', cities: { '11': 'Delhi', '22': 'Mumbai' } }
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
   * Validate phone-location correlation
   * @param {string} phone - Phone number
   * @param {string} location - Location name
   * @param {Object} locationData - Optional location data from MultiLocationHandler
   * @returns {Object} - Validation result
   */
  validate(phone, location, locationData) {
    if (!phone || !location) {
      return { valid: false, hasMismatch: false, reason: 'missing-data' };
    }

    try {
      const countryCode = this.extractCountryCode(phone);
      if (!countryCode) {
        return { valid: false, hasMismatch: false, reason: 'no-country-code' };
      }

      const phoneCountry = this.countryPhonePrefixes[countryCode];
      if (!phoneCountry) {
        return { valid: false, hasMismatch: false, reason: 'unknown-country-code' };
      }

      // Country-level validation
      const locationCountry = this.detectLocationCountry(location, locationData);

      if (locationCountry && locationCountry !== phoneCountry.country) {
        this._log('warn', `[PhoneLocationCorrelator] Country mismatch: phone=${phoneCountry.country}, location=${locationCountry}`);
        return {
          valid: false,
          hasMismatch: true,
          reason: 'country-mismatch',
          details: {
            phoneCountry: phoneCountry.country,
            locationCountry: locationCountry,
            phone,
            location
          }
        };
      }

      // US-specific: Area code to city validation
      if (countryCode === '1') {
        const areaCode = this.extractUSAreaCode(phone);
        const expectedCity = this.usAreaCodes[areaCode];

        if (expectedCity && !this.locationContainsCity(location, expectedCity)) {
          this._log('debug', `[PhoneLocationCorrelator] City mismatch: area code ${areaCode} suggests ${expectedCity}, location is ${location}`);
          return {
            valid: true,
            hasMismatch: true,
            reason: 'city-mismatch',
            details: {
              areaCode,
              expectedCity,
              actualLocation: location,
              phone
            }
          };
        }
      }

      return { valid: true, hasMismatch: false };
    } catch (error) {
      this._log('error', `[PhoneLocationCorrelator] Validation error: ${error.message}`);
      return { valid: false, hasMismatch: false, reason: 'validation-error' };
    }
  }

  /**
   * Extract country code from phone number
   * @param {string} phone - Phone number
   * @returns {string|null} - Country code or null
   */
  extractCountryCode(phone) {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    const prefixes = ['852', '44', '49', '91', '86', '81', '65', '61', '33', '1'];

    for (const prefix of prefixes) {
      if (cleaned.startsWith(`+${prefix}`)) return prefix;
    }

    return null;
  }

  /**
   * Extract US area code from phone number
   * @param {string} phone - Phone number
   * @returns {string|null} - Area code or null
   */
  extractUSAreaCode(phone) {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    // Match +1 followed by 3-digit area code
    const match = cleaned.match(/^\+?1(\d{3})/);
    return match ? match[1] : null;
  }

  /**
   * Detect country from location string
   * @param {string} location - Location name
   * @param {Object} locationData - Optional location data
   * @returns {string|null} - Country name or null
   */
  detectLocationCountry(location, locationData) {
    // Check locationData first
    if (locationData && locationData.locationData && locationData.locationData[location]) {
      const data = locationData.locationData[location];
      if (data.country) return data.country;
    }

    // Check explicit patterns
    if (location.match(/Washington,?\s*D\.?C\.?/i)) return 'US';
    if (location.includes('Frankfurt') || location.includes('Berlin') || location.includes('Munich')) return 'Germany';
    if (location.includes('London')) return 'UK';
    if (location.includes('Paris')) return 'France';
    if (location.includes('Hong Kong')) return 'Hong Kong';
    if (location.includes('Singapore')) return 'Singapore';
    if (location.includes('Beijing') || location.includes('Shanghai')) return 'China';
    if (location.includes('Tokyo')) return 'Japan';
    if (location.includes('Sydney') || location.includes('Melbourne')) return 'Australia';
    if (location.includes('Delhi') || location.includes('Mumbai')) return 'India';

    // Check for US state abbreviations
    if (location.match(/,\s*[A-Z]{2}$/)) return 'US';

    // Check for major US cities
    const usCities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Boston',
                      'Seattle', 'Miami', 'Atlanta', 'Dallas', 'Austin', 'San Francisco'];
    for (const city of usCities) {
      if (location.includes(city)) return 'US';
    }

    return null;
  }

  /**
   * Check if location contains a city name
   * @param {string} location - Location string
   * @param {string} city - City name to check
   * @returns {boolean}
   */
  locationContainsCity(location, city) {
    // Handle "Washington, D.C." special case
    if (city === 'Washington' && location.match(/Washington,?\s*D\.?C\.?/i)) {
      return true;
    }
    return location.toLowerCase().includes(city.toLowerCase());
  }
}

module.exports = PhoneLocationCorrelator;
