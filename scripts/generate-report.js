#!/usr/bin/env node

/**
 * Report Generation Utility
 *
 * Generates focused exploration reports for specific subsystems,
 * files, patterns, or dependency maps.
 *
 * Usage:
 *   node scripts/generate-report.js <type> [options]
 *
 * Types:
 *   subsystem <name>    - Explore specific subsystem
 *   file-analysis <path> - Analyze specific file(s)
 *   pattern-search <pattern> - Find pattern across codebase
 *   dependency-map <path>    - Show file dependencies
 *
 * Examples:
 *   node scripts/generate-report.js subsystem pagination
 *   node scripts/generate-report.js file-analysis src/utils/contact-extractor.js
 *   node scripts/generate-report.js pattern-search "async function"
 *   node scripts/generate-report.js dependency-map src/scrapers/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(PROJECT_ROOT, 'docs', 'reports');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// Subsystem definitions
const SUBSYSTEMS = {
  pagination: {
    name: 'Pagination System',
    paths: ['src/features/pagination/'],
    related: ['src/scrapers/config-scraper.js'],
    description: 'URL-based and infinite scroll pagination handling'
  },
  extraction: {
    name: 'Contact Extraction System',
    paths: ['src/utils/contact-extractor.js', 'src/tools/lib/multi-method-extractor.js'],
    related: ['src/tools/lib/element-capture.js', 'src/tools/lib/smart-field-extractor.js'],
    description: 'Email, phone, name extraction with multi-method fallbacks'
  },
  configgen: {
    name: 'Config Generator',
    paths: ['src/tools/'],
    related: ['configs/'],
    description: 'Visual config creation tool with overlay UI'
  },
  scrapers: {
    name: 'Scraper Implementations',
    paths: ['src/scrapers/'],
    related: ['orchestrator.js'],
    description: 'Different scraping methods: DOM, PDF, config-based'
  },
  browser: {
    name: 'Browser Management',
    paths: ['src/utils/browser-manager.js', 'src/utils/rate-limiter.js'],
    related: ['src/scrapers/base-scraper.js'],
    description: 'Puppeteer lifecycle, rate limiting, stealth'
  },
  config: {
    name: 'Configuration System',
    paths: ['src/utils/config-loader.js', 'configs/'],
    related: ['src/tools/lib/config-builder.js'],
    description: 'Site config loading, caching, and building'
  }
};

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Parse arguments
const args = process.argv.slice(2);
const reportType = args[0];
const reportArg = args[1];

if (!reportType) {
  console.log(`
Usage: node scripts/generate-report.js <type> [options]

Types:
  subsystem <name>       - Explore a subsystem (pagination, extraction, configgen, scrapers, browser, config)
  file-analysis <path>   - Detailed analysis of file(s)
  pattern-search <pattern> - Search for pattern in codebase
  dependency-map <path>  - Show imports/exports for path

Available Subsystems:
${Object.entries(SUBSYSTEMS).map(([key, val]) => `  ${key.padEnd(12)} - ${val.name}`).join('\n')}
`);
  process.exit(0);
}

// Generate timestamp for filename
function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// Read file contents
function readFile(filePath) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    return fs.readFileSync(fullPath, 'utf8');
  }
  return null;
}

// List files matching pattern
function listFiles(dir, extension = '.js') {
  const results = [];
  const fullDir = path.isAbsolute(dir) ? dir : path.join(PROJECT_ROOT, dir);

  if (!fs.existsSync(fullDir)) return results;

  const items = fs.readdirSync(fullDir);
  for (const item of items) {
    const itemPath = path.join(fullDir, item);
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      results.push(...listFiles(itemPath, extension));
    } else if (item.endsWith(extension)) {
      results.push(itemPath.replace(PROJECT_ROOT + path.sep, ''));
    }
  }
  return results;
}

// Extract imports from file
function extractImports(content) {
  const imports = [];
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

// Extract exports from file
function extractExports(content) {
  const exports = [];

  // module.exports = ClassName
  const classExport = content.match(/module\.exports\s*=\s*(\w+)/);
  if (classExport) exports.push(classExport[1]);

  // module.exports = { ... }
  const objectExport = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  if (objectExport) {
    const items = objectExport[1].split(',').map(s => s.trim().split(':')[0].trim());
    exports.push(...items.filter(i => i));
  }

  return exports;
}

// Extract function signatures
function extractFunctions(content) {
  const functions = [];

  // async function name() or function name()
  const funcRegex = /(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    functions.push({
      name: match[2],
      async: !!match[1],
      params: match[3]
    });
  }

  // Class methods: async methodName() or methodName()
  const methodRegex = /^\s*(async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/gm;
  while ((match = methodRegex.exec(content)) !== null) {
    if (!['if', 'for', 'while', 'switch', 'catch', 'function'].includes(match[2])) {
      functions.push({
        name: match[2],
        async: !!match[1],
        params: match[3],
        isMethod: true
      });
    }
  }

  return functions;
}

// Generate subsystem report
function generateSubsystemReport(subsystemKey) {
  const subsystem = SUBSYSTEMS[subsystemKey];
  if (!subsystem) {
    console.error(`Unknown subsystem: ${subsystemKey}`);
    console.log('Available:', Object.keys(SUBSYSTEMS).join(', '));
    process.exit(1);
  }

  let report = `# Subsystem Report: ${subsystem.name}\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Description:** ${subsystem.description}\n\n`;
  report += `---\n\n`;

  // List all files
  report += `## Files\n\n`;
  const allFiles = [];
  for (const p of subsystem.paths) {
    if (p.endsWith('/')) {
      allFiles.push(...listFiles(p));
    } else {
      allFiles.push(p);
    }
  }

  for (const file of allFiles) {
    const content = readFile(file);
    if (!content) continue;

    const lines = content.split('\n').length;
    const imports = extractImports(content);
    const exports = extractExports(content);
    const functions = extractFunctions(content);

    report += `### ${file}\n`;
    report += `- **Lines:** ${lines}\n`;
    report += `- **Exports:** ${exports.join(', ') || 'None'}\n`;
    report += `- **Imports:** ${imports.length} modules\n`;
    report += `- **Functions/Methods:** ${functions.length}\n\n`;

    // Key functions
    if (functions.length > 0) {
      report += `**Key Functions:**\n`;
      for (const fn of functions.slice(0, 10)) {
        const asyncLabel = fn.async ? 'async ' : '';
        report += `- \`${asyncLabel}${fn.name}(${fn.params})\`\n`;
      }
      if (functions.length > 10) {
        report += `- ... and ${functions.length - 10} more\n`;
      }
      report += `\n`;
    }
  }

  // Related files
  if (subsystem.related && subsystem.related.length > 0) {
    report += `## Related Files\n\n`;
    for (const rel of subsystem.related) {
      report += `- ${rel}\n`;
    }
    report += `\n`;
  }

  return report;
}

// Generate file analysis report
function generateFileAnalysis(filePath) {
  const content = readFile(filePath);
  if (!content) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const lines = content.split('\n');
  const imports = extractImports(content);
  const exports = extractExports(content);
  const functions = extractFunctions(content);

  let report = `# File Analysis: ${filePath}\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  report += `---\n\n`;

  // Overview
  report += `## Overview\n\n`;
  report += `- **Total Lines:** ${lines.length}\n`;
  report += `- **Imports:** ${imports.length}\n`;
  report += `- **Exports:** ${exports.join(', ') || 'None'}\n`;
  report += `- **Functions/Methods:** ${functions.length}\n\n`;

  // Dependencies
  report += `## Dependencies\n\n`;
  for (const imp of imports) {
    const isLocal = imp.startsWith('.') || imp.startsWith('/');
    report += `- \`${imp}\` ${isLocal ? '(local)' : '(npm)'}\n`;
  }
  report += `\n`;

  // Functions
  report += `## Functions & Methods\n\n`;
  for (const fn of functions) {
    const asyncLabel = fn.async ? 'async ' : '';
    report += `### ${fn.name}\n`;
    report += `\`\`\`javascript\n${asyncLabel}${fn.name}(${fn.params})\n\`\`\`\n\n`;
  }

  // First 100 lines of code
  report += `## Code Preview (first 100 lines)\n\n`;
  report += `\`\`\`javascript\n`;
  report += lines.slice(0, 100).join('\n');
  if (lines.length > 100) {
    report += `\n// ... ${lines.length - 100} more lines\n`;
  }
  report += `\n\`\`\`\n`;

  return report;
}

// Generate pattern search report
function generatePatternSearch(pattern) {
  let report = `# Pattern Search: "${pattern}"\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  report += `---\n\n`;

  const files = listFiles('src');
  let totalMatches = 0;

  for (const file of files) {
    const content = readFile(file);
    if (!content) continue;

    const lines = content.split('\n');
    const matches = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) {
        matches.push({ line: i + 1, content: lines[i].trim() });
      }
    }

    if (matches.length > 0) {
      report += `### ${file} (${matches.length} matches)\n\n`;
      for (const match of matches.slice(0, 5)) {
        report += `- Line ${match.line}: \`${match.content.substring(0, 80)}${match.content.length > 80 ? '...' : ''}\`\n`;
      }
      if (matches.length > 5) {
        report += `- ... and ${matches.length - 5} more matches\n`;
      }
      report += `\n`;
      totalMatches += matches.length;
    }
  }

  report = report.replace('---\n\n', `---\n\n**Total Matches:** ${totalMatches}\n\n`);
  return report;
}

// Generate dependency map
function generateDependencyMap(targetPath) {
  let report = `# Dependency Map: ${targetPath}\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  report += `---\n\n`;

  const files = targetPath.endsWith('/') ? listFiles(targetPath) : [targetPath];

  for (const file of files) {
    const content = readFile(file);
    if (!content) continue;

    const imports = extractImports(content);
    const exports = extractExports(content);

    report += `### ${file}\n\n`;
    report += `**Exports:** ${exports.join(', ') || 'None'}\n\n`;
    report += `**Imports:**\n`;

    const localImports = imports.filter(i => i.startsWith('.'));
    const npmImports = imports.filter(i => !i.startsWith('.'));

    if (localImports.length > 0) {
      report += `\nLocal:\n`;
      for (const imp of localImports) {
        report += `- ${imp}\n`;
      }
    }

    if (npmImports.length > 0) {
      report += `\nNPM:\n`;
      for (const imp of npmImports) {
        report += `- ${imp}\n`;
      }
    }

    report += `\n`;
  }

  return report;
}

// Main execution
let report = '';
let filename = '';

switch (reportType) {
  case 'subsystem':
    if (!reportArg) {
      console.error('Usage: generate-report.js subsystem <name>');
      console.log('Available:', Object.keys(SUBSYSTEMS).join(', '));
      process.exit(1);
    }
    report = generateSubsystemReport(reportArg);
    filename = `subsystem-${reportArg}-${getTimestamp()}.md`;
    break;

  case 'file-analysis':
    if (!reportArg) {
      console.error('Usage: generate-report.js file-analysis <path>');
      process.exit(1);
    }
    report = generateFileAnalysis(reportArg);
    filename = `file-analysis-${path.basename(reportArg, '.js')}-${getTimestamp()}.md`;
    break;

  case 'pattern-search':
    if (!reportArg) {
      console.error('Usage: generate-report.js pattern-search <pattern>');
      process.exit(1);
    }
    report = generatePatternSearch(reportArg);
    filename = `pattern-search-${getTimestamp()}.md`;
    break;

  case 'dependency-map':
    if (!reportArg) {
      console.error('Usage: generate-report.js dependency-map <path>');
      process.exit(1);
    }
    report = generateDependencyMap(reportArg);
    filename = `dependency-map-${getTimestamp()}.md`;
    break;

  default:
    console.error(`Unknown report type: ${reportType}`);
    process.exit(1);
}

// Save report
const outputPath = path.join(REPORTS_DIR, filename);
fs.writeFileSync(outputPath, report);
console.log(`Report generated: ${outputPath}`);
console.log(`\nPreview:\n${report.split('\n').slice(0, 20).join('\n')}\n...`);
