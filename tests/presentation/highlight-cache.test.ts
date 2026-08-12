import {
	clearHighlightCache,
	highlightCacheKey,
	highlightOnce,
	readHighlight,
} from "@/presentation/landing/highlight-cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
	clearHighlightCache();
});

describe("highlightCacheKey", () => {
	it("separates theme, language and code", () => {
		expect(highlightCacheKey("dracula", "typescript", "a()")).toBe("dracula:typescript:a()");
	});

	it("gives a different key to every input that changes the output", () => {
		const keys = new Set([
			highlightCacheKey("dracula", "typescript", "a()"),
			highlightCacheKey("nord", "typescript", "a()"),
			highlightCacheKey("dracula", "tsx", "a()"),
			highlightCacheKey("dracula", "typescript", "b()"),
		]);
		expect(keys.size).toBe(4);
	});
});

describe("highlightOnce", () => {
	it("reports a cold cache before anything is highlighted", () => {
		expect(readHighlight("dracula:typescript:a()")).toBeUndefined();
	});

	it("highlights once and serves every later caller from the cache", async () => {
		const load = vi.fn().mockResolvedValue("<pre>a()</pre>");

		await expect(highlightOnce("k", load)).resolves.toBe("<pre>a()</pre>");
		await expect(highlightOnce("k", load)).resolves.toBe("<pre>a()</pre>");

		expect(load).toHaveBeenCalledTimes(1);
		expect(readHighlight("k")).toBe("<pre>a()</pre>");
	});

	it("shares one in-flight highlight between simultaneous callers", async () => {
		const load = vi.fn().mockResolvedValue("<pre>a()</pre>");

		const both = await Promise.all([highlightOnce("k", load), highlightOnce("k", load)]);

		expect(both).toEqual(["<pre>a()</pre>", "<pre>a()</pre>"]);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it("keeps separate entries per key", async () => {
		await highlightOnce("a", () => Promise.resolve("A"));
		await highlightOnce("b", () => Promise.resolve("B"));

		expect(readHighlight("a")).toBe("A");
		expect(readHighlight("b")).toBe("B");
	});

	it("caches nothing when the highlight fails, so a later mount can retry", async () => {
		const failing = vi.fn().mockRejectedValue(new Error("no grammar"));

		await expect(highlightOnce("k", failing)).rejects.toThrow("no grammar");
		expect(readHighlight("k")).toBeUndefined();

		await expect(highlightOnce("k", () => Promise.resolve("<pre/>"))).resolves.toBe("<pre/>");
		expect(failing).toHaveBeenCalledTimes(1);
	});
});
