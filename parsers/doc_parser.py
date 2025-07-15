"""
DOC parser using pyantiword (antiword wrapper).

Following the technical report's recommendation for antiword as the
mature tool for extracting text from legacy .doc files.
"""

from typing import Optional
from .base_parser import BaseParser, ParserFactory
from pyantiword.antiword_wrapper import extract_text_with_antiword


class DOCParser(BaseParser):
    """
    Parser for legacy Word documents (.doc) using antiword.
    
    As recommended in the technical report, antiword is the mature
    command-line tool for extracting text from .doc files.
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
            return doc_text(file_path)
        except Exception as e:
            print(f"Error parsing DOC file {file_path}: {e}")
            return None
    
    def get_supported_extensions(self) -> list:
        """Get supported file extensions."""
        return ['.doc']


def doc_text(doc_file_path):
    """
    Extract text from doc file and optimize formatting by merging lines without leading spaces to the previous line.
    This fixes the issue where doc files are rendered with visual line breaks.
    Special handling for table rows that contain | characters.
    """
    # Extract text from the doc file
    text = extract_text_with_antiword(doc_file_path)
    
    if not text:
        return text
    
    def is_table_row(line):
        """Check if a line appears to be a table row with | separators"""
        return '|' in line and line.count('|') >= 2
    

    lines = text.split('\n')
    optimized_lines = []
    
    for i, line in enumerate(lines):
        if i == 0:
            # First line always gets added
            optimized_lines.append(line)
        else:
            # Check if current line starts with space, is empty, or is a table row
            if line.startswith(' ') or line.strip() == '' or is_table_row(line):
                # Line starts with space, is empty, or is a table row - keep as separate line
                optimized_lines.append(line)
            else:
                # Line doesn't start with space and is not a table row, merge with previous line
                if optimized_lines and optimized_lines[-1].strip() != '':
                    # Merge directly without adding space
                    optimized_lines[-1] += line
                else:
                    # Previous line was empty, start new line
                    optimized_lines.append(line)
    
    # Final step: remove leading spaces from each line (except table rows)
    final_lines = []
    for line in optimized_lines:
        if is_table_row(line):
            # Keep table rows as they are
            final_lines.append(line)
        else:
            # Remove leading spaces from non-table lines
            final_lines.append(line.lstrip(' '))
    
    return '\n'.join(final_lines)

# Register the DOC parser
ParserFactory.register_parser(DOCParser)


if __name__ == "__main__":
    # Example usage
    doc_file_path = "example.doc"
    optimized_text = doc_text(doc_file_path)
    print(optimized_text)
