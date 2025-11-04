class DataMerger {
  constructor(logger) {
    this.logger = logger;
  }

  mergeContacts(htmlContacts, pdfContacts) {
    this.logger.info(`Merging ${htmlContacts.length} HTML contacts with ${pdfContacts.length} PDF contacts`);
    
    const merged = new Map();
    
    // Add HTML contacts first (they have priority)
    for (const contact of htmlContacts) {
      const key = this.createContactKey(contact);
      merged.set(key, { ...contact, source: 'html' });
    }
    
    this.logger.debug(`Added ${htmlContacts.length} HTML contacts to merge map`);
    
    // Merge PDF contacts
    let newFromPdf = 0;
    let mergedCount = 0;
    
    for (const contact of pdfContacts) {
      const key = this.createContactKey(contact);
      
      if (merged.has(key)) {
        // Contact exists - merge missing fields
        const existing = merged.get(key);
        merged.set(key, this.mergeTwoContacts(existing, contact));
        mergedCount++;
      } else {
        // New contact from PDF
        merged.set(key, { ...contact, source: 'pdf' });
        newFromPdf++;
      }
    }
    
    this.logger.info(`Merge results: ${newFromPdf} new from PDF, ${mergedCount} merged`);
    
    return Array.from(merged.values());
  }

  createContactKey(contact) {
    // Format: "normalized_email||normalized_phone"
    const email = this.normalizeEmail(contact.email);
    const phone = this.normalizePhone(contact.phone);
    
    // If both are empty, use name as fallback (lowercase)
    if (!email && !phone && contact.name) {
      return `||${contact.name.toLowerCase().trim()}`;
    }
    
    return `${email}||${phone}`;
  }

  mergeTwoContacts(existing, newContact) {
    // Track if we actually merged any new data
    let hasNewData = false;
    
    // Merge fields (existing takes priority, fill in nulls from newContact)
    const merged = {
      name: existing.name || newContact.name,
      email: existing.email || newContact.email,
      phone: existing.phone || newContact.phone,
      rawText: existing.rawText || newContact.rawText
    };
    
    // Check if we added any new data from PDF
    if (!existing.name && newContact.name) hasNewData = true;
    if (!existing.email && newContact.email) hasNewData = true;
    if (!existing.phone && newContact.phone) hasNewData = true;
    
    // Set source based on whether we merged new data
    merged.source = hasNewData ? 'merged' : existing.source;
    
    // Recalculate confidence after merge
    merged.confidence = this.calculateConfidence(merged);
    
    return merged;
  }

  normalizeEmail(email) {
    if (!email) return '';
    return email.toLowerCase().trim();
  }

  normalizePhone(phone) {
    if (!phone) return '';
    // Remove all non-digits, keep last 10 digits
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-10);
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
