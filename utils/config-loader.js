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
    this.configDir = path.join(__dirname, '..', 'configs');
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
   * @param {string} url - Target URL
   * @returns {object} - Config object or default config
   */
  loadConfig(url) {
    const domain = this.extractDomain(url);
    const configPath = path.join(this.configDir, `${domain}.json`);

    // Check if domain-specific config exists
    if (fs.existsSync(configPath)) {
      try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);

        // Validate config structure
        this.validateConfig(config, domain);

        this.logger.info(`Loaded config for domain: ${domain}`);
        return config;
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
      if (typeof config.parsing.nameBeforeEmail !== 'boolean') {
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
    return {
      domain: domain,
      name: `Default config for ${domain}`,
      markers: {
        start: {
          type: 'coordinate',
          value: { x: 0, y: 0 }
        },
        end: {
          type: 'coordinate',
          value: { x: 0, y: 10000 }
        }
      },
      scrollBehavior: {
        enabled: true,
        scrollDelay: 1000,
        maxScrolls: 50
      },
      parsing: {
        emailDomain: null,
        nameBeforeEmail: true
      }
    };
  }

  /**
   * List all available config files
   * @returns {array} - Array of config filenames
   */
  listConfigs() {
    try {
      const files = fs.readdirSync(this.configDir);
      return files
        .filter(file => file.endsWith('.json') && !file.startsWith('_'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      this.logger.error(`Failed to list configs: ${error.message}`);
      return [];
    }
  }
}

module.exports = ConfigLoader;
