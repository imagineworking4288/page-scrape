/**
 * Config Builder
 *
 * Builds site-specific configuration files from interactive selections.
 * Supports traditional pagination configurations.
 */

const fs = require('fs');
const path = require('path');

class ConfigBuilder {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.outputDir = options.outputDir || 'configs';
  }

  /**
   * Build configuration object from selections
   * @param {Object} selections - User's element selections
   * @param {Object} metadata - Site metadata
   * @returns {Object} - Configuration object
   */
  buildConfig(selections, metadata) {
    const config = {
      // Metadata
      name: this.generateConfigName(metadata.url),
      version: '1.0',
      createdAt: new Date().toISOString(),
      sourceUrl: metadata.url,
      domain: metadata.domain,

      // Selectors
      selectors: {
        // Card container (the repeating element containing contact info)
        card: selections.cardSelector,

        // Field selectors (relative to card)
        fields: {
          name: selections.nameSelector || null,
          email: selections.emailSelector || null,
          phone: selections.phoneSelector || null
        }
      },

      // Pagination configuration
      pagination: this.buildPaginationConfig(selections, metadata),

      // Extraction settings
      extraction: {
        // Wait for dynamic content
        waitFor: selections.cardSelector,
        waitTimeout: 10000,

        // Additional extraction options
        stripHtml: true,
        trimWhitespace: true,
        deduplicateBy: 'email'
      },

      // Site-specific options
      options: {
        // Rate limiting
        minDelay: 2000,
        maxDelay: 5000,

        // Scroll behavior (for infinite scroll sites)
        scrollDelay: selections.infiniteScroll?.detected ? 2000 : 0,
        scrollIncrement: selections.infiniteScroll?.detected ? 800 : 0,

        // Browser settings
        userAgent: null, // Use default
        viewport: { width: 1920, height: 1080 }
      }
    };

    // Add custom fields if any
    if (selections.customFields && Object.keys(selections.customFields).length > 0) {
      config.selectors.fields.custom = selections.customFields;
    }

    // Add notes
    config.notes = this.generateNotes(selections, metadata);

    return config;
  }

  /**
   * Build pagination configuration
   * @param {Object} selections - User selections
   * @param {Object} metadata - Site metadata
   * @returns {Object} - Pagination config
   */
  buildPaginationConfig(selections, metadata) {
    // Check for infinite scroll
    if (selections.infiniteScroll?.detected) {
      return {
        type: 'infinite-scroll',
        enabled: true,
        settings: {
          // Scroll behavior
          scrollContainer: selections.infiniteScroll.scrollContainer || 'window',
          scrollIncrement: 800,
          scrollDelay: 2000,
          maxScrollAttempts: selections.infiniteScroll.maxScrolls || 50,

          // Detection settings
          contentSelector: selections.cardSelector,
          noNewContentThreshold: 3, // Stop after 3 scrolls with no new content
          loadingIndicator: selections.infiniteScroll.loadingIndicator || null,

          // Timing
          waitAfterScroll: 2000,
          waitForNetworkIdle: true
        },
        // Estimated total (from detection)
        estimatedCards: selections.infiniteScroll.estimatedTotal || null
      };
    }

    // Check for traditional pagination
    if (selections.paginationSelector) {
      return {
        type: 'traditional',
        enabled: true,
        settings: {
          // Next button/link selector
          nextSelector: selections.paginationSelector,

          // Alternative: page number pattern
          urlPattern: selections.paginationPattern || null,

          // Limits
          maxPages: 100,
          stopOnEmpty: true
        }
      };
    }

    // No pagination detected
    return {
      type: 'none',
      enabled: false,
      settings: {}
    };
  }

  /**
   * Generate config name from URL
   * @param {string} url - Source URL
   * @returns {string} - Config name
   */
  generateConfigName(url) {
    try {
      const urlObj = new URL(url);
      let name = urlObj.hostname
        .replace(/^www\./, '')
        .replace(/\.[^.]+$/, '') // Remove TLD
        .replace(/[^a-z0-9]/gi, '-');

      // Add path hint if present
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      if (pathParts.length > 0) {
        const pathHint = pathParts[pathParts.length - 1]
          .replace(/[^a-z0-9]/gi, '-')
          .substring(0, 20);
        if (pathHint && pathHint.length > 2) {
          name += `-${pathHint}`;
        }
      }

      return name.toLowerCase();
    } catch (error) {
      return 'site-config';
    }
  }

  /**
   * Generate notes for the config
   * @param {Object} selections - User selections
   * @param {Object} metadata - Site metadata
   * @returns {Array} - Notes array
   */
  generateNotes(selections, metadata) {
    const notes = [];

    notes.push(`Config generated on ${new Date().toLocaleString()}`);
    notes.push(`Source: ${metadata.url}`);

    if (selections.infiniteScroll?.detected) {
      notes.push('Site uses infinite scroll pagination');
      notes.push(`Initial cards detected: ${selections.infiniteScroll.initialCount || 'unknown'}`);
      if (selections.infiniteScroll.confidence) {
        notes.push(`Detection confidence: ${selections.infiniteScroll.confidence}`);
      }
    }

    if (selections.paginationSelector) {
      notes.push('Site uses traditional pagination');
    }

    if (!selections.nameSelector) {
      notes.push('WARNING: No name selector defined');
    }

    if (!selections.emailSelector) {
      notes.push('WARNING: No email selector defined');
    }

    return notes;
  }

  /**
   * Save configuration to file
   * @param {Object} config - Configuration object
   * @param {string} outputDir - Output directory (optional override)
   * @returns {string} - Path to saved file
   */
  saveConfig(config, outputDir = null) {
    const dir = outputDir || this.outputDir;

    // Ensure directory exists
    const fullDir = path.resolve(dir);
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    // Generate filename
    const filename = `${config.name}.json`;
    const filepath = path.join(fullDir, filename);

    // Check for existing file
    if (fs.existsSync(filepath)) {
      // Create backup
      const backupPath = filepath.replace('.json', `.backup-${Date.now()}.json`);
      fs.copyFileSync(filepath, backupPath);
      this.logger.info(`Existing config backed up to: ${backupPath}`);
    }

    // Write config
    fs.writeFileSync(filepath, JSON.stringify(config, null, 2));
    this.logger.info(`Config saved to: ${filepath}`);

    return filepath;
  }

  /**
   * Generate JavaScript config format (alternative to JSON)
   * @param {Object} config - Configuration object
   * @returns {string} - JavaScript module content
   */
  generateJsConfig(config) {
    const jsContent = `/**
 * Site Configuration: ${config.name}
 * Generated: ${config.createdAt}
 * Source: ${config.sourceUrl}
 */

module.exports = ${JSON.stringify(config, null, 2)};
`;
    return jsContent;
  }

  /**
   * Validate configuration completeness
   * @param {Object} config - Configuration to validate
   * @returns {Object} - Validation result
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!config.selectors?.card) {
      errors.push('Missing card selector');
    }

    // Recommended fields
    if (!config.selectors?.fields?.name) {
      warnings.push('No name selector - names may not be extracted');
    }

    if (!config.selectors?.fields?.email) {
      warnings.push('No email selector - emails may not be extracted');
    }

    if (!config.selectors?.fields?.phone) {
      warnings.push('No phone selector - phones may not be extracted');
    }

    // Pagination validation
    if (config.pagination?.type === 'infinite-scroll') {
      if (!config.pagination.settings?.contentSelector) {
        warnings.push('Infinite scroll missing content selector');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      score: this.calculateConfigScore(config, errors, warnings)
    };
  }

  /**
   * Calculate a quality score for the config
   * @param {Object} config - Configuration
   * @param {Array} errors - Validation errors
   * @param {Array} warnings - Validation warnings
   * @returns {number} - Score 0-100
   */
  calculateConfigScore(config, errors, warnings) {
    let score = 100;

    // Deduct for errors
    score -= errors.length * 30;

    // Deduct for warnings
    score -= warnings.length * 10;

    // Bonus for completeness
    if (config.selectors?.fields?.name) score += 5;
    if (config.selectors?.fields?.email) score += 5;
    if (config.selectors?.fields?.phone) score += 5;

    // Bonus for pagination config
    if (config.pagination?.enabled) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Merge new selections into existing config
   * @param {Object} existingConfig - Existing configuration
   * @param {Object} newSelections - New selections to merge
   * @returns {Object} - Merged configuration
   */
  mergeConfig(existingConfig, newSelections) {
    const merged = JSON.parse(JSON.stringify(existingConfig));

    // Update selectors if provided
    if (newSelections.cardSelector) {
      merged.selectors.card = newSelections.cardSelector;
    }

    if (newSelections.nameSelector) {
      merged.selectors.fields.name = newSelections.nameSelector;
    }

    if (newSelections.emailSelector) {
      merged.selectors.fields.email = newSelections.emailSelector;
    }

    if (newSelections.phoneSelector) {
      merged.selectors.fields.phone = newSelections.phoneSelector;
    }

    // Update pagination
    if (newSelections.infiniteScroll?.detected) {
      merged.pagination = this.buildPaginationConfig(newSelections, {});
    }

    // Update metadata
    merged.updatedAt = new Date().toISOString();
    merged.version = this.incrementVersion(merged.version);

    return merged;
  }

  /**
   * Increment version number
   * @param {string} version - Current version
   * @returns {string} - New version
   */
  incrementVersion(version) {
    if (!version) return '1.1';

    const parts = version.split('.');
    if (parts.length === 2) {
      const minor = parseInt(parts[1]) + 1;
      return `${parts[0]}.${minor}`;
    }

    return `${version}.1`;
  }

  /**
   * Generate a sample extraction test command
   * @param {Object} config - Configuration
   * @returns {string} - CLI command
   */
  generateTestCommand(config) {
    let cmd = `node orchestrator.js --url "${config.sourceUrl}" --method select`;

    if (config.pagination?.enabled) {
      cmd += ' --paginate';

      if (config.pagination.type === 'infinite-scroll') {
        cmd += ' --scroll';
      }

      cmd += ' --max-pages 3';
    }

    cmd += ' --limit 10';

    return cmd;
  }

  /**
   * Export config summary for display
   * @param {Object} config - Configuration
   * @returns {Object} - Summary object
   */
  getSummary(config) {
    return {
      name: config.name,
      domain: config.domain,
      cardSelector: config.selectors?.card,
      fields: {
        name: config.selectors?.fields?.name ? 'Defined' : 'Not set',
        email: config.selectors?.fields?.email ? 'Defined' : 'Not set',
        phone: config.selectors?.fields?.phone ? 'Defined' : 'Not set'
      },
      pagination: config.pagination?.type || 'none',
      paginationEnabled: config.pagination?.enabled || false,
      infiniteScroll: config.pagination?.type === 'infinite-scroll'
    };
  }
}

module.exports = ConfigBuilder;
