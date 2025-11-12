Create or update a single file `<name>_scraper/scraper.js`. Do NOT initialize npm or create `package.json`. Do NOT create any other files.

Export a programmatic API:

-   `export async function scrape({ maxPages = 1 } = {}): Promise<Array<{title:string,url:string,date:string}>>`
-   Inside the file define `const SEED_URL = 'https://...'` (the blog listing URL).
-   Page 1: always `await renderFetch(SEED_URL)`; if pagination exists and `maxPages > 1`, compute next page URLs and `await renderFetch(nextUrl)` for pages 2..maxPages.
-   Extract items in DOM/top-to-bottom order and return a single array of `{ title, url, date }` (strings exactly as shown; never reformat dates).

I want the dates, if existing to be written exactly as shown, please do not modify the wording. For instance if some articles are written in relative format like 5d ago, and some in absolute like 12 Aug 2024, I want you to write EXACTLY as that in the final JSON. please just write the date. Do not for example append categories.

if there is pagination, handle it immediately in this turn, don't ask for my confirmation, because you will be running autonomously, and I can't make more chat turns. So you need to be complete.

Validation (must run inside the function before returning):

-   Result is an array and every item has non-empty `title`, `url`, and `date`.
-   If some items are missing fields while others are present, fix selectors and re-run, or throw an Error with a concise justification.

Run and verify via the root CLI (only allowed runner):

-   `node rf-scrape.js <name> --max-pages 3 --output <name>_scraper/<name>.json`
-   Then `cat <name>_scraper/<name>.json` and verify every object has title/url/date and matches site text exactly.

Take a look at the date, make sure they are just dates, not meddled with anything else like blog category.

I/O constraints:

-   Allowed write: only `<name>_scraper/<name>.json` when `--output` is used.
-   No other files may be written (no `package.json`, no README, no analysis files).
-   Allowed commands: `rg`/`grep`, `node rf-scrape.js`, optionally `cat` to inspect JSON.
-   Do not install packages. Use Node + Cheerio + `renderFetch` from `../../render-fetch.js`.


