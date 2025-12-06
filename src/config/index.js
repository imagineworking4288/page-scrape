/**
 * Config Module - Configuration management for page-scrape
 *
 * Exports:
 * - ConfigLoader: Load and validate site-specific configs
 * - Schema definitions and utilities for v2.3 configs
 */

const ConfigLoader = require('./config-loader');
const schemas = require('./schemas');

module.exports = {
  // Config loading
  ConfigLoader,

  // Schema definitions
  FIELD_SCHEMA_V23: schemas.FIELD_SCHEMA_V23,
  CONFIG_SCHEMA_V23: schemas.CONFIG_SCHEMA_V23,
  EXTRACTION_METHOD_RESULT: schemas.EXTRACTION_METHOD_RESULT,
  FAILED_METHOD_RESULT: schemas.FAILED_METHOD_RESULT,

  // Field metadata
  FIELD_METADATA: schemas.FIELD_METADATA,
  EXTRACTION_METHODS: schemas.EXTRACTION_METHODS,

  // Constants
  FIELD_ORDER: schemas.FIELD_ORDER,
  REQUIRED_FIELDS: schemas.REQUIRED_FIELDS,
  OPTIONAL_FIELDS: schemas.OPTIONAL_FIELDS,

  // Factory functions
  createFieldSchema: schemas.createFieldSchema,
  createConfigV23: schemas.createConfigV23,

  // Validation
  validateConfigV23: schemas.validateConfigV23,
  isV23Config: schemas.isV23Config
};
