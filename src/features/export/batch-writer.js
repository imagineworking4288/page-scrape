/**
 * Batch Writer
 *
 * Handles efficient batch write operations to Google Sheets with progress reporting.
 * Splits large datasets into batches to avoid API limits.
 */

class BatchWriter {
  constructor(sheetManager, logger = null) {
    this.sheetManager = sheetManager;
    this.logger = logger;
    this.defaultBatchSize = 100;
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
   * Write a single batch of rows
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} range - A1 notation range
   * @param {Array<Array>} rows - 2D array of row values
   * @param {number} batchNumber - Current batch number (1-based)
   * @param {number} totalBatches - Total number of batches
   * @returns {Promise<Object>} - Write response
   */
  async writeBatch(spreadsheetId, range, rows, batchNumber, totalBatches) {
    try {
      this._log('debug', `[BatchWriter] Writing batch ${batchNumber}/${totalBatches} (${rows.length} rows)`);

      const response = await this.sheetManager.writeRows(spreadsheetId, range, rows);

      return response;
    } catch (error) {
      this._log('error', `[BatchWriter] Batch ${batchNumber} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write all rows to a sheet in batches
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} sheetName - Sheet name
   * @param {Array<Array>} rows - 2D array of all row values (including header)
   * @param {Object} options - Write options
   * @param {number} options.batchSize - Rows per batch (default: 100)
   * @param {Function} options.onProgress - Progress callback (batchNum, totalBatches, rowsWritten)
   * @returns {Promise<{success: boolean, rowsWritten: number, batches: number}>}
   */
  async writeAllRows(spreadsheetId, sheetName, rows, options = {}) {
    const batchSize = options.batchSize || this.defaultBatchSize;
    const onProgress = options.onProgress || null;

    if (!rows || rows.length === 0) {
      this._log('warn', '[BatchWriter] No rows to write');
      return { success: true, rowsWritten: 0, batches: 0 };
    }

    // Calculate batches
    const totalRows = rows.length;
    const totalBatches = Math.ceil(totalRows / batchSize);

    this._log('info', `[BatchWriter] Writing ${totalRows} rows in ${totalBatches} batch(es)`);

    let rowsWritten = 0;

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const startRow = batchNum * batchSize;
      const endRow = Math.min(startRow + batchSize, totalRows);
      const batchRows = rows.slice(startRow, endRow);

      // Calculate range (1-indexed, starts at row 1 for first batch)
      const startRowNum = startRow + 1;
      const range = this.calculateRange(sheetName, startRowNum, startRowNum + batchRows.length - 1, batchRows[0]?.length || 1);

      await this.writeBatch(spreadsheetId, range, batchRows, batchNum + 1, totalBatches);

      rowsWritten += batchRows.length;

      // Call progress callback if provided
      if (onProgress) {
        onProgress(batchNum + 1, totalBatches, rowsWritten);
      }

      // Small delay between batches to be nice to the API
      if (batchNum < totalBatches - 1) {
        await this._delay(100);
      }
    }

    this._log('info', `[BatchWriter] Successfully wrote ${rowsWritten} rows`);

    return {
      success: true,
      rowsWritten,
      batches: totalBatches
    };
  }

  /**
   * Calculate A1 notation range for a batch
   * @param {string} sheetName - Sheet name
   * @param {number} startRow - Start row (1-indexed)
   * @param {number} endRow - End row (1-indexed)
   * @param {number} columnCount - Number of columns
   * @returns {string} - A1 notation range (e.g., "'Sheet1'!A1:E100")
   */
  calculateRange(sheetName, startRow, endRow, columnCount) {
    const endColumn = this._columnToLetter(columnCount);
    return `'${sheetName}'!A${startRow}:${endColumn}${endRow}`;
  }

  /**
   * Convert column number to letter (1=A, 2=B, 26=Z, 27=AA)
   * @param {number} column - Column number (1-indexed)
   * @returns {string} - Column letter
   * @private
   */
  _columnToLetter(column) {
    let letter = '';
    while (column > 0) {
      const remainder = (column - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      column = Math.floor((column - 1) / 26);
    }
    return letter || 'A';
  }

  /**
   * Small delay helper
   * @param {number} ms - Milliseconds to delay
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BatchWriter;
