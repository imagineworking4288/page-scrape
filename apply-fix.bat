@echo off
echo ====================================
echo  ORCHESTRATOR.JS FIX SCRIPT
echo ====================================
echo.

REM Check if logs directory exists
if not exist "logs" (
    echo Creating logs directory...
    mkdir logs
    echo Logs directory created.
    echo.
)

REM Check if orchestrator-corrected.js exists
if not exist "orchestrator-corrected.js" (
    echo ERROR: orchestrator-corrected.js not found!
    echo Please make sure you have the corrected file in the same directory.
    pause
    exit /b 1
)

REM Backup original orchestrator.js
if exist "orchestrator.js" (
    echo Backing up original orchestrator.js...
    copy orchestrator.js orchestrator.js.backup >nul
    echo Backup created: orchestrator.js.backup
    echo.
)

REM Copy the corrected version
echo Applying fix...
copy orchestrator-corrected.js orchestrator.js >nul
echo Fix applied successfully!
echo.

echo ====================================
echo  FIX COMPLETE
echo ====================================
echo.
echo Now test with:
echo   node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --headless false
echo.
pause
