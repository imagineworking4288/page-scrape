/**
 * Post-Cleaners Index
 *
 * Exports all post-enrichment cleaning modules.
 */

const FieldCleaner = require('./field-cleaner');
const MultiLocationHandler = require('./multi-location-handler');
const PhoneLocationCorrelator = require('./phone-location-correlator');
const LocationNormalizer = require('./location-normalizer');
const DomainClassifier = require('./domain-classifier');
const ConfidenceScorer = require('./confidence-scorer');

module.exports = {
  FieldCleaner,
  MultiLocationHandler,
  PhoneLocationCorrelator,
  LocationNormalizer,
  DomainClassifier,
  ConfidenceScorer
};
