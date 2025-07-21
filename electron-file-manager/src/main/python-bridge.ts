import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import axios, { AxiosRequestConfig } from 'axios'

export class PythonBridge {
  private pythonProcess: ChildProcess | null = null
  private isStarted = false
  private readonly port = 8001
  private readonly host = 'localhost'
  private readonly baseUrl = `http://${this.host}:${this.port}`

  async start(): Promise<{ success: boolean; message: string }> {
    if (this.isStarted) {
      return { success: true, message: 'Python backend already running' }
    }

    try {
      // Path to the Python backend (go up to filesearch directory)
      const pythonBackendPath = join(__dirname, '../../..')
      
      console.log('🔍 DEBUG: Starting Python backend from:', pythonBackendPath)
      console.log('🔍 DEBUG: Full command: python api_server.py --host', this.host, '--port', this.port.toString())
      console.log('🔍 DEBUG: Working directory:', pythonBackendPath)
      console.log('🔍 DEBUG: Default database path will be:', join(pythonBackendPath, 'documents.db'))
      
      // Start the Python API server
      this.pythonProcess = spawn('python', ['api_server.py', '--host', this.host, '--port', this.port.toString()], {
        cwd: pythonBackendPath,
        stdio: 'pipe',
        env: { ...process.env, PYTHONPATH: pythonBackendPath }
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

      // Log stdout and stderr
      this.pythonProcess.stdout?.on('data', (data) => {
        console.log('Python stdout:', data.toString())
      })

      this.pythonProcess.stderr?.on('data', (data) => {
        console.error('Python stderr:', data.toString())
      })

      // Wait for the server to be ready
      await this.waitForServer()
      
      this.isStarted = true
      return { success: true, message: 'Python backend started successfully' }
    } catch (error) {
      console.error('Failed to start Python backend:', error)
      this.isStarted = false
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
      let timeout = 30000 // Default 30 seconds
      
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
      
      console.log(`Making API request to ${options.url} with timeout: ${timeout}ms (${timeout/1000}s)`)
      
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

  private async waitForServer(maxRetries = 20, retryDelay = 1000): Promise<void> {
    console.log('Waiting for Python server to start...')
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await axios.get(`${this.baseUrl}/health`, { timeout: 3000 })
        console.log('Python server is ready:', response.data)
        return
      } catch (error) {
        console.log(`Server check attempt ${i + 1}/${maxRetries} failed:`, error.message)
        if (i === maxRetries - 1) {
          throw new Error(`Python server failed to start within timeout period (${maxRetries * retryDelay}ms)`)
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }
  }
}