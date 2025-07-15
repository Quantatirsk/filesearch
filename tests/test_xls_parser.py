#!/usr/bin/env python3
"""
Test script for XLS parser using demo.xls file.
Extracts content and writes to text file for inspection.
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from parsers.xls_parser import XLSParser

def test_xls_parser():
    """Test XLS parser with demo.xls file."""
    
    # Input file path
    xls_file = project_root / "example" / "demo.xls"
    
    # Check if file exists
    if not xls_file.exists():
        print(f"Error: {xls_file} does not exist")
        return False
    
    print(f"Testing XLS parser with: {xls_file}")
    
    # Create parser
    parser = XLSParser()
    
    # Extract content
    content = parser.parse(str(xls_file))
    
    if content is None:
        print("Failed to extract content from XLS")
        return False
    
    # Output file path
    output_file = project_root / "tests" / "demo_xls_content.txt"
    
    # Write content to file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"Content extracted successfully!")
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
    success = test_xls_parser()
    sys.exit(0 if success else 1)