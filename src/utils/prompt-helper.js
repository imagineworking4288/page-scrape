/**
 * Prompt Helper Utilities
 *
 * Reusable terminal prompt utilities for interactive CLI workflows.
 * Uses built-in 'readline' module for terminal input.
 *
 * Features:
 * - Yes/No confirmations with default values
 * - Multiple choice option selection
 * - Wait for Enter key
 * - Stage headers and summaries
 * - Progress indicators
 */

const readline = require('readline');
const Table = require('cli-table3');

/**
 * Create readline interface
 * @returns {readline.Interface}
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask a yes/no confirmation question
 * @param {string} message - Question to ask
 * @param {boolean} defaultValue - Default value on Enter (default: true)
 * @returns {Promise<boolean>} - True if yes, false if no
 */
async function confirmYesNo(message, defaultValue = true) {
  const rl = createReadlineInterface();

  const defaultHint = defaultValue ? 'Y/n' : 'y/N';
  const prompt = `${message} (${defaultHint}): `;

  return new Promise((resolve) => {
    const askQuestion = () => {
      rl.question(prompt, (answer) => {
        const trimmed = answer.trim().toLowerCase();

        // Handle empty input (use default)
        if (trimmed === '') {
          rl.close();
          resolve(defaultValue);
          return;
        }

        // Handle yes
        if (trimmed === 'y' || trimmed === 'yes') {
          rl.close();
          resolve(true);
          return;
        }

        // Handle no
        if (trimmed === 'n' || trimmed === 'no') {
          rl.close();
          resolve(false);
          return;
        }

        // Invalid input - retry
        console.log('Please enter y/yes or n/no');
        askQuestion();
      });
    };

    askQuestion();

    // Handle CTRL+C
    rl.on('close', () => {
      // Will resolve with default or user input
    });
  });
}

/**
 * Ask a multiple choice question
 * @param {string} message - Question to ask
 * @param {string[]} options - Array of options (e.g., ['yes', 'no', 'regenerate'])
 * @returns {Promise<string>} - Selected option as string
 */
async function confirmOptions(message, options = ['yes', 'no', 'regenerate']) {
  const rl = createReadlineInterface();

  // Build prompt with numbered options
  let prompt = `${message}\n`;
  options.forEach((opt, idx) => {
    prompt += `  ${idx + 1}. ${opt}\n`;
  });
  prompt += `Enter choice (1-${options.length} or text): `;

  return new Promise((resolve) => {
    const askQuestion = () => {
      rl.question(prompt, (answer) => {
        const trimmed = answer.trim().toLowerCase();

        // Handle numeric input
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= options.length) {
          rl.close();
          resolve(options[num - 1]);
          return;
        }

        // Handle text input
        const match = options.find(opt => opt.toLowerCase() === trimmed);
        if (match) {
          rl.close();
          resolve(match);
          return;
        }

        // Handle abbreviated input (first letter or first few chars)
        const startsWith = options.find(opt => opt.toLowerCase().startsWith(trimmed) && trimmed.length > 0);
        if (startsWith) {
          rl.close();
          resolve(startsWith);
          return;
        }

        // Invalid input - retry
        console.log(`Invalid choice. Please enter 1-${options.length} or type the option.`);
        askQuestion();
      });
    };

    askQuestion();
  });
}

/**
 * Wait for user to press Enter
 * @param {string} message - Message to display (default: 'Press Enter to continue...')
 * @returns {Promise<void>}
 */
async function waitForEnter(message = 'Press Enter to continue...') {
  const rl = createReadlineInterface();

  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Display a stage header with ASCII box drawing
 * @param {string} stageName - Name of the stage
 */
function displayStageHeader(stageName) {
  const width = 60;
  const padding = Math.floor((width - stageName.length - 2) / 2);
  const paddedName = ' '.repeat(padding) + stageName + ' '.repeat(width - padding - stageName.length - 2);

  console.log('');
  console.log('═'.repeat(width));
  console.log(paddedName);
  console.log('═'.repeat(width));
  console.log('');
}

/**
 * Display statistics summary in a table
 * @param {Object} stats - Object with key-value pairs to display
 * @param {string} title - Optional title for the table
 */
function displayStageSummary(stats, title = null) {
  if (title) {
    console.log(title);
  }

  const table = new Table({
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│'
    }
  });

  // Add rows
  Object.entries(stats).forEach(([key, value]) => {
    const displayValue = value !== null && value !== undefined ? String(value) : 'N/A';
    table.push([key, displayValue]);
  });

  console.log(table.toString());
}

/**
 * Display progress indicator with message
 * @param {string} message - Progress message
 * @param {number} current - Current progress (optional)
 * @param {number} total - Total items (optional)
 */
function displayProgressIndicator(message, current = null, total = null) {
  if (current !== null && total !== null) {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    console.log(`${message} [${bar}] ${current}/${total} (${percentage}%)`);
  } else {
    console.log(`⏳ ${message}`);
  }
}

/**
 * Display a success message
 * @param {string} message - Success message
 */
function displaySuccess(message) {
  console.log(`✓ ${message}`);
}

/**
 * Display an error message
 * @param {string} message - Error message
 */
function displayError(message) {
  console.log(`✗ ${message}`);
}

/**
 * Display a warning message
 * @param {string} message - Warning message
 */
function displayWarning(message) {
  console.log(`⚠ ${message}`);
}

/**
 * Display an info message
 * @param {string} message - Info message
 */
function displayInfo(message) {
  console.log(`ℹ ${message}`);
}

/**
 * Display contacts in a formatted table
 * @param {Array} contacts - Array of contact objects
 * @param {number} limit - Maximum contacts to display (default: 5)
 */
function displayContactsTable(contacts, limit = 5) {
  if (!contacts || contacts.length === 0) {
    console.log('No contacts to display.');
    return;
  }

  const table = new Table({
    head: ['Name', 'Email', 'Phone', 'Title', 'Location'],
    colWidths: [22, 30, 18, 18, 20],
    wordWrap: true
  });

  contacts.slice(0, limit).forEach(contact => {
    table.push([
      truncate(contact.name, 20) || 'N/A',
      truncate(contact.email, 28) || 'N/A',
      truncate(contact.phone, 16) || 'N/A',
      truncate(contact.title, 16) || 'N/A',
      truncate(contact.location, 18) || 'N/A'
    ]);
  });

  console.log(table.toString());

  if (contacts.length > limit) {
    console.log(`... and ${contacts.length - limit} more contacts`);
  }
}

/**
 * Display field comparison table for enrichment
 * @param {Object} original - Original contact data
 * @param {Object} enriched - Enriched contact data
 * @param {Object} actions - Action taken for each field
 */
function displayFieldComparison(original, enriched, actions) {
  const table = new Table({
    head: ['Field', 'Original', 'Enriched', 'Action'],
    colWidths: [12, 25, 25, 12],
    wordWrap: true
  });

  const fields = ['name', 'email', 'phone', 'title', 'location'];

  fields.forEach(field => {
    const origValue = original[field] || '';
    const enrichValue = enriched[field] || '';
    const action = actions?.[field] || '-';

    table.push([
      field,
      truncate(origValue, 23) || '-',
      truncate(enrichValue, 23) || '-',
      action
    ]);
  });

  console.log(table.toString());
}

/**
 * Truncate string to max length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated string
 */
function truncate(str, maxLength) {
  if (!str) return str;
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Display a countdown timer
 * @param {number} seconds - Number of seconds to count down
 * @param {string} message - Message prefix (e.g., "Starting in")
 * @returns {Promise<void>}
 */
async function countdown(seconds, message = 'Starting in') {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${message} ${i}...`);
    await sleep(1000);
  }
  process.stdout.write('\r' + ' '.repeat(message.length + 10) + '\r');
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Display a completion summary
 * @param {Object} result - Result object with various properties
 */
function displayCompletionSummary(result) {
  displayStageHeader('PIPELINE COMPLETE');

  const summary = {};

  if (result.configPath) {
    summary['Config'] = result.configPath;
  }
  if (result.scrapedFile) {
    summary['Scraped Data'] = result.scrapedFile;
  }
  if (result.enrichedFile) {
    summary['Enriched Data'] = result.enrichedFile;
  }
  if (result.sheetUrl) {
    summary['Google Sheet'] = result.sheetUrl;
  }
  if (result.totalContacts !== undefined) {
    summary['Total Contacts'] = result.totalContacts;
  }
  if (result.duration) {
    summary['Duration'] = result.duration;
  }

  displayStageSummary(summary);
}

/**
 * Select pagination mode based on URL detection, config, and user input
 * @param {Object} options - Selection options
 * @param {string} options.configPaginationType - Pagination type from config (may be null)
 * @param {Object} options.urlDetection - Result from detectPaginationFromUrl()
 * @param {boolean} options.autoMode - Skip prompt and auto-select (default: false)
 * @param {Object} options.logger - Logger instance (optional)
 * @returns {Promise<string>} - Selected pagination type: 'pagination', 'infinite-scroll', or 'single-page'
 */
async function selectPaginationMode(options = {}) {
  const {
    configPaginationType,
    urlDetection = {},
    autoMode = false,
    logger = null
  } = options;

  const log = (msg) => logger ? logger.info(msg) : console.log(msg);

  // Build detection info for display
  const detectionInfo = [];

  if (configPaginationType) {
    detectionInfo.push(`Config: ${configPaginationType}`);
  }

  if (urlDetection.domainMatch) {
    detectionInfo.push(`Domain match: ${urlDetection.domainMatch} (${urlDetection.suggestedType})`);
  }

  if (urlDetection.hasPaginationParam) {
    detectionInfo.push(`URL param: ${urlDetection.paramName}=${urlDetection.paramValue}`);
  }

  // Determine suggested type (priority: config > domain match > URL param > single-page)
  let suggestedType = configPaginationType || urlDetection.suggestedType || 'single-page';

  // Normalize type names
  if (suggestedType === 'parameter' || suggestedType === 'traditional') {
    suggestedType = 'pagination';
  }

  // Auto mode: use suggestion without prompt
  if (autoMode) {
    if (detectionInfo.length > 0) {
      log(`[Pagination] Detection: ${detectionInfo.join(', ')}`);
    }
    log(`[Pagination] Auto-selecting: ${suggestedType}`);
    return suggestedType;
  }

  // Display detection info
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│                  PAGINATION MODE SELECTION              │');
  console.log('├─────────────────────────────────────────────────────────┤');

  if (detectionInfo.length > 0) {
    console.log('│ Detection:                                              │');
    detectionInfo.forEach(info => {
      const padded = info.padEnd(55);
      console.log(`│   ${padded} │`);
    });
    console.log('├─────────────────────────────────────────────────────────┤');
  }

  console.log('│ Suggested mode: ' + suggestedType.padEnd(40) + ' │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');

  // Build options with recommended first
  const modeOptions = [];
  const modeDescriptions = {
    'pagination': 'Traditional pagination (URL changes per page)',
    'infinite-scroll': 'Infinite scroll (content loads on scroll)',
    'single-page': 'Single page (no pagination)'
  };

  // Add suggested option first with "(Recommended)" suffix
  modeOptions.push(`${suggestedType} (Recommended)`);

  // Add other options
  ['pagination', 'infinite-scroll', 'single-page'].forEach(mode => {
    if (mode !== suggestedType) {
      modeOptions.push(mode);
    }
  });

  // Prompt user
  const choice = await confirmOptions(
    'Select pagination mode:',
    modeOptions
  );

  // Extract mode from choice (remove " (Recommended)" if present)
  const selectedMode = choice.replace(' (Recommended)', '');

  console.log('');
  displayInfo(`Selected mode: ${selectedMode}`);

  return selectedMode;
}

module.exports = {
  confirmYesNo,
  confirmOptions,
  waitForEnter,
  displayStageHeader,
  displayStageSummary,
  displayProgressIndicator,
  displaySuccess,
  displayError,
  displayWarning,
  displayInfo,
  displayContactsTable,
  displayFieldComparison,
  displayCompletionSummary,
  countdown,
  sleep,
  truncate,
  selectPaginationMode
};
