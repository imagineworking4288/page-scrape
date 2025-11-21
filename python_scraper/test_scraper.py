"""
Comprehensive test script for Python PDF scraper.
"""

import sys
import argparse
import json
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any
from collections import defaultdict

from .logging_setup import setup_logger
from .browser import BrowserManager
from .pdf_render import render_page_to_pdf
from .pdf_extract import extract_contacts_from_pdf
from .pairing import process_pdf_contacts
from .models import Contact


def print_test_banner(test_num: int, url: str, total: int):
    """Print test header."""
    print("\n")
    print(f"Test {test_num}/{total}: {url}")
    print("─" * 80)


def validate_contacts(contacts: List[Contact]) -> Dict[str, Any]:
    """
    Validate contacts and return validation results.

    Args:
        contacts: List of Contact objects

    Returns:
        Dictionary of validation results
    """
    issues = []
    emails_seen = set()

    for i, contact in enumerate(contacts, 1):
        # Check for duplicate emails
        if contact.email in emails_seen:
            issues.append(f"Contact {i}: Duplicate email '{contact.email}'")
        emails_seen.add(contact.email)

        # Check email format
        if '@' not in contact.email:
            issues.append(f"Contact {i}: Invalid email format '{contact.email}'")

        # Check for cross-contamination indicators
        if contact.name:
            name_lower = contact.name.lower()
            email_lower = contact.email.lower()

            # Check if name contains obvious UI elements
            ui_elements = ['sign in', 'contact us', 'email', 'phone', 'website']
            if any(ui in name_lower for ui in ui_elements):
                issues.append(f"Contact {i}: Name appears to be UI element: '{contact.name}'")

            # Check for suspicious name/email mismatches (very basic check)
            # Example: Name "Michael Abrahm" with email "ioana.butiri@..."
            if contact.name and ' ' in contact.name:
                name_parts = name_lower.split()
                email_prefix = email_lower.split('@')[0]

                # Check if any name part appears in email
                has_match = any(
                    part[:3] in email_prefix or email_prefix[:3] in part
                    for part in name_parts
                    if len(part) > 2
                )

                if not has_match and len(name_parts) >= 2:
                    issues.append(
                        f"Contact {i}: Possible cross-contamination - "
                        f"Name '{contact.name}' doesn't match email '{contact.email}'"
                    )

    return {
        "passed": len(issues) == 0,
        "issues": issues
    }


def calculate_metrics(contacts: List[Contact]) -> Dict[str, Any]:
    """
    Calculate test metrics.

    Args:
        contacts: List of Contact objects

    Returns:
        Dictionary of metrics
    """
    total = len(contacts)
    with_names = sum(1 for c in contacts if c.has_name)
    with_phones = sum(1 for c in contacts if c.has_phone)
    complete = sum(1 for c in contacts if c.is_complete)
    business = sum(1 for c in contacts if c.domainType == 'business')

    # Domain distribution
    domain_counts = defaultdict(int)
    for contact in contacts:
        if contact.domain:
            domain_counts[contact.domain] += 1

    return {
        "total_contacts": total,
        "with_names": with_names,
        "name_accuracy": (with_names / total * 100) if total > 0 else 0,
        "with_phones": with_phones,
        "phone_accuracy": (with_phones / total * 100) if total > 0 else 0,
        "complete_records": complete,
        "completeness": (complete / total * 100) if total > 0 else 0,
        "business_emails": business,
        "business_percentage": (business / total * 100) if total > 0 else 0,
        "domain_distribution": dict(domain_counts)
    }


def print_test_results(url: str, contacts: List[Contact], validation: Dict[str, Any], metrics: Dict[str, Any]):
    """Print formatted test results."""
    # Success indicators
    check = "✓" if validation["passed"] else "✗"

    # Print metrics
    print(f"{check} Extracted: {metrics['total_contacts']} contacts")
    print(f"{check} With Names: {metrics['with_names']}/{metrics['total_contacts']} ({metrics['name_accuracy']:.1f}%)")
    print(f"{check} With Phones: {metrics['with_phones']}/{metrics['total_contacts']} ({metrics['phone_accuracy']:.1f}%)")
    print(f"{check} Complete Records: {metrics['complete_records']}/{metrics['total_contacts']} ({metrics['completeness']:.1f}%)")
    print(f"{check} Business Emails: {metrics['business_emails']}/{metrics['total_contacts']} ({metrics['business_percentage']:.1f}%)")

    # Print validation issues if any
    if not validation["passed"]:
        print("\n⚠ Validation Issues:")
        for issue in validation["issues"][:10]:  # Show first 10 issues
            print(f"  - {issue}")
        if len(validation["issues"]) > 10:
            print(f"  ... and {len(validation['issues']) - 10} more issues")

    # Sample contacts
    print("\nSample Contacts:")
    for i, contact in enumerate(contacts[:5], 1):
        name = contact.name or "N/A"
        phone = contact.phone or "N/A"
        print(f"{i}. {name} - {contact.email} - {phone}")

    # Domain distribution
    if metrics["domain_distribution"]:
        print("\nDomain Distribution:")
        for domain, count in sorted(
            metrics["domain_distribution"].items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]:
            percentage = (count / metrics["total_contacts"] * 100) if metrics["total_contacts"] > 0 else 0
            print(f"  - {domain}: {count} contacts ({percentage:.1f}%)")


def print_summary(all_results: List[Dict[str, Any]]):
    """Print summary across all tests."""
    print("\n")
    print("═" * 80)
    print("SUMMARY ACROSS ALL TESTS")
    print("═" * 80)

    total_urls = len(all_results)
    total_contacts = sum(r["metrics"]["total_contacts"] for r in all_results)
    avg_name_accuracy = sum(r["metrics"]["name_accuracy"] for r in all_results) / total_urls if total_urls > 0 else 0
    avg_completeness = sum(r["metrics"]["completeness"] for r in all_results) / total_urls if total_urls > 0 else 0
    all_passed = all(r["validation"]["passed"] for r in all_results)

    print(f"Total URLs Tested: {total_urls}")
    print(f"Total Contacts: {total_contacts}")
    print(f"Average Name Accuracy: {avg_name_accuracy:.1f}%")
    print(f"Average Completeness: {avg_completeness:.1f}%")
    print(f"All Validations Passed: {'✓ Yes' if all_passed else '✗ No'}")

    if not all_passed:
        print("\n⚠ Some tests had validation issues. Review individual test results above.")


def save_results(all_results: List[Dict[str, Any]], output_dir: str = "test_results"):
    """Save test results to JSON file."""
    # Create output directory
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    filename = f"test-{timestamp}.json"
    output_path = out_dir / filename

    # Write results
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)

    print(f"\nTest results saved to: {output_path}")


def main():
    """Main test script entry point."""
    parser = argparse.ArgumentParser(
        description='Test Python PDF Scraper with multiple URLs',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument(
        '--urls',
        nargs='+',
        required=True,
        help='URLs to test (space-separated)'
    )

    parser.add_argument(
        '--limit', '-l',
        type=int,
        default=20,
        help='Limit contacts per URL (default: 20)'
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
        help='Keep PDF files'
    )

    args = parser.parse_args()

    # Setup logger
    logger = setup_logger(level='INFO')

    # Print banner
    print("╔" + "═" * 78 + "╗")
    print("║" + "   SCRAPER TEST RESULTS".center(78) + "║")
    print("╚" + "═" * 78 + "╝")

    all_results = []
    headless = args.headless.lower() == 'true'

    for test_num, url in enumerate(args.urls, 1):
        print_test_banner(test_num, url, len(args.urls))

        browser = None
        pdf_path = None

        try:
            # Initialize and run scraper
            browser = BrowserManager(headless=headless, logger=logger)
            browser.start()
            browser.goto(url)

            page = browser.get_page()
            page.wait_for_timeout(5000)

            # Render PDF
            pdf_path = render_page_to_pdf(page)

            # Extract contacts
            pdf_contacts = extract_contacts_from_pdf(pdf_path)

            # Apply limit
            if args.limit and len(pdf_contacts) > args.limit:
                pdf_contacts = pdf_contacts[:args.limit]

            # Process contacts
            contacts = process_pdf_contacts(pdf_contacts, url)

            # Delete PDF if not keeping
            if not args.keep and pdf_path:
                Path(pdf_path).unlink()

            # Validate and calculate metrics
            validation = validate_contacts(contacts)
            metrics = calculate_metrics(contacts)

            # Print results
            print_test_results(url, contacts, validation, metrics)

            # Save results
            all_results.append({
                "url": url,
                "contacts": [c.to_dict() for c in contacts],
                "validation": validation,
                "metrics": metrics
            })

        except Exception as e:
            logger.error(f"Test failed for {url}: {e}", exc_info=True)
            all_results.append({
                "url": url,
                "error": str(e),
                "validation": {"passed": False, "issues": [str(e)]},
                "metrics": {"total_contacts": 0}
            })

        finally:
            if browser:
                browser.close()

    # Print summary
    print_summary(all_results)

    # Save results
    save_results(all_results)

    return 0


if __name__ == '__main__':
    sys.exit(main())
