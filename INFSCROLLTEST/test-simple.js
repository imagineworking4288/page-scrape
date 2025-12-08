/**
 * Test the simple scraper against Sullivan & Cromwell
 */

const { scrapeWithScroll, extractLinks } = require('./simple-scraper');

const URL = 'https://www.sullcrom.com/LawyerListing?custom_s_lastname=%2F%5BaA%5D.*%2F&custom_is_office=27567';

async function test() {
  console.log('=== SIMPLE SCRAPER TEST ===');
  console.log('URL:', URL);
  console.log('');

  const result = await scrapeWithScroll(URL, {
    headless: false,          // Set to true to run without browser window
    scrollDelay: 300,         // 300ms between scroll steps
    scrollSize: 500,          // 500px per scroll
    maxScrolls: 500,          // Max scroll attempts
    outputFile: 'simple-output.html'
  });

  console.log('\n=== RESULTS ===');
  console.log('Success:', result.success);
  console.log('Stats:', JSON.stringify(result.stats, null, 2));

  // Count lawyer links
  const lawyerLinks = extractLinks(result.html, '/lawyers/');
  console.log('\n=== LAWYER ANALYSIS ===');
  console.log('Unique lawyer links found:', lawyerLinks.length);

  // Show first 5 links as sample
  if (lawyerLinks.length > 0) {
    console.log('\nSample links (first 5):');
    lawyerLinks.slice(0, 5).forEach(link => console.log('  -', link));
  }

  // Success criteria
  console.log('\n=== SUCCESS CRITERIA ===');
  if (lawyerLinks.length >= 500) {
    console.log(`✅ PASS: Found ${lawyerLinks.length} lawyers (expected 500+)`);
  } else if (lawyerLinks.length >= 400) {
    console.log(`⚠️  PARTIAL: Found ${lawyerLinks.length} lawyers (expected 500+, but close)`);
  } else if (lawyerLinks.length >= 100) {
    console.log(`⚠️  PROGRESS: Found ${lawyerLinks.length} lawyers (better than 44, but not 500+)`);
  } else {
    console.log(`❌ FAIL: Only found ${lawyerLinks.length} lawyers (expected 500+)`);
  }
}

test().catch(console.error);
