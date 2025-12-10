/**
 * Column Detector
 *
 * Auto-detects available columns from contact data and provides
 * column ordering and filtering capabilities.
 */

class ColumnDetector {
  constructor(logger = null) {
    this.logger = logger;

    // Standard column order (core fields first)
    // Note: alternatePhone/alternateLocation are inserted dynamically after their primary counterparts
    this.standardOrder = [
      'name',
      'email',
      'phone',
      'alternatePhone',
      'title',
      'location',
      'alternateLocation',
      'domain',
      'domainType',
      'bio',
      'education',
      'practiceAreas',
      'barAdmissions',
      'profileUrl',
      'sourceUrl',
      'sourcePage'
    ];

    // Core fields that are always important
    this.coreFields = ['name', 'email', 'phone', 'title', 'location', 'profileUrl'];

    // Enrichment metadata columns
    this.enrichmentColumns = [
      'enrichedAt',
      'actionsSummary',
      'confidence',
      'fieldsEnrichedCount',
      'fieldsCleanedCount'
    ];
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
   * Get standard core columns
   * @returns {string[]} - Array of core field names
   */
  getStandardColumns() {
    return [...this.coreFields];
  }

  /**
   * Get enrichment metadata columns
   * @returns {string[]} - Array of enrichment column names
   */
  getEnrichmentColumns() {
    return [...this.enrichmentColumns];
  }

  /**
   * Detect all available columns from contact data
   * Scans first N contacts to find all available fields
   * @param {Array} contacts - Array of contact objects
   * @param {number} sampleSize - Number of contacts to sample (default: 10)
   * @returns {string[]} - Array of detected field names
   */
  detectColumns(contacts, sampleSize = 10) {
    if (!contacts || contacts.length === 0) {
      return this.getStandardColumns();
    }

    const detectedFields = new Set();
    const samplesToCheck = Math.min(sampleSize, contacts.length);

    for (let i = 0; i < samplesToCheck; i++) {
      const contact = contacts[i];
      this._extractFieldsFromContact(contact, detectedFields);
    }

    const fields = Array.from(detectedFields);
    this._log('debug', `[ColumnDetector] Detected ${fields.length} fields from ${samplesToCheck} contacts`);

    return this.orderColumns(fields);
  }

  /**
   * Extract field names from a single contact
   * @param {Object} contact - Contact object
   * @param {Set} fields - Set to add field names to
   * @private
   */
  _extractFieldsFromContact(contact, fields) {
    if (!contact || typeof contact !== 'object') return;

    // Check top-level fields
    for (const key of Object.keys(contact)) {
      // Skip internal fields
      if (key.startsWith('_') && key !== '_original') continue;
      // Skip complex objects (except arrays which might be education, etc.)
      if (typeof contact[key] === 'object' && contact[key] !== null && !Array.isArray(contact[key])) {
        // Handle enrichment metadata specially
        if (key === 'enrichment') {
          // Mark that enrichment data is available
          fields.add('_hasEnrichment');
        }
        continue;
      }
      fields.add(key);
    }
  }

  /**
   * Order columns in standard order
   * @param {string[]} fields - Array of field names
   * @returns {string[]} - Ordered array of field names
   */
  orderColumns(fields) {
    const ordered = [];
    const remaining = new Set(fields);

    // Add fields in standard order first
    for (const field of this.standardOrder) {
      if (remaining.has(field)) {
        ordered.push(field);
        remaining.delete(field);
      }
    }

    // Add any remaining fields alphabetically
    const remainingArray = Array.from(remaining)
      .filter(f => !f.startsWith('_'))
      .sort();

    return [...ordered, ...remainingArray];
  }

  /**
   * Filter columns based on options
   * @param {string[]} fields - Array of field names
   * @param {Object} options - Filter options
   * @param {boolean} options.includeEnrichment - Include enrichment metadata columns
   * @param {boolean} options.coreOnly - Only include core fields
   * @param {string[]} options.columns - Explicit list of columns to include
   * @param {string[]} options.exclude - Columns to exclude
   * @returns {string[]} - Filtered array of field names
   */
  filterColumns(fields, options = {}) {
    let filtered = [...fields];

    // If explicit columns specified, use only those
    if (options.columns && options.columns.length > 0) {
      filtered = options.columns.filter(col => fields.includes(col) || this.enrichmentColumns.includes(col));
      this._log('debug', `[ColumnDetector] Using explicit columns: ${filtered.join(', ')}`);
    }
    // If core only, filter to core fields
    else if (options.coreOnly) {
      filtered = filtered.filter(f => this.coreFields.includes(f));
      this._log('debug', '[ColumnDetector] Filtering to core fields only');
    }

    // Add enrichment columns if requested
    if (options.includeEnrichment) {
      const enrichmentCols = this.enrichmentColumns.filter(col => !filtered.includes(col));
      filtered = [...filtered, ...enrichmentCols];
      this._log('debug', '[ColumnDetector] Added enrichment metadata columns');
    }

    // Exclude specified columns
    if (options.exclude && options.exclude.length > 0) {
      filtered = filtered.filter(f => !options.exclude.includes(f));
      this._log('debug', `[ColumnDetector] Excluded columns: ${options.exclude.join(', ')}`);
    }

    // Remove internal marker fields
    filtered = filtered.filter(f => !f.startsWith('_'));

    return this.orderColumns(filtered);
  }

  /**
   * Get column headers for display
   * @param {string[]} columns - Array of column field names
   * @returns {Object} - Map of field name to display header
   */
  getColumnHeaders(columns) {
    const headers = {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      alternatePhone: 'Alternate Phone',
      title: 'Title',
      location: 'Location',
      alternateLocation: 'Alternate Location',
      domain: 'Domain',
      domainType: 'Domain Type',
      bio: 'Bio',
      education: 'Education',
      practiceAreas: 'Practice Areas',
      barAdmissions: 'Bar Admissions',
      profileUrl: 'Profile URL',
      sourceUrl: 'Source URL',
      sourcePage: 'Source Page',
      confidence: 'Confidence',
      enrichedAt: 'Enriched At',
      actionsSummary: 'Actions',
      fieldsEnrichedCount: 'Fields Enriched',
      fieldsCleanedCount: 'Fields Cleaned'
    };

    return columns.map(col => headers[col] || this._formatHeader(col));
  }

  /**
   * Format a field name as a display header
   * @param {string} fieldName - Field name (camelCase)
   * @returns {string} - Display header (Title Case)
   * @private
   */
  _formatHeader(fieldName) {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
}

module.exports = ColumnDetector;
