/**
 * Sheet Manager
 *
 * Handles Google Sheets API authentication and low-level sheet operations.
 * Uses service account authentication pattern from existing google-sheets-exporter.js
 */

const { google } = require('googleapis');

class SheetManager {
  constructor(logger = null) {
    this.logger = logger;
    this.clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    this.privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    this.sheets = null;
    this.auth = null;
  }

  /**
   * Safe logger helper - checks if logger exists before calling
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Message to log
   */
  _log(level, message) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message);
    } else if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info(message);
    }
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
   * Validate credentials format and provide helpful error messages
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateCredentials() {
    const errors = [];

    // Check client email
    if (!this.clientEmail || this.clientEmail.trim() === '') {
      errors.push('GOOGLE_SHEETS_CLIENT_EMAIL is missing');
    } else if (!this.clientEmail.includes('@') || !this.clientEmail.includes('.iam.gserviceaccount.com')) {
      errors.push('GOOGLE_SHEETS_CLIENT_EMAIL should be a service account email (ends with .iam.gserviceaccount.com)');
    }

    // Check private key
    if (!this.privateKey || this.privateKey.trim() === '') {
      errors.push('GOOGLE_SHEETS_PRIVATE_KEY is missing');
    } else if (!this.privateKey.includes('BEGIN PRIVATE KEY') || !this.privateKey.includes('END PRIVATE KEY')) {
      errors.push('GOOGLE_SHEETS_PRIVATE_KEY format is invalid (should contain BEGIN/END PRIVATE KEY markers)');
    }

    // Check spreadsheet ID
    if (!this.spreadsheetId || this.spreadsheetId.trim() === '') {
      errors.push('GOOGLE_SHEETS_SPREADSHEET_ID is missing');
    } else if (this.spreadsheetId.includes('your-spreadsheet-id') || this.spreadsheetId.length < 20) {
      errors.push('GOOGLE_SHEETS_SPREADSHEET_ID appears to be a placeholder - use actual spreadsheet ID from URL');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Authenticate with Google Sheets API using service account credentials
   * @returns {Promise<boolean>} - True if authentication successful
   */
  async authenticate() {
    // Validate credentials format first
    const validation = this.validateCredentials();
    if (!validation.valid) {
      const errorMsg =
        'Google Sheets credentials validation failed:\n' +
        validation.errors.map(e => `  - ${e}`).join('\n') +
        '\n\nSetup instructions:\n' +
        '  1. Go to https://console.cloud.google.com/\n' +
        '  2. Enable Google Sheets API\n' +
        '  3. Create Service Account and download JSON key\n' +
        '  4. Copy client_email and private_key to .env\n' +
        '  5. Share your spreadsheet with the service account email\n' +
        '\nSee .env.example for required format.';

      this._log('error', `[SheetManager] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    try {
      this.auth = new google.auth.JWT(
        this.clientEmail,
        null,
        this.privateKey,
        ['https://www.googleapis.com/auth/spreadsheets']
      );

      await this.auth.authorize();
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });

      this._log('debug', '[SheetManager] Authenticated with Google Sheets API');
      return true;
    } catch (error) {
      // Provide helpful error messages for common issues
      let helpMessage = '';
      if (error.message.includes('invalid_grant') || error.message.includes('Invalid JWT')) {
        helpMessage = '\n\nPossible causes:\n' +
          '  - Private key format is incorrect (missing \\n newlines)\n' +
          '  - Service account credentials are expired\n' +
          '  - Client email doesn\'t match the private key';
      } else if (error.message.includes('Not found') || error.message.includes('404')) {
        helpMessage = '\n\nPossible causes:\n' +
          '  - Spreadsheet ID is incorrect\n' +
          '  - Spreadsheet was deleted\n' +
          '  - Service account doesn\'t have access (share spreadsheet with service account email!)';
      } else if (error.message.includes('forbidden') || error.message.includes('403')) {
        helpMessage = '\n\nPossible causes:\n' +
          '  - Google Sheets API not enabled for your project\n' +
          '  - Service account doesn\'t have Editor permissions on spreadsheet\n' +
          '  - Share the spreadsheet with your service account email as Editor';
      }

      this._log('error', `[SheetManager] Authentication failed: ${error.message}${helpMessage}`);
      throw new Error(`Google Sheets authentication failed: ${error.message}${helpMessage}`);
    }
  }

  /**
   * Get list of existing sheet names in the spreadsheet
   * @returns {Promise<string[]>} - Array of sheet names
   */
  async getExistingSheetNames() {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
        fields: 'sheets.properties.title'
      });

      return response.data.sheets?.map(sheet => sheet.properties.title) || [];
    } catch (error) {
      this._log('error', `[SheetManager] Failed to get sheet names: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a unique sheet name (appends number if duplicate exists)
   * @param {string} baseName - Desired sheet name
   * @returns {Promise<string>} - Unique sheet name
   */
  async getUniqueSheetName(baseName) {
    const existingNames = await this.getExistingSheetNames();

    // Truncate to 100 characters (Google Sheets limit)
    let name = baseName.length > 100 ? baseName.substring(0, 100) : baseName;

    if (!existingNames.includes(name)) {
      return name;
    }

    // Find a unique name by appending (2), (3), etc.
    let counter = 2;
    let uniqueName;
    do {
      uniqueName = `${name.substring(0, 95)} (${counter})`;
      counter++;
    } while (existingNames.includes(uniqueName));

    return uniqueName;
  }

  /**
   * Create a new sheet/tab in the spreadsheet
   * @param {string} sheetName - Name for the new sheet
   * @param {Object} options - Optional settings
   * @param {number} options.rowCount - Number of rows (default: 1000, expands automatically for larger datasets)
   * @param {number} options.columnCount - Number of columns (default: 26)
   * @returns {Promise<{sheetId: number, sheetName: string}>} - The new sheet's info
   */
  async createSheet(sheetName, options = {}) {
    try {
      const uniqueName = await this.getUniqueSheetName(sheetName);

      // Calculate row count: default 1000, or expand for larger datasets
      // Add 100 row buffer for safety
      const rowCount = options.rowCount ? Math.max(options.rowCount + 100, 1000) : 1000;
      const columnCount = options.columnCount || 26;

      if (options.rowCount && options.rowCount > 1000) {
        this._log('info', `[SheetManager] Creating sheet with ${rowCount} rows (expanded for ${options.rowCount} data rows)`);
      }

      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: uniqueName,
                  gridProperties: {
                    rowCount: rowCount,
                    columnCount: columnCount
                  }
                }
              }
            }
          ]
        }
      });

      const sheetId = response.data.replies[0].addSheet.properties.sheetId;

      this._log('info', `[SheetManager] Created sheet: "${uniqueName}" (ID: ${sheetId}, rows: ${rowCount})`);

      return {
        sheetId,
        sheetName: uniqueName,
        spreadsheetId: this.spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit#gid=${sheetId}`
      };
    } catch (error) {
      this._log('error', `[SheetManager] Failed to create sheet: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get spreadsheet info
   * @param {string} spreadsheetId - Spreadsheet ID (uses default if not provided)
   * @returns {Promise<Object>} - Spreadsheet info
   */
  async getSpreadsheet(spreadsheetId = null) {
    try {
      const id = spreadsheetId || this.spreadsheetId;
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: id
      });

      return response.data;
    } catch (error) {
      this._log('error', `[SheetManager] Failed to get spreadsheet: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write rows to a range in the spreadsheet
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} range - A1 notation range (e.g., "'Sheet1'!A1:E100")
   * @param {Array<Array>} values - 2D array of values
   * @returns {Promise<Object>} - Update response
   */
  async writeRows(spreadsheetId, range, values) {
    try {
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId || this.spreadsheetId,
        range: range,
        valueInputOption: 'RAW',
        requestBody: {
          values: values
        }
      });

      this._log('debug', `[SheetManager] Wrote ${values.length} rows to ${range}`);
      return response.data;
    } catch (error) {
      this._log('error', `[SheetManager] Failed to write rows: ${error.message}`);
      throw error;
    }
  }

  /**
   * Append rows to a sheet
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} range - A1 notation range (e.g., "'Sheet1'!A:E")
   * @param {Array<Array>} values - 2D array of values
   * @returns {Promise<Object>} - Append response
   */
  async appendRows(spreadsheetId, range, values) {
    try {
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId || this.spreadsheetId,
        range: range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: values
        }
      });

      this._log('debug', `[SheetManager] Appended ${values.length} rows to ${range}`);
      return response.data;
    } catch (error) {
      this._log('error', `[SheetManager] Failed to append rows: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format the header row (bold, frozen)
   * @param {number} sheetId - Sheet ID to format
   * @param {number} columnCount - Number of columns in header
   * @returns {Promise<void>}
   */
  async formatHeaders(sheetId, columnCount) {
    try {
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
                  endColumnIndex: columnCount
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: {
                      bold: true
                    },
                    backgroundColor: {
                      red: 0.9,
                      green: 0.9,
                      blue: 0.9
                    }
                  }
                },
                fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor'
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

      this._log('debug', '[SheetManager] Formatted header row (bold, frozen, gray background)');
    } catch (error) {
      this._log('warn', `[SheetManager] Failed to format headers: ${error.message}`);
      // Don't throw - formatting is optional
    }
  }

  /**
   * Auto-resize columns to fit content
   * @param {number} sheetId - Sheet ID
   * @param {number} columnCount - Number of columns to resize
   * @returns {Promise<void>}
   */
  async autoResizeColumns(sheetId, columnCount) {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: columnCount
                }
              }
            }
          ]
        }
      });

      this._log('debug', '[SheetManager] Auto-resized columns');
    } catch (error) {
      this._log('warn', `[SheetManager] Failed to auto-resize columns: ${error.message}`);
      // Don't throw - resizing is optional
    }
  }
}

module.exports = SheetManager;
