import { AsyncLocalStorage } from "node:async_hooks";
import { createWriteStream, type WriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const logStorage = new AsyncLocalStorage<WriteStream>();

const originalLog = console.log;
const originalError = console.error;
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

console.log = (...args: any[]) => {
	const stream = logStorage.getStore();
	const msg =
		args
			.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
			.join(" ") + "\n";

	if (stream) {
		stream.write(msg);
	} else {
		originalLog(...args);
	}
};

console.error = (...args: any[]) => {
	const stream = logStorage.getStore();
	const msg =
		args
			.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
			.join(" ") + "\n";

	if (stream) {
		stream.write(msg);
	} else {
		originalError(...args);
	}
};

process.stdout.write = ((
	chunk: any,
	encoding?: any,
	callback?: any
): boolean => {
	const stream = logStorage.getStore();

	if (stream && (typeof chunk === "string" || Buffer.isBuffer(chunk))) {
		if (typeof encoding === "function") {
			callback = encoding;
			encoding = undefined;
		}
		stream.write(chunk, encoding, callback);
		return true;
	}

	return originalStdoutWrite(chunk, encoding, callback);
}) as typeof process.stdout.write;

process.stderr.write = ((
	chunk: any,
	encoding?: any,
	callback?: any
): boolean => {
	const stream = logStorage.getStore();

	if (stream && (typeof chunk === "string" || Buffer.isBuffer(chunk))) {
		if (typeof encoding === "function") {
			callback = encoding;
			encoding = undefined;
		}
		stream.write(chunk, encoding, callback);
		return true;
	}

	return originalStderrWrite(chunk, encoding, callback);
}) as typeof process.stderr.write;

export async function startLogCapture<T>(
	logFilePath: string,
	fn: () => Promise<T>
): Promise<T> {
	await fs.mkdir(path.dirname(logFilePath), { recursive: true });

	const stream = createWriteStream(logFilePath, {
		flags: "w",
		highWaterMark: 16 * 1024,
	});

	try {
		return await logStorage.run(stream, fn);
	} finally {
		stream.end();
	}
}
