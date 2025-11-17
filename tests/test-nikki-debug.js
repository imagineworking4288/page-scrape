const fs = require('fs');
const pdfParse = require('pdf-parse');
const SimpleScraper = require('./scrapers/simple-scraper');

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
  const email = 'nikkiadamo@compass.com';

  const context = "Marc AchillesEmily Ackerman | Nikki Adamo ParsonsKayode Adewumi";

  console.log('Context:', context);
  console.log('');

  // Test name regex
  const nameMatch = context.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\b/);
  console.log('Name match result:', nameMatch);

  if (nameMatch) {
    const candidateName = nameMatch[1];
    console.log('Candidate name:', candidateName);

    // Test validation
    const searchTerms = ['nikkiadamo', 'ikkiadamo', 'kkiadamo'];
    const isValid = scraper.isValidSearchCandidate(candidateName, searchTerms);
    console.log('Is valid:', isValid);

    if (isValid) {
      const score = scraper.scoreSearchCandidate(candidateName, searchTerms, context, email);
      console.log('Score:', score);
    }
  }
});
