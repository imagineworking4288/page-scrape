/**
 * Data Cleaner
 *
 * Main orchestrator for the post-enrichment data cleaning system.
 * Cleans contact data by:
 * 1. Extracting valid patterns from structured fields (email, phone)
 * 2. Removing foreign patterns from text fields (name, title, location)
 */

const { EmailExtractor, PhoneExtractor } = require('./extractors');
const { NameCleaner, TitleCleaner, LocationCleaner } = require('./cleaners');
const { ReportGenerator } = require('./report-generator');

class DataCleaner {
  /**
   * Create a DataCleaner instance
   * @param {Object} logger - Logger instance
   * @param {Object} options - Options
   */
  constructor(logger, options = {}) {
    this.logger = logger;
    this.options = options;

    // Initialize extractors
    this.emailExtractor = new EmailExtractor();
    this.phoneExtractor = new PhoneExtractor();

    // Initialize cleaners
    this.nameCleaner = new NameCleaner();
    this.titleCleaner = new TitleCleaner();
    this.locationCleaner = new LocationCleaner();
  }

  /**
   * Clean all contacts and generate a report
   * @param {Array<Object>} contacts - Array of contacts to clean
   * @returns {Object} - { contacts: Array, report: Object }
   */
  cleanAll(contacts) {
    if (!Array.isArray(contacts)) {
      this.logger.warn('[DataCleaner] Input is not an array, returning empty result');
      return { contacts: [], report: null };
    }

    const reportGenerator = new ReportGenerator();
    reportGenerator.startTimer();

    this.logger.info(`[DataCleaner] Processing ${contacts.length} contacts...`);

    const cleanedContacts = [];

    for (const contact of contacts) {
      const { cleaned, wasModified, results } = this.cleanContact(contact);
      cleanedContacts.push(cleaned);

      // Record results in report
      reportGenerator.recordExtraction('email', results.email);
      reportGenerator.recordExtraction('phone', results.phone);
      reportGenerator.recordCleaning('name', results.name);
      reportGenerator.recordCleaning('title', results.title);
      reportGenerator.recordCleaning('location', results.location);
      reportGenerator.recordContact(wasModified);
    }

    reportGenerator.stopTimer();
    const report = reportGenerator.generate();

    // Log summary statistics
    this.logSummary(report);

    return {
      contacts: cleanedContacts,
      report
    };
  }

  /**
   * Clean a single contact
   * @param {Object} contact - Contact to clean
   * @returns {Object} - { cleaned: Object, wasModified: boolean, results: Object }
   */
  cleanContact(contact) {
    // Extract/clean each field
    const emailResult = this.emailExtractor.extract(contact.email);
    const phoneResult = this.phoneExtractor.extract(contact.phone);
    const nameResult = this.nameCleaner.clean(contact.name);
    const titleResult = this.titleCleaner.clean(contact.title);
    const locationResult = this.locationCleaner.clean(contact.location);

    // Build cleaned contact
    const cleaned = {
      // Pattern extraction fields
      email: emailResult.value,
      phone: phoneResult.value,

      // Foreign pattern removal fields
      name: nameResult.value,
      title: titleResult.value,
      location: locationResult.value,

      // Pass through unchanged - profileUrl is validated by enrichment
      profileUrl: contact.profileUrl
    };

    // Preserve any additional fields from original contact
    // (pageNum, confidence, source, enrichment metadata, etc.)
    for (const key of Object.keys(contact)) {
      if (!(key in cleaned)) {
        cleaned[key] = contact[key];
      }
    }

    // Determine if contact was modified
    const wasModified =
      emailResult.modified ||
      phoneResult.modified ||
      nameResult.modified ||
      titleResult.modified ||
      locationResult.modified;

    return {
      cleaned,
      wasModified,
      results: {
        email: emailResult,
        phone: phoneResult,
        name: nameResult,
        title: titleResult,
        location: locationResult
      }
    };
  }

  /**
   * Log summary statistics
   * @param {Object} report - Generated report
   */
  logSummary(report) {
    const { byField, summary } = report;

    // Email summary
    const emailExtracted = byField.email.extracted;
    const emailNullified = byField.email.nullified;
    if (emailExtracted > 0 || emailNullified > 0) {
      this.logger.info(`[DataCleaner] email: ${emailExtracted} extracted, ${emailNullified} nullified`);
    }

    // Phone summary
    const phoneExtracted = byField.phone.extracted;
    const phoneNullified = byField.phone.nullified;
    if (phoneExtracted > 0 || phoneNullified > 0) {
      this.logger.info(`[DataCleaner] phone: ${phoneExtracted} extracted, ${phoneNullified} nullified`);
    }

    // Name summary
    if (byField.name.modified > 0) {
      const removals = byField.name.removals;
      const parts = [];
      if (removals.titleSuffix > 0) parts.push(`${removals.titleSuffix} title suffixes`);
      if (removals.credentialSuffix > 0) parts.push(`${removals.credentialSuffix} credentials`);
      if (removals.email > 0 || removals.phone > 0) {
        parts.push(`${removals.email + removals.phone} patterns`);
      }
      if (removals.spam > 0) parts.push(`${removals.spam} spam`);

      const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
      this.logger.info(`[DataCleaner] name: ${byField.name.modified} cleaned${detail}`);
    }

    // Title summary
    if (byField.title.modified > 0) {
      this.logger.info(`[DataCleaner] title: ${byField.title.modified} cleaned`);
    }

    // Location summary
    if (byField.location.modified > 0) {
      const removals = byField.location.removals;
      const phoneCount = removals.phone || 0;
      const emailCount = removals.email || 0;
      const parts = [];
      if (phoneCount > 0) parts.push(`${phoneCount} phone patterns`);
      if (emailCount > 0) parts.push(`${emailCount} email patterns`);
      const detail = parts.length > 0 ? ` (${parts.join(', ')} removed)` : '';
      this.logger.info(`[DataCleaner] location: ${byField.location.modified} cleaned${detail}`);
    }

    // Warn on high nullification rates
    const emailNullRate = byField.email.total > 0 ? emailNullified / byField.email.total : 0;
    const phoneNullRate = byField.phone.total > 0 ? phoneNullified / byField.phone.total : 0;

    if (emailNullRate > 0.1) {
      this.logger.warn(`[DataCleaner] High email nullification rate: ${(emailNullRate * 100).toFixed(1)}%`);
    }
    if (phoneNullRate > 0.1) {
      this.logger.warn(`[DataCleaner] High phone nullification rate: ${(phoneNullRate * 100).toFixed(1)}%`);
    }

    // Final summary
    this.logger.info(`[DataCleaner] Complete: ${summary.fieldsModified} fields modified across ${summary.totalContacts} contacts`);
  }
}

module.exports = { DataCleaner };
