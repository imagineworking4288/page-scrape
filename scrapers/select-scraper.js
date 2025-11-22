/**
 * Select scraper using configurable text or coordinate markers.
 * Extracts contacts by selecting text between defined boundaries.
 */

const ConfigLoader = require('../utils/config-loader');
const TextParser = require('../utils/text-parser');
const DomainExtractor = require('../utils/domain-extractor');

class SelectScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.configLoader = new ConfigLoader(logger);
    this.textParser = new TextParser(logger);
    this.domainExtractor = new DomainExtractor(logger);
  }

  /**
   * Main scrape entry point
   * @param {string} url - Target URL
   * @param {number|null} limit - Max contacts to return
   * @param {boolean} keepPdf - Not used for select method, kept for API compatibility
   * @returns {array} - Array of contact objects
   */
  async scrape(url, limit = null, keepPdf = false) {
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
      const contacts = this.textParser.parse(selectedText, config);

      // Add domain classification
      for (const contact of contacts) {
        const isBusiness = this.domainExtractor.isBusinessDomain(contact.domain);
        contact.domainType = isBusiness ? 'business' : 'personal';
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
}

module.exports = SelectScraper;
