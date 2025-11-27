// NOTE: This implementation requires pdf-parse npm package
// Run: npm install pdf-parse

const BaseScraper = require('./base-scraper');
const contactExtractor = require('../utils/contact-extractor');

class PdfScraper extends BaseScraper {
  constructor(browserManager, rateLimiter, logger) {
    super(browserManager, rateLimiter, logger);

    // FIXED: Configurable Y_THRESHOLD with sensible default
    this.Y_THRESHOLD = 40; // Reduced from 100 to 40 pixels

    // Import shared patterns from contact-extractor
    this.EMAIL_REGEX = contactExtractor.EMAIL_REGEX;
    this.PHONE_REGEXES = contactExtractor.PHONE_REGEXES;
    this.NAME_REGEX = contactExtractor.NAME_REGEX;
    this.NAME_BLACKLIST = contactExtractor.NAME_BLACKLIST;
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

      // Add domain info
      this.addDomainInfo(contact);

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

    // Check against comprehensive blacklist (case-insensitive)
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

  async scrapePdf(url, limit = null, keepPdf = false, sourcePage = null, sourceUrl = null) {
    try {
      this.logger.info(`Starting PDF-primary scrape of ${url}`);
      const page = this.browserManager.getPage();

      // Navigate
      if (page.url() !== url) {
        await this.browserManager.navigate(url);
      }
      await page.waitForTimeout(5000); // Let JavaScript render

      // Phase 1: Render and parse PDF from disk
      const pdfData = await this.renderAndParsePdf(page, keepPdf);

      // Phase 2: Extract unique emails from PDF
      const uniqueEmails = this.extractUniqueEmailsFromText(pdfData.fullText);
      this.logger.info(`Found ${uniqueEmails.size} unique business emails in PDF`);

      // Phase 3: Build contacts (one per unique email)
      this.processedEmails.clear();
      const contacts = this.buildContactsFromPdfEmails(uniqueEmails, pdfData, limit);

      this.logger.info(`Extracted ${contacts.length} contacts from PDF`);

      // Diagnostic report
      this.logger.info('');
      this.logger.info('═══════════════════════════════════════');
      this.logger.info('  EMAIL-ANCHOR EXTRACTION DIAGNOSTICS');
      this.logger.info('═══════════════════════════════════════');

      const withName = contacts.filter(c => c.name && c.source === 'pdf-anchor').length;
      const derived = contacts.filter(c => c.source === 'pdf-derived').length;
      const withPhone = contacts.filter(c => c.phone).length;

      this.logger.info(`Total contacts: ${contacts.length}`);
      this.logger.info(`Names found in PDF: ${withName} (${((withName/contacts.length)*100).toFixed(1)}%)`);
      this.logger.info(`Names derived from email: ${derived} (${((derived/contacts.length)*100).toFixed(1)}%)`);
      this.logger.info(`Phone numbers found: ${withPhone} (${((withPhone/contacts.length)*100).toFixed(1)}%)`);

      // Show sample of problematic cases
      const problematicCases = contacts.filter(c => c.source === 'pdf-derived').slice(0, 3);
      if (problematicCases.length > 0) {
        this.logger.info('');
        this.logger.info('Sample cases where name was not found:');
        problematicCases.forEach(c => {
          this.logger.info(`  ${c.email}:`);
          this.logger.info(`    Derived name: "${c.name}"`);
          this.logger.info(`    Email found at position: ${c._debug.emailPos}`);
          this.logger.info(`    Before context: "...${c._debug.beforeContextSnippet}"`);
        });
      }

      this.logger.info('═══════════════════════════════════════');
      this.logger.info('');

      // Add pagination metadata if provided
      if (sourcePage !== null || sourceUrl !== null) {
        for (const contact of contacts) {
          if (sourcePage !== null) {
            contact.sourcePage = sourcePage;
          }
          if (sourceUrl !== null) {
            contact.sourceUrl = sourceUrl;
          }
        }
      }

      return contacts;

    } catch (error) {
      this.logger.error(`PDF scraping failed: ${error.message}`);
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
    // Use email-anchored extraction
    const contacts = this.extractByEmailAnchor(pdfData.fullText, uniqueEmails);

    // Process contacts (domain info already added in extractByEmailAnchor)
    contacts.forEach(contact => {
      this.processedEmails.add(contact.email);
    });

    return limit ? contacts.slice(0, limit) : contacts;
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