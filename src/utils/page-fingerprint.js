/**
 * Page Fingerprint Validator
 *
 * Detects when paginated pages return duplicate content from page 1.
 * Used by binary search to find true pagination boundaries and avoid
 * false positives where websites serve page 1 content for invalid page numbers.
 *
 * @example
 * const fingerprint = new PageFingerprint(logger);
 * fingerprint.capturePage1(page1Contacts);
 * const validation = fingerprint.validate(5, page5Contacts);
 * if (!validation.valid) {
 *   logger.warn(`Page 5 is invalid: ${validation.reason}`);
 * }
 */

class PageFingerprint {
  constructor(logger = console) {
    this.logger = logger;
    this.page1Fingerprint = null;
  }

  /**
   * Capture fingerprint from page 1 contacts
   * Call this once before starting pagination validation
   * @param {Array} contacts - Contacts extracted from page 1
   */
  capturePage1(contacts) {
    if (!contacts || contacts.length === 0) {
      this.logger.warn('[Fingerprint] Page 1 has no contacts - cannot create fingerprint');
      this.page1Fingerprint = null;
      return;
    }

    this.page1Fingerprint = {
      firstContactName: contacts[0]?.name || null,
      lastContactName: contacts[contacts.length - 1]?.name || null,
      contactCount: contacts.length,
      urlHash: this._generateUrlHash(contacts),
      nameHash: this._generateNameHash(contacts)
    };

    this.logger.info(`[Fingerprint] Captured page 1 fingerprint: ${contacts.length} contacts`);
    this.logger.debug(`[Fingerprint] URL hash: ${this.page1Fingerprint.urlHash}`);
    this.logger.debug(`[Fingerprint] Name hash: ${this.page1Fingerprint.nameHash}`);
  }

  /**
   * Check if a page's contacts are valid (not duplicates of page 1)
   * @param {number} pageNum - Page number being tested
   * @param {Array} contacts - Contacts extracted from test page
   * @returns {Object} { valid: boolean, reason: string }
   */
  validate(pageNum, contacts) {
    // Page 1 is always valid
    if (pageNum === 1) {
      return { valid: true, reason: 'page_1' };
    }

    // No contacts = invalid page
    if (!contacts || contacts.length === 0) {
      return { valid: false, reason: 'empty' };
    }

    // No fingerprint captured = skip validation (fall back to old behavior)
    if (!this.page1Fingerprint) {
      this.logger.warn('[Fingerprint] No page 1 fingerprint available - skipping validation');
      return { valid: true, reason: 'no_fingerprint' };
    }

    // Check URL hash match (primary detection method)
    const currentUrlHash = this._generateUrlHash(contacts);
    if (currentUrlHash === this.page1Fingerprint.urlHash) {
      this.logger.warn(`[Fingerprint] Page ${pageNum} matches page 1 profile URLs - DUPLICATE DETECTED`);
      return { valid: false, reason: 'duplicate_urls' };
    }

    // Check name hash match (backup detection for sites without profile URLs)
    const currentNameHash = this._generateNameHash(contacts);
    if (currentNameHash === this.page1Fingerprint.nameHash) {
      this.logger.warn(`[Fingerprint] Page ${pageNum} matches page 1 contact names - DUPLICATE DETECTED`);
      return { valid: false, reason: 'duplicate_names' };
    }

    // Additional check: first/last contact comparison (triple verification)
    if (contacts[0]?.name === this.page1Fingerprint.firstContactName &&
        contacts[contacts.length - 1]?.name === this.page1Fingerprint.lastContactName &&
        contacts.length === this.page1Fingerprint.contactCount) {
      this.logger.warn(`[Fingerprint] Page ${pageNum} has identical first/last contacts as page 1 - DUPLICATE DETECTED`);
      return { valid: false, reason: 'duplicate_boundaries' };
    }

    return { valid: true, reason: 'unique' };
  }

  /**
   * Reset fingerprint (call when starting new scrape)
   */
  reset() {
    this.page1Fingerprint = null;
    this.logger.debug('[Fingerprint] Reset fingerprint state');
  }

  /**
   * Generate hash from profile URLs of first 5 contacts
   * This is the most reliable method for detecting duplicates
   * @param {Array} contacts - Contact array
   * @returns {string} Hash string
   * @private
   */
  _generateUrlHash(contacts) {
    return contacts
      .slice(0, 5)
      .map(c => c.profileUrl || c.name || '')
      .join('|');
  }

  /**
   * Generate hash from names of first 5 contacts
   * Backup method for sites without profile URLs
   * @param {Array} contacts - Contact array
   * @returns {string} Hash string
   * @private
   */
  _generateNameHash(contacts) {
    return contacts
      .slice(0, 5)
      .map(c => c.name || '')
      .join('|');
  }
}

module.exports = { PageFingerprint };
