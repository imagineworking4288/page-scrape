/**
 * Test: Compare Different Scroll Configurations
 *
 * Tests different parameter combinations to find optimal settings.
 * Runs multiple configurations and compares results.
 */

const { scrapeWithScroll, extractLinks } = require('./selenium-scraper');

const URL = 'https://www.sullcrom.com/LawyerListing?custom_s_lastname=%2F%5BaA%5D.*%2F&custom_is_office=27567';

// Different configurations to test
const CONFIGS = [
  {
    name: 'Fast (200ms delay, 10 retries)',
    options: { scrollDelay: 200, maxRetries: 10 }
  },
  {
    name: 'Standard (300ms delay, 15 retries)',
    options: { scrollDelay: 300, maxRetries: 15 }
  },
  {
    name: 'Slow (500ms delay, 20 retries)',
    options: { scrollDelay: 500, maxRetries: 20 }
  }
];

async function runConfig(config) {
  console.log(`\nRunning: ${config.name}`);
  console.log('-'.repeat(50));

  const startTime = Date.now();

  const result = await scrapeWithScroll(URL, {
    headless: true,  // Run headless for speed
    verbose: false,  // Quiet mode
    ...config.options
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (result.success) {
    const lawyerLinks = extractLinks(result.html, '/lawyers/');
    return {
      name: config.name,
      lawyers: lawyerLinks.length,
      scrolls: result.stats.scrollCount,
      heightChanges: result.stats.heightChanges,
      time: elapsed,
      success: true
    };
  } else {
    return {
      name: config.name,
      error: result.error,
      success: false
    };
  }
}

async function compareAll() {
  console.log('='.repeat(70));
  console.log('TEST: Compare Scroll Configurations');
  console.log('='.repeat(70));
  console.log('');
  console.log('Testing different scrollDelay and maxRetries combinations');
  console.log('Running in headless mode for faster comparison');
  console.log('');

  const results = [];

  for (const config of CONFIGS) {
    const result = await runConfig(config);
    results.push(result);

    if (result.success) {
      console.log(`  Lawyers: ${result.lawyers}, Scrolls: ${result.scrolls}, Time: ${result.time}s`);
    } else {
      console.log(`  Error: ${result.error}`);
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('COMPARISON SUMMARY');
  console.log('='.repeat(70));
  console.log('');

  // Table header
  console.log('| Configuration                    | Lawyers | Scrolls | Height Ch. | Time   |');
  console.log('|----------------------------------|---------|---------|------------|--------|');

  // Table rows
  for (const r of results) {
    if (r.success) {
      const name = r.name.padEnd(32);
      const lawyers = String(r.lawyers).padStart(7);
      const scrolls = String(r.scrolls).padStart(7);
      const changes = String(r.heightChanges).padStart(10);
      const time = (r.time + 's').padStart(6);
      console.log(`| ${name} | ${lawyers} | ${scrolls} | ${changes} | ${time} |`);
    } else {
      const name = r.name.padEnd(32);
      console.log(`| ${name} | FAILED  |         |            |        |`);
    }
  }

  console.log('');

  // Find best configuration
  const successful = results.filter(r => r.success);
  if (successful.length > 0) {
    const best = successful.reduce((a, b) => a.lawyers > b.lawyers ? a : b);
    console.log(`Best configuration: ${best.name}`);
    console.log(`  Found ${best.lawyers} lawyers in ${best.time}s with ${best.scrolls} scrolls`);
  }

  console.log('');
  console.log('='.repeat(70));
}

// Check if user wants to run a single quick test instead
const args = process.argv.slice(2);
if (args.includes('--quick')) {
  console.log('Running quick single test (Standard configuration)...\n');
  runConfig(CONFIGS[1]).then(result => {
    if (result.success) {
      console.log(`\nResult: ${result.lawyers} lawyers found in ${result.time}s`);
    } else {
      console.log(`\nError: ${result.error}`);
    }
  });
} else {
  compareAll().catch(console.error);
}
