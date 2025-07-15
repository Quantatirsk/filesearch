"""
Search manager implementing the hybrid search model.

Following the technical report's architecture:
- SQLite FTS5 for fast exact/boolean search
- Hybrid fuzzy search: FTS5 for candidate filtering + RapidFuzz for ranking
- Path-based search for file system queries
- Unified search interface
"""

from typing import List, Dict, Any, Optional, Tuple
import time

from core.database import DocumentDatabase
from utils.fuzzy_search import FuzzySearchUtils
from utils.file_utils import FileUtils


class SearchManager:
    """
    High-performance search manager with hybrid fuzzy search.
    
    Following the technical report's recommendations:
    1. FTS5 for lightning-fast exact and boolean searches
    2. Hybrid fuzzy search model for intelligent similarity matching
    3. Path-based search for file system queries
    4. Unified interface for all search types
    """
    
    def __init__(self, db_path: str = "documents.db"):
        """
        Initialize the search manager.
        
        Args:
            db_path: Path to the SQLite database
        """
        self.db_path = db_path
    
    def search(self, query: str, search_type: str = "exact", 
               limit: int = 100, min_fuzzy_score: float = 30.0) -> Dict[str, Any]:
        """
        Unified search interface supporting multiple search types.
        
        Args:
            query: Search query string
            search_type: Type of search ('exact', 'boolean', 'fuzzy', 'path')
            limit: Maximum number of results
            min_fuzzy_score: Minimum similarity score for fuzzy search
            
        Returns:
            Dictionary with search results and metadata
        """
        if not query.strip():
            return self._empty_result()
        
        start_time = time.time()
        
        try:
            if search_type == "exact":
                results = self.search_exact(query, limit)
            elif search_type == "boolean":
                results = self.search_boolean(query, limit)
            elif search_type == "fuzzy":
                results = self.search_fuzzy(query, limit, min_fuzzy_score)
            elif search_type == "path":
                results = self.search_path(query, limit)
            else:
                return self._error_result(f"Unsupported search type: {search_type}")
            
            end_time = time.time()
            
            return {
                'success': True,
                'query': query,
                'search_type': search_type,
                'results': results,
                'total_results': len(results),
                'search_time': end_time - start_time,
                'limit': limit
            }
            
        except Exception as e:
            return self._error_result(str(e))
    
    def search_exact(self, query: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Perform exact phrase search using FTS5.
        
        Args:
            query: Exact phrase to search for
            limit: Maximum number of results
            
        Returns:
            List of search results
        """
        with DocumentDatabase(self.db_path) as db:
            return db.search_exact(query, limit)
    
    def search_boolean(self, query: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Perform boolean search using FTS5 query syntax.
        
        Args:
            query: Boolean query (supports AND, OR, NOT)
            limit: Maximum number of results
            
        Returns:
            List of search results
        """
        with DocumentDatabase(self.db_path) as db:
            return db.search_exact(query, limit)
    
    def search_fuzzy(self, query: str, limit: int = 100, 
                    min_score: float = 30.0) -> List[Dict[str, Any]]:
        """
        Perform hybrid fuzzy search using FTS5 + RapidFuzz.
        
        Following the technical report's two-stage architecture:
        1. FTS5 for fast candidate filtering
        2. RapidFuzz for precise similarity scoring
        
        Args:
            query: Fuzzy search query
            limit: Maximum number of results
            min_score: Minimum similarity score threshold
            
        Returns:
            List of ranked search results with similarity scores
        """
        # Stage 1: Preprocess query and build FTS5 query
        terms = FuzzySearchUtils.preprocess_query(query)
        
        if not terms:
            return []
        
        fts_query = FuzzySearchUtils.build_fts_query(terms)
        
        # Stage 2: Get candidates from FTS5 (fast filtering)
        with DocumentDatabase(self.db_path) as db:
            # Get more candidates than needed for better fuzzy ranking
            candidate_limit = min(limit * 5, 1000)
            candidates = db.search_exact(fts_query, candidate_limit)
            
            if not candidates:
                return []
            
            # Enhance candidates with full content for fuzzy scoring
            enhanced_candidates = []
            for candidate in candidates:
                content = db.get_document_content(candidate['file_path'])
                if content:
                    candidate['content'] = content
                    enhanced_candidates.append(candidate)
        
        # Stage 3: Rank candidates using RapidFuzz (precise scoring)
        ranked_results = FuzzySearchUtils.rank_candidates(
            query, enhanced_candidates, 'content', min_score
        )
        
        # Stage 4: Add fuzzy highlighting and limit results
        final_results = []
        for result in ranked_results[:limit]:
            # Add fuzzy highlighting
            result['fuzzy_highlight'] = FuzzySearchUtils.highlight_matches(
                query, result['content'], 300
            )
            
            # Remove full content to reduce response size
            if 'content' in result:
                del result['content']
            
            final_results.append(result)
        
        return final_results
    
    def search_path(self, query: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Search documents by file path pattern.
        
        Args:
            query: Path pattern to search for
            limit: Maximum number of results
            
        Returns:
            List of matching documents
        """
        with DocumentDatabase(self.db_path) as db:
            return db.search_path(query, limit)
    
    def search_advanced(self, content_query: Optional[str] = None,
                       path_query: Optional[str] = None,
                       file_types: Optional[List[str]] = None,
                       fuzzy: bool = False,
                       limit: int = 100) -> Dict[str, Any]:
        """
        Advanced search with multiple filters.
        
        Args:
            content_query: Query for document content
            path_query: Query for file paths
            file_types: List of file types to include
            fuzzy: Whether to use fuzzy matching for content
            limit: Maximum number of results
            
        Returns:
            Dictionary with search results and metadata
        """
        start_time = time.time()
        
        try:
            results = []
            
            # Content search
            if content_query:
                if fuzzy:
                    content_results = self.search_fuzzy(content_query, limit)
                else:
                    content_results = self.search_exact(content_query, limit)
                results.extend(content_results)
            
            # Path search
            if path_query:
                path_results = self.search_path(path_query, limit)
                results.extend(path_results)
            
            # Remove duplicates based on file_path
            seen_paths = set()
            unique_results = []
            for result in results:
                if result['file_path'] not in seen_paths:
                    seen_paths.add(result['file_path'])
                    unique_results.append(result)
            
            # Filter by file types if specified
            if file_types:
                file_types_lower = [ft.lower() for ft in file_types]
                unique_results = [
                    result for result in unique_results 
                    if result.get('file_type', '').lower() in file_types_lower
                ]
            
            # Limit results
            final_results = unique_results[:limit]
            
            end_time = time.time()
            
            return {
                'success': True,
                'content_query': content_query,
                'path_query': path_query,
                'file_types': file_types,
                'fuzzy': fuzzy,
                'results': final_results,
                'total_results': len(final_results),
                'search_time': end_time - start_time,
                'limit': limit
            }
            
        except Exception as e:
            return self._error_result(str(e))
    
    def suggest_query(self, query: str, max_suggestions: int = 5) -> List[str]:
        """
        Suggest query corrections based on indexed content.
        
        Args:
            query: Original query
            max_suggestions: Maximum number of suggestions
            
        Returns:
            List of suggested query corrections
        """
        try:
            # Get a sample of indexed content to build vocabulary
            with DocumentDatabase(self.db_path) as db:
                # Get some documents for vocabulary building
                sample_results = db.search_exact("*", 100)
                
                # Build vocabulary from document content
                vocabulary = set()
                for result in sample_results:
                    content = db.get_document_content(result['file_path'])
                    if content:
                        words = content.lower().split()
                        vocabulary.update(word.strip('.,!?;:') for word in words if len(word) > 3)
                
                # Generate suggestions
                return FuzzySearchUtils.suggest_corrections(
                    query, list(vocabulary), max_suggestions
                )
        
        except Exception as e:
            print(f"Error generating suggestions: {e}")
            return []
    
    def get_search_stats(self) -> Dict[str, Any]:
        """
        Get search-related statistics.
        
        Returns:
            Dictionary with search statistics
        """
        try:
            with DocumentDatabase(self.db_path) as db:
                return db.get_stats()
        except Exception as e:
            return {'error': str(e)}
    
    def move_files(self, file_paths: List[str], destination: str) -> Dict[str, Any]:
        """
        Move files to a destination directory.
        
        Args:
            file_paths: List of file paths to move
            destination: Destination directory
            
        Returns:
            Dictionary with operation results
        """
        try:
            # Create destination directory if it doesn't exist
            FileUtils.create_directory(destination)
            
            # Prepare move operations
            move_operations = []
            for file_path in file_paths:
                file_name = FileUtils.get_file_info(file_path)['name']
                dest_path = f"{destination}/{file_name}"
                
                # Generate unique filename if needed
                dest_path = FileUtils.get_unique_filename(dest_path)
                
                move_operations.append((file_path, dest_path))
            
            # Execute batch move
            results = FileUtils.move_files_batch(move_operations)
            
            # Update database paths for successfully moved files
            with DocumentDatabase(self.db_path) as db:
                for move_info in results['successful']:
                    # Remove old path
                    db.remove_document(move_info['src'])
                    
                    # Note: The file would need to be re-indexed at new location
                    # This is a design decision - we could implement automatic re-indexing
            
            return {
                'success': True,
                'moved_files': results['successful'],
                'failed_files': results['failed'],
                'total_files': results['total'],
                'success_count': results['success_count'],
                'error_count': results['error_count']
            }
            
        except Exception as e:
            return self._error_result(str(e))
    
    def _empty_result(self) -> Dict[str, Any]:
        """Return an empty search result."""
        return {
            'success': True,
            'query': '',
            'search_type': 'none',
            'results': [],
            'total_results': 0,
            'search_time': 0,
            'limit': 0
        }
    
    def _error_result(self, error_message: str) -> Dict[str, Any]:
        """Return an error result."""
        return {
            'success': False,
            'error': error_message,
            'results': [],
            'total_results': 0,
            'search_time': 0
        }


class SearchResultFormatter:
    """
    Utility class for formatting search results.
    """
    
    @staticmethod
    def format_console_output(results: List[Dict[str, Any]], 
                            show_content: bool = True) -> str:
        """
        Format search results for console output.
        
        Args:
            results: List of search results
            show_content: Whether to show content excerpts
            
        Returns:
            Formatted string for console display
        """
        if not results:
            return "No results found."
        
        output = []
        
        for i, result in enumerate(results, 1):
            # File path and basic info
            file_path = result.get('file_path', 'Unknown')
            file_type = result.get('file_type', 'unknown')
            file_size = result.get('file_size', 0)
            
            # Format file size
            size_str = SearchResultFormatter._format_file_size(file_size)
            
            # Header
            output.append(f"{i}. {file_path}")
            output.append(f"   Type: {file_type} | Size: {size_str}")
            
            # Fuzzy search specific info
            if 'fuzzy_score' in result:
                score = result['fuzzy_score']
                method = result.get('fuzzy_method', 'ratio')
                output.append(f"   Similarity: {score:.1f}% ({method})")
            
            # Content preview
            if show_content:
                if 'fuzzy_highlight' in result:
                    content = result['fuzzy_highlight']
                elif 'highlighted_content' in result:
                    content = result['highlighted_content']
                else:
                    content = "No content preview available"
                
                # Truncate if too long
                if len(content) > 200:
                    content = content[:200] + "..."
                
                output.append(f"   Preview: {content}")
            
            output.append("")  # Empty line between results
        
        return "\n".join(output)
    
    @staticmethod
    def _format_file_size(size_bytes: int) -> str:
        """Format file size in human-readable format."""
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        elif size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.1f} MB"
        else:
            return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"
    
    @staticmethod
    def format_stats(stats: Dict[str, Any]) -> str:
        """
        Format database statistics for console output.
        
        Args:
            stats: Statistics dictionary
            
        Returns:
            Formatted statistics string
        """
        if 'error' in stats:
            return f"Error getting statistics: {stats['error']}"
        
        output = []
        output.append("=== Database Statistics ===")
        output.append(f"Total documents: {stats.get('document_count', 0)}")
        output.append(f"Total content size: {SearchResultFormatter._format_file_size(stats.get('total_content_size', 0))}")
        output.append(f"Database size: {SearchResultFormatter._format_file_size(stats.get('database_size', 0))}")
        
        file_types = stats.get('file_types', {})
        if file_types:
            output.append("\nFile types:")
            for file_type, count in sorted(file_types.items(), key=lambda x: x[1], reverse=True):
                output.append(f"  {file_type}: {count}")
        
        return "\n".join(output)