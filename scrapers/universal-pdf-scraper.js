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

    // Multiple name patterns for better matching
    this.NAME_PATTERNS = [
      // Standard capitalized name (2-4 words)
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})\b/,
      // Name with middle initial
      /\b([A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+)\b/,
      // First Last format (simple)
      /\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/,
      // All caps name (convert later)
      /\b([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)\b/
    ];

    this.CONTEXT_WINDOW = 60;  // Capture single contact only (~2-3 lines: Name, Email, Phone)

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

        // Extract name from PDF context WITH position awareness
        const name = pdfMatch
          ? this.extractNameFromContext(pdfMatch.context, pdfMatch.emailPosition)
          : null;

        // Match phone WITH position awareness - don't reuse phones[0]
        const phone = pdfMatch
          ? this.extractPhoneFromContext(pdfMatch.context, pdfMatch.emailPosition)
          : (cardData.phones[i] || null);

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

        // Calculate relative email position within the context
        const relativeEmailPos = emailPos - start;

        return {
          section,
          context,
          emailPosition: relativeEmailPos  // Position within the context window
        };
      }
    }
    return null;
  }

  extractNameFromContext(contextWindow, emailPosition = null) {
    const lines = contextWindow.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Extract all potential names with their positions
    const nameMatches = [];
    let currentPos = 0;

    for (const line of lines) {
      const name = this.extractNameFromLine(line);
      if (name) {
        const linePosition = contextWindow.indexOf(line, currentPos);
        nameMatches.push({
          name,
          position: linePosition,
          line
        });
      }
      currentPos = contextWindow.indexOf(line, currentPos) + line.length;
    }

    if (nameMatches.length === 0) {
      // Fallback: Try the entire context as single string
      const name = this.extractNameFromLine(contextWindow.replace(/\n/g, ' '));
      return name;
    }

    // If we know the email position, find the CLOSEST name
    if (emailPosition !== null && emailPosition > 0) {
      // Prefer names that appear BEFORE the email (typical pattern)
      const beforeEmail = nameMatches.filter(m => m.position < emailPosition);
      if (beforeEmail.length > 0) {
        // Get the name closest to (but before) the email
        beforeEmail.sort((a, b) => b.position - a.position);
        return beforeEmail[0].name;
      }
    }

    // Fallback: Try first half of context (before email area)
    const beforeMiddle = nameMatches.filter(m =>
      m.position < contextWindow.length / 2
    );
    if (beforeMiddle.length > 0) {
      beforeMiddle.sort((a, b) => b.position - a.position);
      return beforeMiddle[0].name;
    }

    // Last resort: Any name found
    return nameMatches[0].name;
  }

  extractNameFromLine(line) {
    // Skip very short or very long lines
    if (line.length < 3 || line.length > 100) return null;

    // Try each name pattern
    for (const pattern of this.NAME_PATTERNS) {
      const match = line.match(pattern);
      if (match && match[1]) {
        let name = match[1].trim();

        // Convert ALL CAPS to Title Case
        if (name === name.toUpperCase() && name.length > 3) {
          name = this.toTitleCase(name);
        }

        // Validate and clean
        if (!this.isNameBlacklisted(name) && this.isValidName(name)) {
          return name;
        }
      }
    }

    return null;
  }

  toTitleCase(str) {
    return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  }

  isValidName(name) {
    const words = name.split(/\s+/);

    // Accept 1-6 words (was: minimum 2 words)
    if (words.length < 1 || words.length > 6) return false;

    // Each word must be at least 2 chars (except middle initials OR single-word names)
    for (const word of words) {
      // Allow single letters with period (J.)
      if (/^[A-Z]\.$/.test(word)) continue;

      // Allow single-letter words for single-word names (like "Seema" or initials)
      if (words.length === 1 && word.length >= 2) continue;

      // For multi-word names, each word should be 2+ chars
      if (words.length > 1 && word.length < 2) {
        return false;
      }
    }

    // Must not be all numbers
    if (/^\d+$/.test(name.replace(/\s/g, ''))) return false;

    // Must have letters
    if (!/[a-zA-Z]/.test(name)) return false;

    return true;
  }

  extractPhoneFromContext(contextWindow, emailPosition = null) {
    // Find ALL phone matches with their positions
    const phoneRegex = new RegExp(this.PHONE_REGEX.source, 'g');
    const matches = [];
    let match;

    while ((match = phoneRegex.exec(contextWindow)) !== null) {
      matches.push({
        phone: match[0],
        position: match.index
      });
    }

    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].phone;

    // If we know email position, find CLOSEST phone
    if (emailPosition !== null && emailPosition > 0) {
      // Prefer phones that appear AFTER the email (typical pattern: Email\nM: Phone)
      const afterEmail = matches.filter(m => m.position > emailPosition);
      if (afterEmail.length > 0) {
        // Get the phone closest to (but after) the email
        afterEmail.sort((a, b) => a.position - b.position);
        return afterEmail[0].phone;
      }

      // Fallback: Phone before email (less common but possible)
      matches.sort((a, b) =>
        Math.abs(a.position - emailPosition) - Math.abs(b.position - emailPosition)
      );
      return matches[0].phone;
    }

    // No position info: return first phone
    return matches[0].phone;
  }

  /**
   * Extract name from email address as fallback
   * Examples:
   *   "brandon.abelard@compass.com" → "Brandon Abelard"
   *   "eric.agosto@compass.com" → "Eric Agosto"
   *   "seema@compass.com" → "Seema"
   *   "j.aguilera@compass.com" → "J Aguilera"
   *   "abramsretailstrategies@compass.com" → null (team name)
   *   "agteam@compass.com" → null (team name)
   */
  extractNameFromEmail(email) {
    if (!email || typeof email !== 'string') return null;

    // Extract prefix (before @)
    const prefix = email.split('@')[0];
    if (!prefix || prefix.length < 2) return null;

    // Filter out common non-name patterns
    const nonNameWords = [
      'info', 'contact', 'admin', 'support', 'team', 'sales',
      'help', 'service', 'office', 'hello', 'inquiries', 'mail',
      'noreply', 'no-reply', 'webmaster', 'postmaster'
    ];

    const lowerPrefix = prefix.toLowerCase();
    if (nonNameWords.some(word => lowerPrefix === word || lowerPrefix.includes(word))) {
      return null;
    }

    // Reject if prefix is too long (likely a team name like "abramsretailstrategies")
    if (prefix.length > 25) return null;

    // Split on common delimiters: dots, underscores, hyphens
    const parts = prefix.split(/[._-]+/);

    // Filter out empty parts and numbers-only parts
    const validParts = parts.filter(part =>
      part.length > 0 && !/^\d+$/.test(part)
    );

    if (validParts.length === 0) return null;

    // If we have a single concatenated word (no delimiters), check if it looks like a team name
    if (validParts.length === 1 && validParts[0].length > 15) {
      // Likely a team name like "abramsretailstrategies" or "agteam"
      return null;
    }

    // Convert to title case
    const titleCaseParts = validParts.map(part => {
      // Handle initials (single letters)
      if (part.length === 1) {
        return part.toUpperCase();
      }
      // Handle all-lowercase or all-uppercase
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    });

    const name = titleCaseParts.join(' ');

    // Additional validation: check for suspicious patterns
    const lowerName = name.toLowerCase();
    if (nonNameWords.some(word => lowerName.includes(word))) {
      return null;
    }

    // Validate the extracted name
    if (this.isValidName(name)) {
      return name;
    }

    // If validation fails but we have something reasonable (single word, 2-15 chars), return it
    // This handles cases like "Seema" or "Yardena"
    if (validParts.length === 1 && name.length >= 2 && name.length <= 15) {
      return name;
    }

    return null;
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

  /**
   * Validate that the extracted name matches the email address
   * Prevents cross-contamination where wrong names get assigned to emails
   *
   * Examples:
   *   "Michael Pearson" + "michael.pearson@..." → true
   *   "Michael Abrahm" + "michael.pearson@..." → false
   *   "Seema" + "seema@..." → true
   *   "Robin Abrams" + "robin.abrams@..." → true
   */
  validateNameEmailMatch(name, email) {
    if (!name || !email) return true; // Can't validate if either is missing

    const nameParts = name.toLowerCase().split(/\s+/);
    const emailPrefix = email.split('@')[0].toLowerCase();

    // Extract individual words from email (split by dots, underscores, hyphens)
    const emailParts = emailPrefix.split(/[._-]+/).filter(p => p.length > 0);

    // For single-word names (like "Seema"), just check if it appears in email
    if (nameParts.length === 1) {
      const namePart = nameParts[0];
      return emailParts.some(ep => ep.includes(namePart) || namePart.includes(ep));
    }

    // For multi-word names, check if at least the first and last names match
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];

    // Check if both first and last name appear in the email parts
    const firstNameMatches = emailParts.some(ep =>
      ep.includes(firstName) || firstName.includes(ep)
    );
    const lastNameMatches = emailParts.some(ep =>
      ep.includes(lastName) || lastName.includes(ep)
    );

    // Both first and last name should be present in email
    // OR at least the last name should match (for cases like "J. Aguilera" vs "j.aguilera")
    return (firstNameMatches && lastNameMatches) || lastNameMatches;
  }

  applyFallbacks(contact, cardData, pdfMatch) {
    // PRIORITY 1: Email-based name extraction (most reliable for business emails)
    // This prevents accepting wrong names from PDF context contamination
    if (!contact.name && contact.email) {
      const nameFromEmail = this.extractNameFromEmail(contact.email);
      if (nameFromEmail) {
        contact.name = nameFromEmail;
        if (this.logger && this.logger.debug) {
          this.logger.debug(`Extracted name from email: ${contact.email} → ${nameFromEmail}`);
        }
      }
    }

    // PRIORITY 2: HTML card text (only if email extraction failed)
    if (!contact.name && cardData.cardText) {
      const lines = cardData.cardText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // Try first 10 lines of HTML card text
      for (const line of lines.slice(0, 10)) {
        const name = this.extractNameFromLine(line);
        if (name) {
          contact.name = name;
          break;
        }
      }

      // If still no name, try entire card text as single string
      if (!contact.name) {
        const name = this.extractNameFromLine(cardData.cardText.replace(/\n/g, ' '));
        if (name) contact.name = name;
      }
    }

    // Validate name against email (prevent cross-contamination)
    if (contact.name && contact.email) {
      if (!this.validateNameEmailMatch(contact.name, contact.email)) {
        if (this.logger && this.logger.warn) {
          this.logger.warn(`Name-email mismatch detected: "${contact.name}" vs "${contact.email}". Using email-based name.`);
        }
        // Replace with email-based name
        const nameFromEmail = this.extractNameFromEmail(contact.email);
        if (nameFromEmail) {
          contact.name = nameFromEmail;
        }
      }
    }

    // Phone fallback: try PDF regex if no HTML phone
    if (!contact.phone && pdfMatch) {
      const pdfPhone = this.extractPhoneFromContext(pdfMatch.section, pdfMatch.emailPosition);
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
