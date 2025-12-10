/**
 * Field Cleaner
 *
 * Main orchestrator for post-enrichment cleaning operations.
 * Applies universal cleaning rules after ProfileEnricher completes.
 */

const MultiLocationHandler = require('./multi-location-handler');
const PhoneLocationCorrelator = require('./phone-location-correlator');
const LocationNormalizer = require('./location-normalizer');
const DomainClassifier = require('./domain-classifier');
const ConfidenceScorer = require('./confidence-scorer');

class FieldCleaner {
  constructor(logger) {
    this.logger = logger;
    this.multiLocationHandler = new MultiLocationHandler(logger);
    this.phoneLocationCorrelator = new PhoneLocationCorrelator(logger);
    this.locationNormalizer = new LocationNormalizer(logger);
    this.domainClassifier = new DomainClassifier(logger);
    this.confidenceScorer = new ConfidenceScorer(logger);
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
   * Clean multiple contacts
   * @param {Array} contacts - Array of contact objects
   * @param {Object} options - Cleaning options
   * @returns {Array} - Cleaned contacts
   */
  async cleanContacts(contacts, options = {}) {
    const { prioritizeUS = true, strictValidation = false } = options;

    this._log('info', `[FieldCleaner] Starting post-cleaning of ${contacts.length} contacts`);
    this._log('info', `[FieldCleaner] Options: prioritizeUS=${prioritizeUS}, strictValidation=${strictValidation}`);

    const cleanedContacts = [];
    let processedCount = 0;
    let multiLocationCount = 0;
    let mismatchCount = 0;

    for (const contact of contacts) {
      const cleaned = await this.cleanContact(contact, options);
      cleanedContacts.push(cleaned);

      // Track statistics
      if (cleaned._postCleaning?.operations?.includes('multi-location-detected')) {
        multiLocationCount++;
      }
      if (cleaned._postCleaning?.operations?.includes('phone-location-mismatch')) {
        mismatchCount++;
      }

      processedCount++;
      if (processedCount % 100 === 0) {
        this._log('info', `[FieldCleaner] Progress: ${processedCount}/${contacts.length} contacts cleaned`);
      }
    }

    this._log('info', `[FieldCleaner] Post-cleaning complete: ${cleanedContacts.length} contacts processed`);
    this._log('info', `[FieldCleaner] Multi-location contacts: ${multiLocationCount}`);
    this._log('info', `[FieldCleaner] Phone-location mismatches: ${mismatchCount}`);

    return cleanedContacts;
  }

  /**
   * Clean a single contact
   * @param {Object} contact - Contact object
   * @param {Object} options - Cleaning options
   * @returns {Object} - Cleaned contact
   */
  async cleanContact(contact, options = {}) {
    const cleaned = { ...contact };
    const cleaningLog = [];
    let locationData = null;
    let phoneValidation = null;

    // Step 1: Multi-location parsing
    try {
      locationData = this.multiLocationHandler.parse(
        cleaned.location,
        cleaned.phone,
        options.prioritizeUS
      );

      if (locationData.isMultiLocation) {
        cleaned.location = locationData.primaryLocation;
        cleaned.phone = locationData.primaryPhone || cleaned.phone;
        cleaned.additionalLocations = locationData.additionalLocations;
        cleaned.allLocations = locationData.allLocations;
        cleaned.locationData = locationData.locationData;
        cleaningLog.push('multi-location-detected');

        this._log('debug', `[FieldCleaner] Multi-location for ${cleaned.name}: ${locationData.allLocations.join(', ')}`);
      }
    } catch (error) {
      this._log('error', `[FieldCleaner] Multi-location error for ${cleaned.name}: ${error.message}`);
    }

    // Step 2: Phone-location validation
    try {
      phoneValidation = this.phoneLocationCorrelator.validate(
        cleaned.phone,
        cleaned.location,
        locationData
      );

      if (phoneValidation.hasMismatch) {
        cleaned._warnings = cleaned._warnings || [];
        cleaned._warnings.push({
          type: 'phone-location-mismatch',
          details: phoneValidation.details,
          severity: phoneValidation.reason === 'country-mismatch' ? 'high' : 'medium'
        });
        cleaningLog.push('phone-location-mismatch');

        this._log('debug', `[FieldCleaner] Phone-location mismatch for ${cleaned.name}: ${phoneValidation.reason}`);
      }
    } catch (error) {
      this._log('error', `[FieldCleaner] Phone-location validation error for ${cleaned.name}: ${error.message}`);
    }

    // Step 3: Location normalization
    try {
      const normalizedLocation = this.locationNormalizer.normalize(cleaned.location);

      if (normalizedLocation.wasChanged) {
        cleaned._original = cleaned._original || {};
        cleaned._original.location_pre_normalization = cleaned.location;
        cleaned.location = normalizedLocation.normalized;
        cleaningLog.push('location-normalized');

        this._log('debug', `[FieldCleaner] Location normalized for ${cleaned.name}`);
      }
    } catch (error) {
      this._log('error', `[FieldCleaner] Location normalization error for ${cleaned.name}: ${error.message}`);
    }

    // Step 4: Domain classification
    try {
      if (cleaned.email && !cleaned.domain) {
        const domainInfo = this.domainClassifier.classify(cleaned.email);
        if (domainInfo.domain) {
          cleaned.domain = domainInfo.domain;
          cleaned.domainType = domainInfo.domainType;
          cleaningLog.push('domain-classified');

          this._log('debug', `[FieldCleaner] Domain classified for ${cleaned.name}: ${domainInfo.domain} (${domainInfo.domainType})`);
        }
      }
    } catch (error) {
      this._log('error', `[FieldCleaner] Domain classification error for ${cleaned.name}: ${error.message}`);
    }

    // Step 5: Confidence scoring
    try {
      const confidenceData = this.confidenceScorer.calculate(cleaned, {
        phoneValidation,
        locationData
      });

      cleaned.confidence = confidenceData.overall;
      cleaned.confidenceBreakdown = confidenceData.breakdown;
    } catch (error) {
      this._log('error', `[FieldCleaner] Confidence scoring error for ${cleaned.name}: ${error.message}`);
    }

    // Add post-cleaning metadata
    cleaned._postCleaning = {
      cleanedAt: new Date().toISOString(),
      operations: cleaningLog,
      version: '1.0'
    };

    return cleaned;
  }

  /**
   * Get statistics summary from cleaned contacts
   * @param {Array} cleanedContacts - Array of cleaned contacts
   * @returns {Object} - Statistics summary
   */
  getStatistics(cleanedContacts) {
    const stats = {
      total: cleanedContacts.length,
      multiLocation: 0,
      phoneMismatch: 0,
      locationNormalized: 0,
      domainClassified: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0
    };

    for (const contact of cleanedContacts) {
      const ops = contact._postCleaning?.operations || [];

      if (ops.includes('multi-location-detected')) stats.multiLocation++;
      if (ops.includes('phone-location-mismatch')) stats.phoneMismatch++;
      if (ops.includes('location-normalized')) stats.locationNormalized++;
      if (ops.includes('domain-classified')) stats.domainClassified++;

      switch (contact.confidence) {
        case 'high': stats.highConfidence++; break;
        case 'medium': stats.mediumConfidence++; break;
        case 'low': stats.lowConfidence++; break;
      }
    }

    return stats;
  }
}

module.exports = FieldCleaner;
