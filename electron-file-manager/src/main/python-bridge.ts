import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync } from 'fs'
import axios, { AxiosRequestConfig } from 'axios'

// 全局单例标记，防止多个窗口同时启动
let globalPythonStarting = false
let globalPythonStarted = false

export class PythonBridge {
  private pythonProcess: ChildProcess | null = null
  private isStarted = false
  private readonly port = 8001
  private readonly host = 'localhost'
  private readonly baseUrl = `http://${this.host}:${this.port}`

  async start(): Promise<{ success: boolean; message: string }> {
    // 全局单例检查：防止多个窗口同时启动
    if (globalPythonStarted) {
      console.log('Python backend already running globally, skipping start')
      return { success: true, message: 'Python backend already running' }
    }
    
    if (globalPythonStarting) {
      console.log('Python backend is starting by another window, waiting...')
      // 等待其他窗口完成启动
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        if (globalPythonStarted) {
          return { success: true, message: 'Python backend started by another window' }
        }
      }
      return { success: false, message: 'Timeout waiting for Python backend to start' }
    }
    
    if (this.isStarted && this.pythonProcess && !this.pythonProcess.killed) {
      console.log('Python backend already running, skipping start')
      return { success: true, message: 'Python backend already running' }
    }
    
    // 标记正在启动
    globalPythonStarting = true

    // 重置状态，清理之前的进程
    if (this.pythonProcess && !this.pythonProcess.killed) {
      this.pythonProcess.kill('SIGTERM')
      this.pythonProcess = null
    }
    this.isStarted = false

    try {
      const { command, args, cwd } = this.getPythonCommand()
      
      console.log('🔍 Starting Python backend...')
      if (process.env.NODE_ENV === 'development') {
        console.log('Command:', command)
        console.log('Args:', args)
        console.log('Working directory:', cwd)
      }
      
      // Start the Python API server
      this.pythonProcess = spawn(command, args, {
        cwd,
        stdio: 'pipe',
        env: { ...process.env, PYTHONPATH: cwd }
      })

      // Handle process events
      this.pythonProcess.on('error', (error) => {
        console.error('Python process error:', error)
        this.isStarted = false
      })

      this.pythonProcess.on('exit', (code, signal) => {
        console.log(`Python process exited with code ${code}, signal ${signal}`)
        this.isStarted = false
      })

      // Log stdout and stderr (reduce verbosity in production)
      this.pythonProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim()
        if (output && (process.env.NODE_ENV === 'development' || output.includes('ERROR') || output.includes('WARN'))) {
          console.log('Python stdout:', output)
        }
      })

      this.pythonProcess.stderr?.on('data', (data) => {
        const output = data.toString().trim()
        // Only log important stderr messages
        if (output && !output.includes('Loading model cost') && !output.includes('Prefix dict has been built')) {
          console.error('Python stderr:', output)
        }
      })

      // Wait for the server to be ready
      await this.waitForServer()
      
      this.isStarted = true
      globalPythonStarted = true
      globalPythonStarting = false
      return { success: true, message: 'Python backend started successfully' }
    } catch (error) {
      console.error('Failed to start Python backend:', error)
      this.isStarted = false
      globalPythonStarted = false
      globalPythonStarting = false
      // 清理进程
      if (this.pythonProcess) {
        this.pythonProcess.kill()
        this.pythonProcess = null
      }
      return { success: false, message: `Failed to start Python backend: ${error}` }
    }
  }

  async stop(): Promise<{ success: boolean; message: string }> {
    if (!this.isStarted || !this.pythonProcess) {
      return { success: true, message: 'Python backend not running' }
    }

    try {
      this.pythonProcess.kill('SIGTERM')
      this.isStarted = false
      globalPythonStarted = false
      globalPythonStarting = false
      this.pythonProcess = null
      return { success: true, message: 'Python backend stopped successfully' }
    } catch (error) {
      console.error('Failed to stop Python backend:', error)
      return { success: false, message: `Failed to stop Python backend: ${error}` }
    }
  }

  isRunning(): boolean {
    return this.isStarted && this.pythonProcess !== null
  }

  async makeApiRequest(options: AxiosRequestConfig): Promise<any> {
    if (!this.isStarted) {
      throw new Error('Python backend not running')
    }

    try {
      // Set dynamic timeout based on operation type
      let timeout = 60000 // Default 30 seconds
      
      // For indexing operations, use much longer timeout (20 minutes)
      if (options.url?.includes('/index')) {
        timeout = 1200000 // 20 minutes for large directory indexing
      }
      // For file content operations, use moderate timeout (2 minutes)
      else if (options.url?.includes('/file/content')) {
        timeout = 120000 // 2 minutes for large file processing
      }
      // For search operations, use shorter timeout (1 minute)
      else if (options.url?.includes('/search')) {
        timeout = 60000 // 1 minute for search operations
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`Making API request to ${options.url} with timeout: ${timeout}ms (${timeout/1000}s)`)
      }
      
      const response = await axios({
        ...options,
        baseURL: this.baseUrl,
        timeout: timeout
      })
      return response.data
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  private getPythonCommand(): { command: string; args: string[]; cwd: string } {
    // 优先使用打包的可执行文件
    const isDevelopment = !app.isPackaged
    const appPath = app.getAppPath()
    
    if (!isDevelopment) {
      // 生产环境：使用打包的可执行文件
      const resourcesPath = process.resourcesPath || join(appPath, '../..')
      const pythonDir = join(resourcesPath, 'python')
      const executableName = process.platform === 'win32' ? 'filesearch-backend.exe' : 'filesearch-backend'
      const executablePath = join(pythonDir, executableName)
      
      console.log('🔍 Looking for packaged executable:', executablePath)
      
      if (existsSync(executablePath)) {
        console.log('✅ Found packaged Python executable')
        return {
          command: executablePath,
          args: ['--host', this.host, '--port', this.port.toString()],
          cwd: pythonDir
        }
      } else {
        console.log('⚠️ Packaged executable not found, falling back to system Python')
      }
    }
    
    // 开发环境或回退方案：使用系统 Python
    const pythonBackendPath = isDevelopment 
      ? join(__dirname, '../../..') 
      : join(process.resourcesPath, '../../../..')
    
    console.log('🔍 Using system Python from:', pythonBackendPath)
    
    return {
      command: '/Users/quant/miniforge3/bin/python',
      args: ['api_server.py', '--host', this.host, '--port', this.port.toString()],
      cwd: pythonBackendPath
    }
  }

  private async waitForServer(maxRetries = 15, retryDelay = 2000): Promise<void> {
    console.log('Waiting for Python server to start...')
    for (let i = 0; i < maxRetries; i++) {
      try {
        await axios.get(`${this.baseUrl}/health`, { timeout: 5000 })
        console.log('✅ Python server is ready')
        return
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.log(`Server check attempt ${i + 1}/${maxRetries} failed:`, errorMessage)
        }
        if (i === maxRetries - 1) {
          throw new Error(`Python server failed to start within timeout period (${maxRetries * retryDelay}ms)`)
        }
        // 使用递增延迟策略：前几次快速重试，后面逐步增加间隔
        const dynamicDelay = i < 3 ? 1000 : (i < 6 ? 2000 : 3000)
        await new Promise(resolve => setTimeout(resolve, dynamicDelay))
      }
    }
  }
}