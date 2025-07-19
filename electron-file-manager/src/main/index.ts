import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PythonBridge } from './python-bridge'
import { FileOperations } from './file-operations'
import { SettingsStore } from './settings-store'

// 创建一个简单的icon路径，如果文件不存在会使用默认图标
const iconPath = join(__dirname, '../../resources/icon.png')

let mainWindow: BrowserWindow
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
}

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.