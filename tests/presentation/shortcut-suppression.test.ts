import { areShortcutsSuppressed } from "@/presentation/hooks/use-keyboard-shortcuts";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The studio's bare-key shortcuts (space plays, arrows step) belong to the
 * studio. While a modal is open they are not the user's intent: pressing space
 * to scroll a gallery must not start the animation behind it.
 */
afterEach(() => {
	document.body.innerHTML = "";
});

describe("areShortcutsSuppressed", () => {
	it("lets shortcuts through on a plain studio", () => {
		expect(areShortcutsSuppressed()).toBe(false);
	});

	it("suppresses them while the user is typing", () => {
		const input = document.createElement("input");
		document.body.append(input);
		input.focus();

		expect(areShortcutsSuppressed()).toBe(true);
	});

	it("suppresses them while a modal dialog is open", () => {
		const dialog = document.createElement("dialog");
		dialog.setAttribute("open", "");
		document.body.append(dialog);

		expect(areShortcutsSuppressed()).toBe(true);
	});

	it("lets them through again once the dialog closes", () => {
		const dialog = document.createElement("dialog");
		document.body.append(dialog);

		expect(areShortcutsSuppressed()).toBe(false);
	});
});
