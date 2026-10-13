import {
	type KeystrokeLike,
	STUDIO_SHORTCUTS,
	keyCaps,
	matchShortcut,
	modifierLabel,
} from "@/application/shortcuts/studio-shortcuts";
import { describe, expect, it } from "vitest";

const press = (key: string, held: Partial<KeystrokeLike> = {}): KeystrokeLike => ({
	key,
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	...held,
});

describe("matchShortcut", () => {
	it("reads the bare keys", () => {
		expect(matchShortcut(press(" "))).toBe("play-pause");
		expect(matchShortcut(press("ArrowLeft"))).toBe("previous-scene");
		expect(matchShortcut(press("ArrowRight"))).toBe("next-scene");
		expect(matchShortcut(press("Escape"))).toBe("pause");
		expect(matchShortcut(press("q"))).toBeNull();
	});

	it("leaves a bare key to whatever chord it is part of", () => {
		expect(matchShortcut(press(" ", { ctrlKey: true }))).toBeNull();
		expect(matchShortcut(press("ArrowLeft", { metaKey: true }))).toBeNull();
		expect(matchShortcut(press("Escape", { altKey: true }))).toBeNull();
		expect(matchShortcut(press(" ", { shiftKey: true }))).toBe("play-pause");
	});

	it("captures a scene with Cmd or Ctrl and Enter, whichever the system calls its own", () => {
		expect(matchShortcut(press("Enter", { metaKey: true }))).toBe("capture-scene");
		expect(matchShortcut(press("Enter", { ctrlKey: true }))).toBe("capture-scene");
		expect(matchShortcut(press("Enter"))).toBeNull();
	});

	it("undoes with Cmd+Z and redoes with Shift+Cmd+Z, Ctrl+Z and Ctrl+Shift+Z alike", () => {
		expect(matchShortcut(press("z", { metaKey: true }))).toBe("undo");
		expect(matchShortcut(press("z", { ctrlKey: true }))).toBe("undo");
		expect(matchShortcut(press("Z", { metaKey: true, shiftKey: true }))).toBe("redo");
		expect(matchShortcut(press("Z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
		expect(matchShortcut(press("z"))).toBeNull();
	});

	it("redoes with Ctrl+Y and not Cmd+Y or Ctrl+Shift+Y", () => {
		expect(matchShortcut(press("y", { ctrlKey: true }))).toBe("redo");
		expect(matchShortcut(press("y", { metaKey: true }))).toBeNull();
		expect(matchShortcut(press("y", { ctrlKey: true, shiftKey: true }))).toBeNull();
	});

	it("does not capture a scene with Alt held: Alt+Cmd+Enter is no shortcut", () => {
		expect(matchShortcut(press("Enter", { metaKey: true, altKey: true }))).toBeNull();
		expect(matchShortcut(press("Enter", { ctrlKey: true, altKey: true }))).toBeNull();
	});

	it("does not take Alt chords", () => {
		expect(matchShortcut(press("z", { metaKey: true, altKey: true }))).toBeNull();
	});

	it("reads the table it is given", () => {
		const table = [{ id: "undo", label: "Undo", chords: [{ key: "u" }] }] as const;
		expect(matchShortcut(press("u"), table)).toBe("undo");
		expect(matchShortcut(press(" "), table)).toBeNull();
	});

	it("gives no two shortcuts the same keystroke", () => {
		const chords = STUDIO_SHORTCUTS.flatMap((shortcut) =>
			shortcut.chords.map((chord) => ({ id: shortcut.id, chord })),
		);
		for (const { id, chord } of chords) {
			const keystroke = press(chord.key, {
				metaKey: chord.modifier === "mod",
				ctrlKey: chord.modifier === "ctrl",
				shiftKey: chord.shift === true,
			});
			expect(matchShortcut(keystroke)).toBe(id);
		}
	});
});

describe("modifierLabel", () => {
	it("is Cmd on Apple platforms and Ctrl on the others", () => {
		expect(modifierLabel("MacIntel")).toBe("Cmd");
		expect(modifierLabel("macOS")).toBe("Cmd");
		expect(modifierLabel("iPad")).toBe("Cmd");
		expect(modifierLabel("Win32")).toBe("Ctrl");
		expect(modifierLabel("Linux x86_64")).toBe("Ctrl");
		expect(modifierLabel("")).toBe("Ctrl");
	});
});

describe("keyCaps", () => {
	it("names the keys in the order they are pressed", () => {
		expect(keyCaps({ key: " " }, "MacIntel")).toEqual(["Space"]);
		expect(keyCaps({ key: "ArrowLeft" }, "MacIntel")).toEqual(["Left"]);
		expect(keyCaps({ key: "Escape" }, "Win32")).toEqual(["Esc"]);
		expect(keyCaps({ key: "Enter", modifier: "mod" }, "MacIntel")).toEqual(["Cmd", "Enter"]);
		expect(keyCaps({ key: "Enter", modifier: "mod" }, "Win32")).toEqual(["Ctrl", "Enter"]);
		expect(keyCaps({ key: "z", modifier: "mod", shift: true }, "MacIntel")).toEqual([
			"Cmd",
			"Shift",
			"Z",
		]);
	});

	it("keeps Ctrl+Y as Ctrl on a Mac too, because that is the key the studio reads", () => {
		expect(keyCaps({ key: "y", modifier: "ctrl", shift: false }, "MacIntel")).toEqual([
			"Ctrl",
			"Y",
		]);
	});
});
