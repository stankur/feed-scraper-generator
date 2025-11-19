# OSS Feed Scraper Generator

Generates scrapers for blog/press feeds using Claude agent.

## Setup

Install dependencies:
```bash
npm install
```

Create `.env`:
```
ANTHROPIC_API_KEY=sk-...
```

## Usage

### Single Company

Generate scraper from URL:
```bash
npm run rf <name> <url>
npm run rf <name> <url> --load-more "<selector>" --max-clicks N
```

Generate scraper from existing HTML:
```bash
npm run rf <name> --html <path>
```

### Multiple Companies

Create `jobs.json`:
```json
[
  {"name": "company", "url": "https://...", "loadMore": "selector", "maxClicks": 10}
]
```

Run batch:
```bash
npm run rf-batch jobs.json
```

## Outputs

Agent creates `<name>_scraper/` containing:
- `scraper.ts` - Generated scraper code
- `<name>.json` - Example output (may be present)
- `cost.json` - Cost/usage stats for both agent turns

HTML snapshots saved to `outputs/html/<name>.html`

## Running Scrapers

```bash
npm run rf-scrape <name> --stdout
npm run rf-scrape <name> --output <name>_scraper/<name>.json --max-pages N
```

## Options

- `--load-more "<selector>"` - Click selector to load more content
- `--max-clicks N` - Max times to click load-more (default: 30)
- `--max-pages N` - Max pages to scrape when running scraper

