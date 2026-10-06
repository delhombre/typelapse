import {
	IMPORT_INTENT_STASH_KEY,
	encodeImportIntent,
	takeImportIntent,
} from "@/presentation/utils/import-intent";
import { beforeEach, describe, expect, it } from "vitest";

function land(hash: string) {
	window.history.replaceState(null, "", `/app${hash}`);
}

describe("import intent link", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
		window.history.replaceState(null, "", "/app");
	});

	it("round-trips a pasted source through the hash", () => {
		land(encodeImportIntent({ source: "https://github.com/o/r/pull/7" }));
		expect(takeImportIntent()).toEqual({ source: "https://github.com/o/r/pull/7" });
	});

	it("round-trips the play mode alongside the source", () => {
		land(encodeImportIntent({ source: "github.com/o/r/pull/7", playMode: "commit" }));
		expect(takeImportIntent()).toEqual({
			source: "github.com/o/r/pull/7",
			playMode: "commit",
		});
	});

	it("round-trips non-ascii source text", () => {
		const source = "const gruß = '👋 héllo'";
		land(encodeImportIntent({ source }));
		expect(takeImportIntent()?.source).toBe(source);
	});

	it("round-trips a multi-line diff paste", () => {
		const source = "diff --git a/a.ts b/a.ts\n@@ -1,2 +1,3 @@\n-const a = 1\n+const a = 2\n";
		land(encodeImportIntent({ source }));
		expect(takeImportIntent()?.source).toBe(source);
	});

	it("produces a fragment safe to sit in a url", () => {
		const hash = encodeImportIntent({ source: "a".repeat(300) });
		expect(hash.startsWith("#import=")).toBe(true);
		// base64url only: no +, / or = in the payload to be mangled in transit.
		expect(/[+/=]/.test(hash.slice("#import=".length))).toBe(false);
	});

	it("carries an 8,000-line paste to the studio well inside a frame's order of time", () => {
		const source = Array.from({ length: 8000 }, (_, i) => `const value${i} = compute(${i});`).join(
			"\n",
		);

		const started = performance.now();
		land(encodeImportIntent({ source }));
		const taken = takeImportIntent();
		const elapsed = performance.now() - started;

		expect(taken?.source).toBe(source);
		// Too big for a URL, so it waits in sessionStorage behind a marker.
		expect(window.sessionStorage.getItem(IMPORT_INTENT_STASH_KEY)).toBeNull();
		expect(elapsed).toBeLessThan(200);
	});

	it("consumes the intent, so a re-read finds nothing", () => {
		land(encodeImportIntent({ source: "github.com/o/r/pull/7" }));
		expect(takeImportIntent()).not.toBeNull();
		expect(takeImportIntent()).toBeNull();
	});

	it("scrubs the hash off the url once consumed", () => {
		land(encodeImportIntent({ source: "github.com/o/r/pull/7" }));
		takeImportIntent();
		expect(window.location.hash).toBe("");
	});

	it("stashes an oversized paste instead of putting it in the url", () => {
		const source = `@@ -1,2 +1,3 @@\n${"+ a very long line of diff\n".repeat(1000)}`;
		const hash = encodeImportIntent({ source });
		expect(hash.length).toBeLessThan(64);
		expect(window.sessionStorage.getItem(IMPORT_INTENT_STASH_KEY)).not.toBeNull();
		land(hash);
		expect(takeImportIntent()?.source).toBe(source);
	});

	it("clears the stash once the oversized paste is consumed", () => {
		land(encodeImportIntent({ source: "x".repeat(20000) }));
		takeImportIntent();
		expect(window.sessionStorage.getItem(IMPORT_INTENT_STASH_KEY)).toBeNull();
		expect(takeImportIntent()).toBeNull();
	});

	it("returns null when there is no intent in the url", () => {
		expect(takeImportIntent()).toBeNull();
	});

	it("ignores an unrelated hash", () => {
		land("#share=abc");
		expect(takeImportIntent()).toBeNull();
		// and leaves it alone for its own reader
		expect(window.location.hash).toBe("#share=abc");
	});

	it("returns null on a corrupt payload rather than throwing", () => {
		land("#import=not-valid-base64!!");
		expect(takeImportIntent()).toBeNull();
	});

	it("returns null when the stash marker points at nothing", () => {
		land("#import=~");
		expect(takeImportIntent()).toBeNull();
	});

	it("rejects a payload that decodes to something other than an intent", () => {
		land("#import=eyJub3BlIjoxfQ");
		expect(takeImportIntent()).toBeNull();
	});
});
