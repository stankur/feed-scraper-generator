import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeFormat from "rehype-format";
import rehypeStringify from "rehype-stringify";

const DEBUG_LOG = path.resolve(process.cwd(), "debug-render-fetch.log");

function log(msg: string): void {
	const line = `${new Date().toISOString()} ${msg}\n`;
	fssync.appendFileSync(DEBUG_LOG, line);
	console.log(msg);
}

interface RenderOptions {
	loadMore?: string;
	maxClicks?: number;
}

async function formatHtml(html: string): Promise<string> {
	const file = await unified()
		.use(rehypeParse)
		.use(rehypeFormat)
		.use(rehypeStringify)
		.process(html);
	return String(file);
}

export async function renderFetch(
	url: string,
	options: RenderOptions = {}
): Promise<string> {
	// Clear debug log at start of each run
	fssync.writeFileSync(DEBUG_LOG, "");
	log(`[render-fetch] START: ${url}`);
	log(`[render-fetch] launching browser...`);
	const browser = await puppeteer.launch({
		headless: true,
	});
	log(`[render-fetch] browser launched`);

	const page = await browser.newPage();
	await page.setUserAgent(
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
	);

	log(`[render-fetch] navigating to ${url}...`);
	await page.goto(url, {
		waitUntil: "domcontentloaded",
		timeout: 30000,
	});
	log(`[render-fetch] page loaded`);

	let lastHeight = await page.evaluate(
		() => document.documentElement.scrollHeight
	);
	let discoveries = 0;
	const maxIterations = 60;
	const growthWaitMs = 1500;

	log(
		`[render-fetch] starting scroll loop (initial height: ${lastHeight}px)`
	);
	for (let i = 0; i < maxIterations; i++) {
		await page.keyboard.press("End");
		try {
			// wait until the page grows
			// eslint-disable-next-line no-new-func
			await page.waitForFunction(
				`document.documentElement.scrollHeight > ${lastHeight}`,
				{ timeout: growthWaitMs }
			);
			lastHeight = await page.evaluate(
				() => document.documentElement.scrollHeight
			);
			discoveries++;
			log(
				`[end-scroll] growth #${discoveries}: height -> ${lastHeight}px (iter ${
					i + 1
				})`
			);
		} catch {
			const { y, ih, h } = await page.evaluate(() => ({
				y: window.scrollY,
				ih: window.innerHeight,
				h: document.documentElement.scrollHeight,
			}));
			log(
				`[end-scroll] no growth after ${i + 1} iters (pos ${
					y + ih
				}/${h})`
			);
			break;
		}
	}

	await new Promise((resolve) => setTimeout(resolve, 600));
	const finalHeight = await page.evaluate(
		() => document.documentElement.scrollHeight
	);
	log(
		`[end-scroll] done: final height=${finalHeight}px, discoveries=${discoveries}`
	);

	// Normalize anchors to absolute hrefs
	await page.$$eval("a[href]", (as) => {
		for (const a of as as unknown as HTMLAnchorElement[]) {
			a.setAttribute("href", (a as any).href);
		}
	});

	const selector = options.loadMore || "";
	const maxClicks =
		typeof options.maxClicks === "number" ? options.maxClicks : 30;
	const waitAfterClickMs = 5000;

	log(
		`[render-fetch] load-more: selector="${selector}" maxClicks=${maxClicks}`
	);
	if (selector && maxClicks > 0) {
		let clicks = 0;
		for (; clicks < maxClicks; clicks++) {
			const before = await page.evaluate(
				() => document.documentElement.scrollHeight
			);

			try {
				const ok = await page.$eval(selector, (el: Element) => {
					const anyEl = el as any;
					const style = window.getComputedStyle(el as HTMLElement);
					const visible =
						style &&
						style.visibility !== "hidden" &&
						style.display !== "none" &&
						(el as HTMLElement).offsetParent !== null;
					const enabled = !(anyEl.disabled === true);
					return visible && enabled;
				});
				if (!ok) {
					log(
						"[load-more] selector found but not visible/enabled; stopping"
					);
					break;
				}

				// Scroll until button is in viewport
				await page.evaluate((sel) => {
					const el = document.querySelector(sel);
					if (el) {
						el.scrollIntoView({
							behavior: "smooth",
							block: "center",
						});
					}
				}, selector);

				await new Promise((resolve) => setTimeout(resolve, 500));

				await page.click(selector, { delay: 20 });
				await new Promise((resolve) => setTimeout(resolve, 2000));
				log(
					`[load-more] click #${
						clicks + 1
					} using selector "${selector}"`
				);
			} catch (err) {
				log(`[load-more] selector not found or not clickable: ${err}`);
				break;
			}

			try {
				await page.waitForFunction(
					`document.documentElement.scrollHeight > ${before}`,
					{ timeout: waitAfterClickMs }
				);
				const after = await page.evaluate(
					() => document.documentElement.scrollHeight
				);
				log(
					`[load-more] growth detected: height ${before} -> ${after}`
				);
				// // nudge viewport to bottom to help lazy load
				// await page.keyboard.press("End");
			} catch {
				log("[load-more] no growth after click; stopping");
				break;
			}
		}
		log(`[load-more] done: total clicks=${clicks}`);
	}

	log(`[render-fetch] getting page content...`);
	const html = await page.content();

	log(`[render-fetch] closing browser...`);
	await browser.close();
	log(`[render-fetch] formatting HTML...`);
	const formatted = await formatHtml(html);
	log(`[render-fetch] COMPLETE (${formatted.length} bytes)`);
	return formatted;
}

export async function renderFetchToFile(
	url: string,
	outPath: string,
	options: RenderOptions = {}
): Promise<string> {
	const html = await renderFetch(url, options);
	const absPath = path.isAbsolute(outPath)
		? outPath
		: path.resolve(process.cwd(), outPath);
	await fs.mkdir(path.dirname(absPath), { recursive: true });
	await fs.writeFile(absPath, html, "utf8");
	return absPath;
}
