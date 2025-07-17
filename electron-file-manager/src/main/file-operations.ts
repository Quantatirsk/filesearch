import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { shell } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export class FileOperations {
  async copyFiles(files: string[], destination: string): Promise<{ success: boolean; message: string; results?: any[] }> {
    try {
      // Ensure destination directory exists
      await fs.mkdir(destination, { recursive: true })

      const results = []
      
      for (const file of files) {
        try {
          const filename = file.split('/').pop() || file.split('\\').pop() || 'unknown'
          const destPath = join(destination, filename)
          
          // Check if file exists
          await fs.access(file)
          
          // Copy file
          await fs.copyFile(file, destPath)
          
          results.push({
            source: file,
            destination: destPath,
            success: true
          })
        } catch (error) {
          results.push({
            source: file,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length

      return {
        success: true,
        message: `Copied ${successCount} files successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
        results
      }
    } catch (error) {
      return {
        success: false,
        message: `Copy operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  async moveFiles(files: string[], destination: string): Promise<{ success: boolean; message: string; results?: any[] }> {
    try {
      // Ensure destination directory exists
      await fs.mkdir(destination, { recursive: true })

      const results = []
      
      for (const file of files) {
        try {
          const filename = file.split('/').pop() || file.split('\\').pop() || 'unknown'
          const destPath = join(destination, filename)
          
          // Check if file exists
          await fs.access(file)
          
          // Move file
          await fs.rename(file, destPath)
          
          results.push({
            source: file,
            destination: destPath,
            success: true
          })
        } catch (error) {
          results.push({
            source: file,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length

      return {
        success: true,
        message: `Moved ${successCount} files successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
        results
      }
    } catch (error) {
      return {
        success: false,
        message: `Move operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  async deleteFiles(files: string[]): Promise<{ success: boolean; message: string; results?: any[] }> {
    try {
      const results = []
      
      for (const file of files) {
        try {
          await fs.unlink(file)
          results.push({
            file,
            success: true
          })
        } catch (error) {
          results.push({
            file,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length

      return {
        success: true,
        message: `Deleted ${successCount} files successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
        results
      }
    } catch (error) {
      return {
        success: false,
        message: `Delete operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  async openFile(filePath: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('=== openFile Debug Info ===')
      console.log('Original filePath:', filePath)
      console.log('filePath type:', typeof filePath)
      console.log('filePath length:', filePath.length)
      console.log('Platform:', process.platform)
      
      // Normalize the path
      const path = require('path')
      const normalizedPath = path.resolve(filePath)
      console.log('Normalized path:', normalizedPath)
      
      // Check if file exists
      try {
        await fs.access(normalizedPath)
        console.log('✓ File exists and is accessible')
      } catch (accessError) {
        console.error('✗ File access failed:', accessError)
        throw new Error(`File not accessible: ${accessError instanceof Error ? accessError.message : 'Unknown access error'}`)
      }
      
      // Get file stats for additional info
      try {
        const stats = await fs.stat(normalizedPath)
        console.log('File stats:', {
          isFile: stats.isFile(),
          size: stats.size,
          modified: stats.mtime.toISOString()
        })
      } catch (statsError) {
        console.warn('Could not get file stats:', statsError)
      }
      
      // Try multiple methods to open the file
      let success = false
      let lastError = ''
      
      // Method 1: shell.openPath (preferred)
      try {
        console.log('Method 1: Attempting to open with shell.openPath...')
        const result = await shell.openPath(normalizedPath)
        console.log('shell.openPath raw result:', JSON.stringify(result))
        
        if (!result || result.trim() === '') {
          console.log('✓ Method 1: shell.openPath succeeded')
          success = true
        } else {
          lastError = `shell.openPath failed: ${result}`
          console.log('✗ Method 1 failed:', lastError)
        }
      } catch (error) {
        lastError = `shell.openPath error: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.log('✗ Method 1 exception:', lastError)
      }
      
      // Method 2: shell.openExternal with file:// URL (macOS specific)
      if (!success && process.platform === 'darwin') {
        try {
          console.log('Method 2: Attempting to open with shell.openExternal (file:// URL)...')
          const fileUrl = `file://${encodeURI(normalizedPath)}`
          console.log('File URL:', fileUrl)
          
          await shell.openExternal(fileUrl)
          console.log('✓ Method 2: shell.openExternal succeeded')
          success = true
        } catch (error) {
          lastError = `shell.openExternal error: ${error instanceof Error ? error.message : 'Unknown error'}`
          console.log('✗ Method 2 failed:', lastError)
        }
      }
      
      // Method 3: Use system command (platform specific)
      if (!success) {
        try {
          console.log('Method 3: Attempting to open with system command...')
          let command = ''
          
          if (process.platform === 'darwin') {
            command = `open "${normalizedPath}"`
          } else if (process.platform === 'win32') {
            command = `start "" "${normalizedPath}"`
          } else {
            command = `xdg-open "${normalizedPath}"`
          }
          
          console.log('Executing command:', command)
          const { stdout, stderr } = await execAsync(command)
          
          if (stderr && stderr.trim()) {
            console.log('Command stderr:', stderr)
          }
          if (stdout && stdout.trim()) {
            console.log('Command stdout:', stdout)
          }
          
          console.log('✓ Method 3: System command succeeded')
          success = true
        } catch (error) {
          lastError = `System command error: ${error instanceof Error ? error.message : 'Unknown error'}`
          console.log('✗ Method 3 failed:', lastError)
        }
      }
      
      if (!success) {
        throw new Error(`All file opening methods failed. Last error: ${lastError}`)
      }
      
      console.log('✓ File opened successfully using one of the methods')
      return {
        success: true,
        message: 'File opened successfully'
      }
    } catch (error) {
      console.error('=== openFile Error ===')
      console.error('Error details:', error)
      console.error('Error type:', typeof error)
      if (error instanceof Error) {
        console.error('Error name:', error.name)
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
      }
      
      return {
        success: false,
        message: `Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  async openInExplorer(filePath: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if file exists
      await fs.access(filePath)
      
      // Open file in system explorer
      shell.showItemInFolder(filePath)
      
      return {
        success: true,
        message: 'File opened in explorer'
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to open file in explorer: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  async ensureDirectoryExists(path: string): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: true })
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }
}