@echo off
setlocal
echo Installiere Wiesbaden Survivors...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop-shortcut.ps1"
if errorlevel 1 (
  echo.
  echo Die Installation ist fehlgeschlagen.
) else (
  echo.
  echo Fertig. Desktop- und Startmenue-Verknuepfung wurden angelegt.
)
echo.
pause
endlocal
