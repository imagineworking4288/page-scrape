@echo off
cd /d "C:\Projects\Page Scrapper\page-scrape"
color 0A

echo.
echo ================================================================================
echo                    UNIVERSAL PROFESSIONAL DIRECTORY SCRAPER v1.0
echo ================================================================================
echo.
echo [CORE CAPABILITIES]
echo   - Multi-method extraction: HTML, PDF, Hybrid, and Config-driven scraping
echo   - Smart pagination: Auto-detection, binary search boundary finding, resume support
echo   - Domain intelligence: Business vs personal classification, statistics, filtering
echo   - Anti-detection: Stealth browser, randomized delays, human-like behavior
echo   - Cross-page deduplication: Email-based and name+phone matching
echo   - Dual output: JSON files + automatic Google Sheets export
echo.
echo --------------------------------------------------------------------------------
echo [SCRAPING METHODS]
echo --------------------------------------------------------------------------------
echo   1. HTML   (--method html)   - Fast DOM extraction, ~60%% accuracy, 10-15s/page
echo   2. PDF    (--method pdf)    - Coordinate-based, ^>85%% accuracy, 15-30s/page
echo   3. HYBRID (--method hybrid) - HTML + PDF fallback for missing names [DEFAULT]
echo   4. SELECT (--method select) - Config-driven, site-specific markers, highest accuracy
echo.
echo --------------------------------------------------------------------------------
echo [PAGINATION FEATURES]
echo --------------------------------------------------------------------------------
echo   - Auto-detection: URL parameters (?page=N), path segments (/page/N), offsets
echo   - Binary search: Finds true max page in 8-12 tests instead of 200 sequential
echo   - Boundary confirmation: Verifies 2 consecutive empty pages before stopping
echo   - Resume support: Use --start-page N to continue interrupted scrapes
echo   - Pattern caching: Saves discovered patterns for instant reuse
echo.
echo --------------------------------------------------------------------------------
echo [DOMAIN ANALYSIS]
echo --------------------------------------------------------------------------------
echo   - Classification: Automatically tags business vs personal email domains
echo   - Statistics: Top domains, unique counts, business email percentage
echo   - 50+ known personal providers: Gmail, Yahoo, Hotmail, iCloud, etc.
echo.
echo --------------------------------------------------------------------------------
echo [OUTPUT FORMATS]
echo --------------------------------------------------------------------------------
echo   JSON Structure:
echo     - metadata: URL, timestamp, domain stats, pagination info
echo     - contacts: name, email, phone, domain, domainType, confidence, source
echo   Google Sheets:
echo     - Auto-export after each scrape (disable with --no-export)
echo     - Configurable columns in utils/google-sheets-exporter.js
echo     - Unique sheet names from URL, formatted headers
echo.
echo --------------------------------------------------------------------------------
echo [COMMAND-LINE OPTIONS]
echo --------------------------------------------------------------------------------
echo   REQUIRED:
echo     -u, --url ^<url^>              Target URL to scrape
echo.
echo   SCRAPING:
echo     -m, --method ^<type^>          html ^| pdf ^| hybrid ^| select (default: hybrid)
echo     -l, --limit ^<number^>         Max contacts to extract per page
echo     --headless ^<bool^>            Show browser: true ^| false (default: true)
echo     --delay ^<ms^>                 Request delay range (default: 2000-5000)
echo     --keep                       Keep PDF files in output/pdfs/
echo     --completeness ^<0-1^>         Min PDF completeness threshold (default: 0.7)
echo     --use-python                 Use Python PDF scraper for better accuracy
echo.
echo   PAGINATION:
echo     --paginate                   Enable multi-page scraping
echo     --max-pages ^<number^>         Maximum pages to scrape
echo     --start-page ^<number^>        Resume from specific page (default: 1)
echo     --min-contacts ^<number^>      Min contacts per page to continue
echo     --discover-only              Detect pagination pattern without scraping
echo.
echo   OUTPUT:
echo     -o, --output ^<format^>        json ^| csv ^| sqlite ^| all (default: json)
echo     --no-export                  Skip Google Sheets export
echo.
echo --------------------------------------------------------------------------------
echo [USAGE EXAMPLES]
echo --------------------------------------------------------------------------------
color 0E
echo   # Quick test (5 contacts, visible browser)
echo   node orchestrator.js --url "URL" --method select --limit 5 --headless false
echo.
echo   # Full site scrape with pagination
echo   node orchestrator.js --url "URL" --method select --paginate --max-pages 10
echo.
echo   # Resume interrupted scrape from page 15
echo   node orchestrator.js --url "URL" --method select --paginate --start-page 15
echo.
echo   # Discover pagination pattern only (no scraping)
echo   node orchestrator.js --url "URL" --discover-only
echo.
echo   # High-accuracy PDF extraction with Python
echo   node orchestrator.js --url "URL" --method pdf --use-python --keep
echo.
echo   # Skip Google Sheets export (JSON only)
echo   node orchestrator.js --url "URL" --method select --no-export
echo.
echo   # Pagination test with validation
echo   node tests/pagination-test.js --url "URL" --validate-sample 5 --save-cache
echo.
echo   # Integration test (discover + scrape + validate)
echo   node tests/pagination-integration-test.js --url "URL" --max-pages 3
echo.
echo   # Compass.com example (full workflow)
echo   node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --method select --paginate --max-pages 5
echo.
echo   # Debug mode (visible browser, keep files)
echo   node orchestrator.js --url "URL" --method hybrid --headless false --keep
echo.
color 0A
echo --------------------------------------------------------------------------------
echo [SITE CONFIGURATION]
echo --------------------------------------------------------------------------------
echo   Create configs/^<domain^>.json with:
echo     - name: Display name for the site
echo     - selectors: Contact container, email, phone, name CSS selectors
echo     - markers: Start/end text or coordinates for extraction region
echo     - pagination: Manual pattern override (type, paramName, baseUrl)
echo   Example: configs/compass.com.json
echo.
echo --------------------------------------------------------------------------------
echo [GOOGLE SHEETS SETUP]
echo --------------------------------------------------------------------------------
echo   1. Create Google Cloud project at console.cloud.google.com
echo   2. Enable Google Sheets API
echo   3. Create service account, download JSON credentials
echo   4. Share your spreadsheet with the service account email
echo   5. Add to .env: GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY, SPREADSHEET_ID
echo.
echo --------------------------------------------------------------------------------
echo [PERFORMANCE COMPARISON]
echo --------------------------------------------------------------------------------
echo   Method    Speed       Accuracy    Best For
echo   ------    -----       --------    --------
echo   html      10-15s      ~60%%        Quick scans, well-structured sites
echo   pdf       15-30s      ^>85%%        Complex layouts, PDF-based directories
echo   hybrid    15-25s      ~75%%        General purpose, unknown sites
echo   select    8-12s       ^>90%%        Configured sites, production scraping
echo.
echo --------------------------------------------------------------------------------
echo [TROUBLESHOOTING]
echo --------------------------------------------------------------------------------
echo   CAPTCHA detected        - Use --headless false, solve manually, increase --delay
echo   No contacts found       - Check selectors, try --method html first, inspect page
echo   Pagination stops early  - Check --min-contacts, verify pattern in cache
echo   PDF extraction fails    - Try --use-python, check --completeness threshold
echo   Google Sheets error     - Verify .env credentials, check service account permissions
echo   Rate limited            - Increase --delay, reduce --max-pages
echo   Empty pages detected    - Normal at end; binary search confirms boundaries
echo.
echo --------------------------------------------------------------------------------
echo [PROJECT STRUCTURE]
echo --------------------------------------------------------------------------------
echo   orchestrator.js           - Main CLI entry point
echo   scrapers/
echo     simple-scraper.js       - HTML/DOM-based extraction
echo     pdf-scraper.js          - PDF parsing with coordinate detection
echo     select-scraper.js       - Config-driven marker-based extraction
echo   utils/
echo     paginator.js            - Pagination detection and binary search
echo     browser-manager.js      - Puppeteer with stealth configuration
echo     domain-extractor.js     - Email domain classification
echo     google-sheets-exporter.js - Sheets API integration
echo     config-loader.js        - Site configuration management
echo   configs/                   - Site-specific JSON configurations
echo   tests/                     - Pagination and integration tests
echo   output/                    - JSON output files
echo.
echo ================================================================================
echo [QUICK START]
echo ================================================================================
color 0E
echo.
echo   TEST:  node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --method select --limit 5
echo.
echo   FULL:  node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --method select --paginate --max-pages 55
echo.
color 0A
echo ================================================================================
echo.

cmd /K
