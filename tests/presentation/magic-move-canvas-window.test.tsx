/**
 * The DOM gutter inside a moved plan window (#104): labels count from the
 * window's top row and scroll by its fraction, as the painter's do.
 */

import { MagicMoveCanvas } from "@/presentation/components/preview/magic-move-canvas";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

function gutter(firstRow?: number) {
	const { container } = render(
		<MagicMoveCanvas
			tokens={[{ key: "a", content: "x", line: 0, col: 0, opacity: 1 }]}
			lineCount={3}
			lineNumberCount={3}
			fontSize={10}
			lineHeightRatio={1.5}
			fontFamily="monospace"
			color="#ffffff"
			padding={0}
			firstRow={firstRow}
		/>,
	);
	const column = container.querySelector<HTMLElement>('[aria-hidden="true"]');
	return {
		labels: [...(column?.children ?? [])].map((row) => row.textContent),
		transform: column?.style.transform ?? "",
	};
}

describe("MagicMoveCanvas inside a moved window", () => {
	it("numbers from the window's top and scrolls the gutter by its fraction", () => {
		const scrolled = gutter(1391.5);
		expect(scrolled.labels).toEqual(["1392", "1393", "1394", "1395"]);
		expect(scrolled.transform).toBe("translateY(-7.5px)");
	});

	it("is the plain gutter at the top", () => {
		expect(gutter()).toEqual({ labels: ["01", "02", "03"], transform: "" });
	});
});
