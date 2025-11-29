/**
 * InfiniteScrollScraper
 *
 * Specialized scraper for dynamically loading pages that use infinite scroll.
 * EXTENDS SimpleScraper to reuse universal extraction methods.
 *
 * Features:
 * - Inherits all SimpleScraper extraction methods (universal extraction)
 * - Scroll management with configurable delays
 * - Content extraction during scrolling for efficiency
 * - Load More button detection and clicking
 * - Fallback to Select and PDF methods on low completeness
 * - Comprehensive deduplication via ContentTracker
 */

const SimpleScraper = require('./simple-scraper');
const { ContentTracker, ScrollDetector } = require('../features/infinite-scroll');

class InfiniteScrollScraper extends SimpleScraper {
  /**
   * Create an InfiniteScrollScraper
   * @param {Object} browserManager - Browser manager instance
   * @param {Object} rateLimiter - Rate limiter instance
   * @param {Object} logger - Logger instance
   * @param {Object} options - Scraper options
   */
  constructor(browserManager, rateLimiter, logger, options = {}) {
    super(browserManager, rateLimiter, logger);

    // Scroll configuration
    this.maxScrollAttempts = options.maxScrolls || options.maxScrollAttempts || 50;
    this.scrollDelay = options.scrollDelay || 1500;
    this.noNewContentThreshold = options.noNewContentThreshold || 3;
    this.networkIdleTimeout = options.networkIdleTimeout || 5000;

    // Extraction configuration
    this.cardSelector = options.cardSelector || null;
    this.extractionMethod = options.extractionMethod || 'html';
    this.completenessThreshold = options.completenessThreshold || 0.3;

    // Scroll behavior
    this.scrollStrategy = options.scrollStrategy || 'viewport';
    this.scrollPixels = options.scrollPixels || 800;

    // Fallback configuration
    this.enableFallback = options.enableFallback !== false;
    this.fallbackMethods = options.fallbackMethods || ['select', 'pdf'];

    // Load More button selectors
    this.loadMoreSelectors = [
      'button[class*="load-more"]',
      'button[class*="loadmore"]',
      'button[class*="show-more"]',
      'a[class*="load-more"]',
      '[data-load-more]',
      '.load-more',
      '#load-more',
      'button:contains("Load More")',
      'button:contains("Show More")',
      'a:contains("Load More")'
    ];

    // Additional card selectors specific to infinite scroll sites
    this.infiniteScrollCardSelectors = [
      '[data-testid*="card"]',
      '[data-testid*="profile"]',
      '[data-testid*="contact"]',
      '.attorney-card',
      '.lawyer-card',
      '[class*="attorney"]',
      '[class*="lawyer"]',
      '.person-card',
      '.profile-card',
      '.contact-card',
      'article.card',
      '.grid-item',
      '.list-item'
    ];

    // Tracking
    this.contentTracker = new ContentTracker();
    this.scrollDetector = null;
  }

  /**
   * Main scrape method for infinite scroll pages
   * @param {string} url - URL to scrape
   * @param {Object} siteConfig - Site-specific configuration
   * @returns {Promise<Array>} - Array of extracted contacts
   */
  async scrape(url, siteConfig = {}) {
    try {
      this.logger.info('═══════════════════════════════════════');
      this.logger.info('  INFINITE SCROLL SCRAPER (Universal)');
      this.logger.info('═══════════════════════════════════════');
      this.logger.info(`URL: ${url}`);

      // Merge options with site config
      this.applyConfig(siteConfig);

      // Navigate to page
      const page = this.browserManager.getPage();
      await this.browserManager.navigate(url);
      await this.sleep(3000); // Initial render time

      // Detect card selector if not provided (use combined selectors)
      const cardSelector = await this.detectCardSelectorForInfiniteScroll(page);
      this.logger.info(`Card selector: ${cardSelector || 'full page'}`);

      // Initialize scroll detector
      this.scrollDetector = new ScrollDetector(page, this.logger, {
        scrollDelay: this.scrollDelay,
        networkIdleTimeout: this.networkIdleTimeout
      });

      // Phase 1: Extract during infinite scroll
      this.logger.info('');
      this.logger.info('Phase 1: Infinite scroll extraction');
      this.logger.info('───────────────────────────────────');

      const scrollResult = await this.scrollAndExtract(page, cardSelector, siteConfig);
      let contacts = scrollResult.contacts;
      let completeness = this.calculateCompleteness(contacts);

      this.logger.info(`Scroll complete: ${contacts.length} contacts (${(completeness * 100).toFixed(0)}% complete)`);

      // Phase 1.5: Visit profile pages for contacts missing emails
      const contactsMissingEmails = contacts.filter(c => c.name && !c.email);
      if (contactsMissingEmails.length > 0) {
        this.logger.info('');
        this.logger.info(`Phase 1.5: Visiting profile pages for ${contactsMissingEmails.length} contacts missing emails`);
        this.logger.info('───────────────────────────────────');

        await this.fillEmailsFromProfiles(contacts, page, cardSelector);
        completeness = this.calculateCompleteness(contacts);
        this.logger.info(`After profile visits: ${contacts.filter(c => c.email).length} contacts with emails`);
      }

      // Phase 2: Fallback if needed
      if (this.enableFallback && completeness < this.completenessThreshold) {
        this.logger.info('');
        this.logger.info(`Phase 2: Fallback (completeness ${(completeness * 100).toFixed(0)}% < ${(this.completenessThreshold * 100).toFixed(0)}%)`);
        this.logger.info('───────────────────────────────────');

        const fallbackResult = await this.runFallbackChain(page, siteConfig, contacts);
        if (fallbackResult.contacts.length > contacts.length ||
            fallbackResult.completeness > completeness) {
          contacts = fallbackResult.contacts;
          completeness = fallbackResult.completeness;
          this.logger.info(`Fallback improved results: ${contacts.length} contacts (${(completeness * 100).toFixed(0)}%)`);
        }
      }

      // Phase 3: Fill missing names from PDF or email derivation
      const contactsNeedingNames = contacts.filter(c => !c.name && c.email);
      if (contactsNeedingNames.length > 0) {
        this.logger.info('');
        this.logger.info(`Phase 3: Fill missing names (${contactsNeedingNames.length} contacts)`);
        this.logger.info('───────────────────────────────────');

        // Try PDF first
        await this.fillNamesFromPdf(contacts, page, false);

        // Then email derivation for remaining
        const stillMissingNames = contacts.filter(c => !c.name && c.email);
        for (const contact of stillMissingNames) {
          const derivedName = this.extractNameFromEmail(contact.email);
          if (derivedName) {
            contact.name = derivedName;
            contact.source = (contact.source || 'infinite-scroll') + '+email';
          }
        }
      }

      // Add domain info to all contacts
      for (const contact of contacts) {
        this.addDomainInfo(contact);
        contact.source = contact.source || 'infinite-scroll';
      }

      this.logger.info('');
      this.logger.info('═══════════════════════════════════════');
      this.logger.info(`  COMPLETE: ${contacts.length} contacts extracted`);
      this.logger.info('═══════════════════════════════════════');

      return contacts;

    } catch (error) {
      this.logger.error(`Infinite scroll scraping failed: ${error.message}`);
      this.logger.error(error.stack);
      return [];
    }
  }

  /**
   * Apply site configuration to scraper options
   * @param {Object} siteConfig - Site configuration
   */
  applyConfig(siteConfig) {
    if (!siteConfig) return;

    // Infinite scroll specific config
    const infiniteConfig = siteConfig.infiniteScroll || {};
    if (infiniteConfig.scrollDelay) this.scrollDelay = infiniteConfig.scrollDelay;
    if (infiniteConfig.maxScrollAttempts) this.maxScrollAttempts = infiniteConfig.maxScrollAttempts;
    if (infiniteConfig.noNewContentThreshold) this.noNewContentThreshold = infiniteConfig.noNewContentThreshold;
    if (infiniteConfig.scrollStrategy) this.scrollStrategy = infiniteConfig.scrollStrategy;
    if (infiniteConfig.extractionMethod) this.extractionMethod = infiniteConfig.extractionMethod;

    // Fallback config
    const fallbackConfig = siteConfig.fallback || {};
    if (fallbackConfig.enabled !== undefined) this.enableFallback = fallbackConfig.enabled;
    if (fallbackConfig.methods) this.fallbackMethods = fallbackConfig.methods;
    if (fallbackConfig.completenessThreshold) this.completenessThreshold = fallbackConfig.completenessThreshold;

    // Card selector
    if (siteConfig.selectors?.container) {
      this.cardSelector = siteConfig.selectors.container;
    }
  }

  /**
   * Detect card selector for infinite scroll pages
   * Uses combined selectors from SimpleScraper and infinite scroll specific ones
   * @param {Object} page - Puppeteer page
   * @returns {Promise<string|null>} - Detected card selector
   */
  async detectCardSelectorForInfiniteScroll(page) {
    if (this.cardSelector) return this.cardSelector;

    this.logger.info('Auto-detecting card selector...');

    // Combine selectors, prioritizing infinite scroll specific ones
    const allSelectors = [
      ...this.infiniteScrollCardSelectors,
      ...this.CARD_SELECTORS
    ];

    // Remove duplicates
    const uniqueSelectors = [...new Set(allSelectors)];

    for (const selector of uniqueSelectors) {
      try {
        const count = await page.$$eval(selector, els => els.length);
        if (count >= 3) {
          // Verify structural similarity
          const isSimilar = await this.checkStructuralSimilarity(page, selector);
          if (isSimilar) {
            this.logger.info(`Detected ${count} cards with selector: ${selector}`);
            this.cardSelector = selector;
            return selector;
          }
        }
      } catch (e) {
        continue;
      }
    }

    this.logger.warn('Could not auto-detect card selector');
    return null;
  }

  /**
   * Perform infinite scroll and extract contacts using universal extraction
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @param {Object} siteConfig - Site configuration
   * @returns {Promise<Object>} - { contacts, stats }
   */
  async scrollAndExtract(page, cardSelector, siteConfig) {
    this.contentTracker.clear();
    const allContacts = [];
    let scrollAttempts = 0;
    let noNewContentCount = 0;
    let previousHeight = await page.evaluate(() => document.body.scrollHeight);
    let previousCardCount = cardSelector ?
      await page.$$eval(cardSelector, els => els.length).catch(() => 0) : 0;

    this.logger.info(`Initial state: ${previousCardCount} cards, height ${previousHeight}px`);

    while (scrollAttempts < this.maxScrollAttempts) {
      // Use SimpleScraper's universal extraction method
      const currentContacts = await this.extractContactsUniversal(page, cardSelector, {});
      let newItemsFound = 0;

      for (const contact of currentContacts) {
        // Use ContentTracker to dedupe
        if (this.contentTracker.checkAndMark(contact)) {
          // Mark source as infinite-scroll
          contact.source = 'infinite-scroll-html';
          allContacts.push(contact);
          newItemsFound++;
        }
      }

      scrollAttempts++;
      this.logger.info(`Scroll attempt ${scrollAttempts}/${this.maxScrollAttempts} - Found ${newItemsFound} new items (Total: ${allContacts.length})`);

      // Check stopping conditions
      if (newItemsFound === 0) {
        noNewContentCount++;
        if (noNewContentCount >= this.noNewContentThreshold) {
          this.logger.info(`No new content for ${this.noNewContentThreshold} consecutive scrolls, stopping`);
          break;
        }
      } else {
        noNewContentCount = 0;
      }

      // Try to click Load More button
      const loadMoreClicked = await this.clickLoadMoreIfExists(page);
      if (loadMoreClicked) {
        this.logger.info('Clicked "Load More" button');
        await this.sleep(this.scrollDelay);
      }

      // Perform scroll
      await this.performScroll(page);

      // Wait for content to load
      await this.waitForContentLoad(page, previousHeight);

      // Check if page changed
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      const currentCardCount = cardSelector ?
        await page.$$eval(cardSelector, els => els.length).catch(() => 0) : 0;

      if (currentHeight === previousHeight && currentCardCount === previousCardCount && noNewContentCount > 0) {
        this.logger.info('Page height and card count unchanged, likely reached end');
        break;
      }

      previousHeight = currentHeight;
      previousCardCount = currentCardCount;
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));

    const stats = this.contentTracker.getStats();
    return {
      contacts: allContacts,
      stats: {
        scrollsPerformed: scrollAttempts,
        uniqueContactsFound: stats.uniqueCount,
        duplicatesSkipped: stats.duplicatesSkipped
      }
    };
  }

  /**
   * Click Load More button if present
   * @param {Object} page - Puppeteer page
   * @returns {Promise<boolean>} - True if button was clicked
   */
  async clickLoadMoreIfExists(page) {
    for (const selector of this.loadMoreSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   el.offsetParent !== null;
          }, button);

          if (isVisible) {
            await button.click();
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }
    return false;
  }

  /**
   * Perform scroll action with human-like behavior
   * @param {Object} page - Puppeteer page
   */
  async performScroll(page) {
    // Add randomization for anti-detection
    const randomDelay = Math.random() * 200;

    switch (this.scrollStrategy) {
      case 'bottom':
        // Human-like: scroll to 80% first, then 100%
        await page.evaluate(() => {
          const height = document.body.scrollHeight;
          window.scrollTo(0, height * 0.8);
        });
        await this.sleep(200 + randomDelay);
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        break;

      case 'fixed':
        await page.evaluate((pixels) => {
          window.scrollBy(0, pixels);
        }, this.scrollPixels);
        break;

      case 'viewport':
      default:
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.8);
        });
        break;
    }
  }

  /**
   * Wait for content to load after scroll
   * @param {Object} page - Puppeteer page
   * @param {number} previousHeight - Previous page height
   */
  async waitForContentLoad(page, previousHeight) {
    if (this.scrollDetector) {
      await this.scrollDetector.waitForContentLoad({ previousHeight });
    } else {
      // Fallback: simple timeout-based wait
      try {
        await Promise.race([
          page.waitForNetworkIdle({ idleTime: 500, timeout: this.networkIdleTimeout }),
          this.sleep(this.networkIdleTimeout)
        ]);
      } catch (e) {
        // Timeout is fine
      }
      await this.sleep(this.scrollDelay);
    }
  }

  /**
   * Run fallback chain (Select -> PDF)
   * @param {Object} page - Puppeteer page
   * @param {Object} siteConfig - Site configuration
   * @param {Array} existingContacts - Already extracted contacts
   * @returns {Promise<Object>} - { contacts, completeness, method }
   */
  async runFallbackChain(page, siteConfig, existingContacts) {
    let bestResult = {
      contacts: existingContacts,
      completeness: this.calculateCompleteness(existingContacts),
      method: 'html'
    };

    for (const method of this.fallbackMethods) {
      try {
        let result;

        switch (method) {
          case 'select':
            this.logger.info('Trying Select method...');
            result = await this.trySelectMethod(page, siteConfig);
            break;

          case 'pdf':
            this.logger.info('Trying PDF method...');
            result = await this.tryPDFMethod(page, siteConfig);
            break;

          default:
            continue;
        }

        if (result && result.contacts.length > 0) {
          const completeness = this.calculateCompleteness(result.contacts);
          this.logger.info(`${method.toUpperCase()} method found ${result.contacts.length} contacts (${(completeness * 100).toFixed(0)}% complete)`);

          // Merge with existing contacts
          const merged = this.mergeContacts(bestResult.contacts, result.contacts);
          const mergedCompleteness = this.calculateCompleteness(merged);

          if (mergedCompleteness > bestResult.completeness || merged.length > bestResult.contacts.length) {
            bestResult = {
              contacts: merged,
              completeness: mergedCompleteness,
              method: method
            };
          }
        }

      } catch (error) {
        this.logger.warn(`${method.toUpperCase()} fallback failed: ${error.message}`);
      }
    }

    return bestResult;
  }

  /**
   * Try Select method extraction
   * @param {Object} page - Puppeteer page
   * @param {Object} siteConfig - Site configuration
   * @returns {Promise<Object>} - { contacts, completeness }
   */
  async trySelectMethod(page, siteConfig) {
    try {
      const SelectScraper = require('./select-scraper');
      const selectScraper = new SelectScraper(this.browserManager, this.rateLimiter, this.logger);

      // SelectScraper expects already navigated page
      const contacts = await selectScraper.extractFromLoadedPage(page, siteConfig);
      return {
        contacts: contacts || [],
        completeness: this.calculateCompleteness(contacts || [])
      };
    } catch (error) {
      this.logger.warn(`Select method error: ${error.message}`);
      return { contacts: [], completeness: 0 };
    }
  }

  /**
   * Try PDF method extraction
   * @param {Object} page - Puppeteer page
   * @param {Object} siteConfig - Site configuration
   * @returns {Promise<Object>} - { contacts, completeness }
   */
  async tryPDFMethod(page, siteConfig) {
    try {
      // Render page to PDF and extract
      const pdfData = await this.renderAndParsePdf(page, false);

      if (!pdfData || !pdfData.fullText) {
        return { contacts: [], completeness: 0 };
      }

      // Extract emails from PDF text
      const emails = this.extractEmails(pdfData.fullText);
      const uniqueEmails = new Set(emails.filter(e => {
        const domain = this.domainExtractor.extractAndNormalize(e);
        return domain && this.domainExtractor.isBusinessDomain(domain);
      }));

      // Use email-anchor extraction from SimpleScraper
      const contacts = this.extractByEmailAnchor(pdfData.fullText, uniqueEmails);

      // Mark source
      for (const contact of contacts) {
        contact.source = 'infinite-scroll-pdf';
      }

      return {
        contacts,
        completeness: this.calculateCompleteness(contacts)
      };
    } catch (error) {
      this.logger.warn(`PDF method error: ${error.message}`);
      return { contacts: [], completeness: 0 };
    }
  }

  /**
   * Merge two contact arrays, keeping best version of each
   * @param {Array} existing - Existing contacts
   * @param {Array} newContacts - New contacts to merge
   * @returns {Array} - Merged contacts
   */
  mergeContacts(existing, newContacts) {
    const contactMap = new Map();

    // Add existing contacts
    for (const contact of existing) {
      const key = contact.email?.toLowerCase() || `${contact.name}_${contact.phone}`;
      contactMap.set(key, contact);
    }

    // Merge new contacts
    for (const contact of newContacts) {
      const key = contact.email?.toLowerCase() || `${contact.name}_${contact.phone}`;
      const existingContact = contactMap.get(key);

      if (!existingContact) {
        contactMap.set(key, contact);
      } else {
        // Keep the more complete version
        const existingScore = (existingContact.name ? 1 : 0) +
                             (existingContact.email ? 1 : 0) +
                             (existingContact.phone ? 1 : 0);
        const newScore = (contact.name ? 1 : 0) +
                        (contact.email ? 1 : 0) +
                        (contact.phone ? 1 : 0);

        if (newScore > existingScore) {
          contactMap.set(key, { ...existingContact, ...contact });
        } else if (newScore === existingScore) {
          // Merge fields
          contactMap.set(key, {
            name: existingContact.name || contact.name,
            email: existingContact.email || contact.email,
            phone: existingContact.phone || contact.phone,
            source: 'merged',
            confidence: existingContact.confidence || contact.confidence
          });
        }
      }
    }

    return Array.from(contactMap.values());
  }

  /**
   * Calculate completeness score for contacts
   * @param {Array} contacts - Array of contacts
   * @returns {number} - Completeness score 0.0-1.0
   */
  calculateCompleteness(contacts) {
    if (!contacts || contacts.length === 0) return 0;

    let score = 0;
    for (const contact of contacts) {
      let contactScore = 0;
      if (contact.email) contactScore += 0.5;  // Email is most important
      if (contact.name) contactScore += 0.3;
      if (contact.phone) contactScore += 0.2;
      score += contactScore;
    }

    return score / contacts.length;
  }

  /**
   * Fill emails from profile pages for contacts missing emails
   * @param {Array} contacts - Array of contacts to update
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   */
  async fillEmailsFromProfiles(contacts, page, cardSelector) {
    const contactsNeedingEmails = contacts.filter(c => c.name && !c.email);
    let visitCount = 0;
    let foundCount = 0;
    const originalUrl = page.url();

    // First, collect profile URLs from the current page
    const profileUrls = await page.evaluate((selector) => {
      const cards = selector ? document.querySelectorAll(selector) : [document.body];
      const profiles = [];

      for (const card of cards) {
        // Find profile links - look for various patterns
        const profileSelectors = [
          'a[href*="/Lawyers/"]',
          'a[href*="/lawyer/"]',
          'a[href*="/attorney/"]',
          'a[href*="/profile/"]',
          'a[href*="/people/"]'
        ];

        for (const sel of profileSelectors) {
          const link = card.querySelector(sel);
          if (link && link.href) {
            // Extract name from card to match later
            const nameEl = card.querySelector('h2, h3, h4, .name, [class*="name"]');
            const name = nameEl ? nameEl.textContent.trim() : null;

            profiles.push({
              url: link.href,
              name: name
            });
            break;  // Only need one profile URL per card
          }
        }
      }

      return profiles;
    }, cardSelector);

    this.logger.info(`Found ${profileUrls.length} profile URLs`);

    // Visit each profile page for contacts missing emails
    for (const contact of contactsNeedingEmails) {
      // Find matching profile URL by name
      const matchingProfile = profileUrls.find(p => {
        if (!p.name || !contact.name) return false;
        // Fuzzy match - check if names contain each other
        const pName = p.name.toLowerCase();
        const cName = contact.name.toLowerCase();
        return pName.includes(cName) || cName.includes(pName) ||
               pName.split(' ').some(part => cName.includes(part));
      });

      if (!matchingProfile) {
        this.logger.debug(`No profile URL found for: ${contact.name}`);
        continue;
      }

      try {
        this.logger.info(`Visiting profile for ${contact.name}: ${matchingProfile.url}`);
        visitCount++;

        await this.browserManager.navigate(matchingProfile.url);
        await this.sleep(1500);  // Wait for page to load

        // Extract email from profile page using universal extraction
        const email = await page.evaluate(() => {
          // Try mailto links first
          const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
          for (const link of mailtoLinks) {
            const email = link.href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
            if (email && email.includes('@')) {
              return email;
            }
          }

          // Try links with "Email" text
          const allLinks = document.querySelectorAll('a[href]');
          for (const link of allLinks) {
            const linkText = link.textContent.trim().toLowerCase();
            if (linkText === 'email' || linkText === 'e-mail') {
              const href = link.href || '';
              if (href.toLowerCase().includes('mailto:')) {
                return href.replace(/mailto:/i, '').split('?')[0].toLowerCase().trim();
              }
            }
          }

          // Try plain text email pattern
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const bodyText = document.body.textContent || '';
          const matches = bodyText.match(emailRegex);
          if (matches && matches.length > 0) {
            // Return first business-looking email (not gmail, yahoo, etc)
            for (const email of matches) {
              const lower = email.toLowerCase();
              if (!lower.includes('gmail') && !lower.includes('yahoo') &&
                  !lower.includes('hotmail') && !lower.includes('outlook')) {
                return lower;
              }
            }
          }

          return null;
        });

        if (email) {
          contact.email = email;
          contact.source = (contact.source || 'infinite-scroll') + '+profile';
          contact.profileUrl = matchingProfile.url;
          foundCount++;
          this.logger.info(`  Found email: ${email}`);
        } else {
          this.logger.debug(`  No email found on profile page`);
        }

        // Rate limit between profile visits
        if (this.rateLimiter) {
          await this.rateLimiter.waitBeforeRequest();
        } else {
          await this.sleep(1000);
        }

      } catch (error) {
        this.logger.warn(`Failed to visit profile for ${contact.name}: ${error.message}`);
      }
    }

    // Navigate back to original URL
    try {
      await this.browserManager.navigate(originalUrl);
      await this.sleep(2000);
    } catch (e) {
      this.logger.warn(`Failed to navigate back to original URL: ${e.message}`);
    }

    this.logger.info(`Visited ${visitCount} profile pages, found emails for ${foundCount} contacts`);
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = InfiniteScrollScraper;
