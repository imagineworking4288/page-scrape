const fs = require('fs');
const pdfParse = require('pdf-parse');
const SimpleScraper = require('./scrapers/simple-scraper');

// Mock dependencies
const mockBrowserManager = {};
const mockRateLimiter = {};
const mockLogger = {
  info: ()=>{},
  debug: (...args) => console.log('[DEBUG]', ...args),
  warn: ()=>{},
  error: ()=>{}
};

const scraper = new SimpleScraper(mockBrowserManager, mockRateLimiter, mockLogger);

const buf = fs.readFileSync('output/pdfs/scrape-2025-11-16-21-05-39.pdf');
pdfParse(buf).then(data => {
  const fullText = data.text;

  // Test single email
  const testEmail = 'macevedo@compass.com';

  console.log('Testing email:', testEmail);
  console.log('='.repeat(60));

  // Extract search terms
  const prefix = testEmail.split('@')[0];
  const searchTerms = prefix.split(/[._-]+/).filter(t => t.length >= 2);
  console.log('Search terms:', searchTerms);
  console.log('');

  // Search for "acevedo" in document
  const term = 'acevedo';
  const regex = new RegExp(`\\b${term}\\b`, 'gi');
  let match;
  let count = 0;

  console.log(`Searching for "${term}" in document:`);
  while ((match = regex.exec(fullText)) !== null && count < 5) {
    const pos = match.index;
    const start = Math.max(0, pos - 50);
    const end = Math.min(fullText.length, pos + 50);
    const context = fullText.substring(start, end);

    console.log(`\nMatch ${++count} at position ${pos}:`);
    console.log('---', context.replace(/\n/g, ' | '));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Result from searchNameByEmail():');
  const name = scraper.searchNameByEmail(testEmail, fullText);
  console.log('Name:', name || '(null)');
});
