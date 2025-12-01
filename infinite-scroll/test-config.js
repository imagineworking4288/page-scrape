/**
 * Test Configuration
 * Defines test cases with expected results for validation
 */

module.exports = {
  tests: [
    {
      name: 'compass-manhattan',
      url: 'https://www.compass.com/agents/new-york/new-york/manhattan/',
      description: 'Compass Manhattan real estate agents (infinite scroll)',
      expectedMin: 80,
      expectedMax: 150,
      minNamesRequired: 60,
      scrollOptions: {
        maxScrolls: 30,
        scrollDelay: 1500,
        limit: null
      }
    },
    {
      name: 'sullivan-cromwell',
      url: 'https://www.sullcrom.com/lawyers',
      description: 'Sullivan & Cromwell lawyers directory (infinite scroll)',
      expectedMin: 40,
      expectedMax: 100,
      minNamesRequired: 30,
      scrollOptions: {
        maxScrolls: 50,
        scrollDelay: 2000,
        limit: null
      },
      notes: 'Emails may be on profile pages only - may need profile visiting'
    }
  ],

  // Global test settings
  settings: {
    timeout: 120000, // 2 minutes per test
    retries: 2,
    browserHeadless: false, // Set to true for CI/CD
    saveScreenshots: true
  }
};
