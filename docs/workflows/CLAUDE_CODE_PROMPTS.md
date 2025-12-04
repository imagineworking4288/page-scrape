# Claude Code Prompt Templates

Ready-to-use prompts for common tasks.

---

## Exploration Prompts

### Generate Subsystem Report
```
Generate a subsystem report for [pagination/extraction/configgen/scrapers/browser/config].
Save to docs/reports/.
```

### Analyze Specific File
```
Analyze the file src/[path/to/file.js].
Show: dependencies, exports, key functions, and first 100 lines.
```

### Search for Pattern
```
Search the codebase for "[pattern]".
Show all files and line numbers where it appears.
```

### Map Dependencies
```
Create a dependency map for src/[directory/].
Show what each file imports and exports.
```

---

## Implementation Prompts

### Execute Plan from Human Claude
```
Implement the following changes from Human Claude:

[paste the plan here]

After each change:
1. Verify the edit was correct
2. Run npm test
3. Report status
```

### Fix Specific Issue
```
In [file path], [description of issue].

The fix should:
- [requirement 1]
- [requirement 2]

Run tests after fixing.
```

### Add Feature
```
Add [feature description] to [module/file].

Requirements:
- [requirement 1]
- [requirement 2]

Follow existing code patterns.
Run tests when complete.
```

---

## Verification Prompts

### Run Tests
```
Run npm test and report the results.
If any tests fail, show the failure details.
```

### Verify Imports
```
Check that all imports in src/[path] are valid.
Report any missing modules or circular dependencies.
```

### Check for Regressions
```
After the recent changes to [area], verify:
1. All imports still work
2. Tests pass
3. No console errors on startup
```

---

## Documentation Prompts

### Update Docs After Changes
```
I've made changes to [area]. Update the relevant documentation:
- docs/architecture/KEY_FILES.md if new files added
- docs/architecture/CONVENTIONS.md if new patterns
```

### Generate Fresh Report
```
The code has changed since the last report.
Generate a fresh [subsystem/file] report for [name/path].
```

---

## Example Conversations

### Bug Fix Workflow
```
You: Generate a file analysis for src/utils/contact-extractor.js

Claude Code: *generates report*

You: Human Claude says the issue is in extractEmails function.
The mailto: prefix isn't being stripped. Here's their fix:
[paste fix]

Claude Code: *implements fix, runs tests*
```

### Feature Addition Workflow
```
You: Generate subsystem report for extraction

Claude Code: *generates report*

You: Human Claude designed this enhancement:
[paste design]

Implement steps 1-3, then report back.

Claude Code: *implements, tests, reports*
```

---

## Tips

### Be Specific
- Include file paths
- Reference function names
- Specify expected behavior

### Request Verification
- Always ask to run tests
- Request status reports
- Ask for confirmation of changes

### Iterative Approach
- Small changes at a time
- Verify each step
- Build on success
