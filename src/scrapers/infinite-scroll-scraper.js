/**
 * InfiniteScrollScraper
 *
 * Specialized scraper for dynamically loading pages that use infinite scroll.
 * EXTENDS SimpleScraper to reuse universal extraction methods.
 *
 * BATCH ARCHITECTURE:
 * Phase 1: Scroll all - Load all content by scrolling to bottom
 * Phase 2: Select all - Extract all card data using universal extraction
 * Phase 3: Parse - Build contacts from extracted data
 * Phase 4: Enrich - Visit profile pages for contacts missing emails
 *
 * Features:
 * - Inherits all SimpleScraper extraction methods (universal extraction)
 * - Batch scroll-then-extract for complete data collection
 * - Profile visiting for contacts missing emails
 * - Load More button detection and clicking
 * - Fallback to Select and PDF methods on low completeness
 * - Comprehensive deduplication via ContentTracker
 */

const SimpleScraper = require('./simple-scraper');
const { ContentTracker, ScrollDetector } = require('../features/infinite-scroll');
const ProfileVisitor = require('../utils/profile-visitor');

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

    // Profile visiting configuration
    this.enableProfileVisiting = options.enableProfileVisiting !== false;

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
   * BATCH ARCHITECTURE: scroll all → select all → parse → enrich
   * @param {string} url - URL to scrape
   * @param {Object} siteConfig - Site-specific configuration
   * @returns {Promise<Array>} - Array of extracted contacts
   */
  async scrape(url, siteConfig = {}) {
    try {
      this.logger.info('═══════════════════════════════════════');
      this.logger.info('  INFINITE SCROLL SCRAPER (Batch Mode)');
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

      // ═══════════════════════════════════════
      // PHASE 1: SCROLL ALL - Load all content
      // ═══════════════════════════════════════
      this.logger.info('');
      this.logger.info('Phase 1: Scroll to load all content');
      this.logger.info('───────────────────────────────────');

      const scrollStats = await this.scrollToLoadAll(page, cardSelector);
      this.logger.info(`Scroll complete: ${scrollStats.scrollsPerformed} scrolls, ${scrollStats.finalCardCount} cards loaded`);

      // ═══════════════════════════════════════
      // PHASE 2: SELECT ALL - Extract all data
      // ═══════════════════════════════════════
      this.logger.info('');
      this.logger.info('Phase 2: Extract all contact data');
      this.logger.info('───────────────────────────────────');

      // Scroll back to top before extraction
      await page.evaluate(() => window.scrollTo(0, 0));
      await this.sleep(1000);

      // Determine extraction method based on config
      const extractionMethod = siteConfig.infiniteScroll?.extractionMethod || 'universal';
      let rawContacts = [];

      if (extractionMethod === 'profile-only') {
        // Profile-only: emails are ONLY on profile pages, not on listing
        // Just extract names + profile URLs, then visit profiles in Phase 4
        this.logger.info('Using profile-only extraction method (emails only on profile pages)');
        rawContacts = await this.extractContactsFromProfileUrls(page, cardSelector, siteConfig);
      } else if (extractionMethod === 'text-selection') {
        // Use text selection approach (for sites where emails are in text but hard to DOM-parse)
        this.logger.info('Using text selection extraction method');
        rawContacts = await this.extractAllContactsViaTextSelection(page, cardSelector, siteConfig);
      } else {
        // Use DOM-based universal extraction (default)
        this.logger.info('Using DOM-based universal extraction method');
        rawContacts = await this.extractAllContactsWithProfiles(page, cardSelector, siteConfig);

        // If DOM extraction found no contacts with emails, try profile-only as fallback
        const contactsWithEmails = rawContacts.filter(c => c.email).length;
        if (contactsWithEmails === 0 && rawContacts.length < scrollStats.finalCardCount / 2) {
          this.logger.info('DOM extraction yielded few results, trying profile-only fallback...');
          const profileContacts = await this.extractContactsFromProfileUrls(page, cardSelector, siteConfig);
          if (profileContacts.length > rawContacts.length) {
            rawContacts = profileContacts;
            this.logger.info(`Profile-only extraction found ${profileContacts.length} contacts`);
          }
        }
      }

      this.logger.info(`Extracted ${rawContacts.length} contacts from ${scrollStats.finalCardCount} cards`);

      // ═══════════════════════════════════════
      // PHASE 3: PARSE - Deduplicate and validate
      // ═══════════════════════════════════════
      this.logger.info('');
      this.logger.info('Phase 3: Deduplicate and validate contacts');
      this.logger.info('───────────────────────────────────');

      const validContacts = this.deduplicateContacts(rawContacts);
      let completeness = this.calculateCompleteness(validContacts);
      this.logger.info(`After dedup: ${validContacts.length} unique contacts (${(completeness * 100).toFixed(0)}% complete)`);

      // ═══════════════════════════════════════
      // PHASE 4: ENRICH - Visit profile pages
      // ═══════════════════════════════════════
      const contactsMissingEmails = validContacts.filter(c => c.name && !c.email && c.profileUrl);

      if (this.enableProfileVisiting && contactsMissingEmails.length > 0) {
        this.logger.info('');
        this.logger.info(`Phase 4: Enrich ${contactsMissingEmails.length} contacts from profiles`);
        this.logger.info('───────────────────────────────────');

        // Use ProfileVisitor from base scraper
        const profileConfig = siteConfig.profileVisiting || { enabled: true };
        if (profileConfig.enabled !== false) {
          const enrichResult = await this.enrichContactsFromProfiles(validContacts, page, {
            ...siteConfig,
            profileVisiting: { ...profileConfig, enabled: true }
          });

          this.logger.info(`Profile enrichment: ${enrichResult.stats?.enriched || 0} emails found`);
          completeness = this.calculateCompleteness(validContacts);
        }
      }

      // ═══════════════════════════════════════
      // PHASE 5: FALLBACK if needed
      // ═══════════════════════════════════════
      if (this.enableFallback && completeness < this.completenessThreshold) {
        this.logger.info('');
        this.logger.info(`Phase 5: Fallback (completeness ${(completeness * 100).toFixed(0)}% < ${(this.completenessThreshold * 100).toFixed(0)}%)`);
        this.logger.info('───────────────────────────────────');

        const fallbackResult = await this.runFallbackChain(page, siteConfig, validContacts);
        if (fallbackResult.contacts.length > validContacts.length ||
            fallbackResult.completeness > completeness) {
          // Merge fallback results
          for (const fbContact of fallbackResult.contacts) {
            const existing = validContacts.find(c => c.email === fbContact.email);
            if (!existing && fbContact.email) {
              validContacts.push(fbContact);
            } else if (existing && !existing.name && fbContact.name) {
              existing.name = fbContact.name;
            }
          }
          completeness = fallbackResult.completeness;
          this.logger.info(`Fallback improved results: ${validContacts.length} contacts (${(completeness * 100).toFixed(0)}%)`);
        }
      }

      // ═══════════════════════════════════════
      // PHASE 6: Fill missing names
      // ═══════════════════════════════════════
      const contactsNeedingNames = validContacts.filter(c => !c.name && c.email);
      if (contactsNeedingNames.length > 0) {
        this.logger.info('');
        this.logger.info(`Phase 6: Fill ${contactsNeedingNames.length} missing names`);
        this.logger.info('───────────────────────────────────');

        // Try PDF first
        await this.fillNamesFromPdf(validContacts, page, false);

        // Then email derivation for remaining
        const stillMissingNames = validContacts.filter(c => !c.name && c.email);
        for (const contact of stillMissingNames) {
          const derivedName = this.extractNameFromEmail(contact.email);
          if (derivedName) {
            contact.name = derivedName;
            contact.source = (contact.source || 'infinite-scroll') + '+email';
          }
        }
      }

      // Add domain info to all contacts
      for (const contact of validContacts) {
        this.addDomainInfo(contact);
        contact.source = contact.source || 'infinite-scroll';
      }

      this.logger.info('');
      this.logger.info('═══════════════════════════════════════');
      this.logger.info(`  COMPLETE: ${validContacts.length} contacts extracted`);
      this.logger.info('═══════════════════════════════════════');

      return validContacts;

    } catch (error) {
      this.logger.error(`Infinite scroll scraping failed: ${error.message}`);
      this.logger.error(error.stack);
      return [];
    }
  }

  /**
   * Phase 1: Scroll to load all content
   * Does NOT extract during scroll - just loads content
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @returns {Promise<Object>} - { scrollsPerformed, finalCardCount }
   */
  async scrollToLoadAll(page, cardSelector) {
    let scrollAttempts = 0;
    let noNewContentCount = 0;
    let previousHeight = await page.evaluate(() => document.body.scrollHeight);
    let previousCardCount = cardSelector ?
      await page.$$eval(cardSelector, els => els.length).catch(() => 0) : 0;

    this.logger.info(`Initial state: ${previousCardCount} cards, height ${previousHeight}px`);

    while (scrollAttempts < this.maxScrollAttempts) {
      scrollAttempts++;

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

      const newCards = currentCardCount - previousCardCount;
      this.logger.info(`Scroll ${scrollAttempts}/${this.maxScrollAttempts} - Cards: ${previousCardCount} → ${currentCardCount} (+${newCards})`);

      if (currentHeight === previousHeight && currentCardCount === previousCardCount) {
        noNewContentCount++;
        if (noNewContentCount >= this.noNewContentThreshold) {
          this.logger.info(`No new content for ${this.noNewContentThreshold} consecutive scrolls, stopping`);
          break;
        }
      } else {
        noNewContentCount = 0;
      }

      previousHeight = currentHeight;
      previousCardCount = currentCardCount;
    }

    return {
      scrollsPerformed: scrollAttempts,
      finalCardCount: previousCardCount
    };
  }

  /**
   * Phase 2: Extract all contacts with profile URLs in one pass (DOM-based)
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @param {Object} siteConfig - Site configuration
   * @returns {Promise<Array>} - Array of raw contact objects
   */
  async extractAllContactsWithProfiles(page, cardSelector, siteConfig = {}) {
    const extractionCode = this.universalExtractionCode;
    const blacklistArray = Array.from(this.NAME_BLACKLIST);
    const profilePatterns = siteConfig.parsing?.profileUrlPatterns || [
      '/agents/', '/profile/', '/realtor/', '/team/', '/broker/',
      '/member/', '/lawyer/', '/Lawyers/', '/attorney/', '/people/',
      '/professionals/', '/attorneys/', '/our-team/', '/staff/'
    ];

    const contacts = await page.evaluate((selector, code, blacklist, patterns) => {
      // Inject universal extraction code
      eval(code);

      const cards = selector ? document.querySelectorAll(selector) : [document.body];
      const results = [];
      const blacklistSet = new Set(blacklist);

      for (const card of cards) {
        // Use the bundled extraction function
        const contact = extractContactFromCard(card, {
          blacklist: blacklistSet,
          profilePatterns: patterns
        });

        // Always include the card data (even without email) for profile enrichment
        if (contact.email || contact.name || contact.profileUrl) {
          results.push({
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            profileUrl: contact.profileUrl,
            confidence: contact.confidence,
            source: 'infinite-scroll-html',
            _extraction: contact._extraction
          });
        }
      }

      return results;
    }, cardSelector, extractionCode, blacklistArray, profilePatterns);

    // Filter to business emails and add domain info
    const businessContacts = [];
    for (const contact of contacts) {
      if (contact.email) {
        const domain = this.domainExtractor.extractAndNormalize(contact.email);
        if (domain && this.domainExtractor.isBusinessDomain(domain)) {
          this.addDomainInfo(contact);
          businessContacts.push(contact);
        }
      } else if (contact.name && contact.profileUrl) {
        // Keep contacts with name and profile URL for enrichment
        businessContacts.push(contact);
      }
    }

    return businessContacts;
  }

  /**
   * Phase 2 (Alternative): Extract contacts via text selection (like browser copy/paste)
   * This mimics selecting all card text and parsing it as a string.
   * Use this when DOM extraction fails to find emails (emails only on profile pages).
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @param {Object} siteConfig - Site configuration
   * @returns {Promise<Array>} - Array of contact objects
   */
  async extractAllContactsViaTextSelection(page, cardSelector, siteConfig = {}) {
    this.logger.info('[Phase 2] Selecting all card text...');

    // Step 1: Select all text from cards (like browser Ctrl+A on card section)
    const selectedText = await this.selectAllCardsText(page, cardSelector);

    if (!selectedText || selectedText.length === 0) {
      this.logger.warn('No text selected from cards');
      return [];
    }

    this.logger.info(`Selected ${selectedText.length} characters of text`);

    // Step 2: Parse text string into contacts using TextParser
    const TextParser = require('../utils/text-parser');
    const textParser = new TextParser(this.logger);

    const contacts = textParser.parse(selectedText, siteConfig);
    this.logger.info(`Parsed ${contacts.length} contacts from text`);

    // Step 3: Collect profile URLs from DOM (separate from text parsing)
    const profileUrls = await this.collectProfileUrls(page, cardSelector, siteConfig);
    this.logger.info(`Collected ${profileUrls.length} profile URLs from DOM`);

    // Step 4: Match contacts to profile URLs by name similarity
    const matchedContacts = this.matchContactsToProfileUrls(contacts, profileUrls);
    const withProfiles = matchedContacts.filter(c => c.profileUrl).length;
    this.logger.info(`Matched ${withProfiles}/${contacts.length} contacts to profile URLs`);

    // Step 5: Add domain info to contacts with emails
    for (const contact of matchedContacts) {
      if (contact.email) {
        this.addDomainInfo(contact);
      }
    }

    return matchedContacts;
  }

  /**
   * Select all text from cards using browser Selection API
   * Mimics user selecting text with mouse/keyboard
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @returns {Promise<string>} - Selected text as string
   */
  async selectAllCardsText(page, cardSelector) {
    return await page.evaluate((selector) => {
      const cards = selector ? document.querySelectorAll(selector) : [document.body];

      if (cards.length === 0) {
        return '';
      }

      // Create a range spanning all cards
      const range = document.createRange();
      const firstCard = cards[0];
      const lastCard = cards[cards.length - 1];

      // Set range start to beginning of first card
      range.setStart(firstCard, 0);

      // Set range end to end of last card
      range.setEnd(lastCard, lastCard.childNodes.length);

      // Use Selection API to get text (mimics browser selection)
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      // Extract text
      const selectedText = selection.toString();

      // Clear selection (clean up)
      selection.removeAllRanges();

      return selectedText;
    }, cardSelector);
  }

  /**
   * Collect profile URLs from DOM
   * Extracts {url, name} pairs for matching
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @param {Object} siteConfig - Site configuration
   * @returns {Promise<Array>} - Array of {url, name} objects
   */
  async collectProfileUrls(page, cardSelector, siteConfig = {}) {
    const profilePatterns = siteConfig.parsing?.profileUrlPatterns || [
      '/agents/', '/profile/', '/realtor/', '/team/', '/broker/',
      '/member/', '/lawyer/', '/Lawyers/', '/attorney/', '/people/',
      '/professionals/', '/attorneys/', '/our-team/', '/staff/'
    ];

    return await page.evaluate((selector, patterns) => {
      const cards = selector ? document.querySelectorAll(selector) : [document.body];
      const results = [];

      for (const card of cards) {
        // Find links matching profile patterns
        const links = card.querySelectorAll('a[href]');

        for (const link of links) {
          const href = link.href;
          if (!href) continue;

          // Check if URL matches profile pattern
          const isProfileUrl = patterns.some(pattern =>
            href.toLowerCase().includes(pattern.toLowerCase())
          );

          if (!isProfileUrl) continue;

          // Try to extract name from link or nearby elements
          let name = link.textContent.trim();

          // If link text is generic, look in parent card for name
          if (!name || name.length < 3 || /^(view|profile|more|details|email)$/i.test(name)) {
            // Look for name in headings
            const nameEl = card.querySelector('h1, h2, h3, h4, .name, [class*="name"]');
            if (nameEl) {
              name = nameEl.textContent.trim();
            }
          }

          if (name && href) {
            results.push({
              url: href,
              name: name
            });
            break; // One profile URL per card
          }
        }
      }

      return results;
    }, cardSelector, profilePatterns);
  }

  /**
   * Match contacts to profile URLs by name similarity
   * @param {Array} contacts - Contacts from text parsing
   * @param {Array} profileUrls - Profile URLs from DOM
   * @returns {Array} - Contacts with matched profileUrl field
   */
  matchContactsToProfileUrls(contacts, profileUrls) {
    this.logger.info(`[DEBUG] Matching ${contacts.length} contacts to ${profileUrls.length} profile URLs`);
    if (contacts.length > 0) {
      this.logger.info(`[DEBUG] Sample contact: ${JSON.stringify(contacts[0])}`);
    }
    if (profileUrls.length > 0) {
      this.logger.info(`[DEBUG] Sample profile URL: ${JSON.stringify(profileUrls[0])}`);
    }

    for (const contact of contacts) {
      if (!contact.name) continue;

      // Find matching profile URL by name
      const contactNameLower = contact.name.toLowerCase();

      const match = profileUrls.find(profile => {
        const profileNameLower = profile.name.toLowerCase();

        // Try exact match first
        if (contactNameLower === profileNameLower) return true;

        // Try substring match (either direction)
        if (contactNameLower.includes(profileNameLower)) return true;
        if (profileNameLower.includes(contactNameLower)) return true;

        // Try word-by-word match
        const contactWords = contactNameLower.split(/\s+/);
        const profileWords = profileNameLower.split(/\s+/);

        // If all words in one name appear in the other
        const allContactWordsInProfile = contactWords.every(word =>
          profileWords.some(pw => pw.includes(word) || word.includes(pw))
        );
        const allProfileWordsInContact = profileWords.every(word =>
          contactWords.some(cw => cw.includes(word) || word.includes(cw))
        );

        return allContactWordsInProfile || allProfileWordsInContact;
      });

      if (match) {
        contact.profileUrl = match.url;
      }
    }

    return contacts;
  }

  /**
   * Phase 2 (Profile-Only): Extract contacts from profile URLs
   * For sites where emails are ONLY on profile pages (not on listing)
   * Creates contacts from profile URLs with names, ready for enrichment
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - CSS selector for cards
   * @param {Object} siteConfig - Site configuration
   * @returns {Promise<Array>} - Array of contact objects with profileUrl (no email yet)
   */
  async extractContactsFromProfileUrls(page, cardSelector, siteConfig = {}) {
    this.logger.info('[Phase 2] Extracting contacts from profile URLs (profile-only mode)...');

    // Collect profile URLs with names from DOM
    const profileUrls = await this.collectProfileUrls(page, cardSelector, siteConfig);
    this.logger.info(`Found ${profileUrls.length} profile URLs with names`);

    // Create contacts from profile URLs
    const contacts = [];
    for (const profile of profileUrls) {
      if (profile.name && profile.url) {
        contacts.push({
          name: profile.name,
          email: null,
          phone: null,
          profileUrl: profile.url,
          confidence: 'low',
          source: 'infinite-scroll-profile-url'
        });
      }
    }

    this.logger.info(`Created ${contacts.length} contacts from profile URLs (ready for enrichment)`);
    return contacts;
  }

  /**
   * Phase 3: Deduplicate contacts
   * @param {Array} contacts - Raw contacts array
   * @returns {Array} - Deduplicated contacts
   */
  deduplicateContacts(contacts) {
    const emailMap = new Map();
    const nameMap = new Map();
    const result = [];

    for (const contact of contacts) {
      const emailKey = contact.email?.toLowerCase();
      const nameKey = contact.name?.toLowerCase().trim();

      // Check if we already have this contact by email
      if (emailKey && emailMap.has(emailKey)) {
        // Merge with existing
        const existing = emailMap.get(emailKey);
        if (!existing.name && contact.name) existing.name = contact.name;
        if (!existing.phone && contact.phone) existing.phone = contact.phone;
        if (!existing.profileUrl && contact.profileUrl) existing.profileUrl = contact.profileUrl;
        continue;
      }

      // Check if we already have this contact by name (only if no email)
      if (!emailKey && nameKey && nameMap.has(nameKey)) {
        const existing = nameMap.get(nameKey);
        if (!existing.phone && contact.phone) existing.phone = contact.phone;
        if (!existing.profileUrl && contact.profileUrl) existing.profileUrl = contact.profileUrl;
        continue;
      }

      // New contact
      if (emailKey) {
        emailMap.set(emailKey, contact);
      }
      if (nameKey && !emailKey) {
        nameMap.set(nameKey, contact);
      }
      result.push(contact);
    }

    return result;
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

    // Profile visiting config
    const profileConfig = siteConfig.profileVisiting || {};
    if (profileConfig.enabled !== undefined) this.enableProfileVisiting = profileConfig.enabled;

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
            profileUrl: existingContact.profileUrl || contact.profileUrl,
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
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = InfiniteScrollScraper;
