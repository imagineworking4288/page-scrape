/**
 * InfiniteScrollScraper
 *
 * Specialized scraper for dynamically loading pages that use infinite scroll.
 * Implements fallback chain: HTML (during scroll) -> Select -> PDF
 *
 * Features:
 * - Scroll management with configurable delays
 * - Content extraction during scrolling for efficiency
 * - Load More button detection and clicking
 * - Fallback to Select and PDF methods on low completeness
 * - Comprehensive deduplication via ContentTracker
 */

const BaseScraper = require('./base-scraper');
const { InfiniteScrollHandler, ContentTracker, ScrollDetector } = require('../features/infinite-scroll');

class InfiniteScrollScraper extends BaseScraper {
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

    // Common card selectors for auto-detection
    this.defaultCardSelectors = [
      '[data-testid*="card"]',
      '[data-testid*="profile"]',
      '[data-testid*="contact"]',
      '.attorney-card',
      '.lawyer-card',
      '[class*="attorney"]',
      '[class*="lawyer"]',
      '.card',
      '.profile-card',
      '.contact-card',
      'article.card',
      '.grid-item',
      '.list-item'
    ];

    // Tracking
    this.contentTracker = new ContentTracker();
    this.scrollHandler = null;
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
      this.logger.info('  INFINITE SCROLL SCRAPER');
      this.logger.info('═══════════════════════════════════════');
      this.logger.info(`URL: ${url}`);

      // Merge options with site config
      this.applyConfig(siteConfig);

      // Navigate to page
      const page = this.browserManager.getPage();
      await this.browserManager.navigate(url);
      await this.sleep(3000); // Initial render time

      // Detect card selector if not provided
      const cardSelector = await this.detectCardSelector(page);
      this.logger.info(`Card selector: ${cardSelector || 'full page'}`);

      // Get selectors from config
      const selectors = this.getSelectors(siteConfig);

      // Phase 1: Extract during infinite scroll
      this.logger.info('');
      this.logger.info('Phase 1: Infinite scroll extraction');
      this.logger.info('───────────────────────────────────');

      const scrollResult = await this.scrollAndExtract(page, cardSelector, selectors);
      let contacts = scrollResult.contacts;
      let completeness = this.calculateCompleteness(contacts);

      this.logger.info(`Scroll complete: ${contacts.length} contacts (${(completeness * 100).toFixed(0)}% complete)`);

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
   * Get selectors from site config
   * @param {Object} siteConfig - Site configuration
   * @returns {Object} - Selector configuration
   */
  getSelectors(siteConfig) {
    return {
      container: siteConfig?.selectors?.container || this.cardSelector,
      name: siteConfig?.selectors?.name || 'h2, h3, .name, [class*="name"]',
      email: siteConfig?.selectors?.email || 'a[href^="mailto:"]',
      phone: siteConfig?.selectors?.phone || 'a[href^="tel:"], .phone, [class*="phone"]'
    };
  }

  /**
   * Detect card selector if not provided
   * @param {Object} page - Puppeteer page
   * @returns {Promise<string|null>} - Detected card selector
   */
  async detectCardSelector(page) {
    if (this.cardSelector) return this.cardSelector;

    this.logger.info('Auto-detecting card selector...');

    for (const selector of this.defaultCardSelectors) {
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
   * Check if elements with selector have similar structure
   * @param {Object} page - Puppeteer page
   * @param {string} selector - CSS selector
   * @returns {Promise<boolean>}
   */
  async checkStructuralSimilarity(page, selector) {
    try {
      return await page.evaluate((sel) => {
        const elements = Array.from(document.querySelectorAll(sel));
        if (elements.length < 3) return false;

        const samples = elements.slice(0, 3);
        const structures = samples.map(el => ({
          childCount: el.children.length,
          textLength: el.textContent.trim().length,
          hasLinks: el.querySelectorAll('a').length > 0
        }));

        // Check variance in child counts
        const childCounts = structures.map(s => s.childCount);
        const avgChildCount = childCounts.reduce((a, b) => a + b, 0) / childCounts.length;
        const childCountValid = childCounts.every(c => Math.abs(c - avgChildCount) <= 3);

        return childCountValid;
      }, selector);
    } catch (e) {
      return false;
    }
  }

  /**
   * Perform infinite scroll and extract contacts
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @param {Object} selectors - Extraction selectors
   * @returns {Promise<Object>} - { contacts, stats }
   */
  async scrollAndExtract(page, cardSelector, selectors) {
    this.contentTracker.clear();
    const allContacts = [];
    let scrollAttempts = 0;
    let noNewContentCount = 0;
    let previousHeight = await page.evaluate(() => document.body.scrollHeight);
    let previousCardCount = cardSelector ?
      await page.$$eval(cardSelector, els => els.length).catch(() => 0) : 0;

    this.logger.info(`Initial state: ${previousCardCount} cards, height ${previousHeight}px`);

    while (scrollAttempts < this.maxScrollAttempts) {
      // Extract current visible contacts
      const currentContacts = await this.extractContactsFromPage(page, cardSelector, selectors);
      let newItemsFound = 0;

      for (const contact of currentContacts) {
        if (this.contentTracker.checkAndMark(contact)) {
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
      await this.waitForContentLoad(page);

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
   * Extract contacts from current page state
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @param {Object} selectors - Extraction selectors
   * @returns {Promise<Array>} - Array of contacts
   */
  async extractContactsFromPage(page, cardSelector, selectors) {
    try {
      const contacts = await page.evaluate((cardSel, sels) => {
        const results = [];
        const cards = cardSel ? document.querySelectorAll(cardSel) : [document.body];

        for (const card of cards) {
          // Extract email
          let email = null;
          const emailLink = card.querySelector(sels.email || 'a[href^="mailto:"]');
          if (emailLink) {
            email = emailLink.href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
          }

          // Skip if no email (email-first strategy)
          if (!email) continue;

          // Extract name
          let name = null;
          const nameSelectors = (sels.name || 'h2, h3, .name').split(',').map(s => s.trim());
          for (const nameSel of nameSelectors) {
            try {
              const nameEl = card.querySelector(nameSel);
              if (nameEl) {
                const text = nameEl.textContent.trim();
                // Basic name validation
                if (text.length >= 2 && text.length <= 100 && /^[A-Z]/.test(text)) {
                  name = text;
                  break;
                }
              }
            } catch (e) {}
          }

          // Extract phone
          let phone = null;
          const phoneSelectors = (sels.phone || 'a[href^="tel:"]').split(',').map(s => s.trim());
          for (const phoneSel of phoneSelectors) {
            try {
              const phoneEl = card.querySelector(phoneSel);
              if (phoneEl) {
                phone = phoneEl.href ?
                  phoneEl.href.replace('tel:', '').trim() :
                  phoneEl.textContent.trim();
                if (phone) break;
              }
            } catch (e) {}
          }

          results.push({
            name,
            email,
            phone,
            source: 'infinite-scroll-html'
          });
        }

        return results;
      }, cardSelector, selectors);

      // Add domain info and confidence
      for (const contact of contacts) {
        this.addDomainInfo(contact);
        contact.confidence = this.calculateConfidence(contact.name, contact.email, contact.phone);
      }

      return contacts;
    } catch (error) {
      this.logger.warn(`Extraction error: ${error.message}`);
      return [];
    }
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
   * Perform scroll action
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
   */
  async waitForContentLoad(page) {
    try {
      // Try network idle first
      await Promise.race([
        page.waitForNetworkIdle({ idleTime: 500, timeout: this.networkIdleTimeout }),
        this.sleep(this.networkIdleTimeout)
      ]);
    } catch (e) {
      // Timeout is fine
    }

    // Always add minimum delay
    await this.sleep(this.scrollDelay);
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

      // Use email-anchor extraction
      const contacts = this.extractByEmailAnchor ?
        this.extractByEmailAnchor(pdfData.fullText, uniqueEmails) :
        Array.from(uniqueEmails).map(email => ({
          name: this.extractNameFromEmail(email),
          email,
          phone: null,
          source: 'infinite-scroll-pdf'
        }));

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
   * Extract contacts by email anchor (fallback method)
   * Imported from SimpleScraper for consistency
   * @param {string} fullText - Full text to search
   * @param {Set} uniqueEmails - Set of unique emails
   * @returns {Array} - Array of contacts
   */
  extractByEmailAnchor(fullText, uniqueEmails) {
    const contacts = [];
    const processedEmails = new Set();

    for (const email of uniqueEmails) {
      if (processedEmails.has(email.toLowerCase())) continue;
      processedEmails.add(email.toLowerCase());

      const emailPos = fullText.toLowerCase().indexOf(email.toLowerCase());
      if (emailPos === -1) continue;

      // Extract context
      const beforeStart = Math.max(0, emailPos - 200);
      const beforeContext = fullText.substring(beforeStart, emailPos);
      const afterEnd = Math.min(fullText.length, emailPos + email.length + 100);
      const afterContext = fullText.substring(emailPos + email.length, afterEnd);

      // Find name in before context
      const nameResult = this.findNameInContext(beforeContext, email, emailPos);
      const phone = this.findPhoneInContext(afterContext);

      contacts.push({
        name: nameResult ? nameResult.name : this.extractNameFromEmail(email),
        email,
        phone,
        source: nameResult ? 'pdf-anchor' : 'pdf-derived',
        confidence: this.calculateConfidence(
          nameResult ? nameResult.name : null,
          email,
          phone
        )
      });
    }

    return contacts;
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
