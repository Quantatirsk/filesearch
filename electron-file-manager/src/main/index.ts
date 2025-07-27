import { app, shell, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PythonBridge } from './python-bridge'
import { FileOperations } from './file-operations'
import { SettingsStore } from './settings-store'

// 创建一个简单的icon路径，如果文件不存在会使用默认图标
const iconPath = join(__dirname, '../../resources/icon.png')

let mainWindow: BrowserWindow
let searchWindow: BrowserWindow | null = null
let searchWindowShouldShow = false  // 跟踪搜索窗口是否应该显示
let tray: Tray | null = null
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
    updateTrayMenu()  // 更新托盘菜单
  })

  // 处理主窗口关闭事件：直接退出应用
  mainWindow.on('close', () => {
    // 停止Python后端服务
    if (pythonBridge) {
      pythonBridge.stop()
    }
    // 退出应用程序
    app.quit()
  })

  // 窗口互斥：主窗口激活时隐藏搜索窗口
  mainWindow.on('focus', () => {
    if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
      searchWindow.hide()
      searchWindowShouldShow = false
    }
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

  // Create system tray
  createTray()

  // Create search window at startup (hidden by default)
  createSearchWindow()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      // 如果主窗口存在但被隐藏，显示它
      mainWindow.show()
      mainWindow.focus()
      updateTrayMenu()  // 更新托盘菜单
    }
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
  ipcMain.handle('api:request', async (_, options: import('axios').AxiosRequestConfig) => {
    return await pythonBridge.makeApiRequest(options)
  })

  // Settings management
  ipcMain.handle('settings:load', async () => {
    return await settingsStore.load()
  })

  ipcMain.handle('settings:save', async (_, settings: import('./settings-store').SettingsData) => {
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
    // 窗口互斥：先隐藏搜索窗口
    if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
      searchWindow.hide()
      searchWindowShouldShow = false
    }
    
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

  // Hide search window
  ipcMain.handle('search:hide-window', async () => {
    if (searchWindow && !searchWindow.isDestroyed()) {
      searchWindow.hide()
      searchWindowShouldShow = false  // 重置显示标志
      return { success: true }
    }
    return { success: false, error: 'Search window not available' }
  })
}

function toggleSearchWindow(): void {
  // 如果窗口存在且可见，则隐藏；否则显示
  if (searchWindow && !searchWindow.isDestroyed()) {
    if (searchWindow.isVisible()) {
      // 窗口当前可见，隐藏它
      searchWindow.hide()
      searchWindowShouldShow = false
    } else {
      // 窗口存在但隐藏，显示它
      showSearchWindow()
    }
  } else {
    // 窗口不存在，创建并显示
    showSearchWindow()
  }
}

function showSearchWindow(): void {
  searchWindowShouldShow = true  // 标记应该显示
  
  // 窗口互斥：搜索窗口激活时隐藏主窗口
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide()
  }
  
  if (searchWindow && !searchWindow.isDestroyed()) {
    // macOS 特定优化 - 确保覆盖全屏应用而不切换桌面
    if (process.platform === 'darwin') {
      // 使用最高层级覆盖全屏应用
      searchWindow.setAlwaysOnTop(true, 'screen-saver')
      // 不设置visibleOnAllWorkspaces，避免桌面切换
    } else {
      searchWindow.setAlwaysOnTop(true, 'floating')
    }
    
    searchWindow.show()
    searchWindow.focus()
  } else {
    // If window was destroyed, recreate it (it will auto-show because searchWindowShouldShow = true)
    createSearchWindow()
  }
}

function createSearchWindow(): void {
  // Don't create if already exists
  if (searchWindow && !searchWindow.isDestroyed()) {
    return
  }

  // Create new search window
  searchWindow = new BrowserWindow({
    width: 516,
    height: 56,
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
      visibleOnAllWorkspaces: false,  // 不要在所有工作区显示，而是覆盖当前全屏应用
      roundedCorners: false,
      hasShadow: false,
      type: 'panel'  // 使用panel类型以覆盖全屏应用
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
      searchWindow.setAlwaysOnTop(true, 'floating')
      
      // macOS 特定优化，确保能覆盖全屏应用
      if (process.platform === 'darwin') {
        // 不设置visibleOnAllWorkspaces，让它显示在当前桌面上
        // 使用最高层级以覆盖全屏应用
        searchWindow.setAlwaysOnTop(true, 'screen-saver')
      }
    }
    // 不要立即显示窗口，等待渲染完成
    searchWindow?.webContents.send('show-search-overlay')
    searchWindow?.webContents.send('set-search-window', true)
  })

  // 监听渲染进程的渲染完成消息 (每次创建窗口时重新监听)
  const handleSearchReady = () => {
    if (searchWindow && !searchWindow.isDestroyed()) {
      // 设置窗口层级
      if (process.platform === 'darwin') {
        searchWindow.setAlwaysOnTop(true, 'screen-saver')
      } else {
        searchWindow.setAlwaysOnTop(true, 'floating')
      }
      
      // 只有在应该显示且窗口当前不可见时才显示窗口
      if (searchWindowShouldShow && !searchWindow.isVisible()) {
        searchWindow.show()
        searchWindow.focus()
        console.log('Search window shown after ready')
      } else {
        console.log('Search window ready but kept hidden until activated')
      }
    }
  }
  
  // 移除之前的监听器并添加新的
  ipcMain.removeListener('search-window-ready', handleSearchReady)
  ipcMain.once('search-window-ready', handleSearchReady)

  // 外部点击隐藏：当搜索窗口失去焦点时隐藏
  searchWindow.on('blur', () => {
    if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
      searchWindow.hide()
      searchWindowShouldShow = false
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
  // Register global hotkey for search overlay (Alt+F on Windows/Linux, Option+F on macOS)
  const searchShortcut = process.platform === 'darwin' ? 'Option+F' : 'Alt+F'
  
  const isRegistered = globalShortcut.register(searchShortcut, () => {
    toggleSearchWindow()
  })

  if (!isRegistered) {
    console.log('Failed to register global shortcut:', searchShortcut)
  } else {
    console.log('Global shortcut registered:', searchShortcut)
  }
}

// Create system tray
function createTray(): void {
  // Create tray icon
  const trayIcon = nativeImage.createFromPath(iconPath)
  
  // Resize icon for tray (16x16 for better display on different platforms)
  const resizedIcon = trayIcon.resize({ width: 16, height: 16 })
  
  tray = new Tray(resizedIcon)
  
  // Set tooltip
  tray.setToolTip('File Search - 文件搜索')
  
  // Create context menu
  updateTrayMenu()
  
  // Handle left click on tray icon
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
  
  // Handle right click on tray icon (Windows/Linux)
  tray.on('right-click', () => {
    updateTrayMenu()
  })
}

// Update tray context menu
function updateTrayMenu(): void {
  if (!tray) return
  
  const isMainWindowVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isMainWindowVisible ? '隐藏主窗口' : '显示主窗口',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (isMainWindowVisible) {
            mainWindow.hide()
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      }
    },
    {
      label: '搜索窗口',
      click: () => {
        toggleSearchWindow()
      }
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
          // 可以发送消息到渲染进程打开设置页面
          mainWindow.webContents.send('open-settings')
        }
      }
    },
    { type: 'separator' },
    {
      label: '关于',
      click: () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '关于 File Search',
          message: 'File Search - 文件搜索工具',
          detail: '一个高效的本地文件搜索应用程序\n支持多种文件格式的内容搜索',
          buttons: ['确定']
        })
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        // 真正退出应用
        if (pythonBridge) {
          pythonBridge.stop()
        }
        app.quit()
      }
    }
  ])
  
  tray.setContextMenu(contextMenu)
}

// Clean up global shortcuts when app is quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (tray) {
    tray.destroy()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.