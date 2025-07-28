# Python Environment Setup for Development

This document explains the **simplified** Python environment setup for the Electron File Searcher.

## Automatic Setup (Recommended)

The application now **automatically manages** the conda environment for you! 

### What happens automatically:

1. **Environment Detection**: Searches for conda installations (miniforge3, anaconda3, miniconda3, mambaforge)
2. **Environment Creation**: If conda environment `file` doesn't exist, creates it automatically
3. **Dependency Installation**: Automatically installs all required packages from `requirements.txt`
4. **Ready to Use**: No manual configuration needed!

### Prerequisites

You only need **ONE** of these conda distributions installed:
- [Miniforge](https://github.com/conda-forge/miniforge) (Recommended)
- [Anaconda](https://www.anaconda.com/download)
- [Miniconda](https://docs.conda.io/en/latest/miniconda.html)
- [Mambaforge](https://github.com/conda-forge/miniforge)

## What the App Does Automatically

### 1. First Run
```
🔍 Managing conda environment "file"...
✅ Found conda installation: /Users/username/miniforge3
🔧 Creating conda environment "file" with Python 3.11...
✅ Conda environment "file" created successfully
📦 Installing from requirements.txt...
✅ All dependencies installed from requirements.txt
```

### 2. Subsequent Runs
```
🔍 Managing conda environment "file"...
✅ Found conda installation: /Users/username/miniforge3
✅ Conda environment "file" exists
✅ All dependencies are already installed
```

## Manual Setup (Optional)

If you prefer to set up the environment manually:

```bash
# Create conda environment
conda create -n file python=3.11 -y

# Activate environment
conda activate file

# Install dependencies
cd /path/to/filesearch
pip install -r requirements.txt
```

## Development Workflow

1. **Install conda** (if not already installed)
2. **Start the Electron app** - everything else is automatic!
3. Check console logs to see the automatic setup progress

## Troubleshooting

### Environment Creation Failed
- **Check conda installation**: Make sure conda is properly installed
- **Check permissions**: Ensure you have write permissions to create environments
- **Check disk space**: Environment creation requires several hundred MB

### Dependency Installation Failed
- **Check internet connection**: pip needs internet to download packages
- **Check pip version**: Update pip: `python -m pip install --upgrade pip`
- **Manual installation**: Try running `pip install -r requirements.txt` manually

### No Conda Found
Error: `❌ No conda installation found`

**Solution**: Install one of these:
- Miniforge: `brew install miniforge` (macOS with Homebrew)
- Download from official websites listed above

### Python Not Found After Creation
Error: `❌ Python not found in conda environment`

**Solution**: 
1. Delete the environment: `conda env remove -n file`
2. Restart the Electron app to recreate it

## Console Output Examples

### Successful Setup
```
🔍 Managing conda environment "file"...
✅ Found conda installation: /Users/username/miniforge3
✅ Conda environment "file" exists
🔍 Checking Python dependencies...
✅ All dependencies are already installed
🔍 Starting Python backend...
✅ Python server is ready
```

### First-Time Setup
```
🔍 Managing conda environment "file"...
✅ Found conda installation: /Users/username/miniforge3
🔧 Creating conda environment "file" with Python 3.11...
✅ Conda environment "file" created successfully
🔍 Checking Python dependencies...
🔧 Installing missing packages: fastapi, uvicorn, pymupdf, lxml, pandas, rapidfuzz, sse-starlette
📦 Installing from requirements.txt...
✅ All dependencies installed from requirements.txt
🔍 Starting Python backend...
✅ Python server is ready
```

## Benefits of Automatic Setup

- ✅ **Zero Configuration**: No manual environment setup needed
- ✅ **Consistent Environment**: Same setup across all developers
- ✅ **Error Recovery**: Automatically fixes missing dependencies
- ✅ **Version Control**: Uses exact versions from requirements.txt
- ✅ **Cross-Platform**: Works on macOS, Linux, and Windows