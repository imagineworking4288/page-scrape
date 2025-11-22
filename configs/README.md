# Site Configuration Files

Site-specific configuration files for the select scraping method. Each config defines extraction boundaries and parsing rules for a specific website.

## Config File Format

Each config file should be named `domain.json` (e.g., `compass.com.json`) and placed in this directory.

### Structure

```json
{
  "domain": "example.com",
  "name": "Human-Readable Site Name",
  "description": "Description of what this site contains",
  "markers": {
    "start": { /* Start boundary marker */ },
    "end": { /* End boundary marker */ }
  },
  "scrollBehavior": { /* Page scrolling settings */ },
  "parsing": { /* Text parsing rules */ }
}
```

## Marker Types

Markers define the extraction boundaries on the page. Two types are supported:

### Text Markers

Find visible text in the DOM and use its position as the boundary.

```json
{
  "type": "text",
  "value": "Agents Found"
}
```

**How it works:**
- Searches the page for the exact text string
- Uses the bounding rectangle of that text node
- Useful for headings, labels, or consistent UI elements

**Finding text markers:**
1. Open the page in your browser
2. Right-click and select "Inspect Element"
3. Use Ctrl+F (Cmd+F on Mac) in DevTools to search for text
4. Verify the text appears consistently on all pages

### Coordinate Markers

Use pixel coordinates (x, y) relative to the page to define the boundary.

```json
{
  "type": "coordinate",
  "value": {"x": 100, "y": 200}
}
```

**How it works:**
- Uses the exact pixel position on the page
- Coordinates are relative to the top-left corner (0, 0)
- Useful when text markers aren't reliable

**Finding coordinates:**
1. Open DevTools (F12)
2. Go to Console tab
3. Run this JavaScript:
```javascript
document.addEventListener('click', (e) => {
  console.log(`Clicked at x: ${e.pageX}, y: ${e.pageY}`);
});
```
4. Click on the page where you want the boundary
5. Note the coordinates from the console

### Mixed Markers

You can mix marker types - e.g., text start with coordinate end:

```json
{
  "markers": {
    "start": {
      "type": "text",
      "value": "Contact List"
    },
    "end": {
      "type": "coordinate",
      "value": {"x": 0, "y": 5000}
    }
  }
}
```

## Scroll Behavior

Controls page scrolling to load lazy-loaded content (infinite scroll, dynamic lists).

```json
{
  "scrollBehavior": {
    "enabled": true,        // Enable/disable scrolling
    "scrollDelay": 500,     // Wait time (ms) between scrolls
    "maxScrolls": 50        // Maximum scroll attempts
  }
}
```

**Settings:**
- `enabled`: Set to `false` for pages with no lazy loading
- `scrollDelay`: Increase for slower-loading pages (1000-2000ms)
- `maxScrolls`: Increase for very long lists (100+)

## Parsing Rules

Controls how text is parsed into contact records.

```json
{
  "parsing": {
    "emailDomain": "compass.com",  // Filter to specific domain (or null for all)
    "nameBeforeEmail": true        // Look for name above (true) or below (false) email
  }
}
```

**Settings:**
- `emailDomain`:
  - Set to specific domain (e.g., `"compass.com"`) to filter emails
  - Set to `null` to accept all email domains
- `nameBeforeEmail`:
  - `true`: Name appears above email in layout (most common)
  - `false`: Name appears below email

## Example Configs

### Example 1: Real Estate Directory

```json
{
  "domain": "remax.com",
  "name": "RE/MAX Agent Directory",
  "markers": {
    "start": {
      "type": "text",
      "value": "Find an Agent"
    },
    "end": {
      "type": "text",
      "value": "Load More Agents"
    }
  },
  "scrollBehavior": {
    "enabled": true,
    "scrollDelay": 1000,
    "maxScrolls": 30
  },
  "parsing": {
    "emailDomain": null,
    "nameBeforeEmail": true
  }
}
```

### Example 2: Corporate Directory (Fixed Layout)

```json
{
  "domain": "company.com",
  "name": "Company Employee Directory",
  "markers": {
    "start": {
      "type": "coordinate",
      "value": {"x": 0, "y": 300}
    },
    "end": {
      "type": "coordinate",
      "value": {"x": 0, "y": 3000}
    }
  },
  "scrollBehavior": {
    "enabled": false
  },
  "parsing": {
    "emailDomain": "company.com",
    "nameBeforeEmail": true
  }
}
```

## Creating a New Config

1. **Identify the domain**: Use the base domain (e.g., `example.com`)
2. **Find start marker**: Locate consistent text/position before the contact list
3. **Find end marker**: Locate consistent text/position after the contact list
4. **Test scroll behavior**: Check if the page uses lazy loading
5. **Verify email domain**: Check if all contacts use the same email domain
6. **Create the file**: Name it `domain.json` and place it in `configs/`
7. **Test**: Run the scraper with `--method select` to verify

## Troubleshooting

### Marker not found
- **Text markers**: Text might be dynamic or in an iframe
- **Solution**: Try coordinate markers or adjust the text string

### Wrong content extracted
- **Issue**: Markers are too broad or too narrow
- **Solution**: Adjust marker positions, use more specific text

### Missing contacts
- **Issue**: Content loaded dynamically after markers found
- **Solution**: Increase `scrollDelay` or `maxScrolls`

### Too much content extracted
- **Issue**: End marker is too far down the page
- **Solution**: Find a marker closer to the contact list end

## Testing Your Config

```bash
# Test with the select method
node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/" --method select --limit 10

# Keep PDF for debugging
node orchestrator.js --url "https://example.com/directory" --method select --keep --limit 5
```

## Best Practices

1. **Use text markers when possible** - More reliable across page changes
2. **Test on multiple pages** - Verify markers work for different queries
3. **Start narrow** - Begin with tight boundaries, expand if needed
4. **Document your choices** - Add descriptive `description` field
5. **Version control** - Commit config files to track changes
