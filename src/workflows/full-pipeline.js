/**
 * Full Pipeline Orchestrator
 *
 * Chains all stages of the scraping workflow:
 * 1. Config Check/Generation
 * 2. Scraping
 * 3. Enrichment
 * 4. Google Sheets Export
 *
 * Features:
 * - Confirmation prompts between stages (skippable with --auto)
 * - Config generator integration with file watching
 * - Graceful error handling with partial result saving
 * - Progress tracking and statistics
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logger = require('../core/logger');
const BrowserManager = require('../core/browser-manager');
const { SeleniumManager } = require('../core');
const RateLimiter = require('../core/rate-limiter');
const ConfigLoader = require('../config/config-loader');
const ProfileEnricher = require('../features/enrichment/profile-enricher');
const { FieldCleaner } = require('../features/enrichment/post-cleaners');
const { SheetExporter } = require('../features/export');

const {
  confirmYesNo,
  confirmOptions,
  displayStageHeader,
  displayStageSummary,
  displaySuccess,
  displayError,
  displayWarning,
  displayInfo,
  displayContactsTable,
  displayCompletionSummary,
  countdown
} = require('../utils/prompt-helper');

class FullPipelineOrchestrator {
  constructor(options = {}) {
    this.options = {
      url: options.url,
      limit: options.limit || 0,
      autoMode: options.auto || options.autoMode || false,
      skipConfigGen: options.skipConfigGen || false,
      noEnrich: options.noEnrich || false,
      noExport: options.noExport || false,
      headless: options.headless !== false,
      verbose: options.verbose || false,
      delay: options.delay || 3000,
      ...options
    };

    this.browserManager = null;
    this.seleniumManager = null;
    this.configPath = null;
    this.config = null;
    this.scrapedDataPath = null;
    this.enrichedDataPath = null;
    this.contacts = [];
    this.enrichedContacts = [];
    this.sheetUrl = null;
    this.startTime = Date.now();

    // Extract domain from URL
    this.domain = this.extractDomain(this.options.url);
  }

  /**
   * Extract domain from URL
   * @param {string} url - URL to extract domain from
   * @returns {string} - Domain name
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  /**
   * Main execution method
   */
  async run() {
    try {
      displayStageHeader('FULL PIPELINE ORCHESTRATOR');

      displayInfo(`Target URL: ${this.options.url}`);
      displayInfo(`Domain: ${this.domain}`);
      displayInfo(`Limit: ${this.options.limit || 'none'}`);
      displayInfo(`Auto mode: ${this.options.autoMode ? 'yes' : 'no'}`);
      displayInfo(`Headless: ${this.options.headless ? 'yes' : 'no'}`);
      console.log('');

      // Stage 1: Config Check/Generation
      await this.stageConfigCheck();

      // Confirm before scraping
      if (!await this.confirmProceedToScraping()) {
        displayInfo('Pipeline cancelled at scraping stage');
        return this.buildResult(false, 'Cancelled at scraping stage');
      }

      // Stage 2: Scraping
      await this.stageScraping();

      // If no contacts, stop here
      if (this.contacts.length === 0) {
        displayWarning('No contacts scraped. Pipeline stopping.');
        return this.buildResult(false, 'No contacts scraped');
      }

      // Confirm before enrichment (if not skipping)
      if (!this.options.noEnrich) {
        if (!await this.confirmProceedToEnrichment()) {
          displayInfo('Pipeline completed without enrichment');
          return this.buildResult(true, 'Completed without enrichment');
        }

        // Stage 3: Enrichment
        await this.stageEnrichment();
      }

      // Confirm before export (if not skipping)
      if (!this.options.noExport) {
        if (!await this.confirmProceedToExport()) {
          displayInfo('Pipeline completed without export');
          return this.buildResult(true, 'Completed without export');
        }

        // Stage 4: Export
        await this.stageExport();
      }

      // Final summary
      await this.displayCompletion();

      return this.buildResult(true, 'Pipeline completed successfully');

    } catch (error) {
      displayError(`Pipeline failed: ${error.message}`);
      if (this.options.verbose) {
        console.log(error.stack);
      }

      // Save partial results if any
      await this.savePartialResults();

      return this.buildResult(false, error.message);

    } finally {
      await this.cleanup();
    }
  }

  /**
   * Stage 1: Config Check/Generation
   */
  async stageConfigCheck() {
    displayStageHeader('STAGE 1: CONFIG CHECK');

    const configLoader = new ConfigLoader(logger);

    // Check for existing config
    const configFileName = `${this.domain.replace(/\./g, '-')}.json`;
    const configPath = path.join(
      __dirname, '..', '..', 'configs', 'website-configs', configFileName
    );

    // Also check with dots
    const configPathDots = path.join(
      __dirname, '..', '..', 'configs', 'website-configs', `${this.domain}.json`
    );

    let existingConfigPath = null;
    if (fs.existsSync(configPath)) {
      existingConfigPath = configPath;
    } else if (fs.existsSync(configPathDots)) {
      existingConfigPath = configPathDots;
    }

    if (existingConfigPath) {
      displaySuccess(`Found existing config: ${path.basename(existingConfigPath)}`);

      // Load and display config info
      const configContent = fs.readFileSync(existingConfigPath, 'utf8');
      this.config = JSON.parse(configContent);

      displayStageSummary({
        'Version': this.config.version || 'N/A',
        'Created': this.config.generatedAt ? new Date(this.config.generatedAt).toLocaleDateString() : 'N/A',
        'Pagination': this.config.pagination?.paginationType || this.config.pagination?.type || 'single-page'
      }, 'Config Info:');

      console.log('');

      // Ask what to do with existing config (unless auto mode or skipConfigGen)
      if (!this.options.autoMode && !this.options.skipConfigGen) {
        const choice = await confirmOptions(
          'Config found. What would you like to do?',
          ['use existing', 'regenerate', 'cancel']
        );

        if (choice === 'cancel') {
          throw new Error('User cancelled');
        }

        if (choice === 'regenerate') {
          await this.runConfigGenerator();
          // Reload config after regeneration
          const newContent = fs.readFileSync(existingConfigPath, 'utf8');
          this.config = JSON.parse(newContent);
        }
      }

      this.configPath = existingConfigPath;

    } else {
      // No config found
      displayWarning(`No config found for: ${this.domain}`);
      console.log('');

      if (this.options.skipConfigGen) {
        throw new Error(`Config not found and --skip-config-gen specified. Run config generator first.`);
      }

      displayInfo('Launching visual config generator...');
      displayInfo('Follow the on-screen instructions in the browser window.');
      console.log('');

      await this.runConfigGenerator();

      // Check if config was created
      if (fs.existsSync(configPath)) {
        existingConfigPath = configPath;
      } else if (fs.existsSync(configPathDots)) {
        existingConfigPath = configPathDots;
      }

      if (!existingConfigPath) {
        throw new Error('Config was not generated. Please run config generator manually.');
      }

      const configContent = fs.readFileSync(existingConfigPath, 'utf8');
      this.config = JSON.parse(configContent);
      this.configPath = existingConfigPath;

      displaySuccess('Config generated successfully!');
    }
  }

  /**
   * Run the config generator as a subprocess
   */
  async runConfigGenerator() {
    return new Promise((resolve, reject) => {
      const configGenPath = path.join(__dirname, '..', 'tools', 'config-generator.js');

      displayInfo('Starting config generator...');
      displayInfo('This will open a browser window for visual configuration.');
      console.log('');

      const args = ['--url', this.options.url];
      if (this.options.verbose) {
        args.push('--verbose');
      }

      const configGen = spawn('node', [configGenPath, ...args], {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..', '..')
      });

      configGen.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Config generator exited with code ${code}`));
        }
      });

      configGen.on('error', (err) => {
        reject(new Error(`Failed to start config generator: ${err.message}`));
      });
    });
  }

  /**
   * Confirmation point before scraping
   */
  async confirmProceedToScraping() {
    if (this.options.autoMode) {
      displayInfo('Auto mode: Proceeding to scraping...');
      await countdown(3, 'Starting in');
      return true;
    }

    console.log('');
    return await confirmYesNo('Config ready. Proceed to scraping?', true);
  }

  /**
   * Stage 2: Scraping
   */
  async stageScraping() {
    displayStageHeader('STAGE 2: SCRAPING');

    const rateLimiter = new RateLimiter(logger, {
      minDelay: 2000,
      maxDelay: 5000
    });

    // Determine pagination type
    // Check explicit pagination config first
    let paginationType = this.config.pagination?.paginationType ||
                          this.config.pagination?.type ||
                          null;

    // Detect infinite scroll based on config characteristics
    // V2.3 configs with manual-validated selection and no explicit pagination are often infinite scroll
    const looksLikeInfiniteScroll = !paginationType && (
      this.config.version === '2.3' ||
      this.config.selectionMethod === 'manual-validated' ||
      this.config.selectionMethod === 'manual'
    );

    if (!paginationType) {
      paginationType = looksLikeInfiniteScroll ? 'infinite-scroll' : 'single-page';
    }

    const isInfiniteScroll = paginationType === 'infinite-scroll';

    displayInfo(`Pagination type: ${paginationType}${looksLikeInfiniteScroll ? ' (auto-detected)' : ''}`);
    displayInfo(`Using ${isInfiniteScroll ? 'Selenium (PAGE_DOWN)' : 'Puppeteer'}`);
    console.log('');

    try {
      if (isInfiniteScroll) {
        // Use Selenium for infinite scroll
        const { InfiniteScrollScraper } = require('../scrapers/config-scrapers');

        this.seleniumManager = new SeleniumManager(logger);
        await this.seleniumManager.launch(this.options.headless);

        const scraper = new InfiniteScrollScraper(this.seleniumManager, rateLimiter, logger, {
          scrollDelay: 400,
          maxRetries: 25,
          maxScrolls: this.options.limit ? Math.min(100, this.options.limit * 2) : 1000
        });

        scraper.config = this.config;
        scraper.initializeCardSelector();

        displayInfo('Scrolling to load all contacts...');
        const results = await scraper.scrape(this.options.url, this.options.limit);
        this.contacts = results.contacts || results || [];

        // Close Selenium after scraping (we'll use Puppeteer for enrichment)
        await this.seleniumManager.close();
        this.seleniumManager = null;

      } else {
        // Use Puppeteer for traditional/single-page
        const ConfigScraper = require('../scrapers/config-scraper');

        this.browserManager = new BrowserManager(logger);
        await this.browserManager.launch(this.options.headless);

        const scraper = new ConfigScraper(this.browserManager, rateLimiter, logger, this.config);

        displayInfo('Scraping page...');
        this.contacts = await scraper.scrape(this.options.url, this.options.limit);

        // Keep browser open for enrichment
      }

      // Ensure contacts is an array
      if (!Array.isArray(this.contacts)) {
        this.contacts = this.contacts?.contacts || [];
      }

      // Save scraped data
      this.scrapedDataPath = this.generateOutputPath('scraped');
      this.saveContacts(this.contacts, this.scrapedDataPath);

      // Display results
      displaySuccess(`Scraped ${this.contacts.length} contacts`);
      console.log('');

      displayContactsTable(this.contacts, 5);

      const scrapingStats = {
        'Total contacts': this.contacts.length,
        'With email': this.contacts.filter(c => c.email).length,
        'With phone': this.contacts.filter(c => c.phone).length,
        'With profile URL': this.contacts.filter(c => c.profileUrl).length,
        'Output file': path.basename(this.scrapedDataPath)
      };

      console.log('');
      displayStageSummary(scrapingStats, 'Scraping Results:');

    } catch (error) {
      displayError(`Scraping failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Confirmation point before enrichment
   */
  async confirmProceedToEnrichment() {
    if (this.options.autoMode) {
      displayInfo('Auto mode: Proceeding to enrichment...');
      await countdown(3, 'Starting in');
      return true;
    }

    console.log('');
    const contactsWithProfiles = this.contacts.filter(c => c.profileUrl).length;
    displayInfo(`${contactsWithProfiles} contacts have profile URLs for enrichment`);

    if (contactsWithProfiles === 0) {
      displayWarning('No contacts have profile URLs - skipping enrichment');
      return false;
    }

    return await confirmYesNo('Proceed to enrichment?', true);
  }

  /**
   * Stage 3: Enrichment
   */
  async stageEnrichment() {
    displayStageHeader('STAGE 3: ENRICHMENT');

    const contactsWithProfiles = this.contacts.filter(c => c.profileUrl);

    if (contactsWithProfiles.length === 0) {
      displayWarning('No contacts with profile URLs to enrich');
      return;
    }

    displayInfo(`Enriching ${contactsWithProfiles.length} contacts with profile URLs`);
    console.log('');

    try {
      // Initialize browser if not already running
      if (!this.browserManager) {
        this.browserManager = new BrowserManager(logger);
        await this.browserManager.launch(this.options.headless);
      }

      const enrichRateLimiter = new RateLimiter(logger, {
        minDelay: this.options.delay,
        maxDelay: this.options.delay + 2000
      });

      const enricher = new ProfileEnricher(this.browserManager, enrichRateLimiter, logger);

      // Enrich contacts
      const enrichResult = await enricher.enrichContacts(contactsWithProfiles, {
        limit: this.options.limit,
        skipErrors: true,
        onlyCoreFields: true
      });

      // enrichContacts returns an object with contacts array
      this.enrichedContacts = enrichResult.contacts || enrichResult;

      // Run post-cleaning
      displayInfo('Running post-enrichment cleaning...');
      const fieldCleaner = new FieldCleaner(logger);
      this.enrichedContacts = await fieldCleaner.cleanContacts(this.enrichedContacts);

      // Save enriched data
      this.enrichedDataPath = this.generateOutputPath('enriched');
      this.saveContacts(this.enrichedContacts, this.enrichedDataPath);

      // Display results
      displaySuccess(`Enriched ${this.enrichedContacts.length} contacts`);
      console.log('');

      const enrichmentStats = {
        'Total enriched': this.enrichedContacts.length,
        'High confidence': this.enrichedContacts.filter(c => c.confidence === 'high').length,
        'Medium confidence': this.enrichedContacts.filter(c => c.confidence === 'medium').length,
        'Low confidence': this.enrichedContacts.filter(c => c.confidence === 'low').length,
        'Output file': path.basename(this.enrichedDataPath)
      };

      displayStageSummary(enrichmentStats, 'Enrichment Results:');

    } catch (error) {
      displayError(`Enrichment failed: ${error.message}`);
      // Don't throw - allow pipeline to continue with scraped data
      displayWarning('Continuing with scraped data (not enriched)');
    }
  }

  /**
   * Confirmation point before export
   */
  async confirmProceedToExport() {
    // Check if Google Sheets is configured
    const exporter = new SheetExporter(logger);
    if (!exporter.isConfigured()) {
      displayWarning('Google Sheets not configured - skipping export');
      displayInfo('Add GOOGLE_SHEETS_* credentials to .env to enable export');
      return false;
    }

    if (this.options.autoMode) {
      displayInfo('Auto mode: Proceeding to export...');
      await countdown(3, 'Starting in');
      return true;
    }

    console.log('');
    return await confirmYesNo('Export to Google Sheets?', true);
  }

  /**
   * Stage 4: Export
   */
  async stageExport() {
    displayStageHeader('STAGE 4: GOOGLE SHEETS EXPORT');

    const exporter = new SheetExporter(logger);

    if (!exporter.isConfigured()) {
      displayWarning('Google Sheets not configured');
      return;
    }

    try {
      // Determine which data to export
      const dataToExport = this.enrichedContacts.length > 0
        ? this.enrichedContacts
        : this.contacts;

      const dataPath = this.enrichedDataPath || this.scrapedDataPath;

      displayInfo(`Exporting ${dataToExport.length} contacts to Google Sheets...`);

      const result = await exporter.exportToSheet(dataPath, {
        sheetName: `${this.domain} - ${new Date().toLocaleDateString()}`,
        includeEnrichment: this.enrichedContacts.length > 0
      });

      this.sheetUrl = result.spreadsheetUrl;

      displaySuccess('Export complete!');
      console.log('');
      displayInfo(`Sheet URL: ${this.sheetUrl}`);

    } catch (error) {
      displayError(`Export failed: ${error.message}`);
      // Don't throw - pipeline completed, just export failed
    }
  }

  /**
   * Display final completion summary
   */
  async displayCompletion() {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    displayCompletionSummary({
      configPath: this.configPath ? path.basename(this.configPath) : null,
      scrapedFile: this.scrapedDataPath ? path.basename(this.scrapedDataPath) : null,
      enrichedFile: this.enrichedDataPath ? path.basename(this.enrichedDataPath) : null,
      sheetUrl: this.sheetUrl,
      totalContacts: this.enrichedContacts.length || this.contacts.length,
      duration: `${minutes}m ${seconds}s`
    });
  }

  /**
   * Generate output file path
   * @param {string} stage - Stage name (scraped, enriched)
   * @returns {string} - Output file path
   */
  generateOutputPath(stage) {
    const outputDir = path.join(__dirname, '..', '..', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const domainSlug = this.domain.replace(/\./g, '-');
    const filename = `scrape-${domainSlug}-${timestamp}${stage === 'enriched' ? '-enriched' : ''}.json`;

    return path.join(outputDir, filename);
  }

  /**
   * Save contacts to file
   * @param {Array} contacts - Contacts to save
   * @param {string} filePath - Output file path
   */
  saveContacts(contacts, filePath) {
    const data = {
      metadata: {
        url: this.options.url,
        domain: this.domain,
        scrapedAt: new Date().toISOString(),
        totalContacts: contacts.length
      },
      contacts: contacts
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    logger.info(`[FullPipeline] Saved ${contacts.length} contacts to ${path.basename(filePath)}`);
  }

  /**
   * Save partial results if pipeline fails
   */
  async savePartialResults() {
    if (this.contacts.length > 0 && !this.scrapedDataPath) {
      try {
        this.scrapedDataPath = this.generateOutputPath('scraped-partial');
        this.saveContacts(this.contacts, this.scrapedDataPath);
        displayInfo(`Partial results saved to: ${path.basename(this.scrapedDataPath)}`);
      } catch (e) {
        // Ignore save errors
      }
    }
  }

  /**
   * Build result object
   * @param {boolean} success - Whether pipeline succeeded
   * @param {string} message - Result message
   * @returns {Object} - Result object
   */
  buildResult(success, message) {
    return {
      success,
      message,
      configPath: this.configPath,
      scrapedDataPath: this.scrapedDataPath,
      enrichedDataPath: this.enrichedDataPath,
      sheetUrl: this.sheetUrl,
      contactsScraped: this.contacts.length,
      contactsEnriched: this.enrichedContacts.length,
      duration: Date.now() - this.startTime
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.browserManager) {
      try {
        await this.browserManager.close();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.browserManager = null;
    }

    if (this.seleniumManager) {
      try {
        await this.seleniumManager.close();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.seleniumManager = null;
    }
  }
}

module.exports = FullPipelineOrchestrator;
