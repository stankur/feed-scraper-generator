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
import { renderFetchToFile } from "./render-fetch.js";
import fs from "node:fs/promises";
import path from "node:path";

type RunArgs = {
	name: string;
	url?: string;
	htmlPath?: string;
	loadMore?: string;
	maxClicks?: number;
};

type RunContext = {
	tools: Set<string>;
	grepPatterns: Set<string>;
};

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
	tag: string
): Promise<SDKResultMessage | null> {
	const q = query({ prompt, options });
	let result: SDKResultMessage | null = null;
	for await (const msg of q as unknown as AsyncGenerator<SDKMessage, void>) {
		switch (msg.type) {
			case "system": {
				const s = msg as SDKSystemMessage;
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
	return result;
}

export async function run({
	name,
	url,
	htmlPath,
	loadMore,
	maxClicks,
}: RunArgs): Promise<void> {
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

	const ctx1: RunContext = { tools: new Set(), grepPatterns: new Set() };
	const opts1 = withHooks(base, name, ctx1);
	const result1 = await streamOnce(firstMsg, opts1, "[T1]");

	const ctx2: RunContext = { tools: new Set(), grepPatterns: new Set() };
	const opts2 = withHooks(base, name, ctx2);
	const result2 = await streamOnce(
		secondMsg,
		{ ...opts2, continue: true },
		"[T2]"
	);

	// Write cost.json
	const costData = {
		first: {
			cost_usd: result1?.total_cost_usd ?? 0,
			turns: result1?.num_turns ?? 0,
			tools: Array.from(ctx1.tools).sort(),
			grep_patterns: Array.from(ctx1.grepPatterns).sort(),
		},
		second: {
			cost_usd: result2?.total_cost_usd ?? 0,
			turns: result2?.num_turns ?? 0,
			tools: Array.from(ctx2.tools).sort(),
			grep_patterns: Array.from(ctx2.grepPatterns).sort(),
		},
	};

	const costPath = path.join(`${name}_scraper`, "cost.json");
	await fs.mkdir(path.dirname(costPath), { recursive: true });
	await fs.writeFile(costPath, JSON.stringify(costData, null, 2), "utf8");
	console.log(`[cost] wrote ${costPath}`);
}
