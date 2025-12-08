/**
 * Infinite Scroll Scraper - Selenium PAGE_DOWN Architecture
 *
 * Handles scraping from infinite scroll pages using Selenium WebDriver with
 * PAGE_DOWN key simulation. This is the ONLY infinite scroll implementation
 * as it's proven to be more reliable than Puppeteer wheel events.
 *
 * TWO-PHASE ARCHITECTURE:
 *
 * PHASE 1 - LOAD WITH SELENIUM:
 *   - Launch Selenium WebDriver (Chrome)
 *   - Navigate to URL
 *   - Use PAGE_DOWN key simulation to trigger infinite scroll
 *   - Monitor height changes with retry logic
 *   - Reset retry counter on ANY height change (key insight from INFSCROLLTEST)
 *   - Scroll up/down cycle every 5 failed retries
 *
 * PHASE 2 - EXTRACT WITH SELENIUM:
 *   - Execute JavaScript in Selenium to extract all card data
 *   - Process and normalize contacts
 *   - Close Selenium when done
 *
 * WHY SELENIUM PAGE_DOWN:
 *   - More reliable than Puppeteer wheel events for triggering lazy loaders
 *   - Keyboard events properly fire scroll event handlers
 *   - Proven in INFSCROLLTEST: Found 584 lawyers on Sullivan & Cromwell
 *   - Puppeteer wheel events only found 10 contacts on the same page
 */

const BaseConfigScraper = require('./base-config-scraper');

class InfiniteScrollScraper extends BaseConfigScraper {
  constructor(seleniumManager, rateLimiter, logger, options = {}) {
    // Pass null as browserManager - we use Selenium only
    super(null, rateLimiter, logger, options);

    this.scraperType = 'infinite-scroll';
    this.seleniumManager = seleniumManager;

    // Scroll configuration (can be overridden by config.pagination.scrollConfig)
    this.scrollConfig = {
      scrollDelay: options.scrollDelay || 400,
      maxRetries: options.maxRetries || 25,
      maxScrolls: options.maxScrolls || 1000,
      initialWait: options.initialWait || 5000,
      scrollContainer: options.scrollContainer || null,
      verbose: options.verbose !== false
    };
  }

  /**
   * Scrape contacts using Selenium for both loading and extraction
   *
   * @param {string} url - URL to scrape
   * @param {number} limit - Max contacts to extract (0 = unlimited)
   * @param {boolean} keepPdf - Whether to keep PDF output (unused for this scraper)
   * @param {string} sourcePage - Source page identifier (optional)
   * @param {string} sourceUrl - Original source URL (optional)
   * @returns {Promise<Object>} - Scraping results
   */
  async scrape(url, limit = 0, keepPdf = false, sourcePage = null, sourceUrl = null) {
    this.startTime = Date.now();
    this.requestedLimit = limit;

    try {
      this.logger.info(`[InfiniteScrollScraper] Starting scrape: ${url}`);
      this.logger.info(`[InfiniteScrollScraper] Limit: ${limit > 0 ? limit : 'unlimited'}, Method: selenium-pagedown`);

      // Ensure output path is set
      this.ensureOutputPath();

      // Get scroll config from loaded config if available
      if (this.config?.pagination?.scrollConfig) {
        this.scrollConfig = { ...this.scrollConfig, ...this.config.pagination.scrollConfig };
        this.logger.info(`[InfiniteScrollScraper] Using config scroll settings`);
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 1: LOAD WITH SELENIUM
      // ═══════════════════════════════════════════════════════════

      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);
      this.logger.info(`[InfiniteScrollScraper] PHASE 1: Loading page with Selenium`);
      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);

      // Navigate to URL
      this.logger.info(`[InfiniteScrollScraper] Navigating to: ${url}`);
      await this.seleniumManager.navigate(url);

      // Scroll to fully load page
      this.logger.info(`[InfiniteScrollScraper] Starting infinite scroll...`);
      const scrollStats = await this.seleniumManager.scrollToFullyLoad(this.scrollConfig);

      // Log scroll statistics
      this.logger.info(`[InfiniteScrollScraper] Scroll complete:`);
      this.logger.info(`[InfiniteScrollScraper]   - Scrolls: ${scrollStats.scrollCount}`);
      this.logger.info(`[InfiniteScrollScraper]   - Height changes: ${scrollStats.heightChanges}`);
      this.logger.info(`[InfiniteScrollScraper]   - Final height: ${scrollStats.finalHeight}px`);
      this.logger.info(`[InfiniteScrollScraper]   - Stop reason: ${scrollStats.stopReason}`);

      // ═══════════════════════════════════════════════════════════
      // PHASE 2: EXTRACT WITH SELENIUM (using JavaScript)
      // ═══════════════════════════════════════════════════════════

      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);
      this.logger.info(`[InfiniteScrollScraper] PHASE 2: Extracting with Selenium JS`);
      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);

      // Extract directly from Selenium's fully-loaded page using JavaScript
      const results = await this.extractAllCardsFromSelenium(limit);

      // Add scroll stats to results
      results.scrollStats = scrollStats;

      return results;

    } catch (error) {
      this.logger.error(`[InfiniteScrollScraper] Scraping failed: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  /**
   * Extract all cards from Selenium's fully-loaded page using JavaScript
   * This is the core extraction method
   *
   * @param {number} limit - Max contacts to extract (0 = unlimited)
   * @returns {Promise<Object>} - Results object
   */
  async extractAllCardsFromSelenium(limit) {
    this.logger.info(`[InfiniteScrollScraper] Extracting contacts using Selenium JavaScript...`);

    const driver = this.seleniumManager.getDriver();

    // Get all card data via JavaScript execution
    const extractionScript = `
      const cards = document.querySelectorAll('${this.cardSelector.replace(/'/g, "\\'")}');
      const results = [];

      cards.forEach((card, index) => {
        const contact = { _cardIndex: index };

        // Extract name - try multiple selectors
        const nameEl = card.querySelector('h1, h2, h3, h4, h5, .name, [class*="name"]');
        if (nameEl) {
          contact.name = nameEl.textContent.trim();
        }

        // Extract profile URL - find the main link
        const links = card.querySelectorAll('a[href]');
        for (const link of links) {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('mailto:') && !href.startsWith('tel:') &&
              !href.startsWith('#') && !href.endsWith('.vcf')) {
            // Make absolute URL if relative
            if (href.startsWith('/')) {
              contact.profileUrl = window.location.origin + href;
            } else if (href.startsWith('http')) {
              contact.profileUrl = href;
            }
            break;
          }
        }

        // Extract email - mailto link or regex
        const mailtoLink = card.querySelector('a[href^="mailto:"]');
        if (mailtoLink) {
          contact.email = mailtoLink.getAttribute('href').replace('mailto:', '').split('?')[0];
        } else {
          // Try regex in card text
          const cardText = card.textContent;
          const emailMatch = cardText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);
          if (emailMatch) {
            contact.email = emailMatch[0];
          }
        }

        // Extract phone - tel link or regex
        const telLink = card.querySelector('a[href^="tel:"]');
        if (telLink) {
          contact.phone = telLink.getAttribute('href').replace('tel:', '');
        } else {
          // Try regex in card text
          const cardText = card.textContent;
          const phoneMatch = cardText.match(/[\\+]?[(]?[0-9]{1,3}[)]?[-\\s\\.]?[(]?[0-9]{1,3}[)]?[-\\s\\.][0-9]{3,6}[-\\s\\.][0-9]{3,6}/);
          if (phoneMatch) {
            contact.phone = phoneMatch[0];
          }
        }

        // Extract title
        const titleEl = card.querySelector('.title, [class*="title"], .position, [class*="position"]');
        if (titleEl) {
          contact.title = titleEl.textContent.trim();
        }

        // Extract location
        const locEl = card.querySelector('.location, [class*="location"], .office, [class*="office"]');
        if (locEl) {
          contact.location = locEl.textContent.trim();
        }

        results.push(contact);
      });

      return results;
    `;

    // Execute extraction script
    const rawContacts = await driver.executeScript(extractionScript);
    const totalCards = rawContacts.length;

    this.logger.info(`[InfiniteScrollScraper] Found ${totalCards} cards in Selenium DOM`);

    // Determine how many to extract
    const cardsToExtract = limit > 0 ? Math.min(totalCards, limit) : totalCards;
    this.logger.info(`[InfiniteScrollScraper] Processing ${cardsToExtract} contacts (limit: ${limit > 0 ? limit : 'unlimited'})`);

    // Process each contact
    for (let i = 0; i < cardsToExtract; i++) {
      const raw = rawContacts[i];

      try {
        // Normalize and validate contact
        const contact = {
          _cardIndex: raw._cardIndex,
          _extractionMethods: {}
        };

        // Copy fields with normalization
        if (raw.name) {
          contact.name = this.normalizeFieldValue('name', raw.name);
          contact._extractionMethods.name = { method: 'selenium-js', confidence: 90 };
        }
        if (raw.email) {
          contact.email = this.normalizeFieldValue('email', raw.email);
          contact._extractionMethods.email = { method: 'selenium-js', confidence: 90 };
        }
        if (raw.phone) {
          contact.phone = this.normalizeFieldValue('phone', raw.phone);
          contact._extractionMethods.phone = { method: 'selenium-js', confidence: 90 };
        }
        if (raw.title) {
          contact.title = this.normalizeFieldValue('title', raw.title);
          contact._extractionMethods.title = { method: 'selenium-js', confidence: 90 };
        }
        if (raw.location) {
          contact.location = this.normalizeFieldValue('location', raw.location);
          contact._extractionMethods.location = { method: 'selenium-js', confidence: 90 };
        }
        if (raw.profileUrl) {
          contact.profileUrl = raw.profileUrl;
          contact._extractionMethods.profileUrl = { method: 'selenium-js', confidence: 90 };
        }

        // Calculate confidence and add domain info
        contact.confidence = this.calculateConfidence(contact.name, contact.email, contact.phone);
        this.addDomainInfo(contact);

        // Track field statistics
        const trackedFields = ['name', 'email', 'phone', 'title', 'location', 'profileUrl'];
        for (const fieldName of trackedFields) {
          if (this.fieldStats[fieldName]) {
            this.fieldStats[fieldName].total++;
            if (contact[fieldName]) {
              this.fieldStats[fieldName].extracted++;
            }
          }
        }

        // Add contact
        this.addContact(contact);

        // Progress update every 50 contacts
        if ((i + 1) % 50 === 0 || (i + 1) === cardsToExtract) {
          this.logger.info(`[InfiniteScrollScraper] Processed ${i + 1}/${cardsToExtract} contacts`);
        }
      } catch (err) {
        this.logger.warn(`[InfiniteScrollScraper] Error processing card ${i}: ${err.message}`);
      }
    }

    this.logger.info(`[InfiniteScrollScraper] ✓ Extraction complete: ${this.contactCount} contacts`);

    // Flush remaining contacts
    this.flushContactBuffer();

    // Close Selenium now that we're done
    this.logger.info(`[InfiniteScrollScraper] Closing Selenium driver...`);
    await this.seleniumManager.close();

    return this.getResults();
  }

  /**
   * Diagnose infinite scroll behavior using Selenium
   *
   * @param {string} url - URL to diagnose
   * @returns {Promise<Object>} - Diagnosis results
   */
  async diagnose(url) {
    this.logger.info('[InfiniteScrollScraper] Running Selenium diagnosis...');

    try {
      // Navigate
      await this.seleniumManager.navigate(url);

      // Get initial state
      const driver = this.seleniumManager.getDriver();
      const { By } = require('selenium-webdriver');

      const initialHeight = await driver.executeScript('return document.body.scrollHeight');

      // Count initial cards
      let initialCardCount = 0;
      if (this.cardSelector) {
        const cards = await driver.findElements(By.css(this.cardSelector));
        initialCardCount = cards.length;
      }

      // Perform limited scroll (50 scrolls)
      const scrollStats = await this.seleniumManager.scrollToFullyLoad({
        maxScrolls: 50,
        maxRetries: 10,
        scrollDelay: 300,
        verbose: false
      });

      // Get final state
      const finalHeight = await driver.executeScript('return document.body.scrollHeight');
      let finalCardCount = 0;
      if (this.cardSelector) {
        const cards = await driver.findElements(By.css(this.cardSelector));
        finalCardCount = cards.length;
      }

      const diagnosis = {
        type: 'infinite-scroll',
        method: 'selenium-pagedown',
        initialHeight,
        finalHeight,
        heightIncrease: finalHeight - initialHeight,
        initialCards: initialCardCount,
        finalCards: finalCardCount,
        newCards: finalCardCount - initialCardCount,
        scrollStats,
        isInfiniteScroll: scrollStats.heightChanges > 2,
        confidence: scrollStats.heightChanges > 5 ? 'high' : (scrollStats.heightChanges > 2 ? 'medium' : 'low'),
        recommendedConfig: {
          scrollDelay: 400,
          maxRetries: 25,
          maxScrolls: 1000
        }
      };

      this.logger.info(`[InfiniteScrollScraper] Diagnosis: ${JSON.stringify(diagnosis, null, 2)}`);

      return diagnosis;

    } catch (error) {
      this.logger.error(`[InfiniteScrollScraper] Diagnosis failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = InfiniteScrollScraper;
