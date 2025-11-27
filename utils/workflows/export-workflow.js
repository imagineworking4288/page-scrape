/**
 * Export Workflow
 *
 * Handles exporting scraped contacts to various formats:
 * - JSON file with metadata
 * - Google Sheets (if configured)
 */

const fs = require('fs');
const path = require('path');

class ExportWorkflow {
  constructor(options = {}) {
    this.logger = options.logger;
    this.outputDir = options.outputDir || path.join(process.cwd(), 'output');
    this.exportToSheets = options.exportToSheets !== false;
    this.sheetsExporter = options.sheetsExporter || null;
  }

  /**
   * Ensure output directory exists
   */
  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate output filename with timestamp
   * @param {string} prefix - Filename prefix
   * @returns {string} - Full file path
   */
  generateFilename(prefix = 'contacts') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.outputDir, `${prefix}-${timestamp}.json`);
  }

  /**
   * Build output data structure
   * @param {Object} workflowResult - Result from ScrapingWorkflow
   * @param {string} url - Original target URL
   * @returns {Object} - Output data structure
   */
  buildOutputData(workflowResult, url) {
    const contacts = workflowResult.contacts || [];
    const domainStats = workflowResult.domainStats || {};

    return {
      metadata: {
        scrapedAt: new Date().toISOString(),
        url: url,
        totalContacts: contacts.length,
        pagesScraped: workflowResult.stats?.pagesScraped || 1,
        duplicatesRemoved: workflowResult.stats?.duplicatesRemoved || 0,
        domainStats: {
          uniqueDomains: domainStats.uniqueDomains || 0,
          businessDomains: domainStats.businessDomains || 0,
          personalDomains: domainStats.personalEmailCount || 0,
          businessEmailCount: domainStats.businessEmailCount || 0,
          personalEmailCount: domainStats.personalEmailCount || 0,
          topDomains: (domainStats.topDomains || []).slice(0, 10),
          topBusinessDomains: (domainStats.topBusinessDomains || []).slice(0, 10)
        }
      },
      contacts: contacts
    };
  }

  /**
   * Save contacts to JSON file
   * @param {Object} outputData - Output data structure
   * @param {string} filepath - Output file path
   * @returns {string} - Saved file path
   */
  saveToJson(outputData, filepath = null) {
    this.ensureOutputDir();

    const outputFile = filepath || this.generateFilename();
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

    this.logger.info(`Contacts saved to: ${outputFile}`);
    return outputFile;
  }

  /**
   * Export to Google Sheets
   * @param {string} jsonFilePath - Path to JSON file to export
   * @returns {Promise<string|null>} - Sheet name or null
   */
  async exportToGoogleSheets(jsonFilePath) {
    if (!this.exportToSheets) {
      this.logger.debug('Google Sheets export disabled');
      return null;
    }

    if (!this.sheetsExporter) {
      this.logger.debug('Google Sheets exporter not configured');
      return null;
    }

    if (!this.sheetsExporter.isConfigured()) {
      this.logger.debug('Google Sheets credentials not configured');
      this.logger.debug('Set GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY, and GOOGLE_SHEETS_SPREADSHEET_ID in .env');
      return null;
    }

    try {
      this.logger.info('Exporting to Google Sheets...');
      const sheetName = await this.sheetsExporter.exportFromJson(jsonFilePath);
      if (sheetName) {
        this.logger.info(`Exported to Google Sheets: "${sheetName}"`);
      }
      return sheetName;
    } catch (error) {
      this.logger.warn(`Google Sheets export failed: ${error.message}`);
      this.logger.warn('JSON file was saved successfully.');
      return null;
    }
  }

  /**
   * Run the complete export workflow
   * @param {Object} workflowResult - Result from ScrapingWorkflow
   * @param {string} url - Original target URL
   * @returns {Promise<Object>} - Export result
   */
  async run(workflowResult, url) {
    // Skip if discovery only
    if (workflowResult.discoveryOnly) {
      return {
        skipped: true,
        reason: 'discovery-only mode'
      };
    }

    // Build output data
    const outputData = this.buildOutputData(workflowResult, url);

    // Save to JSON
    const jsonFilePath = this.saveToJson(outputData);

    // Export to Google Sheets
    let sheetName = null;
    if (this.exportToSheets) {
      sheetName = await this.exportToGoogleSheets(jsonFilePath);
    }

    return {
      skipped: false,
      jsonFilePath: jsonFilePath,
      sheetName: sheetName,
      contactCount: outputData.contacts.length
    };
  }
}

module.exports = ExportWorkflow;
