Create or update a single file `<name>_scraper/scraper.ts`. Do NOT initialize npm or create `package.json`. Do NOT create any other files.

Export a programmatic API:

-   `export async function scrape({ maxPages = 1 } = {}): Promise<Array<{title:string,url:string,date:string|null}>>`
-   Inside the file define `const SEED_URL = 'https://...'` (the blog listing URL).
-   Page 1: always `await renderFetch(SEED_URL)`; if pagination exists and `maxPages > 1`, compute next page URLs and `await renderFetch(nextUrl)` for pages 2..maxPages.
-   Extract items in DOM/top-to-bottom order and return a single array of `{ title, url, date }` (strings exactly as shown; never reformat dates; date may be null if truly absent from HTML).

If the site uses a "Load more" button instead of next-page navigation, call `renderFetch` with a selector and map `maxPages` to the number of clicks:

```ts
await renderFetch(SEED_URL, {
	loadMore: "<CSS_SELECTOR>",
	maxClicks: Math.max(0, maxPages - 1),
});
```

I want the dates, if existing to be written exactly as shown, please do not modify the wording. For instance if some articles are written in relative format like 5d ago, and some in absolute like 12 Aug 2024, I want you to write EXACTLY as that in the final JSON. Try hard to find dates—check post metadata, time tags, nearby text. Only use `date: null` if no date information exists anywhere near that post in the HTML. Do not append categories or other text to dates.

However, if there is the date in the HTML, while not visible, just use that. in whatever text format (just the date) is in there.

if there is pagination, handle it immediately in this turn, don't ask for my confirmation, because you will be running autonomously, and I can't make more chat turns. So you need to be complete.

Validation (must run inside the function before returning):

-   Result is an array and every item has non-empty `title` and `url`. Date should be extracted when present; null is acceptable only when no date info exists in the HTML.
-   If some items are missing `title` or `url`, fix selectors and re-run, or throw an Error with a concise justification. Missing dates are acceptable if the HTML truly lacks date information for those posts. but make sure you verify that the date is not there.

Run and verify via the root CLI (only allowed runner):

-   `tsx scraper-run.ts <name> --max-pages 3 --output <name>_scraper/<name>.json`
-   Then `cat <name>_scraper/<name>.json` and verify every object has title/url/date and matches site text exactly.

Take a look at the date, make sure they are just dates, not meddled with anything else like blog category.

I/O constraints:

-   Allowed write: only `<name>_scraper/<name>.json` when `--output` is used.
-   No other files may be written (no `package.json`, no README, no analysis files).
-   Allowed commands: `rg`/`grep`, `tsx scraper-run.ts`, optionally `cat` to inspect JSON.
-   Do not install packages. Use Node + Cheerio + `renderFetch` from `../render-fetch`.
-   Import statement: Use `import { renderFetch } from '../render-fetch';` (no extension, relative path from `<name>_scraper/scraper.ts` to root `render-fetch.ts`). Do NOT use `@` prefix or any other import syntax.
-   Logs are in `debug-render-fetch.log` if you need to debug if problems occur or need extra details.

[warning] if you want to change the scraper to extract something using a regex pattern, test the regex pattern first, before incorporating to the scraper. only change the scraper once you are sure that the regex pattern work. Please take note of this because it often comes as tricky for you.

If we have found that no pagination exist or is usable, and or, there is no load more, we don't need to verify testing wit 3 pages, just testing for 2 pages is enough. We want to minimize the number of agent turns.

There is no need to output a final summary of what we've done. As long as you have got the scraper, and verified it, just finish, no need to give a summary.
