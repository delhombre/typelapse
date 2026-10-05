import { ExportStatus } from "@/presentation/components/controls/export-status";
import { PreviewIsland } from "@/presentation/components/controls/preview-island";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("reduced-motion"),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
});

beforeAll(() => {
	class ResizeObserverStub {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	Object.defineProperty(window, "ResizeObserver", {
		configurable: true,
		value: ResizeObserverStub,
	});
	Object.defineProperty(globalThis, "ResizeObserver", {
		configurable: true,
		value: ResizeObserverStub,
	});
});

beforeEach(() => {
	useExportStore.setState({ width: 1920, height: 1080 });
});

afterEach(cleanup);

describe("the timeline control rail", () => {
	it("turns a cluster into a focused rail mode instead of opening a detached sheet", async () => {
		const onSheetRaisedChange = vi.fn();
		const { container } = render(
			<PreviewIsland variant="timeline" onSheetRaisedChange={onSheetRaisedChange} />,
		);

		fireEvent.click(screen.getByRole("button", { name: "Look settings" }));

		expect(await screen.findByRole("button", { name: "Back to studio controls" })).toBeTruthy();
		expect(await screen.findByRole("button", { name: "Midnight" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Close settings" })).toBeNull();
		expect(container.querySelector(".si-sheet")).toBeNull();
		await waitFor(() => {
			expect(onSheetRaisedChange).toHaveBeenLastCalledWith(false);
		});
	});

	it("returns to the root controls with Escape and restores the opener", async () => {
		render(<PreviewIsland variant="timeline" />);
		const opener = screen.getByRole("button", { name: "Frame settings" });
		fireEvent.click(opener);

		fireEvent.keyDown(document, { key: "Escape" });

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Frame settings" })).toBeTruthy();
		});
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "Frame settings" }));
	});

	it("moves keyboard focus into a mode before returning it to the opener", async () => {
		render(<PreviewIsland variant="timeline" />);
		const opener = screen.getByRole("button", { name: "Look settings" });
		opener.focus();

		fireEvent.click(opener, { detail: 0 });

		const back = await screen.findByRole("button", { name: "Back to studio controls" });
		await waitFor(() => expect(document.activeElement).toBe(back));
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => {
			expect(document.activeElement).toBe(screen.getByRole("button", { name: "Look settings" }));
		});
	});

	it("opens a direct aspect picker instead of cycling blindly", async () => {
		render(<PreviewIsland variant="timeline" />);
		const opener = screen.getByRole("button", {
			name: "Aspect ratio 16:9. Choose a format",
		});

		fireEvent.click(opener);

		expect(useExportStore.getState().width).toBe(1920);
		expect(useExportStore.getState().height).toBe(1080);
		fireEvent.click(await screen.findByRole("button", { name: "Aspect ratio 9:16" }));
		expect(useExportStore.getState().width).toBe(1080);
		expect(useExportStore.getState().height).toBe(1920);
	});

	it("uses compact, keyboard-operable sliders for the dense spacing decisions", async () => {
		useSnippetStore.setState({ framePadding: 32, cardMargin: 32 });
		render(<PreviewIsland variant="timeline" />);
		fireEvent.click(screen.getByRole("button", { name: "Frame settings" }));
		fireEvent.click(await screen.findByRole("button", { name: "Spacing" }));

		const padding = await screen.findByRole("slider", { name: "Frame padding" });
		expect(screen.getByRole("slider", { name: "Frame margin" })).toBeTruthy();
		expect(screen.getByRole("slider", { name: "Frame radius" })).toBeTruthy();
		fireEvent.change(padding, { target: { value: "4" } });
		expect(useSnippetStore.getState().framePadding).toBe(64);
	});

	it("keeps the watermark field one focused step below the Look rail", async () => {
		render(<PreviewIsland variant="timeline" />);
		fireEvent.click(screen.getByRole("button", { name: "Look settings" }));

		expect(screen.queryByRole("textbox", { name: "Watermark" })).toBeNull();
		fireEvent.click(await screen.findByRole("button", { name: "Watermark" }));

		const field = await screen.findByRole("textbox", { name: "Watermark" });
		fireEvent.change(field, { target: { value: "@typelapse" } });
		expect(useSnippetStore.getState().watermark).toBe("@typelapse");
		expect(screen.getByRole("button", { name: "Back to look controls" })).toBeTruthy();
	});

	it("keeps the export mode open while its own status is dismissed", async () => {
		useExportStore.setState({
			outcome: {
				kind: "done",
				filename: "Untitled.mp4",
				bytes: 978_000,
				elapsedMs: 1200,
				target: "device",
			},
		} as Partial<ReturnType<typeof useExportStore.getState>>);
		render(
			<>
				<ExportStatus />
				<PreviewIsland variant="timeline" />
			</>,
		);
		fireEvent.click(screen.getByRole("button", { name: /^Export · / }));
		expect(await screen.findByRole("group", { name: "Where" })).toBeTruthy();

		const dismiss = screen.getByRole("button", { name: "Dismiss export status" });
		fireEvent.pointerDown(dismiss);
		fireEvent.click(dismiss);

		// The status floats above the rail it reports on; answering it is not leaving.
		// A closing row lingers for its exit, so the check waits past it.
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(screen.queryByRole("group", { name: "Where" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Frame settings" })).toBeNull();
		useExportStore.setState({ outcome: null });
	});
});
