The following is a feed of engineering blogs can you use grep to search for the following:

title of blog
URL of blog
date of the blog

The date data doesn't necessarily have to be in the format of date. Time indicators such as # days ago, # mins ago, etc would work too, just need to somehow signal recency. Remember case insensitive matching, if you are trying to match by day, or month for example, (jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec) not just matching to capitalized or not capitalized versions. And if you can't find this, look again, possible try to search near to the blog titles, because almost everytime the articles have dates. Don't assume that the date is wrapped in special tags like <time>

And then can you analyze how, if we are to build a scraper with cheerio. operating on the file, how would we select these things, such that we can get an array of

the objects with: title, date, and URL

This is a very long HTML, hence why I want you to use grep and be smart, since it is not possible to read the whole HTML file.

The other important bit is to investigate whether there seems to be a 'next page', or some indicator that this HTML is not the only page of the blog, and if there is a next page, do specify how we can go to the next page, so that in the cheerio scraper, we could use iterate and use the `renderFetch` function from `render-fetch.ts` (located at the repo root) to fetch the content of the next page, and scrape again. If we use this, we would not be scraping from the file I give you though, in the subseqent pages, we would need to define the naming scheme on our own.

If you find an empirical pattern in the URL for getting the different, and you know the max page, you don't need to do aything with the next button, just iterate through the patterns directly, and fetch using render fetch

If you can see something in the next page URL that represents a page like a number at the end being 2 at the first page, you can safely assume that is part of the URL.

Note: when you use render-fetch in the implementation, use the in-memory `renderFetch(url)` only. Do NOT write any HTML files to disk (do not use `renderFetchToFile`). Subsequent pages must also be fetched in-memory.

At this stage, we should only plan for the scraper, so after, the dir structure and files should be exactly the same as before. You should not for instance, write a markdown summary of your changes. You may not create the scraper file yet.

Additional constraints and Load More verification:

-   Allowed reads: no restriction.
-   Allowed edits/writes: Do not edit shared libs (`render-fetch.ts`, `rf.ts`, `rf-cli.ts`, `rf-scrape.ts`) or files outside `<name>_scraper/**`. Edits outside will be blocked.
-   If the blog uses a "Load more" button (not next-page navigation), identify a concrete CSS selector for it (e.g., `button.load-more, .load-more a`).
-   Re-render the HTML with a small number of clicks to verify the selector works (do not write HTML directly; use the CLI):
    -   `tsx rf-cli.ts <name> <url> --load-more "<CSS_SELECTOR>" --max-clicks 2`
    -   or `npm run rf -- <name> <url> --load-more "<CSS_SELECTOR>" --max-clicks 2`
-   Verify success yourself: compare the number of post elements before vs after re-render (e.g., count `<article>`, `.post`, `.card`, or a repeated container). If counts didn't increase, try a better selector.
