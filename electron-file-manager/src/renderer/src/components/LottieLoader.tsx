import React from 'react';
import Lottie from 'lottie-react';

// Import animation files directly as modules for better bundling
import randomLoaderAnimation from '../assets/randomLoader.json';
import loaderAnimation from '../assets/loader.json';
import failedAnimation from '../assets/failed.json';
import magicLoaderAnimation from '../assets/magicLoader.json';

// Animation type mapping
const ANIMATIONS = {
  '/randomLoader.json': randomLoaderAnimation,
  '/loader.json': loaderAnimation,
  '/failed.json': failedAnimation,
  '/magicLoader.json': magicLoaderAnimation,
} as const;

interface LottieLoaderProps {
  size?: number;
  className?: string;
  animationPath?: keyof typeof ANIMATIONS;
}

export const LottieLoader: React.FC<LottieLoaderProps> = ({ 
  size = 64, 
  className = "", 
  animationPath = "/randomLoader.json" 
}) => {
  // Get animation data directly from imports
  const animationData = ANIMATIONS[animationPath] || randomLoaderAnimation;
  
  // Fallback to CSS spinner if animation data is not available
  if (!animationData) {
    return (
      <div 
        className={`flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <div className="animate-spin rounded-full border-2 border-primary border-t-transparent"
             style={{ width: size * 0.8, height: size * 0.8 }} />
      </div>
    );
  }
  
  return (
    <Lottie 
      animationData={animationData} 
      loop={true} 
      style={{ width: size, height: size }} 
      className={className}
    />
  );
};

// Loading component specifically for backend startup
export const BackendStartupLoader: React.FC<{ 
  message?: string;
  size?: number;
}> = ({ 
  message = "正在启动 Python 后端服务...", 
  size = 80 
}) => {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <div className="text-center">
        <div className="mb-6">
          <LottieLoader size={size} className="mx-auto" />
        </div>
        <div className="text-lg font-medium mb-2">{message}</div>
        <div className="text-sm opacity-70">请稍候，服务启动中...</div>
      </div>
    </div>
  );
};

// Search loading component specifically for search operations
export const SearchLoader: React.FC<{ 
  size?: number;
  className?: string;
}> = ({ 
  size = 16, 
  className = ""
}) => {
  return (
    <LottieLoader 
      size={size} 
      className={className}
      animationPath="/loader.json"
    />
  );
};

// No results found component
export const NoResultsLoader: React.FC<{ 
  size?: number;
  className?: string;
  searchQuery?: string;
}> = ({ 
  size = 100, 
  className = "",
  searchQuery = ""
}) => {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <div className="text-center">
        <div className="mb-6">
          <LottieLoader 
            size={size} 
            className={`mx-auto ${className}`}
            animationPath="/failed.json"
          />
        </div>
        <div className="text-lg font-medium mb-2">未找到相关文件</div>
        <div className="text-sm opacity-70">
          {searchQuery ? `搜索关键词 "${searchQuery}" 没有匹配的结果` : '尝试使用不同的关键词或搜索模式'}
        </div>
        <div className="text-xs mt-3 opacity-60">
          提示：可以使用 Tab 键切换搜索模式
        </div>
      </div>
    </div>
  );
};

export default LottieLoader;