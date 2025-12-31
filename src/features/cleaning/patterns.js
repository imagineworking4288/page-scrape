/**
 * Centralized Regex Patterns for Data Cleaning
 *
 * Contains all patterns used by extractors and cleaners.
 * Provides both single-match and global versions where needed.
 */

// Email pattern - matches standard email format
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const EMAIL_GLOBAL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Phone pattern - strict version for extraction (valid US area codes)
const PHONE = /(?:\+?1[-.\s]?)?(?:\(?[2-9]\d{2}\)?[-.\s]?)?[2-9]\d{2}[-.\s]?\d{4}/;
const PHONE_GLOBAL = /(?:\+?1[-.\s]?)?(?:\(?[2-9]\d{2}\)?[-.\s]?)?[2-9]\d{2}[-.\s]?\d{4}/g;

// Phone pattern - permissive version for cleaning (removes any phone-like pattern)
const PHONE_PERMISSIVE = /(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/;
const PHONE_PERMISSIVE_GLOBAL = /(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g;

// Title suffixes that get concatenated with names
const TITLE_SUFFIX = /(Partner|Associate|Counsel|Attorney|Director|Manager|Of Counsel|Senior Associate|Managing Director|Vice President|VP|CEO|CFO|CTO|COO|Principal|Member|Fellow|Scholar|Retired)$/i;

// Credential suffixes
const CREDENTIAL_SUFFIX = /,?\s*(JD|MD|PhD|Esq\.?|CPA|MBA|LLM|LLB|CFA|CFP|PE|RN|DO|DDS|III|IV|Jr\.?|Sr\.?)\.?$/i;

// Spam/invalid name patterns
const NAME_SPAM = /^(View Profile|Contact Us|Learn More|Click Here|Load More|See Details|Read More|Show More|View All|Download vCard|vCard|Email|Phone|Fax|Address|Office|Location)$/i;

// URL pattern
const URL = /https?:\/\/[^\s]+/;
const URL_GLOBAL = /https?:\/\/[^\s]+/g;

module.exports = {
  // Email patterns
  EMAIL,
  EMAIL_GLOBAL,

  // Phone patterns (strict - for extraction)
  PHONE,
  PHONE_GLOBAL,

  // Phone patterns (permissive - for cleaning)
  PHONE_PERMISSIVE,
  PHONE_PERMISSIVE_GLOBAL,

  // Name-related patterns
  TITLE_SUFFIX,
  CREDENTIAL_SUFFIX,
  NAME_SPAM,

  // URL patterns
  URL,
  URL_GLOBAL
};
