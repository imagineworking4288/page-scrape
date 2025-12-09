/**
 * Profile Extractor
 *
 * Extracts contact data from profile pages using multiple strategies:
 * 1. Semantic HTML (h1.name, .title, .contact)
 * 2. Mailto/tel links (href="mailto:", href="tel:")
 * 3. Label-based extraction ("Email:", "Phone:", "Office:")
 * 4. Structured data (JSON-LD, microdata)
 */

class ProfileExtractor {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;

    // Extraction timeout (30 seconds per profile)
    this.timeout = 30000;

    // Email regex pattern
    this.emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    // Phone regex patterns
    this.phonePatterns = [
      /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g
    ];
  }

  /**
   * Extract all available data from a profile page
   * @param {string} profileUrl - URL of the profile page
   * @returns {Object} - { fields, success, error }
   */
  async extractFromProfile(profileUrl) {
    if (!profileUrl) {
      return {
        fields: {},
        success: false,
        error: 'No profile URL provided'
      };
    }

    try {
      // Wait before request (rate limiting)
      await this.rateLimiter.waitBeforeRequest();

      const page = this.browserManager.getPage();

      // Navigate to profile page
      this.logger.debug(`[ProfileExtractor] Navigating to: ${profileUrl}`);
      await this.browserManager.navigate(profileUrl);

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Extract all fields
      const fields = await this.extractAllFields(page, profileUrl);

      return {
        fields,
        success: true,
        error: null
      };
    } catch (error) {
      this.logger.warn(`[ProfileExtractor] Extraction failed for ${profileUrl}: ${error.message}`);

      return {
        fields: {},
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract all available fields from the page
   * @param {Object} page - Puppeteer page
   * @param {string} profileUrl - Profile URL for logging
   * @returns {Object} - Extracted fields
   */
  async extractAllFields(page, profileUrl) {
    const fields = {};

    // Extract structured data first (highest priority)
    const structuredData = await this.extractStructuredData(page);
    if (structuredData) {
      fields.structuredData = structuredData;
    }

    // Extract individual fields
    fields.name = await this.extractName(page);
    fields.email = await this.extractEmail(page);
    fields.phone = await this.extractPhone(page);
    fields.title = await this.extractTitle(page);
    fields.location = await this.extractLocation(page);
    fields.bio = await this.extractBio(page);
    fields.education = await this.extractEducation(page);
    fields.practiceAreas = await this.extractPracticeAreas(page);
    fields.barAdmissions = await this.extractBarAdmissions(page);

    // Log extraction summary
    const extractedCount = Object.values(fields).filter(v => v !== null && v !== undefined).length;
    this.logger.debug(`[ProfileExtractor] Extracted ${extractedCount} fields from ${profileUrl}`);

    return fields;
  }

  /**
   * Extract email from profile page
   * @param {Object} page - Puppeteer page
   * @returns {string|null}
   */
  async extractEmail(page) {
    try {
      // Strategy 1: Mailto links
      const mailtoEmail = await page.evaluate(() => {
        const mailtoLink = document.querySelector('a[href^="mailto:"]');
        if (mailtoLink) {
          const href = mailtoLink.getAttribute('href');
          return href.replace('mailto:', '').split('?')[0].trim();
        }
        return null;
      });

      if (mailtoEmail && this.isValidEmail(mailtoEmail)) {
        return mailtoEmail.toLowerCase();
      }

      // Strategy 2: Semantic HTML
      const semanticEmail = await page.evaluate(() => {
        const selectors = [
          '.email', '.contact-email', '[class*="email"]',
          '[data-email]', '[itemprop="email"]'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            const text = el.textContent || el.getAttribute('data-email') || '';
            const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (match) return match[0];
          }
        }
        return null;
      });

      if (semanticEmail && this.isValidEmail(semanticEmail)) {
        return semanticEmail.toLowerCase();
      }

      // Strategy 3: Label-based extraction
      const labelEmail = await page.evaluate(() => {
        const text = document.body.innerText;
        const labelMatch = text.match(/(?:Email|E-mail)\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        return labelMatch ? labelMatch[1] : null;
      });

      if (labelEmail && this.isValidEmail(labelEmail)) {
        return labelEmail.toLowerCase();
      }

      return null;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Email extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract phone from profile page
   * @param {Object} page - Puppeteer page
   * @returns {string|null}
   */
  async extractPhone(page) {
    try {
      // Strategy 1: Tel links
      const telPhone = await page.evaluate(() => {
        const telLink = document.querySelector('a[href^="tel:"]');
        if (telLink) {
          const href = telLink.getAttribute('href');
          return href.replace('tel:', '').trim();
        }
        return null;
      });

      if (telPhone) {
        return this.normalizePhone(telPhone);
      }

      // Strategy 2: Semantic HTML
      const semanticPhone = await page.evaluate(() => {
        const selectors = [
          '.phone', '.tel', '.contact-phone', '[class*="phone"]',
          '[data-phone]', '[itemprop="telephone"]'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            const text = el.textContent || el.getAttribute('data-phone') || '';
            const match = text.match(/\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
            if (match) return match[0];
          }
        }
        return null;
      });

      if (semanticPhone) {
        return this.normalizePhone(semanticPhone);
      }

      // Strategy 3: Label-based extraction
      const labelPhone = await page.evaluate(() => {
        const text = document.body.innerText;
        const labelMatch = text.match(/(?:Phone|Tel|Telephone)\s*:?\s*(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
        return labelMatch ? labelMatch[1] : null;
      });

      if (labelPhone) {
        return this.normalizePhone(labelPhone);
      }

      return null;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Phone extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract name from profile page
   * @param {Object} page - Puppeteer page
   * @returns {string|null}
   */
  async extractName(page) {
    try {
      const name = await page.evaluate(() => {
        // Strategy 1: Semantic selectors
        const selectors = [
          'h1.name', 'h1.lawyer-name', 'h1.attorney-name', 'h1.profile-name',
          '.profile-header h1', '.bio-header h1', '.person-name',
          '[itemprop="name"]', 'h1[class*="name"]'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim().length > 0) {
            return el.textContent.trim();
          }
        }

        // Strategy 2: First h1
        const h1 = document.querySelector('h1');
        if (h1 && h1.textContent.trim().length > 2 && h1.textContent.trim().length < 100) {
          return h1.textContent.trim();
        }

        return null;
      });

      return name;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Name extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract title/position from profile page
   * @param {Object} page - Puppeteer page
   * @returns {string|null}
   */
  async extractTitle(page) {
    try {
      const title = await page.evaluate(() => {
        // Strategy 1: Semantic selectors
        const selectors = [
          '.title', '.job-title', '.position', '.role',
          '[itemprop="jobTitle"]', '[class*="title"]:not(title)',
          '.profile-header .subtitle', '.bio-header .title'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim().length > 0 && el.textContent.trim().length < 100) {
            return el.textContent.trim();
          }
        }

        // Strategy 2: Look for title after h1
        const h1 = document.querySelector('h1');
        if (h1) {
          let sibling = h1.nextElementSibling;
          while (sibling && sibling.tagName !== 'H1') {
            const text = sibling.textContent.trim();
            // Check if it looks like a title (short, contains keywords)
            if (text.length > 2 && text.length < 50) {
              const titleWords = ['partner', 'associate', 'counsel', 'chair', 'director'];
              if (titleWords.some(w => text.toLowerCase().includes(w))) {
                return text;
              }
            }
            sibling = sibling.nextElementSibling;
          }
        }

        return null;
      });

      return title;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Title extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract location/office from profile page
   * @param {Object} page - Puppeteer page
   * @returns {string|null}
   */
  async extractLocation(page) {
    try {
      const location = await page.evaluate(() => {
        const selectors = [
          '.location', '.office', '[class*="location"]', '[class*="office"]',
          '[itemprop="addressLocality"]', '[itemprop="workLocation"]'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim().length > 0) {
            return el.textContent.trim();
          }
        }

        // Label-based extraction
        const text = document.body.innerText;
        const labelMatch = text.match(/(?:Office|Location)\s*:?\s*([A-Z][a-zA-Z\s,]+)/);
        return labelMatch ? labelMatch[1].trim() : null;
      });

      return location;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Location extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract bio/description from profile page
   * @param {Object} page - Puppeteer page
   * @returns {string|null}
   */
  async extractBio(page) {
    try {
      const bio = await page.evaluate(() => {
        const selectors = [
          '.bio', '.biography', '.about', '.description', '.profile-description',
          '[itemprop="description"]', '.profile-content p', '.bio-content'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim().length > 50) {
            // Limit to first 1000 characters
            return el.textContent.trim().substring(0, 1000);
          }
        }

        // Look for first substantial paragraph
        const paragraphs = document.querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.textContent.trim();
          if (text.length > 100 && text.length < 2000) {
            // Skip if it looks like navigation or legal text
            if (!text.includes('Copyright') && !text.includes('Privacy Policy')) {
              return text.substring(0, 1000);
            }
          }
        }

        return null;
      });

      return bio;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Bio extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract education from profile page
   * @param {Object} page - Puppeteer page
   * @returns {string[]|null}
   */
  async extractEducation(page) {
    try {
      const education = await page.evaluate(() => {
        const selectors = [
          '.education', '.credentials', '[class*="education"]',
          'section:has(h2:contains("Education"))', 'div:has(h3:contains("Education"))'
        ];

        // Try semantic selectors
        for (const selector of selectors) {
          try {
            const el = document.querySelector(selector);
            if (el) {
              const items = el.querySelectorAll('li');
              if (items.length > 0) {
                return Array.from(items).map(li => li.textContent.trim()).filter(t => t.length > 0);
              }
              // If no list items, get all text
              const text = el.textContent.trim();
              if (text.length > 0) {
                return text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
              }
            }
          } catch (e) {
            // Selector not supported, continue
          }
        }

        // Look for education section by header
        const headers = document.querySelectorAll('h2, h3, h4');
        for (const header of headers) {
          if (header.textContent.toLowerCase().includes('education')) {
            const parent = header.parentElement;
            if (parent) {
              const items = parent.querySelectorAll('li');
              if (items.length > 0) {
                return Array.from(items).map(li => li.textContent.trim()).filter(t => t.length > 0);
              }
            }
          }
        }

        return null;
      });

      return education;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Education extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract practice areas from profile page
   * @param {Object} page - Puppeteer page
   * @returns {string[]|null}
   */
  async extractPracticeAreas(page) {
    try {
      const practiceAreas = await page.evaluate(() => {
        const selectors = [
          '.practice-areas', '.practices', '[class*="practice"]',
          '.areas-of-focus', '.expertise'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            const items = el.querySelectorAll('li, a');
            if (items.length > 0) {
              return Array.from(items).map(item => item.textContent.trim()).filter(t => t.length > 0 && t.length < 100);
            }
          }
        }

        // Look for practice areas section by header
        const headers = document.querySelectorAll('h2, h3, h4');
        for (const header of headers) {
          const headerText = header.textContent.toLowerCase();
          if (headerText.includes('practice') || headerText.includes('areas') || headerText.includes('expertise')) {
            const parent = header.parentElement;
            if (parent) {
              const items = parent.querySelectorAll('li, a');
              if (items.length > 0) {
                return Array.from(items).map(item => item.textContent.trim()).filter(t => t.length > 0 && t.length < 100);
              }
            }
          }
        }

        return null;
      });

      return practiceAreas;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Practice areas extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract bar admissions from profile page
   * @param {Object} page - Puppeteer page
   * @returns {string[]|null}
   */
  async extractBarAdmissions(page) {
    try {
      const barAdmissions = await page.evaluate(() => {
        const selectors = [
          '.bar-admissions', '.admissions', '[class*="admission"]',
          '.credentials', '.licenses'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            const items = el.querySelectorAll('li');
            if (items.length > 0) {
              return Array.from(items).map(li => li.textContent.trim()).filter(t => t.length > 0);
            }
          }
        }

        // Look for bar admissions section by header
        const headers = document.querySelectorAll('h2, h3, h4');
        for (const header of headers) {
          const headerText = header.textContent.toLowerCase();
          if (headerText.includes('bar') || headerText.includes('admission') || headerText.includes('license')) {
            const parent = header.parentElement;
            if (parent) {
              const items = parent.querySelectorAll('li');
              if (items.length > 0) {
                return Array.from(items).map(li => li.textContent.trim()).filter(t => t.length > 0);
              }
            }
          }
        }

        return null;
      });

      return barAdmissions;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Bar admissions extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract structured data (JSON-LD, microdata) from profile page
   * @param {Object} page - Puppeteer page
   * @returns {Object|null}
   */
  async extractStructuredData(page) {
    try {
      const structuredData = await page.evaluate(() => {
        // Try JSON-LD
        const ldScript = document.querySelector('script[type="application/ld+json"]');
        if (ldScript) {
          try {
            const data = JSON.parse(ldScript.textContent);
            // Handle arrays
            const person = Array.isArray(data) ?
              data.find(d => d['@type'] === 'Person') :
              (data['@type'] === 'Person' ? data : null);

            if (person) {
              return {
                name: person.name,
                email: person.email,
                telephone: person.telephone,
                jobTitle: person.jobTitle,
                description: person.description,
                worksFor: person.worksFor?.name,
                alumniOf: person.alumniOf
              };
            }
          } catch (e) {
            // JSON parse error
          }
        }

        // Try microdata
        const itemscope = document.querySelector('[itemtype*="Person"]');
        if (itemscope) {
          return {
            name: itemscope.querySelector('[itemprop="name"]')?.textContent?.trim(),
            email: itemscope.querySelector('[itemprop="email"]')?.textContent?.trim(),
            telephone: itemscope.querySelector('[itemprop="telephone"]')?.textContent?.trim(),
            jobTitle: itemscope.querySelector('[itemprop="jobTitle"]')?.textContent?.trim(),
            description: itemscope.querySelector('[itemprop="description"]')?.textContent?.trim()
          };
        }

        return null;
      });

      return structuredData;
    } catch (error) {
      this.logger.debug(`[ProfileExtractor] Structured data extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean}
   */
  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return pattern.test(email.trim());
  }

  /**
   * Normalize phone to standard format
   * @param {string} phone - Phone to normalize
   * @returns {string}
   */
  normalizePhone(phone) {
    if (!phone) return null;

    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Must have at least 10 digits
    if (digits.length < 10) return phone;

    // Format as +1-XXX-XXX-XXXX
    if (digits.length === 10) {
      return `+1-${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+1-${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
    }

    return phone;
  }
}

module.exports = ProfileExtractor;
