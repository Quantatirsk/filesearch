# Electron File Manager

基于 Electron + React + Vite + shadcn/ui 的高性能文件搜索管理器

## 功能特性

- 🔍 **多关键词搜索**: 支持空格分隔的多关键词搜索
- ⚡ **虚拟滚动**: 支持数千个文件的流畅显示
- 🎯 **多种搜索模式**: 精确搜索、模糊搜索、路径搜索
- 📁 **批量操作**: 支持批量复制、移动、删除文件
- 🖥️ **原生体验**: 基于 Electron 的桌面应用
- 🎨 **现代UI**: 使用 shadcn/ui 组件库
- 🔧 **本地索引**: 基于 Python 后端的高性能索引

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **UI框架**: shadcn/ui + Tailwind CSS
- **桌面框架**: Electron
- **状态管理**: Zustand
- **虚拟滚动**: @tanstack/react-virtual
- **后端**: Python FastAPI (复用现有后端)

## 安装和运行

### 前置要求

1. Node.js 18+ 
2. Python 3.7+
3. 已安装Python依赖 (在父目录运行 `pip install -r requirements.txt`)

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建应用
npm run build
```

### 生产环境

```bash
# 构建并打包 (Windows)
npm run build:win

# 构建并打包 (macOS)
npm run build:mac

# 构建并打包 (Linux)
npm run build:linux
```

## 使用说明

### 1. 启动应用

1. 打开应用后，点击 "启动服务" 按钮启动Python后端
2. 点击 "选择目录" 选择要索引的文件夹
3. 点击 "索引目录" 建立文件索引

### 2. 搜索文件

- 在搜索框中输入关键词，支持多个关键词空格分隔
- 选择搜索类型：
  - **精确搜索**: 完全匹配搜索内容
  - **模糊搜索**: 允许拼写错误的智能搜索
  - **路径搜索**: 基于文件路径搜索

### 3. 文件操作

- **选择文件**: 点击文件项选择，支持 Ctrl/Cmd+点击多选，Shift+点击范围选择
- **复制文件**: 选中文件后点击 "复制" 按钮，选择目标目录
- **删除文件**: 选中文件后点击 "删除" 按钮（谨慎操作）
- **打开文件**: 双击文件在系统资源管理器中打开

### 4. 快捷键

- **Ctrl/Cmd + A**: 全选文件
- **Escape**: 清除选择
- **Enter**: 执行搜索

## 项目结构

```
electron-file-manager/
├── src/
│   ├── main/                 # Electron主进程
│   │   ├── index.ts          # 主进程入口
│   │   ├── python-bridge.ts  # Python后端集成
│   │   └── file-operations.ts # 文件操作API
│   ├── renderer/             # React渲染进程
│   │   ├── src/
│   │   │   ├── components/   # React组件
│   │   │   ├── hooks/        # 自定义Hooks
│   │   │   ├── stores/       # Zustand状态管理
│   │   │   ├── lib/          # 工具函数
│   │   │   └── types/        # TypeScript类型
│   │   └── index.html
│   └── preload/              # 预加载脚本
│       └── index.ts
├── resources/                # 应用资源
└── package.json
```

## 性能优化

### 前端优化
- 使用 @tanstack/react-virtual 实现虚拟滚动
- 防抖处理搜索输入
- React.memo 优化组件渲染
- 状态管理优化

### 后端优化
- 复用现有的高性能Python后端
- SQLite FTS5 全文搜索
- 多进程并发索引
- 智能缓存机制

## 开发说明

### 添加新功能

1. 在 `src/renderer/src/components/` 中创建新组件
2. 在 `src/renderer/src/hooks/` 中创建相关Hook
3. 在 `src/renderer/src/stores/` 中添加状态管理
4. 在 `src/main/` 中添加主进程逻辑（如需要）

### 调试

- 开发环境会自动启动DevTools
- 使用 `console.log` 进行调试
- 主进程日志会显示在终端中

## 故障排除

### 常见问题

1. **Python后端启动失败**
   - 检查Python环境是否正确安装
   - 确认已安装所有Python依赖
   - 查看控制台错误信息

2. **搜索无结果**
   - 确认已正确索引目录
   - 检查搜索关键词是否正确
   - 尝试不同的搜索模式

3. **文件操作失败**
   - 检查文件权限
   - 确认目标目录存在
   - 查看错误提示信息

### 性能建议

- 建议索引文件数量不超过100,000个
- 大文件目录建议分批索引
- 定期清理无效索引

## 贡献指南

1. Fork项目
2. 创建特性分支
3. 提交更改
4. 创建Pull Request

## 许可证

MIT License