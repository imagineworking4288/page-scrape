/**
 * Configuration loader for select scraping method.
 * Loads site-specific configs from configs/ directory based on URL domain.
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class ConfigLoader {
  constructor(logger) {
    this.logger = logger;
    // Config directory is at project root: page-scrape/configs/
    this.configDir = path.join(__dirname, '..', '..', 'configs');
    this.websiteConfigDir = path.join(this.configDir, 'website-configs');
    this.defaultConfigPath = path.join(this.configDir, '_default.json');
    this.paginationCachePath = path.join(this.configDir, '_pagination_cache.json');
    this.paginationCache = this.loadPaginationCache();
  }

  /**
   * Check if a filename is a system config (prefixed with _)
   * @param {string} filename - Config filename
   * @returns {boolean} - True if system config
   */
  isSystemConfig(filename) {
    return filename.startsWith('_');
  }

  /**
   * Extract domain from URL
   * @param {string} url - Full URL
   * @returns {string} - Base domain (e.g., "compass.com")
   */
  extractDomain(url) {
    try {
      const parsed = new URL(url);
      let hostname = parsed.hostname;

      // Remove www. prefix if present
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }

      return hostname;
    } catch (error) {
      this.logger.error(`Failed to parse URL: ${error.message}`);
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * Load config file for given URL
   * Checks website-configs/ first, then falls back to legacy location
   * @param {string} url - Target URL
   * @returns {object} - Config object merged with defaults
   */
  loadConfig(url) {
    const domain = this.extractDomain(url);

    // Primary path: website-configs subdirectory
    const primaryPath = path.join(this.websiteConfigDir, `${domain}.json`);
    // Legacy path: configs root (for backward compatibility)
    const legacyPath = path.join(this.configDir, `${domain}.json`);

    // Determine which path to use
    let configPath = null;
    let isLegacy = false;

    if (fs.existsSync(primaryPath)) {
      configPath = primaryPath;
    } else if (fs.existsSync(legacyPath)) {
      configPath = legacyPath;
      isLegacy = true;
      this.logger.warn(`Config found in legacy location: ${legacyPath}`);
      this.logger.warn(`Consider moving to: ${primaryPath}`);
    }

    // Check if domain-specific config exists
    if (configPath) {
      try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const siteConfig = JSON.parse(configData);

        // Validate config structure
        this.validateConfig(siteConfig, domain);

        // Merge with defaults
        const mergedConfig = this.resolveWithDefaults(siteConfig);

        this.logger.info(`Loaded config for domain: ${domain}${isLegacy ? ' (legacy location)' : ''}`);
        return mergedConfig;
      } catch (error) {
        this.logger.error(`Failed to load config for ${domain}: ${error.message}`);
        this.logger.warn('Falling back to default config');
        return this.getDefaultConfig(domain);
      }
    } else {
      this.logger.warn(`No config found for domain: ${domain}`);
      this.logger.info('Using default config');
      return this.getDefaultConfig(domain);
    }
  }

  /**
   * Validate config structure and required fields
   * @param {object} config - Config object
   * @param {string} domain - Domain name for error messages
   * @throws {Error} - If config is invalid
   */
  validateConfig(config, domain) {
    // Required fields
    if (!config.domain) {
      throw new Error(`Config for ${domain} missing required field: domain`);
    }

    // For select scraping, markers are required
    if (!config.markers) {
      throw new Error(`Config for ${domain} missing required field: markers`);
    }

    if (!config.markers.start || !config.markers.end) {
      throw new Error(`Config for ${domain} missing start or end marker`);
    }

    // Validate start marker
    this.validateMarker(config.markers.start, 'start', domain);

    // Validate end marker
    this.validateMarker(config.markers.end, 'end', domain);

    // Validate scroll behavior (optional)
    if (config.scrollBehavior) {
      if (typeof config.scrollBehavior.enabled !== 'boolean') {
        throw new Error(`Config for ${domain}: scrollBehavior.enabled must be boolean`);
      }

      if (config.scrollBehavior.enabled) {
        if (typeof config.scrollBehavior.scrollDelay !== 'number') {
          throw new Error(`Config for ${domain}: scrollBehavior.scrollDelay must be a number`);
        }
        if (typeof config.scrollBehavior.maxScrolls !== 'number') {
          throw new Error(`Config for ${domain}: scrollBehavior.maxScrolls must be a number`);
        }
      }
    }

    // Validate parsing (optional)
    if (config.parsing) {
      if (config.parsing.emailDomain !== null && typeof config.parsing.emailDomain !== 'string') {
        throw new Error(`Config for ${domain}: parsing.emailDomain must be string or null`);
      }
      if (config.parsing.nameBeforeEmail !== undefined && typeof config.parsing.nameBeforeEmail !== 'boolean') {
        throw new Error(`Config for ${domain}: parsing.nameBeforeEmail must be boolean`);
      }
    }
  }

  /**
   * Validate individual marker
   * @param {object} marker - Marker object
   * @param {string} markerName - 'start' or 'end' for error messages
   * @param {string} domain - Domain name for error messages
   * @throws {Error} - If marker is invalid
   */
  validateMarker(marker, markerName, domain) {
    if (!marker.type) {
      throw new Error(`Config for ${domain}: ${markerName} marker missing type`);
    }

    if (marker.type !== 'text' && marker.type !== 'coordinate') {
      throw new Error(`Config for ${domain}: ${markerName} marker type must be 'text' or 'coordinate'`);
    }

    if (!marker.value) {
      throw new Error(`Config for ${domain}: ${markerName} marker missing value`);
    }

    // Validate based on type
    if (marker.type === 'text') {
      if (typeof marker.value !== 'string') {
        throw new Error(`Config for ${domain}: ${markerName} text marker value must be a string`);
      }
      if (marker.value.trim().length === 0) {
        throw new Error(`Config for ${domain}: ${markerName} text marker value cannot be empty`);
      }
    } else if (marker.type === 'coordinate') {
      if (typeof marker.value !== 'object') {
        throw new Error(`Config for ${domain}: ${markerName} coordinate marker value must be an object`);
      }
      if (typeof marker.value.x !== 'number' || typeof marker.value.y !== 'number') {
        throw new Error(`Config for ${domain}: ${markerName} coordinate marker must have numeric x and y`);
      }
      if (marker.value.x < 0 || marker.value.y < 0) {
        throw new Error(`Config for ${domain}: ${markerName} coordinate values must be non-negative`);
      }
    }
  }

  /**
   * Get default config when no site-specific config exists
   * @param {string} domain - Domain name
   * @returns {object} - Default config
   */
  getDefaultConfig(domain) {
    // Try to load from _default.json first
    if (fs.existsSync(this.defaultConfigPath)) {
      try {
        const configData = fs.readFileSync(this.defaultConfigPath, 'utf8');
        const defaultConfig = JSON.parse(configData);

        // Set the domain
        defaultConfig.domain = domain;
        defaultConfig.name = `Default config for ${domain}`;

        return defaultConfig;
      } catch (error) {
        this.logger.error(`Failed to load _default.json: ${error.message}`);
        // Fall through to hardcoded defaults
      }
    }

    // Hardcoded fallback if _default.json doesn't exist
    return {
      domain: domain,
      name: `Default config for ${domain}`,
      markers: {
        start: {
          type: 'dynamic',
          strategy: 'first-email'
        },
        end: {
          type: 'dynamic',
          strategy: 'viewport-height'
        }
      },
      scrollBehavior: {
        scrollDelay: 1000,
        maxScrolls: 50,
        scrollAmount: 'viewport'
      },
      selectors: {
        container: null,
        profileLink: null,
        phone: null,
        email: null,
        name: null
      },
      parsing: {
        emailDomain: null,
        nameBeforeEmail: true,
        profileUrlPatterns: ['/agents/', '/profile/', '/realtor/', '/team/']
      },
      pagination: {
        enabled: true,
        type: 'auto'
      }
    };
  }

  /**
   * Merge site-specific config with defaults
   * @param {object} siteConfig - Site-specific configuration
   * @returns {object} - Merged configuration
   */
  resolveWithDefaults(siteConfig) {
    // Get default config
    const defaultConfig = this.getDefaultConfig(siteConfig.domain || 'unknown');

    // Deep merge function
    const deepMerge = (target, source) => {
      const result = { ...target };

      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }

      return result;
    };

    // Merge site config over defaults
    return deepMerge(defaultConfig, siteConfig);
  }

  /**
   * List all available website config files
   * Looks in website-configs/ directory, with fallback to legacy location
   * @returns {array} - Array of config filenames (domains)
   */
  listConfigs() {
    const configs = new Set();

    try {
      // Primary: website-configs subdirectory
      if (fs.existsSync(this.websiteConfigDir)) {
        const websiteFiles = fs.readdirSync(this.websiteConfigDir);
        websiteFiles
          .filter(file => file.endsWith('.json') && !this.isSystemConfig(file))
          .forEach(file => configs.add(file.replace('.json', '')));
      }

      // Fallback: legacy location (root configs/)
      const rootFiles = fs.readdirSync(this.configDir);
      rootFiles
        .filter(file => file.endsWith('.json') && !this.isSystemConfig(file))
        .forEach(file => configs.add(file.replace('.json', '')));

      return Array.from(configs).sort();
    } catch (error) {
      this.logger.error(`Failed to list configs: ${error.message}`);
      return [];
    }
  }

  /**
   * Load pagination cache from disk
   * @returns {object} - Cache object
   */
  loadPaginationCache() {
    try {
      if (fs.existsSync(this.paginationCachePath)) {
        const cacheData = fs.readFileSync(this.paginationCachePath, 'utf8');
        return JSON.parse(cacheData);
      }
    } catch (error) {
      this.logger.warn(`Failed to load pagination cache: ${error.message}`);
    }
    return {};
  }

  /**
   * Save pagination cache to disk
   */
  savePaginationCache() {
    try {
      fs.writeFileSync(
        this.paginationCachePath,
        JSON.stringify(this.paginationCache, null, 2),
        'utf8'
      );
    } catch (error) {
      this.logger.error(`Failed to save pagination cache: ${error.message}`);
    }
  }

  /**
   * Get cached pagination pattern for a domain
   * @param {string} domain - Domain name
   * @returns {object|null} - Cached pattern or null
   */
  getCachedPattern(domain) {
    return this.paginationCache[domain] || null;
  }

  /**
   * Save pagination pattern to cache
   * @param {string} domain - Domain name
   * @param {object} pattern - Pagination pattern object
   */
  saveCachedPattern(domain, pattern) {
    this.paginationCache[domain] = {
      pattern: pattern,
      cachedAt: new Date().toISOString()
    };
    this.savePaginationCache();
    this.logger.info(`Cached pagination pattern for ${domain}`);
  }

  /**
   * Clear cached pattern for a domain
   * @param {string} domain - Domain name
   */
  clearCachedPattern(domain) {
    if (this.paginationCache[domain]) {
      delete this.paginationCache[domain];
      this.savePaginationCache();
      this.logger.info(`Cleared pagination cache for ${domain}`);
    }
  }

  /**
   * Clear all cached patterns
   */
  clearAllCachedPatterns() {
    this.paginationCache = {};
    this.savePaginationCache();
    this.logger.info('Cleared all pagination cache');
  }
}

module.exports = ConfigLoader;
