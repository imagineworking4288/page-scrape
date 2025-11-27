/**
 * Workflows Module Index
 *
 * Exports workflow classes for orchestrating scraping operations.
 */

const ScrapingWorkflow = require('./scraping-workflow');
const ExportWorkflow = require('./export-workflow');

module.exports = {
  ScrapingWorkflow,
  ExportWorkflow
};
