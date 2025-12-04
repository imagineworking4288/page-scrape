# Example: File Analysis Report

This is an example of what a file analysis report looks like.
Generated with: `npm run report:file src/utils/contact-extractor.js`

---

## What This Report Contains

1. **Overview** - Quick stats about the file
2. **Dependencies** - What this file imports
3. **Functions & Methods** - All functions with signatures
4. **Code Preview** - First 100 lines

---

## Sample Output

```markdown
# File Analysis: src/utils/contact-extractor.js

**Generated:** 2025-12-04T06:14:23.283Z

---

## Overview

- **Total Lines:** 981
- **Imports:** 3
- **Exports:** EMAIL_REGEX, extractEmails, extractPhones, ...
- **Functions/Methods:** 25

## Dependencies

Local:
- (none)

NPM:
- fs
- path

## Functions & Methods

### extractEmails
```javascript
function extractEmails(text)
```

### extractPhones
```javascript
function extractPhones(text)
```

### isValidNameCandidate
```javascript
function isValidNameCandidate(text)
```

## Code Preview (first 100 lines)

```javascript
/**
 * Shared contact extraction utilities
 * Contains all common patterns, regex, and extraction logic
 */

const fs = require('fs');
const path = require('path');

const NAME_BLACKLIST = new Set([
  'sign in', 'log in', ...
]);

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// ...
```
```

---

## How to Use This Report

1. Get full context on a specific file
2. Understand its API (exports, functions)
3. See what it depends on
4. Use for targeted modifications
