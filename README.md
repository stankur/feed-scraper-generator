# OSS Feed Scraper Generator

Generates scrapers for blog/press feeds using Claude agent.

## Setup

Install dependencies:

```bash
npm install
```

Python setup (for URL discovery):

```bash
uv init --lib --no-readme
uv venv
source .venv/bin/activate
uv add browser-use langchain-anthropic python-dotenv
uvx browser-use install
```

Create `.env`:

```
ANTHROPIC_API_KEY=sk-...
```

## Usage

### Discover Engineering Blog URLs

```bash
source .venv/bin/activate
python discover-url.py <company>
```

Output saved to `<company>_urls.json`.

### Generate Scraper from URL

```bash
npm run agent -- <name> <url>
npm run agent -- <name> <url> --load-more "<selector>" --max-clicks N
```

Or from existing HTML:

```bash
npm run agent -- <name> --html <path>
```

### Batch Processing

Create `jobs.json`:

```json
[
	{
		"name": "company",
		"url": "https://...",
		"loadMore": "selector",
		"maxClicks": 10
	}
]
```

Run batch:

```bash
npm run agent-batch -- jobs.json
```

## Outputs

Agent creates `<name>_scraper/` containing:

-   `scraper.ts` - Generated scraper code
-   `<name>.json` - Example output (may be present)
-   `run.json` - Cost/usage stats

URL discovery creates:

-   `<company>_urls.json` - Discovered URLs with categories
-   `logs/<company>_conversation.json` - Full discovery conversation

HTML snapshots saved to `outputs/html/<name>.html`

## Running Scrapers

```bash
npm run scraper -- <name> --stdout
npm run scraper -- <name> --output <name>_scraper/<name>.json --max-pages N
```

## Options

-   `--load-more "<selector>"` - Click selector to load more content
-   `--max-clicks N` - Max times to click load-more (default: 30)
-   `--max-pages N` - Max pages to scrape when running scraper
