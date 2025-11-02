#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════');
console.log('  PROJECT CLEANUP SCRIPT');
console.log('═══════════════════════════════════════');
console.log('');

const filesToDelete = [
  // Redundant diagnostic files
  'diag.js',
  'test-logger.js',
  'test-startup.js',
  'apply-fix.bat',
  
  // Old backup/fix files (if they exist)
  'orchestrator-corrected.js',
  'orchestrator.js.backup',
  'FIX_GUIDE.md',
  
  // Future stub files (Week 4-10)
  'scrapers/js-scraper.js',
  'scrapers/profile-resolver-scraper.js',
  'pagination/infinite-scroll.js',
  'pagination/navigator.js',
  'adapters/loader.js',
  'adapters/registry.json',
  'adapters/template-adapter.json',
  'io/csv-handler.js',
  'io/sqlite-handler.js',
  'io/sheets-handler.js',
  'io/normalizer.js',
  'io/deduplicator.js',
  'tests/pagination-test.js',
  'tests/full-run-test.js'
];

let deleted = 0;
let notFound = 0;
let errors = 0;

console.log('Scanning for files to delete...\n');

for (const file of filesToDelete) {
  const fullPath = path.join(process.cwd(), file);
  
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      console.log(`✓ Deleted: ${file}`);
      deleted++;
    } catch (error) {
      console.log(`✗ Error deleting ${file}: ${error.message}`);
      errors++;
    }
  } else {
    notFound++;
  }
}

console.log('');
console.log('Cleaning up empty directories...\n');

// Clean up empty directories
const emptyDirs = ['pagination', 'adapters', 'io'];
let dirsRemoved = 0;

for (const dir of emptyDirs) {
  const dirPath = path.join(process.cwd(), dir);
  
  if (fs.existsSync(dirPath)) {
    try {
      const files = fs.readdirSync(dirPath);
      if (files.length === 0) {
        fs.rmdirSync(dirPath);
        console.log(`✓ Removed empty directory: ${dir}/`);
        dirsRemoved++;
      } else {
        console.log(`  Skipped ${dir}/ (not empty)`);
      }
    } catch (error) {
      console.log(`✗ Error checking ${dir}/: ${error.message}`);
    }
  }
}

console.log('');
console.log('═══════════════════════════════════════');
console.log('  CLEANUP SUMMARY');
console.log('═══════════════════════════════════════');
console.log(`Files deleted: ${deleted}`);
console.log(`Files not found: ${notFound}`);
console.log(`Directories removed: ${dirsRemoved}`);
console.log(`Errors: ${errors}`);
console.log('');

if (errors === 0) {
  console.log('✓ Cleanup completed successfully!');
  console.log('');
  console.log('Your project is now cleaner and ready for development.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Apply fixes to simple-scraper.js');
  console.log('  2. Run: node orchestrator.js --url <your-url> --headless false --limit 10');
  console.log('  3. Verify names are being extracted correctly');
} else {
  console.log(`✗ Cleanup completed with ${errors} error(s)`);
  console.log('Please review the errors above.');
}

console.log('');
