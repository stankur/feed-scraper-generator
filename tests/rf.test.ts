import { describe, it, expect } from "vitest";
import {
	isPreToolUseHookInput,
	isPostToolUseHookInput,
	validateWritePath,
} from "../rf.js";
import type {
	PreToolUseHookInput,
	PostToolUseHookInput,
	HookInput,
} from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";

describe("Hook Type Guards", () => {
	it("should identify PreToolUseHookInput", () => {
		const input: HookInput = {
			hook_event_name: "PreToolUse",
			session_id: "test",
			transcript_path: "test",
			cwd: "/test",
			tool_name: "Write",
			tool_input: { file_path: "test.txt" },
		};

		expect(isPreToolUseHookInput(input)).toBe(true);
		if (isPreToolUseHookInput(input)) {
			// TypeScript should know input.tool_name exists
			expect(input.tool_name).toBe("Write");
			expect(input.tool_input).toBeDefined();
		}
	});

	it("should identify PostToolUseHookInput", () => {
		const input: HookInput = {
			hook_event_name: "PostToolUse",
			session_id: "test",
			transcript_path: "test",
			cwd: "/test",
			tool_name: "Write",
			tool_input: {},
			tool_response: { file_path: "test.txt", bytes_written: 100 },
		};

		expect(isPostToolUseHookInput(input)).toBe(true);
		if (isPostToolUseHookInput(input)) {
			expect(input.tool_response).toBeDefined();
			expect(input.tool_name).toBe("Write");
		}
	});

	it("should reject wrong hook type", () => {
		const preInput: HookInput = {
			hook_event_name: "PreToolUse",
			session_id: "test",
			transcript_path: "test",
			cwd: "/test",
			tool_name: "Write",
			tool_input: {},
		};

		expect(isPostToolUseHookInput(preInput)).toBe(false);
		expect(isPreToolUseHookInput(preInput)).toBe(true);
	});
});

describe("validateWritePath", () => {
	const scraperName = "test";

	it("should allow writes inside scraper directory", () => {
		const filePath = path.join(`${scraperName}_scraper`, "file.txt");
		expect(() => validateWritePath(filePath, scraperName)).not.toThrow();
	});

	it("should allow writes in scraper subdirectories", () => {
		const filePath = path.join(
			`${scraperName}_scraper`,
			"subdir",
			"file.txt"
		);
		expect(() => validateWritePath(filePath, scraperName)).not.toThrow();
	});

	it("should allow exact match to scraper root", () => {
		const filePath = `${scraperName}_scraper`;
		expect(() => validateWritePath(filePath, scraperName)).not.toThrow();
	});

	it("should block writes to root directory", () => {
		const filePath = "file.txt";
		expect(() => validateWritePath(filePath, scraperName)).toThrow(
			/Write\/Edit blocked/
		);
	});

	it("should block writes outside scraper directory", () => {
		const filePath = "../file.txt";
		expect(() => validateWritePath(filePath, scraperName)).toThrow(
			/Write\/Edit blocked/
		);
	});

	it("should block writes to sibling directories", () => {
		const filePath = path.join("other_scraper", "file.txt");
		expect(() => validateWritePath(filePath, scraperName)).toThrow(
			/Write\/Edit blocked/
		);
	});

	it("should block absolute paths outside scraper", () => {
		const filePath = "/tmp/file.txt";
		expect(() => validateWritePath(filePath, scraperName)).toThrow(
			/Write\/Edit blocked/
		);
	});
});



