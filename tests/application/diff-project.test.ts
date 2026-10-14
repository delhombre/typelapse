import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_DIFF_STEPS, MAX_SCENE_LINES } from "@/application/diff";
import { projectFromDiff } from "@/application/import/diff-project";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { describe, expect, it } from "vitest";
import { manyHunks as hunksApart } from "../support/many-hunks";

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

describe("a diff past the step cap", () => {
	/** `count` single-line hunks far enough apart to be a step each. */
	const manyHunks = (count: number) => {
		const lines = ["--- a/big.ts", "+++ b/big.ts"];
		for (let k = 0; k < count; k++) {
			const at = 1 + k * 30;
			lines.push(`@@ -${at},1 +${at},1 @@`, `-const v${k} = ${k};`, `+const v${k} = ${k * 10};`);
		}
		return lines.join("\n");
	};

	it("plays its head and ends on a row that says what the video leaves out", () => {
		const { steps } = projectFromDiff(manyHunks(45));

		expect(steps).toHaveLength(MAX_DIFF_STEPS);
		// Nothing in the middle is lost: only the tail, and the last kept step says so.
		const code = steps.at(-1)?.code ?? "";
		expect(code.endsWith("\n⋯ 32 more scenes")).toBe(true);
	});

	it("keeps every frame within a scene's rows, the marker row included", () => {
		// Hunks 3 and 4 lines apart fill each page to its 24 rows, the case where
		// a marker added after the paging would make a 25th.
		for (const gap of [3, 4, 30]) {
			const lines = ["--- a/big.ts", "+++ b/big.ts"];
			for (let k = 0; k < 45; k++) {
				const at = 1 + k * gap;
				lines.push(`@@ -${at},1 +${at},1 @@`, `-const v${k} = ${k};`, `+const v${k} = ${k * 10};`);
			}

			const { steps } = projectFromDiff(lines.join("\n"));

			expect(steps).toHaveLength(MAX_DIFF_STEPS);
			for (const step of steps) {
				expect(step.code.split("\n").length).toBeLessThanOrEqual(MAX_SCENE_LINES);
			}
			expect(steps.at(-1)?.code).toMatch(/\n⋯ \d+ more scenes$/);
		}
	});

	it("draws every kept scene of a uniform diff on the same number of rows, the marker included", () => {
		// The card is sized by its tallest scene: a last scene one row taller makes the
		// card and the progress bar jump at the end of the video (#322).
		for (const gap of [3, 4, 30]) {
			const { steps } = projectFromDiff(hunksApart("big.ts", 45, gap));

			const rowCounts = new Set(steps.map((step) => step.code.split("\n").length));
			expect(rowCounts.size, `gap ${gap}`).toBe(1);
			expect(steps.at(-1)?.code).toMatch(/\n⋯ \d+ more scenes$/);
		}
	});

	it("is the project the studio holds after the same import", () => {
		const diff = manyHunks(45);
		useSnippetStore.getState().importDiff(diff);

		expect(projectFromDiff(diff)).toEqual(useSnippetStore.getState().toProjectPayload());
	});
});

describe("scene breaks in the imported project (#280)", () => {
	const HONO = readFileSync(resolve(__dirname, "../fixtures/hono-pr-5189.diff"), "utf8");

	it("marks each step that opens a page, in the file the CLI renders and the studio saves", () => {
		const project = projectFromDiff(HONO);
		expect(project.steps.map((step) => step.sceneBreak === true)).toEqual([
			false,
			false,
			true,
			false,
			true,
			true,
			false,
		]);
		useSnippetStore.getState().importDiff(HONO);
		expect(project).toEqual(useSnippetStore.getState().toProjectPayload());
	});
});
