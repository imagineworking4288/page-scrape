/**
 * Data Formatter
 *
 * Converts contact objects to spreadsheet row arrays with proper formatting.
 * Handles dates, phone numbers, arrays, and enrichment metadata.
 */

class DataFormatter {
  constructor(logger = null) {
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
   * Format a single contact into a row array
   * @param {Object} contact - Contact object
   * @param {string[]} columns - Array of column names in order
   * @returns {string[]} - Array of formatted values
   */
  formatContact(contact, columns) {
    return columns.map(column => this.extractFieldValue(contact, column));
  }

  /**
   * Format multiple contacts into row arrays
   * @param {Array} contacts - Array of contact objects
   * @param {string[]} columns - Array of column names in order
   * @returns {Array<string[]>} - 2D array of formatted values
   */
  formatContacts(contacts, columns) {
    return contacts.map(contact => this.formatContact(contact, columns));
  }

  /**
   * Safely extract and format a field value from a contact
   * @param {Object} contact - Contact object
   * @param {string} fieldName - Field name to extract
   * @returns {string} - Formatted string value
   */
  extractFieldValue(contact, fieldName) {
    if (!contact) return '';

    // Handle enrichment metadata fields specially
    if (this._isEnrichmentField(fieldName)) {
      return this._extractEnrichmentField(contact, fieldName);
    }

    // Get raw value
    let value = contact[fieldName];

    // Handle null/undefined
    if (value === null || value === undefined) {
      return '';
    }

    // Format based on field type
    switch (fieldName) {
      case 'phone':
        return this.formatPhone(value);
      case 'alternatePhone':
        // Alternate phones may be semicolon-separated, format each one
        return this.formatAlternatePhones(value);
      case 'alternateLocation':
        // Alternate locations are comma-separated, return as-is
        return value || '';
      case 'enrichedAt':
        return this.formatDate(value);
      case 'education':
      case 'practiceAreas':
      case 'barAdmissions':
        return this.formatArray(value);
      default:
        return this.formatValue(value);
    }
  }

  /**
   * Check if field is an enrichment metadata field
   * @param {string} fieldName - Field name
   * @returns {boolean}
   * @private
   */
  _isEnrichmentField(fieldName) {
    const enrichmentFields = [
      'enrichedAt',
      'actionsSummary',
      'confidence',
      'fieldsEnrichedCount',
      'fieldsCleanedCount'
    ];
    return enrichmentFields.includes(fieldName);
  }

  /**
   * Extract enrichment metadata field from contact
   * @param {Object} contact - Contact object
   * @param {string} fieldName - Enrichment field name
   * @returns {string} - Formatted value
   * @private
   */
  _extractEnrichmentField(contact, fieldName) {
    const enrichment = contact.enrichment || contact._enrichment;
    if (!enrichment) return '';

    switch (fieldName) {
      case 'enrichedAt':
        return this.formatDate(enrichment.enrichedAt);

      case 'actionsSummary':
        return this.formatEnrichmentActions(enrichment.actions);

      case 'confidence':
        return this.formatConfidence(enrichment.confidence);

      case 'fieldsEnrichedCount':
        return this._countActions(enrichment.actions, 'ENRICHED').toString();

      case 'fieldsCleanedCount':
        return this._countActions(enrichment.actions, 'CLEANED').toString();

      default:
        return '';
    }
  }

  /**
   * Count specific action type in actions object
   * @param {Object} actions - Actions object {field: action}
   * @param {string} actionType - Action type to count
   * @returns {number}
   * @private
   */
  _countActions(actions, actionType) {
    if (!actions || typeof actions !== 'object') return 0;
    return Object.values(actions).filter(a => a === actionType).length;
  }

  /**
   * Format enrichment actions object to string
   * @param {Object} actions - Actions object {name: 'CLEANED', email: 'ENRICHED'}
   * @returns {string} - Formatted string "name:CLEANED, email:ENRICHED"
   */
  formatEnrichmentActions(actions) {
    if (!actions || typeof actions !== 'object') return '';

    const parts = [];
    for (const [field, action] of Object.entries(actions)) {
      // Skip UNCHANGED and BOTH_MISSING as they're not interesting
      if (action !== 'UNCHANGED' && action !== 'BOTH_MISSING') {
        parts.push(`${field}:${action}`);
      }
    }

    return parts.join(', ');
  }

  /**
   * Format date/timestamp to readable string
   * @param {string|Date} timestamp - ISO string or Date object
   * @returns {string} - Formatted date "Dec 9, 2025 6:10 PM"
   */
  formatDate(timestamp) {
    if (!timestamp) return '';

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return String(timestamp);

      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return String(timestamp);
    }
  }

  /**
   * Format phone number to consistent format
   * @param {string} phone - Phone number
   * @returns {string} - Formatted phone "+1-XXX-XXX-XXXX"
   */
  formatPhone(phone) {
    if (!phone) return '';

    const str = String(phone);

    // If already formatted nicely, return as-is
    if (/^\+1-\d{3}-\d{3}-\d{4}$/.test(str)) {
      return str;
    }

    // Extract digits
    const digits = str.replace(/\D/g, '');

    // Format if we have 10 or 11 digits
    if (digits.length === 10) {
      return `+1-${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+1-${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
    }

    // Return original if can't format
    return str;
  }

  /**
   * Format alternate phone numbers (semicolon-separated)
   * @param {string} phones - Semicolon-separated phone numbers
   * @returns {string} - Formatted phones
   */
  formatAlternatePhones(phones) {
    if (!phones) return '';

    const str = String(phones);

    // Split by semicolon, format each, rejoin
    const formatted = str.split(';')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => this.formatPhone(p))
      .join('; ');

    return formatted;
  }

  /**
   * Format confidence value (handles both string and object)
   * @param {string|Object} confidence - Confidence value or object
   * @returns {string} - Formatted confidence string
   */
  formatConfidence(confidence) {
    if (!confidence) return '';

    if (typeof confidence === 'string') {
      return confidence;
    }

    if (typeof confidence === 'object') {
      return confidence.overall || '';
    }

    return String(confidence);
  }

  /**
   * Format array value to comma-separated string
   * @param {Array|string} value - Array or string value
   * @returns {string} - Comma-separated string
   */
  formatArray(value) {
    if (!value) return '';

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return String(value);
  }

  /**
   * Format generic value to string
   * @param {*} value - Any value
   * @returns {string} - String representation
   */
  formatValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    if (Array.isArray(value)) {
      return this.formatArray(value);
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }

    return String(value);
  }
}

module.exports = DataFormatter;
