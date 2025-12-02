/**
 * Config Builder v2.0
 *
 * Builds site-specific configuration files from visual card selection.
 * Supports both legacy v1.0 format and new v2.0 format with:
 * - Card pattern matching (structural + visual signatures)
 * - Smart field extraction rules
 * - Enhanced pagination support
 */

const fs = require('fs');
const path = require('path');

class ConfigBuilder {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.outputDir = options.outputDir || 'configs';
  }

  /**
   * Build v2.0 configuration from visual selection
   * @param {Object} matchResult - Result from CardMatcher.findSimilarCards()
   * @param {Object} extractionRules - Rules from SmartFieldExtractor
   * @param {Object} metadata - Site metadata
   * @returns {Object} - Configuration v2.0 object
   */
  buildConfigV2(matchResult, extractionRules, metadata) {
    const config = {
      // Metadata
      name: this.generateConfigName(metadata.url),
      version: '2.0',
      createdAt: new Date().toISOString(),
      sourceUrl: metadata.url,
      domain: metadata.domain,

      // Card pattern for matching
      cardPattern: this.buildCardPattern(matchResult),

      // Field extraction configuration
      fieldExtraction: extractionRules || this.getDefaultExtractionRules(),

      // Pagination configuration
      pagination: this.buildPaginationConfig(metadata.pagination || {}, metadata),

      // Extraction settings
      extraction: {
        waitFor: matchResult.selector,
        waitTimeout: 15000,
        scrollToLoad: true,
        stripHtml: true,
        trimWhitespace: true,
        deduplicateBy: 'email'
      },

      // Site-specific options
      options: {
        minDelay: 2000,
        maxDelay: 5000,
        userAgent: null,
        viewport: { width: 1920, height: 1080 }
      },

      // Detection statistics
      detectionStats: {
        totalCardsFound: matchResult.totalFound || 0,
        avgConfidence: this.calculateAverageConfidence(matchResult.matches || []),
        timestamp: new Date().toISOString()
      },

      // Notes
      notes: this.generateNotesV2(matchResult, metadata)
    };

    return config;
  }

  /**
   * Build card pattern from match result
   * @param {Object} matchResult - Result from CardMatcher
   * @returns {Object} - Card pattern configuration
   */
  buildCardPattern(matchResult) {
    const ref = matchResult.referenceElement || {};

    return {
      // CSS selector for finding cards
      selector: matchResult.selector || null,

      // Structural signature for matching
      structural: {
        tagName: ref.structural?.tagName || null,
        parentChain: ref.structural?.parentChain || [],
        childCount: ref.structural?.childCount || 0,
        childTags: ref.structural?.childTags || {},
        classPatterns: ref.structural?.classPatterns || [],
        hasLinks: ref.structural?.hasLinks || false,
        hasImages: ref.structural?.hasImages || false
      },

      // Visual properties for matching
      visual: {
        width: ref.visual?.box?.width || null,
        height: ref.visual?.box?.height || null,
        aspectRatio: ref.visual?.aspectRatio || null,
        display: ref.visual?.display || null
      },

      // Matching thresholds
      matching: {
        structuralWeight: 0.6,
        visualWeight: 0.4,
        minConfidence: 65
      }
    };
  }

  /**
   * Get default field extraction rules
   * @returns {Object} - Default extraction rules
   */
  getDefaultExtractionRules() {
    return {
      strategy: 'smart',
      contextWindow: 400,
      fields: {
        name: {
          required: true,
          selectors: ['[class*="name"]', 'h1', 'h2', 'h3', 'h4', 'strong'],
          validation: 'name'
        },
        email: {
          required: true,
          pattern: 'email',
          includeMailto: true
        },
        phone: {
          required: false,
          pattern: 'phone',
          includeTel: true,
          normalize: true
        },
        title: {
          required: false,
          selectors: ['[class*="title"]', '[class*="position"]', '[class*="role"]']
        },
        location: {
          required: false,
          selectors: ['[class*="location"]', '[class*="city"]', '[class*="address"]']
        },
        profileUrl: {
          required: false,
          urlPatterns: ['/profile/', '/people/', '/attorney/', '/staff/', '/bio/']
        },
        socialLinks: {
          required: false,
          platforms: ['linkedin', 'twitter', 'facebook', 'github']
        }
      }
    };
  }

  /**
   * Calculate average confidence from matches
   * @param {Array} matches - Array of match results
   * @returns {number} - Average confidence percentage
   */
  calculateAverageConfidence(matches) {
    if (!matches || matches.length === 0) return 0;
    const sum = matches.reduce((acc, m) => acc + (m.confidence || 0), 0);
    return Math.round(sum / matches.length);
  }

  /**
   * Generate notes for v2.0 config
   * @param {Object} matchResult - Match result
   * @param {Object} metadata - Site metadata
   * @returns {Array} - Notes array
   */
  generateNotesV2(matchResult, metadata) {
    const notes = [];

    notes.push(`Config v2.0 generated on ${new Date().toLocaleString()}`);
    notes.push(`Source: ${metadata.url}`);
    notes.push(`Cards detected: ${matchResult.totalFound || 0}`);

    if (matchResult.matches && matchResult.matches.length > 0) {
      const avgConf = this.calculateAverageConfidence(matchResult.matches);
      notes.push(`Average confidence: ${avgConf}%`);
    }

    if (matchResult.selector) {
      notes.push(`Card selector: ${matchResult.selector}`);
    }

    return notes;
  }

  /**
   * Build configuration object from selections (Legacy v1.0)
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
    // Handle both v1.0 and v2.0 configs
    if (config.version === '2.0') {
      return this.getSummaryV2(config);
    }

    return {
      name: config.name,
      domain: config.domain,
      version: config.version || '1.0',
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

  /**
   * Export v2.0 config summary for display
   * @param {Object} config - Configuration v2.0
   * @returns {Object} - Summary object
   */
  getSummaryV2(config) {
    return {
      name: config.name,
      domain: config.domain,
      version: '2.0',
      cardSelector: config.cardPattern?.selector,
      cardsDetected: config.detectionStats?.totalCardsFound || 0,
      avgConfidence: config.detectionStats?.avgConfidence || 0,
      fields: {
        name: config.fieldExtraction?.fields?.name ? 'Smart' : 'Not set',
        email: config.fieldExtraction?.fields?.email ? 'Smart' : 'Not set',
        phone: config.fieldExtraction?.fields?.phone ? 'Smart' : 'Not set',
        title: config.fieldExtraction?.fields?.title ? 'Smart' : 'Not set',
        location: config.fieldExtraction?.fields?.location ? 'Smart' : 'Not set',
        profileUrl: config.fieldExtraction?.fields?.profileUrl ? 'Smart' : 'Not set'
      },
      pagination: config.pagination?.type || 'none',
      paginationEnabled: config.pagination?.enabled || false
    };
  }

  /**
   * Validate v2.0 configuration completeness
   * @param {Object} config - Configuration v2.0 to validate
   * @returns {Object} - Validation result
   */
  validateConfigV2(config) {
    const errors = [];
    const warnings = [];

    // Required: card pattern
    if (!config.cardPattern?.selector) {
      errors.push('Missing card selector');
    }

    // Required: field extraction config
    if (!config.fieldExtraction) {
      errors.push('Missing field extraction configuration');
    }

    // Warnings for missing fields
    if (!config.fieldExtraction?.fields?.name) {
      warnings.push('No name extraction rule - names may not be extracted');
    }

    if (!config.fieldExtraction?.fields?.email) {
      warnings.push('No email extraction rule - emails may not be extracted');
    }

    // Check detection quality
    if (config.detectionStats?.avgConfidence < 50) {
      warnings.push('Low average confidence - config may need refinement');
    }

    if (config.detectionStats?.totalCardsFound < 2) {
      warnings.push('Only one card detected - verify card pattern is correct');
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      score: this.calculateConfigScoreV2(config, errors, warnings)
    };
  }

  /**
   * Calculate quality score for v2.0 config
   * @param {Object} config - Configuration v2.0
   * @param {Array} errors - Validation errors
   * @param {Array} warnings - Validation warnings
   * @returns {number} - Score 0-100
   */
  calculateConfigScoreV2(config, errors, warnings) {
    let score = 100;

    // Deduct for errors
    score -= errors.length * 30;

    // Deduct for warnings
    score -= warnings.length * 10;

    // Bonus for field completeness
    const fields = config.fieldExtraction?.fields || {};
    if (fields.name) score += 5;
    if (fields.email) score += 5;
    if (fields.phone) score += 3;
    if (fields.title) score += 2;
    if (fields.location) score += 2;
    if (fields.profileUrl) score += 3;

    // Bonus for high confidence
    const avgConf = config.detectionStats?.avgConfidence || 0;
    if (avgConf >= 80) score += 10;
    else if (avgConf >= 60) score += 5;

    // Bonus for multiple cards
    const cardCount = config.detectionStats?.totalCardsFound || 0;
    if (cardCount >= 10) score += 10;
    else if (cardCount >= 5) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate test command for v2.0 config
   * @param {Object} config - Configuration v2.0
   * @returns {string} - CLI command
   */
  generateTestCommandV2(config) {
    let cmd = `node orchestrator.js --url "${config.sourceUrl}" --method config`;

    if (config.name) {
      cmd += ` --config ${config.name}`;
    }

    cmd += ' --limit 10';

    return cmd;
  }

  /**
   * Check if config is v2.0 format
   * @param {Object} config - Configuration to check
   * @returns {boolean} - True if v2.0
   */
  isV2Config(config) {
    return config.version === '2.0' || config.cardPattern !== undefined;
  }

  /**
   * Migrate v1.0 config to v2.0 format
   * @param {Object} v1Config - V1.0 configuration
   * @returns {Object} - V2.0 configuration
   */
  migrateToV2(v1Config) {
    return {
      name: v1Config.name,
      version: '2.0',
      createdAt: v1Config.createdAt,
      updatedAt: new Date().toISOString(),
      sourceUrl: v1Config.sourceUrl,
      domain: v1Config.domain,

      cardPattern: {
        selector: v1Config.selectors?.card,
        structural: null, // Unknown from v1
        visual: null,
        matching: {
          structuralWeight: 0.6,
          visualWeight: 0.4,
          minConfidence: 65
        }
      },

      fieldExtraction: {
        strategy: 'selector', // Use explicit selectors from v1
        fields: {
          name: v1Config.selectors?.fields?.name ? {
            selector: v1Config.selectors.fields.name
          } : null,
          email: v1Config.selectors?.fields?.email ? {
            selector: v1Config.selectors.fields.email
          } : { pattern: 'email', includeMailto: true },
          phone: v1Config.selectors?.fields?.phone ? {
            selector: v1Config.selectors.fields.phone
          } : { pattern: 'phone', includeTel: true }
        }
      },

      pagination: v1Config.pagination,
      extraction: v1Config.extraction,
      options: v1Config.options,

      notes: [
        `Migrated from v1.0 on ${new Date().toLocaleString()}`,
        ...(v1Config.notes || [])
      ]
    };
  }
}

module.exports = ConfigBuilder;
