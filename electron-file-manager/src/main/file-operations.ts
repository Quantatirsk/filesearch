import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { shell, clipboard } from 'electron'
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

  async copyFilesToClipboard(files: string[]): Promise<{ success: boolean; message: string; results?: any[] }> {
    try {
      const results = []
      
      for (const file of files) {
        try {
          // Check if file exists
          await fs.access(file)
          results.push({
            source: file,
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

      const validFiles = results.filter(r => r.success).map(r => r.source)
      const failCount = results.filter(r => !r.success).length

      if (validFiles.length === 0) {
        return {
          success: false,
          message: 'No valid files to copy to clipboard',
          results
        }
      }

      // Try platform-specific clipboard methods
      try {
        if (process.platform === 'darwin') {
          // macOS: Based on research, Electron has limited file clipboard support
          // Let's use the most reliable method: writeBuffer with public.file-url
          console.log('📋 Using Electron native writeBuffer for macOS')
          
          const filePath = validFiles[0]
          
          try {
            // Method 1: Try using Electron's writeBuffer with proper format
            const fileUrl = `file://${filePath}`
            console.log('📋 Trying writeBuffer with public.file-url:', fileUrl)
            
            clipboard.writeBuffer('public.file-url', Buffer.from(fileUrl, 'utf8'))
            console.log('✅ Electron writeBuffer executed successfully')
            
            // Verify if it worked by trying to read it back
            try {
              const readBack = clipboard.read('public.file-url')
              console.log('📋 Clipboard verification - read back:', readBack)
              
              if (readBack && readBack.includes(filePath)) {
                console.log('✅ File successfully copied to clipboard!')
              } else {
                throw new Error('Verification failed')
              }
            } catch (verifyError) {
              console.log('⚠️ Verification failed, clipboard may not contain file properly')
              throw verifyError
            }
            
          } catch (bufferError) {
            console.log('⚠️ writeBuffer method failed:', bufferError.message)
            console.log('📋 Falling back to file path copy')
            
            // Fallback: Copy the file path so user can manually navigate
            clipboard.writeText(filePath)
            console.log('📋 Copied file path to clipboard as text:', filePath)
          }
        } else if (process.platform === 'win32') {
          // Windows: Use PowerShell to copy files to clipboard
          const fileList = validFiles.map(f => `"${f}"`).join(',')
          const command = `powershell -command "Set-Clipboard -Path ${fileList}"`
          await execAsync(command)
          console.log('✅ PowerShell clipboard command executed successfully')
        } else {
          // Linux: Copy file paths to clipboard as fallback
          const filePaths = validFiles.join('\n')
          clipboard.writeText(filePaths)
          console.log('✅ File paths copied to clipboard as text (Linux)')
        }

        return {
          success: true,
          message: `Copied ${validFiles.length} files to clipboard${failCount > 0 ? `, ${failCount} failed` : ''}`,
          results
        }
      } catch (clipboardError) {
        console.error('📋 Platform-specific clipboard copy failed:', clipboardError)
        
        // Fallback: Copy file paths as text
        const filePaths = validFiles.join('\n')
        clipboard.writeText(filePaths)
        
        console.log('📋 Fallback: Copied file paths as text to clipboard')
        
        return {
          success: true,
          message: `Platform-specific copy failed, copied ${validFiles.length} file paths to clipboard as text${failCount > 0 ? `, ${failCount} files failed validation` : ''}`,
          results
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `Clipboard copy operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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

  async renameFile(oldPath: string, newPath: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if old file exists
      await fs.access(oldPath)
      
      // Check if new path already exists
      try {
        await fs.access(newPath)
        return {
          success: false,
          message: 'A file with the new name already exists'
        }
      } catch (error) {
        // Good, new path doesn't exist
      }
      
      // Rename file
      await fs.rename(oldPath, newPath)
      
      return {
        success: true,
        message: 'File renamed successfully'
      }
    } catch (error) {
      return {
        success: false,
        message: `Rename operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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