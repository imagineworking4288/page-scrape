/**
 * Profile Enrichment Module v2.2
 *
 * Enhances contacts by visiting profile pages using v2.2 config data.
 * Uses profile URL patterns stored in config to match profile links to contacts.
 *
 * Features:
 * - Uses config-stored profile URL patterns for matching
 * - Name-based matching strength scoring
 * - Fallback to generic profile detection
 * - Rate-limited profile visiting
 */

const ProfileVisitor = require('../../utils/profile-visitor');
const {
  PROFILE_LINK_TYPES,
  NAME_MATCH_STRENGTH
} = require('./constants/field-requirements');

class ProfileEnrichment {
  constructor(logger, options = {}) {
    this.logger = logger || console;
    this.options = {
      maxProfilesPerBatch: options.maxProfilesPerBatch || 50,
      delayBetweenProfiles: options.delayBetweenProfiles || 1500,
      skipIfHasEmail: options.skipIfHasEmail !== false,
      ...options
    };

    // Use ProfileVisitor for actual page visiting
    this.profileVisitor = new ProfileVisitor({
      logger: this.logger,
      navigationTimeout: options.navigationTimeout || 30000,
      extractionDelay: options.extractionDelay || 1000,
      maxRetries: options.maxRetries || 2
    });
  }

  /**
   * Enrich contacts from a v2.2 config with profile page data
   * @param {Array} contacts - Array of contacts to enrich
   * @param {Object} page - Puppeteer page instance
   * @param {Object} config - v2.2 config with profile URL patterns
   * @returns {Promise<Object>} - { enrichedContacts, stats }
   */
  async enrichContacts(contacts, page, config) {
    this.logger.info(`[ProfileEnrichment] Starting enrichment for ${contacts.length} contacts`);

    const stats = {
      total: contacts.length,
      withProfileUrl: 0,
      enriched: 0,
      skipped: 0,
      failed: 0,
      emailsFound: 0,
      phonesFound: 0
    };

    // Get profile URL patterns from config
    const profilePatterns = this.getProfilePatterns(config);
    this.logger.info(`[ProfileEnrichment] Using ${profilePatterns.length} profile URL patterns`);

    // Filter contacts that need profile visiting
    const contactsToEnrich = contacts.filter(contact => {
      // Must have a profile URL
      if (!contact.profileUrl) {
        return false;
      }
      stats.withProfileUrl++;

      // Skip if already has email and skipIfHasEmail is true
      if (this.options.skipIfHasEmail && contact.email) {
        stats.skipped++;
        return false;
      }

      return true;
    });

    this.logger.info(`[ProfileEnrichment] ${contactsToEnrich.length} contacts need enrichment`);

    // Limit batch size
    const batchToProcess = contactsToEnrich.slice(0, this.options.maxProfilesPerBatch);

    // Process each contact
    for (const contact of batchToProcess) {
      try {
        const result = await this.enrichSingleContact(contact, page, config);

        if (result.enriched) {
          stats.enriched++;
          if (result.emailFound) stats.emailsFound++;
          if (result.phoneFound) stats.phonesFound++;
        }
      } catch (error) {
        stats.failed++;
        this.logger.warn(`[ProfileEnrichment] Failed for ${contact.name || 'Unknown'}: ${error.message}`);
      }

      // Rate limiting delay
      await this.delay(this.options.delayBetweenProfiles);
    }

    this.logger.info(
      `[ProfileEnrichment] Complete: ${stats.enriched} enriched, ` +
      `${stats.emailsFound} emails found, ${stats.phonesFound} phones found, ` +
      `${stats.failed} failed`
    );

    return {
      enrichedContacts: contacts,
      stats
    };
  }

  /**
   * Enrich a single contact from their profile page
   * @param {Object} contact - Contact to enrich
   * @param {Object} page - Puppeteer page
   * @param {Object} config - Site config
   * @returns {Promise<Object>} - Enrichment result
   */
  async enrichSingleContact(contact, page, config) {
    const result = {
      enriched: false,
      emailFound: false,
      phoneFound: false
    };

    if (!contact.profileUrl) return result;

    this.logger.info(`[ProfileEnrichment] Visiting profile: ${contact.profileUrl}`);

    try {
      // Visit the profile page
      const extracted = await this.profileVisitor.visitProfile(contact, page, config);

      // Update contact with extracted data
      if (extracted.email && !contact.email) {
        contact.email = extracted.email.toLowerCase();
        contact.emailSource = 'profile-page';
        result.emailFound = true;
        result.enriched = true;
        this.logger.info(`[ProfileEnrichment] Found email for ${contact.name || 'Unknown'}: ${contact.email}`);
      }

      if (extracted.phone && !contact.phone) {
        contact.phone = extracted.phone;
        contact.phoneSource = 'profile-page';
        result.phoneFound = true;
        result.enriched = true;
      }

      // Update name if we got a better one
      if (extracted.name && !contact.name) {
        contact.name = extracted.name;
        contact.nameSource = 'profile-page';
        result.enriched = true;
      }

    } catch (error) {
      this.logger.warn(`[ProfileEnrichment] Visit failed: ${error.message}`);
      throw error;
    }

    return result;
  }

  /**
   * Match profile URLs to contacts without profile URLs
   * Uses name matching with config-stored patterns
   * @param {Array} contacts - Contacts that may be missing profile URLs
   * @param {Array} profileLinks - Array of { url, text, classification } from page
   * @returns {Array} - Updated contacts with matched profile URLs
   */
  matchProfileUrlsToContacts(contacts, profileLinks) {
    let matched = 0;

    for (const contact of contacts) {
      // Skip if already has profile URL
      if (contact.profileUrl) continue;

      // Need a name to match
      if (!contact.name) continue;

      // Find best matching profile link
      const bestMatch = this.findBestProfileMatch(contact.name, profileLinks);

      if (bestMatch) {
        contact.profileUrl = bestMatch.url;
        contact.profileMatchConfidence = bestMatch.confidence;
        contact.profileMatchType = bestMatch.matchType;
        matched++;
        this.logger.info(
          `[ProfileEnrichment] Matched profile for ${contact.name}: ${bestMatch.url} ` +
          `(${bestMatch.matchType}, ${Math.round(bestMatch.confidence * 100)}%)`
        );
      }
    }

    this.logger.info(`[ProfileEnrichment] Matched ${matched} profile URLs to contacts`);
    return contacts;
  }

  /**
   * Find best profile link match for a name
   * @param {string} name - Contact name
   * @param {Array} profileLinks - Available profile links
   * @returns {Object|null} - Best match or null
   */
  findBestProfileMatch(name, profileLinks) {
    const nameParts = this.parseNameParts(name);
    let bestMatch = null;
    let bestScore = 0;

    for (const link of profileLinks) {
      const score = this.calculateNameMatchScore(nameParts, link.url, link.text);

      if (score.total > bestScore && score.total >= 0.5) {
        bestScore = score.total;
        bestMatch = {
          url: link.url,
          text: link.text,
          confidence: score.total,
          matchType: score.matchType
        };
      }
    }

    return bestMatch;
  }

  /**
   * Parse name into parts for matching
   * @param {string} name - Full name
   * @returns {Object} - { firstName, lastName, middleName, fullNormalized }
   */
  parseNameParts(name) {
    if (!name) return { firstName: '', lastName: '', middleName: '', fullNormalized: '' };

    const normalized = name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const parts = normalized.split(/\s+/).filter(p => p.length > 1);

    return {
      firstName: parts[0] || '',
      lastName: parts[parts.length - 1] || '',
      middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
      fullNormalized: normalized,
      allParts: parts
    };
  }

  /**
   * Calculate name match score
   * @param {Object} nameParts - Parsed name parts
   * @param {string} url - Profile URL
   * @param {string} linkText - Link text
   * @returns {Object} - { total, urlScore, textScore, matchType }
   */
  calculateNameMatchScore(nameParts, url, linkText) {
    const urlLower = (url || '').toLowerCase();
    const textLower = (linkText || '').toLowerCase();

    let urlScore = 0;
    let textScore = 0;
    let matchType = 'none';

    // URL-based matching
    if (urlLower) {
      const urlParts = urlLower.split(/[\/\-_.]/).filter(p => p.length > 2);

      // Check for full name in URL
      if (nameParts.fullNormalized && urlLower.includes(nameParts.fullNormalized.replace(/\s+/g, '-'))) {
        urlScore = 0.95;
        matchType = NAME_MATCH_STRENGTH.EXACT;
      }
      // Check for first + last name in URL
      else if (nameParts.firstName && nameParts.lastName) {
        const hasFirst = urlParts.some(p => p.includes(nameParts.firstName));
        const hasLast = urlParts.some(p => p.includes(nameParts.lastName));

        if (hasFirst && hasLast) {
          urlScore = 0.85;
          matchType = NAME_MATCH_STRENGTH.STRONG;
        } else if (hasLast) {
          urlScore = 0.5;
          matchType = NAME_MATCH_STRENGTH.PARTIAL;
        } else if (hasFirst) {
          urlScore = 0.3;
          matchType = NAME_MATCH_STRENGTH.WEAK;
        }
      }
    }

    // Text-based matching
    if (textLower && nameParts.fullNormalized) {
      const textParts = textLower.split(/\s+/).filter(p => p.length > 2);

      // Check how many name parts are in text
      let matchingParts = 0;
      for (const part of nameParts.allParts) {
        if (textParts.some(tp => tp.includes(part) || part.includes(tp))) {
          matchingParts++;
        }
      }

      if (nameParts.allParts.length > 0) {
        textScore = matchingParts / nameParts.allParts.length;
        if (textScore >= 0.9 && matchType === 'none') {
          matchType = NAME_MATCH_STRENGTH.STRONG;
        } else if (textScore >= 0.5 && matchType === 'none') {
          matchType = NAME_MATCH_STRENGTH.PARTIAL;
        }
      }
    }

    // Combine scores (URL is more reliable)
    const total = urlScore * 0.6 + textScore * 0.4;

    return {
      total,
      urlScore,
      textScore,
      matchType
    };
  }

  /**
   * Get profile URL patterns from config
   * @param {Object} config - v2.2 config
   * @returns {Array<string>} - Profile URL patterns
   */
  getProfilePatterns(config) {
    // Check v2.2 field extraction for profileUrl patterns
    const profileUrlConfig = config.fieldExtraction?.fields?.profileUrl;
    if (profileUrlConfig?.methods) {
      const urlPatternMethod = profileUrlConfig.methods.find(m => m.type === 'urlPattern');
      if (urlPatternMethod?.patterns) {
        return urlPatternMethod.patterns;
      }
    }

    // Fallback to default patterns
    return [
      '/people/',
      '/person/',
      '/lawyers/',
      '/attorney/',
      '/attorneys/',
      '/staff/',
      '/team/',
      '/bio/',
      '/profile/',
      '/professionals/',
      '/members/'
    ];
  }

  /**
   * Classify a profile link
   * @param {string} url - Profile URL
   * @param {string} text - Link text
   * @param {string} contactName - Contact name for matching
   * @returns {Object} - Classification result
   */
  classifyProfileLink(url, text, contactName) {
    const nameParts = this.parseNameParts(contactName);
    const score = this.calculateNameMatchScore(nameParts, url, text);

    const patterns = this.getProfilePatterns({});
    const isProfileUrl = patterns.some(p =>
      (url || '').toLowerCase().includes(p.toLowerCase())
    );

    let type = PROFILE_LINK_TYPES.UNKNOWN;
    if (isProfileUrl) {
      type = PROFILE_LINK_TYPES.PROFILE;
    } else if ((url || '').includes('linkedin.com')) {
      type = PROFILE_LINK_TYPES.LINKEDIN;
    } else if ((url || '').includes('twitter.com') || (url || '').includes('x.com')) {
      type = PROFILE_LINK_TYPES.TWITTER;
    }

    return {
      type,
      isProfile: isProfileUrl,
      nameMatch: score.matchType,
      confidence: score.total,
      urlScore: score.urlScore,
      textScore: score.textScore
    };
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ProfileEnrichment;
