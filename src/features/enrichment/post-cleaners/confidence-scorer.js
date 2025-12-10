/**
 * Confidence Scorer
 *
 * Calculates overall data quality confidence score for contacts
 * based on field presence, cleanliness, and validation results.
 */

class ConfidenceScorer {
  constructor(logger) {
    this.logger = logger;
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
   * Calculate confidence score for a contact
   * @param {Object} contact - Contact object
   * @param {Object} validationData - Validation data from other cleaners
   * @returns {Object} - { overall, score, breakdown }
   */
  calculate(contact, validationData = {}) {
    const scores = {};
    let total = 0;

    try {
      // Name cleanliness (20%)
      if (contact.name && !this.hasEmbeddedTitle(contact.name)) {
        scores.nameClean = 20;
        total += 20;
      }

      // Location cleanliness (20%)
      if (contact.location && !this.hasEmbeddedPhone(contact.location)) {
        scores.locationClean = 20;
        total += 20;
      }

      // Email present and valid (30%)
      if (contact.email && this.isValidEmail(contact.email)) {
        scores.emailPresent = 30;
        total += 30;
      }

      // Phone format valid (15%)
      if (contact.phone && this.isValidPhoneFormat(contact.phone)) {
        scores.phoneValid = 15;
        total += 15;
      }

      // Phone-location correlation (15%)
      if (validationData.phoneValidation && !validationData.phoneValidation.hasMismatch) {
        scores.phoneLocationValid = 15;
        total += 15;
      }

      // Determine overall confidence
      let overall = 'low';
      if (total >= 80) overall = 'high';
      else if (total >= 60) overall = 'medium';

      this._log('debug', `[ConfidenceScorer] Score: ${total}/100 (${overall})`);

      return {
        overall,
        score: total,
        breakdown: scores
      };
    } catch (error) {
      this._log('error', `[ConfidenceScorer] Calculation error: ${error.message}`);
      return {
        overall: 'low',
        score: 0,
        breakdown: {}
      };
    }
  }

  /**
   * Check if name has embedded title suffix
   * @param {string} name - Name to check
   * @returns {boolean}
   */
  hasEmbeddedTitle(name) {
    return /\b(Partner|Associate|Counsel|Director|Manager|Of Counsel)$/i.test(name);
  }

  /**
   * Check if location has embedded phone number
   * @param {string} location - Location to check
   * @returns {boolean}
   */
  hasEmbeddedPhone(location) {
    return /\+?\d+[\d\s\-\(\)]{7,}/.test(location);
  }

  /**
   * Check if email is valid format
   * @param {string} email - Email to check
   * @returns {boolean}
   */
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Check if phone is in valid format
   * @param {string} phone - Phone to check
   * @returns {boolean}
   */
  isValidPhoneFormat(phone) {
    return /^\+\d+[\d\s\-\(\)]+$/.test(phone);
  }
}

module.exports = ConfidenceScorer;
