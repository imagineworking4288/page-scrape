/**
 * Duplicate Detection Utility
 *
 * Detects and handles duplicate contacts during scraping.
 * Uses multiple strategies for matching including exact, fuzzy, and key-based.
 */

class DuplicateDetector {
  /**
   * @param {Object} options - Configuration
   * @param {Array<string>} options.primaryKeys - Fields to use for primary matching ['email', 'profileUrl']
   * @param {Array<string>} options.secondaryKeys - Fields for secondary matching ['name', 'phone']
   * @param {number} options.fuzzyThreshold - Similarity threshold for fuzzy matching (0-1)
   * @param {Object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.primaryKeys = options.primaryKeys || ['email', 'profileUrl'];
    this.secondaryKeys = options.secondaryKeys || ['name', 'phone'];
    this.fuzzyThreshold = options.fuzzyThreshold || 0.85;
    this.logger = options.logger || console;

    // Storage for seen contacts
    this.seenPrimary = new Map(); // primaryKey -> contact
    this.seenSecondary = new Map(); // secondaryKey -> contact
    this.duplicates = [];
    this.stats = {
      total: 0,
      unique: 0,
      duplicates: 0,
      byKey: {}
    };
  }

  /**
   * Check if a contact is a duplicate
   * @param {Object} contact - Contact object with fields
   * @returns {Object} - { isDuplicate, original, matchType, matchKey }
   */
  check(contact) {
    this.stats.total++;

    // Check primary keys first (exact match)
    for (const key of this.primaryKeys) {
      const value = this.normalize(contact[key]);
      if (value) {
        const mapKey = `${key}:${value}`;
        if (this.seenPrimary.has(mapKey)) {
          this.stats.duplicates++;
          this.stats.byKey[key] = (this.stats.byKey[key] || 0) + 1;

          return {
            isDuplicate: true,
            original: this.seenPrimary.get(mapKey),
            matchType: 'primary',
            matchKey: key
          };
        }
      }
    }

    // Check secondary keys (can be fuzzy)
    for (const key of this.secondaryKeys) {
      const value = this.normalize(contact[key]);
      if (value) {
        const mapKey = `${key}:${value}`;

        // Exact match on secondary key
        if (this.seenSecondary.has(mapKey)) {
          // Secondary matches need additional verification
          const original = this.seenSecondary.get(mapKey);
          if (this.verifySecondaryMatch(contact, original)) {
            this.stats.duplicates++;
            this.stats.byKey[key] = (this.stats.byKey[key] || 0) + 1;

            return {
              isDuplicate: true,
              original: original,
              matchType: 'secondary',
              matchKey: key
            };
          }
        }
      }
    }

    // Not a duplicate - add to seen lists
    this.addToSeen(contact);
    this.stats.unique++;

    return {
      isDuplicate: false,
      original: null,
      matchType: null,
      matchKey: null
    };
  }

  /**
   * Verify secondary key match with additional checks
   * @param {Object} contact - New contact
   * @param {Object} original - Original contact
   * @returns {boolean} - True if likely duplicate
   */
  verifySecondaryMatch(contact, original) {
    // Count how many fields match
    let matchCount = 0;
    const fieldsToCheck = ['name', 'email', 'phone', 'title', 'location'];

    for (const field of fieldsToCheck) {
      const newValue = this.normalize(contact[field]);
      const origValue = this.normalize(original[field]);

      if (newValue && origValue) {
        if (newValue === origValue) {
          matchCount++;
        } else if (this.fuzzyMatch(newValue, origValue)) {
          matchCount += 0.5;
        }
      }
    }

    // Require at least 2 matching fields for secondary confirmation
    return matchCount >= 2;
  }

  /**
   * Add contact to seen maps
   * @param {Object} contact - Contact to add
   */
  addToSeen(contact) {
    // Add to primary key maps
    for (const key of this.primaryKeys) {
      const value = this.normalize(contact[key]);
      if (value) {
        const mapKey = `${key}:${value}`;
        this.seenPrimary.set(mapKey, contact);
      }
    }

    // Add to secondary key maps
    for (const key of this.secondaryKeys) {
      const value = this.normalize(contact[key]);
      if (value) {
        const mapKey = `${key}:${value}`;
        this.seenSecondary.set(mapKey, contact);
      }
    }
  }

  /**
   * Normalize a value for comparison
   * @param {*} value - Value to normalize
   * @returns {string|null} - Normalized string or null
   */
  normalize(value) {
    if (!value) return null;
    if (typeof value !== 'string') return null;

    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s@.-]/g, '');
  }

  /**
   * Fuzzy string matching using Levenshtein-based similarity
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} - True if similarity above threshold
   */
  fuzzyMatch(a, b) {
    if (!a || !b) return false;

    const similarity = this.calculateSimilarity(a, b);
    return similarity >= this.fuzzyThreshold;
  }

  /**
   * Calculate string similarity (0-1)
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} - Similarity score
   */
  calculateSimilarity(a, b) {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const maxLen = Math.max(a.length, b.length);
    const distance = this.levenshteinDistance(a, b);

    return (maxLen - distance) / maxLen;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} - Edit distance
   */
  levenshteinDistance(a, b) {
    const m = a.length;
    const n = b.length;

    // Use two rows instead of full matrix for memory efficiency
    let prev = Array(n + 1).fill(0).map((_, i) => i);
    let curr = Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,      // deletion
          curr[j - 1] + 1,  // insertion
          prev[j - 1] + cost // substitution
        );
      }
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }

  /**
   * Process a batch of contacts and return only unique ones
   * @param {Array<Object>} contacts - Array of contacts
   * @returns {Array<Object>} - Unique contacts
   */
  filterUnique(contacts) {
    const unique = [];

    for (const contact of contacts) {
      const result = this.check(contact);
      if (!result.isDuplicate) {
        unique.push(contact);
      } else {
        this.duplicates.push({
          duplicate: contact,
          original: result.original,
          matchType: result.matchType,
          matchKey: result.matchKey
        });
      }
    }

    return unique;
  }

  /**
   * Get statistics about duplicate detection
   * @returns {Object} - Stats object
   */
  getStats() {
    return {
      ...this.stats,
      duplicateRate: this.stats.total > 0
        ? ((this.stats.duplicates / this.stats.total) * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Get all detected duplicates
   * @returns {Array<Object>} - Duplicate records
   */
  getDuplicates() {
    return this.duplicates;
  }

  /**
   * Reset the detector state
   */
  reset() {
    this.seenPrimary.clear();
    this.seenSecondary.clear();
    this.duplicates = [];
    this.stats = {
      total: 0,
      unique: 0,
      duplicates: 0,
      byKey: {}
    };
  }
}

module.exports = DuplicateDetector;
