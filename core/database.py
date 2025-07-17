"""
Database operations for document indexing and search.
Uses SQLite with FTS5 for high-performance full-text search.
"""

import sqlite3
import hashlib
import time
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any


class DocumentDatabase:
    """
    High-performance document database using SQLite FTS5.
    
    Following the technical report recommendations:
    - SQLite FTS5 for ultra-fast full-text search
    - Separate metadata and FTS tables for optimal performance
    - Batch operations for high-throughput indexing
    """
    
    def __init__(self, db_path: str = "documents.db"):
        """
        Initialize the database connection and create tables if needed.
        
        Args:
            db_path: Path to the SQLite database file
        """
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row  # Enable column access by name
        self._create_tables()
    
    def _create_tables(self):
        """Create the database schema if it doesn't exist."""
        cursor = self.conn.cursor()
        
        # Create metadata table for file information
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS docs_meta (
                doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                file_hash TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                last_indexed INTEGER NOT NULL,
                file_type TEXT NOT NULL
            )
        """)
        
        # Create FTS5 virtual table for full-text search
        # Using porter tokenizer for better text processing
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
                doc_id UNINDEXED,
                content,
                tokenize = 'porter unicode61'
            )
        """)
        
        # Create index on file_path for efficient path searches
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_file_path ON docs_meta(file_path)
        """)
        
        # Create index on file_hash for duplicate detection
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_file_hash ON docs_meta(file_hash)
        """)
        
        self.conn.commit()
    
    def calculate_file_hash(self, file_path: str) -> str:
        """
        Calculate SHA-256 hash of a file for change detection.
        
        Args:
            file_path: Path to the file
            
        Returns:
            Hexadecimal hash string
        """
        hasher = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                # Read file in chunks to handle large files efficiently
                for chunk in iter(lambda: f.read(4096), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception as e:
            print(f"Error calculating hash for {file_path}: {e}")
            return ""
    
    def is_document_indexed(self, file_path: str) -> bool:
        """
        Check if a document is already indexed and up-to-date.
        
        Args:
            file_path: Path to the file to check
            
        Returns:
            True if file is indexed and unchanged, False otherwise
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT file_hash FROM docs_meta WHERE file_path = ?
        """, (file_path,))
        
        result = cursor.fetchone()
        if not result:
            return False
        
        # Check if file hash has changed
        current_hash = self.calculate_file_hash(file_path)
        return current_hash == result['file_hash']
    
    def add_document(self, file_path: str, content: str, file_type: str) -> bool:
        """
        Add or update a document in the database.
        
        Args:
            file_path: Path to the document
            content: Extracted text content
            file_type: File extension (e.g., 'pdf', 'docx')
            
        Returns:
            True if successful, False otherwise
        """
        try:
            file_hash = self.calculate_file_hash(file_path)
            if not file_hash:
                return False
            
            file_size = Path(file_path).stat().st_size
            timestamp = int(time.time())
            
            cursor = self.conn.cursor()
            
            # Insert or replace document metadata
            cursor.execute("""
                INSERT OR REPLACE INTO docs_meta 
                (file_path, file_hash, file_size, last_indexed, file_type)
                VALUES (?, ?, ?, ?, ?)
            """, (file_path, file_hash, file_size, timestamp, file_type))
            
            doc_id = cursor.lastrowid
            
            # Insert or replace FTS content
            cursor.execute("""
                INSERT OR REPLACE INTO docs_fts (doc_id, content)
                VALUES (?, ?)
            """, (doc_id, content))
            
            self.conn.commit()
            return True
            
        except Exception as e:
            print(f"Error adding document {file_path}: {e}")
            self.conn.rollback()
            return False
    
    def add_documents_batch(self, documents: List[Tuple[str, str, str]]) -> int:
        """
        Add multiple documents in a single transaction for better performance.
        
        Args:
            documents: List of (file_path, content, file_type) tuples
            
        Returns:
            Number of successfully added documents
        """
        if not documents:
            return 0
        
        success_count = 0
        cursor = self.conn.cursor()
        
        try:
            # Begin transaction
            cursor.execute("BEGIN TRANSACTION")
            
            for file_path, content, file_type in documents:
                try:
                    file_hash = self.calculate_file_hash(file_path)
                    if not file_hash:
                        continue
                    
                    file_size = Path(file_path).stat().st_size
                    timestamp = int(time.time())
                    
                    # Insert metadata
                    cursor.execute("""
                        INSERT OR REPLACE INTO docs_meta 
                        (file_path, file_hash, file_size, last_indexed, file_type)
                        VALUES (?, ?, ?, ?, ?)
                    """, (file_path, file_hash, file_size, timestamp, file_type))
                    
                    doc_id = cursor.lastrowid
                    
                    # Insert FTS content
                    cursor.execute("""
                        INSERT OR REPLACE INTO docs_fts (doc_id, content)
                        VALUES (?, ?)
                    """, (doc_id, content))
                    
                    success_count += 1
                    
                except Exception as e:
                    print(f"Error in batch adding document {file_path}: {e}")
                    continue
            
            # Commit transaction
            cursor.execute("COMMIT")
            
        except Exception as e:
            print(f"Error in batch operation: {e}")
            cursor.execute("ROLLBACK")
        
        return success_count
    
    def search_exact(self, query: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Perform exact/boolean search using LIKE for multiple keywords.
        
        Args:
            query: Search query string (supports multiple keywords separated by space)
            limit: Maximum number of results
            
        Returns:
            List of search results with metadata
        """
        cursor = self.conn.cursor()
        
        # Split query into keywords for AND search
        keywords = [k.strip() for k in query.split() if k.strip()]
        
        if not keywords:
            return []
        
        # Build WHERE clause for AND search (all keywords must be present)
        where_conditions = []
        params = []
        
        for keyword in keywords:
            where_conditions.append("docs_fts.content LIKE ?")
            params.append(f'%{keyword}%')
        
        where_clause = " AND ".join(where_conditions)
        params.append(limit)
        
        cursor.execute(f"""
            SELECT 
                m.file_path,
                m.file_type,
                m.file_size,
                m.last_indexed,
                m.file_hash,
                docs_fts.content as highlighted_content
            FROM docs_fts
            JOIN docs_meta m ON docs_fts.doc_id = m.doc_id
            WHERE {where_clause}
            LIMIT ?
        """, params)
        
        results = []
        for row in cursor.fetchall():
            results.append({
                'file_path': row['file_path'],
                'file_type': row['file_type'],
                'file_size': row['file_size'],
                'last_modified': row['last_indexed'],  # 兼容性
                'file_hash': row['file_hash'],
                'content': row['highlighted_content']  # 兼容性
            })
        
        return results
    
    def search_fts5(self, query: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Perform FTS5 full-text search for fuzzy search candidates.
        
        Args:
            query: FTS5 query string (formatted for FTS5 syntax)
            limit: Maximum number of results
            
        Returns:
            List of search results with metadata
        """
        cursor = self.conn.cursor()
        
        try:
            cursor.execute("""
                SELECT 
                    m.file_path,
                    m.file_type,
                    m.file_size,
                    m.last_indexed,
                    m.file_hash,
                    docs_fts.content as highlighted_content
                FROM docs_fts
                JOIN docs_meta m ON docs_fts.doc_id = m.doc_id
                WHERE docs_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            """, (query, limit))
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'file_path': row['file_path'],
                    'file_type': row['file_type'],
                    'file_size': row['file_size'],
                    'last_modified': row['last_indexed'],  # 兼容性
                    'file_hash': row['file_hash'],
                    'content': row['highlighted_content']  # 兼容性
                })
            
            return results
            
        except Exception as e:
            print(f"FTS5 search error: {e}")
            # Fallback to LIKE search if FTS5 fails
            return self.search_exact(query, limit)
    
    def search_path(self, path_query: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Search documents by file path.
        
        Args:
            path_query: Path search pattern (supports multiple keywords separated by space)
            limit: Maximum number of results
            
        Returns:
            List of matching documents
        """
        cursor = self.conn.cursor()
        
        # Split query into keywords for AND search
        keywords = [k.strip() for k in path_query.split() if k.strip()]
        
        if not keywords:
            return []
        
        # Build WHERE clause for AND search (all keywords must be present in path)
        where_conditions = []
        params = []
        
        for keyword in keywords:
            where_conditions.append("file_path LIKE ?")
            params.append(f'%{keyword}%')
        
        where_clause = " AND ".join(where_conditions)
        params.append(limit)
        
        cursor.execute(f"""
            SELECT file_path, file_type, file_size, last_indexed
            FROM docs_meta
            WHERE {where_clause}
            ORDER BY file_path
            LIMIT ?
        """, params)
        
        results = []
        for row in cursor.fetchall():
            results.append({
                'file_path': row['file_path'],
                'file_type': row['file_type'],
                'file_size': row['file_size'],
                'last_indexed': row['last_indexed']
            })
        
        return results
    
    def get_document_content(self, file_path: str) -> Optional[str]:
        """
        Get the indexed content of a document.
        
        Args:
            file_path: Path to the document
            
        Returns:
            Document content or None if not found
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT docs_fts.content
            FROM docs_fts
            JOIN docs_meta m ON docs_fts.doc_id = m.doc_id
            WHERE m.file_path = ?
        """, (file_path,))
        
        result = cursor.fetchone()
        return result['content'] if result else None
    
    def get_all_documents(self) -> List[Dict[str, Any]]:
        """
        Get all indexed documents metadata.
        
        Returns:
            List of all documents with metadata
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT file_path, file_type, file_size, last_indexed
            FROM docs_meta
            ORDER BY last_indexed DESC
        """)
        
        results = []
        for row in cursor.fetchall():
            results.append({
                'file_path': row['file_path'],
                'file_type': row['file_type'],
                'file_size': row['file_size'],
                'last_indexed': row['last_indexed']
            })
        
        return results
    
    def remove_document(self, file_path: str) -> bool:
        """
        Remove a document from the database.
        
        Args:
            file_path: Path to the document to remove
            
        Returns:
            True if successful, False otherwise
        """
        try:
            cursor = self.conn.cursor()
            
            # Get doc_id first
            cursor.execute("SELECT doc_id FROM docs_meta WHERE file_path = ?", (file_path,))
            result = cursor.fetchone()
            if not result:
                return False
            
            doc_id = result['doc_id']
            
            # Remove from FTS table
            cursor.execute("DELETE FROM docs_fts WHERE doc_id = ?", (doc_id,))
            
            # Remove from metadata table
            cursor.execute("DELETE FROM docs_meta WHERE doc_id = ?", (doc_id,))
            
            self.conn.commit()
            return True
            
        except Exception as e:
            print(f"Error removing document {file_path}: {e}")
            self.conn.rollback()
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get database statistics.
        
        Returns:
            Dictionary with database statistics
        """
        cursor = self.conn.cursor()
        
        # Get document count
        cursor.execute("SELECT COUNT(*) as doc_count FROM docs_meta")
        doc_count = cursor.fetchone()['doc_count']
        
        # Get file type distribution
        cursor.execute("""
            SELECT file_type, COUNT(*) as count
            FROM docs_meta
            GROUP BY file_type
            ORDER BY count DESC
        """)
        file_types = {row['file_type']: row['count'] for row in cursor.fetchall()}
        
        # Get total size
        cursor.execute("SELECT SUM(file_size) as total_size FROM docs_meta")
        total_size = cursor.fetchone()['total_size'] or 0
        
        # Get database file size
        db_size = Path(self.db_path).stat().st_size if Path(self.db_path).exists() else 0
        
        return {
            'document_count': doc_count,
            'file_types': file_types,
            'total_content_size': total_size,
            'database_size': db_size
        }
    
    def close(self):
        """Close the database connection."""
        if self.conn:
            self.conn.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()