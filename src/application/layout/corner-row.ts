/** What the studio's resources are called; the corner row and the More menu share the names. */
export type CornerRowResource = "source" | "library" | "showcase";

/** The ones that can move: Add source is how a phone edits, and stays in the row. */
export type MovableResource = Exclude<CornerRowResource, "source">;

export interface CornerRowPlan {
	/** Left to right, what the row itself holds. */
	row: readonly CornerRowResource[];
	/** Top to bottom, what the More menu holds instead (after the account). */
	more: readonly MovableResource[];
	/** The project chip is one button that opens the project menu, name and brand included. */
	projectChipIsOneTarget: boolean;
}

/**
 * What lives in the phone's corner row and what in the More menu, by the kind of
 * pointer (gate five, #282).
 *
 * A finger needs 44px per control and the row has 340px at 360: with the project
 * chip, Undo, Redo, Add source and More at 44px each there is room for the name
 * and nothing else. Add source stays, because editing on a phone has no keyboard
 * shortcut; Showcase and Library are browsing, and wait one tap away. A
 * cursor's row is unchanged, and so is its split project chip.
 */
export function cornerRowPlan({ coarse }: { coarse: boolean }): CornerRowPlan {
	return coarse
		? { row: ["source"], more: ["showcase", "library"], projectChipIsOneTarget: true }
		: {
				row: ["source", "library", "showcase"],
				more: [],
				projectChipIsOneTarget: false,
			};
}
