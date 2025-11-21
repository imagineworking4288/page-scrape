"""
Data models for PDF scraper.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from datetime import datetime


@dataclass
class PdfWord:
    """Represents a word extracted from PDF with spatial coordinates."""
    text: str
    x0: float  # Left boundary
    y0: float  # Top boundary
    x1: float  # Right boundary
    y1: float  # Bottom boundary
    page_num: int

    @property
    def center_x(self) -> float:
        """Calculate horizontal center of word."""
        return (self.x0 + self.x1) / 2

    @property
    def center_y(self) -> float:
        """Calculate vertical center of word."""
        return (self.y0 + self.y1) / 2

    @property
    def width(self) -> float:
        """Calculate width of word."""
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        """Calculate height of word."""
        return self.y1 - self.y0


@dataclass
class PdfContact:
    """Intermediate structure during PDF extraction."""
    email: str
    name: Optional[str] = None
    phone: Optional[str] = None
    email_coords: Dict[str, float] = field(default_factory=dict)  # {x, y, page}
    page_num: int = 0

    def __post_init__(self):
        """Ensure email_coords has required keys."""
        if not self.email_coords:
            self.email_coords = {'x': 0.0, 'y': 0.0, 'page': self.page_num}


@dataclass
class Contact:
    """Final output structure matching Node.js format."""
    name: Optional[str]
    email: str
    phone: Optional[str] = None
    profileUrl: Optional[str] = None
    source: str = "pdf"
    confidence: str = "medium"
    domain: Optional[str] = None
    domainType: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "profileUrl": self.profileUrl,
            "source": self.source,
            "confidence": self.confidence,
            "domain": self.domain,
            "domainType": self.domainType,
        }

    @property
    def is_complete(self) -> bool:
        """Check if contact has all critical fields."""
        return bool(self.name and self.email and self.phone)

    @property
    def has_name(self) -> bool:
        """Check if contact has a name."""
        return bool(self.name)

    @property
    def has_phone(self) -> bool:
        """Check if contact has a phone number."""
        return bool(self.phone)
