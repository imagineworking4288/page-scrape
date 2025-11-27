/**
 * Element Analyzer
 *
 * Analyzes clicked elements to extract useful information
 * for generating CSS selectors and understanding element context.
 */

class ElementAnalyzer {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Analyze a clicked element
   * @param {Object} page - Puppeteer page
   * @param {Object} clickData - Click event data from browser
   * @returns {Promise<Object>} - Analyzed element information
   */
  async analyzeElement(page, clickData) {
    const { x, y } = clickData;

    const elementInfo = await page.evaluate((clickX, clickY) => {
      // Get element at click position
      const element = document.elementFromPoint(clickX, clickY);
      if (!element) return null;

      // Helper to get element path
      function getElementPath(el, maxDepth = 5) {
        const path = [];
        let current = el;
        let depth = 0;

        while (current && current !== document.body && depth < maxDepth) {
          path.unshift({
            tag: current.tagName.toLowerCase(),
            id: current.id || null,
            classes: Array.from(current.classList),
            index: getElementIndex(current)
          });
          current = current.parentElement;
          depth++;
        }

        return path;
      }

      // Get element's index among siblings
      function getElementIndex(el) {
        if (!el.parentElement) return 0;
        const siblings = Array.from(el.parentElement.children);
        return siblings.indexOf(el);
      }

      // Get data attributes
      function getDataAttributes(el) {
        const dataAttrs = {};
        for (const attr of el.attributes) {
          if (attr.name.startsWith('data-')) {
            dataAttrs[attr.name.replace('data-', '')] = attr.value;
          }
        }
        return dataAttrs;
      }

      // Get computed styles (relevant ones)
      function getRelevantStyles(el) {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          position: computed.position,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          color: computed.color
        };
      }

      // Extract info
      const rect = element.getBoundingClientRect();

      return {
        tagName: element.tagName,
        id: element.id || null,
        classes: Array.from(element.classList),
        textContent: element.textContent?.trim().substring(0, 200) || '',
        innerText: element.innerText?.trim().substring(0, 200) || '',
        innerHTML: element.innerHTML?.substring(0, 500) || '',
        href: element.href || element.closest('a')?.href || null,
        role: element.getAttribute('role'),
        ariaLabel: element.getAttribute('aria-label'),
        dataAttributes: getDataAttributes(element),
        path: getElementPath(element),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        styles: getRelevantStyles(element),
        childCount: element.children.length,
        siblingCount: element.parentElement?.children.length || 0
      };
    }, x, y);

    if (!elementInfo) {
      this.logger.warn('No element found at click position');
      return null;
    }

    // Add analysis metadata
    elementInfo.analysis = this.analyzeElementType(elementInfo);

    return elementInfo;
  }

  /**
   * Analyze element to determine its likely type
   * @param {Object} elementInfo - Element information
   * @returns {Object} - Analysis result
   */
  analyzeElementType(elementInfo) {
    const analysis = {
      isContainer: false,
      isCard: false,
      isText: false,
      isLink: false,
      isImage: false,
      likelyContentType: 'unknown',
      confidence: 'low'
    };

    const tag = elementInfo.tagName?.toLowerCase();
    const classes = elementInfo.classes || [];
    const classStr = classes.join(' ').toLowerCase();

    // Check for container/card patterns
    const containerTags = ['div', 'article', 'section', 'li', 'tr'];
    const cardPatterns = /card|item|entry|result|member|person|profile|listing|attorney|lawyer|contact|row/i;

    if (containerTags.includes(tag)) {
      if (elementInfo.childCount > 2 || cardPatterns.test(classStr)) {
        analysis.isContainer = true;
      }

      if (cardPatterns.test(classStr)) {
        analysis.isCard = true;
        analysis.likelyContentType = 'contact-card';
        analysis.confidence = 'high';
      }
    }

    // Check for text elements
    const textTags = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b'];
    if (textTags.includes(tag)) {
      analysis.isText = true;
    }

    // Check for link
    if (tag === 'a' || elementInfo.href) {
      analysis.isLink = true;
    }

    // Check for image
    if (tag === 'img' || tag === 'picture' || tag === 'svg') {
      analysis.isImage = true;
    }

    // Analyze text content for type hints
    const text = elementInfo.textContent || '';

    // Email pattern
    if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) {
      analysis.likelyContentType = 'email';
      analysis.confidence = 'high';
    }
    // Phone pattern
    else if (/[\d\s\(\)\-\+\.]{10,}/.test(text) && /\d{3}/.test(text)) {
      analysis.likelyContentType = 'phone';
      analysis.confidence = 'medium';
    }
    // Name pattern (check for name-related classes)
    else if (/name|title|heading/i.test(classStr)) {
      analysis.likelyContentType = 'name';
      analysis.confidence = 'medium';
    }
    // Short text likely to be name
    else if (analysis.isText && text.length < 50 && text.length > 2) {
      const words = text.split(/\s+/);
      if (words.length >= 2 && words.length <= 4) {
        // Likely a name
        analysis.likelyContentType = 'name';
        analysis.confidence = 'low';
      }
    }

    return analysis;
  }

  /**
   * Analyze multiple cards to find common structure
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - Card selector
   * @returns {Promise<Object>} - Common structure analysis
   */
  async analyzeCardStructure(page, cardSelector) {
    const structure = await page.evaluate((selector) => {
      const cards = document.querySelectorAll(selector);
      if (cards.length === 0) return null;

      // Sample first few cards
      const sampleSize = Math.min(cards.length, 5);
      const structures = [];

      for (let i = 0; i < sampleSize; i++) {
        const card = cards[i];
        const childTags = Array.from(card.children).map(c => ({
          tag: c.tagName.toLowerCase(),
          classes: Array.from(c.classList),
          hasText: c.textContent?.trim().length > 0
        }));

        structures.push({
          childCount: card.children.length,
          childTags: childTags,
          depth: getMaxDepth(card, 0),
          hasLinks: card.querySelectorAll('a').length,
          hasImages: card.querySelectorAll('img').length,
          textContent: card.textContent?.trim().substring(0, 300)
        });
      }

      function getMaxDepth(el, depth) {
        if (el.children.length === 0) return depth;
        return Math.max(...Array.from(el.children).map(c => getMaxDepth(c, depth + 1)));
      }

      // Find common elements across cards
      const commonTags = findCommonTags(structures);

      return {
        cardCount: cards.length,
        sampleSize: sampleSize,
        structures: structures,
        commonTags: commonTags,
        avgChildCount: structures.reduce((sum, s) => sum + s.childCount, 0) / structures.length,
        avgDepth: structures.reduce((sum, s) => sum + s.depth, 0) / structures.length
      };

      function findCommonTags(structs) {
        // Find tags that appear in all structures
        if (structs.length === 0) return [];

        const firstTags = structs[0].childTags.map(t => t.tag);
        return firstTags.filter(tag =>
          structs.every(s => s.childTags.some(t => t.tag === tag))
        );
      }
    }, cardSelector);

    return structure;
  }

  /**
   * Find field candidates within a card
   * @param {Object} page - Puppeteer page
   * @param {string} cardSelector - Card selector
   * @returns {Promise<Object>} - Field candidates
   */
  async findFieldCandidates(page, cardSelector) {
    const candidates = await page.evaluate((selector) => {
      const card = document.querySelector(selector);
      if (!card) return null;

      const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
      const phoneRegex = /[\d\s\(\)\-\+\.]{10,}/;

      const fields = {
        name: [],
        email: [],
        phone: []
      };

      // Recursively scan card for text content
      function scanElement(el, depth = 0) {
        if (depth > 10) return;

        // Get direct text content (not from children)
        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === 3) // Text nodes only
          .map(n => n.textContent.trim())
          .join(' ')
          .trim();

        const fullText = el.textContent?.trim() || '';
        const classes = Array.from(el.classList).join(' ');

        // Build selector for this element
        const elementSelector = buildSelector(el);

        // Check for email
        if (emailRegex.test(fullText)) {
          // Find the most specific element containing the email
          if (directText && emailRegex.test(directText)) {
            fields.email.push({
              selector: elementSelector,
              text: directText,
              confidence: 'high'
            });
          } else if (el.children.length === 0) {
            fields.email.push({
              selector: elementSelector,
              text: fullText,
              confidence: 'medium'
            });
          }
        }

        // Check for phone
        if (phoneRegex.test(fullText) && /\d{3}/.test(fullText)) {
          const cleaned = fullText.replace(/[^\d]/g, '');
          if (cleaned.length >= 10 && cleaned.length <= 15) {
            if (el.children.length === 0 || directText) {
              fields.phone.push({
                selector: elementSelector,
                text: fullText.substring(0, 50),
                confidence: directText ? 'high' : 'medium'
              });
            }
          }
        }

        // Check for name (by class or position)
        const namePatterns = /name|title|heading/i;
        if (namePatterns.test(classes) || el.tagName.match(/^H[1-6]$/)) {
          const text = el.textContent?.trim();
          if (text && text.length < 100 && !emailRegex.test(text)) {
            fields.name.push({
              selector: elementSelector,
              text: text,
              confidence: namePatterns.test(classes) ? 'high' : 'medium'
            });
          }
        }

        // Recurse into children
        for (const child of el.children) {
          scanElement(child, depth + 1);
        }
      }

      function buildSelector(el) {
        if (el.id) return `#${el.id}`;

        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList);

        if (classes.length > 0) {
          // Prefer semantic class names
          const semantic = classes.find(c =>
            /name|email|phone|title|contact|bio/i.test(c)
          );
          if (semantic) return `.${semantic}`;
          return `${tag}.${classes[0]}`;
        }

        return tag;
      }

      scanElement(card);

      return fields;
    }, cardSelector);

    return candidates;
  }

  /**
   * Get element bounding box for highlighting
   * @param {Object} page - Puppeteer page
   * @param {string} selector - Element selector
   * @returns {Promise<Object|null>} - Bounding box
   */
  async getElementBoundingBox(page, selector) {
    try {
      const box = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right
        };
      }, selector);

      return box;
    } catch (error) {
      this.logger.warn(`Failed to get bounding box: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect if element is within a scrollable container
   * @param {Object} page - Puppeteer page
   * @param {string} selector - Element selector
   * @returns {Promise<Object>} - Scroll container info
   */
  async detectScrollContainer(page, selector) {
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };

      let current = el.parentElement;

      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;

        if (overflowY === 'scroll' || overflowY === 'auto' ||
            overflowX === 'scroll' || overflowX === 'auto') {
          // Check if actually scrollable
          if (current.scrollHeight > current.clientHeight ||
              current.scrollWidth > current.clientWidth) {
            return {
              found: true,
              selector: buildSelector(current),
              scrollHeight: current.scrollHeight,
              clientHeight: current.clientHeight,
              isVertical: current.scrollHeight > current.clientHeight,
              isHorizontal: current.scrollWidth > current.clientWidth
            };
          }
        }

        current = current.parentElement;
      }

      // Check document body
      if (document.documentElement.scrollHeight > window.innerHeight) {
        return {
          found: true,
          selector: 'window',
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: window.innerHeight,
          isVertical: true,
          isHorizontal: false
        };
      }

      return { found: false };

      function buildSelector(element) {
        if (element.id) return `#${element.id}`;
        const classes = Array.from(element.classList);
        if (classes.length > 0) {
          return `${element.tagName.toLowerCase()}.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      }
    }, selector);
  }

  /**
   * Calculate structural similarity between card elements
   * @param {Array} cards - Array of card data objects
   * @returns {number} - Similarity score (0-1)
   */
  calculateSimilarity(cards) {
    if (!cards || cards.length < 2) {
      return 1.0;
    }

    // Compare child counts
    const childCounts = cards.map(c => c.childCount || 0);
    const avgChildCount = childCounts.reduce((a, b) => a + b, 0) / childCounts.length;
    const childCountVariance = childCounts.reduce((sum, c) =>
      sum + Math.pow(c - avgChildCount, 2), 0) / childCounts.length;
    const childSimilarity = 1 / (1 + Math.sqrt(childCountVariance) / avgChildCount);

    // Compare text lengths
    const textLengths = cards.map(c => c.textLength || 0);
    const avgTextLength = textLengths.reduce((a, b) => a + b, 0) / textLengths.length;
    const textVariance = textLengths.reduce((sum, t) =>
      sum + Math.pow(t - avgTextLength, 2), 0) / textLengths.length;
    const textSimilarity = avgTextLength > 0 ? 1 / (1 + Math.sqrt(textVariance) / avgTextLength) : 1;

    // Compare tag names
    const tagSimilarity = cards.every(c => c.tagName === cards[0].tagName) ? 1 : 0.5;

    // Compare presence of links
    const linkPresence = cards.map(c => c.hasLinks ? 1 : 0);
    const linkSimilarity = linkPresence.every(l => l === linkPresence[0]) ? 1 : 0.7;

    // Weighted average
    return (
      childSimilarity * 0.3 +
      textSimilarity * 0.2 +
      tagSimilarity * 0.3 +
      linkSimilarity * 0.2
    );
  }

  /**
   * Detect which attribute contains the data for a field type
   * @param {Object} elementData - Element data
   * @param {string} fieldType - Field type (name, email, phone)
   * @returns {string} - Attribute name ('textContent', 'href', etc.)
   */
  detectAttribute(elementData, fieldType) {
    // Email - check href for mailto:
    if (fieldType === 'email') {
      if (elementData.href && elementData.href.startsWith('mailto:')) {
        return 'href';
      }
    }

    // Phone - check href for tel:
    if (fieldType === 'phone') {
      if (elementData.href && elementData.href.startsWith('tel:')) {
        return 'href';
      }
    }

    // Default to text content
    return 'textContent';
  }
}

module.exports = ElementAnalyzer;
