"""
Document parsers for different file formats.
"""

# Import all parsers to ensure they are registered with ParserFactory
from .base_parser import ParserFactory, CSVParser
from .text_parser import EnhancedTextParser, PlainTextParser
from .pdf_parser import PDFParser
from .docx_parser import DOCXParser
from .doc_parser import DOCParser
from .xlsx_parser import XLSXParser
from .xls_parser import XLSParser

# Register the enhanced text parser
ParserFactory.register_parser(EnhancedTextParser)
