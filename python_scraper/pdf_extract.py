"""
Core PDF extraction with coordinate-based search.
This solves the cross-contamination problem by using spatial awareness.
"""

import re
import pdfplumber
from typing import List, Optional, Tuple
from pathlib import Path

from .models import PdfWord, PdfContact


# Blacklist of UI elements that should never be names
BLACKLIST = {
    'contact', 'email', 'phone', 'website', 'address', 'location',
    'sign in', 'log in', 'sign up', 'log out', 'register', 'login',
    'get help', 'contact us', 'about us', 'view profile', 'view all',
    'learn more', 'read more', 'see more', 'show more', 'load more',
    'find an agent', 'find a', 'search', 'filter', 'back to',
    'click here', 'more info', 'details',
    'menu', 'home', 'listings', 'properties', 'agents',
    'about', 'services', 'resources', 'blog', 'news',
    'compass', 'compass one', 'compass luxury', 'compass academy', 'compass plus',
    'compass cares', 'private exclusives', 'coming soon',
    'new development', 'recently sold', 'sales leadership',
    'neighborhood guides', 'mortgage calculator', 'external suppliers',
    'agent', 'broker', 'realtor', 'licensed', 'certified',
    'team', 'group', 'partners', 'associates',
    'name', 'first name', 'last name', 'full name',
    'your name', 'enter name', 'user name', 'username',
    'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island',
    'new york', 'ny', 'nyc', 'city', 'state', 'zip',
}

# Regex patterns
EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
PHONE_PATTERN = re.compile(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}')
NAME_PATTERN = re.compile(r'^[A-Z][a-zA-Z\'\-\.\s]{1,48}[a-zA-Z]$')


def is_valid_name(text: str) -> bool:
    """
    Validate if text is a valid name.

    Args:
        text: Candidate name text

    Returns:
        True if valid name, False otherwise
    """
    if not text or len(text) < 2 or len(text) > 50:
        return False

    # Check blacklist (case-insensitive)
    text_lower = text.lower()
    if text_lower in BLACKLIST:
        return False

    # Check for partial matches with common UI words
    ui_words = ['find', 'agent', 'last name', 'first name', 'register', 'login', 'view', 'profile']
    if any(word in text_lower for word in ui_words):
        return False

    # Must start with capital letter
    if not text[0].isupper():
        return False

    # Match name pattern
    if not NAME_PATTERN.match(text):
        return False

    return True


def extract_words_from_pdf(pdf_path: str) -> List[PdfWord]:
    """
    Extract all words from PDF with coordinates.

    Args:
        pdf_path: Path to PDF file

    Returns:
        List of PdfWord objects
    """
    words = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            # Extract words with coordinates
            extracted_words = page.extract_words(
                x_tolerance=2,
                y_tolerance=2,
                keep_blank_chars=False
            )

            for word_dict in extracted_words:
                word = PdfWord(
                    text=word_dict['text'],
                    x0=word_dict['x0'],
                    y0=word_dict['top'],
                    x1=word_dict['x1'],
                    y1=word_dict['bottom'],
                    page_num=page_num
                )
                words.append(word)

    return words


def find_emails_in_words(words: List[PdfWord]) -> List[Tuple[str, PdfWord]]:
    """
    Find all email addresses in word list.

    Args:
        words: List of PdfWord objects

    Returns:
        List of tuples (email_text, email_word)
    """
    emails = []

    for word in words:
        matches = EMAIL_PATTERN.findall(word.text)
        for email in matches:
            emails.append((email.lower(), word))

    return emails


def find_name_above_email(
    email_word: PdfWord,
    all_words: List[PdfWord],
    search_distance: float = 60.0,
    x_tolerance: float = 100.0
) -> Optional[str]:
    """
    Find name in bounded region above email.

    This uses coordinate-based spatial search to avoid cross-contamination.

    Args:
        email_word: The email word object
        all_words: All words from PDF
        search_distance: How far above email to search (in points)
        x_tolerance: Horizontal distance tolerance (in points)

    Returns:
        Best matching name or None
    """
    email_x = email_word.center_x
    email_y = email_word.y0  # Top of email

    # Define search bounds
    y_min = email_y - search_distance
    y_max = email_y
    x_min = email_x - x_tolerance
    x_max = email_x + x_tolerance

    # Find all capitalized words in search region
    candidates = []

    for word in all_words:
        # Must be on same page
        if word.page_num != email_word.page_num:
            continue

        # Must be in search bounds
        if not (y_min <= word.center_y <= y_max):
            continue
        if not (x_min <= word.center_x <= x_max):
            continue

        # Must start with capital letter
        if not word.text or not word.text[0].isupper():
            continue

        # Calculate distance from email
        distance = abs(word.center_y - email_y)

        candidates.append((word, distance))

    if not candidates:
        return None

    # Sort by vertical distance (closer to email = better)
    candidates.sort(key=lambda x: x[1])

    # Group consecutive capitalized words into name candidates
    name_candidates = []
    current_group = []
    last_y = None
    last_x = None

    for word, distance in candidates:
        # Check if this word is on the same line as previous
        # (within 5 points vertically and reasonable horizontal distance)
        if (last_y is not None and
            abs(word.y0 - last_y) < 5 and
            last_x is not None and
            abs(word.x0 - last_x) < 150):
            # Same line, add to current group
            current_group.append((word, distance))
        else:
            # New line, save previous group if exists
            if current_group:
                combined_text = ' '.join([w.text for w, _ in current_group])
                avg_distance = sum([d for _, d in current_group]) / len(current_group)
                if is_valid_name(combined_text):
                    name_candidates.append((combined_text, avg_distance))

            # Start new group
            current_group = [(word, distance)]

        last_y = word.y0
        last_x = word.x1

    # Don't forget last group
    if current_group:
        combined_text = ' '.join([w.text for w, _ in current_group])
        avg_distance = sum([d for _, d in current_group]) / len(current_group)
        if is_valid_name(combined_text):
            name_candidates.append((combined_text, avg_distance))

    # Return closest valid name
    if name_candidates:
        name_candidates.sort(key=lambda x: x[1])
        return name_candidates[0][0]

    return None


def find_phone_below_email(
    email_word: PdfWord,
    all_words: List[PdfWord],
    search_distance: float = 40.0,
    x_tolerance: float = 100.0
) -> Optional[str]:
    """
    Find phone number in bounded region below email.

    Args:
        email_word: The email word object
        all_words: All words from PDF
        search_distance: How far below email to search (in points)
        x_tolerance: Horizontal distance tolerance (in points)

    Returns:
        Phone number or None
    """
    email_x = email_word.center_x
    email_y = email_word.y1  # Bottom of email

    # Define search bounds
    y_min = email_y
    y_max = email_y + search_distance
    x_min = email_x - x_tolerance
    x_max = email_x + x_tolerance

    # Find all words in search region
    phone_candidates = []

    for word in all_words:
        # Must be on same page
        if word.page_num != email_word.page_num:
            continue

        # Must be in search bounds
        if not (y_min <= word.center_y <= y_max):
            continue
        if not (x_min <= word.center_x <= x_max):
            continue

        # Check if contains phone pattern
        matches = PHONE_PATTERN.findall(word.text)
        if matches:
            distance = abs(word.center_y - email_y)
            phone_candidates.append((matches[0], distance))

    # Return closest phone
    if phone_candidates:
        phone_candidates.sort(key=lambda x: x[1])
        phone = phone_candidates[0][0]

        # Normalize phone format
        digits = re.sub(r'\D', '', phone)
        if len(digits) == 10:
            return f"+1-{digits[:3]}-{digits[3:6]}-{digits[6:]}"
        elif len(digits) == 11 and digits[0] == '1':
            return f"+{digits[0]}-{digits[1:4]}-{digits[4:7]}-{digits[7:]}"
        else:
            return phone

    return None


def extract_contacts_from_pdf(pdf_path: str) -> List[PdfContact]:
    """
    Extract contacts from PDF using coordinate-based spatial search.

    This is the main function that solves the cross-contamination problem.

    Args:
        pdf_path: Path to PDF file

    Returns:
        List of PdfContact objects
    """
    # Validate PDF exists
    if not Path(pdf_path).exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    # Extract all words with coordinates
    all_words = extract_words_from_pdf(pdf_path)

    if not all_words:
        return []

    # Find all emails
    emails = find_emails_in_words(all_words)

    if not emails:
        return []

    # Process each email
    contacts = []
    seen_emails = set()

    for email_text, email_word in emails:
        # Skip duplicates
        if email_text in seen_emails:
            continue
        seen_emails.add(email_text)

        # Find name above email
        name = find_name_above_email(email_word, all_words)

        # Find phone below email
        phone = find_phone_below_email(email_word, all_words)

        # Create contact
        contact = PdfContact(
            email=email_text,
            name=name,
            phone=phone,
            email_coords={
                'x': email_word.center_x,
                'y': email_word.center_y,
                'page': email_word.page_num
            },
            page_num=email_word.page_num
        )

        contacts.append(contact)

    return contacts
