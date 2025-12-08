/**
 * Selenium Infinite Scroll Scraper
 *
 * Config-based scraper that uses Selenium WebDriver for reliable infinite scroll
 * loading, then extracts contacts using the existing config-based extraction system.
 *
 * Two-Phase Architecture:
 * PHASE 1 - LOAD WITH SELENIUM:
 *   - Launch Selenium driver
 *   - Navigate to URL
 *   - Use PAGE_DOWN key simulation to trigger infinite scroll
 *   - Monitor height changes with retry logic
 *   - Get fully-loaded HTML
 *
 * PHASE 2 - EXTRACT WITH CONFIG:
 *   - Parse HTML with Cheerio
 *   - Find card elements using config selector
 *   - Extract contacts using config field methods
 *   - Return results in standard format
 *
 * Why Selenium + PAGE_DOWN:
 * - More reliable than scrollBy() for triggering lazy loaders
 * - Keyboard events properly fire scroll event handlers
 * - Retry counter reset logic ensures complete page loading
 */

const cheerio = require('cheerio');
const BaseConfigScraper = require('./base-config-scraper');

class SeleniumInfiniteScrollScraper extends BaseConfigScraper {
  constructor(seleniumManager, rateLimiter, logger, options = {}) {
    // Pass seleniumManager as browserManager for interface consistency
    super(seleniumManager, rateLimiter, logger, options);

    this.scraperType = 'selenium-infinite-scroll';
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
   * Scrape contacts using Selenium for loading and config for extraction
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
      this.logger.info(`[SeleniumInfiniteScrollScraper] Starting scrape: ${url}`);
      this.logger.info(`[SeleniumInfiniteScrollScraper] Limit: ${limit > 0 ? limit : 'unlimited'}, Method: selenium-pagedown`);

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

      // Get fully-loaded HTML
      const html = await this.seleniumManager.getPageSource();
      this.logger.info(`[SeleniumInfiniteScrollScraper] HTML captured: ${html.length} characters`);

      // ═══════════════════════════════════════════════════════════
      // PHASE 2: EXTRACT WITH CONFIG
      // ═══════════════════════════════════════════════════════════

      this.logger.info(`[SeleniumInfiniteScrollScraper] ═══════════════════════════════════════`);
      this.logger.info(`[SeleniumInfiniteScrollScraper] PHASE 2: Extracting contacts from HTML`);
      this.logger.info(`[SeleniumInfiniteScrollScraper] ═══════════════════════════════════════`);

      // Parse HTML with Cheerio
      const $ = cheerio.load(html);

      // Find all card elements
      const cardElements = $(this.cardSelector);
      const totalCards = cardElements.length;

      this.logger.info(`[SeleniumInfiniteScrollScraper] Found ${totalCards} cards using selector: ${this.cardSelector}`);

      if (totalCards === 0) {
        this.logger.warn(`[SeleniumInfiniteScrollScraper] No cards found! Check card selector.`);

        // Try fallback selectors
        if (this.cardFallbacks.length > 0) {
          for (const fallback of this.cardFallbacks) {
            const fallbackCards = $(fallback);
            if (fallbackCards.length > 0) {
              this.logger.info(`[SeleniumInfiniteScrollScraper] Fallback selector found ${fallbackCards.length} cards: ${fallback}`);
              break;
            }
          }
        }
      }

      // Determine how many to extract
      const cardsToExtract = limit > 0 ? Math.min(totalCards, limit) : totalCards;
      this.logger.info(`[SeleniumInfiniteScrollScraper] Extracting ${cardsToExtract} contacts`);

      // Extract contacts from cards
      cardElements.slice(0, cardsToExtract).each((index, element) => {
        try {
          const contact = this.extractContactFromCheerio($, element, index);

          if (contact) {
            this.addContact(contact);

            // Progress update
            if ((index + 1) % 10 === 0 || (index + 1) === cardsToExtract) {
              this.logger.info(`[SeleniumInfiniteScrollScraper] Extracted ${index + 1}/${cardsToExtract} contacts`);
            }
          }
        } catch (err) {
          this.logger.warn(`[SeleniumInfiniteScrollScraper] Error extracting card ${index}: ${err.message}`);
        }
      });

      this.logger.info(`[SeleniumInfiniteScrollScraper] ✓ Extraction complete: ${this.contactCount} contacts`);

      // Flush remaining contacts
      this.flushContactBuffer();

      // Add scroll stats to results
      const results = this.getResults();
      results.scrollStats = scrollStats;

      return results;

    } catch (error) {
      this.logger.error(`[SeleniumInfiniteScrollScraper] Scraping failed: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  /**
   * Extract contact from a Cheerio element
   * Adapts the base class extraction for Cheerio instead of Puppeteer
   *
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {Element} element - Card element
   * @param {number} cardIndex - Card index
   * @returns {Object|null} - Contact object or null
   */
  extractContactFromCheerio($, element, cardIndex) {
    const $card = $(element);
    const contact = {
      _cardIndex: cardIndex,
      _extractionMethods: {}
    };

    const fields = this.config.fields;
    let successCount = 0;

    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
      const method = fieldConfig.userValidatedMethod || fieldConfig.method;
      const selector = fieldConfig.selector;
      const coords = fieldConfig.coordinates;

      if (!method) {
        continue;
      }

      try {
        let value = null;

        switch (method) {
          case 'mailto-link':
            // Find mailto link
            const mailtoLink = $card.find('a[href^="mailto:"]').first();
            if (mailtoLink.length) {
              value = mailtoLink.attr('href').replace('mailto:', '').split('?')[0];
            }
            break;

          case 'tel-link':
            // Find tel link
            const telLink = $card.find('a[href^="tel:"]').first();
            if (telLink.length) {
              value = telLink.attr('href').replace('tel:', '');
            }
            break;

          case 'href-link':
            // Find profile link
            if (selector) {
              const link = $card.find(selector).first();
              if (link.length) {
                value = link.attr('href');
              }
            } else {
              // Look for any link that might be a profile
              const links = $card.find('a[href]');
              links.each((i, el) => {
                const href = $(el).attr('href');
                if (href && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('#')) {
                  if (!value) value = href;
                }
              });
            }
            break;

          case 'coordinate-text':
          case 'selector':
          default:
            // Use selector if provided
            if (selector) {
              const el = $card.find(selector).first();
              if (el.length) {
                value = el.text().trim();
              }
            }
            // Fall back to searching by common patterns
            if (!value && fieldName === 'name') {
              // Look for heading or strong text
              const nameEl = $card.find('h1, h2, h3, h4, h5, .name, [class*="name"]').first();
              if (nameEl.length) {
                value = nameEl.text().trim();
              }
            }
            if (!value && fieldName === 'title') {
              const titleEl = $card.find('.title, [class*="title"], .position, [class*="position"]').first();
              if (titleEl.length) {
                value = titleEl.text().trim();
              }
            }
            if (!value && fieldName === 'location') {
              const locEl = $card.find('.location, [class*="location"], .office, [class*="office"]').first();
              if (locEl.length) {
                value = locEl.text().trim();
              }
            }
            break;

          case 'regex-email':
            // Search card text for email pattern
            const cardText = $card.text();
            const emailMatch = cardText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) {
              value = emailMatch[0];
            }
            break;

          case 'regex-phone':
            // Search card text for phone pattern
            const phoneText = $card.text();
            const phoneMatch = phoneText.match(/[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,3}[)]?[-\s\.]?[0-9]{3,6}[-\s\.]?[0-9]{3,6}/);
            if (phoneMatch) {
              value = phoneMatch[0];
            }
            break;
        }

        if (value) {
          contact[fieldName] = this.normalizeFieldValue(fieldName, value);
          contact._extractionMethods[fieldName] = {
            method: method,
            confidence: 85
          };
          successCount++;
        }
      } catch (error) {
        this.logger.debug(`[SeleniumInfiniteScrollScraper] Failed to extract ${fieldName}: ${error.message}`);
      }
    }

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

    // Return contact if at least one field extracted
    if (successCount > 0) {
      contact.confidence = this.calculateConfidence(contact.name, contact.email, contact.phone);
      this.addDomainInfo(contact);
      return contact;
    }

    return null;
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

      // Perform limited scroll (10 PAGE_DOWNs)
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
