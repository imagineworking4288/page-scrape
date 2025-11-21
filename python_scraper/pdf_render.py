"""
PDF rendering using Playwright.
"""

from pathlib import Path
from datetime import datetime
from playwright.sync_api import Page


def render_page_to_pdf(
    page: Page,
    output_dir: str = "output/pdfs",
    prefix: str = "scrape"
) -> str:
    """
    Render current page as PDF.

    Args:
        page: Playwright page instance
        output_dir: Directory to save PDF
        prefix: Filename prefix

    Returns:
        Full path to saved PDF file
    """
    # Create output directory
    pdf_dir = Path(output_dir)
    pdf_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    filename = f"{prefix}-{timestamp}.pdf"
    pdf_path = pdf_dir / filename

    # Render PDF
    page.pdf(
        path=str(pdf_path),
        format="Letter",
        print_background=True,
        margin={
            'top': '0px',
            'right': '0px',
            'bottom': '0px',
            'left': '0px'
        }
    )

    return str(pdf_path)
