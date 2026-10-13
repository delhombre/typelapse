/**
 * The studio's keyboard shortcuts: one table, read twice.
 *
 * `useKeyboardShortcuts` asks `matchShortcut` which action a keystroke is, and
 * the Help sheet lists the same table with `keyCaps`, so what the sheet says and
 * what the keys do cannot drift apart. Pure and free of the DOM: the guards that
 * decide whether a shortcut may act (a modal, the loupe, a text surface) stay in
 * the hook, because they depend on where the event came from.
 */

export type ShortcutId =
	| "play-pause"
	| "previous-scene"
	| "next-scene"
	| "pause"
	| "capture-scene"
	| "undo"
	| "redo";

/**
 * One way to press a shortcut. `modifier` is what is held with the key: none for
 * a bare key, `mod` for Cmd on a Mac and Ctrl elsewhere (either is accepted on
 * either, as the studio always has), `ctrl` for Ctrl and only Ctrl. `shift`
 * undefined means Shift is not asked about.
 */
export interface Chord {
	readonly key: string;
	readonly modifier?: "mod" | "ctrl";
	readonly shift?: boolean;
}

export interface Shortcut {
	readonly id: ShortcutId;
	/** What the Help sheet says it does. */
	readonly label: string;
	readonly chords: readonly Chord[];
}

export const STUDIO_SHORTCUTS: readonly Shortcut[] = [
	{ id: "play-pause", label: "Play or pause", chords: [{ key: " " }] },
	{ id: "previous-scene", label: "Previous scene", chords: [{ key: "ArrowLeft" }] },
	{ id: "next-scene", label: "Next scene", chords: [{ key: "ArrowRight" }] },
	{ id: "pause", label: "Pause playback", chords: [{ key: "Escape" }] },
	{
		id: "capture-scene",
		label: "Capture the editor's code as a scene",
		chords: [{ key: "Enter", modifier: "mod" }],
	},
	{ id: "undo", label: "Undo", chords: [{ key: "z", modifier: "mod", shift: false }] },
	{
		id: "redo",
		label: "Redo",
		chords: [
			{ key: "z", modifier: "mod", shift: true },
			{ key: "y", modifier: "ctrl", shift: false },
		],
	},
];

/** The parts of a keystroke the table reads. */
export interface KeystrokeLike {
	readonly key: string;
	readonly metaKey: boolean;
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
}

function chordMatches(chord: Chord, event: KeystrokeLike): boolean {
	if (event.key.toLowerCase() !== chord.key.toLowerCase()) {
		return false;
	}
	if (chord.shift !== undefined && chord.shift !== event.shiftKey) {
		return false;
	}
	switch (chord.modifier) {
		case "mod":
			return (event.metaKey || event.ctrlKey) && !event.altKey;
		case "ctrl":
			return event.ctrlKey && !event.altKey;
		default:
			// A bare key is only that: with a chord modifier held it is some other shortcut.
			return !(event.metaKey || event.ctrlKey || event.altKey);
	}
}

/** The shortcut a keystroke is, or null when it is none of them. */
export function matchShortcut(
	event: KeystrokeLike,
	table: readonly Shortcut[] = STUDIO_SHORTCUTS,
): ShortcutId | null {
	return (
		table.find((shortcut) => shortcut.chords.some((chord) => chordMatches(chord, event)))?.id ??
		null
	);
}

/** The key a person holds with the others: Cmd on Apple platforms, Ctrl elsewhere. */
export function modifierLabel(platform: string): "Cmd" | "Ctrl" {
	return /mac|iphone|ipad|ipod/i.test(platform) ? "Cmd" : "Ctrl";
}

const KEY_NAMES: Readonly<Record<string, string>> = {
	" ": "Space",
	ArrowLeft: "Left",
	ArrowRight: "Right",
	Escape: "Esc",
};

/** One chord as the keys to press, in order, each with the name printed on a keycap. */
export function keyCaps(chord: Chord, platform: string): string[] {
	const caps: string[] = [];
	if (chord.modifier === "mod") {
		caps.push(modifierLabel(platform));
	}
	if (chord.modifier === "ctrl") {
		caps.push("Ctrl");
	}
	if (chord.shift === true) {
		caps.push("Shift");
	}
	caps.push(KEY_NAMES[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key));
	return caps;
}
