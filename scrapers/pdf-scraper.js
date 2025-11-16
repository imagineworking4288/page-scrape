// NOTE: This implementation requires pdf-parse npm package
// Run: npm install pdf-parse

const fs = require('fs');
const path = require('path');
const DomainExtractor = require('../utils/domain-extractor');

class PdfScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;

    // Initialize domain extractor
    this.domainExtractor = new DomainExtractor(logger);

    // Load pdf-parse (required)
    try {
      this.pdfParse = require('pdf-parse');
      this.logger.info('pdf-parse loaded successfully');
    } catch (error) {
      throw new Error('pdf-parse is required. Install with: npm install pdf-parse');
    }

    // Track processed emails to prevent duplicates
    this.processedEmails = new Set();
    
    // FIXED: Configurable Y_THRESHOLD with sensible default
    this.Y_THRESHOLD = 40; // Reduced from 100 to 40 pixels
    
    // Pre-compiled regex patterns for performance
    this.EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.PHONE_REGEXES = [
      /(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
      /([0-9]{10})/g
    ];
    
    // FIXED: Simplified name pattern matching simple-scraper
    // Accepts any capitalized words (including single names)
    this.NAME_REGEX = /^[A-Z][a-zA-Z'\-\.\s]{1,98}[a-zA-Z]$/;
    
    // FIXED: Reduced blacklist - only obvious non-names
    this.NAME_BLACKLIST = new Set([
      'agent', 'broker', 'realtor', 'licensed', 'certified',
      'email', 'phone', 'contact', 'address', 'website',
      'view', 'more', 'info', 'details', 'call', 'text', 'message',
      'get help', 'find an agent', 'contact us', 'view profile',
      'learn more', 'show more', 'read more', 'see more'
    ]);
  }

  /**
   * Set custom Y threshold for grouping
   * @param {number} threshold - Pixels between groups
   */
  setYThreshold(threshold) {
    if (threshold < 10 || threshold > 200) {
      throw new Error('Y_THRESHOLD must be between 10 and 200 pixels');
    }
    this.Y_THRESHOLD = threshold;
    this.logger.info(`Y_THRESHOLD set to ${threshold}px`);
  }

  async scrapePdf(url, limit = null, keepPdf = false) {
    try {
      this.logger.info(`Starting PDF-primary scrape of ${url}`);
      const page = this.browserManager.getPage();

      // Navigate
      if (page.url() !== url) {
        await this.browserManager.navigate(url);
      }
      await page.waitForTimeout(3000);

      // Phase 1: Render and parse PDF from disk
      const pdfData = await this.renderAndParsePdf(page, keepPdf);

      // Phase 2: Extract unique emails from PDF
      const uniqueEmails = this.extractUniqueEmailsFromText(pdfData.fullText);
      this.logger.info(`Found ${uniqueEmails.size} unique business emails in PDF`);

      // Phase 3: Build contacts (one per unique email)
      this.processedEmails.clear();
      const contacts = this.buildContactsFromPdfEmails(uniqueEmails, pdfData, limit);

      this.logger.info(`Extracted ${contacts.length} contacts from PDF`);
      return contacts;

    } catch (error) {
      this.logger.error(`PDF scraping failed: ${error.message}`);
      throw error;
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
        margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' }
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

  extractUniqueEmailsFromText(text) {
    const emails = new Set();
    const matches = text.match(this.EMAIL_REGEX);

    if (matches) {
      for (const email of matches) {
        const normalized = email.toLowerCase().trim();
        const domain = this.domainExtractor.extractAndNormalize(normalized);

        // Only business domains
        if (domain && this.domainExtractor.isBusinessDomain(domain)) {
          emails.add(normalized);
        }
      }
    }

    return emails;
  }

  buildContactsFromPdfEmails(uniqueEmails, pdfData, limit) {
    const contacts = [];

    for (const email of uniqueEmails) {
      // CRITICAL: Never process same email twice
      if (this.processedEmails.has(email)) {
        if (this.logger && this.logger.debug) {
          this.logger.debug(`Skipping duplicate email: ${email}`);
        }
        continue;
      }
      this.processedEmails.add(email);

      // Find FIRST occurrence in PDF
      const context = this.findEmailContext(email, pdfData.fullText);
      if (!context) continue;

      // Extract name from BEFORE email (20 chars)
      let name = this.extractNameFromContext(context.beforeContext);

      // Fallback: extract name from email if not found
      if (!name) {
        name = this.extractNameFromEmail(email);
      }

      // Extract phone from AFTER email (30 chars)
      const phone = this.extractPhoneFromContext(context.afterContext);

      // Create contact (ONE per unique email)
      const contact = {
        name,
        email,
        phone,
        source: 'pdf',
        confidence: this.calculateConfidence(!!name, true, !!phone),
        rawText: (context.beforeContext + email + context.afterContext).substring(0, 200)
      };

      this.addDomainInfo(contact);
      contacts.push(contact);

      if (limit && contacts.length >= limit) break;
    }

    return contacts;
  }

  findEmailContext(email, fullText) {
    const emailPos = fullText.toLowerCase().indexOf(email.toLowerCase());
    if (emailPos === -1) return null;

    // BEFORE email (for name) - 20 chars
    const beforeStart = Math.max(0, emailPos - 20);
    const beforeContext = fullText.substring(beforeStart, emailPos);

    // AFTER email (for phone) - 30 chars
    const afterEnd = Math.min(fullText.length, emailPos + email.length + 30);
    const afterContext = fullText.substring(emailPos + email.length, afterEnd);

    return { beforeContext, afterContext, emailPos };
  }

  extractNameFromContext(context) {
    const lines = context.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Check last few lines (name usually right before email)
    for (const line of lines.slice(-3).reverse()) {
      const name = this.validateAndCleanName(line);
      if (name) return name;
    }

    return null;
  }

  extractPhoneFromContext(context) {
    const phones = [];

    for (const regex of this.PHONE_REGEXES) {
      const matches = context.match(new RegExp(regex.source, 'g'));
      if (matches) {
        phones.push(...matches);
      }
    }

    return phones.length > 0 ? phones[0] : null;
  }

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
    if (this.isValidName(name)) {
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

  isValidName(name) {
    const words = name.split(/\s+/);
    return words.length >= 1 && words.length <= 6;
  }

  /**
   * IMPROVED: Direct PDF text extraction using pdf-parse library
   * This is much more reliable than coordinate-based extraction
   */
  async scrapePdfDirect(url, limit = null) {
    try {
      const page = this.browserManager.getPage();
      
      // Navigate to URL if not already there
      if (page.url() !== url) {
        await this.browserManager.navigate(url);
      }
      
      // Wait for PDF to load
      await page.waitForTimeout(3000);
      
      // Check if it's actually a PDF
      const contentType = await page.evaluate(() => {
        return document.contentType || document.querySelector('embed')?.type || null;
      });
      
      if (!contentType || !contentType.includes('pdf')) {
        this.logger.warn('URL does not appear to be a PDF, falling back to coordinate-based extraction');
        return await this.scrapePdfCoordinateBased(url, limit);
      }
      
      // Download the PDF temporarily
      this.logger.info('Downloading PDF for parsing...');
      const pdfBuffer = await page.evaluate(async () => {
        const response = await fetch(window.location.href);
        const arrayBuffer = await response.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
      });
      
      // Convert back to Buffer
      const buffer = Buffer.from(pdfBuffer);
      
      // Parse PDF
      this.logger.info('Parsing PDF text...');
      const data = await this.pdfParse(buffer);
      const text = data.text;
      
      this.logger.info(`Extracted ${text.length} characters from PDF`);
      
      // Split text into sections (paragraphs/blocks)
      const sections = this.splitIntoSections(text);
      this.logger.info(`Split into ${sections.length} sections`);
      
      // Extract contacts from sections
      const contacts = this.extractContactsFromSections(sections, limit);
      this.logger.info(`Extracted ${contacts.length} contacts from PDF`);
      
      return contacts;
      
    } catch (error) {
      this.logger.error(`Direct PDF parsing failed: ${error.message}`);
      this.logger.info('Falling back to coordinate-based extraction');
      return await this.scrapePdfCoordinateBased(url, limit);
    }
  }

  /**
   * Split PDF text into logical sections based on blank lines
   */
  splitIntoSections(text) {
    // Split by multiple newlines (blank lines)
    const sections = text
      .split(/\n\s*\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 10); // Ignore very short sections
    
    return sections;
  }

  /**
   * Extract contacts from text sections
   * FIXED: Improved name extraction with multiple attempts
   */
  extractContactsFromSections(sections, limit = null) {
    const contacts = [];
    
    for (const section of sections) {
      if (limit && contacts.length >= limit) break;
      
      // Extract data from this section
      const emails = this.extractEmails(section);
      const phones = this.extractPhones(section);
      const name = this.extractNameFromText(section);
      
      // Must have at least one field
      if (!name && emails.length === 0 && phones.length === 0) {
        continue;
      }
      
      // Calculate confidence
      const confidence = this.calculateConfidence(name, emails.length > 0, phones.length > 0);
      
      // Create base contact
      const contact = {
        name: name || null,
        email: emails[0] || null,
        phone: phones[0] || null,
        source: 'pdf',
        confidence: confidence,
        rawText: section.substring(0, 200)
      };
      
      // Add domain information
      this.addDomainInfo(contact);
      
      contacts.push(contact);
    }
    
    return contacts;
  }

  /**
   * FIXED: Extract name from plain text with improved logic
   * Uses multiple strategies to find names in various text formats
   */
  extractNameFromText(text) {
    if (!text || text.length < 2) {
      return null;
    }
    
    // Split into lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Strategy 1: Check first 10 lines (names usually appear early)
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      let line = lines[i];
      
      // Skip if it's clearly not a name (contains @, numbers, etc.)
      if (/@/.test(line) || /\d{3}/.test(line) || /https?:/.test(line)) {
        continue;
      }
      
      // Try to extract name from this line
      const extractedName = this.validateAndCleanName(line);
      if (extractedName) {
        return extractedName;
      }
    }
    
    // Strategy 2: Look for capitalized sequences in the entire text
    // This catches names that might not be on their own line
    const words = text.split(/\s+/);
    
    // Build potential name sequences (2-5 consecutive capitalized words)
    for (let i = 0; i < words.length - 1; i++) {
      // Try different lengths (prefer longer names first)
      for (let len = 5; len >= 1; len--) {
        if (i + len > words.length) continue;
        
        const sequence = words.slice(i, i + len).join(' ');
        const extractedName = this.validateAndCleanName(sequence);
        
        if (extractedName) {
          // Additional check: make sure it's not in the middle of a sentence
          const wordBefore = i > 0 ? words[i - 1] : '';
          const wordAfter = i + len < words.length ? words[i + len] : '';
          
          // Skip if surrounded by lowercase words (likely mid-sentence)
          if (/^[a-z]/.test(wordBefore) && /^[a-z]/.test(wordAfter)) {
            continue;
          }
          
          return extractedName;
        }
      }
    }
    
    return null;
  }

  /**
   * FIXED: Validate and clean a potential name string
   * More permissive than before, matches simple-scraper logic
   * 
   * @param {string} text - Potential name text
   * @returns {string|null} - Cleaned name or null if invalid
   */
  validateAndCleanName(text) {
    if (!text || typeof text !== 'string') {
      return null;
    }
    
    // Initial cleanup
    text = text.trim();
    
    // Skip if too short or too long
    if (text.length < 2 || text.length > 100) {
      return null;
    }
    
    // Skip if matches exact blacklist phrases (case-insensitive)
    const lowerText = text.toLowerCase();
    if (this.NAME_BLACKLIST.has(lowerText)) {
      return null;
    }
    
    // Clean up common prefixes/suffixes
    text = text
      .replace(/^(agent|broker|realtor|licensed|certified|mr\.|mrs\.|ms\.|dr\.)\s+/i, '')
      .replace(/,?\s*(jr\.?|sr\.?|ii|iii|iv|esq\.?|phd|md)\.?$/i, '')
      .trim();
    
    // Re-check length after cleanup
    if (text.length < 2 || text.length > 100) {
      return null;
    }
    
    // Check word count (names should be 1-5 words)
    const words = text.split(/\s+/);
    if (words.length < 1 || words.length > 5) {
      return null;
    }
    
    // FIXED: Use simplified regex pattern
    if (this.NAME_REGEX.test(text)) {
      return text;
    }
    
    // FIXED: Accept all-caps names (convert to title case)
    if (/^[A-Z\s'\-\.]{2,100}$/.test(text)) {
      if (words.length >= 1 && words.length <= 5) {
        return words
          .map(word => {
            // Keep lowercase prepositions lowercase
            if (/^(von|van|de|del|della|di|da|le|la|el)$/i.test(word)) {
              return word.toLowerCase();
            }
            // Convert to title case
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join(' ');
      }
    }
    
    // FIXED: Accept names that start with capital and contain mostly letters
    // This catches names that might have unusual spacing or punctuation
    if (/^[A-Z]/.test(text) && /^[A-Za-z\s'\-\.]{2,100}$/.test(text)) {
      const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
      const totalLength = text.replace(/\s/g, '').length;
      
      // Must be at least 70% alphabetic characters
      if (alphaCount / totalLength >= 0.7) {
        return text;
      }
    }
    
    return null;
  }

  /**
   * Fallback: Coordinate-based extraction (original method)
   */
  async scrapePdfCoordinateBased(url, limit = null) {
    try {
      this.logger.info('Using coordinate-based PDF extraction');
      const page = this.browserManager.getPage();
      
      // Navigate to URL if not already there
      if (page.url() !== url) {
        await this.browserManager.navigate(url);
      }
      
      // Wait for content to load
      await page.waitForTimeout(2000);
      
      // Extract text with coordinates from the page
      this.logger.info('Extracting text with coordinates...');
      const textElements = await this.extractTextWithCoordinates(page);
      this.logger.info(`Extracted ${textElements.length} text elements`);
      
      // Group by proximity and extract contacts
      this.logger.info('Grouping text by proximity...');
      const contacts = this.groupByProximity(textElements, limit);
      this.logger.info(`Extracted ${contacts.length} contacts from PDF`);
      
      return contacts;
      
    } catch (error) {
      this.logger.error(`Coordinate-based PDF scraping failed: ${error.message}`);
      return [];
    }
  }

  async extractTextWithCoordinates(page) {
    try {
      const textWithCoords = await page.evaluate(() => {
        const results = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const text = node.textContent.trim();
              return text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          }
        );
        
        let node;
        while (node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNode(node);
          const rect = range.getBoundingClientRect();
          
          if (rect.width > 0 && rect.height > 0) {
            results.push({
              text: node.textContent.trim(),
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            });
          }
        }
        
        return results;
      });
      
      return textWithCoords;
      
    } catch (error) {
      this.logger.error(`Text extraction failed: ${error.message}`);
      return [];
    }
  }

  groupByProximity(textElements, limit = null) {
    if (!textElements || textElements.length === 0) {
      return [];
    }
    
    // Sort by Y coordinate (top to bottom)
    textElements.sort((a, b) => a.y - b.y);
    
    const groups = [];
    let currentGroup = [];
    let currentY = textElements[0].y;
    let contactsExtracted = 0;
    
    for (const element of textElements) {
      // Check if we've reached the limit
      if (limit && contactsExtracted >= limit) {
        break;
      }
      
      // If element is too far vertically, process current group and start new one
      if (element.y - currentY > this.Y_THRESHOLD && currentGroup.length > 0) {
        const contact = this.extractContactFromGroup(currentGroup);
        if (contact) {
          groups.push(contact);
          contactsExtracted++;
          
          if (limit && contactsExtracted >= limit) {
            break;
          }
        }
        
        // Start new group
        currentGroup = [element];
        currentY = element.y;
      } else {
        // Add to current group
        currentGroup.push(element);
        currentY = element.y;
      }
    }
    
    // Process last group if we haven't reached limit
    if (currentGroup.length > 0 && (!limit || contactsExtracted < limit)) {
      const contact = this.extractContactFromGroup(currentGroup);
      if (contact) {
        groups.push(contact);
      }
    }
    
    return groups;
  }

  /**
   * FIXED: Extract contact from text group with improved name extraction
   */
  extractContactFromGroup(textGroup) {
    if (!textGroup || textGroup.length === 0) {
      return null;
    }
    
    // Combine all text from group
    const allText = textGroup.map(el => el.text).join(' ');
    
    // Extract email, phone, name
    const emails = this.extractEmails(allText);
    const phones = this.extractPhones(allText);
    const name = this.extractName(textGroup);
    
    // Must have at least one field
    if (!name && emails.length === 0 && phones.length === 0) {
      return null;
    }
    
    // Calculate confidence
    const confidence = this.calculateConfidence(name, emails.length > 0, phones.length > 0);
    
    // Create base contact
    const contact = {
      name: name || null,
      email: emails[0] || null,
      phone: phones[0] || null,
      source: 'pdf',
      confidence: confidence,
      rawText: allText.substring(0, 200)
    };
    
    // Add domain information
    this.addDomainInfo(contact);
    
    return contact;
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

  extractEmails(text) {
    if (!text) return [];
    const matches = text.match(this.EMAIL_REGEX);
    return matches ? [...new Set(matches)] : [];
  }

  extractPhones(text) {
    if (!text) return [];
    const phones = [];
    
    for (const regex of this.PHONE_REGEXES) {
      const matches = text.match(new RegExp(regex.source, 'g'));
      if (matches) {
        phones.push(...matches);
      }
    }
    
    // Deduplicate
    return [...new Set(phones)];
  }

  /**
   * FIXED: Extract name from coordinate-based text elements
   * Improved to try multiple elements with better scoring
   */
  extractName(textElements) {
    if (!textElements || textElements.length === 0) {
      return null;
    }
    
    // Score each element based on position and size
    const scored = textElements.map((el, index) => {
      let score = 0;
      
      // Position score (earlier = better)
      score += (textElements.length - index) * 10;
      
      // Height score (larger text = better, but capped)
      score += Math.min(el.height, 30);
      
      // Bonus for elements near the top
      if (index < 3) {
        score += 20;
      }
      
      return { ...el, score };
    });
    
    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);
    
    // Try top scoring elements
    for (let i = 0; i < Math.min(10, scored.length); i++) {
      const text = scored[i].text.trim();
      const cleanedName = this.validateAndCleanName(text);
      
      if (cleanedName) {
        return cleanedName;
      }
    }
    
    return null;
  }

  calculateConfidence(hasName, hasEmail, hasPhone) {
    if (hasName && hasEmail && hasPhone) {
      return 'high';
    } else if ((hasEmail && hasPhone) || (hasName && hasEmail) || (hasName && hasPhone)) {
      return 'medium';
    } else {
      return 'low';
    }
  }
}

module.exports = PdfScraper;