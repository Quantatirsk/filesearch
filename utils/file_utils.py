"""
File system utilities using modern pathlib and shutil.

Following the technical report's recommendation for pathlib-based
file operations and robust error handling.
"""

import shutil
from pathlib import Path
from typing import List, Generator, Dict, Any
import time


class FileUtils:
    """
    Modern file system utilities using pathlib and shutil.

    Following the technical report's recommendations for:
    - pathlib for cross-platform path operations
    - shutil for robust file operations
    - Comprehensive error handling
    """

    @staticmethod
    def discover_files(root_dir: str, extensions: List[str]) -> Generator[Path, None, None]:
        """
        Discover files with specified extensions in a directory tree.

        Args:
            root_dir: Root directory to search in
            extensions: List of file extensions to search for (e.g., ['.pdf', '.txt'])

        Yields:
            Path objects for matching files
        """
        root_path = Path(root_dir)

        if not root_path.exists():
            print(f"Directory does not exist: {root_dir}")
            return

        if not root_path.is_dir():
            print(f"Path is not a directory: {root_dir}")
            return

        # Normalize extensions to lowercase
        extensions = [ext.lower() for ext in extensions]

        try:
            # Use rglob for recursive search (faster than os.walk)
            for file_path in root_path.rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in extensions:
                    yield file_path
        except PermissionError as e:
            print(f"Permission denied accessing {root_dir}: {e}")
        except Exception as e:
            print(f"Error discovering files in {root_dir}: {e}")

    @staticmethod
    def discover_all_files(root_dir: str, max_file_size: int = None) -> Generator[Path, None, None]:
        """
        Discover all files in a directory tree regardless of type.

        Args:
            root_dir: Root directory to search in
            max_file_size: Maximum file size in bytes (None = no limit, removed size restriction)

        Yields:
            Path objects for all files found
        """
        root_path = Path(root_dir)

        if not root_path.exists():
            print(f"Directory does not exist: {root_dir}")
            return

        if not root_path.is_dir():
            print(f"Path is not a directory: {root_dir}")
            return

        try:
            # Use rglob for recursive search (faster than os.walk)
            for file_path in root_path.rglob('*'):
                if file_path.is_file():
                    try:
                        # Optional file size check (disabled by default)
                        if max_file_size is not None and file_path.stat().st_size > max_file_size:
                            print(f"Skipping large file: {file_path} ({file_path.stat().st_size / 1024 / 1024:.1f}MB)")
                            continue

                        # Skip system/hidden files and directories
                        if any(part.startswith('.') for part in file_path.parts):
                            continue

                        # Skip common system/temp directories
                        skip_dirs = {'.git', '.svn', '.hg', 'node_modules', '__pycache__', '.pytest_cache',
                                     'venv', '.venv', 'env', '.env', 'build', 'dist', '.DS_Store', 'Thumbs.db'}
                        if any(skip_dir in file_path.parts for skip_dir in skip_dirs):
                            continue

                        yield file_path
                    except (OSError, PermissionError) as e:
                        print(f"Cannot access file {file_path}: {e}")
                        continue
        except PermissionError as e:
            print(f"Permission denied accessing {root_dir}: {e}")
        except Exception as e:
            print(f"Error discovering files in {root_dir}: {e}")

    @staticmethod
    def get_file_info(file_path: Path) -> Dict[str, Any]:
        """
        Get comprehensive file information.

        Args:
            file_path: Path to the file

        Returns:
            Dictionary with file information
        """
        try:
            stat = file_path.stat()
            return {
                'path': str(file_path),
                'name': file_path.name,
                'size': stat.st_size,
                'modified': stat.st_mtime,
                'extension': file_path.suffix.lower(),
                'exists': True
            }
        except Exception as e:
            return {
                'path': str(file_path),
                'name': file_path.name,
                'size': 0,
                'modified': 0,
                'extension': file_path.suffix.lower(),
                'exists': False,
                'error': str(e)
            }

    @staticmethod
    def get_file_metadata(file_path: str) -> Dict[str, Any]:
        """
        Get complete file metadata including creation time.

        Args:
            file_path: Path to the file

        Returns:
            Dictionary with complete file metadata
        """
        try:
            path_obj = Path(file_path)
            stat = path_obj.stat()

            # Get file creation time (platform-specific)
            try:
                # macOS: st_birthtime, Windows: st_ctime, Linux: fallback to st_mtime
                created_time = getattr(stat, 'st_birthtime', stat.st_ctime)
            except (AttributeError, OSError):
                created_time = stat.st_mtime

            return {
                'path': str(path_obj),
                'name': path_obj.name,
                'size': stat.st_size,
                'created': int(created_time),
                'modified': int(stat.st_mtime),
                'extension': path_obj.suffix.lower(),
                'exists': True
            }
        except Exception as e:
            return {
                'path': file_path,
                'name': Path(file_path).name,
                'size': 0,
                'created': 0,
                'modified': 0,
                'extension': Path(file_path).suffix.lower(),
                'exists': False,
                'error': str(e)
            }

    @staticmethod
    def move_file(src_path: str, dst_path: str) -> bool:
        """
        Move a file to a new location with robust error handling.

        Args:
            src_path: Source file path
            dst_path: Destination file path

        Returns:
            True if successful, False otherwise
        """
        try:
            src = Path(src_path)
            dst = Path(dst_path)

            # Check source exists
            if not src.exists():
                print(f"Source file does not exist: {src_path}")
                return False

            # Create destination directory if needed
            dst.parent.mkdir(parents=True, exist_ok=True)

            # Use shutil.move for cross-filesystem compatibility
            shutil.move(str(src), str(dst))
            return True

        except Exception as e:
            print(f"Error moving file from {src_path} to {dst_path}: {e}")
            return False

    @staticmethod
    def move_files_batch(file_moves: List[tuple], create_dirs: bool = True) -> Dict[str, Any]:
        """
        Move multiple files in batch with detailed results.

        Args:
            file_moves: List of (src_path, dst_path) tuples
            create_dirs: Whether to create destination directories

        Returns:
            Dictionary with operation results
        """
        results = {
            'successful': [],
            'failed': [],
            'total': len(file_moves),
            'success_count': 0,
            'error_count': 0
        }

        for src_path, dst_path in file_moves:
            try:
                src = Path(src_path)
                dst = Path(dst_path)

                # Check source exists
                if not src.exists():
                    results['failed'].append({
                        'src': src_path,
                        'dst': dst_path,
                        'error': 'Source file does not exist'
                    })
                    results['error_count'] += 1
                    continue

                # Create destination directory if needed
                if create_dirs:
                    dst.parent.mkdir(parents=True, exist_ok=True)

                # Move file
                shutil.move(str(src), str(dst))

                results['successful'].append({
                    'src': src_path,
                    'dst': dst_path
                })
                results['success_count'] += 1

            except Exception as e:
                results['failed'].append({
                    'src': src_path,
                    'dst': dst_path,
                    'error': str(e)
                })
                results['error_count'] += 1

        return results

    @staticmethod
    def copy_file(src_path: str, dst_path: str) -> bool:
        """
        Copy a file to a new location.

        Args:
            src_path: Source file path
            dst_path: Destination file path

        Returns:
            True if successful, False otherwise
        """
        try:
            src = Path(src_path)
            dst = Path(dst_path)

            # Check source exists
            if not src.exists():
                print(f"Source file does not exist: {src_path}")
                return False

            # Create destination directory if needed
            dst.parent.mkdir(parents=True, exist_ok=True)

            # Copy file
            shutil.copy2(str(src), str(dst))
            return True

        except Exception as e:
            print(f"Error copying file from {src_path} to {dst_path}: {e}")
            return False

    @staticmethod
    def create_directory(dir_path: str) -> bool:
        """
        Create a directory with parent directories if needed.

        Args:
            dir_path: Directory path to create

        Returns:
            True if successful, False otherwise
        """
        try:
            Path(dir_path).mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            print(f"Error creating directory {dir_path}: {e}")
            return False

    @staticmethod
    def delete_file(file_path: str) -> bool:
        """
        Delete a file safely.

        Args:
            file_path: Path to the file to delete

        Returns:
            True if successful, False otherwise
        """
        try:
            Path(file_path).unlink(missing_ok=True)
            return True
        except Exception as e:
            print(f"Error deleting file {file_path}: {e}")
            return False

    @staticmethod
    def get_directory_size(dir_path: str) -> int:
        """
        Calculate total size of a directory.

        Args:
            dir_path: Directory path

        Returns:
            Total size in bytes
        """
        try:
            total_size = 0
            for file_path in Path(dir_path).rglob('*'):
                if file_path.is_file():
                    total_size += file_path.stat().st_size
            return total_size
        except Exception as e:
            print(f"Error calculating directory size for {dir_path}: {e}")
            return 0

    @staticmethod
    def is_file_accessible(file_path: str) -> bool:
        """
        Check if a file is accessible for reading.

        Args:
            file_path: Path to the file

        Returns:
            True if accessible, False otherwise
        """
        try:
            path = Path(file_path)
            return path.exists() and path.is_file() and path.stat().st_size > 0
        except Exception:
            return False

    @staticmethod
    def get_file_extension(file_path: str) -> str:
        """
        Get the file extension in lowercase.

        Args:
            file_path: Path to the file

        Returns:
            File extension (e.g., '.pdf', '.txt')
        """
        return Path(file_path).suffix.lower()

    @staticmethod
    def normalize_path(path: str) -> str:
        """
        Normalize a path for cross-platform compatibility.

        Args:
            path: Path to normalize

        Returns:
            Normalized path string
        """
        return str(Path(path).resolve())

    @staticmethod
    def find_files_by_name(root_dir: str, name_pattern: str) -> List[Path]:
        """
        Find files by name pattern.

        Args:
            root_dir: Root directory to search in
            name_pattern: Glob pattern for file names

        Returns:
            List of matching file paths
        """
        try:
            root_path = Path(root_dir)
            if not root_path.exists():
                return []

            return list(root_path.rglob(name_pattern))
        except Exception as e:
            print(f"Error finding files by name pattern {name_pattern}: {e}")
            return []

    @staticmethod
    def get_unique_filename(file_path: str) -> str:
        """
        Generate a unique filename if the file already exists.

        Args:
            file_path: Desired file path

        Returns:
            Unique file path
        """
        path = Path(file_path)

        if not path.exists():
            return file_path

        # Generate unique name with counter
        counter = 1
        while True:
            stem = path.stem
            suffix = path.suffix
            parent = path.parent

            new_name = f"{stem}_{counter}{suffix}"
            new_path = parent / new_name

            if not new_path.exists():
                return str(new_path)

            counter += 1

            # Safety check to prevent infinite loop
            if counter > 1000:
                timestamp = int(time.time())
                new_name = f"{stem}_{timestamp}{suffix}"
                return str(parent / new_name)
