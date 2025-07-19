# 高性能Python文档搜索工具 | High-Performance Python Document Search Tool

一个基于技术报告设计的高性能文档索引和搜索系统，支持多种文件格式的并发处理和混合式模糊搜索。

A high-performance document indexing and search system designed based on technical report recommendations, supporting concurrent processing of multiple file formats and hybrid fuzzy search.

## 核心特性 | Core Features

### 🚀 高性能解析引擎 | High-Performance Parsing Engine
- **PDF**: PyMuPDF (比PyPDF2快12倍+) | PyMuPDF (12x+ faster than PyPDF2)
- **XLSX**: python-calamine (比openpyxl快10-80倍) | python-calamine (10-80x faster than openpyxl)
- **DOCX**: 直接XML解析 (lxml + zipfile) | Direct XML parsing (lxml + zipfile)
- **DOC**: antiword 包装器 | antiword wrapper
- **XLS**: xlrd 行业标准 | xlrd industry standard
- **CSV**: pandas 高度优化 | pandas highly optimized
- **文本文件**: 支持250+格式 (代码/配置/文档) | Text Files: 250+ formats (code/config/docs)

### 🔍 混合式搜索系统 | Hybrid Search System
- **FTS5全文检索**: 毫秒级响应的SQLite FTS5 | FTS5 Full-text Search: Millisecond response SQLite FTS5
- **精确/布尔搜索**: 支持复杂查询语法 | Exact/Boolean Search: Complex query syntax support
- **智能模糊搜索**: FTS5初筛 + RapidFuzz精确评分 | Intelligent Fuzzy Search: FTS5 filtering + RapidFuzz scoring
- **路径搜索**: 基于文件路径的快速查找 | Path Search: Fast file path-based lookup

### ⚡ 并发处理架构 | Concurrent Processing Architecture
- **多进程索引**: 充分利用多核CPU | Multi-process Indexing: Full multi-core CPU utilization
- **生产者-消费者模型**: 避免数据库锁争用 | Producer-Consumer Model: Avoid database lock contention
- **专用数据库写入进程**: 最大化写入吞吐量 | Dedicated Database Writer: Maximize write throughput
- **智能批处理**: 优化I/O性能 | Intelligent Batching: Optimized I/O performance

## 安装要求 | Installation Requirements

### 系统要求 | System Requirements
- Python 3.7+
- 支持的操作系统：Windows, macOS, Linux | Supported OS: Windows, macOS, Linux
- 推荐：多核CPU用于并发处理 | Recommended: Multi-core CPU for concurrent processing

### 依赖安装 | Dependencies Installation

```bash
# 克隆项目 | Clone the project
git clone <repository-url>
cd filesearch

# 安装依赖 | Install dependencies
pip install -r requirements.txt

# 对于DOC文件支持，需要额外安装antiword | For DOC file support, install antiword
# Ubuntu/Debian:
sudo apt-get install antiword

# macOS:
brew install antiword

# Windows: 下载antiword可执行文件并添加到PATH | Download antiword executable and add to PATH
```

## 快速开始 | Quick Start

### 1. 索引文档 | Index Documents

```bash
# 索引整个目录 | Index entire directory
python main.py index /path/to/documents

# 强制重新索引 | Force re-indexing
python main.py index /path/to/documents --force

# 指定工作进程数 | Specify number of workers
python main.py index /path/to/documents --workers 8
```

### 2. 搜索文档 | Search Documents

```bash
# 精确搜索 | Exact search
python main.py search "python programming"

# 模糊搜索 | Fuzzy search
python main.py search "pythn programing" --type fuzzy

# 布尔搜索 | Boolean search
python main.py search "python AND (tutorial OR guide)" --type boolean

# 路径搜索 | Path search
python main.py search "*.pdf" --type path
```

### 3. 高级搜索 | Advanced Search

```bash
# 组合搜索 | Combined search
python main.py advanced --content "machine learning" --path "*.pdf" --types pdf docx

# 模糊内容搜索 | Fuzzy content search
python main.py advanced --content "machne lerning" --fuzzy
```

### 4. 交互模式 | Interactive Mode

```bash
# 启动交互模式 | Start interactive mode
python main.py interactive

# 在交互模式中使用 | Use in interactive mode
filesearch> search python programming
filesearch> fuzzy pythn programing
filesearch> path *.pdf
filesearch> stats
filesearch> quit
```

## 详细功能 | Detailed Features

### 搜索类型 | Search Types

#### 精确搜索 | Exact Search
```bash
python main.py search "exact phrase here" --type exact
```

#### 布尔搜索 | Boolean Search
```bash
python main.py search "python AND machine learning" --type boolean
python main.py search "tutorial OR guide NOT beginner" --type boolean
```

#### 模糊搜索 | Fuzzy Search
```bash
python main.py search "pythn machne lerning" --type fuzzy --min-score 40
```

#### 路径搜索 | Path Search
```bash
python main.py search "documents/*.pdf" --type path
python main.py search "2023" --type path
```

### 文件管理 | File Management

#### 移动文件 | Move Files
```bash
# 基于搜索结果移动文件 | Move files based on search results
python main.py move "machine learning" /path/to/destination --confirm

# 移动特定类型文件 | Move specific file types
python main.py move "*.pdf" /path/to/pdfs --type path --confirm
```

#### 更新索引 | Update Index
```bash
# 更新单个文件 | Update single file
python main.py update /path/to/document.pdf

# 从索引中移除文件 | Remove file from index
python main.py remove /path/to/document.pdf
```

### 统计信息 | Statistics

```bash
# 查看数据库统计 | View database statistics
python main.py stats

# 查看支持的格式 | View supported formats
python main.py formats
```

## 技术架构 | Technical Architecture

### 核心组件 | Core Components

1. **DocumentDatabase** (core/database.py)
   - SQLite FTS5全文索引 | SQLite FTS5 full-text indexing
   - 高效的元数据存储 | Efficient metadata storage
   - 批量操作优化 | Batch operation optimization

2. **DocumentIndexer** (core/indexer.py)
   - 多进程并发解析 | Multi-process concurrent parsing
   - 生产者-消费者架构 | Producer-consumer architecture
   - 智能错误处理 | Intelligent error handling

3. **SearchManager** (core/search_manager.py)
   - 统一搜索接口 | Unified search interface
   - 混合式模糊搜索 | Hybrid fuzzy search
   - 结果格式化 | Result formatting

4. **ParserFactory** (parsers/base_parser.py)
   - 可扩展的解析器架构 | Extensible parser architecture
   - 自动格式检测 | Automatic format detection
   - 高性能库集成 | High-performance library integration

### 性能优化 | Performance Optimizations

#### 解析性能 | Parsing Performance
- **PDF**: PyMuPDF的C语言实现 | PyMuPDF C implementation
- **XLSX**: Rust-based Calamine引擎 | Rust-based Calamine engine
- **DOCX**: 直接XML解析避免对象模型开销 | Direct XML parsing avoids object model overhead

#### 搜索性能 | Search Performance
- **FTS5**: 毫秒级全文搜索 | Millisecond full-text search
- **混合模糊搜索**: 两阶段架构避免性能瓶颈 | Hybrid fuzzy search: Two-stage architecture avoids bottlenecks
- **索引优化**: 批量写入和事务管理 | Index optimization: Batch writes and transaction management

#### 并发性能 | Concurrency Performance
- **多进程**: 绕过Python GIL限制 | Multi-processing: Bypass Python GIL limitations
- **专用写入进程**: 避免数据库锁争用 | Dedicated writer process: Avoid database lock contention
- **队列管理**: 高效的任务分发 | Queue management: Efficient task distribution

## 配置选项 | Configuration Options

### 数据库设置 | Database Settings
- 默认数据库文件：`documents.db` | Default database file: `documents.db`
- 使用`--db`参数指定自定义路径 | Use `--db` parameter for custom path

### 并发设置 | Concurrency Settings
- 默认工作进程数：CPU核心数 | Default workers: CPU core count
- 使用`--workers`参数自定义 | Use `--workers` parameter to customize

### 搜索设置 | Search Settings
- 默认结果限制：20条 | Default result limit: 20
- 模糊搜索最小分数：30.0 | Fuzzy search minimum score: 30.0
- 可通过命令行参数调整 | Adjustable via command line parameters

## 故障排除 | Troubleshooting

### 常见问题 | Common Issues

#### 1. 依赖安装失败 | Dependency Installation Failure
```bash
# 升级pip | Upgrade pip
pip install --upgrade pip

# 安装构建工具 | Install build tools
pip install wheel setuptools

# 逐个安装依赖 | Install dependencies one by one
pip install PyMuPDF
pip install python-calamine
# ... 其他依赖 | other dependencies
```

#### 2. DOC文件解析失败 | DOC File Parsing Failure
```bash
# 检查antiword是否已安装 | Check if antiword is installed
which antiword

# 手动测试antiword | Test antiword manually
antiword test.doc
```

#### 3. 内存使用过高 | High Memory Usage
```bash
# 减少工作进程数 | Reduce worker count
python main.py index /path/to/docs --workers 2

# 分批处理大型目录 | Process large directories in batches
```

#### 4. 搜索性能慢 | Slow Search Performance
```bash
# 检查数据库文件大小 | Check database file size
python main.py stats

# 重建索引 | Rebuild index
python main.py index /path/to/docs --force
```

## 扩展开发 | Extension Development

### 添加新的文件格式支持 | Adding New File Format Support

1. 创建新的解析器类 | Create new parser class:
```python
from parsers.base_parser import BaseParser, ParserFactory

class NewFormatParser(BaseParser):
    def parse(self, file_path: str) -> Optional[str]:
        # 实现解析逻辑 | Implement parsing logic
        pass
    
    def get_supported_extensions(self) -> list:
        return ['.newformat']

# 注册解析器 | Register parser
ParserFactory.register_parser(NewFormatParser)
```

2. 导入到索引器 | Import in indexer:
```python
# 在core/indexer.py中添加 | Add in core/indexer.py
from ..parsers import new_format_parser
```

### 自定义搜索算法 | Custom Search Algorithms

可以在`SearchManager`类中添加新的搜索方法 | Add new search methods in the `SearchManager` class:

```python
def search_custom(self, query: str, custom_params: dict) -> List[Dict[str, Any]]:
    # 实现自定义搜索逻辑 | Implement custom search logic
    pass
```

## 性能基准 | Performance Benchmarks

基于技术报告的性能对比（相对于纯Python实现）：
Performance comparison based on technical report (relative to pure Python implementations):

- **PDF解析**: PyMuPDF比PyPDF2快12倍+ | PDF Parsing: PyMuPDF 12x+ faster than PyPDF2
- **XLSX解析**: python-calamine比openpyxl快10-80倍 | XLSX Parsing: python-calamine 10-80x faster than openpyxl
- **全文搜索**: SQLite FTS5毫秒级响应 | Full-text Search: SQLite FTS5 millisecond response
- **并发索引**: 多进程架构充分利用多核CPU | Concurrent Indexing: Multi-process architecture fully utilizes multi-core CPU

## 许可证 | License

本项目遵循MIT许可证。详见LICENSE文件。
This project is licensed under the MIT License. See LICENSE file for details.

## 贡献指南 | Contributing Guidelines

1. Fork项目 | Fork the project
2. 创建特性分支 | Create feature branch
3. 提交更改 | Commit changes
4. 推送到分支 | Push to branch
5. 创建Pull Request | Create Pull Request

## 技术支持 | Technical Support

如遇到问题，请：
For issues, please:

1. 检查本文档的故障排除部分 | Check the troubleshooting section in this document
2. 搜索已知问题 | Search existing issues
3. 创建详细的问题报告 | Create detailed issue report

---

**注意**: 本项目基于详细的技术报告设计，采用了当前最佳实践和高性能库选择。所有架构决策都有充分的技术依据和性能测试支持。

**Note**: This project is designed based on a detailed technical report, using current best practices and high-performance library selections. All architectural decisions are backed by solid technical reasoning and performance testing.