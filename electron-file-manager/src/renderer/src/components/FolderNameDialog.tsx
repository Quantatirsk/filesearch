import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface FolderNameDialogProps {
  open: boolean
  defaultName: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export const FolderNameDialog: React.FC<FolderNameDialogProps> = ({
  open,
  defaultName,
  onConfirm,
  onCancel
}) => {
  const [folderName, setFolderName] = useState(defaultName)
  
  console.log('DEBUG: FolderNameDialog defaultName:', defaultName)
  console.log('DEBUG: FolderNameDialog folderName state:', folderName)
  
  // 当 defaultName 变化时更新 folderName 状态
  useEffect(() => {
    console.log('DEBUG: defaultName changed to:', defaultName)
    setFolderName(defaultName)
  }, [defaultName])

  const handleConfirm = () => {
    onConfirm(folderName.trim() || defaultName)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认文件夹名称</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="folder-name">
              将在选择的目录下创建文件夹来存放导出的文件：
            </Label>
            <Input
              id="folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="请输入文件夹名称"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={handleConfirm}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}