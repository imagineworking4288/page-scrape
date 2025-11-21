"""
Browser management using Playwright.
"""

import random
import logging
from typing import Optional
from playwright.sync_api import sync_playwright, Browser, Page, Playwright


class BrowserManager:
    """Manages Playwright browser instance with anti-detection."""

    USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ]

    def __init__(self, headless: bool = True, logger: Optional[logging.Logger] = None):
        """
        Initialize browser manager.

        Args:
            headless: Run browser in headless mode
            logger: Logger instance
        """
        self.headless = headless
        self.logger = logger or logging.getLogger(__name__)
        self.playwright: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.user_agent = random.choice(self.USER_AGENTS)

    def start(self) -> None:
        """Launch browser with stealth configuration."""
        try:
            self.logger.info("Launching browser with stealth configuration...")

            # Start Playwright
            self.playwright = sync_playwright().start()

            # Launch Chromium with stealth settings
            self.browser = self.playwright.chromium.launch(
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                ]
            )

            # Create context with anti-detection
            context = self.browser.new_context(
                user_agent=self.user_agent,
                viewport={'width': 1920, 'height': 1080},
                locale='en-US',
                timezone_id='America/New_York',
            )

            # Add init script to hide automation
            context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
                window.chrome = {
                    runtime: {}
                };
            """)

            # Create page
            self.page = context.new_page()

            self.logger.info(f"Browser launched successfully (headless: {self.headless})")

        except Exception as e:
            self.logger.error(f"Failed to launch browser: {e}")
            raise

    def goto(self, url: str, timeout: int = 60000) -> None:
        """
        Navigate to URL.

        Args:
            url: Target URL
            timeout: Navigation timeout in milliseconds
        """
        if not self.page:
            raise RuntimeError("Browser not started. Call start() first.")

        try:
            self.logger.info(f"Navigating to: {url}")
            self.page.goto(url, wait_until='networkidle', timeout=timeout)
            self.logger.info("Page loaded successfully")

        except Exception as e:
            self.logger.error(f"Navigation failed: {e}")
            raise

    def get_page(self) -> Page:
        """
        Get current page object.

        Returns:
            Playwright Page instance
        """
        if not self.page:
            raise RuntimeError("Browser not started. Call start() first.")
        return self.page

    def close(self) -> None:
        """Clean shutdown of browser and Playwright."""
        try:
            if self.page:
                self.page.close()
                self.page = None

            if self.browser:
                self.browser.close()
                self.browser = None

            if self.playwright:
                self.playwright.stop()
                self.playwright = None

            self.logger.info("Browser closed successfully")

        except Exception as e:
            self.logger.warning(f"Error during browser cleanup: {e}")

    def __enter__(self):
        """Context manager entry."""
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
