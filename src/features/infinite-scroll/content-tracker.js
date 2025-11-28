/**
 * ContentTracker
 *
 * Tracks seen content via SHA-256 hashing to prevent duplicate contacts
 * during infinite scroll collection. Uses email as primary identifier,
 * falling back to name + phone combination.
 */

const crypto = require('crypto');

class ContentTracker {
  constructor() {
    /** @type {Set<string>} */
    this.seenHashes = new Set();

    /** @type {number} */
    this.duplicatesSkipped = 0;
  }

  /**
   * Generate SHA-256 hash from content string or object
   * @param {string|Object} content - Content to hash
   * @returns {string} - SHA-256 hash
   */
  generateHash(content) {
    let stringContent;

    if (typeof content === 'string') {
      stringContent = content.toLowerCase().trim();
    } else if (typeof content === 'object' && content !== null) {
      // For contact objects, use email as primary identifier
      if (content.email) {
        stringContent = `email:${content.email.toLowerCase().trim()}`;
      } else if (content.name && content.phone) {
        // Fall back to name + phone combination
        stringContent = `name-phone:${content.name.toLowerCase().trim()}-${content.phone.replace(/\D/g, '')}`;
      } else if (content.name) {
        // Fall back to just name
        stringContent = `name:${content.name.toLowerCase().trim()}`;
      } else {
        // Last resort: stringify the entire object
        stringContent = JSON.stringify(content);
      }
    } else {
      // Handle null/undefined gracefully
      stringContent = String(content);
    }

    return crypto.createHash('sha256').update(stringContent).digest('hex');
  }

  /**
   * Generate a unique identifier key for a contact
   * This is a simpler version that returns a human-readable key
   * @param {Object} contact - Contact object
   * @returns {string} - Unique identifier key
   */
  getContactKey(contact) {
    if (!contact) return 'null';

    if (contact.email) {
      return `email:${contact.email.toLowerCase().trim()}`;
    }

    if (contact.name && contact.phone) {
      return `name-phone:${contact.name.toLowerCase().trim()}-${contact.phone.replace(/\D/g, '')}`;
    }

    if (contact.name) {
      return `name:${contact.name.toLowerCase().trim()}`;
    }

    return `item:${JSON.stringify(contact)}`;
  }

  /**
   * Check if a hash has already been seen
   * @param {string} hash - Hash to check
   * @returns {boolean} - True if hash has been seen
   */
  hasSeenHash(hash) {
    return this.seenHashes.has(hash);
  }

  /**
   * Check if content has already been seen
   * @param {string|Object} content - Content to check
   * @returns {boolean} - True if content has been seen
   */
  hasSeenContent(content) {
    const hash = this.generateHash(content);
    return this.seenHashes.has(hash);
  }

  /**
   * Mark a hash as seen
   * @param {string} hash - Hash to mark as seen
   */
  markHashAsSeen(hash) {
    this.seenHashes.add(hash);
  }

  /**
   * Mark content as seen
   * @param {string|Object} content - Content to mark as seen
   * @returns {string} - The hash that was added
   */
  markAsSeen(content) {
    const hash = this.generateHash(content);
    this.seenHashes.add(hash);
    return hash;
  }

  /**
   * Check if content is new and mark it as seen if so
   * @param {string|Object} content - Content to check and mark
   * @returns {boolean} - True if content was new (not seen before)
   */
  checkAndMark(content) {
    const hash = this.generateHash(content);

    if (this.seenHashes.has(hash)) {
      this.duplicatesSkipped++;
      return false; // Already seen
    }

    this.seenHashes.add(hash);
    return true; // New content
  }

  /**
   * Get count of unique items seen
   * @returns {number} - Number of unique items
   */
  getUniqueCount() {
    return this.seenHashes.size;
  }

  /**
   * Get count of duplicates skipped
   * @returns {number} - Number of duplicates skipped
   */
  getDuplicatesSkipped() {
    return this.duplicatesSkipped;
  }

  /**
   * Clear all tracked content (reset for new session)
   */
  clear() {
    this.seenHashes.clear();
    this.duplicatesSkipped = 0;
  }

  /**
   * Get statistics about tracked content
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      uniqueCount: this.seenHashes.size,
      duplicatesSkipped: this.duplicatesSkipped
    };
  }
}

module.exports = ContentTracker;
