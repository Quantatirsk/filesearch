"""
Metadata-only parser for universal file type support.

This parser extracts only file metadata (path, size, times) without
attempting to parse text content. It serves as a fallback parser for
all file types that don't have specialized text content parsers.
"""

from .base_parser import ParserFactory
import os
import mimetypes
from pathlib import Path
from typing import Optional, List
from .base_parser import BaseParser


class MetadataOnlyParser(BaseParser):
    """
    Universal parser that extracts only file metadata.

    This parser supports all file types and returns empty content,
    allowing files to be indexed by metadata (path, size, creation/modification time)
    while being searchable through path search functionality.
    """

    def parse(self, file_path: str) -> Optional[str]:
        """
        Extract metadata-only from any file type.

        Args:
            file_path: Path to the file

        Returns:
            Empty string (no text content) or None if file is inaccessible
        """
        try:
            file_path_obj = Path(file_path)

            # Check if file exists and is accessible
            if not file_path_obj.exists():
                return None

            if not file_path_obj.is_file():
                return None

            # Check if file is readable
            if not os.access(file_path, os.R_OK):
                return None

            # For metadata-only indexing, return empty string
            # This allows the file to be indexed in docs_meta table
            # but not in docs_fts table
            return ""

        except Exception as e:
            print(f"Error accessing file metadata for {file_path}: {e}")
            return None

    def get_supported_extensions(self) -> List[str]:
        """
        Get supported file extensions.

        Returns:
            List containing wildcard to match all file types
        """
        # Return wildcard to indicate support for all file types
        return ['*']

    def is_supported(self, file_path: str) -> bool:
        """
        Check if a file is supported by this parser.

        Args:
            file_path: Path to the file to check

        Returns:
            True for all files (universal support)
        """
        try:
            file_path_obj = Path(file_path)
            # Support all files that exist and are regular files
            return file_path_obj.exists() and file_path_obj.is_file()
        except Exception:
            return False

    def get_file_mime_type(self, file_path: str) -> Optional[str]:
        """
        Get MIME type of the file.

        Args:
            file_path: Path to the file

        Returns:
            MIME type string or None if cannot be determined
        """
        try:
            mime_type, _ = mimetypes.guess_type(file_path)
            return mime_type
        except Exception:
            return None

    def get_file_category(self, file_path: str) -> str:
        """
        Categorize file based on extension and MIME type.

        Args:
            file_path: Path to the file

        Returns:
            File category string
        """
        try:
            file_path_obj = Path(file_path)
            extension = file_path_obj.suffix.lower()
            mime_type = self.get_file_mime_type(file_path)

            # Image files
            if mime_type and mime_type.startswith('image/'):
                return 'image'
            elif extension in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.svg', '.webp', '.ico']:
                return 'image'

            # Audio files
            elif mime_type and mime_type.startswith('audio/'):
                return 'audio'
            elif extension in ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma']:
                return 'audio'

            # Video files
            elif mime_type and mime_type.startswith('video/'):
                return 'video'
            elif extension in ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v']:
                return 'video'

            # Archive/Compressed files
            elif extension in ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tar.gz', '.tar.bz2']:
                return 'archive'

            # Executable files
            elif extension in ['.exe', '.msi', '.dmg', '.app', '.deb', '.rpm', '.appimage']:
                return 'executable'

            # Document files (that have text content parsers)
            elif extension in ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']:
                return 'document'

            # Text/Code files (that have text content parsers)
            elif extension in ['.txt', '.md', '.py', '.js', '.html', '.css', '.json', '.xml', '.csv']:
                return 'text'

            # Other/Unknown
            else:
                return 'other'

        except Exception:
            return 'other'


# Register the metadata parser with the factory
ParserFactory.register_parser(MetadataOnlyParser)
