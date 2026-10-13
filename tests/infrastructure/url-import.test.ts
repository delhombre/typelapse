import { importCodeFromUrl } from "@/infrastructure/import/url-import";
import { afterEach, describe, expect, it, vi } from "vitest";

const FILE = "https://github.com/honojs/hono/blob/main/src/hono.ts";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("importCodeFromUrl", () => {
	it("says GitHub could not be reached when the network fails, in the importer's own words", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			}),
		);

		await expect(importCodeFromUrl(FILE)).rejects.toThrow(
			"Could not reach GitHub: check your connection, or paste the code instead",
		);
	});
});
