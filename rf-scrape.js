// rf-scrape.js (ESM)
import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
	const args = argv.slice(2);
	const name = args[0];
	const get = (k, d) => {
		const i = args.indexOf(k);
		return i >= 0 ? args[i + 1] : d;
	};
	const has = (k) => args.includes(k);
	if (!name) {
		console.error(
			'Usage: node rf-scrape.js <name> [--max-pages N] [--stdout | --output <path>]'
		);
		process.exit(1);
	}
	const maxPages = parseInt(get('--max-pages', '1'), 10);
	const stdout = has('--stdout');
	const output = get('--output', '');
	if (!stdout && !output) {
		console.error('Choose one: --stdout or --output <path>');
		process.exit(1);
	}
	return { name, maxPages, stdout, output };
}

function allowedOutputFor(name, outPath) {
	const abs = path.resolve(outPath);
	const allowed = path.resolve(`${name}_scraper`, `${name}.json`);
	if (abs !== allowed) {
		throw new Error(`Write blocked: ${abs}. Only allowed: ${allowed}`);
	}
	return abs;
}

async function main() {
	const { name, maxPages, stdout, output } = parseArgs(process.argv);

	const modPath = `./${name}_scraper/scraper.js`;
	let mod;
	try {
		mod = await import(modPath);
	} catch (e) {
		console.error(`Failed to load ${modPath}: ${e?.message || e}`);
		process.exit(1);
	}

	if (typeof mod.scrape !== 'function') {
		console.error(`${modPath} must export async function scrape({ maxPages })`);
		process.exit(1);
	}

	const items = await mod.scrape({ maxPages });

	// minimal validation
	if (!Array.isArray(items)) throw new Error('Output is not an array');
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		if (!it?.title || !it?.url || !it?.date) {
			throw new Error(`Item #${i} missing fields: ${JSON.stringify(it)}`);
		}
	}

	const json = JSON.stringify(items, null, 2);
	if (stdout) {
		process.stdout.write(json + '\n');
	} else {
		const abs = allowedOutputFor(name, output);
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.writeFile(abs, json, 'utf8');
		console.error(`wrote ${abs}`);
	}
}

main().catch((err) => {
	console.error(err?.stack || err);
	process.exit(1);
});



