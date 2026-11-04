@echo off
REM Cashflow launcher - starts the Cashflow desktop app.
setlocal
cd /d "%~dp0"
if not exist "Cashflow.exe" (
  echo ERROR: Cashflow.exe was not found.
  echo Make sure you extracted the whole zip, keeping the folder structure.
  echo.
  pause
  exit /b 1
)
start "" "Cashflow.exe"
if errorlevel 1 (
  echo ERROR: Cashflow failed to start (error %errorlevel%).
  echo.
  pause
  exit /b 1
)
endlocal
