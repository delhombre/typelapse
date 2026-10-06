import { ExportStatus } from "@/presentation/components/controls/export-status";
import { useExportStore } from "@/presentation/stores/export.store";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

/* The bar follows the measured value: a transform the compositor scales, never
   a width spring that lags behind the number beside it and then overshoots. */

function fill(): HTMLElement {
	const status = screen.getByTestId("export-status");
	const element = status.querySelector<HTMLElement>(".si-status-fill");
	expect(element).not.toBeNull();
	return element as HTMLElement;
}

describe("the export progress bar", () => {
	afterEach(() => {
		cleanup();
		useExportStore.setState(useExportStore.getInitialState(), true);
	});

	it("scales to the ratio it is given, with no width to animate", () => {
		useExportStore.setState({
			progress: { phase: "rendering", message: "Rendering on this device · 40%", ratio: 0.4 },
		});
		render(<ExportStatus />);

		expect(fill().style.transform).toBe("scaleX(0.4)");
		expect(fill().style.width).toBe("");

		act(() => {
			useExportStore.setState({
				progress: { phase: "rendering", message: "Rendering on this device · 70%", ratio: 0.7 },
			});
		});
		expect(fill().style.transform).toBe("scaleX(0.7)");
	});

	it("says it cannot measure a phase rather than drawing a third of a bar", () => {
		useExportStore.setState({
			progress: { phase: "preparing", message: "Sending to server…", ratio: null },
		});
		render(<ExportStatus />);

		expect(fill().hasAttribute("data-indeterminate")).toBe(true);
		expect(fill().style.transform).toBe("");
	});
});
