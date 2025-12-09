/**
 * Select scraper using configurable text or coordinate markers.
 * Extracts contacts by selecting text between defined boundaries.
 */

const BaseScraper = require('./base-scraper');
const ConfigLoader = require('../config/config-loader');
const TextParser = require('../utils/text-parser');
const ContactExtractor = require('../utils/contact-extractor');

class SelectScraper extends BaseScraper {
  constructor(browserManager, rateLimiter, logger) {
    super(browserManager, rateLimiter, logger);
    this.configLoader = new ConfigLoader(logger);
    this.textParser = new TextParser(logger);
  }

  /**
   * Main scrape entry point
   * @param {string} url - Target URL
   * @param {number|null} limit - Max contacts to return
   * @param {boolean} keepPdf - Not used for select method, kept for API compatibility
   * @param {number|null} sourcePage - Page number (for pagination)
   * @param {string|null} sourceUrl - Source URL (for pagination)
   * @returns {array} - Array of contact objects
   */
  async scrape(url, limit = null, keepPdf = false, sourcePage = null, sourceUrl = null) {
    try {
      this.logger.info(`Starting select scrape of: ${url}`);

      // Load site configuration
      const config = this.configLoader.loadConfig(url);
      this.logger.info(`Using config for: ${config.name}`);

      // Get page
      const page = this.browserManager.getPage();

      // Navigate to URL
      this.logger.info('Navigating to URL...');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      this.logger.info('Page loaded');

      // Wait for initial page load
      await page.waitForTimeout(3000);

      // Scroll page to load lazy content
      if (config.scrollBehavior?.enabled) {
        await this.scrollPage(page, config.scrollBehavior);
      }

      // Find marker positions
      this.logger.info('Resolving marker positions...');
      const startPos = await this.findMarkerPosition(page, config.markers.start, 'start');
      const endPos = await this.findMarkerPosition(page, config.markers.end, 'end');

      this.logger.info(`Start position: y=${startPos.y}`);
      this.logger.info(`End position: y=${endPos.y}`);

      // Try DOM-based extraction first
      this.logger.info('Attempting DOM-based extraction...');
      let contacts = await this.extractContactsFromDOM(page, startPos, endPos, config);

      // Fall back to text-based extraction if DOM extraction fails or returns no results
      if (!contacts || contacts.length === 0) {
        this.logger.warn('DOM extraction failed or returned no results, falling back to text extraction');

        // Select text range
        this.logger.info('Selecting text range...');
        await this.selectRange(page, startPos, endPos);

        // Extract selected text
        const selectedText = await this.extractSelectedText(page);

        if (!selectedText || selectedText.length === 0) {
          this.logger.warn('No text selected');
          return [];
        }

        this.logger.info(`Selected ${selectedText.length} characters`);

        // Parse text into contacts
        contacts = this.textParser.parse(selectedText, config);
      }

      // Add domain classification and pagination metadata
      for (const contact of contacts) {
        const isBusiness = this.domainExtractor.isBusinessDomain(contact.domain);
        contact.domainType = isBusiness ? 'business' : 'personal';

        // Add pagination metadata if provided
        if (sourcePage !== null) {
          contact.sourcePage = sourcePage;
        }
        if (sourceUrl !== null) {
          contact.sourceUrl = sourceUrl;
        }
      }

      // Apply limit if specified
      const finalContacts = limit ? contacts.slice(0, limit) : contacts;

      this.logger.info(`Returning ${finalContacts.length} contacts`);
      return finalContacts;

    } catch (error) {
      this.logger.error(`Select scrape failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scroll page incrementally to load lazy content
   * @param {object} page - Puppeteer page
   * @param {object} scrollConfig - Scroll configuration
   */
  async scrollPage(page, scrollConfig) {
    const { scrollDelay, maxScrolls } = scrollConfig;

    this.logger.info(`Scrolling page (max ${maxScrolls} scrolls, ${scrollDelay}ms delay)...`);

    let scrollCount = 0;
    let previousHeight = 0;

    while (scrollCount < maxScrolls) {
      // Get current scroll height
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      // Check if page height changed
      if (currentHeight === previousHeight) {
        this.logger.info('No new content loaded, stopping scroll');
        break;
      }

      // Scroll down
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      // Wait for content to load
      await page.waitForTimeout(scrollDelay);

      previousHeight = currentHeight;
      scrollCount++;
    }

    this.logger.info(`Completed ${scrollCount} scrolls`);

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  }

  /**
   * Find marker position (routes to text or coordinate method)
   * @param {object} page - Puppeteer page
   * @param {object} marker - Marker configuration
   * @param {string} markerName - 'start' or 'end' for logging
   * @returns {object} - Position {x, y}
   */
  async findMarkerPosition(page, marker, markerName) {
    if (marker.type === 'text') {
      return await this.findTextMarker(page, marker.value, markerName);
    } else if (marker.type === 'coordinate') {
      return this.resolveCoordinateMarker(marker.value);
    } else {
      throw new Error(`Unknown marker type: ${marker.type}`);
    }
  }

  /**
   * Find text marker in page
   * @param {object} page - Puppeteer page
   * @param {string} text - Text to find
   * @param {string} markerName - 'start' or 'end' for logging
   * @returns {object} - Position {x, y}
   */
  async findTextMarker(page, text, markerName) {
    this.logger.info(`Finding ${markerName} text marker: "${text}"`);

    const position = await page.evaluate((searchText) => {
      // Use TreeWalker to find text nodes
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes(searchText)) {
          // Found the text, get its position
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();

          return {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY
          };
        }
      }

      return null;
    }, text);

    if (!position) {
      throw new Error(`${markerName} text marker not found: "${text}"`);
    }

    return position;
  }

  /**
   * Resolve coordinate marker
   * @param {object} coords - Coordinates {x, y}
   * @returns {object} - Position {x, y}
   */
  resolveCoordinateMarker(coords) {
    this.logger.info(`Using coordinate marker: x=${coords.x}, y=${coords.y}`);
    return { x: coords.x, y: coords.y };
  }

  /**
   * Select text range between start and end positions
   * Instead of selecting via Range, just extract text between Y coordinates
   * @param {object} page - Puppeteer page
   * @param {object} startPos - Start position {x, y}
   * @param {object} endPos - End position {x, y}
   */
  async selectRange(page, startPos, endPos) {
    // We'll extract text directly rather than using selection API
    // This is more reliable for programmatic extraction
    this.selectedText = await page.evaluate((start, end) => {
      const allTextNodes = [];

      // Use TreeWalker to find all text nodes in body
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.trim().length > 0) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          const y = rect.top + window.scrollY;

          allTextNodes.push({
            text: node.textContent,
            y: y
          });
        }
      }

      // Filter nodes between start and end Y positions
      const selectedNodes = allTextNodes.filter(node => {
        return node.y >= start.y && node.y <= end.y;
      });

      // Combine text from selected nodes
      return selectedNodes.map(n => n.text).join(' ');
    }, startPos, endPos);
  }

  /**
   * Extract selected text from page
   * @param {object} page - Puppeteer page
   * @returns {string} - Selected text
   */
  async extractSelectedText(page) {
    // Return the text that was stored during selectRange
    return this.selectedText || '';
  }

  /**
   * Extract contacts using DOM-based container detection
   * Uses universal extraction from contact-extractor.js for comprehensive email/phone/name detection
   * @param {object} page - Puppeteer page
   * @param {object} startPos - Start position {x, y}
   * @param {object} endPos - End position {x, y}
   * @param {object} config - Site configuration
   * @returns {array} - Array of contact objects or null if detection fails
   */
  async extractContactsFromDOM(page, startPos, endPos, config) {
    try {
      // Get base URL for profile URL normalization
      const baseUrl = await page.url();

      // Detect container pattern or use manual selector from config
      let containerSelector = config.selectors?.container;

      if (!containerSelector) {
        this.logger.info('No manual container selector, detecting pattern...');
        containerSelector = await this.detectContainerPattern(page, startPos, endPos);

        if (!containerSelector) {
          this.logger.warn('Container pattern detection failed');
          return null;
        }

        this.logger.info(`Detected container pattern: ${containerSelector}`);
      }

      // Get blacklist from text parser to pass to browser context
      const nameBlacklist = Array.from(this.textParser.NAME_BLACKLIST);

      // Get universal extraction code from contact-extractor
      const universalExtractionCode = ContactExtractor.getUniversalExtractionCode();

      // Extract contacts from containers using universal extraction
      const contacts = await page.evaluate((selector, start, end, baseUrl, configSelectors, profileUrlPatterns, blacklistArray, extractionCode) => {
        // Inject and execute universal extraction code
        eval(extractionCode);

        const containers = document.querySelectorAll(selector);
        const results = [];

        for (const container of containers) {
          // Check if container is within Y boundaries
          const rect = container.getBoundingClientRect();
          const y = rect.top + window.scrollY;

          if (y < start.y || y > end.y) {
            continue;
          }

          // Use universal extraction from contact-extractor.js
          const extracted = extractContactFromCard(container, {
            blacklist: new Set(blacklistArray),
            profilePatterns: profileUrlPatterns || []
          });

          // Skip containers without email
          if (!extracted.email) continue;

          // Override with config-specific selectors if provided
          if (configSelectors?.email) {
            const emailEl = container.querySelector(configSelectors.email);
            if (emailEl) {
              const href = emailEl.href || '';
              if (href.includes('mailto:')) {
                extracted.email = href.replace('mailto:', '').split('?')[0].toLowerCase();
              }
            }
          }

          if (configSelectors?.name) {
            const nameEl = container.querySelector(configSelectors.name);
            if (nameEl) {
              extracted.name = nameEl.textContent.trim();
            }
          }

          if (configSelectors?.phone) {
            const phoneEl = container.querySelector(configSelectors.phone);
            if (phoneEl) {
              const href = phoneEl.href || '';
              if (href.includes('tel:')) {
                const digits = href.replace('tel:', '').replace(/\D/g, '');
                if (digits.length === 10) {
                  extracted.phone = `+1-${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
                } else if (digits.length === 11 && digits[0] === '1') {
                  extracted.phone = `+${digits[0]}-${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
                }
              }
            }
          }

          if (configSelectors?.profileLink) {
            const profileLink = container.querySelector(configSelectors.profileLink);
            if (profileLink) {
              try {
                extracted.profileUrl = new URL(profileLink.href, baseUrl).href;
              } catch (e) {}
            }
          }

          // Normalize phone if present but not already normalized
          if (extracted.phone && !extracted.phone.startsWith('+')) {
            const digits = extracted.phone.replace(/\D/g, '');
            if (digits.length === 10) {
              extracted.phone = `+1-${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
            } else if (digits.length === 11 && digits[0] === '1') {
              extracted.phone = `+${digits[0]}-${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
            }
          }

          // Normalize profile URL
          if (extracted.profileUrl && !extracted.profileUrl.startsWith('http')) {
            try {
              extracted.profileUrl = new URL(extracted.profileUrl, baseUrl).href;
            } catch (e) {}
          }

          // Extract domain from email
          const domain = extracted.email.split('@')[1];

          results.push({
            name: extracted.name,
            email: extracted.email,
            phone: extracted.phone,
            phoneSource: extracted._extraction?.phoneSource || null,
            profileUrl: extracted.profileUrl,
            source: 'select-dom',
            confidence: extracted.confidence,
            domain: domain,
            domainType: null, // Will be set by DomainExtractor
            _extraction: extracted._extraction // Keep extraction metadata for debugging
          });
        }

        return results;
      }, containerSelector, startPos, endPos, baseUrl, config.selectors || {}, config.parsing?.profileUrlPatterns || [], nameBlacklist, universalExtractionCode);

      if (contacts.length === 0) {
        return null;
      }

      // Detect and flag shared phones
      this.detectSharedPhones(contacts);

      // Log extraction sources for debugging
      const emailSources = {};
      for (const contact of contacts) {
        const source = contact._extraction?.emailSource || 'unknown';
        emailSources[source] = (emailSources[source] || 0) + 1;
      }
      this.logger.info(`DOM extraction found ${contacts.length} contacts (email sources: ${JSON.stringify(emailSources)})`);

      return contacts;

    } catch (error) {
      this.logger.warn(`DOM extraction error: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect container pattern by analyzing email element ancestors
   * @param {object} page - Puppeteer page
   * @param {object} startPos - Start position {x, y}
   * @param {object} endPos - End position {x, y}
   * @returns {string|null} - CSS selector for container or null
   */
  async detectContainerPattern(page, startPos, endPos) {
    try {
      const pattern = await page.evaluate((start, end) => {
        // Find all mailto links within Y boundaries
        const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
        const validLinks = mailtoLinks.filter(link => {
          const rect = link.getBoundingClientRect();
          const y = rect.top + window.scrollY;
          return y >= start.y && y <= end.y;
        });

        if (validLinks.length < 2) {
          return null; // Need at least 2 contacts to detect pattern
        }

        // Analyze ancestor patterns
        const ancestorData = [];
        const maxLevel = 5;

        for (const link of validLinks) {
          let current = link.parentElement;
          let level = 0;

          const ancestors = [];

          while (current && level < maxLevel) {
            const hasTelLink = current.querySelector('a[href^="tel:"]') !== null;
            const tagName = current.tagName.toLowerCase();
            const classes = Array.from(current.classList).join(' ');

            ancestors.push({
              level: level,
              tagName: tagName,
              classes: classes,
              hasTelLink: hasTelLink,
              element: current
            });

            current = current.parentElement;
            level++;
          }

          ancestorData.push(ancestors);
        }

        // Find the ancestor level where most emails share similar structure AND container has tel link
        // Prefer higher-level (parent) containers over immediate parents to get full contact cards
        let bestPattern = null;
        let bestLevel = -1;

        for (let level = 0; level < maxLevel; level++) {
          const ancestorsAtLevel = ancestorData.map(ancestors => ancestors[level]).filter(a => a);

          if (ancestorsAtLevel.length < validLinks.length) {
            continue; // Not all emails have this level
          }

          // Count how many have tel links at this level
          const withTelLink = ancestorsAtLevel.filter(a => a.hasTelLink).length;
          const telLinkRatio = withTelLink / ancestorsAtLevel.length;

          // If at least 50% have tel links at this level, consider it a container
          if (telLinkRatio >= 0.5) {
            // Find common tag name
            const tagCounts = {};
            for (const ancestor of ancestorsAtLevel) {
              tagCounts[ancestor.tagName] = (tagCounts[ancestor.tagName] || 0) + 1;
            }

            const mostCommonTag = Object.keys(tagCounts).reduce((a, b) =>
              tagCounts[a] > tagCounts[b] ? a : b
            );

            // Find common class patterns
            const classCounts = {};
            for (const ancestor of ancestorsAtLevel) {
              const classes = ancestor.classes.split(' ').filter(c => c.length > 0);
              for (const cls of classes) {
                classCounts[cls] = (classCounts[cls] || 0) + 1;
              }
            }

            // Get classes that appear in at least 80% of containers
            const threshold = ancestorsAtLevel.length * 0.8;
            const commonClasses = Object.keys(classCounts).filter(cls => classCounts[cls] >= threshold);

            // Build selector
            let pattern;
            if (commonClasses.length > 0) {
              pattern = `${mostCommonTag}.${commonClasses.join('.')}`;
            } else {
              pattern = mostCommonTag;
            }

            // Prefer level 1 (parent of immediate parent) if it has a specific class
            // This helps select full contact cards instead of just contact-info divs
            // But stop at level 2 to avoid selecting the entire page container
            if (commonClasses.length > 0 && level <= 2) {
              // Prefer level 1 with classes over level 0
              if (level === 1 || !bestPattern) {
                bestPattern = pattern;
                bestLevel = level;
              }
            } else if (!bestPattern && level === 0) {
              // Fallback to level 0 if nothing better found
              bestPattern = pattern;
              bestLevel = level;
            }
          }
        }

        return bestPattern;
      }, startPos, endPos);

      return pattern;

    } catch (error) {
      this.logger.warn(`Container detection error: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect and flag contacts that share phone numbers
   * @param {array} contacts - Array of contact objects
   */
  detectSharedPhones(contacts) {
    // Group contacts by phone number
    const phoneGroups = {};

    for (const contact of contacts) {
      if (contact.phone) {
        if (!phoneGroups[contact.phone]) {
          phoneGroups[contact.phone] = [];
        }
        phoneGroups[contact.phone].push(contact.email);
      }
    }

    // Flag contacts with shared phones
    for (const contact of contacts) {
      if (contact.phone && phoneGroups[contact.phone].length > 1) {
        contact.sharedPhone = true;
        contact.sharedPhoneGroup = phoneGroups[contact.phone];
      } else {
        contact.sharedPhone = false;
      }
    }
  }
}

module.exports = SelectScraper;
