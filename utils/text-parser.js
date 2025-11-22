/**
 * Text parser for select scraping method.
 * Parses raw selected text into structured contact records.
 */

class TextParser {
  constructor(logger) {
    this.logger = logger;

    // Reuse patterns from simple-scraper.js
    this.EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.PHONE_REGEX = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    this.NAME_REGEX = /^[A-Z][a-zA-Z'\-\.\s]{1,98}[a-zA-Z]$/;

    // Reuse blacklist from simple-scraper.js
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
      // Compass.com specific
      'compass', 'compass one', 'compass luxury', 'compass academy', 'compass plus',
      'compass cares', 'private exclusives', 'coming soon',
      'new development', 'recently sold', 'sales leadership',
      'neighborhood guides', 'mortgage calculator', 'external suppliers',
      // Generic descriptors
      'agent', 'broker', 'realtor', 'licensed', 'certified',
      'team', 'group', 'partners', 'associates'
    ]);
  }

  /**
   * Parse raw text into contact records
   * @param {string} rawText - Raw text from selection
   * @param {object} config - Site config with parsing rules
   * @returns {array} - Array of contact objects
   */
  parse(rawText, config) {
    if (!rawText || rawText.trim().length === 0) {
      this.logger.warn('No text provided to parser');
      return [];
    }

    // Find all emails in text
    const emails = this.extractEmails(rawText, config.parsing?.emailDomain);

    if (emails.length === 0) {
      this.logger.warn('No emails found in selected text');
      return [];
    }

    this.logger.info(`Found ${emails.length} emails in selected text`);

    // Split text into blocks using email anchors
    const blocks = this.splitIntoBlocks(rawText, emails);

    // Parse each block into a contact
    const contacts = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const email = emails[i];

      const contact = this.parseBlock(block, email, config.parsing);

      if (contact) {
        contacts.push(contact);
      }
    }

    this.logger.info(`Parsed ${contacts.length} contacts from text`);
    return contacts;
  }

  /**
   * Extract emails from text with optional domain filtering
   * @param {string} text - Raw text
   * @param {string|null} filterDomain - Domain to filter by (or null)
   * @returns {array} - Array of unique email addresses
   */
  extractEmails(text, filterDomain) {
    const matches = text.match(this.EMAIL_REGEX) || [];
    const uniqueEmails = [...new Set(matches.map(e => e.toLowerCase()))];

    if (!filterDomain) {
      return uniqueEmails;
    }

    // Filter by domain
    return uniqueEmails.filter(email => {
      const domain = email.split('@')[1];
      return domain === filterDomain.toLowerCase();
    });
  }

  /**
   * Split text into blocks, one per email
   * @param {string} text - Full text
   * @param {array} emails - Array of email addresses
   * @returns {array} - Array of text blocks
   */
  splitIntoBlocks(text, emails) {
    const blocks = [];

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const emailIndex = text.indexOf(email);

      if (emailIndex === -1) continue;

      // Define block boundaries
      const prevEmailIndex = i > 0 ? text.indexOf(emails[i - 1]) : 0;
      const nextEmailIndex = i < emails.length - 1 ? text.indexOf(emails[i + 1]) : text.length;

      // Extract block around this email
      const blockStart = Math.max(prevEmailIndex, emailIndex - 300);
      const blockEnd = Math.min(nextEmailIndex, emailIndex + 300);

      const block = text.substring(blockStart, blockEnd);
      blocks.push(block);
    }

    return blocks;
  }

  /**
   * Parse individual block into contact object
   * @param {string} block - Text block
   * @param {string} email - Email address
   * @param {object} parsingRules - Parsing configuration
   * @returns {object|null} - Contact object or null
   */
  parseBlock(block, email, parsingRules) {
    const nameBeforeEmail = parsingRules?.nameBeforeEmail !== false;

    // Extract name
    const name = this.extractName(block, email, nameBeforeEmail);

    // Extract phone
    const phone = this.extractPhone(block);

    // Extract domain
    const domain = email.split('@')[1];

    return {
      name: name,
      email: email,
      phone: phone,
      profileUrl: null,
      source: 'select',
      confidence: this.calculateConfidence(name, email, phone),
      domain: domain,
      domainType: null // Will be set by DomainExtractor
    };
  }

  /**
   * Extract name from block
   * @param {string} block - Text block
   * @param {string} email - Email address
   * @param {boolean} nameBeforeEmail - Look before (true) or after (false) email
   * @returns {string|null} - Name or null
   */
  extractName(block, email, nameBeforeEmail) {
    const emailIndex = block.indexOf(email);

    if (emailIndex === -1) return null;

    // Get text before or after email
    const searchText = nameBeforeEmail
      ? block.substring(0, emailIndex)
      : block.substring(emailIndex + email.length);

    // Split into lines
    const lines = searchText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (nameBeforeEmail) {
      lines.reverse(); // Search from closest to email
    }

    // Find first valid name
    for (const line of lines) {
      // Try to extract capitalized words
      const words = line.split(/\s+/);
      const capitalizedWords = words.filter(w => w.length > 0 && w[0] === w[0].toUpperCase());

      if (capitalizedWords.length >= 1 && capitalizedWords.length <= 5) {
        const candidateName = capitalizedWords.join(' ');

        if (this.isValidName(candidateName)) {
          return candidateName;
        }
      }
    }

    return null;
  }

  /**
   * Extract phone number from block
   * @param {string} block - Text block
   * @returns {string|null} - Formatted phone or null
   */
  extractPhone(block) {
    const matches = block.match(this.PHONE_REGEX);

    if (!matches || matches.length === 0) return null;

    // Take first match and normalize
    const phone = matches[0];
    return this.normalizePhone(phone);
  }

  /**
   * Normalize phone number format
   * @param {string} phone - Raw phone number
   * @returns {string} - Formatted phone
   */
  normalizePhone(phone) {
    // Extract digits
    const digits = phone.replace(/\D/g, '');

    if (digits.length === 10) {
      return `+1-${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+${digits[0]}-${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
    }

    return phone; // Return original if can't normalize
  }

  /**
   * Validate if text is a valid name
   * @param {string} text - Candidate name
   * @returns {boolean}
   */
  isValidName(text) {
    if (!text || text.length < 2 || text.length > 50) return false;

    // Check blacklist (case-insensitive)
    const lowerText = text.toLowerCase();
    if (this.NAME_BLACKLIST.has(lowerText)) return false;

    // Check for partial matches with common UI words
    const uiWords = ['find', 'agent', 'last name', 'first name', 'register', 'login', 'view', 'profile'];
    if (uiWords.some(word => lowerText.includes(word))) return false;

    // Must start with capital letter
    if (!text[0] || text[0] !== text[0].toUpperCase()) return false;

    // Match name pattern
    if (!this.NAME_REGEX.test(text)) return false;

    return true;
  }

  /**
   * Calculate confidence level
   * @param {string|null} name
   * @param {string} email
   * @param {string|null} phone
   * @returns {string} - 'high', 'medium', or 'low'
   */
  calculateConfidence(name, email, phone) {
    const hasName = !!name;
    const hasEmail = !!email;
    const hasPhone = !!phone;

    if (hasName && hasEmail && hasPhone) return 'high';
    if ((hasName && hasEmail) || (hasEmail && hasPhone)) return 'medium';
    return 'low';
  }
}

module.exports = TextParser;
