import { useState, useEffect } from 'react'

interface SettingsData {
  enabledFormats: string[]
  enabledCategories: string[]
  [key: string]: any
}

const DEFAULT_SETTINGS: SettingsData = {
  enabledFormats: [
    // Default formats for common document types
    'pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md',
    // Programming files
    'py', 'js', 'ts', 'jsx', 'tsx', 'json', 'xml', 'html', 'css',
    // Config files
    'yml', 'yaml', 'toml', 'ini', 'env', 'conf'
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
      const savedSettings = await window.electronAPI?.settings?.load()
      if (savedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
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
      await window.electronAPI?.settings?.save(updatedSettings)
      setSettings(updatedSettings)
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