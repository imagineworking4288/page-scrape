const fs = require('fs');
const pdfParse = require('pdf-parse');

const buf = fs.readFileSync('output/pdfs/scrape-2025-11-16-21-05-39.pdf');
pdfParse(buf).then(data => {
  const fullText = data.text;
  const testEmail = 'macevedo@compass.com';

  console.log('Testing email:', testEmail);
  console.log('='.repeat(60));

  // Extract search terms (mimicking searchNameByEmail)
  const prefix = testEmail.split('@')[0].toLowerCase();
  const searchTerms = prefix.split(/[._-]+/).filter(term => term.length >= 2);

  console.log('Prefix:', prefix);
  console.log('Search terms:', searchTerms);
  console.log('');

  // The search term is "macevedo" (no delimiters)
  // Search for "macevedo" in document
  for (const term of searchTerms) {
    console.log(`\nSearching for term: "${term}"`);
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    let match;
    let count = 0;

    while ((match = regex.exec(fullText)) !== null && count < 3) {
      const pos = match.index;
      const start = Math.max(0, pos - 50);
      const end = Math.min(fullText.length, pos + 50);
      const context = fullText.substring(start, end);

      console.log(`  Match ${++count} at position ${pos}:`);
      console.log('  ---', context.replace(/\n/g, ' | '));
    }

    if (count === 0) {
      console.log('  No matches found.');
      console.log('  Trying partial match search for "acevedo"...');

      const partialRegex = new RegExp(`\\bacevedo\\b`, 'gi');
      let partialMatch;
      let partialCount = 0;

      while ((partialMatch = partialRegex.exec(fullText)) !== null && partialCount < 3) {
        const pos = partialMatch.index;
        const start = Math.max(0, pos - 50);
        const end = Math.min(fullText.length, pos + 50);
        const context = fullText.substring(start, end);

        console.log(`  Partial match ${++partialCount} at position ${pos}:`);
        console.log('  ---', context.replace(/\n/g, ' | '));
      }
    }
  }
});
