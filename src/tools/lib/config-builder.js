/**
 * Config Builder v2.2
 *
 * Builds site-specific configuration files from visual card selection.
 * Supports legacy v1.0, v2.0, v2.1, and new v2.2 formats:
 * - v1.0: Basic selectors
 * - v2.0: Card pattern matching (structural + visual signatures)
 * - v2.1: Multi-method extraction strategies with priorities and fallbacks
 * - v2.2: Manual field selection with user-selected methods and coordinate fallbacks
 *
 * v2.1 Features:
 * - Site-specific extraction methods stored per field
 * - Priority-ordered fallback strategies
 * - Captured element snapshots for runtime matching
 * - Site characteristics for adaptive behavior
 *
 * v2.2 Features:
 * - Manual field selection support
 * - User-selected selectors with highest priority
 * - Coordinate-based fallback extraction
 * - Profile link classification
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

  // ===========================
  // V2.1 CONFIG BUILDER
  // ===========================

  /**
   * Build v2.1 configuration from enhanced capture data
   * @param {Object} captureData - Result from EnhancedCapture.capture()
   * @param {Object} matchResult - Result from CardMatcher.findSimilarCards()
   * @param {Object} metadata - Site metadata (url, domain, pagination)
   * @returns {Object} - Configuration v2.1 object
   */
  buildConfigV21(captureData, matchResult, metadata) {
    const config = {
      // Metadata
      name: this.generateConfigName(metadata.url),
      version: '2.1',
      createdAt: new Date().toISOString(),
      sourceUrl: metadata.url,
      domain: metadata.domain,

      // Card pattern with fallback selectors
      cardPattern: this.buildCardPatternV21(captureData, matchResult),

      // Multi-method field extraction
      fieldExtraction: this.buildFieldExtractionV21(captureData),

      // Site characteristics
      siteCharacteristics: captureData.siteCharacteristics || {},

      // Spatial relationships
      relationships: captureData.relationships || {},

      // Captured element snapshot (for debugging/refinement)
      capturedElements: {
        card: captureData.card || {},
        links: captureData.links || {}
      },

      // Pagination configuration
      pagination: this.buildPaginationConfig(metadata.pagination || {}, metadata),

      // Extraction settings
      extraction: {
        waitFor: captureData.card?.selector || matchResult?.selector,
        waitTimeout: 15000,
        scrollToLoad: captureData.siteCharacteristics?.dynamicLoading === 'lazy',
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
        totalCardsFound: matchResult?.totalFound || 0,
        avgConfidence: this.calculateAverageConfidence(matchResult?.matches || []),
        fieldsDetected: this.countDetectedFields(captureData),
        timestamp: new Date().toISOString()
      },

      // Notes
      notes: this.generateNotesV21(captureData, matchResult, metadata)
    };

    return config;
  }

  /**
   * Build card pattern with fallback selectors for v2.1
   * @param {Object} captureData - Enhanced capture data
   * @param {Object} matchResult - Card matcher result
   * @returns {Object} - Card pattern configuration
   */
  buildCardPatternV21(captureData, matchResult) {
    const card = captureData.card || {};
    const ref = matchResult?.referenceElement || {};

    // Build fallback selectors from captured strategies
    const fallbackSelectors = [];
    if (card.selectorStrategies) {
      card.selectorStrategies.forEach(strategy => {
        if (strategy.selector && !fallbackSelectors.includes(strategy.selector)) {
          fallbackSelectors.push(strategy.selector);
        }
      });
    }

    return {
      // Primary selector
      primarySelector: card.selector || matchResult?.selector,

      // Fallback selectors (ordered by specificity)
      fallbackSelectors: fallbackSelectors.slice(0, 5),

      // Structural signature
      structural: {
        tagName: card.tagName || ref.structural?.tagName,
        classes: card.classes || [],
        parentChain: ref.structural?.parentChain || [],
        childCount: card.childCount || ref.structural?.childCount || 0,
        childTags: card.childTags || ref.structural?.childTags || {},
        classPatterns: ref.structural?.classPatterns || [],
        hasLinks: ref.structural?.hasLinks || false,
        hasImages: ref.structural?.hasImages || false
      },

      // Visual properties
      visual: {
        width: card.dimensions?.width || ref.visual?.box?.width,
        height: card.dimensions?.height || ref.visual?.box?.height,
        aspectRatio: ref.visual?.aspectRatio,
        display: card.styles?.display || ref.visual?.display
      },

      // Element attributes for additional matching
      attributes: card.attributes || {},

      // Matching thresholds
      matching: {
        structuralWeight: 0.6,
        visualWeight: 0.4,
        minConfidence: 65
      }
    };
  }

  /**
   * Build multi-method field extraction rules for v2.1
   * @param {Object} captureData - Enhanced capture data
   * @returns {Object} - Field extraction configuration
   */
  buildFieldExtractionV21(captureData) {
    const fields = captureData.fields || {};

    return {
      version: '2.1',
      strategy: 'multi-method',

      fields: {
        name: this.buildFieldMethodsV21(fields.name, 'name'),
        email: this.buildFieldMethodsV21(fields.email, 'email'),
        phone: this.buildFieldMethodsV21(fields.phone, 'phone'),
        title: this.buildFieldMethodsV21(fields.title, 'title'),
        profileUrl: this.buildFieldMethodsV21(fields.profileUrl, 'profileUrl')
      },

      // Social links configuration
      socialLinks: {
        enabled: true,
        platforms: ['linkedin', 'twitter', 'facebook', 'github']
      }
    };
  }

  /**
   * Build extraction methods for a single field
   * @param {Object} fieldData - Field data with methods array
   * @param {string} fieldName - Name of the field
   * @returns {Object} - Field extraction methods
   */
  buildFieldMethodsV21(fieldData, fieldName) {
    if (!fieldData || !fieldData.methods || fieldData.methods.length === 0) {
      return this.getDefaultFieldMethods(fieldName);
    }

    // Convert captured methods to config format
    const methods = fieldData.methods.map((method, index) => ({
      priority: method.priority || index + 1,
      type: method.type,
      selector: method.selector || null,
      attribute: method.attribute || 'textContent',
      confidence: method.confidence || 0.5,
      // Include additional method-specific data
      ...(method.pattern && { pattern: method.pattern }),
      ...(method.anchorField && { anchorField: method.anchorField }),
      ...(method.direction && { direction: method.direction }),
      ...(method.distance && { maxDistance: Math.ceil(method.distance * 1.5) }),
      ...(method.keywords && { keywords: method.keywords })
    }));

    return {
      required: fieldName === 'email' || fieldName === 'name',
      capturedValue: fieldData.value,
      methods: methods,
      validation: this.getFieldValidation(fieldName)
    };
  }

  /**
   * Get default extraction methods for a field
   * @param {string} fieldName - Field name
   * @returns {Object} - Default field methods
   */
  getDefaultFieldMethods(fieldName) {
    const defaults = {
      name: {
        required: true,
        methods: [
          { priority: 1, type: 'selector', selector: '[class*="name"]', attribute: 'textContent', confidence: 0.8 },
          { priority: 2, type: 'selector', selector: 'h1, h2, h3, h4', attribute: 'textContent', confidence: 0.7 },
          { priority: 3, type: 'proximity', anchorField: 'email', direction: 'above', maxDistance: 300, confidence: 0.6 },
          { priority: 4, type: 'firstText', confidence: 0.4 }
        ],
        validation: 'name'
      },
      email: {
        required: true,
        methods: [
          { priority: 1, type: 'mailto', selector: 'a[href^="mailto:"]', attribute: 'href', confidence: 1.0 },
          { priority: 2, type: 'linkText', selector: 'a', attribute: 'textContent', confidence: 0.9 },
          { priority: 3, type: 'textPattern', confidence: 0.7 }
        ],
        validation: 'email'
      },
      phone: {
        required: false,
        methods: [
          { priority: 1, type: 'tel', selector: 'a[href^="tel:"]', attribute: 'href', confidence: 1.0 },
          { priority: 2, type: 'selector', selector: '[class*="phone"], [class*="tel"]', attribute: 'textContent', confidence: 0.8 },
          { priority: 3, type: 'textPattern', confidence: 0.6 }
        ],
        validation: 'phone'
      },
      title: {
        required: false,
        methods: [
          { priority: 1, type: 'selector', selector: '[class*="title"], [class*="position"], [class*="role"]', attribute: 'textContent', confidence: 0.9 },
          { priority: 2, type: 'keyword', keywords: ['Partner', 'Associate', 'Director', 'Manager', 'Attorney', 'Counsel'], confidence: 0.7 }
        ],
        validation: 'title'
      },
      profileUrl: {
        required: false,
        methods: [
          { priority: 1, type: 'urlPattern', patterns: ['/profile/', '/people/', '/attorney/', '/lawyer/', '/bio/'], confidence: 0.95 },
          { priority: 2, type: 'linkText', keywords: ['view profile', 'read more', 'learn more'], confidence: 0.8 },
          { priority: 3, type: 'firstInternalLink', confidence: 0.4 }
        ],
        validation: 'url'
      }
    };

    return defaults[fieldName] || { required: false, methods: [] };
  }

  /**
   * Get field validation type
   * @param {string} fieldName - Field name
   * @returns {string} - Validation type
   */
  getFieldValidation(fieldName) {
    const validations = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      title: 'title',
      profileUrl: 'url',
      location: 'location'
    };
    return validations[fieldName] || null;
  }

  /**
   * Count detected fields with values
   * @param {Object} captureData - Capture data
   * @returns {Object} - Field detection counts
   */
  countDetectedFields(captureData) {
    const fields = captureData.fields || {};
    return {
      name: !!fields.name?.value,
      email: !!fields.email?.value,
      phone: !!fields.phone?.value,
      title: !!fields.title?.value,
      profileUrl: !!fields.profileUrl?.value,
      methodsRecorded: Object.values(fields).reduce((sum, f) => sum + (f?.methods?.length || 0), 0)
    };
  }

  /**
   * Generate notes for v2.1 config
   * @param {Object} captureData - Capture data
   * @param {Object} matchResult - Match result
   * @param {Object} metadata - Metadata
   * @returns {Array} - Notes array
   */
  generateNotesV21(captureData, matchResult, metadata) {
    const notes = [];
    const preview = captureData.preview || {};

    notes.push(`Config v2.1 generated on ${new Date().toLocaleString()}`);
    notes.push(`Source: ${metadata.url}`);
    notes.push(`Cards detected: ${matchResult?.totalFound || 0}`);

    if (matchResult?.matches && matchResult.matches.length > 0) {
      const avgConf = this.calculateAverageConfidence(matchResult.matches);
      notes.push(`Average card confidence: ${avgConf}%`);
    }

    // Field detection summary
    const detectedFields = [];
    if (preview.name) detectedFields.push('name');
    if (preview.email) detectedFields.push('email');
    if (preview.phone) detectedFields.push('phone');
    if (preview.title) detectedFields.push('title');
    if (preview.profileUrl) detectedFields.push('profileUrl');
    notes.push(`Fields detected: ${detectedFields.join(', ') || 'none'}`);

    // Site characteristics
    const site = captureData.siteCharacteristics || {};
    if (site.isSPA) notes.push('Site is SPA');
    if (site.framework !== 'unknown') notes.push(`Framework: ${site.framework}`);
    if (site.dynamicLoading !== 'eager') notes.push(`Loading: ${site.dynamicLoading}`);

    // Methods summary
    const totalMethods = Object.values(captureData.fields || {})
      .reduce((sum, f) => sum + (f?.methods?.length || 0), 0);
    notes.push(`Extraction methods captured: ${totalMethods}`);

    return notes;
  }

  /**
   * Validate v2.1 configuration completeness
   * @param {Object} config - Configuration v2.1 to validate
   * @returns {Object} - Validation result
   */
  validateConfigV21(config) {
    const errors = [];
    const warnings = [];

    // Version check
    if (config.version !== '2.1') {
      warnings.push('Config version is not 2.1');
    }

    // Required: card pattern
    if (!config.cardPattern?.primarySelector) {
      errors.push('Missing primary card selector');
    }

    // Required: field extraction
    if (!config.fieldExtraction) {
      errors.push('Missing field extraction configuration');
    }

    // Check email extraction
    const emailMethods = config.fieldExtraction?.fields?.email?.methods || [];
    if (emailMethods.length === 0) {
      warnings.push('No email extraction methods - will use defaults');
    }

    // Check name extraction
    const nameMethods = config.fieldExtraction?.fields?.name?.methods || [];
    if (nameMethods.length === 0) {
      warnings.push('No name extraction methods - will use defaults');
    }

    // Check detection stats
    if (config.detectionStats?.totalCardsFound < 2) {
      warnings.push('Only one card detected - verify card pattern');
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      score: this.calculateConfigScoreV21(config, errors, warnings)
    };
  }

  /**
   * Calculate quality score for v2.1 config
   * @param {Object} config - Configuration v2.1
   * @param {Array} errors - Validation errors
   * @param {Array} warnings - Validation warnings
   * @returns {number} - Score 0-100
   */
  calculateConfigScoreV21(config, errors, warnings) {
    let score = 100;

    // Deduct for errors
    score -= errors.length * 30;

    // Deduct for warnings
    score -= warnings.length * 5;

    // Bonus for field completeness and methods
    const fields = config.fieldExtraction?.fields || {};

    // Email methods bonus
    const emailMethods = fields.email?.methods?.length || 0;
    score += Math.min(emailMethods * 3, 15);

    // Name methods bonus
    const nameMethods = fields.name?.methods?.length || 0;
    score += Math.min(nameMethods * 3, 15);

    // Other fields bonus
    if (fields.phone?.methods?.length > 0) score += 5;
    if (fields.title?.methods?.length > 0) score += 5;
    if (fields.profileUrl?.methods?.length > 0) score += 5;

    // Fallback selectors bonus
    const fallbacks = config.cardPattern?.fallbackSelectors?.length || 0;
    score += Math.min(fallbacks * 2, 10);

    // Site characteristics captured
    if (config.siteCharacteristics && Object.keys(config.siteCharacteristics).length > 0) {
      score += 5;
    }

    // Card detection confidence
    const avgConf = config.detectionStats?.avgConfidence || 0;
    if (avgConf >= 80) score += 10;
    else if (avgConf >= 60) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Check if config is v2.1 format
   * @param {Object} config - Configuration to check
   * @returns {boolean} - True if v2.1
   */
  isV21Config(config) {
    return config.version === '2.1' ||
           (config.fieldExtraction?.version === '2.1') ||
           (config.fieldExtraction?.strategy === 'multi-method');
  }

  /**
   * Migrate v2.0 config to v2.1 format
   * @param {Object} v2Config - V2.0 configuration
   * @returns {Object} - V2.1 configuration
   */
  migrateToV21(v2Config) {
    return {
      name: v2Config.name,
      version: '2.1',
      createdAt: v2Config.createdAt,
      updatedAt: new Date().toISOString(),
      sourceUrl: v2Config.sourceUrl,
      domain: v2Config.domain,

      cardPattern: {
        primarySelector: v2Config.cardPattern?.selector,
        fallbackSelectors: [],
        structural: v2Config.cardPattern?.structural || {},
        visual: v2Config.cardPattern?.visual || {},
        attributes: {},
        matching: v2Config.cardPattern?.matching || {
          structuralWeight: 0.6,
          visualWeight: 0.4,
          minConfidence: 65
        }
      },

      fieldExtraction: {
        version: '2.1',
        strategy: 'multi-method',
        fields: {
          name: this.getDefaultFieldMethods('name'),
          email: this.getDefaultFieldMethods('email'),
          phone: this.getDefaultFieldMethods('phone'),
          title: this.getDefaultFieldMethods('title'),
          profileUrl: this.getDefaultFieldMethods('profileUrl')
        },
        socialLinks: {
          enabled: true,
          platforms: ['linkedin', 'twitter', 'facebook', 'github']
        }
      },

      siteCharacteristics: {},
      relationships: {},
      capturedElements: {},

      pagination: v2Config.pagination,
      extraction: v2Config.extraction,
      options: v2Config.options,

      detectionStats: {
        ...v2Config.detectionStats,
        migratedFromV2: true
      },

      notes: [
        `Migrated from v2.0 on ${new Date().toLocaleString()}`,
        'Default extraction methods applied - recommend re-generating config',
        ...(v2Config.notes || [])
      ]
    };
  }

  // ===========================
  // V2.2 CONFIG BUILDER (Manual Selection)
  // ===========================

  /**
   * Build v2.2 configuration from manual field selections
   * @param {Object} capturedData - Result from ElementCapture.processManualSelections()
   * @param {Object} matchResult - Result from CardMatcher.findSimilarCards()
   * @param {Object} metadata - Site metadata (url, domain, pagination)
   * @returns {Object} - Configuration v2.2 object
   */
  buildConfigV22(capturedData, matchResult, metadata) {
    this.logger.info('[v2.2-CONFIG] ========================================');
    this.logger.info('[v2.2-CONFIG] BUILDING CONFIG V2.2');
    this.logger.info('[v2.2-CONFIG] capturedData exists:', !!capturedData);
    this.logger.info('[v2.2-CONFIG] capturedData.fields keys:', Object.keys(capturedData?.fields || {}));
    this.logger.info('[v2.2-CONFIG] matchResult exists:', !!matchResult);
    this.logger.info('[v2.2-CONFIG] metadata.url:', metadata?.url);

    // Log each field's captured data
    if (capturedData?.fields) {
      Object.entries(capturedData.fields).forEach(([fieldName, fieldData]) => {
        this.logger.info(`[v2.2-CONFIG] Field "${fieldName}":`, JSON.stringify({
          value: fieldData?.value,
          selector: fieldData?.selector,
          hasCoordinates: !!fieldData?.coordinates,
          source: fieldData?.source
        }));
      });
    }

    const config = {
      // Metadata
      name: this.generateConfigName(metadata.url),
      version: '2.2',
      createdAt: new Date().toISOString(),
      sourceUrl: metadata.url,
      domain: metadata.domain,
      selectionMethod: 'manual',

      // Card pattern with fallback selectors (same as v2.1)
      cardPattern: this.buildCardPatternV21(
        { card: capturedData.capturedElements?.card || {} },
        matchResult
      ),

      // Multi-method field extraction with manual selections
      fieldExtraction: this.buildFieldExtractionV22(capturedData),

      // Site characteristics (from enhanced capture if available)
      siteCharacteristics: capturedData.siteCharacteristics || {},

      // Spatial relationships from captured fields
      relationships: capturedData.relationships || {},

      // Captured element snapshots (for debugging and refinement)
      capturedElements: capturedData.capturedElements || {},

      // Pagination configuration
      pagination: this.buildPaginationConfig(metadata.pagination || {}, metadata),

      // Extraction settings
      extraction: {
        waitFor: matchResult?.selector,
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
        totalCardsFound: matchResult?.totalFound || 0,
        avgConfidence: this.calculateAverageConfidence(matchResult?.matches || []),
        fieldsDetected: this.countDetectedFieldsV22(capturedData),
        selectionMethod: 'manual',
        timestamp: new Date().toISOString()
      },

      // Notes
      notes: this.generateNotesV22(capturedData, matchResult, metadata)
    };

    this.logger.info('[v2.2-CONFIG] Config built successfully');
    this.logger.info('[v2.2-CONFIG] Config name:', config.name);
    this.logger.info('[v2.2-CONFIG] Config version:', config.version);
    this.logger.info('[v2.2-CONFIG] Fields in fieldExtraction:', Object.keys(config.fieldExtraction?.fields || {}));
    this.logger.info('[v2.2-CONFIG] ========================================');

    return config;
  }

  /**
   * Build multi-method field extraction rules for v2.2 with manual selections
   * @param {Object} capturedData - Captured data with manual selections
   * @returns {Object} - Field extraction configuration
   */
  buildFieldExtractionV22(capturedData) {
    const fields = capturedData.fields || {};

    return {
      version: '2.2',
      strategy: 'multi-method',
      selectionMethod: 'manual',

      fields: {
        name: this.buildFieldMethodsV22(fields.name, 'name'),
        email: this.buildFieldMethodsV22(fields.email, 'email'),
        phone: this.buildFieldMethodsV22(fields.phone, 'phone'),
        title: this.buildFieldMethodsV22(fields.title, 'title'),
        profileUrl: this.buildFieldMethodsV22(fields.profileUrl, 'profileUrl'),
        location: this.buildFieldMethodsV22(fields.location, 'location')
      },

      // Social links configuration
      socialLinks: {
        enabled: true,
        platforms: ['linkedin', 'twitter', 'facebook', 'github']
      }
    };
  }

  /**
   * Build extraction methods for a single field with v2.2 manual selection support
   * @param {Object} fieldData - Field data with methods array
   * @param {string} fieldName - Name of the field
   * @returns {Object} - Field extraction methods
   */
  buildFieldMethodsV22(fieldData, fieldName) {
    // If no field data, return defaults
    if (!fieldData) {
      return this.getDefaultFieldMethods(fieldName);
    }

    const methods = [];

    // Priority 1: User-selected method (if from manual selection)
    if (fieldData.source === 'manual' && fieldData.selector) {
      methods.push({
        priority: 1,
        type: 'userSelected',
        selector: fieldData.selector,
        attribute: this.getAttributeForField(fieldName),
        confidence: 1.0,
        source: 'manual'
      });
    }

    // Priority 2: Coordinate fallback (if coordinates captured)
    if (fieldData.coordinates) {
      methods.push({
        priority: 2,
        type: 'coordinates',
        coordinates: fieldData.coordinates,
        confidence: 0.85,
        source: 'manual'
      });
    }

    // Add remaining methods from fieldData.methods if present
    if (fieldData.methods && fieldData.methods.length > 0) {
      fieldData.methods.forEach((method, index) => {
        // Skip if already added userSelected or coordinates
        if (method.type === 'userSelected' || method.type === 'coordinates') return;

        methods.push({
          priority: methods.length + 1,
          type: method.type,
          selector: method.selector || null,
          attribute: method.attribute || 'textContent',
          confidence: method.confidence || 0.5,
          ...(method.pattern && { pattern: method.pattern }),
          ...(method.anchorField && { anchorField: method.anchorField }),
          ...(method.direction && { direction: method.direction }),
          ...(method.maxDistance && { maxDistance: method.maxDistance })
        });
      });
    }

    // Add default fallback methods if not enough methods
    if (methods.length < 2) {
      const defaults = this.getDefaultFieldMethods(fieldName);
      if (defaults.methods) {
        defaults.methods.forEach(m => {
          // Only add if method type not already present
          if (!methods.some(existing => existing.type === m.type)) {
            methods.push({
              ...m,
              priority: methods.length + 1
            });
          }
        });
      }
    }

    return {
      required: fieldName === 'email' || fieldName === 'name' || fieldName === 'profileUrl',
      capturedValue: fieldData.value,
      methods: methods,
      validation: this.getFieldValidation(fieldName),
      source: fieldData.source || 'manual'
    };
  }

  /**
   * Get the default attribute to extract for a field type
   * @param {string} fieldName - Field name
   * @returns {string} - Attribute name
   */
  getAttributeForField(fieldName) {
    const attributes = {
      email: 'href', // for mailto: links
      phone: 'href', // for tel: links
      profileUrl: 'href',
      name: 'textContent',
      title: 'textContent',
      location: 'textContent'
    };
    return attributes[fieldName] || 'textContent';
  }

  /**
   * Count detected fields for v2.2
   * @param {Object} capturedData - Captured data
   * @returns {Object} - Field detection counts
   */
  countDetectedFieldsV22(capturedData) {
    const fields = capturedData.fields || {};
    const counts = {
      name: !!fields.name?.value,
      email: !!fields.email?.value,
      phone: !!fields.phone?.value,
      title: !!fields.title?.value,
      profileUrl: !!fields.profileUrl?.value,
      location: !!fields.location?.value,
      total: 0,
      required: 0,
      optional: 0,
      methodsRecorded: 0
    };

    // Count totals
    const fieldNames = ['name', 'email', 'phone', 'title', 'profileUrl', 'location'];
    const requiredFields = ['name', 'email', 'profileUrl'];

    fieldNames.forEach(fn => {
      if (counts[fn]) {
        counts.total++;
        if (requiredFields.includes(fn)) {
          counts.required++;
        } else {
          counts.optional++;
        }
      }
      counts.methodsRecorded += fields[fn]?.methods?.length || 0;
    });

    return counts;
  }

  /**
   * Generate notes for v2.2 config
   * @param {Object} capturedData - Captured data
   * @param {Object} matchResult - Match result
   * @param {Object} metadata - Metadata
   * @returns {Array} - Notes array
   */
  generateNotesV22(capturedData, matchResult, metadata) {
    const notes = [];
    const fields = capturedData.fields || {};

    notes.push(`Config v2.2 generated on ${new Date().toLocaleString()}`);
    notes.push(`Selection method: Manual field selection`);
    notes.push(`Source: ${metadata.url}`);
    notes.push(`Cards detected: ${matchResult?.totalFound || 0}`);

    if (matchResult?.matches && matchResult.matches.length > 0) {
      const avgConf = this.calculateAverageConfidence(matchResult.matches);
      notes.push(`Average card confidence: ${avgConf}%`);
    }

    // Field detection summary
    const detectedFields = [];
    const manualFields = [];
    Object.entries(fields).forEach(([fieldName, fieldData]) => {
      if (fieldData?.value) {
        detectedFields.push(fieldName);
        if (fieldData.source === 'manual') {
          manualFields.push(fieldName);
        }
      }
    });
    notes.push(`Fields captured: ${detectedFields.join(', ') || 'none'}`);
    notes.push(`Manually selected: ${manualFields.join(', ') || 'none'}`);

    // Methods summary
    const totalMethods = Object.values(fields)
      .reduce((sum, f) => sum + (f?.methods?.length || 0), 0);
    notes.push(`Extraction methods configured: ${totalMethods}`);

    // Validation status
    if (capturedData.validation) {
      if (capturedData.validation.valid) {
        notes.push('All required fields captured');
      } else {
        notes.push(`WARNING: Missing required fields: ${capturedData.validation.missingRequired.join(', ')}`);
      }
    }

    return notes;
  }

  /**
   * Check if config is v2.2 format
   * @param {Object} config - Configuration to check
   * @returns {boolean} - True if v2.2
   */
  isV22Config(config) {
    return config.version === '2.2' ||
           config.selectionMethod === 'manual' ||
           (config.fieldExtraction?.version === '2.2');
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
    this.logger.info('[v2.2-SAVE] ========================================');
    this.logger.info('[v2.2-SAVE] SAVING CONFIG TO FILE');
    this.logger.info('[v2.2-SAVE] Config name:', config?.name);
    this.logger.info('[v2.2-SAVE] Config version:', config?.version);
    this.logger.info('[v2.2-SAVE] Output dir param:', outputDir);
    this.logger.info('[v2.2-SAVE] Default output dir:', this.outputDir);

    const dir = outputDir || this.outputDir;
    this.logger.info('[v2.2-SAVE] Using directory:', dir);

    // Ensure directory exists
    const fullDir = path.resolve(dir);
    this.logger.info('[v2.2-SAVE] Resolved full path:', fullDir);

    if (!fs.existsSync(fullDir)) {
      this.logger.info('[v2.2-SAVE] Directory does not exist, creating...');
      fs.mkdirSync(fullDir, { recursive: true });
      this.logger.info('[v2.2-SAVE] Directory created');
    } else {
      this.logger.info('[v2.2-SAVE] Directory already exists');
    }

    // Generate filename
    const filename = `${config.name}.json`;
    const filepath = path.join(fullDir, filename);
    this.logger.info('[v2.2-SAVE] Full file path:', filepath);

    // Check for existing file
    if (fs.existsSync(filepath)) {
      // Create backup
      const backupPath = filepath.replace('.json', `.backup-${Date.now()}.json`);
      fs.copyFileSync(filepath, backupPath);
      this.logger.info(`[v2.2-SAVE] Existing config backed up to: ${backupPath}`);
    }

    // Write config
    const configJson = JSON.stringify(config, null, 2);
    this.logger.info('[v2.2-SAVE] Config JSON length:', configJson.length, 'bytes');

    try {
      fs.writeFileSync(filepath, configJson);
      this.logger.info(`[v2.2-SAVE] Config saved successfully to: ${filepath}`);
      this.logger.info('[v2.2-SAVE] ========================================');
    } catch (writeError) {
      this.logger.error('[v2.2-SAVE] ERROR writing config file:', writeError.message);
      this.logger.error('[v2.2-SAVE] Error stack:', writeError.stack);
      throw writeError;
    }

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
