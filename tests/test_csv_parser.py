#!/usr/bin/env python3
"""
Test script for CSV parser using demo.csv file.
Extracts content and writes to text file for inspection.
"""

from parsers.base_parser import ParserFactory
import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def test_csv_parser():
    """Test CSV parser with demo.csv file."""

    # Input file path
    csv_file = project_root / "example" / "demo.csv"

    # Check if file exists
    if not csv_file.exists():
        print(f"Error: {csv_file} does not exist")
        return False

    print(f"Testing CSV parser with: {csv_file}")

    # Get parser from factory
    parser = ParserFactory.get_parser(str(csv_file))

    if parser is None:
        print("No parser found for CSV file")
        return False

    print(f"Parser type: {type(parser).__name__}")

    # Extract content
    content = parser.parse(str(csv_file))

    if content is None:
        print("Failed to extract content from CSV")
        return False

    # Output file path
    output_file = project_root / "tests" / "demo_csv_content.txt"

    # Write content to file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(content)

        print("Content extracted successfully!")
        print(f"Output written to: {output_file}")
        print(f"Content length: {len(content)} characters")

        # Show first 200 characters as preview
        preview = content[:200].replace('\n', ' ').strip()
        print(f"Preview: {preview}...")

        return True

    except Exception as e:
        print(f"Error writing output file: {e}")
        return False


if __name__ == "__main__":
    success = test_csv_parser()
    sys.exit(0 if success else 1)
