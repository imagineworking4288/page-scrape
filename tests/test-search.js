const fs = require('fs');
const pdfParse = require('pdf-parse');

const buf = fs.readFileSync('output/pdfs/scrape-2025-11-16-21-05-39.pdf');
pdfParse(buf).then(data => {
  const fullText = data.text;

  const testEmails = [
    'macevedo@compass.com',
    'nikkiadamo@compass.com',
    'brandon.abelard@compass.com'
  ];

  for (const email of testEmails) {
    const pos = fullText.toLowerCase().indexOf(email.toLowerCase());
    if (pos !== -1) {
      const start = Math.max(0, pos - 100);
      const end = Math.min(fullText.length, pos + 100);
      const context = fullText.substring(start, end);
      console.log('Context for:', email);
      console.log('---', context.replace(/\n/g, ' | '));
      console.log('');
    }
  }
});
