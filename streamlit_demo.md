# Streamlit文档搜索系统演示 | Streamlit Document Search System Demo

## 📖 功能概述 | Feature Overview

本Streamlit应用提供了一个用户友好的Web界面来测试完整的文档搜索工程，包含以下核心功能：

This Streamlit application provides a user-friendly web interface to test the complete document search system, featuring:

### 🎯 核心功能 | Core Features

1. **📤 文件上传与索引 | File Upload & Indexing**
   - 支持多种文件格式上传
   - 实时索引进度显示
   - 文件信息预览

2. **🔍 搜索功能测试 | Search Functionality Test**
   - 精确搜索 (Exact Search)
   - 模糊搜索 (Fuzzy Search)
   - 布尔搜索 (Boolean Search)
   - 路径搜索 (Path Search)
   - 实时搜索结果展示

3. **🛠️ 高级功能 | Advanced Features**
   - 数据库统计信息查看
   - 解析器功能测试
   - 系统状态监控

4. **⚡ 性能测试 | Performance Testing**
   - 搜索性能基准测试
   - 系统资源监控
   - 响应时间统计

## 🚀 快速启动 | Quick Start

### 方法1：使用启动脚本 | Method 1: Using Launch Script

```bash
# 直接运行启动脚本
./run_streamlit.sh
```

### 方法2：手动启动 | Method 2: Manual Launch

```bash
# 安装依赖
pip install streamlit psutil

# 启动应用
streamlit run streamlit_app.py
```

## 🎮 使用指南 | Usage Guide

### 1. 文件上传与索引测试

1. 点击"📤 文件索引"标签页
2. 选择要测试的文档文件
3. 点击"🚀 开始索引"按钮
4. 观察索引进度和结果

### 2. 搜索功能测试

1. 切换到"🔍 搜索测试"标签页
2. 输入搜索关键词
3. 选择搜索类型：
   - **精确搜索**: 完全匹配查询
   - **模糊搜索**: 容错匹配查询
   - **布尔搜索**: 支持AND/OR/NOT操作
   - **路径搜索**: 基于文件路径查找
4. 调整搜索参数（结果数量、相似度阈值等）
5. 点击"🔍 搜索"查看结果

### 3. 高级功能测试

1. 进入"🛠️ 高级功能"标签页
2. 查看数据库统计信息
3. 测试所有解析器状态
4. 监控系统资源使用

### 4. 性能基准测试

1. 访问"⚡ 性能测试"标签页
2. 运行搜索性能测试
3. 查看系统资源监控
4. 分析性能指标

## 📊 测试场景 | Test Scenarios

### 基础功能测试 | Basic Function Tests

1. **文件解析测试**
   - 上传不同格式的文件
   - 验证解析器正确识别格式
   - 检查内容提取是否完整

2. **搜索准确性测试**
   - 精确搜索关键词匹配
   - 模糊搜索容错能力
   - 布尔搜索逻辑正确性

3. **系统稳定性测试**
   - 大文件上传处理
   - 并发搜索操作
   - 错误处理机制

### 性能测试 | Performance Tests

1. **搜索性能**
   - 响应时间测量
   - 并发查询处理
   - 数据库查询优化

2. **索引性能**
   - 文件处理速度
   - 内存使用效率
   - 磁盘I/O性能

3. **系统资源**
   - CPU使用率监控
   - 内存占用分析
   - 磁盘空间使用

## 🔧 配置选项 | Configuration Options

### 数据库设置 | Database Settings

- 默认数据库文件: `test_documents.db`
- 可通过侧边栏管理数据库状态
- 支持清空数据库重新开始

### 搜索参数 | Search Parameters

- **结果数量限制**: 1-100（默认20）
- **模糊搜索相似度**: 0-100（默认30）
- **搜索类型**: 精确/模糊/布尔/路径

### 系统监控 | System Monitoring

- 实时文档统计
- 解析器状态检查
- 系统资源使用情况

## 🎯 测试建议 | Testing Recommendations

### 1. 全面功能测试流程

1. **准备测试数据**
   - 准备各种格式的测试文件
   - 包含不同语言内容（中英文）
   - 文件大小多样化

2. **逐步测试**
   - 先测试单个文件索引
   - 再测试批量文件处理
   - 最后测试复杂搜索场景

3. **性能验证**
   - 测试搜索响应时间
   - 验证并发处理能力
   - 检查资源使用效率

### 2. 问题排查指南

1. **索引失败**
   - 检查文件格式是否支持
   - 验证文件是否损坏
   - 查看错误日志信息

2. **搜索无结果**
   - 确认文件已正确索引
   - 检查搜索关键词匹配
   - 调整搜索参数设置

3. **性能问题**
   - 监控系统资源使用
   - 检查数据库文件大小
   - 考虑优化搜索参数

## 🌟 最佳实践 | Best Practices

1. **测试数据准备**
   - 使用真实的业务文档
   - 包含多种文件格式
   - 涵盖不同内容类型

2. **测试执行**
   - 从简单到复杂逐步测试
   - 记录测试结果和问题
   - 验证核心功能完整性

3. **性能优化**
   - 根据实际使用场景调整参数
   - 监控系统资源使用情况
   - 优化搜索查询策略

## 📈 预期结果 | Expected Results

### 功能验证 | Functionality Verification

- ✅ 所有支持的文件格式能够正确解析
- ✅ 搜索功能返回准确结果
- ✅ 系统稳定运行无崩溃
- ✅ 用户界面响应流畅

### 性能指标 | Performance Metrics

- 📊 搜索响应时间 < 1秒（小型数据集）
- 📊 文件索引速度符合预期
- 📊 内存使用在合理范围内
- 📊 CPU使用率稳定

---

**注意**: 此Streamlit应用专为测试和演示目的设计，展示了完整文档搜索系统的所有核心功能。

**Note**: This Streamlit application is designed for testing and demonstration purposes, showcasing all core features of the complete document search system.