# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Installation & Setup
```bash
# Install Python dependencies
pip install -r requirements.txt

# Install system dependencies for DOC file support
# Ubuntu/Debian: sudo apt-get install antiword
# macOS: brew install antiword
# Windows: Download antiword executable and add to PATH
```

### Core CLI Commands
```bash
# Index documents (primary workflow) - NO FILE SIZE LIMITS
python main.py index /path/to/documents --workers $(nproc) --force

# Search operations
python main.py search "query" --type exact --limit 20
python main.py search "fuzzy query" --type fuzzy --min-score 40
python main.py search "*.pdf" --type path

# Advanced search with filters
python main.py advanced --content "machine learning" --path "*.pdf" --types pdf docx

# Interactive mode
python main.py interactive

# Database management
python main.py stats --db documents.db
python main.py update /path/to/file.pdf
python main.py remove /path/to/file.pdf
```

### API Server
```bash
# Start FastAPI server (recommended)
./run_api.sh

# Or start directly
python api_server.py --host 0.0.0.0 --port 8001 --db documents.db

# Development mode with auto-reload
python api_server.py --reload

# API documentation available at:
# http://localhost:8001/docs (Swagger UI)
# http://localhost:8001/redoc (ReDoc)
```


### Testing
```bash
# Run individual parser tests
python -m pytest tests/test_pdf_parser.py
python -m pytest tests/test_docx_parser.py
python -m pytest tests/test_xlsx_parser.py

# Performance testing
python tests/performance_test.py
```

## High-Level Architecture

### Core Components

1. **DocumentDatabase** (`core/database.py`)
   - SQLite FTS5 full-text search engine
   - Optimized for millisecond search responses
   - Separate metadata and FTS tables for performance
   - Batch operations for high-throughput indexing

2. **DocumentIndexer** (`core/indexer.py`)
   - Multi-process concurrent architecture
   - Producer-consumer pattern with dedicated database writer
   - Avoids Python GIL limitations and database lock contention
   - Configurable worker processes (defaults to CPU count)

3. **SearchManager** (`core/search_manager.py`)
   - Unified search interface for all search types
   - Hybrid fuzzy search: FTS5 filtering + RapidFuzz ranking
   - Three search modes: exact, fuzzy, path-based
   - Result formatting and statistics

4. **ParserFactory** (`parsers/base_parser.py`)
   - Extensible parser system with factory pattern
   - High-performance parsers for each file format
   - Automatic format detection and registration

### Performance Design

- **PDF**: PyMuPDF (C-based, 12x faster than PyPDF2)
- **XLSX**: python-calamine (Rust-based, 10-80x faster than openpyxl)
- **DOCX**: Direct XML parsing with lxml (faster than python-docx)
- **DOC**: antiword system integration
- **XLS**: xlrd industry standard
- **CSV**: pandas optimized processing
- **Text Files**: Enhanced multi-encoding support for 250+ file types
- **Fuzzy Search**: RapidFuzz C++ implementation

### Multi-Interface Architecture

- **CLI**: Full-featured command-line interface (`main.py`)
- **REST API**: FastAPI server with OpenAPI documentation (`api_server.py`)
- **Desktop App**: Electron-based File Searcher with search capabilities

## Key Technical Details

### Concurrency Model
- Main process: File discovery and queue management
- Worker processes: CPU-intensive document parsing
- Database writer: Single process for all database operations
- Eliminates lock contention and maximizes throughput

### Search Types
- **Exact**: Direct FTS5 full-text search
- **Fuzzy**: Two-stage hybrid model (FTS5 candidates + RapidFuzz scoring)
- **Path**: File path pattern matching with glob support

### Database Schema
- `docs_meta`: File metadata (path, hash, size, type, timestamp)
- `docs_fts`: FTS5 virtual table for full-text search
- Optimized for both search performance and storage efficiency

### File Format Support
```python
# Supported extensions and parsers
FORMATS = {
    '.pdf': 'PyMuPDF',      # High-performance PDF parsing
    '.docx': 'lxml',        # Direct XML parsing
    '.doc': 'antiword',     # System integration
    '.xlsx': 'calamine',    # Rust-based Excel parsing
    '.xls': 'xlrd',         # Legacy Excel support
    '.csv': 'pandas',       # Optimized CSV processing
    
    # Comprehensive text-based file support (250+ extensions)
    'text_files': {
        'programming': ['py', 'js', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'dart', 'etc.'],
        'config': ['json', 'yaml', 'toml', 'ini', 'xml', 'env', 'conf', 'properties', 'etc.'],
        'web': ['html', 'css', 'scss', 'vue', 'jsx', 'tsx', 'svg', 'etc.'],
        'shell': ['sh', 'bash', 'zsh', 'fish', 'bat', 'ps1', 'etc.'],
        'docs': ['md', 'rst', 'tex', 'org', 'asciidoc', 'etc.'],
        'build': ['makefile', 'cmake', 'gradle', 'dockerfile', 'etc.']
    }
}
```

## Project Structure

```
filesearch/
├── core/                   # Core business logic
│   ├── database.py         # SQLite FTS5 database operations
│   ├── indexer.py          # Multi-process document indexing
│   └── search_manager.py   # Unified search interface
├── parsers/                # File format parsers
│   ├── base_parser.py      # Parser factory and base class
│   ├── text_parser.py      # Enhanced text parser (250+ extensions)
│   ├── pdf_parser.py       # PyMuPDF PDF parsing
│   ├── docx_parser.py      # lxml DOCX parsing
│   ├── xlsx_parser.py      # Calamine XLSX parsing
│   └── ...                 # Other format parsers
├── utils/                  # Utility functions
│   ├── file_utils.py       # File operations and validation
│   └── fuzzy_search.py     # RapidFuzz integration
├── tests/                  # Unit and performance tests
├── main.py                 # CLI entry point
├── api_server.py           # FastAPI REST API server
├── run_api.sh              # API server startup script
└── electron-file-manager/  # Desktop application
```

## Development Workflow

### Adding New File Format Support
1. Create parser class inheriting from `BaseParser`
2. Implement `parse()` and `get_supported_extensions()` methods
3. Register parser with `ParserFactory.register_parser()`
4. Add tests in `tests/test_<format>_parser.py`

### Database Operations
- Default database: `documents.db`
- All operations use context managers for proper connection handling
- Batch operations for performance optimization
- FTS5 configuration tuned for document search

### Performance Considerations
- Multi-process indexing utilizes all CPU cores
- Database writer process prevents lock contention
- High-performance parsing libraries chosen based on benchmarks
- Fuzzy search uses two-stage filtering to avoid performance bottlenecks

## Recent Changes

**Latest Update (2024-12-15)**: 
- Removed boolean search functionality for simplified interface
- Added FastAPI REST API service layer
- Three search types now supported: exact, fuzzy, path
- Full API documentation available at `/docs` endpoint