import { useState, useEffect } from 'react'

interface SettingsData {
  enabledFormats: string[]
  enabledCategories: string[]
  [key: string]: unknown
}

const DEFAULT_SETTINGS: SettingsData = {
  enabledFormats: [
    // 文本文件类
    '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md', '.rtf', '.ppt', '.pptx', '.odt', '.ods', '.odp',
    '.epub', '.mobi', '.azw', '.azw3', '.fb2',
    '.log', '.tmp', '.bak', '.old', '.orig', '.backup',
    '.db', '.sqlite', '.sqlite3', '.mdb',
    // 压缩文件类
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.lz', '.lzma', '.z',
    '.dmg', '.iso', '.img', '.toast',
    '.pkg', '.deb', '.rpm', '.msi', '.exe', '.app'
  ],
  enabledCategories: ['text_files', 'archive_files'],
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