import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import App from './App'
import SimpleApp from './App.simple'
import MinimalApp from './App.minimal'
import { ErrorBoundary } from './components/ErrorBoundary'

// 使用修复后的完整版本
const TestApp = App

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <React.StrictMode>
      <TestApp />
    </React.StrictMode>
  </ErrorBoundary>
)