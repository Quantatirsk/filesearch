"""
Base parser class and factory for document parsers.
Follows the technical report recommendations for high-performance parsing.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Type
from pathlib import Path


class BaseParser(ABC):
    """
    Abstract base class for document parsers.
    
    All parsers must implement the parse method to extract plain text
    from their respective file formats.
    """
    
    @abstractmethod
    def parse(self, file_path: str) -> Optional[str]:
        """
        Parse a document and extract plain text content.
        
        Args:
            file_path: Path to the document file
            
        Returns:
            Extracted plain text content or None if parsing fails
        """
        pass
    
    @abstractmethod
    def get_supported_extensions(self) -> list:
        """
        Get the file extensions supported by this parser.
        
        Returns:
            List of supported file extensions (e.g., ['.pdf', '.txt'])
        """
        pass
    
    def is_supported(self, file_path: str) -> bool:
        """
        Check if a file is supported by this parser.
        
        Args:
            file_path: Path to the file to check
            
        Returns:
            True if the file is supported, False otherwise
        """
        file_ext = Path(file_path).suffix.lower()
        return file_ext in self.get_supported_extensions()


class ParserFactory:
    """
    Factory class for creating appropriate document parsers.
    
    Following the technical report's recommendations for high-performance
    libraries for each file format.
    """
    
    _parsers: Dict[str, Type[BaseParser]] = {}
    
    @classmethod
    def register_parser(cls, parser_class: Type[BaseParser]):
        """
        Register a parser class for its supported file extensions.
        
        Args:
            parser_class: Parser class to register
        """
        parser_instance = parser_class()
        for ext in parser_instance.get_supported_extensions():
            cls._parsers[ext.lower()] = parser_class
    
    @classmethod
    def get_parser(cls, file_path: str) -> Optional[BaseParser]:
        """
        Get the appropriate parser for a given file.
        
        Args:
            file_path: Path to the file to parse
            
        Returns:
            Parser instance or None if no parser is available
        """
        file_ext = Path(file_path).suffix.lower()
        parser_class = cls._parsers.get(file_ext)
        
        if parser_class:
            return parser_class()
        
        return None
    
    @classmethod
    def get_supported_extensions(cls) -> list:
        """
        Get all supported file extensions.
        
        Returns:
            List of all supported file extensions
        """
        return list(cls._parsers.keys())
    
    @classmethod
    def is_supported(cls, file_path: str) -> bool:
        """
        Check if a file is supported by any registered parser.
        
        Args:
            file_path: Path to the file to check
            
        Returns:
            True if the file is supported, False otherwise
        """
        file_ext = Path(file_path).suffix.lower()
        return file_ext in cls._parsers


class PlainTextParser(BaseParser):
    """
    Parser for plain text files (.txt, .md).
    
    Uses standard Python file I/O for maximum efficiency as recommended
    in the technical report.
    """
    
    def parse(self, file_path: str) -> Optional[str]:
        """
        Parse a plain text file.
        
        Args:
            file_path: Path to the text file
            
        Returns:
            File content as string or None if parsing fails
        """
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
        except Exception as e:
            print(f"Error parsing text file {file_path}: {e}")
            return None
    
    def get_supported_extensions(self) -> list:
        """Get supported file extensions."""
        return ['.txt', '.md']


class CSVParser(BaseParser):
    """
    Parser for CSV files using pandas.
    
    Following the technical report's recommendation to use pandas.read_csv
    for its highly optimized C implementation.
    """
    
    def parse(self, file_path: str) -> Optional[str]:
        """
        Parse a CSV file and convert to text representation.
        
        Args:
            file_path: Path to the CSV file
            
        Returns:
            CSV content as plain text or None if parsing fails
        """
        try:
            import pandas as pd
            
            # Read CSV with pandas (highly optimized C implementation)
            df = pd.read_csv(file_path, encoding='utf-8', encoding_errors='ignore')
            
            # Convert to string representation for full-text search
            return df.to_string(index=False)
            
        except Exception as e:
            print(f"Error parsing CSV file {file_path}: {e}")
            return None
    
    def get_supported_extensions(self) -> list:
        """Get supported file extensions."""
        return ['.csv']


# Register the basic parsers
ParserFactory.register_parser(PlainTextParser)
ParserFactory.register_parser(CSVParser)