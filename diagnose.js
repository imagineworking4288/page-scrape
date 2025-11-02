#!/usr/bin/env node

console.log('╔═══════════════════════════════════════╗');
console.log('║   SCRAPER DIAGNOSTIC TOOL v1.0        ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');

const fs = require('fs');
const path = require('path');

let errors = [];
let warnings = [];

// Test 1: Check Node.js version
console.log('Test 1: Node.js Version');
console.log('─────────────────────────────────────');
console.log(`✓ Node.js ${process.version}`);
if (parseInt(process.version.slice(1)) < 16) {
  warnings.push('Node.js version is below 16. Consider upgrading for best compatibility.');
}
console.log('');

// Test 2: Check directory structure
console.log('Test 2: Directory Structure');
console.log('─────────────────────────────────────');
const requiredDirs = ['utils', 'scrapers'];
const requiredFiles = [
  'orchestrator.js',
  'package.json',
  'utils/logger.js',
  'utils/browser-manager.js',
  'utils/rate-limiter.js',
  'scrapers/simple-scraper.js'
];

requiredDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✓ ${dir}/ exists`);
  } else {
    console.log(`✗ ${dir}/ MISSING`);
    errors.push(`Missing directory: ${dir}`);
  }
});

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✓ ${file} exists`);
  } else {
    console.log(`✗ ${file} MISSING`);
    errors.push(`Missing file: ${file}`);
  }
});

// Check logs directory
if (!fs.existsSync('logs')) {
  console.log(`⚠ logs/ directory missing (will be created automatically)`);
  warnings.push('Logs directory will be created on first run');
}
console.log('');

// Test 3: Check package.json and dependencies
console.log('Test 3: Dependencies');
console.log('─────────────────────────────────────');
if (fs.existsSync('package.json')) {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredDeps = ['puppeteer', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth', 'commander', 'winston', 'cli-table3'];
    
    requiredDeps.forEach(dep => {
      if (pkg.dependencies && pkg.dependencies[dep]) {
        console.log(`✓ ${dep} listed in package.json`);
      } else {
        console.log(`✗ ${dep} MISSING from package.json`);
        errors.push(`Missing dependency: ${dep}`);
      }
    });
  } catch (error) {
    console.log(`✗ Error reading package.json: ${error.message}`);
    errors.push('Cannot parse package.json');
  }
} else {
  console.log('✗ package.json not found');
  errors.push('Missing package.json');
}
console.log('');

// Test 4: Check if node_modules exists
console.log('Test 4: Node Modules');
console.log('─────────────────────────────────────');
if (fs.existsSync('node_modules')) {
  console.log('✓ node_modules directory exists');
  
  // Check for key modules
  const keyModules = ['puppeteer', 'commander', 'winston', 'cli-table3'];
  keyModules.forEach(mod => {
    if (fs.existsSync(path.join('node_modules', mod))) {
      console.log(`  ✓ ${mod} installed`);
    } else {
      console.log(`  ✗ ${mod} NOT installed`);
      errors.push(`Module not installed: ${mod}`);
    }
  });
} else {
  console.log('✗ node_modules directory not found');
  console.log('  Run: npm install');
  errors.push('Dependencies not installed - run npm install');
}
console.log('');

// Test 5: Try loading modules
console.log('Test 5: Module Loading Test');
console.log('─────────────────────────────────────');

const modulesToTest = [
  { name: 'commander', require: 'commander' },
  { name: 'winston', require: 'winston' },
  { name: 'cli-table3', require: 'cli-table3' },
  { name: 'puppeteer-extra', require: 'puppeteer-extra' },
];

modulesToTest.forEach(mod => {
  try {
    require(mod.require);
    console.log(`✓ ${mod.name} loads successfully`);
  } catch (error) {
    console.log(`✗ ${mod.name} failed to load: ${error.message}`);
    errors.push(`Cannot load ${mod.name}: ${error.message}`);
  }
});
console.log('');

// Test 6: Check logger export type
console.log('Test 6: Logger Configuration');
console.log('─────────────────────────────────────');
if (fs.existsSync('utils/logger.js')) {
  try {
    const logger = require('./utils/logger');
    console.log(`Logger type: ${typeof logger}`);
    
    if (typeof logger === 'function') {
      console.log('⚠ Logger is exported as a constructor/class');
      console.log('  orchestrator.js should use: new Logger()');
    } else if (typeof logger === 'object') {
      console.log('✓ Logger is exported as an instance');
      console.log('  orchestrator.js should use: const logger = require(...)');
      console.log('  NOT: const logger = new Logger()');
      
      // Test logger methods
      if (typeof logger.info === 'function') {
        console.log('✓ logger.info() method exists');
      } else {
        console.log('✗ logger.info() method missing');
        errors.push('Logger missing info() method');
      }
    }
  } catch (error) {
    console.log(`✗ Error loading logger: ${error.message}`);
    errors.push(`Cannot load logger: ${error.message}`);
  }
} else {
  console.log('✗ utils/logger.js not found');
  errors.push('Logger file missing');
}
console.log('');

// Test 7: Check orchestrator.js for common issues
console.log('Test 7: Orchestrator.js Analysis');
console.log('─────────────────────────────────────');
if (fs.existsSync('orchestrator.js')) {
  try {
    const orchestratorContent = fs.readFileSync('orchestrator.js', 'utf8');
    
    // Check for the Logger bug
    if (orchestratorContent.includes('new Logger()')) {
      console.log('✗ BUG FOUND: orchestrator.js uses "new Logger()"');
      console.log('  This is the likely cause of silent failure!');
      console.log('  Fix: Change to "const logger = require(\'./utils/logger\')"');
      errors.push('CRITICAL: orchestrator.js incorrectly uses "new Logger()"');
    } else if (orchestratorContent.includes('= require(\'./utils/logger\')')) {
      console.log('✓ Logger is imported correctly');
    } else {
      console.log('⚠ Cannot determine logger import method');
      warnings.push('Could not verify logger import');
    }
    
    // Check headless option
    if (orchestratorContent.includes('.option(\'--headless\', ')) {
      console.log('⚠ Headless option may not accept values');
      console.log('  Current setup likely only works with --no-headless');
      warnings.push('Headless option needs to accept [value] parameter');
    } else if (orchestratorContent.includes('.option(\'--headless [value]\'') || 
               orchestratorContent.includes('.option(\'--headless [boolean]\'')) {
      console.log('✓ Headless option correctly configured');
    }
    
  } catch (error) {
    console.log(`✗ Error reading orchestrator.js: ${error.message}`);
    errors.push(`Cannot read orchestrator.js: ${error.message}`);
  }
} else {
  console.log('✗ orchestrator.js not found');
  errors.push('orchestrator.js missing');
}
console.log('');

// Summary
console.log('╔═══════════════════════════════════════╗');
console.log('║            DIAGNOSTIC SUMMARY         ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');

if (errors.length === 0 && warnings.length === 0) {
  console.log('✓ ALL TESTS PASSED');
  console.log('');
  console.log('Your setup appears to be correct.');
  console.log('If orchestrator.js still doesn\'t work, try:');
  console.log('  node diag.js');
} else {
  if (errors.length > 0) {
    console.log(`✗ ${errors.length} ERROR(S) FOUND:`);
    errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log(`⚠ ${warnings.length} WARNING(S):`);
    warnings.forEach((warn, i) => {
      console.log(`  ${i + 1}. ${warn}`);
    });
    console.log('');
  }
  
  console.log('RECOMMENDED ACTIONS:');
  console.log('───────────────────────────────────────');
  
  if (errors.some(e => e.includes('npm install'))) {
    console.log('1. Run: npm install');
  }
  
  if (errors.some(e => e.includes('new Logger()'))) {
    console.log('2. Fix orchestrator.js:');
    console.log('   - Change: const Logger = require(\'./utils/logger\');');
    console.log('   - Change: const logger = new Logger();');
    console.log('   - To:     const logger = require(\'./utils/logger\');');
  }
  
  if (warnings.some(w => w.includes('Headless'))) {
    console.log('3. Fix headless option in orchestrator.js:');
    console.log('   - Change: .option(\'--headless\', ...)');
    console.log('   - To:     .option(\'--headless [value]\', ...)');
  }
}

console.log('');
console.log('For detailed fix instructions, see: FIX_GUIDE.md');
console.log('');
