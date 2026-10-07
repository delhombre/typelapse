/**
 * The DOM side of a long line's clip (ticket #174): the code column is cut at
 * its own right edge (the window's inner edge) and masked over the last
 * columns, in `ch`, the unit the tokens are placed in, so the preview and the
 * Remotion composition (the same component) fade the cells the painter fades.
 */

import { MagicMoveCanvas } from "@/presentation/components/preview/magic-move-canvas";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

function codeColumn(lineClip?: { visibleColumns: number; fadeStart: number; fadeEnd: number }) {
	const { container } = render(
		<MagicMoveCanvas
			tokens={[{ key: "a", content: "x".repeat(300), line: 0, col: 0, opacity: 1 }]}
			lineCount={1}
			fontSize={10}
			lineHeightRatio={1.5}
			fontFamily="monospace"
			color="#ffffff"
			padding={8}
			lineClip={lineClip}
		/>,
	);
	const token = container.querySelector<HTMLElement>("span");
	const column = token?.parentElement ?? null;
	return { column, body: column?.parentElement ?? null };
}

describe("MagicMoveCanvas with a long line", () => {
	it("masks the code column from the fade's first column to the clip edge", () => {
		const { column, body } = codeColumn({ visibleColumns: 185, fadeStart: 182, fadeEnd: 185.5 });
		expect(column?.style.maskImage).toBe(
			"linear-gradient(to right, #000 182ch, transparent 185.5ch)",
		);
		expect(column?.style.maskRepeat).toBe("no-repeat");
		// The cut itself: the body clips at its content box, the window's inner edge.
		expect(body?.style.overflow).toBe("hidden");
	});

	it("leaves a column whose lines fit unmasked", () => {
		const { column } = codeColumn();
		expect(column?.style.maskImage).toBe("");
	});
});
