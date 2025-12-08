# Python Infinite Scroll Viewer

Simple Python script that opens a browser, scrolls to the bottom of any page, and saves the HTML.

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers (one-time setup)
playwright install chromium
```

## Usage

### Quick Test (Interactive)

```bash
python scroll_viewer.py
```

Enter any URL when prompted. Browser will open (visible), scroll to bottom, and show results.

### Sullivan & Cromwell Test

```bash
python test_sullcrom.py
```

Opens Sullivan & Cromwell lawyer directory, scrolls to load all lawyers, saves HTML.

### Custom Usage

```python
from scroll_viewer import scrape_with_scroll

result = scrape_with_scroll(
    url="YOUR_URL_HERE",
    headless=False,        # False = watch it scroll
    scroll_pause=0.5,      # Seconds between scrolls
    max_scrolls=500        # Max scroll attempts
)

print(f"HTML size: {len(result['html'])} bytes")
print(f"Scrolls: {result['scroll_stats']['scroll_count']}")
```

## Editing the Test URL

The test URL is at the TOP of each file for easy editing:

**scroll_viewer.py** (line 8):
```python
DEFAULT_URL = "https://www.sullcrom.com/LawyerListing?custom_is_office=27567"
```

**test_sullcrom.py** (line 7):
```python
TEST_URL = "https://www.sullcrom.com/LawyerListing?custom_is_office=27567"
```

## How It Works

1. Opens Chromium browser (visible by default)
2. Loads the URL
3. Repeatedly scrolls to bottom
4. Waits 500ms between scrolls
5. Stops when page height stops increasing for 5 consecutive scrolls
6. Returns complete HTML

## Configuration

Edit these parameters:
- `scroll_pause` - Seconds to wait between scrolls (default: 0.5)
- `max_scrolls` - Maximum scroll attempts (default: 500)
- `headless` - Run invisible (True) or visible (False, default)

## Troubleshooting

**Browser doesn't open:**
```bash
playwright install chromium
```

**Page doesn't scroll:**
- Check if site uses virtual scrolling or lazy loading
- Try increasing `scroll_pause` (some sites need more time)
- Watch the visible browser to see what's happening

**HTML has no content:**
- Site may require authentication
- Site may block automated browsers
- Site may use JavaScript rendering (Playwright handles this automatically)

## Files Generated

- `sullcrom_output.html` - Scraped HTML from test
