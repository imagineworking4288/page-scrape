/**
 * Profile Extractor
 *
 * Extracts contact data from profile pages using multiple strategies:
 * 1. Semantic HTML (h1.name, .title, .contact)
 * 2. Mailto/tel links (href="mailto:", href="tel:")
 * 3. Label-based extraction ("Email:", "Phone:", "Office:")
 * 4. Structured data (JSON-LD, microdata)
 * 5. Domain-aware email extraction with name matching
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
   * Safe logger helper - checks if logger and method exist
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Message to log
   */
  log(level, message) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message);
    } else if (this.logger && typeof this.logger.info === 'function') {
      // Fallback to info if specific level not available
      this.logger.info(message);
    }
  }

  /**
   * Extract all available data from a profile page
   * @param {string} profileUrl - URL of the profile page
   * @param {string[]} fieldsToExtract - Optional list of fields to extract
   * @returns {Object} - { fields, success, error }
   */
  async extractFromProfile(profileUrl, fieldsToExtract = null) {
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
      this.log('debug', `[ProfileExtractor] Navigating to: ${profileUrl}`);
      await this.browserManager.navigate(profileUrl);

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Extract all fields
      const fields = await this.extractAllFields(page, profileUrl, fieldsToExtract);

      return {
        fields,
        success: true,
        error: null
      };
    } catch (error) {
      this.log('warn', `[ProfileExtractor] Extraction failed for ${profileUrl}: ${error.message}`);

      return {
        fields: {},
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract domain from profile URL
   * @param {string} url - Profile URL
   * @returns {string|null} - Domain (e.g., "sullcrom.com")
   */
  extractDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate email name variations from full name
   * @param {string} name - Full name (e.g., "Arthur S. Adler")
   * @returns {string[]} - Name variations for email matching
   */
  generateNameVariations(name) {
    if (!name || typeof name !== 'string') return [];

    // Clean name: remove title suffixes, special chars
    const cleaned = name.replace(/\b(Partner|Associate|Counsel|Of Counsel|Senior Partner|Managing Partner)\b/gi, '')
      .replace(/[^a-zA-Z\s]/g, '')
      .trim();

    const parts = cleaned.split(/\s+/).filter(p => p.length > 0);

    if (parts.length < 2) return [cleaned.toLowerCase()];

    const firstName = parts[0].toLowerCase();
    const lastName = parts[parts.length - 1].toLowerCase();
    const middleInitial = parts.length > 2 ? parts[1][0].toLowerCase() : '';

    // Generate common email formats
    const variations = [
      `${firstName}.${lastName}`,        // arthur.adler
      `${firstName}${lastName}`,         // arthuradler
      `${firstName[0]}${lastName}`,      // aadler
      `${lastName}`,                     // adler
      `${firstName}`,                    // arthur
    ];

    // Add middle initial variations if available
    if (middleInitial) {
      variations.push(`${firstName}.${middleInitial}.${lastName}`); // arthur.s.adler
      variations.push(`${firstName[0]}${middleInitial}${lastName}`); // asadler
    }

    return variations.filter((v, i, arr) => arr.indexOf(v) === i); // unique
  }

  /**
   * Validate email and check for fake patterns
   * @param {string} email - Email to validate
   * @param {string} expectedDomain - Expected domain (e.g., "sullcrom.com")
   * @returns {boolean}
   */
  isValidBusinessEmail(email, expectedDomain = null) {
    if (!email || typeof email !== 'string') return false;

    const lower = email.toLowerCase();

    // Reject fake/test emails
    const fakePatterns = [
      'test@', 'example@', 'demo@', 'noreply@', 'info@',
      'contact@', 'admin@', 'webmaster@', 'postmaster@',
      'support@', 'help@', 'sales@', 'marketing@',
      '@example.com', '@test.com', '@localhost', '@domain.com',
      '@example.org', '@fake.com'
    ];

    if (fakePatterns.some(pattern => lower.includes(pattern))) {
      return false;
    }

    // Basic email validation
    if (!this.isValidEmail(email)) return false;

    // If domain provided, check it matches
    if (expectedDomain) {
      return lower.endsWith(`@${expectedDomain}`);
    }

    return true;
  }

  /**
   * Extract all available fields from the page
   * @param {Object} page - Puppeteer page
   * @param {string} profileUrl - Profile URL for logging and domain extraction
   * @param {string[]} fieldsToExtract - Optional list of fields to extract
   * @returns {Object} - Extracted fields
   */
  async extractAllFields(page, profileUrl, fieldsToExtract = null) {
    const fields = {};

    // Default to core fields if not specified
    const fieldsToProcess = fieldsToExtract || ['name', 'email', 'phone', 'location', 'title'];

    // Extract structured data first (always useful)
    const structuredData = await this.extractStructuredData(page);
    if (structuredData) {
      fields.structuredData = structuredData;
    }

    // Extract only requested fields
    if (fieldsToProcess.includes('name')) {
      fields.name = await this.extractName(page);
    }
    if (fieldsToProcess.includes('email')) {
      // Pass profile URL for domain-aware extraction, and name for matching
      fields.email = await this.extractEmail(page, profileUrl, fields.name);
    }
    if (fieldsToProcess.includes('phone')) {
      fields.phone = await this.extractPhone(page);
    }
    if (fieldsToProcess.includes('title')) {
      fields.title = await this.extractTitle(page);
    }
    if (fieldsToProcess.includes('location')) {
      fields.location = await this.extractLocation(page);
    }

    // Only extract additional fields if explicitly requested
    if (fieldsToProcess.includes('bio')) {
      fields.bio = await this.extractBio(page);
    }
    if (fieldsToProcess.includes('education')) {
      fields.education = await this.extractEducation(page);
    }
    if (fieldsToProcess.includes('practiceAreas')) {
      fields.practiceAreas = await this.extractPracticeAreas(page);
    }
    if (fieldsToProcess.includes('barAdmissions')) {
      fields.barAdmissions = await this.extractBarAdmissions(page);
    }

    // Log extraction summary
    const extractedCount = Object.values(fields).filter(v => v !== null && v !== undefined).length;
    this.log('debug', `[ProfileExtractor] Extracted ${extractedCount} fields from ${profileUrl}`);

    return fields;
  }

  /**
   * Extract email from profile page (domain-aware with name matching)
   * @param {Object} page - Puppeteer page
   * @param {string} profileUrl - Profile URL for domain extraction
   * @param {string} extractedName - Already extracted name for matching
   * @returns {string|null}
   */
  async extractEmail(page, profileUrl = null, extractedName = null) {
    try {
      // Get expected domain from profile URL
      const domain = profileUrl ? this.extractDomainFromUrl(profileUrl) : null;

      // Strategy 1: Find mailto links with matching domain
      const mailtoEmail = await page.evaluate((expectedDomain) => {
        const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));

        for (const link of mailtoLinks) {
          const href = link.getAttribute('href') || '';
          const email = href.replace('mailto:', '').split('?')[0].trim();
          if (expectedDomain && email.toLowerCase().endsWith(`@${expectedDomain}`)) {
            return email;
          }
        }

        // If no domain match, return first mailto
        if (mailtoLinks.length > 0) {
          const href = mailtoLinks[0].getAttribute('href') || '';
          return href.replace('mailto:', '').split('?')[0].trim();
        }

        return null;
      }, domain);

      if (mailtoEmail && this.isValidBusinessEmail(mailtoEmail, domain)) {
        return mailtoEmail.toLowerCase();
      }

      // Strategy 2: Search page text for domain-specific email with name matching
      if (domain) {
        // Use extracted name or try to extract it
        const name = extractedName || await this.extractName(page);
        const nameVariations = this.generateNameVariations(name);

        const domainEmail = await page.evaluate((expectedDomain, variations) => {
          const text = document.body.innerText;

          // Find all emails in text
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const emails = text.match(emailRegex) || [];

          // Filter to domain-specific emails
          const domainEmails = emails.filter(e =>
            e.toLowerCase().endsWith(`@${expectedDomain}`)
          );

          // Try to match with name variations
          for (const variation of variations) {
            const match = domainEmails.find(e =>
              e.toLowerCase().includes(variation)
            );
            if (match) return match;
          }

          // Return first domain email if no name match
          return domainEmails[0] || null;
        }, domain, nameVariations);

        if (domainEmail && this.isValidBusinessEmail(domainEmail, domain)) {
          return domainEmail.toLowerCase();
        }
      }

      // Strategy 3: Semantic HTML (with domain validation)
      const semanticEmail = await page.evaluate((expectedDomain) => {
        const selectors = [
          '.email', '.contact-email', '[class*="email"]',
          '[data-email]', '[itemprop="email"]'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            const text = el.textContent || el.getAttribute('data-email') || '';
            const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (match) {
              const email = match[0];
              // If domain expected, validate it matches
              if (expectedDomain && !email.toLowerCase().endsWith(`@${expectedDomain}`)) {
                continue; // Skip non-matching domain
              }
              return email;
            }
          }
        }
        return null;
      }, domain);

      if (semanticEmail && this.isValidBusinessEmail(semanticEmail, domain)) {
        return semanticEmail.toLowerCase();
      }

      // Strategy 4: Label-based extraction (with domain validation)
      const labelEmail = await page.evaluate((expectedDomain) => {
        const text = document.body.innerText;
        const labelMatch = text.match(/(?:Email|E-mail)\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (labelMatch) {
          const email = labelMatch[1];
          if (expectedDomain && !email.toLowerCase().endsWith(`@${expectedDomain}`)) {
            return null; // Reject non-matching domain
          }
          return email;
        }
        return null;
      }, domain);

      if (labelEmail && this.isValidBusinessEmail(labelEmail, domain)) {
        return labelEmail.toLowerCase();
      }

      return null;
    } catch (error) {
      this.log('debug', `[ProfileExtractor] Email extraction error: ${error.message}`);
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
      this.log('debug', `[ProfileExtractor] Phone extraction error: ${error.message}`);
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
      this.log('debug', `[ProfileExtractor] Name extraction error: ${error.message}`);
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
      this.log('debug', `[ProfileExtractor] Title extraction error: ${error.message}`);
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
      this.log('debug', `[ProfileExtractor] Location extraction error: ${error.message}`);
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
      this.log('debug', `[ProfileExtractor] Bio extraction error: ${error.message}`);
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
      this.log('debug', `[ProfileExtractor] Education extraction error: ${error.message}`);
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
      this.log('debug', `[ProfileExtractor] Practice areas extraction error: ${error.message}`);
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
      this.log('debug', `[ProfileExtractor] Bar admissions extraction error: ${error.message}`);
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
      this.log('debug', `[ProfileExtractor] Structured data extraction error: ${error.message}`);
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
