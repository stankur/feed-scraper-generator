import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
	Options,
	SDKAssistantMessage,
	SDKMessage,
	SDKPartialAssistantMessage,
	SDKResultMessage,
	SDKSystemMessage,
	HookInput,
	PreToolUseHookInput,
	PostToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import { renderFetchToFile } from "./render-fetch";
import fs from "node:fs/promises";
import path from "node:path";
import { startLogCapture } from "./log-capture";

type RunArgs = {
	name: string;
	url?: string;
	htmlPath?: string;
	loadMore?: string;
	maxClicks?: number;
	logFile?: string;
};

type RunResult = {
	name: string;
	success: boolean;
	cost: number;
	duration: number;
};

type RunContext = {
	tools: Set<string>;
	grepPatterns: Set<string>;
};

const COST_LIMIT_USD = 2.5;

function calculateCostFromUsage(usage: any): number {
	const input = (usage.input_tokens || 0) * 0.000003;
	const output = (usage.output_tokens || 0) * 0.000015;
	const cacheRead = (usage.cache_read_input_tokens || 0) * 0.0000003;
	const cacheCreate = (usage.cache_creation_input_tokens || 0) * 0.000003;
	return input + output + cacheRead + cacheCreate;
}

async function extractPrompts(): Promise<{ first: string; second: string }> {
	const first = await fs.readFile(path.resolve("prompts/first.md"), "utf8");
	const second = await fs.readFile(path.resolve("prompts/second.md"), "utf8");
	return { first: first.trim(), second: second.trim() };
}

function printAssistant(tag: string, m: SDKAssistantMessage): void {
	const content = (m.message?.content ?? [])
		.map((c: any) => (c.type === "text" ? c.text : ""))
		.join("");
	if (content) process.stdout.write(`${tag} ${content}\n`);
}

function printPartial(tag: string, m: SDKPartialAssistantMessage): void {
	const ev: any = m.event;
	if (
		ev?.type === "content_block_delta" &&
		ev?.delta?.type === "text_delta" &&
		typeof ev?.delta?.text === "string"
	) {
		process.stdout.write(ev.delta.text);
	} else if (ev?.type === "message_stop") {
		process.stdout.write("\n");
	}
}

// Type guards
export function isPreToolUseHookInput(
	input: HookInput
): input is PreToolUseHookInput {
	return input.hook_event_name === "PreToolUse";
}

export function isPostToolUseHookInput(
	input: HookInput
): input is PostToolUseHookInput {
	return input.hook_event_name === "PostToolUse";
}

// Path validation for write blocking
export function validateWritePath(filePath: string, scraperName: string): void {
	const abs = path.resolve(filePath);
	const scraperRoot = path.resolve(process.cwd(), `${scraperName}_scraper`);
	const allowed =
		abs === scraperRoot || abs.startsWith(scraperRoot + path.sep);
	if (!allowed) {
		throw new Error(
			`Write/Edit blocked: ${abs}. Allowed only under ${scraperRoot}`
		);
	}
}

function withHooks(base: Options, name: string, ctx: RunContext): Options {
	return {
		...base,
		hooks: {
			PreToolUse: [
				{
					hooks: [
						async (input) => {
							if (!isPreToolUseHookInput(input)) {
								return {};
							}
							const tool = input.tool_name;
							const tin = input.tool_input as any;
							ctx.tools.add(tool);
							// Enforce edit/write restrictions: only allow edits/writes inside <name>_scraper/**
							if (tool === "Write" || tool === "Edit") {
								const filePath = String(tin.file_path || "");
								validateWritePath(filePath, name);
							}
							if (tool === "Grep") {
								if (tin.pattern)
									ctx.grepPatterns.add(tin.pattern);
								console.log(
									`[tool][Grep] pattern=${tin.pattern} path=${
										tin.path ?? "."
									} mode=${tin.output_mode ?? "content"}`
								);
							} else if (tool === "Bash") {
								console.log(`[tool][Bash] $ ${tin.command}`);
							} else if (tool === "Write") {
								console.log(
									`[tool][Write] -> ${tin.file_path} (${
										String(tin.content ?? "").length
									} bytes)`
								);
							} else if (tool === "Read") {
								console.log(`[tool][Read] <- ${tin.file_path}`);
							} else if (tool === "Edit") {
								console.log(`[tool][Edit] ${tin.file_path}`);
							}
							return {};
						},
					],
				},
			],
			PostToolUse: [
				{
					hooks: [
						async (input) => {
							if (!isPostToolUseHookInput(input)) {
								return {};
							}
							const tool = input.tool_name;
							const tout = input.tool_response as any;
							if (tool === "Bash") {
								const out = tout?.output ?? "";
								if (out) process.stdout.write(out);
							} else if (tool === "Grep") {
								console.log(
									`[tool][Grep][out] ${JSON.stringify(tout)}`
								);
							} else if (tool === "Write") {
								console.log(
									`[tool][Write][done] ${tout?.file_path} (${tout?.bytes_written} bytes)`
								);
							}
							return {};
						},
					],
				},
			],
		},
	};
}

async function streamOnce(
	prompt: string,
	options: Options,
	tag: string,
	costLimit: number,
	runningCost: { value: number }
): Promise<{
	result: SDKResultMessage | null;
	sessionId: string | undefined;
	aborted: boolean;
}> {
	const processedMessageIds = new Set<string>();
	const abortController = new AbortController();
	let turnCost = 0;

	const opts = { ...options, abortController };
	const q = query({ prompt, options: opts });
	let result: SDKResultMessage | null = null;
	let sessionId: string | undefined;

	for await (const msg of q as unknown as AsyncGenerator<SDKMessage, void>) {
		if (msg.type === "assistant") {
			const assistantMsg = msg as any;
			const messageId = assistantMsg.message?.id;

			// Only count each message.id once (avoid duplicates - multiple messages share same id)
			if (
				messageId &&
				!processedMessageIds.has(messageId) &&
				assistantMsg.message?.usage
			) {
				processedMessageIds.add(messageId);
				const stepCost = calculateCostFromUsage(
					assistantMsg.message.usage
				);
				turnCost += stepCost;
				runningCost.value += stepCost;

				console.log(
					`${tag} [cost] step=$${stepCost.toFixed(
						4
					)} turn=$${turnCost.toFixed(
						4
					)} total=$${runningCost.value.toFixed(4)}`
				);

				if (runningCost.value > costLimit) {
					console.log(
						`${tag} [ABORT] Cost $${runningCost.value.toFixed(
							4
						)} exceeds limit $${costLimit}`
					);
					abortController.abort();
					return { result: null, sessionId, aborted: true };
				}
			}
		}

		switch (msg.type) {
			case "system": {
				const s = msg as SDKSystemMessage;
				const sysMsg = s as any;
				if (sysMsg.session_id) {
					sessionId = sysMsg.session_id;
					console.log(`${tag} [session] ${sessionId}`);
				}
				console.log(
					`${tag} [system] tools=${(s.tools || []).join(
						", "
					)} model=${s.model} cwd=${s.cwd}`
				);
				break;
			}
			case "stream_event":
				printPartial(tag, msg as any);
				break;
			case "assistant":
				printAssistant(tag, msg as any);
				break;
			case "result": {
				const r = msg as SDKResultMessage;
				result = r;
				console.log(
					`\n${tag} [result] turns=${r.num_turns} cost=$${(
						r.total_cost_usd ?? 0
					).toFixed(4)} ok=${!r.is_error}`
				);
				break;
			}
			default:
				break;
		}
	}
	return { result, sessionId, aborted: false };
}

export async function run(args: RunArgs): Promise<RunResult> {
	// If logFile is provided, wrap execution in log capture
	if (args.logFile) {
		return await startLogCapture(args.logFile, () => runImpl(args));
	}
	return await runImpl(args);
}

async function runImpl({
	name,
	url,
	htmlPath,
	loadMore,
	maxClicks,
}: RunArgs): Promise<RunResult> {
	const setupStart = performance.now();

	const defaultOut = path.join("outputs", "html", `${name}.html`);
	const html = htmlPath ?? defaultOut;
	if (!htmlPath && url) {
		await renderFetchToFile(url, html, {
			loadMore,
			maxClicks,
		});
		console.log(`[fetch] ${url} -> ${html}`);
	}

	const { first, second } = await extractPrompts();
	const firstMsg = `${first}\n\nThis is the file: ${html}`;
	const secondMsg = second;

	const base: Options = {
		cwd: process.cwd(),
		systemPrompt: { type: "preset", preset: "claude_code" },
		includePartialMessages: true,
		permissionMode: "bypassPermissions",
	};

	const runningCost = { value: 0 };

	const setupDuration = performance.now() - setupStart;
	const cycle1Start = performance.now();

	const ctx1: RunContext = { tools: new Set(), grepPatterns: new Set() };
	const opts1 = withHooks(base, name, ctx1);
	const {
		result: result1,
		sessionId,
		aborted: aborted1,
	} = await streamOnce(firstMsg, opts1, "[T1]", COST_LIMIT_USD, runningCost);

	const cycle1Duration = performance.now() - cycle1Start;

	if (aborted1) {
		console.log(
			`[run] ❌ Aborted in T1 at cost $${runningCost.value.toFixed(4)}`
		);
		return {
			name,
			success: false,
			cost: runningCost.value,
			duration: cycle1Duration,
		};
	}

	if (!sessionId) {
		throw new Error("Failed to get session ID from first turn");
	}

	const ctx2: RunContext = { tools: new Set(), grepPatterns: new Set() };
	const opts2 = withHooks(base, name, ctx2);
	const cycle2Start = performance.now();
	const { result: result2, aborted: aborted2 } = await streamOnce(
		secondMsg,
		{ ...opts2, resume: sessionId },
		"[T2]",
		COST_LIMIT_USD,
		runningCost
	);

	const cycle2Duration = performance.now() - cycle2Start;

	if (aborted2) {
		console.log(
			`[run] ❌ Aborted in T2 at cost $${runningCost.value.toFixed(4)}`
		);
		return {
			name,
			success: false,
			cost: runningCost.value,
			duration: cycle1Duration + cycle2Duration,
		};
	}

	// Write run.json
	const cost1 = result1?.total_cost_usd ?? 0;
	const cost2 = result2?.total_cost_usd ?? 0;
	const runData = {
		total_cost_usd: cost1 + cost2,
		total_duration_s: (cycle1Duration + cycle2Duration) / 1000,
		setup_duration_s: setupDuration / 1000,
		first: {
			cost_usd: cost1,
			duration_s: cycle1Duration / 1000,
			turns: result1?.num_turns ?? 0,
			tools: Array.from(ctx1.tools).sort(),
			grep_patterns: Array.from(ctx1.grepPatterns).sort(),
		},
		second: {
			cost_usd: cost2,
			duration_s: cycle2Duration / 1000,
			turns: result2?.num_turns ?? 0,
			tools: Array.from(ctx2.tools).sort(),
			grep_patterns: Array.from(ctx2.grepPatterns).sort(),
		},
	};

	const runPath = path.join(`${name}_scraper`, "run.json");
	await fs.mkdir(path.dirname(runPath), { recursive: true });
	await fs.writeFile(runPath, JSON.stringify(runData, null, 2), "utf8");
	console.log(`[run] wrote ${runPath}`);

	return {
		name,
		success: true,
		cost: cost1 + cost2,
		duration: cycle1Duration + cycle2Duration,
	};
}
