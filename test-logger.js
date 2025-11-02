#!/usr/bin/env node

console.log('Starting minimal orchestrator test...\n');

try {
  console.log('Step 1: Loading dependencies...');
  const { Command } = require('commander');
  const Table = require('cli-table3');
  const fs = require('fs');
  const path = require('path');
  console.log('  Dependencies loaded OK\n');

  console.log('Step 2: Loading Logger...');
  const Logger = require('./utils/logger');
  console.log('  Logger module loaded');
  console.log('  Logger type:', typeof Logger);
  console.log('  Logger is constructor?', typeof Logger === 'function' && Logger.prototype);
  
  console.log('\nStep 3: Trying to create logger instance...');
  let logger;
  
  // Check if Logger is a class/constructor or an instance
  if (typeof Logger === 'function') {
    logger = new Logger();
    console.log('  Created as new Logger()');
  } else {
    logger = Logger;
    console.log('  Using Logger directly (not a constructor)');
  }
  
  console.log('\nStep 4: Testing logger methods...');
  if (typeof logger.info === 'function') {
    logger.info('Test message');
    console.log('  logger.info() works ✓');
  } else {
    console.log('  ERROR: logger.info is not a function');
  }
  
  console.log('\n=== TEST COMPLETE ===');
  console.log('If you see this, the basic setup works.');
  console.log('\nThe issue is likely:');
  console.log('- Logger is exported as an instance, not a class');
  console.log('- orchestrator.js tries to use "new Logger()" which fails');
  
} catch (error) {
  console.error('\n=== ERROR DETECTED ===');
  console.error('Error message:', error.message);
  console.error('\nFull error:');
  console.error(error);
  console.error('\nStack trace:');
  console.error(error.stack);
}
