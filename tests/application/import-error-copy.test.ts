import { importErrorCopy } from "@/application/import/import-error-copy";
import { importFailureOf } from "@/application/import/import-source";
import { describe, expect, it } from "vitest";

describe("importErrorCopy", () => {
	it.each([
		["PR not found (or the repository is private)", "That pull request"],
		["Commit not found (or the repository is private)", "That commit"],
		["Release not found (or the repository is private)", "That release"],
		["Comparison not found (or the repository is private)", "That comparison"],
	])("adds what to do to %s", (message, subject) => {
		const copy = importErrorCopy(message);
		expect(copy).toBe(
			`${subject} was not found, or its repository is private. Check the link, or paste the diff.`,
		);
		expect(importFailureOf(copy)).toBe("not-found");
		expect(copy).not.toMatch(/[–—]/);
	});

	it("passes every other sentence through unchanged", () => {
		expect(importErrorCopy("Could not fetch the change: paste the diff instead")).toBe(
			"Could not fetch the change: paste the diff instead",
		);
		expect(importErrorCopy("That gist was not found. Check the link, and that it is public.")).toBe(
			"That gist was not found. Check the link, and that it is public.",
		);
	});
});
