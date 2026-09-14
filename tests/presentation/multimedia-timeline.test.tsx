import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @vitest-environment jsdom
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import {
	MultimediaTimeline,
	type MultimediaTimelineProps,
} from "@/presentation/components/multimedia/multimedia-timeline";
import { createProjectStore } from "@/presentation/stores/project.store";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionProbe = vi.hoisted(() => ({
	reduced: false,
	presence: [] as Array<Record<string, unknown>>,
	items: [] as Array<Record<string, unknown>>,
}));

const timelineCss = readFileSync(
	resolve(process.cwd(), "src/presentation/components/multimedia/multimedia-timeline.css"),
	"utf8",
);

vi.mock("motion/react", async () => {
	const React = await import("react");
	return {
		AnimatePresence: ({ children, ...props }: { children: ReactNode }) => {
			motionProbe.presence.push(props);
			return React.createElement(React.Fragment, null, children);
		},
		motion: {
			li: ({
				children,
				initial,
				animate,
				exit,
				transition,
				variants,
				custom,
				...props
			}: Record<string, unknown> & { children?: ReactNode }) => {
				motionProbe.items.push({ initial, animate, exit, transition, variants, custom, ...props });
				return React.createElement("li", props, children);
			},
		},
		useReducedMotion: () => motionProbe.reduced,
	};
});

function textBlock(
	id: string,
	text: string,
): ProjectDocumentV2["project"]["scenes"][number]["blocks"][number] {
	return {
		id,
		kind: "text",
		text,
		typography: {
			fontFamily: "Inter",
			fontSize: 64,
			fontWeight: 650,
			color: "#fff",
			align: "center",
		},
		opacity: 1,
		placement: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 },
	};
}

function documentFixture(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "Launch story",
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [
				{
					id: "audio-1",
					kind: "audio",
					fileName: "field-notes.wav",
					mimeType: "audio/wav",
					byteSize: 4_096,
					checksum: "sha256:audio",
					durationMs: 8_000,
				},
			],
			audioCues: [
				{
					id: "cue-1",
					assetId: "audio-1",
					startMs: 600,
					trim: { startMs: 0, endMs: 4_000 },
					gain: 0.8,
					fadeInMs: 120,
					fadeOutMs: 180,
				},
			],
			scenes: [
				{ id: "scene-1", durationMs: 900, blocks: [textBlock("title-1", "Hook")] },
				{ id: "scene-2", durationMs: 1_400, blocks: [textBlock("title-2", "Proof")] },
				{ id: "scene-3", durationMs: 2_000, blocks: [textBlock("title-3", "Close")] },
			],
		},
	};
}

function props(overrides: Partial<MultimediaTimelineProps> = {}): MultimediaTimelineProps {
	return {
		document: documentFixture(),
		selected: "scene-1",
		onSelect: vi.fn(),
		onAdd: vi.fn(),
		onDelete: vi.fn(),
		onUndo: vi.fn(),
		onRedo: vi.fn(),
		canUndo: false,
		canRedo: false,
		...overrides,
	};
}

function sceneIds(container: HTMLElement): string[] {
	return [...container.querySelectorAll<HTMLElement>("[data-scene-id]")].map(
		(node) => node.dataset.sceneId ?? "",
	);
}

function lastMotionItem(sceneId: string): Record<string, unknown> | undefined {
	return [...motionProbe.items].reverse().find((item) => item["data-scene-id"] === sceneId);
}

beforeEach(() => {
	motionProbe.reduced = false;
	motionProbe.presence.length = 0;
	motionProbe.items.length = 0;
});

afterEach(cleanup);

describe("MultimediaTimeline", () => {
	it("renders ordered, selectable scenes with honest durations and a distinct audio rail", () => {
		const onSelect = vi.fn();
		const { container } = render(<MultimediaTimeline {...props({ onSelect })} />);

		expect(sceneIds(container)).toEqual(["scene-1", "scene-2", "scene-3"]);
		expect(
			screen.getByRole("button", { name: /Scene 1.*0\.9 seconds/i }).getAttribute("aria-pressed"),
		).toBe("true");
		expect(screen.getByText("1.4s")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /Scene 2/i }));
		expect(onSelect).toHaveBeenCalledWith("scene-2");

		expect(screen.getByRole("group", { name: "Audio track" })).toBeTruthy();
		expect(screen.getByLabelText(/field-notes\.wav.*4 seconds/i)).toBeTruthy();
	});

	it("selects an audio cue as an editable timeline item", () => {
		const onSelectAudioCue = vi.fn();
		render(
			<MultimediaTimeline
				{...props({
					selectedAudioCueId: "cue-1",
					onSelectAudioCue,
				})}
			/>,
		);

		const cue = screen.getByRole("button", { name: /field-notes\.wav.*4 seconds/i });
		expect(cue.getAttribute("aria-pressed")).toBe("true");
		fireEvent.click(cue);
		expect(onSelectAudioCue).toHaveBeenCalledWith("cue-1");
	});

	it("reorders scenes with explicit controls, keyboard shortcuts and drag-and-drop", () => {
		const onMoveScene = vi.fn();
		const { container } = render(
			<MultimediaTimeline
				{...props({
					selected: "scene-2",
					onMoveScene,
				})}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Move scene earlier" }));
		expect(onMoveScene).toHaveBeenCalledWith("scene-2", 0);

		fireEvent.keyDown(screen.getByRole("button", { name: /Scene 2/i }), {
			key: "ArrowRight",
			altKey: true,
		});
		expect(onMoveScene).toHaveBeenCalledWith("scene-2", 2);

		const dataTransfer = {
			effectAllowed: "none",
			dropEffect: "none",
			getData: vi.fn(() => "scene-1"),
			setData: vi.fn(),
		};
		const first = container.querySelector<HTMLElement>('[data-scene-id="scene-1"]');
		const third = container.querySelector<HTMLElement>('[data-scene-id="scene-3"]');
		if (!first || !third) throw new Error("Expected timeline scenes");
		fireEvent.dragStart(first, { dataTransfer });
		fireEvent.dragOver(third, { dataTransfer });
		fireEvent.drop(third, { dataTransfer });
		expect(onMoveScene).toHaveBeenCalledWith("scene-1", 2);
	});

	it("offers a frame-accurate playhead scrubber and makes scene widths follow duration", () => {
		const onSeekProgress = vi.fn();
		const { container } = render(
			<MultimediaTimeline
				{...props({
					playheadProgress: 0.25,
					onSeekProgress,
				})}
			/>,
		);
		const playhead = screen.getByRole("slider", { name: "Playhead" }) as HTMLInputElement;
		expect(playhead.value).toBe("250");
		expect(screen.getByText("00:01.2 / 00:04.6")).toBeTruthy();

		fireEvent.change(playhead, { target: { value: "720" } });
		expect(onSeekProgress).toHaveBeenCalledWith(0.72);

		const firstWidth = container
			.querySelector<HTMLElement>('[data-scene-id="scene-1"]')
			?.style.getPropertyValue("--mtl-scene-width");
		const thirdWidth = container
			.querySelector<HTMLElement>('[data-scene-id="scene-3"]')
			?.style.getPropertyValue("--mtl-scene-width");
		expect(Number.parseFloat(thirdWidth ?? "0")).toBeGreaterThan(
			Number.parseFloat(firstWidth ?? "0"),
		);
	});

	it("gives icon-only actions coordinated accessible tooltips instead of native titles", () => {
		render(<MultimediaTimeline {...props({ canUndo: true, canRedo: true })} />);
		const undo = screen.getByRole("button", { name: "Undo" });
		expect(undo.getAttribute("title")).toBeNull();

		fireEvent.focus(undo);
		const tooltip = screen.getByRole("tooltip", { name: "Undo" });
		expect(undo.getAttribute("aria-describedby")).toBe(tooltip.id);

		fireEvent.blur(undo);
		fireEvent.focus(screen.getByRole("button", { name: "Redo" }));
		expect(screen.getByRole("tooltip", { name: "Redo" })).toBeTruthy();
	});

	it("composes with the project store for consecutive delete, undo and redo actions", () => {
		const store = createProjectStore(documentFixture());
		function StoreTimeline() {
			const state = store();
			return (
				<MultimediaTimeline
					document={state.toDocument()}
					selected={state.selectedSceneId}
					onSelect={state.selectScene}
					onAdd={() => undefined}
					onDelete={(sceneId) => state.transact((project) => project.removeScene(sceneId))}
					onUndo={state.undo}
					onRedo={state.redo}
					canUndo={state.canUndo}
					canRedo={state.canRedo}
				/>
			);
		}

		const { container } = render(<StoreTimeline />);
		const deleteButton = screen.getByRole("button", { name: "Delete selected scene" });
		fireEvent.click(deleteButton, { detail: 1 });
		fireEvent.click(deleteButton, { detail: 1 });
		expect(sceneIds(container)).toEqual(["scene-3"]);

		const undoButton = screen.getByRole("button", { name: "Undo" });
		fireEvent.click(undoButton);
		fireEvent.click(undoButton);
		expect(sceneIds(container)).toEqual(["scene-1", "scene-2", "scene-3"]);

		const redoButton = screen.getByRole("button", { name: "Redo" });
		fireEvent.click(redoButton);
		fireEvent.click(redoButton);
		expect(sceneIds(container)).toEqual(["scene-3"]);
		expect(screen.queryByText(/deleted/i)).toBeNull();
	});

	it("keeps empty and disabled states explicit and keyboard reachable", () => {
		const empty = documentFixture();
		empty.project.scenes = [];
		empty.project.audioCues = [];

		render(
			<MultimediaTimeline
				{...props({
					document: empty,
					selected: null,
					disabled: true,
					canUndo: true,
					canRedo: true,
				})}
			/>,
		);

		expect(screen.getByRole("status").textContent).toMatch(/No scenes yet/i);
		expect((screen.getByRole("button", { name: "Add scene" }) as HTMLButtonElement).disabled).toBe(
			true,
		);
		expect(
			(screen.getByRole("button", { name: "Delete selected scene" }) as HTMLButtonElement).disabled,
		).toBe(true);
		expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("has no loading entrance and only animates pointer structural actions", () => {
		const initial = props();
		const { rerender } = render(<MultimediaTimeline {...initial} />);
		expect(motionProbe.presence[0]).toMatchObject({ initial: false, mode: "popLayout" });
		expect(motionProbe.presence[0]?.custom).toBe(false);

		fireEvent.click(screen.getByRole("button", { name: "Add scene" }), { detail: 1 });
		const withPointerScene = documentFixture();
		withPointerScene.project.scenes.push({
			id: "scene-4",
			durationMs: 1_000,
			blocks: [textBlock("title-4", "Pointer")],
		});
		rerender(<MultimediaTimeline {...initial} document={withPointerScene} />);

		const pointerItem = lastMotionItem("scene-4");
		expect(pointerItem?.custom).toBe(true);
		expect(pointerItem?.transition).toMatchObject({ duration: 0.18 });
		expect(JSON.stringify(pointerItem?.variants)).not.toMatch(/width|left|layout/i);

		fireEvent.click(screen.getByRole("button", { name: "Add scene" }), { detail: 0 });
		const withKeyboardScene = structuredClone(withPointerScene);
		withKeyboardScene.project.scenes.push({
			id: "scene-5",
			durationMs: 1_000,
			blocks: [textBlock("title-5", "Keyboard")],
		});
		rerender(<MultimediaTimeline {...initial} document={withKeyboardScene} />);
		const keyboardItem = lastMotionItem("scene-5");
		expect(keyboardItem?.custom).toBe(false);
		expect(keyboardItem?.transition).toEqual({ duration: 0 });
	});

	it("turns structural motion off for reduced-motion users", () => {
		motionProbe.reduced = true;
		const initial = props();
		const { rerender } = render(<MultimediaTimeline {...initial} />);
		fireEvent.click(screen.getByRole("button", { name: "Add scene" }), { detail: 1 });
		const next = documentFixture();
		next.project.scenes.push({
			id: "scene-4",
			durationMs: 1_000,
			blocks: [textBlock("title-4", "Reduced")],
		});
		rerender(<MultimediaTimeline {...initial} document={next} />);

		const item = lastMotionItem("scene-4");
		expect(item?.custom).toBe(false);
		expect(item?.transition).toEqual({ duration: 0 });
	});
});

describe("multimedia timeline CSS contract", () => {
	it("keeps hit targets accessible and disables CSS motion when requested", () => {
		expect(timelineCss).toMatch(/min-(?:inline-size|width):\s*44px/);
		expect(timelineCss).toMatch(/min-(?:block-size|height):\s*44px/);
		expect(timelineCss).toContain("@media (prefers-reduced-motion: reduce)");
		expect(timelineCss).not.toMatch(/transition[^;]*(?:width|left|right|height|all)/i);
	});
});
