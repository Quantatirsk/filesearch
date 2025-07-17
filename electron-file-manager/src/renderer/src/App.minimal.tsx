import React, { useRef, useCallback } from 'react'
import { SearchBar } from './components/SearchBar'
import { FileList } from './components/FileList'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { useAppStore } from './stores/app-store'

function MinimalApp() {
  const fileListRef = useRef<HTMLDivElement>(null)
  
  const { 
    selectedFiles, 
    setCurrentDirectory, 
    clearSelection
  } = useAppStore()

  const handleSelectDirectory = useCallback(async () => {
    try {
      const directory = await window.electronAPI.files.selectDirectory()
      if (directory) {
        setCurrentDirectory(directory)
      }
    } catch (error) {
      console.error('Failed to select directory:', error)
    }
  }, [setCurrentDirectory])

  const handleCopyFiles = useCallback(async () => {
    if (selectedFiles.length === 0) return
    try {
      const destination = await window.electronAPI.files.selectDirectory()
      if (destination) {
        const result = await window.electronAPI.files.copy(selectedFiles, destination)
        if (result.success) {
          clearSelection()
        }
      }
    } catch (error) {
      console.error('Failed to copy files:', error)
    }
  }, [selectedFiles, clearSelection])

  const handleDeleteFiles = useCallback(async () => {
    if (selectedFiles.length === 0) return
    const confirmed = confirm(`确定要删除 ${selectedFiles.length} 个文件吗？`)
    if (!confirmed) return
    try {
      const result = await window.electronAPI.files.delete(selectedFiles)
      if (result.success) {
        clearSelection()
      }
    } catch (error) {
      console.error('Failed to delete files:', error)
    }
  }, [selectedFiles, clearSelection])

  const handleSearch = useCallback((query: string, type: string) => {
    console.log('Search performed:', { query, type })
  }, [])

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Toolbar */}
      <Toolbar
        onSelectDirectory={handleSelectDirectory}
        onCopyFiles={handleCopyFiles}
        onDeleteFiles={handleDeleteFiles}
      />

      {/* Search Bar */}
      <div className="flex items-center justify-center p-4 bg-card border-b border-border">
        <SearchBar onSearch={handleSearch} />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* File List */}
        <div className="flex-1 overflow-hidden">
          <FileList containerRef={fileListRef} />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  )
}

export default MinimalApp