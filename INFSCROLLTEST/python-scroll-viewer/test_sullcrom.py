"""
Test Sullivan & Cromwell lawyer directory
"""

# ============================================================
# EDIT THIS URL TO TEST DIFFERENT PAGES
# ============================================================
TEST_URL = "https://www.sullcrom.com/LawyerListing?custom_is_office=27567"
# ============================================================

from scroll_viewer import scrape_with_scroll
import re


def count_lawyers_in_html(html):
    """Count unique lawyer links in HTML"""
    # Find all links containing '/lawyers/'
    pattern = r'href="[^"]*\/lawyers\/[^"]*"'
    matches = re.findall(pattern, html)
    unique = set(matches)
    return len(unique)


def test_sullcrom():
    """Test Sullivan & Cromwell directory"""

    print("\n" + "="*60)
    print("TESTING: Sullivan & Cromwell Lawyer Directory")
    print("="*60)
    print(f"URL: {TEST_URL}")
    print("Expected: 500+ lawyers")
    print("")

    # Scrape with visible browser
    result = scrape_with_scroll(
        url=TEST_URL,
        headless=False,        # Watch it scroll
        scroll_pause=0.5,      # 500ms between scrolls
        max_scrolls=500        # Up to 500 scrolls
    )

    # Save HTML
    filename = "sullcrom_output.html"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(result['html'])
    print(f"\n[SAVE] HTML saved to: {filename}")

    # Count lawyers
    lawyer_count = count_lawyers_in_html(result['html'])

    # Results
    print("\n" + "="*60)
    print("ANALYSIS")
    print("="*60)
    print(f"Unique lawyer links found: {lawyer_count}")
    print(f"Duration: {result['duration']:.1f}s")
    print(f"Scrolls performed: {result['scroll_stats']['scroll_count']}")
    print(f"Final page height: {result['scroll_stats']['final_height']}px")

    # Success criteria
    print("\n" + "="*60)
    print("SUCCESS CRITERIA")
    print("="*60)

    if lawyer_count >= 500:
        print(f"SUCCESS: Found {lawyer_count} lawyers (expected 500+)")
    elif lawyer_count >= 300:
        print(f"PARTIAL: Found {lawyer_count} lawyers (expected 500+)")
    elif lawyer_count > 0:
        print(f"FAIL: Only found {lawyer_count} lawyers (expected 500+)")
    else:
        print(f"FAIL: No lawyers found")
        print(f"   Tip: Open {filename} in browser to inspect HTML")


if __name__ == "__main__":
    test_sullcrom()
