import { renderFetchToFile } from './render-fetch.js';

const [, , url, outPath, ...rest] = process.argv;

async function main(): Promise<void> {
	if (!url || !outPath) {
		console.error(
			'Usage: tsx fetch-cli.ts <url> <output-path> [--load-more "<selector>"] [--max-clicks N]'
		);
		process.exit(1);
	}

	// Parse optional flags
	const get = (k: string): string | undefined => {
		const i = rest.indexOf(k);
		return i >= 0 ? rest[i + 1] : undefined;
	};
	const loadMore = get('--load-more');
	const maxClicksRaw = get('--max-clicks');
	const maxClicks =
		typeof maxClicksRaw === 'string' ? parseInt(maxClicksRaw, 10) : undefined;

	const saved = await renderFetchToFile(url, outPath, { loadMore, maxClicks });
	console.log(`[fetch] ${url} -> ${saved}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});



