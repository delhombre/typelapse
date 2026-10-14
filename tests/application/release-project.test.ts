import { MAX_DIFF_STEPS, cutNotice } from "@/application/diff";
import { chapterSnapshots } from "@/application/diff/chapters";
import { diffToSnapshots } from "@/application/diff/diff-to-snapshots";
import {
	RELEASE_CARD_MS,
	releaseCardText,
	releaseProject,
	releaseWalkthrough,
	withReleaseCard,
} from "@/application/import/release-project";
import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import { captionFromGeneratedLabel } from "@/domain/entities/step";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { describe, expect, it } from "vitest";
import { manyHunks } from "../support/many-hunks";

/**
 * A release becomes a changelog video: its title on a blank scene, then one
 * chapter per commit, exactly as a multi-commit pull request plays. The CLI
 * builds that project without a studio, so the studio's own import is the
 * reference it is held to.
 */

const nl = (lines: string[]) => lines.join("\n");

function editDiff(path: string, from: string, to: string): string {
	return nl([
		`diff --git a/${path} b/${path}`,
		`--- a/${path}`,
		`+++ b/${path}`,
		"@@ -1,3 +1,3 @@",
		" const head = 0;",
		`-${from}`,
		`+${to}`,
		" const tail = 9;",
	]);
}

const CHAPTERS = [
	{ title: "Trim the name", diffText: editDiff("src/greet.ts", "const a = 1;", "const a = 2;") },
	{ title: "Greet loudly", diffText: editDiff("src/greet.ts", "const b = 1;", "const b = 3;") },
];

describe("releaseCardText", () => {
	it("takes the release title and a short opening paragraph", () => {
		expect(
			releaseCardText({
				name: "Faster imports",
				tag: "v1.2.0",
				body: "Imports are twice as fast.\r\n\r\n## What's Changed\r\n* one by @a",
			}),
		).toEqual({ title: "Faster imports", subtitle: "Imports are twice as fast." });
	});

	it("falls back to the tag when the release has no title, or there is no release", () => {
		expect(releaseCardText({ name: "  ", tag: "v1.2.0", body: "" })).toEqual({ title: "v1.2.0" });
		expect(releaseCardText({ tag: "v1.2.0" })).toEqual({ title: "v1.2.0" });
	});

	it("leaves out an opening paragraph of 140 characters or more", () => {
		const long = "a".repeat(140);
		expect(releaseCardText({ name: "R", tag: "v1", body: long }).subtitle).toBeUndefined();
		expect(releaseCardText({ name: "R", tag: "v1", body: "a".repeat(139) }).subtitle).toBe(
			"a".repeat(139),
		);
	});

	it("leaves out a body that opens on a heading, a list or a link, which is not a sentence", () => {
		for (const body of [
			"## What's Changed\n* fix by @a",
			"* fix the parser",
			"- fix the parser",
			"**Full Changelog**: https://github.com/o/r/compare/v1...v2",
			"<!-- notes -->",
		]) {
			expect(releaseCardText({ name: "R", tag: "v1", body }).subtitle, body).toBeUndefined();
		}
	});

	it("reads the paragraph as text, not markdown", () => {
		expect(
			releaseCardText({
				name: "R",
				tag: "v1",
				body: "The **new** `slugify` options,\nsee [the docs](./docs).",
			}).subtitle,
		).toBe("The new slugify options, see the docs.");
	});
});

describe("releaseProject", () => {
	it("opens on a blank card step, then plays the chapters as a pull request does", () => {
		const project = releaseProject({ title: "Faster imports" }, CHAPTERS);
		const snapshots = chapterSnapshots(CHAPTERS);

		expect(project.title).toBe("Faster imports");
		expect(project.steps[0]).toEqual({ code: "", duration: RELEASE_CARD_MS });
		expect(project.steps.slice(1).map((step) => step.code)).toEqual(
			snapshots.map((snapshot) => snapshot.code),
		);
		expect(project.steps.slice(1).map((step) => step.caption)).toEqual(
			snapshots.map((snapshot) => captionFromGeneratedLabel(snapshot.label)),
		);
		expect(project.steps[1]?.caption).toBe("1/2 · Trim the name");
		expect(project.code).toBe(snapshots[0]?.code);
	});

	it("is the project a fresh studio holds after importing the same release", () => {
		useSnippetStore
			.getState()
			.importChapters(CHAPTERS, { title: "Faster imports", openingCardMs: RELEASE_CARD_MS });

		expect(releaseProject({ title: "Faster imports" }, CHAPTERS)).toEqual(
			useSnippetStore.getState().toProjectPayload(),
		);
	});

	it("plays an untitled chapter as one change, its frames keeping their own captions", () => {
		const whole = editDiff("src/greet.ts", "const a = 1;", "const a = 2;");
		const project = releaseProject({ title: "Faster imports" }, [{ title: "", diffText: whole }]);
		const snapshots = diffToSnapshots(whole).snapshots;

		expect(project.steps[0]).toEqual({ code: "", duration: RELEASE_CARD_MS });
		expect(project.steps.slice(1).map((step) => step.caption)).toEqual(
			snapshots.map((snapshot) => captionFromGeneratedLabel(snapshot.label)),
		);
		expect(project.steps.some((step) => step.caption?.startsWith("1/1"))).toBe(false);
	});

	it("refuses commits that carry nothing to animate", () => {
		const lockOnly = nl([
			"--- a/pnpm-lock.yaml",
			"+++ b/pnpm-lock.yaml",
			"@@ -1 +1 @@",
			"-lockfileVersion: '6.0'",
			"+lockfileVersion: '9.0'",
		]);
		expect(() => releaseProject({ title: "R" }, [{ title: "deps", diffText: lockOnly }])).toThrow(
			"These commits contain no changes to animate",
		);
	});
});

describe("withReleaseCard", () => {
	it("puts the title, and the short paragraph under it, on the blank first scene only", () => {
		const card = { title: "Faster imports", subtitle: "Imports are twice as fast." };
		const document = withReleaseCard(migrateV1ToV2(releaseProject(card, CHAPTERS)), card);
		const [first, ...rest] = document.project.scenes;

		const texts = first?.blocks.map((block) => (block.kind === "text" ? block.text : block.kind));
		expect(texts).toEqual(["Faster imports", "Imports are twice as fast."]);
		expect(rest.every((scene) => scene.blocks.every((block) => block.kind === "code"))).toBe(true);
	});

	it("writes the title alone when there is no paragraph", () => {
		const card = { title: "v1.2.0" };
		const document = withReleaseCard(migrateV1ToV2(releaseProject(card, CHAPTERS)), card);

		expect(document.project.scenes[0]?.blocks).toHaveLength(1);
		expect(document.project.scenes[0]?.blocks[0]).toMatchObject({ kind: "text", text: "v1.2.0" });
	});
});

describe("a release past the step cap", () => {
	/** Two commits of 45 hunks each: the first alone is past the cap. */
	const BIG = [
		{ title: "Trim the name", diffText: manyHunks("one.ts", 45) },
		{ title: "Greet loudly", diffText: manyHunks("two.ts", 45) },
	];

	it("counts its title card in the budget", () => {
		const project = releaseProject({ title: "Faster imports" }, BIG);

		expect(project.steps).toHaveLength(MAX_DIFF_STEPS);
		expect(project.steps[0]?.code).toBe("");
	});

	it("is the project the studio holds after importing the same chapters", () => {
		useSnippetStore.getState().importChapters(BIG, {
			title: "Faster imports",
			openingCardMs: RELEASE_CARD_MS,
		});

		expect(releaseProject({ title: "Faster imports" }, BIG)).toEqual(
			useSnippetStore.getState().toProjectPayload(),
		);
	});

	it("says what it cut, in scenes, since the first commit is itself cut", () => {
		const { cut } = releaseWalkthrough({ title: "Faster imports" }, BIG);

		expect(cutNotice(cut)).toBe("Showing the first 15 of 95 scenes");
	});
});
