import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	MAX_DIFF_STEPS,
	capDiffSnapshots,
	projectFromDiff,
} from "@/application/import/diff-project";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { describe, expect, it } from "vitest";

/**
 * The CLI renders a pull request without a studio, so it builds the project the
 * studio would have built. "Would have" is only true while the two agree, so the
 * test asks the studio itself: import the same diff into a fresh store and
 * compare the file it would save.
 */

const DIFF = readFileSync(resolve(__dirname, "../cli/fixtures/greet.diff"), "utf8");

describe("projectFromDiff", () => {
	it("is the project a fresh studio holds after importing the same diff", () => {
		useSnippetStore.getState().importDiff(DIFF);

		expect(projectFromDiff(DIFF)).toEqual(useSnippetStore.getState().toProjectPayload());
	});

	it("takes the pull request's title over the file name, as the studio's PR import does", () => {
		useSnippetStore.getState().importDiff(DIFF);
		useSnippetStore.getState().setTitle("Trim the name before greeting");

		expect(projectFromDiff(DIFF, { title: "Trim the name before greeting" })).toEqual(
			useSnippetStore.getState().toProjectPayload(),
		);
	});

	it("refuses text that is not a usable diff, in the importer's own words", () => {
		expect(() => projectFromDiff("   ")).toThrow("Paste a diff first.");
	});
});

describe("capDiffSnapshots", () => {
	it("keeps the final frame when a diff stages more steps than playback allows", () => {
		const snapshots = Array.from({ length: MAX_DIFF_STEPS + 5 }, (_, index) => ({
			code: `step ${index}`,
			label: "",
		}));

		const capped = capDiffSnapshots(snapshots);

		expect(capped).toHaveLength(MAX_DIFF_STEPS);
		expect(capped.at(-1)?.code).toBe(`step ${MAX_DIFF_STEPS + 4}`);
	});
});
