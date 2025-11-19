import { run } from './rf.js';
import fs from 'node:fs/promises';
import pLimit from 'p-limit';

type Job = {
	name: string;
	url: string;
	loadMore?: string;
	maxClicks?: number;
};

async function main(): Promise<void> {
	const [, , configPath] = process.argv;
	if (!configPath) {
		console.error('Usage: tsx rf-batch.ts <jobs.json>');
		process.exit(1);
	}

	const jobs: Job[] = JSON.parse(await fs.readFile(configPath, 'utf8'));

	if (!Array.isArray(jobs) || jobs.length === 0) {
		console.error('jobs.json must contain a non-empty array');
		process.exit(1);
	}

	const limit = pLimit(2); // max 2 concurrent

	await Promise.all(
		jobs.map((job) =>
			limit(async () => {
				console.log(`\n=== Starting ${job.name} ===`);
				await run(job);
				console.log(`\n=== Completed ${job.name} ===`);
			})
		)
	);

	console.log('\n✓ All jobs completed');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

