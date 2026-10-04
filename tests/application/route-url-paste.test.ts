import { routeUrlPaste } from "@/application/import/route-url-paste";
import { describe, expect, it } from "vitest";

/**
 * The URL importer recognises more than it can finish. This is the policy that
 * says which control finishes what: the rule the studio's "Import from URL"
 * popover follows so it never refuses a link it plainly understood.
 */
describe("routeUrlPaste", () => {
	/** The one kind with a question still open: whole change, or by commit. */
	it("hands a pull request to the control that offers the play mode", () => {
		expect(routeUrlPaste("https://github.com/oven-sh/bun/pull/14210")).toBe("hand-off");
		expect(routeUrlPaste("  https://github.com/vercel/next.js/pull/71102/files  ")).toBe(
			"hand-off",
		);
	});

	it("opens a commit itself: there is nothing left to choose", () => {
		expect(
			routeUrlPaste(
				"https://github.com/honojs/hono/commit/0123456789abcdef0123456789abcdef01234567",
			),
		).toBe("open-here");
	});

	it("opens a release or a compare itself: it always plays by commit", () => {
		expect(routeUrlPaste("https://github.com/o/r/releases/tag/v1.2.0")).toBe("open-here");
		expect(routeUrlPaste("https://github.com/o/r/compare/v1.1.0...v1.2.0")).toBe("open-here");
	});

	it("opens a file or a gist itself, as it always did", () => {
		expect(routeUrlPaste("https://github.com/honojs/hono/blob/main/src/utils/url.ts")).toBe(
			"open-here",
		);
		expect(routeUrlPaste("https://gist.github.com/someone/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(
			"open-here",
		);
	});

	/** A single-line field would have flattened a diff into an unusable one. */
	it("refuses what is not a link", () => {
		expect(routeUrlPaste("just some words")).toBe("refuse");
		expect(routeUrlPaste("diff --git a/a.ts b/a.ts")).toBe("refuse");
		expect(routeUrlPaste("")).toBe("refuse");
		expect(routeUrlPaste("   ")).toBe("refuse");
	});
});
