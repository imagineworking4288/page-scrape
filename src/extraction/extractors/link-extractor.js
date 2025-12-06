/**
 * Link/Href Extractor v2.3
 *
 * Finds <a> tags and href attributes in rectangle area.
 * Extracts profile URLs and other link references.
 */

class LinkExtractor {
  constructor(page) {
    this.page = page;
  }

  /**
   * Extract link/URL from rectangle coordinates
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

      const links = await this.page.evaluate((coords) => {
        const foundLinks = [];
        const centerX = coords.x + coords.width / 2;
        const centerY = coords.y + coords.height / 2;

        // Get elements at center point
        const elements = document.elementsFromPoint(centerX, centerY);

        // Find all <a> tags in stack
        for (const el of elements) {
          if (el.tagName === 'A' && el.href) {
            // Skip mailto and tel links
            if (el.href.startsWith('mailto:') || el.href.startsWith('tel:')) {
              continue;
            }

            foundLinks.push({
              href: el.href,
              text: el.textContent.trim(),
              rel: el.rel || '',
              target: el.target || '',
              directHit: true
            });
          }

          // Also check children for links
          const childLinks = el.querySelectorAll('a[href]');
          for (const link of childLinks) {
            // Skip mailto and tel links
            if (link.href.startsWith('mailto:') || link.href.startsWith('tel:')) {
              continue;
            }

            const rect = link.getBoundingClientRect();

            // Check if link intersects the target rectangle
            if (rect.right >= coords.x && rect.left <= coords.x + coords.width &&
                rect.bottom >= coords.y && rect.top <= coords.y + coords.height) {
              foundLinks.push({
                href: link.href,
                text: link.textContent.trim(),
                rel: link.rel || '',
                target: link.target || '',
                directHit: false
              });
            }
          }
        }

        // Deduplicate by href
        const seen = new Set();
        return foundLinks.filter(link => {
          if (seen.has(link.href)) return false;
          seen.add(link.href);
          return true;
        });
      }, absoluteCoords);

      if (links.length === 0) {
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'href-link',
            error: 'No links found in rectangle'
          }
        };
      }

      // Score and rank links
      const scoredLinks = links.map(link => ({
        ...link,
        score: this.scoreLink(link)
      }));

      // Sort by score (highest first)
      scoredLinks.sort((a, b) => b.score - a.score);

      const bestLink = scoredLinks[0];

      return {
        value: bestLink.href,
        confidence: Math.min(100, bestLink.score),
        metadata: {
          method: 'href-link',
          linkText: bestLink.text,
          totalLinks: links.length,
          allLinks: scoredLinks.slice(0, 5).map(l => ({
            href: l.href,
            text: l.text,
            score: l.score
          })),
          directHit: bestLink.directHit
        }
      };

    } catch (error) {
      console.error('[LinkExtractor] Extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'href-link',
          error: error.message
        }
      };
    }
  }

  /**
   * Score a link based on likelihood of being a profile URL
   * @param {Object} link - Link data { href, text, rel, target, directHit }
   * @returns {number} - Score 0-100
   */
  scoreLink(link) {
    let score = 70; // Base score

    const hrefLower = link.href.toLowerCase();
    const textLower = link.text.toLowerCase();

    // Boost for profile-related URLs
    if (hrefLower.includes('/profile') ||
        hrefLower.includes('/lawyer') ||
        hrefLower.includes('/attorney') ||
        hrefLower.includes('/people/') ||
        hrefLower.includes('/bio') ||
        hrefLower.includes('/team/') ||
        hrefLower.includes('/staff/') ||
        hrefLower.includes('/about/')) {
      score += 15;
    }

    // Boost for profile-related link text
    if (textLower.includes('profile') ||
        textLower.includes('view') ||
        textLower.includes('bio') ||
        textLower.includes('more') ||
        textLower.includes('details')) {
      score += 10;
    }

    // Boost if text looks like a name (2-4 capitalized words)
    const words = link.text.trim().split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      const looksLikeName = words.every(w => /^[A-Z][a-z]+$/.test(w));
      if (looksLikeName) {
        score += 15;
      }
    }

    // Boost for direct hit (element was directly at click point)
    if (link.directHit) {
      score += 5;
    }

    // Penalize for generic/navigation links
    if (hrefLower.includes('javascript:') ||
        hrefLower === '#' ||
        textLower.includes('menu') ||
        textLower.includes('navigation') ||
        textLower.includes('home')) {
      score -= 30;
    }

    // Penalize for social media links (usually not profile URLs we want)
    if (hrefLower.includes('linkedin.com') ||
        hrefLower.includes('twitter.com') ||
        hrefLower.includes('facebook.com')) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Extract data attribute values from region
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates within card
   * @returns {Object} {value, confidence, metadata}
   */
  async extractDataAttribute(cardElement, fieldCoords) {
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

      const result = await this.page.evaluate((coords) => {
        const centerX = coords.x + coords.width / 2;
        const centerY = coords.y + coords.height / 2;
        const elements = document.elementsFromPoint(centerX, centerY);

        // Data attributes we're interested in
        const urlAttributes = [
          'data-url',
          'data-href',
          'data-link',
          'data-profile-url',
          'data-profile',
          'data-bio-url'
        ];

        for (const el of elements) {
          for (const attr of urlAttributes) {
            const value = el.getAttribute(attr);
            if (value && (value.startsWith('/') || value.startsWith('http'))) {
              return {
                found: true,
                value: value,
                attribute: attr,
                tagName: el.tagName
              };
            }
          }
        }

        return { found: false };
      }, absoluteCoords);

      if (!result.found) {
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'data-attribute',
            error: 'No URL data attribute found'
          }
        };
      }

      // Convert relative URL to absolute if needed
      let url = result.value;
      if (url.startsWith('/')) {
        const pageUrl = this.page.url();
        const baseUrl = new URL(pageUrl).origin;
        url = baseUrl + url;
      }

      return {
        value: url,
        confidence: 85,
        metadata: {
          method: 'data-attribute',
          attribute: result.attribute,
          tagName: result.tagName
        }
      };

    } catch (error) {
      console.error('[LinkExtractor] Data attribute extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'data-attribute',
          error: error.message
        }
      };
    }
  }
}

module.exports = LinkExtractor;
