# Documentation Maintenance

Guidelines for keeping documentation up to date.

---

## Document Types

### Auto-Generated (regenerate as needed)
| Location | Purpose | Command |
|----------|---------|---------|
| `docs/reports/*.md` | Exploration reports | `npm run report:*` |

These are gitignored and regenerated on demand.

### Manual Update Required
| Document | Update When |
|----------|-------------|
| `PROJECT_STRUCTURE.md` | New directories or major files added |
| `SYSTEM_ARCHITECTURE.md` | Component design changes |
| `KEY_FILES.md` | New key files or major function changes |
| `SUBSYSTEMS.md` | Subsystem changes or new subsystems |
| `CONVENTIONS.md` | New patterns adopted |
| Config guides | Config format changes |

---

## When to Update

### After Adding Files
1. Update `PROJECT_STRUCTURE.md` if new directory
2. Update `KEY_FILES.md` if file is important
3. Update `SUBSYSTEMS.md` if part of a subsystem

### After Changing Architecture
1. Update `SYSTEM_ARCHITECTURE.md` for data flow changes
2. Update `SUBSYSTEMS.md` for component changes
3. Generate fresh reports for affected areas

### After Changing Conventions
1. Update `CONVENTIONS.md` with new patterns
2. Add examples from actual code

### After Config Version Changes
1. Create new guide in `docs/guides/`
2. Update `DOCUMENTATION_INDEX.md`
3. Mark old guides as legacy

---

## Quick Reference

### Generate Fresh Reports
```bash
# Before major work
npm run report:subsystem <name>

# After changes, verify
npm run report:file <changed-file>
```

### Check Documentation Currency
1. Compare `KEY_FILES.md` against actual files
2. Verify architecture diagrams match code
3. Test example commands still work

---

## File Locations

```
docs/
├── architecture/    # Manual: system design
├── guides/          # Manual: how-to guides
├── workflows/       # Manual: dev processes
├── reports/         # Auto: exploration reports
└── archive/         # Historical (rarely updated)
```

---

## Best Practices

1. **Update incrementally** - Small updates after each change
2. **Test commands** - Verify example commands work
3. **Keep reports fresh** - Regenerate before major work
4. **Archive, don't delete** - Move old docs to archive
5. **Cross-reference** - Link related documents
