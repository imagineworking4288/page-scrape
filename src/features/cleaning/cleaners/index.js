/**
 * Cleaners Index
 *
 * Exports all field cleaning modules for the cleaning system.
 */

const { NameCleaner } = require('./name-cleaner');
const { TitleCleaner } = require('./title-cleaner');
const { LocationCleaner } = require('./location-cleaner');

module.exports = {
  NameCleaner,
  TitleCleaner,
  LocationCleaner
};
