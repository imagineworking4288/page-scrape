/**
 * Profile Enricher
 *
 * Main orchestrator for the enrichment system.
 * Visits profile pages to fill missing data, validate existing data,
 * clean contaminated fields, and enrich with additional information.
 */

const fs = require('fs');
const path = require('path');
const ProfileExtractor = require('./profile-extractor');
const fieldComparator = require('./field-comparator');
const cleaners = require('./cleaners');

class ProfileEnricher {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;

    // Initialize profile extractor
    this.profileExtractor = new ProfileExtractor(browserManager, rateLimiter, logger);

    // Core fields that should always be considered for enrichment
    this.coreFields = ['name', 'email', 'phone', 'location', 'profileUrl', 'title'];

    // Statistics tracking
    this.stats = {
      total: 0,
      processed: 0,
      enriched: 0,
      validated: 0,
      cleaned: 0,
      replaced: 0,
      failed: 0,
      skipped: 0,
      fieldsEnriched: {},
      fieldsValidated: {},
      fieldsCleaned: {},
      fieldsMismatched: {}
    };

    // Contact buffer for incremental saves
    this.contactBuffer = [];
    this.bufferSize = 100;

    // Review queue for manual review
    this.reviewQueue = [];

    // Timing
    this.startTime = null;
    this.profileTimes = [];
  }

  /**
   * Enrich contacts from input file
   * @param {Array|string} contactsOrFile - Array of contacts or path to JSON file
   * @param {Object} options - Enrichment options
   * @returns {Object} - EnrichmentResult
   */
  async enrichContacts(contactsOrFile, options = {}) {
    // Set defaults
    const opts = {
      limit: options.limit || null,
      delay: options.delay || 3000,
      headless: options.headless !== false,
      validateOnly: options.validateOnly || false,
      saveProgressEvery: options.saveProgressEvery || 50,
      resumeFrom: options.resumeFrom || 0,
      skipErrors: options.skipErrors !== false,
      outputFile: options.outputFile || null,
      fieldsToEnrich: options.fieldsToEnrich || null,  // Specific fields to enrich
      onlyCoreFields: options.onlyCoreFields || false   // Only enrich core fields
    };

    this.startTime = Date.now();

    // Load contacts
    let contacts;
    let inputFile = null;
    if (typeof contactsOrFile === 'string') {
      inputFile = contactsOrFile;
      contacts = this.loadContactsFile(contactsOrFile);
    } else {
      contacts = contactsOrFile;
    }

    this.stats.total = contacts.length;
    this.logger.info(`[ProfileEnricher] Starting enrichment of ${contacts.length} contacts`);
    this.logger.info(`[ProfileEnricher] Options: limit=${opts.limit}, resumeFrom=${opts.resumeFrom}, validateOnly=${opts.validateOnly}`);

    // Determine output file
    const outputFile = opts.outputFile || this.getDefaultOutputFile(inputFile);

    // Process contacts
    const enrichedContacts = [];
    const startIndex = opts.resumeFrom;
    const endIndex = opts.limit ? Math.min(startIndex + opts.limit, contacts.length) : contacts.length;

    for (let i = startIndex; i < endIndex; i++) {
      const contact = contacts[i];

      try {
        // Determine which fields to enrich for this contact
        const fieldsToEnrich = this.getFieldsToEnrich(contact, opts);

        // Enrich single contact
        const enrichedContact = await this.enrichSingleContact(contact, i, endIndex, fieldsToEnrich);
        enrichedContacts.push(enrichedContact);

        // Update stats
        this.stats.processed++;

        // Log progress
        if ((i - startIndex + 1) % 10 === 0 || i === endIndex - 1) {
          this.logProgress(i - startIndex + 1, endIndex - startIndex);
        }

        // Save progress incrementally
        if ((i - startIndex + 1) % opts.saveProgressEvery === 0) {
          await this.saveProgress(enrichedContacts, outputFile);
        }
      } catch (error) {
        this.logger.error(`[ProfileEnricher] Error enriching contact ${i}: ${error.message}`);
        this.stats.failed++;

        if (opts.skipErrors) {
          // Keep original contact with error flag
          enrichedContacts.push({
            ...contact,
            enrichment: {
              error: error.message,
              enrichedAt: new Date().toISOString(),
              profileVisited: false
            }
          });
        } else {
          // Save progress and throw
          await this.saveProgress(enrichedContacts, outputFile);
          throw error;
        }
      }
    }

    // Final save
    await this.saveProgress(enrichedContacts, outputFile);

    // Calculate timing
    const totalTime = Date.now() - this.startTime;
    const avgTimePerProfile = this.profileTimes.length > 0 ?
      this.profileTimes.reduce((a, b) => a + b, 0) / this.profileTimes.length : 0;

    // Build result
    const result = {
      contacts: enrichedContacts,
      reviewQueue: this.reviewQueue,
      stats: this.stats,
      timing: {
        totalMs: totalTime,
        totalFormatted: this.formatDuration(totalTime),
        avgPerProfile: Math.round(avgTimePerProfile),
        avgPerProfileFormatted: `${(avgTimePerProfile / 1000).toFixed(1)}s`
      },
      outputFile
    };

    // Log summary
    this.printSummary(result);

    return result;
  }

  /**
   * Get fields that should be enriched based on original contact and options
   * @param {Object} contact - Original contact
   * @param {Object} opts - Enrichment options
   * @returns {string[]} - Field names to enrich
   */
  getFieldsToEnrich(contact, opts) {
    // If specific fields were provided, use those
    if (opts.fieldsToEnrich && Array.isArray(opts.fieldsToEnrich)) {
      return opts.fieldsToEnrich;
    }

    // If only core fields requested, return core fields
    if (opts.onlyCoreFields) {
      return this.coreFields;
    }

    // Check which fields exist in original contact (excluding metadata)
    const contactFields = Object.keys(contact).filter(key =>
      !key.startsWith('_') && // Skip metadata (_cardIndex, _extractionMethods)
      key !== 'enrichment' &&
      key !== 'domain' &&
      key !== 'domainType' &&
      key !== 'confidence' &&
      key !== 'source' &&
      typeof contact[key] !== 'object' // Skip nested objects
    );

    // Return union of core fields + existing fields (unique)
    return [...new Set([...this.coreFields, ...contactFields])];
  }

  /**
   * Enrich a single contact
   * @param {Object} contact - Contact to enrich
   * @param {number} index - Contact index
   * @param {number} total - Total contacts
   * @param {string[]} fieldsToEnrich - Fields to extract from profile
   * @returns {Object} - Enriched contact
   */
  async enrichSingleContact(contact, index, total, fieldsToEnrich = null) {
    const profileStartTime = Date.now();

    // Check if contact has profile URL
    if (!contact.profileUrl) {
      this.stats.skipped++;
      return {
        ...contact,
        enrichment: {
          enrichedAt: new Date().toISOString(),
          profileVisited: false,
          reason: 'no_profile_url'
        }
      };
    }

    this.logger.debug(`[ProfileEnricher] [${index + 1}/${total}] Enriching: ${contact.name || 'Unknown'}`);

    // Extract data from profile page (pass fields to extract)
    const profileResult = await this.profileExtractor.extractFromProfile(contact.profileUrl, fieldsToEnrich);

    if (!profileResult.success) {
      this.stats.failed++;

      // FALLBACK CLEANING: Even when profile extraction fails,
      // apply basic cleaning to name and location fields
      const fallbackResult = this.applyFallbackCleaning(contact);

      return {
        ...fallbackResult.contact,
        enrichment: {
          enrichedAt: new Date().toISOString(),
          profileVisited: true,
          profileUrl: contact.profileUrl,
          error: profileResult.error,
          fallbackCleaning: true,
          fallbackActions: fallbackResult.actions,
          fieldDetails: fallbackResult.fieldDetails
        },
        _original: fallbackResult.original
      };
    }

    // Compare fields
    const comparisons = fieldComparator.compareAllFields(contact, profileResult.fields);

    // Apply comparisons to create enriched contact
    const enrichedData = fieldComparator.applyComparisons(contact, comparisons, profileResult.fields);

    // Build enrichment metadata
    const enrichmentMetadata = this.buildEnrichmentMetadata(comparisons, contact, profileResult.fields);

    // Check if needs manual review
    if (fieldComparator.needsManualReview(comparisons)) {
      this.reviewQueue.push({
        index,
        originalContact: contact,
        enrichedContact: enrichedData,
        comparisons,
        flags: fieldComparator.getFlags(comparisons)
      });
    }

    // Update statistics
    this.updateStats(comparisons);

    // Enhanced debug logging for field transformations
    this.logFieldTransformations(contact, comparisons);

    // Record timing
    const profileTime = Date.now() - profileStartTime;
    this.profileTimes.push(profileTime);

    // Build final enriched contact
    const enrichedContact = {
      ...enrichedData,
      enrichment: enrichmentMetadata,
      _original: this.buildOriginalAuditTrail(contact, comparisons)
    };

    // Preserve original extraction metadata
    if (contact._cardIndex !== undefined) {
      enrichedContact._cardIndex = contact._cardIndex;
    }
    if (contact._extractionMethods) {
      enrichedContact._extractionMethods = contact._extractionMethods;
    }

    return enrichedContact;
  }

  /**
   * Build enrichment metadata from comparisons
   * @param {Object} comparisons - Field comparisons
   * @param {Object} originalContact - Original contact
   * @param {Object} profileFields - Profile fields
   * @returns {Object} - Enrichment metadata
   */
  buildEnrichmentMetadata(comparisons, originalContact, profileFields) {
    const actions = {};
    const removed = [];
    const fieldDetails = {};

    for (const [field, comparison] of Object.entries(comparisons)) {
      actions[field] = comparison.action;

      // Build detailed field breakdown
      fieldDetails[field] = {
        oldValue: comparison.originalValue || originalContact[field] || null,
        removed: comparison.removedNoise || [],
        newValue: comparison.value,
        action: comparison.action,
        source: comparison.action === 'ENRICHED' ? 'profile' :
                comparison.action === 'VALIDATED' ? 'original' :
                comparison.action === 'CLEANED' ? 'profile' :
                comparison.action === 'REPLACED' ? 'profile' :
                comparison.action === 'UNCHANGED' ? 'original' : 'unknown'
      };

      // Add note if title was extracted from name
      if (field === 'title' && comparison.extracted) {
        fieldDetails[field].note = 'Extracted from name suffix';
      }

      if (comparison.removedNoise) {
        for (const noise of comparison.removedNoise) {
          removed.push(`${noise} from ${field}`);
        }
      }
    }

    return {
      enrichedAt: new Date().toISOString(),
      profileVisited: true,
      profileUrl: originalContact.profileUrl,
      actions,
      fieldDetails,
      removed: removed.length > 0 ? removed : undefined,
      flags: fieldComparator.getFlags(comparisons),
      needsReview: fieldComparator.needsManualReview(comparisons),
      confidence: {
        overall: fieldComparator.calculateOverallConfidence(comparisons),
        fields: fieldComparator.buildFieldConfidences(comparisons)
      }
    };
  }

  /**
   * Build audit trail of original values
   * @param {Object} originalContact - Original contact
   * @param {Object} comparisons - Field comparisons
   * @returns {Object} - Original values that were changed
   */
  buildOriginalAuditTrail(originalContact, comparisons) {
    const audit = {};

    for (const [field, comparison] of Object.entries(comparisons)) {
      if (comparison.originalValue !== null) {
        audit[field] = comparison.originalValue;
      } else if (comparison.action === 'ENRICHED' && originalContact[field] === null) {
        audit[field] = null;
      }
    }

    // Only return if there are changes
    return Object.keys(audit).length > 0 ? audit : undefined;
  }

  /**
   * Update statistics from comparisons
   * @param {Object} comparisons - Field comparisons
   */
  updateStats(comparisons) {
    const actionCounts = fieldComparator.countActions(comparisons);

    if (actionCounts.ENRICHED > 0) this.stats.enriched++;
    if (actionCounts.VALIDATED > 0) this.stats.validated++;
    if (actionCounts.CLEANED > 0) this.stats.cleaned++;
    if (actionCounts.REPLACED > 0) this.stats.replaced++;

    // Track per-field stats
    for (const [field, comparison] of Object.entries(comparisons)) {
      switch (comparison.action) {
        case 'ENRICHED':
          this.stats.fieldsEnriched[field] = (this.stats.fieldsEnriched[field] || 0) + 1;
          break;
        case 'VALIDATED':
          this.stats.fieldsValidated[field] = (this.stats.fieldsValidated[field] || 0) + 1;
          break;
        case 'CLEANED':
          this.stats.fieldsCleaned[field] = (this.stats.fieldsCleaned[field] || 0) + 1;
          break;
        case 'REPLACED':
          this.stats.fieldsMismatched[field] = (this.stats.fieldsMismatched[field] || 0) + 1;
          break;
      }
    }
  }

  /**
   * Log field transformations for debugging
   * @param {Object} contact - Original contact
   * @param {Object} comparisons - Field comparisons
   */
  logFieldTransformations(contact, comparisons) {
    const significantActions = ['ENRICHED', 'CLEANED', 'REPLACED'];
    const transforms = [];

    for (const [field, comp] of Object.entries(comparisons)) {
      if (significantActions.includes(comp.action)) {
        const oldVal = comp.originalValue || contact[field] || '(empty)';
        const newVal = comp.value || '(empty)';
        const removed = comp.removedNoise ? ` [removed: ${comp.removedNoise.join(', ')}]` : '';

        transforms.push(`  ${field}: ${comp.action} "${oldVal}" → "${newVal}"${removed}`);
      }
    }

    if (transforms.length > 0) {
      this.logger.debug(`[ProfileEnricher] Field transformations for ${contact.name || 'Unknown'}:`);
      for (const t of transforms) {
        this.logger.debug(t);
      }
    }
  }

  /**
   * Apply fallback cleaning when profile extraction fails
   * Cleans name (removes title suffixes) and location (removes phones)
   * @param {Object} contact - Original contact
   * @returns {Object} - { contact, actions, fieldDetails, original }
   */
  applyFallbackCleaning(contact) {
    const cleanedContact = { ...contact };
    const actions = {};
    const fieldDetails = {};
    const original = {};

    // Clean name: Remove embedded titles
    if (contact.name) {
      const nameResult = cleaners.cleanName(contact.name);
      if (nameResult.wasContaminated) {
        original.name = contact.name;
        cleanedContact.name = nameResult.cleaned;
        actions.name = 'CLEANED';
        fieldDetails.name = {
          oldValue: contact.name,
          removed: nameResult.extractedTitle ? [`title: ${nameResult.extractedTitle}`] : [],
          newValue: nameResult.cleaned,
          action: 'CLEANED',
          source: 'fallback_cleaning'
        };

        // If title was extracted, use it if contact has no title
        if (nameResult.extractedTitle && !contact.title) {
          cleanedContact.title = nameResult.extractedTitle;
          actions.title = 'ENRICHED';
          fieldDetails.title = {
            oldValue: null,
            removed: [],
            newValue: nameResult.extractedTitle,
            action: 'ENRICHED',
            source: 'fallback_cleaning',
            note: 'Extracted from name during fallback cleaning'
          };
        }
      }
    }

    // Clean location: Remove phone numbers
    if (contact.location) {
      const locationResult = cleaners.cleanLocation(contact.location, contact.phone ? [contact.phone] : []);
      if (locationResult.removedNoise.length > 0 && locationResult.cleaned) {
        original.location = contact.location;
        cleanedContact.location = locationResult.cleaned;
        actions.location = 'CLEANED';
        fieldDetails.location = {
          oldValue: contact.location,
          removed: locationResult.removedNoise,
          newValue: locationResult.cleaned,
          action: 'CLEANED',
          source: 'fallback_cleaning'
        };
      }
    }

    return {
      contact: cleanedContact,
      actions,
      fieldDetails,
      original: Object.keys(original).length > 0 ? original : undefined
    };
  }

  /**
   * Load contacts from JSON file
   * @param {string} filePath - Path to JSON file
   * @returns {Array} - Array of contacts
   */
  loadContactsFile(filePath) {
    const fullPath = path.resolve(filePath);
    this.logger.info(`[ProfileEnricher] Loading contacts from: ${fullPath}`);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const data = JSON.parse(content);

    // Handle both array and object with contacts property
    if (Array.isArray(data)) {
      return data;
    } else if (data.contacts && Array.isArray(data.contacts)) {
      return data.contacts;
    } else {
      throw new Error('Invalid JSON format: expected array or object with contacts property');
    }
  }

  /**
   * Get default output file name
   * @param {string} inputFile - Input file path
   * @returns {string} - Output file path
   */
  getDefaultOutputFile(inputFile) {
    if (!inputFile) {
      return `output/enriched-${Date.now()}.json`;
    }

    const parsed = path.parse(inputFile);
    return path.join(parsed.dir, `${parsed.name}-enriched${parsed.ext}`);
  }

  /**
   * Save progress to file
   * @param {Array} contacts - Contacts to save
   * @param {string} outputFile - Output file path
   */
  async saveProgress(contacts, outputFile) {
    try {
      const outputPath = path.resolve(outputFile);
      const outputDir = path.dirname(outputPath);

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Build output object
      const output = {
        metadata: {
          enrichedAt: new Date().toISOString(),
          totalContacts: contacts.length,
          stats: this.stats
        },
        contacts
      };

      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
      this.logger.debug(`[ProfileEnricher] Progress saved: ${contacts.length} contacts to ${outputPath}`);
    } catch (error) {
      this.logger.error(`[ProfileEnricher] Failed to save progress: ${error.message}`);
    }
  }

  /**
   * Log progress with ETA
   * @param {number} current - Current count
   * @param {number} total - Total count
   */
  logProgress(current, total) {
    const elapsed = Date.now() - this.startTime;
    const avgTime = elapsed / current;
    const remaining = (total - current) * avgTime;

    const percent = ((current / total) * 100).toFixed(1);
    const etaFormatted = this.formatDuration(remaining);

    this.logger.info(`[ProfileEnricher] Progress: ${current}/${total} (${percent}%) - ETA: ${etaFormatted}`);

    // Memory check
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    if (heapUsedMB > 1000) {
      this.logger.warn(`[ProfileEnricher] High memory usage: ${heapUsedMB}MB`);
    }
  }

  /**
   * Format duration in human-readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string}
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Print enrichment summary
   * @param {Object} result - Enrichment result
   */
  printSummary(result) {
    const { stats, timing, reviewQueue, outputFile } = result;

    console.log('');
    console.log('================================================================================');
    console.log('ENRICHMENT COMPLETE');
    console.log('================================================================================');
    console.log(`Total Contacts:      ${stats.total}`);
    console.log(`Processed:           ${stats.processed}`);
    console.log(`Successful:          ${stats.processed - stats.failed} (${((stats.processed - stats.failed) / stats.total * 100).toFixed(1)}%)`);
    console.log(`Failed/Skipped:      ${stats.failed + stats.skipped} (${((stats.failed + stats.skipped) / stats.total * 100).toFixed(1)}%)`);
    console.log('');

    // Fields enriched
    console.log('Fields Enriched:');
    for (const [field, count] of Object.entries(stats.fieldsEnriched)) {
      console.log(`  ${field.padEnd(15)} ${count} (${(count / stats.processed * 100).toFixed(1)}%)`);
    }
    console.log('');

    // Fields validated
    console.log('Fields Validated:');
    for (const [field, count] of Object.entries(stats.fieldsValidated)) {
      console.log(`  ${field.padEnd(15)} ${count} (${(count / stats.processed * 100).toFixed(1)}%)`);
    }
    console.log('');

    // Fields cleaned
    if (Object.keys(stats.fieldsCleaned).length > 0) {
      console.log('Fields Cleaned:');
      for (const [field, count] of Object.entries(stats.fieldsCleaned)) {
        console.log(`  ${field.padEnd(15)} ${count} (${(count / stats.processed * 100).toFixed(1)}%)`);
      }
      console.log('');
    }

    // Manual review queue
    if (reviewQueue.length > 0) {
      console.log(`Manual Review Queue: ${reviewQueue.length} contacts`);
      const flagCounts = {};
      for (const item of reviewQueue) {
        for (const flag of item.flags) {
          flagCounts[flag] = (flagCounts[flag] || 0) + 1;
        }
      }
      for (const [flag, count] of Object.entries(flagCounts)) {
        console.log(`  - ${flag}: ${count}`);
      }
      console.log('');
    }

    console.log(`Output: ${outputFile}`);
    console.log('');
    console.log(`Time: ${timing.totalFormatted}`);
    console.log(`Avg per profile: ${timing.avgPerProfileFormatted}`);
    console.log('================================================================================');
    console.log('');
  }

  /**
   * Save manual review queue to file
   * @param {string} outputFile - Output file path
   */
  saveReviewQueue(outputFile) {
    if (this.reviewQueue.length === 0) {
      this.logger.info('[ProfileEnricher] No contacts require manual review');
      return;
    }

    const outputPath = path.resolve(outputFile);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(this.reviewQueue, null, 2));
    this.logger.info(`[ProfileEnricher] Review queue saved: ${this.reviewQueue.length} contacts to ${outputPath}`);
  }
}

module.exports = ProfileEnricher;
