/**
 * Config Schema Definitions for v2.3
 *
 * Stores user-validated extraction methods with coordinates.
 * This schema supports the foolproof universal scraper approach where:
 * 1. Users manually select fields within contact cards
 * 2. System tests multiple extraction methods per field
 * 3. User validates the best method
 * 4. Config stores validated methods with coordinates for runtime extraction
 */

// Field schema for v2.3 - stores validated extraction data
const FIELD_SCHEMA_V23 = {
  required: false,           // Is this field required for a valid contact?
  skipped: false,            // User explicitly skipped this field
  userValidatedMethod: null, // Method name chosen by user: 'screenshot-ocr', 'coordinate-text', 'selector', etc.
  coordinates: {
    x: 0,                    // X offset from card top-left
    y: 0,                    // Y offset from card top-left
    width: 0,                // Field width
    height: 0                // Field height
  },
  selector: null,            // CSS selector backup reference
  sampleValue: null,         // Sample value extracted during config generation
  confidence: 0,             // Confidence score 0-100
  extractionOptions: [],     // All tested methods with results
  failedMethods: []          // Methods that failed, for debugging
};

// Extraction method result schema
const EXTRACTION_METHOD_RESULT = {
  method: '',                // Method identifier: 'screenshot-ocr', 'coordinate-text', 'selector', 'data-attribute', 'text-regex', 'proximity'
  methodLabel: '',           // Human-readable label for UI display
  value: null,               // Extracted value
  confidence: 0,             // Confidence score 0-100
  metadata: {}               // Method-specific metadata (OCR engine, selector used, etc.)
};

// Failed method schema
const FAILED_METHOD_RESULT = {
  method: '',                // Method identifier
  reason: ''                 // Failure reason
};

// Complete config schema for v2.3
const CONFIG_SCHEMA_V23 = {
  version: '2.3',
  selectionMethod: 'manual-validated',
  generatedAt: null,         // ISO timestamp
  testSite: null,            // URL used for config generation
  domain: null,              // Extracted domain

  cardPattern: {
    primarySelector: null,   // CSS selector for card container
    sampleDimensions: {
      width: 0,
      height: 0
    },
    sampleCoordinates: {
      x: 0,
      y: 0
    }
  },

  fields: {
    name: { ...FIELD_SCHEMA_V23 },
    email: { ...FIELD_SCHEMA_V23 },
    phone: { ...FIELD_SCHEMA_V23 },
    title: { ...FIELD_SCHEMA_V23 },
    location: { ...FIELD_SCHEMA_V23 },
    profileUrl: { ...FIELD_SCHEMA_V23 }
  }
};

// Field metadata for UI display and validation
const FIELD_METADATA = {
  name: {
    id: 'name',
    label: 'Name',
    required: true,
    prompt: "Draw a rectangle around the person's NAME",
    validationHint: 'Should contain 2-4 words, no email addresses or phone numbers',
    example: 'John Smith, Jane Doe, Dr. Robert Johnson'
  },
  email: {
    id: 'email',
    label: 'Email',
    required: true,
    prompt: "Draw a rectangle around the person's EMAIL address",
    validationHint: 'Must be a valid email format',
    example: 'john.smith@example.com, contact@company.org'
  },
  phone: {
    id: 'phone',
    label: 'Phone',
    required: false,
    prompt: "Draw a rectangle around the person's PHONE number",
    validationHint: 'Should be a valid phone number format',
    example: '(555) 123-4567, +1 555 123 4567'
  },
  title: {
    id: 'title',
    label: 'Title',
    required: false,
    prompt: "Draw a rectangle around the person's JOB TITLE",
    validationHint: 'Should be a professional title or role',
    example: 'Partner, Senior Associate, Managing Director'
  },
  location: {
    id: 'location',
    label: 'Location',
    required: false,
    prompt: "Draw a rectangle around the person's LOCATION or office",
    validationHint: 'Should be a city, state, or office location',
    example: 'New York, NY, San Francisco Office'
  },
  profileUrl: {
    id: 'profileUrl',
    label: 'Profile URL',
    required: true,
    prompt: "Draw a rectangle around a LINK to the person's profile page",
    validationHint: 'Should be a link to their detailed profile page',
    example: '/lawyers/john-smith, /team/jane-doe'
  }
};

// Extraction method definitions
const EXTRACTION_METHODS = {
  // Universal methods (work for most fields)
  'screenshot-ocr': {
    id: 'screenshot-ocr',
    label: 'Screenshot OCR',
    description: 'Takes a screenshot of the region and uses OCR to extract text',
    priority: 3,
    fields: ['name', 'email', 'phone', 'title', 'location']
  },
  'coordinate-text': {
    id: 'coordinate-text',
    label: 'Coordinate Text Extraction',
    description: 'Extracts text from DOM elements at the specified coordinates',
    priority: 2,
    fields: ['name', 'email', 'phone', 'title', 'location']
  },
  'selector': {
    id: 'selector',
    label: 'CSS Selector',
    description: 'Uses CSS selector to find and extract element content',
    priority: 4,
    fields: ['name', 'email', 'phone', 'title', 'location', 'profileUrl']
  },
  'data-attribute': {
    id: 'data-attribute',
    label: 'Data Attribute',
    description: 'Extracts value from data-* attributes',
    priority: 5,
    fields: ['name', 'email', 'phone', 'profileUrl']
  },
  'text-regex': {
    id: 'text-regex',
    label: 'Text Pattern Matching',
    description: 'Uses regex patterns to extract structured data from text',
    priority: 3,
    fields: ['email', 'phone']
  },

  // Email-specific methods
  'mailto-link': {
    id: 'mailto-link',
    label: 'Mailto Link',
    description: 'Extracts email from mailto: href attribute (most reliable)',
    priority: 1,
    fields: ['email']
  },
  'regex-email': {
    id: 'regex-email',
    label: 'Email RegEx Pattern',
    description: 'Finds email patterns in surrounding text using regex',
    priority: 2,
    fields: ['email']
  },
  'label-email': {
    id: 'label-email',
    label: 'Email Label Detection',
    description: 'Finds "Email:" label and extracts adjacent value',
    priority: 4,
    fields: ['email']
  },

  // Phone-specific methods
  'tel-link': {
    id: 'tel-link',
    label: 'Tel Link',
    description: 'Extracts phone from tel: href attribute (most reliable)',
    priority: 1,
    fields: ['phone']
  },
  'regex-phone': {
    id: 'regex-phone',
    label: 'Phone RegEx Pattern',
    description: 'Finds phone patterns in surrounding text using regex',
    priority: 2,
    fields: ['phone']
  },
  'label-phone': {
    id: 'label-phone',
    label: 'Phone Label Detection',
    description: 'Finds "Phone:" label and extracts adjacent value',
    priority: 4,
    fields: ['phone']
  },

  // Profile URL methods
  'href-link': {
    id: 'href-link',
    label: 'Href Link Extraction',
    description: 'Extracts URL from href attribute of links in region',
    priority: 1,
    fields: ['profileUrl']
  },
  'data-url': {
    id: 'data-url',
    label: 'Data URL Attribute',
    description: 'Extracts URL from data-url or similar attributes',
    priority: 2,
    fields: ['profileUrl']
  },

  // Title-specific methods
  'label-title': {
    id: 'label-title',
    label: 'Title Label Detection',
    description: 'Finds "Title:" or "Position:" label and extracts adjacent value',
    priority: 3,
    fields: ['title']
  },

  // Location-specific methods
  'label-location': {
    id: 'label-location',
    label: 'Location Label Detection',
    description: 'Finds "Location:" or "Office:" label and extracts adjacent value',
    priority: 3,
    fields: ['location']
  }
};

// Ordered list of fields for processing
const FIELD_ORDER = ['name', 'email', 'phone', 'profileUrl', 'title', 'location'];
const REQUIRED_FIELDS = ['name', 'email', 'profileUrl'];
const OPTIONAL_FIELDS = ['phone', 'title', 'location'];

/**
 * Create a new v2.3 field schema with defaults
 * @param {Object} overrides - Values to override defaults
 * @returns {Object} - Field schema
 */
function createFieldSchema(overrides = {}) {
  return {
    required: overrides.required ?? false,
    skipped: overrides.skipped ?? false,
    userValidatedMethod: overrides.userValidatedMethod ?? null,
    coordinates: {
      x: overrides.coordinates?.x ?? 0,
      y: overrides.coordinates?.y ?? 0,
      width: overrides.coordinates?.width ?? 0,
      height: overrides.coordinates?.height ?? 0
    },
    selector: overrides.selector ?? null,
    sampleValue: overrides.sampleValue ?? null,
    confidence: overrides.confidence ?? 0,
    extractionOptions: overrides.extractionOptions ?? [],
    failedMethods: overrides.failedMethods ?? []
  };
}

/**
 * Create a new v2.3 config with defaults
 * @param {Object} options - Config options
 * @returns {Object} - v2.3 config
 */
function createConfigV23(options = {}) {
  return {
    version: '2.3',
    selectionMethod: 'manual-validated',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    testSite: options.testSite ?? null,
    domain: options.domain ?? null,
    name: options.name ?? null,

    cardPattern: {
      primarySelector: options.cardSelector ?? null,
      sampleDimensions: options.sampleDimensions ?? { width: 0, height: 0 },
      sampleCoordinates: options.sampleCoordinates ?? { x: 0, y: 0 }
    },

    fields: {
      name: createFieldSchema({ required: true }),
      email: createFieldSchema({ required: true }),
      phone: createFieldSchema({ required: false }),
      title: createFieldSchema({ required: false }),
      location: createFieldSchema({ required: false }),
      profileUrl: createFieldSchema({ required: true })
    }
  };
}

/**
 * Validate a v2.3 config
 * @param {Object} config - Config to validate
 * @returns {Object} - { valid: boolean, errors: [], warnings: [], score: number }
 */
function validateConfigV23(config) {
  const errors = [];
  const warnings = [];
  let score = 100;

  // Check version
  if (config.version !== '2.3') {
    errors.push(`Invalid version: expected '2.3', got '${config.version}'`);
    score -= 20;
  }

  // Check required fields
  if (!config.domain) {
    errors.push('Missing domain');
    score -= 10;
  }

  if (!config.cardPattern?.primarySelector) {
    errors.push('Missing card selector');
    score -= 15;
  }

  // Check required field data
  for (const fieldName of REQUIRED_FIELDS) {
    const field = config.fields?.[fieldName];
    if (!field) {
      errors.push(`Missing required field: ${fieldName}`);
      score -= 15;
    } else if (!field.skipped && !field.userValidatedMethod) {
      warnings.push(`Required field '${fieldName}' has no validated method`);
      score -= 10;
    }
  }

  // Check optional fields
  for (const fieldName of OPTIONAL_FIELDS) {
    const field = config.fields?.[fieldName];
    if (field && !field.skipped && !field.userValidatedMethod) {
      warnings.push(`Optional field '${fieldName}' selected but no method validated`);
      score -= 5;
    }
  }

  // Check coordinates validity
  for (const fieldName of FIELD_ORDER) {
    const field = config.fields?.[fieldName];
    if (field && !field.skipped && field.userValidatedMethod) {
      const coords = field.coordinates;
      if (!coords || (coords.width === 0 && coords.height === 0)) {
        warnings.push(`Field '${fieldName}' has invalid coordinates`);
        score -= 5;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    score: Math.max(0, score)
  };
}

/**
 * Check if a config is v2.3
 * @param {Object} config - Config to check
 * @returns {boolean}
 */
function isV23Config(config) {
  return config?.version === '2.3' || config?.selectionMethod === 'manual-validated';
}

module.exports = {
  // Schemas
  FIELD_SCHEMA_V23,
  CONFIG_SCHEMA_V23,
  EXTRACTION_METHOD_RESULT,
  FAILED_METHOD_RESULT,

  // Metadata
  FIELD_METADATA,
  EXTRACTION_METHODS,

  // Constants
  FIELD_ORDER,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,

  // Factory functions
  createFieldSchema,
  createConfigV23,

  // Validation
  validateConfigV23,
  isV23Config
};
