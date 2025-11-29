/**
 * Base Scraper Class
 * Provides shared functionality for all scraper implementations.
 * Scrapers should extend this class to avoid code duplication.
 * Features:
 * - Email/phone/name extraction (delegated to contact-extractor)
 * - Domain classification
 * - Confidence calculation
 * - PDF rendering support
 */
const DomainExtractor = require('../utils/domain-extractor');
const contactExtractor = require('../utils/contact-extractor');
const ProfileVisitor = require('../utils/profile-visitor');

class BaseScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.extractor = contactExtractor;
    this.domainExtractor = new DomainExtractor(logger);
    this.processedEmails = new Set();
    this.profileVisitor = null; // Lazy initialized
  }

  /**
   * Get or create ProfileVisitor instance
   * @param {Object} config - Site-specific configuration
   * @returns {ProfileVisitor}
   */
  getProfileVisitor(config = {}) {
    if (!this.profileVisitor) {
      const profileConfig = config.profileVisiting || {};
      this.profileVisitor = new ProfileVisitor({
        logger: this.logger,
        config: config,
        navigationTimeout: profileConfig.navigationTimeout || 30000,
        extractionDelay: profileConfig.extractionDelay || 1000,
        maxRetries: profileConfig.maxRetries || 2,
        retryDelay: profileConfig.retryDelay || 2000,
        skipIfEmailExists: profileConfig.skipIfEmailExists !== false
      });
    }
    return this.profileVisitor;
  }

  /**
   * Enrich contacts by visiting profile pages
   * Only visits profiles for contacts missing emails
   * @param {Array} contacts - Array of contacts with profileUrl field
   * @param {Object} page - Puppeteer page instance
   * @param {Object} config - Site-specific configuration
   * @returns {Promise<Object>} - { enrichedContacts, stats }
   */
  async enrichContactsFromProfiles(contacts, page, config = {}) {
    const profileConfig = config.profileVisiting || {};

    // Skip if profile visiting is disabled
    if (!profileConfig.enabled) {
      this.logger.log('[BaseScraper] Profile visiting disabled, skipping enrichment');
      return { enrichedContacts: contacts, stats: { skipped: contacts.length } };
    }

    // Filter contacts that need enrichment (have profileUrl but no email)
    const needsEnrichment = contacts.filter(c => c.profileUrl && !c.email);

    if (needsEnrichment.length === 0) {
      this.logger.log('[BaseScraper] No contacts need profile enrichment');
      return { enrichedContacts: contacts, stats: { skipped: contacts.length } };
    }

    this.logger.log(`[BaseScraper] Enriching ${needsEnrichment.length} contacts from profiles`);

    const visitor = this.getProfileVisitor(config);
    return await visitor.visitProfiles(contacts, page, config);
  }
  // ===========================
  // EMAIL EXTRACTION
  // ===========================
  /**
   * Extract emails from text
   * @param {string} text - Text to search
   * @param {string|null} filterDomain - Optional domain filter
   * @returns {Array<string>} - Array of emails
   */
  extractEmails(text, filterDomain = null) {
    return this.extractor.extractEmails(text, filterDomain);
  }
  // ===========================
  // PHONE EXTRACTION
  // ===========================
  /**
   * Extract phone numbers from text
   * @param {string} text - Text to search
   * @returns {Array<string>} - Array of phone numbers
   */
  extractPhones(text) {
    return this.extractor.extractPhones(text);
  }
  /**
   * Normalize phone number to standard format
   * @param {string} phone - Phone number
   * @returns {string|null} - Normalized phone
   */
  normalizePhone(phone) {
    return this.extractor.normalizePhone(phone);
  }
  // ===========================
  // NAME VALIDATION & EXTRACTION
  // ===========================
  /**
   * Validate and clean a name string
   * @param {string} text - Text to validate
   * @returns {string|null} - Cleaned name or null
   */
  validateAndCleanName(text) {
    return this.extractor.validateAndCleanName(text);
  }
  /**
   * Check if text is a valid name candidate
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  isValidNameCandidate(text) {
    return this.extractor.isValidNameCandidate(text);
  }
  /**
   * Extract name from email address (fallback method)
   * @param {string} email - Email address
   * @returns {string|null} - Derived name or null
   */
  extractNameFromEmail(email) {
    return this.extractor.extractNameFromEmail(email);
  }
  // ===========================
  // CONTEXT-BASED EXTRACTION
  // ===========================
  /**
   * Find name in surrounding context
   * @param {string} beforeContext - Text before email
   * @param {string} email - Email for matching
   * @param {number} emailPos - Position of email
   * @returns {Object|null} - {name, distance, score} or null
   */
  findNameInContext(beforeContext, email, emailPos) {
    return this.extractor.findNameInContext(beforeContext, email, emailPos);
  }
  /**
   * Find phone number in context
   * @param {string} context - Text to search
   * @returns {string|null} - Phone or null
   */
  findPhoneInContext(context) {
    return this.extractor.findPhoneInContext(context);
  }
  // ===========================
  // PDF RENDERING
  // ===========================
  /**
   * Render page to PDF and parse text
   * @param {Object} page - Puppeteer page
   * @param {boolean} keepPdf - Keep PDF file
   * @returns {Promise<Object>} - {fullText, sections}
   */
  async renderAndParsePdf(page, keepPdf = false) {
    return await this.extractor.renderAndParsePdf(page, keepPdf, this.logger);
  }
  // ===========================
  // DOMAIN CLASSIFICATION
  // ===========================
  /**
   * Add domain info to a contact object
   * Modifies contact in place with domain and domainType fields
   * @param {Object} contact - Contact object with email field
   */
  addDomainInfo(contact) {
    if (!contact.email) {
      contact.domain = null;
      contact.domainType = null;
      return;
    }
    const domain = this.domainExtractor.extractAndNormalize(contact.email);
    if (!domain) {
      contact.domain = null;
      contact.domainType = null;
      return;
    }
    contact.domain = domain;
    contact.domainType = this.domainExtractor.isBusinessDomain(domain) ? 'business' : 'personal';
  }
  // ===========================
  // CONFIDENCE CALCULATION
  // ===========================
  /**
   * Calculate confidence level based on available data
   * @param {string|null} name - Contact name
   * @param {string|null} email - Contact email
   * @param {string|null} phone - Contact phone
   * @returns {string} - 'high', 'medium', or 'low'
   */
  calculateConfidence(name, email, phone) {
    return this.extractor.calculateConfidence(name, email, phone);
  }

  // ===========================
  // HELPER UTILITIES
  // ===========================

  /**
   * Escape special regex characters
   * @param {string} str - String to escape
   * @returns {string} - Escaped string
   */
  escapeRegex(str) {
    return this.extractor.escapeRegex(str);
  }

  /**
   * Convert string to title case
   * @param {string} str - String to convert
   * @returns {string} - Title cased string
   */
  toTitleCase(str) {
    return this.extractor.toTitleCase(str);
  }

  // ===========================
  // DEDUPLICATION
  // ===========================

  /**
   * Check if email has been processed
   * @param {string} email - Email to check
   * @returns {boolean}
   */
  isEmailProcessed(email) {
    return this.processedEmails.has(email?.toLowerCase());
  }

  /**
   * Mark email as processed
   * @param {string} email - Email to mark
   */
  markEmailProcessed(email) {
    if (email) {
      this.processedEmails.add(email.toLowerCase());
    }
  }

  /**
   * Clear processed emails set
   */
  clearProcessedEmails() {
    this.processedEmails.clear();
  }

  // ===========================
  // ABSTRACT METHODS
  // ===========================

  /**
   * Scrape contacts from a URL
   * Must be implemented by subclasses
   * @param {string} url - URL to scrape
   * @param {number} limit - Max contacts
   * @param {boolean} keep - Keep PDF files
   * @param {number} pageNum - Current page number
   * @param {string} sourceUrl - Original source URL
   * @returns {Promise<Array>} - Array of contacts
   */
  async scrape(url, limit, keep, pageNum, sourceUrl) {
    throw new Error('scrape() must be implemented by subclass');
  }
}

module.exports = BaseScraper;
