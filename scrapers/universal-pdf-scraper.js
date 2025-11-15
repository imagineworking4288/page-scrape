const DomainExtractor = require('../utils/domain-extractor');

/**
 * Universal PDF Scraper - Hybrid HTML+PDF Extraction
 *
 * Strategy:
 * 1. Extract structured data from HTML (mailto:, tel:, profile URLs)
 * 2. Render page to PDF (preserves visual layout)
 * 3. Parse PDF text (reading order)
 * 4. Match using email anchors
 * 5. Combine HTML + PDF data with smart fallbacks
 */
class UniversalPdfScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.domainExtractor = new DomainExtractor(logger);

    // Load pdf-parse
    try {
      this.pdfParse = require('pdf-parse');
      this.logger.info('pdf-parse loaded successfully');
    } catch (error) {
      throw new Error('pdf-parse is required. Install with: npm install pdf-parse');
    }

    // Regex patterns
    this.EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    this.PHONE_REGEX = /(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    this.NAME_REGEX = /^([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})$/;

    this.CONTEXT_WINDOW = 200;

    // Card selectors (copied from simple-scraper.js)
    this.CARD_SELECTORS = [
      '[data-tn="agent-card"]',
      '[data-test="agent-card"]',
      '.agent-card',
      '[class*="AgentCard"]',
      '[data-testid*="agent"]', '[data-testid*="profile"]', '[data-testid*="contact"]',
      '[data-qa*="agent"]', '[data-qa*="profile"]', '[data-qa*="contact"]',
      '[data-cy*="agent"]', '[data-cy*="profile"]', '[data-cy*="contact"]',
      '.card', '.profile', '.agent', '.person', '.member', '.contact',
      '.listing', '.item', '.result', '.entry', '.record',
      '[class*="card"]', '[class*="profile"]', '[class*="agent"]',
      '[class*="person"]', '[class*="member"]', '[class*="contact"]',
      'article', 'li[class*="item"]', 'div[class*="listing"]',
      '.grid-item', '.list-item', '.directory-item'
    ];
  }

  async scrape(url, limit = null) {
    try {
      this.logger.info(`Starting universal PDF scrape of ${url}`);
      const page = this.browserManager.getPage();

      // Navigate if needed
      if (page.url() !== url) {
        await this.browserManager.navigate(url);
      }

      // Wait for content
      await page.waitForTimeout(3000);

      // Detect card pattern
      const cardSelector = await this.detectCardPattern(page);
      this.logger.info(`Using selector: ${cardSelector || 'full page'}`);

      // Step 1: Extract HTML structured data
      this.logger.info('Extracting structured data from HTML...');
      const htmlData = await this.extractHtmlStructuredData(page, cardSelector);
      this.logger.info(`Found ${htmlData.length} cards with structured data`);

      // Step 2: Render to PDF and parse
      this.logger.info('Rendering page to PDF...');
      const pdfData = await this.renderAndParsePdf(page);
      this.logger.info(`Extracted ${pdfData.sections.length} sections from PDF`);

      // Step 3: Match HTML to PDF contacts
      this.logger.info('Matching HTML data to PDF contacts...');
      const contacts = this.matchHtmlToPdfContacts(htmlData, pdfData, limit);

      this.logger.info(`Extracted ${contacts.length} contacts`);
      return contacts;

    } catch (error) {
      this.logger.error(`Universal PDF scraping failed: ${error.message}`);
      throw error;
    }
  }

  async detectCardPattern(page) {
    try {
      this.logger.info('Detecting card pattern...');

      for (const selector of this.CARD_SELECTORS) {
        try {
          const count = await page.evaluate((sel) => {
            return document.querySelectorAll(sel).length;
          }, selector);

          if (count >= 3) {
            const isSimilar = await this.checkStructuralSimilarity(page, selector);
            if (isSimilar) {
              this.logger.info(`Found ${count} cards with selector: ${selector}`);
              return selector;
            }
          }
        } catch (error) {
          continue;
        }
      }

      this.logger.warn('No card pattern found, will treat page as single entity');
      return null;

    } catch (error) {
      this.logger.error(`Pattern detection failed: ${error.message}`);
      return null;
    }
  }

  async checkStructuralSimilarity(page, selector) {
    try {
      return await page.evaluate((sel) => {
        const elements = Array.from(document.querySelectorAll(sel));
        if (elements.length < 3) return false;

        const samples = elements.slice(0, 3);
        const structures = samples.map(el => ({
          childCount: el.children.length,
          textLength: el.textContent.trim().length,
          hasLinks: el.querySelectorAll('a').length > 0,
          hasImages: el.querySelectorAll('img').length > 0
        }));

        const childCounts = structures.map(s => s.childCount);
        const avgChildCount = childCounts.reduce((a, b) => a + b, 0) / childCounts.length;
        const childCountVariance = childCounts.every(count =>
          Math.abs(count - avgChildCount) <= 3
        );

        const textLengths = structures.map(s => s.textLength);
        const avgTextLength = textLengths.reduce((a, b) => a + b, 0) / textLengths.length;
        const textLengthVariance = textLengths.every(length =>
          avgTextLength === 0 || Math.abs(length - avgTextLength) / avgTextLength <= 0.5
        );

        return childCountVariance && textLengthVariance;
      }, selector);
    } catch (error) {
      return false;
    }
  }

  async extractHtmlStructuredData(page, cardSelector) {
    if (!cardSelector) {
      cardSelector = 'body';
    }

    return await page.evaluate((selector) => {
      const cards = document.querySelectorAll(selector);
      return Array.from(cards).map((card, idx) => {
        // Extract emails (mailto: links only)
        const emails = Array.from(card.querySelectorAll('a[href^="mailto:"]'))
          .map(a => a.href.replace('mailto:', '').split('?')[0].toLowerCase())
          .filter(e => e.length > 0);

        // Extract phones (tel: links only)
        const phones = Array.from(card.querySelectorAll('a[href^="tel:"]'))
          .map(a => a.href.replace('tel:', '').replace(/\D/g, ''))
          .filter(p => p.length >= 10);

        // Extract profile URLs
        const profileUrls = Array.from(card.querySelectorAll('a'))
          .map(a => a.href)
          .filter(url => /\/(agent|profile)s?\//i.test(url));

        // Get card text for fallback
        const cardText = card.textContent.trim();

        return {
          cardIndex: idx,
          emails,
          phones,
          profileUrls: profileUrls.length > 0 ? [profileUrls[0]] : [],
          cardText
        };
      });
    }, cardSelector);
  }

  async renderAndParsePdf(page) {
    // Render to PDF
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
        right: '0.5in'
      }
    });

    this.logger.info(`Generated PDF (${(pdfBuffer.length / 1024).toFixed(2)} KB)`);

    // Parse PDF
    const data = await this.pdfParse(pdfBuffer);

    // Split into sections
    const sections = data.text
      .split(/\n\s*\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 20);

    return {
      fullText: data.text,
      sections
    };
  }

  matchHtmlToPdfContacts(htmlData, pdfData, limit = null) {
    const contacts = [];
    const seenEmails = new Set();

    for (const cardData of htmlData) {
      if (limit && contacts.length >= limit) break;

      // Filter to business emails only
      const businessEmails = cardData.emails.filter(email => {
        const domain = this.domainExtractor.extractAndNormalize(email);
        return domain && this.domainExtractor.isBusinessDomain(domain);
      });

      // Handle multiple contacts per card
      for (let i = 0; i < businessEmails.length; i++) {
        const email = businessEmails[i];

        if (seenEmails.has(email)) continue;
        seenEmails.add(email);

        // Find email in PDF
        const pdfMatch = this.findEmailInPdf(email, pdfData.sections);

        // Extract name from PDF context
        const name = pdfMatch ? this.extractNameFromContext(pdfMatch.context) : null;

        // Match phone
        const phone = pdfMatch
          ? this.extractPhoneFromContext(pdfMatch.context)
          : (cardData.phones[i] || cardData.phones[0] || null);

        // Profile URL
        const profileUrl = cardData.profileUrls[i] || cardData.profileUrls[0] || null;

        // Create contact
        const contact = {
          name,
          email,
          phone,
          profileUrl,
          domain: this.domainExtractor.extractAndNormalize(email),
          domainType: 'business',
          source: pdfMatch ? 'html+pdf' : 'html',
          confidence: this.calculateConfidence(!!name, true, !!phone),
          rawText: pdfMatch ? pdfMatch.context.substring(0, 200) : null
        };

        // Apply fallbacks if needed
        this.applyFallbacks(contact, cardData, pdfMatch);

        contacts.push(contact);

        if (limit && contacts.length >= limit) break;
      }
    }

    return contacts;
  }

  findEmailInPdf(email, sections) {
    for (const section of sections) {
      const lowerSection = section.toLowerCase();
      const lowerEmail = email.toLowerCase();

      if (lowerSection.includes(lowerEmail)) {
        const emailPos = lowerSection.indexOf(lowerEmail);
        const start = Math.max(0, emailPos - this.CONTEXT_WINDOW);
        const end = Math.min(section.length, emailPos + email.length + this.CONTEXT_WINDOW);
        const context = section.substring(start, end);

        return { section, context, emailPosition: emailPos };
      }
    }
    return null;
  }

  extractNameFromContext(contextWindow) {
    const lines = contextWindow.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Search lines before middle (names appear before email)
    const beforeMiddle = lines.slice(0, Math.ceil(lines.length / 2));

    for (const line of beforeMiddle.reverse()) {
      const match = line.match(this.NAME_REGEX);
      if (match && !this.isNameBlacklisted(match[1])) {
        return match[1];
      }
    }

    return null;
  }

  extractPhoneFromContext(contextWindow) {
    const match = contextWindow.match(this.PHONE_REGEX);
    return match ? match[0] : null;
  }

  isNameBlacklisted(name) {
    const blacklist = [
      'get help', 'find an agent', 'contact us', 'view profile',
      'learn more', 'show more', 'read more', 'see more',
      'sign in', 'sign up', 'log in', 'menu', 'search'
    ];
    const lower = name.toLowerCase();
    return blacklist.some(b => lower.includes(b));
  }

  applyFallbacks(contact, cardData, pdfMatch) {
    // Name fallback: try HTML card text
    if (!contact.name && cardData.cardText) {
      const lines = cardData.cardText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines.slice(0, 5)) {
        const match = line.match(this.NAME_REGEX);
        if (match && !this.isNameBlacklisted(match[1])) {
          contact.name = match[1];
          break;
        }
      }
    }

    // Phone fallback: try PDF regex if no HTML phone
    if (!contact.phone && pdfMatch) {
      const pdfPhone = this.extractPhoneFromContext(pdfMatch.section);
      if (pdfPhone) contact.phone = pdfPhone;
    }

    // Recalculate confidence after fallbacks
    contact.confidence = this.calculateConfidence(
      !!contact.name,
      !!contact.email,
      !!contact.phone
    );
  }

  calculateConfidence(hasName, hasEmail, hasPhone) {
    if (hasName && hasEmail && hasPhone) return 'high';
    if ((hasEmail && hasPhone) || (hasName && hasEmail)) return 'medium';
    return 'low';
  }

  postProcessContacts(contacts) {
    // Deduplicate by email
    const seen = new Set();
    return contacts.filter(c => {
      if (!c.email) return true;
      const key = c.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

module.exports = UniversalPdfScraper;
