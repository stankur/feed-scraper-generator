import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

type UrlsJson = Record<string, {
	urls: string[];
	success: boolean;
	cost: number;
	timestamp: string;
}>;

type Job = {
	name: string;
	url: string;
};

function getScraperDirName(company: string, url: string, totalUrls: number): string {
	const baseName = company.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/\./g, '_')
		.replace(/[()]/g, '');

	if (totalUrls === 1) {
		return `${baseName}_scraper`;
	}

	const urlObj = new URL(url);
	const pathParts = urlObj.pathname.split('/').filter(p => p);
	let pathSlug = pathParts[pathParts.length - 1] || 'main';

	if (urlObj.search) {
		const params = new URLSearchParams(urlObj.search);
		const firstParam = Array.from(params.values())[0];
		if (firstParam) {
			const cleanVal = firstParam.replace(/%20/g, '_').replace(/\s+/g, '_').replace(/-/g, '_');
			pathSlug += `_${cleanVal}`;
		}
	}

	pathSlug = pathSlug.replace(/-/g, '_').replace(/\./g, '_');

	return `${baseName}_${pathSlug}_scraper`;
}

async function loadPendingJobs(urlsJsonPath: string): Promise<{ jobs: Job[], skipped: number }> {
	const data: UrlsJson = JSON.parse(await fs.readFile(urlsJsonPath, 'utf8'));
	
	const jobs: Job[] = [];
	let skipped = 0;

	for (const [company, info] of Object.entries(data)) {
		if (!info.success || !info.urls || info.urls.length === 0) {
			continue;
		}

		for (const url of info.urls) {
			const scraperDir = getScraperDirName(company, url, info.urls.length);

			if (existsSync(scraperDir)) {
				skipped++;
				continue;
			}

			jobs.push({
				name: scraperDir.replace('_scraper', ''),
				url
			});
		}
	}

	return { jobs, skipped };
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (!args.length || args[0] === '-h' || args[0] === '--help') {
		console.log("Usage: npm run agent-from-urls -- <urls.json> [--concurrency N] [--limit N] [--dry-run]");
		process.exit(1);
	}

	const urlsJson = args[0];
	const concurrencyIndex = args.indexOf("--concurrency");
	const concurrency = concurrencyIndex >= 0 ? parseInt(args[concurrencyIndex + 1], 10) || 3 : 3;
	const limitIndex = args.indexOf("--limit");
	const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : Infinity;
	const dryRun = args.includes("--dry-run");

	const { jobs, skipped } = await loadPendingJobs(urlsJson);

	if (skipped > 0) {
		console.log(`Skipping ${skipped} existing scrapers`);
	}

	if (jobs.length === 0) {
		console.log("No new scrapers to create");
		return;
	}

	const totalJobs = jobs.length;
	const jobsToRun = limit < totalJobs ? jobs.slice(0, limit) : jobs;

	if (limit < totalJobs) {
		console.log(`Found ${totalJobs} scrapers, limiting to ${limit}\n`);
	} else {
		console.log(`Found ${totalJobs} scrapers to create\n`);
	}

	if (dryRun) {
		console.log("Jobs that would be created:");
		jobsToRun.forEach(job => console.log(`  - ${job.name}: ${job.url}`));
		return;
	}

	const tempJobs = ".temp_jobs.json";
	await fs.writeFile(tempJobs, JSON.stringify(jobsToRun, null, 2));

	console.log(`Running agent-batch with ${jobsToRun.length} jobs (concurrency: ${concurrency})\n`);

	try {
		execSync(`npm run agent-batch -- ${tempJobs} --concurrency ${concurrency}`, {
			stdio: 'inherit'
		});
	} finally {
		await fs.unlink(tempJobs).catch(() => {});
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

