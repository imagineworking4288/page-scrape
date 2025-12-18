/**
 * Stats Reporter Utility
 *
 * Extracted from orchestrator.js to reduce bloat.
 * Handles all domain statistics and table formatting.
 */

const Table = require('cli-table3');

/**
 * Log scraping statistics
 * @param {Array} contacts - Processed contacts array
 * @param {Object} logger - Logger instance
 * @param {Object} context - Optional context with pagination info
 */
function logScrapingStats(contacts, logger, context = {}) {
  logger.info('');
  logger.info('═══════════════════════════════════════');
  logger.info('  SCRAPING COMPLETE');
  logger.info('═══════════════════════════════════════');

  const stats = {
    'Total Contacts': contacts.length,
    'With Email': contacts.filter(c => c.email).length,
    'With Phone': contacts.filter(c => c.phone).length,
    'With Both': contacts.filter(c => c.email && c.phone).length,
    'Complete (Name+Email+Phone)': contacts.filter(c => c.name && c.email && c.phone).length,
    'High Confidence': contacts.filter(c => c.confidence === 'high').length,
    'Medium Confidence': contacts.filter(c => c.confidence === 'medium').length,
    'Low Confidence': contacts.filter(c => c.confidence === 'low').length,
    'From HTML': contacts.filter(c => c.source === 'html').length,
    'From PDF': contacts.filter(c => c.source === 'pdf').length,
    'Merged': contacts.filter(c => c.source === 'merged').length
  };

  // Add pagination stats if applicable
  if (context.paginationEnabled && context.pageUrls?.length > 1) {
    stats['Pages Scraped'] = context.pageUrls.length;
    stats['Total Extracted'] = context.allContacts?.length || contacts.length;
    stats['Duplicates Removed'] = (context.allContacts?.length || contacts.length) - contacts.length;
  }

  logger.logStats(stats);
  logger.info('');
}

/**
 * Log domain analysis statistics and tables
 * @param {Array} contacts - Processed contacts array
 * @param {Object} domainExtractor - DomainExtractor instance
 * @param {Object} logger - Logger instance
 */
function logDomainStats(contacts, domainExtractor, logger) {
  logger.info('Analyzing domain distribution...');
  const domainStats = domainExtractor.getDomainStats(contacts);

  logger.info('═══════════════════════════════════════');
  logger.info('  DOMAIN ANALYSIS');
  logger.info('═══════════════════════════════════════');
  logger.logStats({
    'Unique Domains': domainStats.uniqueDomains,
    'Business Domains': domainStats.businessDomains,
    'Business Emails': domainStats.businessEmailCount,
    'Personal Emails': domainStats.personalEmailCount,
    'Business Email %': domainStats.withEmail > 0
      ? `${((domainStats.businessEmailCount / domainStats.withEmail) * 100).toFixed(1)}%`
      : '0.0%'
  });
  logger.info('');

  // Display top domains table
  if (domainStats.topDomains.length > 0) {
    logger.info('Top Domains (all):');
    const domainTable = new Table({
      head: ['Domain', 'Count', '%', 'Type'],
      colWidths: [35, 10, 10, 12],
      wordWrap: true
    });

    domainStats.topDomains.slice(0, 5).forEach(item => {
      const isBusiness = domainExtractor.isBusinessDomain(item.domain);
      domainTable.push([
        item.domain,
        item.count,
        item.percentage + '%',
        isBusiness ? 'Business' : 'Personal'
      ]);
    });

    console.log(domainTable.toString());
    logger.info('');
  }

  // Display top business domains table
  if (domainStats.topBusinessDomains.length > 0) {
    logger.info('Top Business Domains:');
    const businessDomainTable = new Table({
      head: ['Domain', 'Count', '% of Business'],
      colWidths: [40, 10, 18],
      wordWrap: true
    });

    domainStats.topBusinessDomains.slice(0, 5).forEach(item => {
      businessDomainTable.push([
        item.domain,
        item.count,
        item.percentage + '%'
      ]);
    });

    console.log(businessDomainTable.toString());
    logger.info('');
  }

  return domainStats;
}

/**
 * Log sample contacts table
 * @param {Array} contacts - Processed contacts array
 * @param {Object} logger - Logger instance
 * @param {number} limit - Number of contacts to show (default 5)
 */
function logSampleContacts(contacts, logger, limit = 5) {
  if (contacts.length === 0) return;

  logger.info(`Sample Contacts (first ${limit}):`);
  const table = new Table({
    head: ['Name', 'Email', 'Phone', 'Domain', 'Type'],
    colWidths: [20, 25, 18, 20, 10],
    wordWrap: true
  });

  contacts.slice(0, limit).forEach(contact => {
    table.push([
      contact.name || 'N/A',
      contact.email || 'N/A',
      contact.phone || 'N/A',
      contact.domain || 'N/A',
      contact.domainType || 'N/A'
    ]);
  });

  console.log(table.toString());
  logger.info('');
}

module.exports = {
  logScrapingStats,
  logDomainStats,
  logSampleContacts
};
