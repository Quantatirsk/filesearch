# Electron File Searcher Build Script - PowerShell Version
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "Building Electron File Searcher..." -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green

# Check build environment
Write-Host "Checking build environment..." -ForegroundColor Yellow

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Node.js not installed" -ForegroundColor Red
    Read-Host "Press any key to exit"
    exit 1
}

# Check npm
Write-Host "Checking npm..." -ForegroundColor Cyan
try {
    $npmVersion = npm --version
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: npm not installed" -ForegroundColor Red
    Read-Host "Press any key to exit"
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Write-Host "Dependencies installed successfully" -ForegroundColor Green
} catch {
    Write-Host "Error: Failed to install dependencies" -ForegroundColor Red
    Read-Host "Press any key to exit"
    exit 1
}

# Type checking
Write-Host "TypeScript type checking..." -ForegroundColor Yellow
try {
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
    Write-Host "TypeScript check passed" -ForegroundColor Green
} catch {
    Write-Host "Error: TypeScript type check failed" -ForegroundColor Red
    Read-Host "Press any key to exit"
    exit 1
}

# Code linting
Write-Host "ESLint code checking..." -ForegroundColor Yellow
try {
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw "lint failed" }
    Write-Host "ESLint check passed" -ForegroundColor Green
} catch {
    Write-Host "Error: ESLint check failed" -ForegroundColor Red
    Read-Host "Press any key to exit"
    exit 1
}

# Build application
Write-Host "Building application..." -ForegroundColor Yellow
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
    Write-Host "Application built successfully" -ForegroundColor Green
} catch {
    Write-Host "Error: Application build failed" -ForegroundColor Red
    Read-Host "Press any key to exit"
    exit 1
}

# Windows platform packaging
Write-Host "Building Windows application..." -ForegroundColor Yellow
try {
    npm run build:win
    if ($LASTEXITCODE -ne 0) { throw "build:win failed" }
    Write-Host "Windows application built successfully" -ForegroundColor Green
} catch {
    Write-Host "Error: Windows application build failed" -ForegroundColor Red
    Read-Host "Press any key to exit"
    exit 1
}

Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host "Output directory: .\dist\" -ForegroundColor Cyan
Read-Host "Press any key to exit"