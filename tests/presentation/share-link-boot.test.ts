import { useNoticeStore } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { encodeShareLink, openShareLinkOnBoot } from "@/presentation/utils/share-link";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const UNREADABLE = "That share link could not be read.";

const notices = () => useNoticeStore.getState().notices;

beforeEach(() => {
	window.location.hash = "";
	useNoticeStore.setState({ notices: [] });
});

afterEach(() => {
	window.location.hash = "";
});

describe("opening a share link on boot", () => {
	it("says in one line that a link with broken base64 could not be read, and drops it", () => {
		window.location.hash = "#share=%%%not-base64";

		openShareLinkOnBoot(useSnippetStore.getState().importFromJson);

		expect(notices()).toHaveLength(1);
		expect(notices()[0]).toMatchObject({ message: UNREADABLE, tone: "error" });
		expect(window.location.hash).toBe("");
	});

	it("says it for valid base64 that is not JSON", () => {
		window.location.hash = `#share=${btoa("not json at all")}`;

		openShareLinkOnBoot(useSnippetStore.getState().importFromJson);

		expect(notices().map((notice) => notice.message)).toEqual([UNREADABLE]);
	});

	it("says it for JSON that is not a project", () => {
		window.location.hash = `#share=${btoa(JSON.stringify({ hello: "world" }))}`;

		openShareLinkOnBoot(useSnippetStore.getState().importFromJson);

		expect(notices().map((notice) => notice.message)).toEqual([UNREADABLE]);
	});

	it("says it when the studio refuses what the link carried", () => {
		window.location.hash = `#share=${btoa(JSON.stringify({ title: "x", code: "const a = 1;", language: "typescript", themeName: "no-such-theme" }))}`;

		openShareLinkOnBoot(() => {
			throw new Error("refused");
		});

		expect(notices().map((notice) => notice.message)).toEqual([UNREADABLE]);
	});

	it("opens a good link without a word", () => {
		const link = encodeShareLink({
			title: "Shared",
			code: "const shared = 1;",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [],
		});
		window.location.hash = link.slice(link.indexOf("#"));

		openShareLinkOnBoot(useSnippetStore.getState().importFromJson);

		expect(useSnippetStore.getState().snippet.title).toBe("Shared");
		expect(notices()).toEqual([]);
		expect(window.location.hash).toBe("");
	});

	it.each(["abc", "5-2", "0", "1-99999999999999999999999"])(
		"opens a link whose focus is %s, and leaves the odd focus to be read at use",
		(focus) => {
			const code = "a();\nb();\nc();";
			window.location.hash = `#share=${btoa(
				JSON.stringify({
					title: "Odd focus",
					code,
					language: "typescript",
					themeName: "midnight",
					steps: [{ id: "one", code, duration: 1_000, focus }],
				}),
			)}`;

			openShareLinkOnBoot(useSnippetStore.getState().importFromJson);

			expect(notices()).toEqual([]);
			expect(useSnippetStore.getState().snippet.title).toBe("Odd focus");
			expect(useSnippetStore.getState().snippet.steps).toHaveLength(1);
		},
	);

	it("does nothing for a plain arrival", () => {
		openShareLinkOnBoot(useSnippetStore.getState().importFromJson);
		expect(notices()).toEqual([]);
	});
});
