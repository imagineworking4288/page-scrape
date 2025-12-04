# Documentation Index

**Last Updated:** 2025-12-04

---

## Quick Links by Task

### Getting Started
- [Quick Start Guide](guides/QUICK_START.md)
- [Setup Instructions](guides/SETUP.md)

### Understanding the Codebase
- [Project Structure](architecture/PROJECT_STRUCTURE.md)
- [System Architecture](architecture/SYSTEM_ARCHITECTURE.md)
- [Key Files Reference](architecture/KEY_FILES.md)
- [Subsystems Overview](architecture/SUBSYSTEMS.md)

### Creating Site Configs
- [v2.2 Config Guide](guides/CONFIG_V22_GUIDE.md) (Current)
- [v2.1 Config Guide](guides/CONFIG_V21_GUIDE.md) (Legacy)

### Development
- [Development Workflow](workflows/DEVELOPMENT_WORKFLOW.md)
- [Report Usage Guide](workflows/REPORT_USAGE_GUIDE.md)
- [Claude Code Prompts](workflows/CLAUDE_CODE_PROMPTS.md)
- [Code Conventions](architecture/CONVENTIONS.md)

### Exploration Reports
- [Report Examples](reports/examples/)
- Generated reports in: `docs/reports/`

---

## Document Map

```
docs/
├── DOCUMENTATION_INDEX.md      ← You are here
├── README.md                   # Old docs readme (to be cleaned)
│
├── architecture/               # System design
│   ├── PROJECT_STRUCTURE.md    # Directory layout
│   ├── SYSTEM_ARCHITECTURE.md  # Component design
│   ├── KEY_FILES.md           # File reference
│   ├── SUBSYSTEMS.md          # Subsystem details
│   └── CONVENTIONS.md         # Code patterns
│
├── guides/                     # How-to guides
│   ├── QUICK_START.md         # Getting started
│   ├── SETUP.md               # Installation
│   ├── CONFIG_V22_GUIDE.md    # v2.2 configs
│   ├── CONFIG_V21_GUIDE.md    # v2.1 configs
│   └── IMPLEMENTATION_GUIDE.md # Dev guide
│
├── workflows/                  # Development processes
│   ├── DEVELOPMENT_WORKFLOW.md # Two-phase workflow
│   ├── REPORT_USAGE_GUIDE.md  # Report tools
│   └── CLAUDE_CODE_PROMPTS.md # Prompt templates
│
├── reports/                    # Generated reports (gitignored)
│   └── examples/              # Sample reports
│
└── archive/                    # Historical docs
    ├── DELIVERY.md
    ├── WEEK_1_SUMMARY.md
    └── WEEK2-COMPLETE.md
```

---

## NPM Scripts

```bash
# Scraping
npm start              # Run orchestrator

# Testing
npm test               # Main tests
npm run test:pdf       # PDF tests
npm run test:all       # All tests

# Report Generation
npm run report:subsystem <name>   # Subsystem report
npm run report:file <path>        # File analysis
npm run report:pattern <text>     # Pattern search
npm run report:deps <path>        # Dependency map
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v2.2 | 2025-12 | Manual field selection, documentation system |
| v2.1 | 2025-11 | Multi-method extraction, enhanced capture |
| v2.0 | 2025-11 | Rectangle selection, card matching |
| v1.0 | 2025-11 | Initial release, click-based (deprecated) |

---

## Contributing

1. Follow patterns in [CONVENTIONS.md](architecture/CONVENTIONS.md)
2. Use [Development Workflow](workflows/DEVELOPMENT_WORKFLOW.md)
3. Generate reports for exploration
4. Run tests before committing
