/**
 * Smart Field Extractor
 *
 * Intelligently extracts contact fields from card elements using:
 * - Email-first proximity strategy (find email, then look for name within 300-500px)
 * - Pattern recognition for phones, titles, locations
 * - Social link detection
 * - Profile URL extraction
 *
 * Field Types:
 * - name: Contact name
 * - email: Email address
 * - phone: Phone number
 * - title: Job title/position
 * - location: City/Country/Address
 * - profileUrl: Link to full profile
 * - socialLinks: LinkedIn, Twitter, etc.
 */

class SmartFieldExtractor {
  constructor(logger) {
    this.logger = logger || console;

    // Context window for proximity matching
    this.NAME_CONTEXT_WINDOW = 400; // pixels
    this.PHONE_CONTEXT_WINDOW = 300;
  }

  /**
   * Generate browser-side extraction code
   * @returns {string} - JavaScript code to inject
   */
  getExtractorCode() {
    return `
    (function() {
      'use strict';

      // ===========================
      // REGEX PATTERNS
      // ===========================

      const PATTERNS = {
        email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/gi,

        phone: [
          // International format
          /\\+?[1-9]\\d{0,2}[-.\\s]?\\(?\\d{1,4}\\)?[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,9}/g,
          // US format
          /\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}/g,
          // Generic digits
          /\\d{3}[-.\\s]\\d{3}[-.\\s]\\d{4}/g
        ],

        // Common job title keywords
        title: [
          'CEO', 'CTO', 'CFO', 'COO', 'CMO', 'CIO', 'CISO',
          'President', 'Vice President', 'VP',
          'Director', 'Manager', 'Lead', 'Head',
          'Engineer', 'Developer', 'Designer', 'Analyst',
          'Consultant', 'Specialist', 'Coordinator',
          'Associate', 'Senior', 'Junior', 'Principal',
          'Partner', 'Founder', 'Owner',
          'Attorney', 'Lawyer', 'Counsel',
          'Doctor', 'Professor', 'Researcher'
        ],

        // Location indicators
        location: [
          // US States (common abbreviations)
          'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
          'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
          'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
          'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
          'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
          // Countries
          'USA', 'United States', 'UK', 'United Kingdom', 'Canada',
          'Australia', 'Germany', 'France', 'Japan', 'China', 'India'
        ],

        // Social platform patterns
        social: {
          linkedin: /linkedin\\.com\\/in\\/([\\w-]+)/i,
          twitter: /twitter\\.com\\/([\\w]+)/i,
          facebook: /facebook\\.com\\/([\\w.]+)/i,
          github: /github\\.com\\/([\\w-]+)/i
        }
      };

      // ===========================
      // NAME VALIDATION
      // ===========================

      const NAME_BLACKLIST = [
        'email', 'phone', 'tel', 'fax', 'mobile', 'cell',
        'address', 'location', 'city', 'state', 'country',
        'contact', 'info', 'support', 'sales', 'admin',
        'click', 'here', 'more', 'view', 'profile', 'read',
        'next', 'prev', 'previous', 'back', 'home', 'menu',
        'share', 'print', 'save', 'edit', 'delete', 'remove',
        'loading', 'please', 'wait', 'error', 'success'
      ];

      /**
       * Check if text could be a valid name
       */
      function isValidNameCandidate(text) {
        if (!text || typeof text !== 'string') return false;

        const cleaned = text.trim();

        // Length checks
        if (cleaned.length < 2 || cleaned.length > 100) return false;

        // Should have at least one letter
        if (!/[a-zA-Z]/.test(cleaned)) return false;

        // Should not be mostly numbers
        const digits = (cleaned.match(/\\d/g) || []).length;
        if (digits > cleaned.length / 2) return false;

        // Check blacklist
        const lowerText = cleaned.toLowerCase();
        if (NAME_BLACKLIST.some(word => lowerText === word)) return false;

        // Should have reasonable word structure
        const words = cleaned.split(/\\s+/);
        if (words.length > 6) return false;

        // Each word should be reasonable length
        if (words.some(w => w.length > 25)) return false;

        return true;
      }

      /**
       * Clean and format name
       */
      function cleanName(text) {
        if (!text) return null;

        let cleaned = text
          .replace(/\\s+/g, ' ')
          .replace(/[\\n\\r\\t]/g, ' ')
          .trim();

        // Remove common prefixes/suffixes
        cleaned = cleaned
          .replace(/^(Mr\\.?|Mrs\\.?|Ms\\.?|Dr\\.?|Prof\\.?)\\s*/i, '')
          .replace(/\\s*(Jr\\.?|Sr\\.?|III?|IV)$/i, '')
          .trim();

        // Title case
        cleaned = cleaned.split(' ').map(word => {
          if (word.length <= 2) return word.toUpperCase();
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');

        return cleaned || null;
      }

      // ===========================
      // EXTRACTION FUNCTIONS
      // ===========================

      /**
       * Extract emails from element
       * Priority order:
       * 1. mailto: links (most reliable - handles "Email" link text case)
       * 2. Links with text containing @
       * 3. Plain text email patterns
       */
      function extractEmails(element) {
        const emails = [];

        // Strategy 1: From mailto links (HIGHEST PRIORITY)
        // Handles case where link text is "Email" but href has actual address
        const mailtoLinks = element.querySelectorAll('a[href^="mailto:"]');
        mailtoLinks.forEach(link => {
          const href = link.getAttribute('href');
          const email = href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
          if (email && email.includes('@') && !emails.includes(email)) {
            emails.push(email);
          }
        });

        // Strategy 2: Links with email-like text (in case mailto not used)
        const allLinks = element.querySelectorAll('a[href]');
        allLinks.forEach(link => {
          const text = link.textContent.trim();
          const match = text.match(PATTERNS.email);
          if (match) {
            const email = match[0].toLowerCase();
            if (!emails.includes(email)) {
              emails.push(email);
            }
          }
          // Also check href for email patterns (some sites put email in href without mailto)
          const href = link.getAttribute('href');
          if (href && href.includes('@') && !href.startsWith('mailto:')) {
            const hrefMatch = href.match(PATTERNS.email);
            if (hrefMatch) {
              const email = hrefMatch[0].toLowerCase();
              if (!emails.includes(email)) {
                emails.push(email);
              }
            }
          }
        });

        // Strategy 3: Plain text content (fallback)
        const text = element.textContent;
        const textMatches = text.match(PATTERNS.email) || [];
        textMatches.forEach(email => {
          const normalizedEmail = email.toLowerCase();
          if (!emails.includes(normalizedEmail)) {
            emails.push(normalizedEmail);
          }
        });

        return emails;
      }

      /**
       * Extract phones from element
       */
      function extractPhones(element) {
        const phones = [];
        const text = element.textContent;

        PATTERNS.phone.forEach(pattern => {
          const matches = text.match(pattern) || [];
          matches.forEach(phone => {
            const normalized = normalizePhone(phone);
            if (normalized && !phones.includes(normalized)) {
              phones.push(normalized);
            }
          });
        });

        // From tel links
        const telLinks = element.querySelectorAll('a[href^="tel:"]');
        telLinks.forEach(link => {
          const href = link.getAttribute('href');
          const phone = normalizePhone(href.replace('tel:', ''));
          if (phone && !phones.includes(phone)) {
            phones.push(phone);
          }
        });

        return phones;
      }

      /**
       * Normalize phone number
       */
      function normalizePhone(phone) {
        if (!phone) return null;

        // Extract digits
        const digits = phone.replace(/\\D/g, '');

        // Validate length
        if (digits.length < 7 || digits.length > 15) return null;

        // Format US numbers
        if (digits.length === 10) {
          return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
        }

        if (digits.length === 11 && digits[0] === '1') {
          return '+1 (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7);
        }

        // Return cleaned format
        return phone.trim();
      }

      /**
       * Extract job title from element
       */
      function extractTitle(element, excludeText = []) {
        const candidates = [];

        // Look for specific title-like elements
        const titleSelectors = [
          '[class*="title"]', '[class*="position"]', '[class*="role"]',
          '[class*="job"]', '[class*="designation"]',
          'p', 'span', 'div'
        ];

        const excludeLower = excludeText.map(t => t.toLowerCase());

        for (const selector of titleSelectors) {
          const elements = element.querySelectorAll(selector);
          elements.forEach(el => {
            const text = el.textContent.trim();
            if (text.length < 5 || text.length > 150) return;
            if (excludeLower.includes(text.toLowerCase())) return;

            // Check for title keywords
            const hasKeyword = PATTERNS.title.some(keyword =>
              text.toLowerCase().includes(keyword.toLowerCase())
            );

            if (hasKeyword) {
              candidates.push({
                text: text,
                score: calculateTitleScore(text, el)
              });
            }
          });
        }

        // Sort by score and return best
        candidates.sort((a, b) => b.score - a.score);
        return candidates.length > 0 ? candidates[0].text : null;
      }

      /**
       * Calculate title likelihood score
       */
      function calculateTitleScore(text, element) {
        let score = 0;

        // Keywords boost
        const keywordCount = PATTERNS.title.filter(k =>
          text.toLowerCase().includes(k.toLowerCase())
        ).length;
        score += keywordCount * 20;

        // Class hints
        const classes = element.className.toLowerCase();
        if (classes.includes('title')) score += 30;
        if (classes.includes('position')) score += 30;
        if (classes.includes('role')) score += 25;
        if (classes.includes('job')) score += 25;

        // Length preference (not too short, not too long)
        if (text.length >= 10 && text.length <= 60) score += 15;

        // Penalty for common non-title patterns
        if (/\\d{4}/.test(text)) score -= 20; // Years
        if (/@/.test(text)) score -= 50; // Email

        return score;
      }

      /**
       * Extract location from element
       */
      function extractLocation(element, excludeText = []) {
        const candidates = [];
        const excludeLower = excludeText.map(t => t.toLowerCase());

        // Look for location-like elements
        const locationSelectors = [
          '[class*="location"]', '[class*="city"]', '[class*="address"]',
          '[class*="geo"]', '[class*="place"]',
          'span', 'p', 'div'
        ];

        for (const selector of locationSelectors) {
          const elements = element.querySelectorAll(selector);
          elements.forEach(el => {
            const text = el.textContent.trim();
            if (text.length < 2 || text.length > 100) return;
            if (excludeLower.includes(text.toLowerCase())) return;

            // Check for location indicators
            const hasIndicator = PATTERNS.location.some(loc =>
              text.includes(loc)
            );

            // Check for city, state pattern
            const hasCityState = /[A-Z][a-z]+,\\s*[A-Z]{2}/.test(text);

            if (hasIndicator || hasCityState) {
              candidates.push({
                text: text,
                score: calculateLocationScore(text, el)
              });
            }
          });
        }

        candidates.sort((a, b) => b.score - a.score);
        return candidates.length > 0 ? candidates[0].text : null;
      }

      /**
       * Calculate location likelihood score
       */
      function calculateLocationScore(text, element) {
        let score = 0;

        // State/Country indicator
        const indicatorCount = PATTERNS.location.filter(loc =>
          text.includes(loc)
        ).length;
        score += indicatorCount * 15;

        // City, State pattern
        if (/[A-Z][a-z]+,\\s*[A-Z]{2}/.test(text)) score += 30;

        // Class hints
        const classes = element.className.toLowerCase();
        if (classes.includes('location')) score += 40;
        if (classes.includes('city')) score += 35;
        if (classes.includes('address')) score += 30;

        // Penalty for too much text
        if (text.length > 50) score -= 10;

        return score;
      }

      /**
       * Extract social links from element
       */
      function extractSocialLinks(element) {
        const links = [];

        const anchors = element.querySelectorAll('a[href]');
        anchors.forEach(anchor => {
          const href = anchor.getAttribute('href');
          if (!href) return;

          Object.entries(PATTERNS.social).forEach(([platform, pattern]) => {
            const match = href.match(pattern);
            if (match) {
              links.push({
                platform: platform,
                url: href,
                username: match[1]
              });
            }
          });
        });

        return links;
      }

      /**
       * Extract profile URL from element
       */
      function extractProfileUrl(element, pageUrl) {
        const anchors = element.querySelectorAll('a[href]');
        let bestUrl = null;
        let bestScore = 0;

        anchors.forEach(anchor => {
          const href = anchor.getAttribute('href');
          if (!href) return;

          // Skip social links
          const isSocial = Object.values(PATTERNS.social).some(p => p.test(href));
          if (isSocial) return;

          // Skip mailto/tel
          if (href.startsWith('mailto:') || href.startsWith('tel:')) return;

          // Score the link
          let score = 0;

          // URL patterns that suggest profile pages
          if (/\\/profile\\//i.test(href)) score += 40;
          if (/\\/people\\//i.test(href)) score += 40;
          if (/\\/user\\//i.test(href)) score += 35;
          if (/\\/staff\\//i.test(href)) score += 35;
          if (/\\/member\\//i.test(href)) score += 30;
          if (/\\/attorney\\//i.test(href)) score += 40;
          if (/\\/bio\\//i.test(href)) score += 35;

          // Class/text hints
          const text = anchor.textContent.toLowerCase();
          if (text.includes('view profile')) score += 30;
          if (text.includes('read more')) score += 20;
          if (text.includes('learn more')) score += 15;

          // Prefer links that wrap the card or name
          if (anchor.closest('[class*="name"]')) score += 25;

          if (score > bestScore) {
            bestScore = score;
            bestUrl = href;
          }
        });

        // Resolve relative URLs
        if (bestUrl && !bestUrl.startsWith('http')) {
          try {
            bestUrl = new URL(bestUrl, pageUrl).href;
          } catch (e) {
            // Keep as-is
          }
        }

        return bestUrl;
      }

      /**
       * Extract name using proximity to email
       */
      function extractName(element, email) {
        // Strategy 1: Look for name-specific elements
        const nameSelectors = [
          '[class*="name"]', '[class*="person"]', '[class*="author"]',
          'h1', 'h2', 'h3', 'h4', 'h5', 'strong', 'b'
        ];

        for (const selector of nameSelectors) {
          const candidates = element.querySelectorAll(selector);
          for (const candidate of candidates) {
            const text = candidate.textContent.trim();
            if (isValidNameCandidate(text) && !text.includes('@')) {
              // Make sure it's not a title
              const hasTitle = PATTERNS.title.some(t =>
                text.toLowerCase().includes(t.toLowerCase())
              );
              if (!hasTitle || text.split(' ').length <= 3) {
                return cleanName(text);
              }
            }
          }
        }

        // Strategy 2: Proximity to email (if email found)
        if (email) {
          const emailElement = findEmailElement(element, email);
          if (emailElement) {
            const nearbyName = findNameNearEmail(element, emailElement);
            if (nearbyName) return cleanName(nearbyName);
          }
        }

        // Strategy 3: First reasonable text that looks like a name
        const allText = [];
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        while (walker.nextNode()) {
          const text = walker.currentNode.textContent.trim();
          if (text && isValidNameCandidate(text) && !text.includes('@')) {
            // Check it's not clearly a title/location
            const hasTitle = PATTERNS.title.some(t =>
              text.toLowerCase().includes(t.toLowerCase())
            );
            const hasLocation = PATTERNS.location.some(l => text.includes(l));

            if (!hasTitle && !hasLocation) {
              allText.push(text);
            }
          }
        }

        // Return first candidate that looks like a name (2-4 words)
        for (const text of allText) {
          const words = text.split(/\\s+/);
          if (words.length >= 2 && words.length <= 4) {
            return cleanName(text);
          }
        }

        return allText.length > 0 ? cleanName(allText[0]) : null;
      }

      /**
       * Find element containing specific email
       */
      function findEmailElement(container, email) {
        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        while (walker.nextNode()) {
          if (walker.currentNode.textContent.includes(email)) {
            return walker.currentNode.parentElement;
          }
        }

        return null;
      }

      /**
       * Find name near email element using proximity
       */
      function findNameNearEmail(container, emailElement) {
        const emailRect = emailElement.getBoundingClientRect();
        const candidates = [];

        // Check nearby text elements
        const textElements = container.querySelectorAll('*');
        textElements.forEach(el => {
          const text = el.textContent.trim();
          if (!isValidNameCandidate(text)) return;
          if (text.includes('@')) return;

          const rect = el.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(rect.x - emailRect.x, 2) +
            Math.pow(rect.y - emailRect.y, 2)
          );

          if (distance < ${this.NAME_CONTEXT_WINDOW}) {
            candidates.push({ text, distance });
          }
        });

        // Return closest candidate
        candidates.sort((a, b) => a.distance - b.distance);
        return candidates.length > 0 ? candidates[0].text : null;
      }

      // ===========================
      // MAIN EXTRACTION FUNCTION
      // ===========================

      /**
       * Extract all fields from a card element
       */
      function extractFields(element, pageUrl) {
        const data = {};

        // Extract email first (anchor for name search)
        const emails = extractEmails(element);
        data.email = emails.length > 0 ? emails[0] : null;
        data.allEmails = emails;

        // Extract name using email proximity
        data.name = extractName(element, data.email);

        // Extract phones
        const phones = extractPhones(element);
        data.phone = phones.length > 0 ? phones[0] : null;
        data.allPhones = phones;

        // Extract title and location (exclude name from search)
        const excludeText = [data.name, data.email].filter(Boolean);
        data.title = extractTitle(element, excludeText);
        data.location = extractLocation(element, excludeText);

        // Extract links
        data.profileUrl = extractProfileUrl(element, pageUrl);
        data.socialLinks = extractSocialLinks(element);

        // Calculate confidence
        data.confidence = calculateConfidence(data);

        return data;
      }

      /**
       * Calculate extraction confidence
       */
      function calculateConfidence(data) {
        let score = 0;

        if (data.email) score += 35;
        if (data.name) score += 30;
        if (data.phone) score += 15;
        if (data.title) score += 10;
        if (data.profileUrl) score += 5;
        if (data.location) score += 5;

        return Math.min(100, score);
      }

      /**
       * Extract from reference card (selected by user)
       */
      function extractFromSelection(selectionBox, pageUrl) {
        const centerX = selectionBox.x + selectionBox.width / 2;
        const centerY = selectionBox.y + selectionBox.height / 2;

        const element = document.elementFromPoint(
          centerX - window.scrollX,
          centerY - window.scrollY
        );

        if (!element) {
          return { success: false, error: 'No element at selection' };
        }

        // Walk up to find container
        let current = element;
        for (let i = 0; i < 5 && current && current !== document.body; i++) {
          const rect = current.getBoundingClientRect();
          const overlap = calculateOverlap(rect, selectionBox);
          if (overlap > 0.5) {
            const data = extractFields(current, pageUrl);
            return { success: true, data: data };
          }
          current = current.parentElement;
        }

        // Fallback to clicked element
        const data = extractFields(element, pageUrl);
        return { success: true, data: data };
      }

      /**
       * Calculate rectangle overlap
       */
      function calculateOverlap(rect1, rect2) {
        const x1 = Math.max(rect1.left, rect2.x);
        const y1 = Math.max(rect1.top, rect2.y);
        const x2 = Math.min(rect1.right, rect2.x + rect2.width);
        const y2 = Math.min(rect1.bottom, rect2.y + rect2.height);

        if (x2 <= x1 || y2 <= y1) return 0;

        const intersection = (x2 - x1) * (y2 - y1);
        const area1 = rect1.width * rect1.height;

        return intersection / area1;
      }

      // Expose functions
      window.__fieldExtractor_extractFields = extractFields;
      window.__fieldExtractor_extractFromSelection = extractFromSelection;

      return { ready: true };
    })();
    `;
  }

  /**
   * Extract fields from a selection
   * @param {Object} page - Puppeteer page instance
   * @param {Object} selectionBox - {x, y, width, height}
   * @returns {Promise<Object>} - Extracted data
   */
  async extractFromSelection(page, selectionBox) {
    this.logger.info('[SmartFieldExtractor] Extracting from selection');

    try {
      // Inject extractor code
      await page.evaluate(this.getExtractorCode());

      const pageUrl = page.url();

      // Extract fields
      const result = await page.evaluate((box, url) => {
        return window.__fieldExtractor_extractFromSelection(box, url);
      }, selectionBox, pageUrl);

      if (!result.success) {
        this.logger.error(`[SmartFieldExtractor] Failed: ${result.error}`);
      }

      return result;

    } catch (error) {
      this.logger.error(`[SmartFieldExtractor] Error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract fields from multiple card elements
   * @param {Object} page - Puppeteer page instance
   * @param {Array} boxes - Array of bounding boxes
   * @param {number} limit - Maximum cards to extract
   * @returns {Promise<Array>} - Array of extracted data
   */
  async extractFromCards(page, boxes, limit = 100) {
    this.logger.info(`[SmartFieldExtractor] Extracting from ${boxes.length} cards`);

    try {
      // Inject extractor code
      await page.evaluate(this.getExtractorCode());

      const pageUrl = page.url();

      // Extract from all cards
      const results = await page.evaluate((boxes, url, limit) => {
        const extracted = [];

        for (let i = 0; i < Math.min(boxes.length, limit); i++) {
          const box = boxes[i];
          const centerX = box.x + box.width / 2;
          const centerY = box.y + box.height / 2;

          const element = document.elementFromPoint(
            centerX - window.scrollX,
            centerY - window.scrollY
          );

          if (element) {
            // Find container
            let container = element;
            for (let j = 0; j < 5 && container && container !== document.body; j++) {
              const rect = container.getBoundingClientRect();
              if (rect.width >= box.width * 0.8 && rect.height >= box.height * 0.8) {
                break;
              }
              container = container.parentElement;
            }

            const data = window.__fieldExtractor_extractFields(container || element, url);
            data.cardIndex = i;
            data.box = box;
            extracted.push(data);
          }
        }

        return extracted;
      }, boxes, pageUrl, limit);

      this.logger.info(`[SmartFieldExtractor] Extracted ${results.length} cards`);

      return results;

    } catch (error) {
      this.logger.error(`[SmartFieldExtractor] Error: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate field extraction rules for config
   * @param {Object} previewData - Preview extraction data
   * @returns {Object} - Field extraction configuration
   */
  generateExtractionRules(previewData) {
    const rules = {
      strategy: 'smart',
      contextWindow: this.NAME_CONTEXT_WINDOW,
      fields: {
        name: {
          required: true,
          selectors: ['[class*="name"]', 'h1', 'h2', 'h3', 'h4', 'strong'],
          validation: 'name'
        },
        email: {
          required: true,
          pattern: 'email',
          includeMailto: true
        },
        phone: {
          required: false,
          pattern: 'phone',
          includeTel: true,
          normalize: true
        },
        title: {
          required: false,
          selectors: ['[class*="title"]', '[class*="position"]', '[class*="role"]'],
          keywords: ['CEO', 'Director', 'Manager', 'Engineer', 'Partner', 'Attorney']
        },
        location: {
          required: false,
          selectors: ['[class*="location"]', '[class*="city"]', '[class*="address"]']
        },
        profileUrl: {
          required: false,
          urlPatterns: ['/profile/', '/people/', '/attorney/', '/staff/', '/bio/']
        },
        socialLinks: {
          required: false,
          platforms: ['linkedin', 'twitter', 'facebook', 'github']
        }
      }
    };

    // Add any detected custom patterns
    if (previewData && previewData.otherFields) {
      rules.fields.custom = previewData.otherFields.map(f => ({
        label: f.label,
        selector: f.selector
      }));
    }

    return rules;
  }
}

module.exports = SmartFieldExtractor;
