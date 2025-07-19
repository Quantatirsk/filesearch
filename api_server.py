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
    model: str = Field(default="gpt-3.5-turbo", description="Model name")
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
        print(f"✅ OpenAI client initialized with base URL: {openai_base_url}")
    else:
        print("⚠️  OpenAI API key not found in environment variables")
except Exception as e:
    print(f"❌ Failed to initialize OpenAI client: {e}")
    openai_client = None


def get_search_manager(db_path: str = DEFAULT_DB_PATH) -> SearchManager:
    """Get search manager instance"""
    print(f"🔍 DEBUG: get_search_manager called with db_path={db_path}")
    print(f"🔍 DEBUG: Absolute db_path={os.path.abspath(db_path)}")
    print(f"🔍 DEBUG: Database file exists: {os.path.exists(db_path)}")
    if os.path.exists(db_path):
        print(f"🔍 DEBUG: Database file size: {os.path.getsize(db_path)} bytes")
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
        print(f"🔍 DEBUG: Search endpoint called:")
        print(f"🔍 DEBUG: - query={request.query}")
        print(f"🔍 DEBUG: - search_type={request.search_type}")
        print(f"🔍 DEBUG: - file_types={request.file_types}")
        print(f"🔍 DEBUG: - db_path={db_path}")
        
        search_manager = get_search_manager(db_path)
        result = search_manager.search(
            query=request.query,
            search_type=request.search_type,
            limit=request.limit,
            min_fuzzy_score=request.min_fuzzy_score,
            file_types=request.file_types
        )
        
        print(f"🔍 DEBUG: Search result - total_results={result.get('total_results', 0)}")
        
        return SearchResponse(**result)
    
    except Exception as e:
        print(f"❌ DEBUG: Search error: {str(e)}")
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
                            yield f"data: {json.dumps(stream_data)}\n\n"
                    yield "data: [DONE]\n\n"
                except Exception as e:
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
                headers={"Cache-Control": "no-cache"}
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