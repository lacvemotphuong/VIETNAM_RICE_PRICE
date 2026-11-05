@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 (
  echo.
  echo Khong the khoi dong du an. Hay doc thong bao loi o tren.
  pause
)
endlocal
