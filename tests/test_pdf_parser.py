#!/usr/bin/env python3
"""
Test script for PDF parser using demo.pdf file.
Extracts content and writes to text file for inspection.
"""

from parsers.pdf_parser import PDFParser
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def test_pdf_parser():
    """Test PDF parser with demo.pdf file."""

    # Input file path (check for actual PDF file)
    pdf_files = [
        project_root / "example" / "demo.pdf",
        project_root / "example" / "大语言模型科普报告.pdf"
    ]

    # Find the first existing PDF file
    pdf_file = None
    for file in pdf_files:
        if file.exists():
            pdf_file = file
            break

    if pdf_file is None:
        print("No PDF file found in example directory")
        return False

    # Check if file exists
    if not pdf_file.exists():
        print(f"Error: {pdf_file} does not exist")
        return False

    print(f"Testing PDF parser with: {pdf_file}")

    # Create parser
    parser = PDFParser()

    # Extract content
    content = parser.parse(str(pdf_file))

    if content is None:
        print("Failed to extract content from PDF")
        return False

    # Output file path
    output_file = project_root / "tests" / "demo_pdf_content.txt"

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
    success = test_pdf_parser()
    sys.exit(0 if success else 1)
