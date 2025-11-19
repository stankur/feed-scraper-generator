import fs from "node:fs/promises";
import path from "node:path";

type ParsedArgs = {
	name: string;
	maxPages: number;
	stdout: boolean;
	output: string;
};

function parseArgs(argv: string[]): ParsedArgs {
	const args = argv.slice(2);
	const name = args[0];
	const get = (k: string, d: string): string => {
		const i = args.indexOf(k);
		return i >= 0 ? (args[i + 1] as string) : d;
	};
	const has = (k: string): boolean => args.includes(k);
	if (!name) {
		console.error(
			"Usage: tsx rf-scrape.ts <name> [--max-pages N] [--stdout | --output <path>]"
		);
		process.exit(1);
	}
	const maxPages = parseInt(get("--max-pages", "1"), 10);
	const stdout = has("--stdout");
	const output = get("--output", "");
	if (!stdout && !output) {
		console.error("Choose one: --stdout or --output <path>");
		process.exit(1);
	}
	return { name, maxPages, stdout, output };
}

function allowedOutputFor(name: string, outPath: string): string {
	const abs = path.resolve(outPath);
	const allowed = path.resolve(`${name}_scraper`, `${name}.json`);
	if (abs !== allowed) {
		throw new Error(`Write blocked: ${abs}. Only allowed: ${allowed}`);
	}
	return abs;
}

async function main(): Promise<void> {
	const { name, maxPages, stdout, output } = parseArgs(process.argv);

	const modPath = `./${name}_scraper/scraper.ts`;
	let mod: any;
	try {
		mod = await import(modPath);
	} catch (e: any) {
		console.error(`Failed to load ${modPath}: ${e?.message || e}`);
		process.exit(1);
	}

	if (typeof mod.scrape !== "function") {
		console.error(
			`${modPath} must export async function scrape({ maxPages })`
		);
		process.exit(1);
	}

	const items = await mod.scrape({ maxPages });

	// minimal validation
	if (!Array.isArray(items)) throw new Error("Output is not an array");
	let nullDates = 0;
	for (let i = 0; i < items.length; i++) {
		const it = items[i] as any;
		if (!it?.title || !it?.url) {
			throw new Error(
				`Item #${i} missing title or url: ${JSON.stringify(it)}`
			);
		}
		if (!it?.date) nullDates++;
	}
	if (nullDates > 0) {
		console.warn(
			`Warning: ${nullDates}/${items.length} items have null dates`
		);
	}

	const json = JSON.stringify(items, null, 2);
	if (stdout) {
		process.stdout.write(json + "\n");
	} else {
		const abs = allowedOutputFor(name, output);
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.writeFile(abs, json, "utf8");
		console.error(`wrote ${abs}`);
	}
}

main().catch((err: any) => {
	console.error(err?.stack || err);
	process.exit(1);
});
