# 全局快捷键搜索功能

## 功能概述

实现了类似 macOS Spotlight 的全局快捷键搜索功能，支持在任何地方按快捷键快速调出搜索界面。

## 快捷键

- **Windows/Linux**: `Alt + Shift + F`
- **macOS**: `Option + Shift + F`
- **应用内测试**: `Ctrl + K` (Windows/Linux) / `Cmd + K` (macOS)

## 功能特性

### 🎯 极简设计
- 类似 macOS Spotlight 的简洁界面
- 使用 shadcn/ui 组件库实现高品质 UI
- 支持深色/浅色主题
- 精美的动画效果和键盘导航指示

### ⌨️ 智能键盘导航
- `Tab` - 切换搜索模式
- `↑↓` - 导航搜索结果
- `Enter` - 执行搜索或打开选中文件
- `Esc` - 关闭搜索界面

### 🔍 多种搜索模式
1. **快速搜索** - 智能分词搜索，默认模式
2. **智能搜索** - 集成 AI 助手，智能理解搜索意图
3. **精确搜索** - 完全匹配搜索
4. **路径搜索** - 搜索文件路径
5. **模糊搜索** - 相似度匹配
6. **混合搜索** - 多种方式结合

### ⚡ 性能优化
- 异步搜索，不阻塞界面
- 智能结果限制（显示前10个，总数提示）
- 实时搜索状态反馈
- 复用现有搜索 API 和文件列表逻辑

## 技术实现

### 主进程 (Main Process)
- 使用 Electron 的 `globalShortcut` API 注册全局快捷键
- 跨平台快捷键检测（macOS 使用 Option，其它平台使用 Alt）
- 通过 IPC 通信触发渲染进程的搜索界面

### 渲染进程 (Renderer Process)
- React 函数组件实现搜索界面
- 使用 zustand 状态管理集成现有搜索逻辑
- TypeScript 确保类型安全
- 响应式设计，支持各种屏幕尺寸

### UI 组件
- 基于 shadcn/ui 的现代化组件
- Tailwind CSS 样式系统
- Lucide React 图标库
- 支持键盘和鼠标交互

## 文件结构

```
src/
├── main/
│   └── index.ts           # 全局快捷键注册
├── preload/
│   └── index.ts           # IPC 通信桥接
├── renderer/src/
│   ├── components/
│   │   └── SearchOverlay.tsx  # 搜索界面组件
│   ├── App.tsx            # 主应用集成
│   └── styles/
│       └── globals.css    # 搜索界面样式
└── types/
    └── electron.d.ts      # TypeScript 类型定义
```

## 使用说明

1. **启动应用**
   ```bash
   cd electron-file-manager
   npm run dev
   ```

2. **测试全局快捷键**
   - 最小化或切换到其他应用
   - 按 `Alt + Shift + F` (Windows/Linux) 或 `Option + Shift + F` (macOS)
   - 应用将自动显示并弹出搜索界面

3. **使用搜索功能**
   - 输入搜索关键词
   - 使用 `Tab` 切换搜索模式
   - 按 `Enter` 搜索或按 `↑↓` 导航结果
   - 点击文件或按 `Enter` 打开

## 集成现有功能

### 搜索 API 复用
- 完全复用现有的 `useSearch` hook
- 支持所有现有搜索类型和参数
- 搜索结果显示在主窗口文件列表中

### 智能助手集成
- "智能搜索"模式直接调用 ChatAssistant
- 无缝切换到 AI 辅助搜索体验
- 保持搜索查询上下文

### 状态管理集成
- 使用现有的 zustand store
- 与主界面搜索状态同步
- 保持一致的用户体验

## 开发注意事项

### 安全考虑
- 全局快捷键仅在应用运行时生效
- 应用退出时自动清理快捷键注册
- IPC 通信使用安全的 contextIsolation

### 性能优化
- 搜索界面按需渲染，不影响主界面性能
- 使用 React.memo 和 useCallback 优化重渲染
- 智能的键盘事件处理和清理

### 跨平台兼容
- 自动检测操作系统并使用对应快捷键
- 支持不同平台的窗口管理策略
- 统一的用户体验和界面设计

## 未来扩展

- [ ] 支持自定义快捷键配置
- [ ] 搜索历史记录
- [ ] 搜索结果预览
- [ ] 更多搜索过滤选项
- [ ] 搜索结果分类显示