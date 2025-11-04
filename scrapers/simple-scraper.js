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

  async scrape(url, limit = null) {
    try {
      this.logger.info(`Starting simple scrape of ${url}`);
      const page = this.browserManager.getPage();
      
      // Navigate to URL
      await this.browserManager.navigate(url);
      
      // Wait for dynamic content to load
      await page.waitForTimeout(2000);
      
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
        
        // IMPROVED: Helper to extract name with better validation
        const extractName = (element) => {
          // Blacklist of common non-name phrases
          const blacklist = [
            'get help', 'find an agent', 'contact us', 'view profile', 'learn more',
            'show more', 'read more', 'see more', 'view all', 'load more',
            'sign in', 'sign up', 'log in', 'register', 'subscribe',
            'search', 'filter', 'sort by', 'menu', 'navigation',
            'back to', 'return to', 'go to', 'click here', 'follow us'
          ];
          
          const isBlacklisted = (text) => {
            const lower = text.toLowerCase();
            return blacklist.some(phrase => lower.includes(phrase));
          };
          
          // Try common name selectors first
          const nameSelectors = [
            'h1', 'h2', 'h3', 'h4',
            '.name', '.title', '.agent-name', '.profile-name',
            '[class*="name"]', '[class*="title"]', '[class*="agent"]',
            'a.profile-link', 'a[href*="/agent/"]', 'a[href*="/profile/"]',
            'strong', 'b', 'span[class*="name"]'
          ];
          
          for (const sel of nameSelectors) {
            const nameEl = element.querySelector(sel);
            if (nameEl) {
              let text = nameEl.textContent.trim();
              
              // Skip if blacklisted
              if (isBlacklisted(text)) continue;
              
              // Skip if too short or too long
              if (text.length < 3 || text.length > 60) continue;
              
              // Clean up common prefixes/suffixes
              text = text.replace(/^(agent|broker|realtor|licensed|certified|mr\.|mrs\.|ms\.|dr\.)\s+/i, '');
              text = text.replace(/,?\s*(jr\.?|sr\.?|ii|iii|iv|esq\.?|phd|md)\.?$/i, '');
              text = text.trim();
              
              // Check word count (names should be 1-4 words) - NOW ACCEPTS SINGLE WORDS
              const wordCount = text.split(/\s+/).length;
              if (wordCount < 1 || wordCount > 4) continue;
              
              // FIXED: More permissive pattern that accepts both straight and curly apostrophes
              // Accepts: O'Brien, O'Brien, John Doe, John Q. Doe, Smith-Jones, Mary-Jane
              const namePattern = /^[A-Z][a-z''\-]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z''\-]+)*$/;
              if (namePattern.test(text)) {
                return text;
              }
              
              // Also accept names in all caps (convert to title case)
              if (/^[A-Z\s'\-\.]{3,50}$/.test(text)) {
                const words = text.split(/\s+/);
                // Must have 1-4 words
                if (words.length >= 1 && words.length <= 4) {
                  return words
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
                }
              }
            }
          }
          
          // Fallback: Look for text that looks like a name in the first few text nodes
          const textNodes = [];
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: (node) => {
                const text = node.textContent.trim();
                // Only accept substantial text nodes
                return (text.length >= 3 && text.length <= 60) ? 
                  NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
              }
            },
            false
          );
          
          let node;
          while (node = walker.nextNode()) {
            textNodes.push(node.textContent.trim());
            if (textNodes.length >= 10) break;
          }
          
          // Check text nodes for name patterns
          for (const text of textNodes) {
            // Skip if blacklisted
            if (isBlacklisted(text)) continue;
            
            // Skip obvious non-names
            if (/^(email|phone|contact|address|website|view|more|info|details)/i.test(text)) {
              continue;
            }
            
            // Look for name pattern - FIXED: Now accepts both apostrophe types
            const cleanText = text
              .replace(/^(agent|broker|realtor|licensed|certified|mr\.|mrs\.|ms\.|dr\.)\s+/i, '')
              .trim();
            
            const wordCount = cleanText.split(/\s+/).length;
            // FIXED: Now accepts 1-4 words instead of 2-4
            if (wordCount >= 1 && wordCount <= 4 &&
                /^[A-Z][a-z''\-]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z''\-]+)*$/.test(cleanText) && 
                cleanText.length >= 3 && cleanText.length <= 50) {
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
          
          // IMPROVED: Better confidence scoring
          let confidence;
          if (name && emails.length > 0 && phones.length > 0) {
            // Has all three fields
            confidence = 'high';
          } else if ((emails.length > 0 && phones.length > 0) || 
                     (name && emails.length > 0) || 
                     (name && phones.length > 0)) {
            // Has two out of three fields
            confidence = 'medium';
          } else {
            // Has only one field
            confidence = 'low';
          }
          
          // Create contact object (must have at least a name or email or phone)
          if (name || emails.length > 0 || phones.length > 0) {
            results.push({
              name: name,
              email: emails[0] || null,  // Use first email found
              phone: phones[0] || null,  // Use first phone found
              source: 'visible_text',
              confidence: confidence,
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