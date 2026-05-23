# InsurVision Auto - PowerShell Script to Initialize & Run AI Backend
# Automatically sets up Python virtual environment and installs dependencies for YOLOv8

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    INITIALIZING INSURVISION AUTO AI BACKEND SERVER" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check if virtual environment exists
if (-not (Test-Path ".\.venv")) {
    Write-Host "[1/3] Creating Python virtual environment (.venv)..." -ForegroundColor Yellow
    Start-Process -FilePath "python" -ArgumentList "-m venv .venv" -NoNewWindow -Wait
    Write-Host "✔ Virtual environment .venv created successfully!" -ForegroundColor Green
} else {
    Write-Host "[1/3] Virtual environment .venv already exists. Skipping creation." -ForegroundColor Gray
}

# 2. Install requirements using the virtual environment's pip directly
# This bypasses Windows ExecutionPolicy restrictions completely!
Write-Host "[2/3] Upgrading pip and installing AI dependencies (requirements.txt)..." -ForegroundColor Yellow
Write-Host "Note: Installing 'ultralytics' (YOLOv8) may take up to a few minutes..." -ForegroundColor Gray

Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "-m pip install --upgrade pip" -NoNewWindow -Wait
Start-Process -FilePath ".\.venv\Scripts\pip.exe" -ArgumentList "install -r requirements.txt" -NoNewWindow -Wait

Write-Host "✔ Successfully installed all requirements!" -ForegroundColor Green

# 3. Run FastAPI backend server via uvicorn inside .venv
Write-Host "[3/3] Launching Uvicorn server on http://localhost:8000..." -ForegroundColor Yellow
Write-Host "YOLOv8 model will be downloaded automatically from Hugging Face on start!" -ForegroundColor Cyan
Write-Host "Press CTRL+C to stop the server." -ForegroundColor Red
Write-Host ""

Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "-m uvicorn server:app --host 0.0.0.0 --port 8000" -NoNewWindow -Wait
