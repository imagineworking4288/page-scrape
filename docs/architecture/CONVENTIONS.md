# Code Conventions

Observed patterns and conventions in the codebase.

---

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Modules | kebab-case | `contact-extractor.js` |
| Classes | PascalCase file | `BrowserManager` in `browser-manager.js` |
| Tests | suffix `-test.js` | `scraper-test.js` |
| Configs | domain or description | `compass.com.json` |

---

## Code Style

### Classes

```javascript
/**
 * JSDoc description
 */
class ClassName {
  constructor(dependency1, dependency2, options = {}) {
    this.dep1 = dependency1;
    this.dep2 = dependency2;
    this.options = options;
  }

  /**
   * Method description
   * @param {Type} param - Description
   * @returns {Type} Description
   */
  async methodName(param) {
    // Implementation
  }
}

module.exports = ClassName;
```

### Constants

```javascript
// UPPER_SNAKE_CASE for true constants
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Sets for lookups
const NAME_BLACKLIST = new Set([
  'sign in', 'log in', ...
]);
```

### Functions

```javascript
// camelCase for functions
function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}
```

---

## Module Patterns

### Export Pattern
```javascript
// Single class export
class MyClass { ... }
module.exports = MyClass;

// Multiple exports via index.js
module.exports = {
  ClassA,
  ClassB,
  functionC
};
```

### Dependency Injection
```javascript
class Scraper {
  constructor(browserManager, rateLimiter, logger, configLoader, options = {}) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.configLoader = configLoader;
    this.options = options;
  }
}
```

### Singleton Pattern (Logger)
```javascript
// logger.js exports configured instance
const logger = winston.createLogger({...});
module.exports = logger;

// Usage
const logger = require('./utils/logger');
logger.info('Message');
```

---

## Error Handling

### Try-Catch with Logging
```javascript
async function riskyOperation() {
  try {
    const result = await doSomething();
    return { success: true, data: result };
  } catch (error) {
    this.logger.error(`Operation failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}
```

### Validation Results
```javascript
// Return objects with status
return {
  valid: errors.length === 0,
  errors: errors,
  warnings: warnings,
  score: calculateScore()
};
```

### Graceful Fallbacks
```javascript
// Try primary, fall back to secondary
if (primaryMethod()) {
  return primaryResult;
} else if (fallbackMethod()) {
  return fallbackResult;
}
return defaultResult;
```

---

## Logging Conventions

### Standard Logging
```javascript
this.logger.info('Operation started');
this.logger.debug('Debug details: ' + JSON.stringify(data));
this.logger.warn('Potential issue: ' + warning);
this.logger.error('Error occurred: ' + error.message);
```

### Prefixed Logging (v2.2)
```javascript
// Use prefixes for tracing
this.logger.info('[v2.2-BACKEND] Processing selection');
this.logger.info('[v2.2-CONFIG] Building config...');
console.log('[v2.2-DEBUG] Frontend state:', state);
```

### Progress Logging
```javascript
this.logger.logProgress(current, total, 'contacts');
this.logger.logMemory();
this.logger.logStats({ contacts: 50, pages: 5 });
```

---

## Async Patterns

### Async/Await
```javascript
async function scrape(url) {
  await this.initialize();
  const page = await this.browserManager.getPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  const result = await this.extract();
  return result;
}
```

### Promise Resolution
```javascript
return new Promise(async (resolve, reject) => {
  try {
    // Store resolvers for later use
    this.resolveSession = resolve;
    this.rejectSession = reject;

    await this.doWork();
    // Resolved later via callback
  } catch (error) {
    reject(error);
  }
});
```

---

## Configuration Patterns

### Options with Defaults
```javascript
constructor(options = {}) {
  this.timeout = options.timeout || 30000;
  this.retries = options.retries || 3;
  this.version = options.configVersion || '2.2';
}
```

### Config Merging
```javascript
const config = {
  ...defaultConfig,
  ...siteConfig,
  ...overrides
};
```

---

## Browser Integration

### Puppeteer Page Operations
```javascript
// Navigation
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

// Wait for elements
await page.waitForSelector('#element', { timeout: 5000 });

// Evaluate in browser context
const data = await page.evaluate(() => {
  return document.querySelector('.card').textContent;
});

// Expose Node function to browser
await page.exposeFunction('__myFunction', async (data) => {
  return processData(data);
});
```

### Browser-to-Node Communication
```javascript
// Backend (Node.js)
await page.exposeFunction('__configGen_confirm', async (data) => {
  return this.handleConfirm(data);
});

// Frontend (browser)
if (typeof __configGen_confirm === 'function') {
  __configGen_confirm(selections).then(result => {
    handleResult(result);
  });
}
```

---

## Testing Patterns

### Test Structure
```javascript
// Simple assertion tests
function testEmailPattern() {
  const testCases = [
    { input: 'test@example.com', expected: true },
    { input: 'invalid', expected: false }
  ];

  for (const test of testCases) {
    const result = extractEmails(test.input);
    if ((result.length > 0) !== test.expected) {
      throw new Error(`Failed for: ${test.input}`);
    }
  }
}
```

### Test Output
```javascript
console.log('✓ Test passed');
console.log('✗ Test failed');
console.log(`Total: ${passed}/${total}`);
```

---

## Documentation Patterns

### JSDoc Comments
```javascript
/**
 * Extract contacts from page
 *
 * @param {Object} page - Puppeteer page instance
 * @param {Object} config - Site configuration
 * @param {Object} options - Extraction options
 * @returns {Promise<Array>} Array of contact objects
 */
async function extractContacts(page, config, options) {
  // ...
}
```

### File Headers
```javascript
/**
 * Module Name
 *
 * Brief description of what the module does.
 *
 * Features:
 * - Feature 1
 * - Feature 2
 *
 * @module module-name
 */
```
