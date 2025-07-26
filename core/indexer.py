"""
Concurrent document indexer using multiprocessing.

Following the technical report's architecture for high-performance indexing:
- Producer-consumer model with multiprocessing
- Dedicated database writer process to avoid lock contention
- CPU-intensive parsing distributed across multiple cores
"""

import multiprocessing as mp
import time
import queue
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import logging

from utils.file_utils import FileUtils
from parsers.base_parser import ParserFactory
from core.database import DocumentDatabase

# Import all parsers to register them
from parsers import pdf_parser, docx_parser, xlsx_parser, xls_parser, doc_parser, metadata_parser


class DocumentIndexer:
    """
    High-performance concurrent document indexer.
    
    Following the technical report's architecture:
    1. Main process discovers files and manages queues
    2. Worker processes parse documents (CPU-intensive)
    3. Dedicated database writer process handles all DB operations
    """
    
    def __init__(self, db_path: str = "documents.db", max_workers: Optional[int] = None):
        """
        Initialize the document indexer.
        
        Args:
            db_path: Path to the SQLite database
            max_workers: Maximum number of worker processes (defaults to CPU count)
        """
        self.db_path = db_path
        self.max_workers = max_workers or mp.cpu_count()
        self.stats = {
            'total_files': 0,
            'processed_files': 0,
            'failed_files': 0,
            'start_time': 0,
            'end_time': 0,
            'errors': []
        }
    
    def index_directory(self, directory: str, force_reindex: bool = False, include_all_files: bool = False, progress_callback=None) -> Dict[str, Any]:
        """
        Index all documents in a directory.
        
        Args:
            directory: Directory path to index
            force_reindex: Whether to reindex already processed files
            include_all_files: Whether to include all file types (not just those with text parsers)
            progress_callback: Optional callback function for progress updates
            
        Returns:
            Dictionary with indexing statistics
        """
        print(f"Starting indexing of directory: {directory}")
        print(f"Using {self.max_workers} worker processes")
        print(f"Include all files: {include_all_files}")
        
        self.stats['start_time'] = time.time()
        
        # Discover files based on mode
        if include_all_files:
            # Discover all files regardless of type
            file_paths = list(FileUtils.discover_all_files(directory))
            print(f"Found {len(file_paths)} files of all types")
        else:
            # Discover only files with specialized parsers
            supported_extensions = ParserFactory.get_supported_extensions()
            # Remove the wildcard '*' from supported extensions for selective discovery
            text_extensions = [ext for ext in supported_extensions if ext != '*']
            file_paths = list(FileUtils.discover_files(directory, text_extensions))
            print(f"Found {len(file_paths)} files with text parsers")
        
        if not file_paths:
            print("No files found")
            return self._get_final_stats()
        
        self.stats['total_files'] = len(file_paths)
        
        # Call progress callback with initial stats
        if progress_callback:
            progress_callback(self.stats)
        
        # Filter out already indexed files unless force_reindex is True
        if not force_reindex:
            file_paths = self._filter_unindexed_files(file_paths)
            print(f"After filtering: {len(file_paths)} files to process")
        
        if not file_paths:
            print("All files are already indexed")
            return self._get_final_stats()
        
        # Process files concurrently
        self._process_files_concurrent(file_paths, progress_callback)
        
        self.stats['end_time'] = time.time()
        
        return self._get_final_stats()
    
    def index_file(self, file_path, include_all_files: bool = False):
        """
        Index a single file with fallback to metadata-only parsing.
        
        Args:
            file_path: Path to the file to index
            include_all_files: Whether to use metadata-only fallback for unsupported files
        """
        from pathlib import Path
        from parsers.metadata_parser import MetadataOnlyParser
        
        file_path = Path(file_path)
        
        # Try to get specialized parser first
        parser = ParserFactory.get_parser(str(file_path))
        content = ""
        
        if parser and parser.__class__.__name__ != 'MetadataOnlyParser':
            # Try specialized parser
            try:
                content = parser.parse(str(file_path))
                if content is None:
                    content = ""
                print(f"Parsed text content from: {file_path}")
            except Exception as e:
                print(f"Text parsing failed for {file_path}: {e}")
                content = ""
        
        # If no content or include_all_files is True, ensure metadata indexing
        if not content or include_all_files:
            if not content:
                print(f"Using metadata-only indexing for: {file_path}")
        
        # Get file metadata
        from utils.file_utils import FileUtils
        metadata = FileUtils.get_file_metadata(str(file_path))
        if not metadata['exists']:
            raise ValueError(f"File not accessible: {file_path}")
        
        # Index in database
        with DocumentDatabase(self.db_path) as db:
            success = db.add_document(
                str(file_path), 
                content, 
                file_path.suffix.lstrip('.'),
                metadata['created']
            )
            if not success:
                raise ValueError(f"Failed to index file: {file_path}")
        
        self.stats['processed_files'] = self.stats.get('processed_files', 0) + 1
        self.stats['successful_files'] = self.stats.get('successful_files', 0) + 1
    
    def _filter_unindexed_files(self, file_paths: List[Path]) -> List[Path]:
        """
        Filter out files that are already indexed and unchanged.
        
        Args:
            file_paths: List of file paths to check
            
        Returns:
            List of files that need to be indexed
        """
        with DocumentDatabase(self.db_path) as db:
            unindexed_files = []
            
            for file_path in file_paths:
                if not db.is_document_indexed(str(file_path)):
                    unindexed_files.append(file_path)
            
            return unindexed_files
    
    def _process_files_concurrent(self, file_paths: List[Path], progress_callback=None):
        """
        Process files using concurrent workers.
        
        Args:
            file_paths: List of file paths to process
            progress_callback: Optional callback function for progress updates
        """
        # Create queues for communication
        task_queue = mp.Queue()
        result_queue = mp.Queue()
        stats_queue = mp.Queue()  # For receiving stats from database writer
        progress_queue = mp.Queue() if progress_callback else None  # For progress updates
        
        # Fill task queue
        for file_path in file_paths:
            task_queue.put(str(file_path))
        
        # Add sentinel values to signal workers to stop
        for _ in range(self.max_workers):
            task_queue.put(None)
        
        # Start worker processes
        workers = []
        for i in range(self.max_workers):
            worker = mp.Process(
                target=self._worker_process,
                args=(task_queue, result_queue, i)
            )
            worker.start()
            workers.append(worker)
        
        # Start database writer process
        db_writer = mp.Process(
            target=self._database_writer_process,
            args=(result_queue, len(file_paths), stats_queue, progress_queue)
        )
        db_writer.start()
        
        # Start progress monitoring thread if callback provided
        if progress_callback and progress_queue:
            import threading
            def monitor_progress():
                while True:
                    try:
                        progress_update = progress_queue.get(timeout=0.5)
                        if progress_update is None:  # Sentinel value
                            break
                        self.stats.update(progress_update)
                        progress_callback(self.stats)
                    except:
                        continue
            
            progress_thread = threading.Thread(target=monitor_progress, daemon=True)
            progress_thread.start()
        
        # Wait for all workers to complete
        for worker in workers:
            worker.join()
        
        # Signal database writer to stop
        result_queue.put(None)
        db_writer.join()
        
        # Stop progress monitoring
        if progress_queue:
            progress_queue.put(None)
        
        # Get stats from database writer
        try:
            writer_stats = stats_queue.get(timeout=1)
            self.stats['processed_files'] = writer_stats['processed_files']
            self.stats['failed_files'] = writer_stats['failed_files']
            self.stats['errors'].extend(writer_stats['errors'])
        except:
            pass  # Use default values if stats not available
    
    def _worker_process(self, task_queue: mp.Queue, result_queue: mp.Queue, worker_id: int):
        """
        Worker process that parses documents.
        
        Args:
            task_queue: Queue containing file paths to process
            result_queue: Queue for sending results to database writer
            worker_id: Worker identifier for logging
        """
        processed_count = 0
        
        while True:
            try:
                # Get next file path
                file_path = task_queue.get(timeout=1)
                
                # Check for sentinel value
                if file_path is None:
                    break
                
                # Parse the document
                result = self._parse_document(file_path)
                
                # Send result to database writer
                result_queue.put(result)
                
                processed_count += 1
                
                # Log progress occasionally
                if processed_count % 10 == 0:
                    print(f"Worker {worker_id}: processed {processed_count} files")
                
            except queue.Empty:
                continue
            except Exception as e:
                error_msg = f"Worker {worker_id} error: {e}"
                print(error_msg)
                result_queue.put({
                    'success': False,
                    'file_path': file_path,
                    'error': error_msg
                })
        
        print(f"Worker {worker_id} completed. Processed {processed_count} files")
    
    def _parse_document(self, file_path: str) -> Dict[str, Any]:
        """
        Parse a single document with fallback to metadata-only parsing.
        
        Args:
            file_path: Path to the document to parse
            
        Returns:
            Dictionary with parsing results
        """
        try:
            # Get file metadata first
            metadata = FileUtils.get_file_metadata(file_path)
            if not metadata['exists']:
                return {
                    'success': False,
                    'file_path': file_path,
                    'error': 'File not accessible'
                }
            
            # Try to get specialized parser first
            parser = ParserFactory.get_parser(file_path)
            content = ""
            
            if parser and parser.__class__.__name__ != 'MetadataOnlyParser':
                # Try specialized parser for text content
                try:
                    content = parser.parse(file_path)
                    if content is None:
                        content = ""
                except Exception as e:
                    print(f"Text parsing failed for {file_path}: {e}")
                    content = ""
            
            # Always succeed with metadata indexing (content may be empty)
            file_extension = FileUtils.get_file_extension(file_path)
            
            return {
                'success': True,
                'file_path': file_path,
                'content': content,
                'file_type': file_extension.lstrip('.'),
                'file_created': metadata['created'],
                'has_text_content': bool(content)
            }
            
        except Exception as e:
            return {
                'success': False,
                'file_path': file_path,
                'error': str(e)
            }
    
    def _database_writer_process(self, result_queue: mp.Queue, expected_results: int, stats_queue: mp.Queue, progress_queue=None):
        """
        Dedicated database writer process.
        
        Args:
            result_queue: Queue containing parsing results
            expected_results: Number of expected results
            stats_queue: Queue for sending stats back to main process
            progress_queue: Optional queue for sending progress updates
        """
        processed_count = 0
        successful_files = 0
        failed_files = 0
        errors = []
        batch_size = 10
        batch_buffer = []
        
        with DocumentDatabase(self.db_path) as db:
            while processed_count < expected_results:
                try:
                    # Get result from queue
                    result = result_queue.get(timeout=5)
                    
                    # Check for sentinel value
                    if result is None:
                        break
                    
                    processed_count += 1
                    
                    # Send progress update
                    if progress_queue:
                        try:
                            progress_queue.put({
                                'processed_files': processed_count,
                                'current_file': result['file_path'] if result['success'] else '',
                                'total_files': expected_results
                            })
                        except:
                            pass
                    
                    if result['success']:
                        # Add to batch buffer with creation time
                        batch_buffer.append((
                            result['file_path'],
                            result['content'],
                            result['file_type'],
                            result['file_created']
                        ))
                        
                        # Process batch when buffer is full
                        if len(batch_buffer) >= batch_size:
                            success_count = db.add_documents_batch(batch_buffer)
                            successful_files += success_count
                            failed_files += len(batch_buffer) - success_count
                            batch_buffer = []
                    else:
                        # Log error
                        error_msg = f"Failed to process {result['file_path']}: {result['error']}"
                        print(error_msg)
                        errors.append(error_msg)
                        failed_files += 1
                    
                    # Print progress
                    if processed_count % 50 == 0:
                        print(f"Database writer: processed {processed_count}/{expected_results} results")
                
                except queue.Empty:
                    continue
                except Exception as e:
                    print(f"Database writer error: {e}")
                    break
            
            # Process remaining batch
            if batch_buffer:
                success_count = db.add_documents_batch(batch_buffer)
                successful_files += success_count
                failed_files += len(batch_buffer) - success_count
        
        # Send stats back to main process
        stats_queue.put({
            'processed_files': successful_files,
            'failed_files': failed_files,
            'errors': errors
        })
        
        print(f"Database writer completed. Processed {processed_count} results, successful: {successful_files}, failed: {failed_files}")
    
    def _get_final_stats(self) -> Dict[str, Any]:
        """
        Get final indexing statistics.
        
        Returns:
            Dictionary with complete statistics
        """
        duration = self.stats['end_time'] - self.stats['start_time']
        
        return {
            'total_files': self.stats['total_files'],
            'processed_files': self.stats['processed_files'],
            'indexed_files': self.stats['processed_files'],  # API compatibility
            'failed_files': self.stats['failed_files'],
            'duration_seconds': duration,
            'processing_time': duration,  # API compatibility
            'files_per_second': self.stats['processed_files'] / duration if duration > 0 else 0,
            'errors': self.stats['errors']
        }
    
    def get_indexing_progress(self) -> Dict[str, Any]:
        """
        Get current indexing progress.
        
        Returns:
            Dictionary with progress information
        """
        return {
            'total_files': self.stats['total_files'],
            'processed_files': self.stats['processed_files'],
            'failed_files': self.stats['failed_files'],
            'completion_percentage': (self.stats['processed_files'] / self.stats['total_files'] * 100) 
                                   if self.stats['total_files'] > 0 else 0
        }


class IncrementalIndexer:
    """
    Indexer for incremental updates to handle file changes.
    """
    
    def __init__(self, db_path: str = "documents.db"):
        """
        Initialize the incremental indexer.
        
        Args:
            db_path: Path to the SQLite database
        """
        self.db_path = db_path
    
    def update_file(self, file_path: str) -> bool:
        """
        Update a single file in the index.
        
        Args:
            file_path: Path to the file to update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get appropriate parser
            parser = ParserFactory.get_parser(file_path)
            
            if not parser:
                print(f"No parser available for {file_path}")
                return False
            
            # Parse the document
            content = parser.parse(file_path)
            
            if content is None:
                print(f"Failed to extract content from {file_path}")
                return False
            
            # Update database
            file_extension = FileUtils.get_file_extension(file_path)
            
            with DocumentDatabase(self.db_path) as db:
                return db.add_document(file_path, content, file_extension.lstrip('.'))
            
        except Exception as e:
            print(f"Error updating file {file_path}: {e}")
            return False
    
    def remove_file(self, file_path: str) -> bool:
        """
        Remove a file from the index.
        
        Args:
            file_path: Path to the file to remove
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with DocumentDatabase(self.db_path) as db:
                return db.remove_document(file_path)
        except Exception as e:
            print(f"Error removing file {file_path}: {e}")
            return False
    
    def check_for_updates(self, directory: str) -> List[str]:
        """
        Check for files that need to be updated.
        
        Args:
            directory: Directory to check
            
        Returns:
            List of file paths that need updating
        """
        supported_extensions = ParserFactory.get_supported_extensions()
        file_paths = list(FileUtils.discover_files(directory, supported_extensions))
        
        files_to_update = []
        
        with DocumentDatabase(self.db_path) as db:
            for file_path in file_paths:
                if not db.is_document_indexed(str(file_path)):
                    files_to_update.append(str(file_path))
        
        return files_to_update