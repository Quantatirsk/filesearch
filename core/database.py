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
                file_created INTEGER NOT NULL,
                file_modified INTEGER NOT NULL,
                last_indexed INTEGER NOT NULL,
                file_type TEXT NOT NULL
            )
        """)

        # Check if file_modified column exists, if not add it (for existing databases)
        cursor.execute("PRAGMA table_info(docs_meta)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'file_modified' not in columns:
            print("Adding file_modified column to existing database...")
            cursor.execute("ALTER TABLE docs_meta ADD COLUMN file_modified INTEGER DEFAULT 0")
            # Update existing records with file modification time from filesystem
            cursor.execute("SELECT file_path FROM docs_meta WHERE file_modified = 0")
            files_to_update = cursor.fetchall()
            for row in files_to_update:
                file_path = row[0]
                try:
                    file_stat = Path(file_path).stat()
                    file_modified = int(file_stat.st_mtime)
                    cursor.execute("UPDATE docs_meta SET file_modified = ? WHERE file_path = ?",
                                   (file_modified, file_path))
                except Exception as e:
                    print(f"Could not update modification time for {file_path}: {e}")
                    # Use last_indexed as fallback
                    cursor.execute("UPDATE docs_meta SET file_modified = last_indexed WHERE file_path = ?",
                                   (file_path,))
            print(f"Updated {len(files_to_update)} existing records with file modification times")

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

    def add_document(self, file_path: str, content: str, file_type: str, file_created: Optional[int] = None) -> bool:
        """
        Add or update a document in the database.

        Args:
            file_path: Path to the document
            content: Extracted text content
            file_type: File extension (e.g., 'pdf', 'docx')
            file_created: File creation timestamp (optional, will be detected if not provided)

        Returns:
            True if successful, False otherwise
        """
        try:
            file_hash = self.calculate_file_hash(file_path)
            if not file_hash:
                return False

            file_stat = Path(file_path).stat()
            file_size = file_stat.st_size
            file_modified = int(file_stat.st_mtime)  # File's actual modification time
            timestamp = int(time.time())  # Indexing time

            # Get file creation time if not provided
            if file_created is None:
                # Use creation time on Windows, birth time on macOS, or fallback to modification time
                try:
                    file_created = int(getattr(file_stat, 'st_birthtime', file_stat.st_ctime))
                except (AttributeError, OSError):
                    file_created = int(file_stat.st_mtime)

            cursor = self.conn.cursor()

            # Insert or replace document metadata
            cursor.execute("""
                INSERT OR REPLACE INTO docs_meta
                (file_path, file_hash, file_size, file_created, file_modified, last_indexed, file_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (file_path, file_hash, file_size, file_created, file_modified, timestamp, file_type))

            doc_id = cursor.lastrowid

            # Insert or replace FTS content (only if content is not empty)
            if content:
                cursor.execute("""
                    INSERT OR REPLACE INTO docs_fts (doc_id, content)
                    VALUES (?, ?)
                """, (doc_id, content))
            else:
                # For files with no content, remove from FTS table if exists
                cursor.execute("""
                    DELETE FROM docs_fts WHERE doc_id = ?
                """, (doc_id,))

            self.conn.commit()
            return True

        except Exception as e:
            print(f"Error adding document {file_path}: {e}")
            self.conn.rollback()
            return False

    def add_documents_batch(self, documents: List[Tuple[str, str, str, Optional[int]]]) -> int:
        """
        Add multiple documents in a single transaction for better performance.

        Args:
            documents: List of (file_path, content, file_type, file_created) tuples

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

            for doc_data in documents:
                if len(doc_data) == 3:
                    file_path, content, file_type = doc_data
                    file_created = None
                else:
                    file_path, content, file_type, file_created = doc_data

                try:
                    file_hash = self.calculate_file_hash(file_path)
                    if not file_hash:
                        continue

                    file_stat = Path(file_path).stat()
                    file_size = file_stat.st_size
                    file_modified = int(file_stat.st_mtime)  # File's actual modification time
                    timestamp = int(time.time())  # Indexing time

                    # Get file creation time if not provided
                    if file_created is None:
                        try:
                            file_created = int(getattr(file_stat, 'st_birthtime', file_stat.st_ctime))
                        except (AttributeError, OSError):
                            file_created = int(file_stat.st_mtime)

                    # Insert metadata
                    cursor.execute("""
                        INSERT OR REPLACE INTO docs_meta
                        (file_path, file_hash, file_size, file_created, file_modified, last_indexed, file_type)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (file_path, file_hash, file_size, file_created, file_modified, timestamp, file_type))

                    doc_id = cursor.lastrowid

                    # Insert FTS content (only if content is not empty)
                    if content:
                        cursor.execute("""
                            INSERT OR REPLACE INTO docs_fts (doc_id, content)
                            VALUES (?, ?)
                        """, (doc_id, content))
                    else:
                        # For files with no content, remove from FTS table if exists
                        cursor.execute("""
                            DELETE FROM docs_fts WHERE doc_id = ?
                        """, (doc_id,))

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

    def search_exact(self, query: str, limit: int = 100,
                     file_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Perform exact search using LIKE for multiple keywords.

        Args:
            query: Search query string (supports multiple keywords separated by space)
            limit: Maximum number of results
            file_types: Optional list of file extensions to filter results

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

        # Add file type filtering if specified
        if file_types:
            # Normalize extensions (remove leading dots to match database format)
            normalized_types = [ft.lstrip('.') for ft in file_types]
            placeholders = ','.join(['?' for _ in normalized_types])
            where_conditions.append(f"m.file_type IN ({placeholders})")
            params.extend(normalized_types)

        where_clause = " AND ".join(where_conditions)
        params.append(limit)

        sql_query = f"""
            SELECT
                m.file_path,
                m.file_type,
                m.file_size,
                m.file_created,
                m.file_modified,
                m.last_indexed,
                m.file_hash
            FROM docs_fts
            JOIN docs_meta m ON docs_fts.doc_id = m.doc_id
            WHERE {where_clause}
            LIMIT ?"""

        cursor.execute(sql_query, params)

        results = []
        for row in cursor.fetchall():
            results.append({
                'file_path': row['file_path'],
                'file_type': row['file_type'],
                'file_size': row['file_size'],
                'file_created': row['file_created'],
                'file_modified': row['file_modified'],  # 文件实际修改时间
                'last_modified': row['file_modified'],  # API兼容性
                'last_indexed': row['last_indexed'],   # 索引时间
                'file_hash': row['file_hash']
            })

        return results

    def search_fts5(self, query: str, limit: int = 100, file_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Perform FTS5 full-text search for fuzzy search candidates.

        Args:
            query: FTS5 query string (formatted for FTS5 syntax)
            limit: Maximum number of results
            file_types: Optional list of file extensions to filter results

        Returns:
            List of search results with metadata
        """
        cursor = self.conn.cursor()

        try:
            # Build the SQL query with optional file type filtering
            params = [query]
            where_conditions = ["docs_fts MATCH ?"]

            if file_types:
                # Normalize extensions (remove leading dots to match database format)
                normalized_types = [ft.lstrip('.') for ft in file_types]
                placeholders = ','.join(['?' for _ in normalized_types])
                where_conditions.append(f"m.file_type IN ({placeholders})")
                params.extend(normalized_types)

            where_clause = " AND ".join(where_conditions)
            params.append(limit)

            cursor.execute(f"""
                SELECT
                    m.file_path,
                    m.file_type,
                    m.file_size,
                    m.file_created,
                    m.file_modified,
                    m.last_indexed,
                    m.file_hash
                FROM docs_fts
                JOIN docs_meta m ON docs_fts.doc_id = m.doc_id
                WHERE {where_clause}
                ORDER BY rank
                LIMIT ?
            """, params)

            results = []
            for row in cursor.fetchall():
                results.append({
                    'file_path': row['file_path'],
                    'file_type': row['file_type'],
                    'file_size': row['file_size'],
                    'file_created': row['file_created'],
                    'file_modified': row['file_modified'],  # 文件实际修改时间
                    'last_modified': row['file_modified'],  # API兼容性
                    'last_indexed': row['last_indexed'],   # 索引时间
                    'file_hash': row['file_hash']
                })

            return results

        except Exception as e:
            print(f"FTS5 search error: {e}")
            # Fallback to LIKE search if FTS5 fails
            return self.search_exact(query, limit)

    def search_path(self, path_query: str, limit: int = 100,
                    file_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Search documents by file path.

        Args:
            path_query: Path search pattern (supports multiple keywords separated by space)
            limit: Maximum number of results
            file_types: Optional list of file extensions to filter results

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

        # Add file type filtering if specified
        if file_types:
            # Normalize extensions (remove leading dots to match database format)
            normalized_types = [ft.lstrip('.') for ft in file_types]
            placeholders = ','.join(['?' for _ in normalized_types])
            where_conditions.append(f"file_type IN ({placeholders})")
            params.extend(normalized_types)

        where_clause = " AND ".join(where_conditions)
        params.append(limit)

        cursor.execute(f"""
            SELECT file_path, file_type, file_size, file_created, file_modified, last_indexed
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
                'file_created': row['file_created'],
                'file_modified': row['file_modified'],  # 文件实际修改时间
                'last_modified': row['file_modified'],  # API兼容性
                'last_indexed': row['last_indexed']    # 索引时间
            })

        return results

    def search_by_metadata(self,
                           min_size: Optional[int] = None,
                           max_size: Optional[int] = None,
                           created_after: Optional[int] = None,
                           created_before: Optional[int] = None,
                           modified_after: Optional[int] = None,
                           modified_before: Optional[int] = None,
                           file_types: Optional[List[str]] = None,
                           limit: int = 100) -> List[Dict[str, Any]]:
        """
        Search documents by metadata criteria.

        Args:
            min_size: Minimum file size in bytes
            max_size: Maximum file size in bytes
            created_after: Created after timestamp
            created_before: Created before timestamp
            modified_after: Modified after timestamp
            modified_before: Modified before timestamp
            file_types: List of file extensions to filter by
            limit: Maximum number of results

        Returns:
            List of matching documents
        """
        cursor = self.conn.cursor()

        where_conditions = []
        params = []

        # File size filters
        if min_size is not None:
            where_conditions.append("file_size >= ?")
            params.append(min_size)

        if max_size is not None:
            where_conditions.append("file_size <= ?")
            params.append(max_size)

        # Creation time filters
        if created_after is not None:
            where_conditions.append("file_created >= ?")
            params.append(created_after)

        if created_before is not None:
            where_conditions.append("file_created <= ?")
            params.append(created_before)

        # Modification time filters
        if modified_after is not None:
            where_conditions.append("last_indexed >= ?")
            params.append(modified_after)

        if modified_before is not None:
            where_conditions.append("last_indexed <= ?")
            params.append(modified_before)

        # File type filters
        if file_types:
            normalized_types = [ft.lstrip('.') for ft in file_types]
            placeholders = ','.join(['?' for _ in normalized_types])
            where_conditions.append(f"file_type IN ({placeholders})")
            params.extend(normalized_types)

        where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
        params.append(limit)

        cursor.execute(f"""
            SELECT file_path, file_type, file_size, file_created, file_modified, last_indexed
            FROM docs_meta
            WHERE {where_clause}
            ORDER BY file_created DESC
            LIMIT ?
        """, params)

        results = []
        for row in cursor.fetchall():
            results.append({
                'file_path': row['file_path'],
                'file_type': row['file_type'],
                'file_size': row['file_size'],
                'file_created': row['file_created'],
                'file_modified': row['file_modified'],  # 文件实际修改时间
                'last_modified': row['file_modified'],  # API兼容性
                'last_indexed': row['last_indexed']    # 索引时间
            })

        return results

    def search_combined(self,
                        content_query: Optional[str] = None,
                        path_query: Optional[str] = None,
                        min_size: Optional[int] = None,
                        max_size: Optional[int] = None,
                        created_after: Optional[int] = None,
                        created_before: Optional[int] = None,
                        file_types: Optional[List[str]] = None,
                        limit: int = 100) -> List[Dict[str, Any]]:
        """
        Combined search supporting content, path, and metadata filters.

        Args:
            content_query: Text content search query
            path_query: File path search query
            min_size: Minimum file size in bytes
            max_size: Maximum file size in bytes
            created_after: Created after timestamp
            created_before: Created before timestamp
            file_types: List of file extensions to filter by
            limit: Maximum number of results

        Returns:
            List of matching documents
        """
        cursor = self.conn.cursor()

        where_conditions = []
        params = []
        join_fts = False

        # Content search (requires FTS join)
        if content_query and content_query.strip():
            keywords = [k.strip() for k in content_query.split() if k.strip()]
            if keywords:
                join_fts = True
                for keyword in keywords:
                    where_conditions.append("docs_fts.content LIKE ?")
                    params.append(f'%{keyword}%')

        # Path search
        if path_query and path_query.strip():
            path_keywords = [k.strip() for k in path_query.split() if k.strip()]
            for keyword in path_keywords:
                where_conditions.append("m.file_path LIKE ?")
                params.append(f'%{keyword}%')

        # File size filters
        if min_size is not None:
            where_conditions.append("m.file_size >= ?")
            params.append(min_size)

        if max_size is not None:
            where_conditions.append("m.file_size <= ?")
            params.append(max_size)

        # Creation time filters
        if created_after is not None:
            where_conditions.append("m.file_created >= ?")
            params.append(created_after)

        if created_before is not None:
            where_conditions.append("m.file_created <= ?")
            params.append(created_before)

        # File type filters
        if file_types:
            normalized_types = [ft.lstrip('.') for ft in file_types]
            placeholders = ','.join(['?' for _ in normalized_types])
            where_conditions.append(f"m.file_type IN ({placeholders})")
            params.extend(normalized_types)

        where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
        params.append(limit)

        if join_fts:
            # Query with FTS join for content search
            cursor.execute(f"""
                SELECT
                    m.file_path,
                    m.file_type,
                    m.file_size,
                    m.file_created,
                    m.file_modified,
                    m.last_indexed,
                    m.file_hash
                FROM docs_fts
                JOIN docs_meta m ON docs_fts.doc_id = m.doc_id
                WHERE {where_clause}
                ORDER BY m.file_created DESC
                LIMIT ?
            """, params)
        else:
            # Query only metadata table
            cursor.execute(f"""
                SELECT file_path, file_type, file_size, file_created, file_modified, last_indexed
                FROM docs_meta m
                WHERE {where_clause}
                ORDER BY file_created DESC
                LIMIT ?
            """, params)

        results = []
        for row in cursor.fetchall():
            result = {
                'file_path': row['file_path'],
                'file_type': row['file_type'],
                'file_size': row['file_size'],
                'file_created': row['file_created'],
                'file_modified': row['file_modified'],  # 文件实际修改时间
                'last_modified': row['file_modified'],  # API兼容性
                'last_indexed': row['last_indexed']    # 索引时间
            }
            if join_fts and 'file_hash' in row.keys():
                result['file_hash'] = row['file_hash']
            results.append(result)

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
            SELECT file_path, file_type, file_size, file_created, file_modified, last_indexed
            FROM docs_meta
            ORDER BY last_indexed DESC
        """)

        results = []
        for row in cursor.fetchall():
            results.append({
                'file_path': row['file_path'],
                'file_type': row['file_type'],
                'file_size': row['file_size'],
                'file_created': row['file_created'],
                'file_modified': row['file_modified'],  # 文件实际修改时间
                'last_modified': row['file_modified'],  # API兼容性
                'last_indexed': row['last_indexed']    # 索引时间
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

    def update_file_path(self, old_path: str, new_path: str) -> bool:
        """
        Update file path in the database (for rename operations).

        Args:
            old_path: Current file path
            new_path: New file path

        Returns:
            True if successful, False otherwise
        """
        try:
            cursor = self.conn.cursor()

            # Check if old file exists in database
            cursor.execute("SELECT doc_id FROM docs_meta WHERE file_path = ?", (old_path,))
            result = cursor.fetchone()
            if not result:
                return False

            # Update file path in metadata table
            cursor.execute("""
                UPDATE docs_meta
                SET file_path = ?
                WHERE file_path = ?
            """, (new_path, old_path))

            self.conn.commit()
            return True

        except Exception as e:
            print(f"Error updating file path from {old_path} to {new_path}: {e}")
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
