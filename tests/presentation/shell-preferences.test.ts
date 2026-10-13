import {
	DEFAULT_SHELL_PREFERENCES,
	SHELL_STORAGE_KEY,
	openingCodeFolded,
	parseShellPreferences,
	readShellPreferences,
	scenesBeforeBoot,
	writeShellPreferences,
} from "@/presentation/utils/shell-preferences";
import { beforeEach, describe, expect, it } from "vitest";

describe("what the shell remembers between visits", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("opens on the stage by default and keeps editing one explicit mode away", () => {
		expect(DEFAULT_SHELL_PREFERENCES.codeFolded).toBe(true);
		expect(parseShellPreferences(null)).toEqual(DEFAULT_SHELL_PREFERENCES);
	});

	it("reads back the fold the visitor asked for", () => {
		expect(parseShellPreferences('{"codeFolded":true}')).toEqual({ codeFolded: true });
		expect(parseShellPreferences('{"codeFolded":false}')).toEqual({ codeFolded: false });
	});

	it("ignores a stash it cannot read rather than opening folded on a guess", () => {
		expect(parseShellPreferences("not json")).toEqual(DEFAULT_SHELL_PREFERENCES);
		expect(parseShellPreferences("[]")).toEqual(DEFAULT_SHELL_PREFERENCES);
		expect(parseShellPreferences('{"codeFolded":"yes"}')).toEqual(DEFAULT_SHELL_PREFERENCES);
		expect(parseShellPreferences('{"somethingElse":1}')).toEqual(DEFAULT_SHELL_PREFERENCES);
	});

	it("keeps the choice in its own stash, beside the draft and never inside it", () => {
		// The draft is the project format a share link and a JSON export both
		// carry. Whether this visitor folded their editor away is nobody else's
		// business, so it travels in a key of its own.
		writeShellPreferences({ codeFolded: true });
		expect(window.localStorage.getItem(SHELL_STORAGE_KEY)).toBe('{"codeFolded":true}');
		expect(window.localStorage.getItem("typelapse:draft")).toBeNull();
		expect(readShellPreferences()).toEqual({ codeFolded: true });
	});
});

describe("which mode the studio opens in", () => {
	it("opens an empty project in Edit, whatever was remembered, so its path shows", () => {
		expect(openingCodeFolded(0, true)).toBe(false);
		expect(openingCodeFolded(0, false)).toBe(false);
	});

	it("opens a project with scenes in the mode that was remembered", () => {
		expect(openingCodeFolded(1, true)).toBe(true);
		expect(openingCodeFolded(3, false)).toBe(false);
	});
});

describe("how many scenes a visit will open with, judged before the studio has loaded", () => {
	const draft = (steps: unknown) => JSON.stringify({ title: "x", code: "a", steps });

	it("is none on a first visit: no link, no stored draft", () => {
		expect(scenesBeforeBoot({ shared: null, draft: null })).toBe(0);
	});

	it("counts the scenes of a stored draft", () => {
		expect(scenesBeforeBoot({ shared: null, draft: draft([{}, {}]) })).toBe(2);
		expect(scenesBeforeBoot({ shared: null, draft: draft([]) })).toBe(0);
	});

	it("counts a share link's own scenes, which win over the draft", () => {
		const shared = { title: "x", code: "a", steps: [{}] };
		expect(scenesBeforeBoot({ shared, draft: draft([]) })).toBe(1);
		expect(scenesBeforeBoot({ shared: { ...shared, steps: [] }, draft: draft([{}]) })).toBe(0);
	});

	it("takes a draft it cannot read for none, as the studio does when it sets one aside", () => {
		expect(scenesBeforeBoot({ shared: null, draft: "not json" })).toBe(0);
		expect(scenesBeforeBoot({ shared: null, draft: "[]" })).toBe(0);
		expect(scenesBeforeBoot({ shared: null, draft: draft("nope") })).toBe(0);
	});
});
