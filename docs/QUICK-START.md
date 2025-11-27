# Quick Start Guide

## ⚡ 30-Second Setup

```bash
cd universal-scraper
npm install
cp .env.example .env
npm test
```

## 🎯 Common Commands

### Test the scraper
```bash
npm test
```

### Scrape a directory
```bash
node orchestrator.js --url "https://www.compass.com/agents/"
```

### Scrape with limit
```bash
node orchestrator.js --url "URL" --limit 50
```

### Watch the browser
```bash
node orchestrator.js --url "URL" --headless false
```

### Slower scraping (more human-like)
```bash
node orchestrator.js --url "URL" --delay "5000-10000"
```

## 📊 Check Results

### View extracted contacts
```bash
cat output/contacts-*.json | jq '.[0:3]'
```

### View logs
```bash
tail -f logs/scraper.log
```

### Count extracted contacts
```bash
cat output/contacts-*.json | jq 'length'
```

## 🐛 Debug Issues

### CAPTCHA detected
```bash
# Try with visible browser
node orchestrator.js --url "URL" --headless false
```

### No contacts found
```bash
# Check if cards detected
grep "Found.*cards" logs/scraper.log
```

### See full logs
```bash
cat logs/scraper.log | grep ERROR
```

## 🧪 Test Sites

Copy & paste these commands:

```bash
# Real estate agents
node orchestrator.js --url "https://www.compass.com/agents/"

# With limit
node orchestrator.js --url "https://www.compass.com/agents/" --limit 20

# Slow mode
node orchestrator.js --url "https://www.compass.com/agents/" --delay "5000-8000"
```

## 📁 File Locations

- **Code**: `scrapers/simple-scraper.js`
- **Tests**: `tests/scraper-test.js`
- **Output**: `output/contacts-*.json`
- **Logs**: `logs/scraper.log`
- **Config**: `.env`

## 💡 Pro Tips

1. **Always test first**: `npm test` before scraping
2. **Start small**: Use `--limit 10` for testing
3. **Check logs**: `logs/scraper.log` shows what happened
4. **Be patient**: First run downloads Chromium (~170MB)
5. **Respect sites**: Use delays, don't overwhelm servers

## 🎓 Next Steps

1. ✅ Run `npm test` - verify everything works
2. ✅ Test scrape Compass.com
3. ✅ Check `output/` directory for results
4. ✅ Review `WEEK2-COMPLETE.md` for details
5. 🚧 Ready for Week 3? Add link scraper!

## 🆘 Help

- Installation issues? → See `SETUP.md`
- How it works? → See `README.md`
- What's done? → See `WEEK2-COMPLETE.md`
- Still stuck? → Check `logs/error.log`
