/**
 * Phone RegEx Extractor v2.3
 *
 * Finds phone number patterns (US and international formats) in DOM text.
 * Normalizes phone numbers to consistent format.
 */

// Phone patterns (US focus with international support)
const PHONE_PATTERNS = [
  // +1-212-558-3960 or +1 212 558 3960
  /\+\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  // (212) 558-3960
  /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  // 212.558.3960 or 212-558-3960
  /\d{3}[-.]\d{3}[-.]\d{4}/g,
  // 2125583960 (10 consecutive digits)
  /\b\d{10}\b/g
];

class PhoneExtractor {
  constructor(page) {
    this.page = page;
  }

  /**
   * Extract phone from rectangle coordinates
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

      // Expand search area
      const searchArea = {
        x: absoluteCoords.x - 30,
        y: absoluteCoords.y - 20,
        width: absoluteCoords.width + 60,
        height: absoluteCoords.height + 40
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

        // Also scan nearby text nodes
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

          if (rect.right >= area.x && rect.left <= area.x + area.width &&
              rect.bottom >= area.y && rect.top <= area.y + area.height) {
            text += node.textContent + ' ';
          }
        }

        return text;
      }, searchArea);

      // Try each phone pattern
      let bestMatch = null;
      let bestPattern = null;

      for (const pattern of PHONE_PATTERNS) {
        const matches = textContent.match(pattern);
        if (matches && matches.length > 0) {
          bestMatch = matches[0];
          bestPattern = pattern.source;
          break;
        }
      }

      if (!bestMatch) {
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'regex-phone',
            error: 'No phone pattern found'
          }
        };
      }

      // Normalize phone format
      const normalized = this.normalizePhone(bestMatch);

      // Calculate confidence
      let confidence = 85;

      // Boost for formatted numbers (likely intentional display)
      if (bestMatch.includes('-') || bestMatch.includes('.') || bestMatch.includes('(')) {
        confidence += 5;
      }

      // Boost for complete US format with country code
      if (bestMatch.startsWith('+1') || bestMatch.startsWith('1-')) {
        confidence += 5;
      }

      return {
        value: normalized,
        confidence: Math.min(100, confidence),
        metadata: {
          method: 'regex-phone',
          pattern: bestPattern,
          original: bestMatch,
          normalized: normalized,
          searchArea: searchArea
        }
      };

    } catch (error) {
      console.error('[PhoneExtractor] Extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'regex-phone',
          error: error.message
        }
      };
    }
  }

  /**
   * Extract phone from tel: links using 4-layer detection strategy
   * Handles various phone display patterns including Sullivan & Cromwell format
   *
   * Layer 1: Direct hit - click point is directly on tel link
   * Layer 2: Text-triggered - center text contains phone keywords, find nearby tel
   * Layer 3: Expanded area scan - search broader region for tel links
   * Layer 4: Failure with diagnostic info
   *
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates within card
   * @returns {Object} {value, confidence, metadata}
   */
  async extractFromTelLink(cardElement, fieldCoords) {
    console.log('[PhoneExtractor] Starting 4-layer tel-link extraction');

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

      console.log('[PhoneExtractor] Absolute coordinates:', absoluteCoords);

      const result = await this.page.evaluate((coords) => {
        const centerX = coords.x + coords.width / 2;
        const centerY = coords.y + coords.height / 2;

        // ===== HELPER FUNCTIONS =====

        function extractPhoneFromHref(href) {
          if (!href || !href.startsWith('tel:')) return null;
          // Extract: tel:+12125583960 → +12125583960
          let phone = href.replace('tel:', '').trim();
          // Keep digits, +, and dashes for formatted numbers
          phone = phone.replace(/[^\d+\-]/g, '');
          return phone.length >= 10 ? phone : null;
        }

        function formatPhone(phone) {
          // If already formatted with dashes, return as-is
          if (phone.includes('-') && phone.split('-').length >= 3) return phone;

          // Remove all non-digit characters except +
          const digits = phone.replace(/[^\d+]/g, '');

          // Format +12125583960 → +1-212-558-3960
          if (digits.startsWith('+1') && digits.length === 12) {
            return `+1-${digits.slice(2, 5)}-${digits.slice(5, 8)}-${digits.slice(8)}`;
          }

          // Format 12125583960 → +1-212-558-3960
          if (digits.startsWith('1') && digits.length === 11) {
            return `+1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
          }

          // Format 2125583960 → +1-212-558-3960
          if (!digits.startsWith('+') && digits.length === 10) {
            return `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
          }

          return phone;
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
        console.log('[PhoneExtractor] Layer 1: Direct hit check');

        const centerElement = document.elementFromPoint(centerX, centerY);

        if (centerElement) {
          // Check if center element IS a tel link
          if (centerElement.tagName === 'A' && centerElement.href?.startsWith('tel:')) {
            const phone = extractPhoneFromHref(centerElement.href);
            if (phone) {
              console.log('[PhoneExtractor] ✓ Layer 1 (direct-hit) succeeded:', phone);
              return {
                value: formatPhone(phone),
                confidence: 95,
                metadata: {
                  method: 'tel-link',
                  layer: 'direct-hit',
                  linkText: centerElement.textContent.trim(),
                  rawPhone: phone
                }
              };
            }
          }

          // Check if center element is INSIDE a tel link
          const parentLink = centerElement.closest('a[href^="tel:"]');
          if (parentLink) {
            const phone = extractPhoneFromHref(parentLink.href);
            if (phone) {
              console.log('[PhoneExtractor] ✓ Layer 1 (parent-link) succeeded:', phone);
              return {
                value: formatPhone(phone),
                confidence: 95,
                metadata: {
                  method: 'tel-link',
                  layer: 'direct-hit-parent',
                  linkText: parentLink.textContent.trim(),
                  centerElementTag: centerElement.tagName
                }
              };
            }
          }
        }

        // ===== LAYER 2: TEXT-TRIGGERED SEARCH =====
        console.log('[PhoneExtractor] Layer 2: Text-triggered search');

        if (centerElement) {
          const centerText = centerElement.textContent.trim().toLowerCase();
          const phoneKeywords = ['phone', 'tel', 'call', 'mobile', 'direct', 'fax'];

          // Check for phone number pattern in text (like +1-212-558-3960)
          const phonePattern = /\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/;
          const hasPhonePattern = phonePattern.test(centerText);

          if (hasPhonePattern || phoneKeywords.some(keyword => centerText.includes(keyword))) {
            console.log('[PhoneExtractor] Center text matches phone pattern or keyword');

            // Search parent and nearby for tel link
            const parent = centerElement.parentElement;
            if (parent) {
              const telLinks = parent.querySelectorAll('a[href^="tel:"]');
              for (const link of telLinks) {
                const phone = extractPhoneFromHref(link.href);
                if (phone) {
                  console.log('[PhoneExtractor] ✓ Layer 2 (text-triggered) succeeded:', phone);
                  return {
                    value: formatPhone(phone),
                    confidence: 92,
                    metadata: {
                      method: 'tel-link',
                      layer: 'text-triggered',
                      triggerText: centerText.slice(0, 50),
                      linkText: link.textContent.trim()
                    }
                  };
                }
              }

              // Check siblings
              const siblings = parent.children;
              for (const sibling of siblings) {
                if (sibling.tagName === 'A' && sibling.href?.startsWith('tel:')) {
                  const phone = extractPhoneFromHref(sibling.href);
                  if (phone) {
                    console.log('[PhoneExtractor] ✓ Layer 2 (sibling) succeeded:', phone);
                    return {
                      value: formatPhone(phone),
                      confidence: 90,
                      metadata: {
                        method: 'tel-link',
                        layer: 'text-triggered-sibling',
                        triggerText: centerText.slice(0, 50),
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
        console.log('[PhoneExtractor] Layer 3: Expanded area scan');

        const expandedArea = {
          x: coords.x - 80,
          y: coords.y - 40,
          width: coords.width + 160,
          height: coords.height + 80
        };

        const allTelLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));
        console.log('[PhoneExtractor] Total tel links on page:', allTelLinks.length);

        const candidateLinks = allTelLinks
          .map(link => {
            const rect = link.getBoundingClientRect();
            const phone = extractPhoneFromHref(link.href);
            return {
              element: link,
              rect: rect,
              phone: phone,
              overlaps: rectOverlaps(rect, expandedArea)
            };
          })
          .filter(candidate => candidate.phone && candidate.overlaps)
          .map(candidate => ({
            ...candidate,
            distance: calculateDistance(candidate.rect, centerX, centerY)
          }))
          .sort((a, b) => a.distance - b.distance);

        console.log('[PhoneExtractor] Candidates in expanded area:', candidateLinks.length);

        if (candidateLinks.length > 0) {
          const closest = candidateLinks[0];
          console.log('[PhoneExtractor] ✓ Layer 3 (area-scan) succeeded:', closest.phone);
          return {
            value: formatPhone(closest.phone),
            confidence: 85,
            metadata: {
              method: 'tel-link',
              layer: 'expanded-area-scan',
              linkText: closest.element.textContent.trim(),
              searchRadius: 80,
              candidatesFound: candidateLinks.length,
              distance: Math.round(closest.distance)
            }
          };
        }

        // ===== LAYER 4: FAILURE =====
        console.log('[PhoneExtractor] ✗ All layers failed');
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'tel-link',
            error: 'No tel links found in search area',
            layer: 'all-failed',
            searchArea: expandedArea,
            totalTelLinksOnPage: allTelLinks.length,
            centerText: centerElement?.textContent?.trim()?.slice(0, 50),
            suggestion: 'Try selecting the phone number directly or use regex-phone method'
          }
        };

      }, absoluteCoords);

      console.log('[PhoneExtractor] tel-link result:', result.value ? 'SUCCESS' : 'FAILED');

      return result;

    } catch (error) {
      console.error('[PhoneExtractor] Tel extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'tel-link',
          error: error.message
        }
      };
    }
  }

  /**
   * Normalize phone number to consistent format
   * @param {string} phone - Raw phone string
   * @returns {string} - Normalized phone
   */
  normalizePhone(phone) {
    // Remove all non-digit characters except +
    let digits = phone.replace(/[^\d+]/g, '');

    // Remove leading + if present, track it
    const hasPlus = digits.startsWith('+');
    if (hasPlus) {
      digits = digits.substring(1);
    }

    // Format as +1-XXX-XXX-XXXX for US numbers
    if (digits.length === 10) {
      return `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    } else if (digits.length > 10) {
      // International number - keep as is but format with +
      return '+' + digits;
    }

    // Return original if can't normalize
    return phone;
  }
}

module.exports = PhoneExtractor;
