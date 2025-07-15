"""
XLS parser using xlrd.

Following the technical report's recommendation for xlrd as the
industry standard for legacy .xls file reading.
"""

from typing import Optional
from .base_parser import BaseParser, ParserFactory


class XLSParser(BaseParser):
    """
    Parser for legacy Excel files (.xls) using xlrd.
    
    As recommended in the technical report, xlrd is the industry standard
    for reading legacy .xls files. Note that xlrd 2.0+ removed support
    for .xlsx files to focus on .xls performance.
    """
    
    def parse(self, file_path: str) -> Optional[str]:
        """
        Parse an XLS file and extract text content.
        
        Args:
            file_path: Path to the XLS file
            
        Returns:
            Extracted text content or None if parsing fails
        """
        try:
            import xlrd
            
            # Open the workbook
            workbook = xlrd.open_workbook(file_path)
            text_content = []
            
            # Process all sheets
            for sheet_name in workbook.sheet_names():
                sheet = workbook.sheet_by_name(sheet_name)
                
                # Add sheet name as header
                text_content.append(f"=== {sheet_name} ===")
                
                # Extract text from all cells
                for row_idx in range(sheet.nrows):
                    row_text = []
                    for col_idx in range(sheet.ncols):
                        cell = sheet.cell(row_idx, col_idx)
                        
                        # Handle different cell types
                        if cell.ctype == xlrd.XL_CELL_EMPTY:
                            row_text.append("")
                        elif cell.ctype == xlrd.XL_CELL_TEXT:
                            row_text.append(cell.value)
                        elif cell.ctype == xlrd.XL_CELL_NUMBER:
                            row_text.append(str(cell.value))
                        elif cell.ctype == xlrd.XL_CELL_DATE:
                            # Convert date to string
                            date_tuple = xlrd.xldate_as_tuple(cell.value, workbook.datemode)
                            row_text.append(str(date_tuple))
                        elif cell.ctype == xlrd.XL_CELL_BOOLEAN:
                            row_text.append(str(bool(cell.value)))
                        else:
                            row_text.append(str(cell.value))
                    
                    # Only add rows that have content
                    if any(str(cell).strip() for cell in row_text):
                        text_content.append('\t'.join(row_text))
                
                text_content.append("")  # Empty line between sheets
            
            return '\n'.join(text_content)
            
        except ImportError:
            print("xlrd is not installed. Please install it with: pip install xlrd")
            return None
        except Exception as e:
            print(f"Error parsing XLS file {file_path}: {e}")
            return None
    
    def get_supported_extensions(self) -> list:
        """Get supported file extensions."""
        return ['.xls']


# Register the XLS parser
ParserFactory.register_parser(XLSParser)