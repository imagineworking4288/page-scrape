const fs = require('fs');
const path = require('path');
const DomainExtractor = require('../utils/domain-extractor');

class SimpleScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;

    // Initialize domain extractor
    this.domainExtractor = new DomainExtractor(logger);

    // Load pdf-parse
    try {
      this.pdfParse = require('pdf-parse');
      this.logger.info('pdf-parse loaded successfully');
    } catch (error) {
      throw new Error('pdf-parse is required. Install with: npm install pdf-parse');
    }

    // Track processed emails to prevent duplicates
    this.processedEmails = new Set();

    // Pre-compiled regex patterns for performance
    this.EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.PHONE_REGEXES = [
      /(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
      /(?:\+1[-.\s]?)?([0-9]{3})[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
      /([0-9]{10})/g
    ];

    // SIMPLIFIED: Much more permissive name pattern
    // Accepts any capitalized words (including single names)
    this.NAME_REGEX = /^[A-Z][a-zA-Z'\-\.\s]{1,98}[a-zA-Z]$/;

    // BLACKLIST: Common UI elements that should never be names
    this.NAME_BLACKLIST = new Set([
      // Authentication & Navigation
      'sign in', 'log in', 'sign up', 'log out', 'register', 'login',

      // Actions
      'get help', 'contact us', 'about us', 'view profile', 'view all',
      'learn more', 'read more', 'see more', 'show more', 'load more',
      'find an agent', 'find a', 'search', 'filter', 'back to',
      'click here', 'more info', 'details',

      // Contact Labels
      'contact', 'email', 'phone', 'call', 'text', 'message',
      'website', 'address', 'location',

      // Form field labels
      'name', 'first name', 'last name', 'full name',
      'your name', 'enter name', 'user name', 'username',

      // Location labels
      'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island',
      'new york', 'ny', 'nyc', 'city', 'state', 'zip',

      // Menu Items
      'menu', 'home', 'listings', 'properties', 'agents',
      'about', 'services', 'resources', 'blog', 'news',

      // Compass.com specific (from logs)
      'compass', 'compass one', 'compass luxury', 'compass academy', 'compass plus',
      'compass cares', 'private exclusives', 'coming soon',
      'new development', 'recently sold', 'sales leadership',
      'neighborhood guides', 'mortgage calculator', 'external suppliers',

      // Generic descriptors
      'agent', 'broker', 'realtor', 'licensed', 'certified',
      'team', 'group', 'partners', 'associates'
    ]);
    
    // Common card selectors to try (prioritized order)
    this.CARD_SELECTORS = [
      // Compass.com specific selectors (prioritized)
      '[data-tn="agent-card"]',
      '[data-test="agent-card"]',
      '.agent-card',
      '[class*="AgentCard"]',
      
      // Specific data attributes (most reliable)
      '[data-testid*="agent"]', '[data-testid*="profile"]', '[data-testid*="contact"]',
      '[data-qa*="agent"]', '[data-qa*="profile"]', '[data-qa*="contact"]',
      '[data-cy*="agent"]', '[data-cy*="profile"]', '[data-cy*="contact"]',
      
      // Common class names
      '.card', '.profile', '.agent', '.person', '.member', '.contact',
      '.listing', '.item', '.result', '.entry', '.record',
      
      // Partial class matches
      '[class*="card"]', '[class*="profile"]', '[class*="agent"]',
      '[class*="person"]', '[class*="member"]', '[class*="contact"]',
      
      // Generic containers
      'article', 'li[class*="item"]', 'div[class*="listing"]',
      '.grid-item', '.list-item', '.directory-item'
    ];
  }

  /**
   * Search for name in full document by email terms
   * @param {string} email - Email address to search for
   * @param {string} fullText - Full PDF text
   * @returns {string|null} - Best matching name or null
   */
  searchNameByEmail(email, fullText) {
    if (!email || !fullText) return null;

    // Extract search terms from email prefix
    const prefix = email.split('@')[0].toLowerCase();
    let searchTerms = prefix.split(/[._-]+/).filter(term => term.length >= 2);

    // Handle concatenated names (e.g., "macevedo" -> try "acevedo")
    if (searchTerms.length === 1 && searchTerms[0].length > 6) {
      const concatenated = searchTerms[0];
      // Try splitting after first 1-2 chars (common first initial pattern)
      const possibleLastName = concatenated.substring(1); // "macevedo" -> "acevedo"
      const possibleLastName2 = concatenated.substring(2); // "macevedo" -> "cevedo"

      // Add these as additional search terms
      if (possibleLastName.length >= 4) searchTerms.push(possibleLastName);
      if (possibleLastName2.length >= 5) searchTerms.push(possibleLastName2);
    }

    if (searchTerms.length === 0) return null;

    // Find all occurrences of search terms in document
    const candidates = [];
    const seen = new Set(); // Prevent duplicate candidates

    for (const term of searchTerms) {
      const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
      let match;

      while ((match = regex.exec(fullText)) !== null) {
        const position = match.index;

        // Skip if this is the email itself
        const contextCheck = fullText.substring(Math.max(0, position - 20), Math.min(fullText.length, position + 50));
        if (contextCheck.toLowerCase().includes(email.toLowerCase())) {
          continue; // Skip matches that are part of the email address
        }

        // Extract 100-char context (50 before, 50 after)
        const contextStart = Math.max(0, position - 50);
        const contextEnd = Math.min(fullText.length, position + 50);
        const context = fullText.substring(contextStart, contextEnd);

        // Look for name patterns in this context
        const lines = context.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        for (const line of lines) {
          // Extract ALL potential names (capitalized words) using global regex
          const nameRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\b/g;
          let nameMatch;

          while ((nameMatch = nameRegex.exec(line)) !== null) {
            const candidateName = nameMatch[1].trim();

            // Skip if already seen
            if (seen.has(candidateName.toLowerCase())) continue;
            seen.add(candidateName.toLowerCase());

            // Validate candidate
            if (this.isValidSearchCandidate(candidateName, searchTerms)) {
              const score = this.scoreSearchCandidate(candidateName, searchTerms, context, email);
              candidates.push({ name: candidateName, score, position });
            }
          }
        }
      }
    }

    // Return best candidate (highest score)
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].name;
  }

  /**
   * Check if name candidate is valid for email-based search
   * @param {string} name - Candidate name
   * @param {Array<string>} searchTerms - Email prefix terms
   * @returns {boolean}
   */
  isValidSearchCandidate(name, searchTerms) {
    if (!name || name.length < 2 || name.length > 100) return false;

    const nameLower = name.toLowerCase();

    // Must contain at least one search term
    const containsTerm = searchTerms.some(term =>
      nameLower.includes(term.toLowerCase())
    );
    if (!containsTerm) return false;

    // Check against blacklist
    const nonNameWords = [
      'info', 'contact', 'admin', 'support', 'team', 'sales',
      'help', 'service', 'office', 'hello', 'inquiries', 'mail',
      'noreply', 'no-reply', 'webmaster', 'postmaster',
      'strategies', 'retail', 'group', 'partners', 'associates',
      'realty', 'properties', 'homes', 'listings'
    ];

    if (nonNameWords.some(word => nameLower === word || nameLower.includes(word))) {
      return false;
    }

    // Check word count (1-5 words)
    const wordCount = name.split(/\s+/).length;
    if (wordCount < 1 || wordCount > 5) return false;

    return true;
  }

  /**
   * Score a name candidate (0-100)
   * @param {string} candidateName - Candidate name
   * @param {Array<string>} searchTerms - Email prefix terms
   * @param {string} context - Surrounding text
   * @param {string} email - Full email address
   * @returns {number} - Score 0-100
   */
  scoreSearchCandidate(candidateName, searchTerms, context, email) {
    let score = 0;

    const nameLower = candidateName.toLowerCase();
    const nameWords = nameLower.split(/\s+/);

    // 1. Term matching (40 points)
    let matchedTerms = 0;
    for (const term of searchTerms) {
      if (nameWords.some(word => word.includes(term.toLowerCase()) || term.toLowerCase().includes(word))) {
        matchedTerms++;
      }
    }
    score += (matchedTerms / searchTerms.length) * 40;

    // 2. Proximity to email (40 points)
    const emailPos = context.toLowerCase().indexOf(email.toLowerCase());
    if (emailPos !== -1) {
      const namePos = context.toLowerCase().indexOf(nameLower);
      if (namePos !== -1) {
        const distance = Math.abs(emailPos - namePos);
        const proximityScore = Math.max(0, 40 - (distance / 2));
        score += proximityScore;
      }
    }

    // 3. Completeness (20 points)
    if (nameWords.length >= 2) {
      score += 20; // Full name
    } else if (nameWords.length === 1 && nameWords[0].length >= 3) {
      score += 10; // Single name
    }

    // 4. Proper capitalization (10 points)
    const isProperlyCapitalized = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(candidateName);
    if (isProperlyCapitalized) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Helper to escape regex special characters
   * @param {string} str - String to escape
   * @returns {string} - Escaped string
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Extract all names and emails from full text with positions
   * @param {string} fullText - Full PDF text
   * @returns {Object} - Object with names and emails arrays
   */
  extractAllNamesAndEmails(fullText) {
    const names = [];
    const seen = new Set();

    // Extract names using regex - NO newlines allowed in names
    const namePattern = /\b([A-Z][a-z]+(?:[''-][A-Z][a-z]+)?(?:[ \t]+[A-Z][a-z]+(?:[''-][A-Z][a-z]+)?){1,4})\b/g;
    let match;

    // Bad words to filter out (UI elements, common phrases)
    const badWords = [
      'Email', 'Phone', 'Contact', 'Website', 'Agent', 'Broker',
      'Register', 'Sign In', 'Get Help', 'View', 'Learn More',
      'About Us', 'Sales Leadership', 'Private Exclusives', 'Coming Soon',
      'Make Me', 'Compass One', 'Compass Luxury', 'Compass Academy',
      'Compass Plus', 'Compass Cares', 'Neighborhood Guides', 'New Development',
      'Mortgage Calculator', 'Recently Sold', 'External Suppliers',
      'Find An', 'Show More', 'Read More', 'See More', 'Load More'
    ];

    while ((match = namePattern.exec(fullText)) !== null) {
      const candidateName = match[1].trim();
      const position = match.index;

      // Skip if contains newline (regex shouldn't match, but double-check)
      if (candidateName.includes('\n') || candidateName.includes('\r')) continue;

      // Skip if already seen or too short/long
      if (seen.has(candidateName.toLowerCase())) continue;
      if (candidateName.length < 3 || candidateName.length > 50) continue;

      // Filter out bad words
      if (badWords.some(bad => candidateName.includes(bad))) continue;

      // Require at least 2 words for a full name (helps filter UI elements)
      const wordCount = candidateName.split(/\s+/).length;
      if (wordCount < 2) continue;

      seen.add(candidateName.toLowerCase());
      names.push({
        name: candidateName,
        position: position,
        lineNumber: -1  // Not tracking line numbers anymore
      });
    }

    // Extract emails
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = [];

    while ((match = emailPattern.exec(fullText)) !== null) {
      emails.push({
        email: match[0].toLowerCase(),
        position: match.index
      });
    }

    if (this.logger && this.logger.debug) {
      this.logger.debug(`Found ${names.length} name candidates and ${emails.length} emails in document`);
    }

    return { names, emails };
  }

  /**
   * Match name to email by proximity
   * @param {string} email - Email address
   * @param {Array} names - Array of name objects with positions
   * @param {number} emailPosition - Position of email in text
   * @returns {string|null} - Matched name or null
   */
  matchNameToEmail(email, names, emailPosition) {
    let bestMatch = null;
    let smallestDistance = Infinity;

    for (const nameObj of names) {
      // Name must appear BEFORE email
      if (nameObj.position >= emailPosition) continue;

      const distance = emailPosition - nameObj.position;

      // Reduce distance from 200 to 100 chars (tighter proximity)
      if (distance < 100 && distance < smallestDistance) {
        smallestDistance = distance;
        bestMatch = nameObj.name;
      }
    }

    if (bestMatch && this.logger && this.logger.debug) {
      this.logger.debug(`Matched "${bestMatch}" to ${email} (distance: ${smallestDistance} chars)`);
    }

    return bestMatch;
  }

  /**
   * Extract contacts by zone-based matching
   * @param {string} fullText - Full PDF text
   * @param {Set} uniqueEmails - Set of unique email addresses
   * @returns {Array} - Array of contact objects
   */
  /**
   * Extract contacts using email-anchored context search
   * Finds each email in the document and extracts names from surrounding context
   * @param {string} fullText - Full PDF text
   * @param {Set} uniqueEmails - Set of unique email addresses
   * @returns {Array} - Array of contact objects
   */
  extractByEmailAnchor(fullText, uniqueEmails) {
    const contacts = [];
    const processedEmails = new Set();

    for (const email of uniqueEmails) {
      if (processedEmails.has(email.toLowerCase())) continue;
      processedEmails.add(email.toLowerCase());

      // Find email position in document
      const emailPos = fullText.toLowerCase().indexOf(email.toLowerCase());
      if (emailPos === -1) {
        this.logger.warn(`Email not found in PDF text: ${email}`);
        continue;
      }

      // Extract context windows
      const beforeStart = Math.max(0, emailPos - 200);
      const beforeContext = fullText.substring(beforeStart, emailPos);

      const afterEnd = Math.min(fullText.length, emailPos + email.length + 100);
      const afterContext = fullText.substring(emailPos + email.length, afterEnd);

      // Search for name in BEFORE context (names typically appear before emails)
      const nameResult = this.findNameInContext(beforeContext, email, emailPos);

      // Search for phone in AFTER context
      const phone = this.findPhoneInContext(afterContext);

      // Calculate confidence based on findings
      const confidence = this.calculateAnchorConfidence(nameResult, !!phone);

      const contact = {
        name: nameResult ? nameResult.name : this.extractNameFromEmail(email),
        email,
        phone,
        source: nameResult ? 'pdf-anchor' : 'pdf-derived',
        confidence,
        _debug: {
          emailPos,
          nameDistance: nameResult ? nameResult.distance : null,
          beforeContextSnippet: beforeContext.substring(Math.max(0, beforeContext.length - 100))
        }
      };

      contacts.push(contact);

      // Diagnostic logging
      if (this.logger && this.logger.debug) {
        this.logger.debug(`Email: ${email}`);
        this.logger.debug(`  Position: ${emailPos}`);
        this.logger.debug(`  Name: "${contact.name}" ${nameResult ? `(${nameResult.distance} chars away)` : '(derived from email)'}`);
        this.logger.debug(`  Phone: ${phone || 'not found'}`);
        this.logger.debug(`  Confidence: ${confidence}`);
      }
    }

    return contacts;
  }

  /**
   * Find name in context by searching for capitalized word sequences
   * Prioritizes names closest to the email position
   * @param {string} beforeContext - Text before the email
   * @param {string} email - Email address for term matching
   * @param {number} emailPos - Position of email in full document
   * @returns {Object|null} - {name, distance, score} or null
   */
  findNameInContext(beforeContext, email, emailPos) {
    const lines = beforeContext.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Extract email terms for scoring
    const emailPrefix = email.split('@')[0].toLowerCase();
    const emailTerms = emailPrefix.split(/[._-]+/).filter(t => t.length >= 2);

    const candidates = [];

    // Search lines from closest to email (end) to furthest (start)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const linePositionInContext = beforeContext.lastIndexOf(line);
      const distanceFromEmail = beforeContext.length - linePositionInContext;

      // Extract all capitalized word sequences from this line
      const namePattern = /\b([A-Z][a-z]+(?:[\s'-][A-Z][a-z]+){0,4})\b/g;
      let match;

      while ((match = namePattern.exec(line)) !== null) {
        const candidateName = match[1].trim();

        // Validate candidate
        if (!this.isValidNameCandidate(candidateName)) {
          continue;
        }

        // Calculate score based on proximity and email term matching
        const score = this.scoreNameCandidate(candidateName, emailTerms, distanceFromEmail);

        candidates.push({
          name: candidateName,
          distance: distanceFromEmail,
          score,
          line
        });
      }
    }

    // Return highest scoring candidate
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  /**
   * Validate if text is a valid name candidate
   * @param {string} text - Candidate text
   * @returns {boolean}
   */
  isValidNameCandidate(text) {
    if (!text || text.length < 2 || text.length > 50) return false;

    // Check against comprehensive blacklist (case-insensitive exact match)
    const lowerText = text.toLowerCase();
    if (this.NAME_BLACKLIST.has(lowerText)) {
      return false;
    }

    // Also check for partial matches with common UI words
    const uiWords = ['find', 'agent', 'last name', 'first name', 'register', 'login'];
    if (uiWords.some(word => lowerText.includes(word))) {
      return false;
    }

    // Must have 1-5 words
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 1 || wordCount > 5) return false;

    return true;
  }

  /**
   * Score name candidate based on proximity to email and term matching
   * @param {string} candidateName - Name to score
   * @param {Array} emailTerms - Terms from email prefix
   * @param {number} distance - Character distance from email
   * @returns {number} - Score (higher is better)
   */
  scoreNameCandidate(candidateName, emailTerms, distance) {
    let score = 0;

    // Proximity score (closer = better, max 50 points)
    const proximityScore = Math.max(0, 50 - (distance / 2));
    score += proximityScore;

    // Email term matching score (max 40 points)
    const nameLower = candidateName.toLowerCase();
    const nameWords = nameLower.split(/\s+/);

    let matchedTerms = 0;
    for (const term of emailTerms) {
      const termLower = term.toLowerCase();
      if (nameWords.some(word => word.includes(termLower) || termLower.includes(word))) {
        matchedTerms++;
      }
    }

    if (emailTerms.length > 0) {
      score += (matchedTerms / emailTerms.length) * 40;
    }

    // Completeness score (2+ words = 10 points)
    if (nameWords.length >= 2) {
      score += 10;
    }

    return score;
  }

  /**
   * Find phone number in context text
   * @param {string} context - Text to search
   * @returns {string|null} - Phone number or null
   */
  findPhoneInContext(context) {
    const phonePatterns = [
      /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
      /\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/,
      /\d{10}/
    ];

    for (const pattern of phonePatterns) {
      const match = context.match(pattern);
      if (match) return match[0];
    }

    return null;
  }

  /**
   * Calculate confidence based on name and phone findings
   * @param {Object|null} nameResult - Result from findNameInContext
   * @param {boolean} hasPhone - Whether phone was found
   * @returns {string} - 'high', 'medium', or 'low'
   */
  calculateAnchorConfidence(nameResult, hasPhone) {
    if (nameResult && hasPhone && nameResult.distance < 50) {
      return 'high';
    } else if (nameResult && nameResult.distance < 100) {
      return 'medium';
    } else if (hasPhone) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Derive name from email address (fallback method)
   * @param {string} email - Email address
   * @returns {string} - Derived name
   */
  deriveNameFromEmail(email) {
    const username = email.split('@')[0];
    const parts = username.split(/[._-]/);

    return parts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  async scrape(url, limit = null, keepPdf = false) {
    try {
      this.logger.info(`Starting HTML-first scrape of ${url}`);
      const page = this.browserManager.getPage();

      // Navigate
      await this.browserManager.navigate(url);
      await page.waitForTimeout(5000); // Let JavaScript render

      // Detect card pattern
      const cardSelector = await this.detectCardPattern(page);
      this.logger.info(`Using selector: ${cardSelector || 'full page'}`);

      // Wait for card selector to appear
      if (cardSelector) {
        try {
          await page.waitForSelector(cardSelector, { timeout: 10000 });
          await page.waitForTimeout(2000); // Additional render time
        } catch (error) {
          this.logger.warn(`Card selector wait failed: ${error.message}`);
        }
      }

      // Phase 1: Extract unique emails (apply limit here)
      const uniqueEmails = await this.extractUniqueEmails(page, cardSelector, limit);
      this.logger.info(`Found ${uniqueEmails.size} unique business emails`);

      // Phase 2: Build contacts from emails (one per email)
      const contacts = await this.buildContactsFromEmails(uniqueEmails, page, cardSelector);

      // Phase 3: PDF fallback for missing names only
      const contactsNeedingNames = contacts.filter(c => !c.name);
      if (contactsNeedingNames.length > 0) {
        this.logger.info(`Using PDF fallback for ${contactsNeedingNames.length} missing names...`);
        await this.fillNamesFromPdf(contacts, page, keepPdf);
      }

      // Phase 4: Email-to-name extraction for remaining nulls (final fallback)
      const stillMissingNames = contacts.filter(c => !c.name && c.email);
      if (stillMissingNames.length > 0) {
        this.logger.info(`Using email-to-name extraction for ${stillMissingNames.length} remaining contacts...`);

        for (const contact of stillMissingNames) {
          const derivedName = this.extractNameFromEmail(contact.email);
          if (derivedName) {
            contact.name = derivedName;
            contact.source = contact.source === 'html' ? 'html+email' : 'html+pdf+email';
            if (this.logger && this.logger.debug) {
              this.logger.debug(`Derived name from email: ${derivedName} for ${contact.email}`);
            }
          }
        }
      }

      this.logger.info(`Extracted ${contacts.length} contacts`);
      return contacts;

    } catch (error) {
      this.logger.error(`HTML scraping failed: ${error.message}`);
      throw error;
    }
  }

  async detectCardPattern(page) {
    try {
      this.logger.info('Detecting card pattern...');
      
      // Try each selector
      for (const selector of this.CARD_SELECTORS) {
        try {
          const count = await page.evaluate((sel) => {
            return document.querySelectorAll(sel).length;
          }, selector);
          
          // If we find 3+ elements, check if they're similar
          if (count >= 3) {
            const isSimilar = await this.checkStructuralSimilarity(page, selector);
            if (isSimilar) {
              this.logger.info(`Found ${count} cards with selector: ${selector}`);
              return selector;
            }
          }
        } catch (error) {
          // Invalid selector, continue
          continue;
        }
      }
      
      this.logger.warn('No repeating card pattern found, will treat entire page as single card');
      return null;
      
    } catch (error) {
      this.logger.error(`Pattern detection failed: ${error.message}`);
      return null;
    }
  }

  async checkStructuralSimilarity(page, selector) {
    try {
      const similarity = await page.evaluate((sel) => {
        const elements = Array.from(document.querySelectorAll(sel));
        if (elements.length < 3) return false;
        
        // Check first 3 elements for structural similarity
        const samples = elements.slice(0, 3);
        const structures = samples.map(el => ({
          childCount: el.children.length,
          textLength: el.textContent.trim().length,
          hasLinks: el.querySelectorAll('a').length > 0,
          hasImages: el.querySelectorAll('img').length > 0
        }));
        
        // Elements should have similar child counts (±3)
        const childCounts = structures.map(s => s.childCount);
        const avgChildCount = childCounts.reduce((a, b) => a + b, 0) / childCounts.length;
        const childCountVariance = childCounts.every(count => 
          Math.abs(count - avgChildCount) <= 3
        );
        
        // Elements should have similar text lengths (within 50%)
        const textLengths = structures.map(s => s.textLength);
        const avgTextLength = textLengths.reduce((a, b) => a + b, 0) / textLengths.length;
        const textLengthVariance = textLengths.every(length => 
          avgTextLength === 0 || Math.abs(length - avgTextLength) / avgTextLength <= 0.5
        );
        
        return childCountVariance && textLengthVariance;
      }, selector);
      
      return similarity;
    } catch (error) {
      return false;
    }
  }

  async renderAndParsePdf(page, keepPdf = false) {
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '-')
      .substring(0, 19);

    const pdfDir = path.join(process.cwd(), 'output', 'pdfs');
    const pdfPath = path.join(pdfDir, `scrape-${timestamp}.pdf`);

    // Create directory if needed
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
      this.logger.info(`Created PDF directory: ${pdfDir}`);
    }

    try {
      // Save PDF to disk (not memory)
      await page.pdf({
        path: pdfPath,
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
        timeout: 60000  // Add 60 second timeout
      });

      this.logger.info(`PDF saved: ${pdfPath}`);

      // Read from disk and parse
      const pdfBuffer = fs.readFileSync(pdfPath);
      const data = await this.pdfParse(pdfBuffer);

      // Conditional deletion based on --keep flag
      if (!keepPdf) {
        fs.unlinkSync(pdfPath);
        this.logger.info(`PDF deleted: ${pdfPath}`);
      } else {
        this.logger.info(`PDF kept: ${pdfPath}`);
      }

      return {
        fullText: data.text,
        sections: data.text.split(/\n\s*\n+/).map(s => s.trim()).filter(s => s.length > 20)
      };
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
        this.logger.warn(`Deleted PDF after error: ${pdfPath}`);
      }
      throw error;
    }
  }

  async extractUniqueEmails(page, cardSelector, limit) {
    const emails = await page.evaluate((selector) => {
      const cards = selector ? document.querySelectorAll(selector) : [document.body];
      const emailSet = new Set();

      cards.forEach(card => {
        // Extract from mailto: links
        card.querySelectorAll('a[href^="mailto:"]').forEach(link => {
          const email = link.href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
          if (email) emailSet.add(email);
        });
      });

      return Array.from(emailSet);
    }, cardSelector);

    // Filter to business domains only
    const businessEmails = new Set();
    for (const email of emails) {
      const domain = this.domainExtractor.extractAndNormalize(email);
      if (domain && this.domainExtractor.isBusinessDomain(domain)) {
        businessEmails.add(email);
        if (limit && businessEmails.size >= limit) break;
      }
    }

    return businessEmails;
  }

  async buildContactsFromEmails(uniqueEmails, page, cardSelector) {
    const contacts = await page.evaluate((emails, selector, blacklist) => {
      const emailArray = Array.from(emails);
      const contacts = [];
      const blacklistSet = new Set(blacklist); // Convert array back to Set

      for (const email of emailArray) {
        // Find card containing this email
        const cards = selector ? document.querySelectorAll(selector) : [document.body];
        let cardWithEmail = null;

        for (const card of cards) {
          const mailtoLink = card.querySelector(`a[href^="mailto:${email}"]`);
          if (mailtoLink) {
            cardWithEmail = card;
            break;
          }
        }

        if (!cardWithEmail) continue;

        // Extract phone from tel: link
        let phone = null;
        const telLink = cardWithEmail.querySelector('a[href^="tel:"]');
        if (telLink) {
          phone = telLink.href.replace('tel:', '').trim();
        }

        // Extract name from heading tags with scoring
        let name = null;
        const nameSelectors = [
          { selector: 'h1', priority: 10 },
          { selector: 'h2', priority: 9 },
          { selector: 'h3', priority: 8 },
          { selector: 'a[href*="/agent/"]', priority: 7 },
          { selector: 'a[href*="/profile/"]', priority: 6 },
          { selector: '.name', priority: 5 },
          { selector: '[class*="name"]', priority: 4 },
          { selector: 'strong', priority: 3 },
          { selector: 'b', priority: 2 }
        ];

        let bestNameCandidate = null;
        let bestScore = -1;

        for (const { selector, priority } of nameSelectors) {
          const elements = cardWithEmail.querySelectorAll(selector);

          for (const el of elements) {
            const text = el.textContent.trim();

            // CRITICAL: Check blacklist FIRST (case-insensitive)
            if (blacklistSet.has(text.toLowerCase())) continue;

            // Basic validation
            if (text.length < 2 || text.length > 100) continue;

            // Check if it looks like a name (starts with capital, mostly letters)
            if (!/^[A-Z]/.test(text)) continue;
            if (!/^[A-Za-z\s'\-\.]{2,100}$/.test(text)) continue;

            // Calculate score based on priority and position
            const rect = el.getBoundingClientRect();
            const positionScore = Math.max(0, 100 - rect.top / 10); // Higher = better
            const score = priority * 10 + positionScore;

            if (score > bestScore) {
              bestScore = score;
              bestNameCandidate = text;
            }
          }
        }

        name = bestNameCandidate;

        // Extract profile URL
        let profileUrl = null;
        const profileLink = cardWithEmail.querySelector('a[href*="/agent/"], a[href*="/profile/"]');
        if (profileLink) {
          profileUrl = profileLink.href;
        }

        contacts.push({
          name,
          email,
          phone,
          profileUrl,
          source: 'html',
          confidence: name && phone ? 'high' : (name || phone ? 'medium' : 'low')
        });
      }

      return contacts;
    }, Array.from(uniqueEmails), cardSelector, Array.from(this.NAME_BLACKLIST));

    // Add domain info to all contacts
    for (const contact of contacts) {
      this.addDomainInfo(contact);
    }

    return contacts;
  }

  async fillNamesFromPdf(contacts, page, keepPdf) {
    const contactsNeedingNames = contacts.filter(c => !c.name);
    if (contactsNeedingNames.length === 0) return;

    // Use disk-based PDF workflow
    const pdfData = await this.renderAndParsePdf(page, keepPdf);

    // Extract emails that need names
    const emailsNeedingNames = new Set(
      contactsNeedingNames
        .filter(c => c.email)
        .map(c => c.email.toLowerCase())
    );

    // Use email-anchored extraction to match emails to names
    const anchorContacts = this.extractByEmailAnchor(pdfData.fullText, emailsNeedingNames);

    // Fill missing names using email-anchor matches
    for (const contact of contactsNeedingNames) {
      if (!contact.email) continue;

      const anchorMatch = anchorContacts.find(
        ac => ac.email.toLowerCase() === contact.email.toLowerCase()
      );

      if (anchorMatch && anchorMatch.name && anchorMatch.source === 'pdf-anchor') {
        contact.name = anchorMatch.name;
        contact.source = 'html+pdf';
        if (this.logger && this.logger.debug) {
          this.logger.debug(
            `Filled name from PDF (anchor-based): ${anchorMatch.name} for ${contact.email} (distance: ${anchorMatch._debug.nameDistance} chars)`
          );
        }
      }
    }
  }

  findEmailContext(email, fullText) {
    const emailPos = fullText.toLowerCase().indexOf(email.toLowerCase());
    if (emailPos === -1) return null;

    const beforeStart = Math.max(0, emailPos - 20);
    const beforeContext = fullText.substring(beforeStart, emailPos);

    return { beforeContext };
  }

  extractNameFromContext(context) {
    const lines = context.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    for (const line of lines.slice(-3)) { // Last 3 lines before email
      const name = this.validateAndCleanName(line);
      if (name) return name;
    }

    return null;
  }

  validateAndCleanName(text) {
    if (!text || text.length < 2 || text.length > 100) return null;

    text = text.trim();

    // Check blacklist (case-insensitive)
    if (this.NAME_BLACKLIST.has(text.toLowerCase())) return null;

    // Check against NAME_REGEX
    if (this.NAME_REGEX.test(text)) {
      return text;
    }

    return null;
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

    const prefix = email.split('@')[0];
    if (!prefix || prefix.length < 2) return null;

    // Filter out non-name patterns
    const nonNameWords = [
      'info', 'contact', 'admin', 'support', 'team', 'sales',
      'help', 'service', 'office', 'hello', 'inquiries', 'mail',
      'noreply', 'no-reply', 'webmaster', 'postmaster',
      // Team/company indicators
      'strategies', 'retail', 'group', 'partners', 'associates',
      'realty', 'properties', 'homes', 'listings'
    ];

    const lowerPrefix = prefix.toLowerCase();
    if (nonNameWords.some(word => lowerPrefix === word || lowerPrefix.includes(word))) {
      return null;
    }

    // Reject if too long (likely team name)
    if (prefix.length > 25) return null;

    // Split on delimiters
    const parts = prefix.split(/[._-]+/);
    const validParts = parts.filter(p => p.length > 0 && !/^\d+$/.test(p));

    if (validParts.length === 0) return null;

    // Handle concatenated names (e.g., "nikkiadamo", "macevedo")
    if (validParts.length === 1 && validParts[0].length > 8) {
      const concatenated = validParts[0];

      // Try common first name dictionary
      const commonFirstNames = [
        'nikki', 'michael', 'melody', 'robin', 'tamara', 'brandon',
        'eric', 'william', 'robert', 'jennifer', 'melissa', 'amanda',
        'christopher', 'matthew', 'daniel', 'elizabeth', 'jonathan',
        'ioana', 'marc', 'emily', 'kayode', 'seema', 'yardena'
      ];

      for (const firstName of commonFirstNames) {
        if (concatenated.toLowerCase().startsWith(firstName)) {
          const lastName = concatenated.substring(firstName.length);
          if (lastName.length >= 2) {
            return this.toTitleCase(firstName) + ' ' + this.toTitleCase(lastName);
          }
        }
      }

      // Fallback: split at midpoint
      const mid = Math.ceil(concatenated.length / 2);
      return this.toTitleCase(concatenated.substring(0, mid)) + ' ' +
             this.toTitleCase(concatenated.substring(mid));
    }

    // Handle single-letter initials
    const titleCaseParts = validParts.map(part => {
      if (part.length === 1) {
        return part.toUpperCase() + '.'; // "m" → "M."
      }
      return this.toTitleCase(part);
    });

    const name = titleCaseParts.join(' ');

    // Validate result
    if (this.isValidNameForEmail(name)) {
      return name;
    }

    // Accept single names if reasonable length
    if (validParts.length === 1 && name.length >= 2 && name.length <= 15) {
      return name;
    }

    return null;
  }

  toTitleCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  isValidNameForEmail(name) {
    const words = name.split(/\s+/);
    return words.length >= 1 && words.length <= 6;
  }

  /**
   * Extract contacts from page
   * FIXED: Improved name extraction logic that checks ALL matching elements
   */
  async extractContacts(page, cardSelector, limit) {
    try {
      // Pass regex patterns as strings to browser context
      const contacts = await page.evaluate((selector, emailPattern, phonePatterns, namePattern, blacklistPattern, lim) => {
        const results = [];
        
        // Recreate regex in browser context
        const emailRegex = new RegExp(emailPattern, 'g');
        const nameRegex = new RegExp(namePattern);
        const blacklistRegex = new RegExp(blacklistPattern, 'i');
        const phoneRegexes = phonePatterns.map(p => new RegExp(p, 'g'));
        
        // Helper to extract emails
        const extractEmails = (text) => {
          const matches = text.match(emailRegex);
          return matches ? [...new Set(matches)] : [];
        };
        
        // Helper to extract phones
        const extractPhones = (text) => {
          const phones = [];
          for (const regex of phoneRegexes) {
            const matches = text.match(regex);
            if (matches) {
              phones.push(...matches);
            }
          }
          return [...new Set(phones)];
        };
        
        // FIXED: Improved name extraction that checks ALL matching elements
        const extractName = (element) => {
          // Priority selectors in order of reliability
          const selectorGroups = [
            // Group 1: Heading tags (most likely to contain names)
            ['h1', 'h2', 'h3'],
            
            // Group 2: Specific name-related classes
            ['.name', '.agent-name', '.profile-name', '[class*="name"]'],
            
            // Group 3: Links (often contain names on directory sites)
            ['a[href*="/agent/"]', 'a[href*="/profile/"]', 'a.profile-link'],
            
            // Group 4: Common emphasis tags
            ['strong', 'b'],
            
            // Group 5: Title-related elements
            ['.title', '[class*="title"]']
          ];
          
          // Try each selector group
          for (const selectors of selectorGroups) {
            for (const sel of selectors) {
              // CRITICAL FIX: Get ALL matching elements, not just the first
              const nameElements = element.querySelectorAll(sel);
              
              // Try each matching element
              for (const nameEl of nameElements) {
                let text = nameEl.textContent.trim();
                
                // Skip if empty or too short/long
                if (!text || text.length < 2 || text.length > 100) continue;
                
                // Skip if matches blacklist (whole phrase only)
                if (blacklistRegex.test(text)) continue;
                
                // Clean up common prefixes/suffixes
                text = text.replace(/^(agent|broker|realtor|licensed|certified|mr\.|mrs\.|ms\.|dr\.)\s+/i, '');
                text = text.replace(/,?\s*(jr\.?|sr\.?|ii|iii|iv|esq\.?|phd|md)\.?$/i, '');
                text = text.trim();
                
                // Re-check length after cleanup
                if (text.length < 2 || text.length > 100) continue;
                
                // Check word count (names should be 1-5 words)
                const wordCount = text.split(/\s+/).length;
                if (wordCount < 1 || wordCount > 5) continue;
                
                // Validate with regex pattern
                if (nameRegex.test(text)) {
                  return text;
                }
                
                // Accept all-caps names (convert to title case)
                if (/^[A-Z\s'\-\.]{2,100}$/.test(text)) {
                  const words = text.split(/\s+/);
                  if (words.length >= 1 && words.length <= 5) {
                    return words
                      .map(word => {
                        // Keep lowercase prepositions lowercase
                        if (/^(von|van|de|del|della|di|da|le|la|el)$/i.test(word)) {
                          return word.toLowerCase();
                        }
                        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                      })
                      .join(' ');
                  }
                }
              }
            }
          }
          
          // If no name found with specific selectors, try text node fallback
          // (This is a last resort for sites with unusual markup)
          const textNodes = [];
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: (node) => {
                const text = node.textContent.trim();
                return (text.length >= 2 && text.length <= 100) ? 
                  NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
              }
            }
          );
          
          let node;
          let count = 0;
          while (node = walker.nextNode()) {
            textNodes.push(node.textContent.trim());
            if (++count >= 10) break; // Limit to first 10 nodes
          }
          
          // Check text nodes for name patterns
          for (const text of textNodes) {
            // Skip if blacklisted
            if (blacklistRegex.test(text)) continue;
            
            // Skip obvious non-names
            if (/^(email|phone|contact|address|website|view|more|info|details|call|text|message)$/i.test(text)) {
              continue;
            }
            
            const cleanText = text
              .replace(/^(agent|broker|realtor|licensed|certified|mr\.|mrs\.|ms\.|dr\.)\s+/i, '')
              .trim();
            
            const wordCount = cleanText.split(/\s+/).length;
            if (wordCount >= 1 && wordCount <= 5 &&
                nameRegex.test(cleanText) && 
                cleanText.length >= 2 && cleanText.length <= 100) {
              return cleanText;
            }
          }
          
          return null;
        };
        
        // Get elements to scrape
        let elements;
        if (selector) {
          elements = Array.from(document.querySelectorAll(selector));
          if (lim) {
            elements = elements.slice(0, lim);
          }
        } else {
          // No cards detected, treat entire page as one element
          elements = [document.body];
        }
        
        // Process each element
        for (const element of elements) {
          // Get all text content
          const allText = element.textContent || '';
          
          // Extract contact info
          const emails = extractEmails(allText);
          const phones = extractPhones(allText);
          const name = extractName(element);
          
          // Check for mailto links (more reliable email source)
          const mailtoLinks = element.querySelectorAll('a[href^="mailto:"]');
          if (mailtoLinks.length > 0) {
            mailtoLinks.forEach(link => {
              const email = link.href.replace('mailto:', '').split('?')[0];
              if (email && !emails.includes(email)) {
                emails.unshift(email); // Prioritize mailto emails
              }
            });
          }
          
          // Check for tel links (more reliable phone source)
          const telLinks = element.querySelectorAll('a[href^="tel:"]');
          if (telLinks.length > 0) {
            telLinks.forEach(link => {
              const phone = link.href.replace('tel:', '').replace(/\s/g, '');
              if (phone && !phones.includes(phone)) {
                phones.unshift(phone); // Prioritize tel links
              }
            });
          }
          
          // Calculate confidence
          let confidence;
          if (name && emails.length > 0 && phones.length > 0) {
            confidence = 'high';
          } else if ((emails.length > 0 && phones.length > 0) || 
                     (name && emails.length > 0) || 
                     (name && phones.length > 0)) {
            confidence = 'medium';
          } else {
            confidence = 'low';
          }
          
          // Create contact object (must have at least a name or email or phone)
          if (name || emails.length > 0 || phones.length > 0) {
            results.push({
              name: name,
              email: emails[0] || null,
              phone: phones[0] || null,
              source: 'html',
              confidence: confidence,
              rawText: allText.substring(0, 200)
            });
          }
        }
        
        return results;
      }, cardSelector, 
         this.EMAIL_REGEX.source, 
         this.PHONE_REGEXES.map(r => r.source),
         this.NAME_REGEX.source,
         this.NAME_BLACKLIST_REGEX.source,
         limit);
      
      // Add domain information to each contact
      for (const contact of contacts) {
        this.addDomainInfo(contact);
      }
      
      return contacts;
      
    } catch (error) {
      this.logger.error(`Contact extraction failed: ${error.message}`);
      return [];
    }
  }

  /**
   * NEW METHOD: Add domain information to contact object
   * Extracts domain from email and adds domain fields
   * 
   * @param {Object} contact - Contact object (modified in place)
   */
  addDomainInfo(contact) {
    if (!contact.email) {
      contact.domain = null;
      contact.domainType = null;
      return;
    }
    
    // Extract and normalize domain
    const domain = this.domainExtractor.extractAndNormalize(contact.email);
    
    if (!domain) {
      contact.domain = null;
      contact.domainType = null;
      return;
    }
    
    // Add domain fields
    contact.domain = domain;
    contact.domainType = this.domainExtractor.isBusinessDomain(domain) ? 'business' : 'personal';
  }

  // Helper to validate email
  isValidEmail(email) {
    if (!email) return false;
    // FIXED: Reset regex lastIndex to avoid issues with global flag
    this.EMAIL_REGEX.lastIndex = 0;
    return this.EMAIL_REGEX.test(email);
  }

  // Post-process contacts (deduplication now handled during extraction)
  postProcessContacts(contacts) {
    return contacts;
  }
}

module.exports = SimpleScraper;