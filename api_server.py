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

# Fix Windows encoding issue for emoji display
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        pass
from typing import List, Dict, Any, Optional
import tempfile
import shutil

from fastapi import FastAPI, HTTPException, File, UploadFile, Query, Body
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
import openai
import os
from dotenv import load_dotenv
import json
import asyncio
import time
from sse_starlette.sse import EventSourceResponse
import threading
from collections import defaultdict

# Add project root to path - handle PyInstaller bundle
if hasattr(sys, '_MEIPASS'):
    # PyInstaller bundle environment
    project_root = Path(sys._MEIPASS)
else:
    # Development environment
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
    file_types: Optional[List[str]] = Field(None, description="File types to include in search")

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

class MetadataSearchRequest(BaseModel):
    min_size: Optional[int] = Field(None, description="Minimum file size in bytes")
    max_size: Optional[int] = Field(None, description="Maximum file size in bytes")
    created_after: Optional[int] = Field(None, description="Created after timestamp")
    created_before: Optional[int] = Field(None, description="Created before timestamp")
    modified_after: Optional[int] = Field(None, description="Modified after timestamp")
    modified_before: Optional[int] = Field(None, description="Modified before timestamp")
    file_types: Optional[List[str]] = Field(None, description="File types to include")
    limit: int = Field(100, ge=1, le=1000, description="Maximum number of results")

class CombinedSearchRequest(BaseModel):
    content_query: Optional[str] = Field(None, description="Content search query")
    path_query: Optional[str] = Field(None, description="Path search query")
    min_size: Optional[int] = Field(None, description="Minimum file size in bytes")
    max_size: Optional[int] = Field(None, description="Maximum file size in bytes")
    created_after: Optional[int] = Field(None, description="Created after timestamp")
    created_before: Optional[int] = Field(None, description="Created before timestamp")
    file_types: Optional[List[str]] = Field(None, description="File types to include")
    limit: int = Field(100, ge=1, le=1000, description="Maximum number of results")

class IndexRequest(BaseModel):
    directory: str = Field(..., description="Directory path to index")
    force: bool = Field(False, description="Force reindexing of all files")
    workers: Optional[int] = Field(None, description="Number of worker processes")
    include_all_files: bool = Field(False, description="Include all file types (not just text files)")

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

class FileContentRequest(BaseModel):
    file_path: str = Field(..., description="Path to the file")

class FileContentResponse(BaseModel):
    success: bool
    file_path: str
    content: Optional[str]
    error: Optional[str] = None

class RemoveFileRequest(BaseModel):
    file_path: str = Field(..., description="Path to the file to remove from index")

class RemoveFileResponse(BaseModel):
    success: bool
    file_path: str
    error: Optional[str] = None

class UpdateFilePathRequest(BaseModel):
    old_path: str = Field(..., description="Current file path")
    new_path: str = Field(..., description="New file path")

class UpdateFilePathResponse(BaseModel):
    success: bool
    old_path: str
    new_path: str
    error: Optional[str] = None

# LLM Chat Completions Models
class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: system, user, assistant")
    content: str = Field(..., description="Message content")

class ChatCompletionRequest(BaseModel):
    model: str = Field(default="gpt-4.1-mini", description="Model name")
    messages: List[ChatMessage] = Field(..., description="List of messages")
    stream: bool = Field(default=False, description="Whether to stream the response")
    max_tokens: Optional[int] = Field(default=None, description="Maximum number of tokens")
    temperature: float = Field(default=0.7, description="Sampling temperature")

class ChatCompletionChoice(BaseModel):
    index: int
    message: Optional[ChatMessage] = None
    delta: Optional[Dict[str, Any]] = None
    finish_reason: Optional[str] = None

class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[ChatCompletionChoice]
    usage: Optional[Dict[str, int]] = None


# Initialize FastAPI app
app = FastAPI(
    title="Document Search API",
    description="High-performance document search and indexing API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Global storage for indexing progress tracking
indexing_progress = defaultdict(lambda: {
    "status": "idle",
    "processed_files": 0,
    "total_files": 0,
    "current_file": "",
    "errors": [],
    "start_time": 0,
    "elapsed_time": 0,
    "speed": 0,
    "eta": 0
})

# Global current indexing session
current_indexing_session = None
progress_lock = threading.Lock()

# Add CORS middleware for web frontend support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global configuration - use absolute paths for PyInstaller compatibility
if hasattr(sys, '_MEIPASS'):
    # PyInstaller bundle environment - use user's home directory
    import os
    user_home = Path.home()
    app_data_dir = user_home / ".filesearch"
    app_data_dir.mkdir(exist_ok=True)
    DEFAULT_DB_PATH = str(app_data_dir / "documents.db")
    UPLOAD_TEMP_DIR = str(app_data_dir / "temp_uploads")
else:
    # Development environment - use current directory
    DEFAULT_DB_PATH = "documents.db"
    UPLOAD_TEMP_DIR = "temp_uploads"

# Load environment variables
load_dotenv()

# Initialize OpenAI client
openai_client = None
try:
    openai_api_key = os.getenv("OPENAI_API_KEY")
    openai_base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    
    if openai_api_key:
        openai_client = openai.OpenAI(
            api_key=openai_api_key,
            base_url=openai_base_url
        )
        if os.getenv('DEBUG'):
            print(f"✅ OpenAI client initialized with base URL: {openai_base_url}")
    else:
        print("⚠️  OpenAI API key not found in environment variables")
except Exception as e:
    print(f"❌ Failed to initialize OpenAI client: {e}")
    openai_client = None


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
    """
    Kill process using the specified port with optimized hybrid strategy
    
    Strategy:
    1. Unix systems: Use lsof for high performance
    2. Fallback: Use psutil for cross-platform compatibility
    3. Graceful termination followed by force kill if needed
    """
    import platform
    
    # Strategy 1: Use lsof on Unix systems (macOS/Linux) - high performance
    if platform.system() in ['Darwin', 'Linux']:
        print(f"🔍 Using lsof to find processes on port {port}")
        if _kill_with_lsof(port):
            return True
        print("⚠️  lsof method failed, falling back to psutil")
    
    # Strategy 2: Fallback to psutil (Windows compatible + lsof failure)
    print(f"🔍 Using psutil to find processes on port {port}")
    return _kill_with_psutil(port)


def _kill_with_lsof(port: int) -> bool:
    """High-performance lsof-based process killing"""
    try:
        import subprocess
        import time
        
        # Find processes using the port
        result = subprocess.run(
            ['lsof', '-ti', f':{port}'], 
            capture_output=True, 
            text=True, 
            timeout=5
        )
        
        if not result.stdout.strip():
            print(f"✅ No process found using port {port}")
            return True
            
        pids = [pid.strip() for pid in result.stdout.strip().split('\n') if pid.strip()]
        
        if not pids:
            return True
            
        print(f"🎯 Found {len(pids)} process(es) using port {port}: {pids}")
        
        # Graceful termination strategy
        for pid in pids:
            try:
                # Step 1: Send SIGTERM for graceful shutdown
                subprocess.run(['kill', '-TERM', pid], timeout=3, check=True)
                print(f"📤 Sent SIGTERM to process {pid}")
                
                # Step 2: Wait 3 seconds for graceful shutdown
                time.sleep(3)
                
                # Step 3: Check if process still exists
                check_result = subprocess.run(
                    ['kill', '-0', pid], 
                    capture_output=True, 
                    timeout=2
                )
                
                if check_result.returncode == 0:
                    # Process still exists, force kill
                    subprocess.run(['kill', '-9', pid], timeout=3, check=True)
                    print(f"💥 Force killed process {pid}")
                else:
                    print(f"✅ Process {pid} terminated gracefully")
                    
            except subprocess.CalledProcessError as e:
                if e.returncode == 1:  # Process already dead
                    print(f"✅ Process {pid} already terminated")
                else:
                    print(f"⚠️  Failed to kill process {pid}: {e}")
                    continue
            except subprocess.TimeoutExpired:
                print(f"⏰ Timeout killing process {pid}")
                continue
                
        return True
        
    except subprocess.TimeoutExpired:
        print("⏰ lsof command timed out")
        return False
    except FileNotFoundError:
        print("❌ lsof command not found")
        return False
    except Exception as e:
        print(f"❌ lsof method failed: {e}")
        return False


def _kill_with_psutil(port: int) -> bool:
    """Cross-platform psutil-based process killing (optimized)"""
    try:
        killed_any = False
        
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                # Skip obvious system processes for performance
                if proc.info['name'] in ['kernel_task', 'launchd', 'systemd', 'kthreadd']:
                    continue
                    
                # Get network connections for this process
                connections = proc.net_connections()
                for conn in connections:
                    if hasattr(conn, 'laddr') and conn.laddr and conn.laddr.port == port:
                        print(f"🎯 Found process {proc.info['pid']} ({proc.info['name']}) using port {port}")
                        
                        # Graceful termination -> force kill strategy
                        try:
                            proc.terminate()  # SIGTERM
                            proc.wait(timeout=5)  # Wait up to 5 seconds
                            print(f"✅ Process {proc.info['pid']} terminated gracefully")
                        except psutil.TimeoutExpired:
                            proc.kill()  # SIGKILL
                            print(f"💥 Force killed process {proc.info['pid']}")
                        
                        killed_any = True
                        
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            except Exception:
                # Skip processes we can't access
                continue
                
        return killed_any
        
    except Exception as e:
        print(f"❌ psutil method failed: {e}")
        return False


def cleanup_port(port: int, host: str = "localhost") -> None:
    """Clean up port before starting server with optimized strategy"""
    # Check both IPv4 and IPv6
    ipv4_in_use = is_port_in_use(port, host)
    ipv6_in_use = is_port_in_use(port, "::1") if host in ["localhost", "127.0.0.1"] else False
    
    if not (ipv4_in_use or ipv6_in_use):
        if os.getenv('DEBUG'):
            print(f"✅ Port {port} is available")
        return
    
    print(f"🚨 Port {port} is in use, cleaning up...")
    
    # Use optimized kill function (includes both lsof and psutil strategies)
    if kill_process_on_port(port):
        # Wait for port to be fully released
        import time
        for _ in range(5):  # Check up to 5 times with 1s intervals
            time.sleep(1)
            if not is_port_in_use(port, host):
                print(f"🎉 Port {port} is now available")
                return
        
        print(f"⚠️  Port {port} still appears busy after cleanup")
    else:
        print(f"❌ Failed to clean up port {port} - server startup may fail")


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
            db.get_stats()  # Test database connectivity
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
            min_fuzzy_score=request.min_fuzzy_score,
            file_types=request.file_types
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


@app.post("/search/metadata", response_model=SearchResponse)
async def metadata_search(
    request: MetadataSearchRequest,
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Search documents by metadata criteria (size, dates, file types)
    """
    try:
        start_time = time.time()
        
        with get_database(db_path) as db:
            results = db.search_by_metadata(
                min_size=request.min_size,
                max_size=request.max_size,
                created_after=request.created_after,
                created_before=request.created_before,
                modified_after=request.modified_after,
                modified_before=request.modified_before,
                file_types=request.file_types,
                limit=request.limit
            )
        
        search_time = time.time() - start_time
        
        return SearchResponse(
            success=True,
            query="metadata_search",
            search_type="metadata",
            results=results,
            total_results=len(results),
            search_time=search_time,
            limit=request.limit
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search/combined", response_model=SearchResponse)
async def combined_search(
    request: CombinedSearchRequest,
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Combined search supporting content, path, and metadata filters
    """
    try:
        start_time = time.time()
        
        with get_database(db_path) as db:
            results = db.search_combined(
                content_query=request.content_query,
                path_query=request.path_query,
                min_size=request.min_size,
                max_size=request.max_size,
                created_after=request.created_after,
                created_before=request.created_before,
                file_types=request.file_types,
                limit=request.limit
            )
        
        search_time = time.time() - start_time
        
        # Determine search type based on what filters were used
        search_type = "combined"
        if request.content_query:
            search_type += "_content"
        if request.path_query:
            search_type += "_path"
        if any([request.min_size, request.max_size, request.created_after, request.created_before]):
            search_type += "_metadata"
        
        return SearchResponse(
            success=True,
            query=f"content:{request.content_query or ''} path:{request.path_query or ''}",
            search_type=search_type,
            results=results,
            total_results=len(results),
            search_time=search_time,
            limit=request.limit
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/file/content", response_model=FileContentResponse)
async def get_file_content(
    request: FileContentRequest,
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Get the full indexed content of a specific file
    """
    try:
        with get_database(db_path) as db:
            content = db.get_document_content(request.file_path)
            
            if content is None:
                return FileContentResponse(
                    success=False,
                    file_path=request.file_path,
                    content=None,
                    error="File not found in index"
                )
            
            return FileContentResponse(
                success=True,
                file_path=request.file_path,
                content=content
            )
    
    except Exception as e:
        return FileContentResponse(
            success=False,
            file_path=request.file_path,
            content=None,
            error=str(e)
        )


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
        print(f"[DEBUG] Indexing directory: {directory_path}")
        print(f"[DEBUG] Database path: {db_path}")
        print(f"[DEBUG] Current working directory: {Path.cwd()}")
        print(f"[DEBUG] Directory exists: {directory_path.exists()}")
        print(f"[DEBUG] Directory is dir: {directory_path.is_dir()}")
        
        if not directory_path.exists():
            raise HTTPException(status_code=404, detail="Directory not found")
        
        if not directory_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a directory")
        
        # Check database directory permissions
        db_path_obj = Path(db_path)
        db_dir = db_path_obj.parent
        print(f"[DEBUG] Database directory: {db_dir}")
        print(f"[DEBUG] Database directory exists: {db_dir.exists()}")
        print(f"[DEBUG] Database directory writable: {os.access(db_dir, os.W_OK)}")
        
        indexer = DocumentIndexer(db_path, max_workers=request.workers)
        stats = indexer.index_directory(
            str(directory_path),
            force_reindex=request.force,
            include_all_files=request.include_all_files
        )
        
        print(f"[DEBUG] Indexing stats: {stats}")
        
        return IndexResponse(
            success=True,
            indexed_files=stats.get('indexed_files', 0),
            total_files=stats.get('total_files', 0),
            processing_time=stats.get('processing_time', 0.0)
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/indexing/progress")
async def get_indexing_progress():
    """
    Get current indexing progress for polling
    """
    global current_indexing_session
    
    with progress_lock:
        # Check if there's a current indexing session
        if not current_indexing_session or current_indexing_session not in indexing_progress:
            return {
                "status": "idle",
                "processed": 0,
                "total": 0,
                "current_file": "",
                "speed": 0,
                "elapsed_time": 0,
                "eta": 0
            }
        
        # Get the current session progress
        progress = dict(indexing_progress[current_indexing_session])
        
        # Calculate timing information
        elapsed_time = progress.get("elapsed_time", 0)
        speed = progress.get("speed", 0)
        eta = progress.get("eta", 0)
        
        return {
            "status": progress["status"],
            "processed": progress["processed_files"],
            "total": progress["total_files"],
            "current_file": progress["current_file"],
            "speed": speed,
            "elapsed_time": elapsed_time,
            "eta": eta
        }


@app.get("/index/progress/{session_id}")
async def get_index_progress(session_id: str):
    """
    Stream real-time indexing progress updates using Server-Sent Events
    """
    async def event_generator():
        while True:
            with progress_lock:
                progress = dict(indexing_progress[session_id])
            
            # Send progress update
            yield {
                "event": "progress",
                "data": json.dumps({
                    "status": progress["status"],
                    "processed_files": progress["processed_files"],
                    "total_files": progress["total_files"],
                    "current_file": progress["current_file"],
                    "errors": progress["errors"][-5:]  # Last 5 errors
                })
            }
            
            # Check if indexing is complete
            if progress["status"] in ["completed", "failed"]:
                yield {
                    "event": "complete",
                    "data": json.dumps({"status": progress["status"]})
                }
                break
            
            # Wait before next update
            await asyncio.sleep(0.5)
    
    return EventSourceResponse(event_generator())


@app.post("/index/stream")
async def index_directory_stream(
    request: IndexRequest,
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Index documents in a directory with real-time progress streaming
    """
    import uuid
    session_id = str(uuid.uuid4())
    
    # Initialize progress for this session
    global current_indexing_session
    start_time = time.time()
    with progress_lock:
        current_indexing_session = session_id
        indexing_progress[session_id] = {
            "status": "starting",
            "processed_files": 0,
            "total_files": 0,
            "current_file": "",
            "errors": [],
            "start_time": start_time,
            "elapsed_time": 0,
            "speed": 0,
            "eta": 0
        }
    
    # Start indexing in background thread
    def run_indexing():
        try:
            directory_path = Path(request.directory)
            
            if not directory_path.exists():
                with progress_lock:
                    indexing_progress[session_id]["status"] = "failed"
                    indexing_progress[session_id]["errors"].append("Directory not found")
                return
            
            if not directory_path.is_dir():
                with progress_lock:
                    indexing_progress[session_id]["status"] = "failed"
                    indexing_progress[session_id]["errors"].append("Path is not a directory")
                return
            
            # Create custom indexer with progress callback
            def progress_callback(stats):
                with progress_lock:
                    current_time = time.time()
                    elapsed_time = current_time - start_time
                    processed = stats.get("processed_files", 0)
                    total = stats.get("total_files", 0)
                    
                    # Calculate speed (files per second)
                    speed = processed / elapsed_time if elapsed_time > 0 else 0
                    
                    # Calculate ETA (estimated time to completion)
                    remaining = total - processed
                    eta = remaining / speed if speed > 0 and remaining > 0 else 0
                    
                    indexing_progress[session_id].update({
                        "status": "indexing",
                        "processed_files": processed,
                        "total_files": total,
                        "current_file": stats.get("current_file", ""),
                        "elapsed_time": elapsed_time,
                        "speed": speed,
                        "eta": eta
                    })
            
            indexer = DocumentIndexer(db_path, max_workers=request.workers)
            
            # Use the indexer with progress callback
            stats = indexer.index_directory(
                str(directory_path),
                force_reindex=request.force,
                include_all_files=request.include_all_files,
                progress_callback=progress_callback
            )
            
            with progress_lock:
                final_time = time.time()
                final_elapsed = final_time - start_time
                indexing_progress[session_id].update({
                    "status": "completed",
                    "processed_files": stats.get('indexed_files', 0),
                    "total_files": stats.get('total_files', 0),
                    "elapsed_time": final_elapsed,
                    "speed": stats.get('indexed_files', 0) / final_elapsed if final_elapsed > 0 else 0,
                    "eta": 0
                })
                # Keep current session for a bit so UI can show completion
                # It will be cleared after timeout or new session starts
        
        except Exception as e:
            with progress_lock:
                indexing_progress[session_id]["status"] = "failed"
                indexing_progress[session_id]["errors"].append(str(e))
    
    # Start indexing in background
    threading.Thread(target=run_indexing, daemon=True).start()
    
    return JSONResponse({
        "session_id": session_id,
        "message": "Indexing started",
        "progress_url": f"/index/progress/{session_id}"
    })


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
    Get comprehensive list of supported file formats with categorization
    """
    try:
        parser_factory = ParserFactory()
        supported_formats = list(parser_factory._parsers.keys())
        
        # Categorize formats for better UI organization
        format_categories = {
            "documents": {
                "name": "Document Files",
                "description": "Office documents and PDFs",
                "formats": [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".rtf"],
                "icon": "FileText"
            },
            "programming": {
                "name": "Programming Languages",
                "description": "Source code files",
                "formats": [".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".c", ".cpp", ".h", ".hpp", 
                           ".cs", ".php", ".rb", ".go", ".rs", ".swift", ".kt", ".scala", ".pl", ".lua", 
                           ".r", ".m", ".asm", ".sql", ".vbs", ".ps1", ".hs", ".ml", ".clj", ".ex", ".elm"],
                "icon": "Code"
            },
            "web": {
                "name": "Web Technologies",
                "description": "Web development files",
                "formats": [".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte", 
                           ".xml", ".svg", ".jsp", ".asp", ".ejs", ".erb", ".mustache", ".twig"],
                "icon": "Globe"
            },
            "config": {
                "name": "Configuration Files",
                "description": "Configuration and data files",
                "formats": [".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env", 
                           ".properties", ".dockerfile", ".makefile", ".gitignore", ".editorconfig"],
                "icon": "Settings"
            },
            "shell": {
                "name": "Shell Scripts",
                "description": "Command line scripts",
                "formats": [".sh", ".bash", ".zsh", ".fish", ".bat", ".cmd", ".ps1"],
                "icon": "Terminal"
            },
            "docs": {
                "name": "Documentation",
                "description": "Documentation and markup files",
                "formats": [".md", ".rst", ".tex", ".org", ".asciidoc", ".wiki", ".txt"],
                "icon": "BookOpen"
            },
            "build": {
                "name": "Build & Deploy",
                "description": "Build and deployment files",
                "formats": [".makefile", ".cmake", ".gradle", ".maven", ".sbt", ".dockerfile", 
                           ".terraform", ".k8s", ".ansible", ".vagrant"],
                "icon": "Package"
            }
        }
        
        # Filter categories to only include formats that are actually supported
        filtered_categories = {}
        for category_key, category_data in format_categories.items():
            supported_in_category = [fmt for fmt in category_data["formats"] if fmt in supported_formats]
            if supported_in_category:
                filtered_categories[category_key] = {
                    **category_data,
                    "formats": supported_in_category,
                    "count": len(supported_in_category)
                }
        
        # Get format descriptions
        format_descriptions = {
            # Documents
            ".pdf": "Portable Document Format",
            ".docx": "Microsoft Word 2007+",
            ".doc": "Microsoft Word 97-2003",
            ".xlsx": "Microsoft Excel 2007+",
            ".xls": "Microsoft Excel 97-2003",
            ".csv": "Comma Separated Values",
            ".rtf": "Rich Text Format",
            
            # Programming Languages
            ".py": "Python",
            ".js": "JavaScript",
            ".ts": "TypeScript",
            ".jsx": "JavaScript JSX",
            ".tsx": "TypeScript JSX",
            ".java": "Java",
            ".c": "C",
            ".cpp": "C++",
            ".cs": "C#",
            ".php": "PHP",
            ".rb": "Ruby",
            ".go": "Go",
            ".rs": "Rust",
            ".swift": "Swift",
            ".kt": "Kotlin",
            ".scala": "Scala",
            ".pl": "Perl",
            ".lua": "Lua",
            ".r": "R",
            ".sql": "SQL",
            ".hs": "Haskell",
            ".ml": "OCaml",
            
            # Web Technologies
            ".html": "HTML",
            ".css": "CSS",
            ".scss": "SCSS",
            ".vue": "Vue.js",
            ".xml": "XML",
            ".svg": "SVG",
            
            # Configuration
            ".json": "JSON",
            ".yaml": "YAML",
            ".toml": "TOML",
            ".ini": "INI Config",
            ".env": "Environment Variables",
            
            # Documentation
            ".md": "Markdown",
            ".rst": "reStructuredText",
            ".tex": "LaTeX",
            ".txt": "Plain Text",
            
            # Shell Scripts
            ".sh": "Shell Script",
            ".bash": "Bash Script",
            ".bat": "Batch File",
            ".ps1": "PowerShell"
        }
        
        return {
            "success": True,
            "supported_formats": supported_formats,
            "total_count": len(supported_formats),
            "categories": filtered_categories,
            "format_descriptions": format_descriptions,
            "stats": {
                "total_formats": len(supported_formats),
                "categories_count": len(filtered_categories),
                "text_formats": len([f for f in supported_formats if f not in [".pdf", ".docx", ".doc", ".xlsx", ".xls"]])
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/file", response_model=RemoveFileResponse)
async def remove_file_from_index(
    request: RemoveFileRequest,
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Remove a specific file from the search index
    """
    try:
        with get_database(db_path) as db:
            success = db.remove_document(request.file_path)
            
            return RemoveFileResponse(
                success=success,
                file_path=request.file_path,
                error=None if success else "File not found in index"
            )
    
    except Exception as e:
        return RemoveFileResponse(
            success=False,
            file_path=request.file_path,
            error=str(e)
        )


@app.put("/file/path", response_model=UpdateFilePathResponse)
async def update_file_path(
    request: UpdateFilePathRequest,
    db_path: str = Query(DEFAULT_DB_PATH, description="Database file path")
):
    """
    Update file path in the search index (for rename operations)
    """
    try:
        with get_database(db_path) as db:
            success = db.update_file_path(request.old_path, request.new_path)
            
            return UpdateFilePathResponse(
                success=success,
                old_path=request.old_path,
                new_path=request.new_path,
                error=None if success else "File not found in index"
            )
    
    except Exception as e:
        return UpdateFilePathResponse(
            success=False,
            old_path=request.old_path,
            new_path=request.new_path,
            error=str(e)
        )


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """
    OpenAI-compatible chat completions endpoint
    
    Supports both streaming and non-streaming responses.
    All prompts should be packaged in the frontend and call this unified endpoint.
    """
    if not openai_client:
        raise HTTPException(
            status_code=503, 
            detail="LLM service not available. Please configure OPENAI_API_KEY in environment variables."
        )
    
    try:
        # Convert Pydantic models to OpenAI format
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        
        # Call OpenAI API
        completion = openai_client.chat.completions.create(
            model=request.model,
            messages=messages,
            stream=request.stream,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        if request.stream:
            # Stream response
            async def generate_stream():
                try:
                    for chunk in completion:
                        if chunk.choices:
                            choice = chunk.choices[0]
                            # Format as OpenAI streaming response
                            stream_data = {
                                "id": chunk.id,
                                "object": "chat.completion.chunk",
                                "created": chunk.created,
                                "model": chunk.model,
                                "choices": [{
                                    "index": choice.index,
                                    "delta": {
                                        "content": choice.delta.content if choice.delta and choice.delta.content else ""
                                    },
                                    "finish_reason": choice.finish_reason
                                }]
                            }
                            chunk_content = choice.delta.content if choice.delta and choice.delta.content else ""
                            if chunk_content:
                                print(f"[API] Streaming chunk: {repr(chunk_content)}")
                            
                            yield f"data: {json.dumps(stream_data)}\n\n"
                            
                            # Add a small delay to ensure proper streaming behavior
                            await asyncio.sleep(0.01)
                    
                    print("[API] Stream completed, sending [DONE]")
                    yield "data: [DONE]\n\n"
                except Exception as e:
                    print(f"[API] Stream error: {e}")
                    error_data = {
                        "error": {
                            "message": str(e),
                            "type": "stream_error"
                        }
                    }
                    yield f"data: {json.dumps(error_data)}\n\n"
            
            return StreamingResponse(
                generate_stream(),
                media_type="text/plain",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Content-Type": "text/plain; charset=utf-8"
                }
            )
        else:
            # Non-streaming response
            response_data = ChatCompletionResponse(
                id=completion.id,
                object="chat.completion",
                created=completion.created,
                model=completion.model,
                choices=[
                    ChatCompletionChoice(
                        index=choice.index,
                        message=ChatMessage(
                            role=choice.message.role,
                            content=choice.message.content or ""
                        ),
                        finish_reason=choice.finish_reason
                    ) for choice in completion.choices
                ],
                usage={
                    "prompt_tokens": completion.usage.prompt_tokens if completion.usage else 0,
                    "completion_tokens": completion.usage.completion_tokens if completion.usage else 0,
                    "total_tokens": completion.usage.total_tokens if completion.usage else 0
                } if completion.usage else None
            )
            
            return response_data
    
    except Exception as e:
        print(f"❌ Chat completion error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat completion failed: {str(e)}")


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
    if args.host != 'localhost' or args.port != 8001 or os.getenv('DEBUG'):
        print(f"📊 Database: {DEFAULT_DB_PATH}")
        print(f"🌐 Server: http://{args.host}:{args.port}")
        print(f"📚 API Docs: http://{args.host}:{args.port}/docs")
        print(f"📖 ReDoc: http://{args.host}:{args.port}/redoc")
    
    # Clean up port before starting
    cleanup_port(args.port, args.host)
    
    try:
        # Use direct app reference instead of module string for PyInstaller compatibility
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            reload=False  # Disable reload in packaged environment
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server failed to start: {e}")
        sys.exit(1)