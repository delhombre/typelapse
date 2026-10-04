import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { ExportStatus } from "@/presentation/components/controls/export-status";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* A server render refused for size (#113): the server answers 400 with its own
   sentence. The panel has to show it, stop waiting, and offer the machine that
   has no such cap, without ever switching to it unasked. */

const encodable = { now: true };

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => encodable.now),
}));

const SENTENCE =
	"Scene 1's code is too long for the server: 60,000 characters, over the limit of 50,000.";

function hugeSnippet(): Snippet {
	const code = "x".repeat(60_000);
	return Snippet.create({ title: "Huge", code, language: "typescript" }).addStep(
		Step.create({ code }),
	);
}

function refuse() {
	const fetchSpy = vi.fn(async () =>
		Response.json({ error: SENTENCE }, { status: 400, statusText: "Bad Request" }),
	);
	vi.stubGlobal("fetch", fetchSpy);
	return fetchSpy;
}

describe("a server render refused for size", () => {
	beforeEach(() => {
		encodable.now = true;
		useExportStore.setState(useExportStore.getInitialState(), true);
		useExportStore.setState({ target: "server" });
		useSnippetStore.setState({ snippet: hugeSnippet() });
	});

	afterEach(() => {
		cleanup();
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState(useSnippetStore.getInitialState(), true);
		vi.unstubAllGlobals();
	});

	it("ends the wait with the server's sentence and offers Device", async () => {
		const fetchSpy = refuse();

		await useExportStore.getState().exportVideo();

		const state = useExportStore.getState();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(state.isExporting).toBe(false);
		expect(state.progress).toBeNull();
		expect(state.outcome).toEqual({ kind: "failed", message: SENTENCE, alternative: "device" });
		// Offered, never taken: the target stays where the user put it.
		expect(state.target).toBe("server");
	});

	it("offers nothing this browser cannot encode", async () => {
		encodable.now = false;
		refuse();

		await useExportStore.getState().exportVideo();

		expect(useExportStore.getState().outcome).toEqual({ kind: "failed", message: SENTENCE });
	});

	it("renders on this device when the offer is taken", async () => {
		refuse();
		await useExportStore.getState().exportVideo();
		const exportVideo = vi.fn(async () => {});
		useExportStore.setState({ exportVideo });

		render(<ExportStatus />);
		expect(screen.getAllByText(SENTENCE).length).toBeGreaterThan(0);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Render on this device" }));
		});

		expect(useExportStore.getState().target).toBe("device");
		expect(exportVideo).toHaveBeenCalledTimes(1);
	});
});
