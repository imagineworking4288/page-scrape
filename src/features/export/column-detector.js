/**
 * Column Detector
 *
 * Auto-detects available columns from contact data and provides
 * column ordering and filtering capabilities.
 */

// ============================================================================
// COLUMN CONFIGURATION
// ============================================================================
//
// Easily customize which columns are exported to Google Sheets by default.
//
// To ADD a column:
//   1. Add the field name to DEFAULT_COLUMNS array below
//   2. Ensure the field exists in your contact data
//   3. Optionally add display name to COLUMN_DISPLAY_NAMES
//
// To REMOVE a column:
//   1. Delete the field name from DEFAULT_COLUMNS array
//
// To REORDER columns:
//   1. Change the order of fields in DEFAULT_COLUMNS array
//
// ============================================================================

/**
 * Default columns exported to Google Sheets (in order)
 *
 * These are the columns that will be exported when no --columns option is provided.
 *
 * Available standard fields:
 * - name, email, phone, title, location, profileUrl
 * - domain, domainType, confidence
 * - bio, education, practiceAreas, barAdmissions
 * - sourceUrl, sourcePage
 *
 * To customize: Simply add, remove, or reorder fields in this array.
 */
const DEFAULT_COLUMNS = [
  'name',
  'email',
  'phone',
  'title',
  'profileUrl'
];

/**
 * Display names for column headers in Google Sheets
 *
 * Maps internal field names to user-friendly headers.
 * If a field is not listed here, the column name will be auto-formatted
 * from camelCase to Title Case (e.g., domainType → "Domain Type").
 */
const COLUMN_DISPLAY_NAMES = {
  'name': 'Name',
  'email': 'Email',
  'phone': 'Phone',
  'title': 'Title',
  'location': 'Location',
  'profileUrl': 'Profile URL',
  'domain': 'Domain',
  'domainType': 'Domain Type',
  'bio': 'Bio',
  'education': 'Education',
  'practiceAreas': 'Practice Areas',
  'barAdmissions': 'Bar Admissions',
  'sourceUrl': 'Source URL',
  'sourcePage': 'Source Page',
  'confidence': 'Confidence',
  'enrichedAt': 'Enriched At',
  'actionsSummary': 'Actions',
  'fieldsEnrichedCount': 'Fields Enriched',
  'fieldsCleanedCount': 'Fields Cleaned',
  'additionalLocations': 'Additional Locations',
  'allLocations': 'All Locations'
};

/**
 * Column groups for quick filtering via CLI
 *
 * These groups can be used with --core-only and --include-enrichment options.
 *
 * CLI Usage:
 *   --core-only           Uses COLUMN_GROUPS.core (6 essential contact fields)
 *   --include-enrichment  Adds COLUMN_GROUPS.enrichment to the export
 *
 * Note: --core-only takes full precedence. When specified, ONLY core fields
 * are exported, even if --include-enrichment is also provided.
 */
const COLUMN_GROUPS = {
  // Core: 6 essential contact fields used by --core-only flag
  // These are the only columns exported when --core-only is specified
  core: ['name', 'email', 'phone', 'title', 'location', 'profileUrl'],

  // Extended: core + domain and confidence info
  extended: ['name', 'email', 'phone', 'title', 'location', 'profileUrl', 'domain', 'domainType', 'confidence'],

  // Enrichment: metadata about the enrichment process (added by --include-enrichment)
  // Note: NOT added when --core-only is specified
  enrichment: ['enrichedAt', 'actionsSummary', 'confidence', 'fieldsEnrichedCount', 'fieldsCleanedCount']
};

// ============================================================================
// END CONFIGURATION
// ============================================================================

class ColumnDetector {
  constructor(logger = null) {
    this.logger = logger;

    // Use the configurable default columns
    this.defaultColumns = [...DEFAULT_COLUMNS];

    // Standard column order for sorting (when detecting all columns)
    this.standardOrder = [
      'name',
      'email',
      'phone',
      'title',
      'location',
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

    // Core fields (same as COLUMN_GROUPS.core)
    this.coreFields = COLUMN_GROUPS.core;

    // Enrichment metadata columns
    this.enrichmentColumns = COLUMN_GROUPS.enrichment;

    // Display name mapping
    this.displayNames = COLUMN_DISPLAY_NAMES;
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
   * Get default columns (from DEFAULT_COLUMNS configuration)
   * @returns {string[]} - Array of default column names
   */
  getDefaultColumns() {
    return [...this.defaultColumns];
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
   * @param {string[]} fields - Array of available field names (from detectColumns)
   * @param {Object} options - Filter options
   * @param {boolean} options.includeEnrichment - Include enrichment metadata columns
   * @param {boolean} options.coreOnly - Only include core fields
   * @param {boolean} options.includeAll - Include all detected fields (not just defaults)
   * @param {string[]} options.columns - Explicit list of columns to include
   * @param {string[]} options.exclude - Columns to exclude
   * @returns {string[]} - Filtered array of field names
   */
  filterColumns(fields, options = {}) {
    let filtered;

    // If explicit columns specified, use only those
    if (options.columns && options.columns.length > 0) {
      filtered = options.columns.filter(col => fields.includes(col) || this.enrichmentColumns.includes(col));
      this._log('debug', `[ColumnDetector] Using explicit columns: ${filtered.join(', ')}`);
    }
    // If core only, filter to core fields
    else if (options.coreOnly) {
      filtered = fields.filter(f => this.coreFields.includes(f));
      this._log('debug', '[ColumnDetector] Filtering to core fields only');
    }
    // If includeAll, use all detected fields
    else if (options.includeAll) {
      filtered = [...fields];
      this._log('debug', '[ColumnDetector] Using all detected columns');
    }
    // Default: use DEFAULT_COLUMNS (filtered to only those that exist in contacts)
    else {
      filtered = this.defaultColumns.filter(col => fields.includes(col));
      this._log('debug', `[ColumnDetector] Using default columns: ${filtered.join(', ')}`);
    }

    // Add enrichment columns if requested (but not when coreOnly is true - coreOnly means ONLY core fields)
    if (options.includeEnrichment && !options.coreOnly) {
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

    // Order according to default column order (preserves DEFAULT_COLUMNS order)
    return this._orderByDefault(filtered);
  }

  /**
   * Order columns by DEFAULT_COLUMNS order, then standard order, then alphabetically
   * @param {string[]} columns - Array of column names
   * @returns {string[]} - Ordered array
   * @private
   */
  _orderByDefault(columns) {
    const ordered = [];
    const remaining = new Set(columns);

    // First: add columns in DEFAULT_COLUMNS order
    for (const col of this.defaultColumns) {
      if (remaining.has(col)) {
        ordered.push(col);
        remaining.delete(col);
      }
    }

    // Second: add remaining columns in standard order
    for (const col of this.standardOrder) {
      if (remaining.has(col)) {
        ordered.push(col);
        remaining.delete(col);
      }
    }

    // Third: add any remaining alphabetically
    const rest = Array.from(remaining).sort();
    return [...ordered, ...rest];
  }

  /**
   * Get column headers for display
   * @param {string[]} columns - Array of column field names
   * @returns {string[]} - Array of display headers (same order as columns)
   */
  getColumnHeaders(columns) {
    return columns.map(col => this.displayNames[col] || this._formatHeader(col));
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
