/**
 * InfiniteScrollScraper - Simple 2-phase scraper
 *
 * Phase 1: Scroll to load all content (ScrollController)
 * Phase 2: Extract contacts from LOADED page (no navigation)
 *
 * CRITICAL: Does NOT reload page after scrolling - extracts from current DOM state
 */

const path = require('path');
const ScrollController = require('./scroll-controller');

class InfiniteScrollScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;

    // Import SimpleScraper to reuse its extraction methods
    const SimpleScraper = require(path.join(__dirname, '..', 'src', 'scrapers', 'simple-scraper'));
    this.simpleScraper = new SimpleScraper(browserManager, rateLimiter, logger);

    // Import DomainExtractor for business email filtering
    const DomainExtractor = require(path.join(__dirname, '..', 'src', 'utils', 'domain-extractor'));
    this.domainExtractor = new DomainExtractor();

    // Get universal extraction code from contact-extractor
    const contactExtractor = require(path.join(__dirname, '..', 'src', 'utils', 'contact-extractor'));
    this.universalExtractionCode = contactExtractor.getUniversalExtractionCode();
    this.NAME_BLACKLIST = contactExtractor.NAME_BLACKLIST;
  }

  /**
   * Main scrape method for infinite scroll pages
   * @param {string} url - URL to scrape
   * @param {Object} options - Scraping options
   * @param {number} options.maxScrolls - Max scroll attempts (default: 50)
   * @param {number} options.scrollDelay - Delay between scrolls in ms (default: 1500)
   * @param {number} options.limit - Max contacts to extract (default: null)
   * @returns {Promise<Array>} - Array of contact objects
   */
  async scrape(url, options = {}) {
    console.log('');
    console.log('========================================');
    console.log('  INFINITE SCROLL SCRAPER');
    console.log('========================================');
    console.log(`URL: ${url}`);
    console.log('');

    try {
      this.logger.info('========================================');
      this.logger.info('  INFINITE SCROLL SCRAPER');
      this.logger.info('========================================');
      this.logger.info(`URL: ${url}`);
      this.logger.info('');

      // PHASE 1: Navigate to page
      console.log('Phase 1: Navigation');
      console.log('-------------------');
      this.logger.info('Phase 1: Navigation');
      this.logger.info('-------------------');

      const page = this.browserManager.getPage();
      console.log('Got page instance from browserManager');

      console.log(`Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      console.log('Navigation complete, waiting for JS render...');
      await this.sleep(3000); // Let JavaScript render

      console.log('Page loaded successfully');
      this.logger.info('Page loaded successfully');
      this.logger.info('');

      // PHASE 2: Scroll to load all content
      console.log('');
      console.log('Phase 2: Scroll to End');
      console.log('----------------------');
      this.logger.info('Phase 2: Scroll to End');
      this.logger.info('----------------------');

      const scrollController = new ScrollController(page, this.logger, {
        maxScrolls: options.maxScrolls || 50,
        scrollDelay: options.scrollDelay || 1500,
        noChangeThreshold: options.noChangeThreshold || 3
      });

      console.log('Starting scroll to load all content...');
      const scrollStats = await scrollController.scrollToEnd();

      console.log('');
      console.log(`Scroll complete: ${scrollStats.scrollsPerformed} scrolls performed`);
      console.log(`Final page height: ${scrollStats.finalHeight}px`);
      this.logger.info('');
      this.logger.info(`Scroll complete: ${scrollStats.scrollsPerformed} scrolls performed`);
      this.logger.info(`Final page height: ${scrollStats.finalHeight}px`);
      this.logger.info('');

      // PHASE 3: Extract contacts from LOADED page (NO NAVIGATION!)
      console.log('');
      console.log('Phase 3: Extract Contacts');
      console.log('-------------------------');
      console.log('IMPORTANT: Extracting from loaded page (no reload)');
      this.logger.info('Phase 3: Extract Contacts');
      this.logger.info('-------------------------');
      this.logger.info('Extracting from loaded page (no navigation)');

      // Scroll back to top before extraction
      console.log('Scrolling back to top...');
      await page.evaluate(() => window.scrollTo(0, 0));
      await this.sleep(1000);

      // CRITICAL FIX: Use extractFromLoadedPage instead of simpleScraper.scrape
      // simpleScraper.scrape() navigates to the URL, which DESTROYS scrolled content!
      const contacts = await this.extractFromLoadedPage(page, options);

      console.log('');
      console.log('========================================');
      console.log(`  COMPLETE: ${contacts.length} contacts extracted`);
      console.log('========================================');
      this.logger.info('');
      this.logger.info('========================================');
      this.logger.info(`  COMPLETE: ${contacts.length} contacts extracted`);
      this.logger.info('========================================');

      return contacts;

    } catch (error) {
      console.error('');
      console.error('SCRAPING FAILED!');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      this.logger.error(`Infinite scroll scraping failed: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  /**
   * Extract contacts from already-loaded page WITHOUT navigation
   * CRITICAL: This method does NOT call browserManager.navigate()
   * It extracts from the current DOM state which has all scrolled content
   *
   * @param {Object} page - Puppeteer page object (already loaded with scrolled content)
   * @param {Object} options - Extraction options
   * @param {number} options.limit - Max contacts to extract
   * @returns {Promise<Array>} - Array of contact objects
   */
  async extractFromLoadedPage(page, options = {}) {
    const limit = options.limit || null;

    try {
      // Step 1: Detect card pattern
      console.log('Card detection starting...');
      const cardSelector = await this.simpleScraper.detectCardPattern(page);
      console.log(`Card selector: ${cardSelector || 'null (using full page)'}`);
      this.logger.info(`Using selector: ${cardSelector || 'full page'}`);

      if (!cardSelector) {
        console.log('WARNING: No card pattern detected, will extract from entire page');
      }

      // Count cards for diagnostics
      if (cardSelector) {
        const cardCount = await page.evaluate((sel) => {
          return document.querySelectorAll(sel).length;
        }, cardSelector);
        console.log(`Found ${cardCount} cards on page`);
        this.logger.info(`Found ${cardCount} cards on page`);
      }

      // Step 2: Extract unique business emails
      console.log('Email extraction starting...');
      const uniqueEmails = await this.extractUniqueEmailsFromPage(page, cardSelector, limit);
      console.log(`Found ${uniqueEmails.size} unique business emails`);
      this.logger.info(`Found ${uniqueEmails.size} unique business emails`);

      if (uniqueEmails.size === 0) {
        console.log('WARNING: No emails found on page!');
        console.log('This could indicate:');
        console.log('  - Emails are on profile pages only');
        console.log('  - Emails are in a format not recognized');
        console.log('  - Page content did not load correctly');
      }

      // Step 3: Build contacts from emails
      console.log('Building contacts from emails...');
      const contacts = await this.buildContactsFromEmailsOnPage(uniqueEmails, page, cardSelector);
      console.log(`Built ${contacts.length} contacts`);
      this.logger.info(`Built ${contacts.length} contacts`);

      if (contacts.length === 0 && uniqueEmails.size > 0) {
        console.log('WARNING: Found emails but could not build contacts!');
      }

      // Step 4: Add domain info to all contacts
      for (const contact of contacts) {
        this.addDomainInfo(contact);
      }

      return contacts;

    } catch (error) {
      console.error('extractFromLoadedPage failed:', error.message);
      console.error('Stack:', error.stack);
      this.logger.error(`Extraction failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract unique emails from page without navigation
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @param {number} limit - Max emails to extract
   * @returns {Promise<Set>} - Set of unique email addresses
   */
  async extractUniqueEmailsFromPage(page, cardSelector, limit) {
    const extractionCode = this.universalExtractionCode;

    const emails = await page.evaluate((selector, code) => {
      // Inject and execute universal extraction code
      eval(code);

      const cards = selector ? document.querySelectorAll(selector) : [document.body];
      const emailSet = new Set();

      cards.forEach(card => {
        // Use universal extraction which handles:
        // - mailto: links
        // - Plain text emails
        // - data-email attributes
        // - Obfuscated emails (at/dot patterns)
        // - Encoded href emails
        const extractedEmails = extractEmailsFromElement(card, {});
        extractedEmails.forEach(item => {
          if (item.email) {
            emailSet.add(item.email.toLowerCase());
          }
        });
      });

      return Array.from(emailSet);
    }, cardSelector, extractionCode);

    console.log(`Raw emails extracted: ${emails.length}`);

    // Filter to business domains only
    const businessEmails = new Set();
    for (const email of emails) {
      const domain = this.domainExtractor.extractAndNormalize(email);
      if (domain && this.domainExtractor.isBusinessDomain(domain)) {
        businessEmails.add(email);
        if (limit && businessEmails.size >= limit) break;
      }
    }

    console.log(`Business emails after filtering: ${businessEmails.size}`);
    return businessEmails;
  }

  /**
   * Build contacts from emails on current page without navigation
   * @param {Set} uniqueEmails - Set of unique emails
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @returns {Promise<Array>} - Array of contact objects
   */
  async buildContactsFromEmailsOnPage(uniqueEmails, page, cardSelector) {
    const extractionCode = this.universalExtractionCode;
    const blacklistArray = Array.from(this.NAME_BLACKLIST);

    const contacts = await page.evaluate((emails, selector, code, blacklist) => {
      // Inject universal extraction code
      eval(code);

      const emailArray = Array.from(emails);
      const contacts = [];
      const blacklistSet = new Set(blacklist);

      // Helper to find card containing email (supports both mailto and plain text)
      const findCardWithEmail = (email, cards) => {
        for (const card of cards) {
          // Check mailto link first
          const mailtoLink = card.querySelector(`a[href^="mailto:${email}"]`);
          if (mailtoLink) return card;

          // Check plain text content
          const textContent = card.textContent.toLowerCase();
          if (textContent.includes(email.toLowerCase())) return card;
        }
        return null;
      };

      for (const email of emailArray) {
        const cards = selector ? document.querySelectorAll(selector) : [document.body];
        const cardWithEmail = findCardWithEmail(email, cards);

        if (!cardWithEmail) continue;

        // Use universal extraction for phone
        const extractedPhones = extractPhonesFromElement(cardWithEmail, {});
        const phone = extractedPhones.length > 0 ? extractedPhones[0].phone : null;

        // Use universal extraction for name
        const name = extractNameFromElement(cardWithEmail, { blacklist: blacklistSet });

        // Extract profile URL
        let profileUrl = null;
        const profilePatterns = [
          'a[href*="/agent/"]', 'a[href*="/profile/"]',
          'a[href*="/lawyer/"]', 'a[href*="/Lawyers/"]',
          'a[href*="/attorney/"]', 'a[href*="/people/"]'
        ];
        for (const pattern of profilePatterns) {
          const profileLink = cardWithEmail.querySelector(pattern);
          if (profileLink) {
            profileUrl = profileLink.href;
            break;
          }
        }

        // Calculate confidence
        let confidence = 'low';
        if (name && email && phone) {
          confidence = 'high';
        } else if ((name && email) || (email && phone) || (name && phone)) {
          confidence = 'medium';
        }

        contacts.push({
          name,
          email,
          phone,
          profileUrl,
          source: 'html-infinite-scroll',
          confidence
        });
      }

      return contacts;
    }, Array.from(uniqueEmails), cardSelector, extractionCode, blacklistArray);

    return contacts;
  }

  /**
   * Add domain information to contact
   * @param {Object} contact - Contact object with email
   */
  addDomainInfo(contact) {
    if (!contact.email) return;

    const domain = this.domainExtractor.extractAndNormalize(contact.email);
    if (domain) {
      contact.domain = domain;
      contact.domainType = this.domainExtractor.isBusinessDomain(domain) ? 'business' : 'consumer';
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = InfiniteScrollScraper;
