/**
 * InfiniteScrollScraper - Wrapper combining scroll handling with SelectScraper extraction
 *
 * Architecture:
 * - Phase 1: Use BrowserManager.navigate() for proper state management
 * - Phase 2: Scroll to load all dynamic content (ScrollController)
 * - Phase 3: Delegate extraction to SelectScraper (professional directory mode)
 *
 * This is proper separation of concerns - scrolling vs extraction are separate responsibilities.
 */

const path = require('path');
const ScrollController = require('./scroll-controller');

class InfiniteScrollScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;

    // Use SelectScraper for extraction (better for professional directories)
    // SelectScraper has sophisticated container detection and multiple extraction strategies
    const SelectScraper = require(path.join(__dirname, '..', 'src', 'scrapers', 'select-scraper'));
    this.selectScraper = new SelectScraper(browserManager, rateLimiter, logger);

    // Import DomainExtractor for business email filtering
    const DomainExtractor = require(path.join(__dirname, '..', 'src', 'utils', 'domain-extractor'));
    this.domainExtractor = new DomainExtractor();

    // Get TextParser for name blacklist
    const TextParser = require(path.join(__dirname, '..', 'src', 'utils', 'text-parser'));
    this.textParser = new TextParser(logger);

    this.logger.info('[InfiniteScrollScraper] Using SelectScraper for extraction (professional directory mode)');
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
    console.log('  INFINITE SCROLL SCRAPER (SelectScraper Mode)');
    console.log('========================================');
    console.log(`URL: ${url}`);
    console.log('');

    try {
      this.logger.info('========================================');
      this.logger.info('  INFINITE SCROLL SCRAPER (SelectScraper Mode)');
      this.logger.info('========================================');
      this.logger.info(`URL: ${url}`);
      this.logger.info('');

      // PHASE 1: Navigate using BrowserManager (proper state management)
      console.log('Phase 1: Navigation');
      console.log('-------------------');
      this.logger.info('Phase 1: Navigation');
      this.logger.info('-------------------');

      // Use BrowserManager.navigate() instead of direct page.goto()
      // This handles page recycling and state management properly
      console.log(`Navigating to: ${url}`);
      await this.browserManager.navigate(url);
      const page = this.browserManager.getPage();
      console.log('Navigation complete via BrowserManager');

      // Let dynamic content initialize
      await this.sleep(3000);
      console.log('Waited for dynamic content initialization');

      // Validate page loaded properly (not in transitional state)
      const initialHeight = await page.evaluate(() => document.body.scrollHeight);
      console.log(`Initial page height: ${initialHeight}px`);
      this.logger.info(`Initial page height: ${initialHeight}px`);

      if (initialHeight < 100) {
        console.log(`WARNING: Page height suspiciously low (${initialHeight}px), page may not have loaded properly`);
        this.logger.warn(`Page height suspiciously low (${initialHeight}px), waiting additional time...`);
        await this.sleep(5000);

        const retryHeight = await page.evaluate(() => document.body.scrollHeight);
        console.log(`After additional wait, page height: ${retryHeight}px`);
        this.logger.info(`After additional wait, page height: ${retryHeight}px`);

        if (retryHeight < 100) {
          throw new Error(`Page failed to load properly (height: ${retryHeight}px). Site may be blocking automated access.`);
        }
      }

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
   * Extract contacts from the already-loaded and scrolled page
   * Uses SelectScraper's sophisticated extraction logic
   *
   * @param {Object} page - Puppeteer page instance (already loaded and scrolled)
   * @param {Object} options - Extraction options
   * @returns {Promise<Array>} - Array of contact objects
   */
  async extractFromLoadedPage(page, options = {}) {
    try {
      console.log('[extractFromLoadedPage] Starting extraction from scrolled page...');
      this.logger.info('[extractFromLoadedPage] Starting extraction from scrolled page...');

      // Get page dimensions for full-page extraction
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      console.log(`[extractFromLoadedPage] Total page height: ${pageHeight}px`);

      // For infinite scroll pages after scrolling, we treat the entire page as the extraction zone
      // Use positions that span the full page
      const startPos = { x: 0, y: 0 };
      const endPos = { x: 0, y: pageHeight };

      // Get blacklist from text parser
      const nameBlacklist = Array.from(this.textParser.NAME_BLACKLIST);

      // Use SelectScraper's extractContactsFromDOM with universal email extraction
      console.log('[extractFromLoadedPage] Calling extractContactsUniversal...');
      const contacts = await this.extractContactsUniversal(page, startPos, endPos, nameBlacklist);

      console.log(`[extractFromLoadedPage] Extracted ${contacts.length} contacts`);
      this.logger.info(`[extractFromLoadedPage] Extracted ${contacts.length} contacts`);

      // Add pagination metadata if provided
      if (options.sourcePage || options.sourceUrl) {
        for (const contact of contacts) {
          if (options.sourcePage) contact.sourcePage = options.sourcePage;
          if (options.sourceUrl) contact.sourceUrl = options.sourceUrl;
        }
      }

      return contacts;

    } catch (error) {
      console.error('[extractFromLoadedPage] Extraction failed:', error.message);
      console.error('Stack:', error.stack);
      this.logger.error(`[extractFromLoadedPage] Extraction failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Universal contact extraction with multiple email/phone detection strategies
   * @param {Object} page - Puppeteer page
   * @param {Object} startPos - Start position {x, y}
   * @param {Object} endPos - End position {x, y}
   * @param {Array} nameBlacklist - Array of blacklisted name words
   * @returns {Promise<Array>} - Array of contact objects
   */
  async extractContactsUniversal(page, startPos, endPos, nameBlacklist) {
    const baseUrl = await page.url();

    const contacts = await page.evaluate((start, end, blacklistArray, baseUrlStr) => {
      const NAME_BLACKLIST = new Set(blacklistArray);

      // ═══════════════════════════════════════════════════════════════
      // UNIVERSAL EMAIL EXTRACTION HELPERS
      // ═══════════════════════════════════════════════════════════════

      const extractEmailsFromContainer = (container) => {
        const emails = new Set();
        const text = container.textContent || '';

        // Strategy 1: Mailto links (highest priority)
        const mailtoLinks = container.querySelectorAll('a[href^="mailto:"]');
        mailtoLinks.forEach(link => {
          const email = link.href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
          if (email && email.includes('@')) emails.add(email);
        });

        // Strategy 2: Links with "Email" text (Sullivan & Cromwell pattern)
        const allLinks = container.querySelectorAll('a[href]');
        allLinks.forEach(link => {
          const linkText = link.textContent.trim().toLowerCase();
          if (linkText === 'email' || linkText === 'e-mail' || linkText === 'send email') {
            const href = link.href || '';
            if (href.includes('mailto:')) {
              const email = href.replace(/mailto:/i, '').split('?')[0].toLowerCase().trim();
              if (email && email.includes('@')) emails.add(email);
            } else if (href.includes('@')) {
              const match = href.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
              if (match) emails.add(match[0].toLowerCase());
            }
          }
        });

        // Strategy 3: Standard regex
        const standardPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const standardMatches = text.match(standardPattern);
        if (standardMatches) {
          standardMatches.forEach(e => emails.add(e.toLowerCase()));
        }

        // Strategy 4: Obfuscated patterns [at] [dot]
        const obfuscatedPatterns = [
          /([a-zA-Z0-9._%+-]+)\s*\[at\]\s*([a-zA-Z0-9.-]+)\s*\[dot\]\s*([a-zA-Z]{2,})/gi,
          /([a-zA-Z0-9._%+-]+)\s*\(at\)\s*([a-zA-Z0-9.-]+)\s*\(dot\)\s*([a-zA-Z]{2,})/gi,
          /([a-zA-Z0-9._%+-]+)\s+at\s+([a-zA-Z0-9.-]+)\s+dot\s+([a-zA-Z]{2,})/gi
        ];

        obfuscatedPatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(text)) !== null) {
            const email = `${match[1]}@${match[2]}.${match[3]}`;
            emails.add(email.toLowerCase());
          }
        });

        // Strategy 5: HTML encoded
        const encodedPattern = /([a-zA-Z0-9._%+-]+)(?:&commat;|&#64;|&#x40;|%40)([a-zA-Z0-9.-]+)\.([a-zA-Z]{2,})/gi;
        let encodedMatch;
        while ((encodedMatch = encodedPattern.exec(text)) !== null) {
          const email = `${encodedMatch[1]}@${encodedMatch[2]}.${encodedMatch[3]}`;
          emails.add(email.toLowerCase());
        }

        return Array.from(emails);
      };

      // ═══════════════════════════════════════════════════════════════
      // UNIVERSAL PHONE EXTRACTION HELPERS
      // ═══════════════════════════════════════════════════════════════

      const extractPhonesFromContainer = (container) => {
        const phones = new Set();
        const text = container.textContent || '';

        // Strategy 1: Tel links (highest priority)
        const telLinks = container.querySelectorAll('a[href^="tel:"]');
        telLinks.forEach(link => {
          const phone = link.href.replace('tel:', '').trim();
          if (phone) phones.add(phone);
        });

        // Strategy 2: US/Canada standard
        const usPattern = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
        let usMatch;
        while ((usMatch = usPattern.exec(text)) !== null) {
          phones.add(usMatch[0]);
        }

        // Strategy 3: International
        const intlPattern = /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g;
        let intlMatch;
        while ((intlMatch = intlPattern.exec(text)) !== null) {
          phones.add(intlMatch[0]);
        }

        // Strategy 4: With extensions
        const extPattern = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\s*(?:ext\.?|x|extension)\s*\d{1,5}/gi;
        let extMatch;
        while ((extMatch = extPattern.exec(text)) !== null) {
          phones.add(extMatch[0]);
        }

        return Array.from(phones);
      };

      // ═══════════════════════════════════════════════════════════════
      // NAME EXTRACTION HELPER
      // ═══════════════════════════════════════════════════════════════

      const isValidName = (text) => {
        if (!text || text.length < 2 || text.length > 60) return false;
        const lowerText = text.toLowerCase();
        if (NAME_BLACKLIST.has(lowerText)) return false;
        const uiWords = ['find', 'agent', 'last name', 'first name', 'register', 'login', 'view', 'profile', 'search', 'filter'];
        if (uiWords.some(word => lowerText.includes(word))) return false;
        if (text.includes('@')) return false;
        if (!/[a-zA-Z]/.test(text)) return false;
        return true;
      };

      const extractNameFromContainer = (container, email) => {
        // Strategy 1: Profile links
        const profileLinkSelectors = [
          'a[href*="/lawyers/"]', 'a[href*="/Lawyers/"]',
          'a[href*="/attorney/"]', 'a[href*="/attorneys/"]',
          'a[href*="/people/"]', 'a[href*="/profile/"]',
          'a[href*="/agent/"]', 'a[href*="/agents/"]'
        ];
        for (const selector of profileLinkSelectors) {
          const profileLink = container.querySelector(selector);
          if (profileLink && !profileLink.href.includes('mailto:')) {
            const candidateName = profileLink.textContent.trim();
            if (isValidName(candidateName) && candidateName.split(/\s+/).length >= 2) {
              return candidateName;
            }
          }
        }

        // Strategy 2: Heading elements
        const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (const heading of headings) {
          const candidateName = heading.textContent.trim();
          if (isValidName(candidateName) && candidateName.split(/\s+/).length >= 2) {
            return candidateName;
          }
        }

        // Strategy 3: Elements with "name" in class
        const nameElements = container.querySelectorAll('[class*="name"], [class*="Name"]');
        for (const nameEl of nameElements) {
          const candidateName = nameEl.textContent.trim();
          if (isValidName(candidateName) && candidateName.split(/\s+/).length >= 2) {
            return candidateName;
          }
        }

        // Strategy 4: Bold/strong text
        const boldElements = container.querySelectorAll('strong, b');
        for (const boldEl of boldElements) {
          const candidateName = boldEl.textContent.trim();
          if (isValidName(candidateName) && candidateName.split(/\s+/).length >= 2) {
            return candidateName;
          }
        }

        return null;
      };

      // ═══════════════════════════════════════════════════════════════
      // CONTAINER DETECTION
      // ═══════════════════════════════════════════════════════════════

      // Find all elements that might be contact containers
      const potentialContainers = [];
      const containerSelectors = [
        // Specific lawyer/professional patterns
        '[class*="lawyer"]', '[class*="Lawyer"]',
        '[class*="attorney"]', '[class*="Attorney"]',
        '[class*="professional"]', '[class*="Professional"]',
        // Card patterns
        '[class*="card"]', '[class*="Card"]',
        '[class*="profile"]', '[class*="Profile"]',
        '[class*="member"]', '[class*="Member"]',
        '[class*="person"]', '[class*="Person"]',
        '[class*="contact"]', '[class*="Contact"]',
        '[class*="result"]', '[class*="Result"]',
        '[class*="item"]', '[class*="Item"]',
        // List patterns
        'li[class]', 'article', 'section'
      ];

      for (const selector of containerSelectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          const y = rect.top + window.scrollY;
          if (y >= start.y && y <= end.y) {
            potentialContainers.push(el);
          }
        });
      }

      // Dedupe containers
      const uniqueContainers = [...new Set(potentialContainers)];
      console.log(`Found ${uniqueContainers.length} potential containers`);

      // ═══════════════════════════════════════════════════════════════
      // EXTRACT CONTACTS FROM CONTAINERS
      // ═══════════════════════════════════════════════════════════════

      const results = [];
      const processedEmails = new Set();

      for (const container of uniqueContainers) {
        const emails = extractEmailsFromContainer(container);

        for (const email of emails) {
          if (processedEmails.has(email)) continue;
          processedEmails.add(email);

          const phones = extractPhonesFromContainer(container);
          const phone = phones[0] || null;
          const name = extractNameFromContainer(container, email);

          // Extract profile URL
          let profileUrl = null;
          const profilePatterns = [
            'a[href*="/lawyer"]', 'a[href*="/Lawyer"]',
            'a[href*="/attorney"]', 'a[href*="/Attorney"]',
            'a[href*="/people/"]', 'a[href*="/profile/"]',
            'a[href*="/agent/"]'
          ];
          for (const pattern of profilePatterns) {
            const profileLink = container.querySelector(pattern);
            if (profileLink && !profileLink.href.includes('mailto:')) {
              try {
                profileUrl = new URL(profileLink.href, baseUrlStr).href;
              } catch (e) {
                profileUrl = profileLink.href;
              }
              break;
            }
          }

          // Extract domain
          const domain = email.split('@')[1];

          // Calculate confidence
          let confidence = 'low';
          if (name && email && phone) {
            confidence = 'high';
          } else if ((name && email) || (email && phone)) {
            confidence = 'medium';
          }

          results.push({
            name: name,
            email: email,
            phone: phone,
            profileUrl: profileUrl,
            source: 'infinite-scroll-universal',
            confidence: confidence,
            domain: domain,
            domainType: null // Will be set by DomainExtractor
          });
        }
      }

      // If container-based extraction found nothing, try full page
      if (results.length === 0) {
        console.log('Container extraction found nothing, trying full page...');
        const emails = extractEmailsFromContainer(document.body);

        for (const email of emails) {
          if (processedEmails.has(email)) continue;
          processedEmails.add(email);

          const domain = email.split('@')[1];

          results.push({
            name: null,
            email: email,
            phone: null,
            profileUrl: null,
            source: 'infinite-scroll-fullpage',
            confidence: 'low',
            domain: domain,
            domainType: null
          });
        }
      }

      return results;
    }, startPos, endPos, nameBlacklist, baseUrl);

    // Filter to business emails and add domain type
    const businessContacts = [];
    for (const contact of contacts) {
      if (contact.domain && this.domainExtractor.isBusinessDomain(contact.domain)) {
        contact.domainType = 'business';
        businessContacts.push(contact);
      }
    }

    console.log(`[extractContactsUniversal] ${contacts.length} total contacts, ${businessContacts.length} business contacts`);
    return businessContacts;
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = InfiniteScrollScraper;
