"""
Command-line interface for Python PDF scraper.
"""

import sys
import argparse
from pathlib import Path
from typing import Optional

from .logging_setup import setup_logger
from .browser import BrowserManager
from .pdf_render import render_page_to_pdf
from .pdf_extract import extract_contacts_from_pdf
from .pairing import process_pdf_contacts
from .writer import write_json, write_csv, calculate_domain_stats


def print_banner(logger):
    """Print startup banner."""
    logger.info("═" * 40)
    logger.info("  PYTHON PDF SCRAPER v1.0")
    logger.info("  Coordinate-Based Extraction")
    logger.info("═" * 40)
    logger.info("")


def print_summary(contacts, logger):
    """Print scraping summary statistics."""
    total = len(contacts)
    with_names = sum(1 for c in contacts if c.has_name)
    with_phones = sum(1 for c in contacts if c.has_phone)
    complete = sum(1 for c in contacts if c.is_complete)
    business = sum(1 for c in contacts if c.domainType == 'business')

    logger.info("")
    logger.info("═" * 40)
    logger.info("  SCRAPING COMPLETE")
    logger.info("═" * 40)
    logger.info("=== Summary Statistics ===")
    logger.info(f"  Total Contacts: {total}")
    logger.info(f"  With Names: {with_names}/{total} ({with_names/total*100:.1f}%)" if total > 0 else "  With Names: 0/0 (0.0%)")
    logger.info(f"  With Phones: {with_phones}/{total} ({with_phones/total*100:.1f}%)" if total > 0 else "  With Phones: 0/0 (0.0%)")
    logger.info(f"  Complete Records: {complete}/{total} ({complete/total*100:.1f}%)" if total > 0 else "  Complete Records: 0/0 (0.0%)")
    logger.info(f"  Business Emails: {business}/{total} ({business/total*100:.1f}%)" if total > 0 else "  Business Emails: 0/0 (0.0%)")
    logger.info("=" * 28)


def print_sample_contacts(contacts, logger, limit=5):
    """Print sample contacts."""
    logger.info("")
    logger.info(f"Sample Contacts (first {min(limit, len(contacts))}):")

    for i, contact in enumerate(contacts[:limit], 1):
        name = contact.name or "N/A"
        phone = contact.phone or "N/A"
        logger.info(f"{i}. {name} - {contact.email} - {phone}")


def main():
    """Main CLI entry point."""
    # Parse arguments
    parser = argparse.ArgumentParser(
        description='Python PDF Scraper with Coordinate-Based Extraction',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument(
        '--url', '-u',
        required=True,
        help='Target URL to scrape'
    )

    parser.add_argument(
        '--limit', '-l',
        type=int,
        default=None,
        help='Limit number of contacts (optional)'
    )

    parser.add_argument(
        '--output', '-o',
        choices=['json', 'csv'],
        default='json',
        help='Output format (default: json)'
    )

    parser.add_argument(
        '--headless',
        choices=['true', 'false'],
        default='true',
        help='Headless browser mode (default: true)'
    )

    parser.add_argument(
        '--keep',
        action='store_true',
        help='Keep PDF files after extraction'
    )

    parser.add_argument(
        '--pdf-dir',
        default='output/pdfs',
        help='PDF output directory (default: output/pdfs)'
    )

    parser.add_argument(
        '--log-level',
        choices=['DEBUG', 'INFO', 'WARN', 'ERROR'],
        default='INFO',
        help='Logging level (default: INFO)'
    )

    args = parser.parse_args()

    # Setup logger
    logger = setup_logger(level=args.log_level)

    # Print banner
    print_banner(logger)

    logger.info(f"Target URL: {args.url}")
    logger.info(f"Limit: {args.limit if args.limit else 'None'}")
    logger.info(f"Output format: {args.output}")
    logger.info(f"Headless: {args.headless}")
    logger.info(f"Keep PDFs: {'yes' if args.keep else 'no'}")
    logger.info("")

    browser: Optional[BrowserManager] = None
    pdf_path: Optional[str] = None

    try:
        # Initialize browser
        logger.info("Initializing browser...")
        headless = args.headless.lower() == 'true'
        browser = BrowserManager(headless=headless, logger=logger)

        # Start browser
        browser.start()

        # Navigate to URL
        browser.goto(args.url)

        # Wait a moment for any JavaScript to execute
        page = browser.get_page()
        page.wait_for_timeout(5000)  # 5 seconds

        # Render page as PDF
        logger.info("Rendering page as PDF...")
        pdf_path = render_page_to_pdf(page, output_dir=args.pdf_dir)
        logger.info(f"PDF saved: {pdf_path}")

        # Extract contacts from PDF
        logger.info("Extracting contacts from PDF using coordinate-based search...")
        pdf_contacts = extract_contacts_from_pdf(pdf_path)
        logger.info(f"Found {len(pdf_contacts)} unique emails")

        # Apply limit if specified
        if args.limit and len(pdf_contacts) > args.limit:
            logger.info(f"Limiting to {args.limit} contacts")
            pdf_contacts = pdf_contacts[:args.limit]

        # Process contacts (pairing and classification)
        logger.info("Processing contacts and classifying domains...")
        contacts = process_pdf_contacts(pdf_contacts, args.url)

        # Delete PDF if not keeping
        if not args.keep and pdf_path:
            try:
                Path(pdf_path).unlink()
                logger.info(f"PDF deleted: {pdf_path}")
            except Exception as e:
                logger.warning(f"Failed to delete PDF: {e}")

        # Write output
        if args.output == 'json':
            output_path = write_json(contacts, args.url)
            logger.info(f"JSON output saved: {output_path}")
        else:
            output_path = write_csv(contacts)
            logger.info(f"CSV output saved: {output_path}")

        # Print summary
        print_summary(contacts, logger)

        # Print sample contacts
        print_sample_contacts(contacts, logger)

        logger.info("")
        logger.info("Scraping completed successfully")

        return 0

    except KeyboardInterrupt:
        logger.warning("Interrupted by user")
        return 130

    except Exception as e:
        logger.error(f"Scraping failed: {e}", exc_info=True)
        return 1

    finally:
        # Cleanup
        if browser:
            browser.close()


if __name__ == '__main__':
    sys.exit(main())
