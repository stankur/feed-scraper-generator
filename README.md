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

Single company:

```bash
source .venv/bin/activate
python discover-url.py <company>
```

Output saved to `<company>_urls.json`.

Batch discovery:

```bash
python discover-batch.py companies.json
python discover-batch.py companies.json --concurrency 5
python discover-batch.py companies.json --force
```

`companies.json` format: `["Temporal", "Stripe", "GitHub"]`

Output: `urls.json` (updated incrementally), per-company logs in `logs/<company>_url_search/`

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

Or generate scrapers directly from `urls.json`:

```bash
npm run agent-from-urls -- urls.json
npm run agent-from-urls -- urls.json --limit 10 --concurrency 3
```

Automatically converts discovered URLs to scraper jobs, skipping existing scrapers.

## Outputs

Agent creates `<name>_scraper/` containing:

-   `scraper.ts` - Generated scraper code
-   `<name>.json` - Example output (may be present)
-   `run.json` - Cost/usage stats

URL discovery creates:

-   `<company>_urls.json` - Single company discovery
-   `urls.json` - Batch discovery output (all companies)
-   `logs/<company>_url_search/run.json` - Per-company metadata (cost, duration, URLs)
-   `logs/<company>_url_search/run.log` - Full console output
-   `logs/<company>_url_search/conversation.json` - Full agent conversation

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
