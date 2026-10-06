/**
 * Wide glyphs in the DOM preview (#188). The engine gives a CJK character or an
 * emoji two cells; the browser gives it whatever its fallback face advances (a
 * CJK face is 1em, two cells of JetBrains Mono are 1.2em). Each wide glyph sits
 * in a box exactly two `ch` wide, centred, so the text inside a token keeps to
 * the engine's cells as the painter's does, and the next token never overlaps.
 */

import { MagicMoveCanvas } from "@/presentation/components/preview/magic-move-canvas";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

function tokenSpan(content: string): HTMLElement | null {
	const { container } = render(
		<MagicMoveCanvas
			tokens={[{ key: "a", content, line: 0, col: 3, opacity: 1 }]}
			lineCount={1}
			fontSize={10}
			lineHeightRatio={1.5}
			fontFamily="monospace"
			color="#ffffff"
			padding={0}
			showLineNumbers={false}
		/>,
	);
	return container.querySelector<HTMLElement>("span");
}

describe("MagicMoveCanvas with wide glyphs", () => {
	it("keeps a narrow token a single text node, as before", () => {
		const span = tokenSpan("naïve café");
		expect(span?.childElementCount).toBe(0);
		expect(span?.textContent).toBe("naïve café");
	});

	it("boxes each wide glyph on two cells and leaves narrow runs as text", () => {
		const span = tokenSpan('"世 🚀 ok"');
		expect(span?.textContent).toBe('"世 🚀 ok"');
		const boxes = [...(span?.children ?? [])] as HTMLElement[];
		expect(boxes.map((box) => box.textContent)).toEqual(["世", "🚀"]);
		for (const box of boxes) {
			expect(box.style.width).toBe("2ch");
			expect(box.style.display).toBe("inline-flex");
			expect(box.style.justifyContent).toBe("center");
		}
	});
});
