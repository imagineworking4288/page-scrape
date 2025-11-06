const DomainExtractor = require('../utils/domain-extractor');

class DataMerger {
  constructor(logger) {
    this.logger = logger;
    
    // Initialize domain extractor
    this.domainExtractor = new DomainExtractor(logger);
    
    // Pre-compiled regex for phone cleaning
    this.PHONE_CLEAN_REGEX = /\D/g;
  }

  mergeContacts(htmlContacts, pdfContacts) {
    this.logger.info(`Merging ${htmlContacts.length} HTML contacts with ${pdfContacts.length} PDF contacts`);
    
    // IMPROVED: Normalize all phones before matching
    const normalizedHtml = htmlContacts.map(c => this.normalizeContact(c));
    const normalizedPdf = pdfContacts.map(c => this.normalizeContact(c));
    
    // Multi-key matching strategy (now includes domain)
    const emailMap = new Map();
    const phoneMap = new Map();
    const nameMap = new Map();
    const domainMap = new Map(); // NEW: Domain-based grouping
    const allContacts = new Map();
    
    let contactId = 0;
    
    // Step 1: Add HTML contacts (they have priority)
    for (const contact of normalizedHtml) {
      const id = `html_${contactId++}`;
      const contactWithSource = { ...contact, source: 'html', _id: id };
      allContacts.set(id, contactWithSource);
      
      // Register in lookup maps (using normalized values)
      if (contact.emailNormalized) {
        emailMap.set(contact.emailNormalized, id);
      }
      if (contact.phoneNormalized) {
        phoneMap.set(contact.phoneNormalized, id);
      }
      if (contact.nameNormalized) {
        nameMap.set(contact.nameNormalized, id);
      }
      
      // NEW: Register in domain map for domain-based matching
      if (contact.domain) {
        if (!domainMap.has(contact.domain)) {
          domainMap.set(contact.domain, []);
        }
        domainMap.get(contact.domain).push(id);
      }
    }
    
    this.logger.debug(`Indexed ${normalizedHtml.length} HTML contacts`);
    
    // Step 2: Process PDF contacts with multi-key matching (now includes domain)
    let newFromPdf = 0;
    let mergedCount = 0;
    
    for (const contact of normalizedPdf) {
      let matchedId = null;
      let matchType = null;
      
      // Try to match by email first (most reliable)
      if (contact.emailNormalized && emailMap.has(contact.emailNormalized)) {
        matchedId = emailMap.get(contact.emailNormalized);
        matchType = 'email';
      }
      
      // If no email match, try phone
      if (!matchedId && contact.phoneNormalized && phoneMap.has(contact.phoneNormalized)) {
        matchedId = phoneMap.get(contact.phoneNormalized);
        matchType = 'phone';
      }
      
      // NEW: If no email/phone match, try domain + name combination
      if (!matchedId && contact.domain && contact.nameNormalized) {
        const sameDomainContacts = domainMap.get(contact.domain) || [];
        for (const existingId of sameDomainContacts) {
          const existing = allContacts.get(existingId);
          if (existing.nameNormalized === contact.nameNormalized) {
            matchedId = existingId;
            matchType = 'domain+name';
            break;
          }
        }
      }
      
      // If no match yet, try name as last resort
      if (!matchedId && contact.nameNormalized && nameMap.has(contact.nameNormalized)) {
        matchedId = nameMap.get(contact.nameNormalized);
        matchType = 'name';
      }
      
      if (matchedId) {
        // Found a match - merge the contacts
        const existing = allContacts.get(matchedId);
        const merged = this.mergeTwoContacts(existing, contact);
        allContacts.set(matchedId, merged);
        
        // Update lookup maps with any new normalized data
        if (merged.emailNormalized && !emailMap.has(merged.emailNormalized)) {
          emailMap.set(merged.emailNormalized, matchedId);
        }
        if (merged.phoneNormalized && !phoneMap.has(merged.phoneNormalized)) {
          phoneMap.set(merged.phoneNormalized, matchedId);
        }
        
        // NEW: Update domain map if domain was added
        if (merged.domain && !domainMap.has(merged.domain)) {
          domainMap.set(merged.domain, [matchedId]);
        } else if (merged.domain && !domainMap.get(merged.domain).includes(matchedId)) {
          domainMap.get(merged.domain).push(matchedId);
        }
        
        this.logger.debug(`Matched by ${matchType}: ${contact.name || contact.email || contact.phone}`);
        mergedCount++;
      } else {
        // No match found - add as new contact from PDF
        const id = `pdf_${contactId++}`;
        const contactWithSource = { ...contact, source: 'pdf', _id: id };
        allContacts.set(id, contactWithSource);
        
        // Register in lookup maps
        if (contact.emailNormalized) {
          emailMap.set(contact.emailNormalized, id);
        }
        if (contact.phoneNormalized) {
          phoneMap.set(contact.phoneNormalized, id);
        }
        if (contact.nameNormalized) {
          nameMap.set(contact.nameNormalized, id);
        }
        
        // NEW: Register in domain map
        if (contact.domain) {
          if (!domainMap.has(contact.domain)) {
            domainMap.set(contact.domain, []);
          }
          domainMap.get(contact.domain).push(id);
        }
        
        newFromPdf++;
      }
    }
    
    this.logger.info(`Merge results: ${newFromPdf} new from PDF, ${mergedCount} merged`);
    
    // Convert back to array and remove internal fields
    return Array.from(allContacts.values()).map(contact => this.cleanContact(contact));
  }

  /**
   * IMPROVED: Normalize a contact (email, phone, name, domain)
   * This ensures consistent matching across sources
   */
  normalizeContact(contact) {
    const normalized = { ...contact };
    
    // Normalize email (lowercase, trim)
    if (contact.email) {
      normalized.emailNormalized = this.normalizeEmail(contact.email);
    }
    
    // IMPROVED: Unified phone normalization
    if (contact.phone) {
      normalized.phoneNormalized = this.normalizePhone(contact.phone);
      // Also store formatted version for display
      normalized.phoneFormatted = this.formatPhone(normalized.phoneNormalized);
    }
    
    // IMPROVED: Better name normalization
    if (contact.name) {
      normalized.nameNormalized = this.normalizeName(contact.name);
    }
    
    // NEW: Ensure domain is present and normalized
    if (contact.email && !contact.domain) {
      const domain = this.domainExtractor.extractAndNormalize(contact.email);
      if (domain) {
        normalized.domain = domain;
        normalized.domainType = this.domainExtractor.isBusinessDomain(domain) ? 'business' : 'personal';
      }
    }
    
    return normalized;
  }

  /**
   * Clean a contact by removing internal normalization fields
   */
  cleanContact(contact) {
    const { _id, emailNormalized, phoneNormalized, nameNormalized, ...cleaned } = contact;
    
    // Use formatted phone if available
    if (cleaned.phoneFormatted) {
      cleaned.phone = cleaned.phoneFormatted;
      delete cleaned.phoneFormatted;
    }
    
    return cleaned;
  }

  /**
   * MODIFIED: Merge two contacts with domain preservation
   */
  mergeTwoContacts(existing, newContact) {
    // Track if we actually merged any new data
    let hasNewData = false;
    
    // Merge fields (existing takes priority, fill in nulls from newContact)
    const merged = {
      name: existing.name || newContact.name,
      email: existing.email || newContact.email,
      phone: existing.phone || newContact.phone,
      phoneFormatted: existing.phoneFormatted || newContact.phoneFormatted,
      rawText: existing.rawText || newContact.rawText,
      
      // NEW: Preserve domain information
      domain: existing.domain || newContact.domain,
      domainType: existing.domainType || newContact.domainType,
      
      // Keep normalized fields for potential future matching
      emailNormalized: existing.emailNormalized || newContact.emailNormalized,
      phoneNormalized: existing.phoneNormalized || newContact.phoneNormalized,
      nameNormalized: existing.nameNormalized || newContact.nameNormalized
    };
    
    // Check if we added any new data from PDF
    if (!existing.name && newContact.name) hasNewData = true;
    if (!existing.email && newContact.email) hasNewData = true;
    if (!existing.phone && newContact.phone) hasNewData = true;
    if (!existing.domain && newContact.domain) hasNewData = true;
    
    // Set source based on whether we merged new data
    merged.source = hasNewData ? 'merged' : existing.source;
    
    // Recalculate confidence after merge
    merged.confidence = this.calculateConfidence(merged);
    
    return merged;
  }

  /**
   * Normalize email: lowercase and trim
   */
  normalizeEmail(email) {
    if (!email) return '';
    return email.toLowerCase().trim();
  }

  /**
   * IMPROVED: Unified phone normalization
   * Handles all formats and normalizes to digits-only
   * @param {string} phone - Phone in any format
   * @returns {string} - 10 digits (or original if can't normalize)
   */
  normalizePhone(phone) {
    if (!phone) return '';
    
    // Remove all non-digits
    const digits = phone.replace(this.PHONE_CLEAN_REGEX, '');
    
    // Handle different lengths
    if (digits.length === 10) {
      // Perfect: 1234567890
      return digits;
    } else if (digits.length === 11 && digits[0] === '1') {
      // US format with country code: 11234567890
      return digits.substring(1);
    } else if (digits.length > 10) {
      // Take last 10 digits
      return digits.slice(-10);
    } else if (digits.length === 7) {
      // Local number without area code - can't reliably match
      this.logger.debug(`Phone too short (7 digits): ${phone}`);
      return '';
    } else {
      // Unknown format
      this.logger.debug(`Unusual phone format: ${phone} (${digits.length} digits)`);
      return digits; // Return as-is for now
    }
  }

  /**
   * Format phone for display: (123) 456-7890
   * @param {string} normalizedPhone - 10 digits
   * @returns {string} - Formatted phone
   */
  formatPhone(normalizedPhone) {
    if (!normalizedPhone || normalizedPhone.length !== 10) {
      return normalizedPhone; // Return as-is if can't format
    }
    
    return `(${normalizedPhone.substring(0, 3)}) ${normalizedPhone.substring(3, 6)}-${normalizedPhone.substring(6)}`;
  }

  /**
   * IMPROVED: Better name normalization
   * Handles extra whitespace, case, punctuation
   */
  normalizeName(name) {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .replace(/\s+/g, ' ')  // Collapse multiple spaces
      .replace(/[^\w\s'-]/g, '') // Remove special chars except apostrophes and hyphens
      .trim();
  }

  calculateConfidence(contact) {
    const hasName = !!contact.name;
    const hasEmail = !!contact.email;
    const hasPhone = !!contact.phone;
    
    if (hasName && hasEmail && hasPhone) {
      return 'high';
    } else if ((hasEmail && hasPhone) || (hasName && hasEmail) || (hasName && hasPhone)) {
      return 'medium';
    } else {
      return 'low';
    }
  }
}

module.exports = DataMerger;