#!/usr/bin/env node
/**
 * Dependency Analyzer
 *
 * Scans the project to identify:
 * - Dead code (files never imported)
 * - Deprecated patterns still in use
 * - Class usage analysis
 * - Circular dependencies
 *
 * Usage:
 *   node analyze-dependencies.js [--verbose] [--json]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const PROJECT_ROOT = __dirname;
const EXCLUDE_DIRS = ['node_modules', '.git', '.cache', 'output', 'logs', 'configs'];
const EXCLUDE_FILES = ['analyze-dependencies.js', 'package-lock.json'];

// Entry points to trace from
const ENTRY_POINTS = [
  'orchestrator.js',
  'src/tools/config-generator.js',
  'src/tools/test-config.js',
  'src/tools/validate-config.js',
  'src/tools/enrich-contacts.js',
  'src/tools/test-navigation.js',
  'src/tools/export-to-sheets.js',
  'src/workflows/full-pipeline.js',
  'tests/enrichment-test.js',
  'tests/post-cleaning-test.js',
  'tests/selenium-infinite-scroll.test.js',
  'tests/run-navigation-tests.js'
];

// Classes to track
const TRACKED_CLASSES = [
  'ConfigScraper',
  'SinglePageScraper',
  'PaginationScraper',
  'InfiniteScrollScraper',
  'BaseConfigScraper',
  'BaseScraper',
  'BrowserManager',
  'SeleniumManager',
  'ConfigLoader'
];

// Deprecated patterns to detect
const DEPRECATED_PATTERNS = [
  {
    name: 'ConfigScraper class',
    pattern: /\bConfigScraper\b/,
    replacement: 'SinglePageScraper/PaginationScraper/InfiniteScrollScraper',
    severity: 'HIGH'
  },
  {
    name: 'config-scraper.js import',
    pattern: /require\s*\(\s*['"][^'"]*config-scraper(?:\.js)?['"]\s*\)/,
    replacement: 'config-scrapers/ modules',
    severity: 'HIGH'
  },
  {
    name: 'loadConfig(url) pattern',
    pattern: /\.loadConfig\s*\(\s*['"]https?:/,
    replacement: 'loadConfigByName()',
    severity: 'MEDIUM'
  },
  {
    name: 'networkidle0 wait strategy',
    pattern: /waitUntil:\s*['"]networkidle0['"]/,
    replacement: 'domcontentloaded',
    severity: 'LOW'
  }
];

// Parse command line arguments
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const JSON_OUTPUT = args.includes('--json');

// Results storage
const results = {
  totalFiles: 0,
  activeFiles: new Set(),
  deadCode: [],
  deprecatedPatterns: [],
  classUsage: {},
  circularDeps: [],
  importGraph: {},
  recommendations: []
};

/**
 * Get all JS files in project
 */
function getAllJsFiles(dir = PROJECT_ROOT, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(PROJECT_ROOT, fullPath);

    // Skip excluded directories
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(entry.name)) {
        getAllJsFiles(fullPath, files);
      }
      continue;
    }

    // Only include JS files
    if (entry.isFile() && entry.name.endsWith('.js')) {
      if (!EXCLUDE_FILES.includes(entry.name)) {
        files.push(relativePath);
      }
    }
  }

  return files;
}

/**
 * Extract require/import statements from file content
 */
function extractImports(filePath, content) {
  const imports = [];
  const dir = path.dirname(filePath);

  // Match require statements
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;

  while ((match = requireRegex.exec(content)) !== null) {
    const importPath = match[1];

    // Skip node_modules imports
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      continue;
    }

    // Resolve relative path
    let resolvedPath = path.join(dir, importPath);

    // Try different extensions/patterns
    const testPaths = [
      resolvedPath + '.js',
      resolvedPath + '/index.js',
      resolvedPath
    ];

    for (const testPath of testPaths) {
      const fullTestPath = path.join(PROJECT_ROOT, testPath);
      if (fs.existsSync(fullTestPath)) {
        try {
          const stat = fs.statSync(fullTestPath);
          if (stat.isFile()) {
            imports.push(testPath.replace(/\\/g, '/'));
            break;
          } else if (stat.isDirectory()) {
            // If it's a directory, look for index.js
            const indexPath = path.join(testPath, 'index.js');
            if (fs.existsSync(path.join(PROJECT_ROOT, indexPath))) {
              imports.push(indexPath.replace(/\\/g, '/'));
              break;
            }
          }
        } catch (e) {
          // Skip on error
        }
      }
    }
  }

  return imports;
}

/**
 * Find class definitions in file
 */
function findClassDefinitions(content) {
  const classes = [];
  const classRegex = /class\s+(\w+)/g;
  let match;

  while ((match = classRegex.exec(content)) !== null) {
    classes.push(match[1]);
  }

  return classes;
}

/**
 * Find class instantiations in file
 */
function findClassInstantiations(content, className) {
  const instances = [];
  const regex = new RegExp(`new\\s+${className}\\s*\\(`, 'g');
  let match;

  // Find line numbers
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      instances.push(i + 1);
    }
    regex.lastIndex = 0;
  }

  return instances;
}

/**
 * Find deprecated patterns in file
 */
function findDeprecatedPatterns(filePath, content) {
  const found = [];
  const lines = content.split('\n');

  for (const pattern of DEPRECATED_PATTERNS) {
    const matches = [];

    for (let i = 0; i < lines.length; i++) {
      if (pattern.pattern.test(lines[i])) {
        matches.push(i + 1);
      }
    }

    if (matches.length > 0) {
      found.push({
        name: pattern.name,
        file: filePath,
        lines: matches,
        replacement: pattern.replacement,
        severity: pattern.severity
      });
    }
  }

  return found;
}

/**
 * Build import graph starting from entry points
 */
function buildImportGraph() {
  const visited = new Set();
  const stack = [];

  function visit(filePath, fromFile = null) {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check for circular dependency
    if (stack.includes(normalizedPath)) {
      const cycle = [...stack.slice(stack.indexOf(normalizedPath)), normalizedPath];
      results.circularDeps.push(cycle);
      return;
    }

    // Skip if already visited
    if (visited.has(normalizedPath)) {
      return;
    }

    // Check if file exists and is a file (not directory)
    const fullPath = path.join(PROJECT_ROOT, normalizedPath);
    if (!fs.existsSync(fullPath)) {
      if (VERBOSE) {
        console.log(`  [WARN] File not found: ${normalizedPath}`);
      }
      return;
    }

    // Skip directories
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (VERBOSE) {
          console.log(`  [SKIP] Is directory: ${normalizedPath}`);
        }
        return;
      }
    } catch (e) {
      return;
    }

    visited.add(normalizedPath);
    results.activeFiles.add(normalizedPath);
    stack.push(normalizedPath);

    // Read and analyze file
    const content = fs.readFileSync(fullPath, 'utf8');
    const imports = extractImports(normalizedPath, content);

    results.importGraph[normalizedPath] = imports;

    // Analyze class usage
    for (const className of TRACKED_CLASSES) {
      // Check for class definition
      const definitions = findClassDefinitions(content);
      if (definitions.includes(className)) {
        if (!results.classUsage[className]) {
          results.classUsage[className] = { definedIn: null, importedIn: [], instantiatedIn: [] };
        }
        results.classUsage[className].definedIn = normalizedPath;
      }

      // Check for instantiation
      const instances = findClassInstantiations(content, className);
      if (instances.length > 0) {
        if (!results.classUsage[className]) {
          results.classUsage[className] = { definedIn: null, importedIn: [], instantiatedIn: [] };
        }
        results.classUsage[className].instantiatedIn.push({
          file: normalizedPath,
          lines: instances
        });
      }
    }

    // Check for deprecated patterns
    const deprecated = findDeprecatedPatterns(normalizedPath, content);
    results.deprecatedPatterns.push(...deprecated);

    // Recursively visit imports
    for (const importPath of imports) {
      visit(importPath, normalizedPath);
    }

    stack.pop();
  }

  // Start from entry points
  for (const entryPoint of ENTRY_POINTS) {
    if (fs.existsSync(path.join(PROJECT_ROOT, entryPoint))) {
      if (VERBOSE) {
        console.log(`Tracing from: ${entryPoint}`);
      }
      visit(entryPoint);
    } else if (VERBOSE) {
      console.log(`  [SKIP] Entry point not found: ${entryPoint}`);
    }
  }
}

/**
 * Generate recommendations
 */
function generateRecommendations() {
  // Check for deprecated ConfigScraper usage
  const configScraperUsage = results.classUsage['ConfigScraper'];
  if (configScraperUsage && configScraperUsage.instantiatedIn.length > 0) {
    results.recommendations.push({
      severity: 'HIGH',
      message: 'ConfigScraper (deprecated) is still being instantiated',
      details: configScraperUsage.instantiatedIn.map(i => `${i.file}:${i.lines.join(',')}`).join(', ')
    });
  } else {
    results.recommendations.push({
      severity: 'OK',
      message: 'ConfigScraper is not being instantiated (good!)'
    });
  }

  // Check v2.3 scraper usage
  const v23Scrapers = ['SinglePageScraper', 'PaginationScraper', 'InfiniteScrollScraper'];
  const v23Usage = v23Scrapers.filter(s =>
    results.classUsage[s] && results.classUsage[s].instantiatedIn.length > 0
  );

  if (v23Usage.length > 0) {
    results.recommendations.push({
      severity: 'OK',
      message: `v2.3 scrapers are being used: ${v23Usage.join(', ')}`
    });
  }

  // Dead code recommendations
  if (results.deadCode.length > 0) {
    results.recommendations.push({
      severity: 'MEDIUM',
      message: `${results.deadCode.length} files are never imported - review for deletion`,
      details: results.deadCode.slice(0, 10).join(', ') + (results.deadCode.length > 10 ? '...' : '')
    });
  }

  // Circular dependency warnings
  if (results.circularDeps.length > 0) {
    results.recommendations.push({
      severity: 'MEDIUM',
      message: `${results.circularDeps.length} circular dependencies found`,
      details: results.circularDeps.map(c => c.join(' -> ')).join('\n')
    });
  }

  // Deprecated patterns
  const highSeverity = results.deprecatedPatterns.filter(p => p.severity === 'HIGH');
  if (highSeverity.length > 0) {
    results.recommendations.push({
      severity: 'HIGH',
      message: `${highSeverity.length} high-severity deprecated patterns found`,
      details: highSeverity.map(p => `${p.name} in ${p.file}`).join(', ')
    });
  }
}

/**
 * Print text report
 */
function printReport() {
  console.log('\n' + '='.repeat(60));
  console.log('  DEPENDENCY ANALYSIS REPORT');
  console.log('='.repeat(60) + '\n');

  // Summary
  console.log('SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Total JS files:        ${results.totalFiles}`);
  console.log(`Imported (active):     ${results.activeFiles.size}`);
  console.log(`Dead code (unused):    ${results.deadCode.length}`);
  console.log(`Deprecated patterns:   ${results.deprecatedPatterns.length}`);
  console.log(`Circular dependencies: ${results.circularDeps.length}`);
  console.log();

  // Dead code
  if (results.deadCode.length > 0) {
    console.log('DEAD CODE - Files never imported (safe to delete)');
    console.log('-'.repeat(40));
    for (const file of results.deadCode) {
      console.log(`  [DELETE] ${file}`);
    }
    console.log();
  }

  // Deprecated patterns
  if (results.deprecatedPatterns.length > 0) {
    console.log('DEPRECATED PATTERNS - Should be updated');
    console.log('-'.repeat(40));

    // Group by pattern name
    const grouped = {};
    for (const pattern of results.deprecatedPatterns) {
      if (!grouped[pattern.name]) {
        grouped[pattern.name] = {
          replacement: pattern.replacement,
          severity: pattern.severity,
          locations: []
        };
      }
      grouped[pattern.name].locations.push({
        file: pattern.file,
        lines: pattern.lines
      });
    }

    for (const [name, info] of Object.entries(grouped)) {
      console.log(`  ${name} [${info.severity}]`);
      console.log(`  Replace with: ${info.replacement}`);
      console.log('  Found in:');
      for (const loc of info.locations) {
        console.log(`    - ${loc.file} (lines: ${loc.lines.join(', ')})`);
      }
      console.log();
    }
  }

  // Class usage
  console.log('CLASS USAGE ANALYSIS');
  console.log('-'.repeat(40));

  for (const className of TRACKED_CLASSES) {
    const usage = results.classUsage[className];
    if (!usage) {
      console.log(`  ${className} [NOT FOUND]`);
      continue;
    }

    const isActive = usage.instantiatedIn.length > 0;
    const isDeprecated = className === 'ConfigScraper';
    const status = isActive ? 'ACTIVE' : 'INACTIVE';
    const warning = isActive && isDeprecated ? ' <-- Problem!' : '';

    console.log(`  ${className} [${status}]${warning}`);
    if (usage.definedIn) {
      console.log(`    Defined in: ${usage.definedIn}`);
    }
    if (usage.instantiatedIn.length > 0) {
      console.log('    Instantiated in:');
      for (const inst of usage.instantiatedIn) {
        console.log(`      - ${inst.file} (lines: ${inst.lines.join(', ')})`);
      }
    }
  }
  console.log();

  // Circular dependencies
  if (results.circularDeps.length > 0) {
    console.log('CIRCULAR DEPENDENCIES');
    console.log('-'.repeat(40));
    for (const cycle of results.circularDeps) {
      console.log(`  ${cycle.join(' -> ')}`);
    }
    console.log();
  }

  // Recommendations
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(40));
  for (const rec of results.recommendations) {
    const prefix = rec.severity === 'OK' ? '[OK]' :
                   rec.severity === 'HIGH' ? '[HIGH]' :
                   rec.severity === 'MEDIUM' ? '[MEDIUM]' : '[LOW]';
    console.log(`${prefix} ${rec.message}`);
    if (rec.details && VERBOSE) {
      console.log(`     ${rec.details}`);
    }
  }
  console.log();
}

/**
 * Main execution
 */
function main() {
  if (!JSON_OUTPUT) {
    console.log('Scanning project for dependencies...\n');
  }

  // Get all JS files
  const allFiles = getAllJsFiles();
  results.totalFiles = allFiles.length;

  if (VERBOSE && !JSON_OUTPUT) {
    console.log(`Found ${allFiles.length} JS files\n`);
  }

  // Build import graph from entry points
  buildImportGraph();

  // Find dead code (files never imported)
  for (const file of allFiles) {
    const normalizedFile = file.replace(/\\/g, '/');
    if (!results.activeFiles.has(normalizedFile)) {
      // Check if it's an entry point itself
      if (!ENTRY_POINTS.includes(normalizedFile)) {
        results.deadCode.push(normalizedFile);
      }
    }
  }

  // Generate recommendations
  generateRecommendations();

  // Output
  if (JSON_OUTPUT) {
    // Convert Sets to Arrays for JSON serialization
    const jsonResults = {
      ...results,
      activeFiles: Array.from(results.activeFiles),
      timestamp: new Date().toISOString()
    };
    console.log(JSON.stringify(jsonResults, null, 2));
  } else {
    printReport();
  }
}

// Run
main();
