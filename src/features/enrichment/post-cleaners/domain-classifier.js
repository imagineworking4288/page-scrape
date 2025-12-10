/**
 * Domain Classifier
 *
 * Wrapper around DomainExtractor for post-cleaning classification.
 * Extracts domain from email and classifies as business/personal.
 */

const DomainExtractor = require('../../../utils/domain-extractor');

class DomainClassifier {
  constructor(logger) {
    this.logger = logger;
    this.domainExtractor = new DomainExtractor(logger);
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
   * Classify an email domain
   * @param {string} email - Email address
   * @returns {Object} - { domain, domainType }
   */
  classify(email) {
    if (!email) {
      return { domain: null, domainType: null };
    }

    try {
      const domain = this.domainExtractor.extractAndNormalize(email);

      if (!domain) {
        this._log('debug', `[DomainClassifier] Could not extract domain from: ${email}`);
        return { domain: null, domainType: 'unknown' };
      }

      const isBusiness = this.domainExtractor.isBusinessDomain(domain);
      const domainType = isBusiness ? 'business' : 'personal';

      this._log('debug', `[DomainClassifier] Classified ${email} as ${domainType} (${domain})`);

      return { domain, domainType };
    } catch (error) {
      this._log('error', `[DomainClassifier] Classification error: ${error.message}`);
      return { domain: null, domainType: null };
    }
  }
}

module.exports = DomainClassifier;
