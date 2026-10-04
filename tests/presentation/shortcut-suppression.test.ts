import {
	areShortcutsSuppressed,
	useKeyboardShortcuts,
} from "@/presentation/hooks/use-keyboard-shortcuts";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The studio's bare-key shortcuts (space plays, arrows step) belong to the
 * studio. While a modal is open they are not the user's intent: pressing space
 * to scroll a gallery must not start the animation behind it.
 */
afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
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

describe("the project history chords", () => {
	function press(target: EventTarget, init: KeyboardEventInit) {
		const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
		target.dispatchEvent(event);
		return event;
	}

	function spyHistory() {
		return {
			undo: vi.spyOn(studioHistory, "undo").mockReturnValue(true),
			redo: vi.spyOn(studioHistory, "redo").mockReturnValue(true),
		};
	}

	it("undoes with Cmd+Z and redoes with Shift+Cmd+Z on the studio", () => {
		const history = spyHistory();
		const { unmount } = renderHook(() => useKeyboardShortcuts());

		const undo = press(document.body, { key: "z", metaKey: true });
		press(document.body, { key: "Z", metaKey: true, shiftKey: true });
		press(document.body, { key: "z", ctrlKey: true });
		press(document.body, { key: "y", ctrlKey: true });
		unmount();

		expect(undo.defaultPrevented).toBe(true);
		expect(history.undo).toHaveBeenCalledTimes(2);
		expect(history.redo).toHaveBeenCalledTimes(2);
	});

	it("leaves Cmd+Z to a number input, which keeps its own undo", () => {
		const history = spyHistory();
		const { unmount } = renderHook(() => useKeyboardShortcuts());
		const input = document.createElement("input");
		input.type = "number";
		document.body.append(input);

		const event = press(input, { key: "z", metaKey: true });
		press(input, { key: "z", metaKey: true, shiftKey: true });
		unmount();

		expect(event.defaultPrevented).toBe(false);
		expect(history.undo).not.toHaveBeenCalled();
		expect(history.redo).not.toHaveBeenCalled();
	});

	it("leaves Cmd+Z to the code editor, whose text surface is a textbox div", () => {
		const history = spyHistory();
		const { unmount } = renderHook(() => useKeyboardShortcuts());
		const surface = document.createElement("div");
		surface.className = "native-edit-context";
		surface.setAttribute("role", "textbox");
		document.body.append(surface);

		press(surface, { key: "z", metaKey: true });
		unmount();

		expect(history.undo).not.toHaveBeenCalled();
	});

	it("leaves Cmd+Z alone while a modal dialog is open", () => {
		const history = spyHistory();
		const { unmount } = renderHook(() => useKeyboardShortcuts());
		const dialog = document.createElement("dialog");
		dialog.setAttribute("open", "");
		document.body.append(dialog);

		press(document.body, { key: "z", metaKey: true });
		unmount();

		expect(history.undo).not.toHaveBeenCalled();
	});
});
