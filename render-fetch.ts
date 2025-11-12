import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import path from "node:path";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeFormat from "rehype-format";
import rehypeStringify from "rehype-stringify";

async function formatHtml(html: string): Promise<string> {
	const file = await unified()
		.use(rehypeParse)
		.use(rehypeFormat)
		.use(rehypeStringify)
		.process(html);
	return String(file);
}

export async function renderFetch(url: string): Promise<string> {
	const browser = await puppeteer.launch({
		headless: true,
	});

	const page = await browser.newPage();
	await page.setUserAgent(
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
	);

	await page.goto(url, {
		waitUntil: "networkidle0",
		timeout: 30000,
	});

	let lastHeight = await page.evaluate(
		() => document.documentElement.scrollHeight
	);
	let discoveries = 0;
	const maxIterations = 60;
	const growthWaitMs = 1500;

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
			console.error(
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
			console.error(
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
	console.error(
		`[end-scroll] done: final height=${finalHeight}px, discoveries=${discoveries}`
	);

	// Normalize anchors to absolute hrefs
	await page.$$eval("a[href]", (as) => {
		for (const a of as as unknown as HTMLAnchorElement[]) {
			a.setAttribute("href", (a as any).href);
		}
	});

	const html = await page.content();

	await browser.close();
	return await formatHtml(html);
}

export async function renderFetchToFile(
	url: string,
	outPath: string
): Promise<string> {
	const html = await renderFetch(url);
	const absPath = path.isAbsolute(outPath)
		? outPath
		: path.resolve(process.cwd(), outPath);
	await fs.mkdir(path.dirname(absPath), { recursive: true });
	await fs.writeFile(absPath, html, "utf8");
	return absPath;
}
