class PdfScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    
    // Configuration
    this.Y_THRESHOLD = 100; // Vertical grouping threshold in pixels
    
    // Regex patterns
    this.EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.PHONE_PATTERNS = [
      /(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
      /([0-9]{10})/g
    ];
    this.NAME_PATTERN = /^[A-Z][a-z'\-]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z'\-]+)+$/;
  }

  async scrapePdf(url, limit = null) {
    try {
      this.logger.info(`Starting PDF scrape of ${url}`);
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
      this.logger.error(`PDF scraping failed: ${error.message}`);
      return []; // Return empty array on failure
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
          
          // Check limit again after adding contact
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
    
    return {
      name: name || null,
      email: emails[0] || null,
      phone: phones[0] || null,
      source: 'pdf',
      confidence: confidence,
      rawText: allText.substring(0, 200)
    };
  }

  extractEmails(text) {
    if (!text) return [];
    const matches = text.match(this.EMAIL_PATTERN);
    return matches ? [...new Set(matches)] : [];
  }

  extractPhones(text) {
    if (!text) return [];
    const phones = [];
    
    for (const pattern of this.PHONE_PATTERNS) {
      const regex = new RegExp(pattern.source, 'g');
      const matches = text.match(regex);
      if (matches) {
        phones.push(...matches);
      }
    }
    
    // Normalize and deduplicate
    const normalized = phones.map(p => this.normalizePhone(p)).filter(p => p);
    return [...new Set(normalized)];
  }

  extractName(textElements) {
    if (!textElements || textElements.length === 0) {
      return null;
    }
    
    // Sort by height (larger text first - likely to be names/titles)
    const sortedByHeight = [...textElements].sort((a, b) => b.height - a.height);
    
    // Check top 5 largest text elements
    for (let i = 0; i < Math.min(5, sortedByHeight.length); i++) {
      const text = sortedByHeight[i].text.trim();
      
      // Clean up prefixes
      let cleanText = text.replace(/^(agent|broker|realtor|mr\.|mrs\.|ms\.|dr\.)\s+/i, '');
      cleanText = cleanText.replace(/,\s*(jr|sr|ii|iii|iv)\.?$/i, '');
      cleanText = cleanText.trim();
      
      // Check if it looks like a name
      if (this.NAME_PATTERN.test(cleanText) && cleanText.length >= 5 && cleanText.length <= 50) {
        return cleanText;
      }
      
      // Check for all-caps names (convert to title case)
      if (/^[A-Z\s'\-]{5,50}$/.test(cleanText)) {
        const words = cleanText.split(/\s+/);
        if (words.length >= 2 && words.length <= 4) {
          return words
            .map(word => word.charAt(0) + word.slice(1).toLowerCase())
            .join(' ');
        }
      }
    }
    
    // Fallback: check all text for name patterns
    for (const element of textElements) {
      const text = element.text.trim();
      if (this.NAME_PATTERN.test(text) && text.length >= 5 && text.length <= 50) {
        return text;
      }
    }
    
    return null;
  }

  normalizeEmail(email) {
    if (!email) return '';
    return email.toLowerCase().trim();
  }

  normalizePhone(phone) {
    if (!phone) return '';
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    // Keep last 10 digits
    return digits.slice(-10);
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
