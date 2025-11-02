class SimpleScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    
    // Regex patterns
    this.EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.PHONE_PATTERNS = [
      /(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,  // (123) 456-7890
      /(?:\+1[-.\s]?)?([0-9]{3})[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,         // 123-456-7890
      /([0-9]{10})/g                                                            // 1234567890
    ];
    
    // Common card selectors to try
    this.CARD_SELECTORS = [
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
      this.logger.info(`Starting simple scrape of ${url}`);
      const page = this.browserManager.getPage();
      
      // Navigate to URL
      await this.browserManager.navigate(url);
      
      // Detect card pattern
      const cardSelector = await this.detectCardPattern(page);
      this.logger.info(`Using selector: ${cardSelector || 'full page (no cards detected)'}`);
      
      // Extract contacts
      const contacts = await this.extractContacts(page, cardSelector, limit);
      
      this.logger.info(`Extracted ${contacts.length} contacts`);
      return contacts;
      
    } catch (error) {
      this.logger.error(`Scraping failed: ${error.message}`);
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

  async extractContacts(page, cardSelector, limit) {
    try {
      const contacts = await page.evaluate((selector, emailPattern, phonePatterns, lim) => {
        const results = [];
        
        // Helper to extract emails
        const extractEmails = (text) => {
          const regex = new RegExp(emailPattern, 'g');
          const matches = text.match(regex);
          return matches ? [...new Set(matches)] : [];
        };
        
        // Helper to extract phones
        const extractPhones = (text) => {
          const phones = [];
          for (const pattern of phonePatterns) {
            const regex = new RegExp(pattern, 'g');
            const matches = text.match(regex);
            if (matches) {
              phones.push(...matches);
            }
          }
          return [...new Set(phones)];
        };
        
        // Helper to extract name
        const extractName = (element) => {
          // Try common name selectors first
          const nameSelectors = [
            'h1', 'h2', 'h3', 'h4',
            '.name', '.title', '.agent-name', '.profile-name',
            '[class*="name"]', '[class*="title"]',
            'strong', 'b'
          ];
          
          for (const sel of nameSelectors) {
            const nameEl = element.querySelector(sel);
            if (nameEl) {
              const text = nameEl.textContent.trim();
              // Basic name pattern: starts with capital, has at least 2 words
              if (/^[A-Z][a-z]+(?:\s[A-Z][a-z.]+)+$/.test(text)) {
                return text;
              }
            }
          }
          
          // Fallback: Look for capitalized text in first few text nodes
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          
          let node;
          let textNodes = [];
          while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text.length > 5 && text.length < 50) {
              textNodes.push(text);
            }
            if (textNodes.length >= 5) break;
          }
          
          for (const text of textNodes) {
            if (/^[A-Z][a-z]+(?:\s[A-Z][a-z.]+)+$/.test(text)) {
              return text;
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
          
          // Create contact object (must have at least a name or email)
          if (name || emails.length > 0) {
            results.push({
              name: name,
              email: emails[0] || null,  // Use first email found
              phone: phones[0] || null,  // Use first phone found
              source: 'visible_text',
              confidence: (name && emails.length > 0 && phones.length > 0) ? 'high' : 
                         ((name && (emails.length > 0 || phones.length > 0)) ? 'medium' : 'low'),
              rawText: allText.substring(0, 200) // First 200 chars for debugging
            });
          }
        }
        
        return results;
      }, cardSelector, this.EMAIL_PATTERN.source, this.PHONE_PATTERNS.map(p => p.source), limit);
      
      return contacts;
      
    } catch (error) {
      this.logger.error(`Contact extraction failed: ${error.message}`);
      return [];
    }
  }

  // Helper to normalize phone numbers
  normalizePhone(phone) {
    if (!phone) return null;
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    // Format as (XXX) XXX-XXXX
    if (digits.length === 10) {
      return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.substring(1, 4)}) ${digits.substring(4, 7)}-${digits.substring(7)}`;
    }
    return phone; // Return as-is if can't normalize
  }

  // Helper to validate email
  isValidEmail(email) {
    if (!email) return false;
    return this.EMAIL_PATTERN.test(email);
  }

  // Post-process contacts (normalize and deduplicate)
  postProcessContacts(contacts) {
    const seen = new Set();
    const processed = [];
    
    for (const contact of contacts) {
      // Normalize phone
      if (contact.phone) {
        contact.phone = this.normalizePhone(contact.phone);
      }
      
      // Create hash for deduplication
      const hash = `${(contact.name || '').toLowerCase()}||${(contact.email || '').toLowerCase()}`;
      
      // Skip if duplicate
      if (seen.has(hash)) {
        continue;
      }
      
      seen.add(hash);
      processed.push(contact);
    }
    
    return processed;
  }
}

module.exports = SimpleScraper;
