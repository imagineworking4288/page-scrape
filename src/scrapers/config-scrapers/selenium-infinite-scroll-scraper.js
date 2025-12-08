/**
 * Selenium Infinite Scroll Scraper
 *
 * Config-based scraper that uses Selenium WebDriver for reliable infinite scroll
 * loading, then uses Puppeteer for extraction with the existing config-based system.
 *
 * TWO-PHASE HYBRID ARCHITECTURE:
 *
 * PHASE 1 - LOAD WITH SELENIUM:
 *   - Launch Selenium driver
 *   - Navigate to URL
 *   - Use PAGE_DOWN key simulation to trigger infinite scroll
 *   - Monitor height changes with retry logic (proven in INFSCROLLTEST)
 *   - Close Selenium after page is fully loaded
 *
 * PHASE 2 - EXTRACT WITH PUPPETEER:
 *   - Navigate Puppeteer to same URL (content cached/hydrated)
 *   - Wait for page to stabilize
 *   - Use existing extractors (CoordinateExtractor, EmailExtractor, etc.)
 *   - Extract contacts using config field methods
 *
 * WHY THIS HYBRID APPROACH:
 * - Selenium's PAGE_DOWN key simulation is more reliable for triggering lazy loaders
 * - Puppeteer's ElementHandle API is required for coordinate-based extraction
 * - Cheerio CANNOT work with coordinate extraction methods
 * - After Selenium fully loads the page, the server often caches/hydrates content
 *   making Puppeteer's subsequent navigation much faster
 */

const BaseConfigScraper = require('./base-config-scraper');

class SeleniumInfiniteScrollScraper extends BaseConfigScraper {
  constructor(seleniumManager, rateLimiter, logger, options = {}) {
    // Pass null as browserManager - we'll set it later for Phase 2
    super(null, rateLimiter, logger, options);

    this.scraperType = 'selenium-infinite-scroll';
    this.seleniumManager = seleniumManager;
    this.browserManager = null;  // Set externally before scrape()

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
   * Set browser manager for Phase 2 extraction
   * Must be called before scrape() to enable Puppeteer extraction
   *
   * @param {BrowserManager} browserManager - Puppeteer browser manager
   */
  setBrowserManager(browserManager) {
    this.browserManager = browserManager;
  }

  /**
   * Scrape contacts using Selenium for loading and Puppeteer for extraction
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

    // Validate that browserManager is set for Phase 2
    if (!this.browserManager) {
      throw new Error('[SeleniumInfiniteScrollScraper] browserManager not set. Call setBrowserManager() before scrape().');
    }

    try {
      this.logger.info(`[SeleniumInfiniteScrollScraper] Starting scrape: ${url}`);
      this.logger.info(`[SeleniumInfiniteScrollScraper] Limit: ${limit > 0 ? limit : 'unlimited'}, Method: selenium-pagedown + puppeteer-extract`);

      // Ensure output path is set
      this.ensureOutputPath();

      // Get scroll config from loaded config if available
      if (this.config?.pagination?.scrollConfig) {
        this.scrollConfig = { ...this.scrollConfig, ...this.config.pagination.scrollConfig };
        this.logger.info(`[SeleniumInfiniteScrollScraper] Using config scroll settings`);
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 1: LOAD WITH SELENIUM
      // ═══════════════════════════════════════════════════════════

      this.logger.info(`[SeleniumInfiniteScrollScraper] ═══════════════════════════════════════`);
      this.logger.info(`[SeleniumInfiniteScrollScraper] PHASE 1: Loading page with Selenium`);
      this.logger.info(`[SeleniumInfiniteScrollScraper] ═══════════════════════════════════════`);

      // Navigate to URL
      this.logger.info(`[SeleniumInfiniteScrollScraper] Navigating to: ${url}`);
      await this.seleniumManager.navigate(url);

      // Scroll to fully load page
      this.logger.info(`[SeleniumInfiniteScrollScraper] Starting infinite scroll...`);
      const scrollStats = await this.seleniumManager.scrollToFullyLoad(this.scrollConfig);

      // Log scroll statistics
      this.logger.info(`[SeleniumInfiniteScrollScraper] Scroll complete:`);
      this.logger.info(`[SeleniumInfiniteScrollScraper]   - Scrolls: ${scrollStats.scrollCount}`);
      this.logger.info(`[SeleniumInfiniteScrollScraper]   - Height changes: ${scrollStats.heightChanges}`);
      this.logger.info(`[SeleniumInfiniteScrollScraper]   - Final height: ${scrollStats.finalHeight}px`);
      this.logger.info(`[SeleniumInfiniteScrollScraper]   - Stop reason: ${scrollStats.stopReason}`);

      // ═══════════════════════════════════════════════════════════
      // PHASE 2: EXTRACT WITH SELENIUM (using JavaScript)
      // ═══════════════════════════════════════════════════════════
      //
      // Key insight: Puppeteer's PAGE_DOWN doesn't trigger this site's
      // infinite scroll, but Selenium's does. So we extract directly
      // from Selenium's DOM using JavaScript execution.
      // ═══════════════════════════════════════════════════════════

      this.logger.info(`[SeleniumInfiniteScrollScraper] ═══════════════════════════════════════`);
      this.logger.info(`[SeleniumInfiniteScrollScraper] PHASE 2: Extracting with Selenium JS`);
      this.logger.info(`[SeleniumInfiniteScrollScraper] ═══════════════════════════════════════`);

      // Extract directly from Selenium's fully-loaded page using JavaScript
      const results = await this.extractAllCardsFromSelenium(limit);

      // Add scroll stats to results
      results.scrollStats = scrollStats;

      return results;

    } catch (error) {
      this.logger.error(`[SeleniumInfiniteScrollScraper] Scraping failed: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  /**
   * Extract all cards from Selenium's fully-loaded page using JavaScript
   * This is the core extraction method - no Puppeteer needed
   *
   * @param {number} limit - Max contacts to extract (0 = unlimited)
   * @returns {Promise<Object>} - Results object
   */
  async extractAllCardsFromSelenium(limit) {
    this.logger.info(`[SeleniumInfiniteScrollScraper] Extracting contacts using Selenium JavaScript...`);

    const driver = this.seleniumManager.getDriver();
    const fields = this.config.fields;

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

    this.logger.info(`[SeleniumInfiniteScrollScraper] Found ${totalCards} cards in Selenium DOM`);

    // Determine how many to extract
    const cardsToExtract = limit > 0 ? Math.min(totalCards, limit) : totalCards;
    this.logger.info(`[SeleniumInfiniteScrollScraper] Processing ${cardsToExtract} contacts (limit: ${limit > 0 ? limit : 'unlimited'})`);

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
          this.logger.info(`[SeleniumInfiniteScrollScraper] Processed ${i + 1}/${cardsToExtract} contacts`);
        }
      } catch (err) {
        this.logger.warn(`[SeleniumInfiniteScrollScraper] Error processing card ${i}: ${err.message}`);
      }
    }

    this.logger.info(`[SeleniumInfiniteScrollScraper] ✓ Extraction complete: ${this.contactCount} contacts`);

    // Flush remaining contacts
    this.flushContactBuffer();

    // Close Selenium now that we're done
    this.logger.info(`[SeleniumInfiniteScrollScraper] Closing Selenium driver...`);
    await this.seleniumManager.close();

    return this.getResults();
  }

  /**
   * Scroll page using Puppeteer to load all content (DEPRECATED)
   * NOTE: Puppeteer's PAGE_DOWN doesn't trigger many infinite scroll sites
   * Use extractAllCardsFromSelenium instead
   *
   * @param {Object} page - Puppeteer page
   */
  async scrollToFullyLoadPuppeteer(page) {
    const maxScrolls = this.scrollConfig.maxScrolls || 1000;
    const scrollDelay = this.scrollConfig.scrollDelay || 400;
    const maxRetries = this.scrollConfig.maxRetries || 25;

    let scrollCount = 0;
    let lastHeight = await page.evaluate(() => document.body.scrollHeight);
    let retries = 0;
    let heightChanges = 0;

    this.logger.info(`[SeleniumInfiniteScrollScraper] Starting Puppeteer scroll (PAGE_DOWN, delay=${scrollDelay}ms)`);

    // Try to dismiss cookie banners first
    try {
      const cookieSelectors = [
        '#onetrust-accept-btn-handler',
        '.cookie-accept',
        '[data-cookie-accept]',
        '#accept-cookies'
      ];
      for (const selector of cookieSelectors) {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          this.logger.info(`[SeleniumInfiniteScrollScraper] Dismissed cookie banner: ${selector}`);
          await page.waitForTimeout(500);
          break;
        }
      }
    } catch (e) {
      // Ignore cookie dismissal errors
    }

    // Wait for initial content
    await page.waitForTimeout(3000);

    while (scrollCount < maxScrolls && retries < maxRetries) {
      scrollCount++;

      // Simulate PAGE_DOWN key press for reliable scroll triggering
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(scrollDelay);

      // Check height after each scroll
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      if (currentHeight > lastHeight) {
        // Height changed - new content loaded, reset retries
        heightChanges++;
        const increase = currentHeight - lastHeight;
        this.logger.info(`[SeleniumInfiniteScrollScraper] [${scrollCount}] Height changed: ${lastHeight} -> ${currentHeight} (+${increase}px)`);
        retries = 0;  // RESET on height change
        lastHeight = currentHeight;
      } else {
        retries++;

        // Every 5 failed retries, try scroll up/down cycle
        if (retries % 5 === 0) {
          this.logger.info(`[SeleniumInfiniteScrollScraper] [${scrollCount}] No change (retry ${retries}/${maxRetries}) - trying scroll up/down cycle`);
          await page.keyboard.press('PageUp');
          await page.waitForTimeout(300);
          await page.keyboard.press('PageUp');
          await page.waitForTimeout(300);
          await page.keyboard.press('PageDown');
          await page.waitForTimeout(300);
          await page.keyboard.press('PageDown');
          await page.waitForTimeout(300);
        }
      }
    }

    // Log completion
    if (retries >= maxRetries) {
      this.logger.info(`[SeleniumInfiniteScrollScraper] Puppeteer scroll complete: Reached max retries (${maxRetries} consecutive no-change attempts)`);
    } else if (scrollCount >= maxScrolls) {
      this.logger.info(`[SeleniumInfiniteScrollScraper] Puppeteer scroll complete: Reached max scrolls (${maxScrolls})`);
    }

    this.logger.info(`[SeleniumInfiniteScrollScraper] Total scrolls: ${scrollCount}, Height changes: ${heightChanges}`);
    this.logger.info(`[SeleniumInfiniteScrollScraper] Final height: ${lastHeight}px`);

    // Wait for final content to render
    await page.waitForTimeout(2000);
  }

  /**
   * Extract all cards from the fully-loaded page using Puppeteer
   * This is the same as InfiniteScrollScraper.extractAllCards()
   *
   * @param {Object} page - Puppeteer page
   * @param {number} limit - Max contacts to extract (0 = unlimited)
   * @returns {Promise<Object>} - Results object
   */
  async extractAllCards(page, limit) {
    this.logger.info(`[SeleniumInfiniteScrollScraper] ═══════════════════════════════════════`);
    this.logger.info(`[SeleniumInfiniteScrollScraper] Extracting all contacts from loaded page`);
    this.logger.info(`[SeleniumInfiniteScrollScraper] ═══════════════════════════════════════`);

    // Wait for card selector to ensure cards are rendered
    try {
      await page.waitForSelector(this.cardSelector, { timeout: 5000 });
    } catch (err) {
      this.logger.warn(`[SeleniumInfiniteScrollScraper] Warning: Card selector not found: ${this.cardSelector}`);
    }

    // Find ALL cards on the fully-loaded page
    const allCardElements = await this.findCardElements(page);
    const totalCards = allCardElements.length;

    this.logger.info(`[SeleniumInfiniteScrollScraper] Found ${totalCards} total cards on page`);

    // Determine how many to extract based on limit
    const cardsToExtract = limit > 0 ? Math.min(totalCards, limit) : totalCards;
    this.logger.info(`[SeleniumInfiniteScrollScraper] Extracting ${cardsToExtract} contacts (limit: ${limit > 0 ? limit : 'unlimited'})`);

    // Extract contacts from all cards in single pass
    for (let i = 0; i < cardsToExtract; i++) {
      const card = allCardElements[i];

      try {
        // Use existing extractContactFromCard which uses Puppeteer ElementHandles
        const contact = await this.extractContactFromCard(card, i);

        if (contact) {
          this.addContact(contact);

          // Progress update every 10 contacts
          if ((i + 1) % 10 === 0 || (i + 1) === cardsToExtract) {
            this.logger.info(`[SeleniumInfiniteScrollScraper] Extracted ${i + 1}/${cardsToExtract} contacts`);

            // Report progress to frontend
            this.reportProgress('Extracting', {
              cards: `${i + 1}/${cardsToExtract}`
            });
          }
        }
      } catch (err) {
        this.logger.warn(`[SeleniumInfiniteScrollScraper] Error extracting card ${i}: ${err.message}`);
      }
    }

    this.logger.info(`[SeleniumInfiniteScrollScraper] ✓ Extraction complete: ${this.contactCount} contacts`);

    // Flush remaining contacts
    this.flushContactBuffer();

    return this.getResults();
  }

  /**
   * Diagnose infinite scroll behavior using Selenium
   *
   * @param {string} url - URL to diagnose
   * @returns {Promise<Object>} - Diagnosis results
   */
  async diagnose(url) {
    this.logger.info('[SeleniumInfiniteScrollScraper] Running Selenium diagnosis...');

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

      this.logger.info(`[SeleniumInfiniteScrollScraper] Diagnosis: ${JSON.stringify(diagnosis, null, 2)}`);

      return diagnosis;

    } catch (error) {
      this.logger.error(`[SeleniumInfiniteScrollScraper] Diagnosis failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = SeleniumInfiniteScrollScraper;
