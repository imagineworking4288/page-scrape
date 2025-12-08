"""
Simple Infinite Scroll Viewer
Opens a browser, scrolls to bottom, saves HTML
"""

# ============================================================
# EDIT THIS URL FOR QUICK TESTING
# ============================================================
DEFAULT_URL = "https://www.sullcrom.com/LawyerListing?custom_is_office=27567"
# ============================================================

from playwright.sync_api import sync_playwright
import time


def scroll_to_bottom(page, scroll_pause=0.5, max_scrolls=500):
    """
    Scroll page to bottom by repeatedly scrolling and checking if height increases

    Args:
        page: Playwright page object
        scroll_pause: Seconds to wait between scrolls
        max_scrolls: Maximum number of scroll attempts

    Returns:
        dict with scroll stats
    """
    print("\n[SCROLL] Starting scroll to bottom...")
    print(f"[SCROLL] Settings: {scroll_pause}s pause, max {max_scrolls} scrolls")

    # Get initial height
    last_height = page.evaluate("document.body.scrollHeight")
    print(f"[SCROLL] Initial height: {last_height}px")

    scroll_count = 0
    no_change_count = 0

    while scroll_count < max_scrolls:
        # Scroll to bottom
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        # Wait for content to load
        time.sleep(scroll_pause)

        # Calculate new height
        new_height = page.evaluate("document.body.scrollHeight")
        scroll_count += 1

        if new_height > last_height:
            # Page grew - new content loaded
            growth = new_height - last_height
            print(f"[SCROLL] Scroll {scroll_count}: {last_height}px -> {new_height}px (+{growth}px)")
            last_height = new_height
            no_change_count = 0
        else:
            # No growth
            no_change_count += 1
            print(f"[SCROLL] Scroll {scroll_count}: No change ({no_change_count}/5)")

            if no_change_count >= 5:
                print(f"[SCROLL] Reached bottom (no growth for 5 scrolls)")
                break

    if scroll_count >= max_scrolls:
        print(f"[SCROLL] Hit max scroll limit ({max_scrolls})")

    print(f"[SCROLL] Complete: {scroll_count} scrolls, final height {last_height}px")

    return {
        'scroll_count': scroll_count,
        'final_height': last_height,
        'reached_bottom': no_change_count >= 5
    }


def scrape_with_scroll(url, headless=False, scroll_pause=0.5, max_scrolls=500):
    """
    Open URL, scroll to bottom, return HTML

    Args:
        url: URL to scrape
        headless: Run browser in headless mode (False = visible)
        scroll_pause: Seconds between scrolls
        max_scrolls: Maximum scroll attempts

    Returns:
        dict with html and stats
    """
    print("\n" + "="*60)
    print("INFINITE SCROLL VIEWER")
    print("="*60)
    print(f"URL: {url}")
    print(f"Mode: {'Headless' if headless else 'Visible Browser'}")
    print("")

    start_time = time.time()

    with sync_playwright() as p:
        # Launch browser
        print("[START] Launching browser...")
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        # Navigate
        print(f"[NAVIGATE] Loading page...")
        page.goto(url, wait_until='networkidle')
        print(f"[NAVIGATE] Page loaded")

        # Scroll to bottom
        scroll_stats = scroll_to_bottom(page, scroll_pause, max_scrolls)

        # Get HTML
        html = page.content()

        # Close
        browser.close()
        print("[CLOSE] Browser closed")

    duration = time.time() - start_time

    return {
        'html': html,
        'scroll_stats': scroll_stats,
        'duration': duration,
        'url': url
    }


if __name__ == "__main__":
    # Quick test
    print(f"\nDefault URL: {DEFAULT_URL}")
    url = input("Enter URL to scroll (or press Enter for default): ").strip()
    if not url:
        url = DEFAULT_URL

    result = scrape_with_scroll(url, headless=False)

    print("\n" + "="*60)
    print("RESULTS")
    print("="*60)
    print(f"Duration: {result['duration']:.1f}s")
    print(f"Scrolls: {result['scroll_stats']['scroll_count']}")
    print(f"Final height: {result['scroll_stats']['final_height']}px")
    print(f"HTML size: {len(result['html']):,} bytes")
