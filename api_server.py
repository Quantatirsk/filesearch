#!/usr/bin/env python3
"""
FastAPI REST API Server for Document Search System

Provides HTTP REST API endpoints for the document search functionality,
supporting indexing, searching, and management operations.
"""

import sys
import os
import signal
import psutil
import socket
from pathlib import Path
from typing import List, Dict, Any, Optional
import tempfile
import shutil

from fastapi import FastAPI, HTTPException, File, UploadFile, Query, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from core.database import DocumentDatabase
from core.indexer import DocumentIndexer
from core.search_manager import SearchManager
from parsers.base_parser import ParserFactory


# Pydantic models for request/response validation
class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query string")
    search_type: str = Field("hybrid", description="Search type: exact, fuzzy, path, hybrid")
    limit: int = Field(100, ge=1, le=1000, description="Maximum number of results")
    min_fuzzy_score: float = Field(30.0, ge=0.0, le=100.0, description="Minimum fuzzy similarity score")

class SearchResponse(BaseModel):
    success: bool
    query: str
    search_type: str
    results: List[Dict[str, Any]]
    total_results: int
    search_time: float
    limit: int
    error: Optional[str] = None

class AdvancedSearchRequest(BaseModel):
    content_query: Optional[str] = Field(None, description="Content search query")
    path_query: Optional[str] = Field(None, description="Path search query")
    file_types: Optional[List[str]] = Field(None, description="File types to include")
    fuzzy: bool = Field(False, description="Use fuzzy matching for content")
    limit: int = Field(100, ge=1, le=1000, description="Maximum number of results")

class IndexRequest(BaseModel):
    directory: str = Field(..., description="Directory path to index")
    force: bool = Field(False, description="Force reindexing of all files")
    workers: Optional[int] = Field(None, description="Number of worker processes")

class IndexResponse(BaseModel):
    success: bool
    indexed_files: int
    total_files: int
    processing_time: float
    error: Optional[str] = None

class StatsResponse(BaseModel):
    success: bool
    document_count: int
    total_content_size: int
    database_size: int
    file_types: Dict[str, int]
    error: Optional[str] = None


# Initialize FastAPI app
app = FastAPI(
    title="Document Search API",
    description="High-performance document search and indexing API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware for web frontend support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global configuration
DEFAULT_DB_PATH = "documents.db"
UPLOAD_TEMP_DIR = "temp_uploads"


def get_search_manager(db_path: str = DEFAULT_DB_PATH) -> SearchManager:
    """Get search manager instance"""
    return SearchManager(db_path)


def get_database(db_path: str = DEFAULT_DB_PATH) -> DocumentDatabase:
    """Get database instance"""
    return DocumentDatabase(db_path)


def is_port_in_use(port: int, host: str = "localhost") -> bool:
    """Check if a port is already in use"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(1)
            result = sock.connect_ex((host, port))
            return result == 0
    except Exception:
        return False


def kill_process_on_port(port: int) -> bool:
    """Kill process using the specified port"""
    try:
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                # Get network connections for this process
                connections = proc.net_connections()
                for conn in connections:
                    if hasattr(conn, 'laddr') and conn.laddr and conn.laddr.port == port:
                        print(f"🔄 Found process {proc.info['pid']} ({proc.info['name']}) using port {port}")
                        proc.terminate()
                        try:
                            proc.wait(timeout=5)
                            print(f"✅ Successfully terminated process {proc.info['pid']}")
                        except psutil.TimeoutExpired:
                            # Force kill if terminate doesn't work
                            proc.kill()
                            print(f"💥 Force killed process {proc.info['pid']}")
                        return True
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            except Exception:
                # Skip processes we can't access
                continue
    except Exception as e:
        print(f"❌ Error killing process on port {port}: {e}")
        return False
    return False


def cleanup_port(port: int, host: str = "localhost") -> None:
    """Clean up port before starting server"""
    # Check both IPv4 and IPv6
    ipv4_in_use = is_port_in_use(port, host)
    ipv6_in_use = is_port_in_use(port, "::1") if host in ["localhost", "127.0.0.1"] else False
    
    if ipv4_in_use or ipv6_in_use:
        print(f"🚨 Port {port} is already in use, attempting to free it...")
        killed = kill_process_on_port(port)
        if killed:
            print(f"✅ Port {port} has been freed")
            # Wait a moment for the port to be fully released
            import time
            time.sleep(2)
            
            # Verify port is actually free
            if is_port_in_use(port, host):
                print(f"⚠️  Port {port} still appears to be in use after cleanup")
            else:
                print(f"🎉 Port {port} is now available")
        else:
            print(f"⚠️  Could not free port {port}, trying alternative method...")
            # Alternative: Use lsof to find and kill process
            try:
                import subprocess
                result = subprocess.run(['lsof', '-ti', f':{port}'], 
                                      capture_output=True, text=True, timeout=5)
                if result.stdout.strip():
                    pids = result.stdout.strip().split('\n')
                    for pid in pids:
                        try:
                            subprocess.run(['kill', '-9', pid], timeout=5)
                            print(f"💥 Force killed process {pid} using lsof")
                        except Exception:
                            pass
                    import time
                    time.sleep(1)
            except Exception:
                pass
            
            if is_port_in_use(port, host):
                print(f"❌ Port {port} is still in use - server startup may fail")
    else:
        print(f"✅ Port {port} is available")


@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint with API information"""
    return {
        "name": "Document Search API",
        "version": "1.0.0",
        "description": "High-performance document search and indexing API",
        "endpoints": {
            "search": "/search",
            "advanced_search": "/search/advanced",
            "index": "/index",
            "upload": "/upload",
            "stats": "/stats",
            "health": "/health",
            "docs": "/docs"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        with get_database() as db:
            stats = db.get_stats()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")


@app.post("/search", response_model=SearchResponse)
async def search_documents(
    request: SearchRequest,
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Search documents using various search types
    
    - **exact**: Exact phrase matching
    - **fuzzy**: Fuzzy similarity matching  
    - **path**: File path pattern matching
    - **hybrid**: Combined search using all methods with deduplication
    """
    try:
        search_manager = get_search_manager(db_path)
        result = search_manager.search(
            query=request.query,
            search_type=request.search_type,
            limit=request.limit,
            min_fuzzy_score=request.min_fuzzy_score
        )
        
        return SearchResponse(**result)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search/advanced", response_model=SearchResponse)
async def advanced_search(
    request: AdvancedSearchRequest,
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Advanced search with multiple filters and options
    """
    try:
        search_manager = get_search_manager(db_path)
        result = search_manager.search_advanced(
            content_query=request.content_query,
            path_query=request.path_query,
            file_types=request.file_types,
            fuzzy=request.fuzzy,
            limit=request.limit
        )
        
        return SearchResponse(**result)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index", response_model=IndexResponse)
async def index_directory(
    request: IndexRequest,
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Index documents in a directory
    """
    try:
        directory_path = Path(request.directory)
        if not directory_path.exists():
            raise HTTPException(status_code=404, detail="Directory not found")
        
        if not directory_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a directory")
        
        indexer = DocumentIndexer(db_path, max_workers=request.workers)
        stats = indexer.index_directory(
            str(directory_path),
            force_reindex=request.force
        )
        
        return IndexResponse(
            success=True,
            indexed_files=stats.get('indexed_files', 0),
            total_files=stats.get('total_files', 0),
            processing_time=stats.get('processing_time', 0.0)
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload")
async def upload_and_index(
    files: List[UploadFile] = File(...),
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Upload files and automatically index them
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    # Create temporary directory for uploads
    temp_dir = Path(UPLOAD_TEMP_DIR)
    temp_dir.mkdir(exist_ok=True)
    
    try:
        uploaded_files = []
        
        # Save uploaded files to temporary directory
        for file in files:
            if file.filename:
                file_path = temp_dir / file.filename
                
                with open(file_path, "wb") as buffer:
                    content = await file.read()
                    buffer.write(content)
                
                uploaded_files.append(str(file_path))
        
        # Index uploaded files
        indexer = DocumentIndexer(db_path)
        stats = indexer.index_directory(
            str(temp_dir),
            force_reindex=True
        )
        
        return {
            "success": True,
            "uploaded_files": len(uploaded_files),
            "indexed_files": stats.get('indexed_files', 0),
            "processing_time": stats.get('processing_time', 0.0),
            "files": [Path(f).name for f in uploaded_files]
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        # Clean up temporary files
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


@app.get("/stats", response_model=StatsResponse)
async def get_database_stats(
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Get database statistics and information
    """
    try:
        search_manager = get_search_manager(db_path)
        stats = search_manager.get_search_stats()
        
        if 'error' in stats:
            raise HTTPException(status_code=500, detail=stats['error'])
        
        return StatsResponse(
            success=True,
            document_count=stats.get('document_count', 0),
            total_content_size=stats.get('total_content_size', 0),
            database_size=stats.get('database_size', 0),
            file_types=stats.get('file_types', {})
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/suggest")
async def suggest_queries(
    query: str = Query(..., description="Query to get suggestions for"),
    max_suggestions: int = Query(5, ge=1, le=20, description="Maximum number of suggestions"),
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Get query suggestions based on indexed content
    """
    try:
        search_manager = get_search_manager(db_path)
        suggestions = search_manager.suggest_query(query, max_suggestions)
        
        return {
            "query": query,
            "suggestions": suggestions,
            "count": len(suggestions)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/index")
async def clear_index(
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path"),
    confirm: bool = Query(False, description="Confirmation flag")
):
    """
    Clear the entire search index (requires confirmation)
    """
    if not confirm:
        raise HTTPException(
            status_code=400, 
            detail="Index clearing requires confirmation parameter to be true"
        )
    
    try:
        db_file = Path(db_path)
        if db_file.exists():
            db_file.unlink()
        
        return {
            "success": True,
            "message": "Search index cleared successfully"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/supported-formats")
async def get_supported_formats():
    """
    Get list of supported file formats
    """
    try:
        parser_factory = ParserFactory()
        supported_formats = list(parser_factory._parsers.keys())
        
        return {
            "supported_formats": supported_formats,
            "count": len(supported_formats),
            "format_details": {
                "pdf": "Portable Document Format",
                "docx": "Microsoft Word 2007+",
                "doc": "Microsoft Word 97-2003",
                "xlsx": "Microsoft Excel 2007+",
                "xls": "Microsoft Excel 97-2003",
                "csv": "Comma Separated Values",
                "txt": "Plain Text",
                "md": "Markdown"
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Document Search API Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8001, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="Database file path")
    
    args = parser.parse_args()
    
    # Update global database path
    DEFAULT_DB_PATH = args.db
    
    print(f"🚀 Starting Document Search API Server...")
    print(f"📊 Database: {DEFAULT_DB_PATH}")
    print(f"🌐 Server: http://{args.host}:{args.port}")
    print(f"📚 API Docs: http://{args.host}:{args.port}/docs")
    print(f"📖 ReDoc: http://{args.host}:{args.port}/redoc")
    
    # Clean up port before starting
    cleanup_port(args.port, args.host)
    
    try:
        uvicorn.run(
            "api_server:app",
            host=args.host,
            port=args.port,
            reload=args.reload
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server failed to start: {e}")
        sys.exit(1)