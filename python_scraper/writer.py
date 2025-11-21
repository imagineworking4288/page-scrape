"""
Output file writers (JSON and CSV).
"""

import json
import csv
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any
from collections import defaultdict

from .models import Contact


def calculate_domain_stats(contacts: List[Contact]) -> Dict[str, Any]:
    """
    Calculate domain statistics matching Node.js format.

    Args:
        contacts: List of Contact objects

    Returns:
        Domain statistics dictionary
    """
    # Count domains
    domain_counts = defaultdict(int)
    business_counts = defaultdict(int)
    personal_count = 0
    business_count = 0

    for contact in contacts:
        if contact.domain:
            domain_counts[contact.domain] += 1

            if contact.domainType == 'business':
                business_counts[contact.domain] += 1
                business_count += 1
            elif contact.domainType == 'personal':
                personal_count += 1

    # Sort by count
    top_domains = sorted(
        domain_counts.items(),
        key=lambda x: x[1],
        reverse=True
    )

    top_business = sorted(
        business_counts.items(),
        key=lambda x: x[1],
        reverse=True
    )

    # Calculate percentages
    total = len(contacts)
    top_domains_list = [
        {
            "domain": domain,
            "count": count,
            "percentage": f"{(count / total * 100):.1f}" if total > 0 else "0.0"
        }
        for domain, count in top_domains[:10]
    ]

    top_business_list = [
        {
            "domain": domain,
            "count": count,
            "percentage": f"{(count / business_count * 100):.1f}" if business_count > 0 else "0.0"
        }
        for domain, count in top_business[:10]
    ]

    return {
        "uniqueDomains": len(domain_counts),
        "businessDomains": len(business_counts),
        "personalDomains": len([d for d, c in domain_counts.items()
                                if any(contact.domain == d and contact.domainType == 'personal'
                                      for contact in contacts)]),
        "businessEmailCount": business_count,
        "personalEmailCount": personal_count,
        "topDomains": top_domains_list,
        "topBusinessDomains": top_business_list
    }


def write_json(
    contacts: List[Contact],
    url: str,
    output_dir: str = "output",
    prefix: str = "contacts"
) -> str:
    """
    Write contacts to JSON file.

    Args:
        contacts: List of Contact objects
        url: Source URL
        output_dir: Output directory
        prefix: Filename prefix

    Returns:
        Path to output file
    """
    # Create output directory
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename
    timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%S-%f")[:-3] + "Z"
    filename = f"{prefix}-{timestamp}.json"
    output_path = out_dir / filename

    # Calculate statistics
    domain_stats = calculate_domain_stats(contacts)

    # Build output structure
    output = {
        "metadata": {
            "scrapedAt": datetime.utcnow().isoformat()[:-3] + "Z",
            "url": url,
            "totalContacts": len(contacts),
            "domainStats": domain_stats
        },
        "contacts": [contact.to_dict() for contact in contacts]
    }

    # Write JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    return str(output_path)


def write_csv(
    contacts: List[Contact],
    output_dir: str = "output",
    prefix: str = "contacts"
) -> str:
    """
    Write contacts to CSV file.

    Args:
        contacts: List of Contact objects
        output_dir: Output directory
        prefix: Filename prefix

    Returns:
        Path to output file
    """
    # Create output directory
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename
    timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%S-%f")[:-3] + "Z"
    filename = f"{prefix}-{timestamp}.csv"
    output_path = out_dir / filename

    # CSV headers
    headers = ['name', 'email', 'phone', 'domain', 'domainType', 'source', 'confidence']

    # Write CSV
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()

        for contact in contacts:
            row = {
                'name': contact.name or '',
                'email': contact.email,
                'phone': contact.phone or '',
                'domain': contact.domain or '',
                'domainType': contact.domainType or '',
                'source': contact.source,
                'confidence': contact.confidence
            }
            writer.writerow(row)

    return str(output_path)
