/**
 * Unit Tests for Config Schemas
 */

const {
  FIELD_SCHEMA_V23,
  CONFIG_SCHEMA_V23,
  EXTRACTION_METHODS,
  FIELD_METADATA,
  FIELD_ORDER,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  createFieldSchema,
  createConfigV23,
  validateConfigV23,
  isV23Config
} = require('../../src/tools/lib/config-schemas');

describe('Config Schemas', () => {
  describe('Constants', () => {
    it('should have correct FIELD_ORDER', () => {
      expect(FIELD_ORDER).toEqual(['name', 'email', 'phone', 'profileUrl', 'title', 'location']);
    });

    it('should have correct REQUIRED_FIELDS', () => {
      expect(REQUIRED_FIELDS).toEqual(['name', 'email', 'profileUrl']);
    });

    it('should have correct OPTIONAL_FIELDS', () => {
      expect(OPTIONAL_FIELDS).toEqual(['phone', 'title', 'location']);
    });

    it('should have FIELD_ORDER include all required and optional fields', () => {
      const allFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
      expect(FIELD_ORDER.sort()).toEqual(allFields.sort());
    });
  });

  describe('EXTRACTION_METHODS', () => {
    it('should define methods for all field types', () => {
      const allFields = new Set(FIELD_ORDER);
      const coveredFields = new Set();

      Object.values(EXTRACTION_METHODS).forEach(method => {
        method.fields.forEach(field => coveredFields.add(field));
      });

      allFields.forEach(field => {
        expect(coveredFields.has(field)).toBe(true);
      });
    });

    it('should have mailto-link for email', () => {
      expect(EXTRACTION_METHODS['mailto-link'].fields).toContain('email');
    });

    it('should have tel-link for phone', () => {
      expect(EXTRACTION_METHODS['tel-link'].fields).toContain('phone');
    });

    it('should have href-link for profileUrl', () => {
      expect(EXTRACTION_METHODS['href-link'].fields).toContain('profileUrl');
    });

    it('should have screenshot-ocr for most fields', () => {
      const ocrFields = EXTRACTION_METHODS['screenshot-ocr'].fields;
      expect(ocrFields).toContain('name');
      expect(ocrFields).toContain('email');
      expect(ocrFields).toContain('phone');
      expect(ocrFields).toContain('title');
      expect(ocrFields).toContain('location');
    });
  });

  describe('FIELD_METADATA', () => {
    it('should have metadata for all fields', () => {
      FIELD_ORDER.forEach(field => {
        expect(FIELD_METADATA[field]).toBeDefined();
        expect(FIELD_METADATA[field].id).toBe(field);
        expect(FIELD_METADATA[field].label).toBeDefined();
        expect(FIELD_METADATA[field].prompt).toBeDefined();
      });
    });

    it('should mark required fields correctly', () => {
      REQUIRED_FIELDS.forEach(field => {
        expect(FIELD_METADATA[field].required).toBe(true);
      });

      OPTIONAL_FIELDS.forEach(field => {
        expect(FIELD_METADATA[field].required).toBe(false);
      });
    });
  });

  describe('createFieldSchema', () => {
    it('should create field with defaults', () => {
      const field = createFieldSchema();

      expect(field.required).toBe(false);
      expect(field.skipped).toBe(false);
      expect(field.userValidatedMethod).toBeNull();
      expect(field.coordinates).toEqual({ x: 0, y: 0, width: 0, height: 0 });
      expect(field.selector).toBeNull();
      expect(field.sampleValue).toBeNull();
      expect(field.confidence).toBe(0);
      expect(field.extractionOptions).toEqual([]);
      expect(field.failedMethods).toEqual([]);
    });

    it('should apply overrides', () => {
      const field = createFieldSchema({
        required: true,
        userValidatedMethod: 'mailto-link',
        coordinates: { x: 10, y: 20, width: 100, height: 50 },
        confidence: 95
      });

      expect(field.required).toBe(true);
      expect(field.userValidatedMethod).toBe('mailto-link');
      expect(field.coordinates).toEqual({ x: 10, y: 20, width: 100, height: 50 });
      expect(field.confidence).toBe(95);
    });
  });

  describe('createConfigV23', () => {
    it('should create config with defaults', () => {
      const config = createConfigV23();

      expect(config.version).toBe('2.3');
      expect(config.selectionMethod).toBe('manual-validated');
      expect(config.generatedAt).toBeDefined();
      expect(config.fields.name).toBeDefined();
      expect(config.fields.email).toBeDefined();
      expect(config.fields.phone).toBeDefined();
      expect(config.fields.profileUrl).toBeDefined();
    });

    it('should apply options', () => {
      const config = createConfigV23({
        domain: 'example.com',
        testSite: 'https://example.com/team',
        cardSelector: '.card'
      });

      expect(config.domain).toBe('example.com');
      expect(config.testSite).toBe('https://example.com/team');
      expect(config.cardPattern.primarySelector).toBe('.card');
    });

    it('should mark required fields correctly', () => {
      const config = createConfigV23();

      expect(config.fields.name.required).toBe(true);
      expect(config.fields.email.required).toBe(true);
      expect(config.fields.profileUrl.required).toBe(true);
      expect(config.fields.phone.required).toBe(false);
      expect(config.fields.title.required).toBe(false);
      expect(config.fields.location.required).toBe(false);
    });
  });

  describe('validateConfigV23', () => {
    it('should validate a complete config', () => {
      const config = global.testUtils.createSampleConfig();
      const result = validateConfigV23(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing domain', () => {
      const config = global.testUtils.createSampleConfig();
      delete config.domain;

      const result = validateConfigV23(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing domain');
    });

    it('should detect missing card selector', () => {
      const config = global.testUtils.createSampleConfig();
      config.cardPattern.primarySelector = null;

      const result = validateConfigV23(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing card selector');
    });

    it('should warn about required fields without validated method', () => {
      const config = global.testUtils.createSampleConfig();
      config.fields.name.userValidatedMethod = null;
      config.fields.name.skipped = false;

      const result = validateConfigV23(config);

      expect(result.warnings.some(w => w.includes('name'))).toBe(true);
    });

    it('should detect invalid version', () => {
      const config = global.testUtils.createSampleConfig();
      config.version = '2.0';

      const result = validateConfigV23(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version'))).toBe(true);
    });
  });

  describe('isV23Config', () => {
    it('should identify v2.3 config by version', () => {
      expect(isV23Config({ version: '2.3' })).toBe(true);
      expect(isV23Config({ version: '2.0' })).toBe(false);
    });

    it('should identify v2.3 config by selectionMethod', () => {
      expect(isV23Config({ selectionMethod: 'manual-validated' })).toBe(true);
      expect(isV23Config({ selectionMethod: 'auto' })).toBe(false);
    });

    it('should return false for invalid input', () => {
      expect(isV23Config(null)).toBe(false);
      expect(isV23Config(undefined)).toBe(false);
      expect(isV23Config({})).toBe(false);
    });
  });
});
