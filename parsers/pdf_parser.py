"""
PDF parser using PyMuPDF (fitz).

Following the technical report's recommendation for PyMuPDF as the
fastest PDF parsing library with C-language implementation.
"""

from typing import Optional
import re
from .base_parser import BaseParser, ParserFactory


class PDFParser(BaseParser):
    """
    High-performance PDF parser using PyMuPDF.

    As recommended in the technical report, PyMuPDF (fitz) is the fastest
    PDF text extraction library, outperforming PyPDF2 by 12x and PDFMiner by 28x.
    """

    def _fix_text_line_breaks(self, text: str) -> str:
        """
        Fix broken line breaks in PDF text while preserving sentence integrity.

        This method uses fast string operations to:
        1. Join lines that are part of the same sentence
        2. Preserve intentional paragraph breaks
        3. Handle both Chinese and English text

        Args:
            text: Raw text from PDF extraction

        Returns:
            Text with restored sentence integrity
        """
        if not text:
            return text

        # Split into lines and process
        lines = text.split('\n')
        result = []
        current_paragraph = []

        for line in lines:
            line = line.strip()

            # Empty line indicates paragraph break
            if not line:
                if current_paragraph:
                    # Join current paragraph and add to result
                    paragraph_text = self._join_paragraph_lines(current_paragraph)
                    if paragraph_text:
                        result.append(paragraph_text)
                    current_paragraph = []
                continue

            # Check if this line should start a new paragraph
            if self._should_start_new_paragraph(line, current_paragraph):
                if current_paragraph:
                    paragraph_text = self._join_paragraph_lines(current_paragraph)
                    if paragraph_text:
                        result.append(paragraph_text)
                    current_paragraph = []

            current_paragraph.append(line)

        # Handle remaining paragraph
        if current_paragraph:
            paragraph_text = self._join_paragraph_lines(current_paragraph)
            if paragraph_text:
                result.append(paragraph_text)

        # Join paragraphs with double newlines
        return '\n\n'.join(result)

    def _join_paragraph_lines(self, lines: list) -> str:
        """
        Join lines within a paragraph intelligently.

        Args:
            lines: List of lines in the paragraph

        Returns:
            Joined paragraph text
        """
        if not lines:
            return ""

        if len(lines) == 1:
            return lines[0]

        result = []

        for i, line in enumerate(lines):
            if i == 0:
                result.append(line)
                continue

            prev_line = lines[i - 1]

            # Check if we should join with previous line
            if self._should_join_lines(prev_line, line):
                # Join without space (especially for Chinese text)
                result[-1] += line
            else:
                # Keep as separate line
                result.append(line)

        return '\n'.join(result)

    def _should_start_new_paragraph(self, line: str, current_paragraph: list) -> bool:
        """
        Determine if a line should start a new paragraph.

        Args:
            line: Current line to check
            current_paragraph: Current paragraph lines

        Returns:
            True if should start new paragraph
        """
        if not current_paragraph:
            return False

        # Check for common paragraph starters
        paragraph_starters = [
            r'^\d+[\.\)]\s',  # 1. or 1)
            r'^[一二三四五六七八九十]+[\.\)、]\s',  # Chinese numerals
            r'^[（\(]\d+[）\)]\s',  # (1)
            r'^[A-Z][a-z]*:\s',  # Title: format
            r'^第[一二三四五六七八九十百千万]+[章节部分]\s',  # Chapter indicators
            r'^[•·]\s',  # Bullet points
            r'^-\s',  # Dash bullets
            r'^\*\s',  # Asterisk bullets
        ]

        for pattern in paragraph_starters:
            if re.match(pattern, line):
                return True

        return False

    def _should_join_lines(self, prev_line: str, current_line: str) -> bool:
        """
        Determine if two lines should be joined.

        Args:
            prev_line: Previous line
            current_line: Current line

        Returns:
            True if lines should be joined
        """
        if not prev_line or not current_line:
            return False

        # Don't join if current line starts with special characters
        if re.match(r'^[•·\-\*\d\(\)（）]', current_line):
            return False

        # Don't join if current line looks like a title (all caps, etc.)
        if current_line.isupper() and len(current_line) < 50:
            return False

        # Don't join if previous line ends with certain punctuation
        if re.search(r'[。！？：；]$', prev_line):
            return False

        # Don't join if previous line ends with English sentence endings
        if re.search(r'[.!?:]$', prev_line) and not re.search(r'\b[A-Z][a-z]*\.$', prev_line):
            return False

        # Join if previous line doesn't end with proper punctuation
        # This is the main case for broken lines
        if not re.search(r'[。！？：；.!?:]$', prev_line):
            return True

        # Join if previous line ends with comma or other continuing punctuation
        if re.search(r'[，,、]$', prev_line):
            return True

        return False

    def _is_scanned_pdf(self, doc) -> bool:
        """
        检测PDF是否为扫描件（主要包含图像而非文本）

        Args:
            doc: PyMuPDF document object

        Returns:
            True if PDF appears to be a scanned document
        """
        try:
            total_pages = len(doc)
            if total_pages == 0:
                return True

            # 检查前几页的文本内容
            pages_to_check = min(3, total_pages)
            total_text_chars = 0
            total_image_count = 0

            for page_num in range(pages_to_check):
                page = doc[page_num]

                # 获取文本内容
                text = page.get_text().strip()
                total_text_chars += len(text)

                # 获取图像信息
                image_list = page.get_images()
                total_image_count += len(image_list)

                # 检查是否有大图像占据页面
                if image_list:
                    page_rect = page.rect
                    page_area = page_rect.width * page_rect.height

                    for img in image_list:
                        try:
                            # 获取图像的显示区域
                            image_bbox = page.get_image_bbox(img)
                            if image_bbox:
                                img_area = image_bbox.width * image_bbox.height
                                # 如果图像占据页面面积超过50%，很可能是扫描件
                                if img_area > page_area * 0.5:
                                    return True
                        except BaseException:
                            continue

            # 判断标准：
            # 1. 平均每页文本字符数少于100且有图像 -> 可能是扫描件
            # 2. 总文本字符数少于50 -> 很可能是扫描件
            # 3. 有图像但文本很少 -> 可能是扫描件

            avg_text_per_page = total_text_chars / pages_to_check

            if total_text_chars < 50:
                return True

            if total_image_count > 0 and avg_text_per_page < 100:
                return True

            return False

        except Exception as e:
            print(f"Error checking if PDF is scanned: {e}")
            return False

    def parse(self, file_path: str) -> Optional[str]:
        """
        Parse a PDF file and extract plain text.

        Args:
            file_path: Path to the PDF file

        Returns:
            Extracted plain text or None if parsing fails
        """
        try:
            import pymupdf  # imports the pymupdf library

            # Open the PDF document
            doc = pymupdf.open(file_path)

            # 检测是否为扫描件
            if self._is_scanned_pdf(doc):
                doc.close()
                print(f"Skipping scanned PDF: {file_path}")
                return None

            text_content = []

            # Extract text from each page
            for page in doc:  # iterate the document pages
                # Use get_text() for maximum speed as recommended
                text = page.get_text()  # get plain text encoded as UTF-8
                if text.strip():
                    text_content.append(text)

            doc.close()

            # 如果没有提取到任何文本，返回None
            if not text_content:
                print(f"No text content found in PDF: {file_path}")
                return None

            # Join all pages with double newlines
            raw_text = '\n\n'.join(text_content)

            # Fix line breaks and restore sentence integrity
            return self._fix_text_line_breaks(raw_text)

        except ImportError:
            print("PyMuPDF is not installed. Please install it with: pip install PyMuPDF")
            return None
        except Exception as e:
            print(f"Error parsing PDF file {file_path}: {e}")
            return None

    def get_supported_extensions(self) -> list:
        """Get supported file extensions."""
        return ['.pdf']


# Register the PDF parser
ParserFactory.register_parser(PDFParser)
