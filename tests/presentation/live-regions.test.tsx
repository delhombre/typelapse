import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { ExportStatus } from "@/presentation/components/controls/export-status";
import { StepBuilder } from "@/presentation/components/editor/step-builder";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A live region that mounts together with its text is not announced by most
 * screen readers: they watch regions for changes, and a region that did not
 * exist a moment ago has none. Each one is in the page, empty, before it has
 * anything to say, and the same node then takes the words.
 */

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

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => true),
}));

describe("the export's live regions", () => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
	});
	afterEach(() => cleanup());

	it("are in the page and empty before the export says anything", () => {
		render(<ExportStatus />);
		const status = screen.getByRole("status");
		const alert = screen.getByRole("alert");
		expect(status.textContent).toBe("");
		expect(alert.textContent).toBe("");

		act(() => {
			useExportStore.setState({
				progress: { phase: "rendering", message: "Frame 3 of 60", ratio: 0.05 },
			});
		});
		expect(screen.getByRole("status")).toBe(status);
		expect(status.textContent).toBe("Rendering.");

		act(() => {
			useExportStore.setState({
				progress: null,
				outcome: {
					kind: "done",
					filename: "clip.mp4",
					bytes: 2 * 1024 * 1024,
					target: "device",
					elapsedMs: 3_400,
				},
			});
		});
		expect(screen.getByRole("status")).toBe(status);
		expect(status.textContent).toBe("Saved clip.mp4, 2.0 MB, in 3.4s on this device.");

		act(() => {
			useExportStore.setState({ outcome: { kind: "failed", message: "The encoder stopped." } });
		});
		expect(screen.getByRole("alert")).toBe(alert);
		expect(alert.textContent).toBe("The encoder stopped.");
		expect(status.textContent).toBe("");
	});
});

describe("the scene deletion's live region", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) throw new Error("The template catalog must contain a project");
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		useStudioCompositionStore
			.getState()
			.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	});
	afterEach(() => cleanup());

	it("is in the page and empty before a scene is deleted", () => {
		render(<StepBuilder />);
		// The First video card may say "Your first video is made." in its own status line.
		const deletion = () =>
			screen.getAllByRole("status").find((region) => region.className === "sr-only");
		const status = deletion();
		expect(status?.textContent).toBe("");

		fireEvent.click(screen.getByRole("button", { name: "Delete scene 1" }));

		expect(deletion()).toBe(status);
		expect(status?.textContent).toBe("Scene 1 deleted.");
	});
});
