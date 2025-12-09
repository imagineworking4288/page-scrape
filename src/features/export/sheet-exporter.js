/**
 * Sheet Exporter
 *
 * Main orchestrator for the Google Sheets export workflow.
 * Coordinates column detection, data formatting, and batch writing.
 */

const fs = require('fs');
const path = require('path');
const SheetManager = require('./sheet-manager');
const ColumnDetector = require('./column-detector');
const DataFormatter = require('./data-formatter');
const BatchWriter = require('./batch-writer');

class SheetExporter {
  constructor(logger = null, options = {}) {
    this.logger = logger;

    // Initialize components
    this.sheetManager = new SheetManager(logger);
    this.columnDetector = new ColumnDetector(logger);
    this.dataFormatter = new DataFormatter(logger);
    this.batchWriter = null; // Initialized after authentication

    // Default options
    this.options = {
      batchSize: options.batchSize || 100,
      ...options
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
   * Check if export is configured
   * @returns {boolean}
   */
  isConfigured() {
    return this.sheetManager.isConfigured();
  }

  /**
   * Main entry point - export contacts to Google Sheets
   * @param {Array|string} contactsOrFile - Array of contacts or path to JSON file
   * @param {Object} options - Export options
   * @param {string} options.sheetName - Sheet name (auto-generated if not provided)
   * @param {string} options.sheetId - Existing sheet ID for append mode
   * @param {string} options.mode - 'create' | 'append' (default: 'create')
   * @param {boolean} options.includeEnrichment - Include enrichment metadata columns
   * @param {boolean} options.coreOnly - Only include core fields
   * @param {string[]} options.columns - Explicit column list
   * @param {string[]} options.exclude - Columns to exclude
   * @returns {Promise<Object>} - Export result
   */
  async exportToSheet(contactsOrFile, options = {}) {
    const startTime = Date.now();

    try {
      // Load contacts
      const { contacts, metadata } = this._loadContacts(contactsOrFile);

      if (!contacts || contacts.length === 0) {
        throw new Error('No contacts to export');
      }

      this._log('info', `[SheetExporter] Exporting ${contacts.length} contacts to Google Sheets`);

      // Check configuration
      if (!this.isConfigured()) {
        throw new Error('Google Sheets not configured. Check .env for GOOGLE_SHEETS_* variables.');
      }

      // Authenticate
      await this.sheetManager.authenticate();
      this.batchWriter = new BatchWriter(this.sheetManager, this.logger);

      // Determine export mode
      const mode = options.mode || 'create';

      let result;
      if (mode === 'create') {
        const sheetName = options.sheetName || this.generateSheetName(contacts, metadata);
        result = await this.createNewSheet(sheetName, contacts, options);
      } else if (mode === 'append') {
        if (!options.sheetId) {
          throw new Error('Sheet ID required for append mode');
        }
        result = await this.appendToSheet(options.sheetId, contacts, options);
      } else {
        throw new Error(`Unknown mode: ${mode}. Use 'create' or 'append'.`);
      }

      // Calculate duration
      const duration = Date.now() - startTime;
      result.durationMs = duration;

      this.printSummary(result);

      return result;

    } catch (error) {
      this._log('error', `[SheetExporter] Export failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new sheet and populate it with contacts
   * @param {string} sheetName - Sheet name
   * @param {Array} contacts - Array of contacts
   * @param {Object} columnOptions - Column filtering options
   * @returns {Promise<Object>} - Result object
   */
  async createNewSheet(sheetName, contacts, columnOptions = {}) {
    // Detect columns
    const detectedColumns = this.columnDetector.detectColumns(contacts);
    const columns = this.columnDetector.filterColumns(detectedColumns, columnOptions);

    this._log('debug', `[SheetExporter] Using columns: ${columns.join(', ')}`);

    // Create the sheet
    const sheetInfo = await this.sheetManager.createSheet(sheetName);

    // Build header row
    const headers = this.columnDetector.getColumnHeaders(columns);

    // Format contact data
    const dataRows = this.dataFormatter.formatContacts(contacts, columns);

    // Combine header and data
    const allRows = [headers, ...dataRows];

    // Write in batches
    const writeResult = await this.batchWriter.writeAllRows(
      sheetInfo.spreadsheetId,
      sheetInfo.sheetName,
      allRows,
      {
        batchSize: this.options.batchSize,
        onProgress: (batch, total, rows) => {
          this._log('debug', `[SheetExporter] Progress: batch ${batch}/${total} (${rows} rows written)`);
        }
      }
    );

    // Format headers
    await this.sheetManager.formatHeaders(sheetInfo.sheetId, columns.length);

    // Auto-resize columns
    await this.sheetManager.autoResizeColumns(sheetInfo.sheetId, columns.length);

    return {
      success: true,
      mode: 'create',
      spreadsheetId: sheetInfo.spreadsheetId,
      sheetId: sheetInfo.sheetId,
      sheetName: sheetInfo.sheetName,
      spreadsheetUrl: sheetInfo.spreadsheetUrl,
      rowsWritten: writeResult.rowsWritten - 1, // Subtract header row
      columns: columns,
      batches: writeResult.batches
    };
  }

  /**
   * Append contacts to an existing sheet
   * @param {string} sheetId - Sheet ID to append to
   * @param {Array} contacts - Array of contacts
   * @param {Object} columnOptions - Column filtering options
   * @returns {Promise<Object>} - Result object
   */
  async appendToSheet(sheetId, contacts, columnOptions = {}) {
    // For append mode, we need to match existing columns
    // This is a simplified implementation - in production you'd read existing headers
    const detectedColumns = this.columnDetector.detectColumns(contacts);
    const columns = this.columnDetector.filterColumns(detectedColumns, columnOptions);

    // Format contact data (no header row for append)
    const dataRows = this.dataFormatter.formatContacts(contacts, columns);

    // Get spreadsheet info
    const spreadsheet = await this.sheetManager.getSpreadsheet();
    const sheet = spreadsheet.sheets?.find(s => s.properties.sheetId === parseInt(sheetId));
    const sheetName = sheet?.properties?.title || 'Sheet1';

    // Append rows
    const range = `'${sheetName}'!A:${this.batchWriter._columnToLetter(columns.length)}`;
    await this.sheetManager.appendRows(this.sheetManager.spreadsheetId, range, dataRows);

    return {
      success: true,
      mode: 'append',
      spreadsheetId: this.sheetManager.spreadsheetId,
      sheetId: parseInt(sheetId),
      sheetName: sheetName,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${this.sheetManager.spreadsheetId}/edit#gid=${sheetId}`,
      rowsWritten: dataRows.length,
      columns: columns,
      batches: 1
    };
  }

  /**
   * Generate a sheet name from contacts metadata
   * @param {Array} contacts - Array of contacts
   * @param {Object} metadata - Metadata from JSON file
   * @returns {string} - Generated sheet name
   */
  generateSheetName(contacts, metadata = {}) {
    // Try to extract domain from source URL or profile URLs
    let domain = null;

    // Check metadata first
    if (metadata?.url) {
      domain = this._extractDomain(metadata.url);
    }

    // Fall back to first contact's profile URL
    if (!domain && contacts[0]?.profileUrl) {
      domain = this._extractDomain(contacts[0].profileUrl);
    }

    // Format date
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    if (domain) {
      return `${domain} - ${date}`;
    }

    return `Contacts - ${date}`;
  }

  /**
   * Extract domain from URL
   * @param {string} url - URL to extract domain from
   * @returns {string|null} - Domain or null
   * @private
   */
  _extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '').replace('.com', '').replace('.org', '');
    } catch {
      return null;
    }
  }

  /**
   * Load contacts from file or array
   * @param {Array|string} contactsOrFile - Contacts array or file path
   * @returns {{contacts: Array, metadata: Object}}
   * @private
   */
  _loadContacts(contactsOrFile) {
    // If already an array, return as-is
    if (Array.isArray(contactsOrFile)) {
      return { contacts: contactsOrFile, metadata: {} };
    }

    // If it's an object with contacts property, extract it
    if (typeof contactsOrFile === 'object' && contactsOrFile.contacts) {
      return {
        contacts: contactsOrFile.contacts,
        metadata: contactsOrFile.metadata || {}
      };
    }

    // Assume it's a file path
    if (typeof contactsOrFile === 'string') {
      const filePath = path.resolve(contactsOrFile);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      return {
        contacts: data.contacts || data,
        metadata: data.metadata || {}
      };
    }

    throw new Error('Invalid input: expected contacts array or file path');
  }

  /**
   * Print export summary to console
   * @param {Object} result - Export result
   */
  printSummary(result) {
    const duration = result.durationMs ? `${(result.durationMs / 1000).toFixed(1)}s` : 'N/A';

    console.log('');
    console.log('================================================================================');
    console.log('GOOGLE SHEETS EXPORT COMPLETE');
    console.log('================================================================================');
    console.log(`Mode:           ${result.mode}`);
    console.log(`Sheet Name:     ${result.sheetName}`);
    console.log(`Rows Written:   ${result.rowsWritten}`);
    console.log(`Columns:        ${result.columns?.length || 0}`);
    console.log(`Batches:        ${result.batches}`);
    console.log(`Duration:       ${duration}`);
    console.log('');
    console.log(`Sheet URL: ${result.spreadsheetUrl}`);
    console.log('================================================================================');
  }
}

module.exports = SheetExporter;
