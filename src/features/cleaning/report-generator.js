/**
 * Cleaning Report Generator
 *
 * Generates detailed reports from cleaning operations.
 * Tracks extraction results, cleaning modifications, and timing.
 */

class ReportGenerator {
  constructor() {
    this.startTime = null;
    this.endTime = null;

    // Track extraction results for email and phone
    this.extractionStats = {
      email: { total: 0, extracted: 0, nullified: 0, unchanged: 0 },
      phone: { total: 0, extracted: 0, nullified: 0, unchanged: 0 }
    };

    // Track cleaning results for name, title, location
    this.cleaningStats = {
      name: {
        total: 0,
        modified: 0,
        unchanged: 0,
        removals: {
          titleSuffix: 0,
          credentialSuffix: 0,
          email: 0,
          phone: 0,
          spam: 0
        }
      },
      title: {
        total: 0,
        modified: 0,
        unchanged: 0,
        removals: {
          email: 0,
          phone: 0
        }
      },
      location: {
        total: 0,
        modified: 0,
        unchanged: 0,
        removals: {
          email: 0,
          phone: 0
        }
      }
    };

    // Track overall contact changes
    this.contactStats = {
      total: 0,
      modified: 0,
      unchanged: 0
    };
  }

  /**
   * Start the timer
   */
  startTimer() {
    this.startTime = Date.now();
  }

  /**
   * Stop the timer
   */
  stopTimer() {
    this.endTime = Date.now();
  }

  /**
   * Record an extraction result (for email or phone)
   * @param {string} fieldName - 'email' or 'phone'
   * @param {Object} result - Extraction result { value, original, modified, valid }
   */
  recordExtraction(fieldName, result) {
    if (!this.extractionStats[fieldName]) return;

    this.extractionStats[fieldName].total++;

    if (result.original === null || result.original === undefined || result.original === '') {
      // Input was empty, output is null - unchanged (no data)
      this.extractionStats[fieldName].unchanged++;
    } else if (result.valid && result.value) {
      // Valid extraction
      if (result.modified) {
        this.extractionStats[fieldName].extracted++;
      } else {
        this.extractionStats[fieldName].unchanged++;
      }
    } else {
      // Input had value but extraction failed - nullified
      this.extractionStats[fieldName].nullified++;
    }
  }

  /**
   * Record a cleaning result (for name, title, location)
   * @param {string} fieldName - 'name', 'title', or 'location'
   * @param {Object} result - Cleaning result { value, original, modified, removed, valid }
   */
  recordCleaning(fieldName, result) {
    if (!this.cleaningStats[fieldName]) return;

    this.cleaningStats[fieldName].total++;

    if (result.original === null || result.original === undefined || result.original === '') {
      // Input was empty - unchanged
      this.cleaningStats[fieldName].unchanged++;
      return;
    }

    if (result.modified) {
      this.cleaningStats[fieldName].modified++;

      // Track what was removed
      if (result.removed && Array.isArray(result.removed)) {
        for (const removal of result.removed) {
          const removalType = removal.type;
          if (this.cleaningStats[fieldName].removals.hasOwnProperty(removalType)) {
            this.cleaningStats[fieldName].removals[removalType]++;
          }
        }
      }
    } else {
      this.cleaningStats[fieldName].unchanged++;
    }
  }

  /**
   * Record whether a contact was modified
   * @param {boolean} wasModified - Whether the contact was modified
   */
  recordContact(wasModified) {
    this.contactStats.total++;
    if (wasModified) {
      this.contactStats.modified++;
    } else {
      this.contactStats.unchanged++;
    }
  }

  /**
   * Calculate total fields modified
   * @returns {number} - Total number of field modifications
   */
  calculateFieldsModified() {
    let total = 0;

    // Count extraction modifications
    total += this.extractionStats.email.extracted;
    total += this.extractionStats.email.nullified;
    total += this.extractionStats.phone.extracted;
    total += this.extractionStats.phone.nullified;

    // Count cleaning modifications
    total += this.cleaningStats.name.modified;
    total += this.cleaningStats.title.modified;
    total += this.cleaningStats.location.modified;

    return total;
  }

  /**
   * Generate the final report
   * @returns {Object} - Complete cleaning report
   */
  generate() {
    if (!this.endTime) {
      this.stopTimer();
    }

    const processingTimeMs = this.endTime - this.startTime;

    return {
      summary: {
        totalContacts: this.contactStats.total,
        contactsModified: this.contactStats.modified,
        contactsUnchanged: this.contactStats.unchanged,
        fieldsModified: this.calculateFieldsModified(),
        processingTimeMs
      },
      byField: {
        email: {
          total: this.extractionStats.email.total,
          extracted: this.extractionStats.email.extracted,
          nullified: this.extractionStats.email.nullified,
          unchanged: this.extractionStats.email.unchanged
        },
        phone: {
          total: this.extractionStats.phone.total,
          extracted: this.extractionStats.phone.extracted,
          nullified: this.extractionStats.phone.nullified,
          unchanged: this.extractionStats.phone.unchanged
        },
        name: {
          total: this.cleaningStats.name.total,
          modified: this.cleaningStats.name.modified,
          unchanged: this.cleaningStats.name.unchanged,
          removals: { ...this.cleaningStats.name.removals }
        },
        title: {
          total: this.cleaningStats.title.total,
          modified: this.cleaningStats.title.modified,
          unchanged: this.cleaningStats.title.unchanged,
          removals: { ...this.cleaningStats.title.removals }
        },
        location: {
          total: this.cleaningStats.location.total,
          modified: this.cleaningStats.location.modified,
          unchanged: this.cleaningStats.location.unchanged,
          removals: { ...this.cleaningStats.location.removals }
        }
      },
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }
}

module.exports = { ReportGenerator };
