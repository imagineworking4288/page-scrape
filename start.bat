@echo off
cd /d "C:\Projects\Page Scrapper\page-scrape"

echo ========================================
echo  Universal Professional Directory Scraper
echo ========================================
echo.
echo  Quick Start - Copy and paste this command:
echo.
echo  node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --method select --limit 10
echo.
echo ========================================
echo  Options:
echo    --method html    Use HTML scraper only
echo    --method pdf     Use PDF scraper only
echo    --method hybrid  HTML with PDF fallback
echo    --limit N        Number of contacts to extract
echo    --headless false Show browser window
echo    --keep           Keep PDF files for inspection
echo ========================================
echo.

cmd /K