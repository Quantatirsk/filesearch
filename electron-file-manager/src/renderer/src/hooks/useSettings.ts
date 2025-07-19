import { useState, useEffect } from 'react'

interface SettingsData {
  enabledFormats: string[]
  enabledCategories: string[]
  [key: string]: any
}

const DEFAULT_SETTINGS: SettingsData = {
  enabledFormats: [
    // Default formats for common document types
    '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md',
    // Programming files
    '.py', '.js', '.ts', '.jsx', '.tsx', '.json', '.xml', '.html', '.css',
    // Config files
    '.yml', '.yaml', '.toml', '.ini', '.env', '.conf'
  ],
  enabledCategories: ['documents', 'programming', 'web', 'config', 'shell', 'docs', 'build'],
}

export const useSettings = () => {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)

  // Load settings
  const loadSettings = async () => {
    setLoading(true)
    try {
      console.log('⚙️ Settings Debug - Loading settings...')
      const savedSettings = await window.electronAPI?.settings?.load()
      console.log('  - Raw saved settings:', savedSettings)
      if (savedSettings) {
        const mergedSettings = { ...DEFAULT_SETTINGS, ...savedSettings }
        console.log('  - Default settings:', DEFAULT_SETTINGS)
        console.log('  - Merged settings:', mergedSettings)
        console.log('  - Enabled formats in merged:', mergedSettings.enabledFormats)
        setSettings(mergedSettings)
      } else {
        console.log('  - No saved settings found, using defaults')
        setSettings(DEFAULT_SETTINGS)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setLoading(false)
    }
  }

  // Save settings
  const saveSettings = async (newSettings: Partial<SettingsData>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings }
      console.log('⚙️ Settings Debug - Saving settings:')
      console.log('  - Current settings:', settings)
      console.log('  - New settings:', newSettings)
      console.log('  - Updated settings:', updatedSettings)
      console.log('  - Enabled formats before save:', settings.enabledFormats)
      console.log('  - Enabled formats after merge:', updatedSettings.enabledFormats)
      
      await window.electronAPI?.settings?.save(updatedSettings)
      setSettings(updatedSettings)
      
      console.log('  - Settings saved successfully!')
      console.log('  - State updated, enabled formats:', updatedSettings.enabledFormats)
      
      // 触发一个短暂延迟来确保所有组件都收到更新
      setTimeout(() => {
        console.log('⚙️ Settings state after delay:', updatedSettings.enabledFormats)
      }, 100)
      
      return true
    } catch (error) {
      console.error('Failed to save settings:', error)
      return false
    }
  }

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  return {
    settings,
    loading,
    loadSettings,
    saveSettings,
    updateSetting: <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
      setSettings(prev => ({ ...prev, [key]: value }))
    }
  }
}