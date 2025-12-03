/**
 * Enhanced Capture Module v2.1
 *
 * Provides comprehensive DOM capture for config generation.
 * Captures element structure, attributes, links, spatial relationships,
 * and site characteristics to enable multi-method extraction strategies.
 */

class EnhancedCapture {
  constructor(logger) {
    this.logger = logger || console;
  }

  /**
   * Get browser-side capture code
   * This code runs in browser context via page.evaluate()
   * @returns {string} - JavaScript code to inject
   */
  getCaptureCode() {
    return `
    (function() {
      'use strict';

      // ===========================
      // REGEX PATTERNS
      // ===========================

      const PATTERNS = {
        email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/gi,
        phone: /(?:\\+?1[-.]?)?\\(?\\d{3}\\)?[-.]?\\d{3}[-.]?\\d{4}/g,
        profileUrl: /\\/(profile|people|attorney|lawyer|staff|team|member|bio|about)\\/[^"'\\s]+/gi
      };

      // ===========================
      // UTILITY FUNCTIONS
      // ===========================

      /**
       * Generate a unique selector for an element
       */
      function generateSelector(element, maxDepth = 4) {
        if (!element || element === document.body) return 'body';

        // Try ID first
        if (element.id) {
          return '#' + CSS.escape(element.id);
        }

        // Try unique class combination
        const classes = Array.from(element.classList);
        if (classes.length > 0) {
          const selector = element.tagName.toLowerCase() + '.' +
                          classes.map(c => CSS.escape(c)).join('.');
          try {
            const matches = document.querySelectorAll(selector);
            if (matches.length === 1) {
              return selector;
            }
            if (matches.length <= 20) {
              return selector;
            }
          } catch (e) {}
        }

        // Build path-based selector
        const path = [];
        let current = element;
        let depth = 0;

        while (current && current !== document.body && depth < maxDepth) {
          let part = current.tagName.toLowerCase();

          if (current.classList.length > 0) {
            // Use most specific classes (longer names, no numbers)
            const goodClasses = Array.from(current.classList)
              .filter(c => c.length > 2 && !/^\\d/.test(c))
              .sort((a, b) => b.length - a.length)
              .slice(0, 2);
            if (goodClasses.length > 0) {
              part += '.' + goodClasses.map(c => CSS.escape(c)).join('.');
            }
          }

          path.unshift(part);
          current = current.parentElement;
          depth++;
        }

        return path.join(' > ');
      }

      /**
       * Generate multiple selector strategies for fallback
       */
      function generateSelectorStrategies(element) {
        const strategies = [];

        // Strategy 1: ID-based
        if (element.id) {
          strategies.push({
            type: 'id',
            selector: '#' + CSS.escape(element.id),
            specificity: 'high'
          });
        }

        // Strategy 2: Class-based
        const classes = Array.from(element.classList);
        if (classes.length > 0) {
          const classSelector = element.tagName.toLowerCase() + '.' +
                               classes.map(c => CSS.escape(c)).join('.');
          strategies.push({
            type: 'class',
            selector: classSelector,
            specificity: 'medium'
          });

          // Also try with just the most unique class
          const uniqueClass = classes.find(c => c.length > 5 && !/\\d{3,}/.test(c));
          if (uniqueClass) {
            strategies.push({
              type: 'class-simple',
              selector: '.' + CSS.escape(uniqueClass),
              specificity: 'low'
            });
          }
        }

        // Strategy 3: Attribute-based
        const attrs = ['data-testid', 'data-id', 'role', 'aria-label'];
        for (const attr of attrs) {
          const value = element.getAttribute(attr);
          if (value) {
            strategies.push({
              type: 'attribute',
              selector: \`[\${attr}="\${CSS.escape(value)}"]\`,
              specificity: 'medium'
            });
          }
        }

        // Strategy 4: Path-based
        strategies.push({
          type: 'path',
          selector: generateSelector(element, 4),
          specificity: 'high'
        });

        return strategies;
      }

      /**
       * Get element's position relative to another element
       */
      function getRelativePosition(element, reference) {
        const elRect = element.getBoundingClientRect();
        const refRect = reference.getBoundingClientRect();

        return {
          above: elRect.bottom <= refRect.top,
          below: elRect.top >= refRect.bottom,
          left: elRect.right <= refRect.left,
          right: elRect.left >= refRect.right,
          overlapping: !(elRect.right < refRect.left ||
                        elRect.left > refRect.right ||
                        elRect.bottom < refRect.top ||
                        elRect.top > refRect.bottom),
          distance: Math.sqrt(
            Math.pow(elRect.x - refRect.x, 2) +
            Math.pow(elRect.y - refRect.y, 2)
          ),
          verticalDistance: Math.abs(elRect.y - refRect.y),
          horizontalDistance: Math.abs(elRect.x - refRect.x)
        };
      }

      /**
       * Extract computed styles relevant for matching
       */
      function getRelevantStyles(element) {
        const styles = window.getComputedStyle(element);
        return {
          display: styles.display,
          position: styles.position,
          flexDirection: styles.flexDirection,
          gridTemplateColumns: styles.gridTemplateColumns,
          overflow: styles.overflow,
          visibility: styles.visibility
        };
      }

      // ===========================
      // LINK EXTRACTION
      // ===========================

      /**
       * Extract all links from element with categorization
       */
      function extractLinks(element) {
        const links = {
          mailto: [],
          tel: [],
          profile: [],
          social: [],
          other: []
        };

        const anchors = element.querySelectorAll('a[href]');

        anchors.forEach(anchor => {
          const href = anchor.getAttribute('href') || '';
          const text = anchor.textContent.trim();
          const rect = anchor.getBoundingClientRect();

          const linkData = {
            href: href,
            text: text,
            selector: generateSelector(anchor),
            position: {
              x: rect.x + window.scrollX,
              y: rect.y + window.scrollY,
              width: rect.width,
              height: rect.height
            }
          };

          if (href.startsWith('mailto:')) {
            linkData.email = href.replace('mailto:', '').split('?')[0].toLowerCase();
            links.mailto.push(linkData);
          } else if (href.startsWith('tel:')) {
            linkData.phone = href.replace('tel:', '').replace(/\\D/g, '');
            links.tel.push(linkData);
          } else if (/linkedin\\.com/i.test(href)) {
            linkData.platform = 'linkedin';
            links.social.push(linkData);
          } else if (/twitter\\.com|x\\.com/i.test(href)) {
            linkData.platform = 'twitter';
            links.social.push(linkData);
          } else if (PATTERNS.profileUrl.test(href)) {
            linkData.type = 'profile';
            links.profile.push(linkData);
          } else if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            links.other.push(linkData);
          }
        });

        return links;
      }

      // ===========================
      // FIELD EXTRACTION WITH METHOD TRACKING
      // ===========================

      /**
       * Extract email with method tracking
       */
      function extractEmailWithMethods(element) {
        const methods = [];

        // Method 1: mailto links (highest priority)
        const mailtoLinks = element.querySelectorAll('a[href^="mailto:"]');
        if (mailtoLinks.length > 0) {
          mailtoLinks.forEach(link => {
            const href = link.getAttribute('href');
            const email = href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
            if (email && email.includes('@')) {
              methods.push({
                priority: 1,
                type: 'mailto',
                value: email,
                selector: generateSelector(link),
                attribute: 'href',
                confidence: 1.0
              });
            }
          });
        }

        // Method 2: Links with email-like text
        const allLinks = element.querySelectorAll('a[href]');
        allLinks.forEach(link => {
          const text = link.textContent.trim();
          const match = text.match(PATTERNS.email);
          if (match) {
            const email = match[0].toLowerCase();
            const existing = methods.find(m => m.value === email);
            if (!existing) {
              methods.push({
                priority: 2,
                type: 'linkText',
                value: email,
                selector: generateSelector(link),
                attribute: 'textContent',
                confidence: 0.9
              });
            }
          }
        });

        // Method 3: Plain text email patterns
        const textMatches = element.textContent.match(PATTERNS.email) || [];
        textMatches.forEach(email => {
          const normalizedEmail = email.toLowerCase();
          const existing = methods.find(m => m.value === normalizedEmail);
          if (!existing) {
            methods.push({
              priority: 3,
              type: 'textPattern',
              value: normalizedEmail,
              selector: null,
              attribute: null,
              confidence: 0.7
            });
          }
        });

        return {
          value: methods.length > 0 ? methods[0].value : null,
          methods: methods.sort((a, b) => a.priority - b.priority)
        };
      }

      /**
       * Extract phone with method tracking
       */
      function extractPhoneWithMethods(element) {
        const methods = [];

        // Method 1: tel links
        const telLinks = element.querySelectorAll('a[href^="tel:"]');
        telLinks.forEach(link => {
          const href = link.getAttribute('href');
          const phone = href.replace('tel:', '').trim();
          if (phone) {
            methods.push({
              priority: 1,
              type: 'tel',
              value: phone,
              selector: generateSelector(link),
              attribute: 'href',
              confidence: 1.0
            });
          }
        });

        // Method 2: Elements with phone-related classes
        const phoneSelectors = ['[class*="phone"]', '[class*="tel"]', '[class*="mobile"]'];
        phoneSelectors.forEach(sel => {
          const elements = element.querySelectorAll(sel);
          elements.forEach(el => {
            const text = el.textContent.trim();
            const match = text.match(PATTERNS.phone);
            if (match) {
              const existing = methods.find(m => m.value === match[0]);
              if (!existing) {
                methods.push({
                  priority: 2,
                  type: 'selector',
                  value: match[0],
                  selector: generateSelector(el),
                  attribute: 'textContent',
                  confidence: 0.85
                });
              }
            }
          });
        });

        // Method 3: Text pattern matching
        const textMatches = element.textContent.match(PATTERNS.phone) || [];
        textMatches.forEach(phone => {
          const existing = methods.find(m => m.value === phone);
          if (!existing) {
            methods.push({
              priority: 3,
              type: 'textPattern',
              value: phone,
              selector: null,
              attribute: null,
              confidence: 0.6
            });
          }
        });

        return {
          value: methods.length > 0 ? methods[0].value : null,
          methods: methods.sort((a, b) => a.priority - b.priority)
        };
      }

      /**
       * Extract name with method tracking
       */
      function extractNameWithMethods(element, emailElement = null) {
        const methods = [];
        const NAME_BLACKLIST = [
          'email', 'phone', 'tel', 'fax', 'mobile', 'address', 'location',
          'contact', 'info', 'click', 'here', 'more', 'view', 'profile'
        ];

        function isValidName(text) {
          if (!text || text.length < 2 || text.length > 100) return false;
          if (!/[a-zA-Z]/.test(text)) return false;
          if (/@/.test(text)) return false;
          const lower = text.toLowerCase();
          if (NAME_BLACKLIST.some(w => lower === w)) return false;
          const words = text.split(/\\s+/);
          if (words.length > 6 || words.some(w => w.length > 25)) return false;
          return true;
        }

        function cleanName(text) {
          return text
            .replace(/\\s+/g, ' ')
            .replace(/^(Mr\\.?|Mrs\\.?|Ms\\.?|Dr\\.?|Prof\\.?)\\s*/i, '')
            .trim();
        }

        // Method 1: Name-specific selectors (highest priority)
        const nameSelectors = [
          '[class*="name"]', '[class*="person"]', '[class*="author"]',
          'h1', 'h2', 'h3', 'h4', 'strong', 'b'
        ];

        for (const sel of nameSelectors) {
          const candidates = element.querySelectorAll(sel);
          for (const candidate of candidates) {
            const text = candidate.textContent.trim();
            if (isValidName(text)) {
              const cleanedName = cleanName(text);
              methods.push({
                priority: 1,
                type: 'selector',
                value: cleanedName,
                selector: generateSelector(candidate),
                attribute: 'textContent',
                confidence: 0.9
              });
              break; // Take first valid match per selector type
            }
          }
        }

        // Method 2: Proximity to email (if email element provided)
        if (emailElement) {
          const emailRect = emailElement.getBoundingClientRect();
          const candidates = [];

          // Check all text-containing elements
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
          );

          while (walker.nextNode()) {
            const node = walker.currentNode;
            const text = node.textContent.trim();
            if (!isValidName(text)) continue;
            if (node.contains(emailElement)) continue;

            const rect = node.getBoundingClientRect();
            const distance = Math.sqrt(
              Math.pow(rect.x - emailRect.x, 2) +
              Math.pow(rect.y - emailRect.y, 2)
            );

            if (distance < 300) {
              candidates.push({
                element: node,
                text: cleanName(text),
                distance: distance,
                isAbove: rect.bottom <= emailRect.top
              });
            }
          }

          // Prefer names above email
          candidates.sort((a, b) => {
            if (a.isAbove && !b.isAbove) return -1;
            if (!a.isAbove && b.isAbove) return 1;
            return a.distance - b.distance;
          });

          if (candidates.length > 0) {
            const best = candidates[0];
            const existing = methods.find(m => m.value === best.text);
            if (!existing) {
              methods.push({
                priority: 2,
                type: 'proximity',
                value: best.text,
                selector: generateSelector(best.element),
                attribute: 'textContent',
                confidence: 0.8,
                anchorField: 'email',
                direction: best.isAbove ? 'above' : 'near',
                distance: best.distance
              });
            }
          }
        }

        // Method 3: First reasonable text block
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        while (walker.nextNode()) {
          const text = walker.currentNode.textContent.trim();
          if (isValidName(text)) {
            const words = text.split(/\\s+/);
            if (words.length >= 2 && words.length <= 4) {
              const cleanedName = cleanName(text);
              const existing = methods.find(m => m.value === cleanedName);
              if (!existing) {
                methods.push({
                  priority: 3,
                  type: 'firstText',
                  value: cleanedName,
                  selector: null,
                  attribute: null,
                  confidence: 0.5
                });
                break;
              }
            }
          }
        }

        return {
          value: methods.length > 0 ? methods[0].value : null,
          methods: methods.sort((a, b) => a.priority - b.priority)
        };
      }

      /**
       * Extract title/position with method tracking
       */
      function extractTitleWithMethods(element, excludeTexts = []) {
        const methods = [];
        const TITLE_KEYWORDS = [
          'CEO', 'CTO', 'CFO', 'COO', 'CMO', 'President', 'Vice President', 'VP',
          'Director', 'Manager', 'Lead', 'Head', 'Engineer', 'Developer',
          'Partner', 'Associate', 'Senior', 'Junior', 'Principal',
          'Attorney', 'Lawyer', 'Counsel', 'Of Counsel'
        ];

        const excludeLower = excludeTexts.map(t => (t || '').toLowerCase());

        // Method 1: Title-specific selectors
        const titleSelectors = [
          '[class*="title"]', '[class*="position"]', '[class*="role"]',
          '[class*="job"]', '[class*="designation"]'
        ];

        for (const sel of titleSelectors) {
          const elements = element.querySelectorAll(sel);
          for (const el of elements) {
            const text = el.textContent.trim();
            if (text.length < 3 || text.length > 150) continue;
            if (excludeLower.includes(text.toLowerCase())) continue;

            const hasKeyword = TITLE_KEYWORDS.some(k =>
              text.toLowerCase().includes(k.toLowerCase())
            );

            if (hasKeyword) {
              methods.push({
                priority: 1,
                type: 'selector',
                value: text,
                selector: generateSelector(el),
                attribute: 'textContent',
                confidence: 0.9
              });
              break;
            }
          }
        }

        // Method 2: Keyword matching in any element
        const allElements = element.querySelectorAll('p, span, div');
        for (const el of allElements) {
          const text = el.textContent.trim();
          if (text.length < 3 || text.length > 150) continue;
          if (excludeLower.includes(text.toLowerCase())) continue;

          const hasKeyword = TITLE_KEYWORDS.some(k =>
            text.toLowerCase().includes(k.toLowerCase())
          );

          if (hasKeyword) {
            const existing = methods.find(m => m.value === text);
            if (!existing) {
              methods.push({
                priority: 2,
                type: 'keyword',
                value: text,
                selector: generateSelector(el),
                attribute: 'textContent',
                confidence: 0.7,
                keywords: TITLE_KEYWORDS.filter(k =>
                  text.toLowerCase().includes(k.toLowerCase())
                )
              });
            }
          }
        }

        return {
          value: methods.length > 0 ? methods[0].value : null,
          methods: methods.sort((a, b) => a.priority - b.priority)
        };
      }

      /**
       * Extract profile URL with method tracking
       */
      function extractProfileUrlWithMethods(element, pageUrl) {
        const methods = [];
        const PROFILE_PATTERNS = [
          /\\/profile\\//i, /\\/people\\//i, /\\/attorney\\//i, /\\/lawyer\\//i,
          /\\/staff\\//i, /\\/team\\//i, /\\/member\\//i, /\\/bio\\//i
        ];

        const anchors = element.querySelectorAll('a[href]');

        anchors.forEach(anchor => {
          const href = anchor.getAttribute('href');
          if (!href) return;
          if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
          if (/linkedin|twitter|facebook|x\\.com/i.test(href)) return;

          // Check URL patterns
          const matchedPattern = PROFILE_PATTERNS.find(p => p.test(href));
          if (matchedPattern) {
            let fullUrl = href;
            if (!href.startsWith('http')) {
              try {
                fullUrl = new URL(href, pageUrl).href;
              } catch (e) {}
            }

            methods.push({
              priority: 1,
              type: 'urlPattern',
              value: fullUrl,
              selector: generateSelector(anchor),
              attribute: 'href',
              confidence: 0.95,
              pattern: matchedPattern.source
            });
          }

          // Check link text hints
          const text = anchor.textContent.toLowerCase();
          if (text.includes('view profile') || text.includes('read more') ||
              text.includes('learn more') || text.includes('view bio')) {
            let fullUrl = href;
            if (!href.startsWith('http')) {
              try {
                fullUrl = new URL(href, pageUrl).href;
              } catch (e) {}
            }

            const existing = methods.find(m => m.value === fullUrl);
            if (!existing) {
              methods.push({
                priority: 2,
                type: 'linkText',
                value: fullUrl,
                selector: generateSelector(anchor),
                attribute: 'href',
                confidence: 0.8
              });
            }
          }
        });

        // Method 3: First internal link (lowest priority)
        if (methods.length === 0) {
          for (const anchor of anchors) {
            const href = anchor.getAttribute('href');
            if (!href) continue;
            if (href.startsWith('mailto:') || href.startsWith('tel:')) continue;
            if (href.startsWith('#') || href.startsWith('javascript:')) continue;

            try {
              const linkUrl = new URL(href, pageUrl);
              const pageUrlObj = new URL(pageUrl);
              if (linkUrl.hostname === pageUrlObj.hostname) {
                methods.push({
                  priority: 3,
                  type: 'firstInternalLink',
                  value: linkUrl.href,
                  selector: generateSelector(anchor),
                  attribute: 'href',
                  confidence: 0.4
                });
                break;
              }
            } catch (e) {}
          }
        }

        return {
          value: methods.length > 0 ? methods[0].value : null,
          methods: methods.sort((a, b) => a.priority - b.priority)
        };
      }

      // ===========================
      // SITE CHARACTERISTICS DETECTION
      // ===========================

      /**
       * Detect site characteristics
       */
      function detectSiteCharacteristics() {
        return {
          // SPA detection
          isSPA: !!(
            window.__NUXT__ ||
            window.__NEXT_DATA__ ||
            window.Ember ||
            window.Angular ||
            document.querySelector('[ng-app], [data-reactroot], #__next, #app')
          ),

          // Framework detection
          framework: detectFramework(),

          // Dynamic loading detection
          dynamicLoading: detectDynamicLoading(),

          // Infinite scroll indicators
          hasInfiniteScroll: !!(
            document.querySelector('[data-infinite-scroll], .infinite-scroll') ||
            window.IntersectionObserver
          ),

          // Iframe usage
          usesIframes: document.querySelectorAll('iframe').length > 0,

          // Shadow DOM usage
          usesShadowDOM: !!document.querySelector('*').shadowRoot,

          // Page structure
          hasHeader: !!document.querySelector('header, [role="banner"]'),
          hasFooter: !!document.querySelector('footer, [role="contentinfo"]'),
          hasNav: !!document.querySelector('nav, [role="navigation"]'),

          // Content loading
          hasLazyImages: document.querySelectorAll('img[loading="lazy"], img[data-src]').length > 0
        };
      }

      /**
       * Detect JavaScript framework
       */
      function detectFramework() {
        if (window.__NUXT__) return 'nuxt';
        if (window.__NEXT_DATA__) return 'next';
        if (window.React || document.querySelector('[data-reactroot]')) return 'react';
        if (window.Vue || document.querySelector('[data-v-]')) return 'vue';
        if (window.Angular || document.querySelector('[ng-app]')) return 'angular';
        if (window.Ember) return 'ember';
        return 'unknown';
      }

      /**
       * Detect dynamic loading behavior
       */
      function detectDynamicLoading() {
        // Check for loading indicators
        const hasLoader = !!document.querySelector(
          '.loading, .loader, .spinner, [class*="loading"], [class*="skeleton"]'
        );

        // Check for lazy load attributes
        const hasLazyLoad = document.querySelectorAll(
          '[data-src], [data-lazy], [loading="lazy"]'
        ).length > 0;

        // Check for pagination/load more
        const hasLoadMore = !!document.querySelector(
          '[class*="load-more"], [class*="show-more"], button:contains("Load")'
        );

        if (hasLoader || hasLazyLoad) return 'lazy';
        if (hasLoadMore) return 'paginated';
        return 'eager';
      }

      // ===========================
      // MAIN CAPTURE FUNCTION
      // ===========================

      /**
       * Comprehensive capture of selected card region
       */
      function captureSelection(selectionBox) {
        const pageUrl = window.location.href;

        // Find element at center of selection
        const centerX = selectionBox.x + selectionBox.width / 2;
        const centerY = selectionBox.y + selectionBox.height / 2;
        const clickedElement = document.elementFromPoint(
          centerX - window.scrollX,
          centerY - window.scrollY
        );

        if (!clickedElement) {
          return { success: false, error: 'No element found at selection' };
        }

        // Find best container element
        let cardElement = clickedElement;
        let bestOverlap = 0;

        let current = clickedElement;
        for (let i = 0; i < 10 && current && current !== document.body; i++) {
          const rect = current.getBoundingClientRect();
          const overlap = calculateOverlap(rect, selectionBox);
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            cardElement = current;
          }
          current = current.parentElement;
        }

        const cardRect = cardElement.getBoundingClientRect();

        // Extract all data with methods
        const emailData = extractEmailWithMethods(cardElement);

        // Find email element for name proximity
        let emailElement = null;
        if (emailData.methods.length > 0 && emailData.methods[0].selector) {
          try {
            emailElement = document.querySelector(emailData.methods[0].selector);
          } catch (e) {}
        }

        const nameData = extractNameWithMethods(cardElement, emailElement);
        const phoneData = extractPhoneWithMethods(cardElement);
        const titleData = extractTitleWithMethods(cardElement, [nameData.value, emailData.value]);
        const profileData = extractProfileUrlWithMethods(cardElement, pageUrl);

        // Extract all links
        const links = extractLinks(cardElement);

        // Calculate spatial relationships
        const relationships = calculateRelationships(cardElement, {
          name: nameData.methods[0]?.selector,
          email: emailData.methods[0]?.selector,
          phone: phoneData.methods[0]?.selector,
          title: titleData.methods[0]?.selector
        });

        // Build comprehensive capture result
        return {
          success: true,

          // Card element data
          card: {
            selector: generateSelector(cardElement),
            selectorStrategies: generateSelectorStrategies(cardElement),
            tagName: cardElement.tagName.toLowerCase(),
            classes: Array.from(cardElement.classList),
            attributes: getElementAttributes(cardElement),
            dimensions: {
              x: cardRect.x + window.scrollX,
              y: cardRect.y + window.scrollY,
              width: cardRect.width,
              height: cardRect.height
            },
            styles: getRelevantStyles(cardElement),
            childCount: cardElement.children.length,
            childTags: getChildTags(cardElement)
          },

          // Field extractions with methods
          fields: {
            name: nameData,
            email: emailData,
            phone: phoneData,
            title: titleData,
            profileUrl: profileData
          },

          // All links found
          links: links,

          // Spatial relationships
          relationships: relationships,

          // Site characteristics
          siteCharacteristics: detectSiteCharacteristics(),

          // Preview data (first values)
          preview: {
            name: nameData.value,
            email: emailData.value,
            phone: phoneData.value,
            title: titleData.value,
            profileUrl: profileData.value
          },

          // Metadata
          metadata: {
            pageUrl: pageUrl,
            capturedAt: new Date().toISOString(),
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY
          }
        };
      }

      /**
       * Calculate overlap between rect and selection box
       */
      function calculateOverlap(rect, box) {
        const x1 = Math.max(rect.left, box.x);
        const y1 = Math.max(rect.top, box.y);
        const x2 = Math.min(rect.right, box.x + box.width);
        const y2 = Math.min(rect.bottom, box.y + box.height);

        if (x2 <= x1 || y2 <= y1) return 0;

        const intersection = (x2 - x1) * (y2 - y1);
        const boxArea = box.width * box.height;

        return intersection / boxArea;
      }

      /**
       * Get element attributes as object
       */
      function getElementAttributes(element) {
        const attrs = {};
        for (const attr of element.attributes) {
          if (!attr.name.startsWith('on')) { // Skip event handlers
            attrs[attr.name] = attr.value;
          }
        }
        return attrs;
      }

      /**
       * Get child tag distribution
       */
      function getChildTags(element) {
        const tags = {};
        Array.from(element.children).forEach(child => {
          const tag = child.tagName.toLowerCase();
          tags[tag] = (tags[tag] || 0) + 1;
        });
        return tags;
      }

      /**
       * Calculate relationships between field elements
       */
      function calculateRelationships(container, fieldSelectors) {
        const relationships = {};
        const elements = {};

        // Get elements
        for (const [field, selector] of Object.entries(fieldSelectors)) {
          if (selector) {
            try {
              elements[field] = container.querySelector(selector) ||
                               document.querySelector(selector);
            } catch (e) {}
          }
        }

        // Calculate relationships
        if (elements.name && elements.email) {
          relationships.nameToEmail = getRelativePosition(elements.name, elements.email);
          relationships.nameAboveEmail = relationships.nameToEmail.above;
        }

        if (elements.email && elements.phone) {
          relationships.emailToPhone = getRelativePosition(elements.email, elements.phone);
        }

        if (elements.name && elements.title) {
          relationships.nameToTitle = getRelativePosition(elements.name, elements.title);
          relationships.titleBelowName = relationships.nameToTitle.above;
        }

        return relationships;
      }

      // Expose the capture function
      window.__enhancedCapture_capture = captureSelection;

      return { ready: true };
    })();
    `;
  }

  /**
   * Capture comprehensive data from selection
   * @param {Object} page - Puppeteer page instance
   * @param {Object} selectionBox - {x, y, width, height}
   * @returns {Promise<Object>} - Comprehensive capture data
   */
  async capture(page, selectionBox) {
    this.logger.info('[EnhancedCapture] Starting comprehensive capture');

    try {
      // Inject capture code
      await page.evaluate(this.getCaptureCode());

      // Run capture
      const result = await page.evaluate((box) => {
        return window.__enhancedCapture_capture(box);
      }, selectionBox);

      if (!result.success) {
        this.logger.error(`[EnhancedCapture] Capture failed: ${result.error}`);
        return result;
      }

      this.logger.info('[EnhancedCapture] Capture complete');
      this.logger.info(`[EnhancedCapture] Fields found: name=${!!result.fields.name.value}, email=${!!result.fields.email.value}, phone=${!!result.fields.phone.value}`);

      return result;

    } catch (error) {
      this.logger.error(`[EnhancedCapture] Error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = EnhancedCapture;
