import {
	DEFAULT_SHELL_PREFERENCES,
	SHELL_STORAGE_KEY,
	parseShellPreferences,
	readShellPreferences,
	writeShellPreferences,
} from "@/presentation/utils/shell-preferences";
import { beforeEach, describe, expect, it } from "vitest";

describe("what the shell remembers between visits", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("opens the code card by default, because folding is a choice and not a state", () => {
		expect(DEFAULT_SHELL_PREFERENCES.codeFolded).toBe(false);
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
