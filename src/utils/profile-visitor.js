/**
 * Universal Profile Visitor
 *
 * Visits individual profile pages to extract emails and other contact information
 * that may not be visible on listing pages.
 *
 * Used by scrapers when:
 * - Email is hidden behind "Email" links with mailto: hrefs
 * - Email only appears on individual profile pages
 * - Additional contact details need enrichment
 */

const { getUniversalExtractionCode } = require('./contact-extractor');

class ProfileVisitor {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.config = options.config || {};

    // Default settings
    this.settings = {
      navigationTimeout: options.navigationTimeout || 30000,
      extractionDelay: options.extractionDelay || 1000,
      maxRetries: options.maxRetries || 2,
      retryDelay: options.retryDelay || 2000,
      concurrency: options.concurrency || 1, // Sequential by default to avoid rate limiting
      skipIfEmailExists: options.skipIfEmailExists !== false, // Skip if contact already has email
      ...options.settings
    };

    // Get universal extraction code for browser context
    this.extractionCode = getUniversalExtractionCode();
  }

  /**
   * Visit profile pages and enrich contacts with extracted emails
   *
   * @param {Array} contacts - Array of contacts with profileUrl field
   * @param {Page} page - Puppeteer page instance
   * @param {Object} config - Site-specific configuration
   * @returns {Object} - { enrichedContacts, stats }
   */
  async visitProfiles(contacts, page, config = {}) {
    const stats = {
      total: contacts.length,
      visited: 0,
      enriched: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    // Filter contacts that need profile visiting
    const contactsToVisit = contacts.filter(contact => {
      // Must have a profile URL
      if (!contact.profileUrl) {
        stats.skipped++;
        return false;
      }

      // Skip if already has email and skipIfEmailExists is true
      if (this.settings.skipIfEmailExists && contact.email) {
        stats.skipped++;
        return false;
      }

      return true;
    });

    this.logger.info(`[ProfileVisitor] Starting profile visits: ${contactsToVisit.length} profiles to visit`);

    // Process profiles sequentially to avoid rate limiting
    for (const contact of contactsToVisit) {
      try {
        const result = await this.visitProfile(contact, page, config);
        stats.visited++;

        if (result.email && !contact.email) {
          contact.email = result.email;
          contact.emailSource = 'profile-page';
          stats.enriched++;
          this.logger.info(`[ProfileVisitor] Enriched: ${contact.name || 'Unknown'} -> ${result.email}`);
        }

        // Also capture phone if missing
        if (result.phone && !contact.phone) {
          contact.phone = result.phone;
          contact.phoneSource = 'profile-page';
        }

      } catch (error) {
        stats.failed++;
        stats.errors.push({
          contact: contact.name || contact.profileUrl,
          error: error.message
        });
        this.logger.error(`[ProfileVisitor] Failed to visit profile for ${contact.name || 'Unknown'}: ${error.message}`);
      }
    }

    this.logger.info(`[ProfileVisitor] Complete: ${stats.enriched} enriched, ${stats.failed} failed, ${stats.skipped} skipped`);

    return {
      enrichedContacts: contacts,
      stats
    };
  }

  /**
   * Visit a single profile page and extract contact information
   *
   * @param {Object} contact - Contact object with profileUrl
   * @param {Page} page - Puppeteer page instance
   * @param {Object} config - Site-specific configuration
   * @returns {Object} - Extracted contact data { email, phone, name }
   */
  async visitProfile(contact, page, config = {}) {
    const url = contact.profileUrl;
    let lastError = null;

    for (let attempt = 1; attempt <= this.settings.maxRetries; attempt++) {
      try {
        // Navigate to profile page
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: this.settings.navigationTimeout
        });

        // Wait for content to load
        await this.delay(this.settings.extractionDelay);

        // Extract email from profile page
        const result = await this.extractFromProfile(page, config);

        return result;

      } catch (error) {
        lastError = error;
        this.logger.warn(`[ProfileVisitor] Attempt ${attempt}/${this.settings.maxRetries} failed for ${url}: ${error.message}`);

        if (attempt < this.settings.maxRetries) {
          await this.delay(this.settings.retryDelay);
        }
      }
    }

    throw lastError || new Error('Failed to visit profile after retries');
  }

  /**
   * Extract email from current profile page
   *
   * @param {Page} page - Puppeteer page instance
   * @param {Object} config - Site-specific configuration
   * @returns {Object} - { email, phone, name }
   */
  async extractFromProfile(page, config = {}) {
    const extractionCode = this.extractionCode;

    const result = await page.evaluate((code, cfg) => {
      // Inject extraction functions
      eval(code);

      const extracted = {
        email: null,
        phone: null,
        name: null
      };

      // Try multiple email extraction strategies
      const emails = extractEmailsFromElement(document.body);
      if (emails.length > 0) {
        // Prefer high confidence emails
        const highConfidence = emails.find(e => e.confidence === 'high');
        extracted.email = highConfidence ? highConfidence.email : emails[0].email;
      }

      // Extract phone
      const phones = extractPhonesFromElement(document.body);
      if (phones.length > 0) {
        extracted.phone = phones[0].phone;
      }

      // Extract name from profile page
      // Look for common profile name patterns
      const nameSelectors = [
        'h1',
        '.attorney-name',
        '.lawyer-name',
        '.profile-name',
        '.name',
        '[class*="name"]',
        '.bio-name',
        '.person-name'
      ];

      for (const selector of nameSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent.trim();
          // Basic name validation - 2-5 words, reasonable length
          if (text.length >= 3 && text.length <= 100 && text.split(/\s+/).length <= 5) {
            extracted.name = text;
            break;
          }
        }
      }

      return extracted;
    }, extractionCode, config);

    // Clean and validate email
    if (result.email) {
      result.email = this.cleanEmail(result.email);
    }

    return result;
  }

  /**
   * Clean and normalize email address
   *
   * @param {string} emailStr - Raw email string
   * @returns {string} - Cleaned email
   */
  cleanEmail(emailStr) {
    if (!emailStr) return null;

    let email = emailStr.toLowerCase().trim();

    // Remove mailto: prefix
    email = email.replace(/^mailto:/i, '');

    // Remove query parameters
    email = email.split('?')[0];

    // Remove any surrounding brackets or parentheses
    email = email.replace(/^[\[\(<]|[\]\)>]$/g, '');

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return null;
    }

    return email;
  }

  /**
   * Match profile URLs to contacts by name similarity
   *
   * @param {Array} contacts - Contacts array (may have name but no profileUrl)
   * @param {Array} profileUrls - Array of { url, name } objects
   * @returns {Array} - Updated contacts with matched profileUrls
   */
  matchProfilesByName(contacts, profileUrls) {
    const matched = 0;

    for (const contact of contacts) {
      if (contact.profileUrl || !contact.name) continue;

      // Find best matching profile URL
      const contactName = this.normalizeName(contact.name);
      let bestMatch = null;
      let bestScore = 0;

      for (const profile of profileUrls) {
        if (!profile.name) continue;

        const profileName = this.normalizeName(profile.name);
        const score = this.nameSimilarity(contactName, profileName);

        if (score > bestScore && score >= 0.8) { // 80% threshold
          bestScore = score;
          bestMatch = profile;
        }
      }

      if (bestMatch) {
        contact.profileUrl = bestMatch.url;
        contact.profileMatchScore = bestScore;
      }
    }

    return contacts;
  }

  /**
   * Normalize name for comparison
   *
   * @param {string} name - Name to normalize
   * @returns {string} - Normalized name
   */
  normalizeName(name) {
    if (!name) return '';

    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '') // Remove non-alpha except spaces
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim();
  }

  /**
   * Calculate name similarity score (0-1)
   * Uses simple word overlap with order consideration
   *
   * @param {string} name1 - First name (normalized)
   * @param {string} name2 - Second name (normalized)
   * @returns {number} - Similarity score 0-1
   */
  nameSimilarity(name1, name2) {
    if (!name1 || !name2) return 0;

    const words1 = name1.split(' ').filter(w => w.length > 1);
    const words2 = name2.split(' ').filter(w => w.length > 1);

    if (words1.length === 0 || words2.length === 0) return 0;

    // Count matching words
    let matches = 0;
    for (const word of words1) {
      if (words2.includes(word)) {
        matches++;
      }
    }

    // Calculate Jaccard similarity
    const union = new Set([...words1, ...words2]).size;
    return matches / union;
  }

  /**
   * Extract profile URLs from a page
   *
   * @param {Page} page - Puppeteer page instance
   * @param {Object} config - Site-specific configuration
   * @returns {Array} - Array of { url, name, element } objects
   */
  async extractProfileUrls(page, config = {}) {
    const profilePatterns = config.parsing?.profileUrlPatterns || [
      '/agents/', '/profile/', '/realtor/', '/team/', '/broker/',
      '/member/', '/lawyer/', '/Lawyers/', '/attorney/', '/people/',
      '/professionals/', '/attorneys/', '/our-team/', '/staff/'
    ];

    const profiles = await page.evaluate((patterns) => {
      const results = [];
      const seen = new Set();

      // Find all links that match profile patterns
      const links = document.querySelectorAll('a[href]');

      for (const link of links) {
        const href = link.href;
        if (!href || seen.has(href)) continue;

        // Check if URL matches any profile pattern
        const isProfileUrl = patterns.some(pattern =>
          href.toLowerCase().includes(pattern.toLowerCase())
        );

        if (isProfileUrl) {
          seen.add(href);

          // Try to extract name from link or nearby elements
          let name = link.textContent.trim();

          // If link text is too short or generic, look for nearby name
          if (!name || name.length < 3 || ['view', 'profile', 'more', 'details'].includes(name.toLowerCase())) {
            // Check parent for name
            const parent = link.closest('.card, .member, .attorney, .lawyer, .team-member, .person, [class*="card"]');
            if (parent) {
              const nameEl = parent.querySelector('h2, h3, h4, .name, [class*="name"]');
              if (nameEl) {
                name = nameEl.textContent.trim();
              }
            }
          }

          results.push({
            url: href,
            name: name || null
          });
        }
      }

      return results;
    }, profilePatterns);

    this.logger.info(`[ProfileVisitor] Found ${profiles.length} profile URLs`);
    return profiles;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ProfileVisitor;
