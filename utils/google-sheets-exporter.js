/**
 * Google Sheets Exporter Utility
 *
 * Exports scraped contact data to Google Sheets.
 * Creates a new sheet/tab for each scrape with a sanitized name based on the source URL.
 *
 * Features:
 * - Configurable column export (enable/disable columns)
 * - Automatic sheet naming from URL
 * - Unique sheet names (appends number if duplicate)
 * - Header row formatting (bold, frozen)
 * - Graceful error handling (won't crash on export failure)
 *
 * Required environment variables:
 * - GOOGLE_SHEETS_CLIENT_EMAIL: Service account email
 * - GOOGLE_SHEETS_PRIVATE_KEY: Service account private key
 * - GOOGLE_SHEETS_SPREADSHEET_ID: Target spreadsheet ID
 */

const { google } = require('googleapis');
const fs = require('fs');

/**
 * EXPORT COLUMN CONFIGURATION
 *
 * Edit this object to control which fields are exported and their display names.
 * - enabled: true/false - whether to include this column
 * - header: string - column header name in the spreadsheet
 *
 * Column order in spreadsheet matches the order of keys in this object.
 * Contact fields NOT listed here are silently ignored.
 */
const EXPORT_COLUMNS = {
  name:       { header: 'Name',        enabled: true },
  email:      { header: 'Email',       enabled: true },
  phone:      { header: 'Phone',       enabled: true },
  domain:     { header: 'Domain',      enabled: true },
  domainType: { header: 'Type',        enabled: true },
  confidence: { header: 'Confidence',  enabled: true },
  source:     { header: 'Source',      enabled: false },
  profileUrl: { header: 'Profile URL', enabled: false },
  sourcePage: { header: 'Page',        enabled: false },
  sourceUrl:  { header: 'Source URL',  enabled: false },
};

class GoogleSheetsExporter {
  constructor(logger = null) {
    this.logger = logger;
    this.clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    this.privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    this.sheets = null;
  }

  /**
   * Check if Google Sheets export is configured
   * @returns {boolean} - True if all required env vars are present
   */
  isConfigured() {
    return !!(
      this.clientEmail &&
      this.clientEmail.trim() !== '' &&
      this.privateKey &&
      this.privateKey.trim() !== '' &&
      this.spreadsheetId &&
      this.spreadsheetId.trim() !== ''
    );
  }

  /**
   * Get array of enabled columns with field name and header
   * @returns {Array<{field: string, header: string}>}
   */
  _getEnabledColumns() {
    return Object.entries(EXPORT_COLUMNS)
      .filter(([field, config]) => config.enabled)
      .map(([field, config]) => ({ field, header: config.header }));
  }

  /**
   * Authenticate with Google Sheets API using service account credentials
   * @private
   */
  async _authenticate() {
    const auth = new google.auth.JWT(
      this.clientEmail,
      null,
      this.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    await auth.authorize();
    this.sheets = google.sheets({ version: 'v4', auth });

    if (this.logger) {
      this.logger.debug('Authenticated with Google Sheets API');
    }
  }

  /**
   * Sanitize URL into a valid sheet name
   * @param {string} url - Source URL
   * @returns {string} - Sanitized sheet name (max 100 chars)
   */
  _sanitizeSheetName(url) {
    if (!url) {
      return 'contacts';
    }

    let name = url
      // Remove protocol
      .replace(/^https?:\/\//, '')
      // Remove www.
      .replace(/^www\./, '')
      // Replace slashes with dashes
      .replace(/\//g, '-')
      // Remove trailing dash
      .replace(/-$/, '');

    // Truncate to 100 characters (Google Sheets limit)
    if (name.length > 100) {
      name = name.substring(0, 100);
    }

    return name || 'contacts';
  }

  /**
   * Get list of existing sheet names in the spreadsheet
   * @returns {Promise<string[]>} - Array of sheet names
   * @private
   */
  async _getExistingSheetNames() {
    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties.title'
    });

    return response.data.sheets?.map(sheet => sheet.properties.title) || [];
  }

  /**
   * Get a unique sheet name (appends number if duplicate exists)
   * @param {string} baseName - Desired sheet name
   * @returns {Promise<string>} - Unique sheet name
   * @private
   */
  async _getUniqueSheetName(baseName) {
    const existingNames = await this._getExistingSheetNames();

    // If base name doesn't exist, use it
    if (!existingNames.includes(baseName)) {
      return baseName;
    }

    // Find a unique name by appending (2), (3), etc.
    let counter = 2;
    let uniqueName;
    do {
      uniqueName = `${baseName} (${counter})`;
      counter++;
    } while (existingNames.includes(uniqueName));

    return uniqueName;
  }

  /**
   * Create a new sheet/tab in the spreadsheet
   * @param {string} sheetName - Name for the new sheet
   * @returns {Promise<number>} - The new sheet's ID
   * @private
   */
  async _createSheet(sheetName) {
    const response = await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }
        ]
      }
    });

    const sheetId = response.data.replies[0].addSheet.properties.sheetId;

    if (this.logger) {
      this.logger.debug(`Created sheet: "${sheetName}" (ID: ${sheetId})`);
    }

    return sheetId;
  }

  /**
   * Format the header row (bold, frozen)
   * @param {number} sheetId - Sheet ID to format
   * @private
   */
  async _formatHeaderRow(sheetId) {
    const enabledColumns = this._getEnabledColumns();

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          // Make header row bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: enabledColumns.length
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat.bold'
            }
          },
          // Freeze first row
          {
            updateSheetProperties: {
              properties: {
                sheetId: sheetId,
                gridProperties: {
                  frozenRowCount: 1
                }
              },
              fields: 'gridProperties.frozenRowCount'
            }
          }
        ]
      }
    });

    if (this.logger) {
      this.logger.debug('Formatted header row (bold, frozen)');
    }
  }

  /**
   * Build the header row array from enabled columns
   * @returns {string[]} - Array of header strings
   * @private
   */
  _buildHeaderRow() {
    return this._getEnabledColumns().map(col => col.header);
  }

  /**
   * Build a data row from a contact object
   * @param {Object} contact - Contact object
   * @returns {string[]} - Array of values matching enabled column order
   * @private
   */
  _buildDataRow(contact) {
    return this._getEnabledColumns().map(col => {
      const value = contact[col.field];
      // Handle null, undefined, and convert to string
      if (value === null || value === undefined) {
        return '';
      }
      return String(value);
    });
  }

  /**
   * Export contacts from a JSON file to Google Sheets
   * @param {string} jsonFilePath - Path to the JSON file
   * @returns {Promise<string>} - The name of the created sheet
   */
  async exportFromJson(jsonFilePath) {
    // Read and parse JSON file
    const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
    const data = JSON.parse(jsonContent);

    // Extract metadata and contacts
    const sourceUrl = data.metadata?.url || '';
    const contacts = data.contacts || [];

    if (contacts.length === 0) {
      if (this.logger) {
        this.logger.warn('No contacts to export');
      }
      return null;
    }

    // Authenticate with Google Sheets API
    await this._authenticate();

    // Generate sheet name from URL
    const baseName = this._sanitizeSheetName(sourceUrl);
    const sheetName = await this._getUniqueSheetName(baseName);

    // Create the new sheet
    const sheetId = await this._createSheet(sheetName);

    // Build header row
    const headerRow = this._buildHeaderRow();

    // Build data rows
    const dataRows = contacts.map(contact => this._buildDataRow(contact));

    // Combine header and data
    const allRows = [headerRow, ...dataRows];

    // Write all data to the sheet
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: allRows
      }
    });

    if (this.logger) {
      this.logger.debug(`Wrote ${dataRows.length} contacts to sheet`);
    }

    // Format header row
    await this._formatHeaderRow(sheetId);

    if (this.logger) {
      this.logger.info(`Exported ${contacts.length} contacts to sheet "${sheetName}"`);
    }

    return sheetName;
  }
}

module.exports = GoogleSheetsExporter;
