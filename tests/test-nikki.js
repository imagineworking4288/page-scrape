const fs = require('fs');
const pdfParse = require('pdf-parse');

const buf = fs.readFileSync('output/pdfs/scrape-2025-11-16-21-05-39.pdf');
pdfParse(buf).then(data => {
  const fullText = data.text;
  const email = 'nikkiadamo@compass.com';

  // Check if "nikki" or "adamo" appear in the document
  const terms = ['nikki', 'adamo', 'ikkiadamo', 'kkiadamo'];

  console.log('Searching for terms near nikkiadamo@compass.com:');
  for (const term of terms) {
    const regex = new RegExp('\\b' + term + '\\b', 'gi');
    let count = 0;
    let match;

    while ((match = regex.exec(fullText)) !== null && count < 2) {
      const pos = match.index;
      const context = fullText.substring(Math.max(0, pos - 50), Math.min(fullText.length, pos + 70));
      console.log(`\n"${term}" at position ${pos}:`);
      console.log('---', context.replace(/\n/g, ' | '));
      count++;
    }

    if (count === 0) {
      console.log(`\nNo matches for "${term}"`);
    }
  }
});
