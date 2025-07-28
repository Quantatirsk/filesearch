import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import axios, { AxiosRequestConfig } from 'axios'
import { promisify } from 'util'
import { exec } from 'child_process'
import os from 'os'

const execAsync = promisify(exec)

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
      const { command, args, cwd } = await this.getPythonCommand()
      
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

  async makeApiRequest(options: AxiosRequestConfig): Promise<unknown> {
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
        console.log(`Making API request to ${options.url} with timeout: ${timeout}ms (${timeout / 1000}s)`)
      }
      
      const response = await axios({
        ...options,
        baseURL: this.baseUrl,
        timeout
      })
      return response.data
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  private async getPythonCommand(): Promise<{ command: string; args: string[]; cwd: string }> {
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
    
    // 开发环境：自动管理 conda 环境 'file'
    const pythonBackendPath = isDevelopment 
      ? join(__dirname, '../../..') 
      : join(process.resourcesPath, '../../../..')
    
    console.log('🔍 Managing conda environment "file"...')
    
    // 确保 conda 环境 'file' 存在并配置正确
    const pythonCommand = await this.ensureCondaEnvironment()
    
    return {
      command: pythonCommand,
      args: ['api_server.py', '--host', this.host, '--port', this.port.toString()],
      cwd: pythonBackendPath
    }
  }

  private async waitForServer(maxRetries = 15): Promise<void> {
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
          throw new Error(`Python server failed to start within timeout period`)
        }
        // 使用递增延迟策略：前几次快速重试，后面逐步增加间隔
        const dynamicDelay = i < 3 ? 1000 : (i < 6 ? 2000 : 3000)
        await new Promise(resolve => setTimeout(resolve, dynamicDelay))
      }
    }
  }

  private async ensureCondaEnvironment(): Promise<string> {
    const envName = 'file'
    const homeDir = os.homedir()
    const isWindows = process.platform === 'win32'
    
    // 直接检查已知的环境路径
    const knownEnvPaths = isWindows ? [
      join(homeDir, '.conda', 'envs', envName),  // 用户级环境
      'C:\\ProgramData\\miniconda3\\envs\\' + envName,
      'C:\\ProgramData\\anaconda3\\envs\\' + envName,
      join(homeDir, 'miniconda3', 'envs', envName),
      join(homeDir, 'anaconda3', 'envs', envName)
    ] : [
      join(homeDir, 'miniforge3', 'envs', envName),
      join(homeDir, 'anaconda3', 'envs', envName),
      join(homeDir, 'miniconda3', 'envs', envName)
    ]
    
    // 查找现有环境
    let envPath = ''
    for (const path of knownEnvPaths) {
      if (existsSync(path)) {
        envPath = path
        break
      }
    }
    
    // 如果找到现有环境，直接使用
    if (envPath) {
      console.log(`✅ Found existing conda environment "${envName}":`, envPath)
      const pythonExecutable = isWindows ? 'python.exe' : 'python'
      const pythonPath = join(envPath, isWindows ? '' : 'bin', pythonExecutable)
      
      if (!existsSync(pythonPath)) {
        throw new Error(`❌ Python not found in conda environment: ${pythonPath}`)
      }
      
      // 检查并安装依赖
      await this.ensureDependencies(pythonPath)
      return pythonPath
    }
    
    // 如果没有找到环境，需要创建，先找conda安装
    const condaPaths = isWindows ? [
      'C:\\ProgramData\\miniconda3',
      'C:\\ProgramData\\anaconda3',
      join(homeDir, 'miniconda3'),
      join(homeDir, 'anaconda3')
    ] : [
      join(homeDir, 'miniforge3'),
      join(homeDir, 'anaconda3'), 
      join(homeDir, 'miniconda3')
    ]
    
    let condaCommand = ''
    
    for (const path of condaPaths) {
      const condaExecutable = isWindows 
        ? join(path, 'Scripts', 'conda.exe')
        : join(path, 'bin', 'conda')
      
      if (existsSync(condaExecutable)) {
        condaCommand = condaExecutable
        break
      }
    }
    
    if (!condaCommand) {
      throw new Error('❌ No conda installation found. Please install miniforge, anaconda, or miniconda.')
    }
    
    // 创建环境
    console.log(`🔧 Creating conda environment "${envName}"...`)
    await this.createCondaEnvironment(condaCommand, envName)
    
    // 再次查找新创建的环境
    for (const path of knownEnvPaths) {
      if (existsSync(path)) {
        envPath = path
        break
      }
    }
    
    if (!envPath) {
      throw new Error(`❌ Failed to create conda environment "${envName}"`)
    }
    
    const pythonExecutable = isWindows ? 'python.exe' : 'python'
    const pythonPath = join(envPath, isWindows ? '' : 'bin', pythonExecutable)
    
    if (!existsSync(pythonPath)) {
      throw new Error(`❌ Python not found in conda environment: ${pythonPath}`)
    }
    
    await this.ensureDependencies(pythonPath)
    return pythonPath
  }
  
  private async createCondaEnvironment(condaCommand: string, envName: string): Promise<void> {
    try {
      console.log(`🔧 Creating conda environment "${envName}" with Python 3.11...`)
      await execAsync(`${condaCommand} create -n ${envName} python=3.11 -y`, { timeout: 300000 }) // 5 minutes
      console.log(`✅ Conda environment "${envName}" created successfully`)
    } catch (error) {
      throw new Error(`❌ Failed to create conda environment: ${error}`)
    }
  }
  
  private async ensureDependencies(pythonPath: string): Promise<void> {
    console.log('🔍 Checking Python dependencies...')
    
    // 找到 requirements.txt 路径
    const isDevelopment = !app.isPackaged
    const projectRoot = isDevelopment ? join(__dirname, '../../..') : join(process.resourcesPath, '../../../..')
    const requirementsPath = join(projectRoot, 'requirements.txt')
    
    if (!existsSync(requirementsPath)) {
      console.log('⚠️ requirements.txt not found, skipping dependency check')
      return
    }
    
    // 从 requirements.txt 读取包列表
    const requiredPackages = this.parseRequirementsFile(requirementsPath)
    console.log(`📋 Found ${requiredPackages.length} packages in requirements.txt`)
    
    // 检查是否已安装所有依赖
    const missingPackages: string[] = []
    
    for (const pkg of requiredPackages) {
      try {
        // 将包名转换为可导入的模块名
        const importName = this.getImportName(pkg.name)
        await execAsync(`${pythonPath} -c "import ${importName}"`, { timeout: 5000 })
      } catch {
        missingPackages.push(pkg.name)
      }
    }
    
    if (missingPackages.length > 0) {
      console.log(`🔧 Installing missing packages: ${missingPackages.join(', ')}`)
      console.log('📦 Installing from requirements.txt...')
      await execAsync(`${pythonPath} -m pip install -r "${requirementsPath}"`, { timeout: 600000 }) // 10 minutes
      console.log('✅ All dependencies installed from requirements.txt')
    } else {
      console.log('✅ All dependencies are already installed')
    }
  }
  
  private parseRequirementsFile(requirementsPath: string): Array<{ name: string; version?: string }> {
    try {
      const content = readFileSync(requirementsPath, 'utf8')
      const lines = content.split('\n')
      const packages: Array<{ name: string; version?: string }> = []
      
      for (const line of lines) {
        const trimmedLine = line.trim()
        
        // 跳过空行和注释
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          continue
        }
        
        // 解析包名和版本
        // 支持格式：package, package==1.0.0, package>=1.0.0, package[extra]>=1.0.0
        const match = trimmedLine.match(/^([a-zA-Z0-9_\-\.]+(?:\[[^\]]+\])?)\s*([><=!~]*\s*[\d.]+.*)?/)
        if (match) {
          const fullName = match[1] // 保留完整包名（包括 extras）
          const baseName = fullName.split('[')[0] // 基础包名（移除 extras）
          const version = match[2]?.trim()
          packages.push({ name: baseName, version })
        }
      }
      
      return packages
    } catch (error) {
      console.log('⚠️ Error parsing requirements.txt:', error)
      return []
    }
  }
  
  private getImportName(packageName: string): string {
    // 某些包的导入名与包名不同
    const importMapping: { [key: string]: string } = {
      'pymupdf': 'fitz',
      'PyMuPDF': 'fitz',
      'python-multipart': 'multipart',
      'sse-starlette': 'sse_starlette',
      'python-dotenv': 'dotenv',
      'python-calamine': 'python_calamine',
      'uvicorn[standard]': 'uvicorn',
      'uvicorn': 'uvicorn'
    }
    
    // 标准化包名（转小写并移除版本和extras）
    const normalizedName = packageName.toLowerCase().split('[')[0]
    
    return importMapping[packageName] || importMapping[normalizedName] || normalizedName.replace('-', '_')
  }

}