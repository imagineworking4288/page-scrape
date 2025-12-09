/**
 * Enrichment Module Index
 *
 * Exports all enrichment components for the profile enrichment system.
 */

const ProfileEnricher = require('./profile-enricher');
const ProfileExtractor = require('./profile-extractor');
const fieldComparator = require('./field-comparator');
const reportGenerator = require('./report-generator');
const cleaners = require('./cleaners');

module.exports = {
  // Main orchestrator
  ProfileEnricher,

  // Profile extraction
  ProfileExtractor,

  // Field comparison
  FieldComparator: fieldComparator,
  compareAndMerge: fieldComparator.compareAndMerge,
  compareAllFields: fieldComparator.compareAllFields,
  applyComparisons: fieldComparator.applyComparisons,

  // Report generation
  reportGenerator,
  generateReport: reportGenerator.generateReport,
  saveReport: reportGenerator.saveReport,
  printReport: reportGenerator.printReport,

  // Cleaners
  cleaners,
  cleanName: cleaners.cleanName,
  cleanLocation: cleaners.cleanLocation,
  extractTitle: cleaners.extractTitle,
  detectNoise: cleaners.detectNoise,

  // Cleaner modules
  nameCleaner: cleaners.nameCleaner,
  locationCleaner: cleaners.locationCleaner,
  titleExtractor: cleaners.titleExtractor,
  noiseDetector: cleaners.noiseDetector
};
