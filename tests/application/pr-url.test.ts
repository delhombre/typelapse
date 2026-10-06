import {
	resolveCommitUrl,
	resolveCompareUrl,
	resolvePrUrl,
	resolveReleaseUrl,
} from "@/application/import/pr-url";
import { describe, expect, it } from "vitest";

describe("resolvePrUrl", () => {
	it("parses a canonical pull-request url", () => {
		expect(resolvePrUrl("https://github.com/facebook/react/pull/42")).toEqual({
			owner: "facebook",
			repo: "react",
			number: 42,
		});
	});

	it("tolerates a /files tab suffix", () => {
		expect(resolvePrUrl("https://github.com/facebook/react/pull/42/files")).toEqual({
			owner: "facebook",
			repo: "react",
			number: 42,
		});
	});

	it("tolerates a /commits suffix and a #fragment", () => {
		expect(resolvePrUrl("https://github.com/o/r/pull/7/commits#diff-abc123")).toEqual({
			owner: "o",
			repo: "r",
			number: 7,
		});
	});

	it("tolerates a query string", () => {
		expect(resolvePrUrl("https://github.com/o/r/pull/7?w=1")).toEqual({
			owner: "o",
			repo: "r",
			number: 7,
		});
	});

	it("tolerates a missing protocol", () => {
		expect(resolvePrUrl("github.com/o/r/pull/7")).toEqual({ owner: "o", repo: "r", number: 7 });
	});

	it("tolerates a www. host", () => {
		expect(resolvePrUrl("https://www.github.com/o/r/pull/7")).toEqual({
			owner: "o",
			repo: "r",
			number: 7,
		});
	});

	it("rejects a non-numeric pull number", () => {
		expect(resolvePrUrl("https://github.com/o/r/pull/not-a-number")).toBeNull();
	});

	it("rejects a commit url", () => {
		expect(
			resolvePrUrl("https://github.com/o/r/commit/1234567890abcdef1234567890abcdef12345678"),
		).toBeNull();
	});

	it("rejects a blob url", () => {
		expect(resolvePrUrl("https://github.com/o/r/blob/main/index.ts")).toBeNull();
	});

	it("rejects a gist url", () => {
		expect(resolvePrUrl("https://gist.github.com/o/abc123")).toBeNull();
	});

	it("rejects the repo root and garbage", () => {
		expect(resolvePrUrl("https://github.com/o/r")).toBeNull();
		expect(resolvePrUrl("not a url at all")).toBeNull();
		expect(resolvePrUrl("")).toBeNull();
	});
});

describe("resolveCommitUrl", () => {
	it("parses a commit url with a full 40-char sha", () => {
		expect(
			resolveCommitUrl(
				"https://github.com/facebook/react/commit/1234567890abcdef1234567890abcdef12345678",
			),
		).toEqual({
			owner: "facebook",
			repo: "react",
			sha: "1234567890abcdef1234567890abcdef12345678",
		});
	});

	it("parses a commit url with a short 7-char sha", () => {
		expect(resolveCommitUrl("https://github.com/o/r/commit/abc1234")).toEqual({
			owner: "o",
			repo: "r",
			sha: "abc1234",
		});
	});

	it("tolerates a suffix, query, fragment, www. and missing protocol", () => {
		expect(resolveCommitUrl("www.github.com/o/r/commit/abc1234/checks?x=1#top")).toEqual({
			owner: "o",
			repo: "r",
			sha: "abc1234",
		});
	});

	it("rejects a sha shorter than 7 chars", () => {
		expect(resolveCommitUrl("https://github.com/o/r/commit/abc12")).toBeNull();
	});

	it("rejects a non-hex sha", () => {
		expect(resolveCommitUrl("https://github.com/o/r/commit/zzzzzzz")).toBeNull();
	});

	it("rejects a pull-request url", () => {
		expect(resolveCommitUrl("https://github.com/o/r/pull/42")).toBeNull();
	});

	it("rejects a blob url", () => {
		expect(resolveCommitUrl("https://github.com/o/r/blob/main/index.ts")).toBeNull();
	});

	it("rejects a gist url and garbage", () => {
		expect(resolveCommitUrl("https://gist.github.com/o/abc123")).toBeNull();
		expect(resolveCommitUrl("not a url at all")).toBeNull();
		expect(resolveCommitUrl("")).toBeNull();
	});
});

describe("resolveReleaseUrl", () => {
	it("parses the release page a workflow's release event links", () => {
		expect(
			resolveReleaseUrl("https://github.com/sindresorhus/slugify/releases/tag/v2.2.1"),
		).toEqual({ owner: "sindresorhus", repo: "slugify", tag: "v2.2.1" });
	});

	it("keeps a tag that holds a slash, and decodes an escaped one", () => {
		expect(resolveReleaseUrl("github.com/o/r/releases/tag/release/2.0")?.tag).toBe("release/2.0");
		expect(resolveReleaseUrl("https://github.com/o/r/releases/tag/v1.0%2Bbuild")?.tag).toBe(
			"v1.0+build",
		);
	});

	it("ignores a query or a fragment", () => {
		expect(resolveReleaseUrl("https://github.com/o/r/releases/tag/v1?x=1#notes")?.tag).toBe("v1");
	});

	it("rejects the releases list, the latest alias and other pages", () => {
		expect(resolveReleaseUrl("https://github.com/o/r/releases")).toBeNull();
		expect(resolveReleaseUrl("https://github.com/o/r/releases/latest")).toBeNull();
		expect(resolveReleaseUrl("https://github.com/o/r/releases/tag/")).toBeNull();
		expect(resolveReleaseUrl("https://github.com/o/r/pull/4")).toBeNull();
		expect(resolveReleaseUrl("https://gitlab.com/o/r/releases/tag/v1")).toBeNull();
	});

	it.each([
		[
			"a dot-dot segment",
			"github.com/pub/repo/releases/tag/v1%2F..%2F..%2F..%2Frepos%2Fpriv%2Frepo",
		],
		["a dot segment", "github.com/o/r/releases/tag/a%2F.%2Fb"],
		["a backslash", "github.com/o/r/releases/tag/v1%5Cx"],
		["a space", "github.com/o/r/releases/tag/v%201"],
		["a lock suffix", "github.com/o/r/releases/tag/v1.lock"],
		["a double dot", "github.com/o/r/releases/tag/v1..2"],
	])("refuses a tag with %s", (_case, link) => {
		expect(resolveReleaseUrl(link)).toBeNull();
	});
});

describe("resolveCompareUrl", () => {
	it("parses a three-dot compare between two tags", () => {
		expect(resolveCompareUrl("https://github.com/o/r/compare/v1.0.0...v1.1.0")).toEqual({
			owner: "o",
			repo: "r",
			base: "v1.0.0",
			head: "v1.1.0",
		});
	});

	it("takes the two-dot form and refs that hold a slash", () => {
		expect(resolveCompareUrl("github.com/o/r/compare/main..feature/login")).toEqual({
			owner: "o",
			repo: "r",
			base: "main",
			head: "feature/login",
		});
	});

	it("rejects a compare that names one side only", () => {
		expect(resolveCompareUrl("https://github.com/o/r/compare/main")).toBeNull();
		expect(resolveCompareUrl("https://github.com/o/r/compare/...v2")).toBeNull();
		expect(resolveCompareUrl("https://github.com/o/r/compare/v1...")).toBeNull();
		expect(resolveCompareUrl("https://github.com/o/r/compare")).toBeNull();
	});

	// A ref is a path on api.github.com once it is fetched: %2F decodes to a slash,
	// and `..` then walks out of the public repository the guard checked.
	it("refuses a head that climbs out of the repository", () => {
		expect(
			resolveCompareUrl(
				"github.com/pub/repo/compare/a...b%2F..%2F..%2F..%2F..%2F..%2Frepos%2Fpriv%2Frepo%2Fcompare%2Fv1...v2",
			),
		).toBeNull();
	});

	it.each([
		["a dot segment", "github.com/o/r/compare/main...feature%2F.%2Fx"],
		["a dot-dot segment", "github.com/o/r/compare/main...a%2F..%2Fb"],
		["an encoded dot-dot base", "github.com/o/r/compare/%2e%2e%2Fx...main"],
		["a backslash", "github.com/o/r/compare/main...feat%5Cx"],
		["a space", "github.com/o/r/compare/main...feat%20x"],
		["a tilde", "github.com/o/r/compare/main...feat~1"],
		["a caret", "github.com/o/r/compare/main...feat%5E"],
		["a colon", "github.com/o/r/compare/main...feat%3Ax"],
		["a question mark", "github.com/o/r/compare/main...feat%3Fx"],
		["an at-brace", "github.com/o/r/compare/main...feat@%7Bx%7D"],
		["a lock suffix", "github.com/o/r/compare/main...feat.lock"],
		["a trailing dot", "github.com/o/r/compare/main...feat."],
		["an empty component", "github.com/o/r/compare/main...feat%2F%2Fx"],
		["a control character", "github.com/o/r/compare/main...feat%00x"],
	])("refuses a ref with %s", (_case, link) => {
		expect(resolveCompareUrl(link)).toBeNull();
	});
});
