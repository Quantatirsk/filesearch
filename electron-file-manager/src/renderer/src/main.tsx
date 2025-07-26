import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// 使用修复后的完整版本
const TestApp = App

// 在开发模式下禁用StrictMode以避免重复的Python服务器启动
const isProduction = import.meta.env.PROD

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    {isProduction ? (
      <React.StrictMode>
        <TestApp />
      </React.StrictMode>
    ) : (
      <TestApp />
    )}
  </ErrorBoundary>
)