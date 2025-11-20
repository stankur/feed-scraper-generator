import { run } from './rf.js';

const [, , name, flagOrUrl, maybePath, ...rest] = process.argv;

async function main(): Promise<void> {
	if (!name) {
		console.error(
			'Usage:\n  tsx rf-cli.ts <name> <url> [--load-more "<selector>"] [--max-clicks N]\n  tsx rf-cli.ts <name> --html <path>'
		);
		process.exit(1);
	}

	if (flagOrUrl === '--html') {
		const htmlPath = maybePath;
		if (!htmlPath) {
			console.error('Usage: tsx rf-cli.ts <name> --html <path>');
			process.exit(1);
		}
		await run({ name, htmlPath });
		return;
	}

	if (!flagOrUrl) {
		console.error('Usage: tsx rf-cli.ts <name> <url> [--load-more "<selector>"] [--max-clicks N]');
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

	await run({ name, url: flagOrUrl, loadMore, maxClicks });
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});





