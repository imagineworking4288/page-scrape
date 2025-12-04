# Development Workflow

A two-phase process for effective development with Claude Code and Human Claude.

---

## Overview

This project uses a **two-phase development workflow**:

1. **Analysis Phase** (Claude Code → Human Claude)
   - Generate exploration reports
   - Understand current state
   - Plan implementation

2. **Implementation Phase** (Human Claude → Claude Code)
   - Receive implementation plan
   - Execute changes
   - Verify results

---

## Phase 1: Analysis

### When to Use
- Before making significant changes
- When debugging complex issues
- Planning new features
- Understanding unfamiliar code

### Process

1. **Generate Reports with Claude Code**
   ```bash
   # Explore a subsystem
   npm run report:subsystem pagination

   # Analyze specific file
   npm run report:file src/utils/contact-extractor.js

   # Search for pattern
   npm run report:pattern "async function"

   # Map dependencies
   npm run report:deps src/scrapers/
   ```

2. **Upload Reports to Human Claude**
   - Copy the generated report from `docs/reports/`
   - Include relevant architecture docs if needed
   - Describe your goal or question

3. **Get Analysis and Plan**
   - Human Claude analyzes the code
   - Identifies patterns, issues, opportunities
   - Creates implementation plan

---

## Phase 2: Implementation

### Process

1. **Receive Plan from Human Claude**
   - Clear step-by-step instructions
   - Specific files and functions to modify
   - Expected outcomes

2. **Execute with Claude Code**
   - Follow the plan exactly
   - Use Read tool to verify before Edit
   - Run tests after changes

3. **Verify and Report**
   - Run `npm test`
   - Check for regressions
   - Report completion status

---

## Example Workflows

### Fixing a Bug

**Phase 1 (Analysis):**
```
You: "Generate a report on the extraction system"

Claude Code: *generates report*

You: *upload report to Human Claude*
"Emails aren't being extracted from Sullivan Cromwell.
Here's the extraction subsystem report..."

Human Claude: "Looking at the code, the issue is in
multi-method-extractor.js line 142. The mailto: prefix
isn't being stripped. Here's the fix..."
```

**Phase 2 (Implementation):**
```
You: *paste plan to Claude Code*
"Implement this fix from Human Claude..."

Claude Code: *reads file, makes edit, runs tests*
"Fixed. Tests pass: 15/18"
```

### Adding a Feature

**Phase 1:**
1. Generate subsystem report for relevant area
2. Upload to Human Claude with feature request
3. Receive architecture recommendations

**Phase 2:**
1. Give implementation plan to Claude Code
2. Claude Code creates/modifies files
3. Run tests and verify

### Refactoring

**Phase 1:**
1. Generate file analysis for target files
2. Generate dependency map
3. Human Claude plans refactoring approach

**Phase 2:**
1. Claude Code executes refactoring steps
2. Updates imports across codebase
3. Verifies no breaking changes

---

## Best Practices

### For Analysis Phase
- Include relevant context with reports
- Be specific about your goal
- Ask about trade-offs and alternatives

### For Implementation Phase
- Follow plans exactly as given
- Run tests after each change
- Report unexpected issues immediately

### Communication
- Claude Code: Executes, verifies, reports
- Human Claude: Analyzes, plans, designs
- You: Bridges between them

---

## Quick Reference

| Task | Report Type | Command |
|------|-------------|---------|
| Understand subsystem | subsystem | `npm run report:subsystem <name>` |
| Debug specific file | file-analysis | `npm run report:file <path>` |
| Find usage patterns | pattern-search | `npm run report:pattern "<text>"` |
| Track dependencies | dependency-map | `npm run report:deps <path>` |

### Available Subsystems
- `pagination` - Pagination handling
- `extraction` - Contact extraction
- `configgen` - Config generator
- `scrapers` - Scraper implementations
- `browser` - Browser management
- `config` - Configuration system
