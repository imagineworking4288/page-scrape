/**
 * Test Configuration
 * Defines test cases with expected results for validation
 *
 * Updated: Removed Compass (requires authentication), focused on Sullivan & Cromwell
 */

module.exports = {
  tests: [
    {
      name: 'sullivan-cromwell-lawyers',
      url: 'https://www.sullcrom.com/lawyers',
      description: 'Sullivan & Cromwell lawyers directory - uses "Email" link text pattern',
      expectedMin: 50,
      expectedMax: 300,
      minNamesRequired: 40,
      scrollOptions: {
        maxScrolls: 60,
        scrollDelay: 2000,
        noChangeThreshold: 3,
        limit: null
      },
      // Sullivan & Cromwell uses "Email" text links with mailto: href
      // Universal extraction handles this via Strategy 0 (email-link-text)
      extractionNotes: 'Emails extracted via <a> links with text "Email" containing mailto: hrefs'
    }
  ],

  // Global test settings
  settings: {
    timeout: 180000, // 3 minutes per test (increased for large directories)
    retries: 2,
    browserHeadless: false, // Set to true for CI/CD
    saveScreenshots: true,
    debugMode: false // Set to true for verbose logging
  }
};
