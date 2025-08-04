#!/usr/bin/env python3
"""
Test script for DOCX parser using demo.docx file.
Extracts content and writes to text file for inspection.
"""

from parsers.docx_parser import DOCXParser
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def test_docx_parser():
    """Test DOCX parser with demo.docx file."""

    # Input file path
    docx_file = project_root / "example" / "demo.docx"

    # Check if file exists
    if not docx_file.exists():
        print(f"Error: {docx_file} does not exist")
        return False

    print(f"Testing DOCX parser with: {docx_file}")

    # Create parser
    parser = DOCXParser()

    # Extract content
    content = parser.parse(str(docx_file))

    if content is None:
        print("Failed to extract content from DOCX")
        return False

    # Output file path
    output_file = project_root / "tests" / "demo_docx_content.txt"

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
    success = test_docx_parser()
    sys.exit(0 if success else 1)
