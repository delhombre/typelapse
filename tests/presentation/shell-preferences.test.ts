import {
	DEFAULT_SHELL_PREFERENCES,
	SHELL_STORAGE_KEY,
	openingCodeFolded,
	parseShellPreferences,
	readShellPreferences,
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
