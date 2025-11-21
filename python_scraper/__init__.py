"""
Python-based PDF scraper with coordinate-based extraction.
Solves cross-contamination issues in contact extraction.
"""

from .models import PdfWord, PdfContact, Contact
from .browser import BrowserManager
from .pdf_extract import extract_contacts_from_pdf
from .pairing import process_pdf_contacts

__version__ = "1.0.0"

__all__ = [
    "PdfWord",
    "PdfContact",
    "Contact",
    "BrowserManager",
    "extract_contacts_from_pdf",
    "process_pdf_contacts",
]
