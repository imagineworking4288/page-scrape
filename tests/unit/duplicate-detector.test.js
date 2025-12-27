/**
 * Unit Tests for Duplicate Detector
 */

const DuplicateDetector = require('../../src/utils/duplicate-detector');

describe('DuplicateDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new DuplicateDetector({
      logger: global.testUtils.createMockLogger()
    });
  });

  describe('normalize', () => {
    it('should lowercase and trim strings', () => {
      expect(detector.normalize('  John DOE  ')).toBe('john doe');
    });

    it('should remove special characters except @.-', () => {
      expect(detector.normalize('john.doe@example.com')).toBe('john.doe@example.com');
      expect(detector.normalize('(555) 123-4567')).toBe('555 123-4567');
    });

    it('should return null for empty values', () => {
      expect(detector.normalize('')).toBeNull();
      expect(detector.normalize(null)).toBeNull();
      expect(detector.normalize(undefined)).toBeNull();
    });
  });

  describe('check', () => {
    it('should identify first contact as unique', () => {
      const contact = {
        name: 'John Doe',
        email: 'john@example.com',
        profileUrl: '/team/john'
      };

      const result = detector.check(contact);

      expect(result.isDuplicate).toBe(false);
      expect(result.original).toBeNull();
    });

    it('should identify duplicate by email', () => {
      const contact1 = {
        name: 'John Doe',
        email: 'john@example.com',
        profileUrl: '/team/john'
      };
      const contact2 = {
        name: 'John Doe',
        email: 'JOHN@example.com', // Same email, different case
        profileUrl: '/team/john-2'
      };

      detector.check(contact1);
      const result = detector.check(contact2);

      expect(result.isDuplicate).toBe(true);
      expect(result.matchType).toBe('primary');
      expect(result.matchKey).toBe('email');
    });

    it('should identify duplicate by profileUrl', () => {
      const contact1 = {
        name: 'John Doe',
        email: 'john@example.com',
        profileUrl: '/team/john'
      };
      const contact2 = {
        name: 'John Smith', // Different name
        email: 'john.smith@example.com', // Different email
        profileUrl: '/team/john' // Same URL
      };

      detector.check(contact1);
      const result = detector.check(contact2);

      expect(result.isDuplicate).toBe(true);
      expect(result.matchType).toBe('primary');
      expect(result.matchKey).toBe('profileUrl');
    });

    it('should not match contacts with different primary keys', () => {
      const contact1 = {
        name: 'John Doe',
        email: 'john@example.com',
        profileUrl: '/team/john'
      };
      const contact2 = {
        name: 'John Doe', // Same name
        email: 'johndoe@other.com', // Different email
        profileUrl: '/team/johndoe' // Different URL
      };

      detector.check(contact1);
      const result = detector.check(contact2);

      // Not a duplicate because primary keys are different
      // and secondary match needs additional verification
      expect(result.isDuplicate).toBe(false);
    });

    it('should identify secondary match with multiple field matches', () => {
      const contact1 = {
        name: 'John Doe',
        email: null, // No email
        phone: '555-123-4567',
        profileUrl: null, // No URL
        title: 'Partner'
      };
      const contact2 = {
        name: 'John Doe', // Same name
        email: null,
        phone: '555-123-4567', // Same phone
        profileUrl: null,
        title: 'Partner' // Same title
      };

      detector.check(contact1);
      const result = detector.check(contact2);

      expect(result.isDuplicate).toBe(true);
      expect(result.matchType).toBe('secondary');
    });
  });

  describe('filterUnique', () => {
    it('should filter out duplicates from array', () => {
      const contacts = [
        { name: 'John', email: 'john@test.com' },
        { name: 'Jane', email: 'jane@test.com' },
        { name: 'John Duplicate', email: 'john@test.com' }, // Duplicate email
        { name: 'Bob', email: 'bob@test.com' }
      ];

      const unique = detector.filterUnique(contacts);

      expect(unique).toHaveLength(3);
      expect(unique.map(c => c.name)).toEqual(['John', 'Jane', 'Bob']);
    });
  });

  describe('getStats', () => {
    it('should track statistics correctly', () => {
      const contacts = [
        { name: 'John', email: 'john@test.com' },
        { name: 'Jane', email: 'jane@test.com' },
        { name: 'John2', email: 'john@test.com' },
        { name: 'Bob', email: 'bob@test.com' },
        { name: 'John3', email: 'JOHN@test.com' }
      ];

      contacts.forEach(c => detector.check(c));

      const stats = detector.getStats();

      expect(stats.total).toBe(5);
      expect(stats.unique).toBe(3);
      expect(stats.duplicates).toBe(2);
      expect(stats.byKey.email).toBe(2);
      expect(stats.duplicateRate).toBe('40.0%');
    });
  });

  describe('getDuplicates', () => {
    it('should return all detected duplicates with details when using filterUnique', () => {
      const contacts = [
        { name: 'John', email: 'john@test.com' },
        { name: 'John Dup', email: 'john@test.com' }
      ];

      detector.filterUnique(contacts);

      const duplicates = detector.getDuplicates();

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].duplicate.name).toBe('John Dup');
      expect(duplicates[0].original.name).toBe('John');
      expect(duplicates[0].matchKey).toBe('email');
    });

    it('should be empty when using check() directly (check doesnt store duplicates)', () => {
      const contact1 = { name: 'John', email: 'john@test.com' };
      const contact2 = { name: 'John Dup', email: 'john@test.com' };

      detector.check(contact1);
      const result = detector.check(contact2);

      // check() returns the duplicate info but doesn't store it in duplicates array
      expect(result.isDuplicate).toBe(true);
      expect(result.matchKey).toBe('email');

      // getDuplicates is only populated by filterUnique()
      expect(detector.getDuplicates()).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      detector.check({ name: 'John', email: 'john@test.com' });
      detector.check({ name: 'John2', email: 'john@test.com' });

      expect(detector.getStats().total).toBe(2);

      detector.reset();

      expect(detector.getStats().total).toBe(0);
      expect(detector.getDuplicates()).toHaveLength(0);

      // Same email should no longer be detected as duplicate
      const result = detector.check({ name: 'John', email: 'john@test.com' });
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(detector.calculateSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return 0 for empty strings', () => {
      expect(detector.calculateSimilarity('', 'hello')).toBe(0);
      expect(detector.calculateSimilarity('hello', '')).toBe(0);
    });

    it('should calculate similarity for similar strings', () => {
      const similarity = detector.calculateSimilarity('john doe', 'john d');
      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('fuzzyMatch', () => {
    it('should match similar strings above threshold', () => {
      detector.fuzzyThreshold = 0.8;

      expect(detector.fuzzyMatch('john doe', 'john doe')).toBe(true);
      expect(detector.fuzzyMatch('john doe', 'john d')).toBe(false);
    });
  });
});
