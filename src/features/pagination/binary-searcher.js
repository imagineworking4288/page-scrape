/**
 * Binary Searcher
 *
 * Finds the true maximum page number using binary search algorithm.
 * Confirms boundaries by testing consecutive empty pages.
 */

const crypto = require('crypto');

class BinarySearcher {
  constructor(logger, rateLimiter) {
    this.logger = logger;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Find the true maximum page using binary search
   * @param {object} page - Puppeteer page object
   * @param {object} pattern - Pagination pattern object
   * @param {function} urlGenerator - Function to generate page URLs
   * @param {number|null} visualMax - Max page from visual detection (hint)
   * @param {number} minContacts - Minimum contacts to consider page valid
   * @param {number} hardCap - Maximum pages to search (default: 200)
   * @returns {Promise<object>} - {trueMax, isCapped, testedPages, searchPath, boundaryConfirmed}
   */
  async findTrueMaxPage(page, pattern, urlGenerator, visualMax, minContacts, hardCap = 200) {
    try {
      this.logger.info('[BinarySearcher] Starting binary search for true max page...');

      let lowerBound = 1;
      let upperBound = visualMax || hardCap;
      let lastValidPage = null;
      const testedPages = [];
      const searchPath = [];

      // Step 1: Test page 1 first
      this.logger.info('[BinarySearcher] Testing page 1...');
      const page1Valid = await this._testPageValidity(page, urlGenerator, 1, minContacts);
      testedPages.push({ pageNum: 1, valid: page1Valid.hasContacts, contacts: page1Valid.contactCount });

      if (!page1Valid.hasContacts) {
        searchPath.push('Page 1 has no contacts - no pagination');
        this.logger.warn('[BinarySearcher] Page 1 has no contacts');
        return {
          trueMax: 0,
          isCapped: false,
          testedPages,
          searchPath,
          boundaryConfirmed: true
        };
      }

      lastValidPage = 1;
      searchPath.push(`Page 1 valid (${page1Valid.contactCount} contacts)`);

      // Step 2: Test visual max if available
      if (visualMax && visualMax > 1) {
        this.logger.info(`[BinarySearcher] Testing visual max page: ${visualMax}`);
        const visualMaxValid = await this._testPageValidity(page, urlGenerator, visualMax, minContacts);
        testedPages.push({ pageNum: visualMax, valid: visualMaxValid.hasContacts, contacts: visualMaxValid.contactCount });

        await this.rateLimiter.waitBeforeRequest();

        if (visualMaxValid.hasContacts) {
          lowerBound = visualMax;
          lastValidPage = visualMax;
          searchPath.push(`Visual max ${visualMax} valid (${visualMaxValid.contactCount} contacts), searching forward`);
          this.logger.info(`[BinarySearcher] Visual max ${visualMax} is valid, searching forward...`);
        } else {
          upperBound = visualMax - 1;
          searchPath.push(`Visual max ${visualMax} invalid, searching backward`);
          this.logger.info(`[BinarySearcher] Visual max ${visualMax} is invalid, searching backward...`);
        }
      }

      // Step 3: Binary search loop
      let iterations = 0;
      const maxIterations = 20;

      while (lowerBound <= upperBound && upperBound <= hardCap && iterations < maxIterations) {
        iterations++;

        const mid = Math.floor((lowerBound + upperBound) / 2);

        // Skip if already tested
        if (testedPages.some(p => p.pageNum === mid)) {
          if (mid === lowerBound) {
            lowerBound++;
          } else if (mid === upperBound) {
            upperBound--;
          } else {
            lowerBound = mid + 1;
          }
          continue;
        }

        this.logger.info(`[BinarySearcher] Binary search iteration ${iterations}: testing page ${mid} (bounds: ${lowerBound}-${upperBound})`);

        const midValid = await this._testPageValidity(page, urlGenerator, mid, minContacts);
        testedPages.push({ pageNum: mid, valid: midValid.hasContacts, contacts: midValid.contactCount });

        await this.rateLimiter.waitBeforeRequest();

        if (midValid.hasContacts) {
          lastValidPage = mid;
          lowerBound = mid + 1;
          searchPath.push(`Page ${mid} valid (${midValid.contactCount} contacts), search higher`);
          this.logger.info(`[BinarySearcher] Page ${mid} valid, continuing search higher...`);
        } else {
          upperBound = mid - 1;
          searchPath.push(`Page ${mid} empty, search lower`);
          this.logger.info(`[BinarySearcher] Page ${mid} empty, searching lower...`);
        }
      }

      // Step 4: Confirm boundary with 2 consecutive empty pages
      if (lastValidPage) {
        this.logger.info(`[BinarySearcher] Confirming boundary at page ${lastValidPage}...`);

        const next1 = await this._testPageValidity(page, urlGenerator, lastValidPage + 1, minContacts);
        testedPages.push({ pageNum: lastValidPage + 1, valid: next1.hasContacts, contacts: next1.contactCount });

        await this.rateLimiter.waitBeforeRequest();

        if (next1.hasContacts) {
          this.logger.info(`[BinarySearcher] Page ${lastValidPage + 1} is valid, extending search...`);
          lastValidPage = lastValidPage + 1;
          searchPath.push(`Page ${lastValidPage} valid (${next1.contactCount} contacts), extending search`);

          const next2 = await this._testPageValidity(page, urlGenerator, lastValidPage + 1, minContacts);
          testedPages.push({ pageNum: lastValidPage + 1, valid: next2.hasContacts, contacts: next2.contactCount });

          await this.rateLimiter.waitBeforeRequest();

          if (next2.hasContacts) {
            this.logger.info(`[BinarySearcher] Page ${lastValidPage + 1} also valid, continuing forward...`);
            searchPath.push(`Page ${lastValidPage + 1} valid (${next2.contactCount} contacts), continuing search`);

            // Recursive call with new lower bound
            const forwardResult = await this.findTrueMaxPage(
              page,
              pattern,
              urlGenerator,
              lastValidPage + 2,
              minContacts,
              hardCap
            );

            return {
              trueMax: forwardResult.trueMax,
              isCapped: forwardResult.isCapped,
              testedPages: [...testedPages, ...forwardResult.testedPages],
              searchPath: [...searchPath, ...forwardResult.searchPath],
              boundaryConfirmed: forwardResult.boundaryConfirmed
            };
          }
        }

        const next2 = await this._testPageValidity(page, urlGenerator, lastValidPage + 2, minContacts);
        testedPages.push({ pageNum: lastValidPage + 2, valid: next2.hasContacts, contacts: next2.contactCount });

        await this.rateLimiter.waitBeforeRequest();

        const isBoundaryConfirmed = !next1.hasContacts && !next2.hasContacts;

        if (isBoundaryConfirmed) {
          searchPath.push(`Boundary confirmed: pages ${lastValidPage + 1} and ${lastValidPage + 2} both empty`);
          this.logger.info(`[BinarySearcher] Boundary confirmed at page ${lastValidPage}`);
        } else {
          searchPath.push(`Boundary not fully confirmed (only 1 consecutive empty page)`);
          this.logger.warn(`[BinarySearcher] Boundary not fully confirmed at page ${lastValidPage}`);
        }

        return {
          trueMax: lastValidPage,
          isCapped: lastValidPage >= hardCap,
          boundaryConfirmed: isBoundaryConfirmed,
          testedPages,
          searchPath
        };
      }

      // Step 5: Handle hard cap
      if (lastValidPage >= hardCap) {
        this.logger.warn(`[BinarySearcher] Reached hard cap of ${hardCap} pages`);
        searchPath.push(`Reached hard cap at ${hardCap} pages`);
        return {
          trueMax: hardCap,
          isCapped: true,
          boundaryConfirmed: false,
          testedPages,
          searchPath
        };
      }

      return {
        trueMax: 0,
        isCapped: false,
        boundaryConfirmed: true,
        testedPages,
        searchPath
      };

    } catch (error) {
      this.logger.error(`[BinarySearcher] Fatal error: ${error.message}`);
      this.logger.error(error.stack);

      if (visualMax && visualMax > 0) {
        this.logger.warn(`[BinarySearcher] Falling back to visual max: ${visualMax}`);
        return {
          trueMax: visualMax,
          isCapped: false,
          boundaryConfirmed: false,
          testedPages: [],
          searchPath: [`Binary search failed: ${error.message}`, `Using visual max: ${visualMax}`],
          error: error.message
        };
      }

      this.logger.error('[BinarySearcher] No visual max available, defaulting to 1 page');
      return {
        trueMax: 1,
        isCapped: false,
        boundaryConfirmed: false,
        testedPages: [],
        searchPath: [`Binary search failed: ${error.message}`, 'Defaulting to 1 page'],
        error: error.message
      };
    }
  }

  /**
   * Test if a specific page number is valid (has contacts)
   * @param {object} page - Puppeteer page object
   * @param {function} urlGenerator - Function to generate page URL
   * @param {number} pageNum - Page number to test
   * @param {number} minContacts - Minimum contacts for validity
   * @returns {Promise<object>} - {hasContacts, contactCount, isEmpty, url, emailCount}
   * @private
   */
  async _testPageValidity(page, urlGenerator, pageNum, minContacts = 1) {
    try {
      const pageUrl = urlGenerator(pageNum);

      this.logger.debug(`[BinarySearcher] Testing page ${pageNum}: ${pageUrl}`);

      await page.goto(pageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await page.waitForTimeout(1000);

      const validation = await this._validatePage(page);

      return {
        hasContacts: validation.contactEstimate >= minContacts,
        contactCount: validation.contactEstimate,
        isEmpty: validation.contactEstimate === 0,
        url: pageUrl,
        emailCount: validation.emailCount
      };

    } catch (error) {
      this.logger.error(`[BinarySearcher] Error testing page ${pageNum}: ${error.message}`);
      return {
        hasContacts: false,
        contactCount: 0,
        isEmpty: true,
        url: null,
        error: error.message
      };
    }
  }

  /**
   * Validate page content
   * @param {object} page - Puppeteer page object
   * @returns {Promise<object>} - {hasContent, emailCount, contactEstimate, contentHash}
   * @private
   */
  async _validatePage(page) {
    try {
      const validation = await page.evaluate(() => {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const bodyText = document.body.innerText;
        const emails = bodyText.match(emailRegex) || [];
        const uniqueEmails = [...new Set(emails)];

        const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]').length;
        const contactEstimate = Math.max(mailtoLinks, uniqueEmails.length);

        const contentSample = bodyText.substring(0, 1000).replace(/\s+/g, ' ').trim();

        return {
          hasContent: bodyText.length > 100,
          emailCount: uniqueEmails.length,
          contactEstimate: contactEstimate,
          contentSample: contentSample
        };
      });

      const contentHash = crypto.createHash('md5').update(validation.contentSample).digest('hex');

      return {
        hasContent: validation.hasContent,
        emailCount: validation.emailCount,
        contactEstimate: validation.contactEstimate,
        contentHash: contentHash
      };

    } catch (error) {
      this.logger.error(`[BinarySearcher] Page validation error: ${error.message}`);
      return {
        hasContent: false,
        emailCount: 0,
        contactEstimate: 0,
        contentHash: null
      };
    }
  }
}

module.exports = BinarySearcher;
