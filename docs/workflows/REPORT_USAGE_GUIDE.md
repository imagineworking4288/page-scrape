# Report Usage Guide

How to generate and use exploration reports effectively.

---

## Report Types

### 1. Subsystem Report
**Purpose:** Explore a complete subsystem (multiple related files)

**Command:**
```bash
npm run report:subsystem <name>
```

**Available Subsystems:**
- `pagination` - URL patterns, infinite scroll
- `extraction` - Email/phone/name extraction
- `configgen` - Visual config creation tool
- `scrapers` - All scraper implementations
- `browser` - Browser and rate limiting
- `config` - Config loading and building

**When to Use:**
- Starting work on a subsystem
- Understanding how components interact
- Planning major changes

**Example:**
```bash
npm run report:subsystem pagination
```

---

### 2. File Analysis Report
**Purpose:** Deep dive into a single file

**Command:**
```bash
npm run report:file <path>
```

**When to Use:**
- Debugging specific file
- Understanding a complex module
- Before modifying critical code

**Example:**
```bash
npm run report:file src/utils/contact-extractor.js
```

---

### 3. Pattern Search Report
**Purpose:** Find all occurrences of a pattern across codebase

**Command:**
```bash
npm run report:pattern "<pattern>"
```

**When to Use:**
- Finding all uses of a function
- Locating similar code patterns
- Tracking API usage

**Example:**
```bash
npm run report:pattern "async function"
npm run report:pattern "extractEmails"
npm run report:pattern "this.logger.error"
```

---

### 4. Dependency Map Report
**Purpose:** Show import/export relationships

**Command:**
```bash
npm run report:deps <path>
```

**When to Use:**
- Before refactoring
- Understanding module relationships
- Planning dependency changes

**Example:**
```bash
npm run report:deps src/scrapers/
npm run report:deps src/utils/browser-manager.js
```

---

## Uploading to Human Claude

### What to Include

1. **The Report** - Full content of generated .md file
2. **Your Goal** - What you're trying to achieve
3. **Context** - Any relevant background

### Template Prompt

```
I'm working on [project name] and need help with [goal].

Here's the exploration report:
[paste report]

Additional context:
- [relevant details]
- [current behavior]
- [expected behavior]

Please analyze and provide [recommendations/implementation plan/etc].
```

---

## Report Location

All reports are saved to:
```
docs/reports/[type]-[name]-[timestamp].md
```

Reports are gitignored and regenerated as needed.

---

## Tips

### Generating Reports
- Run from project root
- Reports saved automatically with timestamp
- Old reports can be deleted anytime

### Using Reports
- Copy full content for Human Claude
- Reference line numbers when discussing code
- Include multiple reports for complex tasks

### Report Freshness
- Generate new report before major work
- Code changes invalidate old reports
- Reports show generation timestamp
