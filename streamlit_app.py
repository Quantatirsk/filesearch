#!/usr/bin/env python3
"""
Streamlit Web Application for Document Search System
提供用户友好的界面来测试文档搜索系统的完整功能
"""

import streamlit as st
import sys
import os
import tempfile
import shutil
from pathlib import Path
import time
import pandas as pd
from typing import List, Dict, Any

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from core.database import DocumentDatabase
from core.indexer import DocumentIndexer
from core.search_manager import SearchManager
from parsers.base_parser import ParserFactory

# Page configuration
st.set_page_config(
    page_title="文档搜索系统 | Document Search System",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        color: #1f77b4;
        text-align: center;
        margin-bottom: 2rem;
    }
    .section-header {
        font-size: 1.5rem;
        font-weight: bold;
        color: #ff7f0e;
        margin-top: 2rem;
        margin-bottom: 1rem;
    }
    .feature-box {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        margin: 1rem 0;
    }
    .success-box {
        background-color: #d4edda;
        color: #155724;
        padding: 1rem;
        border-radius: 0.5rem;
        border: 1px solid #c3e6cb;
    }
    .error-box {
        background-color: #f8d7da;
        color: #721c24;
        padding: 1rem;
        border-radius: 0.5rem;
        border: 1px solid #f5c6cb;
    }
</style>
""", unsafe_allow_html=True)

def init_session_state():
    """Initialize session state variables"""
    if 'db_path' not in st.session_state:
        st.session_state.db_path = "test_documents.db"
    if 'indexed_files' not in st.session_state:
        st.session_state.indexed_files = []
    if 'search_results' not in st.session_state:
        st.session_state.search_results = []

def get_database():
    """Get database instance"""
    return DocumentDatabase(st.session_state.db_path)

def get_search_manager():
    """Get search manager instance"""
    return SearchManager(st.session_state.db_path)

def display_header():
    """Display application header"""
    st.markdown('<div class="main-header">🔍 文档搜索系统测试平台<br>Document Search System Test Platform</div>', unsafe_allow_html=True)
    
    st.markdown("""
    <div class="feature-box">
        <h4>🚀 系统特性 | System Features</h4>
        <ul>
            <li><strong>多格式支持</strong>: PDF, DOCX, DOC, XLSX, XLS, CSV, TXT, MD</li>
            <li><strong>高性能搜索</strong>: SQLite FTS5 + 模糊搜索</li>
            <li><strong>并发处理</strong>: 多进程索引架构</li>
            <li><strong>混合搜索</strong>: 精确、布尔、模糊、路径搜索</li>
        </ul>
    </div>
    """, unsafe_allow_html=True)

def display_sidebar():
    """Display sidebar with system information"""
    st.sidebar.header("📊 系统信息 | System Info")
    
    # Database information
    db = get_database()
    stats = db.get_stats()
    
    st.sidebar.metric("📄 文档总数", stats.get('total_documents', 0))
    st.sidebar.metric("📁 索引文件", len(st.session_state.indexed_files))
    
    # Supported formats
    st.sidebar.header("📋 支持格式 | Supported Formats")
    supported_exts = ParserFactory.get_supported_extensions()
    for ext in supported_exts:
        st.sidebar.write(f"• {ext}")
    
    # Database management
    st.sidebar.header("🗄️ 数据库管理 | Database Management")
    if st.sidebar.button("🗑️ 清空数据库"):
        try:
            if os.path.exists(st.session_state.db_path):
                os.remove(st.session_state.db_path)
            st.session_state.indexed_files = []
            st.session_state.search_results = []
            st.sidebar.success("数据库已清空")
            st.rerun()
        except Exception as e:
            st.sidebar.error(f"清空数据库失败: {e}")

def upload_and_index_section():
    """File upload and indexing section"""
    st.markdown('<div class="section-header">📤 文件上传与索引 | File Upload & Indexing</div>', unsafe_allow_html=True)
    
    # File upload
    uploaded_files = st.file_uploader(
        "选择要索引的文档 | Choose documents to index",
        type=['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md'],
        accept_multiple_files=True
    )
    
    if uploaded_files:
        col1, col2 = st.columns([3, 1])
        
        with col1:
            st.info(f"已选择 {len(uploaded_files)} 个文件")
            for file in uploaded_files:
                st.write(f"• {file.name} ({file.size} bytes)")
        
        with col2:
            if st.button("🚀 开始索引", type="primary"):
                index_uploaded_files(uploaded_files)

def index_uploaded_files(uploaded_files):
    """Index uploaded files"""
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Save uploaded files to temp directory
        temp_files = []
        for uploaded_file in uploaded_files:
            temp_path = Path(temp_dir) / uploaded_file.name
            with open(temp_path, 'wb') as f:
                f.write(uploaded_file.getvalue())
            temp_files.append(temp_path)
        
        # Create indexer and index files
        indexer = DocumentIndexer(st.session_state.db_path)
        
        # Progress bar
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        with st.spinner("正在索引文档..."):
            for i, file_path in enumerate(temp_files):
                status_text.text(f"正在处理: {file_path.name}")
                
                try:
                    # Index single file
                    indexer.index_file(file_path)
                    st.session_state.indexed_files.append(file_path.name)
                    
                    progress_bar.progress((i + 1) / len(temp_files))
                    
                except Exception as e:
                    st.error(f"索引文件 {file_path.name} 失败: {e}")
        
        status_text.text("索引完成!")
        st.success(f"✅ 成功索引 {len(temp_files)} 个文件")
        
    except Exception as e:
        st.error(f"索引过程出错: {e}")
    
    finally:
        # Clean up temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)

def search_section():
    """Search functionality section"""
    st.markdown('<div class="section-header">🔍 搜索功能测试 | Search Functionality Test</div>', unsafe_allow_html=True)
    
    # Search input
    col1, col2 = st.columns([3, 1])
    
    with col1:
        search_query = st.text_input(
            "搜索查询 | Search Query",
            placeholder="输入搜索关键词..."
        )
    
    with col2:
        search_type = st.selectbox(
            "搜索类型 | Search Type",
            ["exact", "fuzzy", "path"],
            format_func=lambda x: {
                "exact": "精确搜索",
                "fuzzy": "模糊搜索", 
                "path": "路径搜索"
            }[x]
        )
    
    # Search options
    col3, col4 = st.columns(2)
    
    with col3:
        limit = st.slider("结果数量限制", 1, 100, 20)
    
    with col4:
        if search_type == "fuzzy":
            min_score = st.slider("最小相似度分数", 0.0, 100.0, 30.0)
        else:
            min_score = 30.0
    
    # Search button
    if st.button("🔍 搜索", type="primary", disabled=not search_query):
        perform_search(search_query, search_type, limit, min_score)

def perform_search(query: str, search_type: str, limit: int, min_score: float):
    """Perform search operation"""
    try:
        search_manager = get_search_manager()
        
        start_time = time.time()
        
        # Perform search based on type
        if search_type == "exact":
            results = search_manager.search_exact(query, limit)
        elif search_type == "fuzzy":
            results = search_manager.search_fuzzy(query, limit, min_score)
        elif search_type == "path":
            results = search_manager.search_path(query, limit)
        
        search_time = time.time() - start_time
        
        # Store results in session state
        st.session_state.search_results = results
        
        # Display results
        display_search_results(results, search_time, query, search_type)
        
    except Exception as e:
        st.error(f"搜索失败: {e}")

def display_search_results(results: List[Dict[str, Any]], search_time: float, query: str, search_type: str):
    """Display search results"""
    st.markdown('<div class="section-header">📋 搜索结果 | Search Results</div>', unsafe_allow_html=True)
    
    # Search summary
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.metric("🔍 查询", query)
    
    with col2:
        st.metric("📊 结果数量", len(results))
    
    with col3:
        st.metric("⏱️ 搜索时间", f"{search_time:.3f}s")
    
    if not results:
        st.info("🔍 没有找到匹配的文档")
        return
    
    # Results display
    for i, result in enumerate(results):
        score_text = f"(相似度: {result.get('score', 0):.1f})" if search_type == 'fuzzy' else ""
        with st.expander(f"📄 {result.get('file_path', 'Unknown')} {score_text}", expanded=i < 3):
            col1, col2 = st.columns([2, 1])
            
            with col1:
                st.write(f"**文件路径**: {result.get('file_path', 'N/A')}")
                st.write(f"**文件大小**: {result.get('file_size', 'N/A')} bytes")
                st.write(f"**最后修改**: {result.get('last_modified', 'N/A')}")
                
                if search_type == "fuzzy" and "score" in result:
                    st.write(f"**相似度分数**: {result['score']:.2f}")
            
            with col2:
                file_type = Path(result.get('file_path', '')).suffix.lower()
                type_emoji = {
                    '.pdf': '📕', '.docx': '📘', '.doc': '📗',
                    '.xlsx': '📊', '.xls': '📊', '.csv': '📊',
                    '.txt': '📄', '.md': '📝'
                }.get(file_type, '📄')
                
                st.write(f"**文件类型**: {type_emoji} {file_type}")
                st.write(f"**文件哈希**: {result.get('file_hash', 'N/A')[:16]}...")
            
            # Content preview
            if result.get('content'):
                content_preview = result['content'][:300] + "..." if len(result['content']) > 300 else result['content']
                st.text_area("内容预览", content_preview, height=100, disabled=True)

def advanced_features_section():
    """Advanced features testing section"""
    st.markdown('<div class="section-header">🛠️ 高级功能测试 | Advanced Features Test</div>', unsafe_allow_html=True)
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("📈 数据库统计")
        if st.button("📊 查看统计信息"):
            display_database_stats()
    
    with col2:
        st.subheader("🔧 解析器测试")
        if st.button("🧪 测试所有解析器"):
            test_all_parsers()

def display_database_stats():
    """Display database statistics"""
    try:
        db = get_database()
        stats = db.get_stats()
        
        st.json(stats)
        
    except Exception as e:
        st.error(f"获取统计信息失败: {e}")

def test_all_parsers():
    """Test all available parsers"""
    st.subheader("🧪 解析器测试结果")
    
    # Test each parser
    parsers_status = []
    
    supported_extensions = ParserFactory.get_supported_extensions()
    
    for ext in supported_extensions:
        try:
            parser = ParserFactory.get_parser(f"test{ext}")
            status = "✅ 可用" if parser else "❌ 不可用"
            parsers_status.append({
                "格式": ext,
                "状态": status,
                "解析器": type(parser).__name__ if parser else "None"
            })
        except Exception as e:
            parsers_status.append({
                "格式": ext,
                "状态": f"❌ 错误: {e}",
                "解析器": "Error"
            })
    
    # Display results in a table
    df = pd.DataFrame(parsers_status)
    st.dataframe(df, use_container_width=True)

def performance_test_section():
    """Performance testing section"""
    st.markdown('<div class="section-header">⚡ 性能测试 | Performance Test</div>', unsafe_allow_html=True)
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("🏃 搜索性能测试")
        test_queries = [
            "python", "machine learning", "数据分析", 
            "document search", "performance test"
        ]
        
        if st.button("🚀 运行搜索性能测试"):
            run_search_performance_test(test_queries)
    
    with col2:
        st.subheader("📊 系统资源监控")
        if st.button("📈 显示系统信息"):
            display_system_info()

def run_search_performance_test(queries: List[str]):
    """Run search performance test"""
    search_manager = get_search_manager()
    
    results = []
    
    for query in queries:
        for search_type in ["exact", "fuzzy"]:
            try:
                start_time = time.time()
                
                if search_type == "exact":
                    search_results = search_manager.search_exact(query, 10)
                else:
                    search_results = search_manager.search_fuzzy(query, 10, 30.0)
                
                search_time = time.time() - start_time
                
                results.append({
                    "查询": query,
                    "类型": search_type,
                    "结果数": len(search_results),
                    "耗时(秒)": f"{search_time:.4f}",
                    "每秒查询": f"{1/search_time:.2f}" if search_time > 0 else "∞"
                })
                
            except Exception as e:
                results.append({
                    "查询": query,
                    "类型": search_type,
                    "结果数": 0,
                    "耗时(秒)": "错误",
                    "每秒查询": str(e)
                })
    
    # Display results
    df = pd.DataFrame(results)
    st.dataframe(df, use_container_width=True)
    
    # Summary
    avg_time = df[df['耗时(秒)'] != '错误']['耗时(秒)'].astype(float).mean()
    st.metric("平均搜索时间", f"{avg_time:.4f}s")

def display_system_info():
    """Display system information"""
    import psutil
    import platform
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("💻 系统信息")
        st.write(f"**操作系统**: {platform.system()} {platform.release()}")
        st.write(f"**Python版本**: {platform.python_version()}")
        st.write(f"**CPU核心数**: {psutil.cpu_count()}")
        st.write(f"**内存总量**: {psutil.virtual_memory().total / 1024**3:.1f} GB")
    
    with col2:
        st.subheader("📊 资源使用")
        st.write(f"**CPU使用率**: {psutil.cpu_percent()}%")
        st.write(f"**内存使用率**: {psutil.virtual_memory().percent}%")
        
        # Database file size
        if os.path.exists(st.session_state.db_path):
            db_size = os.path.getsize(st.session_state.db_path) / 1024**2
            st.write(f"**数据库大小**: {db_size:.2f} MB")

def main():
    """Main application function"""
    init_session_state()
    
    # Header
    display_header()
    
    # Sidebar
    display_sidebar()
    
    # Main content tabs
    tab1, tab2, tab3, tab4 = st.tabs([
        "📤 文件索引", "🔍 搜索测试", "🛠️ 高级功能", "⚡ 性能测试"
    ])
    
    with tab1:
        upload_and_index_section()
    
    with tab2:
        search_section()
    
    with tab3:
        advanced_features_section()
    
    with tab4:
        performance_test_section()
    
    # Footer
    st.markdown("---")
    st.markdown(
        "<div style='text-align: center; color: #666;'>"
        "🔍 高性能Python文档搜索系统 | High-Performance Python Document Search System"
        "</div>",
        unsafe_allow_html=True
    )

if __name__ == "__main__":
    main()