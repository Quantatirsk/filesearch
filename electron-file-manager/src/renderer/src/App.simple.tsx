import React from 'react'

function SimpleApp() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="p-4 bg-card border-b">
        <h1 className="text-xl font-bold">文件搜索管理器</h1>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📁</div>
          <div className="text-lg">应用正在运行</div>
          <div className="text-sm text-muted-foreground">如果您看到此消息，说明基础渲染正常</div>
        </div>
      </div>
    </div>
  )
}

export default SimpleApp