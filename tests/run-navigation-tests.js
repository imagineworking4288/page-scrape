#!/usr/bin/env node

/**
 * Unified Navigation Test Runner
 *
 * Runs all navigation tests (infinite scroll + pagination) with a unified interface.
 * Provides combined reporting and flexible test selection.
 *
 * Usage:
 *   node tests/run-navigation-tests.js [options]
 *
 * Options:
 *   --type <type>         Test type: 'all', 'scroll', 'pagination' (default: all)
 *   --url <url>           Test a specific URL
 *   --headless <bool>     Run in headless mode (default: true)
 *   --verbose             Show detailed output
 *   --quick               Quick test with reduced limits
 *   --show-timeline       Display timeline events (scroll tests only)
 *   --save <file>         Save combined results to JSON file
 *
 * Examples:
 *   node tests/run-navigation-tests.js                        # Run all tests
 *   node tests/run-navigation-tests.js --type scroll          # Scroll tests only
 *   node tests/run-navigation-tests.js --type pagination      # Pagination tests only
 *   node tests/run-navigation-tests.js --url <url> --verbose  # Test specific URL
 *   node tests/run-navigation-tests.js --quick                # Quick test suite
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Command } = require('commander');

// CLI Setup
const program = new Command();
program
  .name('run-navigation-tests')
  .description('Unified navigation test runner')
  .version('1.0.0')
  .option('--type <type>', 'Test type: all, scroll, pagination', 'all')
  .option('--url <url>', 'Test a specific URL')
  .option('--headless [value]', 'Run in headless mode', 'true')
  .option('--verbose', 'Show detailed output', false)
  .option('--quick', 'Quick test with reduced limits', false)
  .option('--show-timeline', 'Display timeline events', false)
  .option('--save <file>', 'Save combined results to JSON file')
  .parse(process.argv);

const options = program.opts();

/**
 * Run a test script as a child process
 * @param {string} scriptPath - Path to test script
 * @param {Array} args - Command line arguments
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 */
function runTestScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Build command line args from options
 */
function buildArgs() {
  const args = [];

  if (options.url) {
    args.push('--url', options.url);
  }

  if (options.headless !== undefined) {
    args.push('--headless', options.headless);
  }

  if (options.verbose) {
    args.push('--verbose');
  }

  if (options.quick) {
    args.push('--quick');
  }

  if (options.showTimeline) {
    args.push('--show-timeline');
  }

  return args;
}

/**
 * Main runner
 */
async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║      UNIFIED NAVIGATION TEST RUNNER                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Test type: ${options.type}`);
  console.log(`Headless: ${options.headless}`);
  console.log(`Quick mode: ${options.quick}`);
  console.log(`Verbose: ${options.verbose}`);
  if (options.url) {
    console.log(`URL: ${options.url}`);
  }
  console.log('');

  const testsDir = path.join(__dirname, 'navigation');
  const results = {
    runAt: new Date().toISOString(),
    options: {
      type: options.type,
      headless: options.headless,
      quick: options.quick,
      verbose: options.verbose,
      url: options.url || null
    },
    tests: []
  };

  const args = buildArgs();
  let allPassed = true;

  // Run infinite scroll tests
  if (options.type === 'all' || options.type === 'scroll') {
    console.log('═'.repeat(70));
    console.log('  RUNNING INFINITE SCROLL NAVIGATION TESTS');
    console.log('═'.repeat(70));
    console.log('');

    const scrollTestPath = path.join(testsDir, 'infinite-scroll-navigation.test.js');

    if (fs.existsSync(scrollTestPath)) {
      try {
        const scrollResult = await runTestScript(scrollTestPath, args);
        results.tests.push({
          name: 'Infinite Scroll Navigation Tests',
          exitCode: scrollResult.exitCode,
          passed: scrollResult.exitCode === 0
        });

        if (scrollResult.exitCode !== 0) {
          allPassed = false;
        }
      } catch (err) {
        console.error('Failed to run scroll tests:', err.message);
        results.tests.push({
          name: 'Infinite Scroll Navigation Tests',
          exitCode: 1,
          passed: false,
          error: err.message
        });
        allPassed = false;
      }
    } else {
      console.log('Scroll test file not found:', scrollTestPath);
      results.tests.push({
        name: 'Infinite Scroll Navigation Tests',
        exitCode: 1,
        passed: false,
        error: 'Test file not found'
      });
    }

    console.log('');
  }

  // Run pagination tests
  if (options.type === 'all' || options.type === 'pagination') {
    console.log('═'.repeat(70));
    console.log('  RUNNING PAGINATION NAVIGATION TESTS');
    console.log('═'.repeat(70));
    console.log('');

    const paginationTestPath = path.join(testsDir, 'pagination-navigation.test.js');

    if (fs.existsSync(paginationTestPath)) {
      try {
        const paginationResult = await runTestScript(paginationTestPath, args);
        results.tests.push({
          name: 'Pagination Navigation Tests',
          exitCode: paginationResult.exitCode,
          passed: paginationResult.exitCode === 0
        });

        if (paginationResult.exitCode !== 0) {
          allPassed = false;
        }
      } catch (err) {
        console.error('Failed to run pagination tests:', err.message);
        results.tests.push({
          name: 'Pagination Navigation Tests',
          exitCode: 1,
          passed: false,
          error: err.message
        });
        allPassed = false;
      }
    } else {
      console.log('Pagination test file not found:', paginationTestPath);
      results.tests.push({
        name: 'Pagination Navigation Tests',
        exitCode: 1,
        passed: false,
        error: 'Test file not found'
      });
    }

    console.log('');
  }

  // Print combined summary
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║      COMBINED TEST SUMMARY                                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('');

  const passedCount = results.tests.filter(t => t.passed).length;
  const totalCount = results.tests.length;

  results.tests.forEach(test => {
    const status = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}: ${test.name}`);
    if (test.error) {
      console.log(`         Error: ${test.error}`);
    }
  });

  console.log('');
  console.log(`  Total: ${totalCount} test suites`);
  console.log(`  Passed: ${passedCount}`);
  console.log(`  Failed: ${totalCount - passedCount}`);
  console.log('');

  if (allPassed) {
    console.log('  ✓ All navigation tests passed!');
  } else {
    console.log('  ✗ Some tests failed');
  }

  console.log('');

  // Save results if requested
  if (options.save) {
    results.summary = {
      total: totalCount,
      passed: passedCount,
      failed: totalCount - passedCount,
      allPassed
    };

    fs.writeFileSync(options.save, JSON.stringify(results, null, 2));
    console.log(`Results saved to: ${options.save}`);
  }

  process.exit(allPassed ? 0 : 1);
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
