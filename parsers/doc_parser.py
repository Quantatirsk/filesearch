"""
DOC parser using doc2txt library.

Using the doc2txt library which provides a Python wrapper around antiword
with cross-platform binary files and text optimization features.
"""

from typing import Optional
from .base_parser import BaseParser, ParserFactory
from doc2txt import extract_text


class DOCParser(BaseParser):
    """
    Parser for legacy Word documents (.doc) using doc2txt library.
    
    The doc2txt library provides a Python wrapper around antiword
    with built-in cross-platform support and text optimization.
    """
    
    def parse(self, file_path: str) -> Optional[str]:
        """
        Parse a DOC file and extract optimized text.
        
        Args:
            file_path: Path to the DOC file
            
        Returns:
            Extracted and optimized text or None if parsing fails
        """
        try:
            return extract_text(file_path, optimize_format=True)
        except Exception as e:
            print(f"Error parsing DOC file {file_path}: {e}")
            return None
    
    def get_supported_extensions(self) -> list:
        """Get supported file extensions."""
        return ['.doc']



# Register the DOC parser
ParserFactory.register_parser(DOCParser)


if __name__ == "__main__":
    # Example usage
    doc_file_path = "/Users/quant/Documents/filesearch/example/demo.doc"
    optimized_text = extract_text(doc_file_path, optimize_format=True)
    print(optimized_text)
