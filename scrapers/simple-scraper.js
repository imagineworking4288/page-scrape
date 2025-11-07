const DomainExtractor = require('../utils/domain-extractor');

class SimpleScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    
    // Initialize domain extractor
    this.domainExtractor = new DomainExtractor(logger);
    
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
    
    // REDUCED: Only blacklist obvious UI elements
    this.NAME_BLACKLIST_REGEX = /^(get\s+help|find\s+an?\s+agent|contact\s+us|view\s+profile|learn\s+more|show\s+more|read\s+more|see\s+more|view\s+all|load\s+more|sign\s+in|sign\s+up|log\s+in|menu|search|filter|back\s+to|click\s+here)$/i;
    
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
    return this.EMAIL_REGEX.test(email);
  }

  // Post-process contacts (deduplicate only - normalization happens in merger)
  postProcessContacts(contacts) {
    const seen = new Set();
    const processed = [];
    
    for (const contact of contacts) {
      // Create hash for deduplication (using raw values)
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