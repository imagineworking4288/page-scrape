/**
 * Field Requirements Constants v2.2
 *
 * Centralized configuration for field definitions, validation rules,
 * and metadata used throughout the manual field selection system.
 */

/**
 * Required fields that must be selected for a valid config
 */
const REQUIRED_FIELDS = ['name', 'email', 'profileUrl'];

/**
 * Optional fields that can be skipped
 */
const OPTIONAL_FIELDS = ['phone', 'title', 'location'];

/**
 * Order in which fields are presented during manual selection
 */
const FIELD_ORDER = ['name', 'email', 'phone', 'profileUrl', 'title', 'location'];

/**
 * Complete metadata for each field
 */
const FIELD_METADATA = {
  name: {
    id: 'name',
    label: 'Name',
    prompt: 'Click on a person\'s NAME in the card',
    validationHint: 'Should contain 2-4 words, no email addresses or phone numbers',
    example: 'John Smith, Jane Doe, Dr. Robert Johnson',
    required: true,
    extractFrom: ['textContent'],
    patterns: [
      /^[A-Z][a-z]+\s+[A-Z][a-z]+$/,  // Simple: John Smith
      /^[A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+$/,  // Middle initial: John A. Smith
      /^(Dr|Mr|Mrs|Ms|Prof)\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+$/  // With title
    ],
    blacklist: ['email', 'phone', 'tel', 'fax', 'address', 'location', 'contact', 'view', 'more', 'profile']
  },

  email: {
    id: 'email',
    label: 'Email',
    prompt: 'Click on the EMAIL address or "Email" link',
    validationHint: 'Can be a mailto: link, visible email address, or link labeled "Email"',
    example: 'john.smith@example.com or "Email" link',
    required: true,
    extractFrom: ['href', 'textContent'],
    patterns: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    ],
    transforms: ['extractFromMailto', 'toLowerCase', 'trim']
  },

  phone: {
    id: 'phone',
    label: 'Phone',
    prompt: 'Click on the PHONE NUMBER (or skip if not visible)',
    validationHint: 'Can be a tel: link or visible phone number',
    example: '+1 (212) 555-1234 or "(212) 555-1234"',
    required: false,
    extractFrom: ['href', 'textContent'],
    patterns: [
      /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/,
      /^[0-9]{3}[-.\s][0-9]{3}[-.\s][0-9]{4}$/,
      /^\([0-9]{3}\)\s?[0-9]{3}[-.\s][0-9]{4}$/
    ],
    transforms: ['extractFromTel', 'normalizePhone']
  },

  profileUrl: {
    id: 'profileUrl',
    label: 'Profile Link',
    prompt: 'Click on the link to the person\'s PROFILE PAGE',
    validationHint: 'Should be a link to individual profile, not social media or "Email"',
    example: '/lawyers/john-smith or /people/jane-doe',
    required: true,
    extractFrom: ['href'],
    urlPatterns: [
      /\/(profile|people|attorney|lawyer|staff|team|member|bio|about)\//i,
      /\/[a-z]+-[a-z]+$/i  // slug pattern like /john-smith
    ],
    excludePatterns: [
      /mailto:/i,
      /tel:/i,
      /linkedin\.com/i,
      /twitter\.com/i,
      /facebook\.com/i,
      /javascript:/i,
      /#$/
    ]
  },

  title: {
    id: 'title',
    label: 'Title/Position',
    prompt: 'Click on the job TITLE or POSITION (or skip if not visible)',
    validationHint: 'Should be a professional title like "Partner" or "Associate"',
    example: 'Partner, Senior Associate, Managing Director',
    required: false,
    extractFrom: ['textContent'],
    keywords: [
      'Partner', 'Associate', 'Counsel', 'Of Counsel',
      'Director', 'Manager', 'Lead', 'Head', 'Chief',
      'Attorney', 'Lawyer', 'Advisor', 'Consultant',
      'CEO', 'CTO', 'CFO', 'COO', 'President', 'VP',
      'Senior', 'Junior', 'Principal', 'Executive'
    ]
  },

  location: {
    id: 'location',
    label: 'Location/Office',
    prompt: 'Click on the LOCATION or OFFICE (or skip if not visible)',
    validationHint: 'Should be a city, office name, or address',
    example: 'New York, London Office, 125 Broad Street',
    required: false,
    extractFrom: ['textContent'],
    patterns: [
      /^[A-Z][a-z]+,?\s+[A-Z]{2}$/,  // City, ST
      /^[A-Z][a-z]+\s+Office$/,  // City Office
      /^[0-9]+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd)/  // Address
    ]
  }
};

/**
 * Validation rules for field values
 */
const VALIDATION_RULES = {
  email: {
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    minLength: 5,
    maxLength: 100,
    message: 'Must be a valid email address'
  },

  phone: {
    pattern: /^[\d\s\-().+]{7,20}$/,
    minLength: 7,
    maxLength: 20,
    message: 'Must be a valid phone number'
  },

  name: {
    pattern: /^[A-Za-z\s.\-']+$/,
    minLength: 2,
    maxLength: 100,
    minWords: 1,
    maxWords: 6,
    message: 'Must be a valid name (2-6 words, letters only)'
  },

  title: {
    minLength: 2,
    maxLength: 150,
    message: 'Must be a valid job title'
  },

  location: {
    minLength: 2,
    maxLength: 200,
    message: 'Must be a valid location'
  },

  profileUrl: {
    pattern: /^(https?:\/\/|\/)/,
    message: 'Must be a valid URL or path'
  }
};

/**
 * Profile link classification types
 */
const PROFILE_LINK_TYPES = {
  PROFILE: 'profile',      // Main profile page link
  LINKEDIN: 'linkedin',    // LinkedIn profile
  TWITTER: 'twitter',      // Twitter/X profile
  SOCIAL: 'social',        // Other social media
  ACTION: 'action',        // Email, phone, download vCard
  SUBSECTION: 'subsection', // Bio section, publications, etc.
  UNKNOWN: 'unknown'       // Cannot classify
};

/**
 * Name matching strength levels for profile URL validation
 */
const NAME_MATCH_STRENGTH = {
  EXACT: 'exact',     // Full name exact match (john-smith)
  STRONG: 'strong',   // Full name in URL slug (john-smith)
  PARTIAL: 'partial', // Partial name match (smith only)
  MEDIUM: 'medium',   // Initial + last name (jsmith)
  WEAK: 'weak',       // Last name only (smith)
  NONE: 'none'        // No name match
};

/**
 * Selector generation strategies
 */
const SELECTOR_STRATEGIES = [
  'id',           // #unique-id
  'class',        // .specific-class
  'attribute',    // [data-field="name"]
  'wildcard',     // [class*="name"]
  'structural',   // div > span.name
  'semantic',     // h3, strong, a[href]
  'nth-child',    // :nth-child(2)
  'xpath'         // XPath fallback
];

/**
 * Default confidence scores for extraction methods
 */
const CONFIDENCE_SCORES = {
  // User-selected methods (highest priority)
  userSelected: 1.0,
  coordinateFallback: 0.85,

  // Link-based methods
  mailtoLink: 0.95,
  telLink: 0.95,
  urlPattern: 0.8,

  // Auto-detected methods
  selector: 0.8,
  textPattern: 0.7,
  proximity: 0.6,

  // Fallback methods
  firstText: 0.5,
  firstLink: 0.5
};

/**
 * Spatial zones within a card (for coordinate fallback)
 */
const SPATIAL_ZONES = {
  TOP: { start: 0, end: 0.33, typical: ['name', 'title'] },
  MIDDLE: { start: 0.33, end: 0.66, typical: ['email', 'phone', 'location'] },
  BOTTOM: { start: 0.66, end: 1.0, typical: ['profileUrl', 'socialLinks'] }
};

module.exports = {
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  FIELD_ORDER,
  FIELD_METADATA,
  VALIDATION_RULES,
  PROFILE_LINK_TYPES,
  NAME_MATCH_STRENGTH,
  SELECTOR_STRATEGIES,
  CONFIDENCE_SCORES,
  SPATIAL_ZONES
};
