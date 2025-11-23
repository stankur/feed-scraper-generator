import { run } from "./agent-core";
import fs from "node:fs/promises";
import path from "node:path";

type Job = {
	name: string;
	url: string;
	loadMore?: string;
	maxClicks?: number;
};

type JobResult = {
	name: string;
	success: boolean;
	cost: number;
	duration: number;
	error?: string;
};

async function runBatch(jobs: Job[], concurrency: number): Promise<void> {
	const results: JobResult[] = [];
	let completed = 0;

	// Run in batches with concurrency limit
	for (let i = 0; i < jobs.length; i += concurrency) {
		const batch = jobs.slice(i, i + concurrency);

		const promises = batch.map(async (job) => {
			const logPath = path.join(`${job.name}_scraper`, "run.log");

			console.log(
				`[${completed + 1}/${jobs.length}] 🚀 Starting ${job.name}...`
			);

			try {
				const result = await run({
					...job,
					logFile: logPath,
				});

				completed++;
				console.log(
					`[${completed}/${jobs.length}] ✅ ${job.name} ` +
						`(cost: $${result.cost.toFixed(4)}, ` +
						`time: ${(result.duration / 1000).toFixed(1)}s)`
				);

				return { ...result, error: undefined };
			} catch (err: any) {
				completed++;
				console.error(
					`[${completed}/${jobs.length}] ❌ ${job.name} failed: ${err.message}`
				);
				return {
					name: job.name,
					success: false,
					cost: 0,
					duration: 0,
					error: err.message,
				};
			}
		});

		const batchResults = await Promise.all(promises);
		results.push(...batchResults);
	}

	// Summary
	const successful = results.filter((r) => r.success).length;
	const failed = results.length - successful;
	const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
	const totalTime = results.reduce((sum, r) => sum + (r.duration || 0), 0);

	console.log("\n" + "=".repeat(50));
	console.log(`✓ Batch complete: ${successful} succeeded, ${failed} failed`);
	console.log(`💰 Total cost: $${totalCost.toFixed(4)}`);
	console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s`);
	console.log("=".repeat(50));

	if (failed > 0) {
		console.log("\nFailed jobs:");
		results
			.filter((r) => !r.success)
			.forEach((r) => {
				console.log(`  - ${r.name}: ${r.error}`);
			});
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const configPath = args[0];
	const concurrencyIndex = args.indexOf("--concurrency");
	const concurrency =
		concurrencyIndex >= 0
			? parseInt(args[concurrencyIndex + 1], 10) || 3
			: 3;

	if (!configPath) {
		console.error(
			"Usage: tsx agent-batch.ts <jobs.json> [--concurrency N]"
		);
		process.exit(1);
	}

	const jobs: Job[] = JSON.parse(await fs.readFile(configPath, "utf8"));

	if (!Array.isArray(jobs) || jobs.length === 0) {
		console.error("jobs.json must contain a non-empty array");
		process.exit(1);
	}

	console.log(
		`Starting batch with ${jobs.length} jobs (concurrency: ${concurrency})\n`
	);
	await runBatch(jobs, concurrency);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
