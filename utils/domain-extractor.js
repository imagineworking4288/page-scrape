/**
 * Domain Extractor Utility
 * 
 * Extracts, normalizes, and categorizes email domains from contact data.
 * Provides domain-based statistics and grouping functionality.
 * 
 * Features:
 * - Extract domain from email addresses
 * - Normalize domains (remove www, handle subdomains)
 * - Categorize as business vs personal domains
 * - Group contacts by domain
 * - Generate domain statistics
 */

class DomainExtractor {
  constructor(logger = null) {
    this.logger = logger;
    
    // Pre-compiled regex for performance
    this.EMAIL_REGEX = /^[^@]+@([^@]+)$/;
    this.WWW_REGEX = /^www\./i;
    this.SUBDOMAIN_REGEX = /^([^.]+)\.(.+)$/;
    
    // Common personal email providers (lowercase)
    this.PERSONAL_DOMAINS = new Set([
      // Major providers
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
      'icloud.com', 'me.com', 'mac.com',
      
      // Yahoo variants
      'yahoo.co.uk', 'yahoo.ca', 'yahoo.com.au', 'yahoo.fr', 'yahoo.de',
      'yahoo.co.jp', 'yahoo.com.br', 'yahoo.in',
      
      // Microsoft variants
      'live.com', 'msn.com', 'hotmail.co.uk', 'hotmail.fr', 'outlook.fr',
      'outlook.de', 'outlook.com.au', 'outlook.co.uk',
      
      // Google variants
      'googlemail.com',
      
      // Other common providers
      'protonmail.com', 'proton.me', 'mail.com', 'gmx.com', 'gmx.de',
      'web.de', 'yandex.com', 'yandex.ru', 'mail.ru',
      'zoho.com', 'tutanota.com', 'fastmail.com',
      
      // Regional providers
      'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
      'cox.net', 'charter.net', 'earthlink.net',
      'btinternet.com', 'virginmedia.com', 'sky.com', 'talktalk.net',
      'orange.fr', 'free.fr', 'wanadoo.fr', 'laposte.net',
      
      // ISP domains
      'bellsouth.net', 'optonline.net', 'roadrunner.com',
      
      // Temporary/disposable
      'tempmail.com', 'guerrillamail.com', 'mailinator.com', '10minutemail.com'
    ]);
    
    // Cache for domain categorization (performance optimization)
    this.domainCache = new Map();
  }

  /**
   * Extract domain from email address
   * @param {string} email - Email address
   * @returns {string|null} - Domain or null if invalid
   */
  extractDomain(email) {
    if (!email || typeof email !== 'string') {
      return null;
    }
    
    // Trim and lowercase
    email = email.trim().toLowerCase();
    
    // Extract domain using regex
    const match = email.match(this.EMAIL_REGEX);
    if (!match || !match[1]) {
      return null;
    }
    
    return match[1];
  }

  /**
   * Normalize domain for consistent comparison
   * Removes www prefix and handles common variations
   * 
   * @param {string} domain - Raw domain
   * @returns {string|null} - Normalized domain or null if invalid
   */
  normalizeDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return null;
    }
    
    // Trim and lowercase
    domain = domain.trim().toLowerCase();
    
    // Remove www prefix
    domain = domain.replace(this.WWW_REGEX, '');
    
    // Basic validation - must contain at least one dot and valid chars
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      return null;
    }
    
    return domain;
  }

  /**
   * Extract and normalize domain from email in one step
   * @param {string} email - Email address
   * @returns {string|null} - Normalized domain or null
   */
  extractAndNormalize(email) {
    const domain = this.extractDomain(email);
    return domain ? this.normalizeDomain(domain) : null;
  }

  /**
   * Determine if a domain is a business domain (not personal email provider)
   * Uses caching for performance on repeated checks
   * 
   * @param {string} domain - Normalized domain
   * @returns {boolean} - True if business domain, false if personal
   */
  isBusinessDomain(domain) {
    if (!domain) {
      return false;
    }
    
    // Check cache first
    if (this.domainCache.has(domain)) {
      return this.domainCache.get(domain);
    }
    
    // Normalize domain
    const normalized = this.normalizeDomain(domain);
    if (!normalized) {
      this.domainCache.set(domain, false);
      return false;
    }
    
    // Check if it's a personal domain
    const isPersonal = this.PERSONAL_DOMAINS.has(normalized);
    const isBusiness = !isPersonal;
    
    // Cache the result
    this.domainCache.set(domain, isBusiness);
    this.domainCache.set(normalized, isBusiness); // Cache both forms
    
    return isBusiness;
  }

  /**
   * Add custom personal domain to the list
   * @param {string} domain - Domain to add (will be normalized)
   */
  addPersonalDomain(domain) {
    const normalized = this.normalizeDomain(domain);
    if (normalized) {
      this.PERSONAL_DOMAINS.add(normalized);
      // Clear cache to force re-categorization
      this.domainCache.delete(domain);
      this.domainCache.delete(normalized);
      
      if (this.logger) {
        this.logger.debug(`Added personal domain: ${normalized}`);
      }
    }
  }

  /**
   * Group contacts by domain
   * @param {Array} contacts - Array of contact objects with email field
   * @returns {Object} - Map of domain -> array of contacts
   */
  groupByDomain(contacts) {
    const domainGroups = new Map();
    
    for (const contact of contacts) {
      if (!contact.email) {
        continue;
      }
      
      const domain = this.extractAndNormalize(contact.email);
      if (!domain) {
        continue;
      }
      
      if (!domainGroups.has(domain)) {
        domainGroups.set(domain, []);
      }
      
      domainGroups.get(domain).push(contact);
    }
    
    // Convert Map to object and sort by count (descending)
    const sorted = Array.from(domainGroups.entries())
      .sort((a, b) => b[1].length - a[1].length);
    
    return Object.fromEntries(sorted);
  }

  /**
   * Generate comprehensive domain statistics
   * @param {Array} contacts - Array of contact objects with email field
   * @returns {Object} - Domain statistics
   */
  getDomainStats(contacts) {
    if (!contacts || contacts.length === 0) {
      return {
        totalContacts: 0,
        withEmail: 0,
        uniqueDomains: 0,
        businessDomains: 0,
        personalDomains: 0,
        topDomains: [],
        topBusinessDomains: [],
        domainDistribution: {}
      };
    }
    
    const domainCounts = new Map();
    const businessDomainCounts = new Map();
    let withEmail = 0;
    let businessCount = 0;
    let personalCount = 0;
    
    // Process each contact
    for (const contact of contacts) {
      if (!contact.email) {
        continue;
      }
      
      withEmail++;
      
      const domain = this.extractAndNormalize(contact.email);
      if (!domain) {
        continue;
      }
      
      // Count all domains
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      
      // Categorize and count business domains
      const isBusiness = this.isBusinessDomain(domain);
      if (isBusiness) {
        businessCount++;
        businessDomainCounts.set(domain, (businessDomainCounts.get(domain) || 0) + 1);
      } else {
        personalCount++;
      }
    }
    
    // Get top domains (all)
    const topDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({
        domain,
        count,
        percentage: ((count / withEmail) * 100).toFixed(1)
      }));
    
    // Get top business domains
    const topBusinessDomains = Array.from(businessDomainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({
        domain,
        count,
        percentage: businessCount > 0 ? ((count / businessCount) * 100).toFixed(1) : '0.0'
      }));
    
    // Create distribution object
    const domainDistribution = {};
    for (const [domain, count] of domainCounts.entries()) {
      domainDistribution[domain] = {
        count,
        isBusiness: this.isBusinessDomain(domain)
      };
    }
    
    return {
      totalContacts: contacts.length,
      withEmail,
      uniqueDomains: domainCounts.size,
      businessDomains: businessDomainCounts.size,
      personalDomains: personalCount,
      businessEmailCount: businessCount,
      personalEmailCount: personalCount,
      topDomains,
      topBusinessDomains,
      domainDistribution
    };
  }

  /**
   * Find duplicate contacts from same domain
   * Useful for detecting multiple contacts from same organization
   * 
   * @param {Array} contacts - Array of contact objects
   * @param {number} minCount - Minimum number of contacts to be considered duplicate domain
   * @returns {Array} - Array of domains with multiple contacts
   */
  findDuplicateDomains(contacts, minCount = 2) {
    const grouped = this.groupByDomain(contacts);
    
    return Object.entries(grouped)
      .filter(([domain, contactList]) => contactList.length >= minCount)
      .map(([domain, contactList]) => ({
        domain,
        count: contactList.length,
        isBusiness: this.isBusinessDomain(domain),
        contacts: contactList
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Clear the domain categorization cache
   * Useful after adding custom personal domains
   */
  clearCache() {
    this.domainCache.clear();
    if (this.logger) {
      this.logger.debug('Domain cache cleared');
    }
  }

  /**
   * Get cache statistics (for debugging/monitoring)
   * @returns {Object} - Cache statistics
   */
  getCacheStats() {
    return {
      size: this.domainCache.size,
      personalDomainsCount: this.PERSONAL_DOMAINS.size
    };
  }
}

module.exports = DomainExtractor;