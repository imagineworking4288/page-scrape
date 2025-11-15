#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const UniversalScraper = require('../scrapers/universal-pdf-scraper');

class OutputAnalyzer {
  constructor(logger) {
    this.logger = logger;
  }

  async analyzeUrl(url, headless = true) {
    let browserManager = null;

    try {
      browserManager = new BrowserManager(this.logger);
      await browserManager.launch(headless);

      const rateLimiter = new RateLimiter(this.logger);
      const scraper = new UniversalScraper(browserManager, rateLimiter, this.logger);

      await browserManager.navigate(url);
      const page = browserManager.getPage();

      const contacts = await scraper.scrape(url, null);
      const coverage = this.analyzeCoverage(contacts);

      const cardSelector = await scraper.detectCardPattern(page);
      const discoveries = await this.discoverFields(page, cardSelector);

      this.displayConsoleReport(coverage, discoveries);
      this.generateHtmlReport(url, coverage, discoveries);

      await browserManager.close();

      return { coverage, discoveries };
    } catch (error) {
      this.logger.error(`Analysis failed: ${error.message}`);
      if (browserManager) await browserManager.close();
      throw error;
    }
  }

  analyzeCoverage(contacts) {
    const total = contacts.length;
    return {
      total,
      name: contacts.filter(c => c.name).length,
      email: contacts.filter(c => c.email).length,
      phone: contacts.filter(c => c.phone).length,
      profileUrl: contacts.filter(c => c.profileUrl).length,
      complete: contacts.filter(c => c.name && c.email && c.phone && c.profileUrl).length
    };
  }

  async discoverFields(page, cardSelector) {
    if (!cardSelector) cardSelector = 'body';

    return await page.evaluate((selector) => {
      const cards = document.querySelectorAll(selector);
      const total = cards.length;

      const fields = {
        title: { count: 0, examples: [], selectors: [] },
        company: { count: 0, examples: [], selectors: [] },
        linkedin: { count: 0, examples: [], selectors: [] },
        facebook: { count: 0, examples: [], selectors: [] },
        instagram: { count: 0, examples: [], selectors: [] },
        twitter: { count: 0, examples: [], selectors: [] },
        website: { count: 0, examples: [], selectors: [] },
        bio: { count: 0, examples: [], selectors: [] }
      };

      cards.forEach(card => {
        // Title
        const titleSels = ['.title', '.role', '[class*="title"]', 'h4'];
        for (const sel of titleSels) {
          const el = card.querySelector(sel);
          if (el && /agent|broker|realtor/i.test(el.textContent)) {
            fields.title.count++;
            if (fields.title.examples.length < 3) {
              fields.title.examples.push(el.textContent.trim());
              fields.title.selectors.push(sel);
            }
            break;
          }
        }

        // Company
        const companySels = ['.company', '.brokerage', '[class*="brokerage"]'];
        for (const sel of companySels) {
          const el = card.querySelector(sel);
          if (el) {
            fields.company.count++;
            if (fields.company.examples.length < 3) {
              fields.company.examples.push(el.textContent.trim());
              fields.company.selectors.push(sel);
            }
            break;
          }
        }

        // Social media
        card.querySelectorAll('a[href]').forEach(a => {
          const href = a.href.toLowerCase();
          if (href.includes('linkedin.com') && fields.linkedin.examples.length < 3) {
            fields.linkedin.count++;
            fields.linkedin.examples.push(a.href);
          }
          if (href.includes('facebook.com') && fields.facebook.examples.length < 3) {
            fields.facebook.count++;
            fields.facebook.examples.push(a.href);
          }
          if (href.includes('instagram.com') && fields.instagram.examples.length < 3) {
            fields.instagram.count++;
            fields.instagram.examples.push(a.href);
          }
          if ((href.includes('twitter.com') || href.includes('x.com')) && fields.twitter.examples.length < 3) {
            fields.twitter.count++;
            fields.twitter.examples.push(a.href);
          }
        });

        // Bio
        const bioSels = ['.bio', '.description', 'p'];
        for (const sel of bioSels) {
          const el = card.querySelector(sel);
          if (el && el.textContent.length > 100) {
            fields.bio.count++;
            if (fields.bio.examples.length < 3) {
              fields.bio.examples.push(el.textContent.trim().substring(0, 100) + '...');
              fields.bio.selectors.push(sel);
            }
            break;
          }
        }
      });

      return { total, fields };
    }, cardSelector);
  }

  displayConsoleReport(coverage, discoveries) {
    console.log('\n═══════════════════════════════════════');
    console.log('  EXTRACTION ANALYSIS');
    console.log('═══════════════════════════════════════\n');

    console.log('Current Extraction Coverage:');
    console.log(`  Name:       ${coverage.name}/${coverage.total} (${((coverage.name/coverage.total)*100).toFixed(1)}%)`);
    console.log(`  Email:      ${coverage.email}/${coverage.total} (${((coverage.email/coverage.total)*100).toFixed(1)}%)`);
    console.log(`  Phone:      ${coverage.phone}/${coverage.total} (${((coverage.phone/coverage.total)*100).toFixed(1)}%)`);
    console.log(`  ProfileUrl: ${coverage.profileUrl}/${coverage.total} (${((coverage.profileUrl/coverage.total)*100).toFixed(1)}%)`);
    console.log(`  Complete:   ${coverage.complete}/${coverage.total} (${((coverage.complete/coverage.total)*100).toFixed(1)}%)`);

    console.log('\nAvailable Fields (Not Currently Extracted):');
    Object.entries(discoveries.fields).forEach(([field, data]) => {
      if (data.count > 0) {
        const pct = ((data.count / discoveries.total) * 100).toFixed(1);
        console.log(`\n  ${field}: ${data.count}/${discoveries.total} (${pct}% available)`);
        if (data.examples.length > 0) {
          console.log(`    Examples: ${data.examples.slice(0, 2).join(', ')}`);
        }
        if (data.selectors.length > 0) {
          console.log(`    Selectors: ${[...new Set(data.selectors)].join(', ')}`);
        }
      }
    });

    console.log('\n═══════════════════════════════════════\n');
  }

  generateHtmlReport(url, coverage, discoveries) {
    const timestamp = new Date().toISOString();
    const outputPath = path.join('output', 'analysis-report.html');

    if (!fs.existsSync('output')) {
      fs.mkdirSync('output', { recursive: true });
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Extraction Analysis Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
    .meta { color: #666; margin-bottom: 30px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .high { color: green; font-weight: bold; }
    .medium { color: orange; font-weight: bold; }
    .low { color: red; font-weight: bold; }
    .section { margin: 40px 0; }
    .pattern { font-family: monospace; background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Extraction Analysis Report</h1>
    <div class="meta">
      <p><strong>Generated:</strong> ${timestamp}</p>
      <p><strong>URL:</strong> ${url}</p>
      <p><strong>Total Contacts:</strong> ${coverage.total}</p>
    </div>

    <div class="section">
      <h2>Current Extraction Coverage</h2>
      <table>
        <tr><th>Field</th><th>Extracted</th><th>Coverage</th><th>Status</th></tr>
        <tr>
          <td>Name</td>
          <td>${coverage.name}/${coverage.total}</td>
          <td>${((coverage.name/coverage.total)*100).toFixed(1)}%</td>
          <td class="${coverage.name/coverage.total >= 0.85 ? 'high' : coverage.name/coverage.total >= 0.7 ? 'medium' : 'low'}">
            ${coverage.name/coverage.total >= 0.85 ? 'Excellent' : coverage.name/coverage.total >= 0.7 ? 'Good' : 'Needs Improvement'}
          </td>
        </tr>
        <tr>
          <td>Email</td>
          <td>${coverage.email}/${coverage.total}</td>
          <td>${((coverage.email/coverage.total)*100).toFixed(1)}%</td>
          <td class="${coverage.email/coverage.total >= 0.95 ? 'high' : coverage.email/coverage.total >= 0.8 ? 'medium' : 'low'}">
            ${coverage.email/coverage.total >= 0.95 ? 'Excellent' : coverage.email/coverage.total >= 0.8 ? 'Good' : 'Needs Improvement'}
          </td>
        </tr>
        <tr>
          <td>Phone</td>
          <td>${coverage.phone}/${coverage.total}</td>
          <td>${((coverage.phone/coverage.total)*100).toFixed(1)}%</td>
          <td class="${coverage.phone/coverage.total >= 0.8 ? 'high' : coverage.phone/coverage.total >= 0.6 ? 'medium' : 'low'}">
            ${coverage.phone/coverage.total >= 0.8 ? 'Excellent' : coverage.phone/coverage.total >= 0.6 ? 'Good' : 'Needs Improvement'}
          </td>
        </tr>
        <tr>
          <td>Profile URL</td>
          <td>${coverage.profileUrl}/${coverage.total}</td>
          <td>${((coverage.profileUrl/coverage.total)*100).toFixed(1)}%</td>
          <td class="${coverage.profileUrl/coverage.total >= 0.95 ? 'high' : coverage.profileUrl/coverage.total >= 0.7 ? 'medium' : 'low'}">
            ${coverage.profileUrl/coverage.total >= 0.95 ? 'Excellent' : coverage.profileUrl/coverage.total >= 0.7 ? 'Good' : 'Needs Improvement'}
          </td>
        </tr>
        <tr style="background-color: #e8f5e9;">
          <td><strong>Complete Records</strong></td>
          <td><strong>${coverage.complete}/${coverage.total}</strong></td>
          <td><strong>${((coverage.complete/coverage.total)*100).toFixed(1)}%</strong></td>
          <td class="${coverage.complete/coverage.total >= 0.7 ? 'high' : coverage.complete/coverage.total >= 0.5 ? 'medium' : 'low'}">
            <strong>${coverage.complete/coverage.total >= 0.7 ? 'Excellent' : coverage.complete/coverage.total >= 0.5 ? 'Good' : 'Needs Improvement'}</strong>
          </td>
        </tr>
      </table>
    </div>

    <div class="section">
      <h2>Discovered Fields (Available but Not Extracted)</h2>
      <table>
        <tr><th>Field</th><th>Availability</th><th>Coverage</th><th>Examples</th><th>Extraction Patterns</th></tr>
        ${Object.entries(discoveries.fields).map(([field, data]) => {
          if (data.count === 0) return '';
          const pct = ((data.count / discoveries.total) * 100).toFixed(1);
          return `<tr>
            <td><strong>${field.charAt(0).toUpperCase() + field.slice(1)}</strong></td>
            <td>${data.count}/${discoveries.total}</td>
            <td>${pct}%</td>
            <td style="font-style: italic;">${data.examples.slice(0, 2).join('<br>')}</td>
            <td>${[...new Set(data.selectors)].map(s => `<span class="pattern">${s}</span>`).join(', ')}</td>
          </tr>`;
        }).join('')}
      </table>
    </div>
  </div>
</body>
</html>`;

    fs.writeFileSync(outputPath, html);
    this.logger.info(`HTML report saved to: ${outputPath}`);
  }

  async analyzeFile(filePath) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const contacts = data.contacts || data;

      const coverage = this.analyzeCoverage(contacts);

      console.log('\n═══════════════════════════════════════');
      console.log('  FILE ANALYSIS');
      console.log('═══════════════════════════════════════\n');
      console.log(`File: ${filePath}\n`);

      console.log('Extraction Coverage:');
      console.log(`  Name:       ${coverage.name}/${coverage.total} (${((coverage.name/coverage.total)*100).toFixed(1)}%)`);
      console.log(`  Email:      ${coverage.email}/${coverage.total} (${((coverage.email/coverage.total)*100).toFixed(1)}%)`);
      console.log(`  Phone:      ${coverage.phone}/${coverage.total} (${((coverage.phone/coverage.total)*100).toFixed(1)}%)`);
      console.log(`  ProfileUrl: ${coverage.profileUrl}/${coverage.total} (${((coverage.profileUrl/coverage.total)*100).toFixed(1)}%)`);
      console.log(`  Complete:   ${coverage.complete}/${coverage.total} (${((coverage.complete/coverage.total)*100).toFixed(1)}%)`);
      console.log('\n═══════════════════════════════════════\n');

      return coverage;
    } catch (error) {
      this.logger.error(`Failed to analyze file: ${error.message}`);
      throw error;
    }
  }
}

// CLI
const program = new Command();
program
  .option('-u, --url <url>', 'Analyze live URL')
  .option('-f, --file <path>', 'Analyze existing JSON file')
  .option('--headless [value]', 'Headless mode (default: true)', 'true')
  .parse(process.argv);

const options = program.opts();

async function main() {
  const analyzer = new OutputAnalyzer(logger);

  if (options.url) {
    const headless = options.headless === 'false' ? false : true;
    await analyzer.analyzeUrl(options.url, headless);
  }

  if (options.file) {
    await analyzer.analyzeFile(options.file);
  }

  if (!options.url && !options.file) {
    console.log('Error: Must provide --url or --file');
    console.log('Usage:');
    console.log('  node tests/output-analyzer.js --url "https://example.com"');
    console.log('  node tests/output-analyzer.js --file output/contacts.json');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Analysis failed:', error);
  process.exit(1);
});
