import { run } from './rf.js';

const [, , name, flagOrUrl, maybePath] = process.argv;

async function main(): Promise<void> {
	if (!name) {
		console.error(
			'Usage:\n  ts-node --esm rf-cli.ts <name> <url>\n  ts-node --esm rf-cli.ts <name> --html <path>'
		);
		process.exit(1);
	}

	if (flagOrUrl === '--html') {
		const htmlPath = maybePath;
		if (!htmlPath) {
			console.error('Usage: ts-node --esm rf-cli.ts <name> --html <path>');
			process.exit(1);
		}
		await run({ name, htmlPath });
		return;
	}

	if (!flagOrUrl) {
		console.error('Usage: ts-node --esm rf-cli.ts <name> <url>');
		process.exit(1);
	}

	await run({ name, url: flagOrUrl });
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});



