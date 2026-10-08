import { codeUrlFailure } from "@/application/import/code-url-failure";
import { importFailureOf } from "@/application/import/import-source";
import { describe, expect, it } from "vitest";

describe("codeUrlFailure", () => {
	it("says a missing gist was not found, and what to check", () => {
		expect(codeUrlFailure(404, "gist-api")).toBe(
			"That gist was not found. Check the link, and that it is public.",
		);
	});

	it("says a missing file was not found, and that a private repository answers the same", () => {
		expect(codeUrlFailure(404, "raw")).toBe(
			"That file was not found. Check the link, and that the repository is public.",
		);
	});

	it("names the rate limit and offers the paste", () => {
		expect(codeUrlFailure(403, "raw")).toContain("rate limit");
		expect(codeUrlFailure(429, "gist-api")).toContain("paste the code");
	});

	it("keeps the status for anything else, with a next step", () => {
		expect(codeUrlFailure(502, "raw")).toBe("Could not fetch (HTTP 502). Try again in a moment.");
	});

	it("is read by the importer's own failure classifier", () => {
		expect(importFailureOf(codeUrlFailure(404, "gist-api"))).toBe("not-found");
		expect(importFailureOf(codeUrlFailure(403, "raw"))).toBe("rate-limit");
	});

	it("never uses a dash in the copy", () => {
		for (const status of [404, 403, 500]) {
			expect(codeUrlFailure(status, "raw")).not.toMatch(/[–—]/);
		}
	});
});
