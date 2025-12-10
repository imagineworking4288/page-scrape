/**
 * Cleaners Index
 *
 * Exports all field cleaning modules for the enrichment system.
 */

const nameCleaner = require('./name-cleaner');
const locationCleaner = require('./location-cleaner');
const titleExtractor = require('./title-extractor');
const noiseDetector = require('./noise-detector');
const LocationPhonePreprocessor = require('./location-phone-preprocessor');

module.exports = {
  // Name cleaner
  cleanName: nameCleaner.cleanName,
  normalizeTitle: nameCleaner.normalizeTitle,
  extractTitleFromName: nameCleaner.extractTitleFromName,
  hasEmbeddedTitle: nameCleaner.hasEmbeddedTitle,
  isValidName: nameCleaner.isValidName,

  // Location cleaner
  cleanLocation: locationCleaner.cleanLocation,
  extractMultipleLocations: locationCleaner.extractMultipleLocations,
  hasPhoneInLocation: locationCleaner.hasPhoneInLocation,
  extractPhoneFromLocation: locationCleaner.extractPhoneFromLocation,
  isValidLocation: locationCleaner.isValidLocation,

  // Title extractor
  extractTitle: titleExtractor.extractTitle,
  extractTitleFromText: titleExtractor.extractTitleFromText,
  normalizeExtractedTitle: titleExtractor.normalizeExtractedTitle,
  looksLikeTitle: titleExtractor.looksLikeTitle,
  titlesMatch: titleExtractor.titlesMatch,
  parseComplexTitle: titleExtractor.parseComplexTitle,

  // Noise detector
  detectNoise: noiseDetector.detectNoise,
  detectCrossFieldDuplicates: noiseDetector.detectCrossFieldDuplicates,
  detectFormattingArtifacts: noiseDetector.detectFormattingArtifacts,
  cleanFormattingArtifacts: noiseDetector.cleanFormattingArtifacts,
  isOnlyNoise: noiseDetector.isOnlyNoise,
  summarizeContactNoise: noiseDetector.summarizeContactNoise,

  // Full modules for advanced use
  nameCleaner,
  locationCleaner,
  titleExtractor,
  noiseDetector,

  // Location-Phone Preprocessor class
  LocationPhonePreprocessor
};
