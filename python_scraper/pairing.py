"""
Contact pairing and domain classification.
"""

import re
from typing import List, Optional
from .models import PdfContact, Contact


# Generic email prefixes that should not be used for name derivation
GENERIC_PREFIXES = {
    'info', 'contact', 'admin', 'support', 'help', 'sales',
    'hello', 'team', 'office', 'mail', 'noreply', 'no-reply'
}

# Known personal email domains
PERSONAL_DOMAINS = {
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'mail.com',
    'yandex.com', 'gmx.com', 'zoho.com', 'live.com', 'msn.com'
}


def extract_domain(email: str) -> Optional[str]:
    """
    Extract domain from email address.

    Args:
        email: Email address

    Returns:
        Domain or None
    """
    if '@' in email:
        return email.split('@')[1].lower()
    return None


def classify_domain(domain: Optional[str]) -> str:
    """
    Classify domain as business or personal.

    Args:
        domain: Domain name

    Returns:
        'business' or 'personal'
    """
    if not domain:
        return 'personal'

    if domain in PERSONAL_DOMAINS:
        return 'personal'

    return 'business'


def derive_name_from_email(email: str) -> str:
    """
    Derive name from email prefix.

    Args:
        email: Email address

    Returns:
        Derived name
    """
    if '@' not in email:
        return "Unknown"

    prefix = email.split('@')[0].lower()

    # Check if generic
    if prefix in GENERIC_PREFIXES:
        return "Unknown"

    # Split on common separators
    parts = re.split(r'[._\-]', prefix)

    # Filter out numbers and single characters (except initials)
    name_parts = []
    for part in parts:
        if not part:
            continue

        # Skip pure numbers
        if part.isdigit():
            continue

        # Handle single letters as initials
        if len(part) == 1 and part.isalpha():
            name_parts.append(f"{part.upper()}.")
        else:
            # Title case the part
            name_parts.append(part.capitalize())

    if not name_parts:
        return "Unknown"

    return ' '.join(name_parts)


def calculate_confidence(contact: Contact) -> str:
    """
    Calculate confidence level for contact.

    Args:
        contact: Contact object

    Returns:
        'high', 'medium', or 'low'
    """
    has_name = bool(contact.name and contact.name != "Unknown")
    has_email = bool(contact.email)
    has_phone = bool(contact.phone)

    if has_name and has_email and has_phone:
        return 'high'
    elif (has_name and has_email) or (has_email and has_phone):
        return 'medium'
    else:
        return 'low'


def process_pdf_contacts(
    pdf_contacts: List[PdfContact],
    page_url: str
) -> List[Contact]:
    """
    Process PDF contacts into final Contact format.

    Args:
        pdf_contacts: List of PdfContact objects from extraction
        page_url: URL of the scraped page

    Returns:
        List of Contact objects
    """
    contacts = []

    for pdf_contact in pdf_contacts:
        # Get or derive name
        name = pdf_contact.name
        if not name:
            name = derive_name_from_email(pdf_contact.email)

        # Extract domain
        domain = extract_domain(pdf_contact.email)

        # Classify domain
        domain_type = classify_domain(domain)

        # Create contact
        contact = Contact(
            name=name if name != "Unknown" else None,
            email=pdf_contact.email,
            phone=pdf_contact.phone,
            profileUrl=None,
            source='pdf',
            confidence='medium',  # Will be calculated below
            domain=domain,
            domainType=domain_type
        )

        # Calculate confidence
        contact.confidence = calculate_confidence(contact)

        contacts.append(contact)

    return contacts
