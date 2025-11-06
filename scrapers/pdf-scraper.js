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
    
    // Try to load pdf-parse, fallback to coordinate-based if not available
    try {
      this.pdfParse = require('pdf-parse');
      this.usePdfParse = true;
      this.logger.info('Using pdf-parse for direct PDF text extraction');
    } catch (error) {
      this.usePdfParse = false;
      this.logger.warn('pdf-parse not installed, using coordinate-based extraction');
      this.logger.warn('Install with: npm install pdf-parse');
    }
    
    // FIXED: Configurable Y_THRESHOLD with sensible default
    this.Y_THRESHOLD = 40; // Reduced from 100 to 40 pixels
    
    // Pre-compiled regex patterns for performance
    this.EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.PHONE_REGEXES = [
      /(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
      /([0-9]{10})/g
    ];
    
    // IMPROVED: Smart name pattern supporting compound names
    // Accepts: O'Brien, O'Brien, McDonald, von Trapp, de la Cruz, Mary-Jane, etc.
    // \u2019 = curly apostrophe ('), \u0027 = straight apostrophe (')
    this.NAME_REGEX = /^(?:[A-Z][a-z'\u2019]+(?:-[A-Z][a-z'\u2019]+)*|[A-Z][a-z]+(?:[A-Z][a-z]+)*|(?:von|van|de|del|della|di|da|le|la|el)\s+[A-Z][a-z'\u2019]+)(?:\s+(?:[A-Z]\.?\s*|[A-Z][a-z'\u2019]+(?:-[A-Z][a-z'\u2019]+)*|(?:von|van|de|del|della|di|da|le|la|el)\s+[A-Z][a-z'\u2019]+))*$/;
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

  async scrapePdf(url, limit = null) {
    try {
      this.logger.info(`Starting PDF scrape of ${url}`);
      
      // Use direct PDF parsing if available, otherwise fall back to coordinate-based
      if (this.usePdfParse) {
        return await this.scrapePdfDirect(url, limit);
      } else {
        return await this.scrapePdfCoordinateBased(url, limit);
      }
      
    } catch (error) {
      this.logger.error(`PDF scraping failed: ${error.message}`);
      return [];
    }
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
   * MODIFIED: Now includes domain extraction
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
   * Extract name from plain text (smarter logic)
   */
  extractNameFromText(text) {
    // Split into lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Check first 5 lines (names usually appear early)
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      let line = lines[i];
      
      // Clean up prefixes
      line = line.replace(/^(agent|broker|realtor|licensed|certified|mr\.|mrs\.|ms\.|dr\.)\s+/i, '');
      line = line.replace(/,?\s*(jr\.?|sr\.?|ii|iii|iv|esq\.?|phd|md)\.?$/i, '');
      line = line.trim();
      
      // Skip if too short or too long
      if (line.length < 2 || line.length > 100) continue;
      
      // Check word count
      const wordCount = line.split(/\s+/).length;
      if (wordCount < 1 || wordCount > 5) continue;
      
      // Check if matches name pattern
      if (this.NAME_REGEX.test(line)) {
        return line;
      }
      
      // Check for all-caps names (convert to title case)
      if (/^[A-Z\s'\-\.]{2,100}$/.test(line)) {
        const words = line.split(/\s+/);
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
   * Extract contact from text group
   * MODIFIED: Now includes domain extraction
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

  extractName(textElements) {
    if (!textElements || textElements.length === 0) {
      return null;
    }
    
    // IMPROVED: Position-weighted name extraction
    // Priority: top of group (likely name) + larger text
    const scored = textElements.map((el, index) => {
      let score = 0;
      
      // Position score (earlier = better)
      score += (textElements.length - index) * 10;
      
      // Height score (larger = better, but capped)
      score += Math.min(el.height, 30);
      
      return { ...el, score };
    });
    
    // Sort by score
    scored.sort((a, b) => b.score - a.score);
    
    // Check top 5 scored elements
    for (let i = 0; i < Math.min(5, scored.length); i++) {
      let text = scored[i].text.trim();
      
      // Clean up prefixes
      text = text.replace(/^(agent|broker|realtor|mr\.|mrs\.|ms\.|dr\.)\s+/i, '');
      text = text.replace(/,\s*(jr|sr|ii|iii|iv)\.?$/i, '');
      text = text.trim();
      
      // Check if it looks like a name
      if (this.NAME_REGEX.test(text) && text.length >= 2 && text.length <= 100) {
        return text;
      }
      
      // Check for all-caps names (convert to title case)
      if (/^[A-Z\s'\-]{2,100}$/.test(text)) {
        const words = text.split(/\s+/);
        if (words.length >= 1 && words.length <= 5) {
          return words
            .map(word => {
              if (/^(von|van|de|del|della|di|da|le|la|el)$/i.test(word)) {
                return word.toLowerCase();
              }
              return word.charAt(0) + word.slice(1).toLowerCase();
            })
            .join(' ');
        }
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