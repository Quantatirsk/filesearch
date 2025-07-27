import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { Brain, Search, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface SearchingModalProps {
  isVisible?: boolean;
  content?: string;
  title?: string;
  isGenerating?: boolean;
  type?: 'searching' | 'thinking' | 'analysis';
  className?: string;
  enableSmoothScroll?: boolean;
}

// 分离头部组件 - 不依赖content，避免频繁重渲染
const SearchingHeader = memo<{
  title: string;
  isGenerating: boolean;
  seconds: number;
  type: 'searching' | 'thinking' | 'analysis';
}>(({ title, isGenerating, seconds, type }) => {
  // 获取图标和主题 - shadcn黑白灰配色
  const getTypeConfig = () => {
    switch (type) {
      case 'searching':
        return {
          icon: Search,
          color: 'text-foreground',
          pulseColor: 'bg-foreground'
        };
      case 'analysis':
        return {
          icon: Zap,
          color: 'text-foreground',
          pulseColor: 'bg-foreground'
        };
      default:
        return {
          icon: Brain,
          color: 'text-foreground',
          pulseColor: 'bg-foreground'
        };
    }
  };

  const config = getTypeConfig();
  const IconComponent = config.icon;

  return (
    <div className="flex items-center px-3 py-2 border-b border-border">
      <div className="flex items-center gap-3">
        <div className="relative">
          <IconComponent className={cn("w-4 h-4", config.color)} />
          {isGenerating && (
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.7, 1, 0.7]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className={cn(
                "absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full",
                config.pulseColor
              )}
            />
          )}
        </div>
        <span className="text-sm font-medium text-foreground">
          {title} {isGenerating && `${seconds}秒`}
        </span>
      </div>
    </div>
  );
});

SearchingHeader.displayName = 'SearchingHeader';

// 内容预处理函数
const processContent = (rawContent: string): string => {
  if (!rawContent) return '';
  
  // 简单的内容清理，保持搜索日志的格式
  return rawContent
    .trim()
    .replace(/^\s*```[\s\S]*?```\s*/gm, '') // 移除代码块
    .replace(/^\s*#+\s*/gm, '') // 移除markdown标题
    .trim();
};

// 分离内容组件 - 流式滚动显示
const SearchingContent = memo<{
  content: string;
  enableSmoothScroll: boolean;
  isGenerating: boolean;
}>(({ content, enableSmoothScroll }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevContentLengthRef = useRef(0);
  
  // 内容预处理和显示状态
  const [displayContent, setDisplayContent] = useState('');
  const [showContent, setShowContent] = useState(false);
  
  // 预处理内容
  const processedContent = useMemo(() => processContent(content), [content]);

  // 初始化内容显示状态
  useEffect(() => {
    if (!enableSmoothScroll) {
      setShowContent(true);
    } else if (!showContent) {
      // 只在首次启用平滑滚动时设置
      setShowContent(true);
    }
  }, [enableSmoothScroll, showContent]);

  // 内容更新逻辑
  useEffect(() => {
    // 如果传入的content为空，重置显示内容（新搜索开始）
    if (processedContent === '') {
      console.log('🔄 SearchingModal: Resetting display content (empty input)')
      setDisplayContent('');
      return;
    }

    if (!showContent) {
      console.log('📺 SearchingModal: Setting content directly (not showing yet)')
      setDisplayContent(processedContent);
      return;
    }

    if (enableSmoothScroll && processedContent.length > displayContent.length) {
      // 逐步显示内容
      const targetLength = Math.min(
        displayContent.length + Math.ceil(processedContent.length / 15),
        processedContent.length
      );
      
      const timer = setTimeout(() => {
        console.log('⚡ SearchingModal: Smooth scroll update', targetLength, '/', processedContent.length)
        setDisplayContent(processedContent.slice(0, targetLength));
      }, 30);

      return () => clearTimeout(timer);
    } else {
      console.log('💨 SearchingModal: Setting content directly', processedContent.length)
      setDisplayContent(processedContent);
      return undefined;
    }
  }, [processedContent, showContent, displayContent, enableSmoothScroll]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current && displayContent.length > prevContentLengthRef.current) {
      const scrollElement = scrollRef.current;
      requestAnimationFrame(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      });
    }
    prevContentLengthRef.current = displayContent.length;
  }, [displayContent]);

  return (
    <div className="h-72 overflow-hidden relative">
      {/* 内容容器 - 固定高度，滚动显示，隐藏滚动条 */}
      <div 
        ref={scrollRef}
        className="h-full p-4 overflow-y-auto scrollbar-hide"
      >
        {!showContent && enableSmoothScroll ? (
          <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono h-full flex items-center justify-center">
            <div className="text-center">
              <div className="mb-2">🔍</div>
              <div>正在搜索文件...</div>
            </div>
          </div>
        ) : (
          <pre className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono">
            {displayContent || ''}
          </pre>
        )}
      </div>
    </div>
  );
});

SearchingContent.displayName = 'SearchingContent';

const SearchingModal: React.FC<SearchingModalProps> = ({
  isVisible = true,
  content = '',
  title = '正在智能搜索',
  isGenerating = true,
  type = 'searching',
  className,
  enableSmoothScroll = true
}) => {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 计时器效果
  useEffect(() => {
    if (!isGenerating || !isVisible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    intervalRef.current = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isGenerating, isVisible]);

  // 组件初始化时重置状态
  useEffect(() => {
    if (isVisible) {
      setSeconds(0);
    }
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "w-full searching-modal mb-4",
        className
      )}
    >
      <div className="relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        {/* 动态边框光效 */}
        <motion.div
          animate={{
            opacity: [0.3, 0.7, 0.3]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute inset-0 rounded-lg border border-muted-foreground/20"
        />

        {/* 使用分离的头部组件 */}
        <SearchingHeader
          title={title}
          isGenerating={isGenerating}
          seconds={seconds}
          type={type}
        />

        {/* 使用分离的内容组件 */}
        <SearchingContent
          content={content}
          enableSmoothScroll={enableSmoothScroll}
          isGenerating={isGenerating}
        />
      </div>
    </motion.div>
  );
};

export { SearchingModal };
export type { SearchingModalProps };
export default SearchingModal;