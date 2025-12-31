/**
 * Extractors Index
 *
 * Exports all field extraction modules for the cleaning system.
 */

const { EmailExtractor } = require('./email-extractor');
const { PhoneExtractor } = require('./phone-extractor');

module.exports = {
  EmailExtractor,
  PhoneExtractor
};
