const fs = require('fs');
const pdfParse = require('pdf-parse');

const pdfPath = 'output/pdfs/scrape-2025-11-16-21-05-39.pdf';

if (!fs.existsSync(pdfPath)) {
  console.error(`PDF not found: ${pdfPath}`);
  console.log('Please run the scraper first to generate a PDF.');
  process.exit(1);
}

// Zone-based extraction functions (copied from scraper)
function extractContactsByZone(fullText, uniqueEmails) {
  const contacts = [];
  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let zoneLines = [];
  let zoneEmails = [];
  const zoneMultiplier = 3;

  for (const line of lines) {
    const foundEmail = Array.from(uniqueEmails).find(e => line.includes(e));

    if (foundEmail) {
      zoneEmails.push(foundEmail);
      zoneLines.push(line);

      if (zoneLines.length >= zoneEmails.length * zoneMultiplier) {
        contacts.push(...processZone(zoneLines, zoneEmails));
        zoneLines = [];
        zoneEmails = [];
      }
    } else if (zoneEmails.length > 0) {
      zoneLines.push(line);
    }
  }

  if (zoneEmails.length > 0) {
    contacts.push(...processZone(zoneLines, zoneEmails));
  }

  return contacts;
}

function processZone(zoneLines, emails) {
  const namePattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}$/;
  const names = zoneLines.filter(line => namePattern.test(line) && line.length <= 50);

  return emails.map(email => {
    const name = matchEmailToName(email, names);
    const phone = extractPhoneFromZone(zoneLines);

    return {
      name: name || deriveNameFromEmail(email),
      email,
      phone,
      source: 'zone-based',
      confidence: name ? 'high' : 'medium'
    };
  });
}

function matchEmailToName(email, names) {
  const username = email.split('@')[0];
  const normalized = username.toLowerCase().replace(/[._-]/g, '');

  // Strategy 1: Exact match (marc.achilles → Marc Achilles)
  for (const name of names) {
    const nameNormalized = name.toLowerCase().replace(/[._\s-]/g, '');
    if (nameNormalized === normalized) return name;
  }

  // Strategy 2: Last name match (macevedo → Melody Acevedo)
  if (normalized.length > 3) {
    for (const name of names) {
      const lastWord = name.split(' ').pop().toLowerCase();
      if (normalized.includes(lastWord) || lastWord.includes(normalized)) {
        return name;
      }
    }
  }

  // Strategy 3: First word match (abramsretailstrategies → Abrams Retail Strategies)
  const firstPart = username.split(/[._-]/)[0];
  for (const name of names) {
    const firstWord = name.split(' ')[0].toLowerCase();
    if (firstWord === firstPart.toLowerCase()) {
      return name;
    }
  }

  return null;
}

function deriveNameFromEmail(email) {
  const username = email.split('@')[0];
  const parts = username.split(/[._-]/);

  return parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function extractPhoneFromZone(zoneLines) {
  const phonePattern = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  for (const line of zoneLines) {
    const match = line.match(phonePattern);
    if (match) return match[0];
  }
  return null;
}

// Run the test
const buf = fs.readFileSync(pdfPath);

pdfParse(buf).then(data => {
  const fullText = data.text;

  console.log('=== ZONE-BASED EXTRACTION TEST ===\n');

  // Extract emails first (like the scraper does)
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const allEmails = fullText.match(emailPattern) || [];

  // Filter for business emails (not personal domains)
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
  const uniqueEmails = new Set(
    allEmails
      .map(e => e.toLowerCase())
      .filter(e => !personalDomains.some(d => e.endsWith(d)))
  );

  console.log(`Found ${uniqueEmails.size} unique business emails\n`);

  // Use zone-based extraction
  const contacts = extractContactsByZone(fullText, uniqueEmails);

  console.log(`\n=== ZONE-BASED EXTRACTION RESULTS ===\n`);
  console.log(`Extracted ${contacts.length} contacts:\n`);

  // Target emails we expect to find
  const targetEmails = [
    'marc.achilles@compass.com',
    'macevedo@compass.com',
    'abramsretailstrategies@compass.com',
    'agteam@compass.com',
    'brandon.abelard@compass.com'
  ];

  // Show first 10 contacts
  contacts.slice(0, 10).forEach(contact => {
    const isTarget = targetEmails.some(e => contact.email.toLowerCase() === e.toLowerCase());
    const marker = isTarget ? '✓' : ' ';
    console.log(`${marker} ${contact.name}`);
    console.log(`  Email: ${contact.email}`);
    console.log(`  Phone: ${contact.phone || 'N/A'}`);
    console.log(`  Confidence: ${contact.confidence}\n`);
  });

  console.log(`... (showing 10 of ${contacts.length} total contacts)\n`);

  console.log('\n=== TARGET EMAIL VALIDATION ===\n');

  const expectedMatches = {
    'marc.achilles@compass.com': 'Marc Achilles',
    'macevedo@compass.com': 'Melody Acevedo',
    'abramsretailstrategies@compass.com': 'Abrams Retail Strategies',
    'agteam@compass.com': 'AG Team',
    'brandon.abelard@compass.com': 'Brandon Abelard'
  };

  let passCount = 0;
  let failCount = 0;

  for (const [email, expectedName] of Object.entries(expectedMatches)) {
    const contact = contacts.find(c => c.email.toLowerCase() === email.toLowerCase());
    if (contact) {
      const match = contact.name === expectedName;
      const status = match ? '✓ PASS' : '✗ FAIL';
      console.log(`${status}: ${email}`);
      console.log(`  Expected: ${expectedName}`);
      console.log(`  Got:      ${contact.name}`);

      if (match) {
        passCount++;
      } else {
        failCount++;
        console.log(`  Issue:    Name mismatch`);
      }
      console.log('');
    } else {
      console.log(`✗ MISSING: ${email} (not found in extracted contacts)\n`);
      failCount++;
    }
  }

  console.log('=== TEST SUMMARY ===');
  console.log(`Pass: ${passCount}/${Object.keys(expectedMatches).length}`);
  console.log(`Fail: ${failCount}/${Object.keys(expectedMatches).length}`);
  console.log(`Success Rate: ${((passCount / Object.keys(expectedMatches).length) * 100).toFixed(1)}%`);
}).catch(err => {
  console.error('Error parsing PDF:', err);
});
