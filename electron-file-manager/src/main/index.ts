import { app, shell, BrowserWindow, ipcMain, dialog, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PythonBridge } from './python-bridge'
import { FileOperations } from './file-operations'
import { SettingsStore } from './settings-store'

// 创建一个简单的icon路径，如果文件不存在会使用默认图标
const iconPath = join(__dirname, '../../resources/icon.png')

let mainWindow: BrowserWindow
let searchWindow: BrowserWindow | null = null
let pythonBridge: PythonBridge
let fileOperations: FileOperations
let settingsStore: SettingsStore

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // 只在Linux上使用图标
    ...(process.platform === 'linux' ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize Python bridge, file operations, and settings store
  pythonBridge = new PythonBridge()
  fileOperations = new FileOperations()
  settingsStore = new SettingsStore()

  // Setup IPC handlers
  setupIpcHandlers()

  // Setup global shortcuts
  setupGlobalShortcuts()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (pythonBridge) {
      pythonBridge.stop()
    }
    app.quit()
  }
})

// Setup IPC handlers
function setupIpcHandlers(): void {
  // Python backend communication
  ipcMain.handle('python:start', async () => {
    return await pythonBridge.start()
  })

  ipcMain.handle('python:stop', async () => {
    return await pythonBridge.stop()
  })

  ipcMain.handle('python:status', async () => {
    return pythonBridge.isRunning()
  })

  // File operations
  ipcMain.handle('files:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    return result.filePaths[0] || null
  })

  ipcMain.handle('files:copy', async (_, files: string[], destination: string) => {
    return await fileOperations.copyFiles(files, destination)
  })

  ipcMain.handle('files:copy-to-clipboard', async (_, files: string[]) => {
    return await fileOperations.copyFilesToClipboard(files)
  })

  ipcMain.handle('files:move', async (_, files: string[], destination: string) => {
    return await fileOperations.moveFiles(files, destination)
  })

  ipcMain.handle('files:rename', async (_, oldPath: string, newPath: string) => {
    return await fileOperations.renameFile(oldPath, newPath)
  })

  ipcMain.handle('files:delete', async (_, files: string[]) => {
    return await fileOperations.deleteFiles(files)
  })

  ipcMain.handle('files:open-file', async (_, filePath: string) => {
    console.log('IPC: files:open-file called with path:', filePath)
    const result = await fileOperations.openFile(filePath)
    console.log('IPC: files:open-file result:', result)
    return result
  })

  ipcMain.handle('files:open-in-explorer', async (_, filePath: string) => {
    return await fileOperations.openInExplorer(filePath)
  })

  ipcMain.handle('files:get-desktop-path', async () => {
    return await fileOperations.getDesktopPath()
  })

  ipcMain.handle('files:create-directory', async (_, dirPath: string) => {
    return await fileOperations.createDirectory(dirPath)
  })

  // API communication
  ipcMain.handle('api:request', async (_, options: any) => {
    return await pythonBridge.makeApiRequest(options)
  })

  // Settings management
  ipcMain.handle('settings:load', async () => {
    return await settingsStore.load()
  })

  ipcMain.handle('settings:save', async (_, settings: any) => {
    return await settingsStore.save(settings)
  })

  ipcMain.handle('settings:get', async () => {
    return settingsStore.get()
  })

  ipcMain.handle('settings:reset', async () => {
    return settingsStore.reset()
  })

  // Search window management
  ipcMain.handle('search:open-main-window', async (_, query: string, searchType: string) => {
    // Show and focus the main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
      
      // Send the search query to the main window
      mainWindow.webContents.send('perform-search', query, searchType)
      return { success: true }
    }
    return { success: false, error: 'Main window not available' }
  })
}

function createSearchWindow(): void {
  if (searchWindow && !searchWindow.isDestroyed()) {
    // 确保窗口在最高层级显示
    searchWindow.setAlwaysOnTop(true, 'screen-saver')
    searchWindow.show()
    searchWindow.focus()
    return
  }

  searchWindow = new BrowserWindow({
    width: 600,
    height: 80,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    focusable: true,
    // macOS 特定设置，确保能覆盖全屏应用
    ...(process.platform === 'darwin' ? {
      fullscreenable: false,
      visibleOnAllWorkspaces: true
    } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load the same renderer but it will show only the search overlay
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    searchWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    searchWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  searchWindow.on('ready-to-show', () => {
    // 设置最高层级，确保能覆盖全屏应用
    if (searchWindow && !searchWindow.isDestroyed()) {
      searchWindow.setAlwaysOnTop(true, 'screen-saver')
    }
    // 不要立即显示窗口，等待渲染完成
    searchWindow?.webContents.send('show-search-overlay')
    searchWindow?.webContents.send('set-search-window', true)
  })

  // 监听渲染进程的渲染完成消息 (每次创建窗口时重新监听)
  const handleSearchReady = () => {
    if (searchWindow && !searchWindow.isDestroyed()) {
      // 再次确保最高层级设置
      searchWindow.setAlwaysOnTop(true, 'screen-saver')
      searchWindow.show()
      searchWindow.focus()
    }
  }
  
  // 移除之前的监听器并添加新的
  ipcMain.removeListener('search-window-ready', handleSearchReady)
  ipcMain.once('search-window-ready', handleSearchReady)

  // Hide window when it loses focus
  searchWindow.on('blur', () => {
    if (searchWindow && !searchWindow.isDestroyed()) {
      searchWindow.hide()
    }
  })

  // Clean up reference when window is closed
  searchWindow.on('closed', () => {
    // 清理事件监听器
    ipcMain.removeListener('search-window-ready', handleSearchReady)
    searchWindow = null
  })
}

// Setup global shortcuts
function setupGlobalShortcuts(): void {
  // Register global hotkey for search overlay (Alt+Shift+F on Windows/Linux, Option+Shift+F on macOS)
  const searchShortcut = process.platform === 'darwin' ? 'Option+Shift+F' : 'Alt+Shift+F'
  
  const isRegistered = globalShortcut.register(searchShortcut, () => {
    createSearchWindow()
  })

  if (!isRegistered) {
    console.log('Failed to register global shortcut:', searchShortcut)
  } else {
    console.log('Global shortcut registered:', searchShortcut)
  }
}

// Clean up global shortcuts when app is quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.