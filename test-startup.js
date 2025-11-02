#!/usr/bin/env node

console.log('=== STARTUP DIAGNOSTIC ===\n');

// Test 1: Basic Node.js
console.log('1. Node.js is running ✓');
console.log(`   Node version: ${process.version}`);

// Test 2: Check if logs directory exists
const fs = require('fs');
const path = require('path');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  console.log('2. Creating logs directory...');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('   Logs directory created ✓');
  } catch (error) {
    console.error('   ERROR: Could not create logs directory:', error.message);
    process.exit(1);
  }
} else {
  console.log('2. Logs directory exists ✓');
}

// Test 3: Try loading modules
console.log('3. Testing module imports...');

try {
  console.log('   - Loading commander...');
  const { Command } = require('commander');
  console.log('     commander loaded ✓');
} catch (error) {
  console.error('     ERROR loading commander:', error.message);
  process.exit(1);
}

try {
  console.log('   - Loading winston...');
  const winston = require('winston');
  console.log('     winston loaded ✓');
} catch (error) {
  console.error('     ERROR loading winston:', error.message);
  process.exit(1);
}

try {
  console.log('   - Loading cli-table3...');
  const Table = require('cli-table3');
  console.log('     cli-table3 loaded ✓');
} catch (error) {
  console.error('     ERROR loading cli-table3:', error.message);
  process.exit(1);
}

// Test 4: Try loading custom modules
console.log('4. Testing custom module imports...');

try {
  console.log('   - Loading Logger...');
  const Logger = require('./utils/logger');
  console.log('     Logger loaded ✓');
  
  console.log('   - Creating logger instance...');
  const logger = new Logger();
  console.log('     Logger instance created ✓');
  
  console.log('   - Testing logger.info()...');
  logger.info('Test message from logger');
  console.log('     Logger works ✓');
} catch (error) {
  console.error('     ERROR with Logger:', error.message);
  console.error('     Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('   - Loading BrowserManager...');
  const BrowserManager = require('./utils/browser-manager');
  console.log('     BrowserManager loaded ✓');
} catch (error) {
  console.error('     ERROR loading BrowserManager:', error.message);
  process.exit(1);
}

try {
  console.log('   - Loading RateLimiter...');
  const RateLimiter = require('./utils/rate-limiter');
  console.log('     RateLimiter loaded ✓');
} catch (error) {
  console.error('     ERROR loading RateLimiter:', error.message);
  process.exit(1);
}

try {
  console.log('   - Loading SimpleScraper...');
  const SimpleScraper = require('./scrapers/simple-scraper');
  console.log('     SimpleScraper loaded ✓');
} catch (error) {
  console.error('     ERROR loading SimpleScraper:', error.message);
  process.exit(1);
}

console.log('\n=== ALL TESTS PASSED ===');
console.log('\nYour setup appears to be working correctly.');
console.log('The issue might be in the orchestrator.js file itself.');
console.log('\nNext steps:');
console.log('1. Check if orchestrator.js exists');
console.log('2. Check for syntax errors in orchestrator.js');
console.log('3. Try running: node diag.js');
