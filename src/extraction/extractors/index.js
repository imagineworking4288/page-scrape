/**
 * Extractors Index - Individual field extractors for v2.3
 *
 * Each extractor handles a specific extraction method:
 * - EmailExtractor: mailto links and regex patterns
 * - PhoneExtractor: tel links and regex patterns
 * - LinkExtractor: href links and data attributes
 * - LabelExtractor: Label: Value pattern detection
 * - ScreenshotExtractor: OCR-based extraction using Tesseract.js
 * - CoordinateExtractor: DOM text extraction at coordinates
 */

module.exports = {
  EmailExtractor: require('./email-extractor'),
  PhoneExtractor: require('./phone-extractor'),
  LinkExtractor: require('./link-extractor'),
  LabelExtractor: require('./label-extractor'),
  ScreenshotExtractor: require('./screenshot-extractor'),
  CoordinateExtractor: require('./coordinate-extractor')
};
