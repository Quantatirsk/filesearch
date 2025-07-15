"""
DOCX parser using direct XML parsing.

Following the technical report's recommendation to use lxml + zipfile
for fastest DOCX text extraction by bypassing high-level API overhead.
"""

from typing import Optional
from .base_parser import BaseParser, ParserFactory
import zipfile
import io


class DOCXParser(BaseParser):
    """
    High-performance DOCX parser using direct XML parsing.
    
    As recommended in the technical report, this approach bypasses the
    python-docx high-level API overhead by directly parsing the underlying
    XML structure using lxml's C-based implementation.
    """
    
    def parse(self, file_path: str) -> Optional[str]:
        """
        Parse a DOCX file by directly extracting text from XML.
        
        Args:
            file_path: Path to the DOCX file
            
        Returns:
            Extracted plain text or None if parsing fails
        """
        try:
            from lxml import etree
            
            # Open DOCX file as ZIP archive
            with zipfile.ZipFile(file_path, 'r') as zip_file:
                # Read the main document XML
                try:
                    xml_content = zip_file.read('word/document.xml')
                except KeyError:
                    print(f"Invalid DOCX file: missing word/document.xml in {file_path}")
                    return None
                
                # Parse XML with lxml (C-based, very fast)
                root = etree.fromstring(xml_content)
                
                # Define namespace for Word documents
                namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                
                # Extract paragraphs instead of individual text nodes
                paragraphs = root.xpath('//w:p', namespaces=namespace)
                
                # Extract text from each paragraph
                paragraph_texts = []
                for paragraph in paragraphs:
                    # Get all text nodes within this paragraph
                    text_nodes = paragraph.xpath('.//w:t/text()', namespaces=namespace)
                    paragraph_text = ''.join(text_nodes).strip()
                    
                    if paragraph_text:  # Only add non-empty paragraphs
                        paragraph_texts.append(paragraph_text)
                
                # Join paragraphs with double newlines for clear separation
                return '\n\n'.join(paragraph_texts)
                
        except ImportError:
            print("lxml is not installed. Please install it with: pip install lxml")
            return None
        except Exception as e:
            print(f"Error parsing DOCX file {file_path}: {e}")
            return None
    
    def get_supported_extensions(self) -> list:
        """Get supported file extensions."""
        return ['.docx']


class DOCXParserFallback(BaseParser):
    """
    Fallback DOCX parser using docx2txt.
    
    This is a simpler alternative if direct XML parsing is considered
    too complex, as mentioned in the technical report.
    """
    
    def parse(self, file_path: str) -> Optional[str]:
        """
        Parse a DOCX file using docx2txt.
        
        Args:
            file_path: Path to the DOCX file
            
        Returns:
            Extracted plain text or None if parsing fails
        """
        try:
            import docx2txt
            
            # Extract text using docx2txt (simpler but potentially slower)
            text = docx2txt.process(file_path)
            
            return text if text else None
            
        except ImportError:
            print("docx2txt is not installed. Please install it with: pip install docx2txt")
            return None
        except Exception as e:
            print(f"Error parsing DOCX file {file_path}: {e}")
            return None
    
    def get_supported_extensions(self) -> list:
        """Get supported file extensions."""
        return ['.docx']


# Register the primary DOCX parser
ParserFactory.register_parser(DOCXParser)