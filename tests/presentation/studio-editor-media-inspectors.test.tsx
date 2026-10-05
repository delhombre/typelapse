import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Asset } from "@/domain/entities/asset";
import { StudioEditor } from "@/presentation/components/editor/studio-editor";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Monaco needs a real browser; the stand-in counts mounts, since each one
// recreated Monaco's two worker blob URLs.
const editorMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/presentation/components/editor/code-editor", async () => {
	const { useEffect } = await import("react");
	return {
		CodeEditor: () => {
			useEffect(() => {
				editorMounts.count += 1;
			}, []);
			return <div data-testid="code-editor" />;
		},
	};
});

const AUDIO = Asset.create({
	id: "audio-1",
	kind: "audio",
	fileName: "music.mp3",
	mimeType: "audio/mpeg",
	byteSize: 1_024,
	checksum: "a".repeat(64),
	durationMs: 20_000,
});

const VIDEO = Asset.create({
	id: "video-1",
	kind: "video",
	fileName: "clip.mp4",
	mimeType: "video/mp4",
	byteSize: 2_048,
	checksum: "b".repeat(64),
	width: 1_920,
	height: 1_080,
	durationMs: 5_000,
});

function sceneId(): string {
	const id = useStudioCompositionStore.getState().value.project.scenes[0]?.id;
	if (!id) throw new Error("The studio composition must have a scene");
	return id;
}

function cue() {
	const found = useStudioCompositionStore.getState().value.project.audioCues[0];
	if (!found) throw new Error("The audio cue is missing");
	return found;
}

function videoBlock() {
	const block = useStudioCompositionStore
		.getState()
		.value.project.scenes[0]?.blocks.find((candidate) => candidate.kind === "video");
	if (!block || block.kind !== "video") throw new Error("The video block is missing");
	return block;
}

function field(label: string): HTMLInputElement {
	const [input] = screen.getAllByLabelText(label);
	if (!(input instanceof HTMLInputElement)) throw new Error(`${label} is not an input`);
	return input;
}

describe("StudioEditor media inspectors", () => {
	beforeEach(() => {
		const store = useStudioCompositionStore.getState();
		store.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
		useStudioCompositionSelectionStore.getState().selectAudioCue(null);
	});

	afterEach(() => cleanup());

	it("edits audio trim and fades, and ignores entries the cue would reject", () => {
		useStudioCompositionStore
			.getState()
			.transact((project) => addMediaAsset(project, sceneId(), AUDIO, { cueId: "cue-1" }));
		useStudioCompositionSelectionStore.getState().selectAudioCue("cue-1");
		render(<StudioEditor />);
		// No bytes were registered for this cue: a silent cue must say why.
		expect(screen.getByText("Source file is not in this browser")).toBeTruthy();

		fireEvent.change(field("Source in"), { target: { value: "2" } });
		fireEvent.change(field("Source out"), { target: { value: "12" } });
		fireEvent.change(field("Fade in"), { target: { value: "1.5" } });
		fireEvent.change(field("Fade out"), { target: { value: "3" } });
		expect(cue()).toMatchObject({
			trim: { startMs: 2_000, endMs: 12_000 },
			fadeInMs: 1_500,
			fadeOutMs: 3_000,
		});

		// An emptied field, a negative start, a volume above 100 % or a fade
		// longer than the clip used to throw out of the change handler.
		expect(() => {
			fireEvent.change(field("Timeline start"), { target: { value: "" } });
			fireEvent.change(field("Timeline start"), { target: { value: "-1" } });
			fireEvent.change(field("Fade in"), { target: { value: "9" } });
			fireEvent.change(field("Source out"), { target: { value: "30" } });
		}).not.toThrow();
		expect(cue()).toMatchObject({ startMs: 0, fadeInMs: 1_500, trim: { endMs: 12_000 } });

		fireEvent.change(screen.getByRole("spinbutton", { name: "Volume" }), {
			target: { value: "150" },
		});
		expect(cue().gain).toBe(1);
	});

	it("shows one volume control: a slider and its number under a single label", () => {
		useStudioCompositionStore
			.getState()
			.transact((project) => addMediaAsset(project, sceneId(), AUDIO, { cueId: "cue-1" }));
		useStudioCompositionSelectionStore.getState().selectAudioCue("cue-1");
		render(<StudioEditor />);

		expect(screen.getAllByText("Volume")).toHaveLength(1);
		expect(screen.getAllByRole("slider", { name: "Volume" })).toHaveLength(1);
		fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "40" } });
		expect(cue().gain).toBe(0.4);
		expect((screen.getByRole("spinbutton", { name: "Volume" }) as HTMLInputElement).value).toBe(
			"40",
		);
	});

	it("names a text layer by its words and its size fields by what they size", () => {
		useStudioCompositionStore
			.getState()
			.transact((project) =>
				addTextLayer(project, sceneId(), { id: "title", text: "Ship the diff\nand more" }),
			);
		useStudioCompositionStore.getState().selectBlock(sceneId(), "title");
		render(<StudioEditor />);

		expect(screen.getByText("Ship the diff", { selector: "strong" })).toBeTruthy();
		expect(screen.getByRole("spinbutton", { name: "Width percentage" })).toBeTruthy();
		expect(screen.getByRole("spinbutton", { name: "Height percentage" })).toBeTruthy();
		expect(screen.getByRole("spinbutton", { name: "X position percentage" })).toBeTruthy();
	});

	it("trims a video and states what happens when the clip and scene lengths differ", () => {
		useStudioCompositionStore
			.getState()
			.transact((project) => addMediaAsset(project, sceneId(), VIDEO, { blockId: "video-block" }));
		useStudioCompositionStore.getState().selectBlock(sceneId(), "video-block");
		render(<StudioEditor />);

		const sceneMs = useStudioCompositionStore.getState().value.project.scenes[0]?.durationMs ?? 0;
		expect(sceneMs).toBeLessThan(5_000);
		expect(screen.getByTestId("video-timing").textContent).toContain("The scene ends first");

		fireEvent.change(field("Source in"), { target: { value: "4" } });
		expect(videoBlock().trim).toEqual({ startMs: 4_000, endMs: 5_000 });
		expect(screen.getByTestId("video-timing").textContent).toContain("Holds its last frame");
	});

	it("keeps the code editor mounted, out of sight, while a layer is selected", () => {
		useStudioCompositionStore
			.getState()
			.transact((project) => addMediaAsset(project, sceneId(), VIDEO, { blockId: "video-block" }));
		editorMounts.count = 0;
		render(<StudioEditor />);

		for (let round = 0; round < 20; round += 1) {
			act(() => useStudioCompositionStore.getState().selectBlock(sceneId(), "video-block"));
			expect(screen.getByTestId("code-editor").closest("[hidden]")).not.toBeNull();
			act(() => useStudioCompositionStore.getState().selectBlock(sceneId(), null));
			expect(screen.getByTestId("code-editor").closest("[hidden]")).toBeNull();
		}

		expect(editorMounts.count).toBe(1);
	});
});
