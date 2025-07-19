import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatDate(date: string | Date): string {
  if (!date) return '未知时间'
  
  const d = new Date(date)
  
  // 检查是否是有效时间
  if (isNaN(d.getTime()) || d.getFullYear() < 1980) {
    return '未知时间'
  }
  
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
}

export function getFileIcon(extension: string): string {
  const icons: { [key: string]: string } = {
    '.pdf': '📄',
    '.doc': '📝',
    '.docx': '📝',
    '.txt': '📃',
    '.md': '📝',
    '.xls': '📊',
    '.xlsx': '📊',
    '.csv': '📊',
    '.jpg': '🖼️',
    '.jpeg': '🖼️',
    '.png': '🖼️',
    '.gif': '🖼️',
    '.mp4': '🎥',
    '.avi': '🎥',
    '.mov': '🎥',
    '.mp3': '🎵',
    '.wav': '🎵',
    '.zip': '📦',
    '.rar': '📦',
    '.7z': '📦'
  }
  
  return icons[extension.toLowerCase()] || '📄'
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  
  return (...args: Parameters<T>) => {
    const later = () => {
      timeout = null
      func(...args)
    }
    
    if (timeout !== null) {
      clearTimeout(timeout)
    }
    
    timeout = setTimeout(later, wait)
  }
}

export function parseMultiKeywords(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter(keyword => keyword.length > 0)
}