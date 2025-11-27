/**
 * Test Reporter
 *
 * Generates formatted reports from site test results:
 * - Terminal output with cli-table3
 * - JSON file with complete data
 */

const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');

class TestReporter {
  constructor(options = {}) {
    this.logger = options.logger;
  }

  /**
   * Generate formatted terminal output
   * @param {Object} results - Test results from TestOrchestrator
   */
  generateTerminalOutput(results) {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS SUMMARY                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Metadata section
    this._printSection('METADATA');
    console.log(`  URL:        ${results.metadata.url}`);
    console.log(`  Domain:     ${results.metadata.domain}`);
    console.log(`  Tested at:  ${results.metadata.testedAt}`);
    console.log(`  Duration:   ${results.metadata.testDuration}`);
    console.log('');

    // Pagination section
    this._printSection('PAGINATION');
    if (results.pagination?.skipped) {
      console.log('  Skipped (--no-pagination flag)');
    } else if (results.pagination?.detected) {
      console.log(`  Type:         ${results.pagination.type}`);
      console.log(`  Total Pages:  ${results.pagination.totalPages || 'unknown'}`);
      console.log(`  Confidence:   ${results.pagination.confidence}/100`);
      console.log(`  Detection:    ${results.pagination.detectionMethod || 'N/A'}`);
      console.log(`  Timing:       ${results.pagination.timing}`);
    } else if (results.pagination?.type === 'error') {
      console.log(`  Error: ${results.pagination.error}`);
    } else {
      console.log('  No pagination detected (single page)');
    }
    console.log('');

    // Methods comparison table
    this._printSection('METHOD COMPARISON');
    this._printMethodsTable(results.methods);
    console.log('');

    // Analysis section
    if (results.analysis) {
      this._printSection('ANALYSIS');

      if (results.analysis.bestMethod) {
        console.log(`  Best Method: ${results.analysis.bestMethod.toUpperCase()}`);
      }

      // Method ranking table
      if (results.analysis.methodRanking?.length > 0) {
        console.log('');
        console.log('  Method Ranking:');
        const rankTable = new Table({
          head: ['Rank', 'Method', 'Contacts', 'Completeness', 'Score'],
          colWidths: [8, 12, 12, 15, 10]
        });

        results.analysis.methodRanking.forEach((m, idx) => {
          rankTable.push([
            idx + 1,
            m.method.toUpperCase(),
            m.failed ? 'FAILED' : m.contacts,
            m.failed ? '-' : `${m.completeness}%`,
            m.failed ? '0' : m.score
          ]);
        });

        console.log(rankTable.toString());
      }

      // Recommendations
      if (results.analysis.recommendations?.length > 0) {
        console.log('');
        console.log('  Recommendations:');
        results.analysis.recommendations.forEach(rec => {
          console.log(`    → ${rec}`);
        });
      }

      // Concerns
      if (results.analysis.concerns?.length > 0) {
        console.log('');
        console.log('  Concerns:');
        results.analysis.concerns.forEach(concern => {
          console.log(`    ⚠ ${concern}`);
        });
      }

      // Estimated full scrape
      if (results.analysis.estimatedFullScrape) {
        console.log('');
        console.log('  Estimated Full Scrape:');
        const est = results.analysis.estimatedFullScrape;
        console.log(`    Pages:            ${est.totalPages}`);
        console.log(`    Avg time/page:    ${est.avgTimePerPage}`);
        console.log(`    Total time:       ${est.estimatedTotal}`);
        if (est.estimatedContacts) {
          console.log(`    Est. contacts:    ~${est.estimatedContacts}`);
        }
      }
    }
    console.log('');

    // Sample contacts
    this._printSampleContacts(results);
  }

  /**
   * Print a section header
   * @param {string} title - Section title
   * @private
   */
  _printSection(title) {
    console.log(`┌─ ${title} ${'─'.repeat(60 - title.length)}`);
  }

  /**
   * Print methods comparison table
   * @param {Object} methods - Methods results
   * @private
   */
  _printMethodsTable(methods) {
    const table = new Table({
      head: ['Method', 'Status', 'Contacts', 'Name%', 'Email%', 'Phone%', 'Complete%', 'Time'],
      colWidths: [10, 10, 12, 10, 10, 10, 12, 10]
    });

    for (const [method, data] of Object.entries(methods)) {
      if (data.success) {
        const comp = data.results.completeness;
        table.push([
          method.toUpperCase(),
          '✓ OK',
          data.results.contactCount,
          `${comp.withName}%`,
          `${comp.withEmail}%`,
          `${comp.withPhone}%`,
          `${comp.complete}%`,
          data.timing
        ]);
      } else {
        table.push([
          method.toUpperCase(),
          '✗ FAIL',
          '-',
          '-',
          '-',
          '-',
          '-',
          data.timing || '-'
        ]);
      }
    }

    console.log(table.toString());
  }

  /**
   * Print sample contacts from best method
   * @param {Object} results - Test results
   * @private
   */
  _printSampleContacts(results) {
    const bestMethod = results.analysis?.bestMethod;
    if (!bestMethod) return;

    const methodData = results.methods[bestMethod];
    if (!methodData?.success || !methodData.results?.sample?.length) return;

    this._printSection('SAMPLE CONTACTS');
    console.log(`  (from ${bestMethod.toUpperCase()} method)`);
    console.log('');

    const table = new Table({
      head: ['Name', 'Email', 'Phone', 'Domain'],
      colWidths: [20, 30, 18, 20],
      wordWrap: true
    });

    methodData.results.sample.forEach(contact => {
      table.push([
        contact.name || 'N/A',
        contact.email || 'N/A',
        contact.phone || 'N/A',
        contact.domain || 'N/A'
      ]);
    });

    console.log(table.toString());
  }

  /**
   * Generate JSON file with complete results
   * @param {Object} results - Test results
   * @param {string} outputDir - Output directory
   * @returns {string} - Path to saved file
   */
  generateJsonFile(results, outputDir) {
    // Ensure output directory exists
    const fullPath = path.resolve(outputDir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    // Generate filename from domain and timestamp
    const domain = results.metadata.domain.replace(/[^a-z0-9]/gi, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `site-test-${domain}-${timestamp}.json`;
    const filepath = path.join(fullPath, filename);

    // Create output structure
    const output = {
      metadata: results.metadata,
      pagination: this._sanitizePagination(results.pagination),
      methods: this._sanitizeMethods(results.methods),
      analysis: results.analysis
    };

    // Write file
    fs.writeFileSync(filepath, JSON.stringify(output, null, 2));

    return filepath;
  }

  /**
   * Sanitize pagination data for JSON output
   * @param {Object} pagination - Pagination results
   * @returns {Object} - Sanitized data
   * @private
   */
  _sanitizePagination(pagination) {
    if (!pagination) return null;

    // Remove raw data to reduce file size
    const { raw, ...cleaned } = pagination;
    return cleaned;
  }

  /**
   * Sanitize methods data for JSON output
   * @param {Object} methods - Methods results
   * @returns {Object} - Sanitized data
   * @private
   */
  _sanitizeMethods(methods) {
    const sanitized = {};

    for (const [method, data] of Object.entries(methods)) {
      sanitized[method] = {
        success: data.success,
        method: data.method,
        timing: data.timing,
        configFound: data.configFound,
        error: data.error,
        results: data.results ? {
          contactCount: data.results.contactCount,
          completeness: data.results.completeness,
          domainStats: data.results.domainStats,
          // Include ALL contacts for manual review
          contacts: data.results.contacts
        } : null
      };
    }

    return sanitized;
  }

  /**
   * Generate command suggestion for full scrape
   * @param {Object} results - Test results
   * @returns {string} - Suggested command
   */
  generateSuggestedCommand(results) {
    const parts = ['node orchestrator.js'];
    parts.push(`--url "${results.metadata.url}"`);

    if (results.analysis?.bestMethod) {
      parts.push(`--method ${results.analysis.bestMethod}`);
    }

    if (results.pagination?.detected && results.pagination.totalPages > 1) {
      parts.push('--paginate');
      const maxPages = Math.min(results.pagination.totalPages, 50);
      parts.push(`--max-pages ${maxPages}`);
    }

    return parts.join(' ');
  }
}

module.exports = TestReporter;
