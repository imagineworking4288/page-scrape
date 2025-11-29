/**
 * Shared contact extraction utilities
 * Contains all common patterns, regex, and extraction logic used across scrapers
 */

const fs = require('fs');
const path = require('path');

// ===========================
// CONSTANTS AND PATTERNS
// ===========================

/**
 * Comprehensive blacklist of UI elements and common phrases that should never be names
 */
const NAME_BLACKLIST = new Set([
  // Authentication & Navigation
  'sign in', 'log in', 'sign up', 'log out', 'register', 'login',

  // Actions
  'get help', 'contact us', 'about us', 'view profile', 'view all',
  'learn more', 'read more', 'see more', 'show more', 'load more',
  'find an agent', 'find a', 'search', 'filter', 'back to',
  'click here', 'more info', 'details',

  // Contact Labels
  'contact', 'email', 'phone', 'call', 'text', 'message',
  'website', 'address', 'location',

  // Form field labels
  'name', 'first name', 'last name', 'full name',
  'your name', 'enter name', 'user name', 'username',

  // Location labels
  'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island',
  'new york', 'ny', 'nyc', 'city', 'state', 'zip',

  // Menu Items
  'menu', 'home', 'listings', 'properties', 'agents',
  'about', 'services', 'resources', 'blog', 'news',

  // Compass.com specific
  'compass', 'compass one', 'compass luxury', 'compass academy', 'compass plus',
  'compass cares', 'private exclusives', 'coming soon',
  'new development', 'recently sold', 'sales leadership',
  'neighborhood guides', 'mortgage calculator', 'external suppliers',

  // Generic descriptors
  'agent', 'broker', 'realtor', 'licensed', 'certified',
  'team', 'group', 'partners', 'associates'
]);

/**
 * Common non-name words that indicate email prefixes are not personal names
 */
const NON_NAME_WORDS = [
  'info', 'contact', 'admin', 'support', 'team', 'sales',
  'help', 'service', 'office', 'hello', 'inquiries', 'mail',
  'noreply', 'no-reply', 'webmaster', 'postmaster',
  'strategies', 'retail', 'group', 'partners', 'associates',
  'realty', 'properties', 'homes', 'listings'
];

/**
 * Common first names for concatenated email parsing
 */
const COMMON_FIRST_NAMES = [
  'nikki', 'michael', 'melody', 'robin', 'tamara', 'brandon',
  'eric', 'william', 'robert', 'jennifer', 'melissa', 'amanda',
  'christopher', 'matthew', 'daniel', 'elizabeth', 'jonathan',
  'ioana', 'marc', 'emily', 'kayode', 'seema', 'yardena'
];

/**
 * Regular expression patterns
 */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PHONE_REGEXES = [
  /(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
  /(?:\+1[-.\s]?)?([0-9]{3})[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
  /([0-9]{10})/g
];

const NAME_REGEX = /^[A-Z][a-zA-Z'\-\.\s]{1,98}[a-zA-Z]$/;

// ===========================
// HELPER FUNCTIONS
// ===========================

/**
 * Escape regex special characters
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert string to title case
 * @param {string} str - String to convert
 * @returns {string} - Title cased string
 */
function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ===========================
// EMAIL EXTRACTION
// ===========================

/**
 * Extract all emails from text
 * @param {string} text - Text to search
 * @param {string|null} filterDomain - Optional domain to filter by
 * @returns {Array<string>} - Array of email addresses
 */
function extractEmails(text, filterDomain = null) {
  if (!text) return [];

  const matches = text.match(EMAIL_REGEX) || [];
  const uniqueEmails = [...new Set(matches.map(e => e.toLowerCase()))];

  if (filterDomain) {
    const normalizedDomain = filterDomain.toLowerCase();
    return uniqueEmails.filter(email =>
      email.toLowerCase().endsWith('@' + normalizedDomain)
    );
  }

  return uniqueEmails;
}

// ===========================
// PHONE EXTRACTION
// ===========================

/**
 * Extract phone numbers from text
 * @param {string} text - Text to search
 * @returns {Array<string>} - Array of phone numbers
 */
function extractPhones(text) {
  if (!text) return [];

  const phones = [];
  for (const regex of PHONE_REGEXES) {
    // Reset regex state
    regex.lastIndex = 0;
    const matches = text.match(regex);
    if (matches) {
      phones.push(...matches);
    }
  }

  return [...new Set(phones)];
}

/**
 * Normalize phone number to +1-XXX-XXX-XXXX format
 * @param {string} phone - Phone number to normalize
 * @returns {string|null} - Normalized phone or null
 */
function normalizePhone(phone) {
  if (!phone) return null;

  // Extract digits only
  const digits = phone.replace(/\D/g, '');

  // Format based on length
  if (digits.length === 10) {
    return `+1-${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+${digits[0]}-${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
  }

  return phone; // Return as-is if can't normalize
}

// ===========================
// NAME VALIDATION
// ===========================

/**
 * Check if text is a valid name candidate
 * @param {string} text - Candidate text
 * @returns {boolean}
 */
function isValidNameCandidate(text) {
  if (!text || text.length < 2 || text.length > 50) return false;

  // Check against comprehensive blacklist (case-insensitive exact match)
  const lowerText = text.toLowerCase();
  if (NAME_BLACKLIST.has(lowerText)) {
    return false;
  }

  // Also check for partial matches with common UI words
  const uiWords = ['find', 'agent', 'last name', 'first name', 'register', 'login', 'view', 'profile'];
  if (uiWords.some(word => lowerText.includes(word))) {
    return false;
  }

  // Must have at least one letter
  if (!/[a-zA-Z]/.test(text)) {
    return false;
  }

  // Must start with capital letter
  if (!text[0] || text[0] !== text[0].toUpperCase()) {
    return false;
  }

  // Must have 1-5 words
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 1 || wordCount > 5) return false;

  return true;
}

/**
 * Validate and clean name text
 * @param {string} text - Text to validate
 * @returns {string|null} - Cleaned name or null
 */
function validateAndCleanName(text) {
  if (!text || text.length < 2 || text.length > 100) return null;

  text = text.trim();

  // Check blacklist (case-insensitive)
  if (NAME_BLACKLIST.has(text.toLowerCase())) return null;

  // Check against NAME_REGEX
  if (NAME_REGEX.test(text)) {
    return text;
  }

  return null;
}

// ===========================
// NAME EXTRACTION
// ===========================

/**
 * Extract name from email address (fallback method)
 * @param {string} email - Email address
 * @returns {string|null} - Derived name or null
 */
function extractNameFromEmail(email) {
  if (!email || typeof email !== 'string') return null;

  const prefix = email.split('@')[0];
  if (!prefix || prefix.length < 2) return null;

  // Filter out non-name patterns
  const lowerPrefix = prefix.toLowerCase();
  if (NON_NAME_WORDS.some(word => lowerPrefix === word || lowerPrefix.includes(word))) {
    return null;
  }

  // Reject if too long (likely team name)
  if (prefix.length > 25) return null;

  // Split on delimiters
  const parts = prefix.split(/[._-]+/);
  const validParts = parts.filter(p => p.length > 0 && !/^\d+$/.test(p));

  if (validParts.length === 0) return null;

  // Handle concatenated names (e.g., "nikkiadamo", "macevedo")
  if (validParts.length === 1 && validParts[0].length > 8) {
    const concatenated = validParts[0];

    // Try common first name dictionary
    for (const firstName of COMMON_FIRST_NAMES) {
      if (concatenated.toLowerCase().startsWith(firstName)) {
        const lastName = concatenated.substring(firstName.length);
        if (lastName.length >= 2) {
          return toTitleCase(firstName) + ' ' + toTitleCase(lastName);
        }
      }
    }

    // Fallback: split at midpoint
    const mid = Math.ceil(concatenated.length / 2);
    return toTitleCase(concatenated.substring(0, mid)) + ' ' +
           toTitleCase(concatenated.substring(mid));
  }

  // Handle single-letter initials
  const titleCaseParts = validParts.map(part => {
    if (part.length === 1) {
      return part.toUpperCase() + '.'; // "m" → "M."
    }
    return toTitleCase(part);
  });

  const name = titleCaseParts.join(' ');

  // Validate result - accept if reasonable length
  const words = name.split(/\s+/);
  if (words.length >= 1 && words.length <= 6) {
    return name;
  }

  return null;
}

/**
 * Score name candidate based on proximity to email and term matching
 * @param {string} candidateName - Name to score
 * @param {Array} emailTerms - Terms from email prefix
 * @param {number} distance - Character distance from email
 * @returns {number} - Score (higher is better)
 */
function scoreNameCandidate(candidateName, emailTerms, distance) {
  let score = 0;

  // Proximity score (closer = better, max 50 points)
  const proximityScore = Math.max(0, 50 - (distance / 2));
  score += proximityScore;

  // Email term matching score (max 40 points)
  const nameLower = candidateName.toLowerCase();
  const nameWords = nameLower.split(/\s+/);

  let matchedTerms = 0;
  for (const term of emailTerms) {
    const termLower = term.toLowerCase();
    if (nameWords.some(word => word.includes(termLower) || termLower.includes(word))) {
      matchedTerms++;
    }
  }

  if (emailTerms.length > 0) {
    score += (matchedTerms / emailTerms.length) * 40;
  }

  // Completeness score (2+ words = 10 points)
  if (nameWords.length >= 2) {
    score += 10;
  }

  return score;
}

/**
 * Find name in context by searching for capitalized word sequences
 * Prioritizes names closest to the email position
 * @param {string} beforeContext - Text before the email
 * @param {string} email - Email address for term matching
 * @param {number} emailPos - Position of email in full document
 * @returns {Object|null} - {name, distance, score} or null
 */
function findNameInContext(beforeContext, email, emailPos) {
  const lines = beforeContext.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Extract email terms for scoring
  const emailPrefix = email.split('@')[0].toLowerCase();
  const emailTerms = emailPrefix.split(/[._-]+/).filter(t => t.length >= 2);

  const candidates = [];

  // Search lines from closest to email (end) to furthest (start)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const linePositionInContext = beforeContext.lastIndexOf(line);
    const distanceFromEmail = beforeContext.length - linePositionInContext;

    // Extract all capitalized word sequences from this line
    const namePattern = /\b([A-Z][a-z]+(?:[\s'-][A-Z][a-z]+){0,4})\b/g;
    let match;

    while ((match = namePattern.exec(line)) !== null) {
      const candidateName = match[1].trim();

      // Validate candidate
      if (!isValidNameCandidate(candidateName)) {
        continue;
      }

      // Calculate score based on proximity and email term matching
      const score = scoreNameCandidate(candidateName, emailTerms, distanceFromEmail);

      candidates.push({
        name: candidateName,
        distance: distanceFromEmail,
        score,
        line
      });
    }
  }

  // Return highest scoring candidate
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/**
 * Find phone number in context text
 * @param {string} context - Text to search
 * @returns {string|null} - Phone number or null
 */
function findPhoneInContext(context) {
  const phonePatterns = [
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    /\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/,
    /\d{10}/
  ];

  for (const pattern of phonePatterns) {
    const match = context.match(pattern);
    if (match) return match[0];
  }

  return null;
}

// ===========================
// CONFIDENCE CALCULATION
// ===========================

/**
 * Calculate confidence based on available data
 * @param {string|null} name - Contact name
 * @param {string|null} email - Contact email
 * @param {string|null} phone - Contact phone
 * @returns {string} - 'high', 'medium', or 'low'
 */
function calculateConfidence(name, email, phone) {
  const hasName = !!name;
  const hasEmail = !!email;
  const hasPhone = !!phone;

  if (hasName && hasEmail && hasPhone) {
    return 'high';
  } else if ((hasName && hasEmail) || (hasEmail && hasPhone) || (hasName && hasPhone)) {
    return 'medium';
  } else {
    return 'low';
  }
}

// ===========================
// DOM ELEMENT EXTRACTION (UNIVERSAL)
// ===========================

/**
 * Extract emails from a DOM element using multiple strategies
 * Works with both mailto links AND plain text emails
 * @param {Object} element - DOM element (in browser context)
 * @param {Object} options - Extraction options
 * @returns {Array<string>} - Array of email addresses
 */
function extractEmailsFromElementCode() {
  // This function returns code to be executed in browser context
  return `
    function extractEmailsFromElement(element, options = {}) {
      const emails = [];
      const seen = new Set();
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;

      // Strategy 0: Links with "Email" or "email" text (HIGHEST PRIORITY)
      // Critical for sites like Sullivan & Cromwell where link text is "Email" but href has mailto:
      const allEmailTextLinks = element.querySelectorAll('a[href]');
      allEmailTextLinks.forEach(link => {
        const linkText = link.textContent.trim().toLowerCase();
        if (linkText === 'email' || linkText === 'e-mail' || linkText === 'send email' || linkText === 'contact email') {
          const href = link.href || '';
          // Check if href contains mailto:
          if (href.toLowerCase().includes('mailto:')) {
            const emailPart = href.replace(/mailto:/i, '').split('?')[0].toLowerCase().trim();
            if (emailPart && emailPart.includes('@') && !seen.has(emailPart)) {
              seen.add(emailPart);
              emails.push({ email: emailPart, source: 'email-link-text', confidence: 'high' });
            }
          } else {
            // Check if href directly contains an email pattern
            emailRegex.lastIndex = 0;
            const match = href.match(emailRegex);
            if (match && !seen.has(match[0].toLowerCase())) {
              seen.add(match[0].toLowerCase());
              emails.push({ email: match[0].toLowerCase(), source: 'email-link-href', confidence: 'high' });
            }
          }
        }
      });

      // Strategy 1: mailto: links (most reliable)
      const mailtoLinks = element.querySelectorAll('a[href^="mailto:"]');
      mailtoLinks.forEach(link => {
        const email = link.href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
        if (email && !seen.has(email)) {
          seen.add(email);
          emails.push({ email, source: 'mailto', confidence: 'high' });
        }
      });

      // Strategy 2: Plain text email regex in text content
      const textContent = element.textContent || '';
      const textMatches = textContent.match(emailRegex) || [];
      textMatches.forEach(email => {
        const lowerEmail = email.toLowerCase();
        if (!seen.has(lowerEmail)) {
          seen.add(lowerEmail);
          emails.push({ email: lowerEmail, source: 'text', confidence: 'medium' });
        }
      });

      // Strategy 3: data-email attributes
      const dataEmailEls = element.querySelectorAll('[data-email], [data-mail]');
      dataEmailEls.forEach(el => {
        const email = (el.dataset.email || el.dataset.mail || '').toLowerCase().trim();
        if (email && emailRegex.test(email) && !seen.has(email)) {
          seen.add(email);
          emails.push({ email, source: 'data-attr', confidence: 'high' });
        }
      });

      // Strategy 4: Obfuscated emails (common patterns)
      // Pattern: "name [at] domain [dot] com" or "name(at)domain(dot)com"
      const obfuscatedRegex = /([a-zA-Z0-9._%+-]+)\\s*[\\[\\(]?(?:at|AT|@)[\\]\\)]?\\s*([a-zA-Z0-9.-]+)\\s*[\\[\\(]?(?:dot|DOT|\\.)[\\]\\)]?\\s*([a-zA-Z]{2,})/g;
      let obfMatch;
      while ((obfMatch = obfuscatedRegex.exec(textContent)) !== null) {
        const email = (obfMatch[1] + '@' + obfMatch[2] + '.' + obfMatch[3]).toLowerCase();
        if (!seen.has(email)) {
          seen.add(email);
          emails.push({ email, source: 'obfuscated', confidence: 'medium' });
        }
      }

      // Strategy 5: href with encoded email
      const allLinks = element.querySelectorAll('a[href]');
      allLinks.forEach(link => {
        try {
          const decoded = decodeURIComponent(link.href);
          const match = decoded.match(emailRegex);
          if (match) {
            match.forEach(email => {
              const lowerEmail = email.toLowerCase();
              if (!seen.has(lowerEmail)) {
                seen.add(lowerEmail);
                emails.push({ email: lowerEmail, source: 'encoded-href', confidence: 'medium' });
              }
            });
          }
        } catch (e) {}
      });

      return emails;
    }
  `;
}

/**
 * Extract phones from a DOM element using multiple strategies
 * Works with both tel links AND plain text phones
 * @param {Object} element - DOM element (in browser context)
 * @param {Object} options - Extraction options
 * @returns {Array<string>} - Array of phone numbers
 */
function extractPhonesFromElementCode() {
  // This function returns code to be executed in browser context
  return `
    function extractPhonesFromElement(element, options = {}) {
      const phones = [];
      const seen = new Set();

      // Helper to normalize phone for dedup
      const normalizeForDedup = (phone) => phone.replace(/\\D/g, '');

      // Strategy 1: tel: links (most reliable)
      const telLinks = element.querySelectorAll('a[href^="tel:"]');
      telLinks.forEach(link => {
        const phone = link.href.replace('tel:', '').trim();
        const normalized = normalizeForDedup(phone);
        if (normalized.length >= 10 && !seen.has(normalized)) {
          seen.add(normalized);
          phones.push({ phone, source: 'tel', confidence: 'high' });
        }
      });

      // Strategy 2: Plain text phone regex
      const phonePatterns = [
        /(?:\\+1[-. ]?)?\\(?([0-9]{3})\\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/g,
        /([0-9]{3})[-. ]([0-9]{3})[-. ]([0-9]{4})/g,
        /\\+1[-.\\s]?\\d{3}[-.\\s]?\\d{3}[-.\\s]?\\d{4}/g
      ];

      const textContent = element.textContent || '';

      for (const pattern of phonePatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(textContent)) !== null) {
          const phone = match[0];
          const normalized = normalizeForDedup(phone);
          if (normalized.length >= 10 && !seen.has(normalized)) {
            seen.add(normalized);
            phones.push({ phone, source: 'text', confidence: 'medium' });
          }
        }
      }

      // Strategy 3: data-phone attributes
      const dataPhoneEls = element.querySelectorAll('[data-phone], [data-tel], [data-telephone]');
      dataPhoneEls.forEach(el => {
        const phone = (el.dataset.phone || el.dataset.tel || el.dataset.telephone || '').trim();
        const normalized = normalizeForDedup(phone);
        if (normalized.length >= 10 && !seen.has(normalized)) {
          seen.add(normalized);
          phones.push({ phone, source: 'data-attr', confidence: 'high' });
        }
      });

      // Strategy 4: Elements with phone-related classes
      const phoneClassEls = element.querySelectorAll('.phone, .telephone, [class*="phone"], [class*="tel-"]');
      phoneClassEls.forEach(el => {
        const text = el.textContent.trim();
        const digits = text.replace(/\\D/g, '');
        if (digits.length >= 10 && digits.length <= 11 && !seen.has(digits)) {
          seen.add(digits);
          phones.push({ phone: text, source: 'class-hint', confidence: 'medium' });
        }
      });

      return phones;
    }
  `;
}

/**
 * Extract name from a DOM element using multiple strategies
 * Works with heading tags, classes, and context clues
 * @returns {string} - Code to execute in browser context
 */
function extractNameFromElementCode() {
  return `
    function extractNameFromElement(element, options = {}) {
      const blacklist = options.blacklist || new Set([
        'sign in', 'log in', 'sign up', 'register', 'contact us', 'about us',
        'view profile', 'learn more', 'read more', 'see more', 'load more',
        'email', 'phone', 'call', 'text', 'message', 'website', 'address',
        'menu', 'home', 'search', 'filter', 'back', 'next', 'previous'
      ]);

      const candidates = [];

      // Priority selectors in order of reliability
      const selectorGroups = [
        // Group 1: Heading tags (most likely to contain names)
        ['h1', 'h2', 'h3', 'h4'],

        // Group 2: Specific name-related classes
        ['.name', '.attorney-name', '.lawyer-name', '.agent-name', '.person-name',
         '[class*="name"]:not([class*="username"]):not([class*="filename"])'],

        // Group 3: Links to profiles (often contain names)
        ['a[href*="/lawyer/"]', 'a[href*="/attorney/"]', 'a[href*="/Lawyers/"]',
         'a[href*="/agent/"]', 'a[href*="/profile/"]', 'a[href*="/people/"]'],

        // Group 4: Common emphasis tags
        ['strong', 'b'],

        // Group 5: Title-related elements
        ['.title', '[class*="title"]']
      ];

      for (let groupIndex = 0; groupIndex < selectorGroups.length; groupIndex++) {
        const selectors = selectorGroups[groupIndex];

        for (const sel of selectors) {
          try {
            const elements = element.querySelectorAll(sel);

            for (const el of elements) {
              let text = el.textContent.trim();

              // Skip empty or too long
              if (!text || text.length < 2 || text.length > 100) continue;

              // Skip if in blacklist (case-insensitive)
              if (blacklist.has(text.toLowerCase())) continue;

              // Skip if contains newlines (likely multi-line content)
              if (text.includes('\\n') && text.split('\\n').length > 2) continue;

              // Clean up common prefixes/suffixes
              text = text
                .replace(/^(attorney|lawyer|agent|broker|realtor|mr\\.|mrs\\.|ms\\.|dr\\.)\\s+/i, '')
                .replace(/,?\\s*(jr\\.?|sr\\.?|ii|iii|iv|esq\\.?|phd|md)\\.?$/i, '')
                .trim();

              // Re-check length after cleanup
              if (text.length < 2 || text.length > 100) continue;

              // Check word count (names should be 1-5 words)
              const wordCount = text.split(/\\s+/).length;
              if (wordCount < 1 || wordCount > 5) continue;

              // Must start with capital letter
              if (!/^[A-Z]/.test(text)) continue;

              // Must be mostly letters
              if (!/^[A-Za-z\\s'\\-\\.]+$/.test(text)) continue;

              // Calculate priority score based on group and position
              const priority = (selectorGroups.length - groupIndex) * 10;

              candidates.push({
                name: text,
                priority,
                selector: sel
              });
            }
          } catch (e) {}
        }
      }

      // Return highest priority candidate
      if (candidates.length === 0) return null;

      candidates.sort((a, b) => b.priority - a.priority);
      return candidates[0].name;
    }
  `;
}

/**
 * Get the universal extraction code for browser context
 * This bundles all extraction functions to be evaluated in Puppeteer
 * @returns {string} - JavaScript code string
 */
function getUniversalExtractionCode() {
  return `
    ${extractEmailsFromElementCode()}
    ${extractPhonesFromElementCode()}
    ${extractNameFromElementCode()}

    // Main extraction function for a card element
    function extractContactFromCard(card, options = {}) {
      const emails = extractEmailsFromElement(card, options);
      const phones = extractPhonesFromElement(card, options);
      const name = extractNameFromElement(card, options);

      // Get best email (prefer mailto, then data-attr, then text)
      const emailPriority = { 'mailto': 3, 'data-attr': 2, 'text': 1, 'obfuscated': 1, 'encoded-href': 1 };
      emails.sort((a, b) => (emailPriority[b.source] || 0) - (emailPriority[a.source] || 0));
      const bestEmail = emails[0]?.email || null;

      // Get best phone (prefer tel, then data-attr, then text)
      const phonePriority = { 'tel': 3, 'data-attr': 2, 'text': 1, 'class-hint': 1 };
      phones.sort((a, b) => (phonePriority[b.source] || 0) - (phonePriority[a.source] || 0));
      const bestPhone = phones[0]?.phone || null;

      // Calculate confidence
      let confidence = 'low';
      if (name && bestEmail && bestPhone) {
        confidence = 'high';
      } else if ((name && bestEmail) || (bestEmail && bestPhone) || (name && bestPhone)) {
        confidence = 'medium';
      }

      return {
        name,
        email: bestEmail,
        phone: bestPhone,
        confidence,
        _extraction: {
          emailSource: emails[0]?.source || null,
          phoneSource: phones[0]?.source || null,
          allEmails: emails.length,
          allPhones: phones.length
        }
      };
    }
  `;
}

// ===========================
// PDF RENDERING
// ===========================

/**
 * Render page to PDF and parse text content
 * @param {Object} page - Puppeteer page object
 * @param {boolean} keepPdf - Whether to keep the PDF file
 * @param {Object} logger - Logger instance
 * @returns {Object} - {fullText, sections}
 */
async function renderAndParsePdf(page, keepPdf = false, logger = console) {
  // Load pdf-parse dynamically
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (error) {
    throw new Error('pdf-parse is required. Install with: npm install pdf-parse');
  }

  const timestamp = new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .substring(0, 19);

  const pdfDir = path.join(process.cwd(), 'output', 'pdfs');
  const pdfPath = path.join(pdfDir, `scrape-${timestamp}.pdf`);

  // Create directory if needed
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
    logger.info(`Created PDF directory: ${pdfDir}`);
  }

  try {
    // Save PDF to disk (not memory)
    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
      timeout: 60000  // Add 60 second timeout
    });

    logger.info(`PDF saved: ${pdfPath}`);

    // Read from disk and parse
    const pdfBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(pdfBuffer);

    // Conditional deletion based on --keep flag
    if (!keepPdf) {
      fs.unlinkSync(pdfPath);
      logger.info(`PDF deleted: ${pdfPath}`);
    } else {
      logger.info(`PDF kept: ${pdfPath}`);
    }

    return {
      fullText: data.text,
      sections: data.text.split(/\n\s*\n+/).map(s => s.trim()).filter(s => s.length > 20)
    };
  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
      logger.warn(`Deleted PDF after error: ${pdfPath}`);
    }
    throw error;
  }
}

// ===========================
// EXPORTS
// ===========================

module.exports = {
  // Constants
  NAME_BLACKLIST,
  NON_NAME_WORDS,
  COMMON_FIRST_NAMES,
  EMAIL_REGEX,
  PHONE_REGEXES,
  NAME_REGEX,

  // Helper functions
  escapeRegex,
  toTitleCase,

  // Email extraction
  extractEmails,

  // Phone extraction
  extractPhones,
  normalizePhone,

  // Name validation
  isValidNameCandidate,
  validateAndCleanName,

  // Name extraction
  extractNameFromEmail,
  scoreNameCandidate,
  findNameInContext,
  findPhoneInContext,

  // Confidence
  calculateConfidence,

  // PDF
  renderAndParsePdf,

  // Universal DOM extraction (browser context code generators)
  extractEmailsFromElementCode,
  extractPhonesFromElementCode,
  extractNameFromElementCode,
  getUniversalExtractionCode
};
