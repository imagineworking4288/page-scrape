class DataMerger {
  constructor(logger) {
    this.logger = logger;
  }

  mergeContacts(htmlContacts, pdfContacts) {
    this.logger.info(`Merging ${htmlContacts.length} HTML contacts with ${pdfContacts.length} PDF contacts`);
    
    // FIXED: Multi-key matching strategy
    // We'll use Maps for each key type
    const emailMap = new Map();  // email -> contact
    const phoneMap = new Map();  // phone -> contact
    const nameMap = new Map();   // name -> contact
    const allContacts = new Map(); // unique ID -> contact
    
    let contactId = 0;
    
    // Step 1: Add HTML contacts (they have priority)
    for (const contact of htmlContacts) {
      const id = `html_${contactId++}`;
      const contactWithSource = { ...contact, source: 'html', _id: id };
      allContacts.set(id, contactWithSource);
      
      // Register in lookup maps
      if (contact.email) {
        const emailKey = this.normalizeEmail(contact.email);
        emailMap.set(emailKey, id);
      }
      if (contact.phone) {
        const phoneKey = this.normalizePhone(contact.phone);
        phoneMap.set(phoneKey, id);
      }
      if (contact.name) {
        const nameKey = contact.name.toLowerCase().trim();
        nameMap.set(nameKey, id);
      }
    }
    
    this.logger.debug(`Indexed ${htmlContacts.length} HTML contacts`);
    
    // Step 2: Process PDF contacts with multi-key matching
    let newFromPdf = 0;
    let mergedCount = 0;
    
    for (const contact of pdfContacts) {
      let matchedId = null;
      
      // Try to match by email first (most reliable)
      if (contact.email) {
        const emailKey = this.normalizeEmail(contact.email);
        if (emailMap.has(emailKey)) {
          matchedId = emailMap.get(emailKey);
          this.logger.debug(`Matched by email: ${contact.email}`);
        }
      }
      
      // If no email match, try phone
      if (!matchedId && contact.phone) {
        const phoneKey = this.normalizePhone(contact.phone);
        if (phoneMap.has(phoneKey)) {
          matchedId = phoneMap.get(phoneKey);
          this.logger.debug(`Matched by phone: ${contact.phone}`);
        }
      }
      
      // If no email/phone match, try name as last resort
      if (!matchedId && contact.name) {
        const nameKey = contact.name.toLowerCase().trim();
        if (nameMap.has(nameKey)) {
          matchedId = nameMap.get(nameKey);
          this.logger.debug(`Matched by name: ${contact.name}`);
        }
      }
      
      if (matchedId) {
        // Found a match - merge the contacts
        const existing = allContacts.get(matchedId);
        const merged = this.mergeTwoContacts(existing, contact);
        allContacts.set(matchedId, merged);
        
        // Update lookup maps with any new data
        if (merged.email && !emailMap.has(this.normalizeEmail(merged.email))) {
          emailMap.set(this.normalizeEmail(merged.email), matchedId);
        }
        if (merged.phone && !phoneMap.has(this.normalizePhone(merged.phone))) {
          phoneMap.set(this.normalizePhone(merged.phone), matchedId);
        }
        
        mergedCount++;
      } else {
        // No match found - add as new contact from PDF
        const id = `pdf_${contactId++}`;
        const contactWithSource = { ...contact, source: 'pdf', _id: id };
        allContacts.set(id, contactWithSource);
        
        // Register in lookup maps
        if (contact.email) {
          emailMap.set(this.normalizeEmail(contact.email), id);
        }
        if (contact.phone) {
          phoneMap.set(this.normalizePhone(contact.phone), id);
        }
        if (contact.name) {
          nameMap.set(contact.name.toLowerCase().trim(), id);
        }
        
        newFromPdf++;
      }
    }
    
    this.logger.info(`Merge results: ${newFromPdf} new from PDF, ${mergedCount} merged`);
    
    // Convert back to array and remove internal _id field
    return Array.from(allContacts.values()).map(contact => {
      const { _id, ...rest } = contact;
      return rest;
    });
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