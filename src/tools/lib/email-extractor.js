/**
 * Email RegEx Extractor v2.3
 *
 * Finds email patterns in DOM text content near coordinates.
 * Uses regex patterns to extract valid email addresses.
 */

// Email regex pattern (RFC 5322 simplified)
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;

class EmailExtractor {
  constructor(page) {
    this.page = page;
  }

  /**
   * Extract email from rectangle coordinates
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates within card { x, y, width, height }
   * @returns {Object} {value, confidence, metadata}
   */
  async extractFromRegion(cardElement, fieldCoords) {
    try {
      // Get card's absolute position
      const cardBox = await cardElement.boundingBox();
      if (!cardBox) {
        throw new Error('Card element has no bounding box');
      }

      // Calculate absolute position of the field
      const absoluteCoords = {
        x: cardBox.x + fieldCoords.x,
        y: cardBox.y + fieldCoords.y,
        width: fieldCoords.width,
        height: fieldCoords.height
      };

      // Expand search area to catch nearby email text
      const searchArea = {
        x: absoluteCoords.x - 50,
        y: absoluteCoords.y - 30,
        width: absoluteCoords.width + 100,
        height: absoluteCoords.height + 60
      };

      // Get text content from the search area
      const textContent = await this.page.evaluate((area) => {
        let text = '';

        // Get elements at center point
        const centerX = area.x + area.width / 2;
        const centerY = area.y + area.height / 2;
        const elements = document.elementsFromPoint(centerX, centerY);

        for (const el of elements) {
          if (el.textContent) {
            text += el.textContent + ' ';
          }
        }

        // Also scan nearby text nodes using TreeWalker
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        let node;
        while (node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();

          // If text node intersects search area
          if (rect.right >= area.x && rect.left <= area.x + area.width &&
              rect.bottom >= area.y && rect.top <= area.y + area.height) {
            text += node.textContent + ' ';
          }
        }

        return text;
      }, searchArea);

      // Find email patterns
      const emails = textContent.match(EMAIL_PATTERN);

      if (!emails || emails.length === 0) {
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'regex-email',
            error: 'No email pattern found in text content'
          }
        };
      }

      // Get first (most likely correct) email and normalize
      const email = emails[0].toLowerCase().trim();

      // Calculate confidence based on email characteristics
      let confidence = 80;

      // Boost confidence for common/known domains
      if (email.endsWith('.edu') || email.endsWith('.gov') ||
          email.endsWith('.org') || email.includes('@gmail.com') ||
          email.includes('@outlook.com') || email.includes('@yahoo.com')) {
        confidence += 10;
      }

      // Boost for professional domains (law firms, etc.)
      if (email.includes('.com') && !email.includes('gmail') &&
          !email.includes('yahoo') && !email.includes('outlook')) {
        confidence += 5;
      }

      // Penalize if multiple @ symbols (malformed)
      if ((email.match(/@/g) || []).length > 1) {
        confidence -= 30;
      }

      // Penalize very short local part
      const localPart = email.split('@')[0];
      if (localPart.length < 2) {
        confidence -= 20;
      }

      return {
        value: email,
        confidence: Math.min(100, Math.max(0, confidence)),
        metadata: {
          method: 'regex-email',
          totalFound: emails.length,
          allEmails: emails.slice(0, 5),
          searchArea: searchArea
        }
      };

    } catch (error) {
      console.error('[EmailExtractor] Extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'regex-email',
          error: error.message
        }
      };
    }
  }

  /**
   * Extract email from mailto: links using 4-layer detection strategy
   * Handles Sullivan & Cromwell pattern: <a href="mailto:email@domain.com">Email</a>
   *
   * Layer 1: Direct hit - click point is directly on mailto link
   * Layer 2: Text-triggered - center text is "Email" keyword, find nearby mailto
   * Layer 3: Expanded area scan - search broader region for mailto links
   * Layer 4: Failure with diagnostic info
   *
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates within card
   * @returns {Object} {value, confidence, metadata}
   */
  async extractFromMailtoLink(cardElement, fieldCoords) {
    console.log('[EmailExtractor] Starting 4-layer mailto-link extraction');

    try {
      const cardBox = await cardElement.boundingBox();
      if (!cardBox) {
        throw new Error('Card element has no bounding box');
      }

      const absoluteCoords = {
        x: cardBox.x + fieldCoords.x,
        y: cardBox.y + fieldCoords.y,
        width: fieldCoords.width,
        height: fieldCoords.height
      };

      console.log('[EmailExtractor] Absolute coordinates:', absoluteCoords);

      const result = await this.page.evaluate((coords) => {
        const centerX = coords.x + coords.width / 2;
        const centerY = coords.y + coords.height / 2;

        // ===== HELPER FUNCTIONS =====

        function extractEmailFromHref(href) {
          if (!href || !href.startsWith('mailto:')) return null;
          // Extract: mailto:email@domain.com?subject=... → email@domain.com
          const email = href.replace('mailto:', '').split('?')[0].split('&')[0].trim();
          return email.includes('@') && email.includes('.') ? email : null;
        }

        function rectOverlaps(elementRect, searchArea) {
          return !(
            elementRect.right < searchArea.x ||
            elementRect.left > searchArea.x + searchArea.width ||
            elementRect.bottom < searchArea.y ||
            elementRect.top > searchArea.y + searchArea.height
          );
        }

        function calculateDistance(rect, cX, cY) {
          const rectCenterX = rect.left + rect.width / 2;
          const rectCenterY = rect.top + rect.height / 2;
          return Math.sqrt(
            Math.pow(rectCenterX - cX, 2) +
            Math.pow(rectCenterY - cY, 2)
          );
        }

        // ===== LAYER 1: DIRECT HIT =====
        console.log('[EmailExtractor] Layer 1: Direct hit check');

        const centerElement = document.elementFromPoint(centerX, centerY);

        if (centerElement) {
          // Check if center element IS a mailto link
          if (centerElement.tagName === 'A' && centerElement.href?.startsWith('mailto:')) {
            const email = extractEmailFromHref(centerElement.href);
            if (email) {
              console.log('[EmailExtractor] ✓ Layer 1 (direct-hit) succeeded:', email);
              return {
                value: email,
                confidence: 95,
                metadata: {
                  method: 'mailto-link',
                  layer: 'direct-hit',
                  linkText: centerElement.textContent.trim(),
                  searchRadius: 0
                }
              };
            }
          }

          // Check if center element is INSIDE a mailto link
          const parentLink = centerElement.closest('a[href^="mailto:"]');
          if (parentLink) {
            const email = extractEmailFromHref(parentLink.href);
            if (email) {
              console.log('[EmailExtractor] ✓ Layer 1 (parent-link) succeeded:', email);
              return {
                value: email,
                confidence: 95,
                metadata: {
                  method: 'mailto-link',
                  layer: 'direct-hit-parent',
                  linkText: parentLink.textContent.trim(),
                  centerElementTag: centerElement.tagName
                }
              };
            }
          }
        }

        // ===== LAYER 2: TEXT-TRIGGERED SEARCH =====
        console.log('[EmailExtractor] Layer 2: Text-triggered search');

        if (centerElement) {
          const centerText = centerElement.textContent.trim().toLowerCase();
          const emailKeywords = ['email', 'e-mail', 'contact', 'mail'];

          if (emailKeywords.some(keyword => centerText === keyword || centerText.startsWith(keyword))) {
            console.log('[EmailExtractor] Center text matches email keyword:', centerText);

            // Search parent for mailto link
            const parent = centerElement.parentElement;
            if (parent) {
              // Check if parent has mailto children
              const mailtoLinks = parent.querySelectorAll('a[href^="mailto:"]');
              for (const link of mailtoLinks) {
                const email = extractEmailFromHref(link.href);
                if (email) {
                  console.log('[EmailExtractor] ✓ Layer 2 (text-triggered) succeeded:', email);
                  return {
                    value: email,
                    confidence: 92,
                    metadata: {
                      method: 'mailto-link',
                      layer: 'text-triggered',
                      triggerText: centerText,
                      linkText: link.textContent.trim()
                    }
                  };
                }
              }

              // Check siblings
              const siblings = parent.children;
              for (const sibling of siblings) {
                if (sibling.tagName === 'A' && sibling.href?.startsWith('mailto:')) {
                  const email = extractEmailFromHref(sibling.href);
                  if (email) {
                    console.log('[EmailExtractor] ✓ Layer 2 (sibling) succeeded:', email);
                    return {
                      value: email,
                      confidence: 90,
                      metadata: {
                        method: 'mailto-link',
                        layer: 'text-triggered-sibling',
                        triggerText: centerText,
                        linkText: sibling.textContent.trim()
                      }
                    };
                  }
                }
              }
            }
          }
        }

        // ===== LAYER 3: EXPANDED AREA SCAN =====
        console.log('[EmailExtractor] Layer 3: Expanded area scan');

        const expandedArea = {
          x: coords.x - 100,
          y: coords.y - 50,
          width: coords.width + 200,
          height: coords.height + 100
        };

        const allMailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
        console.log('[EmailExtractor] Total mailto links on page:', allMailtoLinks.length);

        const candidateLinks = allMailtoLinks
          .map(link => {
            const rect = link.getBoundingClientRect();
            const email = extractEmailFromHref(link.href);
            return {
              element: link,
              rect: rect,
              email: email,
              overlaps: rectOverlaps(rect, expandedArea)
            };
          })
          .filter(candidate => candidate.email && candidate.overlaps)
          .map(candidate => ({
            ...candidate,
            distance: calculateDistance(candidate.rect, centerX, centerY)
          }))
          .sort((a, b) => a.distance - b.distance);

        console.log('[EmailExtractor] Candidates in expanded area:', candidateLinks.length);

        if (candidateLinks.length > 0) {
          const closest = candidateLinks[0];
          console.log('[EmailExtractor] ✓ Layer 3 (area-scan) succeeded:', closest.email);
          return {
            value: closest.email,
            confidence: 85,
            metadata: {
              method: 'mailto-link',
              layer: 'expanded-area-scan',
              linkText: closest.element.textContent.trim(),
              searchRadius: 100,
              candidatesFound: candidateLinks.length,
              distance: Math.round(closest.distance)
            }
          };
        }

        // ===== LAYER 4: FAILURE =====
        console.log('[EmailExtractor] ✗ All layers failed');
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'mailto-link',
            error: 'No mailto links found in search area',
            layer: 'all-failed',
            searchArea: expandedArea,
            totalMailtoLinksOnPage: allMailtoLinks.length,
            centerText: centerElement?.textContent?.trim()?.slice(0, 50),
            suggestion: 'Try selecting a larger rectangle or use regex-email method'
          }
        };

      }, absoluteCoords);

      console.log('[EmailExtractor] mailto-link result:', result.value ? 'SUCCESS' : 'FAILED');

      if (result.value) {
        result.value = result.value.toLowerCase();
      }

      return result;

    } catch (error) {
      console.error('[EmailExtractor] Mailto extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'mailto-link',
          error: error.message
        }
      };
    }
  }
}

module.exports = EmailExtractor;
