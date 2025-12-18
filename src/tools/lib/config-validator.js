/**
 * Config Validator
 *
 * Validates site-specific configurations by testing selectors
 * against the actual page and verifying extraction works.
 */

class ConfigValidator {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Validate a configuration against a live page
   * @param {Object} page - Puppeteer page
   * @param {Object} config - Configuration to validate
   * @returns {Promise<Object>} - Validation results
   */
  async validate(page, config) {
    const results = {
      valid: true,
      timestamp: new Date().toISOString(),
      selectors: {},
      extraction: null,
      pagination: null,
      issues: [],
      warnings: []
    };

    // 1. Validate card selector
    this.logger.info('Validating card selector...');
    results.selectors.card = await this.validateCardSelector(page, config);

    if (!results.selectors.card.valid) {
      results.valid = false;
      results.issues.push(`Card selector failed: ${results.selectors.card.error}`);
    }

    // 2. Validate field selectors
    this.logger.info('Validating field selectors...');
    results.selectors.fields = await this.validateFieldSelectors(page, config);

    for (const [field, fieldResult] of Object.entries(results.selectors.fields)) {
      if (!fieldResult.valid && fieldResult.required) {
        results.issues.push(`${field} selector failed: ${fieldResult.error}`);
      } else if (!fieldResult.valid) {
        results.warnings.push(`${field} selector may not work: ${fieldResult.error}`);
      }
    }

    // 3. Test extraction
    this.logger.info('Testing extraction...');
    results.extraction = await this.testExtraction(page, config);

    if (results.extraction.contactCount === 0) {
      results.warnings.push('No contacts extracted - config may need adjustment');
    }

    // 4. Validate pagination if configured
    if (config.pagination?.enabled) {
      this.logger.info('Validating pagination...');
      results.pagination = await this.validatePagination(page, config);

      if (!results.pagination.valid) {
        results.warnings.push(`Pagination validation: ${results.pagination.error}`);
      }
    }

    // Update overall validity
    results.valid = results.issues.length === 0;

    return results;
  }

  /**
   * Validate card selector
   * Supports both v1.x (selectors.card) and v2.3 (cardPattern.primarySelector) formats
   * @param {Object} page - Puppeteer page
   * @param {Object} config - Configuration
   * @returns {Promise<Object>} - Card validation result
   */
  async validateCardSelector(page, config) {
    // Support both v2.3 and legacy config formats
    const selector = config.cardPattern?.primarySelector ||
                    config.cardPattern?.selector ||
                    config.selectors?.card;

    if (!selector) {
      return {
        valid: false,
        error: 'No card selector defined (checked cardPattern.primarySelector and selectors.card)',
        matchCount: 0
      };
    }

    try {
      const count = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length;
      }, selector);

      if (count === 0) {
        return {
          valid: false,
          error: 'Selector matches no elements',
          matchCount: 0,
          selector: selector
        };
      }

      return {
        valid: true,
        matchCount: count,
        selector: selector
      };
    } catch (error) {
      return {
        valid: false,
        error: `Selector error: ${error.message}`,
        matchCount: 0,
        selector: selector
      };
    }
  }

  /**
   * Validate field selectors
   * Supports both v1.x (selectors.fields) and v2.3 (fields) formats
   * @param {Object} page - Puppeteer page
   * @param {Object} config - Configuration
   * @returns {Promise<Object>} - Field validation results
   */
  async validateFieldSelectors(page, config) {
    const results = {};
    // Support both v2.3 and legacy config formats
    const cardSelector = config.cardPattern?.primarySelector ||
                        config.cardPattern?.selector ||
                        config.selectors?.card;

    // v2.3 uses config.fields directly, legacy uses config.selectors.fields
    // For v2.3, field selectors are in config.fields[fieldName].selector
    let fields = {};
    if (config.fields) {
      // v2.3 format - extract selectors from fields object
      for (const [fieldName, fieldConfig] of Object.entries(config.fields)) {
        if (fieldConfig.selector) {
          fields[fieldName] = fieldConfig.selector;
        }
      }
    } else if (config.selectors?.fields) {
      // Legacy format
      fields = config.selectors.fields;
    }

    for (const [fieldName, fieldSelector] of Object.entries(fields)) {
      if (!fieldSelector) {
        results[fieldName] = {
          valid: false,
          error: 'No selector defined',
          required: fieldName === 'name' || fieldName === 'email'
        };
        continue;
      }

      try {
        // Test selector within card context
        const fieldResult = await page.evaluate(
          (cardSel, fieldSel) => {
            const card = document.querySelector(cardSel);
            if (!card) return { found: false, error: 'Card not found' };

            const field = card.querySelector(fieldSel);
            if (!field) {
              // Try as full selector
              const fullMatch = document.querySelector(fieldSel);
              return {
                found: !!fullMatch,
                inCard: false,
                text: fullMatch?.textContent?.trim().substring(0, 100) || null
              };
            }

            return {
              found: true,
              inCard: true,
              text: field.textContent?.trim().substring(0, 100) || null
            };
          },
          cardSelector,
          fieldSelector
        );

        if (!fieldResult.found) {
          results[fieldName] = {
            valid: false,
            error: fieldResult.error || 'Selector matches no elements in card',
            selector: fieldSelector,
            required: fieldName === 'name' || fieldName === 'email'
          };
        } else {
          results[fieldName] = {
            valid: true,
            inCard: fieldResult.inCard,
            sampleText: fieldResult.text,
            selector: fieldSelector,
            required: fieldName === 'name' || fieldName === 'email'
          };
        }
      } catch (error) {
        results[fieldName] = {
          valid: false,
          error: `Selector error: ${error.message}`,
          selector: fieldSelector,
          required: fieldName === 'name' || fieldName === 'email'
        };
      }
    }

    return results;
  }

  /**
   * Test extraction with config
   * Supports both v1.x and v2.3 config formats
   * @param {Object} page - Puppeteer page
   * @param {Object} config - Configuration
   * @returns {Promise<Object>} - Extraction test results
   */
  async testExtraction(page, config) {
    try {
      // Prepare config info for page.evaluate (it can't access closures)
      const cardSelector = config.cardPattern?.primarySelector ||
                          config.cardPattern?.selector ||
                          config.selectors?.card;

      // Extract field selectors
      let fields = {};
      if (config.fields) {
        for (const [fieldName, fieldConfig] of Object.entries(config.fields)) {
          if (fieldConfig.selector) {
            fields[fieldName] = fieldConfig.selector;
          }
        }
      } else if (config.selectors?.fields) {
        fields = config.selectors.fields;
      }

      const contacts = await page.evaluate((selector, fieldMap) => {
        const cards = document.querySelectorAll(selector);
        const results = [];

        for (let i = 0; i < Math.min(cards.length, 5); i++) {
          const card = cards[i];
          const contact = {};

          for (const [fieldName, fieldSelector] of Object.entries(fieldMap)) {
            if (!fieldSelector) continue;

            const field = card.querySelector(fieldSelector);
            if (field) {
              contact[fieldName] = field.textContent?.trim() || null;
            }
          }

          if (Object.keys(contact).length > 0) {
            results.push(contact);
          }
        }

        return results;
      }, cardSelector, fields);

      // Analyze extraction quality
      const analysis = this.analyzeExtractionQuality(contacts, config);

      return {
        success: contacts.length > 0,
        contactCount: contacts.length,
        sample: contacts,
        analysis: analysis
      };
    } catch (error) {
      return {
        success: false,
        contactCount: 0,
        error: error.message,
        sample: []
      };
    }
  }

  /**
   * Analyze extraction quality
   * @param {Array} contacts - Extracted contacts
   * @param {Object} config - Configuration
   * @returns {Object} - Quality analysis
   */
  analyzeExtractionQuality(contacts, config) {
    if (!contacts || contacts.length === 0) {
      return {
        quality: 'none',
        score: 0,
        issues: ['No contacts extracted']
      };
    }

    const issues = [];
    let score = 100;

    // Check field completeness
    const withName = contacts.filter(c => c.name && c.name.length > 0).length;
    const withEmail = contacts.filter(c => c.email && c.email.length > 0).length;
    const withPhone = contacts.filter(c => c.phone && c.phone.length > 0).length;

    const nameRate = (withName / contacts.length) * 100;
    const emailRate = (withEmail / contacts.length) * 100;
    const phoneRate = (withPhone / contacts.length) * 100;

    if (nameRate < 50) {
      score -= 20;
      issues.push(`Low name extraction rate: ${nameRate.toFixed(0)}%`);
    }

    if (emailRate < 30) {
      score -= 15;
      issues.push(`Low email extraction rate: ${emailRate.toFixed(0)}%`);
    }

    // Check for valid email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = contacts.filter(c => c.email && emailRegex.test(c.email)).length;

    if (withEmail > 0 && validEmails < withEmail) {
      score -= 10;
      issues.push('Some extracted emails appear invalid');
    }

    // Determine quality level
    let quality;
    if (score >= 80) {
      quality = 'high';
    } else if (score >= 50) {
      quality = 'medium';
    } else {
      quality = 'low';
    }

    return {
      quality: quality,
      score: Math.max(0, score),
      completeness: {
        name: nameRate.toFixed(1) + '%',
        email: emailRate.toFixed(1) + '%',
        phone: phoneRate.toFixed(1) + '%'
      },
      issues: issues
    };
  }

  /**
   * Validate pagination configuration
   * @param {Object} page - Puppeteer page
   * @param {Object} config - Configuration
   * @returns {Promise<Object>} - Pagination validation result
   */
  async validatePagination(page, config) {
    const pagination = config.pagination;

    if (!pagination?.enabled) {
      return { valid: true, type: 'none', enabled: false };
    }

    if (pagination.type === 'infinite-scroll') {
      return await this.validateInfiniteScroll(page, config);
    } else if (pagination.type === 'traditional') {
      return await this.validateTraditionalPagination(page, config);
    }

    return { valid: true, type: pagination.type, enabled: true };
  }

  /**
   * Validate infinite scroll configuration
   * @param {Object} page - Puppeteer page
   * @param {Object} config - Configuration
   * @returns {Promise<Object>} - Validation result
   */
  async validateInfiniteScroll(page, config) {
    const settings = config.pagination?.settings || {};
    const contentSelector = settings.contentSelector || config.selectors?.card;

    try {
      // Get initial count
      const initialCount = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length;
      }, contentSelector);

      // Scroll down
      await page.evaluate(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth'
        });
      });

      // Wait for potential content load
      await page.waitForTimeout(3000);

      // Check new count
      const afterCount = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length;
      }, contentSelector);

      const scrollWorked = afterCount > initialCount;

      // Scroll back to top
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
      });

      return {
        valid: true,
        type: 'infinite-scroll',
        enabled: true,
        scrollWorking: scrollWorked,
        initialCount: initialCount,
        afterScrollCount: afterCount,
        newItemsLoaded: afterCount - initialCount
      };
    } catch (error) {
      return {
        valid: false,
        type: 'infinite-scroll',
        enabled: true,
        error: error.message
      };
    }
  }

  /**
   * Validate traditional pagination
   * @param {Object} page - Puppeteer page
   * @param {Object} config - Configuration
   * @returns {Promise<Object>} - Validation result
   */
  async validateTraditionalPagination(page, config) {
    const settings = config.pagination?.settings || {};
    const nextSelector = settings.nextSelector;

    if (!nextSelector) {
      return {
        valid: false,
        type: 'traditional',
        enabled: true,
        error: 'No next page selector defined'
      };
    }

    try {
      const nextButtonExists = await page.evaluate((sel) => {
        const btn = document.querySelector(sel);
        return {
          exists: !!btn,
          visible: btn ? btn.offsetParent !== null : false,
          href: btn?.href || null,
          text: btn?.textContent?.trim() || null
        };
      }, nextSelector);

      return {
        valid: nextButtonExists.exists,
        type: 'traditional',
        enabled: true,
        nextButton: nextButtonExists
      };
    } catch (error) {
      return {
        valid: false,
        type: 'traditional',
        enabled: true,
        error: error.message
      };
    }
  }

  /**
   * Generate validation report
   * @param {Object} results - Validation results
   * @returns {string} - Formatted report
   */
  generateReport(results) {
    let report = '\n';
    report += '═'.repeat(60) + '\n';
    report += '  CONFIG VALIDATION REPORT\n';
    report += '═'.repeat(60) + '\n\n';

    // Overall status
    const status = results.valid ? '✓ VALID' : '✗ INVALID';
    report += `Status: ${status}\n`;
    report += `Timestamp: ${results.timestamp}\n\n`;

    // Card selector
    report += '─ Card Selector ─\n';
    if (results.selectors.card?.valid) {
      report += `  ✓ Matches ${results.selectors.card.matchCount} elements\n`;
    } else {
      report += `  ✗ ${results.selectors.card?.error || 'Invalid'}\n`;
    }
    report += '\n';

    // Field selectors
    report += '─ Field Selectors ─\n';
    for (const [field, result] of Object.entries(results.selectors.fields || {})) {
      if (result.valid) {
        report += `  ✓ ${field}: Working`;
        if (result.sampleText) {
          report += ` ("${result.sampleText.substring(0, 30)}...")`;
        }
        report += '\n';
      } else {
        report += `  ✗ ${field}: ${result.error}\n`;
      }
    }
    report += '\n';

    // Extraction test
    report += '─ Extraction Test ─\n';
    if (results.extraction) {
      report += `  Contacts found: ${results.extraction.contactCount}\n`;
      if (results.extraction.analysis) {
        report += `  Quality: ${results.extraction.analysis.quality} (${results.extraction.analysis.score}/100)\n`;
      }
    }
    report += '\n';

    // Issues and warnings
    if (results.issues?.length > 0) {
      report += '─ Issues ─\n';
      results.issues.forEach(issue => {
        report += `  ✗ ${issue}\n`;
      });
      report += '\n';
    }

    if (results.warnings?.length > 0) {
      report += '─ Warnings ─\n';
      results.warnings.forEach(warning => {
        report += `  ⚠ ${warning}\n`;
      });
      report += '\n';
    }

    report += '═'.repeat(60) + '\n';

    return report;
  }
}

module.exports = ConfigValidator;
