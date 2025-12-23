@echo off
cd /d "C:\Projects\Page Scrapper\page-scrape"
color 0A

echo.
echo ================================================================================
echo                    PAGE SCRAPE - UNIVERSAL DIRECTORY SCRAPER
echo ================================================================================
echo.
echo ================================================================================
echo [QUICK REFERENCE]
echo ================================================================================
echo.
echo   ORCHESTRATOR FLAGS:
echo     --url ^<url^>           Target URL (required)
echo     --config ^<name^>       Config name (e.g., "domain-com")
echo     --limit ^<n^>           Max contacts to extract
echo     --paginate            Enable pagination (traditional pages)
echo     --scroll              Enable infinite scroll (Selenium)
echo     --full-pipeline       Run: config -^> scrape -^> enrich -^> export
echo     --auto                Skip confirmation prompts
echo     --core-only           Export only 6 core fields
echo     --headless ^<bool^>     Browser visibility (default: true)
echo.
echo ================================================================================
echo [BASIC COMMANDS]
echo ================================================================================
color 0E
echo.
echo node orchestrator.js --limit 5 --headless false --url "URL"
echo node orchestrator.js --paginate --core-only --config domain-com --url "URL"
echo node orchestrator.js --scroll --core-only --config domain-com --url "URL"
echo node orchestrator.js --full-pipeline --auto --core-only --url "URL"
echo.
color 0A
echo ================================================================================
echo [TEST PIPELINE]
echo ================================================================================
echo.
echo   STEP 1: Test Navigation (scroll OR pagination)
echo   STEP 2: Generate Config
echo   STEP 3: Run Orchestrator
echo.
color 0E
echo [STEP 1A - TEST INFINITE SCROLL]
echo node src/tools/test-navigation.js --type scroll --verbose --url "URL"
echo.
echo [STEP 1B - TEST PAGINATION]
echo node src/tools/test-navigation.js --type pagination --verbose --url "URL"
echo.
echo [STEP 2 - GENERATE CONFIG]
echo node src/tools/config-generator.js --url "URL"
echo.
echo [STEP 3A - ORCHESTRATOR WITH PAGINATION]
echo node orchestrator.js --paginate --core-only --config domain-com --url "URL"
echo.
echo [STEP 3B - ORCHESTRATOR WITH INFINITE SCROLL]
echo node orchestrator.js --scroll --core-only --config domain-com --url "URL"
echo.
echo [STEP 3C - FULL PIPELINE]
echo node orchestrator.js --full-pipeline --auto --core-only --url "URL"
echo.
echo [STEP TEST]
echo node orchestrator.js --full-pipeline --url "https://www.compass.com/agents/locations/new-york-ny/21429/?page=1" --core-only
echo.
color 0A
echo ================================================================================
echo.

cmd /K