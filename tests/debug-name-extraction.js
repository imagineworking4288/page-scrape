#!/usr/bin/env node

/**
 * Debug Name Extraction
 * This script analyzes the HTML structure to understand why names aren't being extracted
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function debugNameExtraction(url) {
  console.log('═══════════════════════════════════════');
  console.log('  NAME EXTRACTION DEBUGGER');
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log(`Analyzing: ${url}`);
  console.log('');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  console.log('Page loaded. Analyzing card structure...\n');

  // Get detailed information about the first 3 cards
  const cardAnalysis = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[class*="contact"]')).slice(0, 3);
    
    return cards.map((card, index) => {
      const analysis = {
        cardNumber: index + 1,
        html: card.outerHTML.substring(0, 1000), // First 1000 chars
        allText: card.textContent.trim(),
        
        // Check all possible name locations
        selectors: {
          'h1': card.querySelector('h1')?.textContent?.trim() || null,
          'h2': card.querySelector('h2')?.textContent?.trim() || null,
          'h3': card.querySelector('h3')?.textContent?.trim() || null,
          'h4': card.querySelector('h4')?.textContent?.trim() || null,
          '.name': card.querySelector('.name')?.textContent?.trim() || null,
          '.title': card.querySelector('.title')?.textContent?.trim() || null,
          '[class*="name"]': card.querySelector('[class*="name"]')?.textContent?.trim() || null,
          '[class*="title"]': card.querySelector('[class*="title"]')?.textContent?.trim() || null,
          '[class*="agent"]': card.querySelector('[class*="agent"]')?.textContent?.trim() || null,
          'a[href*="/agent/"]': card.querySelector('a[href*="/agent/"]')?.textContent?.trim() || null,
          'strong': card.querySelector('strong')?.textContent?.trim() || null,
          'b': card.querySelector('b')?.textContent?.trim() || null,
          'span': card.querySelector('span')?.textContent?.trim() || null,
        },
        
        // Get all links
        links: Array.from(card.querySelectorAll('a')).map(a => ({
          text: a.textContent.trim(),
          href: a.href,
          classes: a.className
        })),
        
        // Get all class names in the card
        classes: card.className,
        
        // Get all data attributes
        dataAttributes: Array.from(card.attributes)
          .filter(attr => attr.name.startsWith('data-'))
          .map(attr => ({ name: attr.name, value: attr.value })),
          
        // Get first few text nodes
        textNodes: Array.from(card.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
          .map(node => node.textContent.trim())
          .slice(0, 5)
      };
      
      return analysis;
    });
  });

  // Display the analysis
  console.log('CARD STRUCTURE ANALYSIS:');
  console.log('========================\n');

  cardAnalysis.forEach(card => {
    console.log(`\n--- CARD ${card.cardNumber} ---`);
    console.log(`\nClasses: ${card.classes}`);
    console.log(`\nData Attributes:`);
    card.dataAttributes.forEach(attr => {
      console.log(`  ${attr.name}: ${attr.value}`);
    });
    
    console.log(`\nSelector Results:`);
    Object.entries(card.selectors).forEach(([selector, text]) => {
      if (text) {
        console.log(`  ${selector}: "${text}"`);
      }
    });
    
    console.log(`\nLinks Found:`);
    card.links.forEach(link => {
      console.log(`  Text: "${link.text}"`);
      console.log(`  Href: ${link.href}`);
      console.log(`  Classes: ${link.classes}`);
      console.log(`  ---`);
    });
    
    console.log(`\nText Nodes:`);
    card.textNodes.forEach(text => {
      console.log(`  "${text}"`);
    });
    
    console.log(`\nFirst 500 chars of HTML:`);
    console.log(card.html.substring(0, 500));
    console.log('\n' + '='.repeat(60));
  });

  // Save detailed HTML to file
  const firstCardHTML = await page.evaluate(() => {
    const card = document.querySelector('[class*="contact"]');
    return card ? card.outerHTML : 'No card found';
  });

  fs.writeFileSync('debug-card.html', firstCardHTML);
  console.log('\nFull HTML of first card saved to: debug-card.html');
  console.log('You can open this in a browser to inspect the structure.');

  await browser.close();
}

// Run the debugger
const url = process.argv[2] || 'https://www.compass.com/agents/locations/manhattan-ny/21425/';
debugNameExtraction(url).catch(console.error);
