/**
 * Selenium Manager
 *
 * Parallel browser manager using Selenium WebDriver for reliable infinite scroll handling.
 * Uses PAGE_DOWN key simulation instead of scrollBy() for better compatibility with
 * lazy-loading and infinite scroll triggers.
 *
 * Key Features:
 * - PAGE_DOWN key simulation (not scrollBy)
 * - Retry counter reset on ANY height change
 * - Scroll up/down cycle every 5 failed retries
 * - Cookie banner auto-dismissal
 * - Memory monitoring and driver recycling
 */

const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

class SeleniumManager {
  constructor(logger) {
    this.logger = logger;
    this.driver = null;
    this.navigationCount = 0;
    this.initialMemory = 0;

    // Default scroll configuration
    this.defaultScrollConfig = {
      scrollDelay: 400,           // ms between PAGE_DOWN presses
      maxRetries: 25,             // consecutive no-change attempts before stopping
      maxScrolls: 1000,           // safety limit for total scrolls
      initialWait: 5000,          // ms to wait for initial content to load
      scrollContainer: null,      // CSS selector for scroll container (null = use body)
      verbose: true,              // log progress
      // Load More button options
      enableLoadMoreButton: true, // try to detect and click Load More buttons
      maxButtonClicks: 50,        // maximum number of button clicks
      waitAfterButtonClick: 2000, // ms to wait after clicking button
      cardSelector: null          // CSS selector for cards (used to count new elements)
    };

    // User agent rotation
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  /**
   * Launch Chrome WebDriver with stealth configuration
   * @param {boolean} headless - Run in headless mode
   * @returns {Promise<boolean>} - Success status
   */
  async launch(headless = true) {
    try {
      // Normalize headless parameter
      if (headless === 'false' || headless === false) {
        headless = false;
      } else {
        headless = true;
      }

      this.logger.info('[Selenium] Launching Chrome WebDriver...');

      const options = new chrome.Options();

      if (headless) {
        options.addArguments('--headless=new');
      }

      // Stealth and stability arguments
      options.addArguments('--disable-gpu');
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
      options.addArguments('--window-size=1920,1080');
      options.addArguments('--disable-blink-features=AutomationControlled');
      options.addArguments('--disable-web-security');
      options.addArguments('--disable-features=IsolateOrigins,site-per-process');

      // Random user agent
      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      options.addArguments(`--user-agent=${userAgent}`);

      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      this.initialMemory = process.memoryUsage().heapUsed;

      this.logger.info('[Selenium] Chrome WebDriver launched successfully');
      this.logger.info(`[Selenium] Headless mode: ${headless}`);

      return true;
    } catch (error) {
      this.logger.error(`[Selenium] Failed to launch WebDriver: ${error.message}`);
      throw error;
    }
  }

  /**
   * Navigate to URL
   * @param {string} url - URL to navigate to
   * @param {number} timeout - Navigation timeout in ms
   * @returns {Promise<boolean>} - Success status
   */
  async navigate(url, timeout = 30000) {
    try {
      await this.checkMemoryAndRecycle();

      this.logger.info(`[Selenium] Navigating to: ${url}`);

      await this.driver.get(url);

      // Wait for body to be present
      await this.driver.wait(until.elementLocated(By.tagName('body')), timeout);

      this.navigationCount++;

      if (this.navigationCount % 10 === 0) {
        this.logMemoryUsage();
      }

      return true;
    } catch (error) {
      this.logger.error(`[Selenium] Navigation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scroll page to fully load all infinite scroll content
   * Uses PAGE_DOWN key simulation with retry logic
   * Falls back to Load More button detection when scrolling stops producing new content
   *
   * @param {Object} options - Scroll options
   * @param {number} options.scrollDelay - Delay between scrolls in ms (default: 400)
   * @param {number} options.maxRetries - Max consecutive no-change attempts (default: 25)
   * @param {number} options.maxScrolls - Max total scrolls safety limit (default: 1000)
   * @param {number} options.initialWait - Initial wait for content in ms (default: 5000)
   * @param {string} options.scrollContainer - CSS selector for scroll container (default: null/body)
   * @param {boolean} options.verbose - Log progress (default: true)
   * @param {boolean} options.enableLoadMoreButton - Try Load More buttons (default: true)
   * @param {number} options.maxButtonClicks - Max button click attempts (default: 50)
   * @param {number} options.waitAfterButtonClick - Wait after button click in ms (default: 2000)
   * @param {string} options.cardSelector - CSS selector for cards to count new elements
   * @param {Function} options.onHeightChange - Callback when height increases: ({type, scrollCount, previousHeight, newHeight, delta, timestamp}) => void
   * @param {Function} options.onButtonClick - Callback when Load More clicked: ({type, buttonClicks, scrollCount, buttonText, strategy, newElementCount, timestamp}) => void
   * @param {Function} options.onScrollBatch - Callback every 10 scrolls: ({type, scrollCount, heightChanges, buttonClicks, currentHeight, retriesAtBatch, timestamp}) => void
   * @returns {Promise<Object>} - Scroll statistics including timeline array
   */
  async scrollToFullyLoad(options = {}) {
    const config = { ...this.defaultScrollConfig, ...options };
    const {
      scrollDelay, maxRetries, maxScrolls, initialWait, scrollContainer, verbose,
      enableLoadMoreButton, maxButtonClicks, waitAfterButtonClick, cardSelector,
      // Timeline callback hooks for testing and progress tracking
      onHeightChange,     // Called when page height increases: (data) => void
      onButtonClick,      // Called when Load More button is clicked: (data) => void
      onScrollBatch       // Called every 10 scrolls with progress: (data) => void
    } = config;

    // Wait for initial content to load
    if (verbose) this.logger.info(`[Selenium] Waiting ${initialWait}ms for initial content...`);
    await this.driver.sleep(initialWait);

    // Try to dismiss cookie banners
    await this.dismissCookieBanners(verbose);

    // Determine scroll element and height script
    let heightScript = 'return document.body.scrollHeight';
    let scrollElement;

    if (scrollContainer) {
      try {
        scrollElement = await this.driver.findElement(By.css(scrollContainer));
        heightScript = `return document.querySelector('${scrollContainer}').scrollHeight`;
        if (verbose) this.logger.info(`[Selenium] Using scroll container: ${scrollContainer}`);
      } catch (e) {
        this.logger.warn(`[Selenium] Scroll container not found: ${scrollContainer}, using body`);
        scrollElement = await this.driver.findElement(By.tagName('body'));
      }
    } else {
      scrollElement = await this.driver.findElement(By.tagName('body'));
    }

    // Click on element to ensure focus for keyboard events
    try {
      await scrollElement.click();
      await this.driver.sleep(500);
    } catch (e) {
      this.logger.debug('[Selenium] Could not click scroll element, continuing anyway');
    }

    // Get initial page height
    let lastHeight = await this.driver.executeScript(heightScript);
    let retries = 0;
    let scrollCount = 0;
    let heightChanges = 0;
    let buttonClicks = 0;

    // Button-first mode: After first successful button click, check for button
    // at start of each loop iteration instead of scrolling 25 times first.
    // This optimizes sites like Skadden that use button pagination without infinite scroll.
    let buttonClickMode = false;

    // Timeline tracking for callbacks and testing
    const timeline = [];
    const startTime = Date.now();

    if (verbose) {
      this.logger.info(`[Selenium] Starting scroll: initial height = ${lastHeight}px`);
      this.logger.info(`[Selenium] Config: delay=${scrollDelay}ms, maxRetries=${maxRetries}, maxScrolls=${maxScrolls}`);
      if (enableLoadMoreButton) {
        this.logger.info(`[Selenium] Load More button detection: enabled (max ${maxButtonClicks} clicks)`);
      }
    }

    // Main scroll loop
    while (scrollCount < maxScrolls) {
      // CHECK BUTTON LIMIT FIRST - Exit cleanly if max clicks reached
      // This prevents StaleElementReferenceError by not querying DOM after limit
      if (buttonClickMode && buttonClicks >= maxButtonClicks) {
        if (verbose) {
          this.logger.info(`[Selenium] Button pagination complete: ${buttonClicks} clicks, exiting cleanly`);
          this.logger.info(`[Selenium] Final stats - Height changes: ${heightChanges}, Scrolls: ${scrollCount}`);
        }
        break;  // Exit main loop - do NOT query DOM anymore
      }

      // BUTTON-FIRST MODE: Check for button immediately instead of scrolling
      // This optimizes button-based pagination (e.g., Skadden's VIEW MORE)
      if (buttonClickMode && enableLoadMoreButton) {
        const buttonResult = await this.detectLoadMoreButton(verbose);

        if (buttonResult) {
          if (verbose) {
            this.logger.info(`[Selenium] [Button-first] Found button: "${buttonResult.text}" (strategy: ${buttonResult.strategy})`);
          }

          const clickResult = await this.clickLoadMoreButton(buttonResult.button, {
            waitAfterClick: waitAfterButtonClick,
            scrollAfterClick: true,
            cardSelector
          });

          if (clickResult.success) {
            buttonClicks++;

            const buttonClickData = {
              type: 'button_click',
              buttonClicks,
              scrollCount,
              buttonText: buttonResult.text,
              strategy: buttonResult.strategy,
              newElementCount: clickResult.newElementCount || 0,
              buttonFirstMode: true,
              timestamp: Date.now() - startTime
            };
            timeline.push(buttonClickData);

            if (typeof onButtonClick === 'function') {
              try {
                onButtonClick(buttonClickData);
              } catch (e) {
                this.logger.debug(`[Selenium] onButtonClick callback error: ${e.message}`);
              }
            }

            if (verbose) {
              const countInfo = cardSelector && clickResult.newElementCount > 0
                ? `, loaded ${clickResult.newElementCount} new elements`
                : '';
              this.logger.info(`[Selenium] [Button-first] Clicked (${buttonClicks}/${maxButtonClicks})${countInfo}`);
            }

            // Check if we just hit the limit - exit immediately without more DOM queries
            if (buttonClicks >= maxButtonClicks) {
              if (verbose) {
                this.logger.info(`[Selenium] Reached max button clicks (${maxButtonClicks}), stopping pagination`);
              }
              break;  // Exit main loop cleanly
            }

            // Update height and continue in button-first mode
            lastHeight = await this.driver.executeScript(heightScript);
            retries = 0;
            continue;  // Check for button again immediately
          } else {
            // Button click failed - exit button-first mode and resume normal scrolling
            if (verbose) {
              this.logger.info(`[Selenium] [Button-first] Click failed, resuming normal scroll`);
            }
            buttonClickMode = false;
          }
        } else {
          // No button found - exit button-first mode and resume normal scrolling
          if (verbose) {
            this.logger.info(`[Selenium] [Button-first] No button found, resuming normal scroll`);
          }
          buttonClickMode = false;
        }
      }

      // Send PAGE_DOWN key to scroll element
      await scrollElement.sendKeys(Key.PAGE_DOWN);
      scrollCount++;

      // Wait for content to potentially load
      await this.driver.sleep(scrollDelay);

      // Invoke onScrollBatch callback every 10 scrolls
      if (scrollCount % 10 === 0 && typeof onScrollBatch === 'function') {
        const batchData = {
          type: 'scroll_batch',
          scrollCount,
          heightChanges,
          buttonClicks,
          currentHeight: lastHeight,
          retriesAtBatch: retries,
          timestamp: Date.now() - startTime
        };
        timeline.push(batchData);
        try {
          onScrollBatch(batchData);
        } catch (e) {
          this.logger.debug(`[Selenium] onScrollBatch callback error: ${e.message}`);
        }
      }

      // Check new height
      const newHeight = await this.driver.executeScript(heightScript);

      if (newHeight > lastHeight) {
        // Height increased - reset retry counter!
        // Key insight: height only stops changing at absolute bottom
        retries = 0;
        heightChanges++;

        const heightChangeData = {
          type: 'height_change',
          scrollCount,
          previousHeight: lastHeight,
          newHeight,
          delta: newHeight - lastHeight,
          timestamp: Date.now() - startTime
        };
        timeline.push(heightChangeData);

        // Invoke callback if provided
        if (typeof onHeightChange === 'function') {
          try {
            onHeightChange(heightChangeData);
          } catch (e) {
            this.logger.debug(`[Selenium] onHeightChange callback error: ${e.message}`);
          }
        }

        if (verbose) {
          this.logger.info(`[Selenium] [${scrollCount}] Height changed: ${lastHeight} -> ${newHeight} (+${newHeight - lastHeight}px)`);
        }

        lastHeight = newHeight;
      } else {
        // Height unchanged - increment retry counter
        retries++;

        // Every 5 failed attempts, try scroll up/down cycle to trigger lazy loading
        if (retries % 5 === 0 && retries < maxRetries) {
          if (verbose) {
            this.logger.info(`[Selenium] [${scrollCount}] No change (retry ${retries}/${maxRetries}) - trying scroll up/down cycle`);
          }

          // Scroll up a few times
          for (let i = 0; i < 3; i++) {
            await scrollElement.sendKeys(Key.PAGE_UP);
            await this.driver.sleep(150);
          }

          // Wait a bit
          await this.driver.sleep(500);

          // Scroll back down
          for (let i = 0; i < 5; i++) {
            await scrollElement.sendKeys(Key.PAGE_DOWN);
            await this.driver.sleep(150);
          }

          // Wait for content to load
          await this.driver.sleep(scrollDelay);

          // Check if height changed after cycle
          const heightAfterCycle = await this.driver.executeScript(heightScript);
          if (heightAfterCycle > lastHeight) {
            retries = 0;
            heightChanges++;
            if (verbose) {
              this.logger.info(`[Selenium] [${scrollCount}] Scroll cycle triggered content: ${lastHeight} -> ${heightAfterCycle}`);
            }
            lastHeight = heightAfterCycle;
          }
        }

        // Check if scroll is exhausted - try Load More button as fallback
        if (retries >= maxRetries) {
          if (enableLoadMoreButton && buttonClicks < maxButtonClicks) {
            if (verbose) {
              this.logger.info(`[Selenium] Scroll exhausted (${retries} retries), looking for Load More button...`);
            }

            // Try to find and click a Load More button
            const buttonResult = await this.detectLoadMoreButton(verbose);

            if (buttonResult) {
              if (verbose) {
                this.logger.info(`[Selenium] Found Load More button: "${buttonResult.text}" (strategy: ${buttonResult.strategy})`);
              }

              // Click the button
              const clickResult = await this.clickLoadMoreButton(buttonResult.button, {
                waitAfterClick: waitAfterButtonClick,
                scrollAfterClick: true,
                cardSelector
              });

              if (clickResult.success) {
                buttonClicks++;

                const buttonClickData = {
                  type: 'button_click',
                  buttonClicks,
                  scrollCount,
                  buttonText: buttonResult.text,
                  strategy: buttonResult.strategy,
                  newElementCount: clickResult.newElementCount || 0,
                  buttonFirstMode: false,  // First click triggers button-first mode
                  timestamp: Date.now() - startTime
                };
                timeline.push(buttonClickData);

                // Invoke callback if provided
                if (typeof onButtonClick === 'function') {
                  try {
                    onButtonClick(buttonClickData);
                  } catch (e) {
                    this.logger.debug(`[Selenium] onButtonClick callback error: ${e.message}`);
                  }
                }

                if (verbose) {
                  const countInfo = cardSelector && clickResult.newElementCount > 0
                    ? `, loaded ${clickResult.newElementCount} new elements`
                    : '';
                  this.logger.info(`[Selenium] Clicked Load More button (${buttonClicks}/${maxButtonClicks})${countInfo}`);
                }

                // ENABLE BUTTON-FIRST MODE: After first successful button click,
                // check for button immediately on next iteration instead of scrolling 25 times
                buttonClickMode = true;
                if (verbose) {
                  this.logger.info(`[Selenium] Entering button-first mode for faster button pagination`);
                }

                // Reset retries and height to continue
                retries = 0;
                lastHeight = await this.driver.executeScript(heightScript);

                // Continue - will check for button first on next iteration
                continue;
              } else {
                if (verbose) {
                  this.logger.warn(`[Selenium] Button click failed: ${clickResult.error || 'unknown error'}`);
                }
                // Button click failed, stop scrolling
                break;
              }
            } else {
              if (verbose) {
                this.logger.info('[Selenium] No Load More button found, scroll complete');
              }
              break;
            }
          } else {
            // Load More button not enabled or max clicks reached
            if (buttonClicks >= maxButtonClicks && verbose) {
              this.logger.info(`[Selenium] Reached max button clicks (${maxButtonClicks}), stopping`);
            }
            break;
          }
        }
      }
    }

    // Determine stop reason
    let stopReason;
    if (buttonClicks >= maxButtonClicks) {
      stopReason = `Reached max button clicks (${maxButtonClicks})`;
    } else if (retries >= maxRetries) {
      stopReason = `Reached max retries (${maxRetries} consecutive no-change attempts)`;
    } else if (scrollCount >= maxScrolls) {
      stopReason = `Reached max scrolls (${maxScrolls})`;
    } else {
      stopReason = 'Scroll complete (no more content)';
    }

    if (verbose) {
      this.logger.info(`[Selenium] Scroll complete: ${stopReason}`);
      this.logger.info(`[Selenium] Total scrolls: ${scrollCount}, Height changes: ${heightChanges}`);
      if (buttonClicks > 0) {
        this.logger.info(`[Selenium] Load More button clicks: ${buttonClicks}`);
      }
      this.logger.info(`[Selenium] Final height: ${lastHeight}px`);
    }

    return {
      scrollCount,
      heightChanges,
      finalHeight: lastHeight,
      stopReason,
      retriesAtEnd: retries,
      buttonClicks,
      // Timeline data for testing and analysis
      timeline,
      duration: Date.now() - startTime
    };
  }

  /**
   * Detect a "Load More" button on the page using multiple strategies
   *
   * Detection strategies (in order of priority):
   * 1. Text content patterns - buttons/links with "load more", "show more", etc.
   * 2. ARIA label patterns - aria-label attributes with load/more text
   * 3. CSS class patterns - .load-more, .show-more, [class*="load-more"], etc.
   * 4. Data attribute patterns - [data-action*="load"], [data-load-more], etc.
   * 5. Generic fallback - any button/link with "more" in text
   *
   * @param {boolean} verbose - Log detection attempts
   * @returns {Promise<Object|null>} - { button: WebElement, text: string, strategy: string } or null
   */
  async detectLoadMoreButton(verbose = false) {
    if (verbose) this.logger.info('[Selenium] Attempting to detect Load More button...');

    const strategies = [
      {
        name: 'text-content',
        description: 'Text content patterns',
        finder: async () => {
          // Case-insensitive text patterns for load more buttons
          const patterns = [
            'load more', 'show more', 'view more', 'see more', 'more results',
            'load additional', 'show additional', 'next page', 'see all', 'view all'
          ];

          for (const pattern of patterns) {
            try {
              // XPath for case-insensitive text matching in buttons and links
              const xpath = `//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${pattern}')] | //a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${pattern}')]`;
              const elements = await this.driver.findElements(By.xpath(xpath));

              for (const el of elements) {
                try {
                  const isDisplayed = await el.isDisplayed();
                  const isEnabled = await el.isEnabled();
                  if (isDisplayed && isEnabled) {
                    const text = await el.getText();
                    return { button: el, text: text.trim() || pattern };
                  }
                } catch (e) {
                  // Element may have become stale, continue
                }
              }
            } catch (e) {
              // Pattern not found, continue to next
            }
          }
          return null;
        }
      },
      {
        name: 'aria-label',
        description: 'ARIA label patterns',
        finder: async () => {
          try {
            const xpath = `//button[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'load') or contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'more')] | //a[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'load') or contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'more')]`;
            const elements = await this.driver.findElements(By.xpath(xpath));

            for (const el of elements) {
              try {
                const isDisplayed = await el.isDisplayed();
                const isEnabled = await el.isEnabled();
                if (isDisplayed && isEnabled) {
                  const ariaLabel = await el.getAttribute('aria-label');
                  const text = await el.getText();
                  return { button: el, text: text.trim() || ariaLabel || 'Load More' };
                }
              } catch (e) {
                // Continue
              }
            }
          } catch (e) {
            // Not found
          }
          return null;
        }
      },
      {
        name: 'css-class',
        description: 'CSS class patterns',
        finder: async () => {
          const selectors = [
            '.load-more', '.show-more', '.view-more', '.btn-load-more',
            '.load-additional', '[class*="load-more"]', '[class*="show-more"]',
            '[class*="loadmore"]', '[class*="showmore"]'
          ];

          for (const selector of selectors) {
            try {
              const elements = await this.driver.findElements(By.css(selector));

              for (const el of elements) {
                try {
                  const isDisplayed = await el.isDisplayed();
                  const isEnabled = await el.isEnabled();
                  if (isDisplayed && isEnabled) {
                    const text = await el.getText();
                    return { button: el, text: text.trim() || 'Load More' };
                  }
                } catch (e) {
                  // Continue
                }
              }
            } catch (e) {
              // Selector not found, continue
            }
          }
          return null;
        }
      },
      {
        name: 'data-attribute',
        description: 'Data attribute patterns',
        finder: async () => {
          const selectors = [
            '[data-action*="load"]', '[data-action*="more"]',
            '[data-load-more]', '[data-show-more]',
            '[data-testid*="load-more"]', '[data-testid*="show-more"]'
          ];

          for (const selector of selectors) {
            try {
              const elements = await this.driver.findElements(By.css(selector));

              for (const el of elements) {
                try {
                  const isDisplayed = await el.isDisplayed();
                  const isEnabled = await el.isEnabled();
                  if (isDisplayed && isEnabled) {
                    const text = await el.getText();
                    return { button: el, text: text.trim() || 'Load More' };
                  }
                } catch (e) {
                  // Continue
                }
              }
            } catch (e) {
              // Selector not found, continue
            }
          }
          return null;
        }
      },
      {
        name: 'generic-more',
        description: 'Generic fallback (any button/link with "more")',
        finder: async () => {
          try {
            // Find buttons/links with "more" that look like pagination controls
            const xpath = `//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'more')] | //a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'more') and not(contains(., '@'))]`;
            const elements = await this.driver.findElements(By.xpath(xpath));

            for (const el of elements) {
              try {
                const isDisplayed = await el.isDisplayed();
                const isEnabled = await el.isEnabled();
                if (isDisplayed && isEnabled) {
                  const text = await el.getText();
                  // Filter out links that are clearly not load more buttons
                  // Also ensure "more" is a word boundary (not part of names like "Dellamore")
                  const lowerText = text.toLowerCase();
                  const hasMoreAsWord = lowerText === 'more' ||
                                        lowerText.includes(' more') ||
                                        lowerText.startsWith('more ') ||
                                        lowerText.startsWith('more\n');
                  if (text && text.length < 50 && !text.includes('@') && hasMoreAsWord) {
                    return { button: el, text: text.trim() };
                  }
                }
              } catch (e) {
                // Continue
              }
            }
          } catch (e) {
            // Not found
          }
          return null;
        }
      }
    ];

    // Try each strategy in order
    for (const strategy of strategies) {
      try {
        if (verbose) this.logger.debug(`[Selenium] Trying detection strategy: ${strategy.description}`);

        const result = await strategy.finder();
        if (result) {
          if (verbose) {
            this.logger.info(`[Selenium] Found Load More button via ${strategy.name}: "${result.text}"`);
          }
          return { ...result, strategy: strategy.name };
        }
      } catch (e) {
        if (verbose) {
          this.logger.debug(`[Selenium] Strategy ${strategy.name} failed: ${e.message}`);
        }
      }
    }

    if (verbose) this.logger.debug('[Selenium] No Load More button found');
    return null;
  }

  /**
   * Click a Load More button and wait for new content to load
   *
   * @param {WebElement} button - The button element to click
   * @param {Object} options - Click options
   * @param {number} options.waitAfterClick - Time to wait after clicking (ms)
   * @param {boolean} options.scrollAfterClick - Whether to scroll to bottom after click
   * @param {string} options.cardSelector - CSS selector for cards to count
   * @returns {Promise<Object>} - { success: boolean, newElementCount: number, error?: string }
   */
  async clickLoadMoreButton(button, options = {}) {
    const {
      waitAfterClick = 2000,
      scrollAfterClick = true,
      cardSelector = null
    } = options;

    try {
      // Get element count before click (if card selector provided)
      let countBefore = 0;
      if (cardSelector) {
        try {
          const cardsBefore = await this.driver.findElements(By.css(cardSelector));
          countBefore = cardsBefore.length;
        } catch (e) {
          // Ignore count errors
        }
      }

      // Scroll button into view before clicking
      try {
        await this.driver.executeScript('arguments[0].scrollIntoView({ behavior: "smooth", block: "center" });', button);
        await this.driver.sleep(300);
      } catch (e) {
        this.logger.debug('[Selenium] Could not scroll button into view, attempting click anyway');
      }

      // Click the button
      await button.click();
      this.logger.debug('[Selenium] Clicked Load More button');

      // Wait for content to load
      await this.driver.sleep(waitAfterClick);

      // Scroll to bottom to trigger any lazy loading
      if (scrollAfterClick) {
        const scrollElement = await this.driver.findElement(By.tagName('body'));
        await scrollElement.sendKeys(Key.END);
        await this.driver.sleep(500);
      }

      // Get element count after click
      let countAfter = 0;
      if (cardSelector) {
        try {
          const cardsAfter = await this.driver.findElements(By.css(cardSelector));
          countAfter = cardsAfter.length;
        } catch (e) {
          // Ignore count errors
        }
      }

      return {
        success: true,
        countBefore,
        countAfter,
        newElementCount: countAfter - countBefore
      };

    } catch (error) {
      // StaleElementReferenceError means button disappeared after click - often means it worked
      if (error.name === 'StaleElementReferenceError') {
        this.logger.debug('[Selenium] Button became stale after click (may indicate success)');
        return { success: true, newElementCount: 0, stale: true };
      }

      this.logger.warn(`[Selenium] Button click failed: ${error.message}`);
      return { success: false, newElementCount: 0, error: error.message };
    }
  }

  /**
   * Try to dismiss common cookie consent banners
   * @param {boolean} verbose - Log actions
   */
  async dismissCookieBanners(verbose = false) {
    const bannerSelectors = [
      '#onetrust-accept-btn-handler',      // OneTrust
      '#onetrust-reject-all-handler',      // OneTrust reject
      '.cookie-accept',                     // Common class
      '[data-testid="cookie-accept"]',     // Test ID pattern
      '#accept-cookies',                    // Common ID
      '.accept-cookies-button',             // Common class
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
      '.cc-accept',                         // Cookie consent
      '#gdpr-cookie-accept'                 // GDPR pattern
    ];

    for (const selector of bannerSelectors) {
      try {
        const button = await this.driver.findElement(By.css(selector));
        if (button) {
          await button.click();
          if (verbose) this.logger.info(`[Selenium] Dismissed cookie banner: ${selector}`);
          await this.driver.sleep(500);
          return;
        }
      } catch (e) {
        // Button not found, try next
      }
    }

    if (verbose) this.logger.debug('[Selenium] No cookie banner found or already dismissed');
  }

  /**
   * Get page HTML source after scrolling
   * @returns {Promise<string>} - HTML content
   */
  async getPageSource() {
    if (!this.driver) {
      throw new Error('[Selenium] Driver not initialized. Call launch() first.');
    }
    return await this.driver.getPageSource();
  }

  /**
   * Get the WebDriver instance
   * @returns {WebDriver} - Selenium WebDriver
   */
  getDriver() {
    if (!this.driver) {
      throw new Error('[Selenium] Driver not initialized. Call launch() first.');
    }
    return this.driver;
  }

  /**
   * Check memory and recycle driver if needed
   */
  async checkMemoryAndRecycle() {
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryGrowthMB = (currentMemory - this.initialMemory) / 1024 / 1024;

    // Recycle after 50 navigations or 1GB memory growth
    if (this.navigationCount >= 50 || memoryGrowthMB >= 1024) {
      this.logger.info(`[Selenium] Recycling driver - Navigations: ${this.navigationCount}, Memory growth: ${memoryGrowthMB.toFixed(2)}MB`);

      // Close and recreate driver
      if (this.driver) {
        await this.driver.quit();
      }

      // Relaunch with same settings
      await this.launch(true); // Headless for recycled instances

      this.navigationCount = 0;
      this.initialMemory = process.memoryUsage().heapUsed;

      if (global.gc) {
        global.gc();
        this.logger.debug('[Selenium] Forced garbage collection');
      }
    }
  }

  /**
   * Log current memory usage
   */
  logMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);

    this.logger.info(`[Selenium] Memory - Heap: ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB, Navigations: ${this.navigationCount}`);
  }

  /**
   * Close WebDriver
   */
  async close() {
    try {
      if (this.driver) {
        await this.driver.quit();
        this.driver = null;
        this.logger.info('[Selenium] WebDriver closed successfully');
      }
    } catch (error) {
      this.logger.error(`[Selenium] Error closing WebDriver: ${error.message}`);
    }
  }
}

module.exports = SeleniumManager;
